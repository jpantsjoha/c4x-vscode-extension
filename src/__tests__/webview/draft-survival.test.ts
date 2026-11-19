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
import { isDirtyStateChangedMessage } from '../../webview/visualLayoutProtocol';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import {
    dropInvalidPersistedAdds,
    dropUnmovableBoundaryEdits,
    formatUnmovableBoundaryNotice,
    isPersistedAddRelationshipList,
    isPersistedDraftState,
    type PersistedDraftState,
} from '../../webview/draftState';
import { serializeDraftState, deserializeDraftState, formatDraftRestoreStatus, isDraftStateForCurrentScope, CAMERA_PERSIST_DEBOUNCE_MS, PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';


// ── Helpers ──────────────────────────────────────────────────────────────────

const SCOPE_A = 'file:///diagram-a.c4x';

function makeValidState(overrides?: Partial<PersistedDraftState>): PersistedDraftState {
    return {
        schemaVersion: 2,
        scope: SCOPE_A,
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
        // v1 states predate the scope field and are discarded, not migrated.
        assert.strictEqual(isPersistedDraftState({ ...makeValidState(), schemaVersion: 1 }), false);
    });

    it('rejects when scope is missing, empty, or not a string', () => {
        const noScope = {
            schemaVersion: 2, editMode: false, selectedNodeId: null, stagedEdits: [],
        };
        assert.strictEqual(isPersistedDraftState(noScope), false);
        assert.strictEqual(isPersistedDraftState({ ...makeValidState(), scope: '' }), false);
        assert.strictEqual(isPersistedDraftState({ ...makeValidState(), scope: 42 }), false);
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
        const state = serializeDraftState(original, null, false, SCOPE_A);
        assert.strictEqual(state.schemaVersion, 2);
        assert.strictEqual(state.stagedEdits.length, 0);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(Object.keys(restored), []);
    });

    it('round-trips a move edit (x/y)', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { x: 150, y: 300 },
        };
        const state = serializeDraftState(original, 'api', true, SCOPE_A);
        assert.strictEqual(state.editMode, true);
        assert.strictEqual(state.selectedNodeId, 'api');

        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['api'], { x: 150, y: 300 });
    });

    it('round-trips a label edit', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { label: 'Web Client' },
        };
        const state = serializeDraftState(original, null, false, SCOPE_A);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['web'], { label: 'Web Client' });
    });

    it('round-trips a description clear (null)', () => {
        const original: Record<string, Record<string, unknown>> = {
            db: { description: null },
        };
        const state = serializeDraftState(original, null, false, SCOPE_A);
        const restored = deserializeDraftState(state);
        assert.strictEqual(restored['db']['description'], null);
    });

    it('round-trips tags edit', () => {
        const original: Record<string, Record<string, unknown>> = {
            svc: { tags: ['backend', 'prod'] },
        };
        const state = serializeDraftState(original, null, false, SCOPE_A);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['svc']['tags'], ['backend', 'prod']);
    });

    it('round-trips a newId rename', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { newId: 'apiGateway' },
        };
        const state = serializeDraftState(original, null, false, SCOPE_A);
        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['api'], { newId: 'apiGateway' });
    });

    it('round-trips multiple edits preserving all entries', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { x: 100, y: 200, label: 'Gateway' },
            db: { description: 'Main store', technology: null },
        };
        const state = serializeDraftState(original, 'api', true, SCOPE_A);
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
        serializeDraftState(original, null, false, SCOPE_A);
        assert.ok('api' in original, 'original should be unchanged');
        assert.strictEqual(original['api']['x'], 10);
    });

    it('produces a state that passes the schema guard', () => {
        const original: Record<string, Record<string, unknown>> = {
            customer: { label: 'Customer', x: 50, y: 80 },
            payments: { technology: 'Stripe', tags: ['external'] },
        };
        const state = serializeDraftState(original, 'customer', true, SCOPE_A);
        assert.strictEqual(isPersistedDraftState(state), true);
    });
});

