import * as assert from 'assert';
import {
    computeCentringPan,
    computeContentBounds,
    computeZoomToFit,
    formatMultiSelectAnnouncement,
    type NodeBounds,
    type ViewBox,
} from '../../webview/previewClientScript';

const DEFAULT_VIEWBOX: ViewBox = { x: 0, y: 0, w: 800, h: 600 };

describe('computeZoomToFit', () => {
    it('returns zoom=1, pan=0,0 when there are no nodes', () => {
        const result = computeZoomToFit([], DEFAULT_VIEWBOX);
        assert.strictEqual(result.zoom, 1.0);
        assert.strictEqual(result.panX, 0);
        assert.strictEqual(result.panY, 0);
    });

    it('centres a single node in the viewbox', () => {
        const nodes: NodeBounds[] = [{ x: 100, y: 50, width: 200, height: 100 }];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        assert.ok(result.zoom > 0 && result.zoom <= 5.0, 'zoom should be in valid range');
        // Content centre: x=200, y=100. ViewBox centre: x=400, y=300.
        // After zoom, applyZoomPan maps: minX = vb.x + dx - panX
        // where dx = (vb.w - vb.w/zoom)/2.
        // The key invariant: zoom is the min of available/content ratios.
        const availW = DEFAULT_VIEWBOX.w - 64; // padding 32 each side
        const availH = DEFAULT_VIEWBOX.h - 64;
        const expectedZoom = Math.min(availW / 200, availH / 100, 5.0);
        assert.ok(Math.abs(result.zoom - expectedZoom) < 0.001, `zoom should be ${expectedZoom}, got ${result.zoom}`);
    });

    it('fits multiple nodes by computing their combined bounding box', () => {
        const nodes: NodeBounds[] = [
            { x: 0, y: 0, width: 200, height: 100 },
            { x: 600, y: 400, width: 100, height: 80 },
        ];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        // Content spans: x 0..700, y 0..480 → w=700, h=480
        const availW = DEFAULT_VIEWBOX.w - 64;
        const availH = DEFAULT_VIEWBOX.h - 64;
        const expectedZoom = Math.min(availW / 700, availH / 480, 5.0);
        assert.ok(Math.abs(result.zoom - Math.max(0.2, expectedZoom)) < 0.001);
    });

    it('clamps zoom to maximum of 5.0', () => {
        // A tiny node in a large viewbox
        const nodes: NodeBounds[] = [{ x: 395, y: 295, width: 10, height: 10 }];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        assert.ok(result.zoom <= 5.0, `zoom should not exceed 5.0, got ${result.zoom}`);
    });

    it('clamps zoom to minimum of 0.2', () => {
        // A node larger than the viewbox
        const nodes: NodeBounds[] = [{ x: 0, y: 0, width: 10000, height: 8000 }];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        assert.ok(result.zoom >= 0.2, `zoom should be at least 0.2, got ${result.zoom}`);
    });

    it('returns sensible values for a standard diagram layout', () => {
        // Six nodes spread across a typical diagram canvas
        const nodes: NodeBounds[] = [
            { x: 100, y: 50, width: 200, height: 100 },
            { x: 500, y: 50, width: 220, height: 100 },
            { x: 100, y: 230, width: 200, height: 80 },
            { x: 500, y: 230, width: 220, height: 80 },
            { x: 340, y: 360, width: 220, height: 80 },
            { x: 620, y: 360, width: 150, height: 80 },
        ];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        assert.ok(result.zoom >= 0.2, 'zoom must be >= 0.2');
        assert.ok(result.zoom <= 5.0, 'zoom must be <= 5.0');
        assert.ok(Number.isFinite(result.panX), 'panX must be finite');
        assert.ok(Number.isFinite(result.panY), 'panY must be finite');
    });

    it('handles a non-origin viewBox offset', () => {
        const viewBox: ViewBox = { x: 100, y: 50, w: 800, h: 600 };
        const nodes: NodeBounds[] = [{ x: 200, y: 100, width: 200, height: 100 }];
        const result = computeZoomToFit(nodes, viewBox);
        assert.ok(Number.isFinite(result.zoom));
        assert.ok(Number.isFinite(result.panX));
        assert.ok(Number.isFinite(result.panY));
    });

    it('does not mutate the input nodes array', () => {
        const nodes: NodeBounds[] = [{ x: 100, y: 50, width: 200, height: 100 }];
        const before = JSON.stringify(nodes);
        computeZoomToFit(nodes, DEFAULT_VIEWBOX);
        assert.strictEqual(JSON.stringify(nodes), before);
    });

    // ── #160: the fit is against the viewport, in CSS pixels ─────────────────

    it('fits against the supplied viewport rather than the anchor box', () => {
        const nodes: NodeBounds[] = [{ x: 0, y: 0, width: 400, height: 300 }];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX, 32, { w: 1200, h: 900 });
        // 1200 − 64 = 1136 px across 400 units; 900 − 64 = 836 px across 300.
        assert.ok(Math.abs(result.zoom - Math.min(1136 / 400, 836 / 300)) < 0.001);
    });

    it('centres the content regardless of the zoom it settled on', () => {
        // Content sits in the top-left quadrant of the canvas; the pan must
        // move the camera by the full offset, not a zoom-scaled fraction of it.
        const nodes: NodeBounds[] = [{ x: 0, y: 0, width: 200, height: 100 }];
        const result = computeZoomToFit(nodes, DEFAULT_VIEWBOX, 32, { w: 200, h: 150 });
        assert.strictEqual(result.panX, 400 - 100);
        assert.strictEqual(result.panY, 300 - 50);
    });
});

