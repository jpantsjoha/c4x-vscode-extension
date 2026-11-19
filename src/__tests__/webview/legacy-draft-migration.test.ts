import * as assert from 'assert';
import { migrateLegacyDraftState, pickPersistedEditFields, isPersistableViewport } from '../../webview/previewClientScript';
import { isPersistedDraftState } from '../../webview/draftState';

const legacy = {
    schemaVersion: 1, editMode: true, selectedNodeId: 'web', zoom: 2, panX: 12, panY: -8,
    stagedEdits: [{ id: 'web', x: 13, label: 'Renamed', addRelationship: [
        { targetId: 'api', label: 'Calls', relType: 'async', technology: 'HTTPS' },
    ] }],
};
describe('explicit legacy draft recovery (#186)', () => {
    it('retains camera, moves, properties and current connect fields on migration without changing the original', () => {
        const before = JSON.stringify(legacy);
        const migrated = migrateLegacyDraftState(legacy, 'file:///chosen.c4x', pickPersistedEditFields);
        assert.strictEqual(isPersistedDraftState(migrated), true);
        assert.deepStrictEqual(migrated, { ...legacy, schemaVersion: 2, scope: 'file:///chosen.c4x' });
        assert.strictEqual(JSON.stringify(legacy), before);
    });
    it('never rebinds an already scoped draft to a different diagram', () => {
        const v2 = { ...legacy, schemaVersion: 2, scope: 'file:///first.c4x' };
        assert.strictEqual(migrateLegacyDraftState(v2, 'file:///second.c4x', pickPersistedEditFields), v2);
    });
    it('leaves malformed additions for the schema validator instead of throwing or accepting them', () => {
        for (const addRelationship of [[null], [{}], 'bad']) {
            const invalid = { ...legacy, stagedEdits: [{ id: 'web', addRelationship }] };
            const migrated = migrateLegacyDraftState(invalid, 'file:///chosen.c4x', pickPersistedEditFields);
            assert.strictEqual(isPersistedDraftState(migrated), false);
        }
    });
    it('cannot persist a hidden or non-finite viewport', () => {
        for (const [w, h] of [[0, 100], [100, 0], [0, 0], [-1, 2], [Infinity, 100], [100, NaN]]) {
            assert.strictEqual(isPersistableViewport(w, h), false);
        }
        assert.strictEqual(isPersistableViewport(640, 480), true);
    });
});
