/**
 * The C4X parser behaves exactly as origin/main's did (#362), except the one
 * documented change: nesting deeper than 32 levels is a located syntax error.
 * The grammar now counts nesting, position mapping uses a newline index and
 * the view-directive search no longer scans whitespace across lines; none of
 * that may change a parse result or an error.
 *
 * Differential: a seeded generator writes thousands of C4X sources (every
 * statement kind, nesting up to 6 levels, directives with and without a
 * header, comments, blank lines and odd whitespace, with random corruption:
 * unbalanced quotes, brackets, braces and pipes, truncated lines). Each is
 * parsed by the shipped parser and by the frozen reference copy of
 * origin/main's (fixtures/reference-df01a6b), and the results or the errors
 * (message and location) must be identical.
 */
import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4XParser as ReferenceParser } from '../fixtures/reference-df01a6b/C4XParser';
import { MAX_NESTING_DEPTH, nestingDepthMessage } from '../../parser/nestingDepth';

const shipped = new C4XParser();
const reference = new ReferenceParser();

/**
 * `droppedConstructs` is the one documented addition besides the nesting bound
 * (#472): the parser records what a deployment Node body discarded so the model
 * builder can report C4X-L116. It is omitted only from a parsed Node element
 * (an array on an object with type 'element' and elementType 'node'), so
 * same-named user metadata still takes part in the comparison.
 */
function omitNodeDrops(this: unknown, key: string, value: unknown): unknown {
    const holder = this as { type?: unknown; elementType?: unknown };
    if (key === 'droppedConstructs' && Array.isArray(value) && holder.type === 'element' && holder.elementType === 'node') {
        return undefined;
    }
    return value;
}

function outcome(parse: (source: string) => unknown, source: string, candidate = false): string {
    try {
        return `ok ${JSON.stringify(parse(source), candidate ? omitNodeDrops : undefined)}`;
    } catch (error) {
        const e = error as Error & { location?: unknown };
        return `error ${e.name}: ${e.message} @ ${JSON.stringify(e.location)}`;
    }
}

function generator(seed: number) {
    let state = seed >>> 0;
    const next = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };
    const pick = <T>(items: readonly T[]): T => items[Math.floor(next() * items.length)];
    const id = () => pick(['a', 'b', 'api', 'db', 'web', 'x_1', 'n-2']);
    const text = () => pick(['API', 'Stores data', 'Go', 'see {plan}', 'a|b', 'x', '', 'C:\\temp', '12 " in']).replace(/"/g, next() < 0.8 ? '' : '"');
    const noise = ['"', '[', ']', '{', '}', '|', '(', ')', '<br/>', '$', '=', '%%', '-->', ','];
    const statement = (depth: number): string[] => {
        const r = next();
        if (r < 0.18) { return [`${pick(['System', 'Container', 'Person', 'Component', 'SystemDb', 'Container_Ext'])}(${id()}, "${text()}"${next() < 0.6 ? `, "${text()}"` : ''}${next() < 0.4 ? `, "${text()}"` : ''}${next() < 0.3 ? `, $tags="${text()}"` : ''})`]; }
        if (r < 0.30) { return [`${id()}[${text() || 'L'}<br/>${pick(['Container', 'Person', 'Software System'])}]${next() < 0.2 ? ' $sprite="aws-s3"' : ''}`]; }
        if (r < 0.42) { return [`${id()} ${pick(['-->', '-.->', '==>'])}${next() < 0.7 ? `|${text()}|` : ''}${next() < 0.3 ? ` "${text()}"` : ''} ${id()}`]; }
        if (r < 0.50 && depth < 6) { return [`subgraph ${id()}${next() < 0.3 ? ' $tags="t"' : ''} {`, ...statement(depth + 1), ...(next() < 0.9 ? ['}'] : [])]; }
        if (r < 0.57 && depth < 6) { return [`${pick(['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary'])}(${id()}, "${text()}") {`, ...statement(depth + 1), ...(next() < 0.9 ? ['}'] : [])]; }
        if (r < 0.63 && depth < 6) { return [`Node(${id()}, "${text()}"${next() < 0.5 ? `, "${text()}"` : ''}) {`, ...statement(depth + 1), ...(next() < 0.9 ? ['}'] : [])]; }
        if (r < 0.67) { return [`elementStyle ${pick(['Database', '"Tag A"', 't'])} $background="#112233"${next() < 0.5 ? ', $shape="Cylinder"' : ''}`]; }
        if (r < 0.70) { return [`classDef c fill:#fff`]; }
        if (r < 0.74) { return [`%% ${text()}`]; }
        if (r < 0.77) { return ['direction LR']; }
        if (r < 0.80) { return ['', ' \t ', '\f']; }
        if (r < 0.83) { return [`title ${text()}`]; }
        if (r < 0.90) { return [pick(['}', '{', text(), `${id()}${pick(noise)}`])]; }
        return [`${pick(['System', 'Container'])}(${id()}, "${text()}${pick(noise)}${text()}")`];
    };
    return (): string => {
        const head: string[] = [];
        const h = next();
        if (h < 0.3) { head.push(`%%{ c4: ${pick(['container', 'system-context', 'deployment', 'component'])} }%%`, 'graph TB'); }
        else if (h < 0.5) { head.push(`${pick(['', '\n', '  ', '\f'])}%%{ c4: container }%%`); }
        else if (h < 0.7) { head.push(`graph ${pick(['TB', 'LR', 'BT', 'RL'])}`); }
        const lines = [...head];
        const count = 1 + Math.floor(next() * 14);
        for (let index = 0; index < count; index++) { lines.push(...statement(0)); }
        let source = lines.join(next() < 0.1 ? '\r\n' : '\n');
        if (next() < 0.15) { source = source.slice(0, Math.floor(next() * source.length)); }
        return source;
    };
}

