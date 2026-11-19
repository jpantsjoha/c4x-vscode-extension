/**
 * Source text the C4X grammar discards (#362).
 *
 * The headless limits (src/cli/limits.ts) bound what the parser keeps in its
 * result, because that is what lint, layout and rendering process. Some
 * source text never reaches the result: the grammar drops it while parsing.
 * Its only cost is parse time, which the input-size caps bound (1 MiB per MCP
 * call, 4 MiB per CLI file). Each construct below is checked two ways:
 *   (a) an over-limit payload inside it appears nowhere in the parse result
 *       (any key or value, enumerable or not), the lint findings, the CLI
 *       output for a Markdown file, or the rendered SVG;
 *   (b) a source of that construct at the 4 MiB CLI cap parses, and lints,
 *       within a generous time bound, and 4 MiB takes no more than about
 *       four times as long as 1 MiB (no super-linear growth).
 * If the grammar ever keeps one of these, test (a) fails and the construct
 * needs a limit check.
 */
// The renderer imports the theme manager, which imports vscode; resolve it to the unit-test mock.
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
import { SvgBuilder } from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { lintC4xSource, lintFileText } from '../../cli/lintSource';
import { findLimitViolation, MAX_CLI_FILE_BYTES, MAX_ENTRIES, MAX_TEXT_LENGTH } from '../../cli/limits';
import { normalizeLintOptions } from '../../model/lint';

const parser = new C4XParser();
const OPTIONS = normalizeLintOptions(true, {});
const MARKER = 'DISCARDED-PAYLOAD';
const PAYLOAD = MARKER + 'x'.repeat(MAX_TEXT_LENGTH + 1);
const MANY = Array.from({ length: MAX_ENTRIES * 4 }, () => `$note="${MARKER}"`).join(', ');

/** True when any string, or any key, reachable from `value` holds the marker. Follows symbol and non-enumerable keys too. */
function retains(value: unknown, seen = new Set<object>()): boolean {
    if (typeof value === 'string') { return value.includes(MARKER); }
    if (value === null || typeof value !== 'object' || seen.has(value)) { return false; }
    seen.add(value);
    return Reflect.ownKeys(value).some(key => (typeof key === 'string' && key.includes(MARKER)) || retains(Reflect.get(value, key), seen));
}

function renderedSvg(source: string): string {
    const model = new C4ModelBuilder().build(parser.parse(source), 'discarded');
    return model.views.map(view => new SvgBuilder().build(new DagreLayoutEngine().layoutSync(view), { theme: ClassicTheme, view, viewType: view.type })).join('\n');
}

/** [construct, a source carrying `payload` in it, a source of `count` repetitions of it for the size test] */
type Construct = readonly [string, (payload: string) => string, (bytes: number) => string];

/** Repeat `unit` inside `wrap` until the source is about `bytes` long. */
function filled(bytes: number, wrap: (body: string) => string, unit: string, separator = '\n'): string {
    const room = bytes - wrap('').length;
    return wrap(Array.from({ length: Math.max(1, Math.floor(room / (unit.length + separator.length))) }, () => unit).join(separator));
}

const deployment = (body: string) => `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T") {\n  Container(a, "A", "T", "D")\n${body}\n}`;

