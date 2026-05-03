# C4X: Architecture Design Patterns

> [!NOTE]
> **Can't see the diagrams?**
> You need the **[C4X VS Code Extension](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x-vscode-extension)** to view the live visualizations below. Otherwise, you'll only see the source code.
>
> **Navigation**:
> [Full Example Gallery](./EXAMPLES.md) | [All C4 View Levels](./EXAMPLES-VIEWS.md) | [Layout Guide](./EXAMPLES-LAYOUT.md)

Real-world architecture patterns expressed as C4 diagrams. Each example demonstrates a recognized design pattern with its characteristic data flow.

---

## 1. Event-Driven Architecture (EDA)

Producers emit domain events to a broker. Consumers process them independently. No direct coupling between services.

```c4x
%%{ c4: container }%%
graph TB
    User[Customer<br/>Person]

    subgraph Platform {
        WebApp[Web Application<br/>Container<br/>Next.js]
        OrderSvc[Order Service<br/>Container<br/>Go]
        InventorySvc[Inventory Service<br/>Container<br/>Rust]
        ShippingSvc[Shipping Service<br/>Container<br/>Java]
        BillingSvc[Billing Service<br/>Container<br/>Python]
        EventBroker[Event Broker<br/>Container<br/>Apache Kafka]
        OrderDB[Orders DB<br/>Container<br/>PostgreSQL]
        InventoryDB[Inventory DB<br/>Container<br/>PostgreSQL]
    }

    User -->|Places order| WebApp
    WebApp -->|POST /orders| OrderSvc

    OrderSvc ==>|Persists order| OrderDB
    OrderSvc -.->|OrderPlaced event| EventBroker

    %% Consumers react independently
    EventBroker -.->|Consumes OrderPlaced| InventorySvc
    EventBroker -.->|Consumes OrderPlaced| ShippingSvc
    EventBroker -.->|Consumes OrderPlaced| BillingSvc

    InventorySvc ==>|Decrements stock| InventoryDB
    InventorySvc -.->|StockReserved event| EventBroker
```

---

## 2. CQRS (Command Query Responsibility Segregation)

Separates write (command) and read (query) paths. Commands mutate state; queries read from optimized projections.

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]

    subgraph CQRSSystem {
        CommandAPI[Command API<br/>Container<br/>Java/Spring Boot]
        QueryAPI[Query API<br/>Container<br/>Node.js/Express]
        CommandDB[Write Store<br/>Container<br/>PostgreSQL]
        ReadDB[Read Store<br/>Container<br/>Elasticsearch]
        EventBus[Event Bus<br/>Container<br/>Kafka]
        Projector[Projection Builder<br/>Container<br/>Kotlin]
    }

    %% Command path
    User -->|Submits changes| CommandAPI
    CommandAPI ==>|Writes| CommandDB
    CommandAPI -.->|Emits domain events| EventBus

    %% Query path
    User -->|Searches and reads| QueryAPI
    QueryAPI ==>|Optimized reads| ReadDB

    %% Projection sync
    EventBus -.->|Consumes events| Projector
    Projector ==>|Updates materialized views| ReadDB
```

---

## 3. Saga Pattern (Distributed Transactions)

Coordinates multi-service transactions using compensating actions instead of distributed locks.

```c4x
%%{ c4: container }%%
graph TB
    User[Customer<br/>Person]

    subgraph SagaOrchestration {
        API[API Gateway<br/>Container<br/>Kong]
        Orchestrator[Saga Orchestrator<br/>Container<br/>Temporal.io]

        OrderSvc[Order Service<br/>Container<br/>Go]
        PaymentSvc[Payment Service<br/>Container<br/>Java]
        InventorySvc[Inventory Service<br/>Container<br/>Rust]
        ShippingSvc[Shipping Service<br/>Container<br/>Python]

        SagaLog[Saga State Log<br/>Container<br/>PostgreSQL]
    }

    PaymentGW[Payment Gateway<br/>Software System<br/>External]
    Warehouse[Warehouse System<br/>Software System<br/>External]

    User -->|Places order| API
    API -->|Initiates saga| Orchestrator

    %% Forward steps
    Orchestrator ==>|1. Create order| OrderSvc
    Orchestrator ==>|2. Reserve stock| InventorySvc
    Orchestrator ==>|3. Charge payment| PaymentSvc
    Orchestrator ==>|4. Schedule shipment| ShippingSvc

    %% Saga state
    Orchestrator ==>|Persists step state| SagaLog

    %% External integrations
    PaymentSvc -->|Charges card| PaymentGW
    ShippingSvc -->|Books carrier| Warehouse
