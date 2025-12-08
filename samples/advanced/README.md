# Advanced Diagrams & Cloud Infrastructure (C4 Level 4+)

This section showcases **Deployment Diagrams** and **Dynamic Diagrams** (introduced in C4X v1.2), along with cloud-native icon support.

## ☁️ Deployment Diagrams
Deployment diagrams map Software Containers to Infrastructure Nodes. They support recursive nesting of nodes (Cloud -> Region -> Cluster -> Pod).

### AWS Deployment
Standard AWS architecture using nested `Node` blocks.

```c4x
%%{ c4: deployment }%%
graph TB
    
    %% Actors
    Person(user, "User", "Customer", "Uses the system")

    %% AWS Cloud
    Node(aws, "AWS Cloud", "AWS", "US East (N. Virginia)", $sprite="aws") {
        
        %% Region -> VPC
        Node(vpc, "VPC", "VPC", "10.0.0.0/16", $sprite="cloud") {
            
            %% Availability Zone 1
            Node(az1, "Availability Zone A", "AZ") {
                
                %% EKS Cluster
                Node(k8s, "EKS Cluster", "Kubernetes") {
                    
                    %% Pods / Containers
                    Container(web, "Web App", "React", "Frontend", $sprite="container")
                    Container(api, "API Service", "Java/Spring", "Backend API", $sprite="server")
                }
            }
            
            %% Database Subnet
            Node(db_subnet, "DB Subnet", "Subnet") {
                Container(db, "Primary DB", "PostgreSQL", "Main Database", $sprite="database")
            }
        }
    }

    %% Relationships
    user --> web
    web --> api
    api --> db
```

### Azure Deployment
Azure infrastructure example using `azure-*` specific icons.

```c4x
%%{ c4: deployment }%%
graph TB

    %% Azure Deployment
    
    Node(azure, "Azure Cloud", "Azure", "West Europe", $sprite="azure") {
        
        Node(rg, "Resource Group", "RG-PROD", $sprite="azure-resource-groups") {
            
            Node(vnet, "VNet", "10.0.0.0/16", $sprite="azure-virtual-networks") {
                
                Node(aks, "AKS Cluster", "Kubernetes Service", $sprite="azure-kubernetes-services") {
                    Container(api, "API Service", ".NET Core", "Backend", $sprite="container")
                }
                
                Node(db_service, "Azure SQL", "PaaS", $sprite="azure-sql-server") {
                    Container(db, "Main DB", "SQL Server", "Data", $sprite="database")
                }
            }
        }
    }
    
    Person(user, "User", "Web User", $sprite="person")
    
    user --> api
    api --> db
```

### Google Cloud (GCP) Deployment
GCP infrastructure example using `gcp-*` icons.

```c4x
%%{ c4: deployment }%%
graph TB

    %% Google Cloud Deployment
    
    Node(gcp, "Google Cloud", "GCP", "us-central1", $sprite="google") {
        
        Node(vpc, "VPC Network", "10.128.0.0/20", $sprite="cloud") {
            
            Node(gke, "GKE Cluster", "Kubernetes Engine", $sprite="gcp-gke") {
                Container(app, "Go Service", "Go", "Microservice", $sprite="container")
            }
            
            Node(cloudsql, "Cloud SQL", "PostgreSQL", $sprite="gcp-cloudsql") {
                Container(db, "User DB", "PostgreSQL", "Data", $sprite="database")
            }
        }
    }
    
    Person(admin, "Admin", "DevOps", "Manages infra", $sprite="person")
    
    admin --> app
    app --> db
```

## 🧠 AI Agent Architecture (System Boundaries)
Demonstrating the `System_Boundary` block syntax for logical grouping of containers.

```c4x
%%{ c4: container }%%
graph TB

    %% AWS AI Agent RAG Architecture
    Person(user, "User", "Customer Support Agent", "Interacts with chat bot", $sprite="person")

    System_Boundary(chat_system, "AI Chat System") {
        Container(frontend, "Chat UI", "React / WebSocket", "User Interface", $sprite="container")
        Container(agent_service, "Agent Service", "Python / LangChain", "Orchestrates LLM calls", $sprite="aws-iot-lambda-function")
        Container(knowledge_api, "Knowledge API", "FastAPI", "Retrieves context", $sprite="aws-amazon-elastic-container-service-service")
    }

    System_Boundary(aws_backend, "AWS Backend") {
        Container(llm, "LLM Model", "Bedrock / Claude", "Generates responses", $sprite="aws-amazon-sagemaker-ai-model")
        Container(vector_db, "Vector Store", "OpenSearch / Pinecone", "Stores embeddings", $sprite="aws-amazon-dynamodb-table")
        Container(doc_store, "Document Store", "S3", "Source documents", $sprite="aws-amazon-simple-storage-service-s3-object-lambda")
        Container(session_store, "Session Memory", "DynamoDB", "Chat history", $sprite="aws-amazon-dynamodb-table")
    }

    %% Relationships
    user --> frontend
    frontend --> agent_service
    
    agent_service -->|1. Query| knowledge_api
    knowledge_api -->|2. Search| vector_db
    vector_db -.->|3. Refs| doc_store
    
    agent_service -->|4. Prompt| llm
    agent_service -->|5. Save Context| session_store
```

## 🔄 Dynamic Diagrams
Dynamic diagrams show the runtime communication sequence between elements for a specific use case. Relationships are auto-numbered based on definition order.

```c4x
%%{ c4: dynamic }%%
graph LR

    %% Elements
    Person(customer, "Customer", "Online Shopper")
    
    System(webApp, "Web Application", "React Storefront", $sprite="container")
    System(api, "API Gateway", "AWS API Gateway", $sprite="aws")
    System(auth, "Auth Service", "Cognito", $sprite="server")
    System(db, "Database", "DynamoDB", $sprite="database")

    %% Dynamic Sequence (Auto-numbered 1, 2, 3...)
    customer -->|Navigates to Login| webApp
    webApp -->|Submits Credentials| api
    api -->|Validates Token| auth
    auth -.->|Token Valid| api
    api -->|Fetches User Profile| db
    db -.->|User Data| api
    api -.->|Login Success| webApp
```

## 📝 Literate Architecture
See [architecture-documentation.md](./architecture-documentation.md) for a full example of how to embed these diagrams directly into your project documentation.