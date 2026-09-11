/**
 * Pure, syntax-aware mutation planner for native C4X source.
 *
 * The planner produces bounded UTF-16 text edits for a later WorkspaceEdit
 * service. It never writes files, never accepts arbitrary metadata keys and
 * never performs regex statement replacement.
 *
 * This foundation supports function-style ElementCall statements and the
 * parenthesised Node(...) deployment form. Bracket syntax and legacy
 * non-parenthesised Node declarations require separate serializers.
 */

import {
    BoundedTextEdit,
    SourceRange,
    isRangeConsistentWithSource,
    sourcePositionAt,
} from './SourceRange';
import { C4XParser } from '../parser/C4XParser';
import { SPRITES } from '../assets/icons';
import {
    INSPECTOR_LABEL_MAX,
    INSPECTOR_TAG_COUNT_MAX,
    INSPECTOR_TAG_LENGTH_MAX,
    INSPECTOR_TAG_RE,
    INSPECTOR_ID_RE,
} from '../webview/inspectorValidators';

/** Coordinates outside this range are rejected at the host/writeback boundary. */
export const LAYOUT_COORDINATE_LIMIT = 1_000_000;

/** Only native layout metadata owned by Visual Layout Mode is writable. */
export interface LayoutMetadataPatch {
    readonly x?: number;
    readonly y?: number;
    readonly locked?: boolean;
}

/** Parser-derived identity and range for the element being changed. */
export interface NativeElementSourceRef {
    readonly elementId: string;
    readonly range: SourceRange;
    /**
     * The exact source text this range covered when it was captured.
     *
     * `isRangeConsistentWithSource` only checks that the offsets still agree
     * with their cached line/column geometry, so an edit that preserves length
     * — `Person(a, "A")` becoming `Person(x, "X")` — passes it untouched. When
     * `expectedText` is supplied, planners reject any change to the anchored
     * slice, which is the only guard that holds for relationship statements:
     * their ids are synthetic (`rel-0`) and cannot be re-checked against the
     * source the way a declaration identifier can.
     */
    readonly expectedText?: string;
}

/** Returned when a parser-derived range no longer describes the expected element. */
export class StaleRangeError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'StaleRangeError';
    }
}

/**
 * Verify that an anchored range still describes what it claimed to describe,
 * and return the anchored statement.
 *
 * Two layers, because neither alone is sufficient:
 *   1. geometry — offsets still agree with their cached line/column
 *   2. content  — the anchored slice is byte-identical to what was captured
 *
 * Layer 2 only runs when the caller supplied `expectedText`. Callers that can
 * re-derive identity from the statement itself — an element declaration
 * carries its own id — must also assert that after parsing, which is why the
 * element planners compare `parsed.elementId` against the ref.
 */
function assertAnchorIsCurrent(
    source: string,
    target: { readonly elementId: string; readonly range: SourceRange; readonly expectedText?: string },
    kind: 'Element' | 'Relationship',
): string {
    if (!isRangeConsistentWithSource(source, target.range)) {
        throw new StaleRangeError(
            `${kind} range [${target.range.start.offset}, ${target.range.end.offset}) ` +
            'is invalid or no longer matches its cached source position',
        );
    }
    const statement = source.slice(target.range.start.offset, target.range.end.offset);
    if (target.expectedText !== undefined && statement !== target.expectedText) {
        throw new StaleRangeError(
            `${kind} "${target.elementId}" no longer matches the source text captured with its range`,
        );
    }
    return statement;
}

/** Returned when an untrusted patch is malformed or exceeds the allowlist/bounds. */
export class InvalidMetadataPatchError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'InvalidMetadataPatchError';
    }
}

/** Returned when a valid element uses syntax not covered by this serializer. */
export class UnsupportedNativeSyntaxError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedNativeSyntaxError';
    }
}

interface SerializedField {
    readonly key: 'x' | 'y' | 'w' | 'h' | 'locked';
    readonly value: string;
}

interface ParsedElementCall {
    readonly syntax: 'function' | 'bracket' | 'legacyNode';
    readonly elementId: string;
    /** Offsets of the declaration identifier inside the bounded statement. */
    readonly elementIdStart?: number;
    readonly elementIdEnd?: number;
    readonly metadataInsertAt: number;
    readonly metadata: ReadonlyMap<string, readonly KvLocation[]>;
}

interface KvLocation {
    /** Offset of the `$` prefix for the metadata key. */
    readonly keyStart: number;
    /** Offset of the value token, including quotes when present. */
    readonly valueStart: number;
    /** Offset one UTF-16 code unit past the value token. */
    readonly valueEnd: number;
}

/**
 * Plan precise updates/inserts for `$x`, `$y` and `$locked` on one element.
 *
 * The target must come from the current parser result. The planner verifies
 * both cached line/column data and the element identifier before returning
 * edits, so shifted or reused ranges fail closed.
 */
export function planMetadataUpdate(
    source: string,
    target: NativeElementSourceRef,
    patch: LayoutMetadataPatch,
): BoundedTextEdit[] {
    const fields = validateAndSerializePatch(patch);

    const statement = assertAnchorIsCurrent(source, target, 'Element');

    let parsed = parseElementCall(statement);
    if (!parsed) {
        parsed = parseBracketElement(statement);
    }
    if (!parsed) {
        parsed = parseLegacyNode(statement);
    }

    if (!parsed) {
        throw new UnsupportedNativeSyntaxError(
            `Element "${target.elementId}" is not written using a supported syntax`,
        );
    }
    if (parsed.elementId !== target.elementId) {
        throw new StaleRangeError(
            `Element range now points to "${parsed.elementId}", expected "${target.elementId}"`,
        );
    }

    const base = target.range.start.offset;
    const edits: BoundedTextEdit[] = [];
    const missing: SerializedField[] = [];

    for (const field of fields) {
        const existing = parsed.metadata.get(field.key) ?? [];
        if (existing.length > 1) {
            throw new StaleRangeError(
                `Element "${target.elementId}" contains duplicate $${field.key} metadata`,
            );
        }

        if (existing.length === 0) {
            missing.push(field);
            continue;
        }

        const location = existing[0];
        const replacement = `"${field.value}"`;
        if (statement.slice(location.valueStart, location.valueEnd) === replacement) {
            continue;
        }

        edits.push({
            range: buildRange(source, base + location.valueStart, base + location.valueEnd),
            newText: replacement,
        });
    }

    // Missing fields share one deterministic insertion edit in canonical
    // x/y/locked order. This avoids ambiguous same-offset WorkspaceEdits.
    if (missing.length > 0) {
        const insertOffset = base + parsed.metadataInsertAt;
        let insertText = '';
        if (parsed.syntax === 'bracket' || parsed.syntax === 'legacyNode') {
            if (parsed.metadata.size === 0) {
                insertText = ' ' + missing.map((field, idx) =>
                    `${idx === 0 ? '' : ', '}$${field.key}="${field.value}"`
                ).join('');
            } else {
                insertText = missing.map(field => `, $${field.key}="${field.value}"`).join('');
            }
        } else {
            insertText = missing.map(field => `, $${field.key}="${field.value}"`).join('');
        }
        edits.push({
            range: buildRange(source, insertOffset, insertOffset),
            newText: insertText,
        });
    }

    return edits.sort((a, b) => {
        const byStart = a.range.start.offset - b.range.start.offset;
        return byStart !== 0 ? byStart : a.range.end.offset - b.range.end.offset;
    });
}

