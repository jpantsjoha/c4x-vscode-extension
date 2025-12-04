# Phase 3 (M2 - Markdown Integration) - Complete Task Breakdown

**Version**: v0.3.0
**Target Completion**: November 10, 2025
**Total Estimated Time**: 18-22 hours (3-4 working days)
**Status**: 🔴 NOT STARTED

---

## Executive Summary

Phase 3 transforms C4X from a standalone `.c4x` file viewer into a **Markdown-integrated** diagramming tool that rivals Mermaid. By the end of this phase, users can embed C4 diagrams directly in README.md files, switch between 5 professional themes, and export diagrams as high-quality SVG/PNG files.

### What We're Building

By the end of Phase 3, users will be able to:
1. Write ` ```c4x ` fenced blocks in Markdown files
2. See diagrams render inline in VS Code Markdown preview
3. Switch themes instantly (< 100ms) - Classic, Modern, Muted, High-Contrast, Auto
4. Export diagrams as SVG files (preserving all styling)
5. Export diagrams as high-resolution PNG (1x, 2x, 4x)
6. Copy SVG to clipboard for pasting into Figma, Confluence, etc.

### Key Technical Components

1. **MarkdownIt Plugin** - Intercepts ` ```c4x ` fenced blocks in Markdown preview
2. **Theme System** - 5 complete themes with color palettes and styling options
3. **SVG Exporter** - Saves diagrams as standalone SVG files with embedded fonts
4. **PNG Exporter** - Uses Playwright headless browser for high-quality raster export
5. **Clipboard Integration** - System clipboard API for copy/paste workflows

---

## Task Categories Overview

| Category | Tasks | Est. Time | Priority |
|----------|-------|-----------|----------|
| **0. Phase 2 Cleanup** | 4 tasks | 1 hr | High (start immediately) |
| **1. Markdown Integration** | 6 tasks | 5-6 hrs | Critical Path |
| **2. Theme System** | 7 tasks | 4-5 hrs | Critical Path |
| **3. Export Functionality** | 6 tasks | 5-6 hrs | Critical Path |
| **4. Testing & Quality** | 4 tasks | 2-3 hrs | High |
| **5. Documentation** | 3 tasks | 1-2 hrs | Medium |
| **TOTAL** | **30 tasks** | **18-22 hrs** | - |

---

## Category 0: Phase 2 Cleanup & Quick Wins

**Purpose**: Address Phase 2 code review recommendations and prepare for Phase 3
**Estimated Time**: 1 hour
**Priority**: High (complete before starting Markdown integration)

### Task 0.1: Update to Main Branch
**Time**: 10 minutes
**Priority**: High

**Description**: Switch to main branch, pull latest v0.2.0, create Phase 3 branch.

**Acceptance Criteria**:
- [ ] `git checkout main`
- [ ] `git pull origin main`
- [ ] Verify v0.2.0 tag present
- [ ] `git checkout -b phase-3-markdown-integration`

---

### Task 0.2: Review Phase 2 Code Review Recommendations
**File**: `docs/phases/phase-2-c4x-dsl-mvp/code-review-recommendations.md`
**Time**: 20 minutes
**Priority**: Medium

**Description**: Review Phase 2 code review and identify quick wins for Phase 3.

**Acceptance Criteria**:
- [ ] Read code review recommendations
- [ ] Identify tasks that can be completed in Phase 3
- [ ] Create TODO items for recommendations
- [ ] Prioritize based on impact

---

### Task 0.3: Verify Phase 2 Tests Still Pass
**Time**: 15 minutes
**Priority**: High

**Description**: Run full test suite to ensure Phase 2 baseline is solid.

**Acceptance Criteria**:
- [ ] `pnpm run test` - all 133 tests pass
- [ ] `pnpm run lint` - zero errors
- [ ] `pnpm run build` - builds successfully
- [ ] Document baseline metrics (bundle size, build time)

---

### Task 0.4: Update Phase 3 README Status
**File**: `docs/phases/phase-3-markdown-integration/README.md`
**Time**: 15 minutes
**Priority**: Medium

**Description**: Update Phase 3 README to mark as "IN PROGRESS".

**Acceptance Criteria**:
- [ ] Status changed to 🟡 **IN PROGRESS**
- [ ] Start date added
- [ ] Phase owner confirmed (Documentation Agent)

---

## Category 1: Markdown Integration

**Purpose**: Enable ` ```c4x ` fenced blocks in Markdown files
**Estimated Time**: 5-6 hours
**Priority**: Critical Path (highest priority feature)

### Task 1.1: Research VS Code Markdown Extension API
**Time**: 45 minutes
**Priority**: Critical

**Description**: Research VS Code Markdown extension API and MarkdownIt plugin system.

**Research Questions**:
- How do VS Code Markdown extensions work?
- How to register a custom MarkdownIt plugin?
- How to detect language for fenced blocks?
- How to inject custom HTML/SVG into Markdown preview?

**Acceptance Criteria**:
- [ ] Understand VS Code Markdown extension API
- [ ] Understand MarkdownIt plugin registration
- [ ] Document API surface in notes
- [ ] Identify potential challenges

**References**:
- [VS Code Markdown Extension Guide](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [MarkdownIt Plugin Docs](https://github.com/markdown-it/markdown-it)

---

### Task 1.2: Install and Configure MarkdownIt Dependencies
**Files**: `package.json`, `tsconfig.json`
**Time**: 15 minutes
**Priority**: Critical

**Description**: Install MarkdownIt and configure TypeScript types.

**Steps**:
1. Install: `pnpm add markdown-it @types/markdown-it`
2. Update tsconfig.json if needed
3. Verify imports work

**Acceptance Criteria**:
- [ ] `markdown-it` installed
- [ ] `@types/markdown-it` installed
- [ ] TypeScript compilation succeeds
- [ ] No type errors

---

### Task 1.3: Create C4X MarkdownIt Plugin
**File**: `src/markdown/c4xPlugin.ts`
**Time**: 2 hours
**Priority**: Critical

**Description**: Implement MarkdownIt plugin to intercept ` ```c4x ` fenced blocks.

