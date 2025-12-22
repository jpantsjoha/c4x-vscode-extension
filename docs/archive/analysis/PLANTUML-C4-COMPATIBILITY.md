# PlantUML C4 Compatibility Reference

**Last Updated**: October 23, 2025
**C4X Extension Version**: 1.0.0
**PlantUML C4 Stdlib**: Compatible with C4-PlantUML library

> **📋 Purpose**: This document is a **technical reference** showing which PlantUML C4 syntax is supported by the C4X extension. Code examples below are **syntax references** - to see actual rendered diagrams, open the [sample .puml files](../samples/) in VS Code.

---

## 🎯 What This Document Is For

This compatibility matrix helps you understand:

1. **Which PlantUML C4 macros work** with the C4X extension
2. **How PlantUML syntax maps** to C4X internal representation
3. **What features are supported** vs. limitations
4. **How to migrate** existing PlantUML C4 diagrams

**🔍 To see actual rendered diagrams**: Open any `.puml` file from [`samples/`](../samples/) in VS Code and press `Ctrl+K V`.

---

## ✨ v1.0 Enhancement: Static Box Sizing

All PlantUML C4 diagrams now automatically benefit from **C4 Model standard box sizes**:

| Element Type | Dimensions | PlantUML Macros |
|--------------|------------|-----------------|
| **Person** | 160×120px | `Person()`, `Person_Ext()` |
| **Software System** | 200×140px | `System()`, `System_Ext()`, `SystemDb()` |
| **Container** | 180×130px | `Container()`, `Container_Ext()`, `ContainerDb()` |
| **Component** | 160×110px | `Component()`, `Component_Ext()`, `ComponentDb()` |

**Benefits**:
- **Consistent layouts** regardless of label length
- **Auto-scaling text** maintains readability within fixed boxes
- **Professional appearance** matching c4model.com standards
- **No migration required** - existing PlantUML files work immediately

---

## 📊 How PlantUML C4 Rendering Works

**Process**: PlantUML C4 → C4X Parser → Static Box Sizing → SVG Rendering

### 🔗 Live Examples

| PlantUML File | Description | What You'll See |
|---------------|-------------|-----------------|
| [`banking-containers.puml`](../samples/container/banking-containers.puml) | Container diagram with boundaries | ✅ Containers sized consistently, boundaries rendered as grouping |
| [`banking-system.puml`](../samples/system-context/banking-system.puml) | System context with external dependencies | ✅ All systems use 200×140px, auto-scaled text |
| [`ecommerce-system.puml`](../samples/system-context/ecommerce-system.puml) | Complex system names demonstrating text scaling | ✅ Long names scale down, short names normal size |
| [`api-gateway-components.puml`](../samples/component/api-gateway-components.puml) | Component diagram with technology stacks | ✅ Components 160×110px, tech labels auto-fit |

**🔥 Quick Test**:
1. Open any `.puml` file above in VS Code
2. Press `Ctrl+K V` (or `Cmd+K V` on Mac)
3. See instant rendering with static box sizing!

---

## Supported PlantUML C4 Macros

### Element Macros

| PlantUML Macro | C4X Element Type | Tags Applied | Status |
|---------------|------------------|--------------|--------|
| `Person(alias, label, desc)` | Person | - | ✅ Full support |
| `Person_Ext(alias, label, desc)` | Person | External | ✅ Full support |
| `System(alias, label, desc)` | SoftwareSystem | - | ✅ Full support |
| `System_Ext(alias, label, desc)` | SoftwareSystem | External | ✅ Full support |
| `SystemDb(alias, label, desc)` | SoftwareSystem | Database | ✅ Full support |
| `SystemDb_Ext(alias, label, desc)` | SoftwareSystem | External, Database | ✅ Full support |
| `Container(alias, label, tech, desc)` | Container | - | ✅ Full support |
| `Container_Ext(alias, label, tech, desc)` | Container | External | ✅ Full support |
| `ContainerDb(alias, label, tech, desc)` | Container | Database | ✅ Full support |
| `ContainerDb_Ext(alias, label, tech, desc)` | Container | External, Database | ✅ Full support |
| `Component(alias, label, tech, desc)` | Component | - | ✅ Full support |
| `Component_Ext(alias, label, tech, desc)` | Component | External | ✅ Full support |
| `ComponentDb(alias, label, tech, desc)` | Component | Database | ✅ Full support |
| `ComponentDb_Ext(alias, label, tech, desc)` | Component | External, Database | ✅ Full support |

### Relationship Macros

