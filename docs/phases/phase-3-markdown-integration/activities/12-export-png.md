# Activity 12: Export PNG with Playwright

**Task Reference**: PHASE-3-TASK-BREAKDOWN.md → Category 3, Tasks 3.2-3.3
**Estimated Time**: 2.5 hours
**Priority**: High
**Status**: 🟡 IN PROGRESS

---

## 📋 Overview

Implement high-quality PNG export using Playwright's headless Chromium browser. Support multiple resolution scales (1x, 2x, 4x) for different use cases (web, presentations, print). The headless browser approach ensures pixel-perfect anti-aliased rendering that matches the preview.

**Goal**: Enable users to export diagrams as high-resolution PNG images suitable for PowerPoint, documentation, and print.

---

## 🎯 Prerequisites

**Code Dependencies**:
- [ ] SVG export implemented (Activity 11)
- [ ] Theme system complete (Activity 04)
- [ ] Preview panel functional

**Knowledge Requirements**:
- Playwright browser automation
- Headless browser rendering
- Image formats and DPI
- Device pixel ratio concepts

---

## ✅ Acceptance Criteria

### Functional Requirements
- [x] Playwright installed and configured
- [x] Command `c4x.exportPng` working
- [x] Resolution picker (1x, 2x, 4x) functional
- [ ] PNG file written to disk
- [ ] PNG opens correctly in image viewers
- [ ] Anti-aliased, high-quality output
- [x] Progress indicator during export

### Performance Requirements
- [ ] Export completes in < 2 seconds
- [ ] File size reasonable (< 2MB for typical diagrams)

### Quality Requirements
- [ ] Sharp text rendering
- [ ] Smooth edges (anti-aliasing)
- [ ] Colors match theme
- [ ] Transparent background option

---

## 🔨 Implementation

### Step 1: Install Playwright

```bash
cd /path/to/c4model-vscode-extension

# Install Playwright (dev dependency)
pnpm add -D playwright

# Install Chromium browser only (smaller download)
pnpm exec playwright install chromium
```

**Create Playwright Config**:

**File**: `playwright.config.ts`

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/playwright',
  timeout: 30000,
  use: {
    headless: true,
    viewport: { width: 1920, height: 1080 },
    ignoreHTTPSErrors: true,
  },
});
```

---

### Step 2: Create PNG Exporter

**File**: `src/export/PngExporter.ts`

```typescript
import { chromium, Browser, Page } from 'playwright';
import * as vscode from 'vscode';
import * as path from 'path';
import { C4Theme } from '../themes/Theme';

/**
 * Resolution scale options for PNG export.
 */
export interface ResolutionOption {
  label: string;
  description: string;
  scale: number;
  dpi: number;
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
  {
    label: '1x (Standard)',
    description: '72 DPI - for web and screen display',
    scale: 1,
    dpi: 72,
  },
  {
    label: '2x (Retina)',
    description: '144 DPI - for high-resolution screens',
    scale: 2,
    dpi: 144,
  },
  {
    label: '4x (Print)',
    description: '288 DPI - for professional printing',
    scale: 4,
    dpi: 288,
  },
];

/**
 * Exports C4 diagrams as PNG using headless browser.
 */
export class PngExporter {
  /**
   * Export diagram as PNG file.
   *
   * @param svg - SVG markup from renderer
   * @param theme - Current theme
   * @param suggestedFileName - Default filename (optional)
   */
  public async export(
    svg: string,
    theme: C4Theme,
    suggestedFileName?: string
  ): Promise<void> {
    // 1. Prompt for resolution
    const resolution = await vscode.window.showQuickPick(RESOLUTION_OPTIONS, {
      placeHolder: 'Select export resolution',
      matchOnDescription: true,
    });

    if (!resolution) {
      return; // User cancelled
    }

    // 2. Prompt for save location
    const defaultFileName = suggestedFileName || 'diagram.png';
    const uri = await vscode.window.showSaveDialog({
      filters: {
        'PNG Files': ['png'],
        'All Files': ['*'],
      },
      defaultUri: vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultFileName)
        : undefined,
    });

