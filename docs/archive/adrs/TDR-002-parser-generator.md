# TDR-002: Parser Generator Selection

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

We need to parse three DSLs:
1. **C4X-DSL** (new, Mermaid-inspired syntax)
2. **Structurizr DSL** (existing, complex syntax)
3. **C4-PlantUML** (existing, macro-based syntax)

Different parsing strategies may be optimal for each dialect.

---

## Options Considered

### Option 1: PEG.js (Parser Expression Grammar)
**Use Case**: C4X-DSL

**Pros**:
- ✅ Declarative grammar (easy to write and maintain)
- ✅ Excellent error messages (line/column numbers)
- ✅ Small bundle size (~30KB)
- ✅ Fast parsing (< 50ms for 30-node diagram)

**Cons**:
- ⚠️ Requires grammar definition
- ⚠️ Less flexible for error recovery

---

### Option 2: Hand-Rolled Recursive Descent
**Use Case**: Structurizr DSL

**Pros**:
- ✅ Maximum flexibility for complex syntax
- ✅ Better error recovery (don't fail on unsupported features)
- ✅ More control over AST structure
- ✅ Can implement incremental parsing

**Cons**:
- ⚠️ More code to write and maintain
- ⚠️ Manual error reporting

---

### Option 3: Regex + State Machine
**Use Case**: PlantUML C4

**Pros**:
- ✅ Simple for macro-based syntax
- ✅ Best-effort approach (ignore unsupported macros)
- ✅ Fast for subset parsing
- ✅ Low bundle size

**Cons**:
- ⚠️ Limited to simple patterns
- ⚠️ Cannot parse full PlantUML syntax

---

## Decision

**Use different strategies for each dialect**:
- **C4X-DSL**: **PEG.js** (clean grammar, fast generation)
- **Structurizr DSL**: **Hand-rolled** (complex, need flexibility)
- **PlantUML C4**: **Regex + State Machine** (best-effort, subset only)

---

## Rationale

### C4X-DSL → PEG.js
- We control the syntax, can optimize for PEG
- Fast parsing, good error messages
- Small bundle size (~30KB)
- Example grammar:
```pegjs
Element = id:Identifier "[" label:Label "<br/>" type:ElementType "]" {
  return { id, label, type };
}
```

### Structurizr DSL → Hand-Rolled
- Structurizr syntax is complex (nested blocks, optional fields)
- Need incremental parsing (ignore unsupported features gracefully)
- Better error recovery (warn instead of fail)
- More control over AST for mapping to C4Model IR

### PlantUML C4 → Regex
- PlantUML is too complex for full parser (macro expansion, includes, etc.)
- Subset approach: match known macros (`Person()`, `System()`, `Rel()`), ignore rest
- Best-effort is acceptable (compatibility matrix documents limitations)

---

## Consequences

### Positive
- ✅ Right tool for each job (optimal for each dialect)
- ✅ Flexibility to extend each parser independently
- ✅ Clear compatibility matrices (document what's supported)

### Negative
- ⚠️ More code to maintain (3 parser implementations)
- ⚠️ Different testing strategies for each parser

### Mitigation
- Share IR (Intermediate Representation) - only parsers differ
- Comprehensive test suites for each parser
- Document compatibility matrices clearly

---

## Implementation

### C4X-DSL (PEG.js)
```javascript
// src/parser/c4x.pegjs
Diagram
  = header:Header elements:Element* relationships:Relationship* {
      return { header, elements, relationships };
    }

Header
  = "%%{" _ "c4:" _ type:ViewType _ "}%%" {
      return { type };
    }

Element
  = id:Identifier "[" label:Label "<br/>" type:ElementType tags:Tags? "]" {
      return { id, label, type, tags };
    }
```

### Structurizr DSL (Hand-Rolled)
```typescript
// src/parser/StructurizrParser.ts
export class StructurizrParser {
  parse(content: string): C4Model {
    const lexer = new StructurizrLexer(content);
    const tokens = lexer.tokenize();
    const ast = new ASTBuilder(tokens).build();
    const adapter = new StructurizrAdapter();
    return adapter.toC4Model(ast);
  }
}
```

### PlantUML C4 (Regex)
```typescript
// src/parser/PlantUMLParser.ts
export class PlantUMLParser {
  parse(content: string): C4Model {
    const elements: C4Element[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const personMatch = line.match(/Person\(([^,]+),\s*"([^"]+)"(?:,\s*"([^"]+)")?\)/);
      if (personMatch) {
        elements.push({
          id: personMatch[1].trim(),
          label: personMatch[2],
          type: 'Person',
          description: personMatch[3],
        });
      }
      // ... more macros
    }

    return { workspace: 'PlantUML C4', views: [{ type: 'system-context', elements, relationships: [] }] };
  }
}
```

---

## Coverage Targets

| Dialect | Coverage Target | Strategy |
|---------|----------------|----------|
| C4X-DSL | 100% | We control syntax |
| Structurizr DSL | 80% | Common features only |
| PlantUML C4 | 70% | Best-effort, common macros |

---

## References

- [PEG.js Documentation](https://pegjs.org/documentation)
- [Structurizr DSL Reference](https://docs.structurizr.com/dsl)
- [PlantUML C4](https://github.com/plantuml-stdlib/C4-PlantUML)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Next Review**: After M1 completion (parser implementation)
