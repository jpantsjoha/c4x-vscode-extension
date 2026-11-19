/**
 * Builds the C4X reference (#354) from the real sources.
 *
 * Read from code, never retyped: the Peggy grammar (statements, directions,
 * arrows, boundary types, call arguments, attribute keys, every rule), the
 * model builder (element spellings, their model types, the External and
 * Database flags, arrow types), the legality table (placement), the style
 * resolver (keys, shapes, value checks, implied tags), the style diagnostics,
 * the lint catalogue (ids, severities, levels, rationale, and a real message
 * from running each rule) and a real layout and render of one element of each
 * kind (text limits).
 *
 * Read from annotations.ts: what an argument means, what a statement is for,
 * and the examples. This module throws when the two disagree.
 *
 * The output is deterministic: sorted keys, no timestamps, no absolute paths,
 * LF line endings.
 */
import * as fs from 'fs';
import * as path from 'path';
import { c4xParser } from '../../src/parser/C4XParser';
import { c4ModelBuilder, ELEMENT_TYPE_MAP, REL_TYPE_MAP } from '../../src/model/C4ModelBuilder';
import {
    C4_ACCEPTED_ELEMENT_TYPES, C4_SCOPES, legalChildTypes, type C4Level,
} from '../../src/model/c4Legality';
import { CODE_MAPPABLE_TYPES } from '../../src/model/codePaths';
import { STYLE_DIAGNOSTIC_CODES } from '../../src/model/styleDiagnostics';
import { LINT_RULES, lintModel, normalizeLintOptions } from '../../src/model/lint';
import { lintC4xSource, MODEL_RULE_ID, SYNTAX_RULE_ID } from '../../src/cli/lintSource';
import { LIMIT_RULE_ID, inputLimitTable } from '../../src/cli/limits';
import {
    drawnShapeNames, isBundledSpriteId, orderedStyleTags, parseStyleValue, styleKeyNames, styleShapeNames, styleValueRules,
} from '../../src/render/elementStyle';
import { C4_VIEW_TYPES, type C4ViewType } from '../../src/parser/types';
import * as notes from './annotations';
import { REFERENCE_SCHEMA } from './schema';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const peggy = require('peggy') as { parser: { parse(text: string): PegAst } };

export const SCHEMA_VERSION = 2;
export const REFERENCE_JSON_PATH = 'docs/reference/c4x-reference.json';
export const REFERENCE_MD_PATH = 'docs/reference/c4x-reference.md';
export const REFERENCE_SCHEMA_PATH = 'docs/reference/c4x-reference.schema.json';
const GRAMMAR_PATH = 'src/parser/c4x.pegjs';
/** The characters-per-pixel rule the renderer uses to place relationship labels (SvgBuilder). */
const CHAR_WIDTH_FACTOR = 0.6;

/* ------------------------------------------------------------------ */
/* Grammar introspection                                               */
/* ------------------------------------------------------------------ */

interface PegNode {
    type: string;
    [key: string]: any;
}
interface PegRule { type: 'rule'; name: string; expression: PegNode }
interface PegAst { rules: PegRule[] }

export function repoRoot(): string {
    return path.resolve(__dirname, '..', '..');
}

function readText(relative: string): string {
    // The path is one of this module's fixed constants.
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    return fs.readFileSync(path.join(repoRoot(), relative), 'utf8');
}

function parseGrammar(): Map<string, PegRule> {
    const ast = peggy.parser.parse(readText(GRAMMAR_PATH));
    return new Map(ast.rules.map(rule => [rule.name, rule]));
}

function strip(node: PegNode): PegNode {
    let current = node;
    while (current.type === 'action' || current.type === 'named' || current.type === 'group') {
        current = current.expression;
    }
    return current;
}


function charClass(node: PegNode): string {
    const escape = (text: string): string => text
        .replace(/\\/g, '\\\\').replace(/\t/g, '\\t').replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\]/g, '\\]');
    const parts = (node.parts as Array<string | [string, string]>).map(part =>
        Array.isArray(part) ? `${escape(part[0])}-${escape(part[1])}` : escape(part));
    return `[${node.inverted ? '^' : ''}${parts.join('')}]${node.ignoreCase ? 'i' : ''}`;
}

/** The PEG expression as text, without actions, so a change to what a rule matches changes the text. */
export function formatExpression(node: PegNode, parent: string = ''): string {
    switch (node.type) {
        case 'action':
        case 'named':
            return formatExpression(node.expression, parent);
        case 'group':
            return formatExpression(node.expression, parent);
        case 'choice': {
            const text = node.alternatives.map((alt: PegNode) => formatExpression(alt, 'choice')).join(' / ');
            return parent === 'sequence' || parent === 'postfix' || parent === 'prefix' ? `(${text})` : text;
        }
        case 'sequence': {
            const text = node.elements.map((el: PegNode) => formatExpression(el, 'sequence')).join(' ');
            return parent === 'postfix' || parent === 'prefix' ? `(${text})` : text;
        }
        case 'labeled':
            return `${node.label}:${formatExpression(node.expression, 'prefix')}`;
        case 'text':
            return `$${formatExpression(node.expression, 'prefix')}`;
        case 'simple_not':
            return `!${formatExpression(node.expression, 'prefix')}`;
        case 'simple_and':
            return `&${formatExpression(node.expression, 'prefix')}`;
        case 'optional':
            return `${formatExpression(node.expression, 'postfix')}?`;
        case 'zero_or_more':
            return `${formatExpression(node.expression, 'postfix')}*`;
        case 'one_or_more':
            return `${formatExpression(node.expression, 'postfix')}+`;
        case 'rule_ref':
            return node.name;
        case 'literal':
            return `${JSON.stringify(node.value)}${node.ignoreCase ? 'i' : ''}`;
        case 'class':
            return charClass(node);
        case 'any':
            return '.';
        // A semantic predicate's code is an implementation detail (the nesting
        // bound, #362); the reference shows that one is there, as with actions.
        case 'semantic_and':
            return '&{…}';
        case 'semantic_not':
            return '!{…}';
        default:
            throw new Error(`reference generator: grammar node type "${node.type}" is not handled; extend formatExpression`);
    }
}

