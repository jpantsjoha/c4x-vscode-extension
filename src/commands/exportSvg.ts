/**
 * Export SVG Command
 * Exports the current C4X diagram as a standalone SVG file
 */

import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/PreviewPanel';
import { SvgExporter } from '../export/SvgExporter';
import { themeManager } from '../themes/ThemeManager';

export async function exportSvgCommand(): Promise<void> {
    // Get current SVG from preview panel
    const svg = PreviewPanel.getCurrentSvg?.();

    if (!svg) {
        const action = await vscode.window.showErrorMessage(
            'No diagram to export. Open the C4X preview first.',
            'Open Preview'
        );
        if (action === 'Open Preview') {
            await vscode.commands.executeCommand('c4x.openPreview');
        }
        return;
    }

    // Get current theme
    const theme = themeManager.getCurrentTheme();

    // Get suggested filename from active document
    const activeEditor = vscode.window.activeTextEditor;
    const suggestedFileName = activeEditor
        ? activeEditor.document.fileName.replace(/\.(c4x|md)$/, '.svg')
        : 'diagram.svg';

    // Export
    const exporter = new SvgExporter();
    await exporter.export(svg, theme, suggestedFileName);
}
