# C4X: Advanced Examples (Icons & AI)

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
    Person(DataScientist, "Data Scientist", "Configures and manages agents and workflows.")
    Person(EndUser, "End User", "Consumes AI-generated results via an application.")

    subgraph MultiAgentAIPlatform {
        Container(Orchestrator, "AI Orchestrator", "Python/FastAPI on Cloud Run<br/>Delegates tasks and aggregates results.")
        ContainerDb(VectorStore, "Vector Store", "Vertex AI Vector Search<br/>Stores contextual data and agent memory.")
        ContainerDb(MetadataDB, "Metadata Database", "Cloud SQL for PostgreSQL<br/>Stores agent configurations and run history.")
    }

    System_Ext(VertexAI, "Google Vertex AI", "External platform providing foundation models (Gemini, Codey, Search) for agent capabilities.")

    DataScientist -->|Configures agents via API| Orchestrator
    EndUser -->|Submits requests via API| Orchestrator
    
    Orchestrator -->|Delegates tasks to AI Agents| VertexAI
    Orchestrator -->|Reads and writes context| VectorStore
    Orchestrator -->|Reads and writes metadata| MetadataDB
```

### Scenario A: Google Vertex AI Multi-Agent System (Corrected)
*Use `$sprite="c4xicons..."` for best results. Use Autocomplete (Ctrl+Space/Cmd+Space) inside the quotes.*

---

### Scenario B: Web3 Project with Firebase Backbone

*A hybrid Web3 application base for off-chain data and BigQuery for analytics.*

> **Select this text to generate:**
> Create a C4 Container diagram for a **Web3 NFT Analytics Platform**.
> **Frontend**: Next.js Web App hosted on **Firebase Hosting**.
> **Auth**: Hybrid authentication using **Firebase Auth** (socials) and **WalletConnect** (crypto wallet).
> **Backend**: **Firebase Cloud Functions** (Node.js) for serverless logic.
> **Data Layer**:
> - **Off-chain Data**: **Firestore** (NoSQL user profiles).
> - **On-chain Analytics**: **BigQuery** (indexing public blockchain data).
> - **Blockchain**: Interaction with **Ethereum** Smart Contracts via RPC.
> **Key Flow**: User connects wallet -> App fetches profile from Firestore and transaction history from BigQuery -> Displayed on Dashboard.

---

```c4x
%%{ c4: container }%%
graph TB
    Person(User, "Web3 User", "Connects via wallet or social login")

    subgraph NFTAnalyticsPlatform {
        Container(WebApp, "Web App", "Next.js / Firebase Hosting")
        Container(Backend, "Backend Functions", "Node.js / Firebase Cloud Functions")
        ContainerDb(FirestoreDb, "User Profiles DB", "Firestore")
        ContainerDb(BigQueryDb, "On-chain Analytics", "BigQuery")
    }

    System_Ext(FirebaseAuth, "Firebase Authentication", "Handles social logins")
    System_Ext(WalletConnect, "WalletConnect", "Handles crypto wallet connections")
    System_Ext(Ethereum, "Ethereum Blockchain", "Public Ledger")

    User -->|Views NFT Dashboard| WebApp
    
    WebApp -->|Authenticates with| FirebaseAuth
    WebApp -->|Connects wallet with| WalletConnect
    WebApp -->|Fetches data via API| Backend
    
    Backend -->|Reads/Writes Profiles| FirestoreDb
    Backend -->|Queries indexed data| BigQueryDb
    Backend -->|Reads on-chain data via RPC| Ethereum
```

### Scenario C: AWS 3-Tier E-Commerce with Auto-Scaling
*A classic high-scale architecture using AWS managed services.*

> **Select this text to generate:**
> Create a C4 Container diagram for a **High-Scale E-Commerce System** on AWS.
> **Tier 1 (Presentation)**:
> - **Route 53** (DNS) pointing to **CloudFront** (CDN).
> - **Application Load Balancer (ALB)** distributing traffic.
> **Tier 2 (Application)**:
> - **Storefront App** running on **EC2 Auto Scaling Group** (Linux/Node.js).
> **Tier 3 (Data & Caching)**:
> - **Primary DB**: **Amazon RDS** (Aurora PostgreSQL).
> - **Caching**: **ElastiCache** (Memcached) for session/product caching.
> - **Asset Storage**: **S3 Bucket** for product images.
> **Flow**: Customer browses site -> CloudFront caches assets -> ALB routes dynamic requests -> EC2 App checks ElastiCache -> Misses hit RDS.

---

```c4x
%%{ c4: container }%%
graph TB
    Person(Customer, "Customer", "Browses the e-commerce site")

    subgraph AWSEcommerceSystem {
        Container(Route53, "Route 53", "AWS DNS Service")
        Container(CloudFront, "CloudFront", "AWS CDN")
        Container(ALB, "Application Load Balancer", "AWS")
        Container(StorefrontApp, "Storefront App", "Node.js on EC2 Auto Scaling Group")
        Container(ElastiCache, "ElastiCache", "AWS Memcached")
        ContainerDb(RDS, "Primary Database", "AWS Aurora PostgreSQL")
        Container(S3, "Asset Storage", "AWS S3 Bucket")
    }

    Customer -->|Browses site via DNS| Route53
    Route53 -->|Resolves to| CloudFront
    CloudFront -->|Forwards dynamic requests| ALB
    CloudFront -->|Serves static assets from| S3
    ALB -->|Routes traffic to| StorefrontApp
    
    StorefrontApp -->|Reads/Writes session data| ElastiCache
    StorefrontApp -->|Reads/Writes on cache miss| RDS
    StorefrontApp -->|Reads product images| S3
```
