/**
 * The diagram key (#327, notation decision #320, Decision 6): entries derived from the styles
 * the renderer resolved, deduplicated and ordered; swatches drawn with the
 * shared shape geometry; the band SvgBuilder appends when asked.
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
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { elementStyleContextFor } from '../../render/SvgBuilder';
import {
    computeKeyEntries,
    keySwatchSvg,
    keySwatchImage,
    keySwatchTheme,
    KEY_SWATCH_DEPS,
    renderKeySvg,
    wrapKeyLabel,
    boundLegendEntries,
    KEY_LABEL_MAX_WIDTH,
    shapeDisplayName,
    KEY_SWATCH_HEIGHT,
    KEY_SWATCH_WIDTH,
    type ElementKeyEntry,
    type KeyEntry,
} from '../../render/KeyRenderer';
import { shapeOutlineSvg } from '../../render/shapeGeometry';
import type { StyleOutline } from '../../render/elementStyle';
import type { C4Theme } from '../../themes/Theme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { computeLegendEntries } from '../../webview/legendCatalog';
import { isValidLegendEntries } from '../../webview/previewClientScript';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from '../../render/textLayout';

function entriesFor(dsl: string, theme: C4Theme = C4ModelTheme): KeyEntry[] {
    const view = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'key-test').views[0];
    const layout = new DagreLayoutEngine().layoutSync(view, { theme });
    return computeKeyEntries(layout, theme, elementStyleContextFor(layout, view, theme));
}

const labels = (entries: KeyEntry[]): string[] => entries.map(e => e.label);

/**
 * The c4model.com container diagram key (Internet Banking System), read
 * 2026-11-15 from https://c4model.com/images/examples/Containers-key.png
 * (Simon Brown, CC BY 4.0). Nine styled boxes, plus the relationship line:
 *
 *   1. Amazon Web Services Simple Email Service   external system, its own accent (red)
 *   2. Boundary, Internet Banking System          boundary
 *   3. Container, Amazon Web Services S3 Bucket   bucket
 *   4. Container, Directory                       folder
 *   5. Container, Relational Database Schema      cylinder
 *   6. Container, Server-side Application         terminal
 *   7. Container, Single-page Application         web browser
 *   8. Core Banking System                        external system, its own accent (orange)
 *   9. Person, Customer                           person outline
 *   +  Relationship                               dashed line, filled arrowhead
 *
 * The labels on c4model.com are Structurizr tag names; C4X labels an entry
 * with the element type and the tags or shape that styled it. The test pins
 * the same nine styles (kind, outline, distinct accent), one to one.
 */
const REFERENCE_CONTAINER_KEY: ReadonlyArray<{ reference: string; label: string; kind: KeyEntry['kind']; outline?: StyleOutline }> = [
    { reference: 'Person, Customer', label: 'Person', kind: 'element', outline: 'person' },
    { reference: 'Core Banking System', label: 'Software System, Core Banking', kind: 'element', outline: 'rect' },
    { reference: 'Amazon Web Services Simple Email Service', label: 'Software System, External Email', kind: 'element', outline: 'rect' },
    { reference: 'Container, Directory', label: 'Container, Folder', kind: 'element', outline: 'folder' },
    { reference: 'Container, Single-page Application', label: 'Container, Web Browser', kind: 'element', outline: 'webBrowser' },
    { reference: 'Container, Server-side Application', label: 'Container, Terminal', kind: 'element', outline: 'terminal' },
    { reference: 'Container, Amazon Web Services S3 Bucket', label: 'Container, Database, Bucket', kind: 'element', outline: 'bucket' },
    { reference: 'Container, Relational Database Schema', label: 'Container, Database', kind: 'element', outline: 'cylinder' },
    { reference: 'Boundary, Internet Banking System', label: 'Boundary, Software System', kind: 'boundary' },
];

