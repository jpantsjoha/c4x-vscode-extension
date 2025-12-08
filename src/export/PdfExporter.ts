/**
 * PDF Exporter
 * Exports markdown files with C4X diagrams to PDF via browser print dialog
 * 
 * Strategy: Generate HTML → Open in browser → Trigger print dialog
 * This approach has zero dependencies and uses the system's PDF generation.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { HtmlExporter } from './HtmlExporter';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../markdown/c4xPlugin';

export class PdfExporter {
    private htmlExporter: HtmlExporter;

    constructor() {
        this.htmlExporter = new HtmlExporter();
    }

    /**
     * Export markdown file to PDF via browser print dialog
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

            // Generate HTML with print-optimized styles
            const htmlContent = this.generatePrintHtml(markdownText, path.basename(fileUri.fsPath));

            // Create temp file for print
            const tempDir = os.tmpdir();
            const baseName = path.basename(fileUri.fsPath, '.md');
            const tempFileName = `c4x-print-${baseName}-${Date.now()}.html`;
            const tempFileUri = vscode.Uri.file(path.join(tempDir, tempFileName));

            // Write HTML to temp file
            await vscode.workspace.fs.writeFile(tempFileUri, Buffer.from(htmlContent, 'utf8'));

            // Show instructions and open in browser
            const action = await vscode.window.showInformationMessage(
                'Opening in browser. Use Print dialog (Cmd/Ctrl+P) and select "Save as PDF"',
                'Open in Browser',
                'Cancel'
            );

            if (action === 'Open in Browser') {
                await vscode.env.openExternal(tempFileUri);
            }

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to export PDF: ${errorMessage}`);
        }
    }

    /**
     * Generate print-optimized HTML
     */
    private generatePrintHtml(markdown: string, title: string): string {
        // Use base HTML generation from HtmlExporter
        const md = new MarkdownIt({
            html: true,
            linkify: true,
            typographer: true,
        });
        c4xPlugin(md);

        const bodyHtml = md.render(markdown);

        // Generate print-optimized HTML with auto-print trigger
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${this.escapeHtml(title)} - Print</title>
    <style>
        /* Base styles */
        * {
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 20px;
            color: #333;
            background: #fff;
        }

        /* Typography */
        h1, h2, h3, h4, h5, h6 {
            margin-top: 24px;
            margin-bottom: 16px;
            font-weight: 600;
            line-height: 1.25;
            page-break-after: avoid;
        }

        h1 { 
            font-size: 2em;
            border-bottom: 2px solid #eee; 
            padding-bottom: 0.3em; 
        }
        h2 { 
            font-size: 1.5em;
            border-bottom: 1px solid #eee; 
            padding-bottom: 0.3em; 
        }
        h3 { font-size: 1.25em; }

        p {
            margin: 0 0 16px 0;
            orphans: 3;
            widows: 3;
        }

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
            page-break-inside: avoid;
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

        /* Tables */
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 16px 0;
            page-break-inside: avoid;
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

        /* Lists */
        ul, ol {
            margin: 0 0 16px 0;
            padding-left: 2em;
        }

        li {
            margin-bottom: 4px;
        }

        /* Blockquotes */
        blockquote {
            border-left: 4px solid #ddd;
            padding-left: 16px;
            margin-left: 0;
            color: #666;
        }

        /* Images */
        img {
            max-width: 100%;
            height: auto;
        }

        /* C4X Diagram Styles */
        .c4x-diagram {
            margin: 24px 0;
            padding: 16px;
            background: #fff;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            text-align: center;
            page-break-inside: avoid;
        }

        .c4x-diagram svg {
            max-width: 100%;
            height: auto;
            display: inline-block;
        }

        .c4x-error {
            margin: 20px 0;
            padding: 16px;
            background: #fee;
            border: 2px solid #dc2626;
            border-radius: 8px;
            color: #dc2626;
            page-break-inside: avoid;
        }

        .c4x-error-header {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
        }

        .c4x-error-message {
            margin: 0;
            padding: 12px;
            background: #fff;
            border: 1px solid #fca5a5;
            border-radius: 4px;
            font-size: 13px;
            white-space: pre-wrap;
        }

        /* Print-specific styles */
        @media print {
            body {
                max-width: 100%;
                padding: 0;
                margin: 0;
            }

            .c4x-diagram {
                border: 1px solid #000 !important;
                box-shadow: none !important;
            }

            .c4x-diagram svg {
                max-width: 100% !important;
            }

            a {
                color: #000;
            }

            /* Avoid orphaned headers */
            h1, h2, h3, h4, h5, h6 {
                page-break-after: avoid;
            }

            /* Keep diagrams together */
            .c4x-diagram, pre, table, blockquote {
                page-break-inside: avoid;
            }

            /* Hide print instructions banner */
            .print-instructions {
                display: none !important;
            }
        }

        /* Screen-only print instructions */
        @media screen {
            .print-instructions {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                background: linear-gradient(135deg, #08427B 0%, #1168BD 100%);
                color: white;
                padding: 12px 20px;
                text-align: center;
                font-size: 14px;
                z-index: 1000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }
            
            .print-instructions kbd {
                background: rgba(255,255,255,0.2);
                padding: 2px 8px;
                border-radius: 4px;
                font-family: monospace;
            }
            
            body {
                padding-top: 60px;
            }
        }
    </style>
</head>
<body>
    <div class="print-instructions">
        📄 Press <kbd>${os.platform() === 'darwin' ? '⌘+P' : 'Ctrl+P'}</kbd> to open Print dialog → Select <strong>"Save as PDF"</strong> as destination
    </div>
${bodyHtml}
</body>
</html>`;
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
