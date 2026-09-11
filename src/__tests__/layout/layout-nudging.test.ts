import * as assert from 'assert';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element, C4Rel, C4Boundary } from '../../model/C4Model';

describe('DagreLayoutEngine — overlap prevention and locked stability', () => {
    let engine: DagreLayoutEngine;

    beforeEach(() => {
        engine = new DagreLayoutEngine();
    });

    function boxesOverlap(
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number },
        padding: number = 0
    ): boolean {
        return (
            a.x < b.x + b.width + padding &&
            a.x + a.width + padding > b.x &&
            a.y < b.y + b.height + padding &&
            a.y + a.height + padding > b.y
        );
    }

    it('respects manually positioned elements exactly, even when they overlap (audit P0-1)', () => {
        // UAT + audit finding: nudging manually positioned elements made the
        // render diverge from the saved $x/$y, so overlapping arrangements
        // "reset" after save. Manual positions are now pinned; only
        // auto-positioned elements are nudged.
        const elements: C4Element[] = [
            {
                id: 'el1',
                label: 'Element 1',
                type: 'SoftwareSystem',
                metadata: { x: '100', y: '100' }
            },
            {
                id: 'el2',
                label: 'Element 2',
                type: 'SoftwareSystem',
                metadata: { x: '100', y: '100' } // overlapping — intentional
            }
        ];

        const view: C4View = {
            type: 'system-context',
            elements,
            relationships: []
        };

        const result = engine.layoutSync(view);
        const el1Pos = result.elements.find(e => e.id === 'el1')!;
        const el2Pos = result.elements.find(e => e.id === 'el2')!;

        assert.deepStrictEqual(
            { x: el1Pos.x, y: el1Pos.y },
            { x: 100, y: 100 },
            'manually positioned element 1 must keep its saved coordinates',
        );
        assert.deepStrictEqual(
            { x: el2Pos.x, y: el2Pos.y },
            { x: 100, y: 100 },
            'manually positioned element 2 must keep its saved coordinates',
        );
    });

    it('nudges only the auto-positioned element away from a manually positioned one', () => {
        const elements: C4Element[] = [
            {
                id: 'manual',
                label: 'Manual',
                type: 'SoftwareSystem',
                metadata: { x: '100', y: '100' }
            },
            {
                id: 'auto',
                label: 'Auto',
                type: 'SoftwareSystem',
            }
        ];

        const view: C4View = {
            type: 'system-context',
            elements,
            relationships: []
        };

        const result = engine.layoutSync(view);
        const manual = result.elements.find(e => e.id === 'manual')!;
        const auto = result.elements.find(e => e.id === 'auto')!;

        assert.deepStrictEqual({ x: manual.x, y: manual.y }, { x: 100, y: 100 });
        assert.strictEqual(boxesOverlap(manual, auto, 10), false,
            'the auto-positioned element must be nudged clear of the pinned one');
    });

    it('ensures locked elements ($locked="true") maintain their coordinates exactly', () => {
        const elements: C4Element[] = [
            {
                id: 'locked1',
                label: 'Locked Element',
                type: 'SoftwareSystem',
                metadata: { x: '150', y: '250', locked: 'true' }
            },
            {
                id: 'el2',
                label: 'Normal Element',
                type: 'SoftwareSystem',
                metadata: { x: '150', y: '250' } // overlapping with locked
            }
        ];

        const view: C4View = {
            type: 'system-context',
            elements,
            relationships: []
        };

        const result = engine.layoutSync(view);

        const lockedPos = result.elements.find(e => e.id === 'locked1')!;
        const el2Pos = result.elements.find(e => e.id === 'el2')!;

        // Locked element must be exactly at (150, 250)
        assert.strictEqual(lockedPos.x, 150);
        assert.strictEqual(lockedPos.y, 250);

        // The manually positioned el2 is also pinned (audit P0-1: saved
        // coordinates always win), so the overlap is preserved as saved.
        assert.strictEqual(el2Pos.x, 150);
        assert.strictEqual(el2Pos.y, 250);
    });

    it('keeps computed coordinates when manual metadata is non-finite', () => {
        const malformedCoordinates = ['abc', '', 'NaN', 'Infinity'];

        for (const coordinate of malformedCoordinates) {
            const warnings: string[] = [];
            const guardedEngine = new DagreLayoutEngine(message => warnings.push(message));
            const automaticLayout = engine.layoutSync({
                type: 'system-context',
                elements: [{ id: 'service', label: 'Service', type: 'SoftwareSystem' }],
                relationships: []
            });
            const guardedLayout = guardedEngine.layoutSync({
                type: 'system-context',
                elements: [{
                    id: 'service',
                    label: 'Service',
                    type: 'SoftwareSystem',
                    metadata: { x: coordinate, y: coordinate }
                }],
                relationships: []
            });

            const automaticPosition = automaticLayout.elements[0];
            const guardedPosition = guardedLayout.elements[0];
            assert.strictEqual(guardedPosition.x, automaticPosition.x, `fallback x for ${JSON.stringify(coordinate)}`);
            assert.strictEqual(guardedPosition.y, automaticPosition.y, `fallback y for ${JSON.stringify(coordinate)}`);
            assert.ok(Number.isFinite(guardedPosition.x), `finite x for ${JSON.stringify(coordinate)}`);
            assert.ok(Number.isFinite(guardedPosition.y), `finite y for ${JSON.stringify(coordinate)}`);
            assert.deepStrictEqual(warnings, [
                'C4X layout: ignored non-finite $x metadata; using the computed layout coordinate.',
                'C4X layout: ignored non-finite $y metadata; using the computed layout coordinate.'
            ]);
        }
    });

    it('ensures boundaries expand dynamically to wrap their elements after nudging', () => {
        const elements: C4Element[] = [
            {
                id: 'el1',
                label: 'Element 1',
                type: 'SoftwareSystem',
                metadata: { x: '100', y: '100', locked: 'true' }
            },
            {
                id: 'el2',
                label: 'Element 2',
                type: 'SoftwareSystem',
                metadata: { x: '110', y: '115' } // overlapping, will nudge
            }
        ];

        const boundary: C4Boundary = {
            id: 'b1',
            label: 'Boundary 1',
            elements: ['el1', 'el2']
        };

        const view: C4View = {
            type: 'container',
            elements,
            relationships: [],
            boundaries: [boundary]
        };

        const result = engine.layoutSync(view);
        assert.ok(result.boundaries && result.boundaries.length > 0);

        const bPos = result.boundaries[0];
        const el1Pos = result.elements.find(e => e.id === 'el1')!;
        const el2Pos = result.elements.find(e => e.id === 'el2')!;

        // The boundary must fully contain both elements
        assert.ok(el1Pos.x >= bPos.x, 'el1 x within boundary');
        assert.ok(el1Pos.y >= bPos.y, 'el1 y within boundary');
        assert.ok(el1Pos.x + el1Pos.width <= bPos.x + bPos.width, 'el1 width within boundary');
        assert.ok(el1Pos.y + el1Pos.height <= bPos.y + bPos.height, 'el1 height within boundary');

        assert.ok(el2Pos.x >= bPos.x, 'el2 x within boundary');
        assert.ok(el2Pos.y >= bPos.y, 'el2 y within boundary');
        assert.ok(el2Pos.x + el2Pos.width <= bPos.x + bPos.width, 'el2 width within boundary');
        assert.ok(el2Pos.y + el2Pos.height <= bPos.y + bPos.height, 'el2 height within boundary');
    });

    it('ensures elements nudge away from relationship labels to avoid clipping them', () => {
        const elements: C4Element[] = [
            { id: 'src', label: 'Source', type: 'SoftwareSystem', metadata: { x: '100', y: '100', locked: 'true' } },
            { id: 'dst', label: 'Destination', type: 'SoftwareSystem', metadata: { x: '100', y: '500', locked: 'true' } },
            { id: 'el3', label: 'Obstacle', type: 'SoftwareSystem', metadata: { x: '100', y: '300' } } // positioned directly at the midpoint
        ];

        const relationships: C4Rel[] = [
            {
                id: 'rel1',
                from: 'src',
                to: 'dst',
                label: 'A Very Long Relationship Label Description',
                relType: 'uses'
            }
        ];

        const view: C4View = {
            type: 'system-context',
            elements,
            relationships
        };

        const result = engine.layoutSync(view);
        const el3Pos = result.elements.find(e => e.id === 'el3')!;

        // The midpoint between src and dst centers:
        // src center: 100 + 260/2 = 230, 100 + 140/2 = 170
        // dst center: 100 + 260/2 = 230, 500 + 140/2 = 570
        // Midpoint: 230, 370
        // Without nudging, el3 center would be 100 + 260/2 = 230, 300 + 140/2 = 370 (exactly on the midpoint!)
        // It must have nudged away.
        const el3CenterY = el3Pos.y + el3Pos.height / 2;
        assert.notStrictEqual(el3CenterY, 370, 'Obstacle element should have been nudged away from the label midpoint');
    });

    it('keeps a manually positioned child inside its parent container (nested deployment nodes)', () => {
        // UAT: arranging AWS > VPC > DB nesting and saving "broke out" the
        // containment — the overlap nudger treated intentional parent-child
        // containment as a collision and shoved the boxes apart.
        const parent: C4Element = {
            id: 'vpc',
            label: 'VPC',
            type: 'SoftwareSystem',
            metadata: { x: '100', y: '100' },
            children: [
                {
                    id: 'db',
                    label: 'Main DB',
                    type: 'Container',
                    metadata: { x: '160', y: '160' },
                },
            ],
        };

        const view: C4View = {
            type: 'deployment',
            elements: [parent],
            relationships: [],
        };

        const result = engine.layoutSync(view);
        const vpc = result.elements.find(e => e.id === 'vpc')!;
        const db = result.elements.find(e => e.id === 'db')!;

        assert.ok(
            db.x >= vpc.x && db.y >= vpc.y &&
            db.x + db.width <= vpc.x + vpc.width &&
            db.y + db.height <= vpc.y + vpc.height,
            `child ${JSON.stringify(db)} must stay inside parent ${JSON.stringify(vpc)}`,
        );
    });

    it('re-wraps a parent group around manually repositioned children', () => {
        // UAT: group boxes are sized by the automatic layout, so children
        // moved by $x/$y ended up outside the parent's rect ("broken out"
        // after save). The parent must expand to enclose them.
        const parent: C4Element = {
            id: 'aws',
            label: 'AWS Cloud',
            type: 'SoftwareSystem',
            metadata: { x: '0', y: '0' },
            children: [
                { id: 'svc', label: 'API Service', type: 'Container', metadata: { x: '80', y: '120' } },
                { id: 'db', label: 'Main DB', type: 'Container', metadata: { x: '900', y: '700' } },
            ],
        };

        const view: C4View = {
            type: 'deployment',
            elements: [parent],
            relationships: [],
        };

        const result = engine.layoutSync(view);
        const aws = result.elements.find(e => e.id === 'aws')!;

        for (const id of ['svc', 'db']) {
            const child = result.elements.find(e => e.id === id)!;
            assert.ok(
                child.x >= aws.x && child.y >= aws.y &&
                child.x + child.width <= aws.x + aws.width &&
                child.y + child.height <= aws.y + aws.height,
                `child ${id} ${JSON.stringify(child)} must be enclosed by re-wrapped parent ${JSON.stringify(aws)}`,
            );
        }
    });
});
