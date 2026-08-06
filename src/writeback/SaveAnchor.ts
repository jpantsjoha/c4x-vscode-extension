import { createHash } from 'crypto';
import type * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { RawElement } from '../parser/types';

const parser = new C4XParser();
const NATIVE_DOCUMENT_ORDINAL = -1;
const FINGERPRINT_HEX_LENGTH = 32;

export interface SaveAnchorRange {
    start: number;
    end: number;
}

export interface SaveAnchorBlock {
    blockRange: SaveAnchorRange;
    bodyRange: SaveAnchorRange;
    blockOrdinal: number;
    modelIdentity: string;
}

export interface SaveAnchor {
    uri: string;
    blockRange: SaveAnchorRange;
    blockOrdinal: number;
    modelIdentity: string;
    openingDocumentVersion: number;
    sourceFingerprint: string;
}

export type SaveAnchorRejectionReason =
    | 'uri_mismatch'
    | 'block_ordinal_drift'
    | 'fingerprint_mismatch'
    | 'model_identity_changed'
    | 'range_out_of_bounds';

export type SaveAnchorResolution =
    | { valid: true; block: SaveAnchorBlock }
    | { valid: false; reason: SaveAnchorRejectionReason };

interface TextLine {
    start: number;
    end: number;
    nextStart: number;
    text: string;
}

interface Fence {
    marker: '`' | '~';
    length: number;
    language: string;
}

/**
 * Locates complete C4X Markdown fences without treating a similar-looking
 * fence as interchangeable. The ordinal is among editable C4X fences only.
 */
export function findC4xFencedBlocks(document: vscode.TextDocument): SaveAnchorBlock[] {
    const source = document.getText();
    const lines = splitLines(source);
    const blocks: SaveAnchorBlock[] = [];

    for (let index = 0; index < lines.length; index++) {
        const openingFence = parseOpeningFence(lines[index].text);
        if (!openingFence) {
            continue;
        }

        const closingIndex = findClosingFence(lines, index + 1, openingFence);
        if (closingIndex === -1) {
            continue;
        }

        if (openingFence.language === 'c4x') {
            const bodyRange: SaveAnchorRange = {
                start: lines[index].nextStart,
                end: lines[closingIndex].start,
            };
            blocks.push({
                blockRange: {
                    start: lines[index].start,
                    end: lines[closingIndex].nextStart,
                },
                bodyRange,
                blockOrdinal: blocks.length,
                modelIdentity: calculateModelIdentity(source.slice(bodyRange.start, bodyRange.end)),
            });
        }

        index = closingIndex;
    }

    return blocks;
}

/** Creates the implicit anchor block used for a native .c4x document. */
export function createNativeDocumentBlock(document: vscode.TextDocument): SaveAnchorBlock {
    const source = document.getText();
    const bodyRange = { start: 0, end: source.length };
    return {
        blockRange: bodyRange,
        bodyRange,
        blockOrdinal: NATIVE_DOCUMENT_ORDINAL,
        modelIdentity: calculateModelIdentity(source),
    };
}

/** Captures the deterministic source identity at the point an editor opens. */
export function captureAnchor(document: vscode.TextDocument, block: SaveAnchorBlock): SaveAnchor {
    const source = document.getText();
    assertRangeInBounds(block.blockRange, source.length);
    assertRangeInBounds(block.bodyRange, source.length);

    return {
        uri: document.uri.toString(),
        blockRange: { ...block.blockRange },
        blockOrdinal: block.blockOrdinal,
        modelIdentity: block.modelIdentity,
        openingDocumentVersion: document.version,
        sourceFingerprint: calculateFingerprint(source.slice(block.bodyRange.start, block.bodyRange.end)),
    };
}

/**
 * Re-resolves an anchor against live document text immediately before a write.
 * It never falls back to a first matching block.
 */
export function resolveAnchor(document: vscode.TextDocument, anchor: SaveAnchor): SaveAnchorResolution {
    if (document.uri.toString() !== anchor.uri) {
        return { valid: false, reason: 'uri_mismatch' };
    }

    const source = document.getText();
    if (!isRangeInBounds(anchor.blockRange, source.length)) {
        return { valid: false, reason: 'range_out_of_bounds' };
    }

    const blocks = anchor.blockOrdinal === NATIVE_DOCUMENT_ORDINAL
        ? [createNativeDocumentBlock(document)]
        : findC4xFencedBlocks(document);
    const block = blocks[anchor.blockOrdinal === NATIVE_DOCUMENT_ORDINAL ? 0 : anchor.blockOrdinal];

    if (!block) {
        return { valid: false, reason: 'range_out_of_bounds' };
    }

    if (block.modelIdentity !== anchor.modelIdentity) {
        const matchingOrdinal = blocks
            .filter(candidate => candidate.modelIdentity === anchor.modelIdentity)
            .find(candidate => calculateFingerprint(source.slice(candidate.bodyRange.start, candidate.bodyRange.end)) === anchor.sourceFingerprint)
            ?.blockOrdinal;
        if (matchingOrdinal !== undefined && matchingOrdinal !== anchor.blockOrdinal) {
            return { valid: false, reason: 'block_ordinal_drift' };
        }
        return { valid: false, reason: 'model_identity_changed' };
    }

    if (calculateFingerprint(source.slice(block.bodyRange.start, block.bodyRange.end)) !== anchor.sourceFingerprint) {
        return { valid: false, reason: 'fingerprint_mismatch' };
    }

    const matchingOrdinals = blocks
        .filter(candidate => candidate.modelIdentity === anchor.modelIdentity)
        .filter(candidate => calculateFingerprint(source.slice(candidate.bodyRange.start, candidate.bodyRange.end)) === anchor.sourceFingerprint)
        .map(candidate => candidate.blockOrdinal);
    if (matchingOrdinals.length !== 1 || matchingOrdinals[0] !== anchor.blockOrdinal) {
        return { valid: false, reason: 'block_ordinal_drift' };
    }

    return { valid: true, block };
}

