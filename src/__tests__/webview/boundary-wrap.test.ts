import * as assert from 'assert';
import {
    computeBoundaryWrap,
    BoundaryWrapFrame,
    BOUNDARY_LABEL_OFFSET_X,
    BOUNDARY_LABEL_OFFSET_Y,
} from '../../webview/previewClientScript';
import { DagreLayoutEngine, PositionedBoundary, PositionedElement } from '../../layout/DagreLayoutEngine';
import { renderBoundary } from '../../render/BoundaryRenderer';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4View, C4Element, C4Boundary } from '../../model/C4Model';

/**
 * Parity between the editor's live boundary re-wrap and the host layout engine
 * (#163). The editor claims to "perfectly preview the post-save layout"; these
 * cases run the SAME geometry through both and require identical frames.
 *
 * The host reference is `DagreLayoutEngine.adjustBoundariesToContainChildren`.
 * It is private, so each case drives it the way a user does: build a C4X model
 * with $x/$y/$w/$h metadata, run `layoutSync`, and read the boundary back.
 */

interface Box { x: number; y: number; width: number; height: number }

function box(value: Box): Box {
    return { x: value.x, y: value.y, width: value.width, height: value.height };
}

function frameOf(boundary: PositionedBoundary): Box {
    return box(boundary);
}

/** The frame plus the manual flags the editor receives in its layout snapshot. */
function snapshotFrame(boundary: PositionedBoundary): BoundaryWrapFrame {
    const frame: BoundaryWrapFrame = box(boundary);
    if (boundary.manualX) {
        frame.manualX = true;
    }
    if (boundary.manualY) {
        frame.manualY = true;
    }
    if (boundary.manualWidth !== undefined) {
        frame.manualWidth = boundary.manualWidth;
    }
    if (boundary.manualHeight !== undefined) {
        frame.manualHeight = boundary.manualHeight;
    }
    return frame;
}

function layout(view: C4View): {
    boundary: (id: string) => PositionedBoundary;
    element: (id: string) => PositionedElement;
} {
    const result = new DagreLayoutEngine().layoutSync(view);
    // Every fixture keeps its geometry well clear of the origin so
    // `normalizeOrigin` (which translates the whole scene when anything goes
    // negative) never runs. If it did, the host frames would be shifted by an
    // amount the editor cannot know about and the comparison would be a lie.
    for (const b of result.boundaries ?? []) {
        assert.ok(b.x >= 0 && b.y >= 0, `fixture drifted negative on ${b.id}; normalizeOrigin would translate the scene`);
    }
    return {
        boundary: (id: string) => {
            const found = (result.boundaries ?? []).find(b => b.id === id);
            assert.ok(found, `boundary ${id} missing from layout`);
            return found;
        },
        element: (id: string) => {
            const found = result.elements.find(e => e.id === id);
            assert.ok(found, `element ${id} missing from layout`);
            return found;
        },
    };
}

/** Two containers in one boundary, both pinned so the fixture is stable. */
function flatView(boundaryMetadata?: Record<string, string>, movedTo?: { x: number; y: number }): C4View {
    const elements: C4Element[] = [
        {
            id: 'el1',
            label: 'Element 1',
            type: 'Container',
            metadata: movedTo ? { x: String(movedTo.x), y: String(movedTo.y) } : { x: '440', y: '380' },
        },
        { id: 'el2', label: 'Element 2', type: 'Container', metadata: { x: '725', y: '380' } },
    ];
    const boundary: C4Boundary = {
        id: 'backend',
        label: 'Backend',
        direction: 'TB',
        elements: ['el1', 'el2'],
        metadata: boundaryMetadata,
    };
    return { type: 'container', direction: 'TB', elements, relationships: [], boundaries: [boundary] };
}

/** "AWS Cloud > VPC > database" from the how-to: a frame nested in a frame. */
function nestedView(outerMetadata?: Record<string, string>, movedApiTo?: { x: number; y: number }): C4View {
    const elements: C4Element[] = [
        { id: 'db', label: 'Database', type: 'Container', metadata: { x: '580', y: '560' } },
        {
            id: 'api',
            label: 'API',
            type: 'Container',
            metadata: movedApiTo ? { x: String(movedApiTo.x), y: String(movedApiTo.y) } : { x: '905', y: '540' },
        },
    ];
    const inner: C4Boundary = {
        id: 'vpc', label: 'VPC', direction: 'TB', elements: ['db'], metadata: { x: '540', y: '500' },
    };
    const outer: C4Boundary = {
        id: 'aws', label: 'AWS Cloud', direction: 'TB', elements: ['vpc', 'api'], metadata: outerMetadata,
    };
    return { type: 'container', direction: 'TB', elements, relationships: [], boundaries: [outer, inner] };
}

