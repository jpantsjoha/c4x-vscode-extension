his b# C4X: All Four View Levels + Dynamic Diagrams

> [!NOTE]
> **Can't see the diagrams?**
> You need the **[C4X VS Code Extension](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x-vscode-extension)** to view the live visualizations below. Otherwise, you'll only see the source code.
>
> **Navigation**:
> [Full Example Gallery](./EXAMPLES.md) | [Architecture Patterns](./EXAMPLES-PATTERNS.md) | [Layout Guide](./EXAMPLES-LAYOUT.md)

This document demonstrates all four C4 model levels (Context, Container, Component, Deployment) plus Dynamic diagrams, using a **Healthcare Patient Portal** as the running example.

---

## 1. System Context (C1) - The Big Picture

Shows users, the system, and external dependencies. No internal details.

```c4x
%%{ c4: system-context }%%
graph TB
    Patient[Patient<br/>Person]
    Doctor[Clinician<br/>Person<br/>Internal]

    Portal[Patient Portal<br/>Software System]

    EHR[Electronic Health Records<br/>Software System<br/>External]
    IdP[Identity Provider<br/>Software System<br/>External]
    Pharmacy[Pharmacy Network<br/>Software System<br/>External]
    Notify[Notification Service<br/>Software System<br/>External]

    Patient -->|Books appointments, views records| Portal
    Doctor -->|Reviews patient data, writes notes| Portal

    Portal -->|Fetches medical history via HL7 FHIR| EHR
    Portal -->|Authenticates users via OIDC| IdP
    Portal -->|Submits prescriptions| Pharmacy
    Portal -->|Sends SMS/email alerts| Notify
```

---

## 2. Container Diagram (C2) - Inside the System

Zooms into the Patient Portal to show its major building blocks.

```c4x
%%{ c4: container }%%
graph TB
    Patient[Patient<br/>Person]
    Doctor[Clinician<br/>Person<br/>Internal]

    subgraph PatientPortal {
        WebApp[Patient Web App<br/>Container<br/>React/TypeScript]
        MobileApp[Mobile App<br/>Container<br/>React Native]
        APIGateway[API Gateway<br/>Container<br/>Kong]
        AuthSvc[Auth Service<br/>Container<br/>Node.js/Passport]
        AppointmentSvc[Appointment Service<br/>Container<br/>Java/Spring Boot]
        RecordsSvc[Records Service<br/>Container<br/>Go]
        PrescriptionSvc[Prescription Service<br/>Container<br/>Python/FastAPI]
        EventBus[Event Bus<br/>Container<br/>Apache Kafka]
        AppDB[Appointments DB<br/>Container<br/>PostgreSQL]
        RecordsCache[Records Cache<br/>Container<br/>Redis]
    }

    EHR[Electronic Health Records<br/>Software System<br/>External]
    IdP[Identity Provider<br/>Software System<br/>External]
    Pharmacy[Pharmacy Network<br/>Software System<br/>External]

    Patient -->|Uses| WebApp
    Patient -->|Uses| MobileApp
    Doctor -->|Uses| WebApp

    WebApp -->|API calls| APIGateway
    MobileApp -->|API calls| APIGateway

    APIGateway -->|Routes auth| AuthSvc
    APIGateway -->|Routes appointments| AppointmentSvc
    APIGateway -->|Routes records| RecordsSvc
    APIGateway -->|Routes prescriptions| PrescriptionSvc

    AuthSvc -->|Validates tokens| IdP
    AppointmentSvc ==>|Reads/writes| AppDB
    RecordsSvc -->|Caches responses| RecordsCache
    RecordsSvc -->|FHIR queries| EHR
    PrescriptionSvc -->|Submits Rx| Pharmacy

    AppointmentSvc -.->|Appointment events| EventBus
    PrescriptionSvc -.->|Prescription events| EventBus
```

---

## 3. Component Diagram (C3) - Inside a Container

Zooms into the **Appointment Service** container to show its internal components.

```c4x
%%{ c4: component }%%
graph TB
    APIGateway[API Gateway<br/>Container<br/>Kong]

    subgraph AppointmentSvc {
        RestController[REST Controller<br/>Component<br/>Spring MVC]
        SchedulerEngine[Scheduling Engine<br/>Component<br/>Custom Algorithm]
        AvailabilityChecker[Availability Checker<br/>Component<br/>Spring Service]
        NotificationAdapter[Notification Adapter<br/>Component<br/>Spring Integration]
        AppointmentRepo[Appointment Repository<br/>Component<br/>Spring Data JPA]
        DoctorRepo[Doctor Repository<br/>Component<br/>Spring Data JPA]
        EventPublisher[Event Publisher<br/>Component<br/>Spring Kafka]
    }

    AppDB[Appointments DB<br/>Container<br/>PostgreSQL]
    EventBus[Event Bus<br/>Container<br/>Apache Kafka]
    Notify[Notification Service<br/>Software System<br/>External]

    APIGateway -->|JSON/HTTPS| RestController

    RestController -->|Delegates booking logic| SchedulerEngine
    RestController -->|Queries doctor slots| AvailabilityChecker

    SchedulerEngine -->|Checks conflicts| AvailabilityChecker
    SchedulerEngine -->|Persists booking| AppointmentRepo
    SchedulerEngine -->|Triggers confirmation| NotificationAdapter

    AvailabilityChecker -->|Reads schedules| DoctorRepo
    AvailabilityChecker -->|Reads existing bookings| AppointmentRepo

    AppointmentRepo ==>|JDBC| AppDB
    DoctorRepo ==>|JDBC| AppDB

    NotificationAdapter -->|Sends alerts| Notify
    EventPublisher -.->|Publishes domain events| EventBus

    SchedulerEngine -->|Emits AppointmentCreated| EventPublisher
```

