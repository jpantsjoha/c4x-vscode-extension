/**
 * Legend removal from the SVG document (#98): the legend is now a draggable
 * HTML overlay in the preview webview, so SvgBuilder must not render an
 * inline `<g class="legend">` nor reserve canvas height for one.
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
import { SvgBuilder, elementStyleContextFor } from '../../render/SvgBuilder';
import { appendKeyToSvg, computeKeyEntries } from '../../render/KeyRenderer';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { readdirSync, readFileSync } from 'fs';
import * as path from 'path';

const DSL = `graph TB
Person(user, "User")
System(app, "App")
user --> app
`;

function render(): { svg: string; width: number; height: number } {
    const parsed = new C4XParser().parse(DSL);
    const model = new C4ModelBuilder().build(parsed, 'legend-removal-test');
    const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
    const svg = new SvgBuilder().build(layout, { theme: ClassicTheme, viewType: model.views[0].type });
    return { svg, width: layout.width, height: layout.height };
}

describe('SvgBuilder legend removal (#98)', () => {
    it('renders no inline legend group', () => {
        const { svg } = render();
        assert.ok(!svg.includes('class="legend"'), 'SVG must not contain a <g class="legend"> element');
    });

    it('reserves no canvas height for the legend (title only)', () => {
        const { svg, width, height } = render();
        // viewType is set by the fixture directive, so the canvas height is
        // layout.height + 40px title — and nothing more (no 130px legend).
        assert.ok(
            svg.includes(`viewBox="0 0 ${width} ${height + 40}"`),
            `viewBox must be exactly layout size + 40px title; got:\n${svg.split('\n')[1]}`,
        );
        assert.ok(
            !svg.includes(`viewBox="0 0 ${width} ${height + 40 + 130}"`),
            'viewBox must not include the removed 130px legend reservation',
        );
    });

    it('reserves no canvas height at all when there is no title', () => {
        const parsed = new C4XParser().parse(DSL);
        const model = new C4ModelBuilder().build(parsed, 'legend-removal-test');
        const layout = new DagreLayoutEngine().layoutSync(model.views[0]);
        const svg = new SvgBuilder().build(layout, { theme: ClassicTheme });
        assert.ok(
            svg.includes(`viewBox="0 0 ${layout.width} ${layout.height}"`),
            'without a title the canvas must be exactly the layout size',
        );
    });
});

/**
 * The key in exports (#327): `appendKeyToSvg` adds it below the diagram that
 * SvgBuilder drew, changing only the root size, the background and the band.
 * SvgBuilder itself is unchanged, so with the setting off every export is the
 * plain drawing (the goldens in ibs-reference.test.ts stay untouched).
 */
describe('appendKeyToSvg (#327)', () => {
    const fixtures = path.join(__dirname, '..', 'snapshots', 'fixtures');
    const sources = [
        ...readdirSync(path.join(fixtures, 'ibs')).filter(f => f.endsWith('.c4x')).map(f => path.join(fixtures, 'ibs', f)),
        path.join(fixtures, 'ibs-shapes', '03-container.c4x'),
    ];
    const build = (file: string, viewType?: boolean) => {
        const view = new C4ModelBuilder().build(new C4XParser().parse(readFileSync(file, 'utf-8')), 'key-export').views[0];
        const layout = new DagreLayoutEngine().layoutSync(view, { theme: C4ModelTheme });
        const plain = new SvgBuilder().build(layout, { theme: C4ModelTheme, view, ...(viewType ? { viewType: view.type } : {}) });
        const entries = computeKeyEntries(layout, C4ModelTheme, elementStyleContextFor(layout, view, C4ModelTheme));
        return { plain, keyed: appendKeyToSvg(plain, entries, C4ModelTheme, layout.width), layout, titleHeight: viewType ? 40 : 0 };
    };

    for (const file of sources) {
        for (const titled of [false, true]) {
            const name = `${path.relative(fixtures, file)}${titled ? ' (titled)' : ''}`;
            it(`${name}: appends the key below the diagram and leaves the drawing as it was`, () => {
                const { plain, keyed, layout, titleHeight } = build(file, titled);
                assert.ok(!plain.includes('diagram-key'));
                assert.ok(keyed.includes('<g class="diagram-key" role="list" aria-label="Key"'), 'key band present');
                assert.ok(keyed.indexOf('class="diagram-key"') > keyed.indexOf('class="diagram-content"'), 'key after the diagram');
                assert.ok(keyed.trimEnd().endsWith('</svg>'));
                const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(keyed)!;
                const bg = /<rect x="0" y="0" width="([\d.]+)" height="([\d.]+)"/.exec(keyed)!;
                assert.deepStrictEqual([bg[1], bg[2]], [viewBox[1], viewBox[2]], 'background covers the key band');
                assert.ok(Number(viewBox[2]) > layout.height + titleHeight, 'canvas grows by the key band');
                assert.ok(keyed.includes(`translate(0, ${(layout.height + titleHeight).toFixed(2)})`), 'key starts at the diagram bottom');
                // Everything outside the key band and the size is the plain drawing.
                const withoutKey = keyed.replace(/\n {2}<g class="diagram-key"[\s\S]*?\n {2}<\/g>(?=\n<\/svg>)/, '');
                const strip = (s: string) => s.replace(/width="[^"]*" height="[^"]*" viewBox="[^"]*"/, '').replace(/<rect x="0" y="0" width="[^"]*" height="[^"]*"/, '');
                assert.strictEqual(strip(withoutKey), strip(plain));
            });
        }
    }

    it('the IBS container key lists nine styled entries and the relationship', () => {
        const { keyed } = build(path.join(fixtures, 'ibs-shapes', '03-container.c4x'));
        const titles = [...keyed.matchAll(/<g class="key-entry"[^>]*><title>([^<]*)<\/title>/g)].map(m => m[1]);
        assert.strictEqual(titles.length, 10, titles.join(' | '));
        assert.strictEqual(titles[titles.length - 1], 'Relationship');
    });

    it('a small diagram with a fixed size grows its width and height attributes too', () => {
        const view = new C4ModelBuilder().build(new C4XParser().parse(DSL), 'key-small').views[0];
        const layout = new DagreLayoutEngine().layoutSync(view);
        const plain = new SvgBuilder().build(layout, { theme: ClassicTheme, view });
        assert.ok(plain.includes(`width="${layout.width}" height="${layout.height}"`), 'fixture is drawn at a fixed size');
        const keyed = appendKeyToSvg(plain, computeKeyEntries(layout, ClassicTheme, elementStyleContextFor(layout, view, ClassicTheme)), ClassicTheme, layout.width);
        const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(keyed)!;
        assert.ok(keyed.includes(`width="${viewBox[1]}" height="${viewBox[2]}" viewBox=`), keyed.split('\n')[1]);
    });

    it('returns the SVG unchanged with no entries or a foreign document', () => {
        assert.strictEqual(appendKeyToSvg('<svg viewBox="0 0 10 10"></svg>', [], ClassicTheme, 10), '<svg viewBox="0 0 10 10"></svg>');
        assert.strictEqual(appendKeyToSvg('<p>no</p>', [{ kind: 'boundary', label: 'B' }], ClassicTheme, 10), '<p>no</p>');
    });
});