```

---

## 4. Backend-for-Frontend (BFF)

Each client type gets its own tailored API layer, aggregating calls from shared backend services.

```c4x
%%{ c4: container }%%
graph TB
    WebUser[Web User<br/>Person]
    MobileUser[Mobile User<br/>Person]
    TVUser[Smart TV User<br/>Person]

    subgraph BFFLayer {
        WebBFF[Web BFF<br/>Container<br/>Node.js/Express]
        MobileBFF[Mobile BFF<br/>Container<br/>Node.js/Fastify]
        TVBFF[TV BFF<br/>Container<br/>Go]
    }

    subgraph SharedServices {
        UserSvc[User Service<br/>Container<br/>Java]
        CatalogSvc[Catalog Service<br/>Container<br/>Python]
        RecommendSvc[Recommendation Engine<br/>Container<br/>Python/ML]
        ContentDB[Content DB<br/>Container<br/>MongoDB]
    }

    WebUser -->|HTTPS| WebBFF
    MobileUser -->|HTTPS| MobileBFF
    TVUser -->|HTTPS| TVBFF

    %% Each BFF aggregates differently
    WebBFF -->|Full catalog + reviews| CatalogSvc
    WebBFF -->|User profile + history| UserSvc
    WebBFF -->|Personalized picks| RecommendSvc

    MobileBFF -->|Compact catalog| CatalogSvc
    MobileBFF -->|Auth only| UserSvc

    TVBFF -->|Featured content only| CatalogSvc
    TVBFF -->|Watch-next predictions| RecommendSvc

    CatalogSvc ==>|Reads| ContentDB
    UserSvc ==>|Reads/writes| ContentDB
```

---

## 5. Strangler Fig Migration

Gradually replacing a legacy monolith by routing traffic through a facade that delegates to new microservices or falls back to the old system.

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]

    subgraph MigrationInProgress {
        Facade[API Facade<br/>Container<br/>Nginx/Lua]

        subgraph NewServices {
            UserSvc[User Service<br/>Container<br/>Go]
            OrderSvc[Order Service<br/>Container<br/>Go]
            CatalogSvc[Catalog Service<br/>Container<br/>Go]
            NewDB[New Database<br/>Container<br/>PostgreSQL]
        }

        Monolith[Legacy Monolith<br/>Container<br/>Java EE / WebSphere]
        LegacyDB[Legacy Database<br/>Container<br/>Oracle]
    }

    User -->|All requests| Facade

    %% Migrated routes
    Facade -->|/api/users/*| UserSvc
    Facade -->|/api/orders/*| OrderSvc

    %% Not yet migrated
    Facade -->|Everything else (fallback)| Monolith

    %% New services use new DB
    UserSvc ==>|Reads/writes| NewDB
    OrderSvc ==>|Reads/writes| NewDB
    CatalogSvc ==>|Reads/writes| NewDB

    %% Legacy still runs
    Monolith ==>|JDBC| LegacyDB

    %% Data sync during migration
    NewDB -.->|CDC replication| LegacyDB
```

---

## 6. Data Pipeline / ETL Architecture

Batch and stream processing pipeline for analytics and ML feature engineering.

```c4x
%%{ c4: container }%%
graph LR
    subgraph Sources {
        AppDB[Production DB<br/>Container<br/>PostgreSQL]
        ClickStream[Clickstream<br/>Container<br/>Kafka Topic]
        ThirdParty[Partner API<br/>Software System<br/>External]
    }

    subgraph Ingestion {
        CDC[Change Data Capture<br/>Container<br/>Debezium]
        StreamProc[Stream Processor<br/>Container<br/>Apache Flink]
        BatchLoader[Batch Loader<br/>Container<br/>Apache Airflow]
    }

    subgraph Storage {
        DataLake[Data Lake<br/>Container<br/>S3 / Parquet]
        Warehouse[Data Warehouse<br/>Container<br/>BigQuery]
    }

    subgraph Serving {
        Dashboard[BI Dashboard<br/>Container<br/>Looker]
        MLPipeline[ML Training Pipeline<br/>Container<br/>Vertex AI]
        FeatureStore[Feature Store<br/>Container<br/>Feast]
    }

    Analyst[Data Analyst<br/>Person]
    DataSci[Data Scientist<br/>Person]

    %% Ingestion
    AppDB -.->|WAL events| CDC
    CDC -.->|Streams changes| StreamProc
    ClickStream -.->|Real-time events| StreamProc
    ThirdParty -->|Batch pull| BatchLoader

    %% Storage
    StreamProc -->|Writes| DataLake
    BatchLoader -->|Loads| DataLake
    DataLake -->|Transforms (dbt)| Warehouse

    %% Serving
    Analyst -->|Queries| Dashboard
    Dashboard ==>|SQL| Warehouse
    DataSci -->|Trains models| MLPipeline
    MLPipeline -->|Reads features| FeatureStore
    Warehouse -->|Materializes features| FeatureStore
```

