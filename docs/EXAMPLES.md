# C4X Diagram Examples

**Version**: 1.1.0
**Last Updated**: 2025-12-01

This document provides a comprehensive gallery of C4 diagrams created with C4X. These examples demonstrate the full capabilities of the extension, including the new visual style (white fill, colored borders, hollow/filled arrows), auto-scaling text, and support for complex architectures.

All examples use the `.c4x` DSL format unless otherwise noted.
For PlantUML equivalents, see [Examples - PlantUML](./EXAMPLES-PLANTUML.md).

---

## 1. Banking System (Standard Reference)

A classic, multi-tier financial application demonstrating the core C4 model layers.

### System Context (C1)

Shows the big picture: users and external dependencies.

**Source**: [banking-system.c4x](../samples/system-context/banking-system.c4x)

```c4x
%%{ c4: system-context }%%
graph TB
    %% Actors
    Customer[Personal Banking Customer<br/>Person]
    Admin[Back Office Staff<br/>Person<br/>Internal]

    %% Our System
    BankingSystem[Internet Banking System<br/>Software System]

    %% External Systems
    Mainframe[Mainframe Banking System<br/>Software System<br/>External]
    Email[E-mail System<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Views account balances, makes payments| BankingSystem
    Admin -->|Manages users and system config| BankingSystem
    
    BankingSystem -->|Gets account info from| Mainframe
    BankingSystem -->|Sends e-mail using| Email
```

### Container (C2) - Nested Architecture

Shows the high-level technology building blocks.

```c4x
%%{ c4: container }%%
graph TB
    Customer[Personal Banking Customer<br/>Person]

    subgraph BankingSystem {
        SPA[Single-Page App<br/>Container<br/>JavaScript/Angular]
        MobileApp[Mobile App<br/>Container<br/>Xamarin]
        API[API Application<br/>Container<br/>Java/Spring Boot]
        Database[Database<br/>Container<br/>Oracle]
    }

    Mainframe[Mainframe Banking System<br/>Software System<br/>External]
    Email[E-mail System<br/>Software System<br/>External]

    Customer -->|Uses| SPA
    Customer -->|Uses| MobileApp

    SPA -->|Makes API calls to| API
    MobileApp -->|Makes API calls to| API
    
    API ==>|Reads from and writes to| Database
    API -->|Sends e-mail using| Email
    API -->|Makes XML/HTTPS calls to| Mainframe
```

---

## 2. Online Store (Microservices)

A modern e-commerce platform demonstrating microservices, asynchronous messaging, and rich interactions.

### System Context (C1)

```c4x
%%{ c4: system-context }%%
graph TB
    Shopper[Online Shopper<br/>Person]
    Support[Customer Support<br/>Person<br/>Internal]

    Store[Online Store Platform<br/>Software System]

    PaymentGW[Payment Gateway<br/>Software System<br/>External]
    Shipping[Shipping Provider<br/>Software System<br/>External]

    Shopper -->|Browses and buys products| Store
    Support -->|Manages orders and refunds| Store

    Store -->|Processes payments via| PaymentGW
    Store -->|Arranges shipping via| Shipping
```

### Container (C2) - Microservices

This example highlights the use of `subgraph` for boundaries and varied relationship types (sync vs async).

```c4x
%%{ c4: container }%%
graph TB
    Shopper[Online Shopper<br/>Person]

    subgraph StorePlatform {
        StoreFront[Storefront Web App<br/>Container<br/>Next.js]
        ApiGateway[API Gateway<br/>Container<br/>Kong]
        
        OrderSvc[Order Service<br/>Container<br/>Go]
        CatalogSvc[Catalog Service<br/>Container<br/>Java]
        PaymentSvc[Payment Service<br/>Container<br/>Node.js]
        
        MsgQueue[Event Bus<br/>Container<br/>Kafka]
        NotificationSvc[Notification Service<br/>Container<br/>Python]
    }

    PaymentGW[Payment Gateway<br/>Software System<br/>External]
    Email[Email Provider<br/>Software System<br/>External]

    Shopper -->|Visits| StoreFront
    StoreFront -->|API Calls| ApiGateway

    ApiGateway -->|Routes to| OrderSvc
    ApiGateway -->|Routes to| CatalogSvc
    
    OrderSvc -->|Initiates payment| PaymentSvc
    PaymentSvc -->|Charges credit card| PaymentGW
    
    %% Async Event
    PaymentSvc -.->|Payment Success Event| MsgQueue
    MsgQueue -.->|Consumes event| NotificationSvc
    NotificationSvc -->|Sends confirmation| Email
```

---

## 3. Multi-Agent Web3 System (Complex/AI)

A cutting-edge example showing interactions between Autonomous AI Agents, Blockchains, and Decentralized Storage. This demonstrates how C4X can visualize complex, non-traditional software architectures.

### System Context (C1)

Visualizing the ecosystem of agents and decentralized networks.

```c4x
%%{ c4: system-context }%%
graph TB
    User[DeFi Trader<br/>Person]
    
    AgentSwarm[Autonomous Trading Swarm<br/>Software System]
    
    Ethereum[Ethereum Blockchain<br/>Software System<br/>External]
    IPFS[IPFS Storage<br/>Software System<br/>External]
    LLM[OpenAI GPT-4 API<br/>Software System<br/>External]

    User -->|Defines trading strategy (natural language)| AgentSwarm
    
    AgentSwarm -->|Executes smart contracts| Ethereum
    AgentSwarm -->|Stores agent memory/logs| IPFS
    AgentSwarm -->|Reasons and plans via| LLM
```

