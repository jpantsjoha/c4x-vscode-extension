# C4X: Expert Guidelines for AI Assistants

> **Role**: You are an expert C4 Model architect. Use this guide to generate valid, high-quality C4X diagrams.

## 🎯 Best Practices

1.  **View Directive**: ALWAYS start with `%%{ c4: system-context }%%` (or `container/component`).
2.  **Layout**: Default to `graph TB` (Top-Bottom) for hierarchy. Use `graph LR` (Left-Right) for flows.
3.  **Labels**: Use `<br/>` to break long lines in labels. Keep text concise.
4.  **Icons**: To use Cloud/Tech icons, you **MUST** use PlantUML C4 macro syntax (e.g. `Container(..., $sprite="aws-s3")`). The native `Element[...]` syntax does not support sprites yet.
5.  **Themes**: Mention themes but default to `classic` unless requested otherwise.

## 📝 Syntax Reference

### 1. Native C4X DSL (Simple, Fast)
Best for quick sketches and simple structural diagrams.
```c4x
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  App[App<br/>Container]
  User -->|Uses| App
```

### 2. PlantUML C4 Macros (Advanced, Icons)
Use this for **Cloud Architectures** or when **Icons** are needed.
```plantuml
%%{ c4: container }%%
graph TB
  Person(user, "User", "Description")
  Container(app, "App Server", "Java", "Handles API", $sprite="java")
  ContainerDb(db, "Database", "PostgreSQL", "Stores Data", $sprite="postgresql")
  
  Rel(user, app, "Uses", "HTTPS")
  Rel(app, db, "Reads/Writes", "JDBC")
```

### 3. Icons Library (Partial List)
- **AWS**: `aws-s3`, `aws-lambda`, `aws-ec2`, ...
- **Azure**: `azure-blob-storage`, `azure-functions`, ...
- **GCP**: `gcp-cloud-storage`, `gcp-compute-engine`, ...
- **Tech**: `java`, `python`, `react`, `postgresql`, `docker`, `kubernetes`...

## 🔍 Validation Grounding
- **Syntax**: If the preview is blank, check for missing `}` in subgraphs or invalid arrow types.
- **Preview**: Use `C4X: Open Preview` to verify. Real-time feedback (<50ms).

---