    if (!uri) {
      return; // User cancelled
    }

    // 3. Export with progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Exporting PNG (${resolution.label})...`,
        cancellable: false,
      },
      async (progress) => {
        try {
          progress.report({ increment: 10, message: 'Launching browser...' });
          await this.renderPng(svg, theme, uri.fsPath, resolution.scale);

          progress.report({ increment: 90, message: 'Complete!' });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          vscode.window.showErrorMessage(`PNG export failed: ${message}`);
          throw error;
        }
      }
    );

    // 4. Show success message
    const fileName = path.basename(uri.fsPath);
    const action = await vscode.window.showInformationMessage(
      `PNG exported to ${fileName} (${resolution.dpi} DPI)`,
      'Open File',
      'Show in Folder'
    );

    if (action === 'Open File') {
      await vscode.commands.executeCommand('vscode.open', uri);
    } else if (action === 'Show in Folder') {
      await vscode.commands.executeCommand('revealFileInOS', uri);
    }
  }

  /**
   * Render PNG using headless browser.
   */
  private async renderPng(
    svg: string,
    theme: C4Theme,
    outputPath: string,
    scale: number
  ): Promise<void> {
    let browser: Browser | null = null;

    try {
      // 1. Launch headless Chromium
      browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      });

      // 2. Create browser context with device scale factor
      const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: scale,
      });

      const page = await context.newPage();

      // 3. Build HTML page with SVG
      const html = this.buildHtmlPage(svg, theme);
      await page.setContent(html, { waitUntil: 'networkidle' });

      // 4. Wait for fonts to load
      await page.waitForTimeout(500);

      // 5. Get SVG element dimensions
      const svgElement = await page.$('svg');
      if (!svgElement) {
        throw new Error('SVG element not found in page');
      }

      const boundingBox = await svgElement.boundingBox();
      if (!boundingBox) {
        throw new Error('Could not determine SVG dimensions');
      }

      // 6. Take screenshot of SVG element only
      await svgElement.screenshot({
        path: outputPath,
        type: 'png',
        omitBackground: theme.colors.background === 'transparent',
      });

      await context.close();
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  /**
   * Build HTML page with SVG and styling.
   */
  private buildHtmlPage(svg: string, theme: C4Theme): string {
    const backgroundColor = theme.colors.background;

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>C4X Diagram Export</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      background: ${backgroundColor};
      padding: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
    }

    svg {
      max-width: 100%;
      height: auto;
    }
  </style>
</head>
<body>
  ${svg}
</body>
</html>
    `;
  }
}
```

---

### Step 3: Create Export Command

**File**: `src/commands/exportPng.ts`

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { PngExporter } from '../export/PngExporter';
import { PreviewPanel } from '../webview/PreviewPanel';
import { ThemeManager } from '../themes/ThemeManager';

/**
 * Command handler for "C4X: Export PNG".
 */
export async function exportPngCommand(): Promise<void> {
  const editor = vscode.window.activeTextEditor;

  if (!editor || !editor.document.fileName.endsWith('.c4x')) {
    vscode.window.showErrorMessage('Please open a .c4x file first.');
    return;
  }

  const svg = PreviewPanel.getCurrentSvg();
  if (!svg) {
    vscode.window.showErrorMessage(
      'No diagram to export. Please open preview first (Ctrl+K V).'
    );
    return;
  }

  const theme = ThemeManager.getCurrentTheme();
  const baseName = path.basename(editor.document.fileName, '.c4x');
  const suggestedFileName = `${baseName}.png`;

  const exporter = new PngExporter();
  await exporter.export(svg, theme, suggestedFileName);
}
```

---

### Step 4: Register Command

**File**: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "c4x.exportPng",
        "title": "C4X: Export PNG",
        "icon": "$(file-media)"
      }
    ],
    "keybindings": [
      {
        "command": "c4x.exportPng",
        "key": "ctrl+k ctrl+p",
        "mac": "cmd+k cmd+p",
        "when": "editorLangId == c4x"
      }
    ]
  }
}
```

---

## 🧪 Testing

