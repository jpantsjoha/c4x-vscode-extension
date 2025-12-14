# Phase 2 (M1 - C4X-DSL MVP) - Complete Task Breakdown

**Version**: v0.2.0
**Target Completion**: November 3, 2025
**Total Estimated Time**: 24-28 hours (3-4 working days)
**Status**: 🔴 NOT STARTED

---

## Executive Summary

Phase 2 delivers the **core value proposition** of C4X: a working parser, layout engine, and renderer that transforms `.c4x` text files into instant C1 diagram previews. This is the **MVP milestone** that proves the technical feasibility of the entire project.

### What We're Building

By the end of Phase 2, users will be able to:
1. Write a C1 (System Context) diagram in Mermaid-inspired syntax
2. Press `Ctrl+K V` to open live preview
3. See the diagram render in < 250ms
4. Edit and save → preview updates automatically in < 500ms

### Key Technical Components

1. **Parser** (PEG.js) - Converts `.c4x` syntax → Parse Tree
2. **IR Builder** - Converts Parse Tree → C4Model (Intermediate Representation)
3. **Layout Engine** (Dagre.js) - Positions nodes/edges hierarchically
4. **SVG Renderer** - Converts positioned layout → SVG markup
5. **Preview Webview** - Displays SVG with live updates

---

## Task Categories Overview

| Category | Tasks | Est. Time | Priority |
|----------|-------|-----------|----------|
| **0. Phase 1 Cleanup** | 6 tasks | 1.5 hrs | High (start immediately) |
| **1. Parser (PEG.js)** | 7 tasks | 6-8 hrs | Critical Path |
| **2. Intermediate Representation** | 5 tasks | 3-4 hrs | Critical Path |
| **3. Layout Engine (Dagre.js)** | 4 tasks | 3-4 hrs | Critical Path |
| **4. SVG Renderer** | 5 tasks | 4-5 hrs | Critical Path |
| **5. Preview & Live Updates** | 5 tasks | 3-4 hrs | Critical Path |
| **6. Testing & Quality** | 4 tasks | 3-4 hrs | High |
| **7. Documentation** | 3 tasks | 1-2 hrs | Medium |
| **TOTAL** | **39 tasks** | **24-28 hrs** | - |

---

## Category 0: Phase 1 Cleanup & Quick Wins

**Purpose**: Address high-priority recommendations from Phase 1 code review
**Estimated Time**: 1.5 hours
**Priority**: High (complete before starting parser)

### Task 0.1: Add Error Handling in activate()
**File**: `src/extension.ts`
**Time**: 15 minutes
**Priority**: Medium (from code review)

**Description**: Wrap activate() in try-catch to handle initialization errors gracefully.

**Acceptance Criteria**:
- [ ] Try-catch block wraps activation logic
- [ ] User-facing error message shown on failure
- [ ] Error logged to console
- [ ] Error re-thrown to mark extension as failed

**Reference**: `code-review-recommendations.md` - Recommendation 1

---

### Task 0.2: Add Output Channel for Logging
**File**: `src/extension.ts`, `src/webview/WebviewProvider.ts`
**Time**: 20 minutes
**Priority**: Medium (essential for debugging parser errors)

**Description**: Replace console.log with VS Code Output Channel for user-visible logs.

**Acceptance Criteria**:
- [ ] Output Channel created in activate()
- [ ] All console.log replaced with outputChannel.appendLine()
- [ ] Output Channel shown on errors
- [ ] Output Channel disposed in deactivate()

**Reference**: `code-review-recommendations.md` - Recommendation 6

---

### Task 0.3: Use crypto.randomBytes() for Nonce
**File**: `src/webview/WebviewProvider.ts`
**Time**: 5 minutes
**Priority**: Low

**Description**: Replace Math.random() with cryptographically secure crypto.randomBytes().

**Acceptance Criteria**:
- [ ] Import crypto module
- [ ] Use crypto.randomBytes(16).toString('base64')
- [ ] Remove old Math.random() implementation

**Reference**: `code-review-recommendations.md` - Recommendation 2

---

### Task 0.4: Document retainContextWhenHidden
**File**: `src/webview/WebviewProvider.ts`
**Time**: 5 minutes
**Priority**: Low

**Description**: Add inline comment documenting memory impact of retainContextWhenHidden.

**Acceptance Criteria**:
- [ ] Add comment with estimated memory impact (~5-10MB)
- [ ] Measure actual memory with VS Code Process Explorer
- [ ] Update comment with measured values

**Reference**: `code-review-recommendations.md` - Recommendation 3

---

### Task 0.5: Add JSDoc Comments (Ongoing)
**Files**: `src/extension.ts`, `src/webview/WebviewProvider.ts`
**Time**: 30 minutes (spread across Phase 2)
**Priority**: Low

**Description**: Add JSDoc comments to all public APIs for IntelliSense support.

**Acceptance Criteria**:
- [ ] All public methods have JSDoc comments
- [ ] All parameters documented with @param
- [ ] Return values documented with @returns

