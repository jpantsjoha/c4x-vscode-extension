/**
 * Input and output bounds for the headless C4X entry points: the MCP server
 * and the `c4x-lint` CLI (#362). One module, so the tools, their tests, their
 * documentation and the generated reference (`inputLimits`) cannot disagree.
 *
 * Chosen 2026-11-15 from the diagrams in this repository (196 parsed sources):
 * at most 24 top-level elements, 54 relationships, nesting 4 levels deep,
 * a 106-character text field, 5 entries in one attribute list, tag list or
 * elementStyle, and a 9,057-byte source. Every limit leaves at
 * least 8 times that headroom; most leave far more.
 */
import { MAX_NESTING_DEPTH } from '../parser/nestingDepth';
import type { ParseResult } from '../parser/types';


/** Largest `code` argument any MCP tool accepts, and largest input `c4x render` reads, in UTF-8 bytes. */
export const MAX_MCP_SOURCE_BYTES = 1024 * 1024;
/** Largest file `c4x-lint` reads. A Markdown file can hold many fences. */
export const MAX_CLI_FILE_BYTES = 4 * 1024 * 1024;
/** Elements and boundaries in one diagram, counted at every nesting level. */
export const MAX_ELEMENTS = 2000;
/** Relationships in one diagram. */
export const MAX_RELATIONSHIPS = 5000;
/** Characters in one text field: a label, description, technology, tag or attribute value. */
export const MAX_TEXT_LENGTH = 4096;
/**
 * Entries in one attribute list (`$key="value"` pairs as written, repeats included), tag list or
 * elementStyle statement: the lists whose keys or length the source chooses.
 */
export const MAX_ENTRIES = 256;
/** Characters in one line of MCP tool output; longer lines are cut. */
export const MAX_OUTPUT_LINE_LENGTH = 2000;
/** Finding lines in one `lint_c4x` result; the heading still counts them all. */
export const MAX_FINDING_LINES = 200;
/** Notes about the `rules` argument in one `lint_c4x` result. */
export const MAX_NOTE_LINES = 20;
/** Bytes of text in one MCP tool result, after every cap above. */
export const MAX_TOOL_OUTPUT_BYTES = 512 * 1024;

// Render bounds (#353): render_c4x and `c4x render` (src/cli/renderSource.ts).

/**
 * Largest SVG a render returns, in UTF-8 bytes (#352: 2 MiB). A larger
 * render returns its findings and a "render too large" result, never a
 * partial SVG. The largest Internet Banking System fixture draws about 32 KB.
 */
export const MAX_RENDER_SVG_BYTES = 2 * 1024 * 1024;

/**
 * Elements and boundaries one render lays out, at every nesting level, and
 * relationships it routes. Lower than the parser-side input limits (2,000 and
 * 5,000, above): layout time grows faster than linearly with both.
 * Measured 2026-11-15 on the maintainer's machine (14 cores, load 6-18 from
 * other work): 2,000 elements with 3,000 relationships took 6.4 s to render
 * under load 18, and 2.8 s for layout alone under load 10, even in the
 * cheapest shape (no boundaries). A chain with shortcuts (the #353 review's
 * topology, src/__tests__/cli/renderCorpus.ts) took 3.6-4.0 s at 150
 * elements and 300 relationships, so the caps came down to 100 and 150. At
 * these caps the slowest shape measured took 0.62 s median (long text, and
 * the chain with shortcuts), and twelve random and chain-plus-random graphs
 * at most 0.46 s, under a third of the budget below. The largest diagram in
 * the repository has 24 top-level elements and 54 relationships. A larger
 * diagram returns its findings and no SVG.
 */
export const MAX_RENDER_ELEMENTS = 100;
export const MAX_RENDER_RELATIONSHIPS = 150;

/**
 * The hard deadline for one render call, in milliseconds, enforced by the
 * code (src/cli/renderWorker.ts): the render runs in a worker thread, and a
 * render still running when the deadline passes is terminated and returns
 * its findings and no SVG ("render took too long"; `c4x render` exits 3).
 * It is not a measured target. The caps above are the first line of
 * defence, checked before the worker starts; the deadline bounds whatever
 * passes them. Each Internet Banking System fixture renders well inside the
 * 250 ms of #352.
 */
export const RENDER_TIME_BUDGET_MS = 2000;

/** Rule id for a source that exceeds a bound. Not a catalogue rule: it cannot be configured. */
export const LIMIT_RULE_ID = 'C4X-LIMIT';

export interface LimitViolation {
    readonly message: string;
    /** 1-based, in the source as given. */
    readonly line: number;
    readonly column: number;
}

