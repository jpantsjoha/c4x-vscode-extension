# gRPC Microservices Architecture

High-performance microservices using **gRPC**, **Protocol Buffers**, **service mesh**, and **streaming**.

## Container Diagram (C2) - gRPC Microservices

```c4x
%%{ c4: container }%%
graph TB
  %% Users
  Person(user, "User", "App user")

  %% Client Applications
  Container(web, "Web App", "React + grpc-web", "Frontend")
  Container(mobile, "Mobile App", "Flutter + gRPC", "Native app")

  %% API Gateway (REST to gRPC)
  Container(gateway, "API Gateway", "Envoy Proxy", "REST → gRPC transcoding")

  %% gRPC Microservices
  Container(user_svc, "User Service", "Go + gRPC", "User management")
  Container(product_svc, "Product Service", "Rust + Tonic", "Catalog")
  Container(order_svc, "Order Service", "Java + gRPC", "Order processing")
  Container(payment_svc, "Payment Service", "Node.js + gRPC", "Payment processing")
  Container(notification_svc, "Notification Service", "Python + gRPC", "Alerts")

  %% Service Mesh
  Container(mesh, "Service Mesh", "Istio", "Traffic management")
  Container(sidecar_user, "Envoy Sidecar", "Istio Proxy", "User svc proxy")
  Container(sidecar_product, "Envoy Sidecar", "Istio Proxy", "Product svc proxy")
  Container(sidecar_order, "Envoy Sidecar", "Istio Proxy", "Order svc proxy")

  %% Service Discovery
  Container(registry, "Service Registry", "Consul", "Service discovery")

  %% Databases
  ContainerDb(user_db, "User DB", "PostgreSQL", "User data")
  ContainerDb(product_db, "Product DB", "PostgreSQL", "Products")
  ContainerDb(order_db, "Order DB", "PostgreSQL", "Orders")

  %% Message Queue (for async)
  Container(queue, "Message Queue", "NATS", "Async events")

  %% Observability
  Container(tracing, "Distributed Tracing", "Jaeger", "Request tracing")
  Container(metrics, "Metrics", "Prometheus", "Service metrics")

  %% User Flow
  user --> web
  user --> mobile

  %% Gateway
  web -->|HTTP/JSON| gateway
  mobile -->|gRPC| gateway

  %% Gateway to Services (via Service Mesh)
  gateway -->|gRPC call| sidecar_user
  gateway -->|gRPC call| sidecar_product
  gateway -->|gRPC call| sidecar_order

  %% Sidecar to Services
  sidecar_user --> user_svc
  sidecar_product --> product_svc
  sidecar_order --> order_svc

  %% Service-to-Service (via sidecars)
  order_svc -->|gRPC via sidecar| sidecar_product
  order_svc -->|gRPC via sidecar| sidecar_user
  sidecar_product --> product_svc
  sidecar_user --> user_svc

  order_svc -->|gRPC call| payment_svc

  %% Async Events
  payment_svc -.->|Publishes PaymentConfirmed| queue
  queue -.->|Consumes| notification_svc

  %% Service Discovery
  user_svc -->|Registers| registry
  product_svc -->|Registers| registry
  order_svc -->|Registers| registry
  payment_svc -->|Registers| registry

  %% Mesh Control
  mesh -->|Configures| sidecar_user
  mesh -->|Configures| sidecar_product
  mesh -->|Configures| sidecar_order

  %% Databases
  user_svc --> user_db
  product_svc --> product_db
  order_svc --> order_db

  %% Observability
  sidecar_user -.->|Traces| tracing
  sidecar_product -.->|Traces| tracing
  sidecar_order -.->|Traces| tracing

  user_svc -.->|Metrics| metrics
  product_svc -.->|Metrics| metrics
  order_svc -.->|Metrics| metrics
```

## Component Diagram (C3) - Order Service gRPC Implementation

