# C4X Extension - High-Level Design

**Project**: C4X VS Code Extension - Make C4 diagrams as easy as Mermaid
**Last Updated**: 2025-10-19

---

## 📐 System Architecture

### Extension Host + Webview Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Window                         │
├───────────────────────┬─────────────────────────────────────┤
│   Editor Pane         │        Webview Pane                 │
│  ┌─────────────────┐  │  ┌─────────────────────────────┐   │
│  │ example.c4x     │  │  │   Preview Panel             │   │
│  │                 │  │  │                             │   │
│  │ %%{ c4: ... }%% │  │  │  ┌───────────────────────┐  │   │
│  │ graph TB        │  │  │  │                       │  │   │
│  │   Customer[...] │  │  │  │    [Customer]         │  │   │
│  │   Banking[...]  │  │  │  │         │             │  │   │
│  │                 │  │  │  │         ▼             │  │   │
│  │   Customer -->  │  │  │  │  [Banking System]     │  │   │
│  │   Banking       │  │  │  │                       │  │   │
│  │                 │  │  │  │   (SVG Rendering)     │  │   │
│  └─────────────────┘  │  │  └───────────────────────┘  │   │
│                       │  │                             │   │
└───────────────────────┴──┴─────────────────────────────────┘
        ▲                           ▲
        │                           │
        │                           │
┌───────┴───────────────────────────┴─────────────────────────┐
│           Extension Host (Node.js Process)                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  File Watcher → Parser → IR → Layout → SVG → Webview       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔄 Multi-Dialect Pipeline

### Pipeline Overview

```
Input Files (.c4x, .dsl, .puml)
    ↓
┌───────────────────────────────────────────────────────┐
│              Parser Layer (Dialect-Specific)          │
├───────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │ C4XParser│  │ Structurizr  │  │  PlantUML    │   │
│  │ (PEG.js) │  │   Parser     │  │   Parser     │   │
│  └─────┬────┘  └──────┬───────┘  └──────┬───────┘   │
│        │              │                 │            │
│        └──────────────┼─────────────────┘            │
└───────────────────────┼──────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│         Intermediate Representation (IR)              │
├───────────────────────────────────────────────────────┤
│                   C4Model                             │
│  ┌─────────────────────────────────────────────────┐ │
│  │ elements: C4Element[]                           │ │
│  │   - id, label, type (Person, System, ...)      │ │
│  │ relationships: C4Rel[]                          │ │
│  │   - from, to, label, technology                 │ │
│  │ views: C4View[]                                 │ │
│  │   - type (system-context, container, ...)      │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│              Layout Engine (Dagre.js)                   │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐ │
│  │ Input: C4Model IR (elements + relationships)   │ │
│  │ Output: Positioned layout (x, y, width, height)│ │
│  │ Algorithm: Layered (hierarchical)              │ │
│  │ Direction: Top-down                             │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│              SVG Renderer (Theme-Aware)               │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐ │
│  │ Input: Positioned layout + Theme                │ │
│  │ Output: SVG markup (inline, no external deps)  │ │
│  │ Features: Shapes, colors, arrows, labels        │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────┘
                        ▼
┌───────────────────────────────────────────────────────┐
│           Webview Display (Sandboxed)                 │
├───────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────┐ │
│  │ <div class="c4x-preview">                       │ │
│  │   <svg>... (diagram) ...</svg>                  │ │
│  │ </div>                                           │ │
│  └─────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

---

## 📦 Component Details

### 1. Parser Layer

**Responsibility**: Convert dialect-specific syntax → C4Model IR

#### C4XParser (PEG.js)
```typescript
// src/parser/C4XParser.ts
import { parse as pegParse } from './c4x.pegjs';
import { C4Model } from '../model/C4Model';

