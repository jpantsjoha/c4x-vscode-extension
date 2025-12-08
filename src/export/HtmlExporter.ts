/**
 * HTML Exporter
 * Exports markdown files with C4X diagrams to standalone HTML
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../markdown/c4xPlugin';

export class HtmlExporter {
    private md: MarkdownIt;

    constructor() {
        // Initialize markdown-it with C4X plugin
        this.md = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true,
        });

        // Apply C4X plugin for diagram rendering
        c4xPlugin(this.md);
    }

    /**
     * Export markdown file to standalone HTML
     * @param markdownUri URI of the markdown file to export
     */
    public async export(markdownUri?: vscode.Uri): Promise<void> {
        // Get the markdown file to export
        const fileUri = markdownUri || await this.getActiveMarkdownFile();

        if (!fileUri) {
            vscode.window.showErrorMessage('No markdown file selected or open');
            return;
        }

        try {
            // Read markdown content
            const markdownContent = await vscode.workspace.fs.readFile(fileUri);
            const markdownText = Buffer.from(markdownContent).toString('utf8');

            // Convert to HTML
            const htmlContent = this.convertToHtml(markdownText, path.basename(fileUri.fsPath));

            // Prompt for save location
            const defaultFileName = path.basename(fileUri.fsPath, '.md') + '.html';
            const saveUri = await vscode.window.showSaveDialog({
                // eslint-disable-next-line @typescript-eslint/naming-convention
                filters: {
                    'HTML Files': ['html', 'htm'],
                    'All Files': ['*'],
                },
                defaultUri: this.getDefaultUri(defaultFileName, fileUri),
            });

            if (!saveUri) {
                return; // User cancelled
            }

            // Write HTML to file
            await vscode.workspace.fs.writeFile(saveUri, Buffer.from(htmlContent, 'utf8'));

            // Show success message with option to open
            const action = await vscode.window.showInformationMessage(
                `HTML exported to ${path.basename(saveUri.fsPath)}`,
                'Open in Browser'
            );

            if (action === 'Open in Browser') {
                await vscode.env.openExternal(saveUri);
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to export HTML: ${errorMessage}`);
        }
    }

    /**
     * Convert markdown to standalone HTML with embedded styles
     */
    private convertToHtml(markdown: string, title: string): string {
        // Render markdown to HTML
        const bodyHtml = this.md.render(markdown);

        // Load C4X CSS styles
        const c4xCss = this.loadC4xStyles();

        // Generate complete HTML document
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)}</title>
    <style>
        /* Base styles */
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 900px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
            background: #fff;
        }

        /* Typography */
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
        }

        h1 { border-bottom: 2px solid #eee; padding-bottom: 0.3em; }
        h2 { border-bottom: 1px solid #eee; padding-bottom: 0.3em; }

        /* Code blocks */
        code {
            background: #f6f8fa;
            padding: 0.2em 0.4em;
            border-radius: 3px;
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            font-size: 85%;
        }

        pre {
            background: #f6f8fa;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
        }

        pre code {
            background: transparent;
            padding: 0;
        }

        /* Links */
        a {
            color: #0366d6;
            text-decoration: none;
        }

        a:hover {
            text-decoration: underline;
        }

        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
        }

        th, td {
            border: 1px solid #ddd;
            padding: 8px 12px;
            text-align: left;
        }

        th {
            background: #f6f8fa;
            font-weight: 600;
        }

        /* Blockquotes */
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            margin-left: 0;
            color: #666;
        }

        /* C4X Diagram Styles */
        ${c4xCss}

        /* Print styles */
        @media print {
            body {
                max-width: 100%;
                padding: 0;
            }

            .c4x-diagram {
                page-break-inside: avoid;
                background: white !important;
                border: 1px solid #000 !important;
            }

            .c4x-diagram svg {
                max-width: 100% !important;
                height: auto !important;
            }

            /* Hide error placeholders in print */
            .c4x-diagram-placeholder {
                display: none;
            }
        }
    </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
    }

    /**
     * Load C4X CSS styles from file
     */
    private loadC4xStyles(): string {
        try {
            const cssPath = path.join(__dirname, '..', 'markdown', 'c4x.css');
            if (fs.existsSync(cssPath)) {
                return fs.readFileSync(cssPath, 'utf8');
            }
        } catch (error) {
            console.warn('Failed to load C4X CSS styles:', error);
        }
        return '/* C4X styles not found */';
    }

    /**
     * Get the active markdown file from the editor
     */
    private async getActiveMarkdownFile(): Promise<vscode.Uri | undefined> {
        const activeEditor = vscode.window.activeTextEditor;

        if (activeEditor?.document.languageId === 'markdown') {
            return activeEditor.document.uri;
        }

        return undefined;
    }

    /**
     * Get default URI for save dialog
     */
    private getDefaultUri(fileName: string, sourceUri: vscode.Uri): vscode.Uri {
        // Save in same directory as source file
        const sourceDir = vscode.Uri.joinPath(sourceUri, '..');
        return vscode.Uri.joinPath(sourceDir, fileName);
    }

    /**
     * Escape HTML to prevent XSS
     */
    private escapeHtml(unsafe: string): string {
        return unsafe
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }
}