**Plugin Structure**:
```typescript
import * as MarkdownIt from 'markdown-it';
import { c4xParser } from '../parser';
import { c4ModelBuilder } from '../model';
import { dagreLayoutEngine } from '../layout';
import { svgBuilder } from '../render';
import { getCurrentTheme } from '../themes';

export function c4xPlugin(md: MarkdownIt) {
  const defaultFence = md.renderer.rules.fence;

  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim();

    if (lang === 'c4x') {
      return renderC4XBlock(token.content);
    }

    return defaultFence(tokens, idx, options, env, self);
  };
}

function renderC4XBlock(source: string): string {
  try {
    // 1. Parse C4X syntax
    const parseResult = c4xParser.parse(source);

    // 2. Build C4 Model IR
    const model = c4ModelBuilder.build(parseResult, 'markdown');

    // 3. Layout
    const layout = await dagreLayoutEngine.layout(model.views[0]);

    // 4. Render SVG with current theme
    const theme = getCurrentTheme();
    const svg = svgBuilder.build(layout, { theme });

    // 5. Wrap in container div
    return `<div class="c4x-diagram">${svg}</div>`;

  } catch (error) {
    // Show error in preview
    return `
      <div class="c4x-error">
        <strong>C4X Parse Error:</strong>
        <pre>${error.message}</pre>
      </div>
    `;
  }
}
```

**Acceptance Criteria**:
- [ ] Plugin detects ` ```c4x ` fenced blocks
- [ ] Plugin calls parser → model → layout → render pipeline
- [ ] Plugin returns inline SVG HTML
- [ ] Parse errors shown inline with clear messages
- [ ] Plugin doesn't affect other code blocks (```js, ```python, etc.)

**Reference**: Phase 3 README - MarkdownIt Plugin section

---

### Task 1.4: Register Plugin with VS Code Markdown API
**File**: `src/extension.ts`, `package.json`
**Time**: 1 hour
**Priority**: Critical

**Description**: Register C4X plugin with VS Code's Markdown extension system.

**Package.json Contribution**:
```json
{
  "contributes": {
    "markdown.markdownItPlugins": true
  }
}
```

**Extension Activation**:
```typescript
export function activate(context: vscode.ExtensionContext) {
  // Existing activation code...

  // Register Markdown plugin
  return {
    extendMarkdownIt(md: MarkdownIt) {
      return md.use(c4xPlugin);
    }
  };
}
```

**Acceptance Criteria**:
- [ ] `markdown.markdownItPlugins` declared in package.json
- [ ] `extendMarkdownIt` function exported from activate()
- [ ] Plugin registered when extension loads
- [ ] VS Code Markdown preview calls plugin

**Reference**: [VS Code Markdown API](https://code.visualstudio.com/api/extension-guides/markdown-extension)

---

### Task 1.5: Add CSS Styling for Markdown Diagrams
**File**: `src/markdown/c4x.css`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Add CSS styles for C4X diagrams in Markdown preview.

**Styles Needed**:
```css
/* Container for diagram */
.c4x-diagram {
  margin: 20px 0;
  padding: 10px;
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.c4x-diagram svg {
  max-width: 100%;
  height: auto;
}

/* Error display */
.c4x-error {
  margin: 20px 0;
  padding: 15px;
  background: #fee;
  border: 1px solid #fcc;
  border-radius: 4px;
  color: #c00;
}

.c4x-error strong {
  display: block;
  margin-bottom: 10px;
}

.c4x-error pre {
  margin: 0;
  padding: 10px;
  background: #fff;
  border: 1px solid #fcc;
  border-radius: 2px;
  overflow-x: auto;
}
```

**Acceptance Criteria**:
- [ ] CSS file created
- [ ] Styles injected into Markdown preview webview
- [ ] Diagrams centered and properly styled
- [ ] Errors clearly visible with red background

---

### Task 1.6: Write Markdown Integration Tests
**File**: `test/suite/markdown.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Test Markdown plugin with various ` ```c4x ` blocks.

**Test Cases**:
- Simple ` ```c4x ` block renders correctly
- Invalid C4X syntax shows error
- Multiple ` ```c4x ` blocks in one file
- Mixed code blocks (` ```c4x `, ` ```js `, ` ```python `)
- Empty ` ```c4x ` block
- Plugin doesn't affect non-c4x blocks

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] All valid C4X blocks render
- [ ] All invalid blocks show errors
- [ ] Other code blocks unaffected
- [ ] Tests run in VS Code test environment

---

## Category 2: Theme System

**Purpose**: Implement 5 professional themes with instant switching
**Estimated Time**: 4-5 hours
**Priority**: Critical Path

### Task 2.1: Define Theme Interface and Types
**File**: `src/themes/Theme.ts`
**Time**: 30 minutes
**Priority**: Critical

**Description**: Define TypeScript interfaces for theme system.

**Theme Interface**:
```typescript
export interface C4Theme {
  name: string;
  displayName: string;
  description: string;
  colors: {
    person: C4ElementColors;
    softwareSystem: C4ElementColors;
    externalSystem: C4ElementColors;
    container: C4ElementColors;
    component: C4ElementColors;
    relationship: C4RelationshipColors;
    background: string;
  };
  styles: {
    borderRadius: number;      // 0 = square, 10 = rounded
    borderWidth: number;        // 1-4px
    fontSize: number;           // 12-16px
    fontFamily: string;         // 'Arial', 'Helvetica', etc.
    shadowEnabled: boolean;     // Drop shadow on elements
  };
}