export class C4XParser {
  parse(content: string): C4Model {
    try {
      const ast = pegParse(content); // PEG.js parser
      return this.astToModel(ast);    // Convert AST → C4Model
    } catch (err) {
      throw new ParseError(err.message, err.location);
    }
  }
}
```

**Performance**: < 50ms (30-node diagram)

---

#### StructurizrParser (Hand-rolled)
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

**Coverage**: ~80% of Structurizr DSL features

---

#### PlantUMLParser (Regex + State Machine)
```typescript
// src/parser/PlantUMLParser.ts
export class PlantUMLParser {
  parse(content: string): C4Model {
    const elements: C4Element[] = [];
    const relationships: C4Rel[] = [];

    const lines = content.split('\n');
    for (const line of lines) {
      // Detect macros: Person(), System(), Rel()
      if (line.match(/Person\(/)) {
        elements.push(this.parsePerson(line));
      } else if (line.match(/Rel\(/)) {
        relationships.push(this.parseRel(line));
      }
      // ... more macros
    }

    return { workspace: 'PlantUML C4', views: [{ type: 'system-context', elements, relationships }] };
  }
}
```

**Coverage**: ~70% of PlantUML C4 macros

---

### 2. Intermediate Representation (IR)

**Responsibility**: Common C4Model type system for all dialects

```typescript
// src/model/C4Model.ts
export type C4ElementType = 'Person' | 'SoftwareSystem' | 'Container' | 'Component';

export interface C4Element {
  id: string;                   // Unique identifier
  label: string;                // Display name
  type: C4ElementType;          // Person, System, Container, Component
  description?: string;         // Optional description
  technology?: string;          // e.g., "React + TypeScript"
  tags?: string[];              // e.g., ["External", "Database"]
}

export interface C4Rel {
  from: string;                 // Source element ID
  to: string;                   // Target element ID
  label: string;                // Relationship description
  technology?: string;          // e.g., "HTTPS", "JSON/REST"
  relType: 'uses' | 'async' | 'sync';
}

export interface C4View {
  type: 'system-context' | 'container' | 'component' | 'deployment';
  elements: C4Element[];
  relationships: C4Rel[];
}

export interface C4Model {
  workspace: string;            // Workspace name
  views: C4View[];
}
```

**Validation**:
```typescript
export class C4Validator {
  validate(model: C4Model): ValidationError[] {
    const errors: ValidationError[] = [];

    // Check for duplicate IDs
    const ids = model.views.flatMap(v => v.elements.map(e => e.id));
    const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
    if (duplicates.length > 0) {
      errors.push(new ValidationError(`Duplicate IDs: ${duplicates.join(', ')}`));
    }

    // Check relationships reference valid elements
    for (const view of model.views) {
      for (const rel of view.relationships) {
        if (!view.elements.find(e => e.id === rel.from)) {
          errors.push(new ValidationError(`Relationship from "${rel.from}" not found`));
        }
        if (!view.elements.find(e => e.id === rel.to)) {
          errors.push(new ValidationError(`Relationship to "${rel.to}" not found`));
        }
      }
    }

    return errors;
  }
}
```

---

### 3. Layout Engine (Dagre.js)

**Responsibility**: Position elements and route edges

```typescript
// src/layout/DagreLayoutEngine.ts
import ELK from 'elkjs/lib/elk.bundled.js';
import { C4Model, C4Element, C4Rel } from '../model/C4Model';

export interface LayoutResult {
  elements: PositionedElement[];
  relationships: RoutedRelationship[];
  width: number;
  height: number;
}

export class DagreLayoutEngine {
  private elk = new ELK();

  async layout(model: C4Model): Promise<LayoutResult> {
    const view = model.views[0]; // For now, layout first view

    const graph = {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': 'layered',         // Hierarchical layout
        'elk.direction': 'DOWN',            // Top-down
        'elk.spacing.nodeNode': '50',       // 50px between nodes
        'elk.edgeRouting': 'ORTHOGONAL',    // Right-angle edges
      },
      children: view.elements.map(elem => this.toElkNode(elem)),
      edges: view.relationships.map(rel => this.toElkEdge(rel)),
    };

    const result = await this.elk.layout(graph);

    return {
      elements: result.children.map(node => ({
        id: node.id,
        x: node.x,
        y: node.y,
        width: node.width,
        height: node.height,
        element: view.elements.find(e => e.id === node.id)!,
      })),
      relationships: result.edges.map(edge => ({
        from: edge.sources[0],
        to: edge.targets[0],
        points: edge.sections[0].bendPoints || [],
      })),
      width: result.width,
      height: result.height,
    };
  }

  private toElkNode(element: C4Element): ElkNode {
    const labelLines = element.label.split('<br/>');
    const width = Math.max(...labelLines.map(line => line.length * 8)) + 40;
    const height = labelLines.length * 20 + 40;

    return {
      id: element.id,
      width,
      height,
      labels: [{ text: element.label }],
    };
  }
}
```

**Performance**: < 100ms (30-node diagram)

---

### 4. SVG Renderer

**Responsibility**: Generate SVG markup from layout

```typescript
// src/render/SvgBuilder.ts
import { LayoutResult } from '../layout/DagreLayoutEngine';
import { Theme } from '../themes/Theme';

export class SvgBuilder {
  build(layout: LayoutResult, theme: Theme): string {
    const elements = layout.elements.map(elem => this.renderElement(elem, theme)).join('\n');
    const relationships = layout.relationships.map(rel => this.renderRelationship(rel, theme)).join('\n');

    return `
      <svg width="${layout.width}" height="${layout.height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="${theme.colors.relationship}" />
          </marker>
        </defs>
        ${elements}
        ${relationships}
      </svg>
    `;
  }

  private renderElement(positioned: PositionedElement, theme: Theme): string {
    const color = this.getColor(positioned.element.type, theme);
    const textLines = positioned.element.label.split('<br/>');

    return `
      <g id="${positioned.id}">
        <rect x="${positioned.x}" y="${positioned.y}"
              width="${positioned.width}" height="${positioned.height}"
              fill="${color}" stroke="#333" stroke-width="2"
              rx="${theme.styles.borderRadius}" />
        ${textLines.map((line, i) => `
          <text x="${positioned.x + positioned.width / 2}"
                y="${positioned.y + 20 + i * 18}"
                text-anchor="middle"
                font-family="${theme.styles.fontFamily}"
                font-size="${theme.styles.fontSize}"
                fill="${theme.colors.text}">${line}</text>
        `).join('')}
      </g>
    `;
  }

