import * as assert from 'assert';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element, C4Boundary } from '../../model/C4Model';

describe('DagreLayoutEngine — manual boundary geometry (#137)', () => {
    let engine: DagreLayoutEngine;

    beforeEach(() => {
        engine = new DagreLayoutEngine();
    });

    function makeView(boundaryMetadata?: Record<string, string>, childMetadata?: Record<string, string>): C4View {
        const elements: C4Element[] = [
            {
                id: 'el1',
                label: 'Element 1',
                type: 'Container',
                metadata: childMetadata,
            },
            {
                id: 'el2',
                label: 'Element 2',
                type: 'Container',
            },
        ];

        const boundary: C4Boundary = {
            id: 'backend',
            label: 'Backend',
            direction: 'TB',
            elements: ['el1', 'el2'],
            metadata: boundaryMetadata,
        };

        return {
            type: 'container',
            direction: 'TB',
            elements,
            relationships: [],
            boundaries: [boundary],
        };
    }

    it('shifts a manually positioned boundary and its children by the same delta', () => {
        // Compare two rigid manual positions: the auto-wrapping step can expand
        // the boundary frame after the shift, but the delta between two manual
        // layouts must be identical for the boundary and every descendant.
        const first = engine.layoutSync(makeView({ x: '0', y: '0' }));
        const second = engine.layoutSync(makeView({ x: '100', y: '100' }));

        const firstBoundary = first.boundaries!.find(b => b.id === 'backend')!;
        const secondBoundary = second.boundaries!.find(b => b.id === 'backend')!;

        const dx = secondBoundary.x - firstBoundary.x;
        const dy = secondBoundary.y - firstBoundary.y;

        assert.strictEqual(dx, 100, 'boundary x shifts by the manual delta');
        assert.strictEqual(dy, 100, 'boundary y shifts by the manual delta');

        for (const id of ['el1', 'el2']) {
            const firstEl = first.elements.find(e => e.id === id)!;
            const secondEl = second.elements.find(e => e.id === id)!;
            assert.strictEqual(secondEl.x - firstEl.x, dx, `${id} x shifts with its boundary`);
            assert.strictEqual(secondEl.y - firstEl.y, dy, `${id} y shifts with its boundary`);
        }
    });

    it('clamps a manual $w/$h that is too small to contain children', () => {
        const result = engine.layoutSync(makeView({ w: '10', h: '10' }));
        const boundary = result.boundaries!.find(b => b.id === 'backend')!;

        const children = result.elements.filter(e => e.id === 'el1' || e.id === 'el2');
        const requiredWidth = Math.max(...children.map(e => e.x + e.width)) - Math.min(...children.map(e => e.x)) + 80;
        const requiredHeight = Math.max(...children.map(e => e.y + e.height)) - Math.min(...children.map(e => e.y)) + 100;

        assert.ok(boundary.width >= requiredWidth, `boundary width clamped to fit children: ${boundary.width} >= ${requiredWidth}`);
        assert.ok(boundary.height >= requiredHeight, `boundary height clamped to fit children: ${boundary.height} >= ${requiredHeight}`);
    });

    it('preserves a manual $w/$h that is larger than the child bounding box', () => {
        const result = engine.layoutSync(makeView({ w: '1200', h: '900' }));
        const boundary = result.boundaries!.find(b => b.id === 'backend')!;

        assert.strictEqual(boundary.width, 1200, 'boundary width keeps the manual $w value');
        assert.strictEqual(boundary.height, 900, 'boundary height keeps the manual $h value');

        for (const el of result.elements) {
            assert.ok(el.x >= boundary.x, `${el.id} stays inside the wide boundary`);
            assert.ok(el.y >= boundary.y, `${el.id} stays inside the tall boundary`);
            assert.ok(el.x + el.width <= boundary.x + boundary.width, `${el.id} right edge inside boundary`);
            assert.ok(el.y + el.height <= boundary.y + boundary.height, `${el.id} bottom edge inside boundary`);
        }
    });

    it('ignores non-finite boundary geometry and reports a warning', () => {
        const warnings: string[] = [];
        const guardedEngine = new DagreLayoutEngine(message => warnings.push(message));

        const result = guardedEngine.layoutSync(makeView({ x: 'abc', y: 'NaN', w: 'Infinity', h: '-10' }));
        const boundary = result.boundaries!.find(b => b.id === 'backend')!;

        assert.ok(Number.isFinite(boundary.x), 'boundary x remains finite');
        assert.ok(Number.isFinite(boundary.y), 'boundary y remains finite');
        assert.ok(Number.isFinite(boundary.width), 'boundary width remains finite');
        assert.ok(Number.isFinite(boundary.height), 'boundary height remains finite');

        assert.deepStrictEqual(warnings.sort(), [
            'C4X layout: ignored non-finite $h metadata on boundary; using the computed layout size.',
            'C4X layout: ignored non-finite $w metadata on boundary; using the computed layout size.',
            'C4X layout: ignored non-finite $x metadata on boundary; using the computed layout coordinate.',
            'C4X layout: ignored non-finite $y metadata on boundary; using the computed layout coordinate.',
        ]);
    });

    it('shifts nested boundaries and their descendants together with the parent', () => {
        const elements: C4Element[] = [
            { id: 'db', label: 'Database', type: 'Container' },
        ];

        const inner: C4Boundary = {
            id: 'inner',
            label: 'Data',
            direction: 'TB',
            elements: ['db'],
        };

        const outer = (x: number, y: number): C4Boundary => ({
            id: 'outer',
            label: 'Platform',
            direction: 'TB',
            elements: ['inner'],
            metadata: { x: String(x), y: String(y) },
        });

        const first = engine.layoutSync({
            type: 'container',
            direction: 'TB',
            elements,
            relationships: [],
            boundaries: [outer(0, 0), inner],
        });

        const second = engine.layoutSync({
            type: 'container',
            direction: 'TB',
            elements,
            relationships: [],
            boundaries: [outer(100, 100), inner],
        });

        const firstOuter = first.boundaries!.find(b => b.id === 'outer')!;
        const secondOuter = second.boundaries!.find(b => b.id === 'outer')!;
        const dx = secondOuter.x - firstOuter.x;
        const dy = secondOuter.y - firstOuter.y;

        assert.strictEqual(dx, 100);
        assert.strictEqual(dy, 100);

        const firstInner = first.boundaries!.find(b => b.id === 'inner')!;
        const secondInner = second.boundaries!.find(b => b.id === 'inner')!;
        assert.strictEqual(secondInner.x - firstInner.x, dx, 'nested boundary x shifts with parent');
        assert.strictEqual(secondInner.y - firstInner.y, dy, 'nested boundary y shifts with parent');

        const firstDb = first.elements.find(e => e.id === 'db')!;
        const secondDb = second.elements.find(e => e.id === 'db')!;
        assert.strictEqual(secondDb.x - firstDb.x, dx, 'nested child x shifts with parent boundary');
        assert.strictEqual(secondDb.y - firstDb.y, dy, 'nested child y shifts with parent boundary');
    });

    it('honours explicit size on an empty boundary', () => {
        const boundary: C4Boundary = {
            id: 'empty',
            label: 'Empty',
            direction: 'TB',
            elements: [],
            metadata: { w: '250', h: '180' },
        };

        const result = engine.layoutSync({
            type: 'container',
            direction: 'TB',
            elements: [],
            relationships: [],
            boundaries: [boundary],
        });

        const positioned = result.boundaries!.find(b => b.id === 'empty')!;
        assert.strictEqual(positioned.width, 250);
        assert.strictEqual(positioned.height, 180);
    });
});