function rule(rules: Map<string, PegRule>, name: string): PegRule {
    const found = rules.get(name);
    if (!found) {
        throw new Error(`reference generator: the grammar has no rule "${name}" (src/parser/c4x.pegjs); update the generator`);
    }
    return found;
}

function literalChoice(rules: Map<string, PegRule>, name: string): string[] {
    const expression = strip(rule(rules, name).expression);
    const alternatives = expression.type === 'choice' ? expression.alternatives as PegNode[] : [expression];
    return alternatives.map(alt => {
        const inner = strip(alt);
        if (inner.type !== 'literal') {
            throw new Error(`reference generator: rule ${name} is no longer a choice of literals`);
        }
        return inner.value as string;
    });
}

function firstLiteral(rules: Map<string, PegRule>, name: string): string {
    const expression = strip(rule(rules, name).expression);
    const first = expression.type === 'sequence' ? strip(expression.elements[0]) : expression;
    if (first.type !== 'literal') {
        throw new Error(`reference generator: rule ${name} no longer starts with a literal`);
    }
    return first.value as string;
}

function labelledParts(node: PegNode): Array<{ label: string; optional: boolean; expression: PegNode }> {
    const sequence = strip(node);
    if (sequence.type !== 'sequence') {
        throw new Error('reference generator: expected a sequence in the grammar');
    }
    const parts: Array<{ label: string; optional: boolean; expression: PegNode }> = [];
    for (const element of sequence.elements as PegNode[]) {
        if (element.type === 'labeled') {
            const inner = element.expression as PegNode;
            parts.push({ label: element.label, optional: inner.type === 'optional', expression: inner });
        }
    }
    return parts;
}

/** The rule name a labelled part matches: the last rule reference inside it. */
function lastRuleRef(node: PegNode): string {
    let found = '';
    const walk = (current: PegNode): void => {
        if (current.type === 'rule_ref') { found = current.name; }
        for (const key of ['expression', 'elements', 'alternatives']) {
            const child = current[key];
            if (Array.isArray(child)) { child.forEach(walk); } else if (child && typeof child === 'object') { walk(child); }
        }
    };
    walk(node);
    return found;
}

function actionCode(node: PegNode): string {
    let current = node;
    while (current.type === 'named') { current = current.expression; }
    return current.type === 'action' ? String(current.code) : '';
}

/** Compare two sets of keys; throw one error naming both directions. */
export function requireSameKeys(what: string, fromCode: readonly string[], fromNotes: readonly string[], notesFile = 'scripts/c4x-reference/annotations.ts'): void {
    const missing = fromCode.filter(key => !fromNotes.includes(key));
    const stale = fromNotes.filter(key => !fromCode.includes(key));
    if (missing.length > 0 || stale.length > 0) {
        const lines = [`reference generator: ${what} and ${notesFile} disagree.`];
        if (missing.length > 0) { lines.push(`  In the code but not annotated: ${missing.join(', ')}`); }
        if (stale.length > 0) { lines.push(`  Annotated but not in the code: ${stale.join(', ')}`); }
        throw new Error(lines.join('\n'));
    }
}

/* ------------------------------------------------------------------ */
/* Sources                                                             */
/* ------------------------------------------------------------------ */

function buildModel(source: string) {
    return c4ModelBuilder.build(c4xParser.parse(source), 'reference');
}

function lintAll(source: string) {
    return lintC4xSource(source, normalizeLintOptions(true, {}));
}

function sentenceCase(text: string): string {
    return text.length === 0 ? text : text[0].toUpperCase() + text.slice(1);
}

/**
 * Load the layout engine, the SVG builder and a theme. The builder reaches
 * `vscode` through the theme manager (#353 tracks removing that), so the
 * module is resolved to the unit-test stub for the duration of the load and
 * the resolver is restored straight after.
 */
function loadRenderer(): {
    layout: (view: unknown) => { elements: Array<{ id: string; width: number; height: number }> };
    svg: (layout: unknown) => string;
} {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loader = require('module') as {
        _resolveFilename: (request: string, ...rest: unknown[]) => string;
    };
    const original = loader._resolveFilename;
    loader._resolveFilename = function (request: string, ...rest: unknown[]): string {
        if (request === 'vscode') {
            return require.resolve('../../src/__tests__/__mocks__/vscode');
        }
        return original.call(this, request, ...rest);
    };
    try {
        /* eslint-disable @typescript-eslint/no-var-requires */
        const { dagreLayoutEngine } = require('../../src/layout/DagreLayoutEngine');
        const { svgBuilder } = require('../../src/render/SvgBuilder');
        const { ClassicTheme } = require('../../src/themes/ClassicTheme');
        /* eslint-enable @typescript-eslint/no-var-requires */
        return {
            layout: view => dagreLayoutEngine.layoutSync(view),
            svg: layout => svgBuilder.build(layout, { theme: ClassicTheme }),
        };
    } finally {
        loader._resolveFilename = original;
    }
}

/* ------------------------------------------------------------------ */
/* The reference                                                       */
/* ------------------------------------------------------------------ */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type Reference = { [key: string]: Json };


function derivedViewTypes(): Json {
    requireSameKeys('the view types (C4_VIEW_TYPES in src/parser/types.ts)', [...C4_VIEW_TYPES], Object.keys(notes.VIEW_TYPES));
    return C4_VIEW_TYPES.map(id => {
        // Each declared view must survive a round trip through the real parser and builder.
        const model = buildModel(`%%{ c4: ${id} }%%\ngraph TB\nPerson(p, "P")`);
        if (model.views[0].type !== id) {
            throw new Error(`reference generator: view type "${id}" does not survive the parser and builder`);
        }
        return {
            id,
            level: notes.VIEW_TYPES[id].level,
            summary: notes.VIEW_TYPES[id].summary,
            lintRules: LINT_RULES.filter(r => r.levels.includes(id)).map(r => r.id),
        };
    });
}

