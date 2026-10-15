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
import {
    dropInvalidPersistedAdds,
    dropUnmovableBoundaryEdits,
    formatUnmovableBoundaryNotice,
    isPersistedAddRelationshipList,
    isPersistedDraftState,
    type PersistedDraftState,
} from '../../webview/draftState';
import { serializeDraftState, deserializeDraftState, PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';

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

// ── addRelationship (connect mode, #260) ────────────────────────────────────

describe('staged relationship additions survive a draft round trip (#260)', () => {
    const ADD = { targetId: 'api', label: 'Calls', relType: 'sync', technology: 'HTTPS' };

    it('persists a connect-only draft and restores the same add', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { addRelationship: [ADD] },
        };
        const state = serializeDraftState(original, null, true);
        assert.deepStrictEqual(state.stagedEdits, [{ id: 'web', addRelationship: [ADD] }]);
        assert.strictEqual(isPersistedDraftState(state), true);
        assert.deepStrictEqual(deserializeDraftState(state), original);
    });

    it('survives a JSON round trip, as vscode.setState / getState does', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { addRelationship: [ADD, { targetId: 'db', label: 'Reads', relType: 'uses' }] },
        };
        const stored: unknown = JSON.parse(JSON.stringify(serializeDraftState(original, null, true)));
        assert.strictEqual(isPersistedDraftState(stored), true);
        assert.deepStrictEqual(deserializeDraftState(stored as PersistedDraftState), original);
    });

    it('keeps a move and an add staged on the same source element', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { x: 40, y: 60, addRelationship: [ADD] },
        };
        const state = serializeDraftState(original, 'web', true);
        assert.deepStrictEqual(state.stagedEdits, [{ id: 'web', x: 40, y: 60, addRelationship: [ADD] }]);
        assert.deepStrictEqual(deserializeDraftState(state), original);
    });

    it('persists only the allowlisted fields of each add', () => {
        const state = serializeDraftState({
            web: { addRelationship: [{ ...ADD, injected: '<script>', sourceId: 'x' }] },
        }, null, true);
        assert.deepStrictEqual(state.stagedEdits[0].addRelationship, [ADD]);
    });

    it('is additive: the schema version stays 1 so an older reader ignores the field', () => {
        const state = serializeDraftState({ web: { addRelationship: [ADD] } }, null, true);
        assert.strictEqual(state.schemaVersion, 1);
    });

    describe('restore validation (exact allowlist)', () => {
        function withAdd(addRelationship: unknown): unknown {
            return makeValidState({ stagedEdits: [{ id: 'web', addRelationship } as never] });
        }
        const accepted = (v: unknown): boolean => isPersistedDraftState(v);

        it('accepts a well-formed add, with and without technology', () => {
            assert.strictEqual(accepted(withAdd([ADD])), true);
            assert.strictEqual(accepted(withAdd([{ targetId: 'api', label: 'Calls', relType: 'uses' }])), true);
        });

        it('rejects a non-array, an empty array and an over-long array', () => {
            assert.strictEqual(accepted(withAdd('api')), false);
            assert.strictEqual(accepted(withAdd([])), false);
            const many = Array.from({ length: 65 }, (_, i) => ({ targetId: 'n' + i, label: 'L', relType: 'uses' }));
            assert.strictEqual(accepted(withAdd(many)), false);
        });

        it('rejects unknown keys, including sourceId', () => {
            assert.strictEqual(accepted(withAdd([{ ...ADD, extra: 1 }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, sourceId: 'web' }])), false);
        });

        it('rejects a bad target id, relType, label or technology', () => {
            assert.strictEqual(accepted(withAdd([{ ...ADD, targetId: '1bad' }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, targetId: 'has space' }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, relType: 'bidirectional' }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, label: '' }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, label: 'a|b' }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, label: 'x'.repeat(121) }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, technology: 'x'.repeat(121) }])), false);
            assert.strictEqual(accepted(withAdd([{ ...ADD, technology: 7 }])), false);
            assert.strictEqual(accepted(withAdd([null])), false);
        });

        it('rejects two adds with the same target and label, which the protocol refuses', () => {
            assert.strictEqual(accepted(withAdd([ADD, { ...ADD }])), false);
        });
    });
});

