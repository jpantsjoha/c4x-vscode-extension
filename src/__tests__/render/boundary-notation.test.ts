import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, type LayoutResult, type PositionedBoundary } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { renderBoundary } from '../../render/BoundaryRenderer';
import { escapeXml } from '../../render/svg-utils';
import {
    BOUNDARY_NAME_FONT_SIZE,
    BOUNDARY_TYPE_FONT_SIZE,
    boundaryBottomPadding,
    boundaryLabelInkBox,
    boundaryLabelMinWidth,
    boundaryLabelPlacement,
    boundaryTypeLabel,
} from '../../render/boundaryLabel';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from '../../render/textLayout';
import type { C4Theme } from '../../themes/Theme';
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';
import { computeBoundaryWrap, BOUNDARY_LABEL_OFFSET_X, BOUNDARY_LABEL_OFFSET_Y, buildPreviewClientScript } from '../../webview/previewClientScript';

/**
 * Boundary notation (#324): in the c4-model theme a boundary is a thin solid
 * rounded rectangle with its name and a `[Software System]` style type line at
 * the bottom left; every other theme keeps the dashed frame with its label top
 * left, byte for byte. Layout reserves the label's room.
 */

const IBS_DIR = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs');

function layoutOf(source: string, theme: C4Theme): LayoutResult {
    const view = new C4ModelBuilder().build(new C4XParser().parse(source), 't').views[0];
    return new DagreLayoutEngine(() => undefined).layoutSync(view, { theme });
}

function render(source: string, theme: C4Theme): { layout: LayoutResult; svg: string } {
    const layout = layoutOf(source, theme);
    return { layout, svg: new SvgBuilder().build(layout, { theme }) };
}

function fixture(name: string): string {
    return readFileSync(path.join(IBS_DIR, `${name}.c4x`), 'utf-8');
}

function positioned(boundaryType: string | undefined, label = 'Bank'): PositionedBoundary {
    return {
        id: 'bank-boundary-0',
        x: 100,
        y: 50,
        width: 400,
        height: 300,
        boundary: { id: 'bank-boundary-0', label, boundaryType, elements: [] },
    };
}

interface Box { left: number; top: number; right: number; bottom: number }

function overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** Drawn ink of a boundary's name and type lines, from the measured text tables. */
function labelInk(layout: LayoutResult, boundary: PositionedBoundary, theme: C4Theme): Box[] {
    const hasType = boundaryTypeLabel(boundary.boundary.boundaryType) !== undefined;
    const place = boundaryLabelPlacement(theme.boundary.labelPosition, hasType, boundary.x, boundary.y, boundary.width, boundary.height);
    const family = theme.styles.fontFamily;
    const boxes: Box[] = [];
    const nameW = measureTextPx(boundary.boundary.label, BOUNDARY_NAME_FONT_SIZE, textMetricVariant(family, true, false), TEXT_METRICS);
    boxes.push({ left: place.nameX, right: place.nameX + nameW, top: place.nameY - BOUNDARY_NAME_FONT_SIZE * 0.93, bottom: place.nameY + BOUNDARY_NAME_FONT_SIZE * 0.22 });
    if (hasType) {
        const typeW = measureTextPx(boundaryTypeLabel(boundary.boundary.boundaryType)!, BOUNDARY_TYPE_FONT_SIZE, textMetricVariant(family, false, false), TEXT_METRICS);
        boxes.push({ left: place.typeX, right: place.typeX + typeW, top: place.typeY - BOUNDARY_TYPE_FONT_SIZE * 0.93, bottom: place.typeY + BOUNDARY_TYPE_FONT_SIZE * 0.22 });
    }
    void layout;
    return boxes;
}