---

## 7. IoT Edge Computing Architecture

Devices at the edge pre-process data locally before sending aggregates to the cloud.

```c4x
%%{ c4: container }%%
graph TB
    Operator[Plant Operator<br/>Person]

    subgraph EdgeLayer {
        Sensor1[Temperature Sensor<br/>Container<br/>MQTT Publisher]
        Sensor2[Vibration Sensor<br/>Container<br/>MQTT Publisher]
        Sensor3[Pressure Sensor<br/>Container<br/>MQTT Publisher]
        EdgeGW[Edge Gateway<br/>Container<br/>Raspberry Pi / Python]
        LocalDB[Local Buffer<br/>Container<br/>SQLite]
        RulesEngine[Alert Rules Engine<br/>Container<br/>Node-RED]
    }

    subgraph CloudPlatform {
        IoTHub[IoT Hub<br/>Container<br/>AWS IoT Core]
        TimeSeries[Time Series DB<br/>Container<br/>InfluxDB]
        Analytics[Analytics Engine<br/>Container<br/>Apache Spark]
        Dashboard[Monitoring Dashboard<br/>Container<br/>Grafana]
        AlertSvc[Alert Service<br/>Container<br/>PagerDuty Integration]
    }

    %% Edge processing
    Sensor1 -.->|MQTT| EdgeGW
    Sensor2 -.->|MQTT| EdgeGW
    Sensor3 -.->|MQTT| EdgeGW

    EdgeGW ==>|Buffers locally| LocalDB
    EdgeGW -->|Evaluates thresholds| RulesEngine
    RulesEngine -->|Critical alerts| AlertSvc

    %% Cloud sync
    EdgeGW -.->|Aggregated telemetry| IoTHub
    IoTHub -->|Ingests| TimeSeries
    TimeSeries -->|Feeds| Analytics
    Analytics -->|Visualizes| Dashboard

    Operator -->|Monitors| Dashboard
    AlertSvc -->|Pages on-call| Operator
```

---

## 8. SaaS Multi-Tenant Architecture

Shared infrastructure with tenant isolation at the data layer. Each tenant's data is logically separated.

```c4x
%%{ c4: container }%%
graph TB
    TenantA[Tenant A Users<br/>Person]
    TenantB[Tenant B Users<br/>Person]

    subgraph SaaSPlatform {
        LB[Load Balancer<br/>Container<br/>AWS ALB]
        WebApp[SaaS Web App<br/>Container<br/>React]
        APITier[API Tier<br/>Container<br/>Node.js/Express]
        TenantRouter[Tenant Router<br/>Container<br/>Custom Middleware]
        AuthSvc[Auth + Tenant Resolver<br/>Container<br/>Auth0 Integration]
        JobQueue[Background Jobs<br/>Container<br/>BullMQ/Redis]

        subgraph TenantDataIsolation {
            TenantADB[Tenant A Schema<br/>Container<br/>PostgreSQL]
            TenantBDB[Tenant B Schema<br/>Container<br/>PostgreSQL]
            SharedDB[Shared Config DB<br/>Container<br/>PostgreSQL]
        }

        BlobStore[Tenant File Storage<br/>Container<br/>S3 with prefix isolation]
    }

    Billing[Billing System<br/>Software System<br/>External]

    TenantA -->|HTTPS| LB
    TenantB -->|HTTPS| LB
    LB -->|Routes| WebApp
    WebApp -->|API calls| APITier
    APITier -->|Resolves tenant| TenantRouter
    TenantRouter -->|Validates JWT + tenant claim| AuthSvc
    TenantRouter ==>|Routes to correct schema| TenantADB
    TenantRouter ==>|Routes to correct schema| TenantBDB
    APITier ==>|Reads platform config| SharedDB
    APITier -->|Enqueues async work| JobQueue
    APITier -->|Tenant-prefixed uploads| BlobStore
    APITier -->|Reports usage| Billing
```

