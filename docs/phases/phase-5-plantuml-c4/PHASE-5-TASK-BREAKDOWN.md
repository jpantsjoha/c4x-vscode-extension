# Phase 5 (M4 - PlantUML C4 Support) - Complete Task Breakdown

**Version**: v0.5.0
**Target Completion**: November 24, 2025
**Total Estimated Time**: 18-22 hours (3-4 working days)
**Status**: 🔴 NOT STARTED

---

## Executive Summary

Phase 5 adds **PlantUML C4 support** to enable PlantUML users to migrate without rewriting diagrams. By parsing PlantUML C4 macros (a subset), we allow PlantUML users to preview their `.puml` files in VS Code without Java/Graphviz - removing a significant barrier to adoption.

### What We're Building

By the end of Phase 5, users will be able to:
1. Open existing PlantUML C4 `.puml` files in VS Code
2. Press `Ctrl+K V` to see instant preview (< 300ms)
3. Work offline without Java/Graphviz dependencies
4. Use existing themes and export functionality
5. See warnings for unsupported macros (70% coverage target)

### Key Technical Components

1. **PlantUML C4 Macro Parser** - Regex-based parser for C4-PlantUML macros
2. **Macro to C4Model Adapter** - Convert PlantUML macros → C4Model IR
3. **Boundary Support** - Handle `System_Boundary`, `Container_Boundary`
4. **Best-Effort Parsing** - Ignore unsupported macros gracefully

---

## Task Categories Overview

| Category | Tasks | Est. Time | Priority |
|----------|-------|-----------|----------|
| **0. Phase 4 Cleanup** | 3 tasks | 1 hr | High (start immediately) |
| **1. Macro Parser** | 6 tasks | 6-7 hrs | Critical Path |
| **2. Boundary Support** | 4 tasks | 3-4 hrs | High |
| **3. Adapter to C4Model** | 5 tasks | 4-5 hrs | Critical Path |
| **4. Testing & Quality** | 4 tasks | 2-3 hrs | High |
| **5. Documentation** | 3 tasks | 1-2 hrs | Medium |
| **TOTAL** | **25 tasks** | **18-22 hrs** | - |

---

## Category 0: Phase 4 Integration & Quick Wins

**Purpose**: Complete Phase 4 integration and prepare for Phase 5 work
**Estimated Time**: 3-4 hours
**Priority**: CRITICAL (must complete before Phase 5)

### Task 0.1: Complete Structurizr DSL VS Code Integration ⚠️
**Time**: 2-3 hours
**Priority**: CRITICAL
**Status**: Phase 4 Leftover

**Description**: Integrate the Structurizr parser with VS Code extension to enable `.dsl` file previews.

**Why This Is Critical**: The Structurizr parser is complete but users cannot currently open and preview `.dsl` files in VS Code.

**Required Changes**:

1. **Update `package.json`**:
   - Add `.dsl` to `activationEvents`: `onLanguage:structurizr-dsl`
   - Add file extension association in `contributes.languages`
   - Add `.dsl` icon in `contributes.icons` (optional)

2. **Update `src/webview/PreviewPanel.ts`**:
   - Detect `.dsl` file extension
   - Call `parseStructurizrDSL(content)` for Structurizr files
   - Handle Structurizr parsing errors gracefully

3. **Update `language-configuration.json`**:
   - Add Structurizr DSL language configuration
   - Basic comment support (`//` and `/* */`)

4. **Add Language Definition**:
   - Create basic language definition file (optional, for syntax highlighting)

**Acceptance Criteria**:
- [ ] `.dsl` files activate the extension
- [ ] Opening `.dsl` file shows preview panel
- [ ] Preview renders Structurizr DSL correctly
- [ ] Parse errors display in preview
- [ ] Test with `docs/examples/ecommerce.dsl`
- [ ] All themes work with Structurizr files
- [ ] Export commands work with Structurizr files

