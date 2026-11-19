/**
 * checkC4xSource (#353): the headless render behind render_c4x and
 * `c4x render`. Invalid source returns findings and no SVG and never throws;
 * the bounds (elements drawn, SVG size) are tested at and beyond their limits;
 * options are checked; png is reserved; the defaults match the extension's.
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
import { normalizeLintOptions } from '../../model/lint';
import { MAX_ELEMENTS } from '../../cli/limits';
import {
    DEFAULT_RENDER_SPACING,
    DEFAULT_RENDER_THEME,
    MAX_RENDER_ELEMENTS,
    MAX_RENDER_RELATIONSHIPS,
    MAX_RENDER_SVG_BYTES,
    RENDER_RULE_ID,
    RENDER_THEMES,
    boundedRender,
    checkC4xSource,
    type RenderOutcome,
} from '../../cli/renderSource';
import { DEFAULT_THEME_NAME, THEME_NAMES, ThemeManager } from '../../themes/ThemeManager';
import { LAYOUT_SPACING_PRESETS } from '../../layout/DagreLayoutEngine';
import { parseXml } from '../security/xmlTree';
import * as headlessVscode from '../../cli/headlessVscode';

const lint = normalizeLintOptions(true, undefined);
const render = (source: string, options: Partial<Parameters<typeof checkC4xSource>[1]> = {}): RenderOutcome => checkC4xSource(source, { lint, ...options });

/** n containers, one per line, each drawing `sprite` when given. */
function containers(n: number, sprite?: string): string {
    const lines = ['%%{ c4: container }%%', 'graph TB'];
    for (let i = 0; i < n; i++) {
        lines.push(`Container(c${i}, "C${i}", "T", "D"${sprite ? `, $sprite="${sprite}"` : ''})`);
    }
    return lines.join('\n');
}

function assertNoSvg(outcome: RenderOutcome, label: string): void {
    assert.notStrictEqual(outcome.status, 'rendered', `${label}: rendered`);
    assert.strictEqual(outcome.svg, undefined, `${label}: an SVG was returned`);
}

