import * as assert from 'assert';

// The real panel's focus handler, without constructing a native webview.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function(request: string, ...args: unknown[]) {
    if (request === 'vscode') return require.resolve('../__mocks__/vscode');
    return originalResolveFilename.call(this, request, ...args);
};

import * as vscodeMock from '../__mocks__/vscode';
import { PreviewPanel } from '../../webview/PreviewPanel';
Module._resolveFilename = originalResolveFilename;

interface DiagramDocument {
    uri: { toString(): string };
    languageId: string;
    fileName: string;
}

interface FocusPanel {
    activeDocument: DiagramDocument | undefined;
    activeSaveAnchor: unknown;
    currentLayoutSnapshot: unknown;
    scheduleRender(): void;
    captureDocumentAnchor(document: DiagramDocument): unknown;
    tryUpdateActiveDocument(): void;
}

function diagram(name: string): DiagramDocument {
    return { uri: { toString: () => `file:///${name}.c4x` }, languageId: 'c4x', fileName: `${name}.c4x` };
}

describe('preview document binding across webview focus', () => {
    const windowState = vscodeMock.window as unknown as { activeTextEditor?: { document: DiagramDocument } };
    let originalEditor: typeof windowState.activeTextEditor;

    beforeEach(() => { originalEditor = windowState.activeTextEditor; });
    afterEach(() => { windowState.activeTextEditor = originalEditor; });

    function panelFor(document: DiagramDocument): { panel: FocusPanel; renders: () => number } {
        const panel = Object.create(PreviewPanel.prototype) as FocusPanel;
        let count = 0;
        panel.activeDocument = document;
        panel.activeSaveAnchor = { document };
        panel.currentLayoutSnapshot = { revision: '1' };
        panel.scheduleRender = () => { count++; };
        panel.captureDocumentAnchor = next => ({ document: next });
        return { panel, renders: () => count };
    }

    it('keeps the bound diagram and canvas when webview focus removes the active text editor', () => {
        const source = diagram('first');
        const { panel, renders } = panelFor(source);
        const anchor = panel.activeSaveAnchor;
        const layout = panel.currentLayoutSnapshot;
        windowState.activeTextEditor = undefined;

        panel.tryUpdateActiveDocument();

        assert.strictEqual(panel.activeDocument, source);
        assert.strictEqual(panel.activeSaveAnchor, anchor);
        assert.strictEqual(panel.currentLayoutSnapshot, layout);
        assert.strictEqual(renders(), 0, 'webview focus must not schedule a no-document error render');
    });

    it('still follows another diagram when its text editor becomes active', () => {
        const { panel, renders } = panelFor(diagram('first'));
        const next = diagram('second');
        windowState.activeTextEditor = { document: next };

        panel.tryUpdateActiveDocument();

        assert.strictEqual(panel.activeDocument, next);
        assert.deepStrictEqual(panel.activeSaveAnchor, { document: next });
        assert.strictEqual(panel.currentLayoutSnapshot, undefined);
        assert.strictEqual(renders(), 1);
    });

    it('still clears the preview binding for an actual unrelated text editor', () => {
        const { panel, renders } = panelFor(diagram('first'));
        windowState.activeTextEditor = {
            document: { uri: { toString: () => 'file:///notes.txt' }, languageId: 'plaintext', fileName: 'notes.txt' },
        };

        panel.tryUpdateActiveDocument();

        assert.strictEqual(panel.activeDocument, undefined);
        assert.strictEqual(panel.activeSaveAnchor, undefined);
        assert.strictEqual(panel.currentLayoutSnapshot, undefined);
        assert.strictEqual(renders(), 1);
    });
});