### Container (C2) - Agent Architecture

Shows the internal components of the "Agent Swarm," including the Orchestrator and specialized sub-agents.

```c4x
%%{ c4: container }%%
graph TB
    User[DeFi Trader<br/>Person]

    subgraph TradingSwarm {
        Orchestrator[Swarm Orchestrator<br/>Container<br/>Python/LangChain]
        
        MarketAnalyst[Market Analyst Agent<br/>Container<br/>AutoGPT]
        RiskManager[Risk Manager Agent<br/>Container<br/>Custom LLM Chain]
        Executor[Execution Agent<br/>Container<br/>Web3.py]
        
        VectorDB[Memory Store<br/>Container<br/>Pinecone]
    }

    Ethereum[Ethereum Blockchain<br/>Software System<br/>External]
    LLM[LLM Provider<br/>Software System<br/>External]

    User -->|Submits intent| Orchestrator
    
    Orchestrator ==>|Coordinates| MarketAnalyst
    Orchestrator ==>|Coordinates| RiskManager
    Orchestrator ==>|Coordinates| Executor
    
    %% Shared Memory
    MarketAnalyst -->|Reads/Writes| VectorDB
    RiskManager -->|Reads/Writes| VectorDB
    
    %% External Calls
    MarketAnalyst -->|Queries price feeds| Ethereum
    Executor ==>|Submits Transactions| Ethereum
    
    Orchestrator -.->|Inference API| LLM
```

---

## 4. PlantUML C4 Support

C4X also natively supports standard PlantUML C4 syntax. This allows you to use existing diagrams without conversion.

**Source**: [banking-plantuml.puml](../docs/examples/banking-plantuml.puml)

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(customer, "Customer", "A customer of the bank")
System_Boundary(c1, "Internet Banking") {
    Container(web_app, "Web Application", "Java, Spring MVC", "Delivers static content and the SPA")
    Container(spa, "Single-Page App", "JavaScript, Angular", "Provides banking functionality")
    Container(api, "API Application", "Java, Spring Boot", "Provides functionality via JSON/HTTPS API")
    ContainerDb(db, "Database", "Oracle", "Stores user registration info")
}

System_Ext(email, "E-mail System", "Internal Exchange system")

Rel(customer, web_app, "Visits", "HTTPS")
Rel(customer, spa, "Uses", "HTTPS")
Rel(web_app, spa, "Delivers")
Rel(spa, api, "Uses", "JSON/HTTPS")
Rel(api, db, "Reads/Writes", "JDBC")
Rel(api, email, "Sends e-mail", "SMTP")
@enduml
```

---

## 5. Marketing Multi-Agent System (Swarm Architecture)

A collaborative team of AI agents working together to plan, create, and distribute marketing content.

### System Context (C1)

Visualizing the high-level interactions between the Marketing Director (User) and the Agent Swarm.

```c4x
%%{ c4: system-context }%%
graph TB
    Director[Marketing Director<br/>Person]

    MarketingSwarm[Marketing Agent Swarm<br/>Software System]

    LLM[LLM Model<br/>Software System<br/>External]
    Search[Search Engine<br/>Software System<br/>External]
    SocialMedia[Social Media Platforms<br/>Software System<br/>External]
    CMS[Content Management System<br/>Software System<br/>External]

    Director -->|Provides campaign brief| MarketingSwarm
    
    MarketingSwarm -->|Uses for reasoning| LLM
    MarketingSwarm -->|Research trends| Search
    MarketingSwarm -->|Publishes posts| SocialMedia
    MarketingSwarm -->|Publishes articles| CMS
```

### Container (C2) - Agent Workflow

Internal collaboration between specialized agents.

```c4x
%%{ c4: container }%%
graph TB
    Director[Marketing Director<br/>Person]

    subgraph MarketingSwarm {
        Manager[Campaign Manager<br/>Container<br/>Orchestrator]
        
        Researcher[Market Researcher<br/>Container<br/>Web Surfer]
        Writer[Content Copywriter<br/>Container<br/>Creative Agent]
        Reviewer[Content Editor<br/>Container<br/>Critique Agent]
        SocialAgent[Social Media Specialist<br/>Container<br/>Platform Expert]
        
        SharedMem[Shared Memory<br/>Container<br/>Vector DB]
    }

    LLM[LLM API<br/>Software System<br/>External]
    Internet[Internet<br/>Software System<br/>External]

    Director -->|Brief| Manager

    %% Orchestration Flow
    Manager ==>|1. Assigns tasks| Researcher
    Manager ==>|2. Assigns tasks| Writer
    
    %% Agent Actions
    Researcher -->|Searches web| Internet
    Researcher -.->|Saves insights| SharedMem
    
    Writer -.->|Reads insights| SharedMem
    Writer -->|Generates draft| LLM
    Writer -->|Submits draft| Reviewer
    
    Reviewer -->|Validates| LLM
    Reviewer -.->|Approve/Reject| Writer
    
    Reviewer -->|Approved content| SocialAgent
    SocialAgent ==>|Publish| Internet
```
