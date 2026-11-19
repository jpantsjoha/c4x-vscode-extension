/**
 * A theme change must not re-render a preview that holds unsaved staged edits
 * (#408): every render clears the webview's staged draft, so the host defers a
 * theme-triggered render while the webview reports dirty and applies it once
 * the draft is saved or discarded.
 *
 * The decision itself is a pure gate; the panel tests drive the real
 * PreviewPanel listeners, message handler, debounce timer and render entry
 * point on a prototype instance (no native webview), and count what reaches
 * the webview.
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
import { PreviewPanel } from '../../webview/PreviewPanel';
import { decideFire, decideRenderCompletion, NonSourceRenderGate, strongerCause } from '../../webview/nonSourceRenderGate';
import * as sidecar from '../../writeback/SidecarPersistence';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';
Module._resolveFilename = originalResolveFilename;

const DEBOUNCE_SETTLE_MS = 160;
const settle = (ms = DEBOUNCE_SETTLE_MS) => new Promise(resolve => setTimeout(resolve, ms));

describe('render gate state table (#408)', () => {
    const blockedStates = [
        { dirty: false, conflict: false, blocked: false },
        { dirty: true, conflict: false, blocked: true },
        { dirty: false, conflict: true, blocked: true },
        { dirty: true, conflict: true, blocked: true },
    ];

    describe('timer fires', () => {
        for (const state of blockedStates) {
            const label = `D=${state.dirty} C=${state.conflict}`;
            it(`${label}: a source render always posts`, () => {
                assert.strictEqual(decideFire('source', state.dirty, state.conflict), 'post');
            });
            for (const cause of ['theme', 'retry'] as const) {
                it(`${label}: a ${cause} render ${state.blocked ? 'is held' : 'posts marked'}`, () => {
                    assert.strictEqual(decideFire(cause, state.dirty, state.conflict), state.blocked ? 'hold' : 'post-marked');
                });
            }
        }
    });

    describe('render finishes', () => {
        const causes = ['source', 'retry', 'theme'] as const;
        for (const state of blockedStates) {
            for (const cause of causes) {
                const label = `D=${state.dirty} C=${state.conflict} ${cause}`;
                it(`${label}: conflict began during it -> ${state.blocked ? 'hold' : 'retry'}`, () => {
                    assert.strictEqual(decideRenderCompletion({ stale: true, conflictBegan: true, dirty: state.dirty, conflict: state.conflict, cause }), state.blocked ? 'hold' : 'retry');
                    assert.strictEqual(decideRenderCompletion({ stale: false, conflictBegan: true, dirty: state.dirty, conflict: state.conflict, cause }), state.blocked ? 'hold' : 'retry');
                });
                it(`${label}: document changed -> retry`, () => {
                    assert.strictEqual(decideRenderCompletion({ stale: true, conflictBegan: false, dirty: state.dirty, conflict: state.conflict, cause }), 'retry');
                });
                const expected = cause !== 'source' && state.blocked ? 'hold' : 'post';
                it(`${label}: current -> ${expected}`, () => {
                    assert.strictEqual(decideRenderCompletion({ stale: false, conflictBegan: false, dirty: state.dirty, conflict: state.conflict, cause }), expected);
                });
            }
        }
    });

    it('source beats retry beats theme', () => {
        assert.strictEqual(strongerCause('theme', 'retry'), 'retry');
        assert.strictEqual(strongerCause('retry', 'source'), 'source');
        assert.strictEqual(strongerCause('source', 'theme'), 'source');
        assert.strictEqual(strongerCause('theme', 'theme'), 'theme');
    });

    describe('NonSourceRenderGate', () => {
        it('a theme request schedules when not blocked and owes a theme render when blocked', () => {
            const gate = new NonSourceRenderGate();
            assert.strictEqual(gate.request(false), 'schedule');
            assert.strictEqual(gate.owed, 'none');
            assert.strictEqual(gate.request(true), 'defer');
            assert.strictEqual(gate.owed, 'theme');
            assert.strictEqual(gate.isPending, true);
        });

        it('a clean report schedules the owed render once, with a cause matching the debt', () => {
            const gate = new NonSourceRenderGate();
            assert.strictEqual(gate.dirtyChanged(false), undefined, 'nothing owed');
            gate.owe('theme');
            assert.strictEqual(gate.dirtyChanged(true), undefined, 'still dirty');
            assert.strictEqual(gate.dirtyChanged(false), 'theme');
            gate.owe('retry');
            assert.strictEqual(gate.owed, 'source', 'a retry debt is a source debt');
            assert.strictEqual(gate.dirtyChanged(false), 'retry');
            gate.rendered();
            assert.strictEqual(gate.dirtyChanged(false), undefined, 'a posted render pays the debt');
        });

        it('never downgrades a source debt to theme', () => {
            const gate = new NonSourceRenderGate();
            gate.held('source');
            gate.declined();
            gate.request(true);
            assert.strictEqual(gate.owed, 'source');
        });

        it('merges scheduled causes and owes a held one', () => {
            const gate = new NonSourceRenderGate();
            gate.scheduled('theme');
            gate.scheduled('retry');
            assert.deepStrictEqual(gate.fire(true, false), { decision: 'hold', cause: 'retry' });
            assert.strictEqual(gate.owed, 'source');
            gate.scheduled('theme');
            gate.scheduled('source');
            assert.deepStrictEqual(gate.fire(true, true), { decision: 'post', cause: 'source' });
            gate.scheduled('theme');
            assert.deepStrictEqual(gate.fire(false, false), { decision: 'post-marked', cause: 'theme' });
            assert.deepStrictEqual(gate.fire(true, false), { decision: 'post', cause: 'source' }, 'a fire with nothing scheduled is an ordinary render');
        });

        it('a render outside the timer supersedes a non-source timer, keeping it owed until posted', () => {
            const gate = new NonSourceRenderGate();
            assert.strictEqual(gate.supersedeScheduled(), false, 'nothing scheduled');
            gate.scheduled('retry');
            assert.strictEqual(gate.supersedeScheduled(), true);
            assert.strictEqual(gate.owed, 'source');
            gate.rendered();
            assert.strictEqual(gate.owed, 'none');
            gate.scheduled('source');
            assert.strictEqual(gate.supersedeScheduled(), false, 'a source timer is kept');
        });

        it('forgets everything on reset', () => {
            const gate = new NonSourceRenderGate();
            gate.owe('retry');
            gate.scheduled('theme');
            gate.reset();
            assert.strictEqual(gate.owed, 'none');
            assert.deepStrictEqual(gate.fire(true, false), { decision: 'post', cause: 'source' });
        });
    });
});

interface GatedPanel {
    disposables: { dispose(): void }[];
    hasDirtyState: boolean;
    inConflictState: boolean;
    activeDocument: unknown;
    refreshGate: NonSourceRenderGate;
    debounceTimer: NodeJS.Timeout | undefined;
    panel: { webview: { postMessage(message: unknown): Thenable<boolean> }; dispose?: () => void };
    context?: unknown;
    disposed?: boolean;
    log(line: string): void;
    dispose(): void;
    registerEventListeners(): void;
    handleWebviewMessage(message: unknown): Promise<void>;
}

describe('PreviewPanel defers theme-triggered renders while staged edits are unsaved (#408)', () => {
    type Listener = (...args: unknown[]) => void;
    const windowMock = vscodeMock.window as unknown as Record<string, unknown>;
    const workspaceMock = vscodeMock.workspace as unknown as Record<string, unknown>;
    let colorThemeListeners: Listener[];
    let textChangeListeners: Listener[];
    let saveListeners: Listener[];
    let saved: Record<string, unknown>;
    let panels: GatedPanel[];

    const capture = (sink: Listener[]) => (listener: Listener) => {
        sink.push(listener);
        return { dispose: () => { sink.splice(sink.indexOf(listener), 1); } };
    };
    const inert = () => ({ dispose: () => undefined });

    beforeEach(() => {
        colorThemeListeners = [];
        textChangeListeners = [];
        saveListeners = [];
        panels = [];
        saved = {
            onDidChangeActiveColorTheme: windowMock.onDidChangeActiveColorTheme,
            onDidChangeActiveTextEditor: windowMock.onDidChangeActiveTextEditor,
            onDidSaveTextDocument: workspaceMock.onDidSaveTextDocument,
            onDidChangeTextDocument: workspaceMock.onDidChangeTextDocument,
        };
        windowMock.onDidChangeActiveColorTheme = capture(colorThemeListeners);
        windowMock.onDidChangeActiveTextEditor = inert;
        workspaceMock.onDidSaveTextDocument = capture(saveListeners);
        workspaceMock.onDidChangeTextDocument = capture(textChangeListeners);
    });

    afterEach(() => {
        for (const panel of panels) {
            if (panel.debounceTimer) {clearTimeout(panel.debounceTimer);}
            while (panel.disposables.length) {panel.disposables.pop()?.dispose();}
        }
        windowMock.onDidChangeActiveColorTheme = saved.onDidChangeActiveColorTheme;
        windowMock.onDidChangeActiveTextEditor = saved.onDidChangeActiveTextEditor;
        workspaceMock.onDidSaveTextDocument = saved.onDidSaveTextDocument;
        workspaceMock.onDidChangeTextDocument = saved.onDidChangeTextDocument;
    });

    /**
     * A panel with no bound document: the real render() then posts one
     * `error` message, which stands in for "a render reached the webview".
     */
    function makePanel(): { panel: GatedPanel; posted: { type?: string }[] } {
        const panel = Object.create(PreviewPanel.prototype) as GatedPanel;
        const posted: { type?: string }[] = [];
        panel.disposables = [];
        panel.hasDirtyState = false;
        panel.inConflictState = false;
        panel.activeDocument = undefined;
        panel.refreshGate = new NonSourceRenderGate();
        (panel as unknown as { conflictEpoch: number }).conflictEpoch = 0;
        panel.log = () => undefined;
        panel.panel = { webview: { postMessage: (message: unknown) => { posted.push(message as { type?: string }); return Promise.resolve(true); } } };
        panel.registerEventListeners();
        panels.push(panel);
        return { panel, posted };
    }

    const renders = (posted: { type?: string }[]) => posted.filter(m => m.type === 'render' || m.type === 'error').length;
    const fireColorTheme = () => { for (const listener of [...colorThemeListeners]) {listener({ kind: 2 });} };
    const fireThemeSetting = () => vscodeMock.fireConfigurationChangeForTests('c4x.theme');

    for (const [name, fire] of [['colour-theme change', fireColorTheme], ['c4x.theme setting change', fireThemeSetting]] as const) {
        it(`${name}: renders at once when the preview is clean`, async () => {
            const { posted } = makePanel();
            fire();
            await settle();
            assert.strictEqual(renders(posted), 1);
        });

        it(`${name}: sends no render while dirty, then exactly one when the draft clears`, async () => {
            const { panel, posted } = makePanel();
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            fire();
            await settle();
            assert.strictEqual(renders(posted), 0, 'a render now would discard the staged draft');
            assert.strictEqual(panel.refreshGate.isPending, true);
            assert.ok(posted.some(m => m.type === 'visualLayout.refreshDeferred'), 'the preview is told the theme change waits');

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders(posted), 1, 'the deferred theme render runs once the draft is saved or discarded');
            assert.strictEqual(panel.refreshGate.isPending, false);

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders(posted), 1, 'a second clean report does not render again');
        });
    }

    // Layout mode (#340 review round 3): entering edit mode re-lays a diagram with
    // grown boxes out at the standard sizes, through the same gate as a theme change.
    describe('layout mode (#340)', () => {
        // makePanel builds the panel without its constructor, so set the fields it initialises.
        const setGrown = (panel: GatedPanel, grown: boolean) => {
            Object.assign(panel as unknown as Record<string, unknown>, { lastRenderTextGrown: grown, layoutMode: 'view' });
        };
        const modeOf = (panel: GatedPanel) => (panel as unknown as { layoutMode: string }).layoutMode;

        it('entering edit mode on a clean preview with grown boxes renders once, in edit mode; leaving renders again', async () => {
            const { panel, posted } = makePanel();
            setGrown(panel, true);
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
            await settle();
            assert.strictEqual(modeOf(panel), 'edit');
            assert.strictEqual(renders(posted), 1);
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
            await settle();
            assert.strictEqual(renders(posted), 1, 'the same mode again does not render');
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'view' });
            await settle();
            assert.strictEqual(modeOf(panel), 'view');
            assert.strictEqual(renders(posted), 2);
        });

        it('does not render when the view-mode layout grew nothing (the two layouts are the same)', async () => {
            const { panel, posted } = makePanel();
            setGrown(panel, false);
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
            await settle();
            assert.strictEqual(modeOf(panel), 'edit');
            assert.strictEqual(renders(posted), 0);
        });

        it('holds the mode render while the webview holds a draft, and renders once it is clean', async () => {
            const { panel, posted } = makePanel();
            setGrown(panel, true);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
            await settle();
            assert.strictEqual(renders(posted), 0, 'a render now would discard the staged draft');
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders(posted), 1);
        });

        it('ignores a malformed layout-mode message', async () => {
            const { panel, posted } = makePanel();
            setGrown(panel, true);
            await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit-ish' });
            await settle();
            assert.strictEqual(modeOf(panel), 'view');
            assert.strictEqual(renders(posted), 0);
        });

        it('lays out in the reported mode: standard sizes in edit mode, exports always in view mode', () => {
            const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');
            assert.ok(src.includes("const growText = layoutMode !== 'edit';"));
            assert.ok(src.includes('layoutBounded(view, { theme, growText }, abort.signal)'));
            assert.ok(src.includes('layoutBounded(view, { theme: exportTheme }, abort.signal)'));
        });
    });

    it('coalesces several theme events while dirty into one render', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();
        fireThemeSetting();
        fireColorTheme();
        await settle();
        assert.strictEqual(renders(posted), 0);
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await settle();
        assert.strictEqual(renders(posted), 1);
    });

    it('defers a theme render whose debounce fires after staged edits appeared', async () => {
        const { panel, posted } = makePanel();
        fireColorTheme();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        await settle();
        assert.strictEqual(renders(posted), 0);
        assert.strictEqual(panel.refreshGate.isPending, true);
    });

    it('Refresh Preview defers the same way while dirty', async () => {
        const { panel, posted } = makePanel();
        const statics = PreviewPanel as unknown as { instance: unknown };
        const previous = statics.instance;
        statics.instance = panel;
        try {
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            assert.strictEqual(PreviewPanel.refresh(), true);
            await settle();
            assert.strictEqual(renders(posted), 0);
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders(posted), 1);
        } finally {
            statics.instance = previous;
        }
    });

    it('coalesces two theme events on a clean preview into one render', async () => {
        const { posted } = makePanel();
        fireColorTheme();
        fireThemeSetting();
        await settle();
        assert.strictEqual(renders(posted), 1);
    });

    it('applies the deferred theme render when a clean report also ends a conflict', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        panel.inConflictState = true;
        fireThemeSetting();
        await settle();
        assert.strictEqual(renders(posted), 0);
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await settle();
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(renders(posted), 1);
    });

    it('forgets a deferred theme render and cancels a queued one on dispose', async () => {
        const deferred = makePanel();
        const queued = makePanel();
        const memento = { get: () => undefined, update: async () => undefined, keys: () => [] };
        for (const { panel } of [deferred, queued]) {
            panel.context = { workspaceState: memento };
            panel.panel.dispose = () => undefined;
        }
        await deferred.panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();
        assert.strictEqual(deferred.panel.refreshGate.isPending, true);
        assert.ok(queued.panel.debounceTimer, 'the clean panel queued its render');

        deferred.panel.dispose();
        queued.panel.dispose();
        queued.panel.dispose(); // idempotent
        await settle();

        assert.strictEqual(deferred.panel.refreshGate.isPending, false);
        assert.strictEqual(renders(deferred.posted), 0);
        assert.strictEqual(renders(queued.posted), 0, 'a disposed panel renders nothing');
    });

    it('a webview reload render carries the deferred theme change', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();
        assert.strictEqual(panel.refreshGate.isPending, true);
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle(20);
        assert.strictEqual(renders(posted), 1);
        assert.strictEqual(panel.refreshGate.isPending, false, 'nothing left to apply after Save or Discard');
    });

    it('does not defer a source-change render while dirty', async () => {
        const { panel, posted } = makePanel();
        const document = { uri: { toString: () => 'file:///gate.c4x' }, getText: () => '', languageId: 'c4x', fileName: 'gate.c4x' };
        panel.activeDocument = document;
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();
        for (const listener of [...textChangeListeners]) {listener({ document });}
        await settle(320);
        assert.strictEqual(renders(posted), 1, 'the source change renders as before; the theme change rides along');
        assert.strictEqual(panel.refreshGate.isPending, false);
    });

    it('keeps conflict handling for a source change while a theme change waits', async () => {
        const { panel, posted } = makePanel();
        let text = 'graph TB\n  A[A<br/>Person]\n';
        const document = { uri: { toString: () => 'file:///gate.c4x' }, getText: () => text, version: 1, languageId: 'c4x', fileName: 'gate.c4x' };
        const internals = panel as unknown as { activeSaveAnchor: unknown; captureDocumentAnchor(doc: unknown): unknown };
        panel.activeDocument = document;
        internals.activeSaveAnchor = internals.captureDocumentAnchor(document);
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();

        const other = { uri: { toString: () => 'file:///other.c4x' }, getText: () => '' };
        for (const listener of [...textChangeListeners]) {listener({ document: other });}
        text = 'graph TB\n  B[B<br/>Person]\n';
        for (const listener of [...textChangeListeners]) {listener({ document });}
        await settle(320);

        assert.strictEqual(panel.inConflictState, true, 'the changed anchored block enters the conflict state');
        assert.ok(posted.some(m => m.type === 'visualLayout.externalChangeConflict'));
        assert.strictEqual(renders(posted), 0, 'neither the source change nor the theme change discards the draft');
        assert.strictEqual(panel.refreshGate.isPending, true);

        for (const listener of [...textChangeListeners]) {listener({ document });}
        await settle(320);
        assert.strictEqual(renders(posted), 0, 'a further change during the conflict still renders nothing');
    });

    it('Reload and discard from the conflict banner renders once and applies the waiting theme change', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        panel.inConflictState = true;
        fireColorTheme();
        await settle();
        assert.strictEqual(renders(posted), 0);

        // View diff and Rebase keep the draft, so the theme change keeps waiting.
        await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'viewDiff' });
        await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase' });
        await settle();
        assert.strictEqual(renders(posted), 0);
        assert.strictEqual(panel.refreshGate.isPending, true);

        await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'reloadAndDiscard' });
        await settle();
        assert.strictEqual(renders(posted), 1);
        assert.strictEqual(panel.refreshGate.isPending, false);
        assert.strictEqual(panel.hasDirtyState, false);
        assert.strictEqual(panel.inConflictState, false);
    });

    it('a refresh the webview declined is re-sent once after the draft is clean', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined' });
        assert.strictEqual(panel.hasDirtyState, true);
        assert.strictEqual(panel.refreshGate.isPending, true);
        fireColorTheme();
        await settle();
        assert.strictEqual(renders(posted), 0);
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await settle();
        assert.strictEqual(renders(posted), 1);
    });

    it('a refused Save (clean report, then ready) renders once with the waiting theme', async () => {
        const { panel, posted } = makePanel();
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireThemeSetting();
        await settle();
        // The client's rejection handler: discard the draft, report clean, ask for a render.
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle();
        assert.strictEqual(renders(posted), 1, 'the ready render supersedes the queued theme render');
        assert.strictEqual(panel.refreshGate.isPending, false);
    });

    it('accepted Rebase keeps a waiting theme change waiting; a refused Save then renders once', async () => {
        const { panel, posted } = makePanel();
        const document = { uri: { toString: () => 'file:///rebase.puml' }, getText: () => '@startuml\nPerson(a, "A")\n@enduml\n', version: 2, languageId: 'plantuml', fileName: 'rebase.puml' };
        panel.activeDocument = document;
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        panel.inConflictState = true;
        fireColorTheme();
        await settle();

        await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase', stagedKeys: ['A'] });
        await settle();
        const ack = posted.find(m => m.type === 'visualLayout.conflictActionAcknowledged') as { action?: string } | undefined;
        assert.strictEqual(ack?.action, 'rebaseAccepted');
        assert.strictEqual(panel.inConflictState, false);
        assert.strictEqual(renders(posted), 0, 'Rebase keeps the draft, so nothing renders');
        assert.strictEqual(panel.refreshGate.isPending, true);

        // Save is refused; the client discards the draft, reports clean and posts ready.
        // (Unbind the document so render() takes its short path in the unit tier.)
        panel.activeDocument = undefined;
        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle();
        assert.strictEqual(renders(posted), 1, 'one render, with the current theme');
        assert.strictEqual(panel.refreshGate.isPending, false);
    });

    it('a theme render paused in the sidecar read cannot discard a draft that entered conflict meanwhile', async () => {
        // The review sequence: sidecar persistence (PlantUML); a theme render
        // starts while clean and pauses reading the sidecar; the user stages
        // an edit; the source changes and the panel enters conflict; the
        // render then finishes on a stale version.
        const { panel, posted } = makePanel();
        const internals = panel as unknown as {
            activeSaveAnchor: unknown;
            captureDocumentAnchor(doc: unknown): unknown;
            getWorkspaceName(doc: unknown): string;
        };
        let text = '@startuml\nPerson(user, "User")\nSystem(bank, "Bank")\nRel(user, bank, "Uses")\n@enduml\n';
        const document = {
            uri: { toString: () => 'file:///pause.puml', fsPath: '/pause.puml' },
            getText: () => text,
            version: 1,
            languageId: 'plantuml',
            fileName: 'pause.puml',
        };
        panel.activeDocument = document;
        internals.getWorkspaceName = () => 'pause';
        internals.activeSaveAnchor = internals.captureDocumentAnchor(document);

        const sidecarModule = sidecar as unknown as { applySidecarLayoutOverrides: (...args: unknown[]) => Promise<void> };
        const original = sidecarModule.applySidecarLayoutOverrides;
        let release!: () => void;
        const paused = new Promise<void>(resolve => { release = resolve; });
        let sidecarCalls = 0;
        sidecarModule.applySidecarLayoutOverrides = async () => {
            sidecarCalls++;
            if (sidecarCalls === 1) {await paused;}
        };
        try {
            fireColorTheme();
            await settle();
            assert.strictEqual(sidecarCalls, 1, 'the theme render is paused in the sidecar read');

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            text = text.replace('"Bank"', '"Bank Ltd"');
            document.version = 2;
            for (const listener of [...textChangeListeners]) {listener({ document });}
            assert.strictEqual(panel.inConflictState, true, 'the source change entered conflict');

            release();
            await settle(700);

            assert.strictEqual(posted.filter(m => m.type === 'render').length, 0, 'no render reaches the webview: the draft and conflict banner stay');
            assert.strictEqual(panel.inConflictState, true);
            assert.strictEqual(panel.refreshGate.isPending, true, 'the theme change applies after the conflict is resolved');
        } finally {
            sidecarModule.applySidecarLayoutOverrides = original;
        }
    });

    it('a stale theme render retries as a theme render and is held while dirty', async () => {
        const { panel, posted } = makePanel();
        const internals = panel as unknown as { getWorkspaceName(doc: unknown): string };
        let text = '@startuml\nPerson(user, "User")\n@enduml\n';
        const document = { uri: { toString: () => 'file:///retry.puml', fsPath: '/retry.puml' }, getText: () => text, version: 1, languageId: 'plantuml', fileName: 'retry.puml' };
        panel.activeDocument = document;
        internals.getWorkspaceName = () => 'retry';
        const sidecarModule = sidecar as unknown as { applySidecarLayoutOverrides: (...args: unknown[]) => Promise<void> };
        const original = sidecarModule.applySidecarLayoutOverrides;
        let release!: () => void;
        const paused = new Promise<void>(resolve => { release = resolve; });
        let calls = 0;
        sidecarModule.applySidecarLayoutOverrides = async () => { calls++; if (calls === 1) {await paused;} };
        try {
            fireThemeSetting();
            await settle();
            // Staged edits arrive and the source changes without touching an anchor (no conflict).
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            text = text.replace('"User"', '"Customer"');
            document.version = 2;
            release();
            await settle(400);
            assert.strictEqual(posted.filter(m => m.type === 'render').length, 0, 'the retry is still a theme render, so the gate holds it while dirty');
            assert.strictEqual(panel.refreshGate.isPending, true);

            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle(400);
            const sent = posted.filter(m => m.type === 'render') as { refresh?: boolean }[];
            assert.strictEqual(sent.length, 1);
            assert.strictEqual(sent[0].refresh, true, 'still marked theme-only, so the webview can decline it');
        } finally {
            sidecarModule.applySidecarLayoutOverrides = original;
        }
    });

    /**
     * Review round 2: a SOURCE render that is still awaiting its layout when
     * the user stages an edit and the source then changes. Driven for the
     * standalone preview and the Markdown fence editor alike, with the first
     * layout call paused.
     */
    describe('a source render overtaken by a draft and a conflict', () => {
        type Kind = 'standalone' | 'fence';
        interface Doc { uri: { toString(): string; fsPath: string }; getText(): string; version: number; languageId: string; fileName: string }

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

        function setUp(kind: Kind) {
            const made = makePanel();
            const body = (label: string) => `graph TB\n    User[User<br/>Person]\n    App[${label}<br/>Software System]\n    User -->|Uses| App\n`;
            let label = 'App';
            const text = () => kind === 'fence'
                ? `# Notes\n\n\`\`\`c4x\n${body(label)}\`\`\`\n`
                : body(label);
            const document: Doc = {
                uri: { toString: () => `file:///overtaken.${kind === 'fence' ? 'md' : 'c4x'}`, fsPath: '/overtaken' },
                getText: text,
                version: 1,
                languageId: kind === 'fence' ? 'markdown' : 'c4x',
                fileName: kind === 'fence' ? 'overtaken.md' : 'overtaken.c4x',
            };
            const internals = made.panel as unknown as {
                activeSaveAnchor: unknown;
                markdownBlock: unknown;
                currentLayoutSnapshot: unknown;
                captureDocumentAnchor(doc: unknown): unknown;
                captureMarkdownBlockAnchor(doc: unknown, ordinal: number): unknown;
                getWorkspaceName(doc: unknown): string;
            };
            made.panel.activeDocument = document;
            internals.getWorkspaceName = () => 'overtaken';
            if (kind === 'fence') {
                internals.markdownBlock = { document, blockOrdinal: 0 };
                internals.activeSaveAnchor = internals.captureMarkdownBlockAnchor(document, 0);
            } else {
                internals.activeSaveAnchor = internals.captureDocumentAnchor(document);
            }
            const edit = (next: string) => {
                label = next;
                document.version++;
                for (const listener of [...textChangeListeners]) {listener({ document });}
            };
            return { ...made, document, internals, edit };
        }

        for (const kind of ['standalone', 'fence'] as const) {
            it(`${kind}: a render dropped because a conflict began is owed and runs after an ordinary Discard`, async () => {
                const pause = pauseFirstLayout();
                try {
                    const { panel, posted, internals, edit } = setUp(kind);
                    edit('Shop');                       // source render scheduled while clean
                    await settle(320);
                    assert.strictEqual(pause.calls(), 1, 'the source render is awaiting its layout');
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                    edit('Shop Ltd');                   // changes the anchored block under the draft
                    assert.strictEqual(panel.inConflictState, true);

                    pause.release();
                    await settle(320);
                    assert.strictEqual(posted.filter(m => m.type === 'render').length, 0, 'the draft and conflict banner stay');
                    assert.strictEqual(panel.refreshGate.owed, 'source', 'the dropped render is owed');

                    // Ordinary Discard: the client reports clean.
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                    await settle(320);
                    const sent = posted.filter(m => m.type === 'render') as { refresh?: boolean }[];
                    assert.strictEqual(sent.length, 1, 'the current source is rendered after Discard');
                    assert.strictEqual(panel.refreshGate.owed, 'none');
                    assert.ok(internals.currentLayoutSnapshot, 'a current layout exists again');
                } finally {
                    pause.restore();
                }
            });

            it(`${kind}: an accepted Rebase keeps the draft against a render that finishes afterwards`, async () => {
                const pause = pauseFirstLayout();
                try {
                    const { panel, posted, edit } = setUp(kind);
                    edit('Shop');
                    await settle(320);
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                    edit('Shop Ltd');
                    assert.strictEqual(panel.inConflictState, true);
                    await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase', stagedKeys: [] });
                    const ack = posted.find(m => m.type === 'visualLayout.conflictActionAcknowledged') as { action?: string } | undefined;
                    assert.strictEqual(ack?.action, 'rebaseAccepted');
                    assert.strictEqual(panel.inConflictState, false);

                    pause.release();
                    await settle(320);
                    assert.strictEqual(posted.filter(m => m.type === 'render').length, 0, 'the old render must not clear the rebased draft');
                    assert.strictEqual(panel.hasDirtyState, true);
                    assert.strictEqual(panel.refreshGate.owed, 'source');

                    // Save is refused (no current layout, per the Rebase notice): the
                    // client discards, reports clean and posts ready. One render.
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                    await panel.handleWebviewMessage({ type: 'ready' });
                    await settle(320);
                    assert.strictEqual(posted.filter(m => m.type === 'render').length, 1);
                    assert.strictEqual(panel.refreshGate.owed, 'none');
                } finally {
                    pause.restore();
                }
            });
        }

        // Round 3: blocked states entered through their REAL entry paths,
        // then left through each exit, must render the current source.
        type Entry = 'conflict opened by a source change' | 'dirty, then a theme change' | 'a declined render';
        const entries: Entry[] = ['conflict opened by a source change', 'dirty, then a theme change', 'a declined render'];
        const exits: [string, (panel: GatedPanel) => Promise<void>][] = [
            ['Discard', async panel => { await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false }); }],
            ['Save (batch accepted, client reports clean)', async panel => { await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false }); }],
            ['Reload and discard', async panel => {
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'reloadAndDiscard' });
            }],
            ['Rebase accepted, then a refused Save', async panel => {
                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase', stagedKeys: [] });
                assert.ok(panel.hasDirtyState && panel.refreshGate.isPending, 'still blocked after Rebase, with the debt kept');
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                await panel.handleWebviewMessage({ type: 'ready' });
            }],
            ['View diff, then Discard', async panel => {
                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'viewDiff' });
                assert.ok(panel.refreshGate.isPending, 'View diff keeps the debt');
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            }],
        ];
        for (const kind of ['standalone', 'fence'] as const) {
            for (const entry of entries) {
                for (const [exitName, exit] of exits) {
                    it(`${kind}: ${entry}, then ${exitName}: the current picture is rendered`, async () => {
                        const { panel, posted, internals, edit } = setUp(kind);
                        await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                        if (entry === 'conflict opened by a source change') {
                            edit('Shop Ltd');
                            assert.strictEqual(panel.inConflictState, true);
                            assert.strictEqual(panel.refreshGate.owed, 'source', 'opening the conflict records the source debt');
                        } else if (entry === 'dirty, then a theme change') {
                            fireColorTheme();
                            assert.strictEqual(panel.refreshGate.owed, 'theme');
                        } else {
                            await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined' });
                            assert.strictEqual(panel.refreshGate.owed, 'theme');
                        }
                        await settle();
                        assert.strictEqual(posted.filter(m => m.type === 'render').length, 0, 'nothing renders while blocked');

                        await exit(panel);
                        await settle(400);
                        assert.ok(posted.filter(m => m.type === 'render').length >= 1, 'a render of the current source follows the exit');
                        assert.strictEqual(panel.refreshGate.owed, 'none');
                        assert.strictEqual(panel.inConflictState, false);
                        assert.ok(internals.currentLayoutSnapshot, 'a current layout exists');
                    });
                }
            }

            it(`${kind}: a further source change or save during the conflict stays owed`, async () => {
                const { panel, posted, edit } = setUp(kind);
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                edit('Shop Ltd');
                panel.refreshGate.rendered(); // isolate: only the later suppressed events may record the debt
                edit('Shop Plc');
                assert.strictEqual(panel.refreshGate.owed, 'source', 'a change suppressed by the conflict is owed');
                panel.refreshGate.rendered();
                for (const listener of [...saveListeners]) {listener(panel.activeDocument);}
                assert.strictEqual(panel.refreshGate.owed, 'source', 'a save suppressed by the conflict is owed');
                await settle(320);
                assert.strictEqual(posted.filter(m => m.type === 'render').length, 0);
            });
        }
    });

    describe('invariant: a stale canvas always has a render scheduled, or a recorded debt while blocked', () => {
        const exits: [string, (panel: GatedPanel) => Promise<void>][] = [
            ['Discard / last edit removed / Save / refused Save (clean report)', async panel => { await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false }); }],
            ['Reload and discard', async panel => {
                await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'reloadAndDiscard' });
            }],
            ['Rebase accepted', async panel => {
                (panel as unknown as { activeDocument: unknown }).activeDocument = { uri: { toString: () => 'file:///inv.puml' }, getText: () => '@startuml\n@enduml\n', version: 1, languageId: 'plantuml', fileName: 'inv.puml' };
                await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase', stagedKeys: [] });
            }],
            ['Rebase refused (no document)', async panel => { await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'rebase' }); }],
            ['View diff', async panel => { await panel.handleWebviewMessage({ type: 'visualLayout.resolveConflict', protocolVersion: 1, action: 'viewDiff' }); }],
            ['webview declined a marked render', async panel => { await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined' }); }],
            ['theme change while blocked', async () => { fireColorTheme(); }],
        ];
        for (const owed of ['source', 'theme'] as const) {
            for (const [name, exit] of exits) {
                it(`${owed} debt, ${name}`, async () => {
                    const { panel, posted } = makePanel();
                    await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
                    panel.inConflictState = true;
                    panel.refreshGate.held(owed);
                    await exit(panel);
                    await settle();
                    // Either the debt was paid by a posted render, or the panel is still blocked and still owes it.
                    const rendered = renders(posted) > 0;
                    const blocked = panel.hasDirtyState || panel.inConflictState;
                    assert.ok(
                        (rendered && !panel.refreshGate.isPending) || (blocked && panel.refreshGate.isPending),
                        `rendered=${rendered} blocked=${blocked} owed=${panel.refreshGate.owed}`,
                    );
                    if (blocked && owed === 'source') {
                        assert.strictEqual(panel.refreshGate.owed, 'source', 'a source debt is never downgraded');
                    }
                });
            }
        }
    });

    it('marks the error of a failed theme render, not that of a source render', async () => {
        const { panel, posted } = makePanel();
        fireColorTheme();
        await settle();
        const themed = posted.filter(m => m.type === 'error') as { refresh?: boolean }[];
        assert.strictEqual(themed.length, 1);
        assert.strictEqual(themed[0].refresh, true, 'a dirty webview can decline it');
        posted.length = 0;
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle(20);
        const sourced = posted.filter(m => m.type === 'error') as { refresh?: boolean }[];
        assert.strictEqual(sourced.length, 1);
        assert.strictEqual(sourced[0].refresh, undefined, 'a source error behaves as before');
    });

    it('a render that keeps failing after Discard is reported once, then quiesces', async () => {
        const { panel, posted } = makePanel();
        const internals = panel as unknown as { getWorkspaceName(doc: unknown): string };
        const document = { uri: { toString: () => 'file:///fails.puml', fsPath: '/fails.puml' }, getText: () => '@startuml\nPerson(user, "User")\n@enduml\n', version: 1, languageId: 'plantuml', fileName: 'fails.puml' };
        panel.activeDocument = document;
        internals.getWorkspaceName = () => 'fails';
        const engine = dagreLayoutEngine as unknown as { layout: (...args: unknown[]) => Promise<unknown> };
        const original = engine.layout;
        let layouts = 0;
        engine.layout = async () => { layouts++; throw new Error('layout failed'); };
        const sidecarModule = sidecar as unknown as { applySidecarLayoutOverrides: (...args: unknown[]) => Promise<void> };
        const originalSidecar = sidecarModule.applySidecarLayoutOverrides;
        sidecarModule.applySidecarLayoutOverrides = async () => undefined;
        try {
            // Marked error declined, so the host owes a theme render.
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            await panel.handleWebviewMessage({ type: 'visualLayout.refreshDeclined' });
            assert.strictEqual(panel.refreshGate.owed, 'theme');
            // Discard: the repayment render fails in layout (the catch path).
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle(320);
            const errors = () => posted.filter(m => m.type === 'error').length;
            assert.strictEqual(errors(), 1, `posted: ${posted.map(m => m.type).join(',')} layouts=${layouts}`);
            assert.strictEqual(panel.refreshGate.owed, 'none', 'posting the error retires the debt');
            // The client accepts the error and reports clean (as showError now does).
            await panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle(320);
            assert.strictEqual(errors(), 1, 'no repayment loop');
            assert.strictEqual(layouts, 1);
            assert.strictEqual(panel.debounceTimer, undefined, 'nothing scheduled until the next real event');
            // The next real event (Refresh) tries again.
            const statics = PreviewPanel as unknown as { instance: unknown };
            const previous = statics.instance;
            statics.instance = panel;
            try {
                PreviewPanel.refresh();
                await settle(320);
            } finally {
                statics.instance = previous;
            }
            assert.strictEqual(layouts, 2, 'Refresh retries once the preview is clean');
        } finally {
            engine.layout = original;
            sidecarModule.applySidecarLayoutOverrides = originalSidecar;
        }
    });

    describe('Refresh Preview reaches every open panel (#429)', () => {
        const statics = PreviewPanel as unknown as { instance: unknown; markdownInstance: unknown };
        let previous: { instance: unknown; markdownInstance: unknown };
        beforeEach(() => { previous = { instance: statics.instance, markdownInstance: statics.markdownInstance }; });
        afterEach(() => { statics.instance = previous.instance; statics.markdownInstance = previous.markdownInstance; });

        it('renders a clean Markdown fence editor when it is the only panel', async () => {
            const fence = makePanel();
            statics.instance = undefined;
            statics.markdownInstance = fence.panel;
            assert.strictEqual(PreviewPanel.refresh(), true);
            await settle();
            assert.strictEqual(renders(fence.posted), 1);
        });

        it('defers a dirty fence editor with the notice and applies it after Discard', async () => {
            const fence = makePanel();
            statics.instance = undefined;
            statics.markdownInstance = fence.panel;
            await fence.panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            assert.strictEqual(PreviewPanel.refresh(), true, 'a deferred refresh still counts');
            await settle();
            assert.strictEqual(renders(fence.posted), 0);
            assert.ok(fence.posted.some(m => m.type === 'visualLayout.refreshDeferred'));
            await fence.panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: false });
            await settle();
            assert.strictEqual(renders(fence.posted), 1);
        });

        it('handles the standalone preview and the fence editor together, each through its own gate', async () => {
            const standalone = makePanel();
            const fence = makePanel();
            statics.instance = standalone.panel;
            statics.markdownInstance = fence.panel;
            await fence.panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
            assert.strictEqual(PreviewPanel.refresh(), true);
            await settle();
            assert.strictEqual(renders(standalone.posted), 1, 'the clean standalone preview refreshes');
            assert.strictEqual(renders(fence.posted), 0, 'the dirty fence editor waits');
            assert.strictEqual(fence.panel.refreshGate.isPending, true);
        });
    });

    it('Refresh Preview reports false when no preview is open', () => {
        const statics = PreviewPanel as unknown as { instance: unknown; markdownInstance: unknown };
        const previous = [statics.instance, statics.markdownInstance];
        statics.instance = undefined;
        statics.markdownInstance = undefined;
        try {
            assert.strictEqual(PreviewPanel.refresh(), false);
        } finally {
            [statics.instance, statics.markdownInstance] = previous;
        }
    });

    it('keeps the deferred state per panel', async () => {
        const dirtyPanel = makePanel();
        const cleanPanel = makePanel();
        await dirtyPanel.panel.handleWebviewMessage({ type: 'dirtyStateChanged', dirty: true });
        fireColorTheme();
        await settle();
        assert.strictEqual(renders(dirtyPanel.posted), 0);
        assert.strictEqual(renders(cleanPanel.posted), 1);
        assert.strictEqual(cleanPanel.panel.refreshGate.isPending, false);

        // An edit to some document neither panel is bound to renders nothing
        // and leaves the waiting theme change waiting.
        const stray = { uri: { toString: () => 'file:///stray.c4x' }, getText: () => '' };
        for (const listener of [...textChangeListeners]) {listener({ document: stray });}
        await settle(320);
        assert.strictEqual(renders(dirtyPanel.posted), 0);
        assert.strictEqual(renders(cleanPanel.posted), 1);
        assert.strictEqual(dirtyPanel.panel.refreshGate.isPending, true);
    });
});

