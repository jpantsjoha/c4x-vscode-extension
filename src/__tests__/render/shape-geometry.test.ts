/**
 * The C4 shape set (#323): edge clipping, text-safe box, minimum size and
 * host/client parity for person, cylinder, bucket, folder, web browser,
 * terminal, box and rounded box.
 *
 * Outline checks are independent of the code under test: the outline markup
 * is flattened here into polygons (rect corners, circles, SVG arcs) and a
 * point is "on the outline" when it lies within a small tolerance of the
 * boundary of the union of those polygons.
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
import * as vm from 'vm';
import { readFileSync } from 'fs';
import * as path from 'path';
import {
    SHAPE_GEOMETRY_CLIENT_FUNCTIONS,
    shapeMinSize,
    shapeOutlineSvg,
    shapeSideInsets,
    shapeTextBox,
} from '../../render/shapeGeometry';
import { calculateOptimalConnectionPoints } from '../../render/EdgeRouter';
import { PREVIEW_CLIENT_SCRIPT, computeOptimalConnectionPoints } from '../../webview/previewClientScript';
import { paintNodeWithStyle } from '../../webview/elementStyleClient';
import { renderNode } from '../../render/ElementRenderer';
import { clipRoutedEnds } from '../../render/SvgBuilder';
import { LabelCollisionTracker } from '../../render/LabelRenderer';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from '../../render/textLayout';
import { drawnShapeNames, outlineForShape, resolveElementStyle, type ResolvedElementStyle, type StyleOutline } from '../../render/elementStyle';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, type PositionedElement } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import type { C4Element } from '../../model/C4Model';

type Pt = { x: number; y: number };
type Polygon = Pt[];

const SHAPES: ReadonlyArray<[string, StyleOutline]> = [
    ['Person', 'person'], ['Cylinder', 'cylinder'], ['Bucket', 'bucket'], ['Folder', 'folder'],
    ['WebBrowser', 'webBrowser'], ['Terminal', 'terminal'], ['Box', 'box'], ['RoundedBox', 'roundedBox'],
];

// ── Independent outline flattening ──────────────────────────────────

function attr(tag: string, name: string): string | undefined {
    return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function roundedRect(x: number, y: number, w: number, h: number, rx: number): Polygon {
    const r = Math.max(0, Math.min(rx, w / 2, h / 2));
    if (r === 0) { return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]; }
    const pts: Polygon = [];
    const corner = (cx: number, cy: number, from: number) => {
        for (let i = 0; i <= 32; i++) {
            const a = from + (i / 32) * (Math.PI / 2);
            pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
        }
    };
    corner(x + w - r, y + r, -Math.PI / 2);
    corner(x + w - r, y + h - r, 0);
    corner(x + r, y + h - r, Math.PI / 2);
    corner(x + r, y + r, Math.PI);
    return pts;
}

function circle(cx: number, cy: number, r: number): Polygon {
    return Array.from({ length: 360 }, (_, i) => ({ x: cx + r * Math.cos(i * Math.PI / 180), y: cy + r * Math.sin(i * Math.PI / 180) }));
}

/** SVG elliptical arc, endpoint parameterisation to points (SVG 1.1 F.6.5, no rotation). */
function arcPoints(p0: Pt, rx: number, ry: number, large: boolean, sweep: boolean, p1: Pt): Pt[] {
    const dx = (p0.x - p1.x) / 2;
    const dy = (p0.y - p1.y) / 2;
    const lambda = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (lambda > 1) { rx *= Math.sqrt(lambda); ry *= Math.sqrt(lambda); }
    const num = rx * rx * ry * ry - rx * rx * dy * dy - ry * ry * dx * dx;
    const den = rx * rx * dy * dy + ry * ry * dx * dx;
    let coef = Math.sqrt(Math.max(0, num / den));
    if (large === sweep) { coef = -coef; }
    const cxp = coef * (rx * dy) / ry;
    const cyp = coef * -(ry * dx) / rx;
    const cx = cxp + (p0.x + p1.x) / 2;
    const cy = cyp + (p0.y + p1.y) / 2;
    const angle = (ux: number, uy: number) => Math.atan2(uy, ux);
    const t0 = angle((dx - cxp) / rx, (dy - cyp) / ry);
    let dt = angle((-dx - cxp) / rx, (-dy - cyp) / ry) - t0;
    if (sweep && dt < 0) { dt += 2 * Math.PI; }
    if (!sweep && dt > 0) { dt -= 2 * Math.PI; }
    return Array.from({ length: 65 }, (_, i) => {
        const t = t0 + (i / 64) * dt;
        return { x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) };
    });
}