| PlantUML Macro | C4X Relationship Type | Direction | Status |
|---------------|----------------------|-----------|--------|
| `Rel(from, to, label, tech)` | uses | Default | ✅ Full support |
| `Rel_Back(from, to, label, tech)` | uses | Reverse | ✅ Full support |
| `Rel_D(from, to, label, tech)` | uses | Down | ✅ Full support |
| `Rel_U(from, to, label, tech)` | uses | Up | ✅ Full support |
| `Rel_L(from, to, label, tech)` | uses | Left | ✅ Full support |
| `Rel_R(from, to, label, tech)` | uses | Right | ✅ Full support |
| `BiRel(from, to, label, tech)` | uses | Bidirectional | ✅ Full support |
| `BiRel_D(from, to, label, tech)` | uses | Bidirectional Down | ✅ Full support |
| `BiRel_U(from, to, label, tech)` | uses | Bidirectional Up | ✅ Full support |
| `BiRel_L(from, to, label, tech)` | uses | Bidirectional Left | ✅ Full support |
| `BiRel_R(from, to, label, tech)` | uses | Bidirectional Right | ✅ Full support |

### Boundary Macros

| PlantUML Macro | Behavior | Tags Applied | Status |
|---------------|----------|--------------|--------|
| `System_Boundary(alias, label) { ... }` | Flattens children, preserves relationships | `boundary:alias` on children | ✅ Full support |
| `Container_Boundary(alias, label) { ... }` | Flattens children, preserves relationships | `boundary:alias` on children | ✅ Full support |
| `Enterprise_Boundary(alias, label) { ... }` | Flattens children, preserves relationships | `boundary:alias` on children | ✅ Full support |
| `Boundary(alias, label) { ... }` | Flattens children, preserves relationships | `boundary:alias` on children | ✅ Full support |

---

## Boundary Handling

### Flattening Strategy

The C4X extension uses a **boundary flattening** strategy to convert PlantUML C4 boundaries:

1. **Elements inside boundaries** are extracted and added to the main element list
2. **Boundary tags** are added to each element (e.g., `boundary:banking`)
3. **Relationships** inside boundaries are preserved
4. **Nested boundaries** are supported (multiple levels)

### 📝 Syntax Example: Auto-Scaling Text

> **Note**: The code block below is a **syntax reference** showing supported PlantUML features. To see this rendered as a diagram, copy it to a `.puml` file and open in VS Code.

**PlantUML Syntax** (copy to `.puml` file to render):
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

System_Boundary(banking, "Banking System") {
    Container(web, "Advanced Web Application with Responsive Design", "React 18, TypeScript, Material-UI", "Modern frontend with complex features")
    Container(api, "High-Performance API Gateway", "Node.js, Express, GraphQL", "Scalable backend service")
    Rel(web, api, "Makes authenticated API calls with JWT tokens")
}
@enduml
```

**When rendered in VS Code, you'll see**:
- ✅ **Containers maintain 180×130px dimensions** regardless of label complexity
- ✅ **Text auto-scales** to fit within boxes (font size adjusts from 14px to ~10px)
- ✅ **Relationship labels scale** to prevent overlap (max width: 150px)
- ✅ **Professional consistency** across all diagram elements

**🔗 See similar examples**: [`banking-containers.puml`](../samples/container/banking-containers.puml)

### 🔗 Nested Boundaries

Nested boundaries are fully supported. **Syntax reference** (copy to `.puml` file to render):

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml

System_Boundary(sys, "System") {
    Container_Boundary(cont1, "Container 1") {
        Component(comp1, "Component 1", "Java")
    }
    Container_Boundary(cont2, "Container 2") {
        Component(comp2, "Component 2", "Node.js")
    }
}
@enduml
```

**When rendered**: Components get `boundary:cont1` or `boundary:cont2` tags (innermost boundary)

---

## PlantUML Directives

### Skipped Directives

The following PlantUML directives are **automatically skipped** during parsing:

| Directive | Purpose | Status |
|-----------|---------|--------|
| `@startuml` | Diagram start marker | ✅ Skipped |
| `@enduml` | Diagram end marker | ✅ Skipped |
| `!include <file>` | Include external files | ✅ Skipped |
| `!define <var> <value>` | Define variables | ✅ Skipped |
| `LAYOUT_WITH_LEGEND()` | Layout hint | ✅ Skipped |
| `SHOW_FLOATING_LEGEND()` | Legend display | ✅ Skipped |
| `HIDE_STEREOTYPE()` | Hide stereotypes | ✅ Skipped |

### Comments

Both line and block comments are supported:

```plantuml
' This is a line comment
Person(user, "User")

/'
This is a
block comment
'/
```

---

## Parameter Mapping

### Technology Parameter

The `technology` parameter in PlantUML macros is mapped to the C4X `technology` field:

**PlantUML**:
```plantuml
Container(web, "Web App", "React, TypeScript", "Frontend")
```

**C4X**:
```javascript
{
  id: 'web',
  type: 'Container',
  label: 'Web App',
  technology: 'React, TypeScript',
  description: 'Frontend'
}
```

### Tag Mapping

