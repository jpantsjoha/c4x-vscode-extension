/**
 * Parity with origin/main (#242), final policy:
 *  A. Valid DSL that renders a non-empty model on main renders at least as completely
 *     here, with the same first view: type, every element with the same name,
 *     description, technology and tags, and every relationship with the same
 *     endpoints, label and technology.
 *  B. Invalid DSL never gives a silent empty diagram or a crash: it renders a
 *     non-empty model or raises a located StructurizrParserError.
 * MAIN records the first view origin/main rendered, measured at SHA
 * f9d3ec280815bdbd3078192f0db25ac2f5bde713 (the structurizr parser is unchanged
 * since ace54f3), or null where main rendered no view or only views without elements.
 */
import * as assert from 'assert';
import { parseStructurizrDSL } from '../../parser/structurizr/index';
import { StructurizrParserError } from '../../parser/structurizr/ast';
import { PARITY_CASES } from './structurizr-parity-cases';

interface MainEl { id: string; label: string; description?: string; technology?: string; tags?: string[] }
interface MainRel { from: string; to: string; label: string; technology?: string }
interface MainFirst { views: number; first: { type: string; elements: MainEl[]; relationships: MainRel[] } }
const MAIN: Record<string, MainFirst | null> = {
    "baseline block form": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S", "description": "x", "technology": "t"}, {"id": "u", "label": "U", "description": "d"}], "relationships": []}},
    "unknown bare identifier in model": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}, {"id": "u", "label": "U"}], "relationships": []}},
    "unknown bare identifier in element body": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "unassigned custom element beside supported": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}, {"id": "u", "label": "U"}], "relationships": []}},
    "positional relationship tags": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}, {"id": "u", "label": "U"}], "relationships": [{"from": "u", "to": "s", "label": "Uses", "technology": "HTTPS"}]}},
    "theme then view on one line": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "directive then model on one line": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "url keyword": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "body description technology tags": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "this -> x inside body": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "implicit-source -> x inside body": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S", "description": "calls"}, {"id": "t", "label": "T"}], "relationships": []}},
    "group": null,
    "enterprise": null,
    "perspectives": null,
    "properties": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "deployment blocks": null,
    "dynamic view before context view": null,
    "deployment view before context view": null,
    "systemLandscape view before context view": null,
    "filtered view before context view": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "nested styles between views": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "comments": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}, {"id": "u", "label": "U"}], "relationships": []}},
    "multi-line description text": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S", "description": "line one\nline two"}], "relationships": []}},
    "positional person/system with body": null,
    "surplus strings without body": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}, {"id": "u", "label": "U"}], "relationships": []}},
    "relationship with body": null,
    "group inside element body": null,
    "configuration block": null,
    "styles after views": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "views inside deploymentEnvironment (balanced)": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "views inside !ref block": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "views inside view animation block": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "views inside element declared outside model": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "views before model with surplus strings and body": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "empty views block then non-empty in !ref": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
    "two nested views blocks, last wins on main": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "t", "label": "T"}], "relationships": []}},
    "three nested views blocks with empty middle": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "t", "label": "T"}], "relationships": []}},
    "top-level views then nested views": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "t", "label": "T"}], "relationships": []}},
    "nested views then top-level views": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "t", "label": "T"}], "relationships": []}},
    "premature closure with empty views then trailing views": null,
    "unknown declaration only, view of undefined scope": null,
    "no views block": null,
    "empty model": null,
    "view with some undefined includes keeps rendering": {"views": 1, "first": {"type": "system-context", "elements": [{"id": "s", "label": "S"}], "relationships": []}},
};

/**
 * Where main's value is wrong, or the input is invalid, the value the candidate must give
 * instead (asserted exactly, including "no value").
 */
const CORRECTED: Record<string, Record<string, Partial<MainEl>>> = {
    // Main bug: the string of the relationship `-> t "calls"` in an element body was
    // taken as that element's description. The relationship string belongs to the relationship.
    'implicit-source -> x inside body': { s: { description: undefined } },
};