function validateAndSerializePatch(patch: LayoutMetadataPatch): SerializedField[] {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        throw new InvalidMetadataPatchError('Layout metadata patch must be a plain object');
    }

    const record = patch as object;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidMetadataPatchError('Layout metadata patch must be a plain object');
    }

    const allowedKeys = new Set(['x', 'y', 'locked']);
    for (const key of Reflect.ownKeys(record)) {
        if (typeof key !== 'string' || !allowedKeys.has(key)) {
            throw new InvalidMetadataPatchError(`Unsupported layout metadata key "${String(key)}"`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor || !('value' in descriptor)) {
            throw new InvalidMetadataPatchError(`Layout metadata key "${key}" must be a data value`);
        }
    }

    const fields: SerializedField[] = [];
    const x = ownDataValue(record, 'x');
    const y = ownDataValue(record, 'y');
    const locked = ownDataValue(record, 'locked');

    if (x !== undefined) {
        fields.push({ key: 'x', value: serializeCoordinate('x', x) });
    }
    if (y !== undefined) {
        fields.push({ key: 'y', value: serializeCoordinate('y', y) });
    }
    if (locked !== undefined) {
        if (typeof locked !== 'boolean') {
            throw new InvalidMetadataPatchError('$locked must be a boolean');
        }
        fields.push({ key: 'locked', value: locked ? 'true' : 'false' });
    }

    return fields;
}

function ownDataValue(record: object, key: string): unknown {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    return descriptor && 'value' in descriptor ? descriptor.value : undefined;
}

function serializeCoordinate(name: 'x' | 'y', value: unknown): string {
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < -LAYOUT_COORDINATE_LIMIT ||
        value > LAYOUT_COORDINATE_LIMIT
    ) {
        throw new InvalidMetadataPatchError(
            `$${name} must be a finite number between ` +
            `${-LAYOUT_COORDINATE_LIMIT} and ${LAYOUT_COORDINATE_LIMIT}`,
        );
    }

    return Object.is(value, -0) ? '0' : String(value);
}

/** Parse only the function-call envelope and top-level KV tokens we own. */
function parseElementCall(statement: string): ParsedElementCall | null {
    let cursor = skipWhitespace(statement, 0);
    const type = readIdentifier(statement, cursor);
    if (!type) { return null; }
    cursor = skipWhitespace(statement, type.end);
    if (statement.charAt(cursor) !== '(') { return null; }
    const openParen = cursor;

    cursor = skipWhitespace(statement, cursor + 1);
    const elementId = readIdentifier(statement, cursor);
    if (!elementId) { return null; }

    const closeParen = findClosingParen(statement, openParen);
    if (closeParen === -1) {
        throw new StaleRangeError('Element range ends before its closing parenthesis');
    }

    const afterCall = skipWhitespace(statement, closeParen + 1);
    const isDeploymentBlock = type.value === 'Node' && statement.charAt(afterCall) === '{';
    if (afterCall !== statement.length && !isDeploymentBlock) {
        throw new StaleRangeError('Element range contains unexpected text after its declaration');
    }

    return {
        syntax: 'function',
        elementId: elementId.value,
        elementIdStart: cursor,
        elementIdEnd: elementId.end,
        metadataInsertAt: findMetadataInsertOffset(statement, closeParen),
        metadata: scanMetadata(statement, openParen + 1, closeParen),
    };
}

/** Parse bracket-style node declarations. */
function parseBracketElement(statement: string): ParsedElementCall | null {
    let cursor = skipWhitespace(statement, 0);
    const elementId = readIdentifier(statement, cursor);
    if (!elementId) { return null; }

    cursor = skipWhitespace(statement, elementId.end);
    if (statement.charAt(cursor) !== '[') { return null; }

    const closeBracket = findClosingBracket(statement, cursor);
    if (closeBracket === -1) {
        throw new StaleRangeError('Element range ends before its closing bracket');
    }

    const metadataStart = closeBracket + 1;
    const metadataEnd = statement.length;
    const metadata = scanMetadata(statement, metadataStart, metadataEnd);

    let metadataInsertAt = closeBracket + 1;
    if (metadata.size > 0) {
        let maxEnd = closeBracket + 1;
        for (const locs of metadata.values()) {
            for (const loc of locs) {
                if (loc.valueEnd > maxEnd) {
                    maxEnd = loc.valueEnd;
                }
            }
        }
        metadataInsertAt = maxEnd;
    }

    return {
        syntax: 'bracket',
        elementId: elementId.value,
        metadataInsertAt,
        metadata,
    };
}

/** Parse legacy non-parenthesized Node subgraph declarations. */
function parseLegacyNode(statement: string): ParsedElementCall | null {
    const cursor = skipWhitespace(statement, 0);
    const type = readIdentifier(statement, cursor);
    if (!type || type.value !== 'Node') { return null; }

    const nextChar = skipWhitespace(statement, type.end);
    if (statement.charAt(nextChar) === '(') {
        return null;
    }

    const openBrace = statement.indexOf('{');
    if (openBrace === -1) {
        return null;
    }

    const labelCursor = skipWhitespace(statement, type.end);
    if (statement.charAt(labelCursor) !== '"') {
        return null;
    }
    const labelEnd = statement.indexOf('"', labelCursor + 1);
    if (labelEnd === -1 || labelEnd > openBrace) {
        return null;
    }
    const labelValue = statement.slice(labelCursor + 1, labelEnd);
    const generatedId = labelValue.replace(/[^a-zA-Z0-9]/g, '');

    const metadataStart = labelEnd + 1;
    const metadataEnd = openBrace;
    const metadata = scanMetadata(statement, metadataStart, metadataEnd);

    let metadataInsertAt = findMetadataInsertOffset(statement, openBrace);
    if (metadata.size > 0) {
        let maxEnd = metadataStart;
        for (const locs of metadata.values()) {
            for (const loc of locs) {
                if (loc.valueEnd > maxEnd) {
                    maxEnd = loc.valueEnd;
                }
            }
        }
        metadataInsertAt = maxEnd;
    }

    return {
        syntax: 'legacyNode',
        elementId: generatedId,
        metadataInsertAt,
        metadata,
    };
}

/** Insert after the last argument but before whitespace leading to delimiter. */
function findMetadataInsertOffset(text: string, limitOffset: number): number {
    let cursor = limitOffset;
    while (cursor > 0) {
        const previous = text.charAt(cursor - 1);
        if (previous !== ' ' && previous !== '\t' && previous !== '\r' && previous !== '\n') {
            break;
        }
        cursor--;
    }
    return cursor;
}