**Reference**: `code-review-recommendations.md` - Recommendation 4

---

### Task 0.6: Update main branch
**Time**: 15 minutes
**Priority**: High

**Description**: Switch to main branch, pull latest, create Phase 2 branch.

**Acceptance Criteria**:
- [ ] `git checkout main`
- [ ] `git pull origin main`
- [ ] `git checkout -b phase-2-c4x-dsl-mvp`
- [ ] Verify Phase 1 commits are in main

---

## Category 1: Parser (PEG.js)

**Purpose**: Convert `.c4x` text syntax → Parse Tree
**Estimated Time**: 6-8 hours
**Priority**: Critical Path (blocks all other work)

### Task 1.1: Set Up PEG.js Parser Infrastructure
**Files**: `package.json`, `src/parser/c4x.pegjs`, `esbuild.config.js`
**Time**: 30 minutes
**Priority**: Critical

**Description**: Install PEG.js, create grammar file, configure build to generate parser.

**Steps**:
1. Install PEG.js: `pnpm add pegjs @types/pegjs`
2. Create `src/parser/c4x.pegjs` (empty starter)
3. Add build script to generate parser: `pegjs -o src/parser/c4xParser.ts src/parser/c4x.pegjs`
4. Update esbuild to include generated parser

**Acceptance Criteria**:
- [ ] PEG.js installed
- [ ] Grammar file created
- [ ] Build script generates parser
- [ ] Parser imports successfully in TypeScript

---

### Task 1.2: Define C4X-DSL Grammar Basics
**File**: `src/parser/c4x.pegjs`
**Time**: 2 hours
**Priority**: Critical

**Description**: Implement PEG.js grammar for basic C4X-DSL syntax (graph, elements, relationships).

**Grammar to Implement**:
```pegjs
start
  = diagram

diagram
  = metadata? graph

metadata
  = "%%{" _ "c4:" _ viewType _ "}%%" _

graph
  = "graph" _ direction _ elements:element+ relationships:relationship*

element
  = id:identifier "[" label:elementLabel "]" _

relationship
  = from:identifier _ arrow:arrowType _ to:identifier _
  / from:identifier _ arrow:arrowType "|" label:string "|" _ to:identifier _

arrowType
  = "-->" / "-.->" / "==>"

direction
  = "TB" / "BT" / "LR" / "RL"
```

**Acceptance Criteria**:
- [ ] Can parse `graph TB`
- [ ] Can parse element: `Customer[Customer<br/>Person]`
- [ ] Can parse relationship: `Customer -->|Uses| Banking`
- [ ] Returns structured Parse Tree object

**Reference**: Phase 2 README - C4X-DSL Syntax section

---

### Task 1.3: Implement Element Parsing (ID, Label, Type, Tags)
**File**: `src/parser/c4x.pegjs`
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Parse element syntax with ID, label, type, and optional tags.

**Element Format**: `ID[Label<br/>Type<br/>Tags]`
- Example: `Customer[Customer<br/>Person]`
- Example: `Email[Email System<br/>Software System<br/>External]`

**Grammar**:
```pegjs
elementLabel
  = parts:(labelPart ("\\n" / "<br/>"))+

labelPart
  = chars:[^\[\]<>\n]+
```

**Acceptance Criteria**:
- [ ] Parses `Customer[Customer<br/>Person]`
- [ ] Parses multi-line: `Email[Email System<br/>Software System<br/>External]`
- [ ] Extracts ID, label, type, tags separately
- [ ] Handles optional tags

---

### Task 1.4: Implement Relationship Parsing (From, To, Label, Arrow)
**File**: `src/parser/c4x.pegjs`
**Time**: 1 hour
**Priority**: Critical

**Description**: Parse relationship syntax with from/to IDs, label, and arrow type.

**Relationship Formats**:
- Simple: `Customer --> Banking`
- With label: `Customer -->|Uses| Banking`
- Async: `Banking -.->|Sends emails| Email`
- Sync: `Auth ==>|Validates| Database`

**Acceptance Criteria**:
- [ ] Parses simple arrows without labels
- [ ] Parses arrows with labels
- [ ] Distinguishes arrow types (`-->`, `-.->`, `==>`)
- [ ] Extracts from, to, label, arrow type

---

