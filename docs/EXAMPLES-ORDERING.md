# Examples: Ordering & Layout Control

Because C4X uses a deterministic layout engine (Dagre), the **order** in which you define elements and relationships can significantly impact the visual result. This guide demonstrates how to use this behavior to "nudge" your diagrams into the desired shape.

## 1. Controlling Horizontal Order (Left-to-Right)
In a Top-Down (`graph TB`) diagram, sibling nodes are ordered based on the **definition order of their relationships**.

### The Rule
> "First defined relationship goes Left. Later defined relationships go Right."

### Example A: Default Order
Here, we define the relationship to **DB 1** first. Consequently, **DB 1** appears on the **left**.

````markdown
```c4x
%%{ c4: container }%%
graph TB
    App[App<br/>Container]
    DB1[DB 1<br/>Container]
    DB2[DB 2<br/>Container]

    %% "App -> DB1" is first -> DB1 is Left
    App --> DB1
    App --> DB2
```

````
### Result (Simulated)
### Result
```c4x
%%{ c4: container }%%
graph TB
    App[App<br/>Container]
    DB1[DB 1<br/>Container]
    DB2[DB 2<br/>Container]

    %% "App -> DB1" is first -> DB1 is Left
    App --> DB1
    App --> DB2
```

### Example B: Swapped Order
By simply swapping the relationship lines, we force **DB 2** to the **left**.

````markdown
```c4x
%%{ c4: container }%%
graph TB
    App[App<br/>Container]
    DB1[DB 1<br/>Container]
    DB2[DB 2<br/>Container]

    %% "App -> DB2" is first -> DB2 is Left
    App --> DB2
    App --> DB1
```
````
### Result (Simulated)
### Result
```c4x
%%{ c4: container }%%
graph TB
    App[App<br/>Container]
    DB1[DB 1<br/>Container]
    DB2[DB 2<br/>Container]

    %% "App -> DB2" is first -> DB2 is Left
    App --> DB2
    App --> DB1
```

## 2. Controlling Vertical Rank
The engine layers elements based on dependencies. `A --> B` always puts `B` **below** `A` (in `TB` mode).

To force elements to be side-by-side (same rank) instead of stacked:
1.  **Do not link them directly.**
2.  **Link them to the same parent.** (As seen above).
3.  **Use `subgraph`** to group them visually.

## 3. Nested Subgraphs
Elements inside a `subgraph` are clustered together. Use subgraphs to prevent elements from "drifting" too far apart during auto-layout.

````markdown
```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]
    
    subgraph BackendSystem {
        API[API<br/>Container]
        DB[Database<br/>Container]
    }

    User --> API
    API --> DB
```
````