/** Ink of every relationship label the SvgBuilder drew, middle-anchored, from measured widths. */
function edgeLabelInk(svg: string, theme: C4Theme): Box[] {
    const edges = svg.slice(svg.indexOf('<g class="edges">'));
    const boxes: Box[] = [];
    const re = /<text (?:data-field="relationship-technology" )?x="([\d.-]+)" y="([\d.-]+)"[^>]*text-anchor="middle" font-size="(\d+)"[^>]*>([^<]*)<\/text>/g;
    let m: RegExpExecArray | null;
    const family = theme.styles.fontFamily;
    while ((m = re.exec(edges)) !== null) {
        const [, x, y, size, text] = m;
        const italic = /data-field="relationship-technology"/.test(m[0]);
        const w = measureTextPx(text.replace(/&amp;/g, '&'), Number(size), textMetricVariant(family, false, italic), TEXT_METRICS);
        boxes.push({ left: Number(x) - w / 2, right: Number(x) + w / 2, top: Number(y) - Number(size) * 0.93, bottom: Number(y) + Number(size) * 0.22 });
    }
    return boxes;
}

/** The pre-#324 renderer, kept verbatim: what every top-left theme must still draw. */
function legacyRenderBoundary(boundary: PositionedBoundary, theme: C4Theme): string {
    const style = theme.boundary;
    const dashAttr = style.dash === null ? '' : `
          stroke-dasharray="${style.dash}"`;
    const labelX = boundary.x + 10;
    const labelY = boundary.y + 14 + 6;
    return `<g class="boundary" data-id="${escapeXml(boundary.id)}">
    <rect x="${boundary.x.toFixed(2)}" y="${boundary.y.toFixed(2)}" width="${boundary.width.toFixed(2)}" height="${boundary.height.toFixed(2)}"
          rx="8" ry="8"
          fill="none"
          stroke="${style.stroke}"
          stroke-width="${style.strokeWidth}"${dashAttr}
          opacity="${style.opacity}" />
    <text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}"
          fill="${style.text}"
          font-size="14"
          font-family="${theme.styles.fontFamily}"
          font-weight="bold">${escapeXml(boundary.boundary.label)}</text>
  </g>`;
}

describe('Boundary type line text (#324)', () => {
    it('names each boundary keyword by its C4 type; an untyped subgraph has none', () => {
        assert.deepStrictEqual(
            ['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary', undefined, 'Other'].map(boundaryTypeLabel),
            ['[Software System]', '[Container]', '[Enterprise]', undefined, undefined],
        );
    });
});

describe('c4-model boundary drawing (#324)', () => {
    const svg = renderBoundary(positioned('System_Boundary', 'Internet Banking'), C4ModelTheme);

    it('is a thin solid rounded rectangle in the theme boundary colour, no dash, no fade', () => {
        assert.match(svg, /<rect x="100.00" y="50.00" width="400.00" height="300.00"\s+rx="8" ry="8"\s+fill="none"\s+stroke="#1168BD"\s+stroke-width="1"\s+opacity="1" \/>/);
        assert.ok(!svg.includes('stroke-dasharray'));
    });

    it('puts the name and the type line at the bottom left, the type line last', () => {
        // Frame bottom is y 350: type baseline 10 up, name baseline one 16 px line above that.
        assert.match(svg, /<text x="110.00" y="324.00"[^>]*font-size="14"[^>]*font-weight="bold">Internet Banking<\/text>/);
        assert.match(svg, /<text class="boundary-type" x="110.00" y="340.00"[^>]*fill="#1168BD"[^>]*font-size="12"[^>]*>\[Software System\]<\/text>/);
        assert.ok(svg.indexOf('Internet Banking') < svg.indexOf('[Software System]'));
    });

    it('prints the type each keyword stands for', () => {
        assert.ok(renderBoundary(positioned('Container_Boundary'), C4ModelTheme).includes('>[Container]</text>'));
        assert.ok(renderBoundary(positioned('Enterprise_Boundary'), C4ModelTheme).includes('>[Enterprise]</text>'));
        assert.ok(renderBoundary(positioned('System_Boundary'), C4ModelTheme).includes('>[Software System]</text>'));
    });

    it('draws an untyped subgraph with its name on the bottom baseline and no type line', () => {
        const plain = renderBoundary(positioned(undefined), C4ModelTheme);
        assert.ok(!plain.includes('boundary-type'));
        assert.match(plain, /<text x="110.00" y="340.00"[^>]*>Bank<\/text>/);
    });

    it('uses the dark theme boundary colour in the dark variant', () => {
        assert.ok(renderBoundary(positioned('System_Boundary'), C4ModelDarkTheme).includes('stroke="#69A0D5"'));
    });

    it('hands the editor the placement, reserve and width it must keep', () => {
        assert.match(svg, /<g class="boundary" data-id="bank-boundary-0" data-label-position="bottom-left" data-label-reserve="48" data-label-min-width="\d+">/);
    });

    it('escapes a hostile name and id', () => {
        const hostile = '</text><script>alert(1)</script>"&\'';
        const out = renderBoundary({ ...positioned('Container_Boundary', hostile), id: '"><svg onload=alert(1)>' }, C4ModelTheme);
        assert.ok(!out.includes('<script'));
        assert.ok(!out.includes('<svg onload'));
        assert.ok(out.includes('&lt;/text&gt;&lt;script&gt;alert(1)&lt;/script&gt;'));
        assert.ok(out.includes('data-id="&quot;&gt;&lt;svg onload=alert(1)&gt;"'));
    });
});