export interface C4ElementColors {
  fill: string;                 // Element background color
  stroke: string;               // Border color
  text: string;                 // Text color
}

export interface C4RelationshipColors {
  stroke: string;               // Arrow line color
  text: string;                 // Label text color
}

export type ThemeName = 'classic' | 'modern' | 'muted' | 'high-contrast' | 'auto';
```

**Acceptance Criteria**:
- [ ] All theme types defined
- [ ] Types exported from module
- [ ] JSDoc comments added
- [ ] No compilation errors

---

### Task 2.2: Implement Classic Theme
**File**: `src/themes/ClassicTheme.ts`
**Time**: 30 minutes
**Priority**: Critical

**Description**: Implement C4 Model official color palette (default theme).

**Classic Theme Definition**:
```typescript
import { C4Theme } from './Theme';

export const ClassicTheme: C4Theme = {
  name: 'classic',
  displayName: 'Classic',
  description: 'Official C4 Model colors (Simon Brown)',
  colors: {
    person: {
      fill: '#08427B',      // Dark blue
      stroke: '#000000',
      text: '#FFFFFF',
    },
    softwareSystem: {
      fill: '#1168BD',      // Medium blue
      stroke: '#000000',
      text: '#FFFFFF',
    },
    externalSystem: {
      fill: '#999999',      // Gray
      stroke: '#000000',
      text: '#FFFFFF',
    },
    container: {
      fill: '#438DD5',      // Light blue
      stroke: '#000000',
      text: '#FFFFFF',
    },
    component: {
      fill: '#85BBF0',      // Very light blue
      stroke: '#000000',
      text: '#000000',
    },
    relationship: {
      stroke: '#707070',    // Dark gray
      text: '#000000',
    },
    background: '#FFFFFF',
  },
  styles: {
    borderRadius: 0,          // Square corners
    borderWidth: 2,
    fontSize: 14,
    fontFamily: 'Arial, sans-serif',
    shadowEnabled: false,
  },
};
```

**Acceptance Criteria**:
- [ ] Colors match C4 Model official specification
- [ ] Theme exports correctly
- [ ] Theme works with SVG renderer

**Reference**: [C4 Model Notation](https://c4model.com/#Notation)

---

### Task 2.3: Implement Modern Theme
**File**: `src/themes/ModernTheme.ts`
**Time**: 30 minutes
**Priority**: High

**Description**: Vibrant colors with rounded corners (startup/tech-focused).

**Modern Theme Definition**:
```typescript
export const ModernTheme: C4Theme = {
  name: 'modern',
  displayName: 'Modern',
  description: 'Vibrant colors with rounded corners',
  colors: {
    person: {
      fill: '#667EEA',      // Purple
      stroke: '#5A67D8',
      text: '#FFFFFF',
    },
    softwareSystem: {
      fill: '#48BB78',      // Green
      stroke: '#38A169',
      text: '#FFFFFF',
    },
    externalSystem: {
      fill: '#CBD5E0',      // Light gray
      stroke: '#A0AEC0',
      text: '#2D3748',
    },
    container: {
      fill: '#4299E1',      // Bright blue
      stroke: '#3182CE',
      text: '#FFFFFF',
    },
    component: {
      fill: '#ED8936',      // Orange
      stroke: '#DD6B20',
      text: '#FFFFFF',
    },
    relationship: {
      stroke: '#4A5568',
      text: '#2D3748',
    },
    background: '#F7FAFC',
  },
  styles: {
    borderRadius: 12,         // Rounded corners
    borderWidth: 2,
    fontSize: 14,
    fontFamily: 'Inter, Helvetica, sans-serif',
    shadowEnabled: true,      // Drop shadows
  },
};
```

**Acceptance Criteria**:
- [ ] Vibrant, modern color palette
- [ ] Rounded corners (12px radius)
- [ ] Drop shadows enabled
- [ ] Theme exports correctly

---

### Task 2.4: Implement Muted Theme
**File**: `src/themes/MutedTheme.ts`
**Time**: 30 minutes
**Priority**: High

**Description**: Grayscale minimalist theme (professional/corporate).

**Muted Theme Definition**:
```typescript
export const MutedTheme: C4Theme = {
  name: 'muted',
  displayName: 'Muted',
  description: 'Grayscale minimalist (professional)',
  colors: {
    person: {
      fill: '#4A5568',      // Dark gray
      stroke: '#2D3748',
      text: '#FFFFFF',
    },
    softwareSystem: {
      fill: '#718096',      // Medium gray
      stroke: '#4A5568',
      text: '#FFFFFF',
    },
    externalSystem: {
      fill: '#CBD5E0',      // Light gray
      stroke: '#A0AEC0',
      text: '#2D3748',
    },
    container: {
      fill: '#A0AEC0',      // Lighter gray
      stroke: '#718096',
      text: '#2D3748',
    },
    component: {
      fill: '#E2E8F0',      // Very light gray
      stroke: '#CBD5E0',
      text: '#2D3748',
    },
    relationship: {
      stroke: '#4A5568',
      text: '#2D3748',
    },
    background: '#FFFFFF',
  },
  styles: {
    borderRadius: 4,
    borderWidth: 1,
    fontSize: 13,
    fontFamily: 'Georgia, serif',
    shadowEnabled: false,
  },
};
```

**Acceptance Criteria**:
- [ ] Grayscale color palette
- [ ] Minimal styling (thin borders, small radius)
- [ ] Professional appearance
- [ ] Theme exports correctly

---

### Task 2.5: Implement High-Contrast Theme
**File**: `src/themes/HighContrastTheme.ts`
**Time**: 45 minutes
**Priority**: Medium

**Description**: WCAG AAA compliant theme for accessibility.

**High-Contrast Theme Definition**:
```typescript
export const HighContrastTheme: C4Theme = {
  name: 'high-contrast',
  displayName: 'High Contrast',
  description: 'WCAG AAA compliant (accessible)',
  colors: {
    person: {
      fill: '#000000',      // Pure black
      stroke: '#000000',
      text: '#FFFFFF',      // Pure white
    },
    softwareSystem: {
      fill: '#0000CC',      // Dark blue
      stroke: '#000000',
      text: '#FFFFFF',
    },
    externalSystem: {
      fill: '#FFFFFF',      // White
      stroke: '#000000',
      text: '#000000',
    },
    container: {
      fill: '#006600',      // Dark green
      stroke: '#000000',
      text: '#FFFFFF',
    },
    component: {
      fill: '#CC0000',      // Dark red
      stroke: '#000000',
      text: '#FFFFFF',
    },
    relationship: {
      stroke: '#000000',
      text: '#000000',
    },
    background: '#FFFFFF',
  },
  styles: {
    borderRadius: 0,
    borderWidth: 3,           // Thicker borders
    fontSize: 16,             // Larger text
    fontFamily: 'Arial, sans-serif',
    shadowEnabled: false,
  },
};
```

**Acceptance Criteria**:
- [ ] WCAG AAA contrast ratios (7:1 minimum)
- [ ] Pure black/white for maximum contrast
- [ ] Thicker borders and larger text
- [ ] Theme exports correctly

**Reference**: [WCAG AAA Guidelines](https://www.w3.org/WAI/WCAG2AAA-Conformance)

---

### Task 2.6: Implement Auto Theme (Light/Dark)
**File**: `src/themes/AutoTheme.ts`
**Time**: 1 hour
**Priority**: Medium

**Description**: Auto-detect VS Code theme and apply matching C4 theme.

**Auto Theme Logic**:
```typescript
import * as vscode from 'vscode';
import { C4Theme } from './Theme';