function scanMetadata(text: string, start: number, end: number): ReadonlyMap<string, readonly KvLocation[]> {
    const locations = new Map<string, KvLocation[]>();
    let cursor = start;
    let inQuote = false;

    while (cursor < end) {
        const char = text.charAt(cursor);
        if (char === '"') {
            inQuote = !inQuote;
            cursor++;
            continue;
        }
        if (inQuote || char !== '$') {
            cursor++;
            continue;
        }

        const key = readIdentifier(text, cursor + 1);
        if (!key) {
            cursor++;
            continue;
        }

        let valueStart = skipWhitespace(text, key.end);
        if (text.charAt(valueStart) !== '=') {
            cursor = key.end;
            continue;
        }
        valueStart = skipWhitespace(text, valueStart + 1);
        if (valueStart >= end) {
            throw new StaleRangeError(`Metadata $${key.value} has no value`);
        }

        const valueEnd = scanMetadataValue(text, valueStart, end, key.value);
        const entries = locations.get(key.value) ?? [];
        entries.push({ keyStart: cursor, valueStart, valueEnd });
        locations.set(key.value, entries);
        cursor = valueEnd;
    }

    if (inQuote) {
        throw new StaleRangeError('Element range contains an unterminated quoted value');
    }
    return locations;
}

function scanMetadataValue(text: string, start: number, end: number, key: string): number {
    if (text.charAt(start) === '"') {
        const closeQuote = text.indexOf('"', start + 1);
        if (closeQuote === -1 || closeQuote >= end) {
            throw new StaleRangeError(`Metadata $${key} has an unterminated quoted value`);
        }
        return closeQuote + 1;
    }

    let cursor = start;
    while (cursor < end && !isMetadataDelimiter(text.charAt(cursor))) {
        cursor++;
    }
    if (cursor === start) {
        throw new StaleRangeError(`Metadata $${key} has an empty value`);
    }
    return cursor;
}

function findClosingParen(text: string, openParen: number): number {
    let inQuote = false;
    for (let cursor = openParen + 1; cursor < text.length; cursor++) {
        const char = text.charAt(cursor);
        if (char === '"') {
            inQuote = !inQuote;
        } else if (!inQuote && char === ')') {
            return cursor;
        }
    }
    return -1;
}

function findClosingBracket(text: string, openBracket: number): number {
    let inQuote = false;
    for (let cursor = openBracket + 1; cursor < text.length; cursor++) {
        const char = text.charAt(cursor);
        if (char === '"') {
            inQuote = !inQuote;
        } else if (!inQuote && char === ']') {
            return cursor;
        }
    }
    return -1;
}

function readIdentifier(text: string, start: number): { value: string; end: number } | null {
    if (start >= text.length || !isIdentifierStart(text.charAt(start))) {
        return null;
    }
    let end = start + 1;
    while (end < text.length && isIdentifierPart(text.charAt(end))) {
        end++;
    }
    return { value: text.slice(start, end), end };
}

