# Container Diagrams (Level 2)

**Container diagrams** zoom into a Software System to show the high-level technical building blocks (containers). A "container" is something like a Web Application, API, Database, or Mobile App.

## 🛍️ Microservices E-Commerce
A detailed breakdown of an E-commerce platform into frontend applications, backend microservices, and databases.

```c4x
%%{ c4: container }%%
graph TB
    %% People
    Customer[Online Shopper<br/>Person]
    Admin[Store Administrator<br/>Person]

    %% E-commerce Platform Containers
    %% Frontend Containers
    WebUI[Web Application<br/>Container<br/>React 18, TypeScript]
    MobileApp[Mobile App<br/>Container<br/>React Native]

    %% Backend Containers
    APIGateway[API Gateway<br/>Container<br/>Node.js, Express]
    ProductService[Product Service<br/>Container<br/>Python, FastAPI]
    OrderService[Order Service<br/>Container<br/>Node.js, NestJS]
    PaymentService[Payment Service<br/>Container<br/>Java, Spring Boot]

    %% Data Containers
    ProductDB[Product Database<br/>Container<br/>PostgreSQL]
    OrderDB[Order Database<br/>Container<br/>MongoDB]
    Cache[Redis Cache<br/>Container<br/>Redis]

    %% External Systems
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]
    EmailService[Email Service<br/>Software System<br/>External]
    ShippingProvider[Shipping Provider<br/>Software System<br/>External]

    %% User to Frontend
    Customer -->|Browses and orders via| WebUI
    Customer -->|Uses mobile app| MobileApp
    Admin -->|Manages system via| WebUI

    %% Frontend to Gateway
    WebUI -->|Makes API calls| APIGateway
    MobileApp -->|Makes API calls| APIGateway

    %% Gateway to Services
    APIGateway -->|Routes product requests| ProductService
    APIGateway -->|Routes order requests| OrderService
    APIGateway -->|Routes payment requests| PaymentService

    %% Services to Databases
    ProductService -->|Reads/writes| ProductDB
    ProductService -->|Caches data in| Cache
    OrderService -->|Reads/writes| OrderDB
    OrderService -->|Caches sessions in| Cache

    %% Services to External Systems
    PaymentService -->|Processes payments via| PaymentGateway
    OrderService -->|Sends notifications via| EmailService
    OrderService -->|Creates shipments via| ShippingProvider

    %% Async relationships
    PaymentService -.->|Payment events| OrderService
    ShippingProvider -.->|Tracking updates| OrderService
```

## 🧠 Multi-Agent Orchestrator
Shows how AI Agents (running as containers) interact with an Orchestrator and Knowledge Base.

```c4x
%%{ c4: container }%%
graph TB
    MarketingManager[Marketing Manager<br/>Person]

    subgraph MultiAgentMarketingSystem {
        Orchestrator[Agent Orchestrator<br/>Container<br/>Python/LangChain]
        ContentAgent[Content Generation Agent<br/>Container<br/>Python/GPT-4]
        SchedulingAgent[Content Scheduling Agent<br/>Container<br/>Python/Temporal]
        VectorDB[Knowledge Base<br/>Container<br/>Pinecone/Faiss]
    }

    LLMProvider[LLM Provider<br/>Software System<br/>External]
    SocialMedia[Social Media Platforms<br/>Software System<br/>External]

    MarketingManager -->|Manages campaigns| Orchestrator
    Orchestrator -->|Delegates to| ContentAgent
    Orchestrator -->|Delegates to| SchedulingAgent
    ContentAgent -->|Accesses| VectorDB
    ContentAgent -->|Uses| LLMProvider
    SchedulingAgent -->|Publishes to| SocialMedia
```
