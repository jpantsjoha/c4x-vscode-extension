# Phase 6: M5 - Polish & QA (v1.0 Launch)

**Status**: 🔴 **NOT STARTED**
**Target**: Week of November 25 - December 1, 2025
**Duration**: 7 days
**Version**: v1.0.0

---

## 🎯 Phase Directive

> **In this phase, we polish the extension to production quality and launch on VS Code Marketplace. By the end of M5, we will have a published extension with diagnostics, templates, performance optimization, security audit, and comprehensive documentation - ready for 100+ alpha users.**

---

## 📋 Goals

1. **Diagnostics Panel**: Show parse errors with line/column numbers in Problems panel
2. **Built-in Templates**: C1, C2, C3 boilerplate for quick start
3. **Performance Optimization**: Meet all targets (< 200ms activation, < 250ms preview)
4. **Security Audit**: Zero high/critical vulnerabilities (npm audit + Snyk)
5. **Marketplace Assets**: Icon, screenshots, demo GIF, compelling description
6. **Comprehensive Documentation**: README, USER-GUIDE, FAQ, TROUBLESHOOTING
7. **Publish to Marketplace**: Launch v1.0.0 publicly

---

## 🚀 Deliverables

### Diagnostics & Error Handling
- [ ] **Diagnostics provider** (`src/diagnostics/DiagnosticsProvider.ts`)
- [ ] **Parse errors** in Problems panel (line/column numbers)
- [ ] **Validation errors** (missing refs, duplicate IDs)
- [ ] **Warning on unsupported features** (Structurizr, PlantUML)
- [ ] **Error squiggles** in editor (red underlines)

### Built-in Templates
- [ ] **C1 Template** - System Context boilerplate
- [ ] **C2 Template** - Container boilerplate
- [ ] **C3 Template** - Component boilerplate
- [ ] **Command**: "C4X: Create from Template"
- [ ] **Quick pick UI** (select template, name file)

### Performance Optimization
- [ ] **Activation time** < 200ms (measured with VS Code Performance API)
- [ ] **Preview render** < 250ms (30-node diagram)
- [ ] **Memory baseline** < 50MB (empty webview)
- [ ] **Bundle size** < 1MB (minified, tree-shaken)
- [ ] **Lazy loading** (defer Dagre.js until first preview)

### Security Audit
- [ ] **npm audit** - Zero high/critical vulnerabilities
- [ ] **Snyk scan** - Zero high/critical issues
- [ ] **CSP validation** - Strict Content Security Policy
- [ ] **Dependency review** - Remove unused dependencies
- [ ] **License compliance** - All dependencies MIT-compatible

### Marketplace Assets
- [ ] **Icon** - 128x128 and 256x256 PNG files (C4X logo)
- [ ] **Screenshots** - At least 5 high-quality images
  - C4X-DSL syntax example
  - Markdown integration example
  - Theme switcher demo
  - Export demo
  - Structurizr/PlantUML preview
- [ ] **Demo GIF** - 30-second animated demo (create → preview → export)
- [ ] **README.md** - Compelling description with features, quick start
- [ ] **package.json** - Keywords, categories, gallery banner

### Documentation
- [ ] **USER-GUIDE.md** - Comprehensive user guide
  - Getting started
  - C4X-DSL syntax reference
  - Markdown integration
  - Themes and styling
  - Export (SVG, PNG)
  - Structurizr DSL support
  - PlantUML C4 support
- [ ] **FAQ.md** - Frequently asked questions
- [ ] **TROUBLESHOOTING.md** - Common issues and solutions
- [ ] **COMPATIBILITY.md** - Structurizr and PlantUML compatibility matrices
- [ ] **CHANGELOG.md** - v1.0.0 release notes

### Testing & QA
- [ ] **Test coverage** > 80% (all packages)
- [ ] **E2E tests** (create, preview, export workflows)
- [ ] **Cross-platform tests** (Windows, macOS, Linux via CI)
- [ ] **Manual QA checklist** (all features tested)
- [ ] **Alpha user testing** (5-10 early adopters)

### Marketplace Publishing
- [ ] **vsce package** - Create `.vsix` file (v1.0.0)
- [ ] **vsce publish** - Publish to VS Code Marketplace
- [ ] **GitHub release** - Create v1.0.0 release with changelog
- [ ] **Post-publish verification** - Install from Marketplace and test

