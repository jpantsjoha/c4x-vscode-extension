# C4X Markdown Preview Test

This file tests the embedded C4X diagram rendering in VS Code's Markdown preview.

## System Context Diagram

```c4x
Person(user, "User", "A user of the system")
System(sys, "My System", "The system being described")
System_Ext(ext, "External System", "An external dependency")
user --> sys : "Uses"
sys --> ext : "Calls API"
```

## Should render above as an SVG diagram.

If the diagram renders correctly, you should see:
- A person shape labeled "User"
- A blue box labeled "My System"
- A grey box labeled "External System"
- Arrows connecting them with labels

## Container Diagram (with attributes)

```c4x width=80%
Person(dev, "Developer", "Writes code")
System_Boundary(platform, "Platform") {
  Container(api, "API Gateway", "Node.js", "Routes requests")
  Container(db, "Database", "PostgreSQL", "Stores data")
}
dev --> api : "REST calls"
api --> db : "Reads/writes"
```

## Error Handling Test

This block has intentionally broken syntax to test error rendering:

```c4x
InvalidSyntax(((broken
```

## PlantUML C4 Block

```plantuml
@startuml
!include C4_Context.puml

Person(user, "User", "A user")
System(webapp, "Web App", "The web application")

Rel(user, webapp, "Uses", "HTTPS")
@enduml
```

## Zoom Test (zoom disabled)

```c4x zoom=false
Person(tester, "Tester", "Tests the system")
System(sut, "System Under Test", "Being tested")
tester --> sut : "Tests"
```
