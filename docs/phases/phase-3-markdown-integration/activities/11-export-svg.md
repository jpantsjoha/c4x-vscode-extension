# Activity 11: Export SVG Command

**Task Reference**: PHASE-3-TASK-BREAKDOWN.md → Category 3, Task 3.1
**Estimated Time**: 1.5 hours
**Priority**: Critical
**Status**: 🔴 NOT STARTED

---

## 📋 Overview

Implement SVG export functionality that saves the current C4 diagram as a standalone `.svg` file with embedded fonts and complete styling. The exported SVG must be viewable in web browsers, vector editors (Figma, Illustrator), and other tools without external dependencies.

**Goal**: Enable users to export diagrams as professional, standalone SVG files that preserve all visual styling and theme colors.

---

## 🎯 Prerequisites

**Code Dependencies**:
- [ ] Phase 2 SVG renderer complete
- [ ] Theme system implemented (Activity 04)
- [ ] Preview panel functional

**Knowledge Requirements**:
- SVG format and structure
- Font embedding in SVG
- VS Code file save API
- XML generation

---

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] Command `c4x.exportSvg` registered and working
- [ ] Save dialog prompts for output location
- [ ] SVG file written to disk successfully
- [ ] Exported SVG opens in browsers (Chrome, Firefox, Safari)
- [ ] Exported SVG opens in vector editors (Figma, Illustrator, Inkscape)
- [ ] Theme colors preserved in export
- [ ] Fonts embedded (no external font file dependencies)

### Performance Requirements
- [ ] Export completes in < 200ms
- [ ] File size reasonable (< 500KB for typical diagrams)

### Quality Requirements
- [ ] XML well-formed (validates)
- [ ] UTF-8 encoding correct
- [ ] Works on Windows, macOS, Linux

---

## 🔨 Implementation

### Step 1: Create SVG Exporter Class

**File**: `src/export/SvgExporter.ts`

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import { C4Theme } from '../themes/Theme';

/**
 * Exports C4 diagrams as standalone SVG files.
 */
export class SvgExporter {
  /**
   * Export diagram as SVG file.
   *
   * @param svg - SVG markup from renderer
   * @param theme - Current theme (for font embedding)
   * @param suggestedFileName - Default filename (optional)
   */
  public async export(
    svg: string,
    theme: C4Theme,
    suggestedFileName?: string
  ): Promise<void> {
    // 1. Make SVG standalone (add XML declaration, embed fonts)
    const standaloneSvg = this.makeStandalone(svg, theme);

    // 2. Prompt user for save location
    const defaultFileName = suggestedFileName || 'diagram.svg';
    const uri = await vscode.window.showSaveDialog({
      filters: {
        'SVG Files': ['svg'],
        'All Files': ['*'],
      },
      defaultUri: vscode.workspace.workspaceFolders?.[0]
        ? vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, defaultFileName)
        : undefined,
    });

    if (!uri) {
      // User cancelled
      return;
    }

    // 3. Write SVG to file
    const buffer = Buffer.from(standaloneSvg, 'utf8');
    await vscode.workspace.fs.writeFile(uri, buffer);

    // 4. Show success message
    const fileName = path.basename(uri.fsPath);
    const action = await vscode.window.showInformationMessage(
      `SVG exported to ${fileName}`,
      'Open File',
      'Show in Folder'
    );

