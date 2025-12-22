# Phase 4: M3 - Structurizr DSL Support

**Status**: 🔴 **NOT STARTED**
**Target**: Week of November 11-17, 2025
**Duration**: 7 days
**Version**: v0.4.0

---

## 🎯 Phase Directive

> **In this phase, we add support for Structurizr DSL (subset) to enable enterprise adoption. By the end of M3, enterprise architects can open their existing Structurizr `.dsl` files in VS Code and see instant preview - no Java, no server, no external dependencies.**

---

## 📋 Goals

1. **Structurizr DSL Parser**: Hand-rolled parser for Structurizr DSL syntax
2. **Map to C4X IR**: Convert Structurizr elements → C4Model IR (reuse layout/render)
3. **Support Core Blocks**: `workspace`, `model`, `views`, `styles`
4. **Support Elements**: `person`, `softwareSystem`, `container`, `component`
5. **Compatibility Matrix**: Document which Structurizr features are supported (80% target)

---

## 🚀 Deliverables

### Structurizr DSL Parser
- [ ] **Parser** (`src/parser/StructurizrParser.ts`) - hand-rolled (not PEG.js)
- [ ] **Lexer** (tokenize Structurizr syntax: `person "Name" { ... }`)
- [ ] **AST Builder** (build abstract syntax tree)
- [ ] **Error reporting** (line/column numbers for syntax errors)

### DSL Support
- [ ] **Workspace block** (`workspace "Name" { ... }`)
- [ ] **Model block** (`model { ... }`)
- [ ] **Views block** (`views { systemContext { ... } }`)
- [ ] **Styles block** (`styles { element "Person" { ... } }`)

### Element Support
- [ ] **Person** (`person "Customer" { ... }`)
- [ ] **Software System** (`softwareSystem "Banking System" { ... }`)
- [ ] **Container** (`container "Web App" { ... }`)
- [ ] **Component** (`component "Login Controller" { ... }`)
- [ ] **Relationships** (`Customer -> Banking "Uses"`)

### Mapping to IR
- [ ] **Adapter** (`src/adapter/StructurizrAdapter.ts`)
- [ ] **Map elements** (Structurizr Person → C4Element with type "Person")
- [ ] **Map relationships** (Structurizr `->` → C4Rel)
- [ ] **Map views** (Structurizr `systemContext` → C4View)
- [ ] **Map styles** (Structurizr styles → Theme overrides)

