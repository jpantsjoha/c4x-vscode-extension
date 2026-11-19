import * as assert from 'assert';
import { sanitiseSmokeNodes } from '../../webview/smokeTypes';

describe('sanitiseSmokeNodes', () => {
    const good = { id: 'a', x: 1, y: 2, w: 3, h: 4, fill: 'rgb(1, 2, 3)', stroke: 'rgb(0, 0, 0)' };

    it('keeps well-formed node reports', () => {
        assert.deepStrictEqual(sanitiseSmokeNodes([good]), [good]);
    });

    it('drops reports with a non-finite number, a non-string colour or no id', () => {
        assert.deepStrictEqual(sanitiseSmokeNodes([{ ...good, x: Infinity }, { ...good, fill: 3 }, { ...good, id: undefined }, null]), []);
    });

    it('returns nothing for a non-array and caps the count and string lengths', () => {
        assert.deepStrictEqual(sanitiseSmokeNodes('x'), []);
        const many = Array.from({ length: 600 }, () => ({ ...good, id: 'z'.repeat(300) }));
        const out = sanitiseSmokeNodes(many);
        assert.strictEqual(out.length, 500);
        assert.strictEqual(out[0].id.length, 200);
    });
});