---

## 4. Deployment Diagram - Infrastructure View

Shows how the system is deployed across cloud infrastructure.

```c4x
%%{ c4: deployment }%%
graph TB
    subgraph Production {
        subgraph CloudFrontEdge {
            CDN[CloudFront CDN<br/>Container<br/>AWS CloudFront]
        }

        subgraph KubernetesCluster {
            subgraph FrontendPods {
                WebApp[Patient Web App<br/>Container<br/>React]
            }
            subgraph BackendPods {
                APIGateway[API Gateway<br/>Container<br/>Kong]
                AppointmentSvc[Appointment Service<br/>Container<br/>Java]
                RecordsSvc[Records Service<br/>Container<br/>Go]
            }
        }

        subgraph DataTier {
            PrimaryDB[Primary DB<br/>Container<br/>Aurora PostgreSQL]
            ReplicaDB[Read Replica<br/>Container<br/>Aurora PostgreSQL]
            Cache[ElastiCache<br/>Container<br/>Redis Cluster]
        }

        subgraph Messaging {
            Kafka[Event Bus<br/>Container<br/>Amazon MSK]
        }
    }

    CDN -->|Serves static assets| WebApp
    WebApp -->|API calls| APIGateway
    APIGateway -->|Routes| AppointmentSvc
    APIGateway -->|Routes| RecordsSvc
    AppointmentSvc ==>|Writes| PrimaryDB
    RecordsSvc -->|Reads| ReplicaDB
    RecordsSvc -->|Caches| Cache
    PrimaryDB -->|Replicates| ReplicaDB
    AppointmentSvc -.->|Publishes events| Kafka
```

---

## 5. Dynamic Diagram - Booking Flow

Shows the runtime behavior for a specific use case: booking an appointment.

```c4x
%%{ c4: dynamic }%%
graph LR
    Patient[Patient<br/>Person]
    WebApp[Web App<br/>Container]
    API[API Gateway<br/>Container]
    Auth[Auth Service<br/>Container]
    Scheduler[Appointment Service<br/>Container]
    DB[Appointments DB<br/>Container]
    Kafka[Event Bus<br/>Container]
    Notify[Notification Service<br/>Software System<br/>External]

    Patient -->|1. Selects date and doctor| WebApp
    WebApp -->|2. POST /appointments| API
    API -->|3. Validates JWT| Auth
    API -->|4. Forwards request| Scheduler
    Scheduler ==>|5. INSERT appointment| DB
    Scheduler -.->|6. Publishes AppointmentCreated| Kafka
    Kafka -.->|7. Consumes event| Notify
    Notify -->|8. Sends confirmation SMS| Patient
```

---

## 6. Relationship Types Explained

The three arrow types carry semantic meaning in C4 diagrams.

### Synchronous (Solid Double Arrow)

Use `==>` for blocking calls where the caller waits for a response (database queries, synchronous RPC).

```c4x
%%{ c4: container }%%
graph LR
    API[API Server<br/>Container<br/>Java]
    DB[PostgreSQL<br/>Container<br/>Database]

    API ==>|SELECT * FROM orders| DB
```

### Standard Dependency (Single Arrow)

Use `-->` for general communication (HTTP calls, uses-relationships, data flow).

```c4x
%%{ c4: container }%%
graph LR
    Web[Web App<br/>Container<br/>React]
    API[API Server<br/>Container<br/>Spring Boot]

    Web -->|REST/JSON over HTTPS| API
```

### Asynchronous (Dotted Arrow)

Use `-.->` for fire-and-forget, event-driven, or message-based communication.

```c4x
%%{ c4: container }%%
graph LR
    OrderSvc[Order Service<br/>Container<br/>Go]
    Queue[Message Queue<br/>Container<br/>RabbitMQ]
    EmailSvc[Email Service<br/>Container<br/>Python]

    OrderSvc -.->|OrderPlaced event| Queue
    Queue -.->|Consumes| EmailSvc
```

---

## 7. External vs Internal Elements

Use tags to distinguish what you own from what you depend on.

```c4x
%%{ c4: system-context }%%
graph TB
    Admin[Platform Admin<br/>Person<br/>Internal]
    Visitor[Public User<br/>Person]

    Platform[Content Platform<br/>Software System]

    CDN[CDN Provider<br/>Software System<br/>External]
    Analytics[Analytics Platform<br/>Software System<br/>External]
    PaymentGW[Payment Gateway<br/>Software System<br/>External]
    CMS[Headless CMS<br/>Software System<br/>External]

    Admin -->|Manages content and users| Platform
    Visitor -->|Reads content, subscribes| Platform

    Platform -->|Delivers assets via| CDN
    Platform -->|Tracks engagement with| Analytics
    Platform -->|Processes subscriptions via| PaymentGW
    Platform -->|Fetches content from| CMS
```

---

## 8. Database Element Variants

C4X renders database elements with a cylinder shape.

```c4x
%%{ c4: container }%%
graph TB
    API[API Server<br/>Container<br/>Node.js]

    subgraph DataLayer {
        RelationalDB[User Accounts<br/>Container<br/>PostgreSQL]
        DocumentDB[Product Catalog<br/>Container<br/>MongoDB]
        CacheDB[Session Cache<br/>Container<br/>Redis]
        SearchIdx[Search Index<br/>Container<br/>Elasticsearch]
        BlobStore[File Storage<br/>Container<br/>AWS S3]
    }

    API ==>|User CRUD| RelationalDB
    API -->|Catalog queries| DocumentDB
    API -->|Session lookup| CacheDB
    API -->|Full-text search| SearchIdx
    API -->|Upload/download files| BlobStore
```