**Test Plan**:
1. Open `docs/examples/ecommerce.dsl` in VS Code
2. Press `Ctrl+K V` to open preview
3. Verify system context view renders
4. Change theme → verify update
5. Export SVG → verify output
6. Introduce syntax error → verify error message

**Files to Modify**:
- `package.json` (+10 lines)
- `src/webview/PreviewPanel.ts` (+30 lines)
- `language-configuration.json` (+20 lines)

---

### Task 0.2: Add Element Reference Validation (Optional)
**Time**: 1 hour (if implemented)
**Priority**: MEDIUM
**Status**: Phase 4 Deferred

**Description**: Add validation pass to catch invalid element references in relationships and views.

**Problem**: Parser currently allows references to non-existent elements:
```dsl
workspace "Test" {
    model {
        user = person "User"
        user -> ghost "Uses"  // ❌ No error, but 'ghost' doesn't exist
    }
}
```

**Options**:
1. **Implement Now** (recommended for quality):
   - Add validator in `StructurizrAdapter.convert()`
   - Collect all element IDs from model
   - Validate relationship sources/destinations
   - Validate view include/exclude references
   - Throw descriptive errors with line numbers

2. **Defer to Phase 6**:
   - Document as known limitation
   - Fail gracefully during rendering

**Acceptance Criteria** (if implemented):
- [ ] Invalid relationship sources throw error
- [ ] Invalid relationship destinations throw error
- [ ] Invalid view includes throw warning
- [ ] Error messages include element ID and location
- [ ] Add test cases for validation errors

**Recommendation**: Implement basic validation (1 hour) to improve quality

---

### Task 0.3: Update README with Structurizr Examples
**Time**: 30 minutes
**Priority**: HIGH

**Description**: Add Structurizr DSL usage examples to README.md.

**Acceptance Criteria**:
- [ ] Add Structurizr DSL section to README
- [ ] Link to `docs/examples/ecommerce.dsl`
- [ ] Link to `docs/STRUCTURIZR-COMPATIBILITY.md`
- [ ] Show simple example in README
- [ ] Document supported features
- [ ] Document file extension (`.dsl`)

---

### Task 0.4: Update to Main Branch
**Time**: 15 minutes
**Priority**: HIGH

**Description**: Pull Phase 4 changes after merge, create Phase 5 branch.

**Acceptance Criteria**:
- [ ] `git checkout main && git pull`
- [ ] Verify v0.4.0 tag present
- [ ] `git checkout -b phase-5-plantuml-c4`

---

### Task 0.5: Verify Phase 4 Tests Pass
**Time**: 15 minutes
**Priority**: HIGH

**Description**: Ensure Phase 4 baseline is solid.

**Acceptance Criteria**:
- [ ] All Structurizr DSL tests pass (157 tests)
- [ ] All adapter tests pass
- [ ] Document baseline metrics

---

### Task 0.6: Research PlantUML C4 Macros
**Time**: 30 minutes
**Priority**: CRITICAL

**Description**: Study PlantUML C4 macro syntax.

**Research Questions**:
- What are the core macros? (`Person()`, `System()`, `Rel()`)
- What's the parameter order? (alias, label, description, technology)
- What are relationship variants? (`Rel()`, `Rel_Back()`, `Rel_D()`)
- How do boundaries work? (`System_Boundary`)

**Acceptance Criteria**:
- [ ] Study PlantUML C4 examples
- [ ] Document macro patterns
- [ ] Identify 70% use case coverage
- [ ] List unsupported macros

