import * as assert from 'assert';
import { isPersistedDraftState } from '../../webview/draftState';
import {
    computeUnstage,
    deserializeDraftState,
    serializeDraftState,
} from '../../webview/previewClientScript';

/**
 * Unit coverage for boundary frame staging/revert state (#137).
 *
 * Boundary edits carry a boundaryId equal to the snapshot id plus optional
 * geometry fields (x/y for moves, w/h for resizes). The pure state helpers
 * used by the client script must preserve these fields through unstage and
 * draft persistence round-trips.
 */
describe('Boundary staging state (#137)', () => {
    it('computeUnstage removes a boundary move edit and reports a position change', () => {
        const staged: Record<string, Record<string, unknown>> = {
            'backend-boundary-0': { boundaryId: 'backend-boundary-0', x: 120, y: 240 },
        };

        const { updated, hadPosition } = computeUnstage(staged, 'backend-boundary-0');
        assert.strictEqual(hadPosition, true);
        assert.strictEqual('backend-boundary-0' in updated, false);
    });

    it('computeUnstage removes a boundary resize edit and reports no position change', () => {
        const staged: Record<string, Record<string, unknown>> = {
            'backend-boundary-0': { boundaryId: 'backend-boundary-0', w: 500, h: 400 },
        };

        const { updated, hadPosition } = computeUnstage(staged, 'backend-boundary-0');
        assert.strictEqual(hadPosition, false);
        assert.strictEqual('backend-boundary-0' in updated, false);
    });

    it('computeUnstage preserves unrelated edits when removing a boundary entry', () => {
        const staged: Record<string, Record<string, unknown>> = {
            'backend-boundary-0': { boundaryId: 'backend-boundary-0', x: 120, y: 240 },
            api: { label: 'API Gateway' },
        };

        const { updated } = computeUnstage(staged, 'backend-boundary-0');
        assert.deepStrictEqual(updated['api'], { label: 'API Gateway' });
        assert.strictEqual('backend-boundary-0' in updated, false);
    });

    it('serializeDraftState round-trips boundary geometry fields', () => {
        const staged: Record<string, Record<string, unknown>> = {
            'backend-boundary-0': { boundaryId: 'backend-boundary-0', x: 120, y: 240, w: 500, h: 400 },
        };

        const state = serializeDraftState(staged, null, false);
        assert.strictEqual(isPersistedDraftState(state), true);
        const edit = state.stagedEdits[0];
        assert.strictEqual(edit.id, 'backend-boundary-0');
        assert.strictEqual(edit.boundaryId, 'backend-boundary-0');
        assert.strictEqual(edit.x, 120);
        assert.strictEqual(edit.y, 240);
        assert.strictEqual(edit.w, 500);
        assert.strictEqual(edit.h, 400);

        const restored = deserializeDraftState(state);
        assert.deepStrictEqual(restored['backend-boundary-0'], {
            boundaryId: 'backend-boundary-0',
            x: 120,
            y: 240,
            w: 500,
            h: 400,
        });
    });

    it('rejects persisted boundary edits with malformed geometry', () => {
        const valid = serializeDraftState({
            'backend-boundary-0': { boundaryId: 'backend-boundary-0', w: 100, h: 100 },
        }, null, false);
        assert.strictEqual(isPersistedDraftState(valid), true);

        const badW = {
            ...valid,
            stagedEdits: [{ id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', w: -1 }],
        };
        assert.strictEqual(isPersistedDraftState(badW), false);

        const badBoundaryId = {
            ...valid,
            stagedEdits: [{ id: 'backend-boundary-0', boundaryId: '', w: 100, h: 100 }],
        };
        assert.strictEqual(isPersistedDraftState(badBoundaryId), false);
    });
});