function splitLines(source: string): TextLine[] {
    const lines: TextLine[] = [];
    let start = 0;

    while (start <= source.length) {
        const newline = source.indexOf('\n', start);
        const nextStart = newline === -1 ? source.length : newline + 1;
        const rawEnd = newline === -1 ? source.length : newline;
        const end = rawEnd > start && source.charAt(rawEnd - 1) === '\r' ? rawEnd - 1 : rawEnd;
        lines.push({ start, end, nextStart, text: source.slice(start, end) });
        if (newline === -1) {
            return lines;
        }
        start = nextStart;
    }

    return lines;
}

function parseOpeningFence(line: string): Fence | undefined {
    let index = 0;
    while (index < line.length && line.charAt(index) === ' ' && index < 3) {
        index++;
    }

    const marker = line.charAt(index);
    if (marker !== '`' && marker !== '~') {
        return undefined;
    }

    const length = countRun(line, index, marker);
    if (length < 3) {
        return undefined;
    }

    const info = line.slice(index + length).trim();
    const language = firstInfoWord(info).toLowerCase();
    return { marker, length, language };
}

function findClosingFence(lines: readonly TextLine[], start: number, openingFence: Fence): number {
    for (let index = start; index < lines.length; index++) {
        if (isClosingFence(lines[index].text, openingFence)) {
            return index;
        }
    }
    return -1;
}

function isClosingFence(line: string, openingFence: Fence): boolean {
    let index = 0;
    while (index < line.length && line.charAt(index) === ' ' && index < 3) {
        index++;
    }

    if (line.charAt(index) !== openingFence.marker) {
        return false;
    }
    const length = countRun(line, index, openingFence.marker);
    if (length < openingFence.length) {
        return false;
    }

    for (let suffixIndex = index + length; suffixIndex < line.length; suffixIndex++) {
        const character = line.charAt(suffixIndex);
        if (character !== ' ' && character !== '\t') {
            return false;
        }
    }
    return true;
}

function countRun(value: string, start: number, character: string): number {
    let end = start;
    while (end < value.length && value.charAt(end) === character) {
        end++;
    }
    return end - start;
}

function firstInfoWord(value: string): string {
    for (let index = 0; index < value.length; index++) {
        const character = value.charAt(index);
        if (character === ' ' || character === '\t') {
            return value.slice(0, index);
        }
    }
    return value;
}

function calculateModelIdentity(source: string): string {
    try {
        const parsed = parser.parse(source);
        const elements: Array<{ id: string; type: string }> = [];
        collectElements(parsed.elements, elements);
        const identity = {
            viewType: parsed.viewType,
            elements: elements.sort(compareElementIdentity),
            relationships: parsed.relationships
                .map(relationship => ({ from: relationship.from, to: relationship.to, arrow: relationship.arrow }))
                .sort(compareRelationshipIdentity),
            boundaries: (parsed.boundaries ?? [])
                .map(boundary => ({ id: boundary.id ?? '', type: boundary.boundaryType ?? '' }))
                .sort(compareBoundaryIdentity),
        };
        return calculateFingerprint(JSON.stringify(identity));
    } catch {
        return calculateFingerprint('unparseable');
    }
}

function collectElements(elements: readonly RawElement[], identities: Array<{ id: string; type: string }>): void {
    for (const element of elements) {
        identities.push({ id: element.id, type: element.elementType });
        if (element.children) {
            collectElements(element.children, identities);
        }
    }
}

function compareElementIdentity(left: { id: string; type: string }, right: { id: string; type: string }): number {
    return left.id === right.id ? left.type.localeCompare(right.type) : left.id.localeCompare(right.id);
}

function compareRelationshipIdentity(
    left: { from: string; to: string; arrow: string },
    right: { from: string; to: string; arrow: string }
): number {
    const leftKey = `${left.from}\u0000${left.to}\u0000${left.arrow}`;
    const rightKey = `${right.from}\u0000${right.to}\u0000${right.arrow}`;
    return leftKey.localeCompare(rightKey);
}

function compareBoundaryIdentity(left: { id: string; type: string }, right: { id: string; type: string }): number {
    return left.id === right.id ? left.type.localeCompare(right.type) : left.id.localeCompare(right.id);
}

function calculateFingerprint(source: string): string {
    return createHash('sha256').update(source, 'utf8').digest('hex').slice(0, FINGERPRINT_HEX_LENGTH);
}

function isRangeInBounds(range: SaveAnchorRange, sourceLength: number): boolean {
    return Number.isInteger(range.start) &&
        Number.isInteger(range.end) &&
        range.start >= 0 &&
        range.end >= range.start &&
        range.end <= sourceLength;
}

function assertRangeInBounds(range: SaveAnchorRange, sourceLength: number): void {
    if (!isRangeInBounds(range, sourceLength)) {
        throw new RangeError('Save anchor block range is outside the source document.');
    }
}
