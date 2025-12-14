# C4X Layout Guide

> [!NOTE]
> **Can't see the diagrams?**
> You need the **[C4X VS Code Extension](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x-vscode-extension)** to view the live visualizations below. Otherwise, you'll only see the source code.
>
> [!IMPORTANT]
> **Requires C4X v1.1.0+**
> The features described here (Manual Positioning, Nested Directions) require the latest version of the extension.

This guide demonstrates how to use the advanced layout control features introduced in C4X v1.1.0.

## 1. Nested Direction Control
Mix and match layout directions used `direction LR` (Left-Right) or `direction TB` (Top-Bottom) inside subgraphs. This is ideal for visualizing sequences or workflows within a structural container.

### Example: Horizontal Flow in a Vertical System

#### Code
```
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  
  subgraph System {
    direction LR
    Step1[Step 1<br/>Component]
    Step2[Step 2<br/>Component]
    Step3[Step 3<br/>Component]
    
    Step1 --> Step2
    Step2 --> Step3
  }
  
  User --> Step1
```

#### Result
```c4x
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  
  subgraph System {
    direction LR
    Step1[Step 1<br/>Component]
    Step2[Step 2<br/>Component]
    Step3[Step 3<br/>Component]
    
    Step1 --> Step2
    Step2 --> Step3
  }
  
  User --> Step1
```

---

## 2. Manual Positioning (Overrides)
For precise control, you can use `$x` and `$y` attributes to enforce coordinates.

### Example: Custom Placement

#### Code
```
graph TB
  %% Manually place nodes
  A[Node A<br/>Container<br/>$x="50"<br/>$y="50"]
  B[Node B<br/>Container<br/>$x="400"<br/>$y="50"]
  C[Node C<br/>Container<br/>$x="225"<br/>$y="300"]
  
  A --> C
  B --> C
```

#### Result
```c4x
graph TB
  A[Node A<br/>Container<br/>$x="50"<br/>$y="50"]
  B[Node B<br/>Container<br/>$x="400"<br/>$y="50"]
  C[Node C<br/>Container<br/>$x="225"<br/>$y="300"]
  
  A --> C
  B --> C
```

---

## 3. Complex Mixed Layout
This example combines **Top-Down** system context with **Left-Right** data flows deep inside the infrastructure, plus some manual nudging for annotations.

### Code
```
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  
  subgraph Cloud {
    %% The Cloud is huge, let's keep it vertical
    direction TB
    LB[Load Balancer<br/>Container]
    
    subgraph Services {
      %% Services flow horizontally pipeline-style
      direction LR
      S1[Ingest<br/>Component]
      S2[Process<br/>Component]
      S3[Store<br/>Component]
      S1 --> S2
      S2 --> S3
    }
    

  }
  
  %% Manual Note
  Note[Important Note<br/>Component<br/>$x="600"<br/>$y="100"]
  
  User --> LB
  LB --> S1

```

### Result
```c4x
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  
  subgraph Cloud {
    direction TB
    LB[Load Balancer<br/>Container]
    
    subgraph Services {
      direction LR
      S1[Ingest<br/>Component]
      S2[Process<br/>Component]
      S3[Store<br/>Component]
      S1 --> S2
      S2 --> S3
    }
    

  }
  
  Note[Important Note<br/>Component<br/>$x="600"<br/>$y="100"]
  
  User --> LB
  LB --> S1
```

---

## 4. Multi-Agent System (Marketing)
This example demonstrates a complex **Multi-Agent Architecture** where independent agents collaborate using a shared memory. It showcases **nested directions** (Core loop vs System flow) and uses specific icons for different agent roles.

### Concept
1. **Trend Watcher** scans the web (Top-Down).
2. **Strategy Agent** & **Creative Agent** iterate on content (Left-Right loop).
3. **Shared Memory** is central to all agents.
4. **Output** is generated for the User.

### Code
```code
%%{ c4: container }%%
graph TB
  %% External Actors
  User[Marketing Manager<br/>Person]
  Web[Web Sources<br/>System]
  
  subgraph AgentSystem {
    direction TB
    
    %% Shared State
    Memory[Vector Database<br/>ContainerDb]
    
    subgraph AgentLoop {
      %% The internal collaboration happens in a loop
      direction LR
      
      Trend[Trend Watcher<br/>Container<br/>technology="Python"]
      Strategy[Strategy Agent<br/>Container<br/>technology="LangChain"]
      Creative[Creative Agent<br/>Container<br/>technology="OpenAI"]
      
      Trend --> Strategy
      Strategy --> Creative
      Creative --> Strategy
    }
    
    %% Memory Access
    Trend -->|Writes| Memory
    Strategy -->|Reads/Writes| Memory
    Creative -->|Reads| Memory
    
    %% Output
    Report[Campaign Report<br/>Container]
    Creative --> Report
  }
  
  %% Data Flow
  Web -->|Crawls| Trend
  User -->|Triggers| Trend
  Report -->|Delivered to| User
```

### Result
```c4x
%%{ c4: container }%%
graph TB
  %% External Actors
  User[Marketing Manager<br/>Person]
  Web[Web Sources<br/>System]
  
  subgraph AgentSystem {
    direction TB
    
    %% Shared State
    Memory[Vector Database<br/>ContainerDb]
    
    subgraph AgentLoop {
      %% The internal collaboration happens in a loop
      direction LR
      
      Trend[Trend Watcher<br/>Container<br/>technology="Python"]
      Strategy[Strategy Agent<br/>Container<br/>technology="LangChain"]
      Creative[Creative Agent<br/>Container<br/>technology="OpenAI"]
      
      Trend --> Strategy
      Strategy --> Creative
      Creative --> Strategy
    }
    
    %% Memory Access
    Trend -->|Writes| Memory
    Strategy -->|Reads/Writes| Memory
    Creative -->|Reads| Memory
    
    %% Output
    Report[Campaign Report<br/>Container]
    Creative --> Report
  }
  
  %% Data Flow
  Web -->|Crawls| Trend
  User -->|Triggers| Trend
  Report -->|Delivered to| User
```

---

## 5. Basic Layout Control
The global layout direction is controlled by `graph TB` (Top-Bottom) or `graph LR` (Left-Right) at the start of your diagram.

### Vertical (Default)
Standard hierarchy. Best for > 4 nodes.

```c4x
%%{ c4: system-context }%%
graph TB
  User[User<br/>Person]
  System[Banking System<br/>System]
  Mail[Email System<br/>System]
  
  User --> System
  System --> Mail
```

### Horizontal (Forced)
Use `graph LR` to force a Left-to-Right flow. Best for simple 3-node chains.

```c4x
%%{ c4: system-context }%%
graph LR
  User[User<br/>Person]
  System[Banking System<br/>System]
  Mail[Email System<br/>System]
  
  User --> System
  System --> Mail
```
