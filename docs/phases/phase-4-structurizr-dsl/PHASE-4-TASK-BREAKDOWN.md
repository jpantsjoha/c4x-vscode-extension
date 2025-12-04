# Phase 4 (M3 - Structurizr DSL Support) - Complete Task Breakdown

**Version**: v0.4.0
**Target Completion**: November 17, 2025
**Total Estimated Time**: 20-24 hours (3-4 working days)
**Status**: 🔴 NOT STARTED

---

## Executive Summary

Phase 4 adds **Structurizr DSL support** to enable enterprise adoption. By parsing the Structurizr DSL (a subset of features), we allow enterprise architects to preview their existing `.dsl` files in VS Code without running the Structurizr server - removing the Java dependency barrier.

### What We're Building

By the end of Phase 4, users will be able to:
1. Open existing Structurizr `.dsl` files in VS Code
2. Press `Ctrl+K V` to see instant preview (< 300ms)
3. Use existing themes and export functionality
4. Work offline without Java/server dependencies
5. See clear warnings for unsupported features (80% coverage target)

### Key Technical Components

1. **Structurizr DSL Parser** - Hand-rolled lexer + AST builder for DSL syntax
2. **AST to C4Model Adapter** - Convert Structurizr AST → C4Model IR
3. **Style Mapper** - Map Structurizr styles to C4X themes
4. **Compatibility Layer** - Handle unsupported features gracefully

---

## Task Categories Overview

| Category | Tasks | Est. Time | Priority |
|----------|-------|-----------|----------|
| **0. Phase 3 Cleanup** | 3 tasks | 1 hr | High (start immediately) |
| **1. Lexer & Tokenizer** | 5 tasks | 5-6 hrs | Critical Path |
| **2. Parser & AST Builder** | 6 tasks | 6-7 hrs | Critical Path |
| **3. Adapter to C4Model** | 5 tasks | 4-5 hrs | Critical Path |
| **4. Style Support** | 3 tasks | 2-3 hrs | High |
| **5. Testing & Quality** | 4 tasks | 2-3 hrs | High |
| **6. Documentation** | 3 tasks | 1-2 hrs | Medium |
| **TOTAL** | **29 tasks** | **20-24 hrs** | - |

---

## Category 0: Phase 3 Cleanup & Quick Wins

**Purpose**: Prepare for Phase 4 work
**Estimated Time**: 1 hour
**Priority**: High

### Task 0.1: Update to Main Branch
**Time**: 15 minutes
**Priority**: High

**Description**: Pull Phase 3 changes, create Phase 4 branch.

**Acceptance Criteria**:
- [ ] `git checkout main && git pull`
- [ ] Verify v0.3.0 tag present
- [ ] `git checkout -b phase-4-structurizr-dsl`

---

### Task 0.2: Verify Phase 3 Tests Pass
**Time**: 15 minutes
**Priority**: High

**Description**: Ensure Phase 3 baseline is solid.

**Acceptance Criteria**:
- [ ] All Markdown integration tests pass
- [ ] All theme tests pass
- [ ] All export tests pass
- [ ] Document baseline metrics

---

### Task 0.3: Research Structurizr DSL Syntax
**Time**: 30 minutes
**Priority**: Critical

**Description**: Study Structurizr DSL syntax and identify core features.

**Research Questions**:
- What are the core blocks? (workspace, model, views, styles)
- What's the element syntax? (`person "Name" { ... }`)
- What's the relationship syntax? (`->` operator)
- How do views work? (`systemContext`, `container`, etc.)

**Acceptance Criteria**:
- [ ] Study Structurizr DSL documentation
- [ ] Document syntax patterns
- [ ] Identify 80% use case coverage target
- [ ] List unsupported features

