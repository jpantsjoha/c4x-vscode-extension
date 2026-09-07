/**
 * Origin normalization: re-wrapping nested groups around manually positioned
 * descendants can push a parent container left of the canvas origin
 * (child.x - pad < 0). Negative coordinates were rejected by the webview
 * payload validator, hanging the preview on "Waiting for render..." (UAT,
 * 2026-07-19). Every layout must be normalized into non-negative space.
 */
import * as assert from 'assert';
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';

const NESTED_MANUAL_POSITIONS = `%%{ c4: deployment }%%
graph TB
    Node(aws, "AWS Cloud", "us-east-1", $sprite="aws", $x="37", $y="283") {
        Node(vpc, "VPC", "10.0.0.0/16", $sprite="cloud", $x="77", $y="347") {
            Node(eks, "EKS Cluster", "Kubernetes", $sprite="server") {
            Container(api, "API Service", "Spring Boot", $sprite="java")
            }
            Node(rds, "RDS", "PostgreSQL", $sprite="database") {
            ContainerDb(db, "Main DB", "Data", $sprite="postgresql")
            }
        }
    }
    Person(dev, "Developer", "DevOps")
    dev --> api
    api --> db
`;

// A child pinned close to the origin ($x/$y smaller than rewrapNestedGroups'
// own padding) forces the parent's re-wrapped box left of/above (0,0)
// independently of any relationship label — this is the padding-underflow
// trigger normalizeOrigin exists for (UAT 2026-07-19), decoupled from the
// label-collision pinning fixed under #165 below.
const NESTED_NEAR_ORIGIN = `%%{ c4: deployment }%%
graph TB
    Node(parent, "Parent", "cloud") {
        Node(child, "Child", "small", $x="5", $y="5")
    }
`;

function layoutOf(dsl: string) {
    const parsed = c4xParser.parse(dsl);
    const model = c4ModelBuilder.build(parsed, 'origin-normalization-test');
    return dagreLayoutEngine.layoutSync(model.views[0]);
}

describe('layout origin normalization', () => {
    it('never emits negative element coordinates for nested manual positions', () => {
        const layout = layoutOf(NESTED_MANUAL_POSITIONS);
        for (const el of layout.elements) {
            assert.ok(el.x >= 0, `${el.id} has negative x (${el.x})`);
            assert.ok(el.y >= 0, `${el.id} has negative y (${el.y})`);
        }
    });

    it('shifts the whole layout uniformly when normalization is needed', () => {
        // Regression note (#165 / SR-5): this test used to reuse
        // NESTED_MANUAL_POSITIONS, whose "normalization needed" case was
        // actually a downstream symptom of the label-collision pass nudging
        // a pinned ($x/$y) `vpc` element away from a relationship label,
        // which in turn dragged its re-wrapped parent (`aws`) to x=-10. Now
        // that the label pass respects isPinned, `vpc` never drifts and that
        // fixture no longer needs normalizing at all — proving the fix, not
        // breaking this test. NESTED_NEAR_ORIGIN keeps this test meaningful
        // by forcing a real negative origin through padding underflow alone.
        const layout = layoutOf(NESTED_NEAR_ORIGIN);
        const minX = Math.min(...layout.elements.map(el => el.x));
        const minY = Math.min(...layout.elements.map(el => el.y));
        assert.strictEqual(minX, 0, 'normalized layout must start at x=0');
        assert.strictEqual(minY, 0, 'normalized layout must start at y=0');
        const parent = layout.elements.find(el => el.id === 'parent');
        const child = layout.elements.find(el => el.id === 'child');
        assert.ok(parent && child);
        assert.ok(parent.x <= child.x, 'parent must still contain child on x');
        assert.ok(parent.y <= child.y, 'parent must still contain child on y');
        assert.ok(parent.x + parent.width >= child.x + child.width, 'parent must still contain child on width');
        assert.ok(parent.y + parent.height >= child.y + child.height, 'parent must still contain child on height');
    });

    it('leaves already-positive layouts untouched', () => {
        const simple = layoutOf(`%%{ c4: system-context }%%
graph TB
    Person(a, "A")
    System(b, "B")
    a --> b
`);
        const minX = Math.min(...simple.elements.map(el => el.x));
        const minY = Math.min(...simple.elements.map(el => el.y));
        assert.ok(minX >= 0 && minY >= 0);
        // No forced shift to zero: normalization only acts on negative origins.
        assert.ok(minX > 0 || minY > 0 || simple.elements.length === 0);
    });
});
