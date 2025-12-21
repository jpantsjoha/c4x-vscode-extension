# Phase 6 (M5 - Polish & QA / v1.0 Launch) - Complete Task Breakdown

**Version**: v1.0.0
**Target Completion**: December 1, 2025
**Total Estimated Time**: 22-26 hours (4-5 working days)
**Status**: 🔴 NOT STARTED

---

## Executive Summary

Phase 6 is the **v1.0 launch phase** - polishing the extension to production quality and publishing to VS Code Marketplace. This phase covers diagnostics, built-in templates, performance optimization, security audit, marketplace assets, and comprehensive documentation.

### What We're Building

By the end of Phase 6, we will have:
1. Production-ready extension on VS Code Marketplace
2. Diagnostics panel showing parse errors in Problems view
3. Built-in templates (C1, C2, C3) for quick start
4. Performance optimized (< 200ms activation, < 250ms preview)
5. Security audited (zero high/critical vulnerabilities)
6. Professional marketplace assets (icon, screenshots, demo GIF)
7. Comprehensive documentation (user guide, FAQ, troubleshooting)
8. Alpha user testing feedback incorporated
9. v1.0.0 release tag and GitHub release

### Key Technical Components

1. **Diagnostics Provider** - VS Code Problems panel integration
2. **Template System** - Built-in diagram templates
3. **Performance Optimization** - Lazy loading, bundle optimization
4. **Security Audit** - npm audit, Snyk scan, CSP validation
5. **Marketplace Assets** - Icon, screenshots, demo GIF
6. **Comprehensive Docs** - USER-GUIDE, FAQ, TROUBLESHOOTING
7. **Publishing** - vsce package & publish to Marketplace

---

## Task Categories Overview

| Category | Tasks | Est. Time | Priority |
|----------|-------|-----------|----------|
| **0. Phase 5 Cleanup** | 3 tasks | 1 hr | High (start immediately) |
| **1. Diagnostics Panel** | 5 tasks | 4-5 hrs | Critical Path |
| **2. Built-in Templates** | 4 tasks | 3-4 hrs | High |
| **3. Performance Optimization** | 5 tasks | 4-5 hrs | Critical |
| **4. Security Audit** | 4 tasks | 2-3 hrs | Critical |
| **5. Marketplace Assets** | 5 tasks | 3-4 hrs | High |
| **6. Documentation** | 5 tasks | 3-4 hrs | High |
| **7. Testing & QA** | 4 tasks | 2-3 hrs | Critical |
| **8. Publishing** | 4 tasks | 1-2 hrs | Critical |
| **TOTAL** | **39 tasks** | **22-26 hrs** | - |

---

## Category 0: Phase 5 Cleanup & Quick Wins

**Purpose**: Prepare for Phase 6 work
**Estimated Time**: 1 hour
**Priority**: High

### Task 0.1: Update to Main Branch
**Time**: 15 minutes
**Priority**: High

**Description**: Pull Phase 5 changes, create Phase 6 branch.

**Acceptance Criteria**:
- [ ] `git checkout main && git pull`
- [ ] Verify v0.5.0 tag present
- [ ] `git checkout -b phase-6-polish-qa`

---

### Task 0.2: Verify All Phase 1-5 Tests Pass
**Time**: 30 minutes
**Priority**: Critical

**Description**: Ensure all previous phases are working correctly.

**Test Suites to Run**:
- Phase 1: Extension activation, webview
- Phase 2: Parser, layout, renderer
- Phase 3: Markdown, themes, export
- Phase 4: Structurizr DSL
- Phase 5: PlantUML C4

**Acceptance Criteria**:
- [ ] All test suites pass (200+ tests)
- [ ] No compilation errors
- [ ] No ESLint errors
- [ ] Document baseline metrics (bundle size, test count)

---

### Task 0.3: Set Up Performance Baselines
**Time**: 15 minutes
**Priority**: High

**Description**: Measure current performance metrics.

**Metrics to Measure**:
- Extension activation time
- Preview render time (30-element diagram)
- Memory usage (empty webview)
- Bundle size

**Acceptance Criteria**:
- [ ] Baseline metrics documented
- [ ] Comparison targets set
- [ ] Performance goals defined

---

## Category 1: Diagnostics Panel

**Purpose**: Show parse errors in VS Code Problems panel
**Estimated Time**: 4-5 hours
**Priority**: Critical Path

### Task 1.1: Create Diagnostics Provider
**File**: `src/diagnostics/DiagnosticsProvider.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Implement VS Code diagnostics provider for C4X files.

**Provider Structure**:
```typescript
import * as vscode from 'vscode';
import { c4xParser } from '../parser/C4XParser';
import { structurizrParser } from '../parser/structurizr/StructurizrParser';
import { plantumlParser } from '../parser/plantuml/PlantUMLParser';