function isIdentifierStart(char: string): boolean {
    const code = char.charCodeAt(0);
    return char === '_' || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isIdentifierPart(char: string): boolean {
    const code = char.charCodeAt(0);
    return isIdentifierStart(char) || char === '-' || (code >= 48 && code <= 57);
}

function skipWhitespace(text: string, start: number): number {
    let cursor = start;
    while (cursor < text.length) {
        const char = text.charAt(cursor);
        if (char !== ' ' && char !== '\t' && char !== '\r' && char !== '\n') {
            break;
        }
        cursor++;
    }
    return cursor;
}

function isMetadataDelimiter(char: string): boolean {
    return char === ',' || char === ')' || char === ']' || char === '{' || char === ' ' || char === '\t' || char === '\r' || char === '\n';
}

function buildRange(source: string, startOffset: number, endOffset: number): SourceRange {
    return {
        start: sourcePositionAt(source, startOffset),
        end: sourcePositionAt(source, endOffset),
    };
}

/**
 * Validates a relationship label for native writeback: non-empty, bounded,
 * and free of characters that would break the `a -->|label| b` grammar form.
 */
function validateRelationshipLabel(label: string): string {
    const trimmed = label.trim();
    if (trimmed.length === 0) {
        throw new InvalidMetadataPatchError('Relationship label must not be empty; pass null to clear it instead.');
    }
    if (trimmed.length > SEMANTIC_TEXT_LIMIT) {
        throw new InvalidMetadataPatchError(`Relationship label must be at most ${SEMANTIC_TEXT_LIMIT} characters.`);
    }
    if (trimmed.includes('"') || /[\r\n]/.test(trimmed)) {
        throw new InvalidMetadataPatchError('Relationship label must not contain quotation marks or line breaks.');
    }
    if (trimmed.includes('|')) {
        throw new InvalidMetadataPatchError('Relationship label must not contain the pipe character (|).');
    }
    return trimmed;
}

const RELATIONSHIP_ARROW_RE = /-->|-.->|==>/;

const ARROW_TO_REL_TYPE: ReadonlyMap<string, string> = new Map([
    ['-->', 'uses'],
    ['-.->', 'async'],
    ['==>', 'sync'],
]);

const REL_TYPE_TO_ARROW: ReadonlyMap<string, string> = new Map([
    ['uses', '-->'],
    ['async', '-.->'],
    ['sync', '==>'],
]);

const RELATIONSHIP_REL_TYPES: readonly string[] = ['uses', 'async', 'sync'];

/**
 * Validates a relationship technology value: bounded single-line string without
 * characters that would break the quoted `from -->|label| "tech" to` grammar.
 */
function validateRelationshipTechnology(technology: string): string {
    if (technology.length > SEMANTIC_TEXT_LIMIT) {
        throw new InvalidMetadataPatchError(`Relationship technology must be at most ${SEMANTIC_TEXT_LIMIT} characters.`);
    }
    if (technology.includes('"') || /[\r\n]/.test(technology)) {
        throw new InvalidMetadataPatchError('Relationship technology must be a single-line string without quotation marks.');
    }
    return technology;
}

/**
 * Plans a bounded update of a relationship's label in native C4X source.
 * The relationship statement has the form `from -->|label| to`; the label
 * span between the pipes is the only text ever touched. Passing `null`
 * removes the `|label|` segment entirely (clearing the label).
 */
export function planRelationshipLabelUpdate(
    source: string,
    target: NativeElementSourceRef,
    newLabel: string | null,
): BoundedTextEdit[] {
    const statement = assertAnchorIsCurrent(source, target, 'Relationship');
    const base = target.range.start.offset;
    const arrowMatch = RELATIONSHIP_ARROW_RE.exec(statement);
    if (!arrowMatch) {
        throw new StaleRangeError(`Relationship "${target.elementId}" has no arrow in its source statement`);
    }
    const arrowEnd = arrowMatch.index + arrowMatch[0].length;

    const firstPipe = statement.indexOf('|', arrowEnd);
    if (firstPipe !== -1) {
        const secondPipe = statement.indexOf('|', firstPipe + 1);
        if (secondPipe === -1) {
            throw new StaleRangeError(`Relationship "${target.elementId}" has an unterminated label segment`);
        }
        if (newLabel === null) {
            // Clear: remove the whole |label| segment, collapsing a doubled
            // space if one forms around the arrow.
            const removeStart = firstPipe;
            let removeEnd = secondPipe + 1;
            if (statement[removeStart - 1] === ' ' && statement[removeEnd] === ' ') {
                removeEnd += 1;
            }
            return [{ range: buildRange(source, base + removeStart, base + removeEnd), newText: '' }];
        }
        const label = validateRelationshipLabel(newLabel);
        return [{ range: buildRange(source, base + firstPipe + 1, base + secondPipe), newText: label }];
    }

    // No label segment present.
    if (newLabel === null) {
        return [];
    }
    const label = validateRelationshipLabel(newLabel);
    return [{ range: buildRange(source, base + arrowEnd, base + arrowEnd), newText: `|${label}|` }];
}

/**
 * Plans a bounded update of a relationship's optional technology in native C4X
 * source. The technology is the quoted segment after the label (or after the
 * arrow when there is no label): `from -->|label| "tech" to`. Passing `null`
 * removes the quoted segment entirely.
 */
export function planRelationshipTechnologyUpdate(
    source: string,
    target: NativeElementSourceRef,
    newTechnology: string | null,
): BoundedTextEdit[] {
    const statement = assertAnchorIsCurrent(source, target, 'Relationship');
    const parsed = parseRelationshipStatement(statement);
    const base = target.range.start.offset;

    if (parsed.technology) {
        if (newTechnology === null) {
            // Remove the quoted technology and one surrounding space if one forms.
            const removeStart = parsed.technology.start;
            let removeEnd = parsed.technology.end;
            if (statement[removeStart - 1] === ' ' && statement[removeEnd] === ' ') {
                removeEnd += 1;
            }
            return [{ range: buildRange(source, base + removeStart, base + removeEnd), newText: '' }];
        }
        const technology = validateRelationshipTechnology(newTechnology);
        return [{
            range: buildRange(source, base + parsed.technology.start + 1, base + parsed.technology.end - 1),
            newText: technology,
        }];
    }

    if (newTechnology === null) {
        return [];
    }
    const technology = validateRelationshipTechnology(newTechnology);
    const insertAt = parsed.label ? parsed.label.end : parsed.arrowEnd;
    return [{ range: buildRange(source, base + insertAt, base + insertAt), newText: ` "${technology}"` }];
}

/**
 * Plans a bounded update of a relationship's arrow kind, which encodes its
 * relType in native C4X source. Only the arrow token itself is replaced.
 */
export function planRelationshipTypeUpdate(
    source: string,
    target: NativeElementSourceRef,
    newRelType: string,
): BoundedTextEdit[] {
    const statement = assertAnchorIsCurrent(source, target, 'Relationship');

    const arrow = REL_TYPE_TO_ARROW.get(newRelType);
    if (!arrow) {
        throw new InvalidMetadataPatchError(`Unsupported relationship type "${newRelType}". Must be one of: ${RELATIONSHIP_REL_TYPES.join(', ')}.`);
    }

    const parsed = parseRelationshipStatement(statement);
    const base = target.range.start.offset;

    const currentRelType = ARROW_TO_REL_TYPE.get(statement.slice(parsed.arrow.start, parsed.arrow.end));
    if (currentRelType === newRelType) {
        return [];
    }

    return [{ range: buildRange(source, base + parsed.arrow.start, base + parsed.arrow.end), newText: arrow }];
}

/**
 * Plans a bounded update of one relationship endpoint (`from` or `to`) in
 * native C4X source. The caller is responsible for legality validation against
 * the C4 model and for ensuring the replacement identifier references an
 * existing element.
 */
export function planRelationshipEndpointUpdate(
    source: string,
    target: NativeElementSourceRef,
    field: 'from' | 'to',
    newEndpointId: string,
): BoundedTextEdit[] {
    const statement = assertAnchorIsCurrent(source, target, 'Relationship');

    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(newEndpointId)) {
        throw new InvalidMetadataPatchError('Relationship endpoint must be a valid C4X identifier');
    }

    const parsed = parseRelationshipStatement(statement);
    const base = target.range.start.offset;
    const endpoint = parsed[field];

    if (statement.slice(endpoint.start, endpoint.end) === newEndpointId) {
        return [];
    }

    return [{ range: buildRange(source, base + endpoint.start, base + endpoint.end), newText: newEndpointId }];
}

/**
 * Plans the insertion of a new native C4X relationship statement immediately
 * after the source element declaration. The caller is responsible for C4
 * legality validation against the model.
 */
export function planRelationshipAdd(
    source: string,
    sourceRef: NativeElementSourceRef,
    targetId: string,
    label: string,
    technology: string | null,
    relType: 'uses' | 'async' | 'sync',
): BoundedTextEdit[] {
    // The insertion point is derived from the source element's declaration, so
    // the anchor must still describe that element. Geometry alone cannot see a
    // same-length rewrite (BUG-1), hence the identity re-derivation below.
    const anchoredStatement = assertAnchorIsCurrent(source, sourceRef, 'Element');
    const anchoredElement = parseElementCall(anchoredStatement)
        ?? parseBracketElement(anchoredStatement)
        ?? parseLegacyNode(anchoredStatement);
    if (!anchoredElement) {
        throw new StaleRangeError(
            `Element range no longer contains a recognisable declaration for "${sourceRef.elementId}"`,
        );
    }
    if (anchoredElement.elementId !== sourceRef.elementId) {
        throw new StaleRangeError(
            `Element range now points to "${anchoredElement.elementId}", expected "${sourceRef.elementId}"`,
        );
    }

    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(targetId)) {
        throw new InvalidMetadataPatchError('Relationship target must be a valid C4X identifier');
    }

    const arrow = REL_TYPE_TO_ARROW.get(relType);
    if (!arrow) {
        throw new InvalidMetadataPatchError(`Unsupported relationship type "${relType}". Must be one of: ${RELATIONSHIP_REL_TYPES.join(', ')}.`);
    }

    const validatedLabel = validateRelationshipLabel(label);

    let technologySegment = '';
    if (technology !== null && technology.length > 0) {
        technologySegment = ` "${validateRelationshipTechnology(technology)}"`;
    }

    const statement = `${sourceRef.elementId} ${arrow}|${validatedLabel}|${technologySegment} ${targetId}`;

    const insertOffset = sourceRef.range.end.offset;
    const indentation = extractLineIndentation(source, sourceRef.range.start.offset);
    let newText = '\n' + indentation + statement;
    if (source.charAt(insertOffset) !== '\n') {
        newText += '\n';
    }

    return [{ range: buildRange(source, insertOffset, insertOffset), newText }];
}

function extractLineIndentation(source: string, offset: number): string {
    let lineStart = offset;
    while (lineStart > 0 && source.charAt(lineStart - 1) !== '\n') {
        lineStart--;
    }
    let idx = lineStart;
    while (idx < offset && /[ \t]/.test(source.charAt(idx))) {
        idx++;
    }
    return source.slice(lineStart, idx);
}