PlantUML macro variants are mapped to C4X tags:

| PlantUML Variant | C4X Tags |
|-----------------|----------|
| `_Ext` suffix | `External` |
| `Db` variant | `Database` |
| `Db_Ext` combo | `External, Database` |

---

## View Generation

The PlantUML adapter automatically creates a **default system-context view** that includes:

- All parsed elements
- All parsed relationships
- View type: `system-context`
- Workspace name: `PlantUML C4 Diagram`

### Example

**PlantUML**:
```plantuml
Person(user, "User")
System(banking, "Banking")
Rel(user, banking, "Uses")
```

**C4X View**:
```javascript
{
  workspace: 'PlantUML C4 Diagram',
  views: [{
    type: 'system-context',
    name: 'PlantUML C4 View',
    elements: [/* user, banking */],
    relationships: [/* user -> banking */]
  }]
}
```

---

## Known Limitations

### 1. Layout Hints

**Status**: ⚠️ Ignored

PlantUML layout hints (e.g., `Rel_D`, `Rel_L`) are parsed but **not applied** to the C4X layout. The C4X layout engine (Dagre) determines positioning automatically.

**Workaround**: None needed - Dagre produces good layouts automatically.

### 2. Stereotypes

**Status**: ⚠️ Not supported

PlantUML stereotypes (`<<stereotype>>`) are not parsed or preserved.

**Example**:
```plantuml
Person(admin, "Admin", "Administrator", $sprite="user") <<Human>>
```

The `<<Human>>` stereotype is **ignored**.

**Workaround**: Use tags in C4X format instead.

### 3. Custom Sprites

**Status**: ⚠️ Not supported

PlantUML custom sprites and icons (`$sprite="..."`) are not supported.

**Workaround**: None - C4X uses theme-based styling instead.

### 4. PlantUML Skinparam

**Status**: ⚠️ Not supported

PlantUML `skinparam` directives for styling are ignored. C4X uses its own theme system.

**Example** (ignored):
```plantuml
skinparam backgroundColor #FFFFFF
```

**Workaround**: Use C4X theme system (5 built-in themes).

### 5. Multiple Diagrams

**Status**: ⚠️ Single diagram only

PlantUML files with multiple `@startuml/@enduml` blocks will only parse the **first diagram**.

**Workaround**: Split into separate `.puml` files.

---

## Migration Guide

### Converting PlantUML C4 to C4X

1. **Open the PlantUML file** in VS Code with C4X extension installed
2. **File will auto-detect** `.puml` extension
3. **Use "C4X: Open Preview"** command to render
4. **Optional**: Export to C4X native format for better performance

### Best Practices

1. **Keep it simple**: Use standard C4 macros (Person, System, Container, Component)
2. **Avoid custom sprites**: Use C4X themes instead
3. **Use boundaries**: For grouping related elements
4. **Technology parameter**: Use for stack information (e.g., "Java, Spring Boot")
5. **Comments**: Add context with line comments

---

## Test Coverage

The PlantUML parser and adapter have **comprehensive test coverage**:

- **58 total tests** (100% passing)
- **33 parser tests**: Macro parsing, boundaries, directives, edge cases
- **25 adapter tests**: Type mapping, tags, relationships, boundaries

### Test Categories

1. ✅ Element parsing (all macro variants)
2. ✅ Relationship parsing (all Rel variants, BiRel)
3. ✅ Boundary parsing (nested, multiple levels)
4. ✅ Directive skipping (includes, comments, layout hints)
5. ✅ Special characters (quotes, newlines, special chars)
6. ✅ Error handling (invalid syntax, missing parameters)
7. ✅ Type mapping (Person, System, Container, Component)
8. ✅ Tag handling (External, Database, combinations)
9. ✅ Boundary flattening (single, nested, cross-boundary relationships)
10. ✅ Complete examples (banking system, complex scenarios)

---

## Examples

### 🎯 Complete Working Example

> **💡 Live Version**: See [`banking-containers.puml`](../samples/container/banking-containers.puml) - open in VS Code and press `Ctrl+K V` to render!

**PlantUML Syntax Reference**:
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(customer, "Customer", "A banking customer")
Person_Ext(admin, "Admin", "Back office staff")

System_Boundary(banking, "Banking System") {
    Container(web, "Web Application", "Java Spring", "Delivers content")
    Container(spa, "Single-Page App", "Angular", "Banking functionality")
    ContainerDb(db, "Database", "Oracle", "Stores customer data")

    Rel(spa, web, "Delivered by")
    Rel(web, db, "Reads/writes", "JDBC")
}

System_Ext(email, "Email System", "Exchange")
System_Ext(mainframe, "Mainframe", "Core banking")

