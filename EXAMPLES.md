# C4X Examples Gallery

This gallery showcases the versatility of C4X, demonstrating various diagram levels, theme applications, and core functionalities like icon usage and multi-agent visualization.

## 🎨 Theme Showcase (System Context Diagram)

This example uses a simple System Context diagram to illustrate each of the 5 built-in themes.

```c4x
%%{ c4: system-context }%%
graph TB
    User[Customer<br/>Person]
    Banking[Internet Banking System<br/>Software System]
    Email[Email System<br/>Software System<br/>External]

    User -->|Uses| Banking
    Banking -->|Sends notifications| Email
```

### Classic Theme

```c4x

%%{ c4: system-context }%%

graph TB

    User[Customer<br/>Person]

    Banking[Internet Banking System<br/>Software System]

    Email[Email System<br/>Software System<br/>External]



    User -->|Uses| Banking

    Banking -->|Sends notifications| Email

```

### Modern Theme

```c4x

%%{ c4: system-context }%%

graph TB

    User[Customer<br/>Person]

    Banking[Internet Banking System<br/>Software System]

    Email[Email System<br/>Software System<br/>External]



    User -->|Uses| Banking

    Banking -->|Sends notifications| Email

```

### Muted Theme

```c4x

%%{ c4: system-context }%%

graph TB

    User[Customer<br/>Person]

    Banking[Internet Banking System<br/>Software System]

    Email[Email System<br/>Software System<br/>External]



    User -->|Uses| Banking

    Banking -->|Sends notifications| Email

```

### High Contrast Theme

```c4x

%%{ c4: system-context }%%

graph TB

    User[Customer<br/>Person]

    Banking[Internet Banking System<br/>Software System]

    Email[Email System<br/>Software System<br/>External]



    User -->|Uses| Banking

    Banking -->|Sends notifications| Email

```

### Auto Theme

```c4x

%%{ c4: system-context }%%

graph TB

    User[Customer<br/>Person]

    Banking[Internet Banking System<br/>Software System]

    Email[Email System<br/>Software System<br/>External]



    User -->|Uses| Banking

    Banking -->|Sends notifications| Email

```

## 🤖 Multi-Agent Architecture Examples

### C1: Multi-Agent Marketing System (System Context)

This diagram visualizes the high-level interactions for an AI-powered marketing system, featuring human roles, the multi-agent platform, and external AI services.

```c4x
%%{ c4: system-context }%%
graph TB
    MarketingManager[Marketing Manager<br/>Person]
    ContentCreator[Content Creator<br/>Person]
    MultiAgentSystem[Multi-Agent Marketing System<br/>Software System]
    LLMProvider[LLM Provider<br/>Software System<br/>External]
    SocialMedia[Social Media Platforms<br/>Software System<br/>External]

    MarketingManager -->|Defines campaigns<br/>Reviews performance| MultiAgentSystem
    ContentCreator -->|Approves AI-generated content| MultiAgentSystem
    MultiAgentSystem -->|Generates content using| LLMProvider
    MultiAgentSystem -->|Publishes content to| SocialMedia
```

### C2: Multi-Agent Orchestrator (Container Diagram)

A container-level view of the Multi-Agent Marketing System, detailing the main building blocks within the Multi-Agent System.

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

## 🏦 Banking System Examples

### C1: Internet Banking System (System Context)

```c4x
%%{ c4: system-context }%%
graph TB
    Customer[Personal Banking Customer<br/>Person]
    InternetBanking[Internet Banking System<br/>Software System]
    MainframeSystem[Mainframe Banking System<br/>Software System<br/>External]

    Customer -->|Uses| InternetBanking
    InternetBanking -->|Gets account info from| MainframeSystem
```

### C2: Internet Banking System (Container Diagram)

```c4x
%%{ c4: container }%%
graph TB
    Customer[Personal Banking Customer<br/>Person]

    subgraph InternetBankingSystem {
        WebApp[Web Application<br/>Container<br/>React]
        APIService[API Service<br/>Container<br/>Spring Boot]
        Database[Database<br/>Container<br/>PostgreSQL]
    }

    Customer -->|Uses| WebApp
    WebApp -->|Calls| APIService
    APIService -->|Reads/Writes| Database
```

## 🛒 E-commerce System Examples

### C1: E-commerce Platform (System Context)

```c4x
%%{ c4: system-context }%%
graph TB
    Buyer[Online Buyer<br/>Person]
    Seller[Merchant Seller<br/>Person]
    EcommerceSystem[E-commerce Platform<br/>Software System]
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]

    Buyer -->|Browses & Buys| EcommerceSystem
    Seller -->|Manages Products| EcommerceSystem
    EcommerceSystem -->|Processes payments via| PaymentGateway
```

### C2: E-commerce Platform (Container Diagram)

```c4x
%%{ c4: container }%%
graph TB
    Buyer[Online Buyer<br/>Person]

    subgraph EcommercePlatform {
        Storefront[Storefront Web App<br/>Container<br/>Next.js]
        ProductAPI[Product Service API<br/>Container<br/>Node.js]
        OrderDB[Order Database<br/>Container<br/>MongoDB]
    }

    PaymentGateway[Payment Gateway<br/>Software System<br/>External]

    Buyer -->|Uses| Storefront
    Storefront -->|Calls| ProductAPI
    ProductAPI -->|Manages orders in| OrderDB
    ProductAPI -->|Integrates with| PaymentGateway
```
