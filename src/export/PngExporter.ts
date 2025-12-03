import { chromium, Browser } from 'playwright';
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
        description: '72 DPI · screens and docs',
        scale: 1,
        dpi: 72,
    },
    {
        label: '2x (Retina)',
        description: '144 DPI · high-res screens',
        scale: 2,
        dpi: 144,
    },
    {
        label: '4x (Print)',
        description: '288 DPI · slide decks & print',
        scale: 4,
        dpi: 288,
    },
];

export class PngExporter {
    public async export(
        svg: string,
        theme: C4Theme = themeManager.getCurrentTheme(),
        suggestedFileName?: string,
    ): Promise<void> {
        const resolution = await vscode.window.showQuickPick(RESOLUTION_OPTIONS, {
            placeHolder: 'Select export resolution',
            matchOnDescription: true,
        });

        if (!resolution) {
            return;
        }

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

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                cancellable: false,
                title: `Exporting PNG (${resolution.label})`,
            },
            async (progress) => {
                progress.report({ message: 'Launching renderer…', increment: 10 });
                await this.renderPng(svg, theme, saveUri.fsPath, resolution.scale);
                progress.report({ message: 'Finished', increment: 90 });
            },
        );

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

    private async renderPng(
        svg: string,
        theme: C4Theme,
        outputPath: string,
        scale: number,
    ): Promise<void> {
        let browser: Browser | undefined;

        try {
            browser = await chromium.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
            });

            const context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                deviceScaleFactor: scale,
            });

            const page = await context.newPage();
            await page.setContent(this.buildHtmlPage(svg, theme), { waitUntil: 'domcontentloaded' });
            const svgElement = await page.waitForSelector('svg', { state: 'attached', timeout: 2000 });

            if (!svgElement) {
                throw new Error('SVG element not found in rendered content');
            }

            await svgElement.screenshot({
                path: outputPath,
                type: 'png',
                omitBackground: theme.colors.background.toLowerCase() === 'transparent',
            });

            await context.close();
        } finally {
            await browser?.close();
        }
    }

    private buildHtmlPage(svg: string, theme: C4Theme): string {
        return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>C4X Diagram Export</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        margin: 0;
        padding: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${theme.colors.background};
      }
      svg {
        max-width: 100%;
        height: auto;
        font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
      }
    </style>
  </head>
  <body>
    ${svg}
  </body>
</html>`;
    }

    private getDefaultUri(fileName: string): vscode.Uri | undefined {
        const [folder] = vscode.workspace.workspaceFolders ?? [];
        if (!folder) {
            return undefined;
        }
        return vscode.Uri.joinPath(folder.uri, fileName);
    }
}
