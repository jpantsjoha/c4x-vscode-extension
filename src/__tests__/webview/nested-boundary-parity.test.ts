import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, LayoutResult } from '../../layout/DagreLayoutEngine';
import { buildBoundarySnapshots } from '../../webview/boundarySnapshots';
import { buildNodeSnapshots } from '../../webview/nodeSnapshots';
import { computeBoundaryWrap, BoundaryWrapFrame, planBoundaryMove, BoundaryMoveItem } from '../../webview/previewClientScript';
import type { VisualLayoutBoundarySnapshot } from '../../webview/visualLayoutProtocol';

/**
 * Host/editor parity for boundaries nested in C4X source (#339).
 *
 * Until #339 a parsed nested boundary never reached the editor as a child of
 * its parent (`childBoundaryIds` was empty), so neither the host nor the
 * editor could keep it inside. These cases start from DSL, not hand-built
 * views, so they cover the parser-to-snapshot path the editor depends on.
 */

interface Box { x: number; y: number; width: number; height: number }

const box = (value: Box): Box => ({ x: value.x, y: value.y, width: value.width, height: value.height });

function layoutOf(dsl: string): LayoutResult {
    const model = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'nested-boundary-parity');
    return new DagreLayoutEngine().layoutSync(model.views[0]);
}

function snapshotFrame(snapshot: VisualLayoutBoundarySnapshot): BoundaryWrapFrame {
    const frame: BoundaryWrapFrame = box(snapshot);
    if (snapshot.manualX) { frame.manualX = true; }
    if (snapshot.manualY) { frame.manualY = true; }
    if (snapshot.manualWidth !== undefined) { frame.manualWidth = snapshot.manualWidth; }
    if (snapshot.manualHeight !== undefined) { frame.manualHeight = snapshot.manualHeight; }
    return frame;
}

/** The editor's direct-children boxes for one boundary, from the snapshot it receives. */
function childBoxes(layout: LayoutResult, snapshot: VisualLayoutBoundarySnapshot, frames: Map<string, Box>): Box[] {
    const boxes: Box[] = [];
    for (const id of snapshot.childNodeIds) {
        const el = layout.elements.find(e => e.id === id);
        if (el) { boxes.push(box(el)); }
    }
    for (const id of snapshot.childBoundaryIds) {
        const frame = frames.get(id);
        if (frame) { boxes.push(frame); }
    }
    return boxes;
}

