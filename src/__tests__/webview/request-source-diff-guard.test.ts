/**
 * The host accepts a source-diff request only in its exact shape: the staged
 * edits the webview sends for the diff panel are the same ones Save would
 * write, so a malformed list must be refused before it reaches the
 * materialiser.
 */
import * as assert from 'assert';
import { isRequestSourceDiffMessage, VISUAL_LAYOUT_PROTOCOL_VERSION } from '../../webview/visualLayoutProtocol';

const valid = () => ({
    type: 'visualLayout.requestSourceDiff',
    protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
    revision: '3',
    edits: [{ id: 'api', x: 120, y: 40 }, { id: 'db', w: 200, h: 90 }],
});

describe('isRequestSourceDiffMessage', () => {
    it('accepts a well-formed request', () => {
        assert.strictEqual(isRequestSourceDiffMessage(valid()), true);
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [] }), true);
    });

    it('refuses a non-object', () => {
        assert.strictEqual(isRequestSourceDiffMessage(null), false);
        assert.strictEqual(isRequestSourceDiffMessage('visualLayout.requestSourceDiff'), false);
    });

    it('refuses the wrong type or protocol version', () => {
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), type: 'visualLayout.moveElement' }), false);
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION + 1 }), false);
    });

    it('refuses a missing or oversized revision', () => {
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), revision: undefined }), false);
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), revision: 'r'.repeat(10000) }), false);
    });

    it('refuses edits that are not a list of valid staged edits', () => {
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: { id: 'api' } }), false);
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [{ x: 1 }] }), false, 'no id');
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [{ id: 'api', x: Number.NaN }] }), false, 'bad coordinate');
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [{ id: 'api', edgeId: 'rel-0' }] }), false, 'edge edit without an edge change');
        const refused: [string, Record<string, unknown>][] = [
            ['bad y', { id: 'api', y: 'top' }],
            ['bad w', { id: 'api', w: Number.POSITIVE_INFINITY }],
            ['bad h', { id: 'api', h: {} }],
            ['oversized description', { id: 'api', description: 'd'.repeat(100000) }],
            ['null label on an element', { id: 'api', label: null }],
            ['pipe in a relationship label', { id: 'rel', edgeId: 'rel-0', label: 'a|b' }],
            ['non-boolean locked', { id: 'api', locked: 'yes' }],
            ['invalid new id', { id: 'api', newId: 'not an id!' }],
            ['unknown relType', { id: 'rel', edgeId: 'rel-0', relType: 'teleports' }],
            ['relType on an element', { id: 'api', relType: 'uses' }],
            ['oversized endpoint', { id: 'rel', edgeId: 'rel-0', from: 'f'.repeat(10000) }],
            ['oversized target endpoint', { id: 'rel', edgeId: 'rel-0', to: 't'.repeat(10000) }],
        ];
        for (const [why, edit] of refused) {
            assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [edit] }), false, why);
        }
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [{ id: 'rel', edgeId: 'rel-0', label: null }] }), true, 'a null label clears a relationship label');
    });

    it('refuses two edits for the same id', () => {
        assert.strictEqual(isRequestSourceDiffMessage({ ...valid(), edits: [{ id: 'api', x: 1 }, { id: 'api', y: 2 }] }), false);
    });
});