/** Every bound in one place, for the generated reference and the documentation. */
export function inputLimitTable(): ReadonlyArray<{ readonly name: string; readonly value: number; readonly unit: string; readonly appliesTo: string; readonly summary: string }> {
    return [
        { name: 'mcpSourceBytes', value: MAX_MCP_SOURCE_BYTES, unit: 'bytes', appliesTo: 'validate_c4x, lint_c4x, render_c4x, c4x render', summary: 'Largest `code` argument (or file, for c4x render), in UTF-8 bytes. A larger one is an input error.' },
        { name: 'cliFileBytes', value: MAX_CLI_FILE_BYTES, unit: 'bytes', appliesTo: 'c4x-lint', summary: 'Largest file read. A larger file is reported and not linted; the run exits 2.' },
        { name: 'nestingDepth', value: MAX_NESTING_DEPTH, unit: 'levels', appliesTo: 'C4X, PlantUML and Structurizr parsers (every entry point, the editor included)', summary: 'Boundaries, nodes, subgraphs or nested elements open at once. Deeper nesting is a located syntax error.' },
        { name: 'elements', value: MAX_ELEMENTS, unit: 'elements', appliesTo: 'validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render', summary: 'Elements and boundaries in one diagram, at every level. More is a C4X-LIMIT error.' },
        { name: 'relationships', value: MAX_RELATIONSHIPS, unit: 'relationships', appliesTo: 'validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render', summary: 'Relationships in one diagram. More is a C4X-LIMIT error.' },
        { name: 'textLength', value: MAX_TEXT_LENGTH, unit: 'characters', appliesTo: 'validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render', summary: 'One label, description, technology, tag or attribute value. Longer is a C4X-LIMIT error.' },
        { name: 'entries', value: MAX_ENTRIES, unit: 'entries', appliesTo: 'validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render', summary: '$key="value" pairs as written on one element, node or subgraph (each repeat counts); tags on one element; pairs in one elementStyle. More is a C4X-LIMIT error.' },
        { name: 'outputLineLength', value: MAX_OUTPUT_LINE_LENGTH, unit: 'characters', appliesTo: 'validate_c4x, lint_c4x, render_c4x', summary: 'One line of tool output; a longer line is cut.' },
        { name: 'findingLines', value: MAX_FINDING_LINES, unit: 'lines', appliesTo: 'lint_c4x, render_c4x', summary: 'Findings listed in one result; the heading counts them all.' },
        { name: 'toolOutputBytes', value: MAX_TOOL_OUTPUT_BYTES, unit: 'bytes', appliesTo: 'validate_c4x, lint_c4x, render_c4x', summary: 'Text in one tool result, after the other caps (the SVG of render_c4x is a separate item, bounded by renderSvgBytes).' },
        { name: 'renderElements', value: MAX_RENDER_ELEMENTS, unit: 'elements', appliesTo: 'render_c4x, c4x render', summary: 'Elements and boundaries one render lays out, at every level. More returns the findings and a "render too large" result, no SVG.' },
        { name: 'renderRelationships', value: MAX_RENDER_RELATIONSHIPS, unit: 'relationships', appliesTo: 'render_c4x, c4x render', summary: 'Relationships one render routes. More returns the findings and a "render too large" result, no SVG.' },
        { name: 'renderSvgBytes', value: MAX_RENDER_SVG_BYTES, unit: 'bytes', appliesTo: 'render_c4x, c4x render', summary: 'Largest SVG returned. A larger render returns the findings and a "render too large" result, never a partial SVG.' },
        { name: 'renderTimeMs', value: RENDER_TIME_BUDGET_MS, unit: 'milliseconds', appliesTo: 'render_c4x, c4x render', summary: 'Hard deadline for one render, enforced: a render still running then is stopped and returns its findings and no SVG (c4x render exits 3).' },
    ];
}

/** A node that carries its own source position. */
type Located = { readonly sourceRange?: { readonly start: { readonly line: number; readonly column: number } } };

/**
 * Fields whose keys or entries are written in the source (#362): attribute
 * maps (`$key="value"` on elements, nodes and subgraphs), tag lists, the
 * pairs of an `elementStyle` statement and the repeats of an attribute key.
 * They are the only places source text chooses a key or the number of
 * entries; every other key in the parse result is set by the grammar. The
 * walk treats them as opaque: it holds their keys and values to the text
 * bound and never reads a node kind inside them, so `$type="element"` is
 * text, not an element. A user-keyed field added under another name would be
 * walked as structure instead: every string in it is still checked, so the
 * walk fails closed (it could over-count, never under-check).
 *
 * The value names the list for the entry bound. Tag lists and elementStyle
 * pairs keep every entry as written, so their length is counted here. An
 * attribute map keeps one value per key and its repeats are recorded apart,
 * so neither is counted on its own: the grammar records how many pairs the
 * list held as written (ATTRIBUTE_COUNT), and that is the count held to
 * MAX_ENTRIES.
 */