interface Spelling { name: string; modelType: string; external: boolean; database: boolean; callForm: boolean }

function derivedSpellings(): Spelling[] {
    const canonical = new Map(C4_ACCEPTED_ELEMENT_TYPES.map(type => [type.toLowerCase(), type as string]));
    const result: Spelling[] = [];
    for (const key of Object.keys(ELEMENT_TYPE_MAP).sort()) {
        const name = canonical.get(key) ?? key;
        const callForm = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name);
        const source = callForm
            ? `%%{ c4: container }%%\ngraph TB\n${name}(x, "L")`
            : `%%{ c4: container }%%\ngraph TB\nx[L<br/>${name}]`;
        const element = buildModel(source).views[0].elements[0];
        result.push({
            name,
            modelType: element.type,
            external: (element.macroTags ?? []).includes('External'),
            database: (element.macroTags ?? []).includes('Database'),
            callForm,
        });
    }
    return result;
}

const MARKERS = { label: 'MARK_LABEL', technology: 'MARK_TECH', description: 'MARK_DESC' } as const;
const FIELDS = ['label', 'technology', 'description'] as const;

/**
 * Where the quoted arguments of a call land in the model, found by building calls
 * with distinct marker strings: once with one text after the label, once with two.
 * The meaning of the third argument depends on how many texts follow the label.
 */
function probeFields(name: string): { one: { [position: number]: string }; two: { [position: number]: string } } {
    const landing = (call: string, marker: string): string => {
        const element = buildModel(`%%{ c4: container }%%\ngraph TB\n${call}`).views[0].elements[0] as unknown as { [field: string]: unknown };
        const field = FIELDS.find(f => element[f] === marker);
        if (!field) { throw new Error(`reference generator: the marker ${marker} did not land in label, technology or description for ${call}`); }
        return field;
    };
    const one = `${name}(probe, "${MARKERS.label}", "${MARKERS.technology}")`;
    const two = `${name}(probe, "${MARKERS.label}", "${MARKERS.technology}", "${MARKERS.description}")`;
    return {
        one: { 3: landing(one, MARKERS.technology) },
        two: { 2: landing(two, MARKERS.label), 3: landing(two, MARKERS.technology), 4: landing(two, MARKERS.description) },
    };
}

function derivedElementKinds(spellings: Spelling[]): Json {
    const built = [...new Set(spellings.map(s => s.modelType))];
    requireSameKeys('the element kinds the builder produces', built, Object.keys(notes.ELEMENT_KINDS));
    // Annotation order: the order a reader meets them, from person down to node.
    return Object.keys(notes.ELEMENT_KINDS).map(kind => {
        const note = notes.ELEMENT_KINDS[kind];
        const callSpelling = spellings.find(sp => sp.modelType === kind && sp.callForm && !sp.external && !sp.database)!;
        const landed = probeFields(callSpelling.name);
        if (landed.one[3] !== note.fields.one[3]) {
            throw new Error(`reference generator: for ${kind}, a call with one text after the label lands it in "${landed.one[3]}" but scripts/c4x-reference/annotations.ts says "${note.fields.one[3]}"; update the usage, the argument notes, the known limitations and the examples that depend on it`);
        }
        for (const position of [3, 4] as const) {
            if (landed.two[position] !== note.fields.two[position]) {
                throw new Error(`reference generator: for ${kind}, argument ${position} (two texts after the label) lands in "${landed.two[position]}" but scripts/c4x-reference/annotations.ts says "${note.fields.two[position]}"; update the usage, the argument notes, the known limitations and the examples that depend on it`);
            }
        }
        if (!note.usage.includes(note.example)) {
            throw new Error(`reference generator: the usage for ${kind} does not contain its example`);
        }
        const shown = buildModel(`%%{ c4: container }%%\ngraph TB\n${note.example}`).views[0].elements[0] as unknown as { [field: string]: unknown };
        const texts = [...note.example.matchAll(/"([^"]*)"/g)].slice(1);
        const mapping = texts.length === 1 ? note.fields.one : note.fields.two;
        texts.forEach((match, index) => {
            const field = (mapping as { [position: number]: string })[index + 3];
            if (shown[field] !== match[1]) {
                throw new Error(`reference generator: in the ${kind} example, "${match[1]}" does not land in ${field}`);
            }
        });
        const own = spellings.filter(s => s.modelType === kind);
        const probe = { type: kind, tags: [] as string[] };
        const ext = orderedStyleTags({ type: kind, tags: ['External'], impliedTags: ['External'] });
        const db = orderedStyleTags({ type: kind, tags: ['Database'], impliedTags: ['Database'] });
        return {
            kind,
            summary: note.summary,
            usage: note.usage,
            example: note.example,
            argumentFields: { withOneText: { 3: landed.one[3] }, withTwoTexts: { 3: landed.two[3], 4: landed.two[4] } },
            spellings: own.map(s => ({
                name: s.name,
                external: s.external,
                database: s.database,
                callForm: s.callForm,
            })),
            codeMappable: CODE_MAPPABLE_TYPES.has(kind),
            impliedTags: {
                always: orderedStyleTags(probe),
                external: ext.filter(tag => !orderedStyleTags(probe).includes(tag)),
                database: db.filter(tag => !orderedStyleTags(probe).includes(tag)),
            },
        };
    });
}

function derivedPlacement(spellings: Spelling[], rules: Map<string, PegRule>): Json {
    const out: { [view: string]: Json } = {};
    for (const view of C4_VIEW_TYPES) {
        // A view the legality table does not know (dynamic) has no placement rules.
        if (legalChildTypes('root', view as C4Level).length === 0) { continue; }
        const scopes: { [scope: string]: Json } = {};
        for (const scope of C4_SCOPES) {
            scopes[scope] = legalChildTypes(scope, view as C4Level).map(type => type as string);
        }
        out[view] = scopes;
    }
    // Every placement name must be a spelling the grammar can carry: a call-form
    // element kind, or a boundary or node block.
    const known = new Set([...spellings.map(s => s.name), 'Node', ...literalChoice(rules, 'BoundaryType')]);
    for (const view of Object.values(out)) {
        for (const names of Object.values(view as { [scope: string]: string[] })) {
            for (const name of names) {
                if (!known.has(name)) {
                    throw new Error(`reference generator: placement names "${name}", which the model builder does not accept (legality table and builder disagree)`);
                }
            }
        }
    }
    return out;
}