describe('a bad staged relationship never discards the rest of the draft (#260)', () => {
    const GOOD = { targetId: 'api', label: 'Calls', relType: 'uses' as const };
    const repair = (state: unknown) => dropInvalidPersistedAdds(state, isPersistedAddRelationshipList);

    it('round-trips a target id with a hyphen, which the grammar allows', () => {
        const original = { web: { x: 5, y: 6, addRelationship: [{ ...GOOD, targetId: 'api-gw' }] } };
        const stored: unknown = JSON.parse(JSON.stringify(serializeDraftState(original, null, true)));
        assert.strictEqual(isPersistedDraftState(stored), true);
        assert.deepStrictEqual(deserializeDraftState(stored as PersistedDraftState), original);
    });

    it('leaves a valid draft untouched', () => {
        const state = makeValidState({ stagedEdits: [{ id: 'web', x: 1, y: 2, addRelationship: [GOOD] }] });
        const { state: repaired, dropped } = repair(state);
        assert.strictEqual(dropped, 0);
        assert.deepStrictEqual(repaired, state);
    });

    it('drops only a duplicate add and keeps the first, the move and the other edits', () => {
        const state = makeValidState({
            editMode: true,
            stagedEdits: [
                { id: 'web', x: 1, y: 2, addRelationship: [GOOD, { ...GOOD }] },
                { id: 'db', label: 'Store' },
            ],
        });
        const { state: repaired, dropped } = repair(state);
        assert.strictEqual(dropped, 1);
        assert.strictEqual(isPersistedDraftState(repaired), true);
        assert.deepStrictEqual((repaired as PersistedDraftState).stagedEdits, [
            { id: 'web', x: 1, y: 2, addRelationship: [GOOD] },
            { id: 'db', label: 'Store' },
        ]);
    });

    it('drops the adds past the 64-entry cap and keeps the first 64', () => {
        const many = Array.from({ length: 70 }, (_, i) => ({ targetId: 'n' + i, label: 'L', relType: 'uses' }));
        const { state: repaired, dropped } = repair(makeValidState({ stagedEdits: [{ id: 'web', addRelationship: many as never }] }));
        assert.strictEqual(dropped, 6);
        assert.strictEqual((repaired as PersistedDraftState).stagedEdits[0].addRelationship?.length, 64);
        assert.strictEqual(isPersistedDraftState(repaired), true);
    });

    it('drops a corrupted add (unknown key, bad type) and keeps a good one beside it', () => {
        const { state: repaired, dropped } = repair(makeValidState({
            stagedEdits: [{ id: 'web', addRelationship: [{ ...GOOD, extra: 1 }, GOOD, { ...GOOD, relType: 'x' }] as never }],
        }));
        assert.strictEqual(dropped, 2);
        assert.deepStrictEqual((repaired as PersistedDraftState).stagedEdits, [{ id: 'web', addRelationship: [GOOD] }]);
    });

    it('removes an entry that has nothing left, and counts a non-array field once', () => {
        const { state: repaired, dropped } = repair(makeValidState({
            stagedEdits: [
                { id: 'web', addRelationship: [{ ...GOOD, label: '' }] as never },
                { id: 'api', addRelationship: 'oops' as never },
                { id: 'db', label: 'Store' },
            ],
        }));
        assert.strictEqual(dropped, 2);
        assert.deepStrictEqual((repaired as PersistedDraftState).stagedEdits, [{ id: 'db', label: 'Store' }]);
        assert.strictEqual(isPersistedDraftState(repaired), true);
    });

    it('ignores state it cannot read', () => {
        assert.deepStrictEqual(repair(undefined), { state: undefined, dropped: 0 });
        assert.deepStrictEqual(repair('oops'), { state: 'oops', dropped: 0 });
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

describe('a staged move of a boundary the source cannot position is not restored (#271)', () => {
    const BOUNDARIES = [
        { id: 'shop-boundary-0', label: 'Shop', movable: false },
        { id: 'backend-boundary-1', label: 'Backend' },
    ];

    it('drops the typed boundary edit and keeps the element and subgraph edits', () => {
        const edits = {
            'shop-boundary-0': { boundaryId: 'shop-boundary-0', x: 10, y: 20 },
            'backend-boundary-1': { boundaryId: 'backend-boundary-1', w: 300, h: 200 },
            web: { x: 1, y: 2 },
        };
        const result = dropUnmovableBoundaryEdits(edits, BOUNDARIES);
        assert.deepStrictEqual(Object.keys(result.edits), ['backend-boundary-1', 'web']);
        assert.deepStrictEqual(result.labels, ['Shop']);
    });

    it('drops a typed boundary resize as well as a move', () => {
        const result = dropUnmovableBoundaryEdits(
            { 'shop-boundary-0': { boundaryId: 'shop-boundary-0', x: 1, y: 2, w: 3, h: 4 } }, BOUNDARIES);
        assert.deepStrictEqual(result.edits, {});
        assert.deepStrictEqual(result.labels, ['Shop']);
    });

    it('changes nothing when every boundary can be moved, or a host sent no flag', () => {
        const edits = { 'backend-boundary-1': { boundaryId: 'backend-boundary-1', x: 1, y: 2 }, web: { x: 1, y: 2 } };
        const result = dropUnmovableBoundaryEdits(edits, [{ id: 'backend-boundary-1', label: 'Backend' }]);
        assert.deepStrictEqual(result.edits, edits);
        assert.deepStrictEqual(result.labels, []);
    });

    it('names a single boundary and says why', () => {
        const notice = formatUnmovableBoundaryNotice(['Shop']);
        assert.ok(notice.startsWith('1 staged boundary change could not be restored: "Shop" cannot be moved or resized'), notice);
        assert.ok(notice.includes('System_Boundary'), notice);
    });

    it('cuts a long label instead of dropping the notice', () => {
        const notice = formatUnmovableBoundaryNotice(['L'.repeat(1000)]);
        assert.ok(notice.includes('"' + 'L'.repeat(40) + '\u2026"'), notice);
        assert.ok(notice.length < 400, `${notice.length} characters`);
    });

    it('summarises more than three boundaries as "and N more" rather than hiding them', () => {
        const notice = formatUnmovableBoundaryNotice(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']);
        assert.ok(notice.startsWith('10 staged boundary changes could not be restored: "A", "B", "C" and 7 more cannot be moved'), notice);
    });

    it('is embedded in the webview script', () => {
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes('function dropUnmovableBoundaryEdits('));
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes('function formatUnmovableBoundaryNotice('));
    });
});