// ── Camera round-trip (#167) ─────────────────────────────────────────────────

describe('camera persistence (#167)', () => {
    it('round-trips zoom and pan with no staged edits at all', () => {
        // The camera is now written on pan, wheel, Fit, Reset and the zoom
        // buttons, so it must survive a state with nothing else in it.
        const state = serializeDraftState({}, null, false, SCOPE_A, { zoom: 2.4, panX: -120, panY: 66 });
        assert.strictEqual(isPersistedDraftState(state), true);
        assert.strictEqual(state.zoom, 2.4);
        assert.strictEqual(state.panX, -120);
        assert.strictEqual(state.panY, 66);
        assert.deepStrictEqual(Object.keys(deserializeDraftState(state)), []);
    });

    it('round-trips the camera alongside staged edits', () => {
        const state = serializeDraftState(
            { api: { x: 100, y: 200 } },
            'api',
            true,
            SCOPE_A,
            { zoom: 0.8, panX: 12.5, panY: -3.25 },
        );
        assert.strictEqual(isPersistedDraftState(state), true);
        assert.deepStrictEqual(
            { zoom: state.zoom, panX: state.panX, panY: state.panY },
            { zoom: 0.8, panX: 12.5, panY: -3.25 },
        );
        assert.deepStrictEqual(deserializeDraftState(state)['api'], { x: 100, y: 200 });
    });

    it('omits the camera entirely when it was never set', () => {
        const state = serializeDraftState({}, null, false, SCOPE_A);
        assert.ok(!('zoom' in state));
        assert.ok(!('panX' in state));
        assert.ok(!('panY' in state));
        assert.strictEqual(isPersistedDraftState(state), true);
    });

    it('keeps a pan of exactly zero, which is a real camera position', () => {
        const state = serializeDraftState({}, null, false, SCOPE_A, { zoom: 1, panX: 0, panY: 0 });
        assert.strictEqual(state.panX, 0);
        assert.strictEqual(state.panY, 0);
    });

    it('debounces the wheel by a value the client can act on', () => {
        assert.ok(CAMERA_PERSIST_DEBOUNCE_MS > 0 && CAMERA_PERSIST_DEBOUNCE_MS <= 500);
    });

    it('persists at pan end independently of staged edits', () => {
        const handler = PREVIEW_CLIENT_SCRIPT.match(
            /function onSvgPointerUp\(event\) \{([\s\S]*?)\n {4}\}\n\n {4}function onSvgWheel/,
        );
        assert.ok(handler, 'onSvgPointerUp handler is present in the assembled client script');
        assert.match(handler[1], /\bpersistState\(\);/);
    });
});

// ── Draft scope guard (#167 review) ──────────────────────────────────────────

describe('isDraftStateForCurrentScope — diagram identity guard (#167 review)', () => {
    it('restores a state persisted under the scope now on screen', () => {
        assert.strictEqual(isDraftStateForCurrentScope(makeValidState(), SCOPE_A), true);
    });

    it('rejects a camera-only state persisted under a different scope', () => {
        const cameraOnly = makeValidState({ zoom: 2.4, panX: -120, panY: 66 });
        assert.strictEqual(isDraftStateForCurrentScope(cameraOnly, 'file:///diagram-b.c4x'), false);
    });

    it('rejects a different-scope state even when every edit id exists in both diagrams', () => {
        // `api` and `db` are exactly the ids two diagrams tend to share; the
        // per-id filter would keep these edits, so the scope must be what
        // rejects them.
        const sharedIds = makeValidState({
            stagedEdits: [
                { id: 'api', x: 100, y: 200 },
                { id: 'db', label: 'Database' },
            ],
        });
        assert.strictEqual(isDraftStateForCurrentScope(sharedIds, 'file:///diagram-b.c4x'), false);
    });

    it('rejects when the current render carries no scope at all', () => {
        assert.strictEqual(isDraftStateForCurrentScope(makeValidState(), undefined), false);
    });

    it('guards the restore block in the assembled client script', () => {
        const showSvg = PREVIEW_CLIENT_SCRIPT.match(
            /function showSvg\(svg, metrics[\s\S]*?\n {4}\}\n/,
        );
        assert.ok(showSvg, 'showSvg is present in the assembled client script');
        assert.match(
            showSvg[0],
            /isValidPersistedDraftState\(restore\) && isDraftStateForCurrentScope\(restore, currentScope\)/,
        );
    });
});