/**
 * Plans the removal of all visual layout metadata ($x, $y, $locked) on an element.
 */
export function planMetadataReset(
    source: string,
    target: NativeElementSourceRef
): BoundedTextEdit[] {
    const statement = assertAnchorIsCurrent(source, target, 'Element');

    let parsed = parseElementCall(statement);
    if (!parsed) { parsed = parseBracketElement(statement); }
    if (!parsed) { parsed = parseLegacyNode(statement); }

    if (!parsed) { return []; }
    if (parsed.elementId !== target.elementId) {
        throw new StaleRangeError(
            `Element range now points to "${parsed.elementId}", expected "${target.elementId}"`,
        );
    }

    const base = target.range.start.offset;
    const edits: BoundedTextEdit[] = [];
    const keysToRemove = ['x', 'y', 'locked'];

    for (const key of keysToRemove) {
        const locations = parsed.metadata.get(key) ?? [];
        for (const loc of locations) {
            let kvStart = loc.valueStart - 1;
            while (kvStart >= 0 && statement.charAt(kvStart) !== '$') {
                kvStart--;
            }
            if (kvStart >= 0) {
                let startOffset = kvStart;
                let endOffset = loc.valueEnd;

                // Check for trailing comma or leading comma to clean up delimiters
                let leadingComma = startOffset - 1;
                while (leadingComma >= 0 && (statement.charAt(leadingComma) === ' ' || statement.charAt(leadingComma) === '\t')) {
                    leadingComma--;
                }
                if (leadingComma >= 0 && statement.charAt(leadingComma) === ',') {
                    startOffset = leadingComma;
                } else {
                    let trailingComma = endOffset;
                    while (trailingComma < statement.length && (statement.charAt(trailingComma) === ' ' || statement.charAt(trailingComma) === '\t')) {
                        trailingComma++;
                    }
                    if (trailingComma < statement.length && statement.charAt(trailingComma) === ',') {
                        endOffset = trailingComma + 1;
                    }
                }

                edits.push({
                    range: buildRange(source, base + startOffset, base + endOffset),
                    newText: ''
                });
            }
        }
    }

    return edits.sort((a, b) => b.range.start.offset - a.range.start.offset);
}

/** Coordinates/size outside this range are rejected at the host/writeback boundary. */
export const BOUNDARY_LAYOUT_COORDINATE_LIMIT = 1_000_000;

/** Only native layout metadata owned by Visual Layout Mode is writable for boundaries. */
export interface BoundaryLayoutMetadataPatch {
    readonly x?: number;
    readonly y?: number;
    readonly w?: number;
    readonly h?: number;
}

/** Parser-derived identity and range for the boundary being changed. */
export interface NativeBoundarySourceRef {
    readonly boundaryLabel: string;
    readonly range: SourceRange;
}

interface ParsedSubgraph {
    readonly boundaryLabel: string;
    readonly metadataInsertAt: number;
    readonly metadata: ReadonlyMap<string, readonly KvLocation[]>;
}

/**
 * Plan precise updates/inserts for `$x`, `$y`, `$w` and `$h` on a subgraph
 * boundary declaration.
 *
 * The target must come from the current parser result. The planner verifies
 * both cached line/column data and the boundary label before returning edits,
 * so shifted or reused ranges fail closed.
 */
export function planBoundaryMetadataUpdate(
    source: string,
    target: NativeBoundarySourceRef,
    patch: BoundaryLayoutMetadataPatch,
): BoundedTextEdit[] {
    const fields = validateAndSerializeBoundaryPatch(patch);

    if (!isRangeConsistentWithSource(source, target.range)) {
        throw new StaleRangeError(
            `Boundary range [${target.range.start.offset}, ${target.range.end.offset}) ` +
            'is invalid or no longer matches its cached source position',
        );
    }

    const statement = source.slice(target.range.start.offset, target.range.end.offset);
    const parsed = parseSubgraphStatement(statement);
    if (!parsed) {
        throw new UnsupportedNativeSyntaxError(
            `Boundary "${target.boundaryLabel}" is not written using supported subgraph syntax`,
        );
    }
    if (parsed.boundaryLabel !== target.boundaryLabel) {
        throw new StaleRangeError(
            `Boundary range now points to "${parsed.boundaryLabel}", expected "${target.boundaryLabel}"`,
        );
    }

    const base = target.range.start.offset;
    const edits: BoundedTextEdit[] = [];
    const missing: SerializedField[] = [];

    for (const field of fields) {
        const existing = parsed.metadata.get(field.key) ?? [];
        if (existing.length > 1) {
            throw new StaleRangeError(
                `Boundary "${target.boundaryLabel}" contains duplicate $${field.key} metadata`,
            );
        }

        if (existing.length === 0) {
            missing.push(field);
            continue;
        }

        const location = existing[0];
        const replacement = `"${field.value}"`;
        if (statement.slice(location.valueStart, location.valueEnd) === replacement) {
            continue;
        }

        edits.push({
            range: buildRange(source, base + location.valueStart, base + location.valueEnd),
            newText: replacement,
        });
    }

    if (missing.length > 0) {
        const insertOffset = base + parsed.metadataInsertAt;
        const needsLeadingSpace = parsed.metadata.size === 0;
        const insertText = missing.map((field, idx) =>
            `${idx === 0 ? (needsLeadingSpace ? ' ' : ', ') : ', '}$${field.key}="${field.value}"`
        ).join('');
        edits.push({
            range: buildRange(source, insertOffset, insertOffset),
            newText: insertText,
        });
    }

    return edits.sort((a, b) => {
        const byStart = a.range.start.offset - b.range.start.offset;
        return byStart !== 0 ? byStart : a.range.end.offset - b.range.end.offset;
    });
}

function validateAndSerializeBoundaryPatch(patch: BoundaryLayoutMetadataPatch): SerializedField[] {
    if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
        throw new InvalidMetadataPatchError('Boundary layout metadata patch must be a plain object');
    }

    const record = patch as object;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
        throw new InvalidMetadataPatchError('Boundary layout metadata patch must be a plain object');
    }

    const allowedKeys = new Set(['x', 'y', 'w', 'h']);
    for (const key of Reflect.ownKeys(record)) {
        if (typeof key !== 'string' || !allowedKeys.has(key)) {
            throw new InvalidMetadataPatchError(`Unsupported boundary layout metadata key "${String(key)}"`);
        }
        const descriptor = Object.getOwnPropertyDescriptor(record, key);
        if (!descriptor || !('value' in descriptor)) {
            throw new InvalidMetadataPatchError(`Boundary layout metadata key "${key}" must be a data value`);
        }
    }

    const fields: SerializedField[] = [];
    const x = ownDataValue(record, 'x');
    const y = ownDataValue(record, 'y');
    const w = ownDataValue(record, 'w');
    const h = ownDataValue(record, 'h');

    if (x !== undefined) {
        fields.push({ key: 'x', value: serializeBoundaryCoordinate('x', x) });
    }
    if (y !== undefined) {
        fields.push({ key: 'y', value: serializeBoundaryCoordinate('y', y) });
    }
    if (w !== undefined) {
        fields.push({ key: 'w', value: serializeBoundaryCoordinate('w', w) });
    }
    if (h !== undefined) {
        fields.push({ key: 'h', value: serializeBoundaryCoordinate('h', h) });
    }

    return fields;
}