describe('Security: C4X parser matches origin/main exactly, except the nesting bound (#362)', function () {
    this.timeout(120000);

    it('3,000 generated sources (seed 362): identical parse results or identical errors', () => {
        const generate = generator(362);
        let errors = 0;
        for (let index = 0; index < 3000; index++) {
            const source = generate();
            const mine = outcome(s => shipped.parse(s), source, true);
            assert.strictEqual(mine, outcome(s => reference.parse(s), source), `generated #${index} differs from origin/main:\n${JSON.stringify(source).slice(0, 600)}`);
            if (mine.startsWith('error')) { errors++; }
        }
        assert.ok(errors > 300 && errors < 2700, `${errors} of 3000 sources fail to parse: the corpus must exercise both paths`);
    });

    it('named cases: directives after whitespace, form feeds, CR line ends, braces and quotes in labels', () => {
        for (const source of [
            '\n\n  %%{ c4: container }%%\nContainer(a, "A")',
            '\f%%{ c4: container }%%\nContainer(a, "A")',
            '\r%%{ c4: container }%%\rContainer(a, "A")',
            ' \n\t\n%%{ c4: deployment }%%\nNode(n, "N") {\n}',
            'graph TB\na["<br/>Container]\nsubgraph s {\nb[B<br/>Container]\n}',
            'graph TB\na[{{{<br/>Container]',
            'System(a,"A","d"' + ', $note="x"'.repeat(2000) + ')',
            '\n'.repeat(2000) + 'System(a, "A", "d")',
        ]) {
            assert.strictEqual(outcome(s => shipped.parse(s), source, true), outcome(s => reference.parse(s), source), JSON.stringify(source).slice(0, 200));
        }
    });

    it('same-named user metadata still takes part in the comparison (#472)', () => {
        const source = '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "d", $droppedConstructs="keep")\nNode(n, "N") {\n  Container(b, "B", "Go", "d", $droppedConstructs="keep")\n}';
        const mine = outcome(s => shipped.parse(s), source, true);
        assert.ok(mine.includes('"droppedConstructs":"keep"'), mine.slice(0, 300));
        assert.strictEqual(mine, outcome(s => reference.parse(s), source));
    });

    it('the one difference: past 32 levels the shipped parser stops with a located error', () => {
        const nested = (n: number) => 'graph TB\n' + 'subgraph s {\n'.repeat(n) + 'a[A<br/>Container]\n' + '}\n'.repeat(n);
        assert.strictEqual(outcome(s => shipped.parse(s), nested(MAX_NESTING_DEPTH), true), outcome(s => reference.parse(s), nested(MAX_NESTING_DEPTH)));
        assert.ok(outcome(s => reference.parse(s), nested(MAX_NESTING_DEPTH + 1)).startsWith('ok'));
        assert.ok(outcome(s => shipped.parse(s), nested(MAX_NESTING_DEPTH + 1)).includes(nestingDepthMessage()));
    });
});
