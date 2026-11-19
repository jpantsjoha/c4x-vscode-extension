/**
 * Edge routing (#419). Edges used to be drawn as a straight line between the
 * nearest sides of their two boxes whatever lay between them, so an edge from
 * A to C passed through B in a column. The layout engine now routes every
 * edge around unrelated boxes and SvgBuilder draws exactly those points.
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
import { readFileSync } from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, LayoutResult, Point, PositionedElement } from '../../layout/DagreLayoutEngine';
import { SvgBuilder, routedPointsAttach } from '../../render/SvgBuilder';
import {
    midpoint,
    routeAroundObstacles,
    polylineLengthInBoxes,
    segmentLengthInBox,
    offsetPolyline,
    offsetPerpendicular,
    polylineLabelPoint,
    distanceToBoxBorder,
    ROUTE_CLEARANCE,
    MAX_GRID_NODES,
    Box,
    RouteStats,
} from '../../render/EdgeRouter';
import { ClassicTheme } from '../../themes/ClassicTheme';
import type { C4Element } from '../../model/C4Model';
import { discoverCorpus, loadPipeline } from '../compat/corpus';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** The issue's reproduction: three containers in a column, a to c skips b. */
const REPRO = `%%{ c4: container }%%
graph TB
    Container(a, "A", "Node.js", "First")
    Container(b, "B", "Node.js", "Second")
    Container(c, "C", "Node.js", "Third")
    a -->|Calls| b
    b -->|Calls| c
    a -->|Also calls| c
`;

function render(dsl: string): { layout: LayoutResult; svg: string } {
    const model = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'edge-routing');
    const view = model.views[0];
    const layout = new DagreLayoutEngine().layoutSync(view);
    const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, viewType: view.type, edgesOnTop: true });
    return { layout, svg };
}

function fixture(rel: string): string {
    return readFileSync(path.join(ROOT, rel), 'utf8');
}

/** Drawn polyline of each edge, read back from the SVG. */
function drawnPaths(svg: string): Map<string, Point[]> {
    const out = new Map<string, Point[]>();
    for (const m of svg.matchAll(/<g class="edge" data-id="([^"]+)">\s*<path class="edge-hit-area" d="([^"]*)"/g)) {
        out.set(m[1], [...m[2].matchAll(/[ML]\s*([\d.-]+)[ ,]([\d.-]+)/g)].map(p => ({ x: Number(p[1]), y: Number(p[2]) })));
    }
    return out;
}

/** Label anchor and text of each edge, read back from the SVG. */
function drawnLabels(svg: string): Map<string, { x: number; y: number; text: string }> {
    const out = new Map<string, { x: number; y: number; text: string }>();
    for (const m of svg.matchAll(/<g class="edge" data-id="([^"]+)">[\s\S]*?<text x="([\d.-]+)" y="([\d.-]+)"[^>]*>([^<]*)<\/text>/g)) {
        out.set(m[1], { x: Number(m[2]), y: Number(m[3]), text: m[4] });
    }
    return out;
}

/** Distance (px) from a point to a polyline. */
function distanceToPolyline(p: Point, points: Point[]): number {
    let best = Infinity;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const t = dx === 0 && dy === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)));
    }
    return best;
}

/** Leaf boxes an edge must not cross: not its endpoints, not their descendants. */
function unrelatedLeaves(layout: LayoutResult, from: string, to: string): PositionedElement[] {
    const ids = new Set(layout.elements.map(e => e.id));
    const descendants = (id: string): Set<string> => {
        const out = new Set<string>();
        const walk = (el: C4Element): void => (el.children ?? []).forEach(c => { out.add(c.id); walk(c); });
        const node = layout.elements.find(e => e.id === id);
        if (node) { walk(node.element); }
        return out;
    };
    const excluded = new Set([from, to, ...descendants(from), ...descendants(to)]);
    return layout.elements.filter(e => !excluded.has(e.id) && !(e.element.children ?? []).some(c => ids.has(c.id)));
}