/**
 * What the editor does when a child is dragged: take the rendered layout, move
 * one node, re-wrap every enclosing frame bottom-up. Mirrors
 * `updateEnclosingBoundariesForNode` without a DOM.
 */
function previewAfterDrag(
    before: C4View,
    nodeId: string,
    to: { x: number; y: number },
): Map<string, Box> {
    const rendered = new DagreLayoutEngine().layoutSync(before);
    const nodes = new Map<string, Box>(rendered.elements.map(e => [e.id, box(e)]));
    nodes.set(nodeId, { ...nodes.get(nodeId)!, x: to.x, y: to.y });

    const frames = new Map<string, BoundaryWrapFrame>(
        (rendered.boundaries ?? []).map(b => [b.id, snapshotFrame(b)]),
    );
    const childIds = new Map<string, string[]>(
        (rendered.boundaries ?? []).map(b => [b.id, b.boundary.elements]),
    );

    // Bottom-up: innermost frames first, then their parents.
    for (const id of [...childIds.keys()].reverse()) {
        const children: Box[] = [];
        for (const childId of childIds.get(id)!) {
            const childFrame = frames.get(childId);
            if (childFrame) {
                children.push(box(childFrame));
                continue;
            }
            const childNode = nodes.get(childId);
            if (childNode) {
                children.push(childNode);
            }
        }
        const wrapped = computeBoundaryWrap(frames.get(id)!, children);
        Object.assign(frames.get(id)!, wrapped);
    }

    return new Map([...frames.entries()].map(([id, frame]) => [id, box(frame)]));
}

/** The same model after the editor saved the drag as $x/$y on the node. */
function hostAfterSave(before: C4View, nodeId: string, to: { x: number; y: number }): C4View {
    const saved: C4View = JSON.parse(JSON.stringify(before));
    const element = saved.elements.find(e => e.id === nodeId)!;
    element.metadata = { ...(element.metadata ?? {}), x: String(to.x), y: String(to.y) };
    return saved;
}

