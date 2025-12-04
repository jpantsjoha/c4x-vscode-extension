# Phase 3: M2 - Markdown Integration

**Status**: 🔴 **NOT STARTED**
**Target**: Week of November 4-10, 2025
**Duration**: 7 days
**Version**: v0.3.0

---

## 🎯 Phase Directive

> **In this phase, we integrate C4X into Markdown with ` ```c4x ` fenced blocks, add theme support, and implement export functionality. By the end of M2, users can embed C4 diagrams in README.md just like Mermaid - fulfilling our core vision.**

---

## 📋 Goals

1. **MarkdownIt Plugin**: Detect and render ` ```c4x ` fenced blocks in Markdown preview
2. **Inline SVG Rendering**: Display C4 diagrams directly in Markdown (no external files)
3. **Theme Support**: 5 themes (Classic, Modern, Muted, High-Contrast, Auto)
4. **Export SVG**: Command to export diagram as SVG file
5. **Export PNG**: Command to export diagram as PNG (1x, 2x, 4x resolution)
6. **Copy to Clipboard**: Copy SVG to clipboard for pasting elsewhere

---

## 🚀 Deliverables

### MarkdownIt Plugin
- [ ] **Plugin file** (`src/markdown/c4xPlugin.ts`)
- [ ] **Fenced block detection** (` ```c4x ... ``` `)
- [ ] **Inline SVG rendering** (no external file dependencies)
- [ ] **Error handling** (show parse errors in Markdown)
- [ ] **VS Code Markdown API integration**

### Theme System
- [ ] **Theme interface** (`src/themes/Theme.ts`)
- [ ] **Classic theme** (C4 Model official colors) - default
- [ ] **Modern theme** (vibrant colors, rounded corners)
- [ ] **Muted theme** (grayscale, minimalist)
- [ ] **High-Contrast theme** (WCAG AAA compliant for accessibility)
- [ ] **Auto theme** (match VS Code theme - light/dark)
- [ ] **Theme switcher command** ("C4X: Change Theme")

### Export Functionality
- [ ] **Export SVG** command (`c4x.exportSvg`)
  - Saves current diagram as `.svg` file
  - Preserves theme styling
  - Embeds fonts (no external dependencies)
- [ ] **Export PNG** command (`c4x.exportPng`)
  - Saves as PNG (1x, 2x, 4x resolution options)
  - Uses headless browser (Playwright) for rendering
  - Anti-aliased, high-quality output
- [ ] **Copy SVG to Clipboard** command (`c4x.copySvg`)
  - Copies SVG markup to system clipboard
  - Can paste into Figma, Sketch, Confluence, etc.

### Documentation
- [ ] **User guide** (how to embed C4X in Markdown)
- [ ] **Theme examples** (screenshots of all 5 themes)
- [ ] **Export guide** (SVG vs PNG, use cases)

---

## ✅ Success Criteria

### Functional Requirements
- ✅ **` ```c4x ` blocks render** in Markdown preview
- ✅ **Themes switch instantly** (< 100ms)
- ✅ **SVG export works** (preserves quality, embeds fonts)
- ✅ **PNG export works** (1x, 2x, 4x resolution options)

### Performance Targets
- ✅ **Theme switch**: < 100ms (re-render with new colors)
- ✅ **Export SVG**: < 200ms (write to file)
- ✅ **Export PNG**: < 2s (headless browser render)

### Quality Gates
- ✅ **Test coverage**: > 80% (plugin, themes, export)
- ✅ **Markdown rendering**: Works in VS Code Markdown preview
- ✅ **No regressions**: M0 and M1 features still work

### User Experience
- ✅ **Mermaid-like workflow**: ` ```c4x ` blocks feel familiar
- ✅ **Theme preview**: Easy to compare themes side-by-side
- ✅ **Export quality**: PNG exports are sharp, readable

---

## 🎬 User Stories

### User Story 1: Embed C4X in Markdown
**As a technical writer**, I want to embed C4 diagrams in README.md using ` ```c4x ` fenced blocks, so that diagrams render inline like Mermaid.

**Acceptance Criteria**:
- [ ] Create `README.md` with ` ```c4x ` block
- [ ] Open Markdown preview (Ctrl+K V)
- [ ] See C4 diagram rendered inline
- [ ] Diagram updates when code changes

