/**
 * The PlantUML importer behaves exactly as origin/main's did (#362), except
 * that it finishes in linear time and stops past 32 nested boundaries with a
 * located error instead of overflowing the stack.
 *
 * Differential, not case by case: a seeded generator writes thousands of
 * PlantUML sources (every macro kind, multi-line calls, boundaries,
 * relationships, titles, one-line, floating and block notes, legends, headers,
 * footers, comments, skinparams and directives, with unbalanced quotes,
 * parentheses and braces, escaped quotes and unterminated blocks inserted at
 * random). Each runs through the shipped parser and through the frozen
 * reference copy of origin/main's parser (fixtures/reference-df01a6b), and the
 * results must be deeply equal, or both must throw the same error. The inputs
 * from every review round are named cases.
 */
import * as assert from 'assert';
import { parsePlantUML } from '../../parser/plantuml/PlantUMLParser';
import { parsePlantUML as parseReference } from '../fixtures/reference-df01a6b/PlantUMLParser';
import { MAX_NESTING_DEPTH, nestingDepthMessage } from '../../parser/nestingDepth';

type Outcome = { ok: true; value: string } | { ok: false; error: string };

function run(parse: (source: string) => unknown, source: string): { outcome: Outcome; ms: number } {
    const started = process.hrtime.bigint();
    let outcome: Outcome;
    try {
        outcome = { ok: true, value: JSON.stringify(parse(source)) };
    } catch (error) {
        outcome = { ok: false, error: `${(error as Error).name}: ${(error as Error).message}` };
    }
    return { outcome, ms: Number(process.hrtime.bigint() - started) / 1e6 };
}

/** The deepest boundary nesting in a reference parse, to recognise where only the new depth bound differs. */
function boundaryDepth(macros: ReadonlyArray<{ type?: string; children?: unknown[] }>): number {
    return Math.max(0, ...macros.map(m => (m.type === 'boundary' ? 1 + boundaryDepth((m.children ?? []) as Array<{ type?: string; children?: unknown[] }>) : 0)));
}

const REFERENCE_SLOW_MS = 200;

/**
 * The reference always runs to completion and its outcome is always compared:
 * there is no input on which equality is skipped. Where the reference is slow
 * (its quadratic continuation), the shipped parser must also be fast; that is
 * a separate check, made in addition to equality. The one permitted difference
 * is the depth error past 32 nested boundaries.
 */
function assertSame(name: string, source: string): 'equal' | 'equal-slow-reference' | 'depth' {
    const shipped = run(parsePlantUML, source);
    const reference = run(parseReference, source);
    if (!shipped.outcome.ok && shipped.outcome.error.includes(nestingDepthMessage()) && reference.outcome.ok) {
        const depth = boundaryDepth(JSON.parse(reference.outcome.value).macros);
        assert.ok(depth > MAX_NESTING_DEPTH, `${name}: depth error, but the reference nests only ${depth} levels`);
        return 'depth';
    }
    assert.deepStrictEqual(shipped.outcome, reference.outcome, `${name}: differs from origin/main\n${source.slice(0, 600)}`);
    if (reference.ms > REFERENCE_SLOW_MS) {
        assert.ok(shipped.ms < Math.max(100, reference.ms / 10), `${name}: reference took ${reference.ms.toFixed(0)} ms and the shipped parser ${shipped.ms.toFixed(0)} ms`);
        return 'equal-slow-reference';
    }
    return 'equal';
}

