/**
 * SVG Exporter
 * Exports C4X diagrams as standalone SVG files with embedded styling
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { C4Theme } from '../themes/Theme';

export class SvgExporter {
    /**
     * Export SVG with embedded fonts and standalone attributes
     * @param svg SVG markup from renderer
     * @param theme Current theme for styling reference
     * @param suggestedFileName Optional filename suggestion
     */
    public async export(
        svg: string,
        theme: C4Theme,
        suggestedFileName?: string
    ): Promise<void> {
        // 1. Make SVG standalone with embedded styles
        const standaloneSvg = this.makeStandalone(svg, theme);

        // 2. Prompt user for save location
        const defaultFileName = suggestedFileName ?? 'diagram.svg';
        const saveUri = await vscode.window.showSaveDialog({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            filters: {
                'SVG Files': ['svg'],
                'All Files': ['*'],
            },
            defaultUri: this.getDefaultUri(defaultFileName),
        });

        if (!saveUri) {
            return; // User cancelled
        }

        // 3. Write SVG to file
        await vscode.workspace.fs.writeFile(saveUri, Buffer.from(standaloneSvg, 'utf8'));

        // 4. Show success message
        vscode.window.showInformationMessage(
            `SVG exported to ${path.basename(saveUri.fsPath)}`
        );
    }

    /**
     * Convert SVG to standalone format with embedded fonts and proper namespace
     */
    private makeStandalone(svg: string, theme: C4Theme): string {
        // Add XML declaration if not present
        let result = svg.trim();
        if (!result.startsWith('<?xml')) {
            result = '<?xml version="1.0" encoding="UTF-8"?>\n' + result;
        }

        // Ensure SVG has xmlns attribute for standalone rendering
        if (!result.includes('xmlns=')) {
            result = result.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        // Embed font styling in <defs> for standalone rendering
        // NOTE: Using system fonts only for offline-first principle (no external CDN dependencies)
        const fontFamily = theme.styles.fontFamily;
        const fontSize = theme.styles.fontSize;

        const styleBlock = `
<defs>
  <style type="text/css">
    <![CDATA[
      /* System fonts only - no external dependencies */
      text {
        font-family: ${fontFamily};
        font-size: ${fontSize}px;
        font-weight: 400;
      }

      text.c4x-title {
        font-weight: 600;
      }

      /* Ensure crisp rendering */
      svg {
        shape-rendering: geometricPrecision;
        text-rendering: optimizeLegibility;
      }
    ]]>
  </style>
</defs>`;

        // Insert style block after opening <svg> tag
        result = result.replace(/(<svg[^>]*>)/, `$1\n${styleBlock}`);

        return result;
    }

    /**
     * Get default URI for save dialog
     */
    private getDefaultUri(fileName: string): vscode.Uri | undefined {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return vscode.Uri.joinPath(workspaceFolders[0].uri, fileName);
        }

        // Fallback to active document's directory
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor) {
            const activeFileUri = activeEditor.document.uri;
            const activeDir = vscode.Uri.joinPath(activeFileUri, '..');
            return vscode.Uri.joinPath(activeDir, fileName);
        }

        return undefined;
    }
}