export function getAutoTheme(): C4Theme {
  const colorThemeKind = vscode.window.activeColorTheme.kind;

  switch (colorThemeKind) {
    case vscode.ColorThemeKind.Dark:
    case vscode.ColorThemeKind.HighContrastDark:
      return DarkTheme;

    case vscode.ColorThemeKind.Light:
    case vscode.ColorThemeKind.HighContrastLight:
      return LightTheme;

    default:
      return ClassicTheme;
  }
}

// Dark variant for dark VS Code themes
const DarkTheme: C4Theme = {
  name: 'auto-dark',
  displayName: 'Auto (Dark)',
  description: 'Matches VS Code dark theme',
  colors: {
    person: {
      fill: '#569CD6',      // VS Code blue
      stroke: '#4EC9B0',
      text: '#D4D4D4',
    },
    softwareSystem: {
      fill: '#4EC9B0',      // VS Code cyan
      stroke: '#569CD6',
      text: '#D4D4D4',
    },
    externalSystem: {
      fill: '#6A737D',      // Muted gray
      stroke: '#8E949A',
      text: '#D4D4D4',
    },
    container: {
      fill: '#DCDCAA',      // VS Code yellow
      stroke: '#CE9178',
      text: '#1E1E1E',
    },
    component: {
      fill: '#C586C0',      // VS Code purple
      stroke: '#D16969',
      text: '#D4D4D4',
    },
    relationship: {
      stroke: '#858585',
      text: '#D4D4D4',
    },
    background: '#1E1E1E',
  },
  styles: {
    borderRadius: 4,
    borderWidth: 2,
    fontSize: 14,
    fontFamily: 'Consolas, monospace',
    shadowEnabled: false,
  },
};