**Example**:
````markdown
# Banking System Architecture

## System Context

```c4x
%%{ c4: system-context }%%
graph TB
    Customer[Customer<br/>Person]
    Banking[Internet Banking System<br/>Software System]

    Customer -->|Uses| Banking
```
````

---

### User Story 2: Change Theme
**As an architect**, I want to change the diagram theme to match my presentation style, so that diagrams fit my brand.

**Acceptance Criteria**:
- [ ] Run "C4X: Change Theme" command
- [ ] Select theme from list (Classic, Modern, Muted, etc.)
- [ ] Preview updates in < 100ms with new colors

---

### User Story 3: Export to PNG
**As a technical writer**, I want to export my C4 diagram as a high-resolution PNG, so that I can include it in PowerPoint presentations.

**Acceptance Criteria**:
- [ ] Open `.c4x` file with preview
- [ ] Run "C4X: Export PNG" command
- [ ] Select resolution (1x, 2x, 4x)
- [ ] PNG file saved to disk (high quality, anti-aliased)

---

## 📁 Activities

Detailed implementation activities are documented in the `activities/` folder:

### Markdown Activities
- [ ] **[01-markdownit-plugin.md](./activities/01-markdownit-plugin.md)** - MarkdownIt plugin setup
- [ ] **[02-fenced-block-detection.md](./activities/02-fenced-block-detection.md)** - Detect ` ```c4x ` blocks
- [ ] **[03-inline-svg.md](./activities/03-inline-svg.md)** - Render SVG inline in Markdown

### Theme Activities
- [ ] **[04-theme-interface.md](./activities/04-theme-interface.md)** - Theme type definitions
- [ ] **[05-classic-theme.md](./activities/05-classic-theme.md)** - C4 official colors
- [ ] **[06-modern-theme.md](./activities/06-modern-theme.md)** - Vibrant colors, rounded corners
- [ ] **[07-muted-theme.md](./activities/07-muted-theme.md)** - Grayscale, minimalist
- [ ] **[08-high-contrast-theme.md](./activities/08-high-contrast-theme.md)** - WCAG AAA accessibility
- [ ] **[09-auto-theme.md](./activities/09-auto-theme.md)** - Match VS Code light/dark
- [ ] **[10-theme-switcher.md](./activities/10-theme-switcher.md)** - Command + UI

### Export Activities
- [ ] **[11-export-svg.md](./activities/11-export-svg.md)** - Export SVG command
- [ ] **[12-export-png.md](./activities/12-export-png.md)** - Export PNG with Playwright
- [ ] **[13-copy-clipboard.md](./activities/13-copy-clipboard.md)** - Copy SVG to clipboard

---

## 🔧 Technical Details

### MarkdownIt Plugin

```typescript
// src/markdown/c4xPlugin.ts
import * as MarkdownIt from 'markdown-it';
import { C4XParser } from '../parser/C4XParser';
import { DagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { SvgBuilder } from '../render/SvgBuilder';

export function c4xPlugin(md: MarkdownIt) {
  const fence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];

    if (token.info === 'c4x') {
      try {
        const parser = new C4XParser();
        const model = parser.parse(token.content);
        const layout = await layoutEngine.layout(model);
        const svg = svgBuilder.build(layout, currentTheme);
        return `<div class="c4x-diagram">${svg}</div>`;
      } catch (err) {
        return `<div class="c4x-error">${err.message}</div>`;
      }
    }

    return fence(tokens, idx, options, env, self);
  };
}
```

---

### Theme System

```typescript
// src/themes/Theme.ts
export interface Theme {
  name: string;
  colors: {
    person: string;              // Person element color
    softwareSystem: string;      // Software System color
    externalSystem: string;      // External System color
    container: string;           // Container color
    component: string;           // Component color
    relationship: string;        // Relationship arrow color
    background: string;          // Background color
    text: string;                // Text color
  };
  styles: {
    borderRadius: number;        // Corner radius (0 = square)
    borderWidth: number;         // Border thickness
    fontSize: number;            // Font size
    fontFamily: string;          // Font family
  };
}

