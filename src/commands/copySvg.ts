/**
 * Copy SVG to Clipboard Command
 * Copies the current C4X diagram SVG to system clipboard
 */

import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/PreviewPanel';
import { ClipboardExporter } from '../export/ClipboardExporter';

export async function copySvgCommand(): Promise<void> {
    // Get current SVG from preview panel
    const svg = PreviewPanel.getCurrentSvg?.();

    if (!svg) {
        vscode.window.showErrorMessage(
            'No diagram to copy. Please open a C4X preview first.'
        );
        return;
    }

    // Copy to clipboard
    const exporter = new ClipboardExporter();
    await exporter.copyToClipboard(svg);
}