export class C4XDiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('c4x');
  }

  public activate(context: vscode.ExtensionContext): void {
    // Register diagnostics on file open
    context.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument(doc => this.updateDiagnostics(doc))
    );

    // Register diagnostics on file change
    context.subscriptions.push(
      vscode.workspace.onDidChangeTextDocument(event => this.updateDiagnostics(event.document))
    );

    // Register diagnostics on file save
    context.subscriptions.push(
      vscode.workspace.onDidSaveTextDocument(doc => this.updateDiagnostics(doc))
    );

    // Update diagnostics for currently open documents
    vscode.workspace.textDocuments.forEach(doc => this.updateDiagnostics(doc));
  }

  private updateDiagnostics(document: vscode.TextDocument): void {
    // Only process C4X-related files
    if (!this.isC4XFile(document)) {
      return;
    }

    const diagnostics: vscode.Diagnostic[] = [];

    try {
      // Parse based on file type
      if (document.fileName.endsWith('.c4x')) {
        this.parseC4X(document, diagnostics);
      } else if (document.fileName.endsWith('.dsl')) {
        this.parseStructurizr(document, diagnostics);
      } else if (document.fileName.endsWith('.puml')) {
        this.parsePlantUML(document, diagnostics);
      }
    } catch (error) {
      // Catch-all for unexpected errors
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(0, 0, 0, 0),
        `Unexpected error: ${error}`,
        vscode.DiagnosticSeverity.Error
      );
      diagnostics.push(diagnostic);
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  private parseC4X(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const text = document.getText();

    try {
      c4xParser.parse(text);
    } catch (error: any) {
      if (error.location) {
        const line = error.location.line - 1; // VS Code is 0-indexed
        const column = error.location.column - 1;
        const range = new vscode.Range(line, column, line, column + 10);

        const diagnostic = new vscode.Diagnostic(
          range,
          error.message,
          vscode.DiagnosticSeverity.Error
        );

        diagnostic.code = 'C4X_PARSE_ERROR';
        diagnostic.source = 'C4X';

        diagnostics.push(diagnostic);
      }
    }
  }

  private parseStructurizr(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const text = document.getText();

    try {
      // Parse Structurizr DSL
      const lexer = new StructurizrLexer(text);
      const tokens = lexer.tokenize();
      const parser = new StructurizrParser(tokens);
      parser.parse();
    } catch (error: any) {
      // Extract line/column if available
      const line = error.line ? error.line - 1 : 0;
      const column = error.column ? error.column - 1 : 0;
      const range = new vscode.Range(line, column, line, column + 10);

      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        vscode.DiagnosticSeverity.Error
      );

      diagnostic.code = 'STRUCTURIZR_PARSE_ERROR';
      diagnostic.source = 'C4X (Structurizr)';

      diagnostics.push(diagnostic);
    }
  }

  private parsePlantUML(document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
    const text = document.getText();

    try {
      plantumlParser.parse(text);
    } catch (error: any) {
      // PlantUML parser is best-effort, so most errors are warnings
      const line = error.line ? error.line - 1 : 0;
      const column = error.column ? error.column - 1 : 0;
      const range = new vscode.Range(line, column, line, column + 10);

      const diagnostic = new vscode.Diagnostic(
        range,
        error.message,
        vscode.DiagnosticSeverity.Warning // Warning instead of error for PlantUML
      );

      diagnostic.code = 'PLANTUML_PARSE_WARNING';
      diagnostic.source = 'C4X (PlantUML)';

      diagnostics.push(diagnostic);
    }
  }

  private isC4XFile(document: vscode.TextDocument): boolean {
    return (
      document.fileName.endsWith('.c4x') ||
      document.fileName.endsWith('.dsl') ||
      document.fileName.endsWith('.puml')
    );
  }

  public dispose(): void {
    this.diagnosticCollection.dispose();
  }
}
```

**Acceptance Criteria**:
- [ ] Diagnostics shown in Problems panel
- [ ] Red squiggles in editor
- [ ] Line/column numbers accurate
- [ ] Works for .c4x, .dsl, .puml files
- [ ] Updates on save

---

### Task 1.2: Add Error Squiggles in Editor
**Time**: 30 minutes
**Priority**: High

**Description**: Show red underlines for parse errors.

**Acceptance Criteria**:
- [ ] Parse errors have red squiggles
- [ ] Warnings have yellow squiggles
- [ ] Hover shows error message

---

### Task 1.3: Add Quick Fixes (Optional)
**Time**: 1 hour
**Priority**: Low

**Description**: Suggest quick fixes for common errors.

**Common Errors**:
- Missing closing bracket → Add `]`
- Invalid element type → Suggest valid types

**Acceptance Criteria**:
- [ ] Quick fixes available via lightbulb
- [ ] Fixes applied correctly

---

### Task 1.4: Write Diagnostics Tests
**File**: `test/suite/diagnostics/diagnostics.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Test diagnostics provider.

**Test Cases**:
- Parse error shows in Problems panel
- Multiple errors shown
- Diagnostics cleared when file fixed
- Diagnostics update on save

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] All file types tested (.c4x, .dsl, .puml)

---

### Task 1.5: Register Diagnostics in Extension
**File**: `src/extension.ts`
**Time**: 15 minutes
**Priority**: Critical