// Light variant for light VS Code themes
const LightTheme: C4Theme = {
  name: 'auto-light',
  displayName: 'Auto (Light)',
  description: 'Matches VS Code light theme',
  colors: {
    person: {
      fill: '#0000FF',      // Blue
      stroke: '#000080',
      text: '#FFFFFF',
    },
    softwareSystem: {
      fill: '#008080',      // Teal
      stroke: '#006666',
      text: '#FFFFFF',
    },
    externalSystem: {
      fill: '#D3D3D3',      // Light gray
      stroke: '#A9A9A9',
      text: '#000000',
    },
    container: {
      fill: '#FFA500',      // Orange
      stroke: '#FF8C00',
      text: '#000000',
    },
    component: {
      fill: '#800080',      // Purple
      stroke: '#660066',
      text: '#FFFFFF',
    },
    relationship: {
      stroke: '#666666',
      text: '#000000',
    },
    background: '#FFFFFF',
  },
  styles: {
    borderRadius: 4,
    borderWidth: 2,
    fontSize: 14,
    fontFamily: 'Consolas, monospace',
    shadowEnabled: false,
  },
};
```

**Acceptance Criteria**:
- [ ] Detects VS Code color theme kind
- [ ] Returns dark theme for dark VS Code themes
- [ ] Returns light theme for light VS Code themes
- [ ] Updates when user changes VS Code theme

---

### Task 2.7: Implement Theme Switcher Command
**File**: `src/commands/changeTheme.ts`, `package.json`
**Time**: 1 hour
**Priority**: High

**Description**: Add command to switch themes with quick pick UI.

**Command Implementation**:
```typescript
import * as vscode from 'vscode';
import { ThemeManager } from '../themes/ThemeManager';

export async function changeThemeCommand() {
  const themes = ThemeManager.getAllThemes();

  const items = themes.map(theme => ({
    label: theme.displayName,
    description: theme.description,
    theme: theme,
  }));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a C4X theme',
    matchOnDescription: true,
  });

  if (selected) {
    await ThemeManager.setCurrentTheme(selected.theme.name);
    vscode.window.showInformationMessage(`C4X theme changed to ${selected.label}`);
  }
}
```

**Package.json Command**:
```json
{
  "contributes": {
    "commands": [
      {
        "command": "c4x.changeTheme",
        "title": "C4X: Change Theme"
      }
    ]
  }
}
```

**Acceptance Criteria**:
- [ ] Command registered in package.json
- [ ] Quick pick shows all 5 themes
- [ ] Theme descriptions visible
- [ ] Selected theme applied instantly (< 100ms)
- [ ] All open previews refresh with new theme
- [ ] Theme preference persisted to workspace settings

---

## Category 3: Export Functionality

**Purpose**: Export diagrams as SVG/PNG files and copy to clipboard
**Estimated Time**: 5-6 hours
**Priority**: Critical Path

### Task 3.1: Implement SVG Export Command
**File**: `src/export/SvgExporter.ts`, `src/commands/exportSvg.ts`
**Time**: 1.5 hours
**Priority**: Critical

**Description**: Export current diagram as standalone SVG file with embedded fonts.

**SVG Exporter Implementation**:
```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class SvgExporter {
  public async export(svg: string, theme: C4Theme): Promise<void> {
    // 1. Enhance SVG with embedded fonts and standalone attributes
    const standaloneSvg = this.makeStandalone(svg, theme);

    // 2. Prompt user for save location
    const uri = await vscode.window.showSaveDialog({
      filters: {
        'SVG Files': ['svg'],
        'All Files': ['*'],
      },
      defaultUri: vscode.workspace.workspaceFolders?.[0]?.uri,
    });

    if (!uri) {
      return; // User cancelled
    }

    // 3. Write SVG to file
    await vscode.workspace.fs.writeFile(uri, Buffer.from(standaloneSvg, 'utf8'));

    vscode.window.showInformationMessage(`SVG exported to ${path.basename(uri.fsPath)}`);
  }

  private makeStandalone(svg: string, theme: C4Theme): string {
    // Add XML declaration
    const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8"?>\n';

    // Embed fonts in <defs>
    const fontDefs = `
      <defs>
        <style type="text/css">
          @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(theme.styles.fontFamily)}');

          text {
            font-family: ${theme.styles.fontFamily};
            font-size: ${theme.styles.fontSize}px;
          }
        </style>
      </defs>
    `;

    // Insert font defs after opening <svg> tag
    const enhanced = svg.replace('<svg', `<svg xmlns="http://www.w3.org/2000/svg"`);
    const withFonts = enhanced.replace('>', `>\n${fontDefs}`);

    return xmlDeclaration + withFonts;
  }
}
```

**Export Command**:
```typescript
export async function exportSvgCommand() {
  const editor = vscode.window.activeTextEditor;

  if (!editor || !editor.document.fileName.endsWith('.c4x')) {
    vscode.window.showErrorMessage('Please open a .c4x file first');
    return;
  }

  // Get current preview SVG
  const svg = PreviewPanel.getCurrentSvg();
  const theme = ThemeManager.getCurrentTheme();

  const exporter = new SvgExporter();
  await exporter.export(svg, theme);
}
```

**Acceptance Criteria**:
- [ ] Command opens save dialog
- [ ] SVG saved with embedded fonts (no external dependencies)
- [ ] SVG preserves theme colors and styling
- [ ] SVG opens correctly in browsers and vector editors
- [ ] Export completes in < 200ms

---

### Task 3.2: Install and Configure Playwright for PNG Export
**Files**: `package.json`, `playwright.config.ts`
**Time**: 30 minutes
**Priority**: High

**Description**: Install Playwright for headless browser rendering.

**Steps**:
1. Install Playwright: `pnpm add -D playwright`
2. Install Chromium only: `pnpm exec playwright install chromium`
3. Create Playwright config

**Playwright Config**:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/playwright',
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
  },
});
```

