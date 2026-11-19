import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';

/**
 * A Structurizr file being typed (#242): a half-written workspace shows the
 * parser's message in the preview, and the next edit renders without a reload.
 */

interface PanelInternals {
    currentLayoutSnapshot?: { revision: string };
    panel: { webview: { postMessage: (m: unknown) => Thenable<boolean> } };
    handleWebviewMessage(message: unknown): Promise<void>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function until(label: string, cond: () => boolean, ms = 10000): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (cond()) { return; }
        await sleep(25);
    }
    throw new Error(`timed out waiting for ${label}`);
}

const HALF = 'workspace "W" {\n  model {\n  }\n  views {\n    systemContext s "C" { include * }\n  }\n}\n';
const DONE = 'workspace "W" {\n  model {\n    s = softwareSystem "S"\n  }\n  views {\n    systemContext s "C" { include * }\n  }\n}\n';

describe('Structurizr preview while typing (#242)', function () {
    this.timeout(60000);
    let dir: string;
    let doc: vscode.TextDocument;
    let panel: PanelInternals;
    let sent: Array<Record<string, unknown>>;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-242-'));
        const file = path.join(dir, 'typing.dsl');
        fs.writeFileSync(file, HALF);
        doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        const store = new Map<string, unknown>();
        const context = {
            subscriptions: [],
            extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../../')),
            workspaceState: {
                get: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
                update: (k: string, v: unknown) => { store.set(k, v); return Promise.resolve(); },
                keys: () => [...store.keys()],
            },
        } as unknown as vscode.ExtensionContext;
        PreviewPanel.createOrShow(context);
        panel = (PreviewPanel as unknown as { instance: PanelInternals }).instance;
        sent = [];
        const webview = panel.panel.webview;
        const original = webview.postMessage.bind(webview);
        webview.postMessage = (m: unknown) => { sent.push(m as Record<string, unknown>); return original(m); };
        await panel.handleWebviewMessage({ type: 'ready' });
    });

    afterEach(async () => {
        PreviewPanel.dispose();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('shows the cause for an empty model, then renders after the next edit', async () => {
        await until('error message', () => sent.some(m => m.type === 'error'));
        const err = sent.find(m => m.type === 'error')!;
        assert.match(String(err.message), /defines no elements/);
        assert.ok(!sent.some(m => m.type === 'render'), 'nothing rendered for the empty model');

        sent.length = 0;
        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), DONE);
        await vscode.workspace.applyEdit(edit);
        await until('render after the edit', () => sent.some(m => m.type === 'render'));
        assert.ok(!sent.some(m => m.type === 'error'), 'no error once the workspace is complete');
    });
});