/** Inputs from every review round of #362, by round. */
const NAMED: ReadonlyArray<[string, string]> = [
    ['r2 parenthesis inside a quoted argument, then many lines', '@startuml\nSystem(a, "A", "(")\n' + 'x\n'.repeat(3000) + 'System(b, "B", "d")\n@enduml'],
    ['r2 long continuation the reference parses slowly (400 KB)', '@startuml\nSystem(a, "A", "(")\n' + 'x\n'.repeat(200000) + 'System(b, "B", "d")\n@enduml'],
    ['r2 nested boundary followed by a sibling', '@startuml\nSystem_Boundary(outer, "Outer") {\n  System_Boundary(inner, "Inner") {\n    System(a, "A", "d")\n  }\n}\nSystem_Boundary(next, "Next") {\n  System(b, "B", "d")\n}\n@enduml'],
    ['r3 element spanning 200 lines', '@startuml\nSystem(a, "A", "\n' + 'detail\n'.repeat(200) + '")\nSystem(b, "B", "d")\n@enduml'],
    ['r3 legend with unbalanced parentheses', '@startuml\nSystem(a, "A", "d")\nlegend right\n  Phase 2) rollout (see plan\nendlegend\nSystem(b, "B", "d")\nRel(a, b, "uses")\n@enduml'],
    ['r3 title with an open parenthesis', '@startuml\ntitle Release :) notes (draft\nSystem(a, "A", "d")\nSystem(b, "B", "d")\n@enduml'],
    ['r3 Windows path ending in a backslash', '@startuml\nSystem(fs, "Share", "path C:\\temp\\")\nSystem(b, "B", "d")\n@enduml'],
    ['r3 note body with an inch mark', '@startuml\nSystem(a, "A", "d")\nnote as N\nHandles 12" displays\nend note\nSystem(b, "B", "d")\n@enduml'],
    ['r3 block comment with an odd quote', "@startuml\n/' it\"s\n'/\nSystem(a, \"A\", \"d\")\n@enduml"],
    ['r4 legend line that begins like a call', '@startuml\nSystem(a, "A", "d")\nlegend\nSystem(s) overview (draft\nendlegend\nSystem(z, "Z", "last")\nRel(a, z, "uses")\n@enduml'],
    ['r4 escaped quote in a one-line call', '@startuml\nSystem(a, "12\\" screen", "d")\nSystem(b, "B", "d")\n@enduml'],
    ['r5 floating note, then an end note', '@startuml\nSystem(a, "A", "d")\nnote "text" as N1\nSystem(b, "B", "d")\nRel(a, b, "uses")\nnote as N2\nx\nend note\n@enduml'],
    ['r5 floating note without an end note', '@startuml\nSystem(a, "A", "d")\nnote "text" as N1\nSystem(b, "B", "d")\n@enduml'],
    ['r5 unclosed legend', '@startuml\nSystem(a, "A", "d")\nlegend right\nSystem(b, "B", "d")\n@enduml'],
    ['r5 unclosed footer', '@startuml\nSystem(a, "A", "d")\nfooter\nSystem(b, "B", "d")\n@enduml'],
    ['r5 unclosed block comment', "@startuml\nSystem(a, \"A\", \"d\")\n/' comment\nSystem(b, \"B\", \"d\")\n@enduml"],
    ['unclosed parenthesis in a call drops the rest (as on main)', '@startuml\nSystem(a, "A", "d"\nSystem(b, "B", "d")\n@enduml'],
    ['AddElementTag with ( in a quoted argument', '@startuml\nAddElementTag("beta", $legendText="(beta")\nSystem(a, "A", "d")\n@enduml'],
];

