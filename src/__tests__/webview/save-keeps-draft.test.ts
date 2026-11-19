/**
 * A text-editor save, or an edit outside the anchored Markdown fence, must not
 * discard the visual editor's unsaved draft (#439). Neither changes the
 * diagram source the preview shows, so the render they ask for is a 'retry':
 * the #408 gate holds it as owed while the preview is dirty and repays it once
 * after Save or Discard. A real change to the diagram source still enters the
 * conflict path; a clean preview behaves as before.
 *
 * The panel tests drive the real PreviewPanel listeners, message handler,
 * debounce timer and render on a prototype instance (no native webview), as
 * theme-rerender-dirty-gate.test.ts does.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request: string, ...args: unknown[]) {
    if (request === 'vscode') {return require.resolve('../__mocks__/vscode');}
    return originalResolveFilename.call(this, request, ...args);
};

import * as vscodeMock from '../__mocks__/vscode';
import { PreviewPanel, UNMATCHED_DECLINE_REASON } from '../../webview/PreviewPanel';
import { decideFire, decideRenderCompletion, decideSourceEvent, NonSourceRenderGate, strongerCause, type AnchorCheck } from '../../webview/nonSourceRenderGate';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';
Module._resolveFilename = originalResolveFilename;

const settle = (ms = 400) => new Promise(resolve => setTimeout(resolve, ms));

describe('source events while staged edits are unsaved: the state table (#439)', () => {
    const anchors: AnchorCheck[] = ['unchanged', 'changed', 'unknown'];
    for (const anchor of anchors) {
        it(`clean, anchor ${anchor}: an automatic render is queued`, () => {
            assert.strictEqual(decideSourceEvent({ dirty: false, conflict: false, anchor }), 'schedule-auto');
        });
        it(`in conflict, anchor ${anchor}: owed, render suppressed`, () => {
            assert.strictEqual(decideSourceEvent({ dirty: true, conflict: true, anchor }), 'owe-source');
            assert.strictEqual(decideSourceEvent({ dirty: false, conflict: true, anchor }), 'owe-source');
        });
    }
    it('dirty, diagram source unchanged or unknown: an automatic render is queued, and decided when it fires', () => {
        assert.strictEqual(decideSourceEvent({ dirty: true, conflict: false, anchor: 'unchanged' }), 'schedule-auto');
        assert.strictEqual(decideSourceEvent({ dirty: true, conflict: false, anchor: 'unknown' }), 'schedule-auto');
    });
    it('dirty, diagram source changed: the conflict path, never a silent hold', () => {
        assert.strictEqual(decideSourceEvent({ dirty: true, conflict: false, anchor: 'changed' }), 'enter-conflict');
    });

    describe("timer fires and render completes with cause 'auto'", () => {
        const cases: [boolean, boolean, AnchorCheck, string][] = [
            [false, false, 'unchanged', 'post-marked'], [false, false, 'changed', 'post-marked'], [false, false, 'unknown', 'post-marked'],
            [true, false, 'unchanged', 'hold'], [true, false, 'changed', 'conflict'], [true, false, 'unknown', 'post-marked'],
            [true, true, 'unchanged', 'hold'], [false, true, 'changed', 'hold'], [true, true, 'unknown', 'hold'],
        ];
        for (const [dirty, conflict, anchor, expected] of cases) {
            it(`D=${dirty} C=${conflict} A=${anchor}: ${expected}`, () => {
                assert.strictEqual(decideFire('auto', dirty, conflict, anchor), expected);
                assert.strictEqual(
                    decideRenderCompletion({ stale: false, conflictBegan: false, dirty, conflict, cause: 'auto', anchor }),
                    expected === 'post-marked' ? 'post' : expected,
                );
            });
        }
        it('a stale automatic render retries; one overtaken by a conflict is held', () => {
            assert.strictEqual(decideRenderCompletion({ stale: true, conflictBegan: false, dirty: true, conflict: false, cause: 'auto', anchor: 'changed' }), 'retry');
            assert.strictEqual(decideRenderCompletion({ stale: false, conflictBegan: true, dirty: true, conflict: true, cause: 'auto' }), 'hold');
        });
    });

    it('source beats auto beats retry beats theme', () => {
        assert.strictEqual(strongerCause('auto', 'source'), 'source');
        assert.strictEqual(strongerCause('retry', 'auto'), 'auto');
        assert.strictEqual(strongerCause('auto', 'theme'), 'auto');
    });

    it('an automatic render merged into a pending one keeps being decided at fire time', () => {
        const gate = new NonSourceRenderGate();
        gate.scheduled('auto');
        gate.scheduled('retry');
        assert.deepStrictEqual(gate.fire(true, false, () => 'unchanged'), { decision: 'hold', cause: 'auto' });
        assert.strictEqual(gate.owed, 'source');
        assert.strictEqual(gate.dirtyChanged(false), 'retry');
        gate.rendered();
        gate.scheduled('auto');
        assert.deepStrictEqual(gate.fire(true, false, () => 'changed'), { decision: 'conflict', cause: 'auto' });
        assert.strictEqual(gate.owed, 'source');
        gate.rendered();
        gate.scheduled('auto');
        gate.scheduled('source');
        assert.deepStrictEqual(gate.fire(true, false, () => 'unchanged'), { decision: 'post', cause: 'source' }, 'a user-authorised render still wins');
    });
});

interface Panel {
    disposables: { dispose(): void }[];
    hasDirtyState: boolean;
    inConflictState: boolean;
    activeDocument: unknown;
    refreshGate: NonSourceRenderGate;
    debounceTimer: NodeJS.Timeout | undefined;
    panel: { webview: { postMessage(message: unknown): Thenable<boolean> } };
    activeSaveAnchor: unknown;
    markdownBlock: unknown;
    currentLayoutSnapshot: { revision: string } | undefined;
    conflictEpoch: number;
    log(line: string): void;
    registerEventListeners(): void;
    handleWebviewMessage(message: unknown): Promise<void>;
    captureDocumentAnchor(doc: unknown): unknown;
    captureMarkdownBlockAnchor(doc: unknown, ordinal: number): unknown;
    getWorkspaceName(doc: unknown): string;
    writebackRevision(message: { revision: string }, doc: unknown): string;
}

interface Posted { type?: string; refresh?: boolean; renderToken?: number }

describe('PreviewPanel keeps the draft through a text save or an edit outside the fence (#439)', () => {
    type Listener = (...args: unknown[]) => void;
    const windowMock = vscodeMock.window as unknown as Record<string, unknown>;
    const workspaceMock = vscodeMock.workspace as unknown as Record<string, unknown>;
    let textChangeListeners: Listener[];
    let saveListeners: Listener[];
    let saved: Record<string, unknown>;
    let panels: Panel[];

    const capture = (sink: Listener[]) => (listener: Listener) => {
        sink.push(listener);
        return { dispose: () => { sink.splice(sink.indexOf(listener), 1); } };
    };
    const inert = () => ({ dispose: () => undefined });

    beforeEach(() => {
        textChangeListeners = [];
        saveListeners = [];
        panels = [];
        saved = {
            onDidChangeActiveColorTheme: windowMock.onDidChangeActiveColorTheme,
            onDidChangeActiveTextEditor: windowMock.onDidChangeActiveTextEditor,
            onDidSaveTextDocument: workspaceMock.onDidSaveTextDocument,
            onDidChangeTextDocument: workspaceMock.onDidChangeTextDocument,
        };
        windowMock.onDidChangeActiveColorTheme = inert;
        windowMock.onDidChangeActiveTextEditor = inert;
        workspaceMock.onDidSaveTextDocument = capture(saveListeners);
        workspaceMock.onDidChangeTextDocument = capture(textChangeListeners);
    });

    afterEach(() => {
        for (const panel of panels) {
            if (panel.debounceTimer) {clearTimeout(panel.debounceTimer);}
            while (panel.disposables.length) {panel.disposables.pop()?.dispose();}
        }
        Object.assign(windowMock, { onDidChangeActiveColorTheme: saved.onDidChangeActiveColorTheme, onDidChangeActiveTextEditor: saved.onDidChangeActiveTextEditor });
        Object.assign(workspaceMock, { onDidSaveTextDocument: saved.onDidSaveTextDocument, onDidChangeTextDocument: saved.onDidChangeTextDocument });
    });

    type Kind = 'standalone' | 'fence';
    interface Doc { uri: { toString(): string; fsPath: string }; getText(): string; version: number; languageId: string; fileName: string }

    /** A panel bound to a document, with its opening render posted. */
    async function setUp(kind: Kind) {
        const panel = Object.create(PreviewPanel.prototype) as Panel;
        const posted: Posted[] = [];
        panel.disposables = [];
        panel.hasDirtyState = false;
        panel.inConflictState = false;
        panel.refreshGate = new NonSourceRenderGate();
        panel.conflictEpoch = 0;
        panel.log = () => undefined;
        panel.getWorkspaceName = () => 'keep-draft';
        panel.panel = { webview: { postMessage: (message: unknown) => { posted.push(message as Posted); return Promise.resolve(true); } } };

        const body = (label: string) => `graph TB\n    User[User<br/>Person]\n    App[${label}<br/>Software System]\n    User -->|Uses| App\n`;
        let label = 'App';
        let prose = 'Some notes.';
        const text = () => kind === 'fence'
            ? `# Notes\n\n${prose}\n\n\`\`\`c4x\n${body(label)}\`\`\`\n\nMore prose.\n`
            : body(label);
        const document: Doc = {
            uri: { toString: () => `file:///keep-draft.${kind === 'fence' ? 'md' : 'c4x'}`, fsPath: '/keep-draft' },
            getText: text,
            version: 1,
            languageId: kind === 'fence' ? 'markdown' : 'c4x',
            fileName: kind === 'fence' ? 'keep-draft.md' : 'keep-draft.c4x',
        };
        panel.activeDocument = document;
        if (kind === 'fence') {
            panel.markdownBlock = { document, blockOrdinal: 0 };
            panel.activeSaveAnchor = panel.captureMarkdownBlockAnchor(document, 0);
        } else {
            panel.activeSaveAnchor = panel.captureDocumentAnchor(document);
        }
        panel.registerEventListeners();
        panels.push(panel);

        await panel.handleWebviewMessage({ type: 'ready' });
        await settle(200);
        assert.strictEqual(posted.filter(m => m.type === 'render').length, 1, 'opening render');
        const openingToken = (posted.find(m => m.type === 'render') as { renderToken?: number }).renderToken;
        posted.length = 0;

        const fireChange = () => { document.version++; for (const listener of [...textChangeListeners]) {listener({ document });} };
        return {
            panel, posted, document, openingToken,
            renders: () => posted.filter(m => m.type === 'render'),
            save: () => { for (const listener of [...saveListeners]) {listener(document);} },
            editDiagram: (next: string) => { label = next; fireChange(); },
            editProse: (next: string) => { prose = next; fireChange(); },
            /** A change that leaves the text as it was (type, then undo). */
            touch: () => fireChange(),
        };
    }

    for (const kind of ['standalone', 'fence'] as const) {
        it(`${kind}: a text save while clean renders as before`, async () => {
            const { renders, save } = await setUp(kind);
            save();
            await settle();
            assert.strictEqual(renders().length, 1);
            assert.strictEqual(renders()[0].refresh, true, 'an automatic render is marked, so a webview that just staged declines it');
        });

        it(`${kind}: a text save while dirty keeps the draft; the held render runs once after Save or Discard`, async () => {
            const { panel, renders, save } = await setUp(kind);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            const revision = panel.currentLayoutSnapshot?.revision;
            save();
            await settle();
            assert.strictEqual(renders().length, 0, 'a render now would discard the staged draft');
            assert.strictEqual(panel.inConflictState, false, 'nothing changed, so no conflict');
            assert.strictEqual(panel.refreshGate.owed, 'source', 'the render is owed');
            assert.strictEqual(panel.currentLayoutSnapshot?.revision, revision, 'Save can still be validated');

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders().length, 1, 'repaid once');
            assert.strictEqual(renders()[0].refresh, true, 'marked, so a webview that staged again declines it');
            assert.strictEqual(panel.refreshGate.owed, 'none');
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders().length, 1, 'not twice');
        });

        it(`${kind}: an edit that leaves the text as it was keeps the draft`, async () => {
            const { panel, renders, touch, document } = await setUp(kind);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            touch();
            await settle();
            assert.strictEqual(renders().length, 0);
            assert.strictEqual(panel.inConflictState, false);
            assert.strictEqual(panel.writebackRevision({ revision: '1' }, document), String(document.version), 'Save lands on the new version');
        });

        it(`${kind}: a real change to the diagram source while dirty still opens the conflict`, async () => {
            const { panel, posted, renders, editDiagram, save } = await setUp(kind);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            editDiagram('Shop');
            save();
            await settle();
            assert.strictEqual(panel.inConflictState, true);
            assert.ok(posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
            assert.strictEqual(renders().length, 0);
            assert.strictEqual(panel.currentLayoutSnapshot, undefined, 'Save is refused against the old layout');
            assert.strictEqual(panel.refreshGate.owed, 'source');
        });
    }

    it('fence: an edit outside the fence while dirty keeps the draft; the held render runs once after Discard', async () => {
        const { panel, posted, renders, editProse, document } = await setUp('fence');
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        const revision = panel.currentLayoutSnapshot?.revision;
        editProse('A much longer paragraph of notes that moves the fence down the file.');
        editProse('Short.');
        await settle();
        assert.strictEqual(renders().length, 0, 'the draft stays');
        assert.strictEqual(panel.inConflictState, false);
        assert.ok(!posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
        assert.strictEqual(panel.refreshGate.owed, 'source');
        assert.strictEqual(panel.currentLayoutSnapshot?.revision, revision, 'the layout the webview shows is kept');
        assert.strictEqual(panel.writebackRevision({ revision: revision! }, document), String(document.version),
            'Save of the draft is checked against the current version: the diagram source is the same');
        assert.strictEqual(panel.writebackRevision({ revision: 'older' }, document), 'older', 'any other revision is left alone');

        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await settle();
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(renders()[0].refresh, true);
        assert.strictEqual(panel.writebackRevision({ revision: revision! }, document), revision, 'a posted render ends the carry');
    });

    it('fence: a carried revision is not translated once the fence body changed', async () => {
        const { panel, editProse, editDiagram, document } = await setUp('fence');
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        const revision = panel.currentLayoutSnapshot!.revision;
        editProse('Changed prose.');
        // Bypass the listener's conflict path to prove writebackRevision checks again on its own.
        const listeners = [...textChangeListeners];
        textChangeListeners.length = 0;
        editDiagram('Shop');
        textChangeListeners.push(...listeners);
        assert.strictEqual(panel.writebackRevision({ revision }, document), revision);
    });

    it('fence: a clean preview renders an edit outside the fence as before', async () => {
        const { renders, editProse } = await setUp('fence');
        editProse('Changed prose.');
        await settle();
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(renders()[0].refresh, true);
    });

    it('a dirty panel with no anchor posts the automatic render marked, so the webview declines it', async () => {
        const { panel, renders, save } = await setUp('fence');
        panel.activeSaveAnchor = undefined;
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        save();
        await settle();
        assert.strictEqual(renders().length, 1);
        assert.strictEqual(renders()[0].refresh, true);
    });

    function pauseFirstLayout(): { release: () => void; restore: () => void; calls: () => number } {
        const engine = dagreLayoutEngine as unknown as { layout: (...args: unknown[]) => Promise<unknown> };
        const original = engine.layout;
        let release!: () => void;
        const paused = new Promise<void>(resolve => { release = resolve; });
        let calls = 0;
        engine.layout = async function (this: unknown, ...args: unknown[]) {
            calls++;
            if (calls === 1) {await paused;}
            return original.apply(dagreLayoutEngine, args);
        };
        return { release, restore: () => { engine.layout = original; }, calls: () => calls };
    }

    // Review round 1 on #442: a render queued by a source event while the
    // preview was clean must not clear a draft staged before it fires.
    for (const kind of ['standalone', 'fence'] as const) {
        it(`${kind}: save while clean, stage an edit before the timer fires, save again: the draft is kept`, async () => {
            const { panel, renders, save, document } = await setUp(kind);
            save();                                                                // queues an automatic render while clean
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true }); // staged before it fires
            save();                                                                // asks again; merged with the first
            await settle();
            assert.strictEqual(renders().length, 0, 'no render reaches the dirty preview');
            assert.strictEqual(panel.inConflictState, false, 'nothing changed, so no conflict');
            assert.strictEqual(panel.refreshGate.owed, 'source');
            assert.ok(panel.currentLayoutSnapshot, 'Save can still be validated');
            assert.strictEqual(panel.writebackRevision({ revision: panel.currentLayoutSnapshot!.revision }, document), String(document.version));

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders().length, 1, 'repaid once after Save or Discard');
            assert.strictEqual(renders()[0].refresh, true);
        });

        it(`${kind}: a diagram change queued while clean, then an edit staged before it fires: the conflict opens, nothing is cleared`, async () => {
            const { panel, posted, renders, editDiagram } = await setUp(kind);
            editDiagram('Shop');                                                   // queued while clean (250 ms)
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            await settle();
            assert.strictEqual(renders().length, 0, 'the canvas the draft was made on is not replaced');
            assert.strictEqual(panel.inConflictState, true, 'the draft was made against a canvas whose source changed');
            assert.ok(posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
            assert.strictEqual(panel.refreshGate.owed, 'source');
            assert.strictEqual(panel.currentLayoutSnapshot, undefined, 'Save against the old canvas is refused');
        });

        it(`${kind}: an automatic render in flight when an edit is staged is held (save) or opens the conflict (change)`, async () => {
            for (const variant of ['save', 'change'] as const) {
                const { panel, renders, save, editDiagram } = await setUp(kind);
                const pause = pauseFirstLayout();
                try {
                    if (variant === 'save') {save();} else {editDiagram('Shop');}
                    await settle();
                    assert.strictEqual(pause.calls(), 1, 'the automatic render is awaiting its layout');
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                    pause.release();
                    await settle(200);
                    assert.strictEqual(renders().length, 0, `${variant}: the draft is kept`);
                    assert.strictEqual(panel.inConflictState, variant === 'change', `${variant}: conflict only for a real change`);
                    assert.strictEqual(panel.refreshGate.owed, 'source');
                } finally {
                    pause.restore();
                }
            }
        });

        it(`${kind}: a user-authorised render queued beside a pending automatic one still wins`, async () => {
            const { panel, renders, save } = await setUp(kind);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            save();
            // The render a visual Save schedules after its writeback.
            (panel as unknown as { scheduleRender(delay: number): void }).scheduleRender(50);
            await settle();
            assert.strictEqual(renders().length, 1);
            assert.notStrictEqual(renders()[0].refresh, true, 'the user chose it, so it is not marked');
            assert.strictEqual(panel.refreshGate.owed, 'none');
        });
    }

    it('fence: an edit outside the fence queued while clean, then an edit staged before it fires: held, and Save still lands', async () => {
        const { panel, renders, editProse, document } = await setUp('fence');
        const revision = panel.currentLayoutSnapshot!.revision;
        editProse('Edited while clean.');
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        await settle();
        assert.strictEqual(renders().length, 0);
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(panel.writebackRevision({ revision }, document), String(document.version));
    });
});

