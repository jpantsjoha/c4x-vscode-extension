# C4X-DSL Syntax Reference

**Version**: 1.0.0
**Last Updated**: 2025-12-01

## Overview

C4X-DSL is a Mermaid-inspired language for creating C4 Model diagrams. It provides a simple, text-based way to define elements, relationships, and boundaries for System Context, Container, and Component diagrams.

## Why Use C4X-DSL?

- **Familiarity**: If you know Mermaid, you'll feel right at home.
- **Simplicity**: Create complex diagrams with minimal boilerplate.
- **Offline-First**: Renders instantly in VS Code with no external dependencies.
- **C4-Native**: Designed specifically for the C4 Model, with first-class support for its concepts.

## v1.0 Status & Capabilities

### ✅ **Production Ready**

- **System Context (C1)**: Full support with elements, relationships, and themes.
- **Container & Component**: Full support with visual boundaries (`subgraph`).
- **Element Types**: Person, Software System, Container, Component.
- **Relationship Arrows**: `-->` (sync), `-.->` (async), `==>` (strong).
- **Graph Directions**: `TB`, `BT`, `LR`, `RL`.
- **Tags**: External, Internal, technology tags.
- **Performance**: ~10ms parse time, ~55ms total render.

---

## Core Concepts

A C4X diagram is defined in a `.c4x` file and consists of three main parts:

1. **View Declaration**: Specifies the diagram type (e.g., `system-context`).
2. **Graph Direction**: Sets the layout orientation (e.g., `graph TB` for top-to-bottom).
3. **Diagram Body**: Contains element and relationship definitions.

### Basic Structure

```text
%%{ c4: <view-type> }%%
graph <direction>
    <elements>
    <relationships>
```

---

## View Declaration

The view declaration is a processing instruction that tells the C4X renderer what type of diagram to create.

**Syntax**: `%%{ c4: <view-type> }%%`

### Supported View Types

| View Type | C4 Level | Description | Status |
|---|---|---|---|
| `system-context` | C1 | Shows the system and its interactions with users and other systems. | ✅ **Production** |
| `container` | C2 | Zooms into a system to show its containers (applications, databases, etc.). | ✅ **Production** |
| `component` | C3 | Zooms into a container to show its components. | ✅ **Production** |
| `deployment` | C4 | Shows how software maps to infrastructure. | 🚧 **Preview** |

### Example

```text
%%{ c4: system-context }%%
```

---

## Graph Direction

C4X uses the same graph direction keywords as Mermaid's flowchart diagrams.

**Syntax**: `graph <direction>`

### Supported Directions
C4X supports all Mermaid direction keywords. Choose the one that best fits your narrative:

| Direction | Best For | Description |
|---|---|---|
| `TB` | **Hierarchy** | (Top-Bottom) Default for Context and Container diagrams. Shows structural decomposition. |
| `LR` | **Flow** | (Left-Right) Best for sequences, data pipelines, or process flows. |
| `BT` | **Upstream** | (Bottom-Top) Useful for visualizing dependency inversions. |
| `RL` | **Reverse** | (Right-Left) Rarely used, but available. |

### Guidance: TB vs LR
*   **Use `TB`** when you want to show "What is contained in what?". It naturally represents layers.
*   **Use `LR`** when you want to show "How does data move?". It naturally represents a timeline or pipeline.

### Example
```text
graph LR
```

### Controlling Layout
You can influence the relative positioning of elements by changing the **order of relationship definitions**.
In a `TB` (Top-Bottom) graph:
*   Relationships defined **first** appear on the **left**.
*   Relationships defined **later** appear on the **right**.

**Example**:
```c4x
%%{ c4: container }%%
graph TB
  App[App<br/>Container]
  DB1[DB 1<br/>Container]
  DB2[DB 2<br/>Container]
  
  %% DB1 will be on the LEFT
  App --> DB1
  App --> DB2
```

To swap them, just swap the lines:
```text
  App --> DB2
  App --> DB1
```