function serializeBoundaryCoordinate(name: 'x' | 'y' | 'w' | 'h', value: unknown): string {
    if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        value < -BOUNDARY_LAYOUT_COORDINATE_LIMIT ||
        value > BOUNDARY_LAYOUT_COORDINATE_LIMIT
    ) {
        throw new InvalidMetadataPatchError(
            `$${name} must be a finite number between ` +
            `${-BOUNDARY_LAYOUT_COORDINATE_LIMIT} and ${BOUNDARY_LAYOUT_COORDINATE_LIMIT}`,
        );
    }

    return Object.is(value, -0) ? '0' : String(value);
}

/** Parse a subgraph statement and locate its metadata region (between label and `{`). */
function parseSubgraphStatement(statement: string): ParsedSubgraph | null {
    let cursor = skipWhitespace(statement, 0);
    const keyword = readIdentifier(statement, cursor);
    if (!keyword || keyword.value !== 'subgraph') {
        return null;
    }
    cursor = skipWhitespace(statement, keyword.end);
    const label = readIdentifier(statement, cursor);
    if (!label) {
        return null;
    }

    const openBrace = statement.indexOf('{', label.end);
    if (openBrace === -1) {
        return null;
    }

    const metadataStart = label.end;
    const metadataEnd = openBrace;
    const metadata = scanMetadata(statement, metadataStart, metadataEnd);

    let metadataInsertAt = metadataStart;
    if (metadata.size > 0) {
        let maxEnd = metadataStart;
        for (const locs of metadata.values()) {
            for (const loc of locs) {
                if (loc.valueEnd > maxEnd) {
                    maxEnd = loc.valueEnd;
                }
            }
        }
        metadataInsertAt = maxEnd;
    }

    return {
        boundaryLabel: label.value,
        metadataInsertAt,
        metadata,
    };
}

/** Imported from inspectorValidators — single source of truth for field bounds. */
const SEMANTIC_TEXT_LIMIT = INSPECTOR_LABEL_MAX;
const DESCRIPTION_TEXT_LIMIT = 4_096;
const MAX_TAG_COUNT = INSPECTOR_TAG_COUNT_MAX;
const MAX_TAG_LENGTH = INSPECTOR_TAG_LENGTH_MAX;
const IDENTIFIER_RE = INSPECTOR_ID_RE;
const TAG_RE = INSPECTOR_TAG_RE;

export interface NativeElementTextPatch {
    readonly label?: string;
    /** `null` removes technology when a description does not require its slot. */
    readonly technology?: string | null;
    /** `null` is serialized as an empty description slot. */
    readonly description?: string | null;
}

export interface NativeElementAttributePatch {
    readonly tags?: readonly string[];
    /** `null` removes the `$sprite` attribute. */
    readonly sprite?: string | null;
}

/**
 * Plans a precise description update for a native C4X element call. When a
 * description is introduced, the positional technology slot is initialized
 * with an empty string to keep the C4X grammar unambiguous.
 */
export function planElementDescriptionUpdate(
    source: string,
    target: NativeElementSourceRef,
    newDescription: string | null,
): BoundedTextEdit[] {
    return planElementTextUpdates(source, target, { description: newDescription });
}

/** Plans a bounded replacement of the first quoted (label) argument in a C4X element call. */
export function planElementLabelUpdate(
    source: string,
    target: NativeElementSourceRef,
    newLabel: string,
): BoundedTextEdit[] {
    return planElementTextUpdates(source, target, { label: newLabel });
}

/**
 * Plans a bounded update of the positional technology argument. If the
 * element has a description, clearing technology retains an empty `""` slot
 * so that description remains the fourth positional argument.
 */
export function planElementTechnologyUpdate(
    source: string,
    target: NativeElementSourceRef,
    newTechnology: string | null,
): BoundedTextEdit[] {
    return planElementTextUpdates(source, target, { technology: newTechnology });
}

/** Plans a bounded update of the `$tags="..."` attribute on a native C4X element. */
export function planElementTagsUpdate(
    source: string,
    target: NativeElementSourceRef,
    newTags: readonly string[],
): BoundedTextEdit[] {
    return planElementAttributeUpdates(source, target, { tags: newTags });
}

/** Plans a bounded update or removal of the `$sprite=...` attribute using the shipped sprite catalogue. */
export function planElementSpriteUpdate(
    source: string,
    target: NativeElementSourceRef,
    newSprite: string | null,
): BoundedTextEdit[] {
    return planElementAttributeUpdates(source, target, { sprite: newSprite });
}

/**
 * Plans all positional element text changes together. This avoids ambiguous
 * same-offset inserts when a user edits technology and description in one
 * staged transaction.
 */
export function planElementTextUpdates(
    source: string,
    target: NativeElementSourceRef,
    patch: NativeElementTextPatch,
): BoundedTextEdit[] {
    validateTextPatch(patch);
    const { statement, base } = parseSupportedFunctionElement(source, target, 'text edits');
    const openParen = statement.indexOf('(');
    const closeParen = findClosingParen(statement, openParen);
    if (openParen === -1 || closeParen === -1) {
        throw new StaleRangeError('Function parentheses not found');
    }

    const metadataStart = firstMetadataOffset(statement, openParen + 1, closeParen);
    const quotes = scanQuotedStrings(statement, openParen + 1, metadataStart);
    if (quotes.length === 0 || quotes.length > 3) {
        throw new StaleRangeError('Element call must have one label and at most technology and description arguments');
    }

    const edits: BoundedTextEdit[] = [];
    const currentTechnology = quotes.length >= 2 ? unquote(statement, quotes[1]) : undefined;
    const currentDescription = quotes.length >= 3 ? unquote(statement, quotes[2]) : undefined;

    if (patch.label !== undefined && patch.label !== unquote(statement, quotes[0])) {
        edits.push(replaceQuote(source, base, quotes[0], patch.label));
    }

    const wantsDescription = patch.description !== undefined;
    const requestedDescription = patch.description ?? null;
    const requestedTechnology = patch.technology;

    if (quotes.length === 1) {
        if (wantsDescription) {
            const technology = requestedTechnology === undefined || requestedTechnology === null ? '' : requestedTechnology;
            edits.push(insertAt(source, base + quotes[0].end, `, "${technology}", "${requestedDescription ?? ''}"`));
        } else if (requestedTechnology !== undefined && requestedTechnology !== null) {
            edits.push(insertAt(source, base + quotes[0].end, `, "${requestedTechnology}"`));
        }
    } else if (quotes.length === 2) {
        if (requestedTechnology !== undefined && requestedTechnology !== currentTechnology) {
            if (requestedTechnology === null && !wantsDescription) {
                edits.push(removeArgument(source, base, statement, quotes[1]));
            } else {
                edits.push(replaceQuote(source, base, quotes[1], requestedTechnology ?? ''));
            }
        }
        if (wantsDescription && requestedDescription !== currentDescription) {
            edits.push(insertAt(source, base + quotes[1].end, `, "${requestedDescription ?? ''}"`));
        }
    } else {
        if (requestedTechnology !== undefined && requestedTechnology !== currentTechnology) {
            edits.push(replaceQuote(source, base, quotes[1], requestedTechnology ?? ''));
        }
        if (wantsDescription && requestedDescription !== currentDescription) {
            edits.push(replaceQuote(source, base, quotes[2], requestedDescription ?? ''));
        }
    }

    return sortEdits(edits);
}

