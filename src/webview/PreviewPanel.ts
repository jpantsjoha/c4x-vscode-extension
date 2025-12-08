import * as vscode from 'vscode';
import { C4XParseError, c4xParser } from '../parser';
import { parseStructurizrDSL, StructurizrLexerError, StructurizrParserError } from '../parser/structurizr';
import { parsePlantUMLtoC4Model } from '../parser/plantuml';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { svgBuilder } from '../render/SvgBuilder';

interface PerformanceMetrics {
    parseTime: number;
    modelTime: number;
    layoutTime: number;
    renderTime: number;
    totalTime: number;
}

interface RenderPayload {
    svg: string;
    metrics: PerformanceMetrics & {
        elements: number;
        relationships: number;
    };
}

export class PreviewPanel {
    private static instance: PreviewPanel | undefined;

    public static createOrShow(context: vscode.ExtensionContext): void {
        if (PreviewPanel.instance) {
            PreviewPanel.instance.panel.reveal(vscode.window.activeTextEditor?.viewColumn);
            PreviewPanel.instance.tryUpdateActiveDocument();
            return;
        }

        PreviewPanel.instance = new PreviewPanel(context);
    }

    public static dispose(): void {
        PreviewPanel.instance?.dispose();
        PreviewPanel.instance = undefined;
    }

    private readonly panel: vscode.WebviewPanel;
    private readonly disposables: vscode.Disposable[] = [];
    private activeDocument: vscode.TextDocument | undefined;
    private debounceTimer: NodeJS.Timeout | undefined;
    private disposed = false;
    private currentSvg: string | undefined;

    private constructor(_context: vscode.ExtensionContext) {
        this.activeDocument = this.getActiveDiagramDocument();

        this.panel = vscode.window.createWebviewPanel(
            'c4xPreview',
            'C4X Preview',
            vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this.panel.onDidDispose(() => {
            this.dispose();
        }, null, this.disposables);

        this.panel.webview.onDidReceiveMessage((message) => {
            if (message.type === 'ready') {
                void this.render();
            }
        }, undefined, this.disposables);

        this.panel.webview.html = this.getHtml();

        this.registerEventListeners();

        if (!this.activeDocument) {
            void vscode.window.showInformationMessage('Open a .c4x or .dsl file to start previewing.');
        } else {
            void this.render();
        }
    }

    private registerEventListeners(): void {
        this.disposables.push(
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (this.isWatchedDocument(document)) {
                    this.scheduleRender();
                }
            }),
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (this.isWatchedDocument(event.document)) {
                    this.scheduleRender(250);
                }
            }),
            vscode.window.onDidChangeActiveTextEditor(() => {
                this.tryUpdateActiveDocument();
            })
        );
    }

    private tryUpdateActiveDocument(): void {
        const newDocument = this.getActiveDiagramDocument();
        if (newDocument?.uri.toString() !== this.activeDocument?.uri.toString()) {
            this.activeDocument = newDocument;
            this.scheduleRender();
        }
    }

    private getActiveDiagramDocument(): vscode.TextDocument | undefined {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            return undefined;
        }

        const doc = editor.document;
        if (doc.languageId === 'c4x' || doc.fileName.endsWith('.c4x') ||
            doc.languageId === 'structurizr-dsl' || doc.fileName.endsWith('.dsl') ||
            doc.languageId === 'plantuml' || doc.fileName.endsWith('.puml')) {
            return doc;
        }

        return undefined;
    }

    private isWatchedDocument(document: vscode.TextDocument): boolean {
        if (!this.activeDocument) {
            return false;
        }
        return document.uri.toString() === this.activeDocument.uri.toString();
    }

    private scheduleRender(delay = 100): void {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            void this.render();
        }, delay);
    }

    private async render(): Promise<void> {
        if (!this.activeDocument) {
            this.panel.webview.postMessage({ type: 'error', message: 'No active diagram document selected.' });
            return;
        }

        const text = this.activeDocument.getText();
        if (!text || text.trim().length === 0) {
            this.panel.webview.postMessage({ type: 'error', message: 'Document is empty.' });
            return;
        }

        const workspaceName = this.getWorkspaceName(this.activeDocument);
        const isStructurizrDsl = this.activeDocument.languageId === 'structurizr-dsl' ||
                                  this.activeDocument.fileName.endsWith('.dsl');
        const isPlantUML = this.activeDocument.languageId === 'plantuml' ||
                           this.activeDocument.fileName.endsWith('.puml');

        try {
            const parseStart = performance.now();
            let model;
            let parseTime = 0;
            let modelTime = 0;

            if (isStructurizrDsl) {
                // Structurizr DSL: Parse directly to C4Model (no separate model building)
                model = parseStructurizrDSL(text);
                parseTime = performance.now() - parseStart;
                modelTime = 0;
            } else if (isPlantUML) {
                // PlantUML C4: Parse directly to C4Model (no separate model building)
                model = parsePlantUMLtoC4Model(text);
                parseTime = performance.now() - parseStart;
                modelTime = 0;
            } else {
                // C4X: Parse then build model
                const parseResult = c4xParser.parse(text);
                parseTime = performance.now() - parseStart;

                const modelStart = performance.now();
                model = c4ModelBuilder.build(parseResult, workspaceName);
                modelTime = performance.now() - modelStart;
            }

            const view = model.views[0];

            const layoutStart = performance.now();
            const layout = await dagreLayoutEngine.layout(view);
            const layoutTime = performance.now() - layoutStart;

            const renderStart = performance.now();
            const svg = svgBuilder.build(layout);
            const renderTime = performance.now() - renderStart;

            const payload: RenderPayload = {
                svg,
                metrics: {
                    parseTime,
                    modelTime,
                    layoutTime,
                    renderTime,
                    totalTime: parseTime + modelTime + layoutTime + renderTime,
                    elements: view.elements.length,
                    relationships: view.relationships.length,
                },
            };

            this.panel.webview.postMessage({ type: 'render', payload });
            this.currentSvg = svg;
        } catch (error) {
            this.currentSvg = undefined;
            if (error instanceof C4XParseError) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: `${error.message} (Line ${error.location.line}, Column ${error.location.column})`,
                });
            } else if (error instanceof StructurizrLexerError || error instanceof StructurizrParserError) {
                this.panel.webview.postMessage({
                    type: 'error',
                    message: error.message,
                });
            } else if (error instanceof Error) {
                this.panel.webview.postMessage({ type: 'error', message: error.message });
            } else {
                this.panel.webview.postMessage({ type: 'error', message: 'Unknown error while rendering preview.' });
            }
        }
    }

    private getWorkspaceName(document: vscode.TextDocument): string {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (workspaceFolder) {
            return workspaceFolder.name;
        }
        return document.uri.path.split('/').pop() ?? 'C4X Workspace';
    }

    private getHtml(): string {
        const nonce = this.getNonce();
        const csp = [
            "default-src 'none'",
            "img-src data:",
            "style-src 'unsafe-inline'",
            `script-src 'nonce-${nonce}'`,
        ].join('; ');

        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <title>C4X Preview</title>
  <style>
    :root {
      color-scheme: light dark;
    }
    body {
      font-family: var(--vscode-font-family);
      background-color: var(--vscode-editor-background);
      color: var(--vscode-foreground);
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }
    header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--vscode-panel-border);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    #metrics {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 12px;
    }
    #metrics span {
      background: var(--vscode-editor-inactiveSelectionBackground);
      padding: 4px 8px;
      border-radius: 4px;
    }
    #content {
      flex: 1;
      overflow: auto;
      padding: 16px;
    }
    #error {
      margin: 16px;
      padding: 12px 16px;
      border-radius: 4px;
      background: var(--vscode-inputValidation-errorBackground);
      border: 1px solid var(--vscode-inputValidation-errorBorder);
      color: var(--vscode-inputValidation-errorForeground);
      display: none;
      white-space: pre-line;
    }
    svg {
      width: 100%;
      height: auto;
      min-height: 400px;
    }
  </style>