---

## 9. CI/CD Pipeline as Architecture

The delivery pipeline itself modeled as a C4 system, showing how code flows from commit to production.

```c4x
%%{ c4: container }%%
graph LR
    Dev[Developer<br/>Person]
    Reviewer[Reviewer<br/>Person<br/>Internal]

    subgraph Pipeline {
        Repo[Git Repository<br/>Container<br/>GitHub]
        CI[CI Server<br/>Container<br/>GitHub Actions]
        SAST[SAST Scanner<br/>Container<br/>Semgrep]
        TestRunner[Test Runner<br/>Container<br/>Jest + Playwright]
        ArtifactStore[Artifact Registry<br/>Container<br/>GHCR]
        CDEngine[CD Engine<br/>Container<br/>ArgoCD]
    }

    subgraph Environments {
        Staging[Staging Cluster<br/>Container<br/>Kubernetes]
        Production[Production Cluster<br/>Container<br/>Kubernetes]
    }

    Monitoring[Observability Stack<br/>Software System<br/>External]

    Dev -->|git push| Repo
    Repo -.->|Webhook triggers| CI
    CI -->|Runs security scan| SAST
    CI -->|Runs tests| TestRunner
    CI -->|Builds + pushes image| ArtifactStore

    Reviewer -->|Approves PR| Repo
    Repo -.->|Merge triggers| CDEngine

    CDEngine -->|Deploys to| Staging
    CDEngine -->|Promotes to| Production

    Staging -->|Health checks| Monitoring
    Production -->|Metrics + traces| Monitoring
```

---

## 10. Zero-Trust Security Architecture

Every request is authenticated and authorized, regardless of network location. No implicit trust.

```c4x
%%{ c4: container }%%
graph TB
    Employee[Employee<br/>Person]
    Contractor[External Contractor<br/>Person]

    subgraph ZeroTrustPerimeter {
        IdentityProxy[Identity-Aware Proxy<br/>Container<br/>BeyondCorp / Cloudflare Access]
        PolicyEngine[Policy Engine<br/>Container<br/>Open Policy Agent]
        MeshGW[Service Mesh Gateway<br/>Container<br/>Istio Ingress]

        subgraph ServiceMesh {
            AppSvc[Application Service<br/>Container<br/>Go]
            DataSvc[Data Service<br/>Container<br/>Java]
            AdminSvc[Admin Service<br/>Container<br/>Python]
        }

        SecretMgr[Secrets Manager<br/>Container<br/>HashiCorp Vault]
        AuditLog[Audit Log<br/>Container<br/>Elasticsearch]
    }

    IdP[Identity Provider<br/>Software System<br/>External]
    SIEM[SIEM Platform<br/>Software System<br/>External]

    %% Every request goes through identity verification
    Employee -->|Authenticates| IdentityProxy
    Contractor -->|Authenticates| IdentityProxy
    IdentityProxy -->|Verifies identity| IdP
    IdentityProxy -->|Checks access policy| PolicyEngine
    IdentityProxy -->|Authorized requests only| MeshGW

    %% mTLS between all services
    MeshGW ==>|mTLS| AppSvc
    MeshGW ==>|mTLS| DataSvc
    MeshGW ==>|mTLS| AdminSvc
    AppSvc ==>|mTLS| DataSvc

    %% Secrets and audit
    AppSvc -->|Fetches credentials| SecretMgr
    DataSvc -->|Fetches credentials| SecretMgr
    IdentityProxy -.->|Logs all access| AuditLog
    AuditLog -.->|Forwards to| SIEM
```

---

## 11. Platform Engineering (Internal Developer Platform)

A golden-path platform that abstracts infrastructure for product teams.