/**
 * Plans the `$tags` and `$sprite` attributes together so two newly inserted
 * attributes always share one deterministic insertion edit rather than an
 * ambiguous same source offset.
 */
export function planElementAttributeUpdates(
    source: string,
    target: NativeElementSourceRef,
    patch: NativeElementAttributePatch,
): BoundedTextEdit[] {
    validateAttributePatch(patch);
    const { statement, parsed, base } = parseSupportedFunctionElement(source, target, 'attributes');
    const edits: BoundedTextEdit[] = [];
    const missing: string[] = [];

    if (patch.tags !== undefined) {
        const existing = onlyMetadataLocation(parsed, 'tags');
        if (patch.tags.length === 0) {
            if (existing) {
                edits.push(removeMetadataEntry(source, base, statement, existing));
            }
        } else {
            const serializedTags = patch.tags.join(',');
            if (existing) {
                const replacement = `"${serializedTags}"`;
                if (statement.slice(existing.valueStart, existing.valueEnd) !== replacement) {
                    edits.push({
                        range: buildRange(source, base + existing.valueStart, base + existing.valueEnd),
                        newText: replacement,
                    });
                }
            } else {
                missing.push(`$tags="${serializedTags}"`);
            }
        }
    }

    if (patch.sprite !== undefined) {
        const existing = onlyMetadataLocation(parsed, 'sprite');
        if (patch.sprite === null) {
            if (existing) {
                edits.push(removeMetadataEntry(source, base, statement, existing));
            }
        } else if (existing) {
            if (statement.slice(existing.valueStart, existing.valueEnd) !== patch.sprite) {
                edits.push({
                    range: buildRange(source, base + existing.valueStart, base + existing.valueEnd),
                    newText: patch.sprite,
                });
            }
        } else {
            missing.push(`$sprite=${patch.sprite}`);
        }
    }

    if (missing.length > 0) {
        edits.push(insertAt(source, base + parsed.metadataInsertAt, `, ${missing.join(', ')}`));
    }
    return sortEdits(edits);
}

/**
 * Renames a native C4X declaration and every parser-ranged relationship
 * endpoint that references it. The returned edits are intentionally all
 * relative to one immutable source revision, so callers can apply them as a
 * single WorkspaceEdit and therefore one undo unit.
 */
export function planElementIdRename(
    source: string,
    target: NativeElementSourceRef,
    newId: string,
): BoundedTextEdit[] {
    if (!IDENTIFIER_RE.test(newId)) {
        throw new InvalidMetadataPatchError('Element id must start with a letter or underscore and contain only letters, digits, or underscores');
    }
    const { parsed, base } = parseSupportedFunctionElement(source, target, 'identifier rename');
    if (newId === target.elementId) {
        return [];
    }
    if (parsed.elementIdStart === undefined || parsed.elementIdEnd === undefined) {
        throw new UnsupportedNativeSyntaxError(`Element "${target.elementId}" does not expose an explicit identifier slot`);
    }

    const ast = new C4XParser().parse(source);
    const identifiers = new Set<string>();
    interface ElementWithChildren {
        readonly id: string;
        readonly children?: readonly ElementWithChildren[];
    }
    const collect = (elements: readonly ElementWithChildren[]) => {
        for (const element of elements) {
            identifiers.add(element.id);
            if (element.children) {
                collect(element.children);
            }
        }
    };
    collect(ast.elements);
    if (identifiers.has(newId)) {
        throw new InvalidMetadataPatchError(`id_conflict: ${newId}`);
    }

    const edits: BoundedTextEdit[] = [{
        range: buildRange(source, base + parsed.elementIdStart, base + parsed.elementIdEnd),
        newText: newId,
    }];

    for (const relationship of ast.relationships) {
        if (relationship.from !== target.elementId && relationship.to !== target.elementId) {
            continue;
        }
        if (!relationship.sourceRange || !isRangeConsistentWithSource(source, relationship.sourceRange)) {
            throw new StaleRangeError(`Relationship ${relationship.from} -> ${relationship.to} has no valid source range`);
        }
        const relationBase = relationship.sourceRange.start.offset;
        const relationStatement = source.slice(relationBase, relationship.sourceRange.end.offset);
        const endpoints = parseRelationshipStatement(relationStatement, relationship.from, relationship.to);
        if (relationship.from === target.elementId) {
            edits.push({
                range: buildRange(source, relationBase + endpoints.from.start, relationBase + endpoints.from.end),
                newText: newId,
            });
        }
        if (relationship.to === target.elementId) {
            edits.push({
                range: buildRange(source, relationBase + endpoints.to.start, relationBase + endpoints.to.end),
                newText: newId,
            });
        }
    }

    return sortEdits(edits);
}

function parseSupportedFunctionElement(
    source: string,
    target: NativeElementSourceRef,
    purpose: string,
): { statement: string; parsed: ParsedElementCall; base: number } {
    const statement = assertAnchorIsCurrent(source, target, 'Element');
    const parsed = parseElementCall(statement);
    if (!parsed) {
        throw new UnsupportedNativeSyntaxError(
            `Element "${target.elementId}" is not written using function syntax, which does not support ${purpose}`,
        );
    }
    if (parsed.elementId !== target.elementId) {
        throw new StaleRangeError(
            `Element range now points to "${parsed.elementId}", expected "${target.elementId}"`,
        );
    }
    return { statement, parsed, base: target.range.start.offset };
}

function validateTextPatch(patch: NativeElementTextPatch): void {
    if (patch.label !== undefined) {
        validateSemanticText('label', patch.label, false);
    }
    if (patch.technology !== undefined && patch.technology !== null) {
        validateSemanticText('technology', patch.technology, true);
    }
    if (patch.description !== undefined && patch.description !== null) {
        validateSemanticText('description', patch.description, true, DESCRIPTION_TEXT_LIMIT);
    }
}

function validateSemanticText(name: string, value: string, emptyAllowed: boolean, limit = SEMANTIC_TEXT_LIMIT): void {
    if (typeof value !== 'string' || value.length > limit || (!emptyAllowed && value.trim().length === 0)) {
        throw new InvalidMetadataPatchError(`${name} must be ${emptyAllowed ? 'at most' : 'between 1 and'} ${limit} characters`);
    }
    if (value.includes('"') || /[\r\n]/.test(value)) {
        throw new InvalidMetadataPatchError(`${name} must be a single-line C4X string without quotation marks`);
    }
}

