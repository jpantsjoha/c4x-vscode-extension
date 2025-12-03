import * as vscode from 'vscode';

export class C4XPreviewPanel {
  private panel: vscode.WebviewPanel | undefined;

  open(document?: vscode.TextDocument) {
    if (!this.panel) {
      this.panel = vscode.window.createWebviewPanel(
        'c4xPreview',
        'C4X Preview',
        vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true
        }
      );
      this.panel.onDidDispose(() => (this.panel = undefined));
      this.panel.webview.html = this.getHtml(this.panel.webview);
    }

    // For M0: Hello World. Later we will post SVG from renderer.
    if (document) {
      this.panel?.webview.postMessage({
        type: 'info',
        message: `Opened: ${document.uri.fsPath}`
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = this.getNonce();
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src 'nonce-${nonce}'`
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>C4X Preview</title>
    <style>
      body { padding: 12px; font-family: -apple-system, Segoe UI, Roboto, sans-serif; }
      .hello { color: var(--vscode-foreground); }
      .box { border: 1px solid var(--vscode-editorWidget-border); border-radius: 6px; padding: 16px; }
    </style>
  </head>
  <body>
    <div class="box">
      <h2 class="hello">👋 Hello from C4X</h2>
      <p>This is the initial preview panel. Rendering pipeline will be integrated in M1.</p>
      <div id="log" style="opacity:.8"></div>
    </div>
    <script nonce="${nonce}">
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg?.type === 'info') {
          const el = document.getElementById('log');
          el.textContent = msg.message;
        }
      });
    </script>
  </body>
  </html>`;
  }

  private getNonce(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let nonce = '';
    for (let i = 0; i < 32; i++) {
      nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
  }
}


