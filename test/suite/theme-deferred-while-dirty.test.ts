/**
 * #408 in a real extension host: a `c4x.theme` change must not re-render a
 * preview that holds unsaved staged edits, because every render clears the
 * webview's draft. The render waits and runs once the draft is clean. The
 * recovery paths from a conflict (#293, #406) must still work while a theme
 * change waits.
 *
 * The panel is this test's own PreviewPanel (the extension runs from its
 * bundle), in a real webview, with real configuration events. Dirty state and
 * conflict actions are reported through the panel's webview message handler,
 * the function its onDidReceiveMessage subscription calls; what the host sends
 * is recorded at the panel's webview.postMessage.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';

interface PanelInternals {
    panel: vscode.WebviewPanel;
    hasDirtyState: boolean;
    inConflictState: boolean;
    currentLayoutSnapshot: unknown;
    refreshGate: { isPending: boolean };
    handleWebviewMessage(message: unknown): Promise<void>;
}

interface Posted { type?: string; refresh?: boolean }

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const statics = PreviewPanel as unknown as { instance: PanelInternals | undefined };

describe('Theme change while staged edits are unsaved (#408, extension host)', function () {
    this.timeout(60000);
    let tempDir: string;
    let savedTheme: unknown;
    let panel: PanelInternals | undefined;
    let posted: Posted[] = [];
    const renders = () => posted.filter(m => m.type === 'render');
    const memento = { keys: () => [], get: () => undefined, update: async () => undefined } as unknown as vscode.Memento;
    const context = { workspaceState: memento, subscriptions: [] } as unknown as vscode.ExtensionContext;

    async function waitFor(condition: () => boolean, ms: number): Promise<void> {
        const deadline = Date.now() + ms;
        while (!condition() && Date.now() < deadline) {
            await sleep(50);
        }
    }

    /** Open a fresh panel, record its posts, and let its opening render settle. */
    async function openPanel(): Promise<PanelInternals> {
        posted = [];
        PreviewPanel.createOrShow(context);
        const opened = statics.instance;
        assert.ok(opened, 'panel created');
        const webview = opened.panel.webview;
        const original = webview.postMessage.bind(webview);
        webview.postMessage = (message: unknown) => {
            posted.push(message as Posted);
            return original(message);
        };
        await waitFor(() => renders().length > 0 && opened.currentLayoutSnapshot !== undefined, 10000);
        // The webview's own ready and clean reports settle after the first render.
        await sleep(1500);
        return opened;
    }

    async function closePanel(): Promise<void> {
        panel?.panel.dispose();
        panel = undefined;
        await sleep(200);
    }

    async function changeTheme(): Promise<void> {
        const current = vscode.workspace.getConfiguration('c4x').get<string>('theme');
        const next = current === 'muted' ? 'classic' : 'muted';
        await vscode.workspace.getConfiguration('c4x').update('theme', next, vscode.ConfigurationTarget.Workspace);
        await sleep(800);
    }

    before(async () => {
        savedTheme = vscode.workspace.getConfiguration('c4x').inspect('theme')?.workspaceValue;
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-408-'));
        const file = path.join(tempDir, 'theme-deferred.c4x');
        fs.writeFileSync(file, 'graph TB\n    User[User<br/>Person]\n    App[App<br/>Software System]\n    User -->|Uses| App\n');
        const document = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(document);
    });

    afterEach(async () => {
        await closePanel();
    });

    after(async () => {
        await vscode.workspace.getConfiguration('c4x').update('theme', savedTheme, vscode.ConfigurationTarget.Workspace);
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('marks a theme render on a clean preview so the webview can decline it', async () => {
        panel = await openPanel();
        posted.length = 0;
        await changeTheme();
        await waitFor(() => renders().length > 0, 5000);
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(renders()[0].refresh, true, 'theme-only render carries refresh: true');
    });

    it('sends no render while dirty, then exactly one once the draft is clean', async () => {
        panel = await openPanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        posted.length = 0;

        await changeTheme();

        assert.strictEqual(renders().length, 0, 'a render now would discard the staged draft');
        assert.ok(posted.some(m => m.type === 'visualLayout.refreshDeferred'), 'the webview is told the change waits');

        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await waitFor(() => renders().length > 0, 5000);
        await sleep(800);
        assert.strictEqual(renders().length, 1, 'the deferred render runs once, after the draft is clean');
    });

    it('dirty and in conflict: Reload and discard still renders, once', async () => {
        panel = await openPanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        panel.inConflictState = true;
        posted.length = 0;
        await changeTheme();
        assert.strictEqual(renders().length, 0);
        assert.strictEqual(panel.refreshGate.isPending, true);

        // The client's Reload button: report clean, then ask the host to reload.
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'reloadAndDiscard' });
        await waitFor(() => renders().length > 0, 5000);
        await sleep(800);
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(panel.refreshGate.isPending, false);
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(panel.hasDirtyState, false);
    });

    it('dirty and in conflict: close and reopen gives a fresh render and a saveable state', async () => {
        panel = await openPanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        panel.inConflictState = true;
        await changeTheme();
        assert.strictEqual(panel.refreshGate.isPending, true);

        await closePanel();
        assert.strictEqual(statics.instance, undefined, 'closing the editor drops the panel');

        panel = await openPanel();
        assert.strictEqual(renders().length >= 1, true, 'the reopened editor renders');
        assert.strictEqual(panel.hasDirtyState, false);
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(panel.refreshGate.isPending, false, 'no deferred state carries over');
        assert.ok(panel.currentLayoutSnapshot, 'a current layout exists, so a new Save can be validated');
    });
});