### Unit Tests

**File**: `test/suite/export/png-exporter.test.ts`

```typescript
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { PngExporter, RESOLUTION_OPTIONS } from '../../../src/export/PngExporter';
import { ClassicTheme } from '../../../src/themes/ClassicTheme';

suite('PNG Exporter', () => {
  const exporter = new PngExporter();
  const tempDir = path.join(__dirname, 'temp');
  const outputPath = path.join(tempDir, 'test.png');

  setup(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  teardown(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  test('renderPng creates PNG file', async function () {
    this.timeout(10000); // Increase timeout for browser launch

    const svg = `
      <svg width="400" height="300" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="10" width="100" height="50" fill="#08427B"/>
        <text x="60" y="35">Test</text>
      </svg>
    `;

    await (exporter as any).renderPng(svg, ClassicTheme, outputPath, 1);

    assert.ok(fs.existsSync(outputPath), 'PNG file should exist');
    assert.ok(fs.statSync(outputPath).size > 0, 'PNG file should not be empty');
  });

  test('resolution options are defined', () => {
    assert.strictEqual(RESOLUTION_OPTIONS.length, 3);
    assert.strictEqual(RESOLUTION_OPTIONS[0].scale, 1);
    assert.strictEqual(RESOLUTION_OPTIONS[1].scale, 2);
    assert.strictEqual(RESOLUTION_OPTIONS[2].scale, 4);
  });

  test('buildHtmlPage includes SVG', () => {
    const svg = '<svg></svg>';
    const html = (exporter as any).buildHtmlPage(svg, ClassicTheme);

    assert.ok(html.includes('<!DOCTYPE html>'));
    assert.ok(html.includes('<svg></svg>'));
    assert.ok(html.includes(ClassicTheme.colors.background));
  });
});
```

---

## 📊 Success Metrics

**Performance**:
- [ ] Export completes in < 2 seconds (all resolutions)
- [ ] 1x: < 1 second
- [ ] 2x: < 1.5 seconds
- [ ] 4x: < 2 seconds

**Quality**:
- [ ] Text is sharp and readable
- [ ] Colors match theme exactly
- [ ] Anti-aliasing smooth
- [ ] No artifacts or pixelation

**File Sizes** (typical 30-element diagram):
- [ ] 1x: < 200KB
- [ ] 2x: < 500KB
- [ ] 4x: < 1.5MB

---

## 🔗 Related Activities

**Prerequisites**:
- Activity 11: Export SVG
- Activity 04: Theme Interface

**Dependencies**:
- Playwright headless browser
- Phase 2: SVG Renderer

---

## 🚧 Common Issues & Solutions

### Issue 1: Playwright Installation Fails
**Symptom**: Browser download fails or times out
**Solution**:
```bash
# Install only Chromium (smallest)
PLAYWRIGHT_BROWSERS=chromium pnpm exec playwright install chromium

# Or use system Chrome
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
```

### Issue 2: Fonts Not Rendering in PNG
**Symptom**: Wrong fonts or missing text
**Solution**:
- Increase font load timeout: `await page.waitForTimeout(1000)`
- Embed fonts as base64 in SVG
- Use web-safe fallback fonts

### Issue 3: PNG File Too Large
**Symptom**: File size > 5MB
**Solution**:
- Use PNG compression: `{ quality: 90 }`
- Optimize SVG before rendering
- Consider SVG export instead for large diagrams

### Issue 4: Headless Browser Crashes
**Symptom**: Browser launch fails or crashes
**Solution**:
- Add Chromium args: `--disable-gpu`, `--no-sandbox`
- Increase memory limit in launch options
- Ensure Chromium installed: `pnpm exec playwright install chromium`

---

## 📝 Next Steps

After completing this activity:
1. Test PNG export at all resolutions
2. Verify quality in PowerPoint, Google Slides
3. Implement clipboard copy (Activity 13)
4. Add export options (transparent background, padding)

---

**Activity Owner**: Documentation Agent (DOCA)
**Status**: 🔴 NOT STARTED
**Last Updated**: October 19, 2025