describe('every other theme draws a boundary exactly as before (#324)', () => {
    const themes: ReadonlyArray<[string, C4Theme]> = [
        ['classic', ClassicTheme],
        ['c4-standard', C4StandardTheme],
        ['modern', ModernTheme],
        ['muted', MutedTheme],
        ['high-contrast', HighContrastTheme],
        ['auto/dark', DarkTheme],
        ['auto/light', LightTheme],
    ];
    for (const [name, theme] of themes) {
        for (const type of [undefined, 'System_Boundary', 'Container_Boundary']) {
            it(`${name}, ${type ?? 'subgraph'}: byte-identical, top-left, dashed, no type line`, () => {
                const b = positioned(type, 'Back & End');
                assert.strictEqual(renderBoundary(b, theme), legacyRenderBoundary(b, theme));
            });
        }
        it(`${name}: layout keeps 40 px under the lowest child and no label width floor`, () => {
            assert.strictEqual(boundaryBottomPadding(theme, 'System_Boundary'), 40);
            assert.strictEqual(boundaryLabelMinWidth(theme, 'A very long boundary name indeed', 'System_Boundary'), 0);
        });
    }
});

describe('layout reserves the label (#324)', () => {
    const SOURCE = `
System_Boundary(sys, "A System With A Reasonably Long Boundary Name") {
    Container(web, "Web", "Java", "Serves pages")
    Container(api, "API", "Java", "Serves JSON")
}
web --> api
`;

    function frame(layout: LayoutResult) {
        const b = layout.boundaries![0];
        const children = layout.elements.filter(e => b.boundary.elements.includes(e.id));
        return { b, bottom: Math.max(...children.map(e => e.y + e.height)) };
    }

    it('c4-model leaves 48 px under the lowest child, the others 40', () => {
        const c = frame(layoutOf(SOURCE, C4ModelTheme));
        assert.strictEqual(c.b.y + c.b.height - c.bottom, 48);
        const k = frame(layoutOf(SOURCE, ClassicTheme));
        assert.strictEqual(k.b.y + k.b.height - k.bottom, 40);
    });

    it('an untyped subgraph needs no extra room', () => {
        const untyped = `subgraph Sys {\n    Container(web, "Web", "Java", "Serves pages")\n    Container(api, "API", "Java", "Serves JSON")\n}\nweb --> api\n`;
        const c = frame(layoutOf(untyped, C4ModelTheme));
        assert.strictEqual(c.b.y + c.b.height - c.bottom, 40);
    });

    it('widens a frame that is narrower than its measured label', () => {
        const wide = `System_Boundary(sys, "${'Wide '.repeat(14)}Boundary") {\n    Container(a, "A", "Go")\n}\n`;
        const layout = layoutOf(wide, C4ModelTheme);
        const b = layout.boundaries![0];
        const need = boundaryLabelMinWidth(C4ModelTheme, b.boundary.label, 'System_Boundary');
        assert.ok(need > 600, `label needs ${need}`);
        assert.ok(b.width >= need, `frame ${b.width} < label ${need}`);
        assert.ok(layoutOf(wide, ClassicTheme).boundaries![0].width < need);
    });

    it('measures the label with the width tables, not by counting characters', () => {
        const narrow = boundaryLabelMinWidth(C4ModelTheme, 'i'.repeat(40), 'System_Boundary');
        const broad = boundaryLabelMinWidth(C4ModelTheme, 'W'.repeat(40), 'System_Boundary');
        assert.ok(broad > narrow + 40, `${broad} vs ${narrow}`);
        assert.strictEqual(boundaryLabelMinWidth(C4ModelTheme, 'x', 'System_Boundary'), Math.ceil(measureTextPx('[Software System]', 12, textMetricVariant('Arial, sans-serif', false, false), TEXT_METRICS)) + 20);
    });

    it('keeps an empty frame tall and wide enough for its label', () => {
        const layout = layoutOf('System_Boundary(e, "Empty Boundary With Label") {\n}\n', C4ModelTheme);
        const b = layout.boundaries![0];
        assert.ok(b.height >= 48, `${b.height}`);
        assert.ok(b.width >= boundaryLabelMinWidth(C4ModelTheme, 'Empty Boundary With Label', 'System_Boundary'));
    });
});