### Compatibility Documentation
- [ ] **Compatibility matrix** (which features are supported)
- [ ] **Migration guide** (Structurizr → C4X)
- [ ] **Known limitations** (features we won't support in v1.0)
- [ ] **Example conversions** (before/after)

---

## ✅ Success Criteria

### Functional Requirements
- ✅ **Can parse basic Structurizr DSL** files (workspace, model, views)
- ✅ **80% coverage** of common Structurizr features
- ✅ **Unsupported features show warnings** (not errors)
- ✅ **Preview renders** using existing C4X layout/render pipeline

### Performance Targets
- ✅ **Parsing**: < 100ms (typical Structurizr file)
- ✅ **Preview render**: < 300ms (same as C4X-DSL + parsing overhead)

### Quality Gates
- ✅ **Test coverage**: > 80% (parser, adapter, mapping)
- ✅ **Parser tests**: 50+ test cases (valid + invalid Structurizr syntax)
- ✅ **No regressions**: C4X-DSL and Markdown features still work

### Compatibility
- ✅ **80% feature coverage**: Support most common Structurizr features
- ✅ **Graceful degradation**: Unsupported features show warnings
- ✅ **Compatibility matrix**: Clear documentation of what's supported

---

## 🎬 User Stories

### User Story 1: Preview Structurizr DSL
**As an enterprise architect**, I want to open my existing Structurizr `.dsl` file in VS Code and see instant preview, so that I don't need to run Structurizr server.

**Acceptance Criteria**:
- [ ] Open `.dsl` file
- [ ] Run "C4X: Open Preview" command
- [ ] See C4 diagram rendered in < 300ms
- [ ] Diagram matches Structurizr layout (or better with Dagre.js)

**Example Structurizr DSL**:
```dsl
workspace "Banking System" {
    model {
        customer = person "Customer"
        bankingSystem = softwareSystem "Internet Banking System"

        customer -> bankingSystem "Uses"
    }

    views {
        systemContext bankingSystem {
            include *
            autoLayout
        }
    }
}
```

---

### User Story 2: Understand Compatibility
**As an enterprise architect**, I want to know which Structurizr features are supported, so that I can plan migration.

**Acceptance Criteria**:
- [ ] Read compatibility matrix documentation
- [ ] See clear list of supported features (person, softwareSystem, etc.)
- [ ] See clear list of unsupported features (deployment, dynamic views)
- [ ] See workarounds for common use cases

---

## 📁 Activities

Detailed implementation activities are documented in the `activities/` folder:

### Parser Activities
- [ ] **[01-structurizr-lexer.md](./activities/01-structurizr-lexer.md)** - Tokenize Structurizr syntax
- [ ] **[02-structurizr-ast.md](./activities/02-structurizr-ast.md)** - Build abstract syntax tree
- [ ] **[03-parser-tests.md](./activities/03-parser-tests.md)** - 50+ test cases

### Mapping Activities
- [ ] **[04-element-mapping.md](./activities/04-element-mapping.md)** - Map Structurizr elements → C4Element
- [ ] **[05-relationship-mapping.md](./activities/05-relationship-mapping.md)** - Map Structurizr `->` → C4Rel
- [ ] **[06-view-mapping.md](./activities/06-view-mapping.md)** - Map Structurizr views → C4View
- [ ] **[07-style-mapping.md](./activities/07-style-mapping.md)** - Map Structurizr styles → Theme

### Documentation Activities
- [ ] **[08-compatibility-matrix.md](./activities/08-compatibility-matrix.md)** - What's supported
- [ ] **[09-migration-guide.md](./activities/09-migration-guide.md)** - Structurizr → C4X
- [ ] **[10-known-limitations.md](./activities/10-known-limitations.md)** - What's not supported

---

## 🔧 Technical Details

### Structurizr DSL Example

```dsl
workspace "Banking System" {
    model {
        customer = person "Customer"
        bankingSystem = softwareSystem "Internet Banking System" {
            webApp = container "Web Application" {
                technology "React + TypeScript"
            }
            api = container "API Application" {
                technology "Node.js + Express"
            }
        }

        customer -> webApp "Uses" "HTTPS"
        webApp -> api "Makes API calls to" "JSON/REST"
    }

    views {
        systemContext bankingSystem {
            include *
            autoLayout
        }

        container bankingSystem {
            include *
            autoLayout
        }
    }
}
```

---

### Mapping to C4X IR

```typescript
// src/adapter/StructurizrAdapter.ts
export class StructurizrAdapter {
  toC4Model(structurizrAst: StructurizrAST): C4Model {
    const workspace = structurizrAst.workspace;

    // Map elements
    const elements: C4Element[] = workspace.model.elements.map(elem => ({
      id: elem.identifier,
      label: elem.name,
      type: this.mapElementType(elem.type), // "person" → "Person"
      technology: elem.technology,
      description: elem.description,
    }));

    // Map relationships
    const relationships: C4Rel[] = workspace.model.relationships.map(rel => ({
      from: rel.source,
      to: rel.destination,
      label: rel.description,
      technology: rel.technology,
      relType: 'uses',
    }));

    // Map views
    const views: C4View[] = workspace.views.map(view => ({
      type: this.mapViewType(view.type), // "systemContext" → "system-context"
      elements: this.resolveElements(view.include, elements),
      relationships: this.resolveRelationships(view.include, relationships),
    }));

    return { workspace: workspace.name, views };
  }
}
```

---

### Compatibility Matrix

| Structurizr Feature | C4X Support | Notes |
|-------------------|-------------|-------|
| **Elements** | | |
| `person` | ✅ Full | Mapped to C4Element (type: Person) |
| `softwareSystem` | ✅ Full | Mapped to C4Element (type: SoftwareSystem) |
| `container` | ✅ Full | Mapped to C4Element (type: Container) |
| `component` | ✅ Full | Mapped to C4Element (type: Component) |
| `deploymentNode` | ⚠️ Partial | Basic support (no nested environments) |
| **Relationships** | | |
| `->` (relationship) | ✅ Full | Mapped to C4Rel |
| `technology` | ✅ Full | Shown on arrows |
| **Views** | | |
| `systemContext` | ✅ Full | Mapped to C4View (system-context) |
| `container` | ✅ Full | Mapped to C4View (container) |
| `component` | ✅ Full | Mapped to C4View (component) |
| `deployment` | ⚠️ Partial | Basic support (v1.1 goal) |
| `dynamic` | ❌ Not Yet | Planned for v1.2 |
| **Styles** | | |
| `element` styles | ⚠️ Partial | Colors, shapes (no icons yet) |
| `relationship` styles | ⚠️ Partial | Colors, line styles |
| **Other** | | |
| `!include` | ❌ Not Yet | Multi-file support in v1.1 |
| `!docs` | ❌ No | Not applicable to preview |
| `!adrs` | ❌ No | Not applicable to preview |

**Coverage**: ~80% of common features

---

## 📊 Metrics

### Code Metrics (Target)
- **Lines of Code**: ~1,000 lines (parser, adapter, mapping)
- **TypeScript Files**: ~8 files
- **Test Files**: ~6 files
- **Bundle Size**: < 900KB (minimal increase over M2)

### Compatibility Metrics

| Metric | Target |
|--------|--------|
| Feature coverage | 80% |
| Parse success rate | > 95% (for valid Structurizr files) |
| Unsupported features | < 20% (with warnings) |

---

## 🔄 Timeline

```
Week of November 11-17, 2025 (7 days)
|----------------------------------------|
Day 1-2: Structurizr parser (lexer, AST)
Day 3-4: Adapter (map to C4X IR)
Day 5-6: Testing + compatibility matrix
Day 7:   Documentation + final validation
```

---

## 🚧 Blockers

### Current Blockers
- **M2 Not Complete**: Can start after M2 (Markdown Integration) is done

### Potential Blockers
- **Structurizr Complexity**: Mitigation - Focus on 80% use cases, defer advanced features

---

## 🎯 Definition of Done

### Code Complete
- [ ] All deliverables checked off
- [ ] Can parse basic Structurizr DSL files
- [ ] 80% feature coverage
- [ ] All tests passing (> 80% coverage)

### Quality Complete
- [ ] Code Review Agent validated (`/review-code`)
- [ ] QA Agent validated (parser tests, compatibility)
- [ ] Performance targets met (< 300ms preview)
- [ ] No regressions (C4X-DSL, Markdown still work)

### Release Complete
- [ ] `.vsix` file updated (v0.4.0)
- [ ] Git tag created (`v0.4.0`)
- [ ] CHANGELOG.md updated
- [ ] Compatibility matrix published

---

## 📞 Next Steps

### After M3 Completion
1. **Validate milestone** (`/validate-milestone`)
2. **Update STATUS.md** (mark M3 complete)
3. **Tag release** (`git tag v0.4.0`)

---

## 📚 References

### Structurizr
- [Structurizr DSL Reference](https://docs.structurizr.com/dsl)
- [Structurizr DSL Cookbook](https://docs.structurizr.com/dsl/cookbook)

### Internal References
- [C4X IR Types](../phase-2-c4x-dsl-mvp/README.md#intermediate-representation-ir)
- [Product Owner Agent](../../../.claude/agents/product-owner.md)

---

**Phase Owner**: Code Review Agent (VSCode Extension Expert)
**Target Completion**: 2025-11-17
**Status**: 🔴 **NOT STARTED** - Can run in parallel with M4 after M2
