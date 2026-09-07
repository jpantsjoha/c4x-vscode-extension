import * as assert from 'assert';
import { DagreLayoutEngine, PositionedBoundary } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element, C4Boundary } from '../../model/C4Model';

/**
 * Nested boundaries re-wrap child-first (#175). The host used to visit
 * boundaries parent-first, so a parent frame was sized against its nested
 * child frame BEFORE that child re-wrapped around a moved node; the saved
 * parent then left the re-wrapped child hanging outside (120px of overhang on
 * the two-level "AWS Cloud > VPC > database" fixture). This fixture adds a
 * third level so the ordering has to be right at every depth, not just the
 * innermost one.
 */
describe('DagreLayoutEngine — nested boundaries re-wrap child-first (#175)', () => {
    let engine: DagreLayoutEngine;

    beforeEach(() => {
        engine = new DagreLayoutEngine();
    });

    /** Three levels: cloud > vpc > subnet > db, every frame pinned. */
    function makeView(dbAt: { x: number; y: number }): C4View {
        const elements: C4Element[] = [
            {
                id: 'db',
                label: 'Database',
                type: 'Container',
                metadata: { x: String(dbAt.x), y: String(dbAt.y) },
            },
        ];
        const subnet: C4Boundary = {
            id: 'subnet', label: 'Subnet', direction: 'TB', elements: ['db'], metadata: { x: '620', y: '560' },
        };
        const vpc: C4Boundary = {
            id: 'vpc', label: 'VPC', direction: 'TB', elements: ['subnet'], metadata: { x: '560', y: '480' },
        };
        const cloud: C4Boundary = {
            id: 'cloud', label: 'AWS Cloud', direction: 'TB', elements: ['vpc'], metadata: { x: '500', y: '400' },
        };
        return { type: 'container', direction: 'TB', elements, relationships: [], boundaries: [cloud, vpc, subnet] };
    }

    function boundaryOf(view: C4View, id: string): PositionedBoundary {
        const result = engine.layoutSync(view);
        for (const b of result.boundaries ?? []) {
            // Keep the fixture clear of normalizeOrigin so frames are comparable.
            assert.ok(b.x >= 0 && b.y >= 0, `fixture drifted negative on ${b.id}`);
        }
        const found = (result.boundaries ?? []).find(b => b.id === id);
        assert.ok(found, `boundary ${id} missing from layout`);
        return found;
    }

    function assertContains(parent: PositionedBoundary, child: { id: string; x: number; y: number; width: number; height: number }): void {
        assert.ok(parent.x <= child.x, `${parent.id} left edge ${parent.x} <= ${child.id} left edge ${child.x}`);
        assert.ok(parent.y <= child.y, `${parent.id} top edge ${parent.y} <= ${child.id} top edge ${child.y}`);
        assert.ok(
            parent.x + parent.width >= child.x + child.width,
            `${parent.id} right edge ${parent.x + parent.width} >= ${child.id} right edge ${child.x + child.width}`,
        );
        assert.ok(
            parent.y + parent.height >= child.y + child.height,
            `${parent.id} bottom edge ${parent.y + parent.height} >= ${child.id} bottom edge ${child.y + child.height}`,
        );
    }

    it('every ancestor frame contains its re-wrapped child after a node move is saved', () => {
        const before = makeView({ x: 660, y: 620 });
        const subnetBefore = boundaryOf(before, 'subnet');

        // Move the node inside the innermost frame far enough that the subnet
        // has to grow past the VPC's saved bottom edge, and save the move as
        // $x/$y — exactly what the editor writes.
        const after = makeView({ x: 1000, y: 1000 });
        const result = engine.layoutSync(after);
        const db = result.elements.find(e => e.id === 'db')!;
        const subnet = boundaryOf(after, 'subnet');
        const vpc = boundaryOf(after, 'vpc');
        const cloud = boundaryOf(after, 'cloud');

        // The move genuinely forced a re-wrap: the innermost frame's bottom
        // edge moved past where it was.
        assert.ok(
            subnet.y + subnet.height > subnetBefore.y + subnetBefore.height,
            'the drag must actually grow the innermost frame for this test to mean anything',
        );

        // Containment at every level, on all four edges.
        assertContains(subnet, db);
        assertContains(vpc, subnet);
        assertContains(cloud, vpc);
    });
});