describe('checkC4xSource (#353)', () => {
    it('draws a valid diagram as well-formed SVG in the default theme', () => {
        const outcome = render('graph TB\nSystem(a, "A", "Does things")\nPerson(u, "User", "Uses it")\nu --> |Uses| a\n');
        assert.strictEqual(outcome.status, 'rendered');
        assert.strictEqual(outcome.theme, DEFAULT_RENDER_THEME);
        assert.ok(outcome.svg && parseXml(outcome.svg).name === 'svg');
        assert.strictEqual(outcome.svgBytes, Buffer.byteLength(outcome.svg!, 'utf8'));
    });

    it('the headless stand-in for vscode offers no API: every member the engine reads is undefined', () => {
        assert.deepStrictEqual(Object.entries(headlessVscode).filter(([, value]) => value !== undefined), []);
        assert.deepStrictEqual(Object.keys(headlessVscode).sort(), ['ColorThemeKind', 'ConfigurationTarget', 'window', 'workspace']);
    });

    it('defaults match the extension: theme, spacing preset and the fixed theme list', () => {
        assert.strictEqual(DEFAULT_RENDER_THEME, DEFAULT_THEME_NAME);
        assert.deepStrictEqual([...RENDER_THEMES.keys()], THEME_NAMES.filter(name => name !== 'auto'));
        const registry = new Map(ThemeManager.getAllThemes().map(theme => [theme.name, theme]));
        for (const [name, theme] of RENDER_THEMES) {
            assert.strictEqual(registry.get(name as never), theme, `${name} is not the registry's theme object`);
        }
        assert.deepStrictEqual(DEFAULT_RENDER_SPACING, LAYOUT_SPACING_PRESETS.balanced);
    });

    describe('invalid source returns findings and no SVG, and never throws', () => {
        const deep = 'graph TB\n' + 'subgraph s {\n'.repeat(40) + 'A[a<br/>Container]\n' + '}\n'.repeat(40);
        const corpus: ReadonlyArray<[string, string, RegExp]> = [
            ['syntax error', 'graph TB\nNot[valid\n', /C4X-SYNTAX/],
            ['binary noise', '\u0000\u0001￿\ud800graph', /C4X-SYNTAX/],
            ['nesting beyond 32 levels', deep, /C4X-SYNTAX/],
            ['more elements than the input limit', `graph TB\n${Array.from({ length: MAX_ELEMENTS + 1 }, (_, i) => `S${i}[s<br/>Software System]`).join('\n')}`, /C4X-LIMIT/],
            ['a text field over the limit', `graph TB\nSystem(a, "${'x'.repeat(5000)}", "d")\n`, /C4X-LIMIT/],
            ['a model error', 'graph TB\nSystem(a, "A", "d")\nSystem(a, "B", "d")\n', /C4X-MODEL/],
            ['a relationship to nothing', 'graph TB\nSystem(a, "A", "d")\na --> ghost\n', /C4X-MODEL/],
        ];
        for (const [label, source, rule] of corpus) {
            it(label, () => {
                let outcome: RenderOutcome | undefined;
                assert.doesNotThrow(() => { outcome = render(source); });
                assertNoSvg(outcome!, label);
                assert.strictEqual(outcome!.status, 'invalid');
                assert.ok(outcome!.findings.some(finding => rule.test(finding.ruleId) && finding.severity === 'error'), JSON.stringify(outcome!.findings));
            });
        }

        it('a blank source is empty, not drawn', () => {
            for (const source of ['', '   \n\t', '﻿']) {
                const outcome = render(source);
                assert.strictEqual(outcome.status, 'empty');
                assertNoSvg(outcome, JSON.stringify(source));
            }
        });
    });

    it('lint findings alone do not stop the render', () => {
        const outcome = render('%%{ c4: container }%%\ngraph TB\nContainer(api, "API")\nContainer(db, "DB")\napi --> db\n');
        assert.strictEqual(outcome.status, 'rendered');
        assert.ok(outcome.findings.length > 0 && outcome.findings.every(finding => !/SYNTAX|MODEL|LIMIT|RENDER/.test(finding.ruleId)), JSON.stringify(outcome.findings));
    });

    it('checks options: unknown theme, auto, bad view, missing view and unknown format', () => {
        const source = 'graph TB\nSystem(a, "A", "d")\n';
        for (const options of [{ theme: 'auto' }, { theme: '../../etc/passwd' }, { theme: 'constructor' }, { view: -1 }, { view: 0.5 }, { view: 1 }, { format: 'pdf' as never }]) {
            const outcome = render(source, options);
            assert.strictEqual(outcome.status, 'bad-options', JSON.stringify(options));
            assertNoSvg(outcome, JSON.stringify(options));
            assert.ok(outcome.message, 'says what is wrong');
        }
        for (const theme of RENDER_THEMES.keys()) {
            assert.strictEqual(render(source, { theme }).status, 'rendered', theme);
        }
    });

    it('format "png" is reserved: the SVG comes back with a not-available message, and no image', () => {
        const svg = render('graph TB\nSystem(a, "A", "d")\n').svg;
        const outcome = render('graph TB\nSystem(a, "A", "d")\n', { format: 'png' });
        assert.strictEqual(outcome.status, 'rendered');
        assert.strictEqual(outcome.svg, svg, 'the same SVG as format svg');
        assert.match(outcome.message ?? '', /PNG is not available in this version/);
    });

    describe('bounds', function () {
        this.timeout(120000);

        it(`draws ${MAX_RENDER_ELEMENTS} elements and refuses ${MAX_RENDER_ELEMENTS + 1} before layout`, () => {
            const atCap = render(containers(MAX_RENDER_ELEMENTS));
            assert.strictEqual(atCap.status, 'rendered');
            const started = performance.now();
            const over = render(containers(MAX_RENDER_ELEMENTS + 1));
            const elapsed = performance.now() - started;
            assert.strictEqual(over.status, 'too-large');
            assertNoSvg(over, 'over the element bound');
            assert.ok(over.findings.some(finding => finding.ruleId === RENDER_RULE_ID && /Render too large/.test(finding.message)));
            assert.match(over.message ?? '', new RegExp(`${MAX_RENDER_ELEMENTS + 1} elements`));
            // Refused before layout: far quicker than laying out the same diagram.
            assert.ok(elapsed < 1000, `refusing took ${elapsed.toFixed(0)} ms`);
        });

        it(`routes ${MAX_RENDER_RELATIONSHIPS} relationships and refuses ${MAX_RENDER_RELATIONSHIPS + 1} before layout`, () => {
            const withRelationships = (count: number) => [containers(20), ...Array.from({ length: count }, (_, i) => `c${i % 20} --> c${(i + 1) % 20}`)].join('\n');
            assert.strictEqual(render(withRelationships(MAX_RENDER_RELATIONSHIPS)).status, 'rendered');
            const over = render(withRelationships(MAX_RENDER_RELATIONSHIPS + 1));
            assert.strictEqual(over.status, 'too-large');
            assertNoSvg(over, 'over the relationship bound');
            assert.match(over.message ?? '', new RegExp(`${MAX_RENDER_RELATIONSHIPS + 1} relationships`));
        });

        it('counts boundaries and nested elements towards the element bound', () => {
            const half = Math.floor(MAX_RENDER_ELEMENTS / 2);
            const lines = ['%%{ c4: container }%%', 'graph TB'];
            for (let i = 0; i < half; i++) {
                lines.push(`System_Boundary(b${i}, "B${i}") {`, `    Container(c${i}, "C${i}", "T", "D")`, '}');
            }
            lines.push('Container(extra1, "X", "T", "D")', 'Container(extra2, "Y", "T", "D")');
            const outcome = render(lines.join('\n'));
            assert.strictEqual(outcome.status, 'too-large', `${2 * half + 2} elements and boundaries`);
        });

        it('the cap is in UTF-8 bytes: exactly 2,097,152 returns the whole SVG, 2,097,153 returns findings and no SVG', () => {
            const svgOf = (bytes: number, tail = '') => {
                const open = '<svg xmlns="http://www.w3.org/2000/svg"><!--';
                const close = `${tail}--></svg>`;
                return open + 'x'.repeat(bytes - Buffer.byteLength(open + close, 'utf8')) + close;
            };
            const lintFinding = { ruleId: 'C4X-L001', severity: 'warning' as const, message: 'm', hint: '', line: 1, column: 1, endLine: 1, endColumn: 1 };
            const atLimit = svgOf(MAX_RENDER_SVG_BYTES);
            assert.strictEqual(Buffer.byteLength(atLimit, 'utf8'), 2_097_152);
            const kept = boundedRender(atLimit, [lintFinding], 'classic');
            assert.strictEqual(kept.status, 'rendered');
            assert.strictEqual(kept.svg, atLimit, 'the whole SVG, not a prefix');
            assert.strictEqual(kept.svgBytes, 2_097_152);
            assert.deepStrictEqual(kept.findings, [lintFinding]);
            for (const [label, svg] of [['one byte over', svgOf(MAX_RENDER_SVG_BYTES + 1)], ['one byte over with a two-byte character (2,097,152 characters)', svgOf(MAX_RENDER_SVG_BYTES + 1, '\u00e9')]] as const) {
                assert.strictEqual(Buffer.byteLength(svg, 'utf8'), 2_097_153, label);
                const refused = boundedRender(svg, [lintFinding], 'classic');
                assert.strictEqual(refused.status, 'too-large', label);
                assert.strictEqual(refused.svg, undefined, `${label}: an SVG was returned`);
                assert.strictEqual(refused.svgBytes, 2_097_153);
                assert.deepStrictEqual(refused.findings[0], lintFinding, `${label}: the findings are kept`);
                assert.match(refused.findings[1].message, /the SVG is 2097153 bytes; a render returns at most 2097152/);
            }
            assert.strictEqual(svgOf(MAX_RENDER_SVG_BYTES + 1, '\u00e9').length, 2_097_152, 'the two-byte case is at the limit in characters');
        });

        it('returns an SVG at the 2 MiB cap and none beyond it, with a "render too large" result', () => {
            // The largest bundled sprite is drawn inline in every element, so the SVG grows ~46 KB per element.
            const sprite = 'azure-defender-pneumatic-device';
            const size = (n: number) => {
                const outcome = render(containers(n, sprite));
                return { outcome, bytes: outcome.svgBytes ?? 0 };
            };
            let low = 1;
            let high = MAX_RENDER_ELEMENTS;
            assert.ok(size(high).bytes > MAX_RENDER_SVG_BYTES, 'the probe diagram can exceed the cap');
            while (high - low > 1) {
                const middle = Math.floor((low + high) / 2);
                if (size(middle).bytes <= MAX_RENDER_SVG_BYTES) { low = middle; } else { high = middle; }
            }
            const under = size(low);
            assert.strictEqual(under.outcome.status, 'rendered', `${low} elements, ${under.bytes} bytes`);
            assert.ok(under.bytes <= MAX_RENDER_SVG_BYTES && under.bytes > MAX_RENDER_SVG_BYTES - 64 * 1024, `${under.bytes} bytes is within one element of the cap`);
            const over = size(high);
            assert.strictEqual(over.outcome.status, 'too-large', `${high} elements, ${over.bytes} bytes`);
            assertNoSvg(over.outcome, 'over the SVG cap');
            assert.ok(over.bytes > MAX_RENDER_SVG_BYTES);
            assert.ok(over.outcome.findings.some(finding => finding.ruleId === RENDER_RULE_ID && /the SVG is \d+ bytes/.test(finding.message)));
        });
    });
});
