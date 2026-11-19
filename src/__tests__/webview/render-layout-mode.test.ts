/**
 * The preview's layout modes through the real render path (#340 review rounds 3 and 4).
 *
 * A diagram whose boxes grew for wrapped text is rendered in view mode with
 * the grown layout; once the webview reports edit mode it is re-rendered at
 * the standard sizes (the layout a Save of the first move produces). Exports
 * always carry the view-mode layout, as the preview shows the diagram outside
 * edit mode. A diagram whose boxes did not grow gets no extra render.
 */
import * as assert from 'assert';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request: string, ...args: unknown[]) {
    if (request === 'vscode') {return require.resolve('../__mocks__/vscode');}
    return originalResolveFilename.call(this, request, ...args);
};

import * as vscodeMock from '../__mocks__/vscode';
import { PreviewPanel } from '../../webview/PreviewPanel';
import { NonSourceRenderGate } from '../../webview/nonSourceRenderGate';
Module._resolveFilename = originalResolveFilename;

const settle = (ms = 300) => new Promise(resolve => setTimeout(resolve, ms));
const LONG = 'handles payments for customers and '.repeat(20).trim();

interface Posted { type?: string; refresh?: boolean; payload?: { sameDiagramEdit?: { since: number | null; value: boolean }; viewType?: string; diagramIdentity?: string; scope?: string; layoutMode?: string; textGrown?: boolean; svg?: string; visualLayout?: { nodes: Array<{ id: string; height: number }> } } }
interface Panel {
    disposables: { dispose(): void }[];
    hasDirtyState: boolean;
    inConflictState: boolean;
    refreshGate: NonSourceRenderGate;
    conflictEpoch: number;
    debounceTimer?: NodeJS.Timeout;
    activeDocument: unknown;
    activeSaveAnchor: unknown;
    currentExportSvg?: string;
    layoutMode: string;
    lastRenderTextGrown: boolean;
    panel: unknown;
    log(line: string): void;
    getWorkspaceName(): string;
    captureDocumentAnchor(document: unknown): unknown;
    registerEventListeners(): void;
    handleWebviewMessage(message: unknown): Promise<void>;
}