describe('the label never overlaps a child, a nested frame or an edge label (#324)', () => {
    const names = readdirSync(IBS_DIR).filter(f => f.endsWith('.c4x')).map(f => f.replace(/\.c4x$/, '')).sort();
    for (const name of names) {
        for (const [themeName, theme] of [['c4-model', C4ModelTheme], ['c4-model dark', C4ModelDarkTheme]] as const) {
            it(`${name} (${themeName})`, () => {
                const { layout, svg } = render(fixture(name), theme);
                const labels = edgeLabelInk(svg, theme);
                for (const b of layout.boundaries ?? []) {
                    for (const ink of labelInk(layout, b, theme)) {
                        assert.ok(ink.left >= b.x && ink.right <= b.x + b.width, `${b.id}: label wider than its frame`);
                        assert.ok(ink.top >= b.y && ink.bottom <= b.y + b.height, `${b.id}: label outside its frame`);
                        for (const e of layout.elements) {
                            assert.ok(!overlaps(ink, { left: e.x, top: e.y, right: e.x + e.width, bottom: e.y + e.height }), `${b.id} label overlaps ${e.id}`);
                        }
                        for (const other of layout.boundaries ?? []) {
                            if (other === b) { continue; }
                            const inside = other.x >= b.x && other.y >= b.y && other.x + other.width <= b.x + b.width && other.y + other.height <= b.y + b.height;
                            if (inside) {
                                assert.ok(!overlaps(ink, { left: other.x, top: other.y, right: other.x + other.width, bottom: other.y + other.height }), `${b.id} label overlaps nested ${other.id}`);
                            }
                        }
                        for (const l of labels) {
                            assert.ok(!overlaps(ink, l), `${b.id} label overlaps an edge label`);
                        }
                    }
                }
            });
        }
    }

    it('the IBS container fixture has a label to check', () => {
        const { layout } = render(fixture('03-container'), C4ModelTheme);
        assert.strictEqual(layout.boundaries!.length, 1);
        assert.strictEqual(labelInk(layout, layout.boundaries![0], C4ModelTheme).length, 2);
        assert.ok(edgeLabelInk(render(fixture('03-container'), C4ModelTheme).svg, C4ModelTheme).length >= 8);
    });
});