### Task 1.5: Add Error Reporting (Line/Column Numbers)
**File**: `src/parser/c4x.pegjs`, `src/parser/ParserError.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Enhance parser to report line/column numbers for syntax errors.

**Error Types**:
- Missing closing bracket: `Customer[Person` → "Line 3, Column 18: Expected ']'"
- Invalid arrow: `Customer <-> Banking` → "Line 5, Column 10: Invalid arrow type"
- Unknown element type: `Customer[Person<br/>Unknown]` → "Line 2: Unknown element type 'Unknown'"

**Acceptance Criteria**:
- [ ] Parser returns line/column on syntax errors
- [ ] Error messages are clear and actionable
- [ ] Create ParserError class with line/column properties

---

### Task 1.6: Write Parser Unit Tests (100+ Test Cases)
**File**: `test/suite/parser.test.ts`
**Time**: 2 hours
**Priority**: High

**Description**: Comprehensive test suite for parser covering valid and invalid syntax.

**Test Categories**:
- Valid syntax (50 tests)
  - Simple diagrams
  - Complex diagrams (10+ elements)
  - All arrow types
  - All element types
  - Tags and metadata
- Invalid syntax (50 tests)
  - Missing brackets
  - Invalid arrows
  - Duplicate IDs
  - Invalid characters
  - Malformed labels

**Acceptance Criteria**:
- [ ] 100+ test cases
- [ ] All valid syntax tests pass
- [ ] All invalid syntax tests throw expected errors
- [ ] Test coverage > 90% for parser

---

### Task 1.7: Create Parser API Wrapper
**File**: `src/parser/C4XParser.ts`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Create clean TypeScript API wrapper around generated PEG.js parser.

**API Design**:
```typescript
export class C4XParser {
  parse(source: string): ParseResult {
    try {
      const tree = pegParser.parse(source);
      return { success: true, tree };
    } catch (error) {
      return {
        success: false,
        error: new ParserError(error.message, error.location)
      };
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Clean API: `parse(source) => ParseResult`
- [ ] Returns structured ParseResult (success/error)
- [ ] Handles PEG.js errors gracefully
- [ ] Type-safe with TypeScript

---

## Category 2: Intermediate Representation (IR)

**Purpose**: Convert Parse Tree → C4Model (validated, normalized data structure)
**Estimated Time**: 3-4 hours
**Priority**: Critical Path

### Task 2.1: Define C4Model TypeScript Types
**File**: `src/model/C4Model.ts`
**Time**: 45 minutes
**Priority**: Critical

**Description**: Define TypeScript interfaces for C4 Model IR.

**Types to Define**:
```typescript
export type C4ElementType = 'Person' | 'SoftwareSystem' | 'Container' | 'Component';
export type C4ViewType = 'system-context' | 'container' | 'component';
export type RelType = 'uses' | 'async' | 'sync';

export interface C4Element {
  id: string;
  label: string;
  type: C4ElementType;
  tags?: string[];
  technology?: string;
  description?: string;
}

export interface C4Rel {
  from: string;
  to: string;
  label: string;
  technology?: string;
  relType: RelType;
}

export interface C4View {
  type: C4ViewType;
  elements: C4Element[];
  relationships: C4Rel[];
}

export interface C4Model {
  workspace: string;
  views: C4View[];
}
```

**Acceptance Criteria**:
- [ ] All types defined
- [ ] Types exported from module
- [ ] JSDoc comments added
- [ ] No compilation errors

---

### Task 2.2: Implement IR Builder (Parse Tree → C4Model)
**File**: `src/model/IRBuilder.ts`
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Convert PEG.js parse tree into normalized C4Model IR.

**Builder Logic**:
1. Extract metadata (view type)
2. Build C4Element[] from parsed elements
3. Build C4Rel[] from parsed relationships
4. Assemble into C4View
5. Wrap in C4Model

**Example**:
```typescript
export class IRBuilder {
  build(parseTree: ParseTree): C4Model {
    const viewType = this.extractViewType(parseTree.metadata);
    const elements = parseTree.elements.map(e => this.buildElement(e));
    const relationships = parseTree.relationships.map(r => this.buildRelationship(r));

    return {
      workspace: 'default',
      views: [{
        type: viewType,
        elements,
        relationships
      }]
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Converts parse tree → C4Model
- [ ] Handles all element types
- [ ] Handles all relationship types
- [ ] Preserves all metadata (tags, technology)

---

### Task 2.3: Implement ID Reference Validation
**File**: `src/model/Validator.ts`
**Time**: 45 minutes
**Priority**: High

**Description**: Validate that all relationship references point to valid element IDs.

**Validation Rules**:
- All relationship `from` IDs must exist in elements
- All relationship `to` IDs must exist in elements
- No duplicate element IDs
- Element IDs must be valid identifiers (alphanumeric + underscore)

**Error Examples**:
- `Banking -->|Uses| UnknownSystem` → "Unknown element ID: UnknownSystem"
- Two elements with ID `Customer` → "Duplicate element ID: Customer"

**Acceptance Criteria**:
- [ ] Validates all relationship refs
- [ ] Detects duplicate IDs
- [ ] Returns clear error messages with line numbers
- [ ] Validation runs before layout

---

### Task 2.4: Write IR Builder Unit Tests
**File**: `test/suite/irBuilder.test.ts`
**Time**: 45 minutes
**Priority**: High

**Description**: Test IR builder with various parse trees.

**Test Cases**:
- Simple diagram (3 elements, 2 relationships)
- Complex diagram (10+ elements, 15+ relationships)
- All element types (Person, System, Container, Component)
- All relationship types (uses, async, sync)
- Tags and metadata

**Acceptance Criteria**:
- [ ] 20+ test cases
- [ ] All element types tested
- [ ] All relationship types tested
- [ ] Edge cases covered (empty diagram, single element)

---

### Task 2.5: Write Validator Unit Tests
**File**: `test/suite/validator.test.ts`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Test validator with valid and invalid C4Models.

**Test Cases**:
- Valid models (should pass)
- Invalid refs (should fail with clear errors)
- Duplicate IDs (should fail)
- Malformed IDs (should fail)

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] All validation rules tested
- [ ] Error messages are clear

---

## Category 3: Layout Engine (Dagre.js)

**Purpose**: Position elements and route edges using hierarchical layout
**Estimated Time**: 3-4 hours
**Priority**: Critical Path

### Task 3.1: Integrate Dagre.js Layout Engine
**Files**: `package.json`, `src/layout/DagreLayoutEngine.ts`
**Time**: 1 hour
**Priority**: Critical

**Description**: Install Dagre.js and create layout engine wrapper.

**Steps**:
1. Install Dagre.js: `pnpm add elkjs`
2. Create DagreLayoutEngine class
3. Configure layout options (layered, top-down, orthogonal routing)
4. Convert C4Model → ELK graph format

**ELK Configuration**:
```typescript
const layoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  'elk.spacing.nodeNode': '50',
  'elk.layered.spacing.nodeNodeBetweenLayers': '80',
  'elk.edgeRouting': 'ORTHOGONAL',
};
```

**Acceptance Criteria**:
- [ ] Dagre.js installed and imported
- [ ] DagreLayoutEngine class created
- [ ] Converts C4Model → ELK graph
- [ ] Returns positioned layout

---

### Task 3.2: Implement Node Sizing (Calculate Dimensions)
**File**: `src/layout/NodeSizer.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Calculate node dimensions based on label text length and element type.

**Sizing Rules**:
- **Person**: 160px wide, 100px tall (fixed for C1)
- **Software System**: 200px wide, 120px tall
- **Container**: 180px wide, 110px tall
- **Component**: 160px wide, 90px tall
- **Label overflow**: Wrap text after 20 characters

**Algorithm**:
```typescript
export class NodeSizer {
  calculateSize(element: C4Element): { width: number; height: number } {
    const baseSize = this.getBaseSize(element.type);
    const labelLines = this.wrapLabel(element.label, 20);
    return {
      width: baseSize.width,
      height: baseSize.height + (labelLines.length - 1) * 20
    };
  }
}
```

**Acceptance Criteria**:
- [ ] Calculates dimensions for all element types
- [ ] Handles long labels (text wrapping)
- [ ] Returns { width, height } for each element

---

### Task 3.3: Add Layout Performance Monitoring
**File**: `src/layout/DagreLayoutEngine.ts`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Add performance logging to track layout time.

**Monitoring**:
```typescript
export class DagreLayoutEngine {
  async layout(model: C4Model): Promise<LayoutResult> {
    const startTime = performance.now();

    const elkGraph = this.toElkGraph(model);
    const layout = await this.elk.layout(elkGraph);

    const duration = performance.now() - startTime;
    outputChannel.appendLine(`Layout completed in ${duration.toFixed(2)}ms`);

    if (duration > 100) {
      outputChannel.appendLine(`⚠️  Layout time exceeded target (100ms)`);
    }

    return this.toLayoutResult(layout);
  }
}
```

**Acceptance Criteria**:
- [ ] Logs layout time
- [ ] Warns if > 100ms
- [ ] Uses Output Channel (not console.log)

---

### Task 3.4: Write Layout Engine Unit Tests
**File**: `test/suite/layout.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Test layout engine with various C4Models.

**Test Cases**:
- Simple diagram (3 nodes, 2 edges)
- Complex diagram (30 nodes, 40 edges)
- Linear chain (A → B → C → D)
- Branching (A → B, A → C, B → D, C → D)
- Disconnected components

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] All layouts complete without errors
- [ ] Layout times < 100ms for 30-node diagrams
- [ ] Positions are valid (x, y, width, height)

---

## Category 4: SVG Renderer

**Purpose**: Convert positioned layout → SVG markup for webview display
**Estimated Time**: 4-5 hours
**Priority**: Critical Path

### Task 4.1: Create SVG Builder Foundation
**File**: `src/render/SvgBuilder.ts`
**Time**: 1 hour
**Priority**: Critical

**Description**: Create SVG builder class that generates SVG from layout.

**Basic Structure**:
```typescript
export class SvgBuilder {
  buildSvg(layout: LayoutResult, theme: Theme): string {
    const svg = `
      <svg width="${layout.width}" height="${layout.height}"
           xmlns="http://www.w3.org/2000/svg">
        <defs>
          ${this.buildMarkers(theme)}
        </defs>
        ${layout.nodes.map(node => this.renderNode(node, theme)).join('\n')}
        ${layout.edges.map(edge => this.renderEdge(edge, theme)).join('\n')}
      </svg>
    `;
    return svg;
  }
}
```

**Acceptance Criteria**:
- [ ] Generates valid SVG markup
- [ ] Includes nodes and edges
- [ ] Supports viewport dimensions
- [ ] Returns string (not DOM)

---

### Task 4.2: Implement Element Rendering (Person, System)
**File**: `src/render/SvgBuilder.ts`
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Render C4 elements as SVG rectangles with labels.

**Element Rendering**:
- **Rectangle**: `<rect>` with fill, stroke, rounded corners
- **Label**: `<text>` centered, multi-line support
- **Icon** (optional): Small icon in top-left (👤 for Person)
- **Type badge**: Small text at bottom (e.g., "[Person]")

**Person Rendering**:
```typescript
renderPerson(node: LayoutNode, theme: Theme): string {
  return `
    <g id="${node.id}">
      <rect x="${node.x}" y="${node.y}"
            width="${node.width}" height="${node.height}"
            rx="10" ry="10"
            fill="#08427B" stroke="#000" stroke-width="2"/>
      <text x="${node.x + node.width/2}" y="${node.y + 40}"
            text-anchor="middle" fill="#fff" font-weight="bold">
        ${node.label}
      </text>
      <text x="${node.x + node.width/2}" y="${node.y + node.height - 20}"
            text-anchor="middle" fill="#fff" font-size="12">
        [Person]
      </text>
    </g>
  `;
}
```

**Acceptance Criteria**:
- [ ] Renders Person (blue box, white text)
- [ ] Renders Software System (lighter blue box)
- [ ] Renders External System (gray box)
- [ ] Labels centered and readable
- [ ] Supports multi-line labels

---

### Task 4.3: Implement Relationship Rendering (Arrows)
**File**: `src/render/SvgBuilder.ts`
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Render relationships as SVG arrows with labels.

**Arrow Rendering**:
- **Line**: `<path>` with orthogonal routing points
- **Arrowhead**: SVG marker (triangle)
- **Label**: `<text>` positioned at midpoint
- **Arrow styles**: Solid (`-->`), Dashed (`-.->`) , Thick (`==>`)

**Relationship Rendering**:
```typescript
renderRelationship(edge: LayoutEdge, theme: Theme): string {
  const pathData = this.buildPathData(edge.points);
  const midpoint = this.calculateMidpoint(edge.points);

  return `
    <g id="${edge.id}">
      <path d="${pathData}"
            stroke="#333" stroke-width="2"
            fill="none" marker-end="url(#arrowhead)"/>
      <text x="${midpoint.x}" y="${midpoint.y - 5}"
            text-anchor="middle" font-size="14">
        ${edge.label}
      </text>
    </g>
  `;
}
```

**Acceptance Criteria**:
- [ ] Renders solid arrows (`-->`)
- [ ] Renders dashed arrows (`-.->`)
- [ ] Renders thick arrows (`==>`)
- [ ] Labels positioned at midpoint
- [ ] Arrowheads point correctly

---

### Task 4.4: Implement Classic Theme Colors
**File**: `src/render/Theme.ts`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Define C4 Model official colors for Classic theme.

**Classic Theme**:
```typescript
export const ClassicTheme: Theme = {
  person: {
    fill: '#08427B',
    stroke: '#000000',
    textColor: '#FFFFFF'
  },
  softwareSystem: {
    fill: '#1168BD',
    stroke: '#000000',
    textColor: '#FFFFFF'
  },
  externalSystem: {
    fill: '#999999',
    stroke: '#000000',
    textColor: '#FFFFFF'
  },
  relationship: {
    stroke: '#333333',
    textColor: '#000000'
  }
};
```

**Acceptance Criteria**:
- [ ] Theme defined with all C4 element types
- [ ] Colors match C4 Model official specification
- [ ] Theme exported and used by SvgBuilder

**Reference**: [C4 Model Notation](https://c4model.com/#Notation)

---

### Task 4.5: Write SVG Renderer Unit Tests
**File**: `test/suite/render.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Test SVG renderer with various layouts.

**Test Cases**:
- Simple diagram (3 elements, 2 relationships)
- All element types
- All arrow types
- Long labels (text wrapping)
- Complex routing (multiple bends)

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] SVG validates (well-formed XML)
- [ ] All elements visible (within viewport)
- [ ] Labels readable

---

## Category 5: Preview & Live Updates

**Purpose**: Display SVG in webview with live updates on file save
**Estimated Time**: 3-4 hours
**Priority**: Critical Path

### Task 5.1: Create Preview Panel Manager
**File**: `src/webview/PreviewPanel.ts`
**Time**: 1 hour
**Priority**: Critical

**Description**: Manage preview webview lifecycle (create, update, dispose).

**PreviewPanel Class**:
```typescript
export class PreviewPanel {
  private static currentPanel?: vscode.WebviewPanel;

  public static createOrShow(
    context: vscode.ExtensionContext,
    svgContent: string
  ): void {
    if (PreviewPanel.currentPanel) {
      PreviewPanel.currentPanel.reveal();
      PreviewPanel.updateContent(svgContent);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'c4xPreview',
      'C4X Preview',
      vscode.ViewColumn.Two,
      { enableScripts: true }
    );

    PreviewPanel.currentPanel = panel;
    panel.webview.html = PreviewPanel.getHtmlContent(svgContent);
  }

  public static updateContent(svgContent: string): void {
    if (!PreviewPanel.currentPanel) { return; }

    PreviewPanel.currentPanel.webview.postMessage({
      type: 'updateSvg',
      svg: svgContent
    });
  }
}
```

**Acceptance Criteria**:
- [ ] Singleton pattern (one panel max)
- [ ] Opens in Column Two (side-by-side)
- [ ] Updates content via postMessage
- [ ] Disposes properly

---

### Task 5.2: Implement File Watcher for .c4x Files
**File**: `src/preview/FileWatcher.ts`
**Time**: 45 minutes
**Priority**: Critical

**Description**: Watch .c4x files for changes and trigger re-render.

**FileWatcher Class**:
```typescript
export class FileWatcher {
  private watcher?: vscode.FileSystemWatcher;

  public watch(uri: vscode.Uri, onChange: () => void): void {
    // Watch the specific file
    const pattern = new vscode.RelativePattern(
      path.dirname(uri.fsPath),
      path.basename(uri.fsPath)
    );

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    this.watcher.onDidChange(() => {
      outputChannel.appendLine(`File changed: ${uri.fsPath}`);
      onChange();
    });
  }

  public dispose(): void {
    this.watcher?.dispose();
  }
}
```

**Acceptance Criteria**:
- [ ] Watches active .c4x file
- [ ] Triggers callback on save
- [ ] Disposes watcher properly
- [ ] Handles file deletion gracefully

---

### Task 5.3: Implement Debounced Live Updates
**File**: `src/preview/PreviewController.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Coordinate parsing, layout, render, and preview update with debouncing.

**PreviewController**:
```typescript
export class PreviewController {
  private debounceTimer?: NodeJS.Timeout;

  public async updatePreview(uri: vscode.Uri): Promise<void> {
    // Debounce: wait 300ms after last change
    clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(async () => {
      const startTime = performance.now();

      try {
        // 1. Read file
        const source = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(source).toString('utf8');

        // 2. Parse
        const parseResult = this.parser.parse(text);
        if (!parseResult.success) {
          PreviewPanel.showError(parseResult.error);
          return;
        }

        // 3. Build IR
        const model = this.irBuilder.build(parseResult.tree);

        // 4. Validate
        const validation = this.validator.validate(model);
        if (!validation.valid) {
          PreviewPanel.showError(validation.errors);
          return;
        }

        // 5. Layout
        const layout = await this.layoutEngine.layout(model);

        // 6. Render
        const svg = this.svgBuilder.buildSvg(layout, this.theme);

        // 7. Update preview
        PreviewPanel.updateContent(svg);

        const duration = performance.now() - startTime;
        outputChannel.appendLine(`Preview updated in ${duration.toFixed(2)}ms`);

      } catch (error) {
        outputChannel.appendLine(`Preview error: ${error}`);
        PreviewPanel.showError(error);
      }
    }, 300);
  }
}
```

**Acceptance Criteria**:
- [ ] Debounces updates (300ms delay)
- [ ] Full pipeline: parse → IR → layout → render → display
- [ ] Handles errors at each stage
- [ ] Logs total time
- [ ] Target: < 500ms from save to preview update

---

### Task 5.4: Add Error Display in Webview
**File**: `src/webview/PreviewPanel.ts`
**Time**: 45 minutes
**Priority**: High

**Description**: Display parser/validation errors in webview with line/column numbers.

**Error Display HTML**:
```html
<div class="error-panel">
  <div class="error-icon">⚠️</div>
  <div class="error-title">Parse Error</div>
  <div class="error-message">Line 5, Column 10: Expected ']'</div>
  <pre class="error-context">
    Customer[Customer<br/>Person
                      ^
  </pre>
</div>
```

**Acceptance Criteria**:
- [ ] Shows parse errors with line/column
- [ ] Shows validation errors
- [ ] Highlights error location
- [ ] Clear, actionable error messages

---

### Task 5.5: Register "C4X: Open Preview" Command
**File**: `src/extension.ts`
**Time**: 30 minutes
**Priority**: Critical

**Description**: Register command to open preview for active .c4x file.

**Command Registration**:
```typescript
vscode.commands.registerCommand('c4x.openPreview', async () => {
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('No active editor');
    return;
  }

  if (!editor.document.fileName.endsWith('.c4x')) {
    vscode.window.showErrorMessage('Not a .c4x file');
    return;
  }

  await previewController.updatePreview(editor.document.uri);
  fileWatcher.watch(editor.document.uri, () => {
    previewController.updatePreview(editor.document.uri);
  });
});
```

**Acceptance Criteria**:
- [ ] Command registered in package.json
- [ ] Keybinding: `Ctrl+K V` (matches Markdown Preview)
- [ ] Only works for .c4x files
- [ ] Opens preview in Column Two

---

## Category 6: Testing & Quality

**Purpose**: Ensure code quality, test coverage, and performance
**Estimated Time**: 3-4 hours
**Priority**: High

### Task 6.1: Integration Tests (End-to-End)
**File**: `test/suite/integration.test.ts`
**Time**: 1.5 hours
**Priority**: High

**Description**: Test complete pipeline from .c4x file → SVG preview.

**Test Cases**:
- Parse valid .c4x file → SVG renders
- Parse invalid .c4x file → Error displayed
- Live update: edit file → preview updates
- Performance: 30-node diagram renders in < 250ms

**Acceptance Criteria**:
- [ ] 10+ integration tests
- [ ] Full pipeline tested
- [ ] Performance benchmarks included
- [ ] All tests pass

---

### Task 6.2: Performance Benchmarking
**File**: `test/performance/benchmark.test.ts`
**Time**: 1 hour
**Priority**: Medium

**Description**: Benchmark parser, layout, and render performance.

**Benchmarks**:
- **Parse**: 10-node, 30-node, 100-node diagrams
- **Layout**: 10-node, 30-node, 100-node diagrams
- **Render**: 10-node, 30-node, 100-node diagrams
- **Total**: End-to-end for each size

**Acceptance Criteria**:
- [ ] Benchmarks for all pipeline stages
- [ ] Performance targets documented
- [ ] Regression detection (warn if > 10% slower)

---

### Task 6.3: Code Coverage Analysis
**File**: `test/coverage.config.js`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Configure code coverage reporting with Istanbul/nyc.

**Steps**:
1. Install nyc: `pnpm add -D nyc`
2. Configure .nycrc.json (target: 80% coverage)
3. Add script: `"test:coverage": "nyc pnpm test"`
4. Generate HTML report

**Acceptance Criteria**:
- [ ] nyc configured
- [ ] Coverage report generated
- [ ] Coverage > 80% for core modules (parser, IR, layout, render)

---

### Task 6.4: Run Code Review & QA Agents
**Time**: 1 hour
**Priority**: High

**Description**: Request code review and QA validation before Phase 2 completion.

**Steps**:
1. Run `/review-code` - VSCode Extension Expert reviews Phase 2 code
2. Address critical recommendations
3. Run QA validation - validates builds, tests, performance
4. Document recommendations for Phase 3

**Acceptance Criteria**:
- [ ] Code review completed
- [ ] QA validation passed
- [ ] Recommendations documented for Phase 3

---

## Category 7: Documentation

**Purpose**: Document Phase 2 implementation for contributors and future phases
**Estimated Time**: 1-2 hours
**Priority**: Medium

### Task 7.1: Update README with C4X-DSL Examples
**File**: `README.md`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Add C4X-DSL syntax examples and usage guide.

**Sections to Add**:
- Quick start example (create .c4x file, open preview)
- C4X-DSL syntax guide (elements, relationships)
- Screenshot of preview
- Troubleshooting section

**Acceptance Criteria**:
- [ ] Examples added
- [ ] Syntax guide complete
- [ ] Screenshot included

---

### Task 7.2: Update ARCHITECTURE with Phase 2 Design
**File**: `ARCHITECTURE.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Document parser, IR, layout, and render architecture.

**Sections to Add**:
- Parser architecture (PEG.js grammar)
- IR design (C4Model types)
- Layout engine (Dagre.js integration)
- SVG renderer (theme system)
- Preview pipeline diagram

**Acceptance Criteria**:
- [ ] Architecture documented
- [ ] Diagrams included
- [ ] Performance targets listed

---

### Task 7.3: Update CHANGELOG for v0.2.0
**File**: `CHANGELOG.md`
**Time**: 15 minutes
**Priority**: Medium

**Description**: Document Phase 2 changes in CHANGELOG.

**Changelog Entry**:
```markdown
## [0.2.0] - 2025-11-03

### Added
- C4X-DSL parser (PEG.js) for Mermaid-inspired syntax
- C4 Model Intermediate Representation (IR)
- Dagre.js layout engine integration
- SVG renderer with Classic theme
- Live preview with automatic updates
- File watcher for .c4x files
- "C4X: Open Preview" command (Ctrl+K V)

### Performance
- Preview render: < 250ms (30-node diagram)
- Live update latency: < 500ms
```

**Acceptance Criteria**:
- [ ] Changelog updated
- [ ] Version bumped to 0.2.0
- [ ] All features listed

---

## Timeline Breakdown

### Week 1 (Days 1-3): Core Pipeline

**Day 1: Phase 1 Cleanup + Parser Setup** (6-8 hours)
- Morning: Tasks 0.1-0.6 (Phase 1 cleanup, branch setup)
- Afternoon: Tasks 1.1-1.3 (PEG.js setup, basic grammar, element parsing)

**Day 2: Parser Completion** (6-8 hours)
- Morning: Tasks 1.4-1.5 (Relationship parsing, error reporting)
- Afternoon: Tasks 1.6-1.7 (Parser tests, API wrapper)

**Day 3: IR + Layout** (6-8 hours)
- Morning: Tasks 2.1-2.5 (IR types, builder, validation, tests)
- Afternoon: Tasks 3.1-3.4 (Dagre.js integration, node sizing, tests)

---

### Week 2 (Days 4-5): Rendering + Preview

**Day 4: SVG Renderer** (6-8 hours)
- Morning: Tasks 4.1-4.3 (SVG builder, element rendering, arrows)
- Afternoon: Tasks 4.4-4.5 (Classic theme, tests)

**Day 5: Preview & Live Updates** (4-6 hours)
- Morning: Tasks 5.1-5.3 (Preview panel, file watcher, live updates)
- Afternoon: Tasks 5.4-5.5 (Error display, command registration)

---

### Week 2 (Day 6): Quality & Documentation

**Day 6: Testing + Docs** (4-6 hours)
- Morning: Tasks 6.1-6.4 (Integration tests, benchmarks, coverage, code review)
- Afternoon: Tasks 7.1-7.3 (README, ARCHITECTURE, CHANGELOG)

---

### Week 2 (Day 7): Buffer & Final Validation

**Day 7: Buffer + Polish** (2-4 hours)
- Address code review recommendations
- Fix any failing tests
- Performance optimization if needed
- Create PR and merge to main
- Tag v0.2.0 release

---

## Risk Mitigation

### High-Risk Areas

**1. PEG.js Grammar Complexity**
- **Risk**: Grammar too complex, hard to debug
- **Mitigation**: Start with simplest grammar (80% use cases), defer advanced features
- **Fallback**: Use hand-written recursive descent parser

**2. Dagre.js Performance**
- **Risk**: Layout > 100ms for 30-node diagrams
- **Mitigation**: Optimize Dagre.js config, cache layout results
- **Fallback**: Switch to Dagre (lighter but less flexible)

**3. Live Update Latency**
- **Risk**: Updates > 500ms, feels sluggish
- **Mitigation**: Debounce updates, optimize render pipeline
- **Fallback**: Manual refresh button

---

## Success Metrics

### Performance Targets (Must Meet)
- ✅ **Parse**: < 50ms (30-node diagram)
- ✅ **Layout**: < 100ms (30-node diagram)
- ✅ **Render**: < 100ms (30-node diagram)
- ✅ **Total Preview**: < 250ms (30-node diagram)
- ✅ **Live Update**: < 500ms (save → preview update)

### Quality Targets (Must Meet)
- ✅ **Test Coverage**: > 80% (core modules)
- ✅ **Parser Tests**: 100+ test cases
- ✅ **Integration Tests**: 10+ end-to-end tests
- ✅ **Zero Regressions**: All Phase 1 tests still passing

### Functional Targets (Must Meet)
- ✅ **Can parse C1 diagram**: Person, Software System, Relationship
- ✅ **Preview renders**: Elements positioned, arrows drawn
- ✅ **Live updates work**: Save file → preview updates
- ✅ **Error handling**: Parse errors show line/column

---

## Deliverables Checklist

### Code Deliverables
- [ ] PEG.js grammar (`src/parser/c4x.pegjs`)
- [ ] Parser wrapper (`src/parser/C4XParser.ts`)
- [ ] IR types (`src/model/C4Model.ts`)
- [ ] IR builder (`src/model/IRBuilder.ts`)
- [ ] Validator (`src/model/Validator.ts`)
- [ ] Layout engine (`src/layout/DagreLayoutEngine.ts`)
- [ ] Node sizer (`src/layout/NodeSizer.ts`)
- [ ] SVG builder (`src/render/SvgBuilder.ts`)
- [ ] Theme system (`src/render/Theme.ts`)
- [ ] Preview panel (`src/webview/PreviewPanel.ts`)
- [ ] File watcher (`src/preview/FileWatcher.ts`)
- [ ] Preview controller (`src/preview/PreviewController.ts`)

### Test Deliverables
- [ ] Parser unit tests (100+ cases)
- [ ] IR builder tests (20+ cases)
- [ ] Validator tests (15+ cases)
- [ ] Layout tests (15+ cases)
- [ ] Render tests (15+ cases)
- [ ] Integration tests (10+ cases)
- [ ] Performance benchmarks

### Documentation Deliverables
- [ ] README updated with C4X-DSL examples
- [ ] ARCHITECTURE updated with Phase 2 design
- [ ] CHANGELOG updated for v0.2.0
- [ ] Code review recommendations for Phase 3

---

## Next Phase Preview

**Phase 3 (M2 - Markdown Integration)**:
- Fenced code blocks: ` ```c4x ` in Markdown files
- Markdown preview integration
- Theme system (multiple C4 themes)
- Export to PNG/SVG files
- Estimated time: 20-24 hours (3-4 days)

---

**Document Owner**: VSCode Extension Expert Agent
**Last Updated**: October 19, 2025
**Status**: 🔴 NOT STARTED - Ready to begin Phase 2
