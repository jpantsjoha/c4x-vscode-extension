/**
 * Bidirectional relationship pairs (#140): an A→B edge and its reverse B→A
 * used to render on the exact same channel, with both labels printed at the
 * same midpoint — illegible overlapping text (UAT, 2026-07-19). Each line of
 * a pair must be offset perpendicular to its own direction so the two arrows
 * (and their labels) occupy separate lanes.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import {
    SvgBuilder,
    BIDIRECTIONAL_EDGE_OFFSET,
    findReversePairIds,
    offsetPerpendicular,
} from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';

const DSL = `graph TB
System(a, "Alpha")
System(b, "Beta")
a --> |calls| b
b --> |responds| a
`;

function render() {
    const parsed = new C4XParser().parse(DSL);
    const model = new C4ModelBuilder().build(parsed, 'bidirectional-test');
    const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
    const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, viewType: model.views[0].type });
    return { svg, layout };
}

describe('findReversePairIds', () => {
    it('marks both directions of a bidirectional pair', () => {
        const { layout } = render();
        const ids = findReversePairIds(layout.relationships);
        assert.strictEqual(ids.size, 2);
    });

    it('marks nothing for unidirectional relationships', () => {
        const parsed = new C4XParser().parse(`graph TB
System(a, "A")
System(b, "B")
System(c, "C")
a --> b
b --> c
`);
        const model = new C4ModelBuilder().build(parsed, 'unidirectional-test');
        const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
        assert.strictEqual(findReversePairIds(layout.relationships).size, 0);
    });
});

describe('offsetPerpendicular', () => {
    it('shifts both endpoints by the amount along the segment normal', () => {
        const shifted = offsetPerpendicular({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);
        assert.deepStrictEqual(shifted, { from: { x: 0, y: 10 }, to: { x: 100, y: 10 } });
    });

    it('separates the two directions of a pair onto opposite sides', () => {
        const forward = offsetPerpendicular({ x: 0, y: 0 }, { x: 100, y: 0 }, BIDIRECTIONAL_EDGE_OFFSET);
        const backward = offsetPerpendicular({ x: 100, y: 0 }, { x: 0, y: 0 }, BIDIRECTIONAL_EDGE_OFFSET);
        // Forward line sits at y=+10, backward line at y=-10: separated lanes.
        assert.strictEqual(forward.from.y, BIDIRECTIONAL_EDGE_OFFSET);
        assert.strictEqual(backward.from.y, -BIDIRECTIONAL_EDGE_OFFSET);
    });
});

describe('SvgBuilder bidirectional pair rendering', () => {
    it('renders the two directions as distinct, offset paths', () => {
        const { svg } = render();
        const paths = [...svg.matchAll(/<g class="edge" data-id="([^"]+)">\s*<path class="edge-hit-area" d="([^"]+)"/g)];
        assert.strictEqual(paths.length, 2, 'expected two edge groups');
        assert.notStrictEqual(paths[0][2], paths[1][2], 'paired edges must not share the same path');
    });

    it('positions the two labels at different coordinates', () => {
        const { svg } = render();
        const labels = [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"[^>]*paint-order="stroke"[^>]*>([^<]+)<\/text>/g)];
        const relLabels = labels.filter(m => m[3].includes('calls') || m[3].includes('responds'));
        assert.strictEqual(relLabels.length, 2, 'expected both relationship labels');
        assert.ok(
            relLabels[0][1] !== relLabels[1][1] || relLabels[0][2] !== relLabels[1][2],
            `labels must not overlap: ${relLabels[0][0]} vs ${relLabels[1][0]}`
        );
    });
});
