# Examples - PlantUML

This document demonstrates C4X's native support for **PlantUML C4 syntax**.
The examples below are functionally equivalent to the C4X DSL examples in [EXAMPLES.md](./EXAMPLES.md).

You can use standard PlantUML C4 macros (`Person`, `Container`, `Rel`, etc.) directly in your markdown files using the `plantuml` fenced code block.

---

## 1. Marketing Multi-Agent System (Swarm Architecture)
*Equivalent to Example 5 in C4X DSL.*

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(director, "Marketing Director")

System_Boundary(swarm, "Marketing Agent Swarm") {
    Container(manager, "Campaign Manager", "Orchestrator")
    Container(researcher, "Market Researcher", "Web Surfer")
    Container(writer, "Content Copywriter", "Creative Agent")
    Container(reviewer, "Content Editor", "Critique Agent")
    Container(social, "Social Media Specialist", "Platform Expert")
    ContainerDb(memory, "Shared Memory", "Vector DB")
}

System_Ext(llm, "LLM API")
System_Ext(internet, "Internet")

Rel(director, manager, "Brief")

Rel(manager, researcher, "1. Assigns tasks")
Rel(manager, writer, "2. Assigns tasks")

Rel(researcher, internet, "Searches web")
Rel(researcher, memory, "Saves insights")

Rel(writer, memory, "Reads insights")
Rel(writer, llm, "Generates draft")
Rel(writer, reviewer, "Submits draft")

Rel(reviewer, llm, "Validates")
Rel(reviewer, writer, "Approve/Reject")
Rel(reviewer, social, "Approved content")

Rel(social, internet, "Publish")
@enduml
```

---

## 2. Banking System (System Context)
*Equivalent to Example 1 in C4X DSL.*

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

Person(customer, "Personal Banking Customer")
Person_Ext(admin, "Back Office Staff")

System(banking_system, "Internet Banking System")

System_Ext(mainframe, "Mainframe Banking System")
System_Ext(email, "E-mail System")

Rel(customer, banking_system, "Views account balances, makes payments")
Rel(admin, banking_system, "Manages users and system config")

Rel(banking_system, mainframe, "Gets account info from")
Rel(banking_system, email, "Sends e-mail using")
@enduml
```
