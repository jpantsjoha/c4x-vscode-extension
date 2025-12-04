# Phase 5: M4 - PlantUML C4 Support

**Status**: 🔴 **NOT STARTED**
**Target**: Week of November 18-24, 2025
**Duration**: 7 days
**Version**: v0.5.0

---

## 🎯 Phase Directive

> **In this phase, we add support for PlantUML C4 (subset) to enable PlantUML users to migrate without rewriting diagrams. By the end of M4, PlantUML users can preview their C4-PlantUML `.puml` files in VS Code without Java - removing the Java/Graphviz dependency barrier.**

---

## 📋 Goals

1. **PlantUML C4 Parser**: Regex + state machine parser for PlantUML C4 macros
2. **Map to C4X IR**: Convert PlantUML macros → C4Model IR (reuse layout/render)
3. **Support C4 Macros**: `Person()`, `System()`, `Container()`, `Component()`, `Rel()`
4. **Support Boundaries**: `System_Boundary()`, `Container_Boundary()`
5. **Compatibility Matrix**: Document which PlantUML C4 features are supported (70% target)

---

## 🚀 Deliverables

### PlantUML C4 Parser
- [ ] **Parser** (`src/parser/PlantUMLParser.ts`) - regex + state machine
- [ ] **Macro detection** (detect C4-PlantUML macros like `Person()`)
- [ ] **Macro extraction** (extract parameters: alias, label, descr, tech)
- [ ] **Error reporting** (best-effort parsing, ignore unsupported macros)

### C4 Macro Support
- [ ] **Person()** (`Person(customer, "Customer", "Description")`)
- [ ] **System()** (`System(banking, "Banking System")`)
- [ ] **System_Ext()** (`System_Ext(email, "Email System")`)
- [ ] **Container()** (`Container(webapp, "Web App", "React")`)
- [ ] **Component()** (`Component(controller, "Login Controller")`)
- [ ] **Rel()** (`Rel(customer, banking, "Uses")`)
- [ ] **Rel_Back()**, **Rel_Neighbor()**, **Rel_D()** (relationship variants)

### Boundary Support
- [ ] **System_Boundary()** (`System_Boundary(b1, "Banking System") { ... }`)
- [ ] **Container_Boundary()** (`Container_Boundary(b2, "Web App") { ... }`)
- [ ] **Boundary()** (`Boundary(b3, "External Systems") { ... }`)

### Mapping to IR
- [ ] **Adapter** (`src/adapter/PlantUMLAdapter.ts`)
- [ ] **Map macros** (PlantUML `Person()` → C4Element with type "Person")
- [ ] **Map relationships** (PlantUML `Rel()` → C4Rel)
- [ ] **Map boundaries** (PlantUML `System_Boundary()` → C4 grouping)

