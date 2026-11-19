# C4X Diagrams - Example Gallery

Welcome to the C4X Example Gallery. This collection demonstrates how to use the **C4X DSL** to create beautiful, standard-compliant C4 Model diagrams directly in VS Code.

## 📂 Example Categories

### 1. System Context (Level 1)
High-level interactions showing the "Big Picture".

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer", "Bank Client", $sprite="person")
    System(banking, "Banking System", "Main Platform", $sprite="bank")
    System_Ext(atm, "ATM Network", "External")
    System_Ext(email, "Email System", "Notifications")

    customer --> banking
    customer --> atm
    banking --> email
    atm --> banking
```
[View More System Context Examples](./system-context/README.md)

### 2. [Container Diagrams (Level 2)](./container/README.md)
Zooming in to show the technical building blocks (Web Apps, APIs, Databases).
*   🛍️ Microservices Architecture
*   🧠 AI Agent Orchestrator

### 3. [Component Diagrams (Level 3)](./component/README.md)
Detailed internal structure of individual containers.
*   🌉 API Gateway Internals
*   🤖 Agent Logic & State Machines

### 4. Advanced & Cloud (Level 4+)
Deployment nodes, Cloud Icons, and Dynamic flows.

```c4x
%%{ c4: deployment }%%
graph TB
    Node(aws, "AWS Cloud", "us-east-1", $sprite="aws") {
        Node(vpc, "VPC", "10.0.0.0/16", $sprite="cloud") {
            Node(eks, "EKS Cluster", "Kubernetes", $sprite="server") {
                Container(api, "API Service", "Spring Boot", $sprite="java")
            }
            Node(rds, "RDS", "PostgreSQL", $sprite="database") {
                ContainerDb(db, "Main DB", "Data", $sprite="postgresql")
            }
        }
    }
    Person(dev, "Developer", "DevOps")
    dev --> api
    api --> db
```
[View More Advanced Examples](./advanced/README.md)

### 5. [Real World Landscapes](./real-world/README.md)
Complex enterprise landscapes connecting multiple systems.

### All sample documents

| Section | Documents |
|---|---|
| [System context](./system-context/README.md) | Level 1 examples |
| [Container](./container/README.md) | [gRPC microservices](./container/grpc-microservices.md) |
| [Component](./component/README.md) | [GraphQL API gateway](./component/graphql-api-gateway.md) |
| [Advanced](./advanced/README.md) | [Architecture documentation](./advanced/architecture-documentation.md), [event-driven architecture](./advanced/event-driven-architecture.md), [OAuth 2.0 flow](./advanced/oauth2-authentication-flow.md), [serverless data pipeline](./advanced/serverless-data-pipeline.md) |
| [Real world](./real-world/README.md) | [Healthcare patient management](./real-world/healthcare-patient-management.md) |
| [PNG diagrams](./png-diagrams/README.md) | Flowchart and sequence samples |
| [Visual layout](./visual-layout/README.md) | Layout-mode `.c4x` files |
| [Visual C4 editor](./visual-c4-editor/journey.md) | Acceptance journey for the visual editor |

---

## 🚀 How to Use
1.  Open any `.c4x` file in this folder to see the **Live Preview**.
2.  Open any `README.md` file to see how diagrams are embedded in documentation.
3.  Use `Ctrl+Space` (or `Cmd+Space`) in a `.c4x` file to see auto-completion.