function generator(seed: number) {
    let state = seed >>> 0;
    const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
    const noise = ['"', '(', ')', '{', '}', '\\"', '\\', '""', '()', ')(', ':', ',', "'"];
    const words = ['web', 'API', 'Store', 'reads', 'C:\\temp', 'v2', '12"', 'see (plan', 'x', 'end'];
    const text = () => {
        let out = Array.from({ length: 1 + Math.floor(next() * 3) }, () => pick(words)).join(' ');
        if (next() < 0.25) { out += pick(noise); }
        return out.replace(/"/g, next() < 0.7 ? '' : '"');
    };
    const alias = () => pick(['a', 'b', 'c', 'api', 'db', 'u1', 'x_2']);
    const elementTypes = ['Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext', 'Container', 'ContainerDb', 'Component', 'ComponentDb'];
    const relTypes = ['Rel', 'Rel_Back', 'Rel_Neighbor', 'Rel_D', 'Rel_U', 'Rel_L', 'Rel_R', 'BiRel', 'BiRel_D', 'BiRel_U', 'BiRel_L', 'BiRel_R'];
    const boundaryTypes = ['System_Boundary', 'Container_Boundary', 'Boundary'];
    const line = (depth: number): string[] => {
        const r = next();
        if (r < 0.22) { return [`${pick(elementTypes)}(${alias()}, "${text()}", "${text()}"${next() < 0.5 ? `, "${text()}"` : ''})`]; }
        if (r < 0.32) { return [`${pick(relTypes)}(${alias()}, ${alias()}, "${text()}"${next() < 0.5 ? `, "${text()}"` : ''})`]; }
        if (r < 0.38) { return [`${pick(elementTypes)}(${alias()},`, `  "${text()}",`, `  "${text()}")`]; }
        if (r < 0.45 && depth < 5) { return [`${pick(boundaryTypes)}(${alias()}, "${text()}") {`, ...line(depth + 1), ...(next() < 0.85 ? ['}'] : [])]; }
        if (r < 0.48) { return [`title ${text()}`]; }
        if (r < 0.50) { return ['title', text(), ...(next() < 0.7 ? ['end title'] : [])]; }
        if (r < 0.53) { return [`note ${pick(['right', 'left', 'top'])} of ${alias()} : ${text()}`]; }
        if (r < 0.56) { return [`note "${text()}" as N${Math.floor(next() * 9)}`]; }
        if (r < 0.60) { return [`note as N${Math.floor(next() * 9)}`, text(), ...(next() < 0.7 ? ['end note'] : [])]; }
        if (r < 0.64) { return [`legend ${pick(['', 'right', 'left'])}`.trim(), text(), ...(next() < 0.7 ? ['endlegend'] : [])]; }
        if (r < 0.66) { return [pick(['header', 'footer']), text(), ...(next() < 0.7 ? [pick(['endheader', 'endfooter'])] : [])]; }
        if (r < 0.70) { return [`' ${text()}`]; }
        if (r < 0.73) { return [`/' ${text()}`, ...(next() < 0.7 ? ["'/"] : [])]; }
        if (r < 0.76) { return [`skinparam ${pick(['defaultFontName', 'shadowing'])} ${text()}`]; }
        if (r < 0.79) { return [pick(['!include <C4/C4_Container>', '!define X', 'LAYOUT_WITH_LEGEND()', 'SHOW_LEGEND()'])]; }
        if (r < 0.82) { return [`AddElementTag("${text()}", $legendText="${text()}")`]; }
        if (r < 0.86) { return ['']; }
        if (r < 0.90) { return [text()]; }
        if (r < 0.94) { return ['}']; }
        return [`${pick(elementTypes)}(${alias()}, "${text()}${pick(noise)}", "${text()}")`];
    };
    return (): string => {
        const lines = next() < 0.9 ? ['@startuml'] : [];
        const count = 1 + Math.floor(next() * 18);
        for (let index = 0; index < count; index++) { lines.push(...line(0)); }
        if (next() < 0.9) { lines.push('@enduml'); }
        return lines.join(next() < 0.1 ? '\r\n' : '\n');
    };
}

describe('Security: PlantUML importer matches origin/main exactly (#362)', function () {
    this.timeout(120000);
    const original = console.warn;
    before(() => { console.warn = () => undefined; });
    after(() => { console.warn = original; });

    for (const [name, source] of NAMED) {
        it(`named case: ${name}`, () => {
            const result = assertSame(name, source);
            assert.notStrictEqual(result, 'depth');
            if (name.includes('parses slowly')) {
                assert.strictEqual(result, 'equal-slow-reference', 'this case must exercise the slow-reference path, with equality checked');
            }
        });
    }

    it('past 32 nested boundaries: a located error where the reference recursed on', () => {
        const nested = (n: number) => '@startuml\n' + Array.from({ length: n }, (_, i) => `System_Boundary(b${i}, "B") {`).join('\n') + '\nSystem(s, "S", "d")\n' + '}\n'.repeat(n) + '@enduml';
        assert.strictEqual(assertSame('32 levels', nested(MAX_NESTING_DEPTH)), 'equal');
        assert.strictEqual(assertSame('33 levels', nested(MAX_NESTING_DEPTH + 1)), 'depth');
    });

    it('3,000 generated sources (seed 451): identical results, or the same error', () => {
        const generate = generator(451);
        const tally = { equal: 0, depth: 0, 'equal-slow-reference': 0, errors: 0 };
        for (let index = 0; index < 3000; index++) {
            const source = generate();
            const result = assertSame(`generated #${index}`, source);
            tally[result]++;
            try { parsePlantUML(source); } catch { tally.errors++; }
        }
        assert.strictEqual(tally.equal + tally.depth + tally['equal-slow-reference'], 3000);
        assert.strictEqual(tally.depth, 0, 'the generator nests at most 5 levels');
        // The corpus must exercise the malformed paths, not only clean input.
        assert.ok(tally.equal > 2900, JSON.stringify(tally));
    });
});