interface CandView {
    type: string;
    elements: Array<{ id: string; label: string; description?: string; technology?: string; tags?: string[] }>;
    relationships: Array<{ from: string; to: string; label: string; technology?: string }>;
}

const nonEmpty = (v: unknown): boolean => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0) && v !== '';

/** Returns one message per way `cand` fails to reproduce main's first view. */
function compareFirstView(name: string, main: MainFirst['first'], cand: CandView): string[] {
    const failures: string[] = [];
    if (cand.type !== main.type) { failures.push(`${name}: view type ${cand.type} != ${main.type}`); }
    for (const me of main.elements) {
        const ce = cand.elements.find(e => e.id === me.id);
        if (!ce) { failures.push(`${name}: element ${me.id} missing`); continue; }
        const corrected = CORRECTED[name]?.[me.id];
        if (ce.label !== me.label) { failures.push(`${name}: ${me.id} label ${ce.label} != ${me.label}`); }
        for (const f of ['description', 'technology', 'tags'] as const) {
            const overridden = corrected !== undefined && f in corrected;
            const expected = overridden ? corrected[f] : me[f];
            if ((overridden || nonEmpty(expected)) && JSON.stringify(ce[f]) !== JSON.stringify(expected)) {
                failures.push(`${name}: ${me.id} ${f} ${JSON.stringify(ce[f])} != ${JSON.stringify(expected)}`);
            }
        }
    }
    if (cand.relationships.length < main.relationships.length) {
        failures.push(`${name}: relationships ${cand.relationships.length} < main ${main.relationships.length}`);
    }
    for (const mr of main.relationships) {
        const found = cand.relationships.some(r => r.from === mr.from && r.to === mr.to && r.label === mr.label &&
            (!nonEmpty(mr.technology) || r.technology === mr.technology));
        if (!found) { failures.push(`${name}: relationship ${mr.from}->${mr.to} "${mr.label}" missing or changed`); }
    }
    return failures;
}

/**
 * Several `views` blocks is invalid Structurizr. Main showed the last block's views;
 * the candidate lists every block's views in source order, so main's first view is
 * present but not first. Known, accepted difference on invalid input (policy B).
 */
const MULTI_BLOCK = new Set([
    'two nested views blocks, last wins on main',
    'three nested views blocks with empty middle',
    'top-level views then nested views',
]);

function candidateViews(src: string): CandView[] {
    return parseStructurizrDSL(src).views.map(v => ({
        type: v.type,
        elements: v.elements.map(e => ({ id: e.id, label: e.label, description: e.description, technology: e.technology, tags: e.tags })),
        relationships: v.relationships.map(r => ({ from: r.from, to: r.to, label: r.label, technology: r.technology })),
    }));
}

describe('Structurizr parity with origin/main (#242)', () => {
    for (const c of PARITY_CASES) {
        it(c.name, () => {
            const main = MAIN[c.name];
            assert.notStrictEqual(main, undefined, 'case has a recorded main result');
            let views: CandView[];
            try {
                views = candidateViews(c.src);
            } catch (e) {
                // Allowed only for input main did not render (policy B), and only as a located parser error.
                assert.strictEqual(main, null, `${c.name}: main rendered this valid input, the candidate must too: ${(e as Error).message}`);
                assert.ok(e instanceof StructurizrParserError, 'raw non-parser exception');
                assert.ok(e.location && e.location.line >= 1, 'error is located');
                return;
            }
            assert.ok(views.length >= 1 && views.some(v => v.elements.length > 0), 'renders a non-empty model');
            if (!main) { return; }
            assert.ok(views.length >= main.views, `${c.name}: views ${views.length} < main ${main.views}`);
            const pool = MULTI_BLOCK.has(c.name) ? views : [views[0]];
            const results = pool.map(v => compareFirstView(c.name, main.first, v));
            assert.ok(results.some(r => r.length === 0), results[0].join('\n'));
        });
    }
});