Elements are the building blocks of your C4 diagram. They represent people, software systems, containers, or components.

**Syntax**: `ElementID[Label<br/>Type<br/>Tags]`

### Element Properties

- **`ElementID`**: A unique identifier for the element within the diagram. It is not displayed in the diagram itself but is used to define relationships.
- **`Label`**: The display name of the element.
- **`Type`**: The C4 element type.
- **`Tags`** (optional): Additional metadata for styling or grouping.

### Supported Element Types

| Type | C4 Level | Description |
|---|---|---|
| `Person` | C1, C2, C3 | A user of the system. |
| `Software System` | C1, C2, C3 | A high-level software system. |
| `Container` | C2, C3 | A deployable unit like an application or database. |
| `Component` | C3 | A code-level component or module. |

### Tags

Tags provide extra information about an element.

- **`External`**: Marks the element as being outside the scope of the system you are modeling.
- **`Internal`** (default): Marks the element as being inside the system scope.
- You can also add technology tags, like `React` or `PostgreSQL`.

### Examples

#### Basic Person Element

```text
Customer[Customer<br/>Person]
```

#### Software System with External Tag

```text
EmailSystem[Email System<br/>Software System<br/>External]
```

#### Container with Technology

```text
WebApp[Web Application<br/>Container<br/>React]
```

---

## Relationships

Relationships define the interactions between elements.

**Syntax**: `FromID -->|Label| ToID`

### Relationship Properties

- **`FromID`**: The `ElementID` of the source element.
- **`ToID`**: The `ElementID` of the target element.
- **`Label`**: A description of the relationship (e.g., "Uses", "Sends emails to").

### Arrow Types

C4X supports different arrow styles to represent different types of interaction.

| Arrow | Description |
|---|---|
| `-->` | A standard synchronous relationship. |
| `-.->` | An asynchronous relationship. |
| `==>` | A strong dependency or data flow. |

### Examples

#### Synchronous Relationship

```text
Customer -->|Uses| BankingSystem
```

#### Asynchronous Relationship with Technology

```text
WebApp -.->|Sends events to| MessageBus
```

---

## Boundaries / Subgraphs (Containers & Components)

You can group elements into boundaries (representing a System or Container context) using the `subgraph` syntax.

**Syntax**:

```text
subgraph BoundaryID
    Element1[...]
    Element2[...]
end
```

### Example: Container Diagram

```c4x
%%{ c4: container }%%
graph TB
    Customer[Customer<br/>Person]

    subgraph BankingSystem {
        WebApp[Web App<br/>Container]
        API[API<br/>Container]
        Database[DB<br/>Container]
    }

    Customer -->|Uses| WebApp
    WebApp -->|Calls| API
    API -->|Queries| Database
```

---

## Advanced Syntax (v1.2 Preview)

### Deployment Diagrams (Nodes)

Deployment diagrams visualize the mapping of software containers to infrastructure nodes. C4X introduces a `Node` block syntax for recursive nesting.

**Syntax**: `Node(ID, "Label", "Technology") { ... }`

```c4x
%%{ c4: deployment }%%
graph TB
    Node(aws, "AWS", "Cloud") {
        Node(region, "US East", "Region") {
             Container(api, "API", "Java")
        }
    }
```

### Functional Element Definitions

You can also define elements using a functional syntax, similar to other C4 tools.

**Syntax**: `Type(ID, "Label", "Technology", "Description", $tags="...", $sprite="...")`

```c4x
Container(webApp, "Web App", "React", "User Interface", $tags="frontend", $sprite="react")
```

### Key-Value Arguments

Elements now support optional key-value arguments for advanced customization.