// ── Persist suspension during render (#167 review) ───────────────────────────

describe('render persist suspension (#167 review)', () => {
    function showSvgBody(): string {
        const showSvg = PREVIEW_CLIENT_SCRIPT.match(
            /function showSvg\(svg, metrics[\s\S]*?\n {4}\}\n/,
        );
        assert.ok(showSvg, 'showSvg is present in the assembled client script');
        return showSvg[0];
    }

    it('persistState is a no-op while a render is in flight', () => {
        const persist = PREVIEW_CLIENT_SCRIPT.match(
            /function persistState\(\) \{([\s\S]*?)\n {4}\}/,
        );
        assert.ok(persist, 'persistState is present in the assembled client script');
        assert.match(persist[1], /if \(renderInFlight\) \{\s*return;\s*\}/);
    });

    it('suspends persistence before staging is cleared, and persists once after the restore decision', () => {
        const body = showSvgBody();
        const suspendAt = body.indexOf('renderInFlight = true;');
        const clearAt = body.indexOf('stagedEdits = {};');
        const restoreAt = body.indexOf('pendingRestoreState = null;');
        const resumeAt = body.lastIndexOf('renderInFlight = false;');
        const finalPersistAt = body.lastIndexOf('persistState();');
        assert.ok(suspendAt !== -1 && clearAt !== -1 && restoreAt !== -1, 'showSvg wires the suspension flag');
        assert.ok(suspendAt < clearAt, 'persistence is suspended before the render clears staging');
        assert.ok(resumeAt > restoreAt, 'the suspension outlasts the restore/prune decision');
        assert.ok(finalPersistAt > resumeAt, 'exactly one persist runs after the render has settled');
    });

    it('does not persist a provisional camera from the restore block itself', () => {
        const body = showSvgBody();
        const restoreAt = body.indexOf('pendingRestoreState = null;');
        const finalPersistAt = body.lastIndexOf('persistState();');
        assert.ok(
            body.slice(restoreAt, finalPersistAt).indexOf('persistState();') === -1,
            'no persist runs between the restore decision and the settled end-of-render persist',
        );
    });
});

// ── Draft restore status (#167) ──────────────────────────────────────────────

describe('formatDraftRestoreStatus — pruning is no longer silent (#167)', () => {
    it('says nothing when there was no draft', () => {
        assert.strictEqual(formatDraftRestoreStatus(0, 0), null);
    });

    it('reports a clean restore', () => {
        assert.deepStrictEqual(formatDraftRestoreStatus(3, 0), {
            text: 'Draft restored — 3 staged changes.',
            tone: 'info',
            state: 'dirty',
        });
    });

    it('uses the singular for one change', () => {
        assert.strictEqual(formatDraftRestoreStatus(1, 0)?.text, 'Draft restored — 1 staged change.');
    });

    it('names what it dropped when only part of the draft still applies', () => {
        assert.strictEqual(
            formatDraftRestoreStatus(2, 3)?.text,
            'Draft restored — 2 staged changes; 3 no longer apply and were dropped.',
        );
        assert.strictEqual(
            formatDraftRestoreStatus(2, 1)?.text,
            'Draft restored — 2 staged changes; 1 no longer applies and was dropped.',
        );
    });

    it('explains a draft that could not be restored at all, and stays clean', () => {
        assert.deepStrictEqual(formatDraftRestoreStatus(0, 4), {
            text: 'Draft not restored: its 4 changes refer to elements no longer in the diagram.',
            tone: 'info',
            state: 'clean',
        });
        assert.strictEqual(
            formatDraftRestoreStatus(0, 1)?.text,
            'Draft not restored: its 1 change refers to elements no longer in the diagram.',
        );
    });
});