function validateAttributePatch(patch: NativeElementAttributePatch): void {
    if (patch.tags !== undefined) {
        if (!Array.isArray(patch.tags) || patch.tags.length > MAX_TAG_COUNT) {
            throw new InvalidMetadataPatchError(`tags must contain at most ${MAX_TAG_COUNT} entries`);
        }
        const seen = new Set<string>();
        for (const tag of patch.tags) {
            if (typeof tag !== 'string' || tag.length === 0 || tag.length > MAX_TAG_LENGTH || !TAG_RE.test(tag)) {
                throw new InvalidMetadataPatchError(`tags must contain only letters, digits, hyphens, and underscores (maximum ${MAX_TAG_LENGTH} characters each)`);
            }
            if (seen.has(tag)) {
                throw new InvalidMetadataPatchError(`tags must not contain duplicate value "${tag}"`);
            }
            seen.add(tag);
        }
    }
    if (patch.sprite !== undefined && patch.sprite !== null) {
        if (typeof patch.sprite !== 'string' || !Object.prototype.hasOwnProperty.call(SPRITES, patch.sprite)) {
            throw new InvalidMetadataPatchError(`Unknown sprite "${String(patch.sprite)}"`);
        }
    }
}

function firstMetadataOffset(statement: string, start: number, fallback: number): number {
    let inQuote = false;
    for (let cursor = start; cursor < fallback; cursor++) {
        const char = statement.charAt(cursor);
        if (char === '"') {
            inQuote = !inQuote;
        } else if (!inQuote && char === '$') {
            return cursor;
        }
    }
    return fallback;
}

function unquote(statement: string, quote: { start: number; end: number }): string {
    return statement.slice(quote.start + 1, quote.end - 1);
}

function replaceQuote(source: string, base: number, quote: { start: number; end: number }, value: string): BoundedTextEdit {
    return {
        range: buildRange(source, base + quote.start, base + quote.end),
        newText: `"${value}"`,
    };
}

function insertAt(source: string, offset: number, newText: string): BoundedTextEdit {
    return { range: buildRange(source, offset, offset), newText };
}

function removeArgument(source: string, base: number, statement: string, quote: { start: number; end: number }): BoundedTextEdit {
    let start = quote.start;
    while (start > 0 && /[ \t]/.test(statement.charAt(start - 1))) {
        start--;
    }
    if (statement.charAt(start - 1) !== ',') {
        throw new StaleRangeError('Technology argument does not have its expected comma delimiter');
    }
    return {
        range: buildRange(source, base + start - 1, base + quote.end),
        newText: '',
    };
}

function onlyMetadataLocation(parsed: ParsedElementCall, key: string): KvLocation | undefined {
    const locations = parsed.metadata.get(key) ?? [];
    if (locations.length > 1) {
        throw new StaleRangeError(`Element "${parsed.elementId}" contains duplicate $${key} attributes`);
    }
    return locations[0];
}

function removeMetadataEntry(source: string, base: number, statement: string, location: KvLocation): BoundedTextEdit {
    let start = location.keyStart;
    while (start > 0 && /[ \t]/.test(statement.charAt(start - 1))) {
        start--;
    }
    let end = location.valueEnd;
    let trailing = end;
    while (trailing < statement.length && /[ \t]/.test(statement.charAt(trailing))) {
        trailing++;
    }

    if (statement.charAt(start - 1) === ',') {
        start--;
    } else if (statement.charAt(trailing) === ',') {
        end = trailing + 1;
    } else {
        throw new StaleRangeError('Metadata attribute does not have its expected comma delimiter');
    }
    return { range: buildRange(source, base + start, base + end), newText: '' };
}

function parseRelationshipStatement(
    statement: string,
    expectedFrom?: string,
    expectedTo?: string,
): {
    from: { start: number; end: number };
    to: { start: number; end: number };
    arrow: { start: number; end: number };
    /** Offset immediately after the arrow token. */
    arrowEnd: number;
    /** Offsets of the pipe-delimited `|label|` segment, when present. */
    label?: { start: number; end: number };
    /** Offsets of the quoted technology segment, including quotes, when present. */
    technology?: { start: number; end: number };
} {
    let cursor = skipWhitespace(statement, 0);
    const from = readIdentifier(statement, cursor);
    if (!from || (expectedFrom !== undefined && from.value !== expectedFrom)) {
        throw new StaleRangeError(`Relationship range no longer begins with "${expectedFrom ?? 'an identifier'}"`);
    }
    cursor = skipWhitespace(statement, from.end);
    const arrow = ['-->', '-.->', '==>'].find(candidate => statement.startsWith(candidate, cursor));
    if (!arrow) {
        throw new StaleRangeError('Relationship range does not contain a supported C4X arrow');
    }
    const arrowStart = cursor;
    const arrowEnd = cursor + arrow.length;
    cursor = skipWhitespace(statement, arrowEnd);
    let label: { start: number; end: number } | undefined;
    if (statement.charAt(cursor) === '|') {
        const labelEnd = statement.indexOf('|', cursor + 1);
        if (labelEnd === -1) {
            throw new StaleRangeError('Relationship label is unterminated');
        }
        label = { start: cursor, end: labelEnd + 1 };
        cursor = skipWhitespace(statement, labelEnd + 1);
    }
    let technology: { start: number; end: number } | undefined;
    if (statement.charAt(cursor) === '"') {
        const technologyEnd = statement.indexOf('"', cursor + 1);
        if (technologyEnd === -1) {
            throw new StaleRangeError('Relationship technology is unterminated');
        }
        technology = { start: cursor, end: technologyEnd + 1 };
        cursor = skipWhitespace(statement, technologyEnd + 1);
    }
    const to = readIdentifier(statement, cursor);
    if (!to || (expectedTo !== undefined && to.value !== expectedTo)) {
        throw new StaleRangeError(`Relationship range no longer ends with "${expectedTo ?? 'an identifier'}"`);
    }
    return {
        from: { start: from.end - from.value.length, end: from.end },
        to: { start: to.end - to.value.length, end: to.end },
        arrow: { start: arrowStart, end: arrowEnd },
        arrowEnd,
        label,
        technology,
    };
}

function sortEdits(edits: BoundedTextEdit[]): BoundedTextEdit[] {
    return edits.sort((a, b) => {
        const byStart = a.range.start.offset - b.range.start.offset;
        return byStart !== 0 ? byStart : a.range.end.offset - b.range.end.offset;
    });
}

function scanQuotedStrings(text: string, start: number, end: number): Array<{ start: number; end: number }> {
    const results: Array<{ start: number; end: number }> = [];
    let cursor = start;
    while (cursor < end) {
        if (text.charAt(cursor) === '"') {
            const startQuote = cursor;
            const endQuote = text.indexOf('"', startQuote + 1);
            if (endQuote === -1 || endQuote >= end) {
                break;
            }
            results.push({ start: startQuote, end: endQuote + 1 });
            cursor = endQuote + 1;
        } else {
            cursor++;
        }
    }
    return results;
}