```c4x
%%{ c4: container }%%
graph TB
    ProductDev[Product Developer<br/>Person]
    PlatformEng[Platform Engineer<br/>Person<br/>Internal]

    subgraph DeveloperPortal {
        Backstage[Developer Portal<br/>Container<br/>Backstage.io]
        ServiceCatalog[Service Catalog<br/>Container<br/>Backstage Plugin]
        Scaffolder[Project Scaffolder<br/>Container<br/>Backstage Templates]
        Docs[TechDocs<br/>Container<br/>Markdown/MkDocs]
    }

    subgraph PlatformControlPlane {
        GitOps[GitOps Controller<br/>Container<br/>ArgoCD]
        InfraEngine[Infrastructure Engine<br/>Container<br/>Terraform/Crossplane]
        PolicyGate[Policy Gate<br/>Container<br/>Kyverno]
        ObsPipeline[Observability Pipeline<br/>Container<br/>OpenTelemetry Collector]
    }

    subgraph SharedInfra {
        K8s[Kubernetes Clusters<br/>Container<br/>GKE]
        Registry[Container Registry<br/>Container<br/>Artifact Registry]
        SecretStore[Secrets<br/>Container<br/>Google Secret Manager]
    }

    ProductDev -->|Discovers services, reads docs| Backstage
    ProductDev -->|Scaffolds new service| Scaffolder
    PlatformEng -->|Manages platform templates| Scaffolder
    PlatformEng -->|Configures policies| PolicyGate

    Backstage -->|Reads catalog| ServiceCatalog
    Scaffolder -->|Creates repo + infra| GitOps
    GitOps -->|Provisions resources| InfraEngine
    GitOps -->|Validates policies| PolicyGate
    GitOps -->|Deploys workloads| K8s
    InfraEngine -->|Creates cloud resources| K8s
    K8s -->|Pulls images| Registry
    K8s -->|Mounts secrets| SecretStore
    K8s -.->|Emits telemetry| ObsPipeline
```

---

## 12. Event Sourcing with Snapshots

Instead of storing current state, every state change is persisted as an immutable event. Snapshots optimize replay.

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]

    subgraph EventSourcedSystem {
        CommandHandler[Command Handler<br/>Container<br/>Kotlin]
        EventStore[Event Store<br/>Container<br/>EventStoreDB]
        SnapshotStore[Snapshot Store<br/>Container<br/>Redis]
        EventProcessor[Event Processor<br/>Container<br/>Kotlin Coroutines]
        ReadModel[Read Model<br/>Container<br/>PostgreSQL]
        QueryHandler[Query Handler<br/>Container<br/>Kotlin]
    }

    User -->|Sends commands| CommandHandler
    User -->|Sends queries| QueryHandler

    %% Write path
    CommandHandler -->|Loads aggregate (events since snapshot)| EventStore
    CommandHandler -->|Loads latest snapshot| SnapshotStore
    CommandHandler ==>|Appends new events| EventStore
    CommandHandler -->|Periodically saves snapshot| SnapshotStore

    %% Projection path
    EventStore -.->|Streams events| EventProcessor
    EventProcessor ==>|Updates projections| ReadModel

    %% Read path
    QueryHandler ==>|Reads projections| ReadModel
```

---

## 13. GraphQL Federation (Supergraph)

Multiple domain subgraphs federated into a single unified API.

```c4x
%%{ c4: container }%%
graph TB
    WebApp[Web Application<br/>Container<br/>React]
    MobileApp[Mobile App<br/>Container<br/>Swift]

    subgraph FederatedGateway {
        Router[Apollo Router<br/>Container<br/>Rust]
    }

    subgraph Subgraphs {
        UserGraph[Users Subgraph<br/>Container<br/>Node.js/Apollo]
        ProductGraph[Products Subgraph<br/>Container<br/>Go/gqlgen]
        OrderGraph[Orders Subgraph<br/>Container<br/>Java/DGS]
        ReviewGraph[Reviews Subgraph<br/>Container<br/>Python/Strawberry]
    }

    subgraph DataStores {
        UserDB[Users DB<br/>Container<br/>PostgreSQL]
        ProductDB[Products DB<br/>Container<br/>MongoDB]
        OrderDB[Orders DB<br/>Container<br/>DynamoDB]
        ReviewDB[Reviews DB<br/>Container<br/>PostgreSQL]
    }

    WebApp -->|GraphQL queries| Router
    MobileApp -->|GraphQL queries| Router

    Router -->|Distributes subqueries| UserGraph
    Router -->|Distributes subqueries| ProductGraph
    Router -->|Distributes subqueries| OrderGraph
    Router -->|Distributes subqueries| ReviewGraph

    UserGraph ==>|Reads/writes| UserDB
    ProductGraph ==>|Reads/writes| ProductDB
    OrderGraph ==>|Reads/writes| OrderDB
    ReviewGraph ==>|Reads/writes| ReviewDB