</head>
<body>
  <header>
    <strong>C4X Preview</strong>
    <div id="metrics"></div>
  </header>
  <div id="error"></div>
  <div id="content">
    <div id="placeholder">Waiting for render...</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();

    const metricsEl = document.getElementById('metrics');
    const contentEl = document.getElementById('content');
    const errorEl = document.getElementById('error');
    const placeholder = document.getElementById('placeholder');

    function showError(message) {
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      metricsEl.textContent = '';
      placeholder.style.display = 'none';
      contentEl.innerHTML = '';
    }

    function showSvg(svg, metrics) {
      errorEl.style.display = 'none';
      placeholder.style.display = 'none';
      contentEl.innerHTML = svg;
      metricsEl.innerHTML =
        '<span>Parse: ' + metrics.parseTime.toFixed(2) + 'ms</span>' +
        '<span>Model: ' + metrics.modelTime.toFixed(2) + 'ms</span>' +
        '<span>Layout: ' + metrics.layoutTime.toFixed(2) + 'ms</span>' +
        '<span>Render: ' + metrics.renderTime.toFixed(2) + 'ms</span>' +
        '<span>Total: ' + metrics.totalTime.toFixed(2) + 'ms</span>' +
        '<span>Elements: ' + metrics.elements + '</span>' +
        '<span>Relationships: ' + metrics.relationships + '</span>';
    }

    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.type) {
        case 'render':
          showSvg(message.payload.svg, message.payload.metrics);
          break;
        case 'error':
          showError(message.message);
          break;
      }
    });

    vscode.postMessage({ type: 'ready' });
  </script>
</body>
</html>`;
    }

    private getNonce(): string {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let text = '';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = undefined;
        }
        while (this.disposables.length) {
            const disposable = this.disposables.pop();
            disposable?.dispose();
        }
        this.panel.dispose();
    }

    public static getCurrentSvg(): string | undefined {
        return this.instance?.currentSvg;
    }
}