### Compatibility Documentation
- [ ] **Compatibility matrix** (which PlantUML features are supported)
- [ ] **Migration guide** (PlantUML → C4X)
- [ ] **Known limitations** (features we won't support in v1.0)
- [ ] **Example conversions** (before/after)

---

## ✅ Success Criteria

### Functional Requirements
- ✅ **Can parse C4-PlantUML macros** (Person, System, Container, Rel)
- ✅ **70% coverage** of PlantUML C4 features
- ✅ **Best-effort parsing** (ignore unsupported macros, no errors)
- ✅ **Preview renders** using existing C4X layout/render pipeline

### Performance Targets
- ✅ **Parsing**: < 100ms (typical PlantUML C4 file)
- ✅ **Preview render**: < 300ms (same as C4X-DSL + parsing overhead)

### Quality Gates
- ✅ **Test coverage**: > 80% (parser, adapter, mapping)
- ✅ **Parser tests**: 40+ test cases (common PlantUML C4 patterns)
- ✅ **No regressions**: C4X-DSL, Markdown, Structurizr still work

### Compatibility
- ✅ **70% feature coverage**: Support most common PlantUML C4 macros
- ✅ **Graceful degradation**: Unsupported macros are ignored (no errors)
- ✅ **Compatibility matrix**: Clear documentation of what's supported

---

## 🎬 User Stories

### User Story 1: Preview PlantUML C4
**As a PlantUML user**, I want to preview my C4-PlantUML `.puml` file in VS Code without Java, so that I can work faster without external dependencies.

**Acceptance Criteria**:
- [ ] Open `.puml` file with C4-PlantUML macros
- [ ] Run "C4X: Open Preview" command
- [ ] See C4 diagram rendered in < 300ms
- [ ] Diagram matches PlantUML layout (or better with Dagre.js)

**Example PlantUML C4**:
```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Context.puml

Person(customer, "Customer", "A customer of the bank")
System(banking, "Internet Banking System", "Allows customers to view information about their bank accounts")
System_Ext(email, "Email System", "The internal Microsoft Exchange email system")

Rel(customer, banking, "Uses")
Rel(banking, email, "Sends emails using")
@enduml
```

---

### User Story 2: Understand Compatibility
**As a PlantUML user**, I want to know which PlantUML C4 macros are supported, so that I can plan migration.

**Acceptance Criteria**:
- [ ] Read compatibility matrix documentation
- [ ] See clear list of supported macros (Person, System, Rel)
- [ ] See clear list of unsupported features (sprites, themes)
- [ ] See workarounds for common use cases

---

## 📁 Activities

Detailed implementation activities are documented in the `activities/` folder:

### Parser Activities
- [ ] **[01-plantuml-macro-detection.md](./activities/01-plantuml-macro-detection.md)** - Detect C4 macros
- [ ] **[02-macro-extraction.md](./activities/02-macro-extraction.md)** - Extract parameters
- [ ] **[03-parser-tests.md](./activities/03-parser-tests.md)** - 40+ test cases

### Mapping Activities
- [ ] **[04-macro-mapping.md](./activities/04-macro-mapping.md)** - Map PlantUML macros → C4Element
- [ ] **[05-relationship-mapping.md](./activities/05-relationship-mapping.md)** - Map Rel() → C4Rel
- [ ] **[06-boundary-mapping.md](./activities/06-boundary-mapping.md)** - Map boundaries → C4 grouping

### Documentation Activities
- [ ] **[07-compatibility-matrix.md](./activities/07-compatibility-matrix.md)** - What's supported
- [ ] **[08-migration-guide.md](./activities/08-migration-guide.md)** - PlantUML → C4X
- [ ] **[09-known-limitations.md](./activities/09-known-limitations.md)** - What's not supported

---

## 🔧 Technical Details

### PlantUML C4 Example

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

Person(customer, "Customer", "A customer of the bank")

System_Boundary(c1, "Internet Banking System") {
    Container(webapp, "Web Application", "React + TypeScript", "Delivers the banking UI")
    Container(api, "API Application", "Node.js + Express", "Provides banking functionality via API")
    ContainerDb(db, "Database", "PostgreSQL", "Stores user accounts and transactions")
}

Rel(customer, webapp, "Uses", "HTTPS")
Rel(webapp, api, "Makes API calls to", "JSON/REST")
Rel(api, db, "Reads from and writes to", "JDBC")
@enduml
```

---

### Parsing Strategy (Regex + State Machine)

```typescript
// src/parser/PlantUMLParser.ts
export class PlantUMLParser {
  parse(content: string): C4Model {
    const lines = content.split('\n');
    const elements: C4Element[] = [];
    const relationships: C4Rel[] = [];

    for (const line of lines) {
      // Detect Person macro
      const personMatch = line.match(/Person\(([^,]+),\s*"([^"]+)"(?:,\s*"([^"]+)")?\)/);
      if (personMatch) {
        elements.push({
          id: personMatch[1].trim(),
          label: personMatch[2],
          type: 'Person',
          description: personMatch[3],
        });
        continue;
      }

      // Detect System macro
      const systemMatch = line.match(/System(?:_Ext)?\(([^,]+),\s*"([^"]+)"(?:,\s*"([^"]+)")?\)/);
      if (systemMatch) {
        elements.push({
          id: systemMatch[1].trim(),
          label: systemMatch[2],
          type: 'SoftwareSystem',
          description: systemMatch[3],
          tags: line.includes('System_Ext') ? ['External'] : [],
        });
        continue;
      }

      // Detect Rel macro
      const relMatch = line.match(/Rel\(([^,]+),\s*([^,]+),\s*"([^"]+)"(?:,\s*"([^"]+)")?\)/);
      if (relMatch) {
        relationships.push({
          from: relMatch[1].trim(),
          to: relMatch[2].trim(),
          label: relMatch[3],
          technology: relMatch[4],
          relType: 'uses',
        });
        continue;
      }

      // Ignore unsupported macros (best-effort parsing)
    }

    return { workspace: 'PlantUML C4', views: [{ type: 'system-context', elements, relationships }] };
  }
}
```

**Why Regex?**
- PlantUML syntax is macro-based (easier to parse than full grammar)
- Best-effort approach (ignore unsupported macros)
- Faster than full PEG.js parser

---

### Compatibility Matrix

| PlantUML C4 Feature | C4X Support | Notes |
|-------------------|-------------|-------|
| **Elements** | | |
| `Person()` | ✅ Full | Mapped to C4Element (type: Person) |
| `Person_Ext()` | ✅ Full | Mapped with tag "External" |
| `System()` | ✅ Full | Mapped to C4Element (type: SoftwareSystem) |
| `System_Ext()` | ✅ Full | Mapped with tag "External" |
| `Container()` | ✅ Full | Mapped to C4Element (type: Container) |
| `ContainerDb()` | ✅ Full | Mapped with shape "cylinder" |
| `Component()` | ✅ Full | Mapped to C4Element (type: Component) |
| **Relationships** | | |
| `Rel()` | ✅ Full | Mapped to C4Rel |
| `Rel_Back()` | ✅ Full | Mapped (arrow reversed) |
| `Rel_Neighbor()` | ✅ Full | Mapped (same as Rel) |
| `Rel_D()` | ✅ Full | Mapped (directional hint ignored) |
| **Boundaries** | | |
| `System_Boundary()` | ✅ Full | Mapped to C4 grouping |
| `Container_Boundary()` | ✅ Full | Mapped to C4 grouping |
| `Boundary()` | ✅ Full | Mapped to C4 grouping |
| **Styling** | | |
| `SHOW_PERSON_SPRITE` | ❌ No | Icons not supported in v1.0 |
| `SHOW_LEGEND` | ⚠️ Partial | Basic legend support |
| Custom themes | ❌ No | Use C4X theme system instead |
| **Other** | | |
| `!include` | ❌ No | Multi-file support in v1.1 |
| `LAYOUT_*` macros | ⚠️ Ignored | Dagre.js handles layout |

**Coverage**: ~70% of common PlantUML C4 macros

---

## 📊 Metrics

### Code Metrics (Target)
- **Lines of Code**: ~600 lines (parser, adapter, mapping)
- **TypeScript Files**: ~6 files
- **Test Files**: ~5 files
- **Bundle Size**: < 950KB (minimal increase over M3)

### Compatibility Metrics
| Metric | Target |
|--------|--------|
| Feature coverage | 70% |
| Parse success rate | > 90% (for valid PlantUML C4 files) |
| Unsupported macros | < 30% (ignored gracefully) |

---

## 🔄 Timeline

```
Week of November 18-24, 2025 (7 days)
|----------------------------------------|
Day 1-2: PlantUML parser (regex + state machine)
Day 3-4: Adapter (map to C4X IR)
Day 5-6: Testing + compatibility matrix
Day 7:   Documentation + final validation
```

---

## 🚧 Blockers

### Current Blockers
- **M2 Not Complete**: Can start after M2 (Markdown Integration) is done

### Potential Blockers
- **PlantUML Syntax Variations**: Mitigation - Best-effort parsing, ignore unsupported macros

---

## 🎯 Definition of Done

### Code Complete
- [ ] All deliverables checked off
- [ ] Can parse C4-PlantUML macros
- [ ] 70% feature coverage
- [ ] All tests passing (> 80% coverage)

### Quality Complete
- [ ] Code Review Agent validated (`/review-code`)
- [ ] QA Agent validated (parser tests, compatibility)
- [ ] Performance targets met (< 300ms preview)
- [ ] No regressions (C4X-DSL, Markdown, Structurizr still work)

### Release Complete
- [ ] `.vsix` file updated (v0.5.0)
- [ ] Git tag created (`v0.5.0`)
- [ ] CHANGELOG.md updated
- [ ] Compatibility matrix published

---

## 📞 Next Steps

### After M4 Completion
1. **Validate milestone** (`/validate-milestone`)
2. **Update STATUS.md** (mark M4 complete)
3. **Tag release** (`git tag v0.5.0`)
4. **Agent sync** (retrospective + M5 planning)
5. **Start M5** (Polish & QA - final push to v1.0)

---

## 📚 References

### PlantUML C4
- [C4-PlantUML GitHub](https://github.com/plantuml-stdlib/C4-PlantUML)
- [C4-PlantUML Examples](https://github.com/plantuml-stdlib/C4-PlantUML/tree/master/samples)

### Internal References
- [C4X IR Types](../phase-2-c4x-dsl-mvp/README.md#intermediate-representation-ir)
- [Product Owner Agent](../../../.claude/agents/product-owner.md)

---

**Phase Owner**: Code Review Agent (VSCode Extension Expert)
**Target Completion**: 2025-11-24
**Status**: 🔴 **NOT STARTED** - Can run in parallel with M3 after M2
