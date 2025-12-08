# Enterprise AI Agent Platform - Architecture Definition
**Status**: APPROVED | **Date**: 2025-12-05 | **Owner**: Architecture Team

## 1. Executive Summary

This document defines the architecture for the new "GenAI Customer Agent". Ideally, this single Markdown file lives in your git repository alongside the code, serving as the "Single Source of Truth".

## 2. System Context
The system interacts with external customers and leverages Cloud AI services.

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer", "Online User", $sprite="person")
    System(agent, "AI Agent", "Handles inquiries")
    System_Ext(crm, "CRM", "Salesforce", $sprite="cloud")
    
    customer --> agent
    agent --> crm
```

## 3. Deployment Architecture (AWS)

We utilize a serverless architecture on AWS to minimize operational overhead.

### Key Decisions
*   **Compute**: ECS Fargate for containerized services.
*   **AI/LLM**: Amazon Bedrock for managed LLM access.
*   **Storage**: S3 for document ingestion.

```c4x
%%{ c4: deployment }%%
graph TB
    Node(aws, "AWS Cloud", "us-east-1", "Production", $sprite="aws") {
        
        Node(vpc, "VPC", "10.0.0.0/16", $sprite="cloud") {
            
            Node(ecs, "ECS Cluster", "Fargate", $sprite="aws-ecs") {
                Container(api, "Agent API", "Python/FastAPI", "Orchestrator", $sprite="container")
            }
            
            Node(data, "Data Tier", "Private Subnet") {
                Container(db, "Session Store", "DynamoDB", "History", $sprite="aws-dynamodb")
                Container(vector, "Vector Search", "OpenSearch", "RAG Index", $sprite="aws-opensearch-service")
            }
        }
        
        Node(ai, "AI Services", "Managed") {
            Container(bedrock, "Bedrock", "Claude 3.5", "LLM", $sprite="aws-bedrock")
        }
    }
    
    api --> db
    api --> vector
    api --> bedrock
```

## 4. UI Mockups & Screenshots

You can also embed standard images (like screenshots of the UI or whiteboard sketches) directly in this document to provide context that diagrams cannot capture.

> **Note**: This is how you would embed your screenshot file:
> `![UI Mockup](./screenshots/ui-mockup.png)`

## 5. Sequence Flow (Dynamic)

How the agent processes a user request:

```c4x
%%{ c4: dynamic }%%
graph LR
    Person(user, "User")
    Container(api, "API")
    Container(llm, "LLM")
    
    user -->|1. Message| api
    api -->|2. Prompt| llm
    llm -.->|3. Response| api
    api -.->|4. Reply| user
```