**References**:
- [Structurizr DSL Language Reference](https://github.com/structurizr/dsl/blob/master/docs/language-reference.md)
- Structurizr example files

---

## Category 1: Lexer & Tokenizer

**Purpose**: Tokenize Structurizr DSL into lexical tokens
**Estimated Time**: 5-6 hours
**Priority**: Critical Path

### Task 1.1: Define Token Types
**File**: `src/parser/structurizr/tokens.ts`
**Time**: 45 minutes
**Priority**: Critical

**Description**: Define all token types for Structurizr DSL.

**Token Types to Define**:
```typescript
export enum TokenType {
  // Keywords
  WORKSPACE = 'workspace',
  MODEL = 'model',
  VIEWS = 'views',
  STYLES = 'styles',

  // Element keywords
  PERSON = 'person',
  SOFTWARE_SYSTEM = 'softwareSystem',
  CONTAINER = 'container',
  COMPONENT = 'component',

  // View keywords
  SYSTEM_CONTEXT = 'systemContext',
  CONTAINER_VIEW = 'container',
  COMPONENT_VIEW = 'component',

  // Operators
  ARROW = '->',
  BRACE_OPEN = '{',
  BRACE_CLOSE = '}',

  // Literals
  STRING = 'string',
  IDENTIFIER = 'identifier',
  NUMBER = 'number',

  // Whitespace & special
  NEWLINE = 'newline',
  COMMENT = 'comment',
  EOF = 'eof',
}

export interface Token {
  type: TokenType;
  value: string;
  line: number;
  column: number;
}
```

**Acceptance Criteria**:
- [ ] All token types defined
- [ ] Token interface complete
- [ ] Types exported

---

### Task 1.2: Implement Lexer Core
**File**: `src/parser/structurizr/Lexer.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Build lexer that scans Structurizr source code and produces tokens.

**Lexer Structure**:
```typescript
export class StructurizrLexer {
  private source: string;
  private position: number = 0;
  private line: number = 1;
  private column: number = 1;

  constructor(source: string) {
    this.source = source;
  }

  public tokenize(): Token[] {
    const tokens: Token[] = [];

    while (!this.isAtEnd()) {
      this.skipWhitespace();

      if (this.isAtEnd()) break;

      const token = this.nextToken();
      tokens.push(token);
    }

    tokens.push(this.makeToken(TokenType.EOF, ''));
    return tokens;
  }

  private nextToken(): Token {
    const char = this.peek();

    // Handle comments
    if (char === '/' && this.peekNext() === '/') {
      return this.scanComment();
    }

    // Handle strings
    if (char === '"') {
      return this.scanString();
    }

    // Handle operators
    if (char === '-' && this.peekNext() === '>') {
      return this.scanArrow();
    }

    if (char === '{') {
      return this.scanSingle(TokenType.BRACE_OPEN);
    }

    if (char === '}') {
      return this.scanSingle(TokenType.BRACE_CLOSE);
    }

    // Handle identifiers/keywords
    if (this.isAlpha(char)) {
      return this.scanIdentifierOrKeyword();
    }

    // Handle numbers
    if (this.isDigit(char)) {
      return this.scanNumber();
    }

    throw new Error(`Unexpected character: ${char} at ${this.line}:${this.column}`);
  }

  private scanString(): Token {
    const start = this.position;
    const startColumn = this.column;

    this.advance(); // Skip opening quote

    while (!this.isAtEnd() && this.peek() !== '"') {
      if (this.peek() === '\n') {
        this.line++;
        this.column = 0;
      }
      this.advance();
    }

    if (this.isAtEnd()) {
      throw new Error(`Unterminated string at ${this.line}:${startColumn}`);
    }

    this.advance(); // Skip closing quote

    const value = this.source.substring(start + 1, this.position - 1);
    return this.makeToken(TokenType.STRING, value, startColumn);
  }

  private scanIdentifierOrKeyword(): Token {
    const start = this.position;
    const startColumn = this.column;

    while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
      this.advance();
    }

    const value = this.source.substring(start, this.position);
    const type = this.getKeywordType(value) || TokenType.IDENTIFIER;

    return this.makeToken(type, value, startColumn);
  }

  private getKeywordType(value: string): TokenType | null {
    const keywords: Record<string, TokenType> = {
      'workspace': TokenType.WORKSPACE,
      'model': TokenType.MODEL,
      'views': TokenType.VIEWS,
      'styles': TokenType.STYLES,
      'person': TokenType.PERSON,
      'softwareSystem': TokenType.SOFTWARE_SYSTEM,
      'container': TokenType.CONTAINER,
      'component': TokenType.COMPONENT,
      'systemContext': TokenType.SYSTEM_CONTEXT,
    };

    return keywords[value] || null;
  }

  // Helper methods
  private peek(): string {
    return this.source[this.position];
  }

  private peekNext(): string {
    return this.source[this.position + 1];
  }

  private advance(): string {
    this.column++;
    return this.source[this.position++];
  }

  private isAtEnd(): boolean {
    return this.position >= this.source.length;
  }

  private isAlpha(char: string): boolean {
    return /[a-zA-Z_]/.test(char);
  }

  private isDigit(char: string): boolean {
    return /[0-9]/.test(char);
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isAlpha(char) || this.isDigit(char);
  }
}
```

**Acceptance Criteria**:
- [ ] Lexer tokenizes strings correctly
- [ ] Lexer handles identifiers and keywords
- [ ] Lexer tracks line/column numbers
- [ ] Lexer handles comments (`//` and `/* */`)
- [ ] Lexer reports errors with positions