const DISCARDED: readonly Construct[] = [
    ['a subgraph inside a deployment node, with its attributes and contents',
        p => deployment(`  subgraph s $note="${p}", ${MANY} {\n    b[${p}<br/>Container]\n    Container(c, "${p}", "T", "D")\n  }`),
        bytes => deployment(`  subgraph s ${filled(bytes, body => body, '$note="vvvvvvvvvvvvvvvv"', ', ')} {\n    b[B<br/>Container]\n  }`)],
    ['a boundary block inside a deployment node, with its contents',
        p => deployment(`  System_Boundary(sb, "${p}") {\n    Container(c, "${p}", "T", "${p}")\n  }`),
        bytes => filled(bytes, body => deployment(body), '  System_Boundary(sb, "B") {\n    Container(c, "C", "T", "D")\n  }')],
    ['the earlier value of a repeated attribute on an element call',
        p => `graph TB\nSystem(a, "A", "d", $note="${p}", $note="ok")`,
        bytes => `graph TB\nSystem(a, "A", "d", ${filled(bytes, body => body, '$note="vvvvvvvvvvvvvvvv"', ', ')})`],
    ['the earlier value of a repeated attribute on a bracket element',
        p => `graph TB\na[A<br/>Container] $note="${p}", $note="ok"`,
        bytes => `graph TB\na[A<br/>Container] ${filled(bytes, body => body, '$note="vvvvvvvvvvvvvvvv"', ', ')}`],
    ['the earlier value of a repeated attribute on a deployment node',
        p => `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T", $note="${p}", $note="ok") {\n  Container(a, "A", "T", "D")\n}`,
        bytes => `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T", ${filled(bytes, body => body, '$note="vvvvvvvvvvvvvvvv"', ', ')}) {\n  Container(a, "A", "T", "D")\n}`],
    ['the earlier value of a repeated attribute on a subgraph',
        p => `graph TB\nsubgraph g $note="${p}", $note="ok" {\nA[a<br/>Container]\n}`,
        bytes => `graph TB\nsubgraph g ${filled(bytes, body => body, '$note="vvvvvvvvvvvvvvvv"', ', ')} {\nA[a<br/>Container]\n}`],
    ['$sprite on a subgraph',
        p => `graph TB\nsubgraph g $sprite="${p}" {\nA[a<br/>Container]\n}`,
        bytes => `graph TB\nsubgraph g $sprite="${'s'.repeat(bytes - 60)}" {\nA[a<br/>Container]\n}`],
    ['$tags on a subgraph',
        p => `graph TB\nsubgraph g $tags="${p},${p}" {\nA[a<br/>Container]\n}`,
        bytes => `graph TB\nsubgraph g $tags="${'t,'.repeat(Math.floor((bytes - 60) / 2))}t" {\nA[a<br/>Container]\n}`],
    ['$tags on a bracket element (its tags come from the label lines)',
        p => `graph TB\na[A<br/>Container] $tags="${p}"`,
        bytes => `graph TB\na[A<br/>Container] $tags="${'t'.repeat(bytes - 50)}"`],
    ['comments, at the top level and in a block',
        p => `graph TB\n%% ${p}\nSystem(a, "A", "d")\nsubgraph g {\n%% ${p}\nA[a<br/>Container]\n}`,
        bytes => filled(bytes, body => `graph TB\nSystem(a, "A", "d")\n${body}`, '%% a comment line that the grammar drops entirely, padded to sixty-four by'),
    ],
    ['title lines',
        p => `graph TB\ntitle ${p}\nSystem(a, "A", "d")`,
        bytes => filled(bytes, body => `graph TB\nSystem(a, "A", "d")\n${body}`, 'title a title line that the grammar drops entirely, padded to sixty-four'),
    ],
    ['a class assignment whose targets name no element',
        p => `graph TB\nSystem(a, "A", "d")\nclass ghost${p.replace(/[^A-Za-z0-9-]/g, '')} big`,
        bytes => filled(bytes, body => `graph TB\nSystem(a, "A", "d")\n${body}`, 'class ghostghostghostghostghostghostghostghostghost big'),
    ],
];