  private getColor(type: C4ElementType, theme: Theme): string {
    switch (type) {
      case 'Person': return theme.colors.person;
      case 'SoftwareSystem': return theme.colors.softwareSystem;
      case 'Container': return theme.colors.container;
      case 'Component': return theme.colors.component;
    }
  }
}
```

---

### 5. Webview Provider

**Responsibility**: Manage webview lifecycle and communication

```typescript
// src/webview/WebviewProvider.ts
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { DagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { SvgBuilder } from '../render/SvgBuilder';

export class WebviewProvider {
  private panel?: vscode.WebviewPanel;
  private parser = new C4XParser();
  private layoutEngine = new DagreLayoutEngine();
  private svgBuilder = new SvgBuilder();

  async openPreview(document: vscode.TextDocument) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'c4xPreview',
        'C4X Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      this.panel.webview.html = this.getWebviewContent(this.panel.webview);
    }

    await this.updatePreview(document);
  }

  async updatePreview(document: vscode.TextDocument) {
    try {
      const model = this.parser.parse(document.getText());
      const layout = await this.layoutEngine.layout(model);
      const svg = this.svgBuilder.build(layout, currentTheme);

      this.panel?.webview.postMessage({
        type: 'update',
        svg,
      });
    } catch (err) {
      this.panel?.webview.postMessage({
        type: 'error',
        message: err.message,
      });
    }
  }

  private getWebviewContent(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;
    const nonce = getNonce();

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-Security-Policy"
              content="default-src 'none';
                       script-src ${cspSource} 'nonce-${nonce}';
                       style-src ${cspSource} 'unsafe-inline';
                       img-src ${cspSource} data:;">
      </head>
      <body>
        <div id="preview"></div>
        <div id="error" style="display:none; color:red;"></div>
        <script nonce="${nonce}">
          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'update') {
              document.getElementById('preview').innerHTML = message.svg;
              document.getElementById('error').style.display = 'none';
            } else if (message.type === 'error') {
              document.getElementById('error').textContent = message.message;
              document.getElementById('error').style.display = 'block';
            }
          });
        </script>
      </body>
      </html>
    `;
  }
}
```

---

## 🔐 Security

### Content Security Policy (CSP)

**Enforcement**: Strict CSP headers prevent XSS attacks

```typescript
const csp = `
  default-src 'none';                          // Block all by default
  script-src ${cspSource} 'nonce-${nonce}';    // Only scripts with nonce
  style-src ${cspSource} 'unsafe-inline';      // Allow inline styles (for SVG)
  img-src ${cspSource} data:;                  // Allow data URIs (for SVG)
`;
```

**Rationale**:
- Prevents inline scripts (XSS attacks)
- Enforces resource loading from extension only
- Required by VS Code Marketplace

---

## 📈 Performance Optimization

### Lazy Loading Strategy

```typescript
// src/extension.ts
export async function activate(context: vscode.ExtensionContext) {
  // Register commands immediately (< 10ms)
  context.subscriptions.push(
    vscode.commands.registerCommand('c4x.openPreview', async () => {
      // Lazy-load heavy dependencies only when needed
      const { DagreLayoutEngine } = await import('./layout/DagreLayoutEngine');
      // ... continue
    })
  );

  // Don't load Dagre.js until first preview
}
```

**Impact**: Activation time < 200ms (vs ~500ms if loading Dagre.js upfront)

---

### Caching Strategy

```typescript
// src/cache/DiagramCache.ts
export class DiagramCache {
  private cache = new Map<string, { model: C4Model; layout: LayoutResult }>();

  get(content: string): { model: C4Model; layout: LayoutResult } | undefined {
    const hash = this.hash(content);
    return this.cache.get(hash);
  }

  set(content: string, model: C4Model, layout: LayoutResult) {
    const hash = this.hash(content);
    this.cache.set(hash, { model, layout });
  }

  private hash(content: string): string {
    return crypto.createHash('md5').update(content).digest('hex');
  }
}
```

**Impact**: 50-100ms saved on re-render (if content unchanged)

---

## 🧪 Testing Strategy

### Unit Tests (Mocha)
```typescript
// test/parser/C4XParser.test.ts
import { C4XParser } from '../../src/parser/C4XParser';

describe('C4XParser', () => {
  it('should parse Person element', () => {
    const content = `
      %%{ c4: system-context }%%
      graph TB
        Customer[Customer<br/>Person]
    `;
    const model = new C4XParser().parse(content);
    assert.strictEqual(model.views[0].elements.length, 1);
    assert.strictEqual(model.views[0].elements[0].type, 'Person');
  });
});
```

---

## 📞 Questions or Suggestions?

### Architecture
**See**: [architecture/README.md](./README.md)

### Technology Stack
**See**: [tech-stack.md](./tech-stack.md)

### Code Review
**Agent**: Code Review Agent
**Command**: `/review-code`

---

**Maintained By**: Code Review Agent (VSCode Extension Expert)
**Last Review**: 2025-10-19 (Planning phase)