describe('the editor places the label where the host draws it (#324)', () => {
    it('top-left placement is the long-standing offset every theme keeps', () => {
        const p = boundaryLabelPlacement('top-left', false, 100, 50, 400, 300);
        assert.strictEqual(p.nameX - 100, BOUNDARY_LABEL_OFFSET_X);
        assert.strictEqual(p.nameY - 50, BOUNDARY_LABEL_OFFSET_Y);
    });

    it('the host draws the name and type line at the shared placement', () => {
        const b = positioned('Container_Boundary');
        const p = boundaryLabelPlacement('bottom-left', true, b.x, b.y, b.width, b.height);
        const svg = renderBoundary(b, C4ModelTheme);
        assert.ok(svg.includes(`<text x="${p.nameX.toFixed(2)}" y="${p.nameY.toFixed(2)}"`));
        assert.ok(svg.includes(`class="boundary-type" x="${p.typeX.toFixed(2)}" y="${p.typeY.toFixed(2)}"`));
    });

    it('a bottom-left label follows the bottom edge when the frame grows or shrinks', () => {
        const small = boundaryLabelPlacement('bottom-left', true, 0, 0, 200, 100);
        const tall = boundaryLabelPlacement('bottom-left', true, 0, 0, 200, 160);
        assert.strictEqual(tall.typeY - small.typeY, 60);
        assert.strictEqual(tall.nameY - small.nameY, 60);
        assert.strictEqual(tall.nameX, small.nameX);
    });

    it('computeBoundaryWrap honours a label minimum width and the label reserve', () => {
        const frame = { x: 0, y: 0, width: 10, height: 10 };
        const child = { x: 100, y: 100, width: 100, height: 50 };
        const plain = computeBoundaryWrap(frame, [child]);
        const reserved = computeBoundaryWrap(frame, [child], { paddingBottom: 48, minWidth: 400 });
        assert.strictEqual(reserved.height - plain.height, 8);
        assert.strictEqual(reserved.width, 400);
        assert.strictEqual(computeBoundaryWrap(frame, [child], { minWidth: 10 }).width, plain.width);
    });

    it('the webview script embeds the placement and keeps resize, revert and re-wrap on it', () => {
        const script = buildPreviewClientScript();
        assert.ok(script.includes('function boundaryLabelPlacement('));
        assert.ok(script.includes('function placeBoundaryLabel('));
        assert.strictEqual((script.match(/placeBoundaryLabel\(/g) ?? []).length, 4); // definition, paint, resize, revert
    });
});

describe('review round 1 (#324): label ink is an obstacle, siblings and the editor agree', () => {
    const LONG = `${'Wide '.repeat(14)}Boundary`;

    function inkOf(layout: LayoutResult, theme: C4Theme): Box[] {
        return (layout.boundaries ?? []).flatMap(b => labelInk(layout, b, theme));
    }

    function segmentHitsBox(a: { x: number; y: number }, b: { x: number; y: number }, box: Box): boolean {
        const steps = 200;
        for (let i = 0; i <= steps; i++) {
            const x = a.x + (b.x - a.x) * i / steps;
            const y = a.y + (b.y - a.y) * i / steps;
            if (x > box.left && x < box.right && y > box.top && y < box.bottom) { return true; }
        }
        return false;
    }

    const ROUTE_SRC = `
System_Boundary(ibs, "Internet Banking System") {
    Container(a, "A", "Go", "x")
}
System_Ext(b, "B", "far below")
a -->|Uses| b
`;

    function pinned(source: string): string {
        return source.replace('Container(a, "A", "Go", "x")', 'Container(a, "A", "Go", "x", $x="100", $y="100")').replace('System_Ext(b, "B", "far below")', 'System_Ext(b, "B", "far below", $x="100", $y="300")');
    }

    it('an edge leaving a frame by its bottom does not cross the label, and its label does not cover it', () => {
        const { layout, svg } = render(pinned(ROUTE_SRC), C4ModelTheme);
        const ink = inkOf(layout, C4ModelTheme);
        const edge = layout.relationships[0];
        for (let i = 1; i < edge.points.length; i++) {
            for (const box of ink) {
                assert.ok(!segmentHitsBox(edge.points[i - 1], edge.points[i], box), `edge segment ${i} crosses the boundary label`);
            }
        }
        for (const l of edgeLabelInk(svg, C4ModelTheme)) {
            for (const box of ink) { assert.ok(!overlaps(l, box), 'relationship label covers the boundary label'); }
        }
    });

    it('a relationship label drawn on a line through the boundary label is moved clear of it', () => {
        // Hand-built route straight down through the label, as the router drew before the label was an obstacle.
        const layout = layoutOf(pinned(ROUTE_SRC), C4ModelTheme);
        const a = layout.elements.find(e => e.id === 'a')!;
        const b = layout.elements.find(e => e.id === 'b')!;
        const frame = layout.boundaries![0];
        const x = frame.x + 60;
        layout.relationships[0].points = [{ x, y: a.y + a.height }, { x, y: b.y }];
        const svg = new SvgBuilder().build(layout, { theme: C4ModelTheme });
        const ink = inkOf(layout, C4ModelTheme);
        const labels = edgeLabelInk(svg, C4ModelTheme);
        assert.ok(labels.length >= 1);
        for (const l of labels) {
            for (const box of ink) { assert.ok(!overlaps(l, box), 'relationship label covers the boundary label'); }
        }
    });

    it('a theme with a top-left label has no label obstacle', () => {
        for (const theme of [ClassicTheme, ModernTheme, C4StandardTheme]) {
            assert.strictEqual(boundaryLabelInkBox(theme, { x: 0, y: 0, width: 300, height: 200, label: 'X', boundaryType: 'System_Boundary' }), undefined);
        }
        assert.ok(boundaryLabelInkBox(C4ModelTheme, { x: 0, y: 0, width: 300, height: 200, label: 'X', boundaryType: 'System_Boundary' }));
    });

    it('two connected sibling frames do not overlap when the first label is wide', () => {
        const src = `graph LR
System_Boundary(one, "${LONG}") {
    Container(a, "A", "Go")
}
System_Boundary(two, "Two") {
    Container(b, "B", "Go")
}
a --> b
`;
        const { layout } = render(src, C4ModelTheme);
        const [f1, f2] = layout.boundaries!;
        assert.ok(f1.x + f1.width <= f2.x || f2.x + f2.width <= f1.x, `frames overlap: ${f1.x}+${f1.width} vs ${f2.x}`);
        const ink = inkOf(layout, C4ModelTheme);
        assert.ok(!overlaps(ink[0], ink[2]) && !overlaps(ink[0], ink[3]) && !overlaps(ink[1], ink[2]), 'sibling labels overlap');
    });

    it('the editor and the host give an empty frame the same size', () => {
        const src = 'subgraph EmptyLongBoundaryName $w="20", $h="10" {\n}\n';
        const b = layoutOf(src, C4ModelTheme).boundaries![0];
        const svg = renderBoundary(b, C4ModelTheme);
        const reserve = Number(/data-label-reserve="(\d+)"/.exec(svg)![1]);
        const minWidth = Number(/data-label-min-width="(\d+)"/.exec(svg)![1]);
        const wrapped = computeBoundaryWrap({ x: b.x, y: b.y, width: b.width, height: b.height, manualWidth: 20, manualHeight: 10 }, [], { paddingBottom: reserve, minWidth });
        assert.strictEqual(wrapped.width, b.width);
        assert.strictEqual(wrapped.height, b.height);
        assert.ok(b.width > 20 && b.height >= 40);
        // Other themes: an empty frame keeps its authored size, in both.
        const plain = layoutOf(src, ClassicTheme).boundaries![0];
        assert.deepStrictEqual(computeBoundaryWrap({ x: plain.x, y: plain.y, width: plain.width, height: plain.height, manualWidth: 20, manualHeight: 10 }, []), { x: plain.x, y: plain.y, width: 20, height: 10 });
        assert.strictEqual(plain.width, 20);
    });
});
