/**
 * #421: a relationship's technology is drawn as a second line, `[technology]`,
 * under the edge label, and is absent when the relationship has none.
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
import { LayoutResult, PositionedElement, RoutedRelationship } from '../../layout/DagreLayoutEngine';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { SvgBuilder } from '../../render/SvgBuilder';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from '../../render/textLayout';

function node(id: string, x: number, y: number): PositionedElement {
    return { id, element: { id, label: id, type: 'SoftwareSystem' }, x, y, width: 200, height: 100 };
}

function build(technology?: string, label = 'Sends events'): string {
    const edge: RoutedRelationship = {
        id: 'rel-0',
        points: [{ x: 100, y: 100 }, { x: 500, y: 300 }],
        relationship: { id: 'rel-0', from: 'a', to: 'b', label, relType: 'uses', ...(technology !== undefined ? { technology } : {}) },
    };
    const layout: LayoutResult = { elements: [node('a', 0, 0), node('b', 400, 300)], relationships: [edge], width: 800, height: 600 };
    return new SvgBuilder().build(layout, { theme: ClassicTheme });
}

function labelY(svg: string): number {
    const m = /<text x="[\d.]+" y="([\d.]+)" fill="[^"]*" stroke[^>]*>Sends events<\/text>/.exec(svg);
    assert.ok(m, svg);
    return Number(m[1]);
}

describe('SvgBuilder relationship technology (#421)', () => {
    it('draws [technology] in a second line when present', () => {
        const svg = build('postMessage');
        assert.ok(svg.includes('>[postMessage]</text>'), svg);
        assert.ok(svg.includes('data-field="relationship-technology"'));
        assert.ok(svg.includes('font-style="italic"'));
    });

    it('draws nothing when the relationship has no technology', () => {
        const svg = build(undefined);
        assert.ok(!svg.includes('relationship-technology'));
        assert.ok(!svg.includes('['));
        assert.strictEqual(build('   '), svg, 'a blank technology renders byte-identical to none');
        assert.strictEqual(build(''), svg);
    });

    it('escapes hostile technology text', () => {
        const svg = build('<script>"&');
        assert.ok(svg.includes('[&lt;script&gt;&quot;&amp;]'), svg);
        assert.ok(!svg.includes('<script>'));
    });

    it('places the technology line under the label and grows the label box', () => {
        const without = labelY(build(undefined));
        const withTech = build('HTTPS');
        const techY = Number(/data-field="relationship-technology" x="[\d.]+" y="([\d.]+)"/.exec(withTech)![1]);
        assert.ok(techY > labelY(withTech), 'technology line sits below the label');
        assert.ok(Math.abs(techY - labelY(withTech) - 13) < 0.01, 'one 13px line below');
        assert.ok(Math.abs(labelY(withTech) - without) <= 7, 'label stays near its single-line spot');
    });

    // Collision: the whole two-line block (ink from 9 px above the label baseline to
    // 3 px below the technology baseline, as wide as the measured technology) must
    // stay clear of every box.
    function twoLine(points: Array<{ x: number; y: number }>, tech: string, nodes: PositionedElement[]) {
        const edge: RoutedRelationship = {
            id: 'rel-0', points,
            relationship: { id: 'rel-0', from: 'a', to: 'b', label: 'Sends events', relType: 'uses', technology: tech },
        };
        const layout: LayoutResult = { elements: nodes, relationships: [edge], width: 800, height: 700 };
        const svg = new SvgBuilder().build(layout, { theme: ClassicTheme });
        const l = /<text x="([\d.]+)" y="([\d.]+)" fill="[^"]*" stroke[^>]*>Sends events<\/text>/.exec(svg)!;
        const t = /data-field="relationship-technology" x="([\d.]+)" y="([\d.]+)"/.exec(svg)!;
        const width = measureTextPx(`[${tech}]`, 11, textMetricVariant(ClassicTheme.styles.fontFamily, false, true), TEXT_METRICS);
        const cx = Number(t[1]);
        const block = { x0: cx - width / 2, x1: cx + width / 2, y0: Number(l[2]) - 9, y1: Number(t[2]) + 3 };
        const hits = nodes.filter(n => block.x0 < n.x + n.width && block.x1 > n.x && block.y0 < n.y + n.height && block.y1 > n.y).map(n => n.id);
        return { hits, block, width };
    }
    const wide = 'W'.repeat(20);
    const obstacle = (): PositionedElement => ({ ...node('c', 190, 118), width: 200, height: 50 });
    const gapNodes = (): PositionedElement[] => [{ ...node('a', 0, 0), width: 200 }, { ...node('b', 0, 230), width: 200 }, obstacle()];

    it('measures the technology width: a wide line clears a box that an estimate would miss (straight)', () => {
        const r = twoLine([{ x: 100, y: 100 }, { x: 100, y: 230 }], wide, gapNodes());
        assert.ok(r.width > 190, `measured ${r.width}`);
        assert.deepStrictEqual(r.hits, []);
    });

    it('measures the technology width on a routed edge', () => {
        const r = twoLine([{ x: 100, y: 100 }, { x: 100, y: 165 }, { x: 100, y: 230 }], wide, gapNodes());
        assert.deepStrictEqual(r.hits, []);
    });

    it('keeps the whole two-line block clear of both boxes in a short gap', () => {
        const nodes = [{ ...node('a', 0, 0), width: 200 }, { ...node('b', 0, 130), width: 200 }];
        const r = twoLine([{ x: 100, y: 100 }, { x: 100, y: 130 }], 'HTTPS', nodes);
        assert.deepStrictEqual(r.hits, []);
    });

    it('keeps the whole two-line block clear of both boxes in a short gap (routed)', () => {
        const nodes = [{ ...node('a', 0, 0), width: 200 }, { ...node('b', 0, 128), width: 200 }];
        const r = twoLine([{ x: 100, y: 100 }, { x: 100, y: 108 }, { x: 100, y: 128 }], 'HTTPS', nodes);
        assert.deepStrictEqual(r.hits, []);
    });

    // A gap (20 px) shorter than the two-line block, with boxes wider than the label can slide
    // within (it must stay on its path, #419): no position is clear. Contract: the technology
    // never moves the label away from where it sits without a technology.
    const tight = (): PositionedElement[] => [{ ...node('a', 0, 0), width: 200 }, { ...node('b', 0, 120), width: 200 }];
    function labelOnly(points: Array<{ x: number; y: number }>, tech?: string) {
        const edge: RoutedRelationship = {
            id: 'rel-0', points,
            relationship: { id: 'rel-0', from: 'a', to: 'b', label: 'Sends events', relType: 'uses', ...(tech ? { technology: tech } : {}) },
        };
        const svg = new SvgBuilder().build({ elements: tight(), relationships: [edge], width: 800, height: 700 }, { theme: ClassicTheme });
        const m = /<text x="([\d.]+)" y="([\d.]+)" fill="[^"]*" stroke[^>]*>Sends events<\/text>/.exec(svg)!;
        const t = /data-field="relationship-technology" x="[\d.]+" y="([\d.]+)"/.exec(svg);
        return { x: Number(m[1]), y: Number(m[2]), techY: t ? Number(t[1]) : undefined };
    }

    it('when no block position is clear, the label keeps its no-technology position and the technology sits under it (straight)', () => {
        const pts = [{ x: 100, y: 100 }, { x: 100, y: 120 }];
        const without = labelOnly(pts);
        const withTech = labelOnly(pts, 'HTTPS');
        assert.strictEqual(withTech.x, without.x);
        assert.strictEqual(withTech.y, without.y);
        assert.strictEqual(withTech.techY, without.y + 13);
    });

    it('when no block position is clear, the label keeps its no-technology position and the technology sits under it (routed)', () => {
        const pts = [{ x: 100, y: 100 }, { x: 100, y: 110 }, { x: 100, y: 120 }];
        const without = labelOnly(pts);
        const withTech = labelOnly(pts, 'HTTPS');
        assert.strictEqual(withTech.x, without.x);
        assert.strictEqual(withTech.y, without.y);
        assert.strictEqual(withTech.techY, without.y + 13);
    });
});
