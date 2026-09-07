import * as assert from 'assert';
import {
    applyEdgeGeometry,
    computeOptimalConnectionPoints,
    formatEdgePathD,
    type AttributeTarget,
} from '../../webview/previewClientScript';
import { calculateOptimalConnectionPoints } from '../../render/EdgeRouter';

class FakeAttributeTarget implements AttributeTarget {
    public readonly attributes: Record<string, string> = {};
    setAttribute(name: string, value: string): void {
        this.attributes[name] = value;
    }
}

/**
 * Mirrors the SvgBuilder `g.edge` structure: the transparent hit-area path is
 * the FIRST path child, the visible stroked path (with the arrowhead marker)
 * is the SECOND. Order matters — a `querySelector('path')` lookup returns the
 * hit-area and leaves the visible line behind.
 */
function makeEdgeGroup(options?: { withLabel?: boolean }) {
    const hitArea = new FakeAttributeTarget();
    const visible = new FakeAttributeTarget();
    const label = options?.withLabel === false ? null : new FakeAttributeTarget();
    return {
        hitArea,
        visible,
        label,
        querySelectorAll(selector: string): AttributeTarget[] {
            return selector === 'path' ? [hitArea, visible] : [];
        },
        querySelector(selector: string): AttributeTarget | null {
            return selector === 'text' ? label : null;
        },
    };
}

describe('formatEdgePathD', () => {
    it('formats a straight M/L path with two-decimal coordinates', () => {
        const d = formatEdgePathD({ from: { x: 100, y: 120.5 }, to: { x: 500.25, y: 400 } });
        assert.strictEqual(d, 'M100.00,120.50 L500.25,400.00');
    });
});

describe('applyEdgeGeometry', () => {
    const points = { from: { x: 10, y: 20 }, to: { x: 210, y: 120 } };
    const expectedD = 'M10.00,20.00 L210.00,120.00';

    it('updates the visible path, not only the hit-area path (UAT regression)', () => {
        const edge = makeEdgeGroup();
        applyEdgeGeometry(edge, points);
        assert.strictEqual(edge.hitArea.attributes['d'], expectedD, 'hit-area path should be updated');
        assert.strictEqual(edge.visible.attributes['d'], expectedD, 'visible path must also be updated');
    });

    it('re-centres the label at the path midpoint with the standard -6 offset', () => {
        const edge = makeEdgeGroup();
        applyEdgeGeometry(edge, points);
        assert.strictEqual(edge.label?.attributes['x'], '110.00');
        assert.strictEqual(edge.label?.attributes['y'], '64.00');
    });

    it('still updates both paths when the edge has no label', () => {
        const edge = makeEdgeGroup({ withLabel: false });
        applyEdgeGeometry(edge, points);
        assert.strictEqual(edge.hitArea.attributes['d'], expectedD);
        assert.strictEqual(edge.visible.attributes['d'], expectedD);
    });
});

describe('computeOptimalConnectionPoints', () => {
    it('connects Bottom to Top when target is below source', () => {
        const from = { x: 100, y: 50, width: 120, height: 80 };
        const to = { x: 100, y: 250, width: 120, height: 80 };
        const points = computeOptimalConnectionPoints(from, to);
        assert.deepStrictEqual(points.from, { x: 160, y: 130 }); // Bottom center
        assert.deepStrictEqual(points.to, { x: 160, y: 250 });   // Top center
    });

    it('connects Top to Bottom when target is above source', () => {
        const from = { x: 100, y: 250, width: 120, height: 80 };
        const to = { x: 100, y: 50, width: 120, height: 80 };
        const points = computeOptimalConnectionPoints(from, to);
        assert.deepStrictEqual(points.from, { x: 160, y: 250 }); // Top center
        assert.deepStrictEqual(points.to, { x: 160, y: 130 });   // Bottom center
    });

    it('connects Right to Left when target is to the right of source', () => {
        const from = { x: 50, y: 100, width: 100, height: 60 };
        const to = { x: 250, y: 100, width: 100, height: 60 };
        const points = computeOptimalConnectionPoints(from, to);
        assert.deepStrictEqual(points.from, { x: 150, y: 130 }); // Right center
        assert.deepStrictEqual(points.to, { x: 250, y: 130 });   // Left center
    });

    it('connects Left to Right when target is to the left of source', () => {
        const from = { x: 250, y: 100, width: 100, height: 60 };
        const to = { x: 50, y: 100, width: 100, height: 60 };
        const points = computeOptimalConnectionPoints(from, to);
        assert.deepStrictEqual(points.from, { x: 250, y: 130 }); // Left center
        assert.deepStrictEqual(points.to, { x: 150, y: 130 });   // Right center
    });
});

describe('computeOptimalConnectionPoints parity with the host EdgeRouter', () => {
    // The webview script is assembled from fn.toString(), so it cannot import
    // EdgeRouter and the algorithm is duplicated. "Matches line-for-line" was a
    // comment; this makes it a test. If either copy changes, the arrows a user
    // sees while dragging stop matching the arrows the host draws after save.
    it('produces identical anchors for every box pair on a grid, including overlapping, diagonal and enclosing ones', () => {
        const sizes = [
            { width: 120, height: 80 },
            { width: 60, height: 200 },
            { width: 400, height: 300 }, // large enough to enclose either of the others: a boundary around a node
        ];
        const origins = [-150, -40, 0, 30, 90, 200];
        const boxes: Array<{ x: number; y: number; width: number; height: number }> = [];
        for (const size of sizes) {
            for (const x of origins) {
                for (const y of origins) {
                    boxes.push({ x, y, ...size });
                }
            }
        }

        let compared = 0;
        for (const from of boxes) {
            for (const to of boxes) {
                const host = calculateOptimalConnectionPoints(from, to);
                const client = computeOptimalConnectionPoints(from, to);
                assert.deepStrictEqual(
                    client,
                    { from: host.from, to: host.to },
                    `anchor mismatch for ${JSON.stringify(from)} -> ${JSON.stringify(to)}`,
                );
                compared++;
            }
        }
        assert.ok(compared >= 10000, `grid too small to mean anything: ${compared} pairs`);
    });
});