describe('DagreLayoutEngine — a saved frame must still contain its children (UAT)', () => {
    let engine: DagreLayoutEngine;

    beforeEach(() => {
        engine = new DagreLayoutEngine();
    });

    /**
     * Reproduces the UAT report: drag a child inside a frame, save, and on the
     * re-render the frame is offset and the child hangs outside it.
     *
     * Two independent defects produced that:
     *   1. applyBoundaryManualGeometry shifted EVERY descendant by the frame's
     *      delta, including children carrying their own authored $x/$y. An
     *      authored coordinate is absolute, so re-shifting it moved the child
     *      somewhere the author never chose.
     *   2. adjustBoundariesToContainChildren sized the frame from the child
     *      bounding-box EXTENT (maxX - minX) rather than from the frame's own
     *      origin, so a pinned frame was sized too small and children spilled
     *      past its right and bottom edges.
     */
    function viewWithPinnedChild(): C4View {
        const elements: C4Element[] = [
            { id: 'gateway', label: 'API Gateway', type: 'Container', metadata: { x: '900', y: '400' } },
            { id: 'store', label: 'Session Store', type: 'Container' },
            { id: 'service', label: 'User Service', type: 'Container' },
        ];
        const boundary: C4Boundary = {
            id: 'platform',
            label: 'OurPlatform',
            direction: 'TB',
            elements: ['gateway', 'store', 'service'],
            metadata: { x: '100', y: '100' },
        };
        return {
            type: 'container',
            direction: 'TB',
            elements,
            relationships: [],
            boundaries: [boundary],
        };
    }

    it('keeps a pinned child at its authored coordinate instead of dragging it with the frame', () => {
        const result = engine.layoutSync(viewWithPinnedChild());
        const gateway = result.elements.find(el => el.id === 'gateway')!;
        assert.strictEqual(gateway.x, 900, 'authored $x is absolute and must survive the frame shift');
        assert.strictEqual(gateway.y, 400, 'authored $y is absolute and must survive the frame shift');
    });

    it('grows the frame so every child is fully inside it', () => {
        const result = engine.layoutSync(viewWithPinnedChild());
        const frame = result.boundaries!.find(b => b.id === 'platform')!;
        for (const id of ['gateway', 'store', 'service']) {
            const child = result.elements.find(el => el.id === id)!;
            assert.ok(child.x >= frame.x, `${id} must not hang off the left edge`);
            assert.ok(child.y >= frame.y, `${id} must not hang off the top edge`);
            assert.ok(
                child.x + child.width <= frame.x + frame.width,
                `${id} must not hang off the right edge ` +
                `(child right ${child.x + child.width} vs frame right ${frame.x + frame.width})`,
            );
            assert.ok(
                child.y + child.height <= frame.y + frame.height,
                `${id} must not hang off the bottom edge ` +
                `(child bottom ${child.y + child.height} vs frame bottom ${frame.y + frame.height})`,
            );
        }
    });

    it('honours an explicit $w/$h as a minimum but still contains a distant child', () => {
        const view = viewWithPinnedChild();
        view.boundaries![0].metadata = { x: '100', y: '100', w: '50', h: '50' };
        const result = engine.layoutSync(view);
        const frame = result.boundaries!.find(b => b.id === 'platform')!;
        const gateway = result.elements.find(el => el.id === 'gateway')!;
        assert.ok(frame.width > 50, 'an undersized $w must be clamped up, never clip children');
        assert.ok(gateway.x + gateway.width <= frame.x + frame.width, 'child stays inside the clamped frame');
    });

    it('is stable across a save round-trip: laying out the saved result does not move anything', () => {
        // The editor writes $x/$y for what it moved; re-opening must reproduce
        // the same picture, or the diagram drifts a little on every save.
        const first = engine.layoutSync(viewWithPinnedChild());
        const firstFrame = first.boundaries!.find(b => b.id === 'platform')!;

        const saved = viewWithPinnedChild();
        for (const el of saved.elements) {
            const positioned = first.elements.find(p => p.id === el.id)!;
            el.metadata = { ...(el.metadata ?? {}), x: String(positioned.x), y: String(positioned.y) };
        }
        saved.boundaries![0].metadata = { x: String(firstFrame.x), y: String(firstFrame.y) };

        const second = engine.layoutSync(saved);
        const secondFrame = second.boundaries!.find(b => b.id === 'platform')!;

        assert.strictEqual(secondFrame.x, firstFrame.x, 'frame x must not drift on re-render');
        assert.strictEqual(secondFrame.y, firstFrame.y, 'frame y must not drift on re-render');
        for (const el of first.elements) {
            const after = second.elements.find(p => p.id === el.id)!;
            assert.strictEqual(after.x, el.x, `${el.id} x must not drift on re-render`);
            assert.strictEqual(after.y, el.y, `${el.id} y must not drift on re-render`);
        }
    });
});