---

### Task 1.3: Implement String Tokenization
**Time**: 30 minutes
**Priority**: Critical

**Description**: Handle quoted strings with escape sequences.

**Edge Cases**:
- Multiline strings
- Escaped quotes (`\"`)
- Empty strings

**Acceptance Criteria**:
- [ ] Handles single-line strings
- [ ] Handles multiline strings
- [ ] Handles escape sequences
- [ ] Reports unterminated strings

---

### Task 1.4: Write Lexer Unit Tests
**File**: `test/suite/structurizr/lexer.test.ts`
**Time**: 1.5 hours
**Priority**: High

**Description**: Comprehensive lexer tests.

**Test Cases**:
- Tokenize keywords (`workspace`, `model`, `person`, etc.)
- Tokenize strings (simple, multiline, escaped)
- Tokenize operators (`->`, `{`, `}`)
- Tokenize comments (line and block)
- Error cases (unterminated string, invalid characters)
- Line/column tracking accuracy

**Acceptance Criteria**:
- [ ] 30+ test cases
- [ ] All token types tested
- [ ] Error cases covered
- [ ] Position tracking verified

---

### Task 1.5: Performance Benchmark Lexer
**Time**: 30 minutes
**Priority**: Medium

**Description**: Benchmark lexer performance.

**Benchmarks**:
- Small file (100 lines) - target: < 10ms
- Medium file (500 lines) - target: < 30ms
- Large file (2000 lines) - target: < 100ms

**Acceptance Criteria**:
- [ ] Benchmarks run successfully
- [ ] Performance targets met
- [ ] Results documented

---

## Category 2: Parser & AST Builder

**Purpose**: Build Abstract Syntax Tree from tokens
**Estimated Time**: 6-7 hours
**Priority**: Critical Path

### Task 2.1: Define AST Node Types
**File**: `src/parser/structurizr/ast.ts`
**Time**: 1 hour
**Priority**: Critical

**Description**: Define all AST node types.

**AST Structure**:
```typescript
export interface ASTNode {
  type: string;
  location: { line: number; column: number };
}

export interface WorkspaceNode extends ASTNode {
  type: 'workspace';
  name: string;
  model?: ModelNode;
  views?: ViewsNode;
  styles?: StylesNode;
}

export interface ModelNode extends ASTNode {
  type: 'model';
  elements: ElementNode[];
  relationships: RelationshipNode[];
}

export interface ElementNode extends ASTNode {
  type: 'element';
  elementType: 'person' | 'softwareSystem' | 'container' | 'component';
  identifier: string;
  name: string;
  description?: string;
  technology?: string;
  tags?: string[];
  children?: ElementNode[]; // For nested containers/components
}

export interface RelationshipNode extends ASTNode {
  type: 'relationship';
  source: string;
  destination: string;
  description?: string;
  technology?: string;
  tags?: string[];
}

export interface ViewsNode extends ASTNode {
  type: 'views';
  views: ViewNode[];
}

export interface ViewNode extends ASTNode {
  type: 'view';
  viewType: 'systemContext' | 'container' | 'component';
  key: string;
  description?: string;
  include?: string[]; // Element identifiers to include
  exclude?: string[]; // Element identifiers to exclude
}

export interface StylesNode extends ASTNode {
  type: 'styles';
  elementStyles: ElementStyleNode[];
  relationshipStyles: RelationshipStyleNode[];
}

export interface ElementStyleNode extends ASTNode {
  type: 'elementStyle';
  tag: string;
  background?: string;
  color?: string;
  shape?: string;
}

export interface RelationshipStyleNode extends ASTNode {
  type: 'relationshipStyle';
  tag: string;
  color?: string;
  thickness?: number;
  style?: 'solid' | 'dashed' | 'dotted';
}
```

**Acceptance Criteria**:
- [ ] All AST node types defined
- [ ] Types exported
- [ ] JSDoc comments added

---

### Task 2.2: Implement Parser Core
**File**: `src/parser/structurizr/Parser.ts`
**Time**: 2.5 hours
**Priority**: Critical

**Description**: Recursive descent parser to build AST.