- `$tags="tag1, tag2"`: Comma-separated tags.
- `$sprite="icon-name"`: Icon identifier (for future icon support).
- `$code="glob, glob"`: Where a Container or Component lives in source code. See [Code Mapping](#code-mapping-code).

### Code Mapping (`$code`)

A Container or Component can say which source files it owns. The mapping is what
**C4X: Export Architecture Conformance** turns into dependency rules, so a team's CI can check
that the code still has only the dependencies the diagram declares.

**Syntax**: `$code="<glob>[, <glob> ...]"` as a key-value argument.

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(host, "Extension host") {
        Component(entry, "Extension entry", "TypeScript", "Composition root", $code="src/extension.ts")
        Component(parser, "Parsers", "Peggy", "C4X grammar and adapters", $code="src/parser/**")
        Component(core, "Model and layout", "TypeScript", "Shared model", $code="src/{model,layout}/**")
    }
    entry -->|parses with| parser
    parser -->|builds| core
```

Rules:

- **Containers and Components only.** `$code` on a Person, Software System or deployment `Node`
  is a parse error, reported on the element's line.
- **Globs are relative to the workspace root** and use forward slashes. `**` matches any depth,
  `*` one path segment, `?` one character, `{a,b}` either alternative. A path without a
  wildcard, such as `src/extension.ts` or `src/parser`, matches that file or everything below that
  folder.
- **Several globs** are separated by commas. A comma inside `{...}` belongs to its glob, so
  `$code="src/{parser,model}/**"` is one entry.
- Absolute paths, a leading `./`, `..` segments, backslashes and `!` negations are rejected with
  a message naming the entry. So is any character outside letters, digits, spaces and
  `. _ - / * ? { } [ ] , ! @ + ~ ( ) #`, and a glob with more than three wildcards (`*` and `**`
  each count once; more makes matching slow on long paths).
- One `$code` per element: a second `$code` on the same element is a parse error.
- **Overlapping globs.** When two elements' globs match the same file, the glob with the longer
  fixed part before its first wildcard owns it; on a tie, the element declared first does. With
  `$code="src/orders/**"` on one component and `$code="src/orders/pricing.ts"` on another,
  `pricing.ts` belongs only to the second.
- The value must be quoted, because globs contain `/` and `*`.
- Visual editing never changes `$code`. Moving, renaming or relabelling an element in the
  visual editor leaves the attribute byte-for-byte as written.

Hovering over `$code` lists each glob and how many workspace files it matches, so a glob that
matches nothing is visible while you type. Typing `$` inside an element offers `$code`, and
inside its value completion lists the folders and files of the workspace.

**Structurizr DSL**: the same mapping is read from an element's `properties` block:

```text
parser = component "Parsers" {
    properties {
        "code" "src/parser/**"
    }
}
```

Because `code` is an ordinary Structurizr property that a workspace may already use for
something else (`"code" "SYS:001"`), a value C4X cannot use, on a person or software system or
one that is not a valid glob list, is ignored with a warning instead of failing the import.

---

## Complete Examples

### System Context (C1) Diagram

```c4x
%%{ c4: system-context }%%
graph TB
    %% Actors
    Customer[Customer<br/>Person]
    Admin[Administrator<br/>Person]

    %% Systems
    WebApp[E-commerce Website<br/>Software System]
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]
    EmailService[Email Service<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Browses products, makes purchases| WebApp
    Admin -->|Manages products and orders| WebApp
    WebApp -->|Processes payments using| PaymentGateway
    WebApp -.->|Sends order confirmations via| EmailService
```

### Container (C2) Diagram

```c4x
%%{ c4: container }%%
graph TB
    %% External Actors
    Customer[Customer<br/>Person]

    %% E-commerce System Containers
    subgraph EcommerceSystem {
        WebApp[Web Application<br/>Container<br/>React]
        APIServer[API Server<br/>Container<br/>Node.js]
        Database[Customer Database<br/>Container<br/>PostgreSQL]
    }

    %% External Systems
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]
    EmailService[Email Service<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Uses| WebApp
    WebApp -->|Makes API calls to| APIServer
    APIServer -->|Reads/writes to| Database
    APIServer -->|Processes payments with| PaymentGateway
    APIServer -.->|Sends emails via| EmailService
```