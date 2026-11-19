import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, LayoutResult, PositionedBoundary } from '../../layout/DagreLayoutEngine';
import { boundaryNesting } from '../../model/lint/support';

/**
 * A boundary declared inside another boundary is laid out inside it (#339).
 *
 * The parser used to drop nested boundaries from their parent's membership,
 * so the layout engine treated `Container_Boundary(backend)` as a sibling of
 * `System_Boundary(ibs)` and drew it 100px below its parent. Nesting here is
 * read from source ranges (the same oracle the linter uses), not from the
 * membership list under test, so the assertion cannot agree with the bug.
 */

/** Space at the top of a frame kept free for its label (BoundaryRenderer draws it at y + 20). */
const LABEL_CLEARANCE = 40;

const IBS_COMPONENT = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs', '04-component.c4x');

const MINIMAL_NESTED = `%%{ c4: component }%%
graph TB
    System_Boundary(sys, "Outer System") {
        Container(web, "Web", "TypeScript", "Front end.")
        Container_Boundary(api, "API") {
            Component(ctrl, "Controller", "Express", "Routes requests.")
            Component(repo, "Repository", "Knex", "Reads data.")
        }
    }
    web --> ctrl
    ctrl --> repo
`;

const THREE_LEVELS = `%%{ c4: component }%%
graph LR
    Enterprise_Boundary(ent, "Enterprise") {
        Person(user, "User", "A customer.")
        System_Boundary(sys, "System") {
            Container_Boundary(api, "API") {
                Component(ctrl, "Controller", "Express", "Routes requests.")
            }
            Container(db, "Database", "Postgres", "Stores data.")
        }
    }
    user --> ctrl
    ctrl --> db
`;

const NESTED_SUBGRAPH_MANUAL = `graph TB
    subgraph Outer {
        A[Alpha<br/>Container]
        subgraph Inner $x="400", $y="500", $w="300", $h="200" {
            B[Beta<br/>Container]
        }
    }
    A --> B
`;

interface Rect { id: string; x: number; y: number; width: number; height: number }

function layoutOf(dsl: string): { layout: LayoutResult; parentOf: Map<string, string> } {
    const model = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'nested-boundary-containment');
    const view = model.views[0];
    const nesting = boundaryNesting(view.boundaries ?? []);
    assert.ok(nesting, 'fixture boundaries carry source ranges');
    const parentOf = new Map<string, string>();
    for (const [child, parent] of nesting) {
        if (parent) {
            parentOf.set(child.id, parent.id);
        }
    }
    return { layout: new DagreLayoutEngine().layoutSync(view), parentOf };
}

function assertInsideBelowLabel(parent: PositionedBoundary, child: Rect): void {
    assert.ok(parent.x <= child.x,
        `${child.id} left ${child.x} is outside ${parent.id} left ${parent.x}`);
    assert.ok(parent.x + parent.width >= child.x + child.width,
        `${child.id} right ${child.x + child.width} is outside ${parent.id} right ${parent.x + parent.width}`);
    assert.ok(parent.y + LABEL_CLEARANCE <= child.y,
        `${child.id} top ${child.y} intrudes on ${parent.id} label band (top ${parent.y} + ${LABEL_CLEARANCE})`);
    assert.ok(parent.y + parent.height >= child.y + child.height,
        `${child.id} bottom ${child.y + child.height} is outside ${parent.id} bottom ${parent.y + parent.height}`);
}

function assertNestedContainment(dsl: string, expectedNestedCount: number): void {
    const { layout, parentOf } = layoutOf(dsl);
    const boundaries = new Map((layout.boundaries ?? []).map(b => [b.id, b]));
    assert.strictEqual(parentOf.size, expectedNestedCount, 'fixture nests the expected number of boundaries');
    for (const [childId, parentId] of parentOf) {
        const child = boundaries.get(childId);
        const parent = boundaries.get(parentId);
        assert.ok(child && parent, `${childId} and ${parentId} are both laid out`);
        assertInsideBelowLabel(parent, child);
    }
    // Every element inside a boundary — directly or through a nested one —
    // sits inside each enclosing frame, clear of its label.
    for (const b of layout.boundaries ?? []) {
        for (const id of b.boundary.elements) {
            const el = layout.elements.find(e => e.id === id);
            if (!el) { continue; }
            for (let frame: string | undefined = b.id; frame; frame = parentOf.get(frame)) {
                assertInsideBelowLabel(boundaries.get(frame)!, el);
            }
        }
    }
}

describe('DagreLayoutEngine — nested boundaries sit inside their parent (#339)', () => {
    it('IBS component fixture: Backend sits inside Internet Banking System', () => {
        assertNestedContainment(readFileSync(IBS_COMPONENT, 'utf8'), 1);
    });

    it('minimal two-level fixture', () => {
        assertNestedContainment(MINIMAL_NESTED, 1);
    });

    it('three levels deep', () => {
        assertNestedContainment(THREE_LEVELS, 2);
    });

    it('a nested subgraph with manual geometry ($x/$y/$w/$h) keeps its $x/$y and grows its parent around it', () => {
        assertNestedContainment(NESTED_SUBGRAPH_MANUAL, 1);
        const { layout } = layoutOf(NESTED_SUBGRAPH_MANUAL);
        const inner = (layout.boundaries ?? []).find(b => b.boundary.label === 'Inner')!;
        assert.strictEqual(inner.x, 400);
        assert.strictEqual(inner.y, 500);
        assert.ok(inner.width >= 300 && inner.height >= 200, 'manual $w/$h act as minima');
    });

    it('the model records a nested boundary as a member of its parent, in source order', () => {
        const model = new C4ModelBuilder().build(new C4XParser().parse(readFileSync(IBS_COMPONENT, 'utf8')), 'ibs');
        const [ibs, backend] = model.views[0].boundaries!;
        assert.deepStrictEqual(ibs.elements, ['ui', backend.id, 'statements', 'db']);
        assert.ok(!backend.elements.includes(ibs.id));
    });

    it('adjacent nested boundaries keep source order (#339 review)', () => {
        const dsl = `graph TB
    subgraph Outer {
        subgraph First {
            A[Alpha<br/>Container]
        }
        subgraph Second {
            B[Beta<br/>Container]
        }
        C[Gamma<br/>Container]
        subgraph Third {
            D[Delta<br/>Container]
        }
    }
`;
        const [outer] = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'order').views[0].boundaries!;
        assert.deepStrictEqual(outer.elements, ['first-boundary-1', 'second-boundary-2', 'C', 'third-boundary-3']);
    });
});