**Description**: Activate diagnostics provider.

**Code**:
```typescript
import { C4XDiagnosticsProvider } from './diagnostics/DiagnosticsProvider';

export function activate(context: vscode.ExtensionContext) {
  // ... existing code

  // Activate diagnostics
  const diagnosticsProvider = new C4XDiagnosticsProvider();
  diagnosticsProvider.activate(context);

  context.subscriptions.push(diagnosticsProvider);
}
```

**Acceptance Criteria**:
- [ ] Diagnostics provider registered
- [ ] Disposed on deactivation

---

## Category 2: Built-in Templates

**Purpose**: Provide quick-start templates for common diagram types
**Estimated Time**: 3-4 hours
**Priority**: High

### Task 2.1: Create Template Files
**Files**: `templates/c1-system-context.c4x`, `templates/c2-container.c4x`, `templates/c3-component.c4x`
**Time**: 1 hour
**Priority**: High

**Description**: Create template files for C1, C2, C3 diagrams.

**C1 Template** (`templates/c1-system-context.c4x`):
```c4x
%%{ c4: system-context }%%
graph TB
    %% People
    User[User<br/>Person]
    Admin[Administrator<br/>Person]

    %% Systems
    System[Your System<br/>Software System]
    EmailSystem[Email System<br/>Software System<br/>External]

    %% Relationships
    User -->|Uses| System
    Admin -->|Manages| System
    System -.->|Sends emails via| EmailSystem
```

**C2 Template** (`templates/c2-container.c4x`):
```c4x
%%{ c4: container }%%
graph TB
    %% People
    User[User<br/>Person]

    %% Containers
    WebApp[Web Application<br/>Container]
    API[API Application<br/>Container]
    Database[Database<br/>Container<br/>Database]

    %% Relationships
    User -->|Uses| WebApp
    WebApp -->|Makes API calls to| API
    API -->|Reads from and writes to| Database
```

**C3 Template** (`templates/c3-component.c4x`):
```c4x
%%{ c4: component }%%
graph TB
    %% External
    User[User<br/>Person]

    %% Components
    Controller[Login Controller<br/>Component]
    Service[Security Service<br/>Component]
    Repository[User Repository<br/>Component]

    %% Relationships
    User -->|Uses| Controller
    Controller -->|Uses| Service
    Service -->|Reads from| Repository
```

**Acceptance Criteria**:
- [ ] Three template files created
- [ ] Templates follow best practices
- [ ] Templates use clear naming

---

### Task 2.2: Implement Template Command
**File**: `src/commands/createFromTemplate.ts`
**Time**: 1.5 hours
**Priority**: High

**Description**: Command to create new file from template.

**Command Implementation**:
```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

interface Template {
  id: string;
  label: string;
  description: string;
  fileName: string;
  templatePath: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'c1',
    label: 'C1 - System Context',
    description: 'High-level system context diagram',
    fileName: 'system-context.c4x',
    templatePath: 'templates/c1-system-context.c4x',
  },
  {
    id: 'c2',
    label: 'C2 - Container',
    description: 'Container diagram showing applications and databases',
    fileName: 'container.c4x',
    templatePath: 'templates/c2-container.c4x',
  },
  {
    id: 'c3',
    label: 'C3 - Component',
    description: 'Component diagram showing code-level components',
    fileName: 'component.c4x',
    templatePath: 'templates/c3-component.c4x',
  },
];

export async function createFromTemplateCommand(context: vscode.ExtensionContext): Promise<void> {
  // 1. Show template picker
  const selectedTemplate = await vscode.window.showQuickPick(
    TEMPLATES.map(t => ({
      label: t.label,
      description: t.description,
      template: t,
    })),
    {
      placeHolder: 'Select a C4 diagram template',
    }
  );

  if (!selectedTemplate) {
    return; // User cancelled
  }

  const template = selectedTemplate.template;

  // 2. Prompt for file name
  const fileName = await vscode.window.showInputBox({
    prompt: 'Enter file name',
    value: template.fileName,
    validateInput: (value) => {
      if (!value) {
        return 'File name cannot be empty';
      }
      if (!value.endsWith('.c4x')) {
        return 'File must have .c4x extension';
      }
      return null;
    },
  });

  if (!fileName) {
    return; // User cancelled
  }

  // 3. Determine save location
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const defaultUri = workspaceFolder
    ? vscode.Uri.joinPath(workspaceFolder.uri, fileName)
    : undefined;

  const saveUri = await vscode.window.showSaveDialog({
    filters: {
      'C4X Files': ['c4x'],
    },
    defaultUri,
  });

  if (!saveUri) {
    return; // User cancelled
  }

  // 4. Read template content
  const templatePath = path.join(context.extensionPath, template.templatePath);
  const templateContent = fs.readFileSync(templatePath, 'utf8');

  // 5. Write to new file
  await vscode.workspace.fs.writeFile(saveUri, Buffer.from(templateContent, 'utf8'));

  // 6. Open new file
  const document = await vscode.workspace.openTextDocument(saveUri);
  await vscode.window.showTextDocument(document);

  // 7. Open preview
  await vscode.commands.executeCommand('c4x.openPreview');

  vscode.window.showInformationMessage(`Created ${fileName} from template`);
}
```

