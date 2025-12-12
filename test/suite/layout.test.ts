import * as assert from 'assert';
import { c4xParser } from '../../src/parser/C4XParser';
import { c4ModelBuilder } from '../../src/model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../src/layout/DagreLayoutEngine';

describe('Layout Engine Suite', () => {

    it('Manual Positioning Attributes ($x, $y) are respected', () => {
        const input = `
            graph TB
            A[A<br/>Component<br/>$x="100"<br/>$y="100"]
            B[B<br/>Component<br/>$x="400"<br/>$y="400"]
        `;
        const result = c4xParser.parse(input);
        const model = c4ModelBuilder.build(result, 'test');
        const layout = dagreLayoutEngine.layoutSync(model.views[0]);

        const a = layout.elements.find((e: any) => e.id === 'A');
        const b = layout.elements.find((e: any) => e.id === 'B');

        assert.ok(a && b, 'Elements should exist');
        assert.strictEqual(a.x, 100, 'Element A X should be 100');
        assert.strictEqual(a.y, 100, 'Element A Y should be 100');
        assert.strictEqual(b.x, 400, 'Element B X should be 400');
        assert.strictEqual(b.y, 400, 'Element B Y should be 400');
    });

    it('Nested Direction (LR) results in Horizontal Layout', () => {
        const input = `
            graph TB
            subgraph Sub {
                direction LR
                A[A<br/>Component]
                B[B<br/>Component]
                A --> B
            }
        `;
        const result = c4xParser.parse(input);
        const model = c4ModelBuilder.build(result, 'test');
        const layout = dagreLayoutEngine.layoutSync(model.views[0]);

        // In the flattened layout, A and B should be positioned based on the Subgraph's LR layout.
        // But since they are inside 'Sub' boundary, 'layoutSync' might return them as part of elements OR inside boundary?
        // Our 'layoutSync' logic flattens everything into 'elements' list.

        const a = layout.elements.find((e: any) => e.id === 'A');
        const b = layout.elements.find((e: any) => e.id === 'B');

        assert.ok(a && b, 'Child elements should exist in flattened layout');

        const dx = Math.abs(a.x - b.x);
        const dy = Math.abs(a.y - b.y);

        // LR Layout: RankSep (Horizontal) >> NodeSep (Vertical) usually.
        // A --> B means A is left of B.
        // dx should be significant (~60+), dy should be small (~0 if aligned).

        assert.ok(dx > 50, 'Horizontal separation should be significant in LR');
        assert.ok(dy < 50, 'Vertical separation should be minimal in LR');
    });
});
