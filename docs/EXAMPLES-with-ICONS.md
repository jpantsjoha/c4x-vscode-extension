# C4X: Advanced Examples (Icons & AI)

> [!NOTE]
> **Can't see the diagrams?**
> You need the **[C4X VS Code Extension](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x-vscode-extension)** to view the live visualizations below. Otherwise, you'll only see the source code.

> **Navigation**:
> [🏠 Back to README](../README.md) | [📚 Full Example Gallery](./EXAMPLES.md) | [📝 Syntax Guide](./c4x-syntax.md)
>
> **Related**: [📐 Layout Guide](./EXAMPLES-LAYOUT.md) | [🔢 Ordering Guide](./EXAMPLES-ORDERING.md)

This guide demonstrates how to use **Technology Icons** (`$sprite`) and **Generative AI** to build complex, professional cloud architectures.t the **Gemini AI generation**.

## 1. How to use Icons & Autocomplete

C4X supports a massive library of cloud and tech icons (AWS, Azure, GCP, DevIcons, etc.).

### Syntax
Use the **named parameter** `$sprite` inside any element definition:

> 📘 **Icon Catalog**: View the full list of available cloud icons in [ICONS.md](./ICONS.md).

`Container(id, "Label", "Tech", $sprite="c4xicons.<vendor>.icon-name")`

### Using Autocomplete (IntelliSense)
1. Type `$sprite="` inside a C4 macro.
2. Press `Ctrl+Space` (or `Cmd+Space` on Mac) to trigger suggestions.
3. Type a keyword (e.g., `aws`, `azure`, `gcp`).

**Simple Example:**
```c4x
%%{ c4: container }%%
graph TB
  Container(Web, "Web App", "React", $sprite="c4xicons.aws.elastic-beanstalk-application")
  ContainerDb(DB, "Storage", "S3", $sprite="c4xicons.aws.simple-storage-service-bucket")
```

---

## 2. AI Generation Scenarios

Below are three complex architecture descriptions. You can **select the text block**, right-click, and choose **"C4X: Diagram from Selection"** to let Gemini generate the C4 diagram for you.

### Scenario A: Google Vertex AI Multi-Agent System
*A sophisticated AI architecture leveraging Google Cloud's Vertex AI backbone.*

> **Select this text to generate:**
> Create a C4 Container diagram for a **Multi-Agent AI Platform**.
> **Users**: Data Scientists, End Users.
> **Core System**: "AI Orchestrator" (Python/FastAPI) running on **Cloud Run**.
> **AI Backbone**: Integrates with **Google Vertex AI** for LLM handling.
> **Agents**:
> - "Research Agent" (Vertex AI Search).
> - "Coding Agent" (Vertex AI Codey).
> - "Reasoning Agent" (Gemini Pro).
> **Data**:
> - **Vector Store**: Vertex AI Vector Search.
> - **Metadata**: Cloud SQL (PostgreSQL).
> **Flow**: User requests -> Orchestrator delegates to specific Agents -> Agents query Vector Store -> Aggregated response sent back.

```c4x
%%{ c4: container }%%
graph TB
  title Multi-Agent AI Platform Container Diagram

  %% Users
  Person(EndUser, "End User", "Consumes AI Services")
  Person(DS, "Data Scientist", "Model Tuning")

  %% System Boundary: Multi-Agent Platform
  subgraph PlatformScope {
    
    %% Entry Point (Cloud Run)
    Container(Orchestrator, "AI Orchestrator", "Python/FastAPI (Cloud Run)")

    %% Agent Layer (Grouped for Visual Logic)
    subgraph AgentLayer {
      Container(ResAgent, "Research Agent", "Vertex AI Search", $sprite="c4xicons.gcp.vertexai")
      Container(CodeAgent, "Coding Agent", "Vertex AI Codey", $sprite="c4xicons.gcp.vertexai")
      Container(ReasonAgent, "Reasoning Agent", "Gemini Pro", $sprite="c4xicons.gcp.vertexai")
    }

    %% Data Layer
    subgraph DataLayer {
      ContainerDb(VectorStore, "Vector Store", "Vertex AI Vector Search", $sprite="c4xicons.gcp.vertexai")
      ContainerDb(MetaDB, "Metadata Store", "Cloud SQL (PostgreSQL)", $sprite="c4xicons.gcp.cloudsql")
    }
  }

  %% External Systems
  System(GoogleVertex, "Google Vertex AI", "LLM Platform", $sprite="c4xicons.gcp.vertexai")

  %% Relationships: User to System
  EndUser -->|Submits Request| Orchestrator
  DS -->|Configures Agents| Orchestrator

  %% Relationships: Orchestrator to Agents
  Orchestrator -->|Delegates Search| ResAgent
  Orchestrator -->|Delegates Coding| CodeAgent
  Orchestrator -->|Delegates Logic| ReasonAgent

  %% Relationships: Agents to Data
  ResAgent -->|Semantic Search| VectorStore
  ReasonAgent -->|Context Retrieval| VectorStore
  CodeAgent -->|Persists State| MetaDB
  ResAgent -.->|Logs| MetaDB

  %% Relationships: Agents to External LLM Backbone
  ResAgent -->|Inference| GoogleVertex
  CodeAgent -->|Code Generation| GoogleVertex
  ReasonAgent -->|Reasoning| GoogleVertex
```

