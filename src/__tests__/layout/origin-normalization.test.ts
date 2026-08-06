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
        const layout = layoutOf(NESTED_MANUAL_POSITIONS);
        // The aws boundary previously wrapped to x=-10; after normalization
        // the minimum element x must be exactly 0 and containment preserved.
        const minX = Math.min(...layout.elements.map(el => el.x));
        assert.strictEqual(minX, 0);
        const aws = layout.elements.find(el => el.id === 'aws');
        const vpc = layout.elements.find(el => el.id === 'vpc');
        assert.ok(aws && vpc);
        assert.ok(aws.x <= vpc.x, 'aws must still contain vpc on x');
        assert.ok(aws.x + aws.width >= vpc.x + vpc.width, 'aws must still contain vpc on width');
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
