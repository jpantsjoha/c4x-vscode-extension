/**
 * Bounded input for the parser and the headless lint core (#362; threat-model
 * rows RES-1 to RES-5). Each bound is tested at and beyond its
 * limit, and adversarial sources must finish inside a time budget.
 */
import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4XParseError } from '../../parser/types';
import { MAX_NESTING_DEPTH, nestingDepthMessage } from '../../parser/nestingDepth';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4View } from '../../model/C4Model';
import { parsePlantUMLtoC4Model } from '../../parser/plantuml';
import { parseStructurizrDSL } from '../../parser/structurizr';
import { lintC4xSource, lintFileText } from '../../cli/lintSource';
import {
    LIMIT_RULE_ID,
    MAX_ELEMENTS,
    MAX_ENTRIES,
    MAX_MCP_SOURCE_BYTES,
    MAX_RELATIONSHIPS,
    MAX_TEXT_LENGTH,
    findLimitViolation,
    inputLimitTable,
    MAX_RENDER_ELEMENTS,
    MAX_RENDER_RELATIONSHIPS,
    MAX_RENDER_SVG_BYTES,
    RENDER_TIME_BUDGET_MS,
} from '../../cli/limits';
import { normalizeLintOptions } from '../../model/lint';

const parser = new C4XParser();
const OPTIONS = normalizeLintOptions(true, {});

function nestedNodes(depth: number): string {
    return ['%%{ c4: deployment }%%', 'graph TB']
        .concat(Array.from({ length: depth }, (_, i) => `${'  '.repeat(i)}Node(n${i}, "Node ${i}", "Tech") {`))
        .concat([`${'  '.repeat(depth)}Container(app, "App", "Node.js", "Serves")`])
        .concat(Array.from({ length: depth }, (_, i) => `${'  '.repeat(depth - i - 1)}}`))
        .join('\n');
}

function containers(count: number, extra = ''): string {
    return ['%%{ c4: container }%%', 'graph TB']
        .concat(Array.from({ length: count }, (_, i) => `Container(c${i}, "C${i}", "T", "D")`))
        .join('\n') + extra;
}

function onlyRule(findings: ReturnType<typeof lintC4xSource>, ruleId: string) {
    assert.strictEqual(findings.length, 1, JSON.stringify(findings.slice(0, 3)));
    assert.strictEqual(findings[0].ruleId, ruleId);
    assert.strictEqual(findings[0].severity, 'error');
    return findings[0];
}

