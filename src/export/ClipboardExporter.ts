/**
 * Clipboard Exporter
 * Copies SVG markup to system clipboard for pasting into other tools
 */

import * as vscode from 'vscode';

export class ClipboardExporter {
    /**
     * Copy SVG to system clipboard
     * @param svg SVG markup to copy
     */
    public async copyToClipboard(svg: string): Promise<void> {
        // Make SVG standalone with proper namespace
        const standaloneSvg = this.makeStandalone(svg);

        // Copy to system clipboard
        await vscode.env.clipboard.writeText(standaloneSvg);

        // Show success message
        vscode.window.showInformationMessage('SVG copied to clipboard');
    }

    /**
     * Ensure SVG is standalone with xmlns attribute
     */
    private makeStandalone(svg: string): string {
        let result = svg.trim();

        // Ensure SVG has xmlns attribute for standalone rendering
        if (!result.includes('xmlns=')) {
            result = result.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
        }

        return result;
    }
}