function derivedStatements(rules: Map<string, PegRule>): Json {
    const statement = strip(rule(rules, 'Statement').expression);
    const names = (statement.alternatives as PegNode[]).map(alt => {
        const inner = strip(alt);
        if (inner.type !== 'rule_ref') { throw new Error('reference generator: Statement is no longer a choice of rules'); }
        return inner.name as string;
    });
    requireSameKeys('the grammar\'s Statement alternatives', names, Object.keys(notes.STATEMENTS));
    return names.map(name => ({
        rule: name,
        form: notes.STATEMENTS[name].form,
        summary: notes.STATEMENTS[name].summary,
    }));
}

function derivedElementCall(rules: Map<string, PegRule>): { elementCall: Json; attributeKeys: string[] } {
    const call = labelledParts(rule(rules, 'ElementCall').expression)
        .filter(part => part.label !== 'type' && part.label !== 'args');
    const args = labelledParts(rule(rules, 'ElementCallArgs').expression);
    const all = [...call, ...args];
    requireSameKeys('the ElementCall arguments in the grammar', all.map(p => p.label), Object.keys(notes.ARGUMENTS));
    requireSameKeys('the ElementCall arguments in the grammar', all.map(p => p.label), Object.keys(notes.ARGUMENT_FIELDS));
    // Behavioural check: every kind must put each argument in the field the argument notes claim.
    for (const kind of Object.keys(notes.ELEMENT_KINDS)) {
        const name = Object.entries(ELEMENT_TYPE_MAP).find(([key, type]) => type === kind && /^[a-z_]+$/.test(key) && !key.includes('_ext') && !key.includes('db'))![0];
        const landed = probeFields(name).two;
        for (const [position, argument] of [[2, 'label'], [3, 'technology'], [4, 'description']] as const) {
            if (landed[position] !== notes.ARGUMENT_FIELDS[argument]) {
                throw new Error(`reference generator: for ${kind}, the ${argument} argument (two texts after the label) lands in "${landed[position]}" but the argument notes say "${notes.ARGUMENT_FIELDS[argument]}"`);
            }
        }
    }

    const keys = /knownKeys\s*=\s*\[([^\]]*)\]/.exec(actionCode(rule(rules, 'ElementCallArgs').expression));
    if (!keys) { throw new Error('reference generator: ElementCallArgs no longer declares knownKeys'); }
    const attributeKeys = keys[1].split(',').map(k => k.trim().replace(/^'|'$/g, '')).filter(Boolean);
    requireSameKeys('the attribute keys the grammar knows', attributeKeys, Object.keys(notes.ATTRIBUTES));

    return {
        attributeKeys,
        elementCall: {
            signature: all.map((part, index) => ({
                name: part.label === 'kv' ? 'attributes' : part.label,
                position: index + 1,
                required: !part.optional,
                kind: part.label === 'kv' ? 'attributes' : lastRuleRef(part.expression) === 'QuotedString' ? 'quoted string' : 'identifier',
                field: notes.ARGUMENT_FIELDS[part.label],
                meaning: notes.ARGUMENTS[part.label],
            })),
            form: 'Type(id, "Label", "Technology", "Description", $key="value")',
            typeIsAnyIdentifier: true,
        },
    };
}

function derivedRelationships(rules: Map<string, PegRule>): Json {
    const parts = labelledParts(rule(rules, 'Relationship').expression);
    const arrows = literalChoice(rules, 'Arrow');
    requireSameKeys('the arrows in the grammar', arrows, Object.keys(notes.ARROWS));
    requireSameKeys('the arrows the model builder accepts', Object.keys(REL_TYPE_MAP), arrows);
    const labelOpen = firstLiteral(rules, 'RelationshipLabel');
    const technologyOpen = firstLiteral(rules, 'RelationshipTechnology');
    return {
        parts: parts.map(part => ({ name: part.label, required: !part.optional })),
        labelDelimiter: labelOpen,
        technologyDelimiter: technologyOpen,
        form: 'from -->|Label| "Technology" to',
        arrows: arrows.map(arrow => ({
            arrow,
            modelType: REL_TYPE_MAP[arrow],
            summary: notes.ARROWS[arrow],
        })),
        technologyNote: notes.RELATIONSHIP_TECHNOLOGY_NOTE,
    };
}

function derivedBoundaries(rules: Map<string, PegRule>): Json {
    const types = literalChoice(rules, 'BoundaryType');
    requireSameKeys('the boundary types in the grammar', types, Object.keys(notes.BOUNDARY_NOTES));
    return types.map(type => ({
        type,
        form: `${type}(id, "Label") { ... }`,
        summary: notes.BOUNDARY_NOTES[type],
    }));
}