describe('Structurizr parity: the comparison itself bites (negative control)', () => {
    const valid = PARITY_CASES.filter(c => MAIN[c.name] && !MULTI_BLOCK.has(c.name));
    const first = (name: string): CandView => candidateViews(PARITY_CASES.find(c => c.name === name)!.src)[0];

    it('passes on the real candidate result for every valid case', () => {
        for (const c of valid) { assert.deepStrictEqual(compareFirstView(c.name, MAIN[c.name]!.first, first(c.name)), []); }
    });
    it('reports failures when every relationship is removed', () => {
        const withRels = valid.filter(c => MAIN[c.name]!.first.relationships.length > 0);
        assert.ok(withRels.length >= 1);
        for (const c of withRels) {
            const bad = { ...first(c.name), relationships: [] };
            assert.ok(compareFirstView(c.name, MAIN[c.name]!.first, bad).length > 0, c.name);
        }
    });
    it('reports failures when element labels are replaced', () => {
        for (const c of valid) {
            const v = first(c.name);
            const bad = { ...v, elements: v.elements.map(e => ({ ...e, label: 'WRONG' })) };
            assert.ok(compareFirstView(c.name, MAIN[c.name]!.first, bad).length > 0, c.name);
        }
    });
    it('reports failures when descriptions, technologies and tags are replaced', () => {
        const withFields = valid.filter(c => MAIN[c.name]!.first.elements.some(e => nonEmpty(e.description) || nonEmpty(e.technology) || nonEmpty(e.tags)));
        assert.ok(withFields.length >= 1);
        for (const c of withFields) {
            const v = first(c.name);
            const bad = { ...v, elements: v.elements.map(e => ({ ...e, description: 'WRONG', technology: 'WRONG', tags: ['WRONG'] })) };
            assert.ok(compareFirstView(c.name, MAIN[c.name]!.first, bad).length > 0, c.name);
        }
    });
    it('reports failures when a relationship endpoint is changed', () => {
        const c = valid.find(x => MAIN[x.name]!.first.relationships.length > 0)!;
        const v = first(c.name);
        const bad = { ...v, relationships: v.relationships.map(r => ({ ...r, to: 'WRONG' })) };
        assert.ok(compareFirstView(c.name, MAIN[c.name]!.first, bad).length > 0);
    });
});

describe('Structurizr: renders nothing -> located error naming the cause (#242)', () => {
    const msg = (name: string): string => {
        const c = PARITY_CASES.find(x => x.name === name)!;
        try { parseStructurizrDSL(c.src); } catch (e) {
            assert.ok(e instanceof StructurizrParserError);
            return e.message;
        }
        throw new Error('expected an error');
    };
    it('a section after an early-closed workspace is reported even when an empty views block came first', () => {
        assert.match(msg('premature closure with empty views then trailing views'), /after the workspace closing brace/);
    });
    it('a view of an undefined scope over an empty model names the missing element', () => {
        assert.match(msg('unknown declaration only, view of undefined scope'), /defines no elements/);
    });
    it('a workspace with no views block says views are missing', () => {
        assert.match(msg('no views block'), /No views found/);
    });
    it('an empty model says the model defines no elements', () => {
        assert.match(msg('empty model'), /defines no elements/);
    });
    it('a view of an undefined scope over a non-empty model names the scope and the view', () => {
        assert.throws(() => parseStructurizrDSL('workspace "W" {\n model { t = softwareSystem "T" }\n views {\n systemContext s "C" { include s }\n }\n}'),
            (e: unknown) => e instanceof StructurizrParserError && /View "C" refers to "s", which is not defined/.test(e.message) && e.location?.line === 4);
    });
    it('a view with some undefined references keeps rendering', () => {
        const m = parseStructurizrDSL('workspace "W" { model { s = softwareSystem "S" } views { systemContext s "C" { include s nope } } }');
        assert.strictEqual(m.views.length, 1);
        assert.strictEqual(m.views[0].elements.length, 1);
    });
});
