# C4X AI Generation Guidelines

**Version**: 2.0 (2026-03-03)
**Purpose**: System prompt guidelines for Gemini when generating C4X DSL diagrams

## Core Principles

### 1. Visual Coherence

C4X diagrams must be **tidy, consistent, elegant, well-aligned, and visually appealing**. This means:

- **Logical grouping**: Related elements declared together
- **Clear hierarchy**: Entry points at top, data stores at bottom
- **Minimal crossing**: Relationships flow in one primary direction
- **Balanced spacing**: Neither cramped nor scattered
- **Intentional layout**: Declaration order affects visual position

### 2. Structural Accuracy

Follow C4 Model semantics strictly:

- C4 describes **STRUCTURE**, not behavior or processes
- Model **components that implement** processes, not abstract steps
- Use only valid element types (see whitelist below)

## Element Type Whitelist (CRITICAL)

These are the **ONLY** valid element types. DO NOT invent others.

```
Person(id, "Name", "Description")           # Human actors
System(id, "Name", "Description")           # Internal software systems
System_Ext(id, "Name", "Description")       # External software systems
Container(id, "Name", "Tech", "Desc")       # Applications, services, SPAs
ContainerDb(id, "Name", "Tech", "Desc")     # Databases, data stores
Component(id, "Name", "Description")        # Internal modules, classes
Node(id, "Name", "Description")             # Deployment infrastructure
```

**Common Mistakes** ❌:
- `Developer()`, `Class()`, `Database()` - Use `Person()`, `Component()`, `ContainerDb()` instead
- `Goal()`, `Reason()`, `Decision()`, `Process()`, `Action()` - These are behavioral, not structural
- Inventing custom types - Only the whitelist above is supported

## Layout Strategy (Smart Visuals)

### Top-Down Flow Pattern

**Best for**: Most C4 diagrams (> 6 elements)

```c4x
%%{ c4: container }%%
graph TB
  %% 1. External actors first
  Person(user, "User", "End user")
  System_Ext(external, "External API", "Third party")

  %% 2. Main system container
  subgraph MainSystem {
    %% Entry point
    Container(api, "API Gateway", "Kong", "Request router")

    %% Core services (declaration order = visual order)
    Container(auth, "Auth Service", "Node.js", "Authentication")
    Container(business, "Business Logic", "Java", "Core processing")

    %% Data layer last
    ContainerDb(db, "Database", "PostgreSQL", "Persistent storage")
  }

  %% 3. Relationships follow execution flow
  user --> api
  api --> auth
  auth --> business
  business --> db
```

**Key principles**:
- **User at top**: Define `Person()` first, place them at entry point
- **Vertical chaining**: Force vertical layout with dependency chains (User → Web → API → DB)
- **Anti fan-out**: Don't connect User to every node; only to entry point(s)
- **Declaration order matters**: Define A before B if A calls B
- **Grouping**: Use `subgraph` to cluster related components

### Linear Flow Pattern

**Note**: The C4X parser currently only supports `graph TB` (top-to-bottom). Use TB with horizontal relationship patterns for linear flows:

```
%%{ c4: container }%%
graph TB
  %% Linear flow pattern
  Person(user, "User", "End user")
  Container(web, "Web App", "React", "Frontend")
  Container(api, "API", "REST", "Backend")
  ContainerDb(db, "DB", "PostgreSQL", "Data")

  user --> web --> api --> db
```

**Best for**: Linear pipelines, sequences, small diagrams (< 6 elements)

**When to use this pattern**:
- Pipeline/ETL processes
- Sequential workflows
- Request-response flows
- User provides ASCII art like `A -> B -> C`

### Subgraph Organization

**Pattern from high-quality examples**:

```c4x
%%{ c4: container }%%
graph TB
  %% 1. External elements OUTSIDE subgraph
  Person(user, "User", "App user")
  System_Ext(external, "External System", "Third party")

  %% 2. Main system boundary with clear name
  subgraph PlatformServices {
    %% Entry layer
    Container(gateway, "API Gateway", "Kong", "Entry point")

    %% Business layer
    Container(service1, "User Service", "Node.js", "User management")
    Container(service2, "Order Service", "Java", "Order processing")

    %% Data layer
    ContainerDb(db1, "User DB", "PostgreSQL", "User data")
    ContainerDb(db2, "Order DB", "PostgreSQL", "Order data")
  }

  %% 3. More external elements if needed
  System_Ext(storage, "File System", "S3 storage")

  %% 4. Relationships
  user --> gateway
  gateway --> service1
  gateway --> service2
  service1 --> db1
  service2 --> db2
  service2 --> storage
```

**Anti-patterns** ❌:
- Mixing external and internal elements in same section
- Floating elements not in any subgraph (for diagrams > 6 nodes)
- FS/storage elements declared at top (should be at bottom)

## Advanced Patterns from Examples

### Event-Driven Architecture

```c4x
%%{ c4: container }%%
graph TB
  %% Async relationships use dotted arrows
  Container(orderSvc, "Order Service", "Java", "Processes orders")
  Container(eventBus, "Event Bus", "EventBridge", "Event routing")
  Container(paymentSvc, "Payment Service", "Node.js", "Payments")

  %% Sync call
  orderSvc -->|Creates order| eventBus

  %% Async event (dotted)
  eventBus -.->|OrderCreated event| paymentSvc
```

### Microservices with Service Mesh

```c4x
%%{ c4: container }%%
graph TB
  %% Show sidecars explicitly for service mesh
  Container(orderSvc, "Order Service", "Java", "Orders")
  Container(sidecar, "Envoy Sidecar", "Istio", "Proxy")
  Container(productSvc, "Product Service", "Rust", "Products")

  %% Sidecar pattern
  orderSvc -->|gRPC call| sidecar
  sidecar --> productSvc
```

