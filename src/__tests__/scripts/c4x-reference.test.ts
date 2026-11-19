/**
 * The generated C4X reference (#354, AR-F1, AR-N2).
 *
 * The drift tests regenerate in memory and compare with the committed files, so
 * a change to the grammar, the model builder, the style resolver, the lint
 * catalogue or the annotations fails here until `pnpm run generate:reference`
 * is run. The example tests send every example through the real parser,
 * builder and linter.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    REFERENCE_JSON_PATH,
    REFERENCE_MD_PATH,
    REFERENCE_SCHEMA_PATH,
    buildReference,
    generateAll,
    renderMarkdown,
    repoRoot,
    requireSameKeys,
    serialise,
    type Json,
} from '../../../scripts/c4x-reference/generate';
import * as notes from '../../../scripts/c4x-reference/annotations';
import { EXAMPLES } from '../../../scripts/c4x-reference/annotations';
import * as elementStyle from '../../render/elementStyle';
import { C4_VIEW_TYPES } from '../../parser/types';
import { REFERENCE_SCHEMA } from '../../../scripts/c4x-reference/schema';
import { ELEMENT_TYPE_MAP, REL_TYPE_MAP, c4ModelBuilder } from '../../model/C4ModelBuilder';
import { c4xParser } from '../../parser/C4XParser';
import { lintC4xSource } from '../../cli/lintSource';
import { LINT_RULES, normalizeLintOptions } from '../../model/lint';

// The reference is untyped JSON read by property path; a closed type would repeat the schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Obj = { [key: string]: any };

function readCommitted(relative: string): string {
    // Fixed repository-relative paths exported by the generator.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.readFileSync(path.join(repoRoot(), relative), 'utf8');
}

/** A small validator for the schema subset the reference schema uses. Returns the problems found. */
function validate(value: unknown, schema: Obj, where = '$'): string[] {
    const problems: string[] = [];
    if (schema.const !== undefined && value !== schema.const) { problems.push(`${where}: expected ${JSON.stringify(schema.const)}`); }
    if (schema.enum && !schema.enum.includes(value)) { problems.push(`${where}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`); }
    switch (schema.type) {
        case 'string':
            if (typeof value !== 'string') { return [`${where}: expected a string`]; }
            if (schema.pattern && !new RegExp(schema.pattern).test(value)) { problems.push(`${where}: "${value}" does not match ${schema.pattern}`); }
            break;
        case 'boolean':
            if (typeof value !== 'boolean') { return [`${where}: expected a boolean`]; }
            break;
        case 'integer':
        case 'number': {
            if (typeof value !== 'number' || (schema.type === 'integer' && !Number.isInteger(value))) { return [`${where}: expected ${schema.type}`]; }
            if (schema.minimum !== undefined && value < schema.minimum) { problems.push(`${where}: below ${schema.minimum}`); }
            if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) { problems.push(`${where}: not above ${schema.exclusiveMinimum}`); }
            break;
        }
        case 'array':
            if (!Array.isArray(value)) { return [`${where}: expected an array`]; }
            value.forEach((item, index) => problems.push(...validate(item, schema.items, `${where}[${index}]`)));
            break;
        case 'object': {
            if (typeof value !== 'object' || value === null || Array.isArray(value)) { return [`${where}: expected an object`]; }
            const record = value as Obj;
            for (const key of schema.required ?? []) {
                if (!(key in record)) { problems.push(`${where}: missing "${key}"`); }
            }
            for (const key of Object.keys(record)) {
                if (!(key in schema.properties)) {
                    if (schema.additionalProperties === false) { problems.push(`${where}: unexpected "${key}"`); }
                    continue;
                }
                problems.push(...validate(record[key], schema.properties[key], `${where}.${key}`));
            }
            break;
        }
        default:
            break;
    }
    return problems;
}

function assertSortedKeys(value: unknown, where = '$'): void {
    if (Array.isArray(value)) {
        value.forEach((item, index) => assertSortedKeys(item, `${where}[${index}]`));
    } else if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        assert.deepStrictEqual(keys, [...keys].sort(), `keys of ${where} are not sorted`);
        for (const key of keys) { assertSortedKeys((value as Obj)[key], `${where}.${key}`); }
    }
}