---

## ✅ Success Criteria

### Functional Requirements
- ✅ **All MVP features work**: C4X-DSL, Markdown, Structurizr, PlantUML, themes, export
- ✅ **Diagnostics panel shows errors**: Parse errors, validation errors
- ✅ **Templates work**: C1, C2, C3 boilerplate creation
- ✅ **Zero critical bugs**: No show-stoppers

### Performance Targets
- ✅ **Activation time**: < 200ms (measured)
- ✅ **Preview render**: < 250ms (30-node diagram)
- ✅ **Memory baseline**: < 50MB
- ✅ **Bundle size**: < 1MB

### Quality Gates
- ✅ **Test coverage**: > 80%
- ✅ **Zero high/critical vulnerabilities**: npm audit + Snyk
- ✅ **All tests passing**: Unit, integration, E2E
- ✅ **QA Agent score**: > 95 (quality matrix)

### Documentation
- ✅ **User guide complete**: All features documented
- ✅ **FAQ published**: Common questions answered
- ✅ **Troubleshooting guide**: Common issues solved
- ✅ **Compatibility matrices**: Structurizr, PlantUML

### Marketplace
- ✅ **Extension published**: Available on VS Code Marketplace
- ✅ **GitHub release**: v1.0.0 tagged and released
- ✅ **Alpha user installs**: 10+ installs in first 24 hours

---

## 🎬 User Stories

### User Story 1: Quick Start with Template
**As a new user**, I want to create a C1 diagram from a template, so that I can get started quickly.

**Acceptance Criteria**:
- [ ] Run "C4X: Create from Template" command
- [ ] Select "System Context (C1)" from quick pick
- [ ] Enter file name "banking-system.c4x"
- [ ] File created with boilerplate code
- [ ] Preview opens automatically

---

### User Story 2: Diagnose Syntax Errors
**As a user**, I want to see parse errors in the Problems panel, so that I can fix syntax mistakes.

**Acceptance Criteria**:
- [ ] Write invalid C4X syntax (missing closing bracket)
- [ ] Save file
- [ ] See error in Problems panel: "Line 5: Expected ']'"
- [ ] Click error to jump to line
- [ ] See red squiggle in editor

---

### User Story 3: Install from Marketplace
**As a new user**, I want to install C4X from VS Code Marketplace, so that I don't need manual setup.

**Acceptance Criteria**:
- [ ] Open VS Code Extensions panel
- [ ] Search for "C4X"
- [ ] Click "Install"
- [ ] Extension installs in < 10 seconds
- [ ] No errors or warnings

---

## 📁 Activities

Detailed implementation activities are documented in the `activities/` folder:

### Diagnostics Activities
- [ ] **[01-diagnostics-provider.md](./activities/01-diagnostics-provider.md)** - VS Code diagnostics integration
- [ ] **[02-parse-errors.md](./activities/02-parse-errors.md)** - Show parse errors in Problems panel
- [ ] **[03-validation-errors.md](./activities/03-validation-errors.md)** - Missing refs, duplicate IDs

### Templates Activities
- [ ] **[04-template-provider.md](./activities/04-template-provider.md)** - Template system
- [ ] **[05-c1-template.md](./activities/05-c1-template.md)** - System Context boilerplate
- [ ] **[06-c2-template.md](./activities/06-c2-template.md)** - Container boilerplate
- [ ] **[07-c3-template.md](./activities/07-c3-template.md)** - Component boilerplate

### Performance Activities
- [ ] **[08-performance-profiling.md](./activities/08-performance-profiling.md)** - Measure and optimize
- [ ] **[09-lazy-loading.md](./activities/09-lazy-loading.md)** - Defer Dagre.js loading
- [ ] **[10-bundle-optimization.md](./activities/10-bundle-optimization.md)** - Minify, tree-shake

### Security Activities
- [ ] **[11-npm-audit.md](./activities/11-npm-audit.md)** - Fix vulnerabilities
- [ ] **[12-snyk-scan.md](./activities/12-snyk-scan.md)** - Security scanning
- [ ] **[13-csp-validation.md](./activities/13-csp-validation.md)** - Content Security Policy

