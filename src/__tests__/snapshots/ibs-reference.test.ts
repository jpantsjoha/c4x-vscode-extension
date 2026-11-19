import * as assert from 'assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
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
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { lintC4xSource } from '../../cli/lintSource';
import type { C4Theme } from '../../themes/Theme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';

/**
 * Internet Banking System reference fixtures (#331): the measuring stick for the
 * C4 notation refresh (#319). Example content from c4model.com, Simon Brown,
 * CC BY 4.0 (see NOTICE.md). Goldens were captured before any notation change;
 * regenerate with UPDATE_SNAPSHOTS=1 only when a story changes the output on purpose.
 * `auto` is excluded: it depends on the host colour scheme.
 */
const FIXTURES_DIR = path.join(__dirname, 'fixtures', 'ibs');
const GOLDEN_DIR = path.join(__dirname, 'golden', 'ibs');

const THEMES: ReadonlyArray<[string, C4Theme]> = [
    ['c4-standard', C4StandardTheme],
    ['classic', ClassicTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
    // Added by #321; goldens captured when the theme was introduced.
    ['c4-model', C4ModelTheme],
];

const parser = new C4XParser();
const modelBuilder = new C4ModelBuilder();
const layoutEngine = new DagreLayoutEngine();
const svgBuilder = new SvgBuilder();

function normalizeSvg(svg: string): string {
    return svg
        .replace(/(\d+\.\d{2})\d+/g, '$1')
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function render(dsl: string, theme: C4Theme): string {
    const model = modelBuilder.build(parser.parse(dsl), 'ibs-reference');
    // Laid out in the theme's font, as the preview does: text wraps and boxes grow in it (#340).
    const layout = layoutEngine.layoutSync(model.views[0], { theme });
    return svgBuilder.build(layout, { theme });
}

const fixtureNames = readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.c4x'))
    .map(f => f.replace(/\.c4x$/, ''))
    .sort();

describe('IBS reference fixtures (#331)', () => {
    it('has the seven expected fixtures', () => {
        assert.strictEqual(fixtureNames.length, 7, fixtureNames.join(', '));
    });

    fixtureNames.forEach(name => {
        const dsl = readFileSync(path.join(FIXTURES_DIR, `${name}.c4x`), 'utf-8');

        it(`"${name}" lints clean`, () => {
            const findings = lintC4xSource(dsl, {});
            assert.deepStrictEqual(
                findings.map(f => `${f.ruleId}: ${f.message}`),
                [],
            );
        });

        THEMES.forEach(([themeName, theme]) => {
            it(`"${name}" renders as the ${themeName} golden`, () => {
                const svg = render(dsl, theme);
                assert.ok(svg.includes('<svg') && svg.includes('</svg>'));
                const goldenDir = path.join(GOLDEN_DIR, themeName);
                const goldenPath = path.join(goldenDir, `${name}.svg`);
                if (process.env.UPDATE_SNAPSHOTS) {
                    mkdirSync(goldenDir, { recursive: true });
                    writeFileSync(goldenPath, svg, 'utf-8');
                    return;
                }
                assert.ok(existsSync(goldenPath), `Golden missing: ${goldenPath}. Run with UPDATE_SNAPSHOTS=1.`);
                assert.strictEqual(
                    normalizeSvg(svg),
                    normalizeSvg(readFileSync(goldenPath, 'utf-8')),
                    `SVG for "${name}" (${themeName}) differs from golden. Regenerate with UPDATE_SNAPSHOTS=1 if intended.`,
                );
            });
        });
    });
});

/**
 * The container fixture with each element's c4model.com shape written as
 * `$shape` (#323): folder Static Content, web browser UI, terminal Backend,
 * bucket Statement Store, cylinder Database. An explicit `$shape` draws in
 * every theme, so this is a separate fixture set golden'd in `c4-model` only;
 * the seven fixtures above stay untouched and keep their goldens.
 */
describe('IBS reference fixtures with shapes, c4-model (#323)', () => {
    const SHAPES_FIXTURES = path.join(__dirname, 'fixtures', 'ibs-shapes');
    const SHAPES_GOLDEN = path.join(__dirname, 'golden', 'ibs-shapes', 'c4-model');
    const names = readdirSync(SHAPES_FIXTURES).filter(f => f.endsWith('.c4x')).map(f => f.replace(/\.c4x$/, '')).sort();

    it('has the container fixture', () => {
        assert.deepStrictEqual(names, ['03-container']);
    });

    names.forEach(name => {
        const dsl = readFileSync(path.join(SHAPES_FIXTURES, `${name}.c4x`), 'utf-8');

        it(`"${name}" lints clean`, () => {
            assert.deepStrictEqual(lintC4xSource(dsl, {}).map(f => `${f.ruleId}: ${f.message}`), []);
        });

        it(`"${name}" draws the reference shapes and renders as the c4-model golden`, () => {
            const model = modelBuilder.build(parser.parse(dsl), 'ibs-reference');
            const view = model.views[0];
            const svg = svgBuilder.build(layoutEngine.layoutSync(view), { theme: C4ModelTheme, view });
            const shapeOf = (id: string): string | undefined => {
                const start = svg.indexOf(`data-id="${id}"`);
                const tag = svg.slice(svg.lastIndexOf('<g ', start), svg.indexOf('>', start));
                return /data-shape="([^"]+)"/.exec(tag)?.[1] ?? (/class="node database/.test(tag) ? 'cylinder' : undefined);
            };
            assert.deepStrictEqual(
                ['customer', 'static', 'ui', 'backend', 'statements', 'db'].map(shapeOf),
                ['person', 'folder', 'webBrowser', 'terminal', 'bucket', 'cylinder'],
            );
            const goldenPath = path.join(SHAPES_GOLDEN, `${name}.svg`);
            if (process.env.UPDATE_SNAPSHOTS) {
                mkdirSync(SHAPES_GOLDEN, { recursive: true });
                writeFileSync(goldenPath, svg, 'utf-8');
                return;
            }
            assert.ok(existsSync(goldenPath), `Golden missing: ${goldenPath}. Run with UPDATE_SNAPSHOTS=1.`);
            assert.strictEqual(normalizeSvg(svg), normalizeSvg(readFileSync(goldenPath, 'utf-8')));
        });
    });
});