/** Every drawn edge: no length inside an unrelated box, ends on both borders, drawn = layout points. */
function assertRouted(layout: LayoutResult, svg: string, label: string): number {
    const drawn = drawnPaths(svg);
    const labels = drawnLabels(svg);
    let routed = 0;
    for (const edge of layout.relationships) {
        const from = layout.elements.find(e => e.id === edge.relationship.from);
        const to = layout.elements.find(e => e.id === edge.relationship.to);
        if (!from || !to || from === to) { continue; }
        const points = drawn.get(edge.id);
        assert.ok(points && points.length >= 2, `${label}: ${edge.id} has no drawn path`);
        const inside = polylineLengthInBoxes(points, unrelatedLeaves(layout, from.id, to.id));
        assert.ok(inside <= 1, `${label}: ${from.id} -> ${to.id} passes ${inside.toFixed(1)} px through an unrelated box`);
        assert.ok(distanceToBoxBorder(points[0], from) <= 10.5, `${label}: ${edge.id} does not start on ${from.id}`);
        assert.ok(distanceToBoxBorder(points[points.length - 1], to) <= 10.5, `${label}: ${edge.id} does not end on ${to.id}`);
        // Drawn = layout points; only an end may move inward onto a shape's outline (#323, at most the side inset).
        const fmt = (ps: Array<{ x: number; y: number }>): string[][] => ps.map(p => [p.x.toFixed(2), p.y.toFixed(2)]);
        assert.strictEqual(points.length, edge.points.length, `${label}: the drawn path of ${edge.id} is not the layout's routed points`);
        assert.deepStrictEqual(fmt(points.slice(1, -1)), fmt(edge.points.slice(1, -1)), `${label}: the drawn path of ${edge.id} is not the layout's routed points`);
        for (const [drawnEnd, layoutEnd] of [[points[0], edge.points[0]], [points[points.length - 1], edge.points[edge.points.length - 1]]]) {
            assert.ok(Math.hypot(drawnEnd.x - layoutEnd.x, drawnEnd.y - layoutEnd.y) <= 40, `${label}: an end of ${edge.id} moved more than a shape inset`);
        }
        assert.ok(points.every(p => p.x >= -0.01 && p.y >= -0.01 && p.x <= layout.width + 0.01 && p.y <= layout.height + 0.01),
            `${label}: ${edge.id} leaves the ${layout.width} x ${layout.height} canvas`);
        if (points.length > 2) {
            routed++;
            const text = labels.get(edge.id);
            if (text) {
                const halfWidth = text.text.length * 12 * 0.6 / 2;
                assert.ok(text.x - halfWidth >= -0.01 && text.x + halfWidth <= layout.width + 0.01 && text.y - 12 >= -0.01 && text.y <= layout.height + 0.01,
                    `${label}: label of ${edge.id} leaves the canvas`);
                const away = distanceToPolyline({ x: text.x, y: text.y + 6 }, points);
                assert.ok(away <= halfWidth + 8, `${label}: label of ${edge.id} sits ${away.toFixed(1)} px from its path`);
            }
        }
    }
    return routed;
}