Rel(customer, spa, "Uses", "HTTPS")
Rel(web, mainframe, "Uses", "XML/HTTPS")
Rel(web, email, "Sends", "SMTP")
@enduml
```

**When rendered with C4X**:
- ✅ **7 elements** with static box sizing (2 persons: 160×120px, 2 systems: 200×140px, 3 containers: 180×130px)
- ✅ **5 relationships** with auto-scaling labels
- ✅ **Boundary grouping** (web, spa, db get `boundary:banking` tags)
- ✅ **Auto-tagging** (admin, email, mainframe get `External` tags; db gets `Database` tag)
- ✅ **Professional layout** with consistent spacing

### 🔗 Nested Boundaries Example

**Syntax reference** (copy to `.puml` file to render):

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Component.puml

System_Boundary(sys, "E-commerce System") {
    Container_Boundary(frontend, "Frontend") {
        Component(ui, "UI", "React")
        Component(router, "Router", "React Router")
    }
    Container_Boundary(backend, "Backend") {
        Component(api, "API", "Express")
        Component(auth, "Auth", "Passport")
    }
}
@enduml
```

**When rendered**:
- ✅ **4 components** with consistent 160×110px sizing
- ✅ **Smart tagging**: `boundary:frontend` on ui, router; `boundary:backend` on api, auth
- ✅ **Auto-scaling text** for component technology labels

---

## Performance

PlantUML parser performance (from benchmarks):

| Metric | Small (5 elements) | Medium (18 elements) | Large (60 elements) |
|--------|-------------------|---------------------|---------------------|
| Parse Time | 3-4ms | 5-8ms | 15-22ms |
| P95 | 4ms | 7ms | 20ms |
| Status | ✅ Excellent | ✅ Excellent | ✅ Excellent |

**Target**: < 50ms
**Actual**: 6.5ms average
**Status**: ✅ **87% faster than target**

---

## Troubleshooting

### Issue: Text overlapping or too small

**v1.0 Solution**: This is **automatically resolved** with the new text scaling feature!

**Behavior**:
- ✅ **Long labels auto-scale down** to fit within standard box sizes
- ✅ **Short labels use normal font size** for optimal readability
- ✅ **Minimum 70% font size** maintained for legibility
- ✅ **Relationship labels scale** to prevent overlap (max 150px width)

**Example - Before v1.0**:
```
Container(longname, "Very Long Container Name That Would Overflow", "Tech")
❌ Text overflows box, inconsistent sizing
```

**Example - v1.0 Auto-Scaling**:
```
Container(longname, "Very Long Container Name That Would Overflow", "Tech")
✅ Text scales to ~10px, fits perfectly in 180×130px container
```

### Issue: Elements not appearing

**Cause**: Missing required parameters
**Solution**: Ensure all macros have required parameters:
```plantuml
' ❌ Wrong (missing label)
Person(user)

' ✅ Correct
Person(user, "User")
```

### Issue: Relationships not connected

**Cause**: Typo in element alias
**Solution**: Use exact aliases from element definitions:
```plantuml
Container(webapp, "Web")
Rel(user, webapp, "Uses")  ' ✅ Correct - matches "webapp"
Rel(user, web, "Uses")     ' ❌ Wrong - "web" doesn't exist
```

### Issue: Boundary not grouping elements

**Cause**: Elements outside boundary block
**Solution**: Place elements inside `{ }` braces:
```plantuml
' ✅ Correct
System_Boundary(sys, "System") {
    Container(web, "Web", "React")
}

' ❌ Wrong - Container outside boundary
System_Boundary(sys, "System") { }
Container(web, "Web", "React")
```

### Issue: Diagram parse errors with complex syntax

**v1.0 Note**: PlantUML C4 syntax is fully supported. If you encounter parse errors:

1. **Use standard C4 macros** (Person, System, Container, Component)
2. **Avoid Mermaid syntax** (subgraph, flowchart) in `.puml` files
3. **Check parameter counts**: Person(2), System(2), Container(3), Component(3)
4. **Validate syntax** using the built-in validation tool

**Quick syntax validation**:
```bash
# Run from project root
node validate-all-diagrams.js
```

---

## Future Enhancements

Planned improvements for PlantUML compatibility:

1. ⏳ **Deployment nodes**: Support for `Deployment_Node` and `Node` macros
2. ⏳ **Dynamic diagrams**: Support for sequence/dynamic view macros
3. ⏳ **Custom relationships**: Support for custom relationship types
4. ⏳ **Sprite hints**: Map sprites to C4X icon system (when implemented)

---

## References

- [PlantUML C4 Library](https://github.com/plantuml-stdlib/C4-PlantUML)
- [C4 Model Documentation](https://c4model.com/)
- [C4X Extension README](../README.md)
- [C4X Parser Documentation](./PARSER-SPECIFICATION.md)

---

**Document Version**: 1.0
**Maintainer**: C4X Development Team
**Last Review**: October 21, 2025