describe('computeBoundaryWrap — parity with DagreLayoutEngine (#163)', () => {
    const drag = { x: 500, y: 500 };

    const cases: Array<{ name: string; view: () => C4View; node: string; to: { x: number; y: number } }> = [
        {
            name: 'auto origin — the frame wraps to the child bounding box',
            view: () => flatView(),
            node: 'el1',
            to: drag,
        },
        {
            name: 'manual origin — $x/$y pin the frame and are never wrapped away',
            view: () => flatView({ x: '400', y: '300' }),
            node: 'el1',
            to: drag,
        },
        {
            name: 'manual $w/$h larger than the content — the frame keeps its authored size',
            view: () => flatView({ x: '400', y: '300', w: '1200', h: '900' }),
            node: 'el1',
            to: drag,
        },
        {
            name: 'manual $w/$h smaller than the content — the minimum is clamped up, never clips',
            view: () => flatView({ x: '400', y: '300', w: '50', h: '50' }),
            node: 'el1',
            to: drag,
        },
        {
            name: 'nested boundary — a child frame counts as a child of its parent frame',
            view: () => nestedView({ x: '500', y: '400' }),
            node: 'api',
            to: { x: 1400, y: 1000 },
        },
        {
            name: 'nested boundary under an auto-positioned parent',
            view: () => nestedView(),
            node: 'api',
            to: { x: 1400, y: 1000 },
        },
        {
            name: 'child dragged clean outside the frame — the frame spans the gap',
            view: () => flatView({ x: '400', y: '300' }),
            node: 'el1',
            to: { x: 1600, y: 1100 },
        },
    ];

    for (const testCase of cases) {
        it(testCase.name, () => {
            const before = testCase.view();
            const predicted = previewAfterDrag(before, testCase.node, testCase.to);
            const saved = layout(hostAfterSave(before, testCase.node, testCase.to));

            for (const [id, frame] of predicted) {
                assert.deepStrictEqual(
                    frame,
                    frameOf(saved.boundary(id)),
                    `editor preview and saved layout disagree on boundary ${id}`,
                );
            }
        });
    }

    it('the frame the host renders at rest is a fixed point of the helper', () => {
        // A settled diagram must not shift the instant the user grabs anything:
        // re-wrapping with the children exactly where the host left them has to
        // return the host's own frame.
        const rendered = new DagreLayoutEngine().layoutSync(flatView({ x: '400', y: '300', w: '1200', h: '900' }));
        const boundary = (rendered.boundaries ?? [])[0];
        const children = rendered.elements.map(box);
        assert.deepStrictEqual(computeBoundaryWrap(snapshotFrame(boundary), children), frameOf(boundary));
    });

    it('an empty boundary honours $w/$h as-is and leaves an auto frame alone', () => {
        // Mirrors the host's zero-children branch. A child drag never reaches
        // it, but the helper is the whole rule, not the part the editor uses.
        const empty: C4Boundary = { id: 'empty', label: 'Empty', direction: 'TB', elements: [], metadata: { w: '250', h: '180' } };
        const sized = layout({ type: 'container', direction: 'TB', elements: [], relationships: [], boundaries: [empty] });
        const hostFrame = sized.boundary('empty');
        assert.deepStrictEqual(
            computeBoundaryWrap(snapshotFrame(hostFrame), []),
            frameOf(hostFrame),
        );

        const auto: BoundaryWrapFrame = { x: 12, y: 34, width: 56, height: 78 };
        assert.deepStrictEqual(computeBoundaryWrap(auto, []), { x: 12, y: 34, width: 56, height: 78 });
    });

    it('does not clamp a negative origin, because the host translates the whole scene instead', () => {
        // adjustBoundariesToContainChildren lets a frame go negative and
        // normalizeOrigin shifts everything afterwards. Clamping the frame on
        // its own would shrink it relative to its children.
        const wrapped = computeBoundaryWrap({ x: 0, y: 0, width: 10, height: 10 }, [
            { x: 10, y: 10, width: 100, height: 50 },
        ]);
        assert.deepStrictEqual(wrapped, { x: -30, y: -50, width: 180, height: 150 });
    });

    it('the label offsets match the ones BoundaryRenderer paints', () => {
        const boundary: PositionedBoundary = {
            id: 'b',
            boundary: { id: 'b', label: 'Frame', direction: 'TB', elements: [] },
            x: 300,
            y: 200,
            width: 400,
            height: 250,
        };
        const svg = renderBoundary(boundary, ClassicTheme);
        const label = /<text x="([\d.]+)" y="([\d.]+)"/.exec(svg);
        assert.ok(label, 'BoundaryRenderer emitted no label');
        assert.strictEqual(Number(label[1]) - boundary.x, BOUNDARY_LABEL_OFFSET_X);
        assert.strictEqual(Number(label[2]) - boundary.y, BOUNDARY_LABEL_OFFSET_Y);
    });

    it('the padding constants are load-bearing: 40/60/40 is what parity depends on', () => {
        // Bite check. Feed the same case through the helper with one padding
        // deliberately wrong and the parity assertion must fail.
        const before = flatView();
        const rendered = new DagreLayoutEngine().layoutSync(before);
        const boundary = (rendered.boundaries ?? [])[0];
        const children = rendered.elements.map(box);

        assert.deepStrictEqual(computeBoundaryWrap(snapshotFrame(boundary), children), frameOf(boundary));
        assert.notDeepStrictEqual(
            computeBoundaryWrap(snapshotFrame(boundary), children, { paddingX: 30 }),
            frameOf(boundary),
        );
        assert.notDeepStrictEqual(
            computeBoundaryWrap(snapshotFrame(boundary), children, { paddingTop: 40 }),
            frameOf(boundary),
        );
        assert.notDeepStrictEqual(
            computeBoundaryWrap(snapshotFrame(boundary), children, { paddingBottom: 60 }),
            frameOf(boundary),
        );
    });
});

