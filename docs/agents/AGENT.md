# C4X Agent Guide - AI-Powered C4 Diagram Generation
> Status (2025-11-24): Guide content is broadly applicable; some examples reference future capabilities. For current repository state and E2E plan, see `docs/STATUS.md` and `docs/ROADMAP.md`.

> **For AI Agents**: This guide helps you generate accurate C4 Model diagrams using the C4X VS Code extension.

## Table of Contents

1. [C4 Model Overview](#c4-model-overview)
2. [When to Use Each Level](#when-to-use-each-level)
3. [DSL Format Selection](#dsl-format-selection)
4. [C4X-DSL Syntax Guide](#c4x-dsl-syntax-guide)
5. [PlantUML C4 Syntax Guide](#plantuml-c4-syntax-guide)
6. [Structurizr DSL Syntax Guide](#structurizr-dsl-syntax-guide)
7. [Common Patterns](#common-patterns)
8. [Best Practices](#best-practices)
9. [Sample Reference](#sample-reference)
10. [Agent Workflow](#agent-workflow)

---

## C4 Model Overview

The C4 model uses a hierarchical set of diagrams to describe software architecture at different levels of abstraction:

```
Level 1: System Context    → Who uses the system and what it integrates with
Level 2: Container          → Applications, services, databases within the system
Level 3: Component          → Components within a container
Level 4: Code               → Classes/functions (not visualized in C4X)
```

### Key Concepts

- **Person**: Human users (internal or external)
- **Software System**: High-level system (yours or external)
- **Container**: Runnable/deployable unit (web app, API, database, mobile app)
- **Component**: Grouping of related functionality (controller, service, repository)
- **Relationship**: Interaction between elements (uses, calls, reads, writes)

---

## When to Use Each Level

### Level 1: System Context Diagram

**Use when**:
- Showing system's place in the world
- Identifying external dependencies
- Explaining system to non-technical stakeholders
- Starting a new architecture discussion

**Shows**:
- Your system as a box
- People who use it
- Other systems it integrates with
- High-level relationships

**Example scenario**: "Show me how the E-commerce System interacts with external services"

### Level 2: Container Diagram

**Use when**:
- Showing high-level technical building blocks
- Explaining deployment architecture
- Discussing technology choices
- Planning microservices architecture

**Shows**:
- Applications (web, mobile, desktop)
- APIs and services
- Databases and data stores
- Message queues and brokers
- Technology stack for each container

**Example scenario**: "Show me the containers in the Banking System"

### Level 3: Component Diagram

**Use when**:
- Showing internal structure of a container
- Explaining code organization
- Discussing component responsibilities
- Planning refactoring

**Shows**:
- Components within a container
- Component responsibilities
- Dependencies between components
- Internal architecture patterns

**Example scenario**: "Show me the components in the API Gateway container"

---

## DSL Format Selection

### C4X-DSL (.c4x) - **RECOMMENDED**

**Strengths**:
- ✅ 100% working, production-ready
- ✅ Mermaid-inspired syntax (familiar to developers)
- ✅ Fastest rendering (10ms parse time)
- ✅ 100% test coverage
- ✅ Simplest syntax

**Use when**:
- User wants "Mermaid-like" syntax
- Speed is critical
- Creating new diagrams from scratch

**File extension**: `.c4x`

### PlantUML C4 (.puml) - **RECOMMENDED**

**Strengths**:
- ✅ 100% working, production-ready
- ✅ Official PlantUML C4 macro compatibility
- ✅ No Java required (unlike standard PlantUML)
- ✅ 100% test coverage
- ✅ Rich feature set (boundaries, all relationship types)

**Use when**:
- User has existing PlantUML C4 diagrams
- User prefers PlantUML syntax
- Need advanced features (boundaries, directional relationships)

**File extension**: `.puml`

### Structurizr DSL (.dsl) - **EXPERIMENTAL**

**Strengths**:
- ⚠️ 58% support (experimental)
- ⚠️ Basic features work, advanced features incomplete
- ✅ Official Structurizr DSL syntax

**Use when**:
- User specifically requests Structurizr DSL
- Migrating from Structurizr
- **Warn user**: Experimental, some features may not work

**File extension**: `.dsl`

---

## ⚠️ v1.0 Reality Check for AI Agents

### What ACTUALLY Works
- ✅ **C4X System Context**: 100% production-ready, 10ms parse time
- ✅ **PlantUML C4**: 100% production-ready, includes boundaries
- ✅ **All Relationship Types**: `-->`, `-.->`, `==>` with proper labels
- ✅ **5 Built-in Themes**: Classic, Modern, Muted, High Contrast, Auto
- ✅ **Export**: SVG, PNG, clipboard - all working

### What Has Limitations
- ⚠️ **C4X Container/Component**: Parse successfully but render as flat layouts (no boundaries)
- ⚠️ **Structurizr DSL**: 58% support, experimental

### Critical Agent Guidelines
1. **For System Context**: Use C4X format - fastest and most reliable
2. **For Container/Component with boundaries**: Use PlantUML C4 format
3. **For Container/Component with C4X**: Use comments to indicate grouping, warn user about flat layout
4. **Never promise boundaries** in C4X unless specifically using PlantUML

**Example Safe C4X Container**:
```c4x
%%{ c4: container }%%
graph TB
    %% Frontend Layer
    WebApp[Web App<br/>Container<br/>React]

    %% Backend Layer
    API[API<br/>Container<br/>Node.js]

    WebApp -->|Calls| API
```

---

## C4X-DSL Syntax Guide

### Basic Structure

```text
%%{ c4: system-context }%%
graph TB
    ElementID[Label<br/>Type<br/>Tags]

    ElementID -->|Relationship Label| OtherElementID
```

### Element Declaration

```c4x
CustomerID[Customer Name<br/>Person]
SystemID[System Name<br/>Software System]
ContainerID[Container Name<br/>Container<br/>Internal]
ComponentID[Component Name<br/>Component]
```

**Element Types**:
- `Person` - Human user
- `Software System` - External or internal system
- `Container` - Application, service, database
- `Component` - Code component

**Tags** (optional, third line):
- `External` - External system/person
- `Internal` - Internal element (default)
- Custom tags for styling

### Relationships

```text
From -->|Uses| To              # Synchronous
From -.->|Async call| To       # Asynchronous
From ==>|Strong dependency| To  # Strong/required
```

### View Types

```c4x
%%{ c4: system-context }%%  %% Level 1 - System Context (full support)
%%{ c4: container }%%        %% Level 2 - Container (flat layout, no boundaries yet)
%%{ c4: component }%%        %% Level 3 - Component (flat layout, no boundaries yet)
```

**Note**: All view types parse successfully, but `container` and `component` currently render as flat layouts without visual boundaries. Use comments to indicate logical grouping.

### Complete Example: System Context

```c4x
%%{ c4: system-context }%%
graph TB
    %% People
    Customer[Customer<br/>Person]
    Admin[Admin<br/>Person]

    %% Systems
    Banking[Banking System<br/>Software System]
    Email[Email System<br/>Software System<br/>External]
    Mainframe[Mainframe<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Uses| Banking
    Admin -->|Manages| Banking
    Banking -->|Sends emails via| Email
    Banking -->|Gets data from| Mainframe
```

---

## PlantUML C4 Syntax Guide

### Basic Structure

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

' Elements
Person(id, "Label", "Description")
System(id, "Label", "Description")

' Relationships
Rel(from, to, "Label", "Technology")

@enduml
```

### Element Macros

**People**:
```text
Person(customer, "Customer", "Banking customer")
Person_Ext(admin, "Admin", "External administrator")
```

**Systems**:
```text
System(banking, "Banking System", "Core banking")
System_Ext(email, "Email System", "External email")
SystemDb(mainframe, "Mainframe", "Legacy database")
```

**Containers**:
```text
Container(web, "Web App", "React", "Frontend")
Container(api, "API", "Node.js", "Backend")
ContainerDb(db, "Database", "PostgreSQL", "Data store")
```

**Components**:
```text
Component(controller, "Controller", "Express", "HTTP handler")
Component(service, "Service", "Node.js", "Business logic")
ComponentDb(cache, "Cache", "Redis", "Session cache")
```

### Boundaries

```text
System_Boundary(boundary_id, "System Name") {
    Container(web, "Web App", "React", "Frontend")
    Container(api, "API", "Node.js", "Backend")
}
```

### Relationships

```text
Rel(from, to, "Uses", "HTTPS")
Rel_Back(to, from, "Returns data", "JSON")
Rel_Neighbor(from, to, "Calls", "gRPC")

' Directional
Rel_D(from, to, "Calls")  # Down
Rel_U(from, to, "Returns") # Up
Rel_L(from, to, "Uses")    # Left
Rel_R(from, to, "Queries") # Right
```

### Complete Example: Container Diagram

```plantuml
@startuml Banking System
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(customer, "Customer", "Banking customer")
System_Ext(email, "Email System", "External email")

System_Boundary(banking, "Banking System") {
    Container(web, "Web App", "React", "Frontend")
    Container(api, "API", "Node.js", "Backend")
    ContainerDb(db, "Database", "PostgreSQL", "Data store")

    Rel(web, api, "Makes API calls", "JSON/HTTPS")
    Rel(api, db, "Reads/writes", "SQL")
}

Rel(customer, web, "Uses", "HTTPS")
Rel(api, email, "Sends emails", "SMTP")

@enduml
```

---

## Structurizr DSL Syntax Guide

**⚠️ Note**: Structurizr DSL support is experimental (58%). Basic features work, advanced features may fail.

### Basic Structure

```text
workspace "Name" {
    model {
        # Elements
        person = person "Customer"
        system = softwareSystem "Banking System"

        # Relationships
        person -> system "Uses"
    }

    views {
        systemContext system {
            include *
        }
    }
}
```

### Complete Example: System Context

```text
workspace "E-commerce Platform" {
    model {
        # People
        customer = person "Customer"
        admin = person "Administrator"

        # Systems
        ecommerce = softwareSystem "E-commerce System" {
            web = container "Web Application"
            api = container "API"
            db = container "Database"
        }

        payment = softwareSystem "Payment Gateway"
        email = softwareSystem "Email Service"

        # Relationships
        customer -> web "Browses products"
        admin -> web "Manages inventory"
        web -> api "Makes API calls"
        api -> db "Reads/writes data"
        api -> payment "Processes payments"
        api -> email "Sends notifications"
    }

    views {
        systemContext ecommerce {
            include *
        }

        container ecommerce {
            include *
        }
    }
}
```

---

## Common Patterns

### Pattern 1: Web Application with Database

**C4X**:
```c4x
%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    WebApp[Web Application<br/>Software System]
    DB[Database<br/>Software System<br/>External]

    User -->|Uses| WebApp
    WebApp -->|Reads/writes| DB
```

**PlantUML**:
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(user, "User")
Container(web, "Web App", "React")
ContainerDb(db, "Database", "PostgreSQL")

Rel(user, web, "Uses", "HTTPS")
Rel(web, db, "Queries", "SQL")
@enduml
```

### Pattern 2: Microservices Architecture

**C4X**:
```c4x
%%{ c4: container }%%
graph TB
    API[API Gateway<br/>Container]
    Auth[Auth Service<br/>Container]
    Orders[Orders Service<br/>Container]
    Payments[Payments Service<br/>Container]

    API -->|Routes requests| Auth
    API -->|Routes requests| Orders
    API -->|Routes requests| Payments
    Orders -->|Processes payment| Payments
```

### Pattern 3: External Integrations

**PlantUML**:
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

System(mySystem, "My System")
System_Ext(email, "Email Service", "SendGrid")
System_Ext(payment, "Payment Gateway", "Stripe")
System_Ext(analytics, "Analytics", "Google Analytics")

Rel(mySystem, email, "Sends emails", "API")
Rel(mySystem, payment, "Processes payments", "API")
Rel(mySystem, analytics, "Tracks events", "JavaScript")
@enduml
```

---

## Best Practices

### Element Naming

✅ **Good**:
- `Customer`, `Administrator`, `BackOfficeStaff`
- `BankingSystem`, `EmailService`, `PaymentGateway`
- `WebApplication`, `APIGateway`, `Database`

❌ **Bad**:
- `user1`, `sys`, `db`
- Generic names without context

### Relationship Labels

✅ **Good**:
- `"Views products and places orders"`
- `"Processes payments using"`
- `"Reads customer data from"`

❌ **Bad**:
- `"Uses"`
- `"Calls"`
- `"Connects to"`

### Technology Stack (Container Level)

Always include technology in container descriptions:

✅ **Good**:
```plantuml
Container(web, "Web App", "React 18, TypeScript", "User interface")
Container(api, "API", "Node.js, Express", "REST API")
ContainerDb(db, "Database", "PostgreSQL 15", "Persistent storage")
```

### View Selection

1. **Start with System Context** for new discussions
2. **Move to Container** when discussing architecture
3. **Use Component** only when needed (complexity)

---

## Sample Reference

All examples are available in the `samples/` folder:

### System Context Examples
- `samples/system-context/banking-system.c4x`
- `samples/system-context/banking-system.puml`
- `samples/system-context/ecommerce-system.c4x`
- `samples/system-context/ecommerce-system.puml`
- `samples/system-context/microservices-system.c4x`

### Container Examples
- `samples/container/banking-containers.puml`
- `samples/container/ecommerce-containers.c4x`
- `samples/container/microservices-containers.puml`

### Component Examples
- `samples/component/api-components.c4x`
- `samples/component/api-components.puml`

### Real-World Examples
- `samples/real-world/banking-full.puml` (System Context + Container)
- `samples/real-world/ecommerce-full.c4x` (Complete platform)
- `samples/real-world/microservices-full.c4x` (Modern architecture)

### Markdown Preview Files
- `samples/PREVIEW.md` (All examples with live rendering)

---

## Agent Workflow

### When User Requests a C4 Diagram

**Step 1: Understand the Context**

Ask clarifying questions:
1. What level? (System Context, Container, Component)
2. What system/domain?
3. What DSL format? (C4X recommended for new diagrams)
4. Who are the users?
5. What are the external dependencies?

**Step 2: Choose the Right Level**

```
User says → Use this level
─────────────────────────────
"How does X interact with other systems?" → System Context
"What's the architecture of X?" → Container
"Show me internal structure of X" → Component
"High-level overview" → System Context
```

**Step 3: Select DSL Format**

```
Situation → Use this format
──────────────────────────────
New diagram → C4X (.c4x)
User has PlantUML files → PlantUML (.puml)
User prefers Mermaid syntax → C4X (.c4x)
Speed is critical → C4X (.c4x)
Advanced features needed → PlantUML (.puml)
User requests Structurizr → .dsl (warn: experimental)
```

**Step 4: Generate the Diagram**

Use the appropriate syntax guide from this document.

**Step 5: Reference Samples**

Point user to similar examples:
```
"I've created a System Context diagram similar to samples/system-context/banking-system.c4x"
"For more examples, see samples/PREVIEW.md"
```

**Step 6: Test and Iterate**

1. User opens file in VS Code
2. User presses `Ctrl+K V` (or `Cmd+K V` on Mac)
3. Diagram renders in preview pane
4. Iterate based on user feedback

### Visual Validation (Agent Skill)

If you are modifying the **rendering engine** (`SvgBuilder.ts`) or **layout logic** (`DagreLayoutEngine.ts`), you must perform visual validation:

1.  **Run the validation suite**:
    ```bash
    npx ts-node scripts/validate-gallery.ts
    ```
2.  **Analyze the output**:
    - Check terminal output for `✅ PASS` or `❌ FAIL`.
    - If failed, inspect `docs/validation/report.html` to see *why* arrows are misaligned.
    - The suite performs geometric assertions (e.g., "Arrow must originate from Bottom-Center for vertical stacks").

This ensures you don't introduce visual regressions like "messy arrows" or "diagonal routing" for simple stacks.

---

## Example Agent Prompts

### Prompt 1: Generate System Context

```
User: "Show me how our e-commerce system interacts with external services"

Agent Response:
I'll create a System Context diagram showing your e-commerce system and its external integrations.

[Creates samples/my-ecommerce-system.c4x with System Context]

You can open this file in VS Code and press Ctrl+K V to see the preview.
Similar examples: samples/system-context/ecommerce-system.c4x
```

### Prompt 2: Generate Container Diagram

```
User: "I need to show the architecture of our banking system with databases and APIs"

Agent Response:
I'll create a Container diagram showing the high-level architecture of your banking system.

[Creates samples/my-banking-containers.puml with Container diagram]

This uses PlantUML C4 syntax for rich features like boundaries.
Press Ctrl+K V to preview. No Java required!
Similar examples: samples/container/banking-containers.puml
```

### Prompt 3: Convert Between Formats

```
User: "Convert this PlantUML diagram to C4X format"

Agent Response:
I'll convert your PlantUML C4 diagram to C4X format:

[Reads PlantUML, converts to C4X syntax]

The C4X format is simpler and renders faster (10ms vs 6.5ms parse time).
Both formats are 100% supported and production-ready.
```

---

## Common User Scenarios

### Scenario 1: New Architecture Documentation

**User**: "I'm documenting our new microservices architecture"

**Agent Actions**:
1. Ask: "What level? System Context or Container?"
2. Recommend: Container level for microservices
3. Choose: C4X format (fast, simple)
4. Generate: Container diagram with services
5. Reference: `samples/real-world/microservices-full.c4x`

### Scenario 2: Existing PlantUML Migration

**User**: "We have PlantUML diagrams, can we preview them here?"

**Agent Actions**:
1. Explain: C4X supports PlantUML C4 natively
2. Note: No Java required (unlike standard PlantUML)
3. Test: Ask user to open `.puml` file and preview
4. Reference: `samples/container/banking-containers.puml`

### Scenario 3: Quick System Overview

**User**: "Quick diagram showing how users interact with our system"

**Agent Actions**:
1. Choose: System Context (quickest)
2. Format: C4X (fastest rendering)
3. Generate: Basic System Context with user + system + externals
4. Reference: `samples/system-context/banking-system.c4x`

---

## Error Handling

### Common Errors and Fixes

**Error**: "Insufficient parameters for Person on line X"
**Fix**: Ensure element syntax is correct:
```text
✅ Customer[Customer Name<br/>Person]
❌ Customer[Customer]
```

**Error**: "Unsupported C4 view type"
**Fix**: Only `system-context` is fully supported:
```text
✅ %%{ c4: system-context }%%
❌ %%{ c4: container }%%  # Coming in v1.1
```

**Error**: "Preview not rendering"
**Fix**:
1. Ensure file extension is `.c4x`, `.puml`, or `.dsl`
2. Press `Ctrl+K V` (or `Cmd+K V`) to open preview
3. Check for syntax errors in the diagram

---

## Performance Expectations

| DSL Format | Parse Time | Test Coverage | Status |
|------------|-----------|---------------|---------|
| C4X (.c4x) | ~10ms | 100% (122/122) | ✅ Production |
| PlantUML (.puml) | ~6.5ms | 100% (58/58) | ✅ Production |
| Structurizr (.dsl) | ~15ms | 58% (57/99) | ⚠️ Experimental |

**Rendering Performance**:
- Full preview render: ~55ms (for 30-node diagram)
- Target: < 250ms
- Achievement: 78% faster than target

---

## Version Notes

- **v1.0**: C4X and PlantUML C4 are production-ready
- **v1.1 (planned)**: Full Markdown rendering, Structurizr DSL 100% support, Container/Component views

---

## Resources

- **C4 Model Official**: <https://c4model.com/>
- **PlantUML C4**: <https://github.com/plantuml-stdlib/C4-PlantUML>
- **Structurizr DSL**: <https://structurizr.com/dsl>
- **Extension Docs**: See README.md and docs/

---

**For Agents**: Always reference `samples/` folder for examples and patterns. When in doubt, use C4X format for System Context diagrams - it's the fastest and most reliable option.
