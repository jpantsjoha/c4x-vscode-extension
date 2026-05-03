/**
 * PNG Exporter
 * Exports C4X diagrams as PNG files using an off-screen webview with Canvas rendering.
 *
 * Strategy: SVG → off-screen webview → Canvas → PNG data URL → file
 * This approach has zero native dependencies (no Playwright, no Chromium, no sharp).
 * The webview's built-in Chromium renderer handles SVG → Canvas natively.
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { C4Theme } from '../themes/Theme';
import { themeManager } from '../themes/ThemeManager';

export interface ResolutionOption {
    label: string;
    description: string;
    scale: number;
    dpi: number;
}

export const RESOLUTION_OPTIONS: ResolutionOption[] = [
    {
        label: '1x (Standard)',
        description: '72 DPI - screens and docs',
        scale: 1,
        dpi: 72,
    },
    {
        label: '2x (Retina)',
        description: '144 DPI - high-res screens',
        scale: 2,
        dpi: 144,
    },
    {
        label: '4x (Print)',
        description: '288 DPI - slide decks & print',
        scale: 4,
        dpi: 288,
    },
];

/** Minimum exported width in CSS pixels (before scale factor). */
const MIN_EXPORT_WIDTH = 1400;

export class PngExporter {
    /**
     * Export an SVG string as a PNG file.
     *
     * Flow:
     *  1. User picks a resolution multiplier.
     *  2. User picks a save location.
     *  3. An invisible webview panel renders the SVG on a <canvas>.
     *  4. The canvas data (base-64 PNG) is posted back to the extension host.
     *  5. The extension host writes the file and disposes the webview.
     */
    public async export(
        svg: string,
        theme: C4Theme = themeManager.getCurrentTheme(),
        suggestedFileName?: string,
    ): Promise<void> {
        // 1. Resolution picker
        const resolution = await vscode.window.showQuickPick(RESOLUTION_OPTIONS, {
            placeHolder: 'Select export resolution',
            matchOnDescription: true,
        });

        if (!resolution) {
            return;
        }

        // 2. Save dialog
        const defaultFileName = suggestedFileName ?? 'diagram.png';
        const saveUri = await vscode.window.showSaveDialog({
            // eslint-disable-next-line @typescript-eslint/naming-convention
            filters: {
                'PNG Files': ['png'],
                'All Files': ['*'],
            },
            defaultUri: this.getDefaultUri(defaultFileName),
        });

        if (!saveUri) {
            return;
        }

        // 3-5. Render via off-screen webview
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Exporting PNG (${resolution.label})`,
            },
            async (progress) => {
                progress.report({ message: 'Rendering diagram...' });
                const pngBuffer = await this.renderPngViaWebview(svg, theme, resolution.scale);
                progress.report({ message: 'Writing file...', increment: 80 });
                await vscode.workspace.fs.writeFile(saveUri, pngBuffer);
                progress.report({ message: 'Done', increment: 20 });
            },
        );

        // 6. Post-save actions
        const action = await vscode.window.showInformationMessage(
            `PNG exported to ${path.basename(saveUri.fsPath)} (${resolution.dpi} DPI)`,
            'Open File',
            'Show in Folder',
        );

        if (action === 'Open File') {
            await vscode.commands.executeCommand('vscode.open', saveUri);
        } else if (action === 'Show in Folder') {
            await vscode.commands.executeCommand('revealFileInOS', saveUri);
        }
    }

    /* ------------------------------------------------------------------
     * Off-screen webview rendering
     * ----------------------------------------------------------------*/

    private renderPngViaWebview(
        svg: string,
        theme: C4Theme,
        scale: number,
    ): Promise<Uint8Array> {
        return new Promise<Uint8Array>((resolve, reject) => {
            // Create a hidden webview panel (retainContextWhenHidden keeps it alive)
            const panel = vscode.window.createWebviewPanel(
                'c4xPngExport',
                'C4X PNG Export',
                { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                },
            );

            // Safety timeout: if the webview never responds, reject after 30 s
            const timeout = setTimeout(() => {
                panel.dispose();
                reject(new Error('PNG export timed out after 30 seconds'));
            }, 30_000);

            // Listen for the PNG data coming back
            panel.webview.onDidReceiveMessage((message: { type: string; data?: string; error?: string }) => {
                clearTimeout(timeout);

                if (message.type === 'pngData' && message.data) {
                    // message.data is a data URL: "data:image/png;base64,..."
                    const base64 = message.data.split(',')[1];
                    const buffer = Buffer.from(base64, 'base64');
                    panel.dispose();
                    resolve(new Uint8Array(buffer));
                } else if (message.type === 'exportError') {
                    panel.dispose();
                    reject(new Error(message.error ?? 'Unknown webview export error'));
                }
            });

            // Build & load the webview HTML
            panel.webview.html = this.buildExportHtml(svg, theme, scale);
        });
    }

    /* ------------------------------------------------------------------
     * HTML page that runs inside the off-screen webview
     * ----------------------------------------------------------------*/

    private buildExportHtml(svg: string, theme: C4Theme, scale: number): string {
        // Escape the SVG for safe embedding inside a JS string literal.
        // We use a script-driven approach rather than inline HTML so we have
        // full control over the Image → Canvas pipeline.
        const escapedSvg = svg
            .replace(/\\/g, '\\\\')
            .replace(/`/g, '\\`')
            .replace(/\$/g, '\\$');