**Acceptance Criteria**:
- [ ] Command shows template picker
- [ ] Prompts for file name
- [ ] Creates file from template
- [ ] Opens new file in editor
- [ ] Automatically opens preview

---

### Task 2.3: Register Template Command
**File**: `package.json`, `src/extension.ts`
**Time**: 30 minutes
**Priority**: High

**Description**: Register template command.

**package.json**:
```json
{
  "contributes": {
    "commands": [
      {
        "command": "c4x.createFromTemplate",
        "title": "C4X: Create from Template",
        "icon": "$(new-file)"
      }
    ],
    "menus": {
      "explorer/context": [
        {
          "command": "c4x.createFromTemplate",
          "group": "navigation"
        }
      ]
    }
  }
}
```

**Acceptance Criteria**:
- [ ] Command registered
- [ ] Available in Command Palette
- [ ] Available in Explorer context menu

---

### Task 2.4: Write Template Tests
**File**: `test/suite/templates/templates.test.ts`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Test template creation.

**Test Cases**:
- Template picker shows all templates
- Template content loaded correctly
- File created with correct content
- Template files are valid C4X syntax

**Acceptance Criteria**:
- [ ] 10+ test cases
- [ ] All templates tested

---

## Category 3: Performance Optimization

**Purpose**: Meet performance targets for v1.0
**Estimated Time**: 4-5 hours
**Priority**: Critical

### Task 3.1: Optimize Extension Activation
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Reduce extension activation time to < 200ms.