```c4x
%%{ c4: component }%%
graph TB
  %% External
  Gateway[API Gateway<br/>Container<br/>External]
  ProductService[Product Service<br/>Container<br/>gRPC]
  UserService[User Service<br/>Container<br/>gRPC]
  OrderDB[Order DB<br/>Container<br/>External]
  Queue[Message Queue<br/>Container<br/>External]

  subgraph OrderServiceContainer {
    %% gRPC Layer
    GrpcServer[gRPC Server<br/>Component<br/>Java gRPC]
    ProtoDefinitions[Proto Definitions<br/>Component<br/>order.proto]

    %% Service Implementation
    OrderServiceImpl[OrderServiceImpl<br/>Component<br/>Service logic]
    CreateOrderHandler[CreateOrder Handler<br/>Component<br/>Unary RPC]
    GetOrdersHandler[GetOrders Handler<br/>Component<br/>Server streaming]
    TrackOrderHandler[TrackOrder Handler<br/>Component<br/>Bidirectional streaming]

    %% Business Logic
    OrderValidator[Order Validator<br/>Component<br/>Business rules]
    PriceCalculator[Price Calculator<br/>Component<br/>Total calculation]
    InventoryChecker[Inventory Checker<br/>Component<br/>Stock validation]

    %% gRPC Clients (to call other services)
    ProductClient[Product gRPC Client<br/>Component<br/>ProductServiceStub]
    UserClient[User gRPC Client<br/>Component<br/>UserServiceStub]

    %% Data Access
    OrderRepository[Order Repository<br/>Component<br/>JPA]

    %% Interceptors
    AuthInterceptor[Auth Interceptor<br/>Component<br/>JWT validation]
    LoggingInterceptor[Logging Interceptor<br/>Component<br/>Request logging]
    MetricsInterceptor[Metrics Interceptor<br/>Component<br/>Prometheus]

    %% Message Publishing
    EventPublisher[Event Publisher<br/>Component<br/>NATS client]
  }

  %% Request Flow
  Gateway -->|CreateOrder RPC| GrpcServer
  GrpcServer -->|Uses| ProtoDefinitions

  %% Interceptor Chain
  GrpcServer -->|Validates JWT| AuthInterceptor
  GrpcServer -->|Logs request| LoggingInterceptor
  GrpcServer -->|Records metrics| MetricsInterceptor

  %% Service Implementation
  GrpcServer -->|Routes to| OrderServiceImpl
  OrderServiceImpl -->|Delegates to| CreateOrderHandler
  OrderServiceImpl -->|Delegates to| GetOrdersHandler
  OrderServiceImpl -->|Delegates to| TrackOrderHandler

  %% Business Logic
  CreateOrderHandler -->|Validates| OrderValidator
  CreateOrderHandler -->|Calculates| PriceCalculator
  CreateOrderHandler -->|Checks stock| InventoryChecker

  %% External Service Calls
  InventoryChecker -->|GetProduct RPC| ProductClient
  ProductClient -->|gRPC call| ProductService

  OrderValidator -->|GetUser RPC| UserClient
  UserClient -->|gRPC call| UserService

  %% Persistence
  CreateOrderHandler -->|Saves| OrderRepository
  GetOrdersHandler -->|Queries| OrderRepository
  OrderRepository -->|SQL| OrderDB

  %% Event Publishing
  CreateOrderHandler -->|Publishes OrderCreated| EventPublisher
  EventPublisher -->|Sends| Queue

  %% Streaming (bidirectional)
  TrackOrderHandler -.->|Streams updates| Gateway
```

## Proto Definition (order.proto)

```protobuf
syntax = "proto3";

package ecommerce.order.v1;

service OrderService {
  // Unary RPC
  rpc CreateOrder(CreateOrderRequest) returns (Order);
  rpc GetOrder(GetOrderRequest) returns (Order);

  // Server Streaming
  rpc GetOrders(GetOrdersRequest) returns (stream Order);

  // Client Streaming
  rpc BatchCreateOrders(stream CreateOrderRequest) returns (BatchCreateOrderResponse);

  // Bidirectional Streaming
  rpc TrackOrders(stream TrackOrderRequest) returns (stream OrderUpdate);
}

message CreateOrderRequest {
  string user_id = 1;
  repeated OrderItem items = 2;
  ShippingAddress address = 3;
}

message Order {
  string id = 1;
  string user_id = 2;
  repeated OrderItem items = 3;
  double total = 4;
  OrderStatus status = 5;
  google.protobuf.Timestamp created_at = 6;
}

message OrderItem {
  string product_id = 1;
  int32 quantity = 2;
  double price = 3;
}

enum OrderStatus {
  ORDER_STATUS_UNSPECIFIED = 0;
  ORDER_STATUS_PENDING = 1;
  ORDER_STATUS_CONFIRMED = 2;
  ORDER_STATUS_SHIPPED = 3;
  ORDER_STATUS_DELIVERED = 4;
}
```

## gRPC Streaming Types

### 1. Server Streaming (GetOrders)

```
Client → GetOrders(userId: "123")
       ← Stream: Order1
       ← Stream: Order2
       ← Stream: Order3
       ← Stream: [END]
```

### 2. Client Streaming (BatchCreateOrders)

```
Client → Stream: CreateOrderRequest1
       → Stream: CreateOrderRequest2
       → Stream: CreateOrderRequest3
       → Stream: [END]
       ← BatchCreateOrderResponse
```

### 3. Bidirectional Streaming (TrackOrders)

```
Client → Stream: TrackOrderRequest(orderId: "A")
       ← Stream: OrderUpdate(orderId: "A", status: CONFIRMED)
       → Stream: TrackOrderRequest(orderId: "B")
       ← Stream: OrderUpdate(orderId: "A", status: SHIPPED)
       ← Stream: OrderUpdate(orderId: "B", status: CONFIRMED)
```

## gRPC vs REST Comparison

| Feature | REST | gRPC |
|---------|------|------|
| **Protocol** | HTTP/1.1 | HTTP/2 |
| **Format** | JSON (text) | Protocol Buffers (binary) |
| **Performance** | Slower | 7-10x faster |
| **Payload Size** | Larger | 3-10x smaller |
| **Streaming** | Server-Sent Events | Bidirectional streaming |
| **Code Generation** | Manual | Auto-generated from .proto |
| **Browser Support** | Native | Requires grpc-web proxy |
| **Debugging** | Easy (cURL) | Requires grpcurl/BloomRPC |

## Service Mesh Benefits

**Istio provides**:
1. ✅ **Traffic Management**: Canary deployments, A/B testing
2. ✅ **Security**: mTLS between all services
3. ✅ **Observability**: Automatic distributed tracing
4. ✅ **Resilience**: Circuit breakers, retries, timeouts
5. ✅ **Load Balancing**: Intelligent routing

## Performance Metrics

**gRPC Benchmark** (CreateOrder RPC):
- **Latency**: p50 = 5ms, p99 = 20ms
- **Throughput**: 10,000 req/sec (single instance)
- **Payload**: 150 bytes (vs 800 bytes JSON)

**REST Equivalent**:
- **Latency**: p50 = 15ms, p99 = 50ms
- **Throughput**: 3,000 req/sec
- **Payload**: 800 bytes JSON

**Result**: gRPC is **3-4x faster** and **5x smaller** payloads!