### Scenario A: Google Vertex AI Multi-Agent System (Verified)
*Use `$sprite="c4xicons..."` for best results. Use Autocomplete (Ctrl+Space/Cmd+Space) inside the quotes.*

```c4x
%%{ c4: container }%%
graph TB
  title Multi-Agent AI Platform Container Diagram

  %% Users
  Person(EndUser, "End User", "Consumes AI Services", $sprite="person")
  Person(DS, "Data Scientist", "Model Tuning", $sprite="person")

  %% System Boundary: Multi-Agent Platform
  subgraph PlatformScope {
    
    %% Entry Point (Cloud Run)
    Container(Orchestrator, "AI Orchestrator", "Python/FastAPI (Cloud Run)", $sprite="c4xicons.gcp.cloudrun")

    %% Agent Layer (Grouped for Visual Logic)
    subgraph AgentLayer {
      Container(ResAgent, "Research Agent", "Vertex AI Search", $sprite="c4xicons.gcp.vertexai")
      Container(CodeAgent, "Coding Agent", "Vertex AI Codey", $sprite="c4xicons.gcp.vertexai")
      Container(ReasonAgent, "Reasoning Agent", "Gemini Pro", $sprite="c4xicons.gcp.vertexai")
    }

    %% Data Layer
    subgraph DataLayer {
      ContainerDb(VectorStore, "Vector Store", "Vertex AI Vector Search", $sprite="c4xicons.gcp.vertexai")
      ContainerDb(MetaDB, "Metadata Store", "Cloud SQL (PostgreSQL)", $sprite="c4xicons.gcp.cloudsql")
    }
  }

  %% External Systems
  System(GoogleVertex, "Google Vertex AI", "LLM Platform", $sprite="c4xicons.gcp.vertexai")

  %% Relationships
  EndUser -->|Submits Request| Orchestrator
  DS -->|Configures Agents| Orchestrator
  Orchestrator -->|Delegates Search| ResAgent
  Orchestrator -->|Delegates Coding| CodeAgent
  Orchestrator -->|Delegates Logic| ReasonAgent
  ResAgent -->|Semantic Search| VectorStore
  ReasonAgent -->|Context Retrieval| VectorStore
  CodeAgent -->|Persists State| MetaDB
  ResAgent -.->|Logs| MetaDB
  ResAgent -->|Inference| GoogleVertex
  CodeAgent -->|Code Generation| GoogleVertex
  ReasonAgent -->|Reasoning| GoogleVertex
```

---

### Scenario B: Multi-Cloud Architecture (Azure & GCP)

*An enterprise application spanning Azure App Services and Google Cloud Data.*

```c4x
%%{ c4: container }%%
graph TB
    Person(Customer, "Customer", "Uses the web app")

    subgraph Azure {
        Container(WebApp, "E-Commerce Frontend", "Azure Spring Apps", $sprite="c4xicons.azure.spring-apps")
        Container(API, "Order Service", "Azure App Service", $sprite="c4xicons.azure.app-services")
    }

    subgraph GCP {
        ContainerDb(BigData, "Analytics DB", "BigQuery", $sprite="c4xicons.gcp.bigquery")
        ContainerDb(UserDB, "User Database", "Cloud SQL", $sprite="c4xicons.gcp.cloud-sql")
    }

    Customer -->|HTTPS| WebApp
    WebApp -->|gRPC| API
    API -->|Writes Orders| UserDB
    API -->|Streams Events| BigData
```

---

### Scenario C: AWS Serverless E-Commerce

*A modern serverless architecture on AWS.*

```c4x
%%{ c4: container }%%
graph TB
  Person(Shopper, "Shopper", "Browses catalog", $sprite="person")

  subgraph AWSCloud {
    Container(DNS, "Route 53", "DNS Service", $sprite="c4xicons.aws.route-53-hosted-zone")
    Container(CloudFront, "CloudFront", "CDN for static assets", $sprite="c4xicons.aws.cloudfront")
    Container(ALB, "Application Load Balancer", "Distributes incoming traffic", $sprite="c4xicons.aws.elastic-load-balancing-application-load-balancer")
    
    subgraph Services {
        Container(ShopUI, "Web Shop", "ECS Service", $sprite="c4xicons.aws.elastic-container-service-service")
    }

    ContainerDb(MainDB, "Product DB", "Aurora RDS", $sprite="c4xicons.aws.aurora-postgresql-instance")
    ContainerDb(Assets, "Product Images", "S3 Bucket", $sprite="c4xicons.aws.simple-storage-service-bucket")
  }

  Shopper -->|Resolves| DNS
  DNS -->|Routes| CloudFront
  CloudFront -->|Forwards| ALB
  ALB -->|Routes| ShopUI
  ShopUI -->|Queries| MainDB
  ShopUI -->|Loads Images| Assets
```