    // Handle user actions
    if (action === 'Open File') {
      await vscode.commands.executeCommand('vscode.open', uri);
    } else if (action === 'Show in Folder') {
      await vscode.commands.executeCommand('revealFileInOS', uri);
    }
  }

  /**
   * Transform SVG into standalone format.
   * Adds XML declaration, xmlns attributes, embedded fonts.
   */
  private makeStandalone(svg: string, theme: C4Theme): string {
    // 1. Add XML declaration
    const xmlDeclaration = '<?xml version="1.0" encoding="UTF-8" standalone="no"?>\n';

    // 2. Ensure xmlns attribute present
    let enhanced = svg;
    if (!svg.includes('xmlns=')) {
      enhanced = enhanced.replace(
        '<svg',
        '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
      );
    }

    // 3. Embed font styles in <defs>
    const fontDefs = this.buildFontDefs(theme);
    enhanced = this.injectDefs(enhanced, fontDefs);

    // 4. Add metadata
    const metadata = this.buildMetadata();
    enhanced = this.injectMetadata(enhanced, metadata);

    return xmlDeclaration + enhanced;
  }

  /**
   * Build <defs> section with embedded font styles.
   */
  private buildFontDefs(theme: C4Theme): string {
    const fontFamily = theme.styles.fontFamily;
    const fontSize = theme.styles.fontSize;

    return `
    <defs>
      <style type="text/css">
        <![CDATA[
          /* Import web font */
          @import url('https://fonts.googleapis.com/css2?family=${encodeURIComponent(fontFamily)}');

          /* Default text styles */
          text {
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            dominant-baseline: middle;
          }

          /* Responsive sizing */
          @media (max-width: 600px) {
            text {
              font-size: ${Math.max(fontSize - 2, 10)}px;
            }
          }
        ]]>
      </style>
    </defs>
    `;
  }

  /**
   * Build metadata section with generation info.
   */
  private buildMetadata(): string {
    const timestamp = new Date().toISOString();
    return `
    <metadata>
      <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
               xmlns:dc="http://purl.org/dc/elements/1.1/">
        <rdf:Description>
          <dc:title>C4 Model Diagram</dc:title>
          <dc:creator>C4X VS Code Extension</dc:creator>
          <dc:date>${timestamp}</dc:date>
          <dc:format>image/svg+xml</dc:format>
        </rdf:Description>
      </rdf:RDF>
    </metadata>
    `;
  }

  /**
   * Inject <defs> into SVG.
   */
  private injectDefs(svg: string, defs: string): string {
    // Look for existing <defs> tag
    if (svg.includes('<defs>')) {
      // Append to existing defs
      return svg.replace('</defs>', `${defs}\n</defs>`);
    } else {
      // Insert new <defs> after opening <svg> tag
      return svg.replace(/(<svg[^>]*>)/, `$1\n${defs}`);
    }
  }

  /**
   * Inject metadata into SVG.
   */
  private injectMetadata(svg: string, metadata: string): string {
    // Insert after <defs> or at start of SVG
    if (svg.includes('</defs>')) {
      return svg.replace('</defs>', `</defs>\n${metadata}`);
    } else {
      return svg.replace(/(<svg[^>]*>)/, `$1\n${metadata}`);
    }
  }
}
```

---

### Step 2: Create Export Command

**File**: `src/commands/exportSvg.ts`

```typescript
import * as vscode from 'vscode';
import { SvgExporter } from '../export/SvgExporter';
import { PreviewPanel } from '../webview/PreviewPanel';
import { ThemeManager } from '../themes/ThemeManager';

/**
 * Command handler for "C4X: Export SVG".
 */
export async function exportSvgCommand(): Promise<void> {
  // 1. Get active editor
  const editor = vscode.window.activeTextEditor;

  if (!editor) {
    vscode.window.showErrorMessage('No active editor. Please open a .c4x file first.');
    return;
  }

  // 2. Verify it's a .c4x file
  if (!editor.document.fileName.endsWith('.c4x')) {
    vscode.window.showErrorMessage('Current file is not a .c4x file.');
    return;
  }

  // 3. Get current SVG from preview panel
  const svg = PreviewPanel.getCurrentSvg();

  if (!svg) {
    vscode.window.showErrorMessage(
      'No diagram to export. Please open preview first (Ctrl+K V).'
    );
    return;
  }

  // 4. Get current theme
  const theme = ThemeManager.getCurrentTheme();

  // 5. Generate suggested filename from document
  const docPath = editor.document.fileName;
  const baseName = path.basename(docPath, '.c4x');
  const suggestedFileName = `${baseName}.svg`;

  // 6. Export
  const exporter = new SvgExporter();
  await exporter.export(svg, theme, suggestedFileName);
}
```

---

### Step 3: Register Command

**File**: `src/extension.ts`

```typescript
import { exportSvgCommand } from './commands/exportSvg';

export function activate(context: vscode.ExtensionContext) {
  // ... existing activation code

  // Register export SVG command
  context.subscriptions.push(
    vscode.commands.registerCommand('c4x.exportSvg', exportSvgCommand)
  );
}
```

**File**: `package.json`

```json
{
  "contributes": {
    "commands": [
      {
        "command": "c4x.exportSvg",
        "title": "C4X: Export SVG",
        "icon": "$(file-media)"
      }
    ],
    "keybindings": [
      {
        "command": "c4x.exportSvg",
        "key": "ctrl+k ctrl+s",
        "mac": "cmd+k cmd+s",
        "when": "editorLangId == c4x"
      }
    ],
    "menus": {
      "editor/title": [
        {
          "command": "c4x.exportSvg",
          "when": "resourceExtname == .c4x",
          "group": "navigation"
        }
      ]
    }
  }
}
```

---

## 🧪 Testing

### Unit Tests

**File**: `test/suite/export/svg-exporter.test.ts`

```typescript
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { SvgExporter } from '../../../src/export/SvgExporter';
import { ClassicTheme } from '../../../src/themes/ClassicTheme';