**Acceptance Criteria**:
- [ ] Playwright installed
- [ ] Chromium browser downloaded
- [ ] Config file created
- [ ] Can launch headless browser programmatically

---

### Task 3.3: Implement PNG Export with Playwright
**File**: `src/export/PngExporter.ts`, `src/commands/exportPng.ts`
**Time**: 2 hours
**Priority**: High

**Description**: Export diagram as high-resolution PNG using headless Chromium.

**PNG Exporter Implementation**:
```typescript
import { chromium } from 'playwright';
import * as vscode from 'vscode';

export class PngExporter {
  public async export(svg: string, theme: C4Theme, scale: number = 2): Promise<void> {
    // 1. Prompt for resolution
    const resolution = await vscode.window.showQuickPick([
      { label: '1x (Standard)', description: '72 DPI', scale: 1 },
      { label: '2x (Retina)', description: '144 DPI', scale: 2 },
      { label: '4x (Print)', description: '288 DPI', scale: 4 },
    ], {
      placeHolder: 'Select export resolution',
    });

    if (!resolution) {
      return;
    }

    // 2. Prompt for save location
    const uri = await vscode.window.showSaveDialog({
      filters: {
        'PNG Files': ['png'],
        'All Files': ['*'],
      },
    });

    if (!uri) {
      return;
    }

    // 3. Launch headless browser
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `Exporting PNG (${resolution.label})...`,
    }, async (progress) => {
      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: resolution.scale,
      });

      const page = await context.newPage();

      // 4. Set HTML content with SVG
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body {
                margin: 0;
                padding: 20px;
                background: ${theme.colors.background};
              }
            </style>
          </head>
          <body>${svg}</body>
        </html>
      `;
      await page.setContent(html);

      // 5. Wait for fonts to load
      await page.waitForTimeout(500);

      // 6. Take screenshot
      const svgElement = await page.$('svg');
      await svgElement?.screenshot({
        path: uri.fsPath,
        type: 'png',
        omitBackground: false,
      });

      await browser.close();
    });

    vscode.window.showInformationMessage(`PNG exported to ${path.basename(uri.fsPath)}`);
  }
}
```

**Acceptance Criteria**:
- [ ] Prompts for resolution (1x, 2x, 4x)
- [ ] Renders SVG in headless browser
- [ ] Exports high-quality PNG (anti-aliased)
- [ ] Preserves theme colors and styling
- [ ] Export completes in < 2 seconds
- [ ] PNG opens correctly in image viewers

---

### Task 3.4: Implement Copy to Clipboard
**File**: `src/export/ClipboardExporter.ts`, `src/commands/copySvg.ts`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Copy SVG markup to system clipboard for pasting into other tools.

**Clipboard Exporter**:
```typescript
import * as vscode from 'vscode';

export class ClipboardExporter {
  public async copyToClipboard(svg: string): Promise<void> {
    // Make SVG standalone
    const standaloneSvg = this.makeStandalone(svg);

    // Copy to clipboard
    await vscode.env.clipboard.writeText(standaloneSvg);

    vscode.window.showInformationMessage('SVG copied to clipboard');
  }

