# C4X Validation Gallery

This file contains various C4 diagram patterns to stress-test the layout and rendering engine.

## Case 1: Simple Vertical Stack (The "Happy Path")

Expected: Arrow should go from Bottom-Center of Customer to Top-Center of BankingSystem.

```c4x
%%{ c4: system-context }%%
graph TB
    Customer[Customer<br/>Person]
    Banking[Banking System<br/>Software System]

    Customer -->|Uses| Banking
```

## Case 2: Simple Horizontal Row

Expected: Arrow should go from Right-Center of A to Left-Center of B.

```c4x
%%{ c4: system-context }%%
graph LR
    A[System A<br/>Software System]
    B[System B<br/>Software System]

    A -->|Calls| B
```

## Case 3: Three-Tier Vertical

Expected: Straight vertical line down the middle.

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]
    WebApp[Web App<br/>Container]
    DB[Database<br/>Container]

    User -->|Visits| WebApp
    WebApp -->|Reads/Writes| DB
```

## Case 4: One-to-Many (Fan Out)

Expected: User connects to both systems. Arrows should be clean.

```c4x
%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    SysA[System A<br/>Software System]
    SysB[System B<br/>Software System]

    User -->|Uses| SysA
    User -->|Uses| SysB
```

## Case 5: Many-to-One (Fan In)

Expected: Both systems connect to Database.

```c4x
%%{ c4: container }%%
graph TB
    App1[App 1<br/>Container]
    App2[App 2<br/>Container]
    DB[Shared DB<br/>Container]

    App1 -->|Persists| DB
    App2 -->|Persists| DB
```

## Case 6: Cycle / Bidirectional

Expected: Separate arrows for each direction, ideally spaced.

```c4x
%%{ c4: system-context }%%
graph TB
    SysA[System A<br/>Software System]
    SysB[System B<br/>Software System]

    SysA -->|Requests| SysB
    SysB -->|Responses| SysA
```

## Case 7: Nested Boundary (Complex)

Expected: Arrows should cross boundary cleanly.

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]
    
    subgraph BankingSystem {
        WebApp[Web App<br/>Container]
        API[API<br/>Container]
    }

    User -->|Uses| WebApp
    WebApp -->|Calls| API
```

## Case 8: PlantUML C4 Diagram

Expected: PlantUML C4 diagram should render correctly without server.

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

Person(customer, "Customer", "A banking customer")
System(banking, "Banking System", "Core banking platform")
System_Ext(email, "Email System", "External email service")

Rel(customer, banking, "Uses", "HTTPS")
Rel(banking, email, "Sends notifications", "SMTP")

@enduml
```