describe('Edge routing (#419)', () => {
    describe('the issue reproduction', () => {
        it('draws a -> c around b, not through it', () => {
            const { layout, svg } = render(REPRO);
            const b = layout.elements.find(e => e.id === 'b')!;
            const ac = layout.relationships.find(r => r.relationship.from === 'a' && r.relationship.to === 'c')!;
            const drawn = drawnPaths(svg).get(ac.id)!;
            assert.ok(drawn.length > 2, 'a -> c should bend around b');
            assert.strictEqual(polylineLengthInBoxes(drawn, [b]), 0);
            assert.ok(assertRouted(layout, svg, 'repro') >= 1);
        });

        it('keeps the straight lines that cross nothing exactly as 1.8.0 drew them', () => {
            const { svg } = render(REPRO);
            assert.ok(svg.includes('d="M236.25,170.00 L160.00,362.00"'), 'a -> b changed');
            assert.ok(svg.includes('d="M160.00,492.00 L236.25,522.00"'), 'b -> c changed');
        });

        it('ends the routed edge with an axis-aligned segment into the target, so the arrow head points at it', () => {
            const { layout } = render(REPRO);
            const ac = layout.relationships.find(r => r.relationship.to === 'c' && r.relationship.from === 'a')!;
            const [p, q] = ac.points.slice(-2);
            assert.ok(p.x === q.x || p.y === q.y);
        });

        it('keeps its label inside the canvas', () => {
            const { layout, svg } = render(REPRO);
            const label = svg.match(/<text x="([\d.]+)"[^>]*>Also calls<\/text>/);
            assert.ok(label);
            const halfWidth = 'Also calls'.length * 12 * 0.6 / 2;
            assert.ok(Number(label[1]) + halfWidth <= layout.width && Number(label[1]) - halfWidth >= 0);
        });
    });

    describe('other layouts', () => {
        const cases: Array<[string, string]> = [
            ['system landscape (IBS 01)', 'src/__tests__/snapshots/fixtures/ibs/01-system-landscape.c4x'],
            ['container view inside a boundary (IBS 03)', 'src/__tests__/snapshots/fixtures/ibs/03-container.c4x'],
            ['components in nested boundaries (IBS 04)', 'src/__tests__/snapshots/fixtures/ibs/04-component.c4x'],
            ['nested deployment nodes (dogfood 05a)', 'docs/validation/dogfood-2026-11-14/diagrams/05a-deployment-nested.c4x'],
        ];
        for (const [name, file] of cases) {
            it(`${name}: every edge avoids unrelated boxes and at least one is rerouted`, () => {
                const { layout, svg } = render(fixture(file));
                assert.ok(assertRouted(layout, svg, name) >= 1, `${name} no longer exercises routing`);
            });
        }

        it('every view in the compatibility corpus draws no edge through an unrelated box', () => {
            const pipeline = loadPipeline(ROOT);
            let views = 0;
            let routed = 0;
            for (const item of discoverCorpus(ROOT)) {
                let model;
                try {
                    model = item.format === 'c4x' ? pipeline.builder.build(pipeline.parser.parse(item.source), 'x')
                        : item.format === 'plantuml' ? pipeline.plantuml(item.source) : pipeline.structurizr(item.source);
                } catch { continue; }
                for (const view of model?.views ?? []) {
                    const layout = pipeline.layout.layoutSync(view);
                    const svg = pipeline.svg.build(layout, { theme: ClassicTheme, viewType: view.type, edgesOnTop: true });
                    routed += assertRouted(layout, svg, item.id);
                    views++;
                }
            }
            assert.ok(views >= 200, `only ${views} corpus views rendered`);
            assert.ok(routed >= 100, `only ${routed} corpus edges were rerouted`);
        }).timeout(60000);
    });

    describe('generated layouts (property)', () => {
        /** Deterministic pseudo-random graph: N elements, about 2N relationships, some in both directions. */
        function generated(seed: number, n: number, direction: string): string {
            let state = seed;
            const next = (): number => { state = (state * 16807) % 2147483647; return state / 2147483647; };
            const types = ['Container', 'System', 'Person', 'ContainerDb'];
            let dsl = `graph ${direction}\n`;
            for (let i = 0; i < n; i++) { dsl += `    ${types[i % types.length]}(n${i}, "Node ${i}", "Tech", "Description ${i}")\n`; }
            for (let k = 0; k < n * 2; k++) {
                const a = Math.floor(next() * n);
                const b = Math.floor(next() * n);
                if (a === b) { continue; }
                dsl += `    n${a} -->|calls ${k}| n${b}\n`;
                if (next() < 0.15) { dsl += `    n${b} -->|replies ${k}| n${a}\n`; }
            }
            return dsl;
        }

        it('every final drawn path in 40 generated layouts avoids unrelated boxes, stays in canvas and keeps its label on it', () => {
            let routed = 0;
            for (let seed = 1; seed <= 40; seed++) {
                const dsl = generated(seed * 7919, 6 + (seed % 25), ['TB', 'LR', 'BT', 'RL'][seed % 4]);
                const { layout, svg } = render(dsl);
                routed += assertRouted(layout, svg, `generated seed ${seed}`);
            }
            assert.ok(routed >= 40, `only ${routed} generated edges were rerouted`);
        }).timeout(60000);
    });

    describe('saved geometry and moved elements', () => {
        it('routes around elements whose positions are saved as $x/$y metadata (what the editor writes)', () => {
            const model = new C4ModelBuilder().build(new C4XParser().parse(REPRO), 'saved');
            const view = model.views[0];
            const saved: Record<string, { x: string; y: string }> = { a: { x: '100', y: '40' }, b: { x: '100', y: '300' }, c: { x: '100', y: '560' } };
            for (const el of view.elements) { el.metadata = { ...(el.metadata ?? {}), ...saved[el.id] }; }
            const layout = new DagreLayoutEngine().layoutSync(view);
            const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, edgesOnTop: true });
            assert.strictEqual(layout.elements.find(e => e.id === 'b')!.y, 300);
            assert.ok(assertRouted(layout, svg, 'saved positions') >= 1);
        });

        it('draws the straight nearest-sides line when the points no longer attach to a moved box', () => {
            const { layout } = render(REPRO);
            const c = layout.elements.find(e => e.id === 'c')!;
            const moved: LayoutResult = { ...layout, elements: layout.elements.map(e => e.id === 'c' ? { ...c, x: c.x + 400 } : e) };
            const ac = layout.relationships.find(r => r.relationship.from === 'a' && r.relationship.to === 'c')!;
            assert.strictEqual(routedPointsAttach(ac.points, layout.elements[0], moved.elements.find(e => e.id === 'c')!), false);
            const svg = new SvgBuilder().build(moved, { theme: ClassicTheme, edgesOnTop: true });
            const drawn = drawnPaths(svg).get(ac.id)!;
            assert.strictEqual(drawn.length, 2);
            assert.ok(distanceToBoxBorder(drawn[1], moved.elements.find(e => e.id === 'c')!) < 0.01);
        });

        it('treats centre-to-centre points from a hand-built layout as not attached', () => {
            const a: PositionedElement = { id: 'a', element: { id: 'a', type: 'Container', label: 'A' } as PositionedElement['element'], x: 0, y: 0, width: 200, height: 100 };
            const b: PositionedElement = { ...a, id: 'b', x: 0, y: 300 };
            assert.strictEqual(routedPointsAttach([{ x: 100, y: 50 }, { x: 100, y: 350 }], a, b), false);
            assert.strictEqual(routedPointsAttach([{ x: 100, y: 100 }, { x: 100, y: 300 }], a, b), true);
        });
    });

    describe('bidirectional pairs', () => {
        it('carries the lane offset in the layout points, so the two directions are drawn 20 px apart', () => {
            const { layout, svg } = render(`graph TB
System(a, "Alpha")
System(b, "Beta")
a --> |calls| b
b --> |responds| a
`);
            const [ab, ba] = layout.relationships;
            const drawn = drawnPaths(svg);
            const forward = drawn.get(ab.id)!;
            const backward = drawn.get(ba.id)!.slice().reverse();
            assert.strictEqual(forward.length, 2);
            const gap = Math.hypot(forward[0].x - backward[0].x, forward[0].y - backward[0].y);
            assert.ok(Math.abs(gap - 20) < 0.05, `lanes are ${gap.toFixed(2)} px apart`);
            assert.ok(assertRouted(layout, svg, 'bidirectional') === 0);
        });

        it('separates a rerouted pair onto two lanes as well', () => {
            const model = new C4ModelBuilder().build(new C4XParser().parse(REPRO + '    c -->|Replies| a\n'), 'pair');
            const view = model.views[0];
            const saved: Record<string, { x: string; y: string }> = { a: { x: '100', y: '40' }, b: { x: '100', y: '300' }, c: { x: '100', y: '560' } };
            for (const el of view.elements) { el.metadata = { ...(el.metadata ?? {}), ...saved[el.id] }; }
            const layout = new DagreLayoutEngine().layoutSync(view);
            const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, edgesOnTop: true });
            const drawn = drawnPaths(svg);
            const ac = drawn.get(layout.relationships.find(r => r.relationship.from === 'a' && r.relationship.to === 'c')!.id)!;
            const ca = drawn.get(layout.relationships.find(r => r.relationship.from === 'c' && r.relationship.to === 'a')!.id)!;
            assert.ok(ac.length > 2 && ca.length > 2, 'both directions should bend around b');
            const reversed = ca.slice().reverse();
            const apart = ac.every((p, i) => reversed[i] && Math.hypot(p.x - reversed[i].x, p.y - reversed[i].y) >= 19.9);
            assert.ok(apart, 'the two directions share a lane');
            assertRouted(layout, svg, 'rerouted pair');
        });
    });

    describe('routeAroundObstacles', () => {
        const a: Box = { x: 100, y: 0, width: 200, height: 100 };
        const b: Box = { x: 100, y: 200, width: 200, height: 100 };
        const c: Box = { x: 100, y: 400, width: 200, height: 100 };

        it('returns the straight line when nothing is in the way', () => {
            assert.deepStrictEqual(routeAroundObstacles(a, c, []), [{ x: 200, y: 100 }, { x: 200, y: 400 }]);
            assert.deepStrictEqual(routeAroundObstacles(a, c, [{ x: 600, y: 200, width: 100, height: 100 }]), [{ x: 200, y: 100 }, { x: 200, y: 400 }]);
        });

        it('goes around an obstacle with clearance, starting and ending on the two borders', () => {
            const route = routeAroundObstacles(a, c, [b], { bounds: { width: 600, height: 600 } });
            assert.ok(route.length > 2);
            assert.strictEqual(polylineLengthInBoxes(route, [b]), 0);
            const clear = { x: b.x - ROUTE_CLEARANCE + 0.5, y: b.y - ROUTE_CLEARANCE + 0.5, width: b.width + 2 * ROUTE_CLEARANCE - 1, height: b.height + 2 * ROUTE_CLEARANCE - 1 };
            assert.strictEqual(polylineLengthInBoxes(route, [clear]), 0, 'route runs closer than the clearance');
            assert.strictEqual(distanceToBoxBorder(route[0], a), 0);
            assert.strictEqual(distanceToBoxBorder(route[route.length - 1], c), 0);
            for (let i = 1; i < route.length; i++) {
                assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y, 'route is not orthogonal');
            }
        });

        it('keeps the straight line when no route exists inside the canvas', () => {
            const wall: Box = { x: -50, y: 150, width: 500, height: 200 };
            assert.deepStrictEqual(routeAroundObstacles(a, c, [wall], { bounds: { width: 400, height: 500 } }), [{ x: 200, y: 100 }, { x: 200, y: 400 }]);
        });

        it('never leaves the canvas', () => {
            const route = routeAroundObstacles(a, c, [b], { bounds: { width: 330, height: 500 } });
            assert.ok(route.every(p => p.x >= 0 && p.y >= 0 && p.x <= 330 && p.y <= 500));
        });

        it('keeps the straight line when every side of the source is boxed in', () => {
            const cage: Box[] = [
                { x: 90, y: -10, width: 220, height: 5 },
                { x: 90, y: 105, width: 220, height: 5 },
                { x: 90, y: -5, width: 5, height: 110 },
                { x: 305, y: -5, width: 5, height: 110 },
                b,
            ];
            assert.deepStrictEqual(routeAroundObstacles(a, c, cage), [{ x: 200, y: 100 }, { x: 200, y: 400 }]);
        });

        it('never offsets a bidirectional lane into an obstacle or off the canvas (review r1 case)', () => {
            const source: Box = { x: 100, y: 40, width: 200, height: 100 };
            const target: Box = { x: 100, y: 440, width: 200, height: 100 };
            const wall: Box = { x: 8, y: 230, width: 324, height: 100 };
            const bounds = { width: 340, height: 580 };
            for (const [from, to] of [[source, target], [target, source]]) {
                const route = routeAroundObstacles(from, to, [wall], { bounds, laneOffset: 10 });
                assert.strictEqual(polylineLengthInBoxes(route, [wall]), 0, 'lane enters the obstacle');
                assert.ok(route.every(p => p.x >= 0 && p.y >= 0 && p.x <= bounds.width && p.y <= bounds.height), 'lane leaves the canvas');
            }
        });

        it('keeps the clear unshifted line when the lane-shifted one would cross a box (review r2 case)', () => {
            const from: Box = { x: 0, y: 0, width: 100, height: 100 };
            const to: Box = { x: 200, y: 0, width: 100, height: 100 };
            const obstacle: Box = { x: 100, y: 55, width: 100, height: 45 };
            const stats: RouteStats = { gridNodes: [], refused: [], fallbacks: [] };
            const route = routeAroundObstacles(from, to, [obstacle], { bounds: { width: 300, height: 100 }, laneOffset: 10, stats });
            assert.strictEqual(polylineLengthInBoxes(route, [obstacle]), 0);
            assert.deepStrictEqual(route, [{ x: 100, y: 50 }, { x: 200, y: 50 }]);
            assert.deepStrictEqual(stats.fallbacks, [], 'a clear candidate is not a fallback');
        });

        it('never returns a path that crosses more than the best straight candidate (property, 2,000 random cases)', () => {
            let state = 12345;
            const next = (): number => { state = (state * 16807) % 2147483647; return state / 2147483647; };
            let fallbacks = 0;
            for (let k = 0; k < 2000; k++) {
                const tight = k % 2 === 0; // boxes as tall as the canvas: no room to route around
                const width = 260 + Math.floor(next() * 400);
                const height = tight ? 60 + Math.floor(next() * 80) : 120 + Math.floor(next() * 300);
                const from: Box = tight
                    ? { x: 0, y: 0, width: 80 + next() * 40, height }
                    : { x: 5 + next() * 40, y: 5 + next() * (height - 90), width: 60 + next() * 40, height: 40 + next() * 30 };
                const to: Box = tight
                    ? { x: width - 100, y: 0, width: 100, height }
                    : { x: width - 110 + next() * 30, y: 5 + next() * (height - 90), width: 60, height: 40 + next() * 30 };
                const obstacles: Box[] = [];
                for (let o = 0; o < 1 + Math.floor(next() * (tight ? 2 : 4)); o++) {
                    const gapX = from.x + from.width;
                    const gap = to.x - gapX;
                    if (tight) {
                        // A box against the top or bottom edge, reaching part-way into the channel.
                        const reach = height * (0.2 + next() * 0.6);
                        obstacles.push({ x: gapX + next() * gap * 0.5, y: next() < 0.5 ? 0 : height - reach, width: gap * (0.2 + next() * 0.5), height: reach });
                    } else {
                        obstacles.push({ x: gapX + next() * (gap - 20), y: next() * (height - 20), width: 10 + next() * 60, height: 10 + next() * 60 });
                    }
                }
                const bounds = { width, height };
                const lane = next() < 0.5 ? 10 : 0;
                const stats: RouteStats = { gridNodes: [], refused: [], fallbacks: [] };
                const route = routeAroundObstacles(from, to, obstacles, { bounds, laneOffset: lane, stats });
                const inCanvas = (pts: Point[]): boolean => pts.every(p => p.x >= -0.01 && p.y >= -0.01 && p.x <= width + 0.01 && p.y <= height + 0.01);
                const direct = routeAroundObstacles(from, to, []);
                const straightCandidates = [direct, lane ? offsetPolyline(direct, lane) : direct].filter(inCanvas);
                const best = Math.min(...straightCandidates.map(c => polylineLengthInBoxes(c, obstacles)));
                const got = polylineLengthInBoxes(route, obstacles);
                assert.ok(got <= best + 1, `case ${k}: route crosses ${got.toFixed(1)} px, a straight candidate only ${best.toFixed(1)} px`);
                assert.ok(inCanvas(route), `case ${k}: route leaves the canvas`);
                if (got > 1) { assert.strictEqual(stats.fallbacks!.length, 1, `case ${k}: a crossing route is not counted as a fallback`); }
                fallbacks += stats.fallbacks!.length;
            }
            assert.ok(fallbacks < 2000);
        });

        it('offsets both lanes of a pair when there is room for them', () => {
            const forward = routeAroundObstacles(a, c, [b], { bounds: { width: 600, height: 600 }, laneOffset: 10 });
            const backward = routeAroundObstacles(c, a, [b], { bounds: { width: 600, height: 600 }, laneOffset: 10 });
            assert.ok(forward.length > 2 && backward.length > 2);
            assert.strictEqual(polylineLengthInBoxes(forward, [b]) + polylineLengthInBoxes(backward, [b]), 0);
            assert.notDeepStrictEqual(forward, backward.slice().reverse());
        });

        it('keeps the straight line for overlapping boxes (parent and child)', () => {
            const parent: Box = { x: 0, y: 0, width: 500, height: 500 };
            assert.strictEqual(routeAroundObstacles(parent, a, [b]).length, 2);
        });

        it('is deterministic', () => {
            const one = routeAroundObstacles(a, c, [b], { bounds: { width: 600, height: 600 } });
            const two = routeAroundObstacles(a, c, [b], { bounds: { width: 600, height: 600 } });
            assert.deepStrictEqual(one, two);
        });
    });

    describe('large diagrams', () => {
        it('never allocates a search grid above the budget, and still routes around every box', () => {
            const obstacles: Box[] = [];
            for (let i = 0; i < 12; i++) {
                for (let j = 0; j < 12; j++) {
                    if (i === 0 || i === 11) { continue; }
                    obstacles.push({ x: 40 + j * 137 + i * 3, y: 40 + i * 113 + j * 2, width: 60 + (i * j) % 17, height: 40 + (i + j) % 13 });
                }
            }
            const from: Box = { x: 600, y: 0, width: 120, height: 30 };
            const to: Box = { x: 600, y: 1400, width: 120, height: 30 };
            const stats: RouteStats = { gridNodes: [], refused: [] };
            const started = Date.now();
            const route = routeAroundObstacles(from, to, obstacles, { bounds: { width: 1800, height: 1500 }, stats });
            assert.ok(route.length > 2);
            assert.strictEqual(polylineLengthInBoxes(route, obstacles), 0);
            assert.ok(stats.gridNodes.length > 0 && stats.gridNodes.every(n => n <= MAX_GRID_NODES), `grid sizes ${stats.gridNodes.join(', ')}`);
            assert.ok(Date.now() - started < 2000, 'routing one edge on a large grid took over 2 s');
        });

        it('keeps the straight line, without allocating, when even the search window is over budget', () => {
            const obstacles: Box[] = [];
            for (let k = 0; k < 400; k++) {
                obstacles.push({ x: 200 + (k * 37) % 2600 + k * 0.37, y: 200 + (k * 53) % 2600 + k * 0.29, width: 20 + k % 7, height: 20 + k % 5 });
            }
            const from: Box = { x: 0, y: 0, width: 100, height: 60 };
            const to: Box = { x: 2900, y: 2900, width: 100, height: 60 };
            const stats: RouteStats = { gridNodes: [], refused: [] };
            const route = routeAroundObstacles(from, to, obstacles, { bounds: { width: 3100, height: 3100 }, stats });
            assert.ok(stats.refused.length > 0 && stats.refused.every(n => n > MAX_GRID_NODES));
            assert.ok(stats.gridNodes.every(n => n <= MAX_GRID_NODES));
            assert.deepStrictEqual(route, routeAroundObstacles(from, to, []), 'expected the straight nearest-sides line');
        });
    });

    describe('renderer fallbacks', () => {
        it('offsets a bidirectional pair whose hand-built points do not attach', () => {
            const element = (id: string, y: number): PositionedElement => ({ id, element: { id, type: 'Container', label: id } as PositionedElement['element'], x: 0, y, width: 200, height: 100 });
            const a = element('a', 0);
            const b = element('b', 300);
            const rel = (id: string, from: string, to: string) => ({ id, relationship: { id, from, to, label: id } as LayoutResult['relationships'][number]['relationship'], points: [{ x: 100, y: 50 }, { x: 100, y: 350 }] });
            const layout: LayoutResult = { elements: [a, b], relationships: [rel('ab', 'a', 'b'), rel('ba', 'b', 'a')], width: 300, height: 450 };
            const drawn = drawnPaths(new SvgBuilder().build(layout, { theme: ClassicTheme, edgesOnTop: true }));
            assert.deepStrictEqual(drawn.get('ab'), [{ x: 90, y: 100 }, { x: 90, y: 300 }]);
            assert.deepStrictEqual(drawn.get('ba'), [{ x: 110, y: 300 }, { x: 110, y: 100 }]);
        });

        it('does not treat missing or single points as attached', () => {
            const a: PositionedElement = { id: 'a', element: { id: 'a', type: 'Container', label: 'A' } as PositionedElement['element'], x: 0, y: 0, width: 200, height: 100 };
            assert.strictEqual(routedPointsAttach(undefined, a, a), false);
            assert.strictEqual(routedPointsAttach([{ x: 0, y: 0 }], a, a), false);
        });
    });

    describe('geometry helpers', () => {
        it('segmentLengthInBox measures the clipped length', () => {
            assert.strictEqual(segmentLengthInBox({ x: 0, y: 50 }, { x: 300, y: 50 }, { x: 100, y: 0, width: 100, height: 100 }), 100);
            assert.strictEqual(segmentLengthInBox({ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 100, y: 0, width: 100, height: 100 }), 0, 'a line along the border is not inside');
        });

        it('offsetPolyline equals offsetPerpendicular for a straight line', () => {
            const shifted = offsetPerpendicular({ x: 3, y: 7 }, { x: 120, y: 260 }, 10);
            assert.deepStrictEqual(offsetPolyline([{ x: 3, y: 7 }, { x: 120, y: 260 }], 10), [shifted.from, shifted.to]);
        });

        it('offsetPolyline separates the two directions of a bent route and keeps the ends on their borders', () => {
            const route = [{ x: 100, y: 0 }, { x: 100, y: 50 }, { x: 300, y: 50 }, { x: 300, y: 100 }];
            const forward = offsetPolyline(route, 10);
            const backward = offsetPolyline(route.slice().reverse(), 10).reverse();
            assert.deepStrictEqual(forward[1], { x: 90, y: 60 });
            assert.deepStrictEqual(backward[1], { x: 110, y: 40 });
            assert.strictEqual(forward[0].y, 0);
            assert.strictEqual(forward[3].y, 100);
        });

        it('midpoint and polylineLabelPoint of an empty or single-point path', () => {
            assert.deepStrictEqual(midpoint([]), { x: 0, y: 0 });
            assert.deepStrictEqual(polylineLabelPoint([]), { x: 0, y: 0 });
            assert.deepStrictEqual(polylineLabelPoint([{ x: 4, y: 5 }]), { x: 4, y: 5 });
            assert.deepStrictEqual(offsetPolyline([{ x: 4, y: 5 }], 10), [{ x: 4, y: 5 }]);
        });

        it('offsetPolyline tolerates a zero-length segment and a reversal', () => {
            const same = offsetPolyline([{ x: 0, y: 0 }, { x: 0, y: 0 }], 10);
            assert.deepStrictEqual(same, [{ x: 0, y: 0 }, { x: 0, y: 0 }]);
            const uTurn = offsetPolyline([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }], 10);
            assert.deepStrictEqual(uTurn[1], { x: 100, y: 10 });
        });

        it('polylineLabelPoint uses the midpoint of the longest segment', () => {
            assert.deepStrictEqual(polylineLabelPoint([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 20 }]), { x: 100, y: 10 });
            assert.deepStrictEqual(polylineLabelPoint([{ x: 0, y: 0 }, { x: 10, y: 20 }]), { x: 5, y: 10 });
        });
    });
});