function pathPolygon(d: string): Polygon {
    const tokens = d.match(/[MLAZ]|-?\d+(?:\.\d+)?/g) ?? [];
    const pts: Polygon = [];
    let i = 0;
    let cur: Pt = { x: 0, y: 0 };
    while (i < tokens.length) {
        const cmd = tokens[i++];
        if (cmd === 'M' || cmd === 'L') {
            cur = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
            pts.push(cur);
        } else if (cmd === 'A') {
            const rx = Number(tokens[i++]); const ry = Number(tokens[i++]);
            i++; // rotation
            const large = tokens[i++] === '1'; const sweep = tokens[i++] === '1';
            const end = { x: Number(tokens[i++]), y: Number(tokens[i++]) };
            pts.push(...arcPoints(cur, rx, ry, large, sweep, end).slice(1));
            cur = end;
        }
    }
    return pts;
}

/** The filled outline primitives of a shape's markup (not lids, not detail). */
function outlinePolygons(markup: string): Polygon[] {
    const body = markup.replace(/<g class="shape-detail">[\s\S]*?<\/g>/g, '');
    const polys: Polygon[] = [];
    for (const tag of body.match(/<(rect|circle|path)\b[^>]*>/g) ?? []) {
        if (attr(tag, 'fill') === 'none') { continue; }
        if (tag.startsWith('<rect')) {
            polys.push(roundedRect(Number(attr(tag, 'x')), Number(attr(tag, 'y')), Number(attr(tag, 'width')), Number(attr(tag, 'height')), Number(attr(tag, 'rx'))));
        } else if (tag.startsWith('<circle')) {
            polys.push(circle(Number(attr(tag, 'cx')), Number(attr(tag, 'cy')), Number(attr(tag, 'r'))));
        } else {
            polys.push(pathPolygon(attr(tag, 'd') ?? ''));
        }
    }
    return polys;
}

function inside(p: Pt, poly: Polygon): boolean {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[i]; const b = poly[j];
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) { c = !c; }
    }
    return c;
}

function distanceToBoundary(p: Pt, poly: Polygon): number {
    let best = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j]; const b = poly[i];
        const vx = b.x - a.x; const vy = b.y - a.y;
        const len = vx * vx + vy * vy;
        const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len));
        best = Math.min(best, Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy)));
    }
    return best;
}

/** Within `tol` of the boundary of the union of `polys`: near some boundary, and not deep inside any polygon. */
function onOutline(p: Pt, polys: Polygon[], tol = 0.6): boolean {
    const near = polys.some(poly => distanceToBoundary(p, poly) <= tol);
    const buried = polys.some(poly => inside(p, poly) && distanceToBoundary(p, poly) > tol);
    return near && !buried;
}

function outlineAt(outline: StyleOutline, box: { x: number; y: number; width: number; height: number }, radius = 10): Polygon[] {
    return outlinePolygons(shapeOutlineSvg(outline, box.x, box.y, box.width, box.height, radius, { fill: '#fff', stroke: '#000', strokeWidth: 2, dashAttr: '' }));
}

// ── Tests ────────────────────────────────────────────────────────────

