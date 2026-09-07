/**
 * Unit tests for close-while-dirty protection and draft survival (#84).
 *
 * Coverage:
 *  1. State schema guard (`isPersistedDraftState`) rejects malformed payloads.
 *  2. `serializeDraftState` / `deserializeDraftState` round-trip restores staged edits.
 *  3. The dirty-close warning path: `isDirtyStateChangedMessage` guard accepts/rejects.
 *
 * These are pure unit tests — no DOM, no VS Code host, no webview iframe.
 */

import * as assert from 'assert';
import { spawnSync } from 'child_process';
import { isPersistedDraftState, type PersistedDraftState } from '../../webview/draftState';
import { serializeDraftState, deserializeDraftState } from '../../webview/previewClientScript';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeValidState(overrides?: Partial<PersistedDraftState>): PersistedDraftState {
    return {
        schemaVersion: 1,
        editMode: false,
        selectedNodeId: null,
        stagedEdits: [],
        ...overrides,
    };
}

// ── isPersistedDraftState ─────────────────────────────────────────────────────

describe('isPersistedDraftState — schema guard', () => {
    it('accepts a minimal valid state', () => {
        assert.strictEqual(isPersistedDraftState(makeValidState()), true);
    });

    it('accepts a full valid state with staged edits', () => {
        const state = makeValidState({
            editMode: true,
            selectedNodeId: 'api',
            stagedEdits: [
                { id: 'api', x: 100, y: 200, label: 'API Gateway', technology: 'TypeScript' },
                { id: 'db', description: 'Main store', tags: ['storage', 'prod'] },
            ],
        });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('rejects null', () => {
        assert.strictEqual(isPersistedDraftState(null), false);
    });

    it('rejects a plain string', () => {
        assert.strictEqual(isPersistedDraftState('oops'), false);
    });

    it('rejects when schemaVersion is missing', () => {
        const bad = { editMode: false, selectedNodeId: null, stagedEdits: [] };
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when schemaVersion is wrong', () => {
        assert.strictEqual(isPersistedDraftState({ ...makeValidState(), schemaVersion: 2 }), false);
    });

    it('rejects when editMode is not boolean', () => {
        const bad = { ...makeValidState(), editMode: 'yes' };
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when selectedNodeId is an unexpected type', () => {
        const bad = { ...makeValidState(), selectedNodeId: 42 };
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when stagedEdits is not an array', () => {
        const bad = { ...makeValidState(), stagedEdits: {} };
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when a staged edit has no id', () => {
        const bad = makeValidState({ stagedEdits: [{ x: 10, y: 20 }] as unknown as PersistedDraftState['stagedEdits'] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when a staged edit id is empty string', () => {
        const bad = makeValidState({ stagedEdits: [{ id: '' }] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when x is non-finite', () => {
        const bad = makeValidState({ stagedEdits: [{ id: 'api', x: Infinity, y: 0 }] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when newId is not a valid identifier', () => {
        const bad = makeValidState({ stagedEdits: [{ id: 'api', newId: '123bad' }] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when tags contains an invalid tag', () => {
        const bad = makeValidState({ stagedEdits: [{ id: 'api', tags: ['ok', 'bad tag!'] }] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when there are more than 500 edits', () => {
        const edits = Array.from({ length: 501 }, (_, i) => ({ id: `n${i}` }));
        const bad = makeValidState({ stagedEdits: edits });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('rejects when edit ids are not unique', () => {
        const bad = makeValidState({ stagedEdits: [{ id: 'api' }, { id: 'api' }] });
        assert.strictEqual(isPersistedDraftState(bad), false);
    });

    it('accepts null description (explicit clear)', () => {
        const state = makeValidState({ stagedEdits: [{ id: 'api', description: null }] });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('accepts null technology (explicit clear)', () => {
        const state = makeValidState({ stagedEdits: [{ id: 'api', technology: null }] });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('accepts null sprite (explicit clear)', () => {
        const state = makeValidState({ stagedEdits: [{ id: 'api', sprite: null }] });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('accepts valid newId', () => {
        const state = makeValidState({ stagedEdits: [{ id: 'api', newId: 'newApi' }] });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('accepts valid camera zoom and pan coordinates', () => {
        const state = makeValidState({ zoom: 1.25, panX: 150, panY: -80 });
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('rejects invalid or non-positive camera zoom', () => {
        const zeroZoom = { ...makeValidState(), zoom: 0 } as unknown;
        assert.strictEqual(isPersistedDraftState(zeroZoom), false);
        const negativeZoom = { ...makeValidState(), zoom: -1 } as unknown;
        assert.strictEqual(isPersistedDraftState(negativeZoom), false);
        const nanZoom = { ...makeValidState(), zoom: NaN } as unknown;
        assert.strictEqual(isPersistedDraftState(nanZoom), false);
    });

    it('rejects non-finite camera pan coordinates', () => {
        const infPanX = { ...makeValidState(), panX: Infinity } as unknown;
        assert.strictEqual(isPersistedDraftState(infPanX), false);
        const nanPanY = { ...makeValidState(), panY: NaN } as unknown;
        assert.strictEqual(isPersistedDraftState(nanPanY), false);
    });
});

// ── serializeDraftState / deserializeDraftState round-trip ───────────────────

describe('serializeDraftState / deserializeDraftState — round-trip', () => {
    it('round-trips an empty edits map', () => {
        const original: Record<string, Record<string, unknown>> = {};
        const state = serializeDraftState(original, null, false);
        assert.strictEqual(state.schemaVersion, 1);
        assert.strictEqual(state.stagedEdits.length, 0);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(Object.keys(restored), []);
    });

    it('round-trips a move edit (x/y)', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { x: 150, y: 300 },
        };
        const state = serializeDraftState(original, 'api', true);
        assert.strictEqual(state.editMode, true);
        assert.strictEqual(state.selectedNodeId, 'api');

        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['api'], { x: 150, y: 300 });
    });

    it('round-trips a label edit', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { label: 'Web Client' },
        };
        const state = serializeDraftState(original, null, false);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['web'], { label: 'Web Client' });
    });

    it('round-trips a description clear (null)', () => {
        const original: Record<string, Record<string, unknown>> = {
            db: { description: null },
        };
        const state = serializeDraftState(original, null, false);
        const restored = deserializeDraftState(state);
        assert.strictEqual(restored['db']['description'], null);
    });

    it('round-trips tags edit', () => {
        const original: Record<string, Record<string, unknown>> = {
            svc: { tags: ['backend', 'prod'] },
        };
        const state = serializeDraftState(original, null, false);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['svc']['tags'], ['backend', 'prod']);
    });

    it('round-trips a newId rename', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { newId: 'apiGateway' },
        };
        const state = serializeDraftState(original, null, false);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['api'], { newId: 'apiGateway' });
    });

    it('round-trips multiple edits preserving all entries', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { x: 100, y: 200, label: 'Gateway' },
            db: { description: 'Main store', technology: null },
        };
        const state = serializeDraftState(original, 'api', true);
        assert.strictEqual(isPersistedDraftState(state), true);

        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(Object.keys(restored).sort(), ['api', 'db']);
        assert.deepStrictEqual(restored['api'], { x: 100, y: 200, label: 'Gateway' });
        assert.deepStrictEqual(restored['db'], { description: 'Main store', technology: null });
    });

    it('does not mutate the input stagedEdits map', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { x: 10, y: 20 },
        };
        serializeDraftState(original, null, false);
        assert.ok('api' in original, 'original should be unchanged');
        assert.strictEqual(original['api']['x'], 10);
    });

    it('produces a state that passes the schema guard', () => {
        const original: Record<string, Record<string, unknown>> = {
            customer: { label: 'Customer', x: 50, y: 80 },
            payments: { technology: 'Stripe', tags: ['external'] },
        };
        const state = serializeDraftState(original, 'customer', true);
        assert.strictEqual(isPersistedDraftState(state), true);
    });
});

// Exercise the real host callbacks in a separate process so the VS Code mock
// cannot pollute modules shared with other unit suites.
const DIRTY_CLOSE_HOST = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const scenario = JSON.parse(process.argv[2]);
const warnings = [];
const commands = [];
let receive;
let didDispose;
let closed = false;
const disposable = () => ({ dispose() {} });
const vscode = {
    workspace: {
        getConfiguration: () => ({ get: (_key, fallback) => fallback }),
        onDidSaveTextDocument: disposable,
        onDidChangeTextDocument: disposable,
    },
    window: {
        createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
        onDidChangeActiveTextEditor: disposable,
        showInformationMessage: async () => undefined,
        showWarningMessage: async (...args) => {
            warnings.push(args);
            return scenario.reopen ? 'Reopen Editor' : undefined;
        },
    },
    commands: { executeCommand: async command => { commands.push(command); } },
};
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args);
};
const { PreviewPanel } = require(process.argv[1]);
const panel = {
    webview: {
        options: {}, html: '', postMessage: async () => true,
        onDidReceiveMessage(callback) { receive = callback; return disposable(); },
    },
    onDidDispose(callback) { didDispose = callback; return disposable(); },
    dispose() {
        if (closed) return;
        closed = true;
        didDispose();
    },
};
const context = {
    workspaceState: { get: () => undefined, update: async () => undefined },
};
(async () => {
    await PreviewPanel.createSerializer(context).deserializeWebviewPanel(panel, undefined);
    assert.equal(typeof receive, 'function', 'production message callback was registered');
    assert.equal(typeof didDispose, 'function', 'production disposal callback was registered');
    for (const message of scenario.messages) receive(message);
    await new Promise(resolve => setImmediate(resolve));
    panel.dispose();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(warnings.length, scenario.warnings, 'actual dirty-close warning count');
    if (scenario.warnings) {
        assert.match(warnings[0][0], /unsaved staged changes/);
        assert.equal(warnings[0][1], 'Reopen Editor');
    }
    assert.deepEqual(commands, scenario.reopen ? ['c4x.openPreview'] : []);
})().catch(error => { console.error(error); process.exitCode = 1; });
`;

function verifyDirtyClose(messages: unknown[], warnings: number, reopen = false): void {
    const result = spawnSync(process.execPath, [
        '-r', require.resolve('ts-node/register/transpile-only'),
        '-e', DIRTY_CLOSE_HOST,
        require.resolve('../../webview/PreviewPanel'),
        JSON.stringify({ messages, warnings, reopen }),
    ], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.strictEqual(result.status, 0, result.stdout + result.stderr);
}

describe('dirty-close warning — real PreviewPanel callbacks', () => {
    it('warns once when an actual dirty message precedes disposal', () => {
        verifyDirtyClose([{ type: 'dirtyStateChanged', dirty: true }], 1);
    });

    it('does not warn after the client clears its dirty state', () => {
        verifyDirtyClose([
            { type: 'dirtyStateChanged', dirty: true },
            { type: 'dirtyStateChanged', dirty: false },
        ], 0);
    });

    it('rejects malformed and unrelated messages without making the panel dirty', () => {
        verifyDirtyClose([null, {}, { type: 'dirtyStateChanged', dirty: 'yes' },
            { type: 'dirtyStateChanged' }, { type: 'other', dirty: true }], 0);
    });

    it('does not let a malformed clear message erase an existing dirty state', () => {
        verifyDirtyClose([
            { type: 'dirtyStateChanged', dirty: true },
            { type: 'dirtyStateChanged', dirty: 0 },
        ], 1);
    });

    it('does not warn when an untouched panel closes', () => {
        verifyDirtyClose([], 0);
    });

    it('reopens the native editor through the warning action', () => {
        verifyDirtyClose([{ type: 'dirtyStateChanged', dirty: true }], 1, true);
    });
});