**Parser Structure**:
```typescript
export class StructurizrParser {
  private tokens: Token[];
  private current: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  public parse(): WorkspaceNode {
    return this.parseWorkspace();
  }

  private parseWorkspace(): WorkspaceNode {
    this.expect(TokenType.WORKSPACE);
    const name = this.expect(TokenType.STRING).value;
    this.expect(TokenType.BRACE_OPEN);

    let model: ModelNode | undefined;
    let views: ViewsNode | undefined;
    let styles: StylesNode | undefined;

    while (!this.check(TokenType.BRACE_CLOSE)) {
      const token = this.peek();

      if (token.type === TokenType.MODEL) {
        model = this.parseModel();
      } else if (token.type === TokenType.VIEWS) {
        views = this.parseViews();
      } else if (token.type === TokenType.STYLES) {
        styles = this.parseStyles();
      } else {
        throw this.error(`Unexpected token: ${token.type}`);
      }
    }

    this.expect(TokenType.BRACE_CLOSE);

    return {
      type: 'workspace',
      name,
      model,
      views,
      styles,
      location: { line: 1, column: 1 },
    };
  }

  private parseModel(): ModelNode {
    const startToken = this.expect(TokenType.MODEL);
    this.expect(TokenType.BRACE_OPEN);

    const elements: ElementNode[] = [];
    const relationships: RelationshipNode[] = [];

    while (!this.check(TokenType.BRACE_CLOSE)) {
      const token = this.peek();

      if (this.isElementType(token.type)) {
        elements.push(this.parseElement());
      } else if (token.type === TokenType.IDENTIFIER) {
        // Relationship: identifier -> identifier "description"
        relationships.push(this.parseRelationship());
      } else {
        this.advance(); // Skip unknown tokens
      }
    }

    this.expect(TokenType.BRACE_CLOSE);

    return {
      type: 'model',
      elements,
      relationships,
      location: { line: startToken.line, column: startToken.column },
    };
  }

  private parseElement(): ElementNode {
    const typeToken = this.advance();
    const elementType = this.getElementType(typeToken.type);

    const identifier = this.expect(TokenType.IDENTIFIER).value;
    const name = this.check(TokenType.STRING) ? this.advance().value : identifier;

    let description: string | undefined;
    let technology: string | undefined;
    let tags: string[] | undefined;
    let children: ElementNode[] | undefined;

    if (this.check(TokenType.BRACE_OPEN)) {
      this.advance();

      // Parse element properties and children
      while (!this.check(TokenType.BRACE_CLOSE)) {
        const token = this.peek();

        if (token.type === TokenType.STRING) {
          // First string is description, second is technology
          if (!description) {
            description = this.advance().value;
          } else if (!technology) {
            technology = this.advance().value;
          }
        } else if (this.isElementType(token.type)) {
          if (!children) children = [];
          children.push(this.parseElement());
        } else {
          this.advance();
        }
      }

      this.expect(TokenType.BRACE_CLOSE);
    }

    return {
      type: 'element',
      elementType,
      identifier,
      name,
      description,
      technology,
      tags,
      children,
      location: { line: typeToken.line, column: typeToken.column },
    };
  }

  private parseRelationship(): RelationshipNode {
    const sourceToken = this.expect(TokenType.IDENTIFIER);
    const source = sourceToken.value;

    this.expect(TokenType.ARROW);

    const destination = this.expect(TokenType.IDENTIFIER).value;

    let description: string | undefined;
    let technology: string | undefined;

    if (this.check(TokenType.STRING)) {
      description = this.advance().value;

      if (this.check(TokenType.STRING)) {
        technology = this.advance().value;
      }
    }

    return {
      type: 'relationship',
      source,
      destination,
      description,
      technology,
      location: { line: sourceToken.line, column: sourceToken.column },
    };
  }

  // Helper methods
  private peek(): Token {
    return this.tokens[this.current];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.current++;
    return this.previous();
  }

  private previous(): Token {
    return this.tokens[this.current - 1];
  }

  private check(type: TokenType): boolean {
    if (this.isAtEnd()) return false;
    return this.peek().type === type;
  }

  private expect(type: TokenType): Token {
    if (this.check(type)) return this.advance();
    throw this.error(`Expected ${type}, got ${this.peek().type}`);
  }

  private isAtEnd(): boolean {
    return this.peek().type === TokenType.EOF;
  }

  private error(message: string): Error {
    const token = this.peek();
    return new Error(`${message} at ${token.line}:${token.column}`);
  }

  private isElementType(type: TokenType): boolean {
    return [
      TokenType.PERSON,
      TokenType.SOFTWARE_SYSTEM,
      TokenType.CONTAINER,
      TokenType.COMPONENT,
    ].includes(type);
  }

  private getElementType(tokenType: TokenType): 'person' | 'softwareSystem' | 'container' | 'component' {
    switch (tokenType) {
      case TokenType.PERSON: return 'person';
      case TokenType.SOFTWARE_SYSTEM: return 'softwareSystem';
      case TokenType.CONTAINER: return 'container';
      case TokenType.COMPONENT: return 'component';
      default: throw new Error(`Invalid element type: ${tokenType}`);
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Parses workspace block
- [ ] Parses model block with elements and relationships
- [ ] Parses views block
- [ ] Parses styles block
- [ ] Reports errors with line/column numbers

---

### Task 2.3: Implement View Parsing
**Time**: 1 hour
**Priority**: High

**Description**: Parse views block (systemContext, container, component).

**View Syntax**:
```dsl
views {
    systemContext banking "SystemContext" {
        include *
        exclude email
    }

    container banking "ContainerView" {
        include *
    }
}
```

**Acceptance Criteria**:
- [ ] Parses systemContext views
- [ ] Parses container views
- [ ] Parses component views
- [ ] Handles include/exclude directives

---

### Task 2.4: Implement Style Parsing
**Time**: 45 minutes
**Priority**: Medium

**Description**: Parse styles block.

**Style Syntax**:
```dsl
styles {
    element "Person" {
        background #08427B
        color #ffffff
        shape Person
    }

    relationship "Relationship" {
        color #707070
    }
}
```

**Acceptance Criteria**:
- [ ] Parses element styles
- [ ] Parses relationship styles
- [ ] Extracts colors, shapes, etc.

---

### Task 2.5: Write Parser Unit Tests
**File**: `test/suite/structurizr/parser.test.ts`
**Time**: 2 hours
**Priority**: High

**Description**: Comprehensive parser tests.

**Test Cases**:
- Parse complete workspace with all blocks
- Parse model with nested elements (containers inside systems)
- Parse relationships with descriptions and technology
- Parse views with include/exclude
- Parse styles
- Error cases (missing braces, invalid syntax)

**Acceptance Criteria**:
- [ ] 40+ test cases
- [ ] All AST node types tested
- [ ] Error cases covered

---

### Task 2.6: Integration Test (Lexer + Parser)
**Time**: 30 minutes
**Priority**: High

**Description**: End-to-end test from source code to AST.

**Test Case**:
```typescript
test('parses complete Structurizr DSL file', () => {
  const source = `
    workspace "Banking System" {
      model {
        person customer "Customer"
        softwareSystem banking "Internet Banking System" {
          container webapp "Web Application" {
            component login "Login Controller"
          }
        }

        customer -> banking "Uses"
      }

      views {
        systemContext banking "SystemContext" {
          include *
        }
      }
    }
  `;

  const lexer = new StructurizrLexer(source);
  const tokens = lexer.tokenize();
  const parser = new StructurizrParser(tokens);
  const ast = parser.parse();

  assert.strictEqual(ast.type, 'workspace');
  assert.strictEqual(ast.name, 'Banking System');
  assert.ok(ast.model);
  assert.strictEqual(ast.model.elements.length, 2); // customer, banking
});
```

**Acceptance Criteria**:
- [ ] Full pipeline tested (source → tokens → AST)
- [ ] Complex examples work
- [ ] Error propagation works

---

## Category 3: Adapter to C4Model

**Purpose**: Convert Structurizr AST to C4Model IR
**Estimated Time**: 4-5 hours
**Priority**: Critical Path

### Task 3.1: Create Structurizr Adapter
**File**: `src/adapter/StructurizrAdapter.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Adapter that converts Structurizr AST to C4Model IR.

