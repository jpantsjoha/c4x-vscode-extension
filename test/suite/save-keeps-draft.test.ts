/**
 * #439 in a real extension host: with unsaved staged edits in the visual
 * editor, saving the text editor, or editing a Markdown file outside the
 * edited fence, must not re-render the preview (a render discards the draft).
 * The render is owed and runs once after Save or Discard, and the visual Save
 * of the draft still lands.
 *
 * The panel is this test's own PreviewPanel (the extension runs from its
 * bundle) in a real webview, on real documents. Dirty state is reported
 * through the panel's webview message handler; what the host sends is
 * recorded at the panel's webview.postMessage.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { PreviewPanel } from '../../src/webview/PreviewPanel';
import { VISUAL_LAYOUT_PROTOCOL_VERSION } from '../../src/webview/visualLayoutProtocol';
import { dagreLayoutEngine } from '../../src/layout/DagreLayoutEngine';

interface PanelInternals {
    panel: vscode.WebviewPanel;
    hasDirtyState: boolean;
    inConflictState: boolean;
    currentLayoutSnapshot?: { revision: string; nodes: { id: string; x: number; y: number }[] };
    refreshGate: { owed: string; isPending: boolean };
    handleWebviewMessage(message: unknown): Promise<void>;
}

type Posted = Record<string, unknown> & { type?: string; refresh?: boolean; renderToken?: number };

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

describe('Text save and edits outside the fence keep the visual draft (#439, extension host)', function () {
    this.timeout(60000);
    let dir: string;
    let panel: PanelInternals | undefined;
    let posted: Posted[] = [];
    const renders = () => posted.filter(m => m.type === 'render');

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

    async function settleOpening(opened: PanelInternals): Promise<void> {
        await opened.handleWebviewMessage({ type: 'ready' });
        await until('first render', () => opened.currentLayoutSnapshot !== undefined);
        // The webview's own ready and clean reports settle after the first render.
        await sleep(1500);
    }

    async function openStandalone(file: string): Promise<{ doc: vscode.TextDocument; opened: PanelInternals }> {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        PreviewPanel.createOrShow(makeContext());
        const opened = (PreviewPanel as unknown as { instance: PanelInternals }).instance;
        record(opened);
        await settleOpening(opened);
        return { doc, opened };
    }

    async function openFence(file: string): Promise<{ doc: vscode.TextDocument; opened: PanelInternals }> {
        const doc = await vscode.workspace.openTextDocument(file);
        await vscode.window.showTextDocument(doc);
        PreviewPanel.createOrShowForMarkdownBlock(makeContext(), doc, 0);
        const opened = (PreviewPanel as unknown as { markdownInstance: PanelInternals }).markdownInstance;
        record(opened);
        await settleOpening(opened);
        return { doc, opened };
    }

    async function stageDirty(opened: PanelInternals): Promise<void> {
        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        posted.length = 0;
    }

    async function visualSave(opened: PanelInternals, id: string, x: number, y: number, held?: string): Promise<Posted> {
        posted.length = 0;
        const revision = held ?? opened.currentLayoutSnapshot?.revision ?? 'none';
        await opened.handleWebviewMessage({
            type: 'visualLayout.applySemanticEdits', protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION, revision,
            edits: [{ id, x, y }],
        });
        await until('save response', () => posted.some(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected'));
        return posted.find(m => m.type === 'visualLayout.batchAccepted' || m.type === 'visualLayout.rejected')!;
    }

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-439-'));
    });

    afterEach(async () => {
        if (panel) {
            panel.hasDirtyState = false;
            panel.panel.dispose();
            panel = undefined;
        }
        await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');
        await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        await sleep(200);
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('standalone: saving the text editor while dirty keeps the draft; the held render runs once after Discard', async () => {
        const file = path.join(dir, 'save.c4x');
        fs.writeFileSync(file, SOURCE);
        const { doc, opened } = await openStandalone(file);
        panel = opened;
        // An earlier text edit, rendered while the preview was clean, leaves
        // the document dirty in the text editor.
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(4, 0), '    App -->|Notifies| User\n');
        await vscode.workspace.applyEdit(edit);
        await until('render of the text edit', () => opened.currentLayoutSnapshot?.revision === String(doc.version));
        await sleep(600);

        await stageDirty(opened);
        assert.ok(doc.isDirty, 'the text editor has something to save');
        assert.strictEqual(await doc.save(), true);
        await sleep(800);
        assert.strictEqual(renders().length, 0, 'a render now would discard the staged draft');
        assert.strictEqual(opened.inConflictState, false);
        assert.strictEqual(opened.refreshGate.owed, 'source');
        assert.ok(opened.currentLayoutSnapshot, 'Save still has the layout to validate against');

        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await until('held render', () => renders().length > 0);
        await sleep(600);
        assert.strictEqual(renders().length, 1, 'repaid once');
        assert.strictEqual(renders()[0].refresh, true, 'marked, so a webview that staged again declines it');
        assert.strictEqual(opened.refreshGate.isPending, false);
    });

    it('standalone: saving the text editor while dirty, then a visual Save, writes the draft', async () => {
        const file = path.join(dir, 'save-then-visual.c4x');
        fs.writeFileSync(file, SOURCE);
        const { doc, opened } = await openStandalone(file);
        panel = opened;
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(4, 0), '    App -->|Notifies| User\n');
        await vscode.workspace.applyEdit(edit);
        await until('render of the text edit', () => opened.currentLayoutSnapshot?.revision === String(doc.version));
        await sleep(600);

        await stageDirty(opened);
        await doc.save();
        await sleep(800);
        assert.strictEqual(renders().length, 0);
        const result = await visualSave(opened, 'User', 333, 222);
        assert.strictEqual(result.type, 'visualLayout.batchAccepted', JSON.stringify(result));
        assert.ok(/333/.test(doc.getText()), 'the staged move is written');
        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await until('post-Save render', () => renders().length > 0);
        await sleep(600);
        assert.strictEqual(renders().length, 1, 'one render after Save');
        assert.strictEqual(opened.refreshGate.isPending, false);
    });

    for (const kind of ['standalone', 'fence'] as const) {
        it(`${kind}: a save queued while clean, then an edit staged before its timer fires: the draft is kept (review of #442)`, async () => {
            const file = path.join(dir, kind === 'fence' ? 'queued.md' : 'queued.c4x');
            fs.writeFileSync(file, kind === 'fence' ? '# Notes\n\n```c4x\n' + SOURCE + '```\n' : SOURCE);
            const { doc, opened } = kind === 'fence' ? await openFence(file) : await openStandalone(file);
            panel = opened;
            const edit = new vscode.WorkspaceEdit();
            if (kind === 'fence') {
                edit.insert(doc.uri, new vscode.Position(0, 0), 'Prose.\n');
            } else {
                edit.insert(doc.uri, new vscode.Position(4, 0), '    App -->|Notifies| User\n');
            }
            await vscode.workspace.applyEdit(edit);
            await until('render of the text edit', () => opened.currentLayoutSnapshot?.revision === String(doc.version));
            await sleep(600);
            posted.length = 0;

            await doc.save();                          // the save event queues a render while clean (100 ms timer)
            await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true }); // staged before it fires
            await sleep(800);
            assert.strictEqual(renders().length, 0, 'no render reaches the dirty preview');
            assert.strictEqual(opened.inConflictState, false);
            assert.strictEqual(opened.refreshGate.owed, 'source');

            await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await until('held render', () => renders().length > 0);
            await sleep(600);
            assert.strictEqual(renders().length, 1);
        });
    }

    it('standalone: a real change to the source while dirty still opens the conflict', async () => {
        const file = path.join(dir, 'conflict.c4x');
        fs.writeFileSync(file, SOURCE);
        const { doc, opened } = await openStandalone(file);
        panel = opened;
        await stageDirty(opened);
        const edit = new vscode.WorkspaceEdit();
        edit.insert(doc.uri, new vscode.Position(4, 0), '    App -->|Notifies| User\n');
        await vscode.workspace.applyEdit(edit);
        await doc.save();
        await until('conflict', () => opened.inConflictState);
        await sleep(600);
        assert.ok(posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
        assert.strictEqual(renders().length, 0);
    });

    it('fence: an edit outside the fence while dirty keeps the draft, and the visual Save of the draft lands', async () => {
        const file = path.join(dir, 'notes.md');
        fs.writeFileSync(file, '# Notes\n\nSome prose above the diagram.\n\n```c4x\n' + SOURCE + '```\n\nProse below.\n');
        const { doc, opened } = await openFence(file);
        panel = opened;
        await stageDirty(opened);

        const above = new vscode.WorkspaceEdit();
        above.insert(doc.uri, new vscode.Position(2, 0), 'A new paragraph that moves the fence down.\n\n');
        await vscode.workspace.applyEdit(above);
        const below = new vscode.WorkspaceEdit();
        below.insert(doc.uri, new vscode.Position(doc.lineCount - 1, 0), 'More prose below.\n');
        await vscode.workspace.applyEdit(below);
        await sleep(800);
        assert.strictEqual(renders().length, 0, 'the draft stays');
        assert.strictEqual(opened.inConflictState, false);
        assert.ok(!posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
        assert.strictEqual(opened.refreshGate.owed, 'source');

        const result = await visualSave(opened, 'User', 333, 222);
        assert.strictEqual(result.type, 'visualLayout.batchAccepted', JSON.stringify(result));
        const text = doc.getText();
        assert.ok(text.includes('A new paragraph that moves the fence down.') && text.includes('More prose below.'), 'the prose edits are kept');
        assert.ok(/333/.test(text), 'the staged move is written into the fence');

        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await until('post-Save render', () => renders().length > 0);
        await sleep(600);
        assert.strictEqual(renders().length, 1, 'one render after Save');
        assert.strictEqual(opened.refreshGate.isPending, false);
    });

    it('fence: saving the Markdown file while dirty keeps the draft; the held render runs once after Discard', async () => {
        const file = path.join(dir, 'save.md');
        fs.writeFileSync(file, '# Notes\n\n```c4x\n' + SOURCE + '```\n');
        const { doc, opened } = await openFence(file);
        panel = opened;
        await stageDirty(opened);
        const prose = new vscode.WorkspaceEdit();
        prose.insert(doc.uri, new vscode.Position(1, 0), 'Edited prose.\n');
        await vscode.workspace.applyEdit(prose);
        assert.strictEqual(await doc.save(), true);
        await sleep(800);
        assert.strictEqual(renders().length, 0);
        assert.strictEqual(opened.inConflictState, false);

        await opened.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await until('held render', () => renders().length > 0);
        await sleep(600);
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(opened.refreshGate.isPending, false);
    });

    it('fence: an edit inside the fence while dirty still opens the conflict', async () => {
        const file = path.join(dir, 'inside.md');
        fs.writeFileSync(file, '# Notes\n\n```c4x\n' + SOURCE + '```\n');
        const { doc, opened } = await openFence(file);
        panel = opened;
        await stageDirty(opened);
        const inside = new vscode.WorkspaceEdit();
        inside.insert(doc.uri, new vscode.Position(7, 0), '    App -->|Notifies| User\n');
        await vscode.workspace.applyEdit(inside);
        await until('conflict', () => opened.inConflictState);
        assert.strictEqual(renders().length, 0);
    });

    describe('what Save does after each render outcome (review round 2 of #442)', () => {
        type Outcome = 'posted' | 'declined' | 'held' | 'completed-stale';
        type Change = 'unchanged' | 'changed';
        const expected: Record<Outcome, Record<Change, string>> = {
            'posted': { unchanged: 'accepted', changed: 'accepted' },
            'declined': { unchanged: 'accepted', changed: 'layout_unavailable' },
            'held': { unchanged: 'accepted', changed: 'layout_unavailable' },
            'completed-stale': { unchanged: 'accepted', changed: 'layout_unavailable' },
        };
        const PREFIX = '# Notes\n\nProse.\n\n';
        const FENCE = '```c4x\n' + SOURCE + '```\n';
        const SUFFIX = '\nEnd.\n';

        async function edit(doc: vscode.TextDocument, change: Change | 'prose'): Promise<void> {
            const e = new vscode.WorkspaceEdit();
            if (change === 'changed') {
                e.insert(doc.uri, new vscode.Position(9, 0), '    App -->|Notifies| User\n');   // inside the fence body
            } else {
                e.insert(doc.uri, new vscode.Position(2, 0), 'More prose.\n');                 // outside the fence
            }
            await vscode.workspace.applyEdit(e);
        }

        function pauseNextLayout(): { release: () => void; restore: () => void; calls: () => number } {
            const engine = dagreLayoutEngine as unknown as { layout: (...args: unknown[]) => Promise<unknown> };
            const original = engine.layout;
            let release!: () => void;
            const paused = new Promise<void>(resolve => { release = resolve; });
            let calls = 0;
            engine.layout = async function (this: unknown, ...args: unknown[]) {
                calls++;
                if (calls === 1) { await paused; }
                return original.apply(dagreLayoutEngine, args);
            };
            return { release, restore: () => { engine.layout = original; }, calls: () => calls };
        }

        for (const outcome of ['posted', 'declined', 'held', 'completed-stale'] as const) {
            for (const change of ['unchanged', 'changed'] as const) {
                const want = expected[outcome][change];
                it(`fence, render ${outcome}, diagram source ${change}: Save is ${want === 'accepted' ? 'accepted and written into the fence' : `refused (${want})`}`, async () => {
                    const file = path.join(dir, `table-${outcome}-${change}.md`);
                    fs.writeFileSync(file, PREFIX + FENCE + SUFFIX);
                    const { doc, opened } = await openFence(file);
                    panel = opened;
                    const shownRevision = opened.currentLayoutSnapshot!.revision;
                    let heldRevision = shownRevision;

                    if (outcome === 'posted') {
                        await edit(doc, change);
                        await until('render posted', () => opened.currentLayoutSnapshot?.revision === String(doc.version));
                        await sleep(800);
                        await stageDirty(opened);
                        heldRevision = opened.currentLayoutSnapshot!.revision;   // the webview accepted it
                    } else if (outcome === 'declined') {
                        const shownToken = renders().slice(-1)[0]?.renderToken;
                        assert.ok(typeof shownToken === 'number');
                        await edit(doc, change);
                        await until('render posted', () => renders().some(m => m.renderToken !== shownToken));
                        await sleep(800);
                        // The webview had staged an edit first and declined it, still showing the older render.
                        await opened.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: shownToken });
                    } else if (outcome === 'held') {
                        await stageDirty(opened);
                        await edit(doc, change);
                        await sleep(800);
                    } else {
                        const pause = pauseNextLayout();
                        try {
                            await edit(doc, 'prose');                 // an automatic render starts while clean
                            await until('render awaiting layout', () => pause.calls() === 1, 4000);
                            await stageDirty(opened);
                            await edit(doc, change);
                            pause.release();
                            await sleep(800);
                        } finally {
                            pause.restore();
                        }
                    }

                    const before = doc.getText();
                    const result = await visualSave(opened, 'User', 333, 222, heldRevision);
                    if (want === 'accepted') {
                        assert.strictEqual(result.type, 'visualLayout.batchAccepted', JSON.stringify(result));
                        const text = doc.getText();
                        const fenceStart = text.indexOf('```c4x');
                        const fenceEnd = text.indexOf('```', fenceStart + 6);
                        assert.ok(/333/.test(text.slice(fenceStart, fenceEnd)), 'written inside the fence');
                        assert.strictEqual(text.slice(0, fenceStart), before.slice(0, before.indexOf('```c4x')), 'nothing above the fence is touched');
                        assert.strictEqual(text.slice(text.indexOf('```', fenceStart + 6)), before.slice(before.indexOf('```', before.indexOf('```c4x') + 6)), 'nothing below the fence is touched');
                    } else {
                        assert.strictEqual(result.type, 'visualLayout.rejected', JSON.stringify(result));
                        assert.strictEqual(result.code, want);
                        assert.strictEqual(doc.getText(), before, 'a refused Save writes nothing');
                        assert.strictEqual(opened.inConflictState, true, 'the conflict banner explains why');
                    }
                });
            }
        }
    });
});