describe('C4 shape set (#323)', () => {
    it('draws the eight shapes #323 owns; #334 shapes stay undrawn', () => {
        assert.deepStrictEqual(drawnShapeNames().sort(), SHAPES.map(([name]) => name).sort());
        for (const [name, outline] of SHAPES) {
            assert.strictEqual(outlineForShape(name), outline);
        }
        assert.strictEqual(outlineForShape('Hexagon'), 'rect');
    });

    describe('arrows end on the outline, not the bounding box', () => {
        const sizes: ReadonlyArray<[number, number]> = [[240, 130], [220, 120], [200, 160], [300, 200]];
        for (const [name, outline] of SHAPES) {
            const min = shapeMinSize(outline, false);
            const all = min.width > 0 ? [...sizes, [min.width, min.height] as [number, number]] : sizes;
            for (const [width, height] of all) {
                it(`${name} ${width}x${height}: every side's endpoint is on the outline`, () => {
                    const box = { x: 500, y: 500, width, height, outline };
                    const polys = outlineAt(outline, box);
                    // A neighbour placed below, above, right and left selects each side in turn.
                    const neighbours = [
                        { x: 500, y: 1000, width: 100, height: 80 },
                        { x: 500, y: 100, width: 100, height: 80 },
                        { x: 1100, y: 500, width: 100, height: 80 },
                        { x: 100, y: 500, width: 100, height: 80 },
                    ];
                    for (const other of neighbours) {
                        const out = calculateOptimalConnectionPoints(box, other);
                        assert.ok(onOutline(out.from, polys), `${name}: start ${JSON.stringify(out.from)} toward ${JSON.stringify(other)} is not on the outline`);
                        const back = calculateOptimalConnectionPoints(other, box);
                        assert.ok(onOutline(back.to, polys), `${name}: end ${JSON.stringify(back.to)} is not on the outline`);
                    }
                });
            }
        }

        it('the bounding-box midpoint misses the folder, bucket and person outlines (the clipping matters)', () => {
            const box = { x: 0, y: 0, width: 240, height: 130 };
            assert.ok(!onOutline({ x: 120, y: 0 }, outlineAt('folder', box)), 'folder top centre');
            assert.ok(!onOutline({ x: 0, y: 65 }, outlineAt('bucket', box)), 'bucket left centre');
            assert.ok(!onOutline({ x: 0, y: 65 }, outlineAt('person', box)), 'person left centre');
        });

        it('every arrow in a rendered diagram ends on its elements\' outlines (whole pipeline)', () => {
            const dsl = readFileSync(path.join(__dirname, '..', 'snapshots', 'fixtures', 'shapes.c4x'), 'utf-8');
            for (const theme of [ClassicTheme, C4ModelTheme]) {
                const view = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'shapes').views[0];
                const layout = new DagreLayoutEngine().layoutSync(view);
                const svg = new SvgBuilder().build(layout, { theme, view });
                const byId = new Map(layout.elements.map(el => [el.id, el]));
                let checked = 0;
                for (const edge of layout.relationships) {
                    const group = new RegExp(`<g class="edge" data-id="${edge.id}">\\s*<path[^>]*>\\s*<path d="([^"]+)"`).exec(svg);
                    assert.ok(group, `edge ${edge.id} drawn`);
                    // The drawn path: a straight line or a routed polyline (#419); its ends are the first and last point.
                    const pts = [...group[1].matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map(m => ({ x: Number(m[1]), y: Number(m[2]) }));
                    const ends: Array<[string, Pt]> = [
                        [edge.relationship.from, pts[0]],
                        [edge.relationship.to, pts[pts.length - 1]],
                    ];
                    for (const [id, point] of ends) {
                        const el = byId.get(id) as PositionedElement;
                        const style = resolveElementStyle(el.element, theme, undefined);
                        const polys = outlineAt(style.outline, el, theme.styles.borderRadius);
                        assert.ok(onOutline(point, polys, 1), `${theme.name}: ${edge.id} end at ${JSON.stringify(point)} not on ${id} (${style.outline})`);
                        checked++;
                    }
                }
                assert.strictEqual(checked, layout.relationships.length * 2);
            }
        });
    });

    describe('text stays inside the shape at its minimum size', () => {
        const LONG = 'A description long enough to need several lines inside the narrowest shapes';
        for (const [name, outline] of SHAPES) {
            for (const withIcon of [false, true]) {
                it(`${name}${withIcon ? ' with an icon' : ''}: text box inside the outline, every line inside the text box`, () => {
                    const min = shapeMinSize(outline, withIcon);
                    const width = Math.max(min.width, 220);
                    const height = Math.max(min.height, 120);
                    const element = {
                        id: 'n', type: 'Container', label: 'Statement Store Service', technology: 'Amazon Web Services S3 Bucket',
                        description: LONG, shape: name, ...(withIcon ? { sprite: 'react' } : {}),
                    } as unknown as C4Element;
                    const node = { id: 'n', element, x: 40, y: 40, width, height } as PositionedElement;
                    const box = shapeTextBox(outline, 40, 40, width, height);
                    const polys = outlineAt(outline, node, ClassicTheme.styles.borderRadius);
                    // The theme rectangle, box, rounded box and cylinder keep their pre-#323 text box
                    // (the bounding box, or a box centred on it); their corners are checked clear of the
                    // corner radius. The named shapes' text boxes must be inside the outline as they are.
                    const legacy = outline === 'box' || outline === 'roundedBox' || outline === 'cylinder';
                    const c = legacy ? ClassicTheme.styles.borderRadius * 0.3 + 1 : 1;
                    for (const corner of [{ x: box.x + c, y: box.y + c }, { x: box.x + box.width - c, y: box.y + c }, { x: box.x + c, y: box.y + box.height - c }, { x: box.x + box.width - c, y: box.y + box.height - c }]) {
                        assert.ok(polys.some(poly => inside(corner, poly)), `${name}: text box corner ${JSON.stringify(corner)} outside the outline`);
                    }
                    const svg = renderNode(node, ClassicTheme, new LabelCollisionTracker());
                    // Every rendered line, with the font size and weight of its <text>.
                    const lines: Array<{ baseline: number; content: string; size: number; bold: boolean; italic: boolean }> = [];
                    for (const [, open, inner] of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
                        const size = Number(attr(open, 'font-size'));
                        const bold = attr(open, 'font-weight') === 'bold';
                        const italic = attr(open, 'font-style') === 'italic';
                        const spans = [...inner.matchAll(/<tspan\b[^>]*\sy="([\d.]+)"[^>]*>([^<]*)<\/tspan>/g)];
                        if (spans.length > 0) {
                            spans.forEach(([, y, content]) => lines.push({ baseline: Number(y), content, size, bold, italic }));
                        } else {
                            lines.push({ baseline: Number(attr(open, 'y')), content: inner, size, bold, italic });
                        }
                    }
                    assert.ok(lines.length >= 3, `${name}: text rendered`);
                    const top = withIcon ? box.y + 50 : box.y;
                    for (const line of lines) {
                        assert.ok(line.baseline - line.size * 0.8 >= top - 0.5, `${name}: "${line.content}" top above the text area ${top}`);
                        assert.ok(line.baseline + line.size * 0.25 <= box.y + box.height + 0.5, `${name}: "${line.content}" bottom below the text box`);
                    }
                    // The named shapes wrap to the text box (measured glyph widths, 8px padding each side).
                    if (outline !== 'box' && outline !== 'roundedBox' && outline !== 'cylinder') {
                        for (const line of lines) {
                            const decoded = line.content.replace(/&amp;/g, '&');
                            assert.ok(measureTextPx(decoded, line.size, textMetricVariant(ClassicTheme.styles.fontFamily, line.bold, line.italic), TEXT_METRICS) <= box.width - 16 + 0.01, `${name}: "${decoded}" wider than the text box`);
                        }
                    }
                });
            }
        }
    });

    describe('wrapped text stays inside the inner text box (#323, measured widths)', () => {
        const WIDE = 'W'.repeat(24);
        const SHORT = 'A one-line description';

        /** Every drawn line of a node, with the metrics of its <text>. */
        function drawnLines(svg: string): Array<{ baseline: number; content: string; size: number; bold: boolean; italic: boolean }> {
            const lines: Array<{ baseline: number; content: string; size: number; bold: boolean; italic: boolean }> = [];
            for (const [, open, inner] of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
                const size = Number(attr(open, 'font-size'));
                const bold = attr(open, 'font-weight') === 'bold';
                const italic = attr(open, 'font-style') === 'italic';
                const spans = [...inner.matchAll(/<tspan\b[^>]*\sy="([\d.]+)"[^>]*>([^<]*)<\/tspan>/g)];
                if (spans.length > 0) {
                    spans.forEach(([, y, content]) => lines.push({ baseline: Number(y), content, size, bold, italic }));
                } else {
                    lines.push({ baseline: Number(attr(open, 'y')), content: inner.replace(/<title>[\s\S]*?<\/title>/, ''), size, bold, italic });
                }
            }
            return lines;
        }

        function assertInside(name: string, outline: StyleOutline, withIcon: boolean, label: string, description: string, height: number, width: number): void {
            const element = {
                id: 'n', type: 'Container', label, technology: 'Java', description, shape: name, ...(withIcon ? { sprite: 'react' } : {}),
            } as unknown as C4Element;
            assertNodeInside(name, outline, withIcon, { id: 'n', element, x: 40, y: 40, width, height } as PositionedElement);
        }

        function assertNodeInside(name: string, outline: StyleOutline, withIcon: boolean, node: PositionedElement): void {
            const { x, y, width, height } = node as { x: number; y: number; width: number; height: number };
            const box = shapeTextBox(outline, x, y, width, height);
            const svg = renderNode(node, ClassicTheme, new LabelCollisionTracker());
            const top = withIcon ? box.y + 50 : box.y;
            const lines = drawnLines(svg);
            assert.ok(lines.length >= 3, `${name}: three fields drawn`);
            for (const line of lines) {
                const text = line.content.replace(/&amp;/g, '&');
                const variant = textMetricVariant(ClassicTheme.styles.fontFamily, line.bold, line.italic);
                assert.ok(measureTextPx(text, line.size, variant, TEXT_METRICS) <= box.width - 16 + 0.01, `${name}${withIcon ? '+icon' : ''} ${width}x${height}: "${text}" wider than the text box`);
                assert.ok(line.baseline - line.size * 0.8 >= top - 0.5, `${name}: "${text}" above the text area`);
                assert.ok(line.baseline + line.size * 0.25 <= box.y + box.height + 0.5, `${name}: "${text}" below the text box`);
            }
        }

        for (const [name, outline] of SHAPES) {
            if (outline === 'box' || outline === 'roundedBox' || outline === 'cylinder') { continue; }
            for (const withIcon of [false, true]) {
                const min = shapeMinSize(outline, withIcon);
                it(`${name}${withIcon ? ' with an icon' : ''}: wide glyphs and a one-line description fit at the minimum size`, () => {
                    assertInside(name, outline, withIcon, WIDE, SHORT, min.height, min.width);
                });
            }
        }

        it('layout grows a named shape for long text and keeps the minimum size when growth is off', () => {
            const source = '%%{ c4: component }%%\ngraph TB\nComponent(a, "Statement Store", "S3", "' + 'A description long enough to need many lines inside the narrow bucket '.repeat(2) + '", $shape="Bucket")\n';
            const view = new C4ModelBuilder().build(new C4XParser().parse(source), 't').views[0];
            const grown = new DagreLayoutEngine().layoutSync(view, { theme: ClassicTheme }).elements[0];
            const fixed = new DagreLayoutEngine().layoutSync(view, { theme: ClassicTheme, growText: false }).elements[0];
            assert.strictEqual(fixed.height, Math.max(120, shapeMinSize('bucket', false).height));
            assert.ok(grown.height > fixed.height, `grew ${fixed.height} -> ${grown.height}`);
            const svg = renderNode(grown, ClassicTheme, new LabelCollisionTracker());
            assert.ok(!svg.includes('\u2026'), 'grown to fit: no ellipsis');
            assertNodeInside('Bucket', 'bucket', false, grown);
        });
    });

    describe('saved geometry, routed edges and the cylinder icon (#323)', () => {
        const LONGTEXT = 'A description long enough to need many lines inside the narrow bucket '.repeat(2);

        it('a shape with saved $x/$y keeps its base size and position however long its text', () => {
            const source = `%%{ c4: component }%%\ngraph TB\nComponent(a, "Statement Store", "S3", "${LONGTEXT}", $shape="Bucket", $x="100", $y="60")\n`;
            const view = new C4ModelBuilder().build(new C4XParser().parse(source), 't').views[0];
            const el = new DagreLayoutEngine().layoutSync(view, { theme: ClassicTheme }).elements[0];
            assert.strictEqual(el.height, Math.max(120, shapeMinSize('bucket', false).height));
            assert.strictEqual(el.width, Math.max(220, shapeMinSize('bucket', false).width));
            const unpinned = new C4ModelBuilder().build(new C4XParser().parse(source.replace(', $x="100", $y="60"', '')), 't').views[0];
            assert.ok(new DagreLayoutEngine().layoutSync(unpinned, { theme: ClassicTheme }).elements[0].height > el.height, 'the same text grows an unpinned shape');
        });

        it('clipRoutedEnds moves a routed end at a side midpoint onto the outline and leaves other ends alone', () => {
            const mk = (id: string, x: number, y: number) => ({ id, x, y, width: 240, height: 130 }) as unknown as PositionedElement;
            const folder = mk('f', 0, 0);
            const bucket = mk('b', 0, 400);
            const outlines = new Map([['f', 'folder'], ['b', 'bucket']]);
            const m = shapeSideInsets('folder', 240, 130);
            const sideY = 400 + 65;
            const routed = clipRoutedEnds([{ x: 120, y: 0 }, { x: 120, y: -100 }, { x: -50, y: -100 }, { x: -50, y: sideY }, { x: 0, y: sideY }], folder, bucket, outlines);
            assert.deepStrictEqual(routed[0], { x: 120, y: m.top });
            const b = shapeSideInsets('bucket', 240, 130);
            assert.deepStrictEqual(routed[4], { x: b.left, y: sideY });
            const offset = clipRoutedEnds([{ x: 125, y: 0 }, { x: 125, y: -100 }], folder, bucket, outlines);
            assert.deepStrictEqual(offset[0], { x: 125, y: 0 });
            assert.deepStrictEqual(clipRoutedEnds([{ x: 120, y: 0 }, { x: 120, y: -100 }], folder, bucket, undefined)[0], { x: 120, y: 0 });
        });

        it('a cylinder with a sprite draws its icon where it did before #323', () => {
            const element = { id: 'd', type: 'Container', label: 'DB', shape: 'Cylinder', sprite: 'react' } as unknown as C4Element;
            const svg = renderNode({ id: 'd', element, x: 40, y: 40, width: 240, height: 130 } as PositionedElement, ClassicTheme, new LabelCollisionTracker());
            const t = /translate\(([\d.]+), ([\d.]+)\)/.exec(svg)!;
            assert.strictEqual(Number(t[2]), 50);
        });
    });

    describe('minimum size in layout', () => {
        function layoutOf(source: string) {
            const view = new C4ModelBuilder().build(new C4XParser().parse(`%%{ c4: component }%%\ngraph TB\n${source}`), 't').views[0];
            return new DagreLayoutEngine().layoutSync(view).elements[0];
        }

        it('raises an element to its shape\'s minimum and leaves unshaped elements at the type size', () => {
            assert.deepStrictEqual([layoutOf('Component(a, "A")\n').width, layoutOf('Component(a, "A")\n').height], [220, 120]);
            const terminal = layoutOf('Component(a, "A", $shape="Terminal", $sprite="react")\n');
            assert.deepStrictEqual([terminal.width, terminal.height], [220, shapeMinSize('terminal', true).height]);
            const person = layoutOf('Component(a, "A", $shape="Person", $sprite="react")\n');
            assert.deepStrictEqual([person.width, person.height], [220, shapeMinSize('person', true).height]);
        });

        it('honours a shape set by an elementStyle rule', () => {
            const bucket = layoutOf('elementStyle Store $shape="Bucket", $sprite="react"\nComponent(a, "A", $tags="Store")\n');
            assert.strictEqual(bucket.height, shapeMinSize('bucket', true).height);
        });
    });

    describe('webview client parity', () => {
        it('the client clips edges exactly as the host does', () => {
            const boxes = [
                { x: 0, y: 0, width: 240, height: 130 }, { x: 400, y: 20, width: 200, height: 160 },
                { x: 30, y: 400, width: 260, height: 140 }, { x: 500, y: 500, width: 220, height: 120 },
            ];
            for (const [, outline] of SHAPES) {
                for (const a of boxes) {
                    for (const b of boxes) {
                        if (a === b) { continue; }
                        const host = calculateOptimalConnectionPoints({ ...a, outline }, { ...b, outline: 'person' });
                        const client = computeOptimalConnectionPoints(
                            { ...a, insets: shapeSideInsets(outline, a.width, a.height) },
                            { ...b, insets: shapeSideInsets('person', b.width, b.height) },
                        );
                        assert.deepStrictEqual({ from: client.from, to: client.to }, { from: host.from, to: host.to });
                    }
                }
            }
        });

        it('the assembled client script embeds every geometry function verbatim and clips with it', () => {
            for (const fn of SHAPE_GEOMETRY_CLIENT_FUNCTIONS) {
                assert.ok(PREVIEW_CLIENT_SCRIPT.includes(fn.toString().replace(/\bexports\./g, '')), `${fn.name} is embedded unchanged`);
            }
            assert.ok(/insets: shape \? shapeSideInsets\(shape, snapshot\.width, snapshot\.height\)/.test(PREVIEW_CLIENT_SCRIPT), 'currentBox clips to the drawn shape');
        });

        it('the embedded geometry functions run stand-alone and agree with the host', () => {
            const source = SHAPE_GEOMETRY_CLIENT_FUNCTIONS.map(fn => fn.toString().replace(/\bexports\./g, '')).join('\n');
            const context: Record<string, unknown> = {};
            vm.runInNewContext(`${source}\nresult = [${SHAPES.map(([, o]) => `[shapeSideInsets('${o}', 240, 130), shapeTextBox('${o}', 5, 7, 240, 130), shapeMinSize('${o}', true)]`).join(',')}];`, context);
            assert.deepStrictEqual(JSON.parse(JSON.stringify(context.result)), SHAPES.map(([, o]) => [shapeSideInsets(o, 240, 130), shapeTextBox(o, 5, 7, 240, 130), shapeMinSize(o, true)]));
        });

        it('a staged repaint recolours the outline, head and shape detail', () => {
            const attrs: Array<Record<string, string>> = [];
            const make = (init: Record<string, string>) => {
                const a = { ...init };
                attrs.push(a);
                return { getAttribute: (n: string) => (n in a ? a[n] : null), setAttribute: (n: string, v: string) => { a[n] = v; }, removeAttribute: (n: string) => { delete a[n]; } };
            };
            const head = make({ fill: '#fff', stroke: '#000' });
            const bar = make({ 'data-paint': 'stroke', fill: '#000' });
            const dot = make({ 'data-paint': 'fill', fill: '#fff' });
            const glyph = make({ 'data-paint': 'line', fill: 'none', stroke: '#000' });
            const node = {
                querySelectorAll: (selector: string) => selector.includes('circle') ? [head]
                    : selector.includes('shape-detail') ? [bar, dot, glyph] : [],
            };
            paintNodeWithStyle(node, { fill: '#F0F0F0', stroke: '#BF101D', color: '#BF101D', border: 'solid' } as ResolvedElementStyle, 2);
            assert.deepStrictEqual([head.getAttribute('stroke'), bar.getAttribute('fill'), dot.getAttribute('fill'), glyph.getAttribute('stroke'), glyph.getAttribute('fill')],
                ['#BF101D', '#BF101D', '#F0F0F0', '#BF101D', 'none']);
        });
    });
});
