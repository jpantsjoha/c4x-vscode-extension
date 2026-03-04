# GraphQL API Gateway

Modern GraphQL API demonstrating **schema stitching**, **federation**, **subscriptions**, and **DataLoader** patterns.

## Component Diagram (C3) - GraphQL Gateway Internals

```c4x
%%{ c4: component }%%
graph TB
  %% External Elements
  WebApp[Web App<br/>Container<br/>External]
  MobileApp[Mobile App<br/>Container<br/>External]
  UserService[User Service<br/>Container<br/>gRPC]
  ProductService[Product Service<br/>Container<br/>REST]
  OrderService[Order Service<br/>Container<br/>gRPC]
  Redis[Redis Cache<br/>Container<br/>External]

  subgraph GraphQLGatewayContainer {
    %% Entry Point
    GraphQLServer[GraphQL Server<br/>Component<br/>Apollo Server]

    %% Schema Layer
    SchemaRegistry[Schema Registry<br/>Component<br/>Federation]
    TypeDefs[Type Definitions<br/>Component<br/>SDL files]
    Resolvers[Resolvers<br/>Component<br/>Field resolvers]

    %% Data Fetching
    DataLoaderBatch[DataLoader<br/>Component<br/>Batching + caching]
    UserConnector[User Connector<br/>Component<br/>gRPC client]
    ProductConnector[Product Connector<br/>Component<br/>HTTP client]
    OrderConnector[Order Connector<br/>Component<br/>gRPC client]

    %% Real-time
    SubscriptionManager[Subscription Manager<br/>Component<br/>WebSocket]
    PubSub[PubSub Engine<br/>Component<br/>Redis PubSub]

    %% Performance
    QueryComplexity[Query Complexity Analyzer<br/>Component<br/>Cost analysis]
    DepthLimiter[Depth Limiter<br/>Component<br/>Max depth=10]
    QueryCache[Query Cache<br/>Component<br/>Response cache]

    %% Observability
    Tracing[Distributed Tracing<br/>Component<br/>OpenTelemetry]
    Metrics[Metrics Collector<br/>Component<br/>Prometheus]
    ErrorLogger[Error Logger<br/>Component<br/>Winston]
  }

  %% Client Requests
  WebApp -->|GraphQL queries| GraphQLServer
  MobileApp -->|GraphQL queries| GraphQLServer
  WebApp -.->|WebSocket subscription| SubscriptionManager

  %% Schema Serving
  GraphQLServer -->|Loads schema| SchemaRegistry
  SchemaRegistry -->|Combines| TypeDefs
  GraphQLServer -->|Executes| Resolvers

  %% Query Validation
  GraphQLServer -->|Analyzes complexity| QueryComplexity
  GraphQLServer -->|Checks depth| DepthLimiter
  GraphQLServer -->|Checks cache| QueryCache

  %% Query Execution
  Resolvers -->|Batches requests| DataLoaderBatch
  DataLoaderBatch -->|Fetches users| UserConnector
  DataLoaderBatch -->|Fetches products| ProductConnector
  DataLoaderBatch -->|Fetches orders| OrderConnector

  %% Service Calls
  UserConnector -->|gRPC call| UserService
  ProductConnector -->|HTTP GET| ProductService
  OrderConnector -->|gRPC call| OrderService

  %% Subscriptions
  SubscriptionManager -->|Listens to| PubSub
  PubSub -->|Connects to| Redis
  OrderService -.->|Publishes events| Redis

  %% Caching
  QueryCache -->|Stores in| Redis

  %% Observability
  GraphQLServer -->|Traces requests| Tracing
  Resolvers -->|Records metrics| Metrics
  GraphQLServer -.->|Logs errors| ErrorLogger
```

## GraphQL Schema Example

```graphql
type Query {
  user(id: ID!): User
  product(id: ID!): Product
  orders(userId: ID!): [Order!]!
}

type Mutation {
  createOrder(input: CreateOrderInput!): Order!
  updateProduct(id: ID!, input: UpdateProductInput!): Product!
}

type Subscription {
  orderUpdated(userId: ID!): Order!
  productStockChanged(productId: ID!): Product!
}

type User {
  id: ID!
  name: String!
  email: String!
  orders: [Order!]!  # Field resolver
}

type Product {
  id: ID!
  name: String!
  price: Float!
  stock: Int!
}

type Order {
  id: ID!
  user: User!         # Field resolver
  items: [OrderItem!]!
  total: Float!
  status: OrderStatus!
}

type OrderItem {
  product: Product!   # Field resolver
  quantity: Int!
  price: Float!
}

enum OrderStatus {
  PENDING
  CONFIRMED
  SHIPPED
  DELIVERED
}
```