        const nonce = this.getNonce();

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; img-src data: blob:; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}';">
  <style nonce="${nonce}">
    body { margin: 0; padding: 0; background: transparent; }
  </style>
</head>
<body>
  <script nonce="${nonce}">
    (function () {
      const vscode = acquireVsCodeApi();
      const scale = ${scale};
      const minWidth = ${MIN_EXPORT_WIDTH};
      const bgColor = ${JSON.stringify(theme.colors.background)};

      try {
        const svgMarkup = \`${escapedSvg}\`;

        // Parse the SVG to extract its intrinsic dimensions from the viewBox
        const parser = new DOMParser();
        const svgDoc = parser.parseFromString(svgMarkup, 'image/svg+xml');
        const svgEl = svgDoc.documentElement;

        let svgWidth = 0;
        let svgHeight = 0;

        // Prefer viewBox dimensions for accuracy
        const viewBox = svgEl.getAttribute('viewBox');
        if (viewBox) {
          const parts = viewBox.split(/[\\s,]+/).map(Number);
          if (parts.length === 4) {
            svgWidth = parts[2];
            svgHeight = parts[3];
          }
        }

        // Fall back to width/height attributes
        if (!svgWidth || !svgHeight) {
          svgWidth = parseFloat(svgEl.getAttribute('width') || '0');
          svgHeight = parseFloat(svgEl.getAttribute('height') || '0');
        }

        // Safety: if we still have no dimensions, use a reasonable default
        if (!svgWidth || !svgHeight) {
          svgWidth = 1400;
          svgHeight = 800;
        }

        // Ensure minimum export width (scale up small diagrams)
        const exportScale = Math.max(1, minWidth / svgWidth);
        const canvasWidth = Math.ceil(svgWidth * exportScale * scale);
        const canvasHeight = Math.ceil(svgHeight * exportScale * scale);

        // Create a blob URL for the SVG so the Image element can load it
        const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = function () {
          const canvas = document.createElement('canvas');
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;

          const ctx = canvas.getContext('2d');
          if (!ctx) {
            vscode.postMessage({ type: 'exportError', error: 'Failed to get canvas 2d context' });
            return;
          }

          // Fill background (the SVG already has a background rect, but
          // this ensures a solid fill even if the SVG background is transparent)
          ctx.fillStyle = bgColor;
          ctx.fillRect(0, 0, canvasWidth, canvasHeight);

          // Draw the SVG image scaled to fill the canvas
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);

          URL.revokeObjectURL(url);

          // Export as PNG data URL
          const dataUrl = canvas.toDataURL('image/png');
          vscode.postMessage({ type: 'pngData', data: dataUrl });
        };

        img.onerror = function () {
          URL.revokeObjectURL(url);
          vscode.postMessage({ type: 'exportError', error: 'Failed to load SVG into Image element' });
        };

        img.src = url;
      } catch (err) {
        vscode.postMessage({ type: 'exportError', error: 'Export error: ' + (err && err.message ? err.message : String(err)) });
      }
    })();
  </script>
</body>
</html>`;
    }

    /* ------------------------------------------------------------------
     * Helpers
     * ----------------------------------------------------------------*/

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getDefaultUri(fileName: string): vscode.Uri | undefined {
        const [folder] = vscode.workspace.workspaceFolders ?? [];
        if (!folder) {
            return undefined;
        }
        return vscode.Uri.joinPath(folder.uri, fileName);
    }
}