  private makeStandalone(svg: string): string {
    // Ensure SVG has xmlns attribute
    if (!svg.includes('xmlns=')) {
      svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    return svg;
  }
}
```

**Copy Command**:
```typescript
export async function copySvgCommand() {
  const svg = PreviewPanel.getCurrentSvg();

  if (!svg) {
    vscode.window.showErrorMessage('No diagram to copy');
    return;
  }

  const exporter = new ClipboardExporter();
  await exporter.copyToClipboard(svg);
}
```

**Package.json Command**:
```json
{
  "commands": [
    {
      "command": "c4x.copySvg",
      "title": "C4X: Copy SVG to Clipboard"
    }
  ]
}
```

**Acceptance Criteria**:
- [ ] Command copies SVG to clipboard
- [ ] SVG includes xmlns attribute
- [ ] Can paste into Figma, Sketch, browser
- [ ] Shows success notification
- [ ] Copy completes in < 50ms

---

### Task 3.5: Add Export Keybindings
**File**: `package.json`
**Time**: 15 minutes
**Priority**: Low

**Description**: Add keyboard shortcuts for export commands.

**Keybindings**:
```json
{
  "contributes": {
    "keybindings": [
      {
        "command": "c4x.exportSvg",
        "key": "ctrl+k ctrl+s",
        "mac": "cmd+k cmd+s",
        "when": "editorLangId == c4x"
      },
      {
        "command": "c4x.exportPng",
        "key": "ctrl+k ctrl+p",
        "mac": "cmd+k cmd+p",
        "when": "editorLangId == c4x"
      },
      {
        "command": "c4x.copySvg",
        "key": "ctrl+k ctrl+c",
        "mac": "cmd+k cmd+c",
        "when": "editorLangId == c4x"
      }
    ]
  }
}
```

**Acceptance Criteria**:
- [ ] Keybindings registered
- [ ] Only active when `.c4x` file is open
- [ ] Keybindings documented in README
- [ ] No conflicts with existing VS Code shortcuts

---

### Task 3.6: Write Export Unit Tests
**File**: `test/suite/export.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: Test export functionality with various diagrams and themes.

**Test Cases**:
- Export SVG - file created with correct content
- Export PNG 1x - file created with correct dimensions
- Export PNG 2x - file has double dimensions
- Export PNG 4x - file has quadruple dimensions
- Copy to clipboard - clipboard contains SVG
- Export with different themes - colors preserved
- Export error handling - invalid diagram

**Acceptance Criteria**:
- [ ] 15+ test cases
- [ ] All export formats tested
- [ ] All resolutions tested
- [ ] Theme preservation verified
- [ ] Error cases handled

---

## Category 4: Testing & Quality

**Purpose**: Ensure Phase 3 quality and no regressions
**Estimated Time**: 2-3 hours
**Priority**: High

### Task 4.1: Integration Tests (Markdown + Themes + Export)
**File**: `test/suite/integration-phase3.test.ts`
**Time**: 1 hour
**Priority**: High

**Description**: End-to-end tests for Phase 3 features.

**Test Scenarios**:
- Create `.md` file with ` ```c4x ` block → renders correctly
- Switch theme → Markdown preview updates
- Export SVG from Markdown preview → file created
- Export PNG from `.c4x` file → high-quality image
- Copy SVG → clipboard contains valid SVG
- Multiple themes in sequence → all render correctly

**Acceptance Criteria**:
- [ ] 10+ integration tests
- [ ] Full workflows tested
- [ ] All commands tested
- [ ] Performance benchmarks included

---

### Task 4.2: Visual Regression Tests (Theme Screenshots)
**File**: `test/visual/theme-screenshots.test.ts`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Generate screenshots of all themes for visual comparison.

**Test Cases**:
- Same diagram rendered in all 5 themes
- Screenshot saved to `test/visual/screenshots/`
- Manual review for visual quality

**Acceptance Criteria**:
- [ ] Screenshot generated for each theme
- [ ] All themes visually distinct
- [ ] Screenshots saved to git (for regression detection)
- [ ] Screenshots included in documentation

---

### Task 4.3: Performance Benchmarks
**File**: `test/performance/phase3-benchmarks.test.ts`
**Time**: 30 minutes
**Priority**: Medium

**Description**: Benchmark Phase 3 performance targets.

**Benchmarks**:
- Theme switch time (target: < 100ms)
- SVG export time (target: < 200ms)
- PNG export time (target: < 2s)
- Markdown rendering time (target: < 300ms)

**Acceptance Criteria**:
- [ ] All benchmarks documented
- [ ] Performance targets met
- [ ] Regression alerts if performance degrades

---

### Task 4.4: Run Code Review & QA Validation
**Time**: 45 minutes
**Priority**: High

**Description**: Request code review and QA validation.

**Steps**:
1. Run `/review-code` - VSCode Extension Expert reviews Phase 3
2. Address critical recommendations
3. Run QA validation agent
4. Document recommendations for Phase 4

**Acceptance Criteria**:
- [ ] Code review completed (target: > 95/100)
- [ ] QA validation passed (target: > 95/100)
- [ ] Recommendations documented
- [ ] No critical blockers

---

## Category 5: Documentation

**Purpose**: Document Phase 3 features for users and contributors
**Estimated Time**: 1-2 hours
**Priority**: Medium

### Task 5.1: Update README with Markdown Examples
**File**: `README.md`
**Time**: 30 minutes
**Priority**: High

**Description**: Add Markdown integration examples to README.

**Sections to Add**:
- How to embed C4X in Markdown (` ```c4x ` blocks)
- Theme showcase with screenshots
- Export guide (SVG vs PNG use cases)
- Keyboard shortcuts reference

**Acceptance Criteria**:
- [ ] Markdown examples added
- [ ] Theme screenshots included
- [ ] Export guide complete
- [ ] Shortcuts documented

---

### Task 5.2: Create User Guide for Themes and Export
**File**: `docs/USER-GUIDE.md`
**Time**: 45 minutes
**Priority**: Medium

**Description**: Comprehensive user guide for Phase 3 features.

**Sections**:
1. Embedding C4X in Markdown
2. Choosing the Right Theme
3. Exporting Diagrams (SVG, PNG)
4. Clipboard Workflow (paste into Figma, Confluence)
5. Troubleshooting

**Acceptance Criteria**:
- [ ] User guide complete
- [ ] All features documented
- [ ] Examples included
- [ ] Troubleshooting section

---

### Task 5.3: Update CHANGELOG for v0.3.0
**File**: `CHANGELOG.md`
**Time**: 15 minutes
**Priority**: Medium

**Description**: Document Phase 3 changes in changelog.

**Changelog Entry**:
```markdown
## [0.3.0] - 2025-11-10

### Added
- **Markdown Integration**: ` ```c4x ` fenced blocks in Markdown preview
  - Inline SVG rendering (no external files)
  - Error display for invalid syntax
  - Works with VS Code Markdown preview
- **Theme System**: 5 professional themes
  - Classic (C4 Model official colors)
  - Modern (vibrant, rounded corners)
  - Muted (grayscale, minimalist)
  - High-Contrast (WCAG AAA accessible)
  - Auto (match VS Code light/dark theme)
  - Theme switcher command: "C4X: Change Theme"
- **Export Functionality**:
  - Export SVG (standalone, embedded fonts)
  - Export PNG (1x, 2x, 4x resolution)
  - Copy SVG to clipboard

### Performance
- Theme switch: < 100ms
- Export SVG: < 200ms
- Export PNG: < 2s (headless browser)