const USER_KEYED_FIELDS: ReadonlyMap<string, string | undefined> = new Map([
    ['metadata', undefined],
    ['tags', 'A tag list'],
    ['properties', 'An elementStyle statement'],
    ['duplicateKeys', undefined],
]);

/** Set by the grammar on each element, node and subgraph: the `$key="value"` pairs written, repeats included. */
const ATTRIBUTE_COUNT = Symbol.for('c4x.attributeCount');

/**
 * Bound on `sourceId`, which C4XParser composes from fields the walk checks
 * one by one: a kind, an id or label, a second id for a relationship, and an
 * occurrence counter. Two ids at the text bound, with room for the rest, so
 * input inside every limit is never refused for a string it did not write.
 */
const MAX_COMPOSED_ID_LENGTH = 2 * MAX_TEXT_LENGTH + 64;

function entriesMessage(what: string, entries: number): string {
    return `${what} has ${entries} entries; C4X tools accept at most ${MAX_ENTRIES} in one attribute list, tag list or elementStyle statement.`;
}

/**
 * How a too-long string is named in the message: by the kind of node that
 * holds it and its key, then by its key alone. A Map, so a key such as
 * `constructor` cannot reach Object.prototype.
 */
const FIELD_NAMES: ReadonlyMap<string, string> = new Map([
    ['relationship.label', 'A relationship label'],
    ['relationship.technology', 'A relationship technology'],
    ['boundary.label', 'A boundary label'],
    ['elementStyle.tag', 'An elementStyle tag'],
    ['classDef.styles', 'A classDef body'],
    ['label', 'A label'],
    ['description', 'A description'],
    ['technology', 'A technology'],
    ['sprite', 'A $sprite value'],
    ['code', 'A $code value'],
    ['shape', 'A $shape value'],
    ['id', 'An identifier'],
    ['from', 'An identifier'],
    ['to', 'An identifier'],
    ['sourceId', 'A composed identifier'],
]);

function fieldName(key: string, holder: { readonly type?: unknown }): string {
    return FIELD_NAMES.get(`${String(holder.type)}.${key}`) ?? FIELD_NAMES.get(key) ?? `A text field (${key})`;
}

function tooLongMessage(what: string, length: number, bound = MAX_TEXT_LENGTH): string {
    return `${what} is ${length} characters long; C4X allows at most ${bound} in one text field.`;
}

/**
 * The first bound a parsed source exceeds, or `undefined`.
 *
 * Structurally complete (#362): the walk visits every object and array
 * reachable from the parse result, whatever field holds it, so a field the
 * grammar adds later is covered without a change here (as deployment nodes'
 * `internalRelationships`, once skipped, now are). No key is skipped: every
 * string, position objects included, is held to MAX_TEXT_LENGTH.
 *
 * Source text never steers the walk. Elements, boundaries and relationships
 * are counted by position: an item of an array in the parser-built structure
 * whose grammar-set `type` names the kind. Source-keyed fields
 * (USER_KEYED_FIELDS) are opaque: their keys and values are checked as text
 * and their entries counted against MAX_ENTRIES, but nothing inside them is
 * counted as an element or relationship. Each node is counted once however
 * many arrays share it. A finding is placed at the nearest enclosing node with
 * a source range, else 1:1.
 *
 * Linear in the size of the parse result. Iterative, so it needs no stack
 * depth; the nesting bound itself is enforced earlier, by the parser.
 */