**References**:
- [PlantUML C4 GitHub](https://github.com/plantuml-stdlib/C4-PlantUML)
- Example `.puml` files

---

## Category 1: Macro Parser

**Purpose**: Parse PlantUML C4 macros into structured data
**Estimated Time**: 6-7 hours
**Priority**: Critical Path

### Task 1.1: Define Macro Types
**File**: `src/parser/plantuml/macros.ts`
**Time**: 30 minutes
**Priority**: Critical

**Description**: Define all PlantUML C4 macro types.

**Macro Types**:
```typescript
export type MacroType =
  | 'Person'
  | 'Person_Ext'
  | 'System'
  | 'System_Ext'
  | 'SystemDb'
  | 'SystemDb_Ext'
  | 'Container'
  | 'ContainerDb'
  | 'Component'
  | 'ComponentDb'
  | 'Rel'
  | 'Rel_Back'
  | 'Rel_Neighbor'
  | 'Rel_D'
  | 'Rel_U'
  | 'Rel_L'
  | 'Rel_R'
  | 'System_Boundary'
  | 'Container_Boundary'
  | 'Boundary';

export interface MacroCall {
  type: MacroType;
  params: string[]; // Raw parameters
  line: number;
}

export interface ElementMacro {
  type: 'element';
  macroType: MacroType;
  alias: string;
  label: string;
  description?: string;
  technology?: string;
  tags?: string;
  line: number;
}

export interface RelationshipMacro {
  type: 'relationship';
  macroType: MacroType;
  from: string;
  to: string;
  label?: string;
  technology?: string;
  line: number;
}

export interface BoundaryMacro {
  type: 'boundary';
  macroType: MacroType;
  alias: string;
  label: string;
  children: (ElementMacro | RelationshipMacro)[];
  line: number;
}
```

**Acceptance Criteria**:
- [ ] All macro types defined
- [ ] Types exported
- [ ] JSDoc comments added

---

### Task 1.2: Implement Macro Pattern Matching
**File**: `src/parser/plantuml/PlantUMLParser.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Regex-based parser to extract C4 macros from PlantUML.

**Parser Strategy**:
- Scan file line by line
- Use regex to match macro patterns
- Extract parameters
- Build macro list

**Parser Structure**:
```typescript
export class PlantUMLParser {
  private lines: string[];
  private currentLine: number = 0;

  constructor(source: string) {
    this.lines = source.split(/\r?\n/);
  }

  public parse(): PlantUMLDocument {
    const macros: (ElementMacro | RelationshipMacro | BoundaryMacro)[] = [];

    for (let i = 0; i < this.lines.length; i++) {
      this.currentLine = i + 1;
      const line = this.lines[i].trim();

      // Skip empty lines and comments
      if (line.length === 0 || line.startsWith("'")) {
        continue;
      }

      // Skip PlantUML directives
      if (line.startsWith('@') || line.startsWith('!')) {
        continue;
      }

      // Try to match macros
      const macro = this.parseMacro(line);
      if (macro) {
        macros.push(macro);
      }
    }

    return {
      macros,
    };
  }

  private parseMacro(line: string): ElementMacro | RelationshipMacro | BoundaryMacro | null {
    // Try element macros
    const elementMacro = this.parseElementMacro(line);
    if (elementMacro) return elementMacro;

    // Try relationship macros
    const relMacro = this.parseRelationshipMacro(line);
    if (relMacro) return relMacro;

    // Try boundary macros
    const boundaryMacro = this.parseBoundaryMacro(line);
    if (boundaryMacro) return boundaryMacro;

    return null;
  }

  private parseElementMacro(line: string): ElementMacro | null {
    // Pattern: Person(alias, "Label", "Description", "Technology")
    const pattern = /^(Person|Person_Ext|System|System_Ext|SystemDb|SystemDb_Ext|Container|ContainerDb|Component|ComponentDb)\((.*)\)$/;
    const match = line.match(pattern);

    if (!match) return null;

    const macroType = match[1] as MacroType;
    const params = this.parseParameters(match[2]);

    if (params.length < 2) {
      console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
      return null;
    }

    return {
      type: 'element',
      macroType,
      alias: params[0],
      label: params[1],
      description: params[2],
      technology: params[3],
      tags: params[4],
      line: this.currentLine,
    };
  }

  private parseRelationshipMacro(line: string): RelationshipMacro | null {
    // Pattern: Rel(from, to, "Label", "Technology")
    const pattern = /^(Rel|Rel_Back|Rel_Neighbor|Rel_D|Rel_U|Rel_L|Rel_R)\((.*)\)$/;
    const match = line.match(pattern);

    if (!match) return null;

    const macroType = match[1] as MacroType;
    const params = this.parseParameters(match[2]);

    if (params.length < 2) {
      console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
      return null;
    }

    return {
      type: 'relationship',
      macroType,
      from: params[0],
      to: params[1],
      label: params[2],
      technology: params[3],
      line: this.currentLine,
    };
  }

  private parseBoundaryMacro(line: string): BoundaryMacro | null {
    // Pattern: System_Boundary(alias, "Label") {
    const pattern = /^(System_Boundary|Container_Boundary|Boundary)\((.*)\)\s*\{?$/;
    const match = line.match(pattern);

    if (!match) return null;

    const macroType = match[1] as MacroType;
    const params = this.parseParameters(match[2]);

    if (params.length < 2) {
      console.warn(`Insufficient parameters for ${macroType} on line ${this.currentLine}`);
      return null;
    }

    // Parse children until closing brace
    const children = this.parseBoundaryChildren();

    return {
      type: 'boundary',
      macroType,
      alias: params[0],
      label: params[1],
      children,
      line: this.currentLine,
    };
  }

  private parseBoundaryChildren(): (ElementMacro | RelationshipMacro)[] {
    const children: (ElementMacro | RelationshipMacro)[] = [];
    let braceCount = 1; // Already seen opening brace

    while (this.currentLine < this.lines.length && braceCount > 0) {
      this.currentLine++;
      const line = this.lines[this.currentLine - 1].trim();

      if (line.includes('{')) braceCount++;
      if (line.includes('}')) braceCount--;

      if (braceCount === 0) break;

      const macro = this.parseMacro(line);
      if (macro && (macro.type === 'element' || macro.type === 'relationship')) {
        children.push(macro);
      }
    }

    return children;
  }

  private parseParameters(paramString: string): string[] {
    // Parse comma-separated parameters, respecting quoted strings
    const params: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < paramString.length; i++) {
      const char = paramString[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        params.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim().length > 0) {
      params.push(current.trim());
    }

    // Remove quotes from parameters
    return params.map(p => p.replace(/^"|"$/g, ''));
  }
}

export interface PlantUMLDocument {
  macros: (ElementMacro | RelationshipMacro | BoundaryMacro)[];
}
```

**Acceptance Criteria**:
- [ ] Parses `Person()` macro
- [ ] Parses `System()` macro
- [ ] Parses `Rel()` macro
- [ ] Extracts parameters correctly
- [ ] Handles quoted strings with commas
- [ ] Skips comments and directives

---

### Task 1.3: Handle Macro Variations
**Time**: 1 hour
**Priority**: High

**Description**: Support all relationship macro variants.

**Relationship Macros**:
- `Rel()` - Generic relationship
- `Rel_Back()` - Reverse direction
- `Rel_Neighbor()` - Same level
- `Rel_D()` - Down direction
- `Rel_U()` - Up direction
- `Rel_L()` - Left direction
- `Rel_R()` - Right direction

**Acceptance Criteria**:
- [ ] All relationship variants parsed
- [ ] Direction hints extracted (for future layout optimization)

---

### Task 1.4: Handle External Element Variants
**Time**: 30 minutes
**Priority**: Medium

**Description**: Support `_Ext` variants (external systems/persons).

**External Variants**:
- `Person_Ext()` - External person
- `System_Ext()` - External system
- `SystemDb_Ext()` - External database

**Acceptance Criteria**:
- [ ] All `_Ext` variants parsed
- [ ] Marked as external for styling

---

### Task 1.5: Write Parser Unit Tests
**File**: `test/suite/plantuml/parser.test.ts`
**Time**: 2 hours
**Priority**: High

**Description**: Comprehensive parser tests.

**Test Cases**:
- Parse `Person()` with all parameters
- Parse `System()` with optional parameters
- Parse `Rel()` relationships
- Parse relationship variants
- Parse external element variants
- Parse quoted strings with special characters
- Handle missing parameters gracefully
- Skip comments and directives

**Acceptance Criteria**:
- [ ] 40+ test cases
- [ ] All macros tested
- [ ] Edge cases covered

---

### Task 1.6: Performance Benchmark Parser
**Time**: 30 minutes
**Priority**: Medium

**Description**: Benchmark parser performance.

**Benchmarks**:
- Small file (50 lines) - target: < 20ms
- Medium file (200 lines) - target: < 60ms
- Large file (1000 lines) - target: < 120ms

**Acceptance Criteria**:
- [ ] Benchmarks pass
- [ ] Results documented

---

## Category 2: Boundary Support

**Purpose**: Handle boundary macros for grouping
**Estimated Time**: 3-4 hours
**Priority**: High

### Task 2.1: Parse Boundary Macros
**Time**: 1 hour
**Priority**: High

**Description**: Parse `System_Boundary`, `Container_Boundary`, `Boundary`.

**Example**:
```plantuml
System_Boundary(b1, "Banking System") {
    Container(webapp, "Web App")
    Container(database, "Database")
}
```

**Acceptance Criteria**:
- [ ] Parse boundary opening
- [ ] Parse children inside boundary
- [ ] Parse closing brace
- [ ] Handle nested boundaries

---

### Task 2.2: Flatten Boundary Hierarchy
**Time**: 1 hour
**Priority**: High

**Description**: Convert boundaries to flat element list with parent references.

**Approach**:
- Boundaries don't exist in C4Model IR
- Extract elements from boundaries
- Add boundary information as metadata

**Acceptance Criteria**:
- [ ] Elements extracted from boundaries
- [ ] Boundary metadata preserved
- [ ] Nested boundaries flattened

---

### Task 2.3: Test Boundary Parsing
**Time**: 1 hour
**Priority**: High

**Description**: Test boundary functionality.

**Test Cases**:
- Simple boundary with elements
- Nested boundaries
- Boundary with relationships
- Empty boundary

**Acceptance Criteria**:
- [ ] All boundary scenarios tested
- [ ] Nested boundaries work

---

### Task 2.4: Visual Grouping (Optional)
**Time**: 30 minutes
**Priority**: Low

**Description**: Consider visual grouping for future phases.

**Note**: Boundaries could be rendered as dotted boxes around elements (future enhancement)

**Acceptance Criteria**:
- [ ] Document boundary rendering approach for Phase 6

---

## Category 3: Adapter to C4Model

**Purpose**: Convert PlantUML macros to C4Model IR
**Estimated Time**: 4-5 hours
**Priority**: Critical Path

### Task 3.1: Create PlantUML Adapter
**File**: `src/adapter/PlantUMLAdapter.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Adapter that converts PlantUML macros to C4Model IR.

**Adapter Structure**:
```typescript
import { PlantUMLDocument, ElementMacro, RelationshipMacro, BoundaryMacro } from '../parser/plantuml/PlantUMLParser';
import { C4Model, C4Element, C4Rel, C4View, C4ElementType } from '../model/C4Model';

export class PlantUMLAdapter {
  public convert(document: PlantUMLDocument): C4Model {
    const elements: C4Element[] = [];
    const relationships: C4Rel[] = [];

    for (const macro of document.macros) {
      if (macro.type === 'element') {
        elements.push(this.convertElement(macro));
      } else if (macro.type === 'relationship') {
        relationships.push(this.convertRelationship(macro));
      } else if (macro.type === 'boundary') {
        // Flatten boundary - extract children
        const boundaryElements = this.flattenBoundary(macro);
        elements.push(...boundaryElements.elements);
        relationships.push(...boundaryElements.relationships);
      }
    }

    // Create default system-context view
    const view: C4View = {
      type: 'system-context', // Default view type
      elements,
      relationships,
    };

    return {
      workspace: 'PlantUML C4 Diagram',
      views: [view],
    };
  }

  private convertElement(macro: ElementMacro): C4Element {
    return {
      id: macro.alias,
      label: macro.label,
      type: this.mapElementType(macro.macroType),
      description: macro.description,
      technology: macro.technology,
      tags: this.getElementTags(macro),
    };
  }

  private convertRelationship(macro: RelationshipMacro): C4Rel {
    return {
      id: `${macro.from}-${macro.to}`,
      from: macro.from,
      to: macro.to,
      label: macro.label || '',
      technology: macro.technology,
      relType: this.mapRelationType(macro.macroType),
    };
  }

  private flattenBoundary(macro: BoundaryMacro): {
    elements: C4Element[];
    relationships: C4Rel[];
  } {
    const elements: C4Element[] = [];
    const relationships: C4Rel[] = [];

    for (const child of macro.children) {
      if (child.type === 'element') {
        const element = this.convertElement(child);
        // Add boundary as tag
        if (!element.tags) element.tags = [];
        element.tags.push(`boundary:${macro.alias}`);
        elements.push(element);
      } else if (child.type === 'relationship') {
        relationships.push(this.convertRelationship(child));
      }
    }

    return { elements, relationships };
  }

  private mapElementType(macroType: string): C4ElementType {
    if (macroType.startsWith('Person')) return 'Person';
    if (macroType.startsWith('System')) return 'SoftwareSystem';
    if (macroType.startsWith('Container')) return 'Container';
    if (macroType.startsWith('Component')) return 'Component';
    return 'SoftwareSystem'; // Default
  }

  private mapRelationType(macroType: string): 'uses' | 'async' | 'sync' {
    // All PlantUML relationships map to 'uses' by default
    // Direction hints (Rel_D, Rel_U) could be used for layout in future
    return 'uses';
  }

  private getElementTags(macro: ElementMacro): string[] | undefined {
    const tags: string[] = [];

    // Add 'External' tag for _Ext variants
    if (macro.macroType.includes('_Ext')) {
      tags.push('External');
    }

    // Add 'Database' tag for Db variants
    if (macro.macroType.includes('Db')) {
      tags.push('Database');
    }

    // Add custom tags from macro
    if (macro.tags) {
      tags.push(macro.tags);
    }

    return tags.length > 0 ? tags : undefined;
  }
}
```

**Acceptance Criteria**:
- [ ] Converts elements correctly
- [ ] Converts relationships correctly
- [ ] Flattens boundaries
- [ ] Adds External/Database tags

---

### Task 3.2: Handle External Elements
**Time**: 30 minutes
**Priority**: High

**Description**: Mark external elements with 'External' tag.

**Acceptance Criteria**:
- [ ] `Person_Ext` → Element with 'External' tag
- [ ] `System_Ext` → Element with 'External' tag
- [ ] External elements styled differently

---

### Task 3.3: Handle Database Elements
**Time**: 30 minutes
**Priority**: Medium

**Description**: Mark database elements with 'Database' tag.

**Acceptance Criteria**:
- [ ] `SystemDb` → Element with 'Database' tag
- [ ] `ContainerDb` → Element with 'Database' tag

---

### Task 3.4: Write Adapter Unit Tests
**File**: `test/suite/adapter/plantuml-adapter.test.ts`
**Time**: 1.5 hours
**Priority**: High

**Description**: Test PlantUML → C4Model conversion.

**Test Cases**:
- Convert simple person and system
- Convert relationships
- Convert external elements (tags)
- Convert database elements (tags)
- Flatten boundaries
- Handle missing parameters

**Acceptance Criteria**:
- [ ] 20+ test cases
- [ ] All scenarios covered

---

### Task 3.5: Integration Test (Parser + Adapter)
**Time**: 30 minutes
**Priority**: High

**Description**: End-to-end test from `.puml` to C4Model.

**Acceptance Criteria**:
- [ ] Full pipeline tested (PlantUML → macros → C4Model)
- [ ] Complex examples work
- [ ] Can render with existing layout/render pipeline

---

## Category 4: Testing & Quality

**Purpose**: Comprehensive testing and quality assurance
**Estimated Time**: 2-3 hours
**Priority**: High

### Task 4.1: Integration Tests (Full Pipeline)
**File**: `test/suite/integration/plantuml-integration.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: End-to-end tests from `.puml` file to rendered SVG.

**Test Scenarios**:
- Open `.puml` file → parse → render
- Complex diagram with boundaries
- External and database elements
- All relationship variants

**Acceptance Criteria**:
- [ ] 10+ integration tests
- [ ] Full pipeline tested
- [ ] Performance verified (< 300ms)

---

### Task 4.2: Compatibility Matrix Documentation
**File**: `docs/PLANTUML-COMPATIBILITY.md`
**Time**: 1 hour
**Priority**: High

**Description**: Document which PlantUML C4 features are supported.

**Supported Macros** (70% target):
- ✅ Person(), Person_Ext()
- ✅ System(), System_Ext(), SystemDb(), SystemDb_Ext()
- ✅ Container(), ContainerDb()
- ✅ Component(), ComponentDb()
- ✅ Rel(), Rel_Back(), Rel_Neighbor(), Rel_D/U/L/R()
- ✅ System_Boundary(), Container_Boundary(), Boundary()

**Unsupported Macros**:
- ❌ Deployment macros
- ❌ Dynamic diagrams
- ❌ Sprite support
- ❌ !include directive
- ❌ Custom shapes

**Acceptance Criteria**:
- [ ] Matrix complete
- [ ] Examples provided
- [ ] Migration guide included

---

### Task 4.3: Performance Benchmarks
**Time**: 30 minutes
**Priority**: Medium

**Description**: Benchmark PlantUML parsing and rendering.

**Benchmarks**:
- Parse small file (30 lines) - target: < 20ms
- Parse medium file (150 lines) - target: < 70ms
- Parse large file (500 lines) - target: < 120ms
- Full render - target: < 300ms

**Acceptance Criteria**:
- [ ] All benchmarks pass
- [ ] Results documented

---

### Task 4.4: Run Code Review & QA
**Time**: 45 minutes
**Priority**: High

**Description**: Validate Phase 5 quality.

**Acceptance Criteria**:
- [ ] Code review completed (target: > 95/100)
- [ ] QA validation passed
- [ ] No regressions in Phase 1-4 features

---

## Category 5: Documentation

**Purpose**: Document PlantUML C4 support
**Estimated Time**: 1-2 hours
**Priority**: Medium

### Task 5.1: Update README
**File**: `README.md`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Add PlantUML C4 examples to README.

**Sections to Add**:
- PlantUML C4 support announcement
- Example `.puml` file
- Link to compatibility matrix

**Acceptance Criteria**:
- [ ] Examples added
- [ ] Compatibility link included

---

### Task 5.2: Create Migration Guide
**File**: `docs/PLANTUML-MIGRATION.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Guide for migrating from PlantUML to C4X.

**Sections**:
1. Why migrate?
2. What's supported?
3. Step-by-step migration
4. Known limitations
5. Workarounds

**Acceptance Criteria**:
- [ ] Guide complete
- [ ] Examples included

---

### Task 5.3: Update CHANGELOG
**File**: `CHANGELOG.md`
**Time**: 15 minutes
**Priority**: Medium

**Description**: Document v0.5.0 changes.

**Changelog Entry**:
```markdown
## [0.5.0] - 2025-11-24

### Added
- **PlantUML C4 Support**: Preview `.puml` files in VS Code
  - Regex-based macro parser (no Java/Graphviz required)
  - 70% feature coverage (Person, System, Container, Component, Rel macros)
  - Boundary support (System_Boundary, Container_Boundary)
  - Maps to C4Model IR (reuses layout/render pipeline)
  - Best-effort parsing (unsupported macros ignored)

### Performance
- PlantUML parsing: < 100ms (typical files)
- Full render: < 300ms (parse + layout + SVG)

### Documentation
- PlantUML C4 compatibility matrix
- Migration guide (PlantUML → C4X)
```

**Acceptance Criteria**:
- [ ] Changelog updated
- [ ] Version bumped to 0.5.0

---

## Timeline Breakdown

### Week 1 (Days 1-2): Parser + Boundaries

**Day 1** (6-7 hours):
- Tasks 0.1-0.3: Cleanup and research
- Tasks 1.1-1.3: Macro types, pattern matching, variations

**Day 2** (6-7 hours):
- Tasks 1.4-1.6: External variants, tests, benchmarks
- Tasks 2.1-2.2: Boundary parsing, flattening

---

### Week 2 (Days 3-4): Adapter + Polish

**Day 3** (5-6 hours):
- Tasks 2.3-2.4: Boundary tests
- Tasks 3.1-3.3: Adapter implementation, external/database handling

**Day 4** (3-4 hours):
- Tasks 3.4-3.5: Adapter tests, integration
- Tasks 4.1-4.4: Testing and QA
- Tasks 5.1-5.3: Documentation

---

## Risk Mitigation

### High-Risk Areas

**1. Regex Complexity**
- **Risk**: Regex patterns fail on edge cases
- **Mitigation**: Extensive test coverage, best-effort parsing
- **Fallback**: Skip malformed macros, show warnings

**2. Parameter Parsing**
- **Risk**: Quoted strings with commas break parameter extraction
- **Mitigation**: State machine for quote handling
- **Fallback**: Require simpler parameter formats

**3. Boundary Flattening**
- **Risk**: Nested boundaries complicate layout
- **Mitigation**: Flatten to single level, preserve metadata
- **Fallback**: Ignore boundaries, show all elements

---

## Success Metrics

### Performance Targets (Must Meet)
- ✅ **Parsing**: < 100ms (typical `.puml` file)
- ✅ **Full Render**: < 300ms (parse + layout + SVG)

### Quality Targets (Must Meet)
- ✅ **Test Coverage**: > 80%
- ✅ **Parser Tests**: 40+ cases
- ✅ **Adapter Tests**: 20+ cases
- ✅ **Code Review**: > 95/100
- ✅ **Zero Regressions**: Phase 1-4 tests pass

### Functional Targets (Must Meet)
- ✅ **70% Feature Coverage**: Support common PlantUML C4 macros
- ✅ **Preview Works**: `.puml` files render correctly
- ✅ **Best-Effort Parsing**: Unsupported macros ignored gracefully

---

## Deliverables Checklist

### Code Deliverables
- [ ] Parser (`src/parser/plantuml/PlantUMLParser.ts`)
- [ ] Macro types (`src/parser/plantuml/macros.ts`)
- [ ] Adapter (`src/adapter/PlantUMLAdapter.ts`)

### Test Deliverables
- [ ] Parser tests (40+ cases)
- [ ] Adapter tests (20+ cases)
- [ ] Integration tests (10+ cases)
- [ ] Performance benchmarks

### Documentation Deliverables
- [ ] Compatibility matrix (`docs/PLANTUML-COMPATIBILITY.md`)
- [ ] Migration guide (`docs/PLANTUML-MIGRATION.md`)
- [ ] README updated
- [ ] CHANGELOG updated for v0.5.0

---

## Next Phase Preview

**Phase 6 (M5 - Polish & QA)**:
- Diagnostics panel (Problems view)
- Built-in templates (C1, C2, C3)
- Performance optimization (< 200ms activation)
- Security audit (zero vulnerabilities)
- Marketplace publishing (v1.0.0)
- Estimated time: 22-26 hours (4-5 days)

---

**Document Owner**: Code Review Agent (VSCode Extension Expert)
**Last Updated**: October 19, 2025
**Status**: 🔴 NOT STARTED - Ready to begin Phase 5