describe('Security: input limits (#362)', () => {
    describe('nesting depth', () => {
        it(`accepts ${MAX_NESTING_DEPTH} levels and refuses ${MAX_NESTING_DEPTH + 1} with a located error`, () => {
            assert.doesNotThrow(() => parser.parse(nestedNodes(MAX_NESTING_DEPTH)));
            const source = nestedNodes(MAX_NESTING_DEPTH + 1);
            assert.throws(() => parser.parse(source), (error: unknown) => {
                assert.ok(error instanceof C4XParseError);
                assert.match(error.message, /deeper than 32 levels/);
                // Line 3 holds level 1, so level 33 opens on line 35, after 64 spaces of indent.
                assert.deepStrictEqual(error.location, { line: MAX_NESTING_DEPTH + 3, column: 2 * MAX_NESTING_DEPTH + 'Node(n32, "Node 32", "Tech") '.length + 1 });
                return true;
            });
        });

        it('turns 50,000 levels into one syntax finding, not a stack overflow (failed before the bound: RangeError text at 1:1)', () => {
            const source = 'graph TB\n' + 'subgraph s {\n'.repeat(50000) + 'A[a<br/>Container]\n' + '}\n'.repeat(50000);
            const started = Date.now();
            const finding = onlyRule(lintC4xSource(source, OPTIONS), 'C4X-SYNTAX');
            assert.match(finding.message, /Nesting is deeper than 32 levels/);
            assert.deepStrictEqual([finding.line, finding.column], [MAX_NESTING_DEPTH + 2, 12]);
            assert.ok(Date.now() - started < 1000, `took ${Date.now() - started} ms`);
        });

        it('counts structure, not text: a quote in a label cannot hide a level (failed with the text pre-scan)', () => {
            for (const depth of [33, 100]) {
                const source = 'graph TB\na["<br/>Container]\n' + 'subgraph s {\n'.repeat(depth) + 'b[B<br/>Container]\n' + '}\n'.repeat(depth);
                assert.throws(() => parser.parse(source), (error: unknown) => {
                    assert.ok(error instanceof C4XParseError);
                    assert.strictEqual(error.message, nestingDepthMessage());
                    assert.deepStrictEqual(error.location, { line: 35, column: 12 });
                    return true;
                }, `depth ${depth}`);
            }
            const pipe = 'graph TB\na[A<br/>Container]\nb[B<br/>Container]\na -->|"{{{| b\n' + 'subgraph s {\n'.repeat(33) + '}\n'.repeat(33);
            assert.throws(() => parser.parse(pipe), /Nesting is deeper than 32 levels/);
        });

        it('counts structure, not text: braces inside labels are not levels (failed with the text pre-scan at 2:35)', () => {
            const braces = '{'.repeat(MAX_NESTING_DEPTH + 1);
            for (const source of [
                `graph TB\na[${braces}<br/>Container]\n`,
                `graph TB\nSystem(a, "${braces}", "${braces}")\n`,
                `graph TB\nSystem(a, "A", "d")\nSystem(b, "B", "d")\na -->|${braces}| "${braces}" b\n`,
                `graph TB\n%% ${braces}\nSystem(a, "A", "d")\n`,
            ]) {
                assert.doesNotThrow(() => parser.parse(source), source.slice(0, 40));
            }
        });

        it('property: on a generated corpus the error appears exactly when the real depth exceeds 32, at the right brace', () => {
            let seed = 362;
            const random = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
            // Text that a lexer which guessed at structure would misread: braces, quotes and pipes in labels.
            const quotedNoise = () => ['', '{', '}', '{}', '|', '{{|'][Math.floor(random() * 6)];
            const bracketNoise = () => ['', '{', '}', '"', '{"}', '|'][Math.floor(random() * 6)];
            const builder = new C4ModelBuilder();
            const boundaryDepth = (view: C4View) => {
                const byId = new Map((view.boundaries ?? []).map(b => [b.id, b]));
                const depth = (id: string): number => 1 + Math.max(0, ...(byId.get(id)?.elements ?? []).filter(e => byId.has(e)).map(depth));
                return Math.max(0, ...[...byId.keys()].map(depth));
            };
            type Nested = { type: string; children?: Nested[] };
            const nodeDepth = (elements: ReadonlyArray<Nested>): number =>
                Math.max(0, ...elements.map(e => (e.type === 'DeploymentNode' ? 1 : 0) + nodeDepth(e.children ?? [])));
            let checked = 0;
            for (let round = 0; round < 120; round++) {
                const kind = round % 2 === 0 ? 'boundary' : 'node';
                const target = 1 + Math.floor(random() * 45);
                const lines: string[] = kind === 'node' ? ['%%{ c4: deployment }%%', 'graph TB'] : ['%%{ c4: container }%%', 'graph TB'];
                let openedAt33: number | undefined;
                let counter = 0;
                const open = (level: number) => {
                    counter++;
                    if (kind === 'node') {
                        lines.push(`Node(n${counter}, "N${quotedNoise()}", "T") {`);
                    } else {
                        const pick = Math.floor(random() * 3);
                        lines.push(pick === 0 ? `subgraph s${counter} {` : pick === 1 ? `System_Boundary(b${counter}, "B${quotedNoise()}") {` : `Container_Boundary(c${counter}, "C${quotedNoise()}") {`);
                        lines.push(`  x${counter}[X${bracketNoise()}<br/>Container]`);
                    }
                    if (level === MAX_NESTING_DEPTH + 1 && openedAt33 === undefined) { openedAt33 = lines.length; }
                };
                for (let level = 1; level <= target; level++) {
                    open(level);
                    if (random() < 0.2 && level < target) {
                        // A sibling branch that closes again: depth is the longest path, not the count.
                        open(level + 1);
                        lines.push('}');
                    }
                }
                lines.push(...Array.from({ length: target }, () => '}'));
                const source = lines.join('\n');
                if (target > MAX_NESTING_DEPTH) {
                    assert.throws(() => parser.parse(source), (error: unknown) => {
                        assert.ok(error instanceof C4XParseError && error.message === nestingDepthMessage(), String(error));
                        assert.ok(error.location.line <= (openedAt33 ?? Infinity), `line ${error.location.line}, level 33 opens at ${openedAt33}`);
                        return true;
                    });
                } else {
                    const view = builder.build(parser.parse(source), 'depth').views[0];
                    const real = kind === 'node' ? nodeDepth(view.elements as unknown as Nested[]) : boundaryDepth(view);
                    assert.strictEqual(real, target, `round ${round}: built ${target} levels, the model holds ${real}`);
                }
                checked++;
            }
            assert.strictEqual(checked, 120);
        });

        it('applies the 32-level bound to every C4X nesting form, through lint (boundary, subgraph, deployment node, mixed)', () => {
            const forms: ReadonlyArray<[string, (depth: number) => string]> = [
                ['System_Boundary blocks', d => ['%%{ c4: container }%%', 'graph TB'].concat(Array.from({ length: d }, (_, i) => `System_Boundary(b${i}, "B") {`), ['Container(c, "C", "T", "D")'], Array.from({ length: d }, () => '}')).join('\n')],
                ['subgraphs', d => ['graph TB'].concat(Array.from({ length: d }, (_, i) => `subgraph g${i} {`), ['A[a<br/>Container]'], Array.from({ length: d }, () => '}')).join('\n')],
                ['deployment nodes', d => nestedNodes(d)],
                ['boundaries and subgraphs alternating', d => ['graph TB'].concat(Array.from({ length: d }, (_, i) => (i % 2 === 0 ? `System_Boundary(b${i}, "B") {` : `subgraph g${i} {`)), ['A[a<br/>Container]'], Array.from({ length: d }, () => '}')).join('\n')],
            ];
            for (const [form, source] of forms) {
                assert.ok(!lintC4xSource(source(MAX_NESTING_DEPTH), OPTIONS).some(f => f.ruleId === 'C4X-SYNTAX'), `32 levels of ${form} were refused`);
                const finding = onlyRule(lintC4xSource(source(MAX_NESTING_DEPTH + 1), OPTIONS), 'C4X-SYNTAX');
                assert.ok(finding.message.endsWith(nestingDepthMessage()), `${form}: ${finding.message}`);
            }
        });

        it('PlantUML and Structurizr apply the same 32-level bound with a located error (both accepted 33 before)', () => {
            const puml = (n: number) => '@startuml\n' + Array.from({ length: n }, (_, i) => `System_Boundary(b${i}, "B") {`).join('\n') + '\nSystem(s, "S", "d")\n' + '}\n'.repeat(n) + '@enduml';
            assert.doesNotThrow(() => parsePlantUMLtoC4Model(puml(MAX_NESTING_DEPTH)));
            assert.throws(() => parsePlantUMLtoC4Model(puml(MAX_NESTING_DEPTH + 1)), /Nesting is deeper than 32 levels.*\(Line 34, Column 1\)/);
            assert.throws(() => parsePlantUMLtoC4Model(puml(20000)), /Nesting is deeper than 32 levels/, 'no stack overflow');
            const sz = (n: number) => 'workspace "W" {\n  model {\n' + Array.from({ length: n }, (_, i) => `s${i} = softwareSystem "S${i}" {`).join('\n') + '\n'
                + '}\n'.repeat(n) + '  }\n  views {\n    systemContext s0 {\n      include *\n    }\n  }\n}';
            assert.doesNotThrow(() => parseStructurizrDSL(sz(MAX_NESTING_DEPTH)));
            assert.throws(() => parseStructurizrDSL(sz(MAX_NESTING_DEPTH + 1)), /Nesting is deeper than 32 levels.* at 35:7/);
        });
    });

    describe('element, relationship and text bounds (headless tools)', () => {
        it(`accepts ${MAX_ELEMENTS} elements and refuses ${MAX_ELEMENTS + 1} with C4X-LIMIT at the first one over`, () => {
            assert.ok(!lintC4xSource(containers(MAX_ELEMENTS), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID));
            const finding = onlyRule(lintC4xSource(containers(MAX_ELEMENTS + 1), OPTIONS), LIMIT_RULE_ID);
            assert.match(finding.message, /2001 elements and boundaries; C4X tools accept at most 2000/);
            assert.strictEqual(finding.line, MAX_ELEMENTS + 3);
        });

        it('counts nested elements and boundaries too', () => {
            const half = Math.ceil(MAX_ELEMENTS / 2);
            const source = ['%%{ c4: container }%%', 'graph TB', 'System_Boundary(b, "B") {']
                .concat(Array.from({ length: half }, (_, i) => `Container(in${i}, "I", "T", "D")`), ['}'])
                .concat(Array.from({ length: half }, (_, i) => `Container(out${i}, "O", "T", "D")`))
                .join('\n');
            onlyRule(lintC4xSource(source, OPTIONS), LIMIT_RULE_ID);
        });

        it(`accepts ${MAX_RELATIONSHIPS} relationships and refuses ${MAX_RELATIONSHIPS + 1}`, () => {
            const rels = (n: number) => containers(2, '\n' + Array.from({ length: n }, () => 'c0 -->|uses| c1').join('\n'));
            assert.ok(!lintC4xSource(rels(MAX_RELATIONSHIPS), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID));
            const finding = onlyRule(lintC4xSource(rels(MAX_RELATIONSHIPS + 1), OPTIONS), LIMIT_RULE_ID);
            assert.match(finding.message, /5001 relationships/);
        });

        it('applies the element bound to every form an element or boundary can take', () => {
            const forms: ReadonlyArray<[string, (n: number) => string]> = [
                ['bracket elements', n => ['graph TB'].concat(Array.from({ length: n }, (_, i) => `e${i}[E${i}<br/>Container]`)).join('\n')],
                ['element calls of several kinds', n => ['%%{ c4: container }%%', 'graph TB'].concat(Array.from({ length: n }, (_, i) => `${['Person', 'System', 'Container', 'ContainerDb', 'Component'][i % 5]}(e${i}, "E${i}", "T", "D")`)).join('\n')],
                ['boundaries, each holding one element', n => ['%%{ c4: container }%%', 'graph TB'].concat(Array.from({ length: Math.floor(n / 2) }, (_, i) => `System_Boundary(b${i}, "B") {\nContainer(c${i}, "C", "T", "D")\n}`), n % 2 ? ['Container(extra, "X", "T", "D")'] : []).join('\n')],
                ['subgraphs, each holding one element', n => ['graph TB'].concat(Array.from({ length: Math.floor(n / 2) }, (_, i) => `subgraph g${i} {\nc${i}[C<br/>Container]\n}`), n % 2 ? ['extra[X<br/>Container]'] : []).join('\n')],
                ['deployment nodes, each holding one element', n => ['%%{ c4: deployment }%%', 'graph TB'].concat(Array.from({ length: Math.floor(n / 2) }, (_, i) => `Node(n${i}, "N", "T") {\nContainer(c${i}, "C", "T", "D")\n}`), n % 2 ? ['Container(extra, "X", "T", "D")'] : []).join('\n')],
            ];
            for (const [form, source] of forms) {
                assert.ok(!lintC4xSource(source(MAX_ELEMENTS), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID || f.ruleId === 'C4X-SYNTAX'), `${MAX_ELEMENTS} as ${form} were refused`);
                const finding = onlyRule(lintC4xSource(source(MAX_ELEMENTS + 1), OPTIONS), LIMIT_RULE_ID);
                assert.match(finding.message, /2001 elements and boundaries/, form);
            }
        });

        it('applies the relationship bound to every arrow and label form', () => {
            const forms: ReadonlyArray<[string, (i: number) => string]> = [
                ['solid arrow with label', () => 'c0 -->|uses| c1'],
                ['dotted arrow', () => 'c0 -.->|reads| c1'],
                ['thick arrow', () => 'c0 ==>|writes| c1'],
                ['arrow with technology', () => 'c0 -->|uses| "HTTPS" c1'],
                ['arrow without a label', () => 'c0 --> c1'],
                ['all forms mixed', i => ['c0 -->|uses| c1', 'c0 -.->|reads| c1', 'c0 ==>|writes| c1', 'c0 -->|uses| "HTTPS" c1', 'c0 --> c1'][i % 5]],
            ];
            for (const [form, line] of forms) {
                const source = (n: number) => containers(2, '\n' + Array.from({ length: n }, (_, i) => line(i)).join('\n'));
                assert.ok(!lintC4xSource(source(MAX_RELATIONSHIPS), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID || f.ruleId === 'C4X-SYNTAX'), `${MAX_RELATIONSHIPS} ${form} were refused`);
                const finding = onlyRule(lintC4xSource(source(MAX_RELATIONSHIPS + 1), OPTIONS), LIMIT_RULE_ID);
                assert.match(finding.message, /5001 relationships/, form);
            }
        });

        it('lints a diagram at every count bound in well under a second (RES-3)', () => {
            // 2,000 elements and 5,000 relationships; measured at about 50 ms. The bound is generous so a loaded machine does not flake.
            const atLimits = containers(MAX_ELEMENTS, '\n' + Array.from({ length: MAX_RELATIONSHIPS }, (_, i) => `c${i % MAX_ELEMENTS} -->|uses| c${(i + 1) % MAX_ELEMENTS}`).join('\n'));
            lintC4xSource(atLimits, OPTIONS); // warm up the parser and rules
            const started = process.hrtime.bigint();
            const findings = lintC4xSource(atLimits, OPTIONS);
            const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
            assert.ok(!findings.some(f => f.ruleId === LIMIT_RULE_ID), 'a diagram at the bounds was refused');
            assert.ok(elapsedMs < 1000, `lint at the bounds took ${elapsedMs.toFixed(0)} ms`);
        });

        const long = 'x'.repeat(MAX_TEXT_LENGTH + 1);
        const fits = 'x'.repeat(MAX_TEXT_LENGTH);
        const textCases: ReadonlyArray<[string, (t: string) => string, RegExp]> = [
            ['label', t => `graph TB\nSystem(a, "${t}", "d")`, /A label/],
            ['description', t => `graph TB\nSystem(a, "A", "${t}")`, /A description/],
            ['technology', t => `%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "${t}", "d")`, /A technology/],
            ['tag', t => `graph TB\nSystem(a, "A", "d", $tags="ok,${t}")`, /A tag/],
            ['attribute value', t => `graph TB\nSystem(a, "A", "d", $note="${t}")`, /The \$note value/],
            ['bracket label', t => `graph TB\na[${t}<br/>Software System]`, /A label/],
            ['boundary label', t => `%%{ c4: container }%%\ngraph TB\nSystem_Boundary(b, "${t}") {\nContainer(a, "A", "T", "D")\n}`, /A boundary label/],
            ['relationship label', t => `graph TB\nSystem(a, "A", "d")\nSystem(b, "B", "d")\na -->|${t}| b`, /A relationship label/],
            ['relationship technology', t => `graph TB\nSystem(a, "A", "d")\nSystem(b, "B", "d")\na -->|uses| "${t}" b`, /A relationship technology/],
            ['elementStyle value', t => `graph TB\nelementStyle Tag $legend="${t}"\nSystem(a, "A", "d")`, /The \$legend value/],
        ];
        for (const [field, source, message] of textCases) {
            it(`a ${field} of ${MAX_TEXT_LENGTH} characters passes; one more is C4X-LIMIT`, () => {
                assert.strictEqual(findLimitViolation(parser.parse(source(fits))), undefined);
                const violation = findLimitViolation(parser.parse(source(long)));
                assert.ok(violation, `${field} over the limit was accepted`);
                assert.match(violation.message, message);
                assert.match(violation.message, /4097 characters long; C4X allows at most 4096/);
                onlyRule(lintC4xSource(source(long), OPTIONS), LIMIT_RULE_ID);
            });
        }

        it('checks classDef bodies, subgraph attributes, elementStyle tags and relationships inside boundaries', () => {
            const cases: ReadonlyArray<[string, RegExp]> = [
                [`graph TB\nSystem(a, "A", "d")\nclassDef big ${long}`, /A classDef body/],
                [`graph TB\nsubgraph g $note="${long}" {\nA[a<br/>Container]\n}`, /The \$note value/],
                [`graph TB\nelementStyle "${long}" $background="#ffffff"\nSystem(a, "A", "d")`, /An elementStyle tag/],
                [`%%{ c4: container }%%\ngraph TB\nSystem_Boundary(b, "B") {\nContainer(x, "X", "T", "D")\nContainer(y, "Y", "T", "D")\nx -->|${long}| y\n}`, /A relationship label/],
            ];
            for (const [source, message] of cases) {
                const violation = findLimitViolation(parser.parse(source));
                assert.ok(violation, source.slice(0, 60));
                assert.match(violation.message, message);
                assert.ok(violation.line > 1, `${message}: located at ${violation.line}:${violation.column}`);
            }
        });

        it('falls back to 1:1 for a node with no source range, and reports the first problem only', () => {
            const unlocated = {
                viewType: 'system-context' as const, direction: 'TB' as const, hasExplicitDirection: true,
                elements: [{ type: 'element' as const, id: 'a', label: long, elementType: 'System', tags: [] }],
                relationships: [{ type: 'relationship' as const, from: 'a', to: 'a', arrow: '-->' as const, label: long }],
            };
            assert.deepStrictEqual(findLimitViolation(unlocated), {
                message: 'A label is 4097 characters long; C4X allows at most 4096 in one text field.', line: 1, column: 1,
            });
            assert.strictEqual(findLimitViolation({ ...unlocated, elements: [], relationships: [] }), undefined);
        });

        it('reports a limit inside a Markdown fence on the file line', () => {
            const markdown = `# Doc\n\ntext\n\n\`\`\`c4x\ngraph TB\nSystem(a, "${long}", "d")\n\`\`\`\n`;
            const finding = onlyRule(lintFileText(markdown, 'markdown', OPTIONS), LIMIT_RULE_ID);
            assert.strictEqual(finding.line, 7);
        });

        describe('every place a diagram holds elements, relationships or text (structurally complete walk)', () => {
            // Each source puts its content one level inside the named location, so a walk that
            // skips that location sees a small, valid diagram (#362 round 9).
            const inNestedNode = (lines: readonly string[]) => ['%%{ c4: deployment }%%', 'graph TB', 'Node(n0, "N0", "T") {', '  Node(n1, "N1", "T") {']
                .concat(lines.map(line => `    ${line}`), ['  }', '}']).join('\n');
            const inNestedBoundary = (lines: readonly string[]) => ['%%{ c4: container }%%', 'graph TB', 'System_Boundary(outer, "Outer") {', '  Container_Boundary(inner, "Inner") {']
                .concat(lines.map(line => `    ${line}`), ['  }', '}']).join('\n');
            const dynamic = (lines: readonly string[]) => ['%%{ c4: dynamic }%%', 'graph LR', 'a[A<br/>Container]', 'b[B<br/>Container]'].concat(lines).join('\n');
            const pair = ['Container(a, "A", "T", "D")', 'Container(b, "B", "T", "D")'];
            const steps = (n: number) => Array.from({ length: n }, (_, i) => `a -->|${i + 1}. calls| b`);
            const elements = (n: number) => Array.from({ length: n }, (_, i) => `Container(e${i}, "E", "T", "D")`);

            // [where, source with n items, items allowed (the bound less the fixed nodes around them), message]
            const countCases: ReadonlyArray<[string, (n: number) => string, number, RegExp]> = [
                ['relationships inside a nested deployment node', n => inNestedNode(pair.concat(steps(n))), MAX_RELATIONSHIPS, /5001 relationships/],
                ['elements inside a nested deployment node', n => inNestedNode(elements(n)), MAX_ELEMENTS - 2, /2001 elements and boundaries/],
                ['elements inside a boundary inside a boundary', n => inNestedBoundary(elements(n)), MAX_ELEMENTS - 2, /2001 elements and boundaries/],
                ['relationships inside a boundary inside a boundary', n => inNestedBoundary(pair.concat(steps(n))), MAX_RELATIONSHIPS, /5001 relationships/],
                ['dynamic-view steps', n => dynamic(steps(n)), MAX_RELATIONSHIPS, /5001 relationships/],
            ];
            for (const [where, source, allowed, message] of countCases) {
                it(`counts ${where}`, () => {
                    assert.strictEqual(findLimitViolation(parser.parse(source(allowed))), undefined, `${allowed} ${where} were refused`);
                    const violation = findLimitViolation(parser.parse(source(allowed + 1)));
                    assert.ok(violation, `${allowed + 1} ${where} were accepted`);
                    assert.match(violation.message, message);
                    assert.ok(lintC4xSource(source(allowed + 1), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID));
                });
            }

            const textCases: ReadonlyArray<[string, (t: string) => string, RegExp]> = [
                ['a relationship label inside a nested deployment node', t => inNestedNode(pair.concat(`a -->|${t}| b`)), /A relationship label/],
                ['a relationship technology inside a nested deployment node', t => inNestedNode(pair.concat(`a -->|uses| "${t}" b`)), /A relationship technology/],
                ['a nested deployment node label', t => inNestedNode([`Node(n2, "${t}", "T") {`, '  Container(a, "A", "T", "D")', '}']), /A label/],
                ['an attribute value on an element in a nested deployment node', t => inNestedNode([`Container(a, "A", "T", "D", $note="${t}")`]), /The \$note value/],
                ['a boundary label inside a boundary', t => ['%%{ c4: container }%%', 'graph TB', 'System_Boundary(outer, "Outer") {', `  Container_Boundary(inner, "${t}") {`, '    Container(a, "A", "T", "D")', '  }', '}'].join('\n'), /A boundary label/],
                ['a description inside a boundary inside a boundary', t => inNestedBoundary([`Container(a, "A", "T", "${t}")`]), /A description/],
                ['a relationship label inside a boundary inside a boundary', t => inNestedBoundary(pair.concat(`a -->|${t}| b`)), /A relationship label/],
                ['a dynamic-view step label', t => dynamic([`a -->|1. ${t.slice(3)}| b`]), /A relationship label/],
            ];
            for (const [where, source, message] of textCases) {
                it(`holds ${where} to ${MAX_TEXT_LENGTH} characters`, () => {
                    assert.strictEqual(findLimitViolation(parser.parse(source(fits))), undefined);
                    const violation = findLimitViolation(parser.parse(source(long)));
                    assert.ok(violation, `${where} over the limit was accepted`);
                    assert.match(violation.message, message);
                    assert.match(violation.message, /4097 characters long; C4X allows at most 4096/);
                    assert.ok(violation.line > 2, `${where}: located at ${violation.line}:${violation.column}`);
                    assert.ok(lintC4xSource(source(long), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID));
                });
            }

            it('holds every string and attribute name to the bound, whatever field holds it', () => {
                // A field no grammar fills today: the walk must not depend on knowing its name.
                const future = {
                    viewType: 'container' as const, direction: 'TB' as const, hasExplicitDirection: true, elements: [], relationships: [],
                    extension: { deeper: [{ note: long }] },
                } as unknown as Parameters<typeof findLimitViolation>[0];
                assert.match(findLimitViolation(future)?.message ?? '', /A text field \(note\) is 4097 characters long/);
                const inList = { ...future, extension: { list: ['short', long] } } as unknown as Parameters<typeof findLimitViolation>[0];
                assert.match(findLimitViolation(inList)?.message ?? '', /A text field is 4097 characters long/);
                const longKey = { ...future, extension: { [long]: 'x' } } as unknown as Parameters<typeof findLimitViolation>[0];
                assert.match(findLimitViolation(longKey)?.message ?? '', /A field name is 4097 characters long/);
                const relationships = Array.from({ length: MAX_RELATIONSHIPS + 1 }, () => ({ type: 'relationship', from: 'a', to: 'b', label: '' }));
                const hidden = { ...future, extension: { relationships } } as unknown as Parameters<typeof findLimitViolation>[0];
                assert.match(findLimitViolation(hidden)?.message ?? '', /5001 relationships/);
                // Only items of arrays are counted: a node kind on any other object is not an element.
                const elements = Array.from({ length: MAX_ELEMENTS }, (_, i) => ({ type: 'element', id: `e${i}`, label: '', elementType: 'System', tags: [] }));
                const loose = { ...future, elements, extension: { one: { type: 'element' }, two: { type: 'relationship' } } } as unknown as Parameters<typeof findLimitViolation>[0];
                assert.strictEqual(findLimitViolation(loose), undefined, 'an object outside an array was counted');
            });
            it('holds a string to the bound under every key, position keys included', () => {
                // A position object is walked like any other: no key is exempt.
                for (const key of ['loc', 'sourceRange', 'shapeLoc', 'shapeRange', 'sourceId']) {
                    const parsed = parser.parse('graph TB\nSystem(a, "A", "d")') as unknown as { elements: Array<Record<string, unknown>> };
                    // sourceId is composed by the parser from two ids and a counter, so its bound is two text bounds and 64 more.
                    parsed.elements[0][key] = key === 'sourceId' ? 'x'.repeat(2 * MAX_TEXT_LENGTH + 65) : { start: { line: 2, column: 1, note: long } };
                    const violation = findLimitViolation(parsed as unknown as Parameters<typeof findLimitViolation>[0]);
                    assert.match(violation?.message ?? `${key} was not checked`, key === 'sourceId' ? /A composed identifier is 8257 characters long; C4X allows at most 8256/ : /4097 characters long/, key);
                }
            });

            it('ids inside every limit are never refused for the identifier the parser composes from them (sourceId)', () => {
                const id = (c: string, n: number) => c.repeat(n);
                const related = (n: number) => `graph TB\nSystem(${id('a', n)}, "A", "d")\nSystem(${id('b', n)}, "B", "d")\n${id('a', n)} -->|uses| ${id('b', n)}\n${id('a', n)} -->|again| ${id('b', n)}`;
                // Two ids at the text bound: the relationship's sourceId is about 8,200 characters and is not reported.
                assert.strictEqual(findLimitViolation(parser.parse(related(MAX_TEXT_LENGTH))), undefined);
                assert.strictEqual(findLimitViolation(parser.parse(related(2045))), undefined, 'two 2,045-character ids were refused');
                // Each id the source writes is still held to the text bound.
                assert.match(findLimitViolation(parser.parse(related(MAX_TEXT_LENGTH + 1)))?.message ?? 'accepted', /An identifier is 4097 characters long/);
                const boundary = (n: number) => `%%{ c4: container }%%\ngraph TB\nSystem_Boundary(${id('b', n)}, "B") {\nContainer(c, "C", "T", "D")\n}`;
                assert.strictEqual(findLimitViolation(parser.parse(boundary(MAX_TEXT_LENGTH))), undefined);
                assert.match(findLimitViolation(parser.parse(boundary(MAX_TEXT_LENGTH + 1)))?.message ?? 'accepted', /An identifier is 4097 characters long/);
                assert.strictEqual(findLimitViolation(parser.parse(`graph TB\nSystem(${id('e', MAX_TEXT_LENGTH)}, "A", "d")`)), undefined, 'an element id at the bound was refused for element:<id>');
            });
        });

        describe('source-keyed fields are text, never structure', () => {
            // Every place the grammar lets the source choose a key or the number of entries.
            const containers: ReadonlyArray<[string, (attrs: string) => string]> = [
                ['element call ($key on System)', attrs => `graph TB\nSystem(a, "A", "d", ${attrs})`],
                ['container call ($key on Container)', attrs => `%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "T", "D", ${attrs})`],
                ['bracket element (a[...] $key)', attrs => `graph TB\na[A<br/>Container] ${attrs}`],
                ['deployment node (Node $key)', attrs => `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T", ${attrs}) {\n  Container(a, "A", "T", "D")\n}`],
                ['subgraph ($key on subgraph)', attrs => `graph TB\nsubgraph g ${attrs} {\nA[a<br/>Container]\n}`],
                ['elementStyle pair', attrs => `graph TB\nelementStyle Tag ${attrs}\nSystem(a, "A", "d")`],
            ];
            const positionKeys = ['loc', 'sourceRange', 'shapeLoc', 'shapeRange', 'sourceId', 'type', 'children', 'internalRelationships'];

            for (const [where, source] of containers) {
                it(`${where}: $loc, $sourceRange, $shapeLoc, $shapeRange, $sourceId and other structural names are checked as text`, () => {
                    for (const key of positionKeys) {
                        assert.strictEqual(findLimitViolation(parser.parse(source(`$${key}="${fits}"`))), undefined, `$${key} at the bound was refused`);
                        const violation = findLimitViolation(parser.parse(source(`$${key}="${long}"`)));
                        assert.ok(violation, `$${key} over the bound was accepted in ${where}`);
                        assert.match(violation.message, new RegExp(`The \\$${key} value is 4097 characters long`));
                        assert.ok(violation.line > 1, `${where} $${key}: located at ${violation.line}:${violation.column}`);
                    }
                });

                it(`${where}: an attribute name of ${MAX_TEXT_LENGTH} characters passes; one more is refused`, () => {
                    assert.strictEqual(findLimitViolation(parser.parse(source(`$k${'x'.repeat(MAX_TEXT_LENGTH - 1)}="v"`))), undefined);
                    const violation = findLimitViolation(parser.parse(source(`$k${'x'.repeat(MAX_TEXT_LENGTH)}="v"`)));
                    assert.match(violation?.message ?? 'accepted', /An attribute name is 4097 characters long/);
                });

                // The bound is on pairs as written: distinct keys, repeats of one key, and a mix of both
                // (with the keys the grammar lifts out of the map, such as $tags and $sprite) all count.
                const shapes: ReadonlyArray<[string, (n: number) => string]> = where === 'elementStyle pair'
                    ? [
                        ['all distinct', n => Array.from({ length: n }, (_, i) => `$k${i}="v"`).join(', ')],
                        ['all repeats of one key', n => Array.from({ length: n }, () => '$background="#ffffff"').join(', ')],
                        ['mixed', n => Array.from({ length: n }, (_, i) => (i % 2 === 0 ? `$k${i}="v"` : '$k0="w"')).join(', ')],
                    ]
                    : [
                        ['all distinct', n => Array.from({ length: n }, (_, i) => `$k${i}="v"`).join(', ')],
                        ['all repeats of one key', n => Array.from({ length: n }, () => '$note="v"').join(', ')],
                        ['mixed, with lifted keys', n => ['$tags="t"', '$sprite="s"'].concat(Array.from({ length: n - 2 }, (_, i) => (i % 2 === 0 ? `$k${i}="v"` : '$k0="w"'))).join(', ')],
                    ];
                for (const [shape, attrs] of shapes) {
                    it(`${where}: ${MAX_ENTRIES} pairs pass and ${MAX_ENTRIES + 1} are refused (${shape})`, () => {
                        assert.strictEqual(findLimitViolation(parser.parse(source(attrs(MAX_ENTRIES)))), undefined);
                        const violation = findLimitViolation(parser.parse(source(attrs(MAX_ENTRIES + 1))));
                        assert.match(violation?.message ?? 'accepted', /has 257 entries; C4X tools accept at most 256/);
                        assert.ok((violation?.line ?? 0) > 1, `${where} (${shape}): located at ${violation?.line}:${violation?.column}`);
                        assert.ok(lintC4xSource(source(attrs(MAX_ENTRIES + 1)), OPTIONS).some(f => f.ruleId === LIMIT_RULE_ID));
                    });
                }
            }

            const tagForms: ReadonlyArray<[string, (n: number) => string]> = [
                ['$tags on an element call', n => `graph TB\nSystem(a, "A", "d", $tags="${Array.from({ length: n }, (_, i) => `t${i}`).join(',')}")`],
                ['$tags with repeated and empty tags', n => `graph TB\nSystem(a, "A", "d", $tags="${Array.from({ length: n }, (_, i) => (i % 3 === 0 ? '' : 't')).join(',')}")`],
                ['$tags on a deployment node', n => `%%{ c4: deployment }%%\ngraph TB\nNode(n, "N", "T", $tags="${Array.from({ length: n }, (_, i) => `t${i}`).join(',')}") {\n  Container(a, "A", "T", "D")\n}`],
                ['tag lines in a bracket element', n => `graph TB\na[A<br/>Container${Array.from({ length: n }, (_, i) => `<br/>t${i}`).join('')}]`],
            ];
            for (const [form, tags] of tagForms) {
                it(`a tag list holds at most ${MAX_ENTRIES} tags (${form})`, () => {
                    assert.strictEqual(findLimitViolation(parser.parse(tags(MAX_ENTRIES))), undefined);
                    assert.match(findLimitViolation(parser.parse(tags(MAX_ENTRIES + 1)))?.message ?? 'accepted', /A tag list has 257 entries/);
                });
            }

            it('a handcrafted parse result without the grammar\'s attribute count is still checked by its lists', () => {
                const bare = {
                    viewType: 'container' as const, direction: 'TB' as const, hasExplicitDirection: true, relationships: [],
                    elements: [{ type: 'element' as const, id: 'a', label: 'A', elementType: 'System', tags: Array.from({ length: MAX_ENTRIES + 1 }, () => 't') }],
                };
                assert.match(findLimitViolation(bare)?.message ?? 'accepted', /A tag list has 257 entries/);
            });

            for (const kind of ['element', 'boundary']) {
                it(`$type="${kind}" on every element does not change the element count`, () => {
                    const marked = (n: number) => ['%%{ c4: container }%%', 'graph TB']
                        .concat(Array.from({ length: n }, (_, i) => `Container(c${i}, "C", "T", "D", $type="${kind}", $children="x")`)).join('\n');
                    assert.strictEqual(findLimitViolation(parser.parse(marked(MAX_ELEMENTS))), undefined, `${MAX_ELEMENTS} elements marked $type="${kind}" were refused`);
                    assert.match(findLimitViolation(parser.parse(marked(MAX_ELEMENTS + 1)))?.message ?? 'accepted', /The diagram has 2001 elements and boundaries/);
                });
            }

            it('$type="relationship" on elements does not change the relationship count', () => {
                const marked = (relationships: number) => ['%%{ c4: container }%%', 'graph TB']
                    .concat(Array.from({ length: MAX_ELEMENTS }, (_, i) => `Container(c${i}, "C", "T", "D", $type="relationship")`))
                    .concat(Array.from({ length: relationships }, () => 'c0 -->|uses| c1')).join('\n');
                // 2,000 marked elements and 3,001 relationships: a walk that read $type would count 5,001.
                assert.strictEqual(findLimitViolation(parser.parse(marked(MAX_RELATIONSHIPS - MAX_ELEMENTS + 1))), undefined);
                assert.strictEqual(findLimitViolation(parser.parse(marked(MAX_RELATIONSHIPS))), undefined);
                assert.match(findLimitViolation(parser.parse(marked(MAX_RELATIONSHIPS + 1)))?.message ?? 'accepted', /The diagram has 5001 relationships/);
            });

            it('$type in a map does not rename a finding', () => {
                const violation = findLimitViolation(parser.parse(`graph TB\nSystem(a, "A", "d", $type="relationship", $label="${long}")`));
                assert.match(violation?.message ?? 'accepted', /The \$label value is 4097 characters long/);
            });

            it('$__proto__, $constructor and other Object.prototype names are ordinary attribute names', () => {
                for (const key of ['__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf']) {
                    const parsed = parser.parse(`graph TB\nSystem(a, "A", "d", $${key}="${long}")`);
                    const violation = findLimitViolation(parsed);
                    if (key === '__proto__') {
                        // The grammar's map drops it (a string assigned to __proto__ is ignored), so nothing reaches the model.
                        assert.strictEqual(violation, undefined);
                        assert.strictEqual(Object.getPrototypeOf(parsed.elements[0].metadata ?? {}), Object.prototype);
                        assert.ok(!JSON.stringify(parsed).includes(long), 'a dropped $__proto__ value reached the parse result');
                    } else {
                        assert.match(violation?.message ?? `$${key} accepted`, new RegExp(`The \\$${key} value is 4097`));
                    }
                }
            });
        });

        it('lists every bound once, with the values the tools use', () => {
            const table = inputLimitTable();
            assert.deepStrictEqual(table.map(row => row.name), [...new Set(table.map(row => row.name))]);
            const byName = Object.fromEntries(table.map(row => [row.name, row.value]));
            assert.strictEqual(byName.mcpSourceBytes, MAX_MCP_SOURCE_BYTES);
            assert.strictEqual(byName.nestingDepth, MAX_NESTING_DEPTH);
            assert.strictEqual(byName.elements, MAX_ELEMENTS);
            assert.strictEqual(byName.relationships, MAX_RELATIONSHIPS);
            assert.strictEqual(byName.textLength, MAX_TEXT_LENGTH);
            // The render bounds (#353), each tighter than the parser-side bound it narrows.
            assert.strictEqual(byName.renderElements, MAX_RENDER_ELEMENTS);
            assert.strictEqual(byName.renderRelationships, MAX_RENDER_RELATIONSHIPS);
            assert.strictEqual(byName.renderSvgBytes, MAX_RENDER_SVG_BYTES);
            assert.strictEqual(byName.renderTimeMs, RENDER_TIME_BUDGET_MS);
            assert.ok(MAX_RENDER_ELEMENTS < MAX_ELEMENTS && MAX_RENDER_RELATIONSHIPS < MAX_RELATIONSHIPS);
        });
    });
    // The time bound on adversarial input runs per parser in parser-timing.test.ts, under a watchdog.
});