describe('C4X reference (#354)', function () {
    this.timeout(60000);
    // Generated once, in a hook, so a generator failure (annotations and code disagreeing)
    // is reported as a failing test with the generator's own message, not a crash at load.
    let fresh: { [relative: string]: string };
    let reference: Obj;
    before(() => {
        fresh = generateAll();
        reference = JSON.parse(fresh[REFERENCE_JSON_PATH]) as Obj;
    });

    describe('drift', () => {
        for (const relative of [REFERENCE_JSON_PATH, REFERENCE_MD_PATH, REFERENCE_SCHEMA_PATH]) {
            it(`${relative} equals a fresh run (run pnpm run generate:reference when this fails)`, () => {
                assert.strictEqual(readCommitted(relative), fresh[relative]);
            });
        }

        it('lists every grammar rule, lint rule, style key and diagnostic, so a change to one changes the file', () => {
            const grammar = readCommitted('src/parser/c4x.pegjs');
            const ruleNames = [...grammar.matchAll(/^([A-Za-z_]+)\s*\n?\s*=/gm)].map(match => match[1]);
            assert.deepStrictEqual(reference.grammar.rules.map((r: Obj) => r.name), ruleNames);
            assert.deepStrictEqual(reference.lint.rules.map((r: Obj) => r.id), LINT_RULES.map(r => r.id));
            assert.strictEqual(reference.styles.keys.length, 8);
            assert.ok(reference.styles.diagnostics.length >= 9);
        });
    });

    describe('determinism', () => {
        it('two runs give identical bytes', () => {
            assert.deepStrictEqual(generateAll(), fresh);
        });

        it('sorts JSON keys, ends with one LF and uses no CR', () => {
            assertSortedKeys(reference);
            for (const text of Object.values(fresh)) {
                assert.ok(!text.includes('\r'), 'CR found');
                assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), 'must end with exactly one newline');
            }
        });

        it('holds no absolute path, user directory or timestamp', () => {
            for (const text of Object.values(fresh)) {
                assert.ok(!text.includes(repoRoot()), 'repository path found');
                assert.ok(!/\/Users\/|\/home\/|[A-Z]:\\\\/.test(text), 'absolute path found');
                assert.ok(!/\b20\d\d-\d\d-\d\d(?:T|\b)/.test(text), 'date or timestamp found');
            }
        });

        it('serialise sorts keys at every depth', () => {
            const text = serialise({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 3 } } as Json);
            assert.strictEqual(text, '{\n  "a": {\n    "c": 3,\n    "d": [\n      {\n        "y": 2,\n        "z": 1\n      }\n    ]\n  },\n  "b": 1\n}\n');
        });
    });

    describe('shape', () => {
        it('validates against the JSON Schema and carries schemaVersion 2', () => {
            assert.deepStrictEqual(validate(reference, REFERENCE_SCHEMA as Obj), []);
            assert.strictEqual(reference.schemaVersion, 2);
        });

        it('the validator rejects a missing field, an extra field and a wrong type', () => {
            const missing = { ...reference }; delete missing.lint;
            assert.ok(validate(missing, REFERENCE_SCHEMA as Obj).some(p => p.includes('missing "lint"')));
            assert.ok(validate({ ...reference, extra: 1 }, REFERENCE_SCHEMA as Obj).some(p => p.includes('unexpected "extra"')));
            assert.ok(validate({ ...reference, schemaVersion: 1 }, REFERENCE_SCHEMA as Obj).length > 0);
            const bad = JSON.parse(JSON.stringify(reference));
            bad.lint.rules[0].defaultSeverity = 'fatal';
            assert.ok(validate(bad, REFERENCE_SCHEMA as Obj).some(p => p.includes('lint.rules[0].defaultSeverity')));
        });

        it('keeps the schema file in step with the schema source', () => {
            assert.strictEqual(readCommitted(REFERENCE_SCHEMA_PATH), serialise(REFERENCE_SCHEMA as Json));
        });
    });

    describe('content read from the code', () => {
        it('puts technology before description, as the grammar does', () => {
            const signature = reference.elementCall.signature as Obj[];
            assert.deepStrictEqual(signature.map(s => s.name), ['id', 'label', 'technology', 'description', 'attributes']);
            assert.deepStrictEqual(signature.map(s => s.required), [true, true, false, false, false]);
        });

        it('lists the arrows, directions and boundary types the grammar and builder accept', () => {
            assert.deepStrictEqual(reference.relationships.arrows.map((a: Obj) => a.arrow), Object.keys(REL_TYPE_MAP));
            assert.deepStrictEqual(reference.document.graphLine.directions, ['TB', 'BT', 'LR', 'RL']);
            assert.deepStrictEqual(reference.boundaries.map((b: Obj) => b.type), ['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary']);
            assert.strictEqual(reference.document.comment.marker, '%%');
        });

        it('lists every spelling the builder accepts, each under its model type', () => {
            const listed = (reference.elementKinds as Obj[]).flatMap(kind => kind.spellings.map((s: Obj) => [s.name.toLowerCase(), kind.kind]));
            assert.deepStrictEqual(listed.sort(), Object.entries(ELEMENT_TYPE_MAP).sort());
        });

        it('says every lint rule defaults to info', () => {
            assert.strictEqual(reference.lint.defaultSeverity, 'info');
            assert.ok(reference.lint.rules.every((r: Obj) => r.defaultSeverity === 'info'));
        });

        it('records the text limit as current behaviour with a pointer to #340', () => {
            assert.strictEqual(reference.textLimits.issue, '#340');
            assert.deepStrictEqual(reference.textLimits.safeForAnyKind, { description: 30, label: 23, technology: 28 });
            const container = (reference.textLimits.kinds as Obj[]).find(k => k.kind === 'Container')!;
            assert.strictEqual(container.maxCharacters.description, 33, 'matches the 33 characters the #351 dogfood run reported');
        });

        it('records that relationship technology is drawn (#421) and describes C4X-L004', () => {
            assert.ok(!(reference.knownLimitations as Obj[]).some(l => l.issue === '#421'));
            assert.ok(reference.relationships.technologyNote.includes('#421'));
        });
    });

    describe('inventories come from runtime sources (review round 1)', () => {
        it('lists every view type in C4_VIEW_TYPES and fails when one has no annotation', () => {
            assert.deepStrictEqual(reference.viewTypes.map((v: Obj) => v.id), [...C4_VIEW_TYPES]);
            assert.throws(() => requireSameKeys('the view types', [...C4_VIEW_TYPES, 'new-view'], Object.keys(notes.VIEW_TYPES)),
                (error: Error) => error.message.includes('In the code but not annotated: new-view'));
        });

        it('takes style value sets and bounds from the resolver table', () => {
            const rules = elementStyle.styleValueRules();
            const keys = reference.styles.keys as Obj[];
            assert.deepStrictEqual(keys.map(k => k.key), Object.keys(rules));
            assert.deepStrictEqual(keys.find(k => k.key === 'border')!.values, ['solid', 'dashed', 'dotted']);
            assert.deepStrictEqual(keys.find(k => k.key === 'strokeWidth')!.range, { min: 1, max: 10 });
            assert.strictEqual(keys.find(k => k.key === 'legend')!.maxLength, 120);
        });

        it('fails generation when the resolver table gains a value or changes a bound', () => {
            const original = elementStyle.styleValueRules;
            try {
                (elementStyle as Obj).styleValueRules = () => ({ ...original(), border: { kind: 'set', values: ['solid', 'dashed', 'dotted', 'dashdot'] } });
                assert.throws(() => generateAll(), /dashdot/);
                (elementStyle as Obj).styleValueRules = () => ({ ...original(), strokeWidth: { kind: 'integer', min: 1, max: 12 } });
                assert.throws(() => generateAll(), /bounds 1 and 12/);
                (elementStyle as Obj).styleValueRules = () => ({ ...original(), legend: { kind: 'text', maxLength: 80 } });
                assert.throws(() => generateAll(), /80-character/);
            } finally {
                (elementStyle as Obj).styleValueRules = original;
            }
            assert.doesNotThrow(() => generateAll());
        });

        it('the resolver validates through the same table', () => {
            assert.strictEqual(elementStyle.parseStyleValue('border', 'dashed'), 'dashed');
            assert.strictEqual(elementStyle.parseStyleValue('border', 'dashdot'), undefined);
            assert.strictEqual(elementStyle.parseStyleValue('strokeWidth', '10'), 10);
            assert.strictEqual(elementStyle.parseStyleValue('strokeWidth', '11'), undefined);
            assert.strictEqual(elementStyle.parseStyleValue('legend', 'x'.repeat(120)), 'x'.repeat(120));
            assert.strictEqual(elementStyle.parseStyleValue('legend', 'x'.repeat(121)), undefined);
            assert.strictEqual(elementStyle.parseStyleValue('constructor', 'x'), undefined);
        });
    });

    describe('argument meaning is probed from the builder (review round 1)', () => {
        it('records the model field each argument lands in, for every kind', () => {
            const two = { 3: 'technology', 4: 'description' };
            for (const kind of reference.elementKinds as Obj[]) {
                const one = ['Person', 'SoftwareSystem'].includes(kind.kind) ? 'description' : 'technology';
                assert.deepStrictEqual(kind.argumentFields, { withOneText: { 3: one }, withTwoTexts: two }, kind.kind);
            }
            assert.strictEqual(reference.schemaVersion, 2);
            const fields = Object.fromEntries((reference.elementCall.signature as Obj[]).map(a => [a.name, a.field]));
            assert.deepStrictEqual(fields, { id: 'id', label: 'label', technology: 'technology', description: 'description', attributes: 'attributes' });
        });

        it('fails when an annotation claims a different landing than the builder gives', () => {
            const kinds = notes.ELEMENT_KINDS as unknown as Obj;
            const args = notes.ARGUMENT_FIELDS as unknown as Obj;
            try {
                kinds.Person.fields = { one: { 3: 'technology' }, two: { 3: 'technology', 4: 'description' } };
                assert.throws(() => generateAll(), /for Person, a call with one text after the label lands it in "description"/);
                kinds.Person.fields = { one: { 3: 'description' }, two: { 3: 'description', 4: 'technology' } };
                assert.throws(() => generateAll(), /for Person, argument 3 \(two texts after the label\) lands in "technology"/);
            } finally {
                kinds.Person.fields = { one: { 3: 'description' }, two: { 3: 'technology', 4: 'description' } };
            }
            try {
                args.technology = 'description';
                assert.throws(() => generateAll(), /the technology argument \(two texts after the label\) lands in "technology"/);
            } finally {
                args.technology = 'technology';
            }
            assert.doesNotThrow(() => generateAll());
        });

        it('derives the technology wrapper from the render and subtracts it from the capacity', () => {
            for (const kind of reference.textLimits.kinds as Obj[]) {
                assert.strictEqual(kind.technologyWrapper, 2, `${kind.kind}: the renderer draws [technology]`);
                const raw = Math.floor(kind.boxWidth / (kind.fontSize.technology * reference.textLimits.charWidthFactor));
                assert.strictEqual(kind.maxCharacters.technology, raw - 2);
            }
            assert.strictEqual(reference.textLimits.safeForAnyKind.technology, 28);
        });
    });

    describe('generator coverage checks', () => {
        it('names what is in the code but not annotated, and what is annotated but gone', () => {
            assert.throws(() => requireSameKeys('the widgets', ['a', 'b'], ['b', 'c']), (error: Error) =>
                error.message.includes('In the code but not annotated: a') && error.message.includes('Annotated but not in the code: c'));
            assert.doesNotThrow(() => requireSameKeys('the widgets', ['a', 'b'], ['b', 'a']));
        });
    });

    describe('examples', () => {
        const info = normalizeLintOptions(true, {});
        it('has one example for every view type', () => {
            const examples = reference.examples as Obj[];
            const views = examples.map(e => /c4:\s*([a-z-]+)/.exec(e.source)![1]);
            for (const view of reference.viewTypes.map((v: Obj) => v.id)) {
                assert.ok(views.includes(view), `no example for the ${view} view`);
            }
        });

        for (const example of EXAMPLES) {
            it(`${example.id} parses, builds and lints with no finding at info`, () => {
                const model = c4ModelBuilder.build(c4xParser.parse(example.source), 'test');
                assert.ok(model.views[0].elements.length > 0);
                // --max-severity info: any finding at all fails the example.
                assert.deepStrictEqual(lintC4xSource(example.source, info), []);
            });
        }

        it('names only element types the model builder accepts', () => {
            const accepted = new Set(Object.keys(ELEMENT_TYPE_MAP));
            const sources = [
                ...(reference.examples as Obj[]).map(e => e.source as string),
                ...(reference.lint.rules as Obj[]).map(r => r.exampleFinding.source as string),
            ];
            for (const source of sources) {
                for (const match of source.matchAll(/^\s*([A-Za-z_]+)\(/gm)) {
                    const name = match[1];
                    if (/_Boundary$/.test(name)) { continue; }
                    assert.ok(accepted.has(name.toLowerCase()), `${name} is not an element type the builder accepts`);
                }
            }
        });

        it('are the c4x fences of the Markdown file, in order', () => {
            const fences = [...readCommitted(REFERENCE_MD_PATH).matchAll(/```c4x\n([\s\S]*?)\n```/g)].map(m => m[1]);
            assert.deepStrictEqual(fences, (reference.examples as Obj[]).map(e => e.source));
        });

        it('trigger sources raise the rule they are filed under', () => {
            for (const rule of reference.lint.rules as Obj[]) {
                const findings = lintC4xSource(rule.exampleFinding.source, info);
                assert.ok(findings.some(f => f.ruleId === rule.id), `${rule.id} trigger does not raise it`);
            }
        });
    });

    describe('Markdown', () => {
        it('is rendered from the JSON alone', () => {
            assert.strictEqual(renderMarkdown(reference), fresh[REFERENCE_MD_PATH]);
        });

        it('reaches the same reference through buildReference', () => {
            assert.deepStrictEqual(JSON.parse(serialise(buildReference() as Json)), reference);
        });
    });

    describe('guidance documents (#422)', () => {
        const docsDir = path.join(repoRoot(), 'docs');
        // eslint-disable-next-line security/detect-non-literal-fs-filename
        const files = fs.readdirSync(docsDir).filter(name => name.endsWith('.md'));
        const ELEMENT_LINE = /^\s*(?:Person|Person_Ext|System|System_Ext|SystemDb|SystemDb_Ext|SoftwareSystem|Container|Container_Ext|ContainerDb|ContainerDb_Ext|Component|Component_Ext|ComponentDb|ComponentDb_Ext|Node)\(.*\)\s*(?:\/\/|#)/;

        it('use %% for comments on element lines, never // or #', () => {
            const offenders: string[] = [];
            for (const file of files) {
                const text = readCommitted(path.join('docs', file));
                let inFence = false;
                text.split('\n').forEach((line, index) => {
                    if (line.startsWith('```')) { inFence = !inFence; return; }
                    if (inFence && ELEMENT_LINE.test(line)) { offenders.push(`docs/${file}:${index + 1}`); }
                });
            }
            assert.deepStrictEqual(offenders, []);
        });

        it('show Component and Node with technology before description, as the reference does', () => {
            for (const file of ['C4X-GENERATION-GUIDELINES.md', 'C4X-ELEMENT-TYPES.md']) {
                const text = readCommitted(path.join('docs', file));
                assert.ok(!/Component\(id, "Name", "Description"\)/.test(text), `${file} shows the three-argument Component`);
                assert.ok(!/Node\(id, "Name", "Description"\)/.test(text), `${file} shows the three-argument Node`);
            }
        });

        it('say that every lint rule defaults to info and that --max-severity info shows findings as failures', () => {
            const text = readCommitted('docs/C4X-LINT-CLI.md');
            assert.ok(/every rule defaults to `info`/i.test(text));
            assert.ok(text.includes('--max-severity info'));
        });
    });
});