describe('PreviewPanel: what the webview shows decides Save, not what was last computed (#439 review round 2)', () => {
    type Listener = (...args: unknown[]) => void;
    const workspaceMock = vscodeMock.workspace as unknown as Record<string, unknown>;
    const windowMock = vscodeMock.window as unknown as Record<string, unknown>;
    let textChangeListeners: Listener[];
    let saveListeners: Listener[];
    let saved: Record<string, unknown>;
    let panels: Panel[];
    const capture = (sink: Listener[]) => (listener: Listener) => {
        sink.push(listener);
        return { dispose: () => { sink.splice(sink.indexOf(listener), 1); } };
    };
    const inert = () => ({ dispose: () => undefined });

    beforeEach(() => {
        textChangeListeners = [];
        saveListeners = [];
        panels = [];
        saved = {
            a: windowMock.onDidChangeActiveColorTheme, b: windowMock.onDidChangeActiveTextEditor,
            c: workspaceMock.onDidSaveTextDocument, d: workspaceMock.onDidChangeTextDocument,
        };
        windowMock.onDidChangeActiveColorTheme = inert;
        windowMock.onDidChangeActiveTextEditor = inert;
        workspaceMock.onDidSaveTextDocument = capture(saveListeners);
        workspaceMock.onDidChangeTextDocument = capture(textChangeListeners);
    });
    afterEach(() => {
        for (const panel of panels) {
            if (panel.debounceTimer) {clearTimeout(panel.debounceTimer);}
            while (panel.disposables.length) {panel.disposables.pop()?.dispose();}
        }
        Object.assign(windowMock, { onDidChangeActiveColorTheme: saved.a, onDidChangeActiveTextEditor: saved.b });
        Object.assign(workspaceMock, { onDidSaveTextDocument: saved.c, onDidChangeTextDocument: saved.d });
    });

    async function open(kind: 'standalone' | 'fence') {
        const panel = Object.create(PreviewPanel.prototype) as Panel;
        const posted: Posted[] = [];
        Object.assign(panel, {
            disposables: [], hasDirtyState: false, inConflictState: false,
            refreshGate: new NonSourceRenderGate(), conflictEpoch: 0, log: () => undefined,
            getWorkspaceName: () => 'shown',
            panel: { webview: { postMessage: (message: unknown) => { posted.push(message as Posted); return Promise.resolve(true); } } },
        });
        const body = (label: string) => `graph TB\n    User[User<br/>Person]\n    App[${label}<br/>Software System]\n    User -->|Uses| App\n`;
        let label = 'App';
        let prose = 'Notes.';
        const document = {
            uri: { toString: () => `file:///shown.${kind === 'fence' ? 'md' : 'c4x'}`, fsPath: '/shown' },
            getText: () => kind === 'fence' ? `# T\n\n${prose}\n\n\`\`\`c4x\n${body(label)}\`\`\`\n` : body(label),
            version: 1,
            languageId: kind === 'fence' ? 'markdown' : 'c4x',
            fileName: kind === 'fence' ? 'shown.md' : 'shown.c4x',
        };
        panel.activeDocument = document;
        if (kind === 'fence') {
            panel.markdownBlock = { document, blockOrdinal: 0 };
            panel.activeSaveAnchor = panel.captureMarkdownBlockAnchor(document, 0);
        } else {
            panel.activeSaveAnchor = panel.captureDocumentAnchor(document);
        }
        panel.registerEventListeners();
        panels.push(panel);
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle(200);
        const tokens = () => posted.filter(m => m.type === 'render').map(m => m.renderToken!);
        const fire = () => { document.version++; for (const listener of [...textChangeListeners]) {listener({ document });} };
        return {
            panel, posted, document, tokens,
            save: () => { for (const listener of [...saveListeners]) {listener(document);} },
            editProse: (next: string) => { prose = next; fire(); },
            editDiagram: (next: string) => { label = next; fire(); },
        };
    }

    function pauseNextLayout(): { release: () => void; restore: () => void; calls: () => number } {
        const engine = dagreLayoutEngine as unknown as { layout: (...args: unknown[]) => Promise<unknown> };
        const original = engine.layout;
        let release!: () => void;
        const paused = new Promise<void>(resolve => { release = resolve; });
        let calls = 0;
        engine.layout = async function (this: unknown, ...args: unknown[]) {
            calls++;
            if (calls === 1) {await paused;}
            return original.apply(dagreLayoutEngine, args);
        };
        return { release, restore: () => { engine.layout = original; }, calls: () => calls };
    }

    it('fence: a declined render for an edit outside the fence leaves the draft saveable at the current version', async () => {
        const { panel, document, tokens, editProse } = await open('fence');
        const shown = tokens()[0];
        const revision = panel.currentLayoutSnapshot!.revision;
        editProse('Edited while clean.');              // auto render posted, marked, at revision 2
        await settle();
        assert.strictEqual(tokens().length, 2);
        assert.strictEqual(panel.currentLayoutSnapshot!.revision, String(document.version), 'posted: the host computed revision 2');
        // The client had staged an edit before the host heard of it: it declines, still showing the opening render.
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: shown });
        assert.strictEqual(panel.currentLayoutSnapshot!.revision, revision, 'the snapshot is what the webview shows');
        assert.strictEqual(panel.inConflictState, false, 'the fence body is unchanged');
        assert.strictEqual(panel.writebackRevision({ revision }, document), String(document.version), 'Save of the draft translates and lands');
    });

    for (const kind of ['standalone', 'fence'] as const) {
        it(`${kind}: a declined render for a real diagram change opens the conflict instead of leaving Save to fail`, async () => {
            const { panel, posted, tokens, editDiagram } = await open(kind);
            const shown = tokens()[0];
            editDiagram('Shop');
            await settle();
            assert.strictEqual(tokens().length, 2);
            await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: shown });
            assert.strictEqual(panel.inConflictState, true, 'the draft was made against the older canvas');
            assert.ok(posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
            assert.strictEqual(panel.currentLayoutSnapshot, undefined, 'Save is refused until the conflict is resolved');
        });

        it(`${kind}: a declined render after a text save restores the shown state; Save lands`, async () => {
            const { panel, document, tokens, save } = await open(kind);
            const shown = tokens()[0];
            const revision = panel.currentLayoutSnapshot!.revision;
            save();
            await settle();
            await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: shown });
            assert.strictEqual(panel.currentLayoutSnapshot!.revision, revision);
            assert.strictEqual(panel.writebackRevision({ revision }, document), String(document.version));
            assert.strictEqual(panel.inConflictState, false);
        });
    }

    it('fence: a stale completion keeps the snapshot and the carry retained for Save', async () => {
        const { panel, document, tokens, save, editProse } = await open('fence');
        const revision = panel.currentLayoutSnapshot!.revision;
        const pause = pauseNextLayout();
        try {
            save();                                     // automatic render starts while clean
            await settle();
            assert.strictEqual(pause.calls(), 1, 'awaiting its layout');
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            editProse('Prose changed while the render was in flight.');
            assert.strictEqual(panel.writebackRevision({ revision }, document), String(document.version), 'the carry maps 1 to 2');
            pause.release();
            await settle();
        } finally {
            pause.restore();
        }
        assert.strictEqual(tokens().length, 1, 'nothing posted to the dirty preview');
        assert.ok(panel.currentLayoutSnapshot, 'the snapshot the webview shows is kept');
        assert.strictEqual(panel.currentLayoutSnapshot!.revision, revision);
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(panel.refreshGate.owed, 'source');
        assert.strictEqual(panel.writebackRevision({ revision }, document), String(document.version), 'Save still lands');
    });

    // Review round 3: a decline that cannot be matched to a recorded result.
    async function postedOutsideEdit() {
        const opened = await open('fence');
        opened.editProse('Edited while clean.');           // a marked render at revision 2
        await settle();
        assert.strictEqual(opened.tokens().length, 2);
        return opened;
    }
    function assertConflictKeepsDraft(panel: Panel, posted: Posted[]) {
        assert.strictEqual(panel.inConflictState, true, 'the conflict opens: the user chooses');
        const banner = posted.filter(m => m.type === 'visualLayout.externalChangeConflict').pop() as { reason?: string } | undefined;
        assert.strictEqual(banner?.reason, UNMATCHED_DECLINE_REASON);
        assert.strictEqual(panel.refreshGate.owed, 'source', 'a source debt, as other conflict entries record');
        assert.strictEqual(panel.currentLayoutSnapshot, undefined, 'Save is disabled by the conflict, not refused later');
        assert.strictEqual(posted.filter(m => m.type === 'render').length, 2, 'no render replaces the draft');
    }
    for (const [name, message] of [
        ['omitted', { type: 'visualLayout.refreshDeclined' }],
        ['unknown', { type: 'visualLayout.refreshDeclined', shownRenderToken: 4242 }],
    ] as const) {
        it(`fence: a decline with an ${name} token after a marked render opens the conflict; the draft is kept`, async () => {
            const { panel, posted } = await postedOutsideEdit();
            await panel.handleWebviewMessage(message);
            assertConflictKeepsDraft(panel, posted);
        });
    }

    it('fence: a decline naming an evicted token opens the conflict; the floor is never evicted', async () => {
        const { panel, posted, tokens } = await open('fence');
        const floor = tokens()[0];
        const render = (panel as unknown as { render(cause: string): Promise<void> });
        for (let i = 0; i < 20; i++) {
            await render.render('theme');                   // 20 marked results, beyond the 16 kept
        }
        const states = (panel as unknown as { shownStates: Map<number, unknown> }).shownStates;
        assert.ok(states.has(floor), 'the newest result known shown is kept whatever its age');
        assert.ok(!states.has(floor + 1), 'an old marked result is evicted');
        assert.ok(states.size <= 17);

        // The floor still restores without a conflict.
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: floor });
        assert.strictEqual(panel.inConflictState, false);
        assert.ok(panel.currentLayoutSnapshot);

        // An evicted token cannot be matched: fail safe.
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: floor + 1 });
        assert.strictEqual(panel.inConflictState, true);
        assert.strictEqual(posted.filter(m => m.type === 'render').length, 21);
    });

    it('dispose and a document switch forget the recorded results', async () => {
        const { panel } = await open('standalone');
        const internals = panel as unknown as { shownStates: Map<number, unknown>; context: unknown; panel: { dispose?: () => void }; dispose(): void; tryUpdateActiveDocument(): void; scheduleRender(): void };
        assert.ok(internals.shownStates.size > 0);
        const other = { uri: { toString: () => 'file:///other.c4x', fsPath: '/other' }, getText: () => 'graph TB\n    A[A<br/>Person]\n', version: 1, languageId: 'c4x', fileName: 'other.c4x' };
        const previousEditor = windowMock.activeTextEditor;
        windowMock.activeTextEditor = { document: other };
        try {
            internals.tryUpdateActiveDocument();
        } finally {
            windowMock.activeTextEditor = previousEditor;
        }
        assert.strictEqual(internals.shownStates.size, 0, 'document switch');
        await settle(200);
        assert.ok(internals.shownStates.size > 0, 'the new document recorded its render');
        internals.context = { workspaceState: { get: () => undefined, update: async () => undefined, keys: () => [] } };
        internals.panel.dispose = () => undefined;
        internals.dispose();
        assert.strictEqual(internals.shownStates.size, 0, 'dispose');
    });

    // Review round 4: unmatched decline, conflict, Rebase, then Save. The host
    // refuses (layout_unavailable) and then does nothing more: the panel stays
    // dirty, the debt stays owed, nothing is scheduled, a second Save is
    // refused again, and Discard repays with exactly one render. The client
    // keeps the draft (test/playwright/refused-save-keeps-draft.spec.ts).
    for (const kind of ['standalone', 'fence'] as const) {
        for (const variant of ['omitted', 'unknown', 'evicted'] as const) {
            it(`${kind}, ${variant} token: decline, conflict, Rebase, refused Save leaves the panel dirty with nothing scheduled`, async () => {
                const opened = await open(kind);
                const { panel, posted, tokens } = opened;
                if (kind === 'fence') {opened.editProse('Edited while clean.');} else {opened.save();}
                await settle();
                assert.strictEqual(tokens().length, 2, 'a marked render was posted');
                let named: number | undefined;
                if (variant === 'unknown') {named = 4242;}
                if (variant === 'evicted') {
                    const render = panel as unknown as { render(cause: string): Promise<void> };
                    for (let i = 0; i < 20; i++) {await render.render('theme');}
                    named = tokens()[1];
                }
                await panel.handleWebviewMessage(named === undefined
                    ? { type: 'visualLayout.refreshDeclined' }
                    : { type: 'visualLayout.refreshDeclined', shownRenderToken: named });
                assert.strictEqual(panel.inConflictState, true);

                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase', stagedKeys: ['User'] });
                const ack = posted.filter(m => m.type === 'visualLayout.conflictActionAcknowledged').pop() as { action?: string } | undefined;
                assert.strictEqual(ack?.action, 'rebaseAccepted');
                assert.strictEqual(panel.inConflictState, false);

                const rendersBefore = tokens().length;
                for (let attempt = 1; attempt <= 2; attempt++) {
                    await panel.handleWebviewMessage({ type: 'visualLayout.applySemanticEdits', protocolVersion: 1, revision: '1', edits: [{ id: 'User', x: 333, y: 222 }] });
                    const refusal = posted.filter(m => m.type === 'visualLayout.rejected').pop() as { code?: string } | undefined;
                    assert.strictEqual(refusal?.code, 'layout_unavailable', `attempt ${attempt}`);
                    assert.strictEqual(posted.filter(m => m.type === 'visualLayout.rejected').length, attempt);
                }
                await settle();
                assert.strictEqual(tokens().length, rendersBefore, 'a refusal triggers no render');
                assert.strictEqual(panel.hasDirtyState, true, 'the panel stays dirty');
                assert.strictEqual(panel.refreshGate.owed, 'source', 'the debt stays owed');
                assert.strictEqual(panel.debounceTimer, undefined, 'nothing scheduled, so nothing can loop');

                // The client reports the kept draft dirty again (updateStagedChangesList): still nothing.
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                await settle();
                assert.strictEqual(tokens().length, rendersBefore);

                // Discard: exactly one render repays the debt.
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                await settle();
                assert.strictEqual(tokens().length, rendersBefore + 1);
                assert.strictEqual(panel.refreshGate.owed, 'none');
            });
        }
    }

    it('a render in flight when the panel is disposed posts and records nothing', async () => {
        const { panel, posted, save } = await open('fence');
        const internals = panel as unknown as { shownStates: Map<number, unknown>; context: unknown; panel: { dispose?: () => void }; dispose(): void };
        const pause = pauseNextLayout();
        try {
            save();
            await settle();
            assert.strictEqual(pause.calls(), 1, 'awaiting its layout');
            internals.context = { workspaceState: { get: () => undefined, update: async () => undefined, keys: () => [] } };
            internals.panel.dispose = () => undefined;
            const before = posted.length;
            internals.dispose();
            assert.strictEqual(internals.shownStates.size, 0);
            pause.release();
            await settle();
            assert.strictEqual(internals.shownStates.size, 0, 'no record after dispose');
            assert.strictEqual(posted.length, before, 'no post after dispose');
            assert.strictEqual(panel.debounceTimer, undefined);
        } finally {
            pause.restore();
        }
    });

    it('results carry a token, and a decline naming an unknown token changes nothing', async () => {
        const { panel, tokens } = await open('fence');
        assert.ok(Number.isInteger(tokens()[0]));
        const before = panel.currentLayoutSnapshot;
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: 99999 });
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined', shownRenderToken: 'x' });
        assert.strictEqual(panel.currentLayoutSnapshot, before);
    });
});

describe('PreviewPanel routes text saves and changes through decideSourceEvent (#439)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');

    it('both listeners call handleSourceEvent and schedule nothing themselves', () => {
        const saveListener = /onDidSaveTextDocument\(\(document\) => \{([\s\S]*?)\n {12}\}\),/.exec(src);
        assert.ok(saveListener && saveListener[1].includes('this.handleSourceEvent(document') && !saveListener[1].includes('scheduleRender'));
        const changeListener = /onDidChangeTextDocument\(\(event\) => \{([\s\S]*?)\n {12}\}\),/.exec(src);
        assert.ok(changeListener && changeListener[1].includes('this.handleSourceEvent(event.document') && !changeListener[1].includes('scheduleRender'));
    });

    it('the writeback is checked against writebackRevision', () => {
        assert.ok(/executeWritebackTransaction\(writebackDoc, writebackMessage,/.test(src));
    });
});