suite('SVG Exporter', () => {
  const exporter = new SvgExporter();
  const tempDir = path.join(__dirname, 'temp');

  setup(() => {
    // Create temp directory
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  teardown(() => {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  test('makeStandalone adds XML declaration', () => {
    const svg = '<svg><rect/></svg>';
    const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

    assert.ok(standalone.startsWith('<?xml version="1.0"'));
  });

  test('makeStandalone adds xmlns attribute', () => {
    const svg = '<svg><rect/></svg>';
    const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

    assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
  });

  test('makeStandalone embeds font styles', () => {
    const svg = '<svg><rect/></svg>';
    const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

    assert.ok(standalone.includes('<style'));
    assert.ok(standalone.includes('font-family'));
  });

  test('makeStandalone adds metadata', () => {
    const svg = '<svg><rect/></svg>';
    const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

    assert.ok(standalone.includes('<metadata>'));
    assert.ok(standalone.includes('C4X VS Code Extension'));
  });

  test('exported SVG is well-formed XML', () => {
    const svg = `
      <svg width="400" height="300">
        <rect x="10" y="10" width="100" height="50" fill="#08427B"/>
        <text x="60" y="35">Test</text>
      </svg>
    `;

    const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

    // Verify no XML syntax errors (simplified check)
    assert.ok(standalone.includes('<?xml'));
    assert.ok(standalone.includes('<svg'));
    assert.ok(standalone.includes('</svg>'));
    assert.strictEqual(
      (standalone.match(/<svg/g) || []).length,
      (standalone.match(/<\/svg>/g) || []).length
    );
  });
});
```

### Integration Tests

**File**: `test/suite/export/svg-export-integration.test.ts`

```typescript
suite('SVG Export Integration', () => {
  test('export command creates valid SVG file', async () => {
    // 1. Open test .c4x file
    const doc = await vscode.workspace.openTextDocument({
      content: `
%%{ c4: system-context }%%
graph TB
    A[Person<br/>Person]
    B[System<br/>Software System]
    A -->|Uses| B
      `,
      language: 'c4x',
    });

    await vscode.window.showTextDocument(doc);

    // 2. Open preview
    await vscode.commands.executeCommand('c4x.openPreview');

    // 3. Export SVG (auto-accept dialog in test mode)
    await vscode.commands.executeCommand('c4x.exportSvg');

    // 4. Verify file created
    // (Note: actual file verification depends on mocking save dialog)
  });
});
```

---

## 📊 Success Metrics

**Performance**:
- [ ] Export completes in < 200ms
- [ ] File write succeeds without blocking UI

**Quality**:
- [ ] Exported SVG validates as XML
- [ ] SVG opens in Chrome, Firefox, Safari
- [ ] SVG imports into Figma, Illustrator
- [ ] Fonts render correctly
- [ ] Theme colors preserved

**User Experience**:
- [ ] Save dialog has sensible defaults
- [ ] Success message includes helpful actions
- [ ] Error messages are clear

---

## 🔗 Related Activities

**Prerequisites**:
- Activity 04: Theme Interface (for font/color data)
- Phase 2: SVG Renderer

**Related Activities**:
- Activity 12: Export PNG (similar export workflow)
- Activity 13: Copy to Clipboard (similar SVG preparation)

---

## 🚧 Common Issues & Solutions

### Issue 1: Fonts Not Rendering
**Symptom**: Exported SVG shows wrong fonts
**Solution**:
- Verify font-family embedded in <style>
- Use web-safe fallback fonts
- Consider embedding font files as base64

### Issue 2: Colors Look Wrong
**Symptom**: Theme colors not preserved
**Solution**:
- Verify theme colors injected into SVG
- Check fill/stroke attributes on elements
- Ensure no CSS overrides

### Issue 3: File Size Too Large
**Symptom**: SVG > 1MB for small diagrams
**Solution**:
- Minify SVG (remove whitespace)
- Optimize path data
- Remove redundant attributes

---

## 📝 Next Steps

After completing this activity:
1. Test exported SVG in multiple tools (browsers, vector editors)
2. Implement PNG export (Activity 12)
3. Implement clipboard copy (Activity 13)
4. Add export options (resolution, format selection)

---

**Activity Owner**: Documentation Agent (DOCA)
**Status**: 🔴 NOT STARTED
**Last Updated**: October 19, 2025