### Marketplace Activities
- [ ] **[14-marketplace-assets.md](./activities/14-marketplace-assets.md)** - Icon, screenshots, GIF
- [ ] **[15-documentation.md](./activities/15-documentation.md)** - USER-GUIDE, FAQ, TROUBLESHOOTING
- [ ] **[16-publishing.md](./activities/16-publishing.md)** - vsce package/publish

### QA Activities
- [ ] **[17-qa-checklist.md](./activities/17-qa-checklist.md)** - Manual QA testing
- [ ] **[18-alpha-testing.md](./activities/18-alpha-testing.md)** - Early adopter feedback
- [ ] **[19-final-validation.md](./activities/19-final-validation.md)** - Pre-publish check

---

## 🔧 Technical Details

### Diagnostics Provider

```typescript
// src/diagnostics/DiagnosticsProvider.ts
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';

export class DiagnosticsProvider {
  private diagnosticCollection: vscode.DiagnosticCollection;

  constructor() {
    this.diagnosticCollection = vscode.languages.createDiagnosticCollection('c4x');
  }

  async updateDiagnostics(document: vscode.TextDocument) {
    if (document.languageId !== 'c4x') return;

    const diagnostics: vscode.Diagnostic[] = [];
    const parser = new C4XParser();

    try {
      parser.parse(document.getText());
    } catch (err) {
      if (err.location) {
        const range = new vscode.Range(
          err.location.start.line - 1,
          err.location.start.column - 1,
          err.location.end.line - 1,
          err.location.end.column - 1
        );
        diagnostics.push(new vscode.Diagnostic(range, err.message, vscode.DiagnosticSeverity.Error));
      }
    }

    this.diagnosticCollection.set(document.uri, diagnostics);
  }
}
```

---

### Built-in Templates

```typescript
// src/templates/c1-template.ts
export const C1_TEMPLATE = `%%{ c4: system-context }%%
graph TB
    %% Elements
    User[User<br/>Person]
    System[Your System<br/>Software System]
    External[External System<br/>Software System<br/>External]

    %% Relationships
    User -->|Uses| System
    System -->|Calls| External
`;

// Command: Create from Template
vscode.commands.registerCommand('c4x.createFromTemplate', async () => {
  const templates = ['System Context (C1)', 'Container (C2)', 'Component (C3)'];
  const selected = await vscode.window.showQuickPick(templates);

  if (selected) {
    const template = getTemplate(selected); // C1_TEMPLATE, C2_TEMPLATE, or C3_TEMPLATE
    const fileName = await vscode.window.showInputBox({ prompt: 'File name (e.g., my-diagram.c4x)' });

    if (fileName) {
      const doc = await vscode.workspace.openTextDocument({ content: template, language: 'c4x' });
      await vscode.window.showTextDocument(doc);
      await vscode.commands.executeCommand('c4x.openPreview');
    }
  }
});
```

---

### Performance Profiling

```typescript
// src/performance/Profiler.ts
export class Profiler {
  static async measureActivation(): Promise<number> {
    const start = performance.now();
    // Extension activation code
    const duration = performance.now() - start;

    if (duration > 200) {
      console.warn(`Activation took ${duration}ms (target: < 200ms)`);
    }

    return duration;
  }

  static async measurePreview(): Promise<number> {
    const start = performance.now();
    // Parse → Layout → Render
    const duration = performance.now() - start;

    if (duration > 250) {
      console.warn(`Preview took ${duration}ms (target: < 250ms)`);
    }

    return duration;
  }
}
```

---

## 📊 Metrics

### Performance Metrics (Final Validation)
| Metric | Target | How to Measure | Status |
|--------|--------|----------------|--------|
| Activation time | < 200ms | VS Code Performance API | ⏳ |
| Preview render | < 250ms | `console.time('preview')` | ⏳ |
| Memory baseline | < 50MB | VS Code Process Explorer | ⏳ |
| Bundle size | < 1MB | `ls -lh dist/extension.js` | ⏳ |

### Quality Metrics
| Metric | Target | How to Measure | Status |
|--------|--------|----------------|--------|
| Test coverage | > 80% | `npm run coverage` | ⏳ |
| Vulnerabilities | 0 high/critical | `npm audit` + Snyk | ⏳ |
| Quality score | > 95 | QA Agent matrix | ⏳ |

