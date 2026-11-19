/**
 * #242 round 4: several recoverable `views` blocks, and deep nesting.
 * Origin/main kept the last workspace-level views block it met; the candidate
 * collects every block's views in source order, so main's result is always a subset.
 */
import * as assert from 'assert';
import { parseStructurizrDSL } from '../../parser/structurizr/index';
import { StructurizrParserError } from '../../parser/structurizr/ast';
import { C4Model } from '../../model/C4Model';

const keyed = (m: C4Model) => m.views.map(v => v.elements.map(e => e.id).sort().join(','));
const two = `model { s = softwareSystem "S" t = softwareSystem "T" }`;

describe('Structurizr several views blocks (#242 round 4)', () => {
    it('an empty block before a non-empty one still yields the non-empty view', () => {
        const m = parseStructurizrDSL(`workspace "W" { model { s = softwareSystem "S" } !ref s { views { } views { systemContext s "Last" { include * } } } }`);
        assert.strictEqual(m.views.length, 1);
        assert.deepStrictEqual(keyed(m), ['s']);
    });
    it('main kept the last block (t); the candidate keeps it and the first one', () => {
        const m = parseStructurizrDSL(`workspace "W" { ${two} !ref s { views { systemContext s "First" { include s } } views { systemContext t "Last" { include t } } } }`);
        const ids = keyed(m);
        assert.ok(ids.includes('t'), 'the view main rendered (T) is present');
        assert.ok(ids.includes('s'));
        assert.strictEqual(m.views.length, 2);
    });
    it('three blocks, one empty in the middle', () => {
        const m = parseStructurizrDSL(`workspace "W" { ${two} !ref s { views { systemContext s "A" { include s } } views { } views { systemContext t "C" { include t } } } }`);
        assert.deepStrictEqual(keyed(m).sort(), ['s', 't']);
    });
    it('top-level views plus a later nested block', () => {
        const m = parseStructurizrDSL(`workspace "W" { ${two} views { systemContext s "Top" { include s } } !ref t { views { systemContext t "Nested" { include t } } } }`);
        assert.deepStrictEqual(keyed(m).sort(), ['s', 't']);
    });
    it('a nested block before top-level views', () => {
        const m = parseStructurizrDSL(`workspace "W" { ${two} !ref t { views { systemContext t "Nested" { include t } } } views { systemContext s "Top" { include s } } }`);
        assert.deepStrictEqual(keyed(m).sort(), ['s', 't']);
    });
});

describe('Structurizr deep nesting (#242 round 4)', () => {
    const V = 'views { systemContext s "C" { include * } }';
    const rep = (a: string, b: string, n: number) => a.repeat(n) + b.repeat(n);
    const docs: Record<string, (n: number) => string> = {
        'views inside animation': n => `workspace "W" { model { s = softwareSystem "S" } views { systemContext s "C" { include * animation { ${'views { bogus { '.repeat(n)}${'} } '.repeat(n)} } } } }`,
        'views inside views': n => `workspace "W" { model { s = softwareSystem "S" } ${V} !ref s { ${rep('views { x { ', '} } ', n)} } }`,
        'groups in model': n => `workspace "W" { model { s = softwareSystem "S" ${rep('group "g" { ', '} ', n)} } ${V} }`,
        'groups in element body': n => `workspace "W" { model { s = softwareSystem "S" { ${rep('group "g" { ', '} ', n)} } } ${V} }`,
        'skipped blocks': n => `workspace "W" { model { s = softwareSystem "S" ${rep('deploymentNode "d" { ', '} ', n)} } ${V} }`,
        'skipped blocks in element body': n => `workspace "W" { model { s = softwareSystem "S" { ${rep('perspectives { ', '} ', n)} } } ${V} }`,
        'skipped blocks at workspace level': n => `workspace "W" { model { s = softwareSystem "S" } ${rep('!ref s { ', '} ', n)} ${V} }`,
    };
    for (const [name, make] of Object.entries(docs)) {
        for (const n of [3000, 20000]) {
            it(`${name} at depth ${n} renders the view`, () => {
                assert.strictEqual(parseStructurizrDSL(make(n)).views.length >= 1, true);
            });
        }
    }
    // Elements recurse in the adapter, layout and renderer after the parse, so
    // since #362 they share C4X's 32-level bound and fail with a located error;
    // groups and skipped blocks above are parsed flat and stay unbounded.
    it('elements nested 32 deep render', () => {
        const src = `workspace "W" { model { s = softwareSystem "S" { ${'container "c" { '.repeat(31)}${'} '.repeat(31)} } } ${V} }`;
        assert.strictEqual(parseStructurizrDSL(src).views.length, 1);
    });
    for (const depth of [33, 3000, 20000]) {
        it(`elements nested ${depth} deep raise a located StructurizrParserError, not RangeError`, () => {
            const src = `workspace "W" { model { s = softwareSystem "S" { ${'container "c" { '.repeat(depth)}${'} '.repeat(depth)} } } ${V} }`;
            assert.throws(() => parseStructurizrDSL(src), (e: unknown) => e instanceof StructurizrParserError && /Nesting is deeper than 32 levels.* at 1:\d+$/.test(e.message));
        });
    }
});
