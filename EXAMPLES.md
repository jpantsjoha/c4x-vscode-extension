# C4X Examples Gallery

This gallery demonstrates the flexibility of C4X for visualizing diverse software architectures, from cloud-native microservices to IoT and AI systems.

## 🎨 Theme & Diagram Variety

### Classic Theme: System Context (C1)
The standard C4 model look. Ideal for high-level overviews.

```c4x
%%{ c4: system-context }%%
graph TB
    User[Homeowner<br/>Person]
    SmartHome[Smart Home Hub<br/>Software System]
    Cloud[Cloud Backend<br/>Software System<br/>External]
    
    User -->|Controls| SmartHome
    SmartHome -->|Syncs state| Cloud
```

### Modern Theme: Data Pipeline (C2)
Vibrant colors and rounded corners. Shows a linear data processing flow.

```c4x
%%{ c4: container }%%
graph LR
    Source[IoT Device<br/>Container<br/>External]
    
    subgraph DataPlatform {
        Ingest[Ingestion API<br/>Container<br/>Go]
        Queue[Message Bus<br/>Container<br/>Kafka]
        Processor[Stream Processor<br/>Container<br/>Flink]
        DataLake[Data Lake<br/>Container<br/>S3]
    }

    Source -->|Sends telemetry| Ingest
    Ingest -->|Publishes| Queue
    Queue -->|Consumes| Processor
    Processor -->|Persists| DataLake
```

### Muted Theme: Corporate Banking (C3)
Minimalist grayscale for professional reports. Shows internal component structure.

```c4x
%%{ c4: component }%%
graph TB
    API[API Gateway<br/>Container<br/>External]

    subgraph PaymentService {
        Controller[Payment Controller<br/>Component<br/>Spring MVC]
        Service[Payment Logic<br/>Component<br/>Java]
        Repo[Transaction Repo<br/>Component<br/>JPA]
        FraudClient[Fraud Check Client<br/>Component<br/>HTTP Client]
    }

    DB[Payment DB<br/>Container<br/>External]

    API -->|POST /pay| Controller
    Controller -->|Execute| Service
    Service -->|Verify| FraudClient
    Service -->|Save| Repo
    Repo -->|SQL| DB
```

---

## 🏗️ Advanced Architectures

### 1. FinTech NeoBank (Container Level)
A complex microservices architecture with multiple external integrations and internal services.

```c4x
%%{ c4: container }%%
graph TB
    Customer[Customer<br/>Person]

    subgraph NeoBankPlatform {
        MobileApp[Mobile App<br/>Container<br/>Flutter]
        APIGateway[API Gateway<br/>Container<br/>Kong]
        
        AuthSvc[Auth Service<br/>Container<br/>OAuth2]
        AccountSvc[Account Service<br/>Container<br/>Go]
        CardSvc[Card Service<br/>Container<br/>Java]
        NotificationSvc[Notification Service<br/>Container<br/>Node.js]
        
        CoreDB[Core Ledger<br/>Container<br/>PostgreSQL]
    }

    KYCProvider[KYC Provider<br/>Software System<br/>External]
    CardNetwork[Visa/Mastercard<br/>Software System<br/>External]
    PushService[FCM/APNS<br/>Software System<br/>External]

    Customer -->|Uses| MobileApp
    MobileApp -->|HTTPS/JSON| APIGateway
    
    APIGateway -->|Routes| AuthSvc
    APIGateway -->|Routes| AccountSvc
    APIGateway -->|Routes| CardSvc
    
    AccountSvc -->|Verifies Identity| KYCProvider
    AccountSvc -->|Records Transactions| CoreDB
    
    CardSvc -->|Authorizes| CardNetwork
    CardSvc -.->|Payment Event| NotificationSvc
    
    NotificationSvc -->|Sends Alert| PushService
```

### 2. Smart Home IoT System (System Context)
Demonstrates a central system interacting with multiple diverse external entities (Fan-out pattern).

```c4x
%%{ c4: system-context }%%
graph TB
    Homeowner[Homeowner<br/>Person]
    
    SmartHub[Smart Home Hub<br/>Software System]
    
    LightBulb[Smart Lights<br/>Software System<br/>External]
    Thermostat[Thermostat<br/>Software System<br/>External]
    SecurityCam[Security Camera<br/>Software System<br/>External]
    VoiceAssistant[Alexa/Siri<br/>Software System<br/>External]
    WeatherSvc[Weather Service<br/>Software System<br/>External]

    Homeowner -->|Configures| SmartHub
    VoiceAssistant -->|Voice Commands| SmartHub
    
    SmartHub -->|Controls| LightBulb
    SmartHub -->|Sets temp| Thermostat
    SmartHub -->|Streams feed| SecurityCam
    SmartHub -->|Polls data| WeatherSvc
```

### 3. AI Agent Swarm (Container Level)
Visualizing a complex multi-agent workflow with shared memory and specialized roles.

```c4x
%%{ c4: container }%%
graph LR
    User[User<br/>Person]

    subgraph AgentSwarm {
        Orchestrator[Master Orchestrator<br/>Container<br/>LangGraph]
        
        ResearchAgent[Researcher<br/>Container<br/>Agent]
        CoderAgent[Coder<br/>Container<br/>Agent]
        ReviewerAgent[Reviewer<br/>Container<br/>Agent]
        
        SharedMem[Shared Memory<br/>Container<br/>Redis]
    }

    LLM[LLM API<br/>Software System<br/>External]
    GitHub[GitHub API<br/>Software System<br/>External]

    User -->|Task| Orchestrator
    
    Orchestrator -->|Plan| ResearchAgent
    Orchestrator -->|Code| CoderAgent
    Orchestrator -->|Review| ReviewerAgent
    
    ResearchAgent -->|Context| SharedMem
    CoderAgent -->|Context| SharedMem
    
    ResearchAgent -->|Query| LLM
    CoderAgent -->|Generate| LLM
    CoderAgent -->|Push| GitHub
```