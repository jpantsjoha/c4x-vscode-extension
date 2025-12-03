import * as path from 'path';
import * as vscode from 'vscode';
import { PngExporter } from '../export/PngExporter';
import { themeManager } from '../themes/ThemeManager';
import { PreviewPanel } from '../webview/PreviewPanel';

export async function exportPngCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor || (editor.document.languageId !== 'c4x' && !editor.document.fileName.endsWith('.c4x'))) {
        void vscode.window.showErrorMessage('Open a .c4x file before exporting a PNG.');
        return;
    }

    const svg = PreviewPanel.getCurrentSvg();
    if (!svg) {
        void vscode.window.showErrorMessage('No rendered diagram found. Open the C4X preview, then retry the export.');
        return;
    }

    const baseName = path.basename(editor.document.fileName, '.c4x');
    const exporter = new PngExporter();
    await exporter.export(svg, themeManager.getCurrentTheme(), `${baseName}.png`);
}