describe('PreviewPanel routes every non-source render through the gate (#408)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');

    it('the colour-theme, theme-setting and refresh paths call requestNonSourceRender, not scheduleRender', () => {
        const colour = /onDidChangeActiveColorTheme\(\(\)\s*=>\s*\{([^}]*)\}\)/.exec(src);
        assert.ok(colour && colour[1].includes('this.requestNonSourceRender()') && !colour[1].includes('scheduleRender'));
        const setting = /affectsConfiguration\('c4x\.theme'\)\)\s*\{([^}]*)\}/.exec(src);
        assert.ok(setting && setting[1].includes('this.requestNonSourceRender()') && !setting[1].includes('scheduleRender'));
        const refresh = /public static refresh\(\): boolean \{([\s\S]*?)\n {4}\}/.exec(src);
        assert.ok(refresh && refresh[1].includes('requestNonSourceRender()') && !refresh[1].includes('scheduleRender'));
    });

    it('render() marks the deferred refresh as applied and dispose() forgets it', () => {
        const body = src.indexOf('private async renderBody(cause: RenderCause)');
        assert.ok(body >= 0);
        const post = src.indexOf("type: 'render', payload,", body);
        const decide = src.lastIndexOf('this.completeRender(cause, documentUri, documentRevision, conflictEpochAtStart)', post);
        assert.ok(decide > body, 'the render is posted only after the post-await decision');
        assert.ok(src.slice(decide, post).includes('this.refreshGate.rendered()'), 'posting clears the deferred refresh');
        assert.ok(src.slice(post, post + 120).includes('...(refresh ? { refresh: true } : {})'), 'a theme-only render is marked for the webview');
        const dispose = src.indexOf('private dispose(): void {');
        assert.ok(dispose >= 0 && src.slice(dispose, dispose + 800).includes('this.refreshGate.reset()'));
    });
});
