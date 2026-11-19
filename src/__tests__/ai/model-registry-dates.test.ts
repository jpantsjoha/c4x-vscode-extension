import * as assert from 'assert';
import {
    DEFAULT_IMAGE_MODEL,
    DEFAULT_MODEL,
    LITE_IMAGE_MODEL,
    LITE_MODEL,
    MODEL_REGISTRY,
    PRO_IMAGE_MODEL,
    PRO_MODEL,
    getSunsetDate,
    isRetired,
} from '../../ai/models';

// Pinned "today" for #290. Sources: Google deprecations page and live
// models.list, both read 2026-11-14.
const TODAY = Date.parse('2026-11-14T12:00:00Z');

describe('model registry dates (#290)', () => {
    const pinned: Array<[string, string]> = [
        ['gemini-2.5-pro', '2026-12-01'],
        ['gemini-2.5-flash', '2026-12-01'],
        ['gemini-2.5-flash-image', '2027-03-15'],
        ['gemini-3.1-flash-lite', '2027-05-07'],
        ['gemini-omni-1.1-flash', '2026-12-03'],
    ];

    for (const [id, date] of pinned) {
        it(`${id} sunsets ${date} and is not retired on 2026-11-14`, () => {
            assert.strictEqual(getSunsetDate(id)?.toISOString().slice(0, 10), date);
            assert.strictEqual(isRetired(id, TODAY), false);
        });
    }

    it('gemini-2.5 text models are retired from 2026-12-02', () => {
        const after = Date.parse('2026-12-02T00:00:00Z');
        assert.strictEqual(isRetired('gemini-2.5-pro', after), true);
        assert.strictEqual(isRetired('gemini-2.5-flash', after), true);
        assert.strictEqual(isRetired('gemini-2.5-flash-image', after), false);
    });

    it('gemini-2.5-pro is live at exactly 2026-12-01T00:00:00Z and retired one millisecond later', () => {
        const boundary = Date.parse('2026-12-01T00:00:00Z');
        assert.strictEqual(isRetired('gemini-2.5-pro', boundary), false);
        assert.strictEqual(isRetired('gemini-2.5-pro', boundary + 1), true);
    });

    it('channel "retired" entries stay retired', () => {
        assert.strictEqual(isRetired('gemini-3-pro-preview', TODAY), true);
    });

    it('no default or fallback model is retired on the pinned date', () => {
        const defaults = [DEFAULT_MODEL, PRO_MODEL, LITE_MODEL, DEFAULT_IMAGE_MODEL, PRO_IMAGE_MODEL, LITE_IMAGE_MODEL];
        for (const id of defaults) {
            assert.ok(MODEL_REGISTRY.some(e => e.id === id), `${id} missing from registry`);
            assert.strictEqual(isRetired(id, TODAY), false, `${id} is retired`);
        }
        for (const e of MODEL_REGISTRY.filter(m => m.isDefault)) {
            assert.strictEqual(isRetired(e.id, TODAY), false, `default ${e.id} is retired`);
        }
    });
});