**Optimization Strategies**:
1. Lazy load parsers (don't import until first use)
2. Defer heavy initialization
3. Use async activation where possible

**Before**:
```typescript
import { c4xParser } from './parser/C4XParser';
import { dagreLayoutEngine } from './layout/DagreLayoutEngine';

export function activate(context: vscode.ExtensionContext) {
  // Heavy imports block activation
  registerCommands(context);
}
```

**After**:
```typescript
export function activate(context: vscode.ExtensionContext) {
  // Lazy load parsers
  registerCommands(context);

  // Defer heavy initialization
  setImmediate(() => {
    warmupParsers(); // Warm up in background
  });
}

async function warmupParsers() {
  // Lazy import
  const { c4xParser } = await import('./parser/C4XParser');
  // Warm up parser cache
}
```

**Acceptance Criteria**:
- [ ] Activation time < 200ms (measured with VS Code Performance API)
- [ ] All commands still work
- [ ] No regressions in functionality

---

### Task 3.2: Optimize Bundle Size
**Time**: 1 hour
**Priority**: High

**Description**: Reduce bundle size to < 1MB.

**Optimization Strategies**:
1. Tree-shake unused code
2. Minify with esbuild
3. Lazy load Playwright (only for PNG export)
4. Remove unused dependencies

**esbuild config**:
```javascript
// esbuild.config.js
const esbuild = require('esbuild');

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  minify: true,
  treeShaking: true,
  sourcemap: true,
  logLevel: 'info',
  metafile: true, // For bundle analysis
});
```

**Acceptance Criteria**:
- [ ] Bundle size < 1MB
- [ ] Tree-shaking verified
- [ ] No unused dependencies
- [ ] Analyze bundle with esbuild metafile

---

### Task 3.3: Optimize Preview Render Time
**Time**: 1 hour
**Priority**: High

**Description**: Ensure preview renders in < 250ms.

**Optimization Strategies**:
1. Cache layout results
2. Debounce updates
3. Use requestIdleCallback for non-critical work

**Code**:
```typescript
class PreviewController {
  private layoutCache = new Map<string, LayoutResult>();

  async updatePreview(uri: vscode.Uri) {
    const cacheKey = this.getCacheKey(uri);

    // Check cache
    if (this.layoutCache.has(cacheKey)) {
      const layout = this.layoutCache.get(cacheKey)!;
      this.renderFromCache(layout);
      return;
    }

    // Full render
    const startTime = performance.now();
    const layout = await this.fullRender(uri);
    const duration = performance.now() - startTime;

    // Cache result
    this.layoutCache.set(cacheKey, layout);

    console.log(`Preview render: ${duration.toFixed(2)}ms`);
  }
}
```

**Acceptance Criteria**:
- [ ] Preview render < 250ms (30-element diagram)
- [ ] Layout caching works
- [ ] Cache invalidation on file change

---

### Task 3.4: Measure Memory Usage
**Time**: 30 minutes
**Priority**: Medium

**Description**: Ensure memory usage stays < 50MB.

**Measurement**:
- Use VS Code Process Explorer
- Monitor webview memory
- Test with multiple previews open

**Acceptance Criteria**:
- [ ] Empty webview < 10MB
- [ ] Preview with diagram < 50MB
- [ ] Multiple previews < 150MB total

---

### Task 3.5: Performance Benchmarks
**File**: `test/performance/phase6-benchmarks.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Comprehensive performance benchmarks.

**Benchmarks**:
- Extension activation time (target: < 200ms)
- Preview render time (target: < 250ms)
- Diagnostics update time (target: < 100ms)
- Template creation time (target: < 500ms)
- Memory usage (target: < 50MB per preview)

**Acceptance Criteria**:
- [ ] All benchmarks pass
- [ ] Results documented
- [ ] Regression alerts configured

---

## Category 4: Security Audit

**Purpose**: Ensure extension is secure for v1.0 release
**Estimated Time**: 2-3 hours
**Priority**: Critical

### Task 4.1: Run npm audit
**Time**: 30 minutes
**Priority**: Critical

**Description**: Audit npm dependencies for vulnerabilities.

**Commands**:
```bash
npm audit
npm audit fix
npm audit --production
```

**Acceptance Criteria**:
- [ ] Zero high/critical vulnerabilities
- [ ] All medium vulnerabilities reviewed
- [ ] Audit report generated

---

### Task 4.2: Run Snyk Scan
**Time**: 30 minutes
**Priority**: High

**Description**: Deep security scan with Snyk.

**Setup**:
```bash
npm install -g snyk
snyk auth
snyk test
snyk monitor
```

**Acceptance Criteria**:
- [ ] Zero high/critical issues
- [ ] Snyk badge added to README
- [ ] Continuous monitoring enabled

---

### Task 4.3: Validate CSP (Content Security Policy)
**Time**: 45 minutes
**Priority**: High

**Description**: Ensure webview CSP is secure.

**CSP Headers**:
```typescript
const csp = `
  default-src 'none';
  script-src ${webview.cspSource};
  style-src ${webview.cspSource} 'unsafe-inline';
  img-src ${webview.cspSource} data:;
  font-src ${webview.cspSource};
`;
```

**Acceptance Criteria**:
- [ ] CSP audit script passes
- [ ] No inline scripts
- [ ] No eval() usage
- [ ] All resources from trusted sources

---

### Task 4.4: Dependency License Review
**Time**: 45 minutes
**Priority**: Medium

**Description**: Ensure all dependencies are MIT-compatible.

**Tools**:
```bash
npm install -g license-checker
license-checker --summary
license-checker --production --onlyAllow "MIT;Apache-2.0;ISC;BSD-2-Clause;BSD-3-Clause"
```

**Acceptance Criteria**:
- [ ] All dependencies have permissive licenses
- [ ] No GPL dependencies
- [ ] LICENSE file updated

---

## Category 5: Marketplace Assets

**Purpose**: Create professional marketplace presence
**Estimated Time**: 3-4 hours
**Priority**: High

### Task 5.1: Design Extension Icon
**Files**: `resources/icon.png` (128x128 and 256x256)
**Time**: 1 hour
**Priority**: High

**Description**: Create professional extension icon.

**Requirements**:
- 128x128 PNG (Marketplace listing)
- 256x256 PNG (High-DPI displays)
- Transparent background
- C4X branding (C4 + X logo)
- Simple, recognizable design

**Tools**: Figma, Canva, or Adobe Illustrator

**Acceptance Criteria**:
- [ ] Icon designed and exported
- [ ] Both sizes created
- [ ] Looks good on light and dark backgrounds
- [ ] Added to `package.json` (icon field)

---

### Task 5.2: Create Screenshots
**Files**: `resources/screenshots/*.png`
**Time**: 1.5 hours
**Priority**: High

**Description**: Capture 5+ high-quality screenshots.

**Screenshots to Create**:
1. **C4X-DSL Syntax** - Editor with C4X code + preview
2. **Markdown Integration** - README.md with embedded diagram
3. **Theme Switcher** - Showing multiple themes
4. **Export Demo** - Export dialog + exported PNG
5. **Structurizr/PlantUML** - Preview of .dsl/.puml file

**Requirements**:
- 1920x1080 or higher resolution
- Clear, readable text
- Professional color scheme
- Annotated with callouts (optional)

**Acceptance Criteria**:
- [ ] 5+ screenshots created
- [ ] All key features showcased
- [ ] High resolution (1920x1080+)
- [ ] Added to `package.json` (galleryBanner)

---

### Task 5.3: Create Demo GIF
**File**: `resources/demo.gif`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Create 30-second animated demo.

**Demo Flow**:
1. Open VS Code
2. Run "C4X: Create from Template"
3. Select C1 template
4. Edit diagram
5. Press Ctrl+K V (preview opens)
6. Change theme
7. Export as PNG

**Tools**: ScreenToGif, LICEcap, or Kap

**Acceptance Criteria**:
- [ ] GIF created (< 10MB)
- [ ] 30 seconds or less
- [ ] Smooth, clear demonstration
- [ ] Added to README

---

### Task 5.4: Write Marketplace Description
**File**: `README.md`, `package.json`
**Time**: 45 minutes
**Priority**: High

**Description**: Write compelling marketplace description.

**Structure**:
```markdown
# C4X - C4 Model Diagrams for VS Code

Make C4 diagrams as easy as Mermaid in VS Code.

## Features

- ✅ Mermaid-Inspired Syntax
- ✅ Real-Time Preview (< 250ms)
- ✅ Markdown Integration (` ```c4x ` blocks)
- ✅ 5 Professional Themes
- ✅ Export SVG/PNG
- ✅ Structurizr DSL Support (80% coverage)
- ✅ PlantUML C4 Support (70% coverage)
- ✅ Offline-First (no Java, no servers)

## Quick Start

1. Install extension
2. Create new file: `diagram.c4x`
3. Write your diagram...
4. Press `Ctrl+K V` to preview
5. Done! 🎉

[View Demo GIF]

## Supported Formats

- C4X-DSL (Mermaid-inspired)
- Structurizr DSL (.dsl files)
- PlantUML C4 (.puml files)
- Markdown fenced blocks (` ```c4x `)

## Why C4X?

- **Fast**: < 250ms preview rendering
- **Offline**: No Java, no servers, no Docker
- **Familiar**: Mermaid-like syntax you already know
- **Flexible**: 5 themes, SVG/PNG export
- **Enterprise**: Structurizr DSL support
```

**package.json**:
```json
{
  "displayName": "C4X - C4 Model Diagrams",
  "description": "Create C4 Model diagrams with Mermaid-like syntax, preview in VS Code, export as SVG/PNG. Supports Structurizr DSL and PlantUML C4.",
  "keywords": [
    "c4",
    "c4model",
    "diagram",
    "architecture",
    "structurizr",
    "plantuml",
    "mermaid",
    "visualization"
  ],
  "categories": [
    "Programming Languages",
    "Visualization",
    "Other"
  ],
  "galleryBanner": {
    "color": "#08427B",
    "theme": "dark"
  }
}
```

**Acceptance Criteria**:
- [ ] Compelling description written
- [ ] Keywords optimized for search
- [ ] Categories selected
- [ ] Gallery banner configured

---

### Task 5.5: Update package.json Metadata
**File**: `package.json`
**Time**: 15 minutes
**Priority**: High

**Description**: Complete all marketplace metadata.

**Fields to Update**:
- `version`: "1.0.0"
- `publisher`: Your VS Code publisher ID
- `repository`: GitHub URL
- `homepage`: GitHub pages or website
- `bugs`: GitHub issues URL
- `license`: "MIT"
- `icon`: Path to icon file

**Acceptance Criteria**:
- [ ] All metadata fields complete
- [ ] Version set to 1.0.0
- [ ] Publisher ID configured

---

## Category 6: Documentation

**Purpose**: Comprehensive user documentation for v1.0
**Estimated Time**: 3-4 hours
**Priority**: High

### Task 6.1: Create USER-GUIDE.md
**File**: `docs/USER-GUIDE.md`
**Time**: 1.5 hours
**Priority**: High

**Description**: Comprehensive user guide.

**Sections**:
1. Getting Started
2. C4X-DSL Syntax Reference
3. Markdown Integration
4. Themes and Styling
5. Export (SVG, PNG)
6. Structurizr DSL Support
7. PlantUML C4 Support
8. Keyboard Shortcuts
9. Configuration Options

**Acceptance Criteria**:
- [ ] All sections complete
- [ ] Examples included
- [ ] Screenshots included
- [ ] Linked from README

---

### Task 6.2: Create FAQ.md
**File**: `docs/FAQ.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Frequently asked questions.

**Questions to Cover**:
- Q: Do I need Java? A: No
- Q: Does it work offline? A: Yes
- Q: Can I use Structurizr DSL? A: Yes (80% coverage)
- Q: Can I export diagrams? A: Yes (SVG, PNG)
- Q: How does it compare to Mermaid? A: Similar syntax, C4-specific features
- Q: Is it free? A: Yes, MIT license

**Acceptance Criteria**:
- [ ] 15+ questions answered
- [ ] Clear, concise answers
- [ ] Linked from README

---

### Task 6.3: Create TROUBLESHOOTING.md
**File**: `docs/TROUBLESHOOTING.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Common issues and solutions.

**Common Issues**:
- Preview not opening
- Parse errors not showing
- Export failing
- Themes not changing
- Performance issues

**Acceptance Criteria**:
- [ ] 10+ issues documented
- [ ] Solutions provided
- [ ] Workarounds included

---

### Task 6.4: Update Main README
**File**: `README.md`
**Time**: 30 minutes
**Priority**: High

**Description**: Polish main README for marketplace.

**Updates**:
- Add badges (CI, version, downloads, rating)
- Add demo GIF
- Add feature list
- Add screenshots
- Add links to docs

**Acceptance Criteria**:
- [ ] Professional appearance
- [ ] All features highlighted
- [ ] Links to documentation

---

### Task 6.5: Update CHANGELOG for v1.0.0
**File**: `CHANGELOG.md`
**Time**: 30 minutes
**Priority**: High

**Description**: Complete changelog for v1.0.0.

**Changelog Entry**:
```markdown
## [1.0.0] - 2025-12-01

### 🎉 v1.0 Launch - VS Code Marketplace

This is the first public release of C4X!

### Added
- **Diagnostics Panel**: Parse errors shown in Problems panel
- **Built-in Templates**: C1, C2, C3 quick-start templates
- **Performance Optimized**: < 200ms activation, < 250ms preview
- **Security Audited**: Zero high/critical vulnerabilities
- **Professional Assets**: Icon, screenshots, demo GIF
- **Comprehensive Docs**: User guide, FAQ, troubleshooting

### Performance
- Extension activation: < 200ms (81% under target)
- Preview render: < 250ms (30-element diagram)
- Memory usage: < 50MB per preview

### Security
- npm audit: Zero high/critical vulnerabilities
- Snyk: Zero high/critical issues
- CSP: Strict Content Security Policy validated

### Documentation
- USER-GUIDE.md - Complete user guide
- FAQ.md - 15+ frequently asked questions
- TROUBLESHOOTING.md - Common issues and solutions

### Marketplace
- Published to VS Code Marketplace
- Professional icon and screenshots
- Demo GIF showcasing features
```

**Acceptance Criteria**:
- [ ] Changelog complete
- [ ] Version set to 1.0.0
- [ ] All features listed

---

## Category 7: Testing & QA

**Purpose**: Final quality assurance before launch
**Estimated Time**: 2-3 hours
**Priority**: Critical

### Task 7.1: Manual QA Checklist
**Time**: 1 hour
**Priority**: Critical

**Description**: Manual testing of all features.

**Test Scenarios**:
- [ ] Create diagram from template
- [ ] Open preview (Ctrl+K V)
- [ ] Edit diagram, preview updates
- [ ] Change theme
- [ ] Export SVG
- [ ] Export PNG (all resolutions)
- [ ] Copy to clipboard
- [ ] Embed in Markdown
- [ ] Parse errors show in Problems panel
- [ ] Structurizr DSL preview
- [ ] PlantUML C4 preview

**Acceptance Criteria**:
- [ ] All scenarios pass
- [ ] No bugs found
- [ ] Edge cases tested

---

### Task 7.2: Cross-Platform Testing
**Time**: 45 minutes
**Priority**: High

**Description**: Test on Windows, macOS, Linux.

**Platforms**:
- Windows 10/11
- macOS (Intel and Apple Silicon)
- Linux (Ubuntu)

**Test**:
- Extension activation
- Preview rendering
- Export functionality

**Acceptance Criteria**:
- [ ] Works on all platforms
- [ ] No platform-specific bugs
- [ ] CI passes on all platforms

---

### Task 7.3: Alpha User Testing
**Time**: 1 hour (coordination)
**Priority**: High

**Description**: Get 5-10 early adopters to test.

**Feedback to Gather**:
- Ease of use
- Feature completeness
- Performance
- Bugs found
- Feature requests

**Acceptance Criteria**:
- [ ] 5+ alpha users recruited
- [ ] Feedback collected
- [ ] Critical issues fixed

---

### Task 7.4: Final Code Review & QA
**Time**: 45 minutes
**Priority**: Critical

**Description**: Run final code review and QA validation.

**Acceptance Criteria**:
- [ ] Code review score > 98/100
- [ ] QA validation score > 98/100
- [ ] Zero critical issues
- [ ] All Phase 1-5 tests pass

---

## Category 8: Publishing

**Purpose**: Publish v1.0.0 to VS Code Marketplace
**Estimated Time**: 1-2 hours
**Priority**: Critical

### Task 8.1: Create .vsix Package
**Time**: 15 minutes
**Priority**: Critical

**Description**: Build extension package.

**Commands**:
```bash
npm install -g @vscode/vsce
vsce package
```

**Acceptance Criteria**:
- [ ] `.vsix` file created
- [ ] File size reasonable (< 10MB)
- [ ] Install locally and test

---

### Task 8.2: Publish to Marketplace
**Time**: 30 minutes
**Priority**: Critical

**Description**: Publish to VS Code Marketplace.

**Steps**:
1. Create publisher account (if needed)
2. Generate Personal Access Token
3. Publish: `vsce publish`

**Commands**:
```bash
vsce login <publisher>
vsce publish
```

**Acceptance Criteria**:
- [ ] Extension published
- [ ] Visible on Marketplace
- [ ] Install from Marketplace works

---

### Task 8.3: Create GitHub Release
**Time**: 30 minutes
**Priority**: High

**Description**: Create v1.0.0 GitHub release.

**Release Notes**:
```markdown
# C4X v1.0.0 - Official Launch 🎉

This is the first public release of C4X - C4 Model diagrams for VS Code!

## ✨ Features

- Mermaid-inspired C4X-DSL syntax
- Real-time preview (< 250ms)
- Markdown integration
- 5 professional themes
- Export SVG/PNG
- Structurizr DSL support (80%)
- PlantUML C4 support (70%)
- Diagnostics panel
- Built-in templates

## 📦 Installation

Install from VS Code Marketplace: [C4X Extension](https://marketplace.visualstudio.com/items?itemName=...)

## 📚 Documentation

- [User Guide](https://github.com/.../docs/USER-GUIDE.md)
- [FAQ](https://github.com/.../docs/FAQ.md)
- [Troubleshooting](https://github.com/.../docs/TROUBLESHOOTING.md)

## 🙏 Credits

Built with ❤️ by jpantsjoha
```

**Acceptance Criteria**:
- [ ] Release created on GitHub
- [ ] Tag v1.0.0 pushed
- [ ] Release notes complete
- [ ] `.vsix` file attached

---

### Task 8.4: Post-Launch Monitoring
**Time**: 15 minutes (setup)
**Priority**: Medium

**Description**: Set up monitoring for post-launch.

**Monitor**:
- Marketplace download count
- Star ratings and reviews
- GitHub issues
- Bug reports

**Acceptance Criteria**:
- [ ] Monitoring dashboard set up
- [ ] Alerts configured for critical issues

---

## Timeline Breakdown

### Week 1 (Days 1-3): Diagnostics + Templates + Performance

**Day 1** (6-7 hours):
- Tasks 0.1-0.3: Cleanup and baselines
- Tasks 1.1-1.3: Diagnostics provider, squiggles, quick fixes

**Day 2** (6-7 hours):
- Tasks 1.4-1.5: Diagnostics tests, registration
- Tasks 2.1-2.4: Templates (files, command, registration, tests)

**Day 3** (5-6 hours):
- Tasks 3.1-3.5: Performance optimization (activation, bundle, render, memory, benchmarks)

---

### Week 2 (Days 4-5): Security + Assets + Docs + Launch

**Day 4** (6-7 hours):
- Tasks 4.1-4.4: Security audit (npm, Snyk, CSP, licenses)
- Tasks 5.1-5.3: Marketplace assets (icon, screenshots, demo GIF)

**Day 5** (5-6 hours):
- Tasks 5.4-5.5: Marketplace description, metadata
- Tasks 6.1-6.5: Documentation (user guide, FAQ, troubleshooting, README, changelog)

**Day 6** (3-4 hours):
- Tasks 7.1-7.4: Testing & QA (manual, cross-platform, alpha users, final review)
- Tasks 8.1-8.4: Publishing (.vsix, Marketplace, GitHub release, monitoring)

---

## Success Metrics

### Performance Targets (Must Meet)
- ✅ **Extension Activation**: < 200ms
- ✅ **Preview Render**: < 250ms (30-element diagram)
- ✅ **Memory Usage**: < 50MB per preview
- ✅ **Bundle Size**: < 1MB

### Security Targets (Must Meet)
- ✅ **npm audit**: Zero high/critical vulnerabilities
- ✅ **Snyk**: Zero high/critical issues
- ✅ **CSP**: Strict Content Security Policy

### Quality Targets (Must Meet)
- ✅ **Test Coverage**: > 80% (all modules)
- ✅ **Code Review**: > 98/100
- ✅ **QA Validation**: > 98/100
- ✅ **Alpha User Satisfaction**: > 90%

### Launch Targets (Must Meet)
- ✅ **Marketplace Published**: v1.0.0 live
- ✅ **GitHub Release**: v1.0.0 tagged
- ✅ **Documentation**: Complete (user guide, FAQ, troubleshooting)
- ✅ **Zero Critical Bugs**: At launch

---

## Deliverables Checklist

### Code Deliverables
- [ ] Diagnostics provider (`src/diagnostics/DiagnosticsProvider.ts`)
- [ ] Templates (C1, C2, C3)
- [ ] Template command (`src/commands/createFromTemplate.ts`)
- [ ] Performance optimizations (lazy loading, caching)

### Asset Deliverables
- [ ] Extension icon (128x128, 256x256)
- [ ] 5+ screenshots
- [ ] Demo GIF
- [ ] Marketplace description

### Documentation Deliverables
- [ ] USER-GUIDE.md
- [ ] FAQ.md
- [ ] TROUBLESHOOTING.md
- [ ] README updated
- [ ] CHANGELOG for v1.0.0

### Publishing Deliverables
- [ ] `.vsix` package
- [ ] Marketplace listing
- [ ] GitHub v1.0.0 release
- [ ] Post-launch monitoring

---

## Post-Launch Roadmap

**Phase 7 (M6 - Community Features)**:
- Syntax highlighting
- Auto-completion
- Hover tooltips
- Code snippets
- Language server protocol (LSP)

**Future Phases**:
- Deployment diagrams (C4 Level 4)
- Dynamic diagrams
- Custom themes (user-defined)
- CLI tool (headless rendering)
- VS Code web support

---

**Document Owner**: Product Owner + Code Review Agent
**Last Updated**: October 19, 2025
**Status**: 🔴 NOT STARTED - Ready to begin Phase 6