**Adapter Structure**:
```typescript
import { WorkspaceNode, ElementNode, RelationshipNode, ViewNode } from '../parser/structurizr/ast';
import { C4Model, C4Element, C4Rel, C4View, C4ElementType } from '../model/C4Model';

export class StructurizrAdapter {
  public convert(workspace: WorkspaceNode): C4Model {
    const views: C4View[] = [];

    if (workspace.views) {
      for (const viewNode of workspace.views.views) {
        const view = this.convertView(viewNode, workspace.model);
        views.push(view);
      }
    }

    return {
      workspace: workspace.name,
      views,
    };
  }

  private convertView(viewNode: ViewNode, modelNode: ModelNode | undefined): C4View {
    if (!modelNode) {
      throw new Error('Model is required to build views');
    }

    // Build element map for quick lookup
    const elementMap = this.buildElementMap(modelNode.elements);

    // Filter elements based on view's include/exclude
    const filteredElements = this.filterElements(
      modelNode.elements,
      viewNode.include,
      viewNode.exclude
    );

    // Convert elements
    const elements = filteredElements.map(el => this.convertElement(el, elementMap));

    // Convert relationships
    const relationships = modelNode.relationships
      .filter(rel => this.shouldIncludeRelationship(rel, filteredElements))
      .map(rel => this.convertRelationship(rel));

    return {
      type: this.mapViewType(viewNode.viewType),
      elements,
      relationships,
    };
  }

  private convertElement(node: ElementNode, elementMap: Map<string, ElementNode>): C4Element {
    return {
      id: node.identifier,
      label: node.name,
      type: this.mapElementType(node.elementType),
      tags: node.tags,
      technology: node.technology,
      description: node.description,
    };
  }

  private convertRelationship(node: RelationshipNode): C4Rel {
    return {
      id: `${node.source}-${node.destination}`,
      from: node.source,
      to: node.destination,
      label: node.description || '',
      technology: node.technology,
      relType: 'uses', // Default mapping
    };
  }

  private mapElementType(structurizrType: string): C4ElementType {
    switch (structurizrType) {
      case 'person': return 'Person';
      case 'softwareSystem': return 'SoftwareSystem';
      case 'container': return 'Container';
      case 'component': return 'Component';
      default: return 'SoftwareSystem';
    }
  }

  private mapViewType(structurizrViewType: string): 'system-context' | 'container' | 'component' {
    switch (structurizrViewType) {
      case 'systemContext': return 'system-context';
      case 'container': return 'container';
      case 'component': return 'component';
      default: return 'system-context';
    }
  }

  private buildElementMap(elements: ElementNode[]): Map<string, ElementNode> {
    const map = new Map<string, ElementNode>();

    const addToMap = (el: ElementNode) => {
      map.set(el.identifier, el);
      if (el.children) {
        el.children.forEach(addToMap);
      }
    };

    elements.forEach(addToMap);
    return map;
  }

  private filterElements(
    elements: ElementNode[],
    include?: string[],
    exclude?: string[]
  ): ElementNode[] {
    // Flatten nested elements
    const flatElements: ElementNode[] = [];

    const flatten = (el: ElementNode) => {
      flatElements.push(el);
      if (el.children) {
        el.children.forEach(flatten);
      }
    };

    elements.forEach(flatten);

    // Apply filters
    let filtered = flatElements;

    if (include && include.includes('*')) {
      // Include all
      filtered = flatElements;
    } else if (include) {
      filtered = flatElements.filter(el => include.includes(el.identifier));
    }

    if (exclude) {
      filtered = filtered.filter(el => !exclude.includes(el.identifier));
    }

    return filtered;
  }

  private shouldIncludeRelationship(rel: RelationshipNode, elements: ElementNode[]): boolean {
    const elementIds = new Set(elements.map(el => el.identifier));
    return elementIds.has(rel.source) && elementIds.has(rel.destination);
  }
}
```