describe('Security: source text the grammar discards is neither kept nor costly (#362)', function () {
    this.timeout(120000);

    for (const [construct, source] of DISCARDED) {
        it(`(a) ${construct}: an over-limit payload appears nowhere downstream`, () => {
            const text = source(PAYLOAD);
            const parsed = parser.parse(text);
            assert.ok(!retains(parsed), 'the parse result kept the payload');
            assert.strictEqual(findLimitViolation(parsed), undefined, 'nothing over a limit was kept, so nothing is refused');
            assert.ok(!JSON.stringify(lintC4xSource(text, OPTIONS)).includes(MARKER), 'a lint finding quoted the payload');
            assert.ok(!JSON.stringify(lintFileText('# Doc\n\n```c4x\n' + text + '\n```\n', 'markdown', OPTIONS)).includes(MARKER), 'a Markdown finding quoted the payload');
            assert.ok(!renderedSvg(text).includes(MARKER), 'the rendered SVG holds the payload');
        });
    }

    // A direction statement is discarded after the first in a block and inside a deployment node, but its value
    // is one of four words, so it cannot carry a payload: anything else is a syntax error that does not quote it.
    it('(a) a direction statement cannot carry a payload: only TB, BT, LR and RL parse', () => {
        for (const value of ['TB', 'BT', 'LR', 'RL']) {
            assert.doesNotThrow(() => parser.parse(`graph TB\nsubgraph g {\ndirection ${value}\nA[a<br/>Container]\n}`), value);
        }
        for (const text of [
            `graph TB\nsubgraph g {\ndirection ${PAYLOAD}\nA[a<br/>Container]\n}`,
            `graph TB\nsubgraph g {\ndirection LR ${PAYLOAD}\nA[a<br/>Container]\n}`,
            `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T") {\n  direction ${PAYLOAD}\n  Container(a, "A", "T", "D")\n}`,
        ]) {
            const findings = lintC4xSource(text, OPTIONS);
            assert.ok(findings.some(f => f.ruleId === 'C4X-SYNTAX'), `a direction payload parsed: ${text.slice(0, 50)}`);
            assert.ok(!JSON.stringify(findings).includes(MARKER), 'a syntax error quoted the payload');
        }
        const kept = parser.parse('graph TB\nsubgraph g {\ndirection LR\ndirection BT\nA[a<br/>Container]\n}');
        assert.strictEqual(kept.boundaries?.[0].direction, 'LR', 'the first direction in a block is the one kept');
    });

    it('(b) direction statements: a 4 MiB source parses and lints in bounded, linear time', () => {
        const text = (bytes: number) => filled(bytes, body => `graph TB\nsubgraph g {\n${body}\nA[a<br/>Container]\n}`, 'direction LR');
        const started = process.hrtime.bigint();
        const findings = lintC4xSource(text(MAX_CLI_FILE_BYTES), OPTIONS);
        const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
        assert.ok(!findings.some(f => f.ruleId === 'C4X-SYNTAX'), findings[0]?.message);
        assert.ok(elapsed < 20000, `4 MiB took ${elapsed.toFixed(0)} ms`);
    });

    for (const [construct, , big] of DISCARDED) {
        it(`(b) ${construct}: a 4 MiB source parses and lints in bounded, linear time`, () => {
            const time = (bytes: number) => {
                const text = big(bytes);
                assert.ok(text.length <= bytes + 200, `the ${bytes}-byte fixture is ${text.length} bytes`);
                const started = process.hrtime.bigint();
                const findings = lintC4xSource(text, OPTIONS);
                const elapsed = Number(process.hrtime.bigint() - started) / 1e6;
                assert.ok(!findings.some(f => f.ruleId === 'C4X-SYNTAX'), `the ${bytes}-byte fixture does not parse: ${findings[0]?.message}`);
                return elapsed;
            };
            time(64 * 1024); // warm up
            const quarter = time(MAX_CLI_FILE_BYTES / 4);
            const full = time(MAX_CLI_FILE_BYTES);
            assert.ok(full < 20000, `4 MiB took ${full.toFixed(0)} ms`);
            assert.ok(full < quarter * 4 * 3 + 250, `4 MiB took ${full.toFixed(0)} ms against ${quarter.toFixed(0)} ms for 1 MiB: super-linear`);
        });
    }
});