describe('computeContentBounds', () => {
    it('returns null for an empty set', () => {
        assert.strictEqual(computeContentBounds([]), null);
    });

    it('returns null when the content has no area', () => {
        assert.strictEqual(computeContentBounds([{ x: 10, y: 10, width: 0, height: 0 }]), null);
    });

    it('unions every box', () => {
        const bounds = computeContentBounds([
            { x: 100, y: 40, width: 200, height: 100 },
            { x: 500, y: 400, width: 100, height: 80 },
        ]);
        assert.deepStrictEqual(bounds, { x: 100, y: 40, w: 500, h: 440 });
    });
});

describe('computeCentringPan', () => {
    it('is zero when the content is already centred on the anchor', () => {
        const nodes: NodeBounds[] = [{ x: 300, y: 250, width: 200, height: 100 }];
        assert.deepStrictEqual(computeCentringPan(nodes, DEFAULT_VIEWBOX), { panX: 0, panY: 0 });
    });

    it('is the offset between the anchor centre and the content centre', () => {
        const nodes: NodeBounds[] = [{ x: 0, y: 0, width: 200, height: 200 }];
        assert.deepStrictEqual(computeCentringPan(nodes, DEFAULT_VIEWBOX), { panX: 300, panY: 200 });
    });

    it('honours a non-origin anchor box', () => {
        const anchor: ViewBox = { x: 100, y: 50, w: 800, h: 600 };
        const nodes: NodeBounds[] = [{ x: 0, y: 0, width: 200, height: 200 }];
        assert.deepStrictEqual(computeCentringPan(nodes, anchor), { panX: 400, panY: 250 });
    });

    it('leaves the camera alone when there is nothing to centre', () => {
        assert.deepStrictEqual(computeCentringPan([], DEFAULT_VIEWBOX), { panX: 0, panY: 0 });
    });
});

describe('formatMultiSelectAnnouncement', () => {
    it('uses singular form for exactly one element', () => {
        const result = formatMultiSelectAnnouncement(1);
        assert.ok(result.includes('1'), 'should include count');
        assert.ok(!result.includes('elements'), 'should not use plural form');
        assert.ok(result.includes('element'), 'should use singular form');
    });

    it('uses plural form for two or more elements', () => {
        const result = formatMultiSelectAnnouncement(2);
        assert.ok(result.includes('2'), 'should include count');
        assert.ok(result.includes('elements'), 'should use plural form');
    });

    it('uses plural form for larger counts', () => {
        const result = formatMultiSelectAnnouncement(5);
        assert.ok(result.includes('5'));
        assert.ok(result.includes('elements'));
    });

    it('includes the count in the string', () => {
        for (const n of [0, 1, 2, 10, 100]) {
            const result = formatMultiSelectAnnouncement(n);
            assert.ok(result.includes(String(n)), `result "${result}" should include ${n}`);
        }
    });
});