describe('Preview layout modes through the render path (#340)', () => {
    const windowMock = vscodeMock.window as unknown as Record<string, unknown>;
    const workspaceMock = vscodeMock.workspace as unknown as Record<string, unknown>;
    const inert = () => ({ dispose: () => undefined });
    let saved: Record<string, unknown>;
    let panels: Panel[];

    beforeEach(() => {
        panels = [];
        saved = {
            onDidChangeActiveColorTheme: windowMock.onDidChangeActiveColorTheme,
            onDidChangeActiveTextEditor: windowMock.onDidChangeActiveTextEditor,
            onDidSaveTextDocument: workspaceMock.onDidSaveTextDocument,
            onDidChangeTextDocument: workspaceMock.onDidChangeTextDocument,
        };
        windowMock.onDidChangeActiveColorTheme = inert;
        windowMock.onDidChangeActiveTextEditor = inert;
        workspaceMock.onDidSaveTextDocument = inert;
        workspaceMock.onDidChangeTextDocument = inert;
    });

    afterEach(() => {
        for (const panel of panels) {
            if (panel.debounceTimer) {clearTimeout(panel.debounceTimer);}
            while (panel.disposables.length) {panel.disposables.pop()?.dispose();}
        }
        Object.assign(windowMock, { onDidChangeActiveColorTheme: saved.onDidChangeActiveColorTheme, onDidChangeActiveTextEditor: saved.onDidChangeActiveTextEditor });
        Object.assign(workspaceMock, { onDidSaveTextDocument: saved.onDidSaveTextDocument, onDidChangeTextDocument: saved.onDidChangeTextDocument });
    });

    async function open(description: string) {
        const panel = Object.create(PreviewPanel.prototype) as Panel;
        const posted: Posted[] = [];
        Object.assign(panel, {
            disposables: [], hasDirtyState: false, inConflictState: false, refreshGate: new NonSourceRenderGate(),
            conflictEpoch: 0, layoutMode: 'view', lastRenderTextGrown: false,
        });
        panel.log = () => undefined;
        panel.getWorkspaceName = () => 'layout-mode';
        panel.panel = { webview: { postMessage: (message: unknown) => { posted.push(message as Posted); return Promise.resolve(true); } } };
        let text = `%%{ c4: container }%%\ngraph TB\n    Container(a, "A", "Java", "${description}")\n    Container(b, "B", "Java", "Short")\n    a -->|Calls| b\n`;
        const document = {
            uri: { toString: () => 'file:///layout-mode.c4x', fsPath: '/layout-mode.c4x' },
            getText: () => text, version: 1, languageId: 'c4x', fileName: 'layout-mode.c4x',
        };
        panel.activeDocument = document;
        panel.activeSaveAnchor = panel.captureDocumentAnchor(document);
        panel.registerEventListeners();
        panels.push(panel);
        await panel.handleWebviewMessage({ type: 'ready' });
        await settle();
        const renders = () => posted.filter(m => m.type === 'render');
        const edit = (rangeOffset: number, rangeLength: number, insert: string) => {
            text = text.slice(0, rangeOffset) + insert + text.slice(rangeOffset + rangeLength);
            document.version += 1;
            return { document, contentChanges: [{ rangeOffset, rangeLength, text: insert }] };
        };
        return { panel, posted, renders, document, edit, text: () => text };
    }

    const heightOf = (message: Posted, id: string) => message.payload!.visualLayout!.nodes.find(n => n.id === id)!.height;

    it('renders grown boxes in view mode, standard boxes in edit mode, and keeps exports in view mode', async () => {
        const { panel, renders } = await open(LONG);
        const view = renders()[0];
        assert.strictEqual(view.payload!.layoutMode, 'view');
        assert.strictEqual(view.payload!.textGrown, true);
        // The diagram's identity is its document, not its source text (#340 review 7).
        assert.strictEqual(view.payload!.diagramIdentity, 'file:///layout-mode.c4x');
        assert.strictEqual(view.payload!.viewType, 'container', 'with the view type, the webview tells diagrams at one fence position apart');
        assert.notStrictEqual(view.payload!.scope, view.payload!.diagramIdentity, 'the draft scope carries the source fingerprint');
        const grown = heightOf(view, 'a');
        assert.ok(grown > 130);
        const viewExport = panel.currentExportSvg;

        await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
        await settle();
        assert.strictEqual(renders().length, 2);
        const edit = renders()[1];
        assert.strictEqual(edit.payload!.layoutMode, 'edit');
        assert.strictEqual(edit.refresh, true, 'a marked non-source render, declined by a webview holding a draft');
        assert.strictEqual(heightOf(edit, 'a'), 130);
        // Export while in edit mode: the view-mode layout, as the preview shows the diagram outside edit mode.
        assert.strictEqual(panel.currentExportSvg, viewExport);
        assert.ok(panel.currentExportSvg!.includes(`height="${grown.toFixed(2)}"`));
        assert.ok(!edit.payload!.svg!.includes(`height="${grown.toFixed(2)}"`));

        await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'view' });
        await settle();
        assert.strictEqual(renders().length, 3);
        assert.strictEqual(heightOf(renders()[2], 'a'), grown);
    });

    it('tells the webview whether the change since the last render stayed inside the diagram (#340 review 9)', async () => {
        let onChange: ((event: unknown) => void) | undefined;
        workspaceMock.onDidChangeTextDocument = (listener: (event: unknown) => void) => { onChange = listener; return inert(); };
        const { renders, edit, text, document } = await open('Short');
        assert.ok(onChange);
        const fire = async (event: unknown) => { onChange!(event); await settle(500); return renders()[renders().length - 1]; };

        const inside = await fire(edit(text().indexOf('"Short")'), 7, '"Shorter"'));
        assert.deepStrictEqual(inside.payload!.sameDiagramEdit!.value, true, 'an edit inside the diagram');
        const whole = await fire(edit(0, text().length, text().replace('Shorter', 'Other')));
        assert.strictEqual(whole.payload!.sameDiagramEdit!.value, false, 'a whole-document replacement (external reload)');
        const beforeExternal = renders().length;
        const external = await fire({ document, contentChanges: [] });
        // A change event with no ranges (an external change or revert) ends it: on the render it causes,
        // or, when the host posts none, on the next one.
        const carrying = renders().length > beforeExternal ? external : await fire(edit(text().indexOf('"Other"'), 7, '"Again"'));
        assert.strictEqual(carrying.payload!.sameDiagramEdit!.value, false, 'an external change ends it');
        const later = await fire(edit(text().indexOf('"B"'), 3, '"Bee"'));
        assert.strictEqual(later.payload!.sameDiagramEdit!.value, true, 'each render starts a new proof');
    });

    it('sends no extra render for a diagram whose boxes did not grow: edit mode starts at once', async () => {
        const { panel, renders } = await open('Short');
        assert.strictEqual(renders()[0].payload!.textGrown, false);
        await panel.handleWebviewMessage({ type: 'visualLayout.layoutMode', mode: 'edit' });
        await settle();
        assert.strictEqual(renders().length, 1);
    });
});