function derivedStyles(): Json {
    const keys = styleKeyNames() as string[];
    requireSameKeys('the elementStyle keys', keys, Object.keys(notes.STYLE_KEYS));
    const keyEntries = keys.map(key => {
        const note = notes.STYLE_KEYS[key];
        const accepts = (value: string): boolean => parseStyleValue(key, value, isBundledSpriteId) !== undefined;
        if (!accepts(note.example)) {
            throw new Error(`reference generator: style key $${key} does not accept its annotated example "${note.example}"`);
        }
        if (accepts(note.invalidExample)) {
            throw new Error(`reference generator: style key $${key} accepts its annotated invalid example "${note.invalidExample}"`);
        }
        // The finite value sets and bounds come from the resolver's own table. The
        // annotated prose must still name every one, or it has gone stale.
        const rule = styleValueRules()[key];
        const prose = note.accepts;
        if (rule.kind === 'set') {
            for (const value of rule.values) {
                if (!prose.includes(value)) { throw new Error(`reference generator: the prose for $${key} does not mention the value "${value}" the resolver accepts`); }
            }
        }
        if (rule.kind === 'integer' && (!prose.includes(String(rule.min)) || !prose.includes(String(rule.max)))) {
            throw new Error(`reference generator: the prose for $${key} does not state the bounds ${rule.min} and ${rule.max} the resolver enforces`);
        }
        if (rule.kind === 'text' && !prose.includes(String(rule.maxLength))) {
            throw new Error(`reference generator: the prose for $${key} does not state the ${rule.maxLength}-character limit the resolver enforces`);
        }
        const entry: { [k: string]: Json } = {
            key,
            summary: note.summary,
            accepts: note.accepts,
            example: note.example,
        };
        if (rule.kind === 'set') { entry.values = [...rule.values]; }
        if (rule.kind === 'integer') { entry.range = { min: rule.min, max: rule.max }; }
        if (rule.kind === 'text') { entry.maxLength = rule.maxLength; }
        return entry;
    });

    const names = styleShapeNames();
    const drawn = new Set(drawnShapeNames());
    for (const name of drawn) {
        if (!names.includes(name)) { throw new Error(`reference generator: drawn shape "${name}" is not a shape name`); }
    }

    const codes = Object.values(STYLE_DIAGNOSTIC_CODES) as string[];
    requireSameKeys('the style diagnostic codes', codes, Object.keys(notes.STYLE_DIAGNOSTICS));
    const diagnostics = codes.map(code => {
        const note = notes.STYLE_DIAGNOSTICS[code];
        const hit = lintAll(note.trigger).find(f => f.ruleId === code);
        if (!hit) { throw new Error(`reference generator: the trigger annotated for ${code} does not raise it`); }
        return { id: code, severity: hit.severity, summary: note.summary, message: hit.message, trigger: note.trigger };
    });

    return {
        keys: keyEntries,
        shapes: names.map(name => ({ name, drawn: drawn.has(name) })),
        shapeNote: 'Names are case sensitive. A valid shape the renderer does not draw yet is drawn as the theme rectangle (C4X-L111).',
        tagMatching: 'Case insensitive. An element carries its implied tags (see elementKinds), then its own tags in order. Rules apply in tag order; later keys win.',
        diagnostics,
    };
}

function derivedLint(): Json {
    const options = normalizeLintOptions(true, {});
    requireSameKeys('the lint rule catalogue', LINT_RULES.map(r => r.id), Object.keys(notes.LINT_TRIGGERS));
    const rules = LINT_RULES.map(def => {
        const source = notes.LINT_TRIGGERS[def.id];
        const view = buildModel(source).views[0].type;
        if (!def.levels.includes(view)) {
            throw new Error(`reference generator: the trigger annotated for ${def.id} is a ${view} view, a level the rule does not run on`);
        }
        const finding = lintModel(buildModel(source), options).find(f => f.ruleId === def.id);
        if (!finding) { throw new Error(`reference generator: the trigger annotated for ${def.id} does not raise it`); }
        return {
            id: def.id,
            title: def.title,
            defaultSeverity: def.defaultSeverity,
            levels: [...def.levels],
            appliesTo: def.appliesTo,
            rationale: def.rationale,
            checklistItem: def.checklist.item,
            structurizrEquivalent: [...def.structurizrEquivalent],
            exampleFinding: { message: finding.message, hint: finding.hint, source },
        };
    });
    const severities = [...new Set(LINT_RULES.map(r => r.defaultSeverity))];
    requireSameKeys('the other diagnostics', [SYNTAX_RULE_ID, MODEL_RULE_ID, LIMIT_RULE_ID], Object.keys(notes.OTHER_DIAGNOSTICS));
    const others = [SYNTAX_RULE_ID, MODEL_RULE_ID, LIMIT_RULE_ID].map(id => {
        const note = notes.OTHER_DIAGNOSTICS[id];
        const hit = lintAll(note.trigger).find(f => f.ruleId === id);
        if (!hit) { throw new Error(`reference generator: the trigger annotated for ${id} does not raise it`); }
        return { id, severity: hit.severity, summary: note.summary, message: hit.message, trigger: note.trigger };
    });
    if (severities.length !== 1 || severities[0] !== 'info') {
        throw new Error(`reference generator: the lint catalogue no longer defaults every rule to info (${severities.join(', ')}); update LINT_CLI_NOTES and the guidance that says so`);
    }
    return {
        defaultSeverity: severities[0],
        cliNotes: [...notes.LINT_CLI_NOTES],
        rules,
        otherDiagnostics: others,
    };
}

interface KindProbe { kind: string; view: C4ViewType; source: string }

