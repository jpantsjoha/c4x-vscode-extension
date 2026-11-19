import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, LayoutResult } from '../../layout/DagreLayoutEngine';
import { buildBoundarySnapshots } from '../../webview/boundarySnapshots';
import { buildNodeSnapshots } from '../../webview/nodeSnapshots';
import { planBoundaryMove, BoundaryMoveItem } from '../../webview/previewClientScript';

/**
 * Host/editor parity for the first drag of a boundary (#346).
 *
 * An authored $x/$y on a subgraph names the frame's displayed top-left. The
 * editor moves the frame from where it is painted and moves its unpinned
 * contents by the same step. After Save the host must lay the contents out
 * exactly where the editor painted them, whether the frame was pinned before
 * (re-pin), on one axis only, or not at all (first pin), and at any depth.
 */

interface Point { x: number; y: number }

function layoutOf(dsl: string): LayoutResult {
    const model = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'first-pin-boundary-parity');
    return new DagreLayoutEngine().layoutSync(model.views[0]);
}

function items(list: Array<{ id: string; x: number; y: number; manualX?: boolean; manualY?: boolean;
    childNodeIds?: string[]; childBoundaryIds?: string[] }>): BoundaryMoveItem[] {
    return list.map(item => ({
        id: item.id, x: item.x, y: item.y, currentX: item.x, currentY: item.y,
        pinnedX: item.manualX === true, pinnedY: item.manualY === true,
        childNodeIds: item.childNodeIds, childBoundaryIds: item.childBoundaryIds,
    }));
}

/**
 * Drag the boundary labelled `label` by `step` in the editor, then Save:
 * `saved(frame)` renders the DSL the gesture writes. Returns what the editor
 * painted before Save and what the host lays out after it, keyed by label/id.
 */
function dragAndSave(
    before: LayoutResult,
    label: string,
    step: Point,
    saved: (frame: Point) => string,
): { painted: Map<string, Point>; host: Map<string, Point> } {
    const boundarySnaps = buildBoundarySnapshots(before);
    const nodeSnaps = buildNodeSnapshots(before);
    const moved = boundarySnaps.find(s => s.label === label)!;
    const target = { x: moved.x + step.x, y: moved.y + step.y };
    const plan = planBoundaryMove(moved.id, step.x, step.y, items(boundarySnaps), items(nodeSnaps));

    const painted = new Map<string, Point>();
    painted.set(label, target);
    const labelOf = new Map(boundarySnaps.map(s => [s.id, s.label]));
    for (const b of plan.boundaries) { painted.set(labelOf.get(b.id)!, { x: b.x, y: b.y }); }
    for (const n of plan.nodes) { painted.set(n.id, { x: n.x, y: n.y }); }

    const after = layoutOf(saved(target));
    const host = new Map<string, Point>();
    for (const b of after.boundaries ?? []) { host.set(b.boundary.label, { x: b.x, y: b.y }); }
    for (const e of after.elements) { host.set(e.id, { x: e.x, y: e.y }); }
    return { painted, host };
}

function assertParity(result: { painted: Map<string, Point>; host: Map<string, Point> }): void {
    for (const [key, point] of result.painted) {
        assert.deepStrictEqual(result.host.get(key), point, `${key}: editor paint before Save differs from host layout after Save`);
    }
}

const coord = (p?: Point): string => p ? ` $x="${p.x}", $y="${p.y}"` : '';

describe('first drag of a boundary — editor paint before Save equals host layout after (#346)', () => {
    const single = (outer?: Point): string => `graph TB
    subgraph Outer${coord(outer)} {
        A[Alpha<br/>Container]
    }
`;

    it('first pin: an unpinned frame dragged by (100,100) keeps its child where the editor painted it', () => {
        const before = layoutOf(single());
        const outer = (before.boundaries ?? []).find(b => b.boundary.label === 'Outer')!;
        const a = before.elements.find(e => e.id === 'A')!;
        const result = dragAndSave(before, 'Outer', { x: 100, y: 100 }, single);
        assert.deepStrictEqual(result.painted.get('A'), { x: a.x + 100, y: a.y + 100 });
        assert.deepStrictEqual(result.host.get('Outer'), { x: outer.x + 100, y: outer.y + 100 });
        assertParity(result);
    });

    it('re-pin: a frame already pinned and dragged again keeps its child where the editor painted it', () => {
        const before = layoutOf(single({ x: 140, y: 160 }));
        assertParity(dragAndSave(before, 'Outer', { x: 30, y: -20 }, single));
    });

    it('one axis pinned: a frame with only $x keeps its child where the editor painted it', () => {
        const dsl = `graph TB
    subgraph Outer $x="200" {
        A[Alpha<br/>Container]
    }
`;
        const before = layoutOf(dsl);
        assertParity(dragAndSave(before, 'Outer', { x: 50, y: 70 }, single));
    });

    const nested = (outer?: Point, inner?: Point): string => `graph TB
    subgraph Outer${coord(outer)} {
        A[Alpha<br/>Container]
        subgraph Inner${coord(inner)} {
            B[Beta<br/>Container]
        }
    }
    A --> B
`;

    it('nested, first pin of the outer frame: the inner frame and both children stay where painted', () => {
        const before = layoutOf(nested());
        assertParity(dragAndSave(before, 'Outer', { x: 100, y: 100 }, frame => nested(frame)));
    });

    it('nested, first pin of the inner frame: its child stays where painted', () => {
        const before = layoutOf(nested());
        assertParity(dragAndSave(before, 'Inner', { x: 60, y: 80 }, frame => nested(undefined, frame)));
    });

    it('nested, first pin of the outer frame around a pinned inner frame: everything stays where painted', () => {
        const inner = { x: 400, y: 500 };
        const before = layoutOf(nested(undefined, inner));
        assertParity(dragAndSave(before, 'Outer', { x: 100, y: 100 }, frame => nested(frame, inner)));
    });
});