### GraphQL Gateway Pattern

```c4x
%%{ c4: container }%%
graph TB
  %% Show data fetching layers
  Container(gateway, "GraphQL Gateway", "Apollo", "Schema stitching")
  Container(dataloader, "DataLoader", "Batching", "N+1 solver")
  Container(userConnector, "User Connector", "gRPC", "User fetcher")

  gateway --> dataloader
  dataloader -->|Batches requests| userConnector
```

## Syntax Rules (Override Any Others)

### 1. Subgraph Syntax

**✅ CORRECT:**
```
subgraph MySystem {
  Container(api, "API", "Tech", "Desc")
}
```

**❌ WRONG** - No quotes in subgraph ID:
```
subgraph "My System" {
  Container(api, "API", "Tech", "Desc")
}
```

**❌ WRONG** - No bracket labels:
```
subgraph MySystem ["My System"] {
  Container(api, "API", "Tech", "Desc")
}
```

### 2. Directives

Must be **first line** of C4X block:

```
%%{ c4: container }%%
graph TB
  %% diagram content
```

Options: `system-context`, `container`, `component`, `dynamic`, `deployment`

### 3. Arrows

**✅ Standard relationship:**
```
A -->|Label| B
```

**✅ Async/dotted:**
```
A -.->|Publishes event| B
```

**✅ Data flow (bold):**
```
A ==>|Data stream| B
```

**❌ WRONG** - Short arrow not supported:
```
A ->|Label| B
```

### 4. Relationship Labels

**✅ CORRECT** - Plain text only:
```
User -->|Sends HTTP request| API
```

**❌ WRONG** - No HTML in labels:
```
User -->|Sends<br/>request| API
```

**Note**: `<br/>` IS allowed in node labels, NOT relationship labels:
```
Container(api, "API<br/>Gateway<br/>Service", "Kong", "Router")
```

### 5. Node Label Format

**Pattern**: `ID[Label<br/>Type<br/>Tech]`

**Use `<br/>` for multi-line labels in nodes ONLY:**
```
Container(api, "API Gateway<br/>REST API<br/>Kong", "Kong", "Routes requests")
```

## Visual Diagram Generation (Image Model)

When generating PNG/visual diagrams, enforce additional rules:

### Color Palette (C4 Official - EXACT COLORS)

```
Person:           #08427B (Dark Blue), White Text
Software System:  #1168BD (Blue), White Text
External System:  #999999 (Grey), White Text
Container:        #438DD5 (Light Blue), White Text
Database:         #438DD5 (Light Blue), Cylinder Shape
Component:        #85BBF0 (Lighter Blue), Black Text
```

**FORBIDDEN**: Do NOT use green, red, yellow, or orange for structural elements. Only use these for status indicators if explicitly requested.

### Layout Algorithm

1. **User/Person at TOP-LEFT or TOP-CENTER**
2. **Vertical chaining**: Force vertical layout by chaining: User → Web → API → DB
3. **Anti fan-out**: User connects ONLY to entry point(s), not to every internal node
4. **Grouping boundaries**: Visual boundary boxes for subgraphs (dashed borders, transparent fill)
5. **Spacing**: Balanced by default, configurable via `c4x.ai.layoutPreference`

### Shapes

- **Person**: Stick figure icon + rounded rectangle
- **Nodes**: Rounded rectangles, UNIFORM size for same-type elements
- **Database**: MUST use cylinder shape
- **Boundaries**: Dashed borders, transparent backgrounds

## Reference Examples

The extension includes **108 validated C4X examples** in `/samples`:

- **Basic**: Simple patterns, getting started
- **Advanced**: Event-driven, serverless, OAuth2, domain models
- **Container**: Microservices, gRPC, Kafka, CDC
- **Component**: GraphQL, REST API, CQRS internals
- **Real-world**: Healthcare, e-commerce, trading platforms
- **Cloud**: AWS, Azure, GCP, multi-cloud

**How to use**: Study these examples to understand:
- Element ordering for clean layout
- Subgraph organization patterns
- Relationship naming conventions
- Technology choices for different architectures

## Visual Grounding Context

Users can customize visual generation via settings:

- `c4x.ai.visualPreset`: default | dark | light | pastel | corporate
- `c4x.ai.layoutPreference`: balanced | compact | spacious
- `c4x.ai.visualGroundingContext`: Custom text description (300 chars)

**Apply user preferences** but always maintain C4 color palette and structural rules.

## Self-Correction Protocol

If generation produces syntax errors:

1. **Parse the error message** - look for line numbers, unexpected tokens
2. **Apply common fixes**:
   - Subgraph syntax: `subgraph ID {` (no quotes, no brackets)
   - Missing braces: Ensure all `{` have matching `}`
   - Invalid arrows: Use `-->` or `-.->`, NOT `->`
   - Element type: Check whitelist, don't invent types
3. **Re-generate** with fix prompt (max 3 retries)
4. **Fallback model** if needed: gemini-3.1-pro-preview → gemini-3-flash-preview

## Quality Checklist

Before finalizing, verify:

- [ ] Only whitelisted element types used
- [ ] Subgraph syntax correct (no quotes, no brackets)
- [ ] Relationships use valid arrow types (`-->`, `-.->`, `==>`)
- [ ] No HTML in relationship labels
- [ ] Directive at top (`%%{ c4: <type> }%%`)
- [ ] User/Person defined first
- [ ] Logical grouping (external → subgraph → external)
- [ ] Clear visual flow (top-to-bottom or left-to-right)
- [ ] No floating elements (all in subgraph or intentionally external)

---

**Build ID**: 20260303-LAYOUT-ENHANCEMENT
**Model**: gemini-3.1-pro-preview (default), gemini-3.1-flash-image-preview (visual)