**Acceptance Criteria**:
- [ ] Converts workspace to C4Model
- [ ] Converts elements correctly
- [ ] Converts relationships correctly
- [ ] Handles nested elements (containers in systems)
- [ ] Applies include/exclude filters

---

### Task 3.2: Handle Nested Elements
**Time**: 1 hour
**Priority**: High

**Description**: Handle containers nested inside software systems.

**Example**:
```dsl
softwareSystem banking "Banking System" {
    container webapp "Web App" {
        component login "Login Controller"
    }
}
```

**Acceptance Criteria**:
- [ ] Flattens nested hierarchy
- [ ] Preserves parent-child relationships
- [ ] Handles multiple nesting levels

---

### Task 3.3: Implement Include/Exclude Logic
**Time**: 45 minutes
**Priority**: Medium

**Description**: Filter elements based on view directives.

**Example**:
```dsl
systemContext banking {
    include *         // Include all elements
    exclude email     // Except email system
}
```

**Acceptance Criteria**:
- [ ] `include *` includes all elements
- [ ] `include id1 id2` includes only specified elements
- [ ] `exclude id1` excludes specified elements
- [ ] Include/exclude work together

---

### Task 3.4: Write Adapter Unit Tests
**File**: `test/suite/adapter/structurizr-adapter.test.ts`
**Time**: 1.5 hours
**Priority**: High

**Description**: Test Structurizr AST → C4Model conversion.

**Test Cases**:
- Convert simple workspace
- Convert nested elements
- Apply include/exclude filters
- Map element types correctly
- Map relationship types correctly

**Acceptance Criteria**:
- [ ] 25+ test cases
- [ ] All mapping scenarios tested
- [ ] Edge cases covered

---

