import * as path from 'path';
import * as vscode from 'vscode';
import { PngExporter } from '../export/PngExporter';
import { themeManager } from '../themes/ThemeManager';
import { PreviewPanel } from '../webview/PreviewPanel';

/** File extensions that can produce a C4X diagram. */
const DIAGRAM_EXTENSIONS = ['.c4x', '.dsl', '.puml'];

function isDiagramFile(document: vscode.TextDocument): boolean {
    return (
        document.languageId === 'c4x' ||
        document.languageId === 'structurizr-dsl' ||
        document.languageId === 'plantuml' ||
        DIAGRAM_EXTENSIONS.some(ext => document.fileName.endsWith(ext))
    );
}

export async function exportPngCommand(): Promise<void> {
    const editor = vscode.window.activeTextEditor;

    if (!editor || !isDiagramFile(editor.document)) {
        void vscode.window.showErrorMessage(
            'Open a .c4x, .dsl, or .puml file before exporting a PNG.'
        );
        return;
    }

    const svg = PreviewPanel.getCurrentSvg();
    if (!svg) {
        void vscode.window.showErrorMessage(
            'No rendered diagram found. Open the C4X preview first, then retry the export.'
        );
        return;
    }

    // Derive a default file name from the source document
    const sourceExt = path.extname(editor.document.fileName);
    const baseName = path.basename(editor.document.fileName, sourceExt);
    const exporter = new PngExporter();
    await exporter.export(svg, themeManager.getCurrentTheme(), `${baseName}.png`);
}
