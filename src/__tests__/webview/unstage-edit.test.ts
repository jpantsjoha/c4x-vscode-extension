import * as assert from 'assert';
import { computeUnstage } from '../../webview/previewClientScript';

/**
 * Unit coverage for the un-stage state logic (#85).
 * computeUnstage is a pure function: it does not touch the DOM.
 */
describe('computeUnstage', () => {
    const stagedWithMove: Record<string, Record<string, unknown>> = {
        api: { x: 200, y: 300, description: 'Updated' },
        web: { label: 'Web client' },
    };

    it('removes the target entry and leaves other entries untouched', () => {
        const { updated } = computeUnstage(stagedWithMove, 'api');
        assert.strictEqual('api' in updated, false);
        assert.deepStrictEqual(updated['web'], { label: 'Web client' });
    });

    it('reports hadPosition=true when the removed entry contained x/y', () => {
        const { hadPosition } = computeUnstage(stagedWithMove, 'api');
        assert.strictEqual(hadPosition, true);
    });

    it('reports hadPosition=false when the removed entry had no position', () => {
        const { hadPosition } = computeUnstage(stagedWithMove, 'web');
        assert.strictEqual(hadPosition, false);
    });

    it('does not mutate the original map', () => {
        const original: Record<string, Record<string, unknown>> = {
            api: { description: 'Draft' },
        };
        computeUnstage(original, 'api');
        assert.ok('api' in original, 'original should still contain api after computeUnstage');
    });

    it('handles removing an id that does not exist without throwing', () => {
        const { updated, hadPosition } = computeUnstage(stagedWithMove, 'nonexistent');
        assert.strictEqual(hadPosition, false);
        assert.deepStrictEqual(Object.keys(updated).sort(), ['api', 'web']);
    });

    it('returns an empty map when the last entry is removed', () => {
        const single: Record<string, Record<string, unknown>> = {
            payments: { label: 'Payments platform' },
        };
        const { updated } = computeUnstage(single, 'payments');
        assert.deepStrictEqual(Object.keys(updated), []);
    });
});
