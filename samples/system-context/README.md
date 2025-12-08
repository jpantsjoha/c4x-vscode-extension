# System Context Diagrams (Level 1)

**System Context diagrams** represent the "big picture". They show the software system you are building, who uses it (people), and what external systems it interacts with.

## 🏦 Banking System
A standard enterprise architecture example showing a Banking System interacting with legacy mainframes and email services.

```c4x
%%{ c4: system-context }%%
graph TB
    %% People (Users of the system)
    Customer[Personal Banking Customer<br/>Person]
    BackOffice[Back Office Staff<br/>Person<br/>Internal]

    %% Our System (The focus)
    InternetBanking[Internet Banking System<br/>Software System]

    %% External Systems (Dependencies)
    EmailSystem[E-mail System<br/>Software System<br/>External]
    MainframeSystem[Mainframe Banking System<br/>Software System<br/>External]

    %% Relationships (How everything connects)
    Customer -->|Views account balances<br/>and makes payments using| InternetBanking
    BackOffice -->|Uses for<br/>administration tasks| InternetBanking

    InternetBanking -->|Sends e-mails using| EmailSystem
    InternetBanking -->|Gets account information from<br/>and makes transactions using| MainframeSystem
```

## 🛒 E-Commerce Platform
A retail example showing interaction with third-party providers (Payments, Shipping, Inventory).

```c4x
%%{ c4: system-context }%%
graph TB
    %% People
    Customer[Online Shopper<br/>Person]
    Admin[Store Administrator<br/>Person<br/>Internal]
    Supplier[Product Supplier<br/>Person<br/>External]

    %% Our System
    EcommerceSystem[E-commerce Platform<br/>Software System]

    %% External Systems
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]
    EmailService[Email Service<br/>Software System<br/>External]
    ShippingProvider[Shipping Provider<br/>Software System<br/>External]
    InventorySystem[Supplier Inventory System<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Browses products<br/>Places orders<br/>Tracks shipments| EcommerceSystem
    Admin -->|Manages products<br/>Views orders<br/>Generates reports| EcommerceSystem
    Supplier -->|Updates inventory<br/>Views purchase orders| EcommerceSystem

    EcommerceSystem -->|Processes payments using| PaymentGateway
    EcommerceSystem -->|Sends order confirmations<br/>and shipping notifications via| EmailService
    EcommerceSystem -->|Arranges shipping<br/>and tracking via| ShippingProvider
    EcommerceSystem -->|Syncs product availability<br/>with| InventorySystem

    %% Two-way relationships
    PaymentGateway -.->|Payment status updates| EcommerceSystem
    ShippingProvider -.->|Tracking updates| EcommerceSystem
```

## 🤖 Multi-Agent AI System
A modern AI architecture showing human-in-the-loop interactions with an Agentic System.

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