const IBS_COMPONENT = readFileSync(
    path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs', '04-component.c4x'), 'utf8');

const NESTED_SUBGRAPHS = (inner: { x: number; y: number }): string => `graph TB
    subgraph Outer {
        A[Alpha<br/>Container]
        subgraph Inner $x="${inner.x}", $y="${inner.y}" {
            B[Beta<br/>Container]
        }
    }
    A --> B
`;

describe('nested boundaries — host/editor parity from parsed C4X (#339)', () => {
    it('the editor snapshot lists the nested boundary as a child of its parent', () => {
        const snapshots = buildBoundarySnapshots(layoutOf(IBS_COMPONENT));
        const ibs = snapshots.find(s => s.label === 'Internet Banking System')!;
        const backend = snapshots.find(s => s.label === 'Backend')!;
        assert.deepStrictEqual(ibs.childBoundaryIds, [backend.id]);
        assert.deepStrictEqual(ibs.childNodeIds, ['ui', 'statements', 'db']);
        assert.deepStrictEqual(backend.childBoundaryIds, []);
    });

    it('every host frame is a fixed point of the editor re-wrap, innermost first', () => {
        const layout = layoutOf(IBS_COMPONENT);
        const snapshots = buildBoundarySnapshots(layout);
        const frames = new Map(snapshots.map(s => [s.id, box(s)]));
        for (const snapshot of [...snapshots].reverse()) {
            const wrapped = computeBoundaryWrap(snapshotFrame(snapshot), childBoxes(layout, snapshot, frames));
            assert.deepStrictEqual(wrapped, box(snapshot), `editor re-wrap moves ${snapshot.id} at rest`);
        }
    });

    it('moving the inner boundary: the editor predicts the parent frame the host saves', () => {
        const before = layoutOf(NESTED_SUBGRAPHS({ x: 400, y: 400 }));
        const beforeSnapshots = buildBoundarySnapshots(before);
        const outer = beforeSnapshots.find(s => s.label === 'Outer')!;
        const inner = beforeSnapshots.find(s => s.label === 'Inner')!;

        // The editor moves the inner frame rigidly, then re-wraps its parent.
        const moved = { x: 700, y: 650 };
        const frames = new Map(beforeSnapshots.map(s => [s.id, box(s)]));
        frames.set(inner.id, { ...box(inner), x: moved.x, y: moved.y });
        const predicted = computeBoundaryWrap(snapshotFrame(outer), childBoxes(before, outer, frames));

        // The host renders the saved $x/$y.
        const after = buildBoundarySnapshots(layoutOf(NESTED_SUBGRAPHS(moved)));
        const savedOuter = after.find(s => s.label === 'Outer')!;
        const savedInner = after.find(s => s.label === 'Inner')!;
        assert.deepStrictEqual(box(savedInner), { ...box(inner), x: moved.x, y: moved.y });
        assert.deepStrictEqual(predicted, box(savedOuter));
        assert.ok(savedOuter.x <= savedInner.x && savedOuter.y + 40 <= savedInner.y);
        assert.ok(savedOuter.x + savedOuter.width >= savedInner.x + savedInner.width);
        assert.ok(savedOuter.y + savedOuter.height >= savedInner.y + savedInner.height);
    });

    it('moving the outer frame: a pinned nested frame and its contents stay where the host keeps them (#339 review)', () => {
        const dsl = (outer: { x: number; y: number }): string => `graph TB
    subgraph Outer $x="${outer.x}", $y="${outer.y}" {
        A[Alpha<br/>Container]
        subgraph Inner $x="400", $y="500" {
            B[Beta<br/>Container]
        }
    }
    A --> B
`;
        const before = layoutOf(dsl({ x: 300, y: 300 }));
        const beforeSnapshots = buildBoundarySnapshots(before);
        const outer = beforeSnapshots.find(s => s.label === 'Outer')!;
        const inner = beforeSnapshots.find(s => s.label === 'Inner')!;
        assert.ok(inner.manualX && inner.manualY, 'the editor is told Inner is pinned');

        // The editor's rule: a pinned nested frame holds its axes, and so do its
        // contents; unpinned contents of the moved frame follow it.
        const step = { x: 10, y: 10 };
        const nodes = new Map(buildNodeSnapshots(before).map(n => [n.id, box(n)]));
        for (const id of outer.childNodeIds) {
            const n = nodes.get(id)!;
            nodes.set(id, { ...n, x: n.x + step.x, y: n.y + step.y });
        }
        const frames = new Map(beforeSnapshots.map(s => [s.id, box(s)]));
        const movedLayout: LayoutResult = {
            ...before,
            elements: before.elements.map(e => ({ ...e, ...nodes.get(e.id)! })),
        };
        const predictedOuter = computeBoundaryWrap(
            { ...snapshotFrame(outer), x: outer.x + step.x, y: outer.y + step.y, manualX: true, manualY: true },
            childBoxes(movedLayout, outer, frames),
        );

        const after = buildBoundarySnapshots(layoutOf(dsl({ x: 300 + step.x, y: 300 + step.y })));
        const savedInner = after.find(s => s.label === 'Inner')!;
        const savedOuter = after.find(s => s.label === 'Outer')!;
        assert.deepStrictEqual(box(savedInner), box(inner), 'the host keeps the pinned frame at its $x/$y');
        assert.strictEqual(savedInner.x, 400);
        assert.strictEqual(savedInner.y, 500);
        assert.deepStrictEqual(predictedOuter, box(savedOuter));
    });

    it('node snapshots tell the editor which nodes carry their own $x/$y', () => {
        const nodes = buildNodeSnapshots(layoutOf(`graph TB
    A[Alpha<br/>Container] $x="120"
    B[Beta<br/>Container] $x="40", $y="60"
    C[Gamma<br/>Container]
`));
        const flags = nodes.map(n => [n.id, n.manualX === true, n.manualY === true]);
        assert.deepStrictEqual(flags, [['A', true, false], ['B', true, true], ['C', false, false]]);
    });

    it('a staged nested move survives a later move of its parent (#339 delta review)', () => {
        const dsl = (outer: { x: number; y: number }, inner: { x: number; y: number }): string => `graph TB
    subgraph Outer $x="${outer.x}", $y="${outer.y}" {
        A[Alpha<br/>Container]
        subgraph Inner $x="${inner.x}", $y="${inner.y}" {
            B[Beta<br/>Container]
        }
    }
    A --> B
`;
        const before = layoutOf(dsl({ x: 300, y: 300 }, { x: 400, y: 500 }));
        const boundarySnaps = buildBoundarySnapshots(before);
        const nodeSnaps = buildNodeSnapshots(before);
        const outer = boundarySnaps.find(s => s.label === 'Outer')!;
        const inner = boundarySnaps.find(s => s.label === 'Inner')!;

        // Editor state: Inner already moved by (10, 10) and staged; B followed it.
        const staged = new Set([inner.id]);
        const current = new Map<string, { x: number; y: number }>();
        const items = (list: Array<{ id: string; x: number; y: number; manualX?: boolean; manualY?: boolean;
            childNodeIds?: string[]; childBoundaryIds?: string[] }>): BoundaryMoveItem[] => list.map(item => ({
            id: item.id, x: item.x, y: item.y,
            currentX: current.get(item.id)?.x ?? item.x,
            currentY: current.get(item.id)?.y ?? item.y,
            pinnedX: item.manualX === true || staged.has(item.id),
            pinnedY: item.manualY === true || staged.has(item.id),
            childNodeIds: item.childNodeIds, childBoundaryIds: item.childBoundaryIds,
        }));
        const firstMove = planBoundaryMove(inner.id, 10, 10, items(boundarySnaps), items(nodeSnaps));
        current.set(inner.id, { x: inner.x + 10, y: inner.y + 10 });
        for (const n of firstMove.nodes) { current.set(n.id, { x: n.x, y: n.y }); }

        // Then Outer moves by (10, 10) before Save.
        const secondMove = planBoundaryMove(outer.id, 10, 10, items(boundarySnaps), items(nodeSnaps));
        const predictedB = secondMove.nodes.find(n => n.id === 'B')!;
        const predictedInner = secondMove.boundaries.find(b => b.id === inner.id)!;

        // Save writes Outer (310, 310) and Inner (410, 510); the host lays that out.
        const saved = layoutOf(dsl({ x: 310, y: 310 }, { x: inner.x + 10, y: inner.y + 10 }));
        const savedB = saved.elements.find(e => e.id === 'B')!;
        const savedInner = (saved.boundaries ?? []).find(b => b.boundary.label === 'Inner')!;
        assert.deepStrictEqual({ x: predictedInner.x, y: predictedInner.y }, { x: savedInner.x, y: savedInner.y });
        assert.deepStrictEqual({ x: predictedB.x, y: predictedB.y }, { x: savedB.x, y: savedB.y },
            'B keeps the displacement of its staged parent frame');
    });
});