describe('computeBoundaryWrap — divergences the old inline re-wrap shipped (#163)', () => {
    // Each case re-creates what previewClientScript did before this fix and
    // shows the frame it produced was not the one the host saves.
    function legacyWrap(children: Box[]): Box {
        const minX = Math.min(...children.map(c => c.x));
        const minY = Math.min(...children.map(c => c.y));
        const maxX = Math.max(...children.map(c => c.x + c.width));
        const maxY = Math.max(...children.map(c => c.y + c.height));
        return {
            x: Math.max(0, Math.round(minX - 40)),
            y: Math.max(0, Math.round(minY - 60)),
            width: Math.round((maxX - minX) + 80),
            height: Math.round((maxY - minY) + 100),
        };
    }

    it('a manually positioned frame no longer walks to the child bounding box', () => {
        const before = flatView({ x: '400', y: '300' });
        const predicted = previewAfterDrag(before, 'el1', { x: 500, y: 500 });
        const saved = layout(hostAfterSave(before, 'el1', { x: 500, y: 500 }));
        const host = frameOf(saved.boundary('backend'));

        assert.deepStrictEqual(predicted.get('backend'), host);
        const rendered = new DagreLayoutEngine().layoutSync(before);
        const dragged = rendered.elements.map(e => (e.id === 'el1' ? { ...box(e), x: 500, y: 500 } : box(e)));
        assert.notDeepStrictEqual(legacyWrap(dragged), host, 'the legacy re-wrap moved a pinned origin');
    });

    it('a manually enlarged frame no longer shrinks back to its content', () => {
        const before = flatView({ x: '400', y: '300', w: '1200', h: '900' });
        const predicted = previewAfterDrag(before, 'el1', { x: 500, y: 500 });
        const saved = layout(hostAfterSave(before, 'el1', { x: 500, y: 500 }));
        assert.deepStrictEqual(predicted.get('backend'), frameOf(saved.boundary('backend')));
        assert.strictEqual(predicted.get('backend')!.width, 1200);
        assert.strictEqual(predicted.get('backend')!.height, 900);
    });

    it('a nested frame counts towards its parent, which the old code ignored', () => {
        const before = nestedView({ x: '500', y: '400' });
        const rendered = new DagreLayoutEngine().layoutSync(before);
        const aws = (rendered.boundaries ?? []).find(b => b.id === 'aws')!;
        const vpc = (rendered.boundaries ?? []).find(b => b.id === 'vpc')!;
        const api = rendered.elements.find(e => e.id === 'api')!;

        // Old behaviour: only childNodeIds, so `api` alone decided the frame.
        const nodesOnly = computeBoundaryWrap(snapshotFrame(aws), [box(api)]);
        const withNested = computeBoundaryWrap(snapshotFrame(aws), [box(api), box(vpc)]);
        assert.notDeepStrictEqual(nodesOnly, withNested);
        assert.ok(withNested.x <= vpc.x && withNested.y <= vpc.y, 'the parent frame must reach the nested frame');
        assert.ok(
            withNested.x + withNested.width >= vpc.x + vpc.width &&
            withNested.y + withNested.height >= vpc.y + vpc.height,
            'the parent frame must contain the nested frame',
        );
    });

    it('size is measured from the frame origin, not from the child extent', () => {
        // A pinned frame with its children pushed to one side: the extent is
        // narrow, the span from the origin is not.
        const frame: BoundaryWrapFrame = { x: 100, y: 100, width: 200, height: 200, manualX: true, manualY: true };
        const children: Box[] = [{ x: 900, y: 700, width: 240, height: 130 }];
        const wrapped = computeBoundaryWrap(frame, children);
        assert.deepStrictEqual(wrapped, { x: 100, y: 100, width: 1080, height: 770 });
        // The extent-based arithmetic the editor used produced 320 x 270 — a
        // frame that ends 860px short of its own child.
        assert.notDeepStrictEqual(legacyWrap(children), wrapped);
    });
});

/**
 * Host ordering, fixed in #175: `adjustBoundariesToContainChildren` processes
 * boundaries child-first (sorted by nesting depth descending), so a parent is
 * sized against its child frame AFTER that child has re-wrapped around a moved
 * node. SR-3 measured 120px of overhang on this exact fixture when the host
 * visited boundaries parent-first; the editor's bottom-up preview was already
 * right, so save now matches preview with no special-casing.
 */
describe('nested boundary re-wrap — a saved parent contains its re-wrapped child (#175)', () => {
    it('contains the nested frame on all four edges and matches the preview exactly', () => {
        const before = nestedView({ x: '500', y: '400' });
        const saved = layout(hostAfterSave(before, 'db', { x: 700, y: 700 }));
        const aws = saved.boundary('aws');
        const vpc = saved.boundary('vpc');

        // Every ancestor frame contains its child frame on all four edges.
        assert.ok(aws.x <= vpc.x, `parent left edge: ${aws.x} <= ${vpc.x}`);
        assert.ok(aws.y <= vpc.y, `parent top edge: ${aws.y} <= ${vpc.y}`);
        assert.ok(
            aws.x + aws.width >= vpc.x + vpc.width,
            `parent right edge: ${aws.x + aws.width} >= ${vpc.x + vpc.width}`,
        );
        assert.ok(
            aws.y + aws.height >= vpc.y + vpc.height,
            `parent bottom edge: ${aws.y + aws.height} >= ${vpc.y + vpc.height}`,
        );

        // The editor's bottom-up re-wrap predicts the same frames the host saves.
        const predicted = previewAfterDrag(before, 'db', { x: 700, y: 700 });
        assert.deepStrictEqual(predicted.get('vpc'), frameOf(vpc));
        assert.deepStrictEqual(predicted.get('aws'), frameOf(aws));
    });
});
