# Event-Driven E-Commerce Architecture

A modern e-commerce platform demonstrating **event-driven architecture** with asynchronous messaging, event sourcing, and eventual consistency.

## Architecture Overview

This example shows how different services communicate through events rather than direct API calls, enabling:
- **Loose coupling** between services
- **Scalability** through async processing
- **Resilience** with retry and dead-letter queues
- **Audit trail** via event logs

## Container Diagram (C2) - Event-Driven Services

```c4x
%%{ c4: container }%%
graph TB
  %% Users
  Person(customer, "Customer", "Online shopper")
  Person(merchant, "Merchant", "Store owner")

  %% Frontend
  Container(web, "Web App", "React/Next.js", "User interface")
  Container(admin, "Admin Portal", "React", "Merchant dashboard")

  %% API Gateway
  Container(gateway, "API Gateway", "Node.js/Express", "Request routing")

  %% Core Services (Event Producers)
  Container(order_svc, "Order Service", "Node.js", "Manages orders")
  Container(payment_svc, "Payment Service", "Java/Spring", "Processes payments")
  Container(inventory_svc, "Inventory Service", "Python/FastAPI", "Tracks stock")
  Container(shipping_svc, "Shipping Service", "Go", "Handles fulfillment")
  Container(notification_svc, "Notification Service", "Node.js", "Sends emails/SMS")

  %% Event Infrastructure
  Container(event_bus, "Event Bus", "AWS EventBridge", "Event routing")
  Container(queue_orders, "Order Queue", "SQS", "Order processing")
  Container(queue_payments, "Payment Queue", "SQS", "Payment processing")
  Container(queue_shipping, "Shipping Queue", "SQS", "Shipping tasks")
  Container(dlq, "Dead Letter Queue", "SQS", "Failed events")

  %% Data Stores
  ContainerDb(order_db, "Order DB", "PostgreSQL", "Order state")
  ContainerDb(payment_db, "Payment DB", "PostgreSQL", "Payment records")
  ContainerDb(inventory_db, "Inventory DB", "MongoDB", "Stock levels")
  ContainerDb(event_store, "Event Store", "DynamoDB", "Event log")

  %% External Systems
  System_Ext(payment_gateway, "Payment Gateway", "Stripe/PayPal")
  System_Ext(carrier, "Shipping Carrier", "FedEx API")
  System_Ext(email, "Email Service", "SendGrid")

  %% User Flow
  customer --> web
  merchant --> admin
  web --> gateway
  admin --> gateway

  %% Gateway to Services
  gateway --> order_svc
  gateway --> inventory_svc

  %% Event Publishing (Solid arrows = Publish Event)
  order_svc ==>|OrderCreated event| event_bus
  payment_svc ==>|PaymentProcessed event| event_bus
  inventory_svc ==>|StockReserved event| event_bus
  shipping_svc ==>|ShipmentDispatched event| event_bus

  %% Event Routing to Queues
  event_bus -->|Routes OrderCreated| queue_orders
  event_bus -->|Routes PaymentProcessed| queue_payments
  event_bus -->|Routes to Shipping| queue_shipping

  %% Queue Consumption (Dashed arrows = Consume Event)
  queue_orders -.->|Consumes| payment_svc
  queue_payments -.->|Consumes| inventory_svc
  queue_payments -.->|Consumes| shipping_svc
  queue_shipping -.->|Consumes| notification_svc

  %% Failed Events
  queue_orders -.->|Failed events| dlq
  queue_payments -.->|Failed events| dlq
  queue_shipping -.->|Failed events| dlq

  %% Service to Database
  order_svc --> order_db
  payment_svc --> payment_db
  inventory_svc --> inventory_db

  %% All events logged
  event_bus --> event_store

  %% External Integrations
  payment_svc --> payment_gateway
  shipping_svc --> carrier
  notification_svc --> email
```

## Key Event Flows

### 1. Order Placement Flow

```
Customer → Web App → API Gateway → Order Service
  ↓
OrderCreated Event → EventBridge
  ↓
Order Queue → Payment Service
  ↓
PaymentProcessed Event → EventBridge
  ↓
Payment Queue → [Inventory Service, Shipping Service]
```

### 2. Event Types

**OrderCreated**:
```json
{
  "eventType": "OrderCreated",
  "orderId": "ORD-12345",
  "customerId": "CUST-789",
  "items": [...],
  "total": 149.99,
  "timestamp": "2026-03-03T10:30:00Z"
}
```

**PaymentProcessed**:
```json
{
  "eventType": "PaymentProcessed",
  "orderId": "ORD-12345",
  "paymentId": "PAY-67890",
  "status": "success",
  "amount": 149.99
}
```

## Benefits

- **Decoupling**: Services don't need to know about each other
- **Scalability**: Each service scales independently
- **Resilience**: Failures in one service don't block others
- **Audit Trail**: Complete event history in Event Store
- **Replay**: Can replay events for debugging or recovery

## Comparison to Synchronous Architecture

| Aspect | Synchronous | Event-Driven |
|--------|-------------|--------------|
| **Coupling** | Tight (direct API calls) | Loose (event bus) |
| **Scalability** | Limited (blocking) | High (async) |
| **Failure Handling** | Immediate errors | Retry + DLQ |
| **Latency** | Low (direct) | Higher (eventual consistency) |
| **Complexity** | Low | Higher (need event infrastructure) |
