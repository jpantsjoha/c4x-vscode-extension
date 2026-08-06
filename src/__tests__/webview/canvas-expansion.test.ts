import * as assert from 'assert';
import { computeExpandedViewBox, type ViewBox } from '../../webview/previewClientScript';

const BASE: ViewBox = { x: 0, y: 0, w: 800, h: 600 };

describe('computeExpandedViewBox (#142 dynamic canvas growth)', () => {
    it('returns null when the node already fits', () => {
        assert.strictEqual(computeExpandedViewBox(BASE, 700, 500), null);
    });

    it('expands width when the node passes the right edge', () => {
        const expanded = computeExpandedViewBox(BASE, 900, 500);
        assert.deepStrictEqual(expanded, { x: 0, y: 0, w: 932, h: 600 });
    });

    it('expands height when the node passes the bottom edge', () => {
        const expanded = computeExpandedViewBox(BASE, 700, 700);
        assert.deepStrictEqual(expanded, { x: 0, y: 0, w: 800, h: 732 });
    });

    it('expands both dimensions together', () => {
        const expanded = computeExpandedViewBox(BASE, 900, 700);
        assert.deepStrictEqual(expanded, { x: 0, y: 0, w: 932, h: 732 });
    });

    it('respects a non-zero viewBox origin', () => {
        const offset: ViewBox = { x: 100, y: 50, w: 800, h: 600 };
        const expanded = computeExpandedViewBox(offset, 1000, 700);
        assert.deepStrictEqual(expanded, { x: 100, y: 50, w: 932, h: 682 });
    });

    it('never shrinks the canvas', () => {
        const big: ViewBox = { x: 0, y: 0, w: 2000, h: 1500 };
        assert.strictEqual(computeExpandedViewBox(big, 100, 100), null);
        assert.strictEqual(computeExpandedViewBox(big, 1900, 1400), null);
    });

    it('applies the padding beyond the node edge', () => {
        const expanded = computeExpandedViewBox(BASE, 800, 600, 64);
        assert.deepStrictEqual(expanded, { x: 0, y: 0, w: 864, h: 664 });
    });
});