describe('diagram key entries (#327)', () => {
    const IBS_CONTAINER = readFileSync(path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs-shapes', '03-container.c4x'), 'utf-8');

    it('IBS container fixture: the same nine entries as the c4model.com container key, plus the relationship', () => {
        const entries = entriesFor(IBS_CONTAINER);
        const styled = entries.filter(e => e.kind !== 'relationship');
        assert.strictEqual(styled.length, 9, labels(styled).join(' | '));
        assert.deepStrictEqual(
            styled.map(e => ({ label: e.label, kind: e.kind, outline: e.kind === 'element' ? e.outline : undefined })),
            REFERENCE_CONTAINER_KEY.map(r => ({ label: r.label, kind: r.kind, outline: r.outline })),
        );
        // The two external systems are told apart by their accents, as on c4model.com.
        const externals = styled.filter(e => e.kind === 'element' && e.type === 'SoftwareSystem') as ElementKeyEntry[];
        assert.notStrictEqual(externals[0].stroke, externals[1].stroke);
        assert.deepStrictEqual(entries.filter(e => e.kind === 'relationship').map(e => e.label), ['Relationship']);
    });

    it('deduplicates elements that resolve to the same style', () => {
        const entries = entriesFor(`graph TB
Container(a, "A", "Java")
Container(b, "B", "Go")
Container(c, "C", "Rust")
`);
        assert.deepStrictEqual(labels(entries), ['Container']);
    });

    it('orders by element type, then first appearance, then boundaries, then relationships', () => {
        const entries = entriesFor(`graph TB
elementStyle Queue $shape="Pipe", $stroke="#BF101D"
elementStyle Web $shape="WebBrowser"
Container(q, "Queue", $tags="Queue")
Container(w, "Web", $tags="Web")
System_Boundary(b, "Bank") {
  Container(c, "Core")
}
System(s, "System")
Person(p, "User")
p --> w
w ==> q
`, ClassicTheme);
        assert.deepStrictEqual(labels(entries).slice(0, 5), ['Person', 'Software System', 'Container, Queue', 'Container, Web', 'Container']);
        assert.deepStrictEqual(entries.slice(5).map(e => e.label), ['Boundary, Software System', 'Relationship', 'Relationship, synchronous']);
    });

    it('labels with the tags that styled the element, and $legend wins', () => {
        const entries = entriesFor(`graph TB
elementStyle Queue $stroke="#BF101D"
elementStyle Mainframe $stroke="#1A849C", $legend="Mainframe (legacy)"
elementStyle Untouched $legend="Never used"
Container(q, "Queue", $tags="Queue, Internal")
System(m, "Mainframe", $tags="Mainframe")
`);
        assert.deepStrictEqual(labels(entries), ['Mainframe (legacy)', 'Container, Queue']);
    });

    it('names an element-level $shape that changed the outline, but not one the tags already drew', () => {
        const entries = entriesFor(`graph TB
Container(f, "Files", $shape="Folder")
ContainerDb(d, "DB", $shape="Cylinder")
ContainerDb(s, "S3", $shape="Bucket")
`);
        assert.deepStrictEqual(labels(entries), ['Container, Folder', 'Container, Database', 'Container, Database, Bucket']);
    });

    it('tells apart entries that would read the same: other tags first, then a numeral', () => {
        const entries = entriesFor(`graph TB
System_Ext(a, "A", $tags="Payments")
System_Ext(b, "B")
System_Ext(c, "C")
`);
        assert.deepStrictEqual(labels(entries), ['Software System, Payments', 'Software System', 'Software System (2)']);
        assert.strictEqual(new Set(labels(entries)).size, entries.length);
    });

    it('one relationship entry per line style', () => {
        const entries = entriesFor(`graph TB
System(a, "A")
System(b, "B")
a --> b
b ==> a
`);
        assert.deepStrictEqual(entries.filter(e => e.kind === 'relationship').map(e => e.label), ['Relationship', 'Relationship, synchronous']);
    });

    it('one boundary entry per boundary type', () => {
        const entries = entriesFor(`graph TB
System_Boundary(s1, "One") {
  Container(a, "A")
}
System_Boundary(s2, "Two") {
  Container(b, "B")
}
Container_Boundary(c1, "Three") {
  Component(c, "C")
}
`);
        assert.deepStrictEqual(entries.filter(e => e.kind === 'boundary').map(e => e.label), ['Boundary, Software System', 'Boundary, Container']);
    });

    it('formats shape names with spaces', () => {
        assert.strictEqual(shapeDisplayName('WebBrowser'), 'Web Browser');
        assert.strictEqual(shapeDisplayName('Cylinder'), 'Cylinder');
    });
});

describe('diagram key swatches (#327)', () => {
    const element = (outline: StyleOutline, extra: Partial<ElementKeyEntry> = {}): ElementKeyEntry => ({
        kind: 'element', label: 'X', type: 'Container', outline, fill: '#ffffff', stroke: '#1168BD', color: '#1168BD', border: 'solid', strokeWidth: 2, ...extra,
    });
    const OUTLINES: StyleOutline[] = ['rect', 'box', 'roundedBox', 'cylinder', 'person', 'bucket', 'folder', 'webBrowser', 'terminal'];

    for (const outline of OUTLINES) {
        it(`draws ${outline} with the shared shape geometry`, () => {
            const expected = shapeOutlineSvg(outline, 10, 20, KEY_SWATCH_WIDTH, KEY_SWATCH_HEIGHT, C4ModelTheme.styles.borderRadius, {
                fill: '#ffffff', stroke: '#1168BD', strokeWidth: 2, dashAttr: '',
            });
            assert.strictEqual(keySwatchSvg(element(outline), keySwatchTheme(C4ModelTheme), 10, 20, KEY_SWATCH_DEPS), expected);
        });
    }

    it('draws a dashed border dashed', () => {
        assert.ok(keySwatchSvg(element('rect', { border: 'dashed' }), keySwatchTheme(C4ModelTheme), 0, 0, KEY_SWATCH_DEPS).includes('stroke-dasharray="8,4"'));
    });

    it('draws a person icon-node (classic themes) as the person outline', () => {
        const swatch = keySwatchSvg(element('rect', { icon: 'person' }), keySwatchTheme(ClassicTheme), 0, 0, KEY_SWATCH_DEPS);
        assert.ok(swatch.includes('<circle'), swatch);
    });

    it('draws boundaries in the theme boundary style and relationships as the theme line', () => {
        const boundary = keySwatchSvg({ kind: 'boundary', label: 'Boundary' }, keySwatchTheme(ClassicTheme), 0, 0, KEY_SWATCH_DEPS);
        assert.ok(boundary.includes(`stroke="${ClassicTheme.boundary.stroke}"`) && boundary.includes('fill="none"'));
        const dashed = keySwatchSvg({ kind: 'relationship', label: 'Relationship', dashed: true }, keySwatchTheme(ClassicTheme), 0, 0, KEY_SWATCH_DEPS);
        const solid = keySwatchSvg({ kind: 'relationship', label: 'Relationship', dashed: false }, keySwatchTheme(ClassicTheme), 0, 0, KEY_SWATCH_DEPS);
        assert.ok(dashed.includes('stroke-dasharray="8,4"'));
        assert.ok(!solid.includes('stroke-dasharray'));
    });

    it('wraps the overlay swatch as a decorative standalone image', () => {
        const image = keySwatchImage(element('folder'), keySwatchTheme(C4ModelTheme), KEY_SWATCH_DEPS);
        assert.ok(image.startsWith('<svg ') && image.endsWith('</svg>'));
        assert.ok(image.includes('aria-hidden="true"'));
    });
});

describe('diagram key band (#327)', () => {
    it('lists each entry as a list item whose title is its label, escaped', () => {
        const entries: KeyEntry[] = [
            { kind: 'element', label: 'Container, <script>&"x"', type: 'Container', outline: 'rect', fill: '#fff', stroke: '#000', color: '#000', border: 'solid', strokeWidth: 1 },
            { kind: 'relationship', label: 'Relationship', dashed: true },
        ];
        const band = renderKeySvg(entries, ClassicTheme, 800, 500);
        assert.ok(band.svg.includes('class="diagram-key" role="list" aria-label="Key"'));
        assert.strictEqual((band.svg.match(/role="listitem"/g) || []).length, 2);
        assert.ok(band.svg.includes('<title>Container, &lt;script&gt;&amp;&quot;x&quot;</title>'));
        assert.ok(!band.svg.includes('<script>'));
        assert.ok(band.svg.includes('translate(0, 500.00)'));
        assert.ok(band.height > 0);
    });

    it('fills the width in columns and wraps to rows', () => {
        const many: KeyEntry[] = Array.from({ length: 6 }, (_, i) => ({ kind: 'boundary', label: `Boundary ${i}` }));
        const wide = renderKeySvg(many, ClassicTheme, 2000, 0);
        const narrow = renderKeySvg(many, ClassicTheme, 200, 0);
        assert.ok(narrow.height > wide.height, `${narrow.height} > ${wide.height}`);
        assert.ok(wide.width <= 2000);
    });

    it('draws nothing for no entries', () => {
        assert.deepStrictEqual(renderKeySvg([], ClassicTheme, 800, 0), { svg: '', height: 0, width: 0 });
    });
});

/**
 * Round-1 review (#327): the overlay key is bounded on the host to the
 * payload validator's limits, so no valid diagram fails to render because of
 * its key (P2a); oversized words are broken so no label overruns its cell (P2c).
 */
describe('diagram key bounds (#327 review)', () => {
    const viewOf = (dsl: string) => {
        const view = new C4ModelBuilder().build(new C4XParser().parse(dsl), 'key-bounds').views[0];
        const layout = new DagreLayoutEngine().layoutSync(view, { theme: ClassicTheme });
        return computeLegendEntries(layout, ClassicTheme, elementStyleContextFor(layout, view, ClassicTheme));
    };

    it('129 distinct styles: 127 entries and a count of the rest, accepted by the payload validator', () => {
        const lines = ['graph TB'];
        for (let i = 0; i < 129; i++) {
            const hex = (0x100000 + i * 997).toString(16).slice(-6);
            lines.push(`elementStyle S${i} $stroke="#${hex}"`);
            lines.push(`Container(c${i}, "C${i}", $tags="S${i}")`);
        }
        const entries = viewOf(lines.join('\n'));
        assert.strictEqual(entries.length, 128);
        assert.strictEqual(entries[127].label, 'and 2 more styles');
        assert.ok(isValidLegendEntries(entries), 'the client accepts what the host sends');
    });

    it('a 345-character label is clipped to 300 characters with an ellipsis, accepted by the payload validator', () => {
        const tags = Array.from({ length: 23 }, (_, i) => `Tag${String(i).padStart(2, '0')}abcdefghij`);
        const lines = ['graph TB', ...tags.map(t => `elementStyle ${t} $border="dashed"`), `Container(a, "A", $tags="${tags.join(', ')}")`];
        const entries = viewOf(lines.join('\n'));
        const full = ['Container', ...tags].join(', ');
        assert.ok(full.length > 300, String(full.length));
        assert.strictEqual(entries[0].label.length, 300);
        assert.ok(entries[0].label.endsWith('\u2026'));
        assert.ok(isValidLegendEntries(entries));
    });

    it('boundLegendEntries leaves a key within the limits as it is', () => {
        const small = [{ label: 'Container', kind: 'element' as const, swatch: '<svg x></svg>' }];
        assert.deepStrictEqual(boundLegendEntries(small), small);
    });

    it('breaks a word wider than a line, so no line of the label overruns its cell', () => {
        const variant = textMetricVariant(ClassicTheme.styles.fontFamily, false, false);
        const legend = 'W'.repeat(120);
        const lines = wrapKeyLabel(legend, ClassicTheme.styles.fontFamily, KEY_LABEL_MAX_WIDTH);
        assert.ok(lines.length > 1);
        assert.strictEqual(lines.join(''), legend, 'no character is lost');
        for (const line of lines) {
            assert.ok(measureTextPx(line, 12, variant, TEXT_METRICS) <= KEY_LABEL_MAX_WIDTH, `${line.length} W is wider than the cell`);
        }
        // In the band, the next column starts after the widest line.
        const entries: KeyEntry[] = [
            { kind: 'element', label: legend, type: 'Container', outline: 'rect', fill: '#fff', stroke: '#000', color: '#000', border: 'solid', strokeWidth: 1 },
            { kind: 'relationship', label: 'Relationship', dashed: true },
        ];
        const band = renderKeySvg(entries, ClassicTheme, 2000, 0);
        const xs = [...band.svg.matchAll(/<tspan x="([\d.]+)"/g)].map(m => Number(m[1]));
        const firstX = xs[0];
        const secondX = xs[xs.length - 1];
        const widest = Math.max(...lines.map(l => measureTextPx(l, 12, variant, TEXT_METRICS)));
        assert.ok(firstX + widest < secondX - 64, `label ends at ${firstX + widest}, next swatch starts at ${secondX - 74}`);
    });
});
