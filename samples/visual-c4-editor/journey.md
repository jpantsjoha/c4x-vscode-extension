# Visual C4 Editor acceptance journey

This deterministic example is used by the Visual C4 Editor acceptance suite and
manual UAT. The C4X block contains six elements and five relationships so
rename impact, inspection, staged edits, and source round trips can be checked
without changing its topology.

```c4x
graph TB
Person(Customer, "Customer", "Browser")
SoftwareSystem(Portal, "Customer portal", "TypeScript", "Serves customer journeys", $tags="Public")
SoftwareSystem(Identity, "Identity service", "Go", "Authenticates customers")
Container(Web, "Web application", "React", "Customer-facing UI")
Container(Api, "API", "Node.js", "Application API", $tags="Internal")
Container(Database, "Customer database", "PostgreSQL", "Stores customer data", $sprite=database)
Customer -->|Uses| Portal
Portal -->|Authenticates with| Identity
Portal -->|Serves| Web
Web -->|Calls| Api
Api -->|Reads and writes| Database
```