function derivedTextLimits(): Json {
    const probes: KindProbe[] = [
        { kind: 'Person', view: 'system-context', source: 'Person(x, "L", "T", "D")' },
        { kind: 'SoftwareSystem', view: 'system-context', source: 'System(x, "L", "T", "D")' },
        { kind: 'Container', view: 'container', source: 'Container(x, "L", "T", "D")' },
        { kind: 'Component', view: 'component', source: 'Component(x, "L", "T", "D")' },
        { kind: 'DeploymentNode', view: 'deployment', source: 'Node(x, "L", "T", "D") {\n}' },
    ];
    requireSameKeys('the text-limit probes and the element kinds', probes.map(p => p.kind), Object.keys(notes.ELEMENT_KINDS));
    const renderer = loadRenderer();
    const kinds = probes.map(probe => {
        const model = buildModel(`%%{ c4: ${probe.view} }%%\ngraph TB\n${probe.source}`);
        const layout = renderer.layout(model.views[0]);
        const box = layout.elements.find(e => e.id === 'x');
        if (!box) { throw new Error(`reference generator: layout of ${probe.kind} has no element x`); }
        const svg = renderer.svg(layout);
        const sizes: { [field: string]: number } = {};
        for (const match of svg.matchAll(/data-field="(label|technology|description)"[^>]*?font-size="(\d+)"/g)) {
            sizes[match[1]] = Number(match[2]);
        }
        for (const field of ['label', 'technology', 'description']) {
            if (sizes[field] === undefined) {
                throw new Error(`reference generator: the render of ${probe.kind} has no ${field} text to measure`);
            }
        }
        // For a kind whose one text after the label is the description, that text must be drawn
        // as plain description text at the description font, with no technology line.
        if (notes.ELEMENT_KINDS[probe.kind].fields.one[3] === 'description') {
            const oneText = probe.source.replace('"L", "T", "D"', '"L", "D"');
            const oneModel = buildModel(`%%{ c4: ${probe.view} }%%\ngraph TB\n${oneText}`);
            const oneSvg = renderer.svg(renderer.layout(oneModel.views[0]));
            const drawnOne = /data-field="description"[^>]*?font-size="(\d+)"[^>]*>([^<]*)</.exec(oneSvg);
            if (!drawnOne || Number(drawnOne[1]) !== sizes.description || drawnOne[2] !== 'D' || oneSvg.includes('data-field="technology"')) {
                throw new Error(`reference generator: a ${probe.kind} with one text after the label is not drawn as a plain description`);
            }
        }
        // The renderer wraps the technology in brackets, which take width too. Derive how many
        // characters it adds by rendering a technology of known length and reading the drawn text.
        const drawn = /data-field="technology"[^>]*>([^<]*)</.exec(svg);
        if (!drawn) { throw new Error(`reference generator: the render of ${probe.kind} has no technology text`); }
        const wrapper = drawn[1].length - 1;
        if (wrapper < 0 || !drawn[1].includes('T')) {
            throw new Error(`reference generator: the technology of ${probe.kind} is not drawn as expected ("${drawn[1]}")`);
        }
        const limit = (field: string): number =>
            Math.floor(box.width / (sizes[field] * CHAR_WIDTH_FACTOR)) - (field === 'technology' ? wrapper : 0);
        return {
            kind: probe.kind,
            boxWidth: box.width,
            boxHeight: box.height,
            fontSize: sizes,
            maxCharacters: { label: limit('label'), technology: limit('technology'), description: limit('description') },
            technologyWrapper: wrapper,
        };
    });
    const min = (field: 'label' | 'technology' | 'description'): number =>
        Math.min(...kinds.map(k => k.maxCharacters[field]));
    return {
        status: 'current behaviour; element text is not wrapped (#340)',
        issue: '#340',
        method: notes.TEXT_LIMIT_METHOD,
        charWidthFactor: CHAR_WIDTH_FACTOR,
        kinds,
        safeForAnyKind: { label: min('label'), technology: min('technology'), description: min('description') },
    };
}

function derivedExamples(): Json {
    return notes.EXAMPLES.map(example => {
        const findings = lintAll(example.source);
        if (findings.length > 0) {
            const first = findings[0];
            throw new Error(`reference generator: example "${example.id}" is not clean at info: ${first.ruleId} at ${first.line}:${first.column} ${first.message}`);
        }
        return {
            id: example.id,
            title: example.title,
            summary: example.summary,
            covers: [...example.covers],
            source: example.source,
            lintedAt: 'info',
        };
    });
}

function derivedGrammarRules(rules: Map<string, PegRule>): Json {
    return [...rules.values()].map(r => ({ name: r.name, expression: formatExpression(r.expression) }));
}

/** Everything the reference says, as plain data. */
export function buildReference(): Reference {
    const rules = parseGrammar();
    const spellings = derivedSpellings();
    const { elementCall } = derivedElementCall(rules);
    const legalityOnly = [...C4_ACCEPTED_ELEMENT_TYPES]
        .filter(type => !/_Boundary$/.test(type) && !spellings.some(s => s.name === type))
        .map(type => type as string)
        .sort();

    return {
        $schema: './c4x-reference.schema.json',
        schemaVersion: SCHEMA_VERSION,
        title: 'C4X reference',
        sources: [
            GRAMMAR_PATH,
            'src/model/C4ModelBuilder.ts',
            'src/model/c4Legality.ts',
            'src/model/styleDiagnostics.ts',
            'src/model/lint/catalogue.ts',
            'src/render/elementStyle.ts',
            'src/cli/limits.ts',
            'src/parser/nestingDepth.ts',
            'scripts/c4x-reference/annotations.ts',
        ],
        document: {
            viewDeclaration: {
                form: '%%{ c4: <view> }%%',
                optional: true,
                default: 'system-context',
                summary: 'It names the view, which decides what the diagram may contain and which lint rules run.',
            },
            graphLine: {
                keyword: literalChoice(rules, 'GraphKeyword')[0],
                form: 'graph <direction>',
                directions: literalChoice(rules, 'Direction'),
                optional: true,
                default: 'TB',
                summary: 'The layout direction: top to bottom, bottom to top, left to right, right to left. When it is missing, the parser adds `graph TB`.',
            },
            comment: {
                marker: firstLiteral(rules, 'Comment'),
                summary: sentenceCase(notes.STATEMENTS.Comment.summary),
            },
        },
        viewTypes: derivedViewTypes(),
        statements: derivedStatements(rules),
        elementCall,
        elementKinds: derivedElementKinds(spellings),
        elementKindsNote: 'The model builder reads the type name without regard to case. The grammar accepts any identifier as a type, so a name outside this list parses and then fails with C4X-MODEL.',
        spellingsRejectedByBuilder: legalityOnly,
        placement: derivedPlacement(spellings, rules),
        placementNote: 'For each view and each place an element can sit (`root`, or inside a boundary or node), the element spellings the legality table accepts there. The dynamic view is not checked.',
        attributes: {
            known: notes.ATTRIBUTES,
            other: notes.OTHER_ATTRIBUTES,
        },
        relationships: derivedRelationships(rules),
        boundaries: derivedBoundaries(rules),
        styles: derivedStyles(),
        textLimits: derivedTextLimits(),
        inputLimits: inputLimitTable().map(row => ({ ...row })),
        lint: derivedLint(),
        knownLimitations: notes.KNOWN_LIMITATIONS.map(item => ({ ...item })),
        authoringRules: [...notes.AUTHORING_RULES],
        examples: derivedExamples(),
        grammar: { file: GRAMMAR_PATH, rules: derivedGrammarRules(rules) },
    } as unknown as Reference;
}