```

---

## 14. Hexagonal Architecture (Ports & Adapters)

The domain core has no dependencies on infrastructure. Adapters implement port interfaces.

```c4x
%%{ c4: component }%%
graph TB
    subgraph DrivingAdapters {
        RestAPI[REST Controller<br/>Component<br/>Spring MVC]
        GraphQLAPI[GraphQL Resolver<br/>Component<br/>DGS]
        CLI[CLI Tool<br/>Component<br/>Picocli]
    }

    subgraph DomainCore {
        OrderService[Order Service<br/>Component<br/>Pure Java]
        PricingEngine[Pricing Engine<br/>Component<br/>Pure Java]
        InventoryPolicy[Inventory Policy<br/>Component<br/>Pure Java]
    }

    subgraph DrivenAdapters {
        PostgresAdapter[Postgres Adapter<br/>Component<br/>Spring Data JPA]
        KafkaAdapter[Kafka Producer<br/>Component<br/>Spring Kafka]
        StripeAdapter[Stripe Client<br/>Component<br/>HTTP Client]
        RedisAdapter[Cache Adapter<br/>Component<br/>Lettuce]
    }

    %% Driving side (inbound)
    RestAPI -->|Calls| OrderService
    GraphQLAPI -->|Calls| OrderService
    CLI -->|Calls| PricingEngine

    %% Domain interactions
    OrderService -->|Calculates price| PricingEngine
    OrderService -->|Checks availability| InventoryPolicy

    %% Driven side (outbound, via port interfaces)
    OrderService -->|Persists via OrderRepository port| PostgresAdapter
    OrderService -->|Publishes via EventPublisher port| KafkaAdapter
    PricingEngine -->|Charges via PaymentGateway port| StripeAdapter
    InventoryPolicy -->|Reads via CachePort| RedisAdapter
```

---

## 15. Mobile App Architecture (Offline-First)

A mobile application with offline capability, local storage, and background sync.

```c4x
%%{ c4: container }%%
graph TB
    User[Mobile User<br/>Person]

    subgraph MobileApp {
        UI[UI Layer<br/>Container<br/>SwiftUI / Jetpack Compose]
        ViewModel[ViewModel Layer<br/>Container<br/>MVVM]
        SyncEngine[Sync Engine<br/>Container<br/>Background Worker]
        LocalDB[Local Database<br/>Container<br/>SQLite/Room]
        OfflineQueue[Offline Queue<br/>Container<br/>FIFO Queue]
    }

    subgraph BackendAPI {
        API[REST API<br/>Container<br/>Go/Gin]
        AuthSvc[Auth Service<br/>Container<br/>Firebase Auth]
        ServerDB[Server Database<br/>Container<br/>PostgreSQL]
        PushSvc[Push Notifications<br/>Container<br/>Firebase Cloud Messaging]
    }

    User -->|Interacts| UI
    UI -->|Data binding| ViewModel
    ViewModel ==>|Reads local-first| LocalDB
    ViewModel -->|Queues mutations when offline| OfflineQueue

    SyncEngine -->|Drains queue when online| OfflineQueue
    SyncEngine -->|Pushes changes| API
    SyncEngine -->|Pulls updates| API
    SyncEngine ==>|Updates local copy| LocalDB

    API -->|Authenticates| AuthSvc
    API ==>|Persists| ServerDB
    API -.->|Sends push on changes| PushSvc
    PushSvc -.->|Wakes sync| SyncEngine
```

---

## 16. Mixed Relationship Types - When to Use Each

A single diagram showing all three arrow types in context, with commentary.

```c4x
%%{ c4: container }%%
graph TB
    Client[Browser Client<br/>Person]

    subgraph Backend {
        API[API Server<br/>Container<br/>Express.js]
        DB[Database<br/>Container<br/>PostgreSQL]
        Cache[Cache<br/>Container<br/>Redis]
        Queue[Job Queue<br/>Container<br/>RabbitMQ]
        Worker[Background Worker<br/>Container<br/>Node.js]
        SearchIdx[Search Index<br/>Container<br/>Elasticsearch]
    }

    EmailSvc[Email Service<br/>Software System<br/>External]

    %% Sync arrow: caller blocks until response
    Client -->|HTTP request/response| API

    %% Thick sync arrow: tight, blocking coupling (DB queries)
    API ==>|SQL queries (blocks until result)| DB
    API ==>|Cache lookup (blocks until result)| Cache

    %% Async dotted arrow: fire-and-forget, no blocking
    API -.->|Enqueues job (returns immediately)| Queue
    Queue -.->|Dequeues and processes| Worker

    %% Worker does its own sync DB work
    Worker ==>|Writes results| DB
    Worker -->|Sends notification| EmailSvc

    %% Async index update
    DB -.->|CDC stream| SearchIdx
```
