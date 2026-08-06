import * as assert from 'assert';
import {
    applyEdgeGeometry,
    formatEdgePathD,
    type AttributeTarget,
} from '../../webview/previewClientScript';

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