### Business Metrics (Post-Launch)
| Metric | Target | How to Track | Status |
|--------|--------|--------------|--------|
| Alpha installs | 10+ (first 24h) | Marketplace analytics | ⏳ |
| Week 1 installs | 100+ | Marketplace analytics | ⏳ |
| Star rating | 4.5+ | Marketplace reviews | ⏳ |
| Critical bugs | 0 | GitHub issues | ⏳ |

---

## 🔄 Timeline

```
Week of November 25 - December 1, 2025 (7 days)
|------------------------------------------|
Day 1-2: Diagnostics + templates
Day 3-4: Performance optimization + security audit
Day 5:   Marketplace assets + documentation
Day 6:   QA testing + alpha user feedback
Day 7:   Publish to Marketplace + launch!
```

---

## 🚧 Blockers

### Current Blockers
- **M3 or M4 Not Complete**: Cannot start until both Structurizr and PlantUML are done

### Potential Blockers
- **Marketplace Approval**: Mitigation - Follow all VS Code Marketplace guidelines
- **Security Vulnerabilities**: Mitigation - Fix all high/critical issues before publish

---

## 🎯 Definition of Done

### Code Complete
- [ ] All deliverables checked off
- [ ] Diagnostics panel works
- [ ] Templates work (C1, C2, C3)
- [ ] Performance targets met (< 200ms, < 250ms, < 50MB, < 1MB)
- [ ] Security audit passed (zero high/critical)
- [ ] All tests passing (> 80% coverage)

### Quality Complete
- [ ] `/review-code` validated (Code Review Agent)
- [ ] `/pre-publish-check` validated (Publisher Agent)
- [ ] `/validate-milestone` validated (Product Owner)
- [ ] QA Agent score > 95
- [ ] No regressions (all M0-M4 features work)

### Release Complete
- [ ] `.vsix` file created (v1.0.0)
- [ ] Published to VS Code Marketplace
- [ ] GitHub release created (v1.0.0)
- [ ] Post-publish verification passed
- [ ] CHANGELOG.md updated
- [ ] STATUS.md updated (v1.0 COMPLETE)

---

## 📞 Launch Checklist

### Pre-Launch (Day 6)
- [ ] All code complete and tested
- [ ] All documentation published
- [ ] Marketplace assets ready
- [ ] Alpha users tested and provided feedback
- [ ] `/pre-publish-check` passed

### Launch Day (Day 7)
- [ ] Run `vsce publish`
- [ ] Verify extension appears on Marketplace
- [ ] Install from Marketplace and test all features
- [ ] Create GitHub release (v1.0.0)
- [ ] Announce on social media, forums
- [ ] Monitor for bug reports

### Post-Launch (Week 1)
- [ ] Track installs (target: 100+ in week 1)
- [ ] Monitor reviews (target: 4.5+ stars)
- [ ] Fix critical bugs within 24 hours
- [ ] Respond to GitHub issues
- [ ] Collect feedback for v1.1

---

## 📚 References

### VS Code Marketplace
- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Marketplace Guidelines](https://code.visualstudio.com/api/references/extension-guidelines)

### Internal References
- [Pre-Publish Checklist](../../../.claude/commands/pre-publish-check.md)
- [Product Owner Agent](../../../.claude/agents/product-owner.md)
- [Publisher Agent](../../../.claude/agents/publisher.md)
- [QA Validator Agent](../../../.claude/agents/qa-validator.md)

---

**Phase Owner**: Product Owner Agent (POCA) + All Agents
**Target Completion**: 2025-12-01
**Status**: 🔴 **NOT STARTED** - Awaiting M3 & M4 completion

---

## 🎉 Success!

**When this phase is complete, we will have achieved our vision**:

> **"Make C4 diagrams as easy as Mermaid in VS Code"**

✅ **Mermaid-like simplicity**: ` ```c4x ` fenced blocks in Markdown
✅ **Offline-first**: No Java, no servers, no Docker
✅ **Fast**: < 200ms activation, < 250ms preview
✅ **Multi-dialect**: C4X-DSL, Structurizr, PlantUML
✅ **Production-ready**: Published on VS Code Marketplace

**Target Users Served**:
- Software Architects (C4 diagrams in technical docs)
- Technical Writers (C4 in README files)
- Engineering Managers (architecture diagrams in team wikis)
- Educators (teaching software architecture with C4 Model)

**Next Step**: v1.1 (Enhanced Features - IntelliSense, hover, go-to-definition, snippets)