### Changed
- SVG renderer now supports theme customization
- Preview panel updates instantly when theme changes
```

**Acceptance Criteria**:
- [ ] Changelog updated
- [ ] Version bumped to 0.3.0
- [ ] All features listed
- [ ] Performance metrics included

---

## Timeline Breakdown

### Week 1 (Days 1-2): Markdown Integration

**Day 1: Markdown Plugin** (5-6 hours)
- Morning: Tasks 0.1-0.4 (Phase 2 cleanup, branch setup)
- Afternoon: Tasks 1.1-1.3 (Research, install deps, create plugin)

**Day 2: Markdown Polish** (2-3 hours)
- Morning: Tasks 1.4-1.6 (Register plugin, add CSS, tests)

---

### Week 1 (Days 3-4): Theme System

**Day 3: Theme Foundation** (4-5 hours)
- Morning: Tasks 2.1-2.3 (Theme interface, Classic, Modern)
- Afternoon: Tasks 2.4-2.5 (Muted, High-Contrast)

**Day 4: Theme Switcher** (2-3 hours)
- Morning: Tasks 2.6-2.7 (Auto theme, theme switcher command)

---

### Week 2 (Days 5-6): Export Functionality

**Day 5: Export Implementation** (5-6 hours)
- Morning: Tasks 3.1-3.2 (SVG export, Playwright setup)
- Afternoon: Tasks 3.3-3.4 (PNG export, clipboard)

**Day 6: Export Polish** (1-2 hours)
- Morning: Tasks 3.5-3.6 (Keybindings, tests)

---

### Week 2 (Day 7): Quality & Documentation

**Day 7: Polish & Release** (2-3 hours)
- Morning: Tasks 4.1-4.4 (Integration tests, visual regression, benchmarks, code review)
- Afternoon: Tasks 5.1-5.3 (README, user guide, changelog)
- Final: Create PR, merge to main, tag v0.3.0

---

## Risk Mitigation

### High-Risk Areas

**1. MarkdownIt Plugin Complexity**
- **Risk**: Plugin API changes, difficult integration
- **Mitigation**: Start with simple fence detection, defer advanced features
- **Fallback**: Recommend `.c4x` files, defer Markdown to Phase 4

**2. Playwright Bundle Size**
- **Risk**: Playwright adds ~100MB to extension
- **Mitigation**: Lazy-load Playwright, only download on first PNG export
- **Fallback**: Remove PNG export, SVG-only

**3. Theme Rendering Performance**
- **Risk**: Theme switching > 100ms, feels sluggish
- **Mitigation**: Cache SVG, only re-render on theme change
- **Fallback**: Manual refresh required after theme change

---

## Success Metrics

### Performance Targets (Must Meet)
- ✅ **Theme Switch**: < 100ms
- ✅ **Export SVG**: < 200ms
- ✅ **Export PNG**: < 2s (headless browser)
- ✅ **Markdown Render**: < 300ms (first render)

### Quality Targets (Must Meet)
- ✅ **Test Coverage**: > 80% (plugin, themes, export)
- ✅ **Code Review**: > 95/100 score
- ✅ **QA Validation**: > 95/100 score
- ✅ **Zero Regressions**: Phase 1 & 2 tests still passing

### Functional Targets (Must Meet)
- ✅ **` ```c4x ` blocks render** in Markdown preview
- ✅ **5 themes work** (Classic, Modern, Muted, High-Contrast, Auto)
- ✅ **SVG export** preserves quality and styling
- ✅ **PNG export** produces high-quality raster images

---

## Deliverables Checklist

### Code Deliverables
- [ ] MarkdownIt plugin (`src/markdown/c4xPlugin.ts`)
- [ ] Theme interface (`src/themes/Theme.ts`)
- [ ] Classic theme (`src/themes/ClassicTheme.ts`)
- [ ] Modern theme (`src/themes/ModernTheme.ts`)
- [ ] Muted theme (`src/themes/MutedTheme.ts`)
- [ ] High-Contrast theme (`src/themes/HighContrastTheme.ts`)
- [ ] Auto theme (`src/themes/AutoTheme.ts`)
- [ ] Theme manager (`src/themes/ThemeManager.ts`)
- [ ] Theme switcher command (`src/commands/changeTheme.ts`)
- [ ] SVG exporter (`src/export/SvgExporter.ts`)
- [ ] PNG exporter (`src/export/PngExporter.ts`)
- [ ] Clipboard exporter (`src/export/ClipboardExporter.ts`)

### Test Deliverables
- [ ] Markdown integration tests (15+ cases)
- [ ] Theme tests (20+ cases)
- [ ] Export tests (15+ cases)
- [ ] Integration tests (10+ cases)
- [ ] Visual regression tests (5 themes)
- [ ] Performance benchmarks

### Documentation Deliverables
- [ ] README updated with Markdown examples
- [ ] User guide for themes and export
- [ ] CHANGELOG updated for v0.3.0
- [ ] Theme screenshots for documentation

---

## Next Phase Preview

**Phase 4 (M3 - Structurizr DSL)**:
- Structurizr DSL parser (workspace, model, views, deployment)
- Multi-dialect support (C4X + Structurizr in same project)
- Workspace validation and IntelliSense
- Estimated time: 20-24 hours (3-4 days)

---

**Document Owner**: Documentation Agent (DOCA)
**Last Updated**: October 19, 2025
**Status**: 🔴 NOT STARTED - Ready to begin Phase 3