export function findLimitViolation(parsed: ParseResult): LimitViolation | undefined {
    const seen = new Set<object>();
    let elementCount = 0;
    let relationshipCount = 0;
    let firstElementOver: Located | undefined;
    let firstRelationshipOver: Located | undefined;
    let firstProblem: LimitViolation | undefined;
    const problem = (message: string, located: Located | undefined): void => {
        if (!firstProblem) { firstProblem = { message, ...at(located) }; }
    };

    type Frame = { readonly value: object; readonly located: Located | undefined; readonly arrayItem: boolean };
    const stack: Frame[] = [{ value: parsed, located: undefined, arrayItem: false }];
    while (stack.length > 0) {
        const { value, located: outer, arrayItem } = stack.pop()!;
        if (seen.has(value)) { continue; }
        seen.add(value);
        const children: Frame[] = [];

        if (Array.isArray(value)) {
            for (const item of value) {
                if (typeof item === 'string') {
                    if (item.length > MAX_TEXT_LENGTH) { problem(tooLongMessage('A text field', item.length), outer); }
                } else if (item !== null && typeof item === 'object') {
                    children.push({ value: item as object, located: outer, arrayItem: true });
                }
            }
        } else {
            const node = value as { readonly type?: unknown } & Located;
            const located = node.sourceRange ? node : outer;
            if (arrayItem && (node.type === 'element' || node.type === 'boundary')) {
                elementCount++;
                if (elementCount === MAX_ELEMENTS + 1) { firstElementOver = located; }
            } else if (arrayItem && node.type === 'relationship') {
                relationshipCount++;
                if (relationshipCount === MAX_RELATIONSHIPS + 1) { firstRelationshipOver = located; }
            }
            const written: unknown = Reflect.get(value, ATTRIBUTE_COUNT);
            if (typeof written === 'number' && written > MAX_ENTRIES) { problem(entriesMessage('An attribute list', written), located); }
            for (const [key, child] of Object.entries(value)) {
                if (key.length > MAX_TEXT_LENGTH) { problem(tooLongMessage('A field name', key.length), located); }
                if (typeof child === 'string') {
                    // Keys here are the grammar's, never the source's (those live in USER_KEYED_FIELDS).
                    const bound = key === 'sourceId' ? MAX_COMPOSED_ID_LENGTH : MAX_TEXT_LENGTH;
                    if (child.length > bound) { problem(tooLongMessage(fieldName(key, node), child.length, bound), located); }
                } else if (child !== null && typeof child === 'object') {
                    if (USER_KEYED_FIELDS.has(key)) {
                        checkUserKeyed(child as object, USER_KEYED_FIELDS.get(key), key, located, problem);
                    } else {
                        children.push({ value: child as object, located, arrayItem: false });
                    }
                }
            }
        }
        // Depth first, in source order, so the node reported is the first one written.
        for (const frame of children.reverse()) { stack.push(frame); }
    }

    if (elementCount > MAX_ELEMENTS) {
        return { message: `The diagram has ${elementCount} elements and boundaries; C4X tools accept at most ${MAX_ELEMENTS}. Split it into several views.`, ...at(firstElementOver) };
    }
    if (relationshipCount > MAX_RELATIONSHIPS) {
        return { message: `The diagram has ${relationshipCount} relationships; C4X tools accept at most ${MAX_RELATIONSHIPS}. Split it into several views.`, ...at(firstRelationshipOver) };
    }
    return firstProblem;
}

/**
 * Check one source-keyed field as text only: its entry count when it keeps
 * every entry as written, then every key and string inside it, at any depth.
 * Nothing here is counted as a node.
 */
function checkUserKeyed(
    container: object,
    what: string | undefined,
    field: string,
    located: Located | undefined,
    problem: (message: string, located: Located | undefined) => void,
): void {
    const entries = Array.isArray(container) ? container.length : Object.keys(container).length;
    if (what !== undefined && entries > MAX_ENTRIES) { problem(entriesMessage(what, entries), located); }
    const seen = new Set<object>();
    const stack: Array<{ value: object }> = [{ value: container }];
    while (stack.length > 0) {
        const { value } = stack.pop()!;
        if (seen.has(value)) { continue; }
        seen.add(value);
        // An attribute's name is its key in a map, or the `key` of a pair.
        const pairKey = !Array.isArray(value) && typeof (value as { key?: unknown }).key === 'string' ? (value as { key: string }).key : undefined;
        const nested: Array<{ value: object }> = [];
        for (const [key, child] of Object.entries(value)) {
            if (!Array.isArray(value) && key.length > MAX_TEXT_LENGTH) { problem(tooLongMessage('An attribute name', key.length), located); }
            if (typeof child === 'string') {
                if (child.length <= MAX_TEXT_LENGTH) { continue; }
                // Map values are strings and pairs hold only `key` and `value`; a long name is reported first.
                let name: string;
                if (field === 'tags') { name = 'A tag'; }
                else if (key === 'key') { name = 'An attribute name'; }
                else { name = `The $${field === 'metadata' ? key : String(pairKey)} value`; }
                problem(tooLongMessage(name, child.length), located);
            } else if (child !== null && typeof child === 'object') {
                nested.push({ value: child as object });
            }
        }
        for (const entry of nested.reverse()) { stack.push(entry); }
    }
}

function at(node: Located | undefined): { line: number; column: number } {
    const start = node?.sourceRange?.start;
    return { line: start?.line ?? 1, column: start?.column ?? 1 };
}
