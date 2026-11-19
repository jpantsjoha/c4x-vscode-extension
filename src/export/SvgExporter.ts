/**
 * SVG Exporter
 * Exports C4X diagrams as standalone SVG files with embedded styling
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { C4Theme } from '../themes/Theme';
import { defaultExportUri } from './defaultExportUri';

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
        const saveUri = await vscode.window.showSaveDialog({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            filters: {
                'SVG Files': ['svg'],
                'All Files': ['*'],
            },
            defaultUri: defaultExportUri('svg', { suggestedName: suggestedFileName }),
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
      /* System fonts only - no external dependencies. Defaults only: the
         renderer sets font-size, font-weight and font-family on every text it
         draws, and element text is wrapped for exactly those (#340), so an
         author rule here must not override them. */
      text:not([font-family]) {
        font-family: ${fontFamily};
      }
      text:not([font-size]) {
        font-size: ${fontSize}px;
      }
      text:not([font-weight]) {
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
}