## Container Diagram (C2) - GraphQL Federation

```c4x
%%{ c4: container }%%
graph TB
  %% Clients
  Person(user, "User", "App user")
  Container(web, "Web App", "React", "Frontend")

  %% GraphQL Gateway (Federation)
  Container(gateway, "GraphQL Gateway", "Apollo Federation", "Schema stitching")

  %% Subgraphs (Federated Services)
  Container(users_graph, "Users Subgraph", "Node.js", "User schema")
  Container(products_graph, "Products Subgraph", "Python", "Product schema")
  Container(orders_graph, "Orders Subgraph", "Java", "Order schema")

  %% Databases
  ContainerDb(users_db, "Users DB", "PostgreSQL", "User data")
  ContainerDb(products_db, "Products DB", "MongoDB", "Product catalog")
  ContainerDb(orders_db, "Orders DB", "PostgreSQL", "Order data")

  %% Cache
  ContainerDb(cache, "Cache", "Redis", "DataLoader cache")

  %% Flow
  user --> web
  web -->|GraphQL query| gateway

  gateway -->|Resolves @key directives| users_graph
  gateway -->|Resolves @key directives| products_graph
  gateway -->|Resolves @key directives| orders_graph

  users_graph --> users_db
  products_graph --> products_db
  orders_graph --> orders_db

  gateway --> cache
  users_graph --> cache
  products_graph --> cache
  orders_graph --> cache
```

## Query Example with N+1 Problem Solved

**GraphQL Query**:
```graphql
query GetUserOrders {
  user(id: "123") {
    name
    orders {
      id
      items {
        product {
          name
          price
        }
        quantity
      }
      total
    }
  }
}
```

**Without DataLoader** (N+1 problem):
```
1 query:  SELECT * FROM users WHERE id = '123'
5 queries: SELECT * FROM orders WHERE user_id = '123' (for each order)
20 queries: SELECT * FROM products WHERE id = ? (for each item)
---
Total: 26 database queries ❌
```

**With DataLoader** (batching):
```
1 query:  SELECT * FROM users WHERE id = '123'
1 query:  SELECT * FROM orders WHERE user_id IN ('123')
1 query:  SELECT * FROM products WHERE id IN ('p1', 'p2', ...)
---
Total: 3 database queries ✅
```

## Subscription Flow

```c4x
%%{ c4: dynamic }%%
graph LR
  Person(user, "User", "App user")
  Container(web, "Web App", "React")
  Container(gateway, "GraphQL Gateway", "Apollo")
  Container(pubsub, "PubSub", "Redis")
  Container(order_svc, "Order Service", "Backend")

  %% Subscription Setup
  user -->|Opens app| web
  web -->|WebSocket subscription| gateway
  gateway -->|Subscribes to channel| pubsub

  %% Event Publishing
  user -->|Places order| order_svc
  order_svc -.->|Publishes OrderCreated| pubsub

  %% Event Delivery
  pubsub -.->|Notifies| gateway
  gateway -.->|Sends update| web
  web -.->|Shows notification| user
```

## Benefits of GraphQL

| Feature | REST | GraphQL |
|---------|------|---------|
| **Overfetching** | Gets full objects | Request exact fields |
| **Underfetching** | Multiple endpoints | Single query |
| **Versioning** | /v1, /v2 URLs | Schema evolution |
| **Real-time** | WebSocket custom | Built-in subscriptions |
| **Documentation** | Swagger/OpenAPI | Self-documenting schema |
| **N+1 Problem** | Manual optimization | DataLoader pattern |

## Performance Optimizations

1. ✅ **DataLoader**: Batch + cache requests (100ms window)
2. ✅ **Query Complexity**: Limit expensive queries (max cost = 1000)
3. ✅ **Depth Limiting**: Prevent deeply nested queries (max depth = 10)
4. ✅ **Persisted Queries**: Hash queries, reduce payload size
5. ✅ **Response Caching**: Cache full responses (Redis, 5min TTL)
6. ✅ **Schema Stitching**: Federate microservices