// ── Dirty-close host-side guard ───────────────────────────────────────────────
// The `isDirtyStateChangedMessage` private method is verified indirectly by
// testing the message shape that the webview emits. We exercise the guard by
// importing PreviewPanel and testing via the public integration surface.

// ── addRelationship (connect mode, #260) ────────────────────────────────────


describe('staged relationship additions survive a draft round trip (#260)', () => {
    const ADD = { targetId: 'api', label: 'Calls', relType: 'sync', technology: 'HTTPS' };

    it('persists a connect-only draft and restores the same add', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { addRelationship: [ADD] },
        };
        const state = serializeDraftState(original, null, true, SCOPE_A);
        assert.deepStrictEqual(state.stagedEdits, [{ id: 'web', addRelationship: [ADD] }]);
        assert.strictEqual(isPersistedDraftState(state), true);
        assert.deepStrictEqual(deserializeDraftState(state), original);
    });

    it('survives a JSON round trip, as vscode.setState / getState does', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { addRelationship: [ADD, { targetId: 'db', label: 'Reads', relType: 'uses' }] },
        };
        const stored: unknown = JSON.parse(JSON.stringify(serializeDraftState(original, null, true, SCOPE_A)));
        assert.strictEqual(isPersistedDraftState(stored), true);
        assert.deepStrictEqual(deserializeDraftState(stored as PersistedDraftState), original);
    });

    it('keeps a move and an add staged on the same source element', () => {
        const original: Record<string, Record<string, unknown>> = {
            web: { x: 40, y: 60, addRelationship: [ADD] },
        };
        const state = serializeDraftState(original, 'web', true, SCOPE_A);
        assert.deepStrictEqual(state.stagedEdits, [{ id: 'web', x: 40, y: 60, addRelationship: [ADD] }]);
        assert.deepStrictEqual(deserializeDraftState(state), original);
    });

    it('persists only the allowlisted fields of each add', () => {
        const state = serializeDraftState({
            web: { addRelationship: [{ ...ADD, injected: '<script>', sourceId: 'x' }] },
        }, null, true, SCOPE_A);
        assert.deepStrictEqual(state.stagedEdits[0].addRelationship, [ADD]);
    });

    it('retains the additive relationship field in the scoped v2 draft', () => {
        const state = serializeDraftState({ web: { addRelationship: [ADD] } }, null, true, SCOPE_A);
        assert.strictEqual(state.schemaVersion, 2);
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
        const stored: unknown = JSON.parse(JSON.stringify(serializeDraftState(original, null, true, SCOPE_A)));
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
// cannot pollute modules shared with other unit suites. The child transpiles
// PreviewPanel once (the slow step, much slower under coverage) and runs every
// scenario against it, so the cost does not multiply by the case count and the
// cases do not depend on wall-clock headroom per case (#239).
const DIRTY_CLOSE_HOST = String.raw`
const assert = require('node:assert/strict');
const Module = require('node:module');
const scenarios = JSON.parse(process.argv[2]);
let vscode;
const originalLoad = Module._load;
Module._load = function(request, ...args) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, ...args);
};
const disposable = () => ({ dispose() {} });
// The module captures the vscode object at load, so one object is shared and
// its sinks are re-pointed per scenario.
let current = { scenario: {}, warnings: [], commands: [] };
function makeVscode() {
    return {
        workspace: {
            getConfiguration: () => ({ get: (_key, fallback) => fallback }),
            onDidSaveTextDocument: disposable,
            onDidChangeConfiguration: disposable,
            onDidChangeTextDocument: disposable,
        },
        window: {
            createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
            onDidChangeActiveTextEditor: disposable,
            onDidChangeActiveColorTheme: disposable,
            showInformationMessage: async () => undefined,
            showWarningMessage: async (...args) => {
                current.warnings.push(args);
                return current.scenario.reopen ? 'Reopen Editor' : undefined;
            },
        },
        commands: { executeCommand: async command => { current.commands.push(command); } },
    };
}
async function run(PreviewPanel, scenario) {
    const warnings = [];
    const commands = [];
    let receive;
    let didDispose;
    let closed = false;
    current = { scenario, warnings, commands };
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
}
(async () => {
    vscode = makeVscode();
    const { PreviewPanel } = require(process.argv[1]);
    const results = [];
    for (const scenario of scenarios) {
        try { await run(PreviewPanel, scenario); results.push({ ok: true }); }
        catch (error) { results.push({ ok: false, error: String(error && error.stack || error) }); }
    }
    process.stdout.write('RESULTS:' + JSON.stringify(results));
})().catch(error => { console.error(error); process.exitCode = 1; });
`;

interface DirtyCloseScenario { messages: unknown[]; warnings: number; reopen: boolean }
const DIRTY_CLOSE_SCENARIOS: Record<string, DirtyCloseScenario> = {
    warnsOnce: { messages: [{ type: 'dirtyStateChanged', dirty: true }], warnings: 1, reopen: false },
    clearedNoWarn: {
        messages: [{ type: 'dirtyStateChanged', dirty: true }, { type: 'dirtyStateChanged', dirty: false }],
        warnings: 0, reopen: false,
    },
    malformedIgnored: {
        messages: [null, {}, { type: 'dirtyStateChanged', dirty: 'yes' },
            { type: 'dirtyStateChanged' }, { type: 'other', dirty: true }],
        warnings: 0, reopen: false,
    },
    malformedClearKeepsDirty: {
        messages: [{ type: 'dirtyStateChanged', dirty: true }, { type: 'dirtyStateChanged', dirty: 0 }],
        warnings: 1, reopen: false,
    },
    untouchedNoWarn: { messages: [], warnings: 0, reopen: false },
    reopenAction: { messages: [{ type: 'dirtyStateChanged', dirty: true }], warnings: 1, reopen: true },
};

type DirtyCloseOutcome = { ok: boolean; error?: string };
type DirtyCloseLoad = { results: DirtyCloseOutcome[] } | { failure: string };

// Turns the child's raw result into per-scenario outcomes, or one failure
// message. Any infrastructure fault (spawn error, timeout, non-zero exit,
// unparseable or short output) is a failure, never a pass.
function parseDirtyCloseChild(
    result: Pick<SpawnSyncReturns<string>, 'error' | 'status' | 'signal' | 'stdout' | 'stderr'>,
    expected: number,
): DirtyCloseLoad {
    const detail = `${result.stdout ?? ''}${result.stderr ?? ''}`;
    if (result.error) { return { failure: `host child failed to run: ${result.error.message}` }; }
    if (result.status !== 0) {
        return { failure: `host child exited with status ${result.status} (signal ${result.signal}): ${detail}` };
    }
    const match = /RESULTS:(.*)$/s.exec(result.stdout ?? '');
    if (!match) { return { failure: `host child produced no results: ${detail}` }; }
    try {
        const results = JSON.parse(match[1]);
        if (!Array.isArray(results) || results.length !== expected) {
            return { failure: `host child returned the wrong number of results: ${match[1]}` };
        }
        return { results };
    } catch (error) {
        return { failure: `host child results were not valid JSON: ${(error as Error).message}` };
    }
}

// One child for the whole suite, started on first use; success and failure are
// both cached so every dependent case reports the same message.
let dirtyCloseLoad: DirtyCloseLoad | undefined;
function dirtyCloseResult(name: string): DirtyCloseOutcome {
    if (!dirtyCloseLoad) {
        dirtyCloseLoad = parseDirtyCloseChild(spawnSync(process.execPath, [
            '-r', require.resolve('ts-node/register/transpile-only'),
            '-e', DIRTY_CLOSE_HOST,
            require.resolve('../../webview/PreviewPanel'),
            JSON.stringify(Object.values(DIRTY_CLOSE_SCENARIOS)),
        ], { encoding: 'utf8', timeout: 120000 }), Object.keys(DIRTY_CLOSE_SCENARIOS).length);
    }
    if ('failure' in dirtyCloseLoad) { return { ok: false, error: dirtyCloseLoad.failure }; }
    return dirtyCloseLoad.results[Object.keys(DIRTY_CLOSE_SCENARIOS).indexOf(name)];
}

function verifyDirtyClose(name: keyof typeof DIRTY_CLOSE_SCENARIOS): void {
    const outcome = dirtyCloseResult(name);
    assert.ok(outcome.ok, outcome.error);
}

describe('isDirtyStateChangedMessage — the host guard (#174)', () => {
    it('accepts a dirty and a clean report', () => {
        assert.strictEqual(isDirtyStateChangedMessage({ type: 'dirtyStateChanged', dirty: true }), true);
        assert.strictEqual(isDirtyStateChangedMessage({ type: 'dirtyStateChanged', dirty: false }), true);
    });
    it('rejects non-objects and other message types', () => {
        for (const bad of [null, undefined, 'dirtyStateChanged', 1, [], {}, { type: 'other', dirty: true }]) {
            assert.strictEqual(isDirtyStateChangedMessage(bad), false, JSON.stringify(bad));
        }
    });
    it('rejects a dirty value that is not a boolean', () => {
        for (const dirty of ['yes', 'true', 1, 0, null, undefined, {}]) {
            assert.strictEqual(isDirtyStateChangedMessage({ type: 'dirtyStateChanged', dirty }), false, String(dirty));
        }
        assert.strictEqual(isDirtyStateChangedMessage({ type: 'dirtyStateChanged' }), false);
    });
});

describe('dirty-close child result validation', () => {
    const okRecords = JSON.stringify(Object.keys(DIRTY_CLOSE_SCENARIOS).map(() => ({ ok: true })));
    const base = { error: undefined, status: 0, signal: null, stdout: 'RESULTS:' + okRecords, stderr: '' };
    const n = Object.keys(DIRTY_CLOSE_SCENARIOS).length;

    it('accepts a clean exit with one record per scenario', () => {
        assert.ok('results' in parseDirtyCloseChild(base, n));
    });
    it('fails on a non-zero exit even when the results look successful', () => {
        const load = parseDirtyCloseChild({ ...base, status: 1, stderr: 'boom' }, n);
        assert.ok('failure' in load && /status 1/.test(load.failure));
    });
    it('fails on a spawn error, a timeout signal, bad JSON and a short result list', () => {
        assert.ok('failure' in parseDirtyCloseChild({ ...base, error: new Error('ETIMEDOUT') }, n));
        assert.ok('failure' in parseDirtyCloseChild({ ...base, status: null, signal: 'SIGTERM' }, n));
        assert.ok('failure' in parseDirtyCloseChild({ ...base, stdout: 'RESULTS:{' }, n));
        assert.ok('failure' in parseDirtyCloseChild({ ...base, stdout: 'RESULTS:[{"ok":true}]' }, n));
    });
});

describe('dirty-close warning — real PreviewPanel callbacks', function () {
    this.timeout(150000);

    it('warns once when an actual dirty message precedes disposal', () => {
        verifyDirtyClose('warnsOnce');
    });

    it('does not warn after the client clears its dirty state', () => {
        verifyDirtyClose('clearedNoWarn');
    });

    it('rejects malformed and unrelated messages without making the panel dirty', () => {
        verifyDirtyClose('malformedIgnored');
    });

    it('does not let a malformed clear message erase an existing dirty state', () => {
        verifyDirtyClose('malformedClearKeepsDirty');
    });

    it('does not warn when an untouched panel closes', () => {
        verifyDirtyClose('untouchedNoWarn');
    });

    it('reopens the native editor through the warning action', () => {
        verifyDirtyClose('reopenAction');
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