// Classic Theme (C4 Model official)
export const ClassicTheme: Theme = {
  name: 'Classic',
  colors: {
    person: '#08427B',
    softwareSystem: '#1168BD',
    externalSystem: '#999999',
    container: '#438DD5',
    component: '#85BBF0',
    relationship: '#707070',
    background: '#FFFFFF',
    text: '#000000',
  },
  styles: {
    borderRadius: 0,
    borderWidth: 2,
    fontSize: 14,
    fontFamily: 'Arial, sans-serif',
  },
};
```

**Auto Theme** (match VS Code theme):
```typescript
export function getAutoTheme(): Theme {
  const isDark = vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark;
  return isDark ? DarkTheme : LightTheme;
}
```

---

### Export PNG (Headless Browser)

```typescript
// src/export/PngExporter.ts
import { chromium } from 'playwright';

export async function exportPng(svg: string, outputPath: string, scale: number = 2) {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: scale, // 1x, 2x, or 4x
  });

  const html = `
    <html>
      <body style="margin:0">${svg}</body>
    </html>
  `;
  await page.setContent(html);
  await page.screenshot({ path: outputPath, type: 'png' });
  await browser.close();
}
```

**Why Playwright?**
- High-quality PNG rendering (anti-aliased)
- Retina-ready exports (2x, 4x resolution)
- No external dependencies (bundled Chromium)

---

## 📊 Metrics

### Code Metrics (Target)
- **Lines of Code**: ~800 lines (plugin, themes, export)
- **TypeScript Files**: ~10 files
- **Theme Files**: 5 themes
- **Bundle Size**: < 800KB (includes Playwright if bundled)

### Performance Metrics
| Metric | Target | How to Measure |
|--------|--------|----------------|
| Theme switch | < 100ms | `console.time('themeSwitch')` |
| Export SVG | < 200ms | `console.time('exportSvg')` |
| Export PNG | < 2s | `console.time('exportPng')` |

---

## 🔄 Timeline

```
Week of November 4-10, 2025 (7 days)
|----------------------------------------|
Day 1-2: MarkdownIt plugin + fenced blocks
Day 3-4: Theme system (5 themes)
Day 5-6: Export SVG/PNG + clipboard
Day 7:   Documentation + final validation
```

---

## 🚧 Blockers

### Current Blockers
- **M1 Not Complete**: Cannot start until M1 (C4X-DSL MVP) is done

### Potential Blockers
- **Playwright Bundle Size**: Mitigation - Lazy-load Playwright, only for PNG export

---

## 🎯 Definition of Done

### Code Complete
- [ ] All deliverables checked off
- [ ] ` ```c4x ` blocks render in Markdown
- [ ] 5 themes implemented and tested
- [ ] Export SVG/PNG works
- [ ] All tests passing (> 80% coverage)

### Quality Complete
- [ ] Code Review Agent validated (`/review-code`)
- [ ] QA Agent validated (theme screenshots, export quality)
- [ ] Performance targets met (< 100ms theme switch)
- [ ] No regressions (M0, M1 features still work)

### Release Complete
- [ ] `.vsix` file updated (v0.3.0)
- [ ] Git tag created (`v0.3.0`)
- [ ] CHANGELOG.md updated
- [ ] STATUS.md updated (M2 complete)
- [ ] User guide published (Markdown integration)

---

## 📞 Next Steps

### After M2 Completion
1. **Validate milestone** (`/validate-milestone`)
2. **Update STATUS.md** (mark M2 complete)
3. **Tag release** (`git tag v0.3.0`)
4. **Agent sync** (retrospective + M3/M4 planning)
5. **Start M3 & M4 in parallel** (Structurizr DSL + PlantUML C4)

---

## 📚 References

### Markdown Integration
- [VS Code Markdown Extensions](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [MarkdownIt Plugin Guide](https://github.com/markdown-it/markdown-it)

### Theme Design
- [C4 Model Notation](https://c4model.com/#Notation)
- [WCAG AAA Guidelines](https://www.w3.org/WAI/WCAG2AAA-Conformance)

### Internal References
- [TDR-011: Syntax Approach](../../adrs/TDR-011-syntax-approach.md)
- [Documentation Agent](../../../.claude/agents/documentation.md)

---

**Phase Owner**: Documentation Agent (DOCA)
**Target Completion**: 2025-11-10
**Status**: 🔴 **NOT STARTED** - Awaiting M1 completion
