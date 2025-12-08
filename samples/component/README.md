# Component Diagrams (Level 3)

**Component diagrams** show the internal structure of a single Container. They detail the "Components" (code modules, controllers, repositories) and how they interact.

## 🌉 API Gateway Internal Structure
Shows the inner workings of an API Gateway container: Auth Middleware, Rate Limiting, Service Registry, and Circuit Breakers.

```c4x
%%{ c4: component }%%
graph TB
    %% External Elements
    WebApp[Web Application<br/>Container<br/>External]
    UserService[User Service<br/>Container<br/>External]
    ProductService[Product Service<br/>Container<br/>External]
    OrderService[Order Service<br/>Container<br/>External]

    %% API Gateway Components Boundary
    subgraph APIGatewayContainer {
        %% Entry Point
        GatewayController[Gateway Controller<br/>Component<br/>Express Router]

        %% Core Components
        AuthMiddleware[Authentication Middleware<br/>Component<br/>JWT Validator]
        RateLimiter[Rate Limiter<br/>Component<br/>Redis-backed]
        RequestRouter[Request Router<br/>Component<br/>Route Matcher]

        %% Service Integration
        ServiceRegistry[Service Registry<br/>Component<br/>Consul Client]
        LoadBalancer[Load Balancer<br/>Component<br/>Round Robin]
        CircuitBreaker[Circuit Breaker<br/>Component<br/>Hystrix]

        %% Observability
        Logger[Request Logger<br/>Component<br/>Winston]
        MetricsCollector[Metrics Collector<br/>Component<br/>Prometheus Client]
        Tracer[Distributed Tracer<br/>Component<br/>OpenTelemetry]

        %% Data Cache
        ResponseCache[Response Cache<br/>Component<br/>Redis]
    }

    %% External to Gateway
    WebApp -->|HTTP Request| GatewayController

    %% Request Flow
    GatewayController -->|Validates token| AuthMiddleware
    GatewayController -->|Checks rate limit| RateLimiter
    GatewayController -->|Matches route| RequestRouter
    GatewayController -->|Logs request| Logger
    GatewayController -->|Records metrics| MetricsCollector
    GatewayController -->|Creates trace| Tracer

    %% Router to Service Integration
    RequestRouter -->|Discovers service| ServiceRegistry
    RequestRouter -->|Selects instance| LoadBalancer
    RequestRouter -->|Protects call| CircuitBreaker
    RequestRouter -->|Checks cache| ResponseCache

    %% Circuit Breaker to Services
    CircuitBreaker -->|Forwards request| UserService
    CircuitBreaker -->|Forwards request| ProductService
    CircuitBreaker -->|Forwards request| OrderService

    %% Response caching
    CircuitBreaker -.->|Caches response| ResponseCache

    %% Error handling
    CircuitBreaker -.->|Logs errors| Logger
    CircuitBreaker -.->|Records failures| MetricsCollector
```

## 🤖 Agent Orchestrator Components
A detailed look inside an AI Agent Orchestrator: Task Planner, Agent Coordinator, and Workflow Engine.

```c4x
%%{ c4: component }%%
graph TB
    %% External Elements
    WebUI[Web Dashboard<br/>Container<br/>External]
    ContentAgent[Content Agent<br/>Container<br/>External]
    StrategyAgent[Strategy Agent<br/>Container<br/>External]
    AnalyticsAgent[Analytics Agent<br/>Container<br/>External]
    MessageQueue[Task Queue<br/>Container<br/>External]

    %% Orchestrator Components Boundary
    subgraph OrchestratorAgentContainer {
        %% API Layer
        OrchestratorAPI[Orchestrator API<br/>Component<br/>FastAPI]

        %% Core Orchestration
        TaskPlanner[Task Planner<br/>Component<br/>LangGraph State Machine]
        AgentCoordinator[Agent Coordinator<br/>Component<br/>Async Task Manager]
        WorkflowEngine[Workflow Engine<br/>Component<br/>Temporal Worker]

        %% Agent Management
        AgentRegistry[Agent Registry<br/>Component<br/>Service Discovery]
        HealthChecker[Health Checker<br/>Component<br/>Heartbeat Monitor]
        LoadBalancer[Agent Load Balancer<br/>Component<br/>Task Distributor]

        %% Memory & Context
        ContextManager[Context Manager<br/>Component<br/>State Persistence]
        ConversationHistory[Conversation History<br/>Component<br/>Vector Store Client]
        TaskTracker[Task Tracker<br/>Component<br/>State Machine]

        %% Observability
        Logger[Activity Logger<br/>Component<br/>Structured Logging]
        MetricsReporter[Metrics Reporter<br/>Component<br/>OpenTelemetry]
        ErrorHandler[Error Handler<br/>Component<br/>Retry Logic]

        %% Message Handlers
        MessagePublisher[Message Publisher<br/>Component<br/>RabbitMQ Client]
        MessageConsumer[Message Consumer<br/>Component<br/>Event Listener]
    }

    %% External to Orchestrator
    WebUI -->|Submits workflow request| OrchestratorAPI

    %% API to Planning
    OrchestratorAPI -->|Creates workflow| TaskPlanner
    OrchestratorAPI -->|Queries status| TaskTracker

    %% Task Planning Flow
    TaskPlanner -->|Breaks down into subtasks| AgentCoordinator
    TaskPlanner -->|Loads context| ContextManager
    TaskPlanner -->|Retrieves history| ConversationHistory
    TaskPlanner -->|Logs decisions| Logger

    %% Agent Coordination
    AgentCoordinator -->|Discovers available agents| AgentRegistry
    AgentCoordinator -->|Checks agent health| HealthChecker
    AgentCoordinator -->|Assigns tasks| LoadBalancer
    AgentCoordinator -->|Tracks execution| TaskTracker

    %% Workflow Execution
    WorkflowEngine -->|Orchestrates steps| AgentCoordinator
    WorkflowEngine -->|Persists state| ContextManager
    WorkflowEngine -->|Handles errors| ErrorHandler

    %% Message Publishing
    LoadBalancer -->|Publishes task| MessagePublisher
    MessagePublisher -->|Sends to queue| MessageQueue

    %% Message Consumption (Results)
    MessageQueue -.->|Receives results| MessageConsumer
    MessageConsumer -.->|Updates task status| TaskTracker
    MessageConsumer -.->|Stores context| ContextManager
    MessageConsumer -.->|Reports metrics| MetricsReporter

    %% Health Monitoring
    HealthChecker -.->|Monitors| ContentAgent
    HealthChecker -.->|Monitors| StrategyAgent
    HealthChecker -.->|Monitors| AnalyticsAgent

    %% Error Recovery
    ErrorHandler -.->|Retries failed tasks| AgentCoordinator
    ErrorHandler -.->|Logs errors| Logger
    ErrorHandler -.->|Reports failures| MetricsReporter
```
