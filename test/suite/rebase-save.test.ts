import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';
import { SOURCE_CHANGED_REBASE_NOTICE, SOURCE_CHANGED_SAVE_REFUSAL, VISUAL_LAYOUT_PROTOCOL_VERSION } from '../../src/webview/visualLayoutProtocol';

/**
 * Real PreviewPanel in the extension host: a Rebase that is accepted must
 * leave Save able to write the staged edit (#293), and a Rebase that is
 * refused or discarded must not.
 */

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    'Person(u, "User")',
    'System(s, "Shop")',
    'System(p, "Payments")',
    'u -->|Browses| s',
    '',
].join('\n');

interface PanelInternals {
    currentLayoutSnapshot?: { revision: string };
    inConflictState: boolean;
    hasDirtyState: boolean;
    panel: { webview: { postMessage: (m: unknown) => Thenable<boolean> } };
    handleWebviewMessage(message: unknown): Promise<void>;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function until(label: string, cond: () => boolean, ms = 8000): Promise<void> {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (cond()) { return; }
        await sleep(25);
    }
    throw new Error(`timed out waiting for ${label}`);
}

describe('Rebase then Save in the real preview panel (#293)', function () {
    this.timeout(60000);
    let dir: string;
    let doc: vscode.TextDocument;
    let panel: PanelInternals;
    let sent: Array<Record<string, unknown>>;

    beforeEach(async () => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-293-'));
        const file = path.join(dir, 'shop.c4x');
        fs.writeFileSync(file, SOURCE);
        doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        // The installed extension runs from its bundle, so this test drives its
        // own copy of the real PreviewPanel class with an in-memory context.
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
        await until('first render', () => panel.currentLayoutSnapshot !== undefined);
    });

    afterEach(async () => {
        panel.hasDirtyState = false;
        PreviewPanel.dispose();
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        fs.rmSync(dir, { recursive: true, force: true });
    });

    async function externalInsert(afterLine: number, line: string): Promise<void> {
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(afterLine, 0), line + '\n');
        await vscode.workspace.applyEdit(edit);
        await until('conflict state', () => panel.inConflictState);
    }

    async function resolve(action: string, stagedKeys?: string[]): Promise<Record<string, unknown>> {
        sent.length = 0;
        await panel.handleWebviewMessage({
            type: 'visualLayout.resolveConflict', protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION, action,
            ...(stagedKeys ? { stagedKeys } : {}),
        });
        await until(`ack for ${action}`, () => sent.some(m => m.type === 'visualLayout.conflictActionAcknowledged') || action === 'reloadAndDiscard');
        return sent.find(m => m.type === 'visualLayout.conflictActionAcknowledged') ?? {};
    }

    async function save(edits: unknown[]): Promise<Record<string, unknown>> {
        sent.length = 0;
        // The revision the webview holds is the one of the last render it received.
        const revision = panel.currentLayoutSnapshot?.revision ?? 'none';
        await panel.handleWebviewMessage({
            type: 'visualLayout.applySemanticEdits', protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION, revision, edits,
        });
        await until('save response', () => sent.some(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected'));
        return sent.find(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected')!;
    }

    it('refuses Save and leaves the document untouched when Save follows an accepted Rebase (#293)', async () => {
        // Characterisation of current behaviour, not an endorsement: Rebase
        // clears the layout snapshot's validity and no render follows, so Save
        // is refused with layout_unavailable. Nothing is written and the draft
        // stays staged in the webview. A render here would reset the webview
        // draft (its render path clears staged edits), so none is posted.
        const before = doc.getText();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        await externalInsert(6, 's -->|Charges| p');
        const afterExternal = doc.getText();
        const ack = await resolve('rebase', ['u', 'rel-0']);
        assert.strictEqual(ack.action, 'rebaseAccepted', JSON.stringify(ack));
        assert.strictEqual(ack.reason, SOURCE_CHANGED_REBASE_NOTICE, 'Rebase says Save cannot land');
        const result = await save([{ id: 'u', x: 321, y: 123 }]);
        assert.strictEqual(result.type, 'visualLayout.rejected', JSON.stringify(result));
        assert.strictEqual(result.code, 'layout_unavailable');
        assert.strictEqual(result.reason, SOURCE_CHANGED_SAVE_REFUSAL);
        assert.strictEqual(doc.getText(), afterExternal, 'document untouched by the refused Save');
        assert.notStrictEqual(afterExternal, before);
    });

    it('still refuses a Rebase over a moved positional relationship', async () => {
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        await externalInsert(5, 'p -->|Notifies| u');
        const ack = await resolve('rebase', ['rel-0']);
        assert.strictEqual(ack.action, 'rebaseFailed', JSON.stringify(ack));
        assert.ok(panel.inConflictState, 'conflict stays open');
    });

    it('Discard after an external change restores the document view', async () => {
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        await externalInsert(6, 's -->|Charges| p');
        await resolve('reloadAndDiscard');
        await until('re-render', () => panel.currentLayoutSnapshot !== undefined);
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(panel.hasDirtyState, false);
    });

    it('a Markdown fence editor gets a notice whose recovery works there (#293)', async () => {
        // The C4X: Refresh Preview command only refreshes the standalone
        // panel, so the notice must not name it for a fence editor.
        const mdFile = path.join(dir, 'doc.md');
        fs.writeFileSync(mdFile, '# Doc\n\n```c4x\n' + SOURCE + '```\n');
        const mdDoc = await vscode.workspace.openTextDocument(mdFile);
        PreviewPanel.dispose();
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
        PreviewPanel.createOrShowForMarkdownBlock(context, mdDoc, 0);
        const mdPanel = (PreviewPanel as unknown as { markdownInstance: PanelInternals }).markdownInstance;
        const mdSent: Array<Record<string, unknown>> = [];
        const webview = mdPanel.panel.webview;
        const original = webview.postMessage.bind(webview);
        webview.postMessage = (m: unknown) => { mdSent.push(m as Record<string, unknown>); return original(m); };
        try {
            await mdPanel.handleWebviewMessage({ type: 'ready' });
            await until('markdown render', () => mdPanel.currentLayoutSnapshot !== undefined);
            await mdPanel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            const edit = new vscode.WorkspaceEdit();
            edit.insert(mdDoc.uri, new vscode.Position(9, 0), 's -->|Charges| p\n');
            await vscode.workspace.applyEdit(edit);
            await until('markdown conflict', () => mdPanel.inConflictState);
            mdSent.length = 0;
            await mdPanel.handleWebviewMessage({
                type: 'visualLayout.resolveConflict', protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
                action: 'rebase', stagedKeys: ['u'],
            });
            await until('markdown ack', () => mdSent.some(m => m.type === 'visualLayout.conflictActionAcknowledged'));
            const ack = mdSent.find(m => m.type === 'visualLayout.conflictActionAcknowledged')!;
            assert.strictEqual(ack.action, 'rebaseAccepted', JSON.stringify(ack));
            assert.strictEqual(ack.reason, SOURCE_CHANGED_REBASE_NOTICE);
            assert.ok(!/Refresh Preview/.test(String(ack.reason)), 'must not name the command that skips fence editors');
            assert.ok(/close and reopen this editor/i.test(String(ack.reason)));
        } finally {
            mdPanel.hasDirtyState = false;
            PreviewPanel.dispose();
            (PreviewPanel as unknown as { markdownInstance?: { dispose(): void } }).markdownInstance?.dispose();
        }
    });
});
