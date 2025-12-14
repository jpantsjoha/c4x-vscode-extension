# C4X Extension - Architecture Overview

**Project**: C4X VS Code Extension - Make C4 diagrams as easy as Mermaid
**Last Updated**: 2025-10-19

---

## 📚 Architecture Documentation

This folder contains technical architecture documentation for the C4X extension.

```
architecture/
├── README.md (this file)           # Architecture overview
├── high-level-design.md            # System architecture and component design
└── tech-stack.md                   # Technology choices and justifications
```

---

## 🎯 Architectural Principles

### 1. Extension Host + Webview Pattern
**Pattern**: VS Code Extension Host (Node.js) + Webview (HTML/CSS/JS)

**Rationale**:
- **Separation of Concerns**: Extension Host handles file I/O, parsing; Webview handles rendering
- **Security**: Webview runs in sandboxed iframe with strict CSP
- **Performance**: Offload rendering to webview (doesn't block Extension Host)

**See**: [high-level-design.md](./high-level-design.md#extension-host--webview)

---

### 2. Multi-Dialect Support via Intermediate Representation (IR)
**Pattern**: Parser → IR → Layout → Render

**Rationale**:
- **Extensibility**: Add new dialects (C4X, Structurizr, PlantUML) without changing layout/render
- **Maintainability**: Single source of truth (C4Model IR)
- **Testability**: Test each layer independently

**Pipeline**:
```
.c4x file → C4XParser → C4Model IR → Dagre.js Layout → SVG Renderer → Webview
.dsl file → StructurizrParser → C4Model IR → (same)
.puml file → PlantUMLParser → C4Model IR → (same)
```

**See**: [high-level-design.md](./high-level-design.md#multi-dialect-pipeline)

---

### 3. Offline-First, Zero Dependencies
**Principle**: No external servers, no Java, no Docker

**Rationale**:
- **User Experience**: Instant preview, no setup required
- **Reliability**: Works offline, no network dependencies
- **Differentiation**: Competitors (Structurizr, PlantUML) require external dependencies

**Implementation**:
- **Parser**: PEG.js (runs in Node.js, no external tools)
- **Layout**: Dagre.js (bundled, no external server)
- **Rendering**: SVG (native browser support)

**See**: [tech-stack.md](./tech-stack.md#offline-first-stack)

---

### 4. Performance-First Design
**Targets**: < 200ms activation, < 250ms preview, < 50MB memory, < 1MB bundle

**Strategies**:
- **ESBuild**: Fast builds (< 500ms vs webpack 5-10s)
- **Lazy Loading**: Defer Dagre.js until first preview
- **Tree Shaking**: Remove unused code
- **Caching**: Cache parsed IR, layout results

**See**: [high-level-design.md](./high-level-design.md#performance-optimization)

---

### 5. Markdown Integration (Mermaid-Inspired)
**Pattern**: MarkdownIt plugin for ` ```c4x ` fenced blocks

**Rationale**:
- **Familiarity**: Mermaid users already know this pattern
- **Inline Rendering**: Diagrams render directly in Markdown preview
- **No External Files**: No need to save `.svg` separately

**See**: [high-level-design.md](./high-level-design.md#markdown-integration)

---

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      VS Code Extension Host (Node.js)       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   │
│  │  C4XParser   │   │ Structurizr  │   │  PlantUML    │   │
│  │   (PEG.js)   │   │   Parser     │   │   Parser     │   │
│  └──────┬───────┘   └──────┬───────┘   └──────┬───────┘   │
│         │                  │                  │            │
│         └──────────────────┼──────────────────┘            │
│                            ▼                                │
│                   ┌──────────────────┐                      │
│                   │   C4Model IR     │                      │
│                   │  (Common Model)  │                      │
│                   └────────┬─────────┘                      │
│                            │                                │
│                            ▼                                │
│                   ┌──────────────────┐                      │
│                   │  Dagre.js Layout   │                      │
│                   │    Engine        │                      │
│                   └────────┬─────────┘                      │
│                            │                                │
│                            ▼                                │
│                   ┌──────────────────┐                      │
│                   │   SVG Builder    │                      │
│                   │  (Theme Support) │                      │
│                   └────────┬─────────┘                      │
│                            │                                │
│                            ▼                                │
├─────────────────────────────────────────────────────────────┤
│                      Webview (Sandboxed)                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│         ┌────────────────────────────────────┐              │
│         │      SVG Preview                   │              │
│         │  (C4 Diagram Visualization)        │              │
│         └────────────────────────────────────┘              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**See**: [high-level-design.md](./high-level-design.md)

---

## 🛠️ Technology Stack

### Core Technologies
- **TypeScript** - Primary language (strict mode)
- **VS Code Extension API** - Extension framework
- **PEG.js** - C4X-DSL parser generator
- **Dagre.js** - Hierarchical layout engine
- **ESBuild** - Fast bundler

### Key Decisions
- **TDR-001**: ESBuild (vs Webpack, Rollup)
- **TDR-002**: PEG.js (vs Hand-rolled parser)
- **TDR-003**: Dagre.js (vs Dagre, vs Mermaid)
- **TDR-011**: Mermaid-Inspired Syntax (vs Fork Mermaid, vs Custom)

**See**: [tech-stack.md](./tech-stack.md)

---

## 📊 Component Responsibilities

### Extension Host (Node.js)

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **Parsers** | Parse C4X, Structurizr, PlantUML → IR | `src/parser/` |
| **IR** | Common C4Model type system | `src/model/` |
| **Layout Engine** | Position elements (Dagre.js) | `src/layout/` |
| **SVG Builder** | Generate SVG from layout | `src/render/` |
| **Webview Provider** | Manage webview lifecycle | `src/webview/` |
| **Commands** | Register VS Code commands | `src/commands/` |
| **Diagnostics** | Parse errors, validation | `src/diagnostics/` |

### Webview (Sandboxed)

| Component | Responsibility | Location |
|-----------|---------------|----------|
| **Preview Panel** | Display SVG diagrams | `src/webview/content/` |
| **Theme Switcher** | Apply theme to SVG | `src/webview/content/` |
| **Error Display** | Show parse errors | `src/webview/content/` |

---

## 🔒 Security Architecture

### Content Security Policy (CSP)
**Enforcement**: Strict CSP headers in webview

```typescript
const csp = `
  default-src 'none';
  script-src ${cspSource} 'nonce-${nonce}';
  style-src ${cspSource} 'unsafe-inline';
  img-src ${cspSource} data:;
`;
```

**Rationale**:
- Prevents XSS attacks
- Enforces secure resource loading
- Required by VS Code Marketplace

**See**: [high-level-design.md](./high-level-design.md#security)

---

### Dependency Security
**Tools**: npm audit + Snyk + Dependabot

**Policy**: Zero high/critical vulnerabilities before v1.0 launch

**See**: [TDR-007: Security Approach](../adrs/TDR-007-security-approach.md)

---

## 📈 Performance Architecture

### Performance Targets

| Metric | Target | Strategy |
|--------|--------|----------|
| Activation | < 200ms | Lazy loading, minimal startup code |
| Preview Render | < 250ms | Optimized parser, fast layout (Dagre.js) |
| Memory | < 50MB | Garbage collection, dispose resources |
| Bundle Size | < 1MB | Tree shaking, minification |

### Optimization Strategies
1. **Lazy Loading**: Defer Dagre.js until first preview
2. **Caching**: Cache parsed IR, layout results
3. **Debouncing**: Debounce file watcher updates (avoid re-render spam)
4. **Tree Shaking**: Remove unused code from bundle

**See**: [high-level-design.md](./high-level-design.md#performance-optimization)

---

## 🧪 Testing Architecture

### Testing Layers

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| **Unit Tests** | Mocha | > 80% (parsers, IR, layout) |
| **Integration Tests** | Mocha + @vscode/test-electron | > 70% (commands, webview) |
| **E2E Tests** | VS Code Test Runner | Key workflows (create, preview, export) |

**See**: [TDR-004: Testing Framework](../adrs/TDR-004-testing-framework.md)

---

## 📞 Questions or Suggestions?

### Architecture Decisions
**See**: [ADRs (Architecture Decision Records)](../adrs/)

### High-Level Design
**See**: [high-level-design.md](./high-level-design.md)

### Technology Stack
**See**: [tech-stack.md](./tech-stack.md)

### Code Review
**Agent**: Code Review Agent (VSCode Extension Expert)
**Command**: `/review-code`
**See**: [../../.claude/agents/code-reviewer.md](../../.claude/agents/code-reviewer.md)

---

**Maintained By**: Code Review Agent (VSCode Extension Expert)
**Review Schedule**: After major architectural changes
**Last Review**: 2025-10-19 (Planning phase)
