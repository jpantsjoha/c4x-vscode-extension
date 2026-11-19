/**
 * #443 in a real extension host, through PreviewPanel's own message handler:
 *
 * - A sidecar that cannot be read, or holds text that is not JSON, refuses a
 *   sidecar Save with a `visualLayout.rejected` whose reason names the layout
 *   file, and the file and the source are left as they were.
 * - With sidecar persistence on a Markdown fence, a Save after a prose edit
 *   outside the fence (its revision translated by PreviewPanel, #439) is
 *   accepted and the coordinates are written to the sidecar; a change to the
 *   fence body refuses the Save and writes nothing.
 *
 * The sidecar lives at the root of the test host's workspace folder; each test
 * checks it is absent first and removes it afterwards.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';
import { VISUAL_LAYOUT_PROTOCOL_VERSION } from '../../src/webview/visualLayoutProtocol';
import { getSidecarUri, loadSidecarLayout } from '../../src/writeback/SidecarPersistence';

interface PanelInternals {
    panel: vscode.WebviewPanel;
    hasDirtyState: boolean;
    currentLayoutSnapshot?: { revision: string };
    handleWebviewMessage(message: unknown): Promise<void>;
}

type Posted = Record<string, unknown> & { type?: string; code?: string; reason?: string };

const SOURCE = [
    'graph TB',
    '    User[User<br/>Person]',
    '    App[App<br/>Software System]',
    '    User -->|Uses| App',
    '',
].join('\n');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function until(label: string, condition: () => boolean, ms = 8000): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (condition()) { return; }
        await sleep(25);
    }
    throw new Error(`timed out waiting for ${label}`);
}

describe('Sidecar Save through PreviewPanel (#443, extension host)', function () {
    this.timeout(60000);
    let dir: string;
    let sidecarPath: string | undefined;
    let panel: PanelInternals | undefined;
    let posted: Posted[] = [];

    function makeContext(): vscode.ExtensionContext {
        const store = new Map<string, unknown>();
        return {
            subscriptions: [],
            extensionUri: vscode.Uri.file(path.resolve(__dirname, '../../../')),
            workspaceState: {
                get: (k: string, d?: unknown) => (store.has(k) ? store.get(k) : d),
                update: (k: string, v: unknown) => { store.set(k, v); return Promise.resolve(); },
                keys: () => [...store.keys()],
            },
        } as unknown as vscode.ExtensionContext;
    }

    function record(opened: PanelInternals): void {
        posted = [];
        const webview = opened.panel.webview;
        const original = webview.postMessage.bind(webview);
        webview.postMessage = (message: unknown) => { posted.push(message as Posted); return original(message); };
    }

    async function settle(opened: PanelInternals): Promise<void> {
        await opened.handleWebviewMessage({ type: 'ready' });
        await until('first render', () => opened.currentLayoutSnapshot !== undefined);
        await sleep(1500);
    }

    async function claimSidecar(doc: vscode.TextDocument): Promise<string> {
        const fsPath = getSidecarUri(doc.uri).fsPath;
        assert.ok(!fs.existsSync(fsPath), `test precondition: ${fsPath} must not exist`);
        sidecarPath = fsPath;
        return fsPath;
    }

    async function openStandalone(file: string): Promise<{ doc: vscode.TextDocument; opened: PanelInternals }> {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        PreviewPanel.createOrShow(makeContext());
        const opened = (PreviewPanel as unknown as { instance: PanelInternals }).instance;
        record(opened);
        await settle(opened);
        return { doc, opened };
    }

    async function openFence(file: string): Promise<{ doc: vscode.TextDocument; opened: PanelInternals }> {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        PreviewPanel.createOrShowForMarkdownBlock(makeContext(), doc, 0);
        const opened = (PreviewPanel as unknown as { markdownInstance: PanelInternals }).markdownInstance;
        record(opened);
        await settle(opened);
        return { doc, opened };
    }

    async function visualSave(opened: PanelInternals, revision: string): Promise<Posted> {
        posted.length = 0;
        await opened.handleWebviewMessage({
            type: 'visualLayout.applySemanticEdits', protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION, revision,
            edits: [{ id: 'User', x: 333, y: 222 }],
        });
        await until('save response', () => posted.some(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected'));
        return posted.find(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected')!;
    }

    before(async () => {
        await vscode.workspace.getConfiguration('c4x').update('layout.persistence', 'sidecar', vscode.ConfigurationTarget.Global);
    });

    after(async () => {
        await vscode.workspace.getConfiguration('c4x').update('layout.persistence', undefined, vscode.ConfigurationTarget.Global);
    });

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-443-'));
    });

    afterEach(async () => {
        if (panel) {
            panel.hasDirtyState = false;
            panel.panel.dispose();
            panel = undefined;
        }
        if (sidecarPath) {
            fs.rmSync(sidecarPath, { recursive: true, force: true });
            sidecarPath = undefined;
        }
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await sleep(200);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('an unreadable sidecar refuses the Save with a reason that names the layout file', async () => {
        const file = path.join(dir, 'unreadable.c4x');
        fs.writeFileSync(file, SOURCE);
        const { doc, opened } = await openStandalone(file);
        panel = opened;
        const sidecar = await claimSidecar(doc);
        fs.mkdirSync(sidecar);   // a directory where the file should be: exists, cannot be read as a file

        const result = await visualSave(opened, opened.currentLayoutSnapshot!.revision);
        assert.strictEqual(result.type, 'visualLayout.rejected', JSON.stringify(result));
        assert.strictEqual(result.code, 'validation_failed');
        assert.ok(String(result.reason).includes(sidecar), `reason names the file: ${result.reason}`);
        assert.ok(String(result.reason).includes('could not be read'), String(result.reason));
        assert.ok(fs.statSync(sidecar).isDirectory(), 'left untouched');
        assert.strictEqual(doc.getText(), SOURCE, 'source untouched');
    });

    it('an invalid-JSON sidecar refuses the Save with a reason that names the layout file', async () => {
        const file = path.join(dir, 'invalid.c4x');
        fs.writeFileSync(file, SOURCE);
        const { doc, opened } = await openStandalone(file);
        panel = opened;
        const sidecar = await claimSidecar(doc);
        const invalid = '{"layouts": {"other.c4x": ';
        fs.writeFileSync(sidecar, invalid);

        const result = await visualSave(opened, opened.currentLayoutSnapshot!.revision);
        assert.strictEqual(result.type, 'visualLayout.rejected', JSON.stringify(result));
        assert.strictEqual(result.code, 'validation_failed');
        assert.ok(String(result.reason).includes(sidecar), `reason names the file: ${result.reason}`);
        assert.ok(String(result.reason).includes('not valid JSON'), String(result.reason));
        assert.strictEqual(fs.readFileSync(sidecar, 'utf8'), invalid, 'left untouched');
        assert.strictEqual(doc.getText(), SOURCE, 'source untouched');
    });

    const PREFIX = '# Notes\n\nProse.\n\n';
    const FENCE = '```c4x\n' + SOURCE + '```\n';
    const SUFFIX = '\nEnd.\n';

    it('fence: a Save after a prose edit outside the fence (translated revision) is accepted and written to the sidecar', async () => {
        const file = path.join(dir, 'prose.md');
        fs.writeFileSync(file, PREFIX + FENCE + SUFFIX);
        const { doc, opened } = await openFence(file);
        panel = opened;
        await claimSidecar(doc);
        const shown = opened.currentLayoutSnapshot!.revision;
        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });

        const prose = new vscode.WorkspaceEdit();
        prose.insert(doc.uri, new vscode.Position(2, 0), 'More prose.\n');
        await vscode.workspace.applyEdit(prose);
        await sleep(800);
        assert.notStrictEqual(String(doc.version), shown, 'the document moved on');
        const before = doc.getText();

        const result = await visualSave(opened, shown);
        assert.strictEqual(result.type, 'visualLayout.batchAccepted', JSON.stringify(result));
        assert.strictEqual(doc.getText(), before, 'sidecar persistence writes nothing into the Markdown file');
        const layout = await loadSidecarLayout(doc.uri);
        assert.deepStrictEqual(layout?.User, { x: 333, y: 222 });
    });

    it('fence: a Save after a change to the fence body is refused and writes nothing', async () => {
        const file = path.join(dir, 'body.md');
        fs.writeFileSync(file, PREFIX + FENCE + SUFFIX);
        const { doc, opened } = await openFence(file);
        panel = opened;
        const sidecar = await claimSidecar(doc);
        const shown = opened.currentLayoutSnapshot!.revision;
        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });

        const inside = new vscode.WorkspaceEdit();
        inside.insert(doc.uri, new vscode.Position(9, 0), '    App -->|Notifies| User\n');
        await vscode.workspace.applyEdit(inside);
        await sleep(800);
        const before = doc.getText();

        const result = await visualSave(opened, shown);
        assert.strictEqual(result.type, 'visualLayout.rejected', JSON.stringify(result));
        assert.strictEqual(doc.getText(), before, 'source untouched');
        assert.ok(!fs.existsSync(sidecar), 'no sidecar written');
    });
});