/* ------------------------------------------------------------------ */
/* Serialisation                                                       */
/* ------------------------------------------------------------------ */

function sortKeys(value: Json): Json {
    if (Array.isArray(value)) { return value.map(sortKeys); }
    if (value && typeof value === 'object') {
        const out: { [key: string]: Json } = {};
        for (const key of Object.keys(value).sort()) {
            const child = value[key];
            if (child !== undefined) { out[key] = sortKeys(child); }
        }
        return out;
    }
    return value;
}

/** Sorted keys, two-space indent, LF, one trailing newline. */
export function serialise(value: Json): string {
    return `${JSON.stringify(sortKeys(value), null, 2)}\n`;
}

/* ------------------------------------------------------------------ */
/* Markdown                                                            */
/* ------------------------------------------------------------------ */

type Obj = { [key: string]: any };

function cell(text: string): string {
    return String(text).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function fence(lang: string, source: string): string[] {
    return ['```' + lang, source, '```', ''];
}

export function renderMarkdown(ref: Obj): string {
    const out: string[] = [];
    const line = (text = ''): void => { out.push(text); };

    line('# C4X reference');
    line();
    line('Generated from the grammar, the model builder, the style resolver and the lint catalogue by `pnpm run generate:reference`. Do not edit by hand: the drift test in `make check` fails when this file differs from a fresh run. The machine-readable form is `c4x-reference.json`, described by `c4x-reference.schema.json`.');
    line();
    line('The notes next to the generator, `scripts/c4x-reference/annotations.ts`, hold the meaning of each argument, each statement and each example. The generator stops when those notes and the code disagree.');
    line();

    line('## Document');
    line();
    const doc = ref.document;
    line(`- First line: \`${doc.viewDeclaration.form}\`. ${sentenceCase(doc.viewDeclaration.summary)} Default view: \`${doc.viewDeclaration.default}\`.`);
    line(`- Direction line: \`${doc.graphLine.form}\`, one of ${doc.graphLine.directions.map((d: string) => `\`${d}\``).join(', ')}. ${doc.graphLine.summary}`);
    line(`- Comment: \`${doc.comment.marker}\`. ${doc.comment.summary}`);
    line();

    line('## View types');
    line();
    line('| View | Level | Shows | Lint rules that run |');
    line('|---|---|---|---|');
    for (const view of ref.viewTypes) {
        line(`| \`${view.id}\` | ${view.level} | ${cell(view.summary)} | ${view.lintRules.join(', ')} |`);
    }
    line();

    line('## Statements');
    line();
    for (const statement of ref.statements) {
        line(`- **${statement.rule}**: \`${statement.form}\`. ${statement.summary}`);
    }
    line();

    line('## Element call');
    line();
    line(`Form: \`${ref.elementCall.form}\`. The type is any identifier at parse time; the model builder accepts the spellings below.`);
    line();
    line('| # | Argument | Required | Kind | Meaning |');
    line('|---|---|---|---|---|');
    for (const arg of ref.elementCall.signature) {
        line(`| ${arg.position} | \`${arg.name}\` | ${arg.required ? 'yes' : 'no'} | ${arg.kind} | ${cell(arg.meaning)} |`);
    }
    line();
    line('Every element kind shares this signature.');
    line();

    line('## Element kinds');
    line();
    line(ref.elementKindsNote);
    line();
    for (const kind of ref.elementKinds) {
        line(`### ${kind.kind}`);
        line();
        line(kind.summary);
        line();
        line(`Use: ${kind.usage}`);
        line();
        line(`Probed from the parser and builder: with one text after the label it lands in \`${kind.argumentFields.withOneText['3']}\`; with two, the third argument lands in \`${kind.argumentFields.withTwoTexts['3']}\` and the fourth in \`${kind.argumentFields.withTwoTexts['4']}\`.`);
        line();
        line('| Spelling | External | Database | Call form |');
        line('|---|---|---|---|');
        for (const s of kind.spellings) {
            line(`| \`${s.name}\` | ${s.external ? 'yes' : 'no'} | ${s.database ? 'yes' : 'no'} | ${s.callForm ? 'yes' : 'bracket form only'} |`);
        }
        line();
        const implied = [`${kind.impliedTags.always.map((t: string) => `\`${t}\``).join(', ')}`];
        if (kind.spellings.some((sp: Obj) => sp.external)) { implied.push(`\`${kind.impliedTags.external.join('`, `')}\` for an external spelling`); }
        if (kind.spellings.some((sp: Obj) => sp.database)) { implied.push(`\`${kind.impliedTags.database.join('`, `')}\` for a database spelling`); }
        line(`Implied style tags: ${implied.join('; ')}. ${kind.codeMappable ? '`$code` is allowed.' : '`$code` is an error.'}`);
        line();
    }
    if (ref.spellingsRejectedByBuilder.length > 0) {
        line(`The legality table also names ${ref.spellingsRejectedByBuilder.map((s: string) => `\`${s}\``).join(', ')}, which the model builder does not accept as an element call. Do not write them.`);
        line();
    }

    line('## Placement');
    line();
    line(ref.placementNote);
    line();
    for (const viewType of ref.viewTypes as Obj[]) {
        const scopes = ref.placement[viewType.id] as Obj | undefined;
        if (!scopes) { continue; }
        line(`### ${viewType.id}`);
        line();
        for (const scope of C4_SCOPES) {
            const list = scopes[scope] as string[];
            line(`- ${scope}: ${list.length ? list.map(n => `\`${n}\``).join(', ') : 'nothing'}`);
        }
        line();
    }

    line('## Attributes');
    line();
    for (const [key, text] of Object.entries(ref.attributes.known as Obj)) {
        line(`- \`$${key}\`: ${text}`);
    }
    line(`- Other keys: ${ref.attributes.other}`);
    line();

    line('## Relationships');
    line();
    line(`Form: \`${ref.relationships.form}\`. The label sits between \`${ref.relationships.labelDelimiter}\` bars. The technology is quoted. Parts, in order: ${ref.relationships.parts.map((p: Obj) => `\`${p.name}\` (${p.required ? 'required' : 'optional'})`).join(', ')}.`);
    line();
    line('| Arrow | Model type | Use |');
    line('|---|---|---|');
    for (const arrow of ref.relationships.arrows) {
        line(`| \`${arrow.arrow}\` | ${arrow.modelType} | ${cell(arrow.summary)} |`);
    }
    line();
    line(ref.relationships.technologyNote);
    line();

    line('## Boundaries');
    line();
    for (const boundary of ref.boundaries) {
        line(`- \`${boundary.form}\`: ${boundary.summary}`);
    }
    line();

    line('## Styles');
    line();
    line('Style elements by tag with `elementStyle TagName $key="value", ...`, at the top level. Every value is quoted.');
    line();
    line('| Key | Accepts | Example |');
    line('|---|---|---|');
    for (const key of ref.styles.keys) {
        line(`| \`$${key.key}\` | ${cell(key.accepts)} ${cell(key.summary)} | \`${cell(key.example)}\` |`);
    }
    line();
    line(ref.styles.tagMatching);
    line();
    line('### Shapes');
    line();
    line(ref.styles.shapeNote);
    line();
    line('| Shape | Drawn today |');
    line('|---|---|');
    for (const shape of ref.styles.shapes) {
        line(`| \`${shape.name}\` | ${shape.drawn ? 'yes' : 'no'} |`);
    }
    line();
    line('### Style diagnostics');
    line();
    line('| Id | Severity | Meaning |');
    line('|---|---|---|');
    for (const d of ref.styles.diagnostics) {
        line(`| ${d.id} | ${d.severity} | ${cell(d.summary)} |`);
    }
    line();

    line('## Text limits');
    line();
    line(`Status: ${ref.textLimits.status}.`);
    line();
    line(ref.textLimits.method);
    line();
    line('| Kind | Box width | Label | Technology (brackets taken off) | Description |');
    line('|---|---|---|---|---|');
    for (const k of ref.textLimits.kinds) {
        line(`| ${k.kind} | ${k.boxWidth} px | ${k.maxCharacters.label} (${k.fontSize.label} px) | ${k.maxCharacters.technology} (${k.fontSize.technology} px) | ${k.maxCharacters.description} (${k.fontSize.description} px) |`);
    }
    line();
    const safe = ref.textLimits.safeForAnyKind;
    line(`Safe for any kind: at most ${safe.label} characters in a label, ${safe.technology} in a technology and ${safe.description} in a description.`);
    line();

    line('## Input limits');
    line();
    line('The bounds the parser, the MCP tools and `c4x-lint` enforce (src/cli/limits.ts), on what the parser keeps in its result. Source text the parser discards (comments, overwritten attribute values, a subgraph inside a deployment node) is bounded by the input-size caps; see the threat model. Beyond a bound the result is an error, not a crash or a hang; the boundary tests and the adversarial parser corpus check this.');
    line();
    line('| Limit | Value | Applies to | Meaning |');
    line('|---|---|---|---|');
    for (const limit of ref.inputLimits) {
        line(`| ${limit.name} | ${limit.value.toLocaleString('en-GB')} ${limit.unit} | ${cell(limit.appliesTo)} | ${cell(limit.summary)} |`);
    }
    line();

    line('## Lint rules');
    line();
    line(`Default severity of every rule: \`${ref.lint.defaultSeverity}\`.`);
    line();
    for (const note of ref.lint.cliNotes) { line(`- ${note}`); }
    line();
    line('| Id | Rule | Runs on | Default |');
    line('|---|---|---|---|');
    for (const r of ref.lint.rules) {
        line(`| ${r.id} | ${cell(r.title)} | ${r.levels.join(', ')} | ${r.defaultSeverity} |`);
    }
    line();
    for (const r of ref.lint.rules) {
        line(`### ${r.id}`);
        line();
        line(`${r.title}. Applies to: ${r.appliesTo}.`);
        line();
        line(r.rationale);
        line();
        line(`Message on the source below: ${r.exampleFinding.message}`);
        line();
        out.push(...fence('text', r.exampleFinding.source));
    }
    line('### Other diagnostics');
    line();
    for (const d of ref.lint.otherDiagnostics) {
        line(`- ${d.id} (${d.severity}): ${d.summary}`);
    }
    line();

    line('## Known limitations');
    line();
    for (const item of ref.knownLimitations) {
        line(`- ${item.issue}: ${item.text}`);
    }
    line();

    line('## Rules for writing C4X');
    line();
    for (const rule of ref.authoringRules) { line(`- ${rule}`); }
    line();

    line('## Examples');
    line();
    line('Each example parses, builds and lints with no finding at `info`.');
    line();
    for (const example of ref.examples) {
        line(`### ${example.title}`);
        line();
        line(`${example.summary} Shows: ${example.covers.join(', ')}.`);
        line();
        out.push(...fence('c4x', example.source));
    }

    line('## Grammar');
    line();
    line(`Every rule of \`${ref.grammar.file}\`, with actions removed. The drift test fails when a rule changes without regeneration.`);
    line();
    out.push(...fence('text', (ref.grammar.rules as Obj[]).map(r => `${r.name} = ${r.expression}`).join('\n')));

    return `${out.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\n+$/, '')}\n`;
}

/** The three generated files, as repository-relative path to exact text. */
export function generateAll(): { [relative: string]: string } {
    const json = serialise(buildReference());
    return {
        [REFERENCE_JSON_PATH]: json,
        // The Markdown is a pure function of the JSON file, so a reader of one can trust the other.
        [REFERENCE_MD_PATH]: renderMarkdown(JSON.parse(json)),
        [REFERENCE_SCHEMA_PATH]: serialise(REFERENCE_SCHEMA as Json),
    };
}