### Task 3.5: Integration Test (Parser + Adapter)
**Time**: 30 minutes
**Priority**: High

**Description**: End-to-end test from DSL to C4Model.

**Acceptance Criteria**:
- [ ] Full pipeline tested (DSL → AST → C4Model)
- [ ] Complex examples work
- [ ] Can render with existing layout/render pipeline

---

## Category 4: Style Support

**Purpose**: Map Structurizr styles to C4X themes
**Estimated Time**: 2-3 hours
**Priority**: High

### Task 4.1: Parse Style Overrides
**Time**: 1 hour
**Priority**: High

**Description**: Extract style information from Structurizr styles block.

**Acceptance Criteria**:
- [ ] Parse element styles (background, color, shape)
- [ ] Parse relationship styles (color, thickness)
- [ ] Store styles in AST

---

### Task 4.2: Map Styles to Theme
**Time**: 1 hour
**Priority**: High

**Description**: Apply Structurizr styles to current theme.

**Approach**:
- Create theme clone
- Override colors based on Structurizr styles
- Apply to renderer

**Acceptance Criteria**:
- [ ] Element colors applied correctly
- [ ] Relationship colors applied
- [ ] Theme remains valid

---

### Task 4.3: Test Style Mapping
**Time**: 45 minutes
**Priority**: Medium

**Description**: Test style override logic.

**Acceptance Criteria**:
- [ ] Styles applied correctly
- [ ] Original theme unchanged
- [ ] Multiple style overrides work

---

## Category 5: Testing & Quality

**Purpose**: Comprehensive testing and quality assurance
**Estimated Time**: 2-3 hours
**Priority**: High

### Task 5.1: Integration Tests (Full Pipeline)
**File**: `test/suite/integration/structurizr-integration.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: End-to-end tests from `.dsl` file to rendered SVG.

**Test Scenarios**:
- Open `.dsl` file → parse → render
- Complex workspace with nested elements
- Multiple views in one workspace
- Style overrides applied

**Acceptance Criteria**:
- [ ] 10+ integration tests
- [ ] Full pipeline tested
- [ ] Performance verified (< 300ms)

---

### Task 5.2: Compatibility Matrix Documentation
**File**: `docs/STRUCTURIZR-COMPATIBILITY.md`
**Time**: 1 hour
**Priority**: High

**Description**: Document which Structurizr features are supported.

**Supported Features** (80% target):
- ✅ workspace, model, views blocks
- ✅ person, softwareSystem, container, component
- ✅ Relationships with `->` operator
- ✅ systemContext, container, component views
- ✅ include/exclude in views
- ✅ Basic styles (colors)

**Unsupported Features**:
- ❌ Deployment diagrams
- ❌ Dynamic diagrams
- ❌ Filtered views
- ❌ !include directive
- ❌ !docs, !adrs

**Acceptance Criteria**:
- [ ] Matrix complete
- [ ] Examples provided
- [ ] Migration guide included

---

### Task 5.3: Performance Benchmarks
**Time**: 30 minutes
**Priority**: Medium

**Description**: Benchmark Structurizr parsing and rendering.

**Benchmarks**:
- Parse small file (50 lines) - target: < 30ms
- Parse medium file (200 lines) - target: < 80ms
- Parse large file (1000 lines) - target: < 150ms
- Full render (parse + layout + SVG) - target: < 300ms

**Acceptance Criteria**:
- [ ] All benchmarks pass
- [ ] Results documented

---

### Task 5.4: Run Code Review & QA
**Time**: 45 minutes
**Priority**: High

**Description**: Validate Phase 4 quality.

**Acceptance Criteria**:
- [ ] Code review completed (target: > 95/100)
- [ ] QA validation passed
- [ ] No regressions in Phase 1-3 features

---

## Category 6: Documentation

**Purpose**: Document Structurizr DSL support
**Estimated Time**: 1-2 hours
**Priority**: Medium

### Task 6.1: Update README
**File**: `README.md`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Add Structurizr DSL examples to README.

**Sections to Add**:
- Structurizr DSL support announcement
- Example `.dsl` file
- Link to compatibility matrix

**Acceptance Criteria**:
- [ ] Examples added
- [ ] Compatibility link included

---

### Task 6.2: Create Migration Guide
**File**: `docs/STRUCTURIZR-MIGRATION.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Guide for migrating from Structurizr server to C4X.

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

### Task 6.3: Update CHANGELOG
**File**: `CHANGELOG.md`
**Time**: 15 minutes
**Priority**: Medium

**Description**: Document v0.4.0 changes.

**Changelog Entry**:
```markdown
## [0.4.0] - 2025-11-17

### Added
- **Structurizr DSL Support**: Preview `.dsl` files in VS Code
  - Hand-rolled lexer and parser (no Java required)
  - 80% feature coverage (workspace, model, views, styles)
  - Maps to C4Model IR (reuses layout/render pipeline)
  - Include/exclude view filters
  - Style overrides

### Performance
- DSL parsing: < 100ms (typical files)
- Full render: < 300ms (parse + layout + SVG)

### Documentation
- Structurizr compatibility matrix
- Migration guide (Structurizr → C4X)
```

**Acceptance Criteria**:
- [ ] Changelog updated
- [ ] Version bumped to 0.4.0

---

## Timeline Breakdown

### Week 1 (Days 1-3): Lexer + Parser

**Day 1** (6-7 hours):
- Tasks 0.1-0.3: Cleanup and research
- Tasks 1.1-1.3: Token types, lexer core, string tokenization

**Day 2** (6-7 hours):
- Tasks 1.4-1.5: Lexer tests and benchmarks
- Tasks 2.1-2.2: AST node types, parser core

**Day 3** (5-6 hours):
- Tasks 2.3-2.6: View parsing, style parsing, parser tests, integration

---

### Week 2 (Days 4-5): Adapter + Polish

**Day 4** (6-7 hours):
- Tasks 3.1-3.5: Adapter implementation and tests

**Day 5** (3-4 hours):
- Tasks 4.1-4.3: Style support
- Tasks 5.1-5.4: Testing and QA

**Day 6** (1-2 hours):
- Tasks 6.1-6.3: Documentation
- Final validation, PR, merge

---

## Risk Mitigation

### High-Risk Areas

**1. Structurizr DSL Complexity**
- **Risk**: DSL more complex than expected, parser takes too long
- **Mitigation**: Start with 80% use case coverage, defer advanced features
- **Fallback**: Best-effort parsing (skip unsupported features)

**2. Nested Element Handling**
- **Risk**: Nested containers/components complicate layout
- **Mitigation**: Flatten hierarchy during adapter phase
- **Fallback**: Don't support nesting in v1.0

**3. Style Mapping**
- **Risk**: Structurizr styles don't map cleanly to C4X themes
- **Mitigation**: Create style override layer on top of themes
- **Fallback**: Ignore styles, use default theme

---

## Success Metrics

### Performance Targets (Must Meet)
- ✅ **Parsing**: < 100ms (typical `.dsl` file)
- ✅ **Full Render**: < 300ms (parse + layout + SVG)

### Quality Targets (Must Meet)
- ✅ **Test Coverage**: > 80%
- ✅ **Parser Tests**: 50+ cases
- ✅ **Adapter Tests**: 25+ cases
- ✅ **Code Review**: > 95/100
- ✅ **Zero Regressions**: Phase 1-3 tests pass

### Functional Targets (Must Meet)
- ✅ **80% Feature Coverage**: Support common Structurizr features
- ✅ **Preview Works**: `.dsl` files render correctly
- ✅ **Graceful Degradation**: Unsupported features show warnings

---

## Deliverables Checklist

### Code Deliverables
- [ ] Lexer (`src/parser/structurizr/Lexer.ts`)
- [ ] Token types (`src/parser/structurizr/tokens.ts`)
- [ ] Parser (`src/parser/structurizr/Parser.ts`)
- [ ] AST types (`src/parser/structurizr/ast.ts`)
- [ ] Adapter (`src/adapter/StructurizrAdapter.ts`)
- [ ] Style mapper (`src/adapter/StyleMapper.ts`)

### Test Deliverables
- [ ] Lexer tests (30+ cases)
- [ ] Parser tests (40+ cases)
- [ ] Adapter tests (25+ cases)
- [ ] Integration tests (10+ cases)
- [ ] Performance benchmarks

### Documentation Deliverables
- [ ] Compatibility matrix (`docs/STRUCTURIZR-COMPATIBILITY.md`)
- [ ] Migration guide (`docs/STRUCTURIZR-MIGRATION.md`)
- [ ] README updated
- [ ] CHANGELOG updated for v0.4.0

---

## Next Phase Preview

**Phase 5 (M4 - PlantUML C4)**:
- PlantUML C4 macro parser
- Map PlantUML macros → C4Model IR
- 70% feature coverage
- Estimated time: 18-22 hours (3-4 days)

---

**Document Owner**: Code Review Agent (VSCode Extension Expert)
**Last Updated**: October 19, 2025
**Status**: 🔴 NOT STARTED - Ready to begin Phase 4
