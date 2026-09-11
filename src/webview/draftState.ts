/**
 * Draft state schema for webview persistence via VS Code's setState/getState API.
 *
 * ADR-019 constraint: NO hidden files. The only persistence layer allowed is the
 * VS Code webview state API (setState / getState). This module defines the schema
 * and the pure validation guard used by both the client script and host tests.
 */

/** Staged edit entry: mirrors the StagedEdit shape used in the protocol. */
export interface PersistedStagedEdit {
    id: string;
    /** When present, this edit targets the relationship edge with this id. */
    edgeId?: string;
    /** When present, this edit targets the boundary with this id. */
    boundaryId?: string;
    x?: number;
    y?: number;
    /** Boundary width, when resizing a boundary frame. */
    w?: number;
    /** Boundary height, when resizing a boundary frame. */
    h?: number;
    label?: string | null;
    description?: string | null;
    technology?: string | null;
    tags?: string[];
    sprite?: string | null;
    locked?: boolean;
    newId?: string;
    /** Relationship type (arrow kind) for edge edits. */
    relType?: 'uses' | 'async' | 'sync';
    /** Replacement source/target element id for edge endpoint re-assignment. */
    from?: string;
    to?: string;
}

/**
 * The shape serialised by the webview via vscode.setState() and restored via
 * vscode.getState(). Deliberately a flat, bounded, typed structure — no nested
 * objects beyond the staged-edit array.
 */
export interface PersistedDraftState {
    readonly schemaVersion: 1;
    readonly editMode: boolean;
    readonly selectedNodeId: string | null;
    readonly stagedEdits: readonly PersistedStagedEdit[];
}

// ── Schema constants ─────────────────────────────────────────────────────────

const MAX_ID_LENGTH = 256;
const MAX_LABEL_LENGTH = 120;
const MAX_TECH_LENGTH = 120;
const MAX_TEXT_LENGTH = 4_096;
const MAX_SPRITE_LENGTH = 120;
const MAX_TAGS = 20;
const MAX_EDITS = 500;
const ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TAG_RE = /^[A-Za-z0-9_-]{1,40}$/;

// ── Helpers ──────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxLen: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLen;
}

function isOptionalNullableString(value: unknown, maxLen: number): boolean {
    return value === undefined || value === null ||
        (typeof value === 'string' && value.length <= maxLen);
}

function isOptionalString(value: unknown, maxLen: number): boolean {
    return value === undefined || (typeof value === 'string' && value.length <= maxLen);
}

function isCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1_000_000;
}

function isOptionalCoordinate(value: unknown): boolean {
    return value === undefined || isCoordinate(value);
}

function isTags(value: unknown): value is string[] {
    return Array.isArray(value) &&
        value.length <= MAX_TAGS &&
        new Set(value).size === value.length &&
        value.every(tag => typeof tag === 'string' && TAG_RE.test(tag));
}

// ── Per-edit validator ───────────────────────────────────────────────────────

function isPersistedStagedEdit(value: unknown): value is PersistedStagedEdit {
    if (!isRecord(value)) {
        return false;
    }
    if (!isBoundedString(value['id'], MAX_ID_LENGTH)) {
        return false;
    }
    if (!isOptionalCoordinate(value['x']) || !isOptionalCoordinate(value['y'])) {
        return false;
    }
    if (value['w'] !== undefined && !isOptionalCoordinate(value['w'])) {
        return false;
    }
    if (value['h'] !== undefined && !isOptionalCoordinate(value['h'])) {
        return false;
    }
    if (value['boundaryId'] !== undefined && !isBoundedString(value['boundaryId'], MAX_ID_LENGTH)) {
        return false;
    }
    if (value['label'] !== undefined && !isBoundedString(value['label'], MAX_LABEL_LENGTH)) {
        return false;
    }
    if (!isOptionalNullableString(value['description'], MAX_TEXT_LENGTH)) {
        return false;
    }
    if (!isOptionalNullableString(value['technology'], MAX_TECH_LENGTH)) {
        return false;
    }
    if (value['tags'] !== undefined && !isTags(value['tags'])) {
        return false;
    }
    if (!isOptionalNullableString(value['sprite'], MAX_SPRITE_LENGTH)) {
        return false;
    }
    if (value['locked'] !== undefined && typeof value['locked'] !== 'boolean') {
        return false;
    }
    if (value['newId'] !== undefined) {
        if (!isBoundedString(value['newId'], MAX_ID_LENGTH) || !ID_RE.test(value['newId'] as string)) {
            return false;
        }
    }
    if (value['relType'] !== undefined && !['uses', 'async', 'sync'].includes(value['relType'] as string)) {
        return false;
    }
    if (value['from'] !== undefined && !isBoundedString(value['from'], MAX_ID_LENGTH)) {
        return false;
    }
    if (value['to'] !== undefined && !isBoundedString(value['to'], MAX_ID_LENGTH)) {
        return false;
    }
    return true;
}

// ── Top-level guard ──────────────────────────────────────────────────────────

/**
 * Runtime type-guard for values read from vscode.getState(). Returns false and
 * silently rejects any malformed or unexpected payload.
 */
export function isPersistedDraftState(value: unknown): value is PersistedDraftState {
    if (!isRecord(value)) {
        return false;
    }
    if (value['schemaVersion'] !== 1) {
        return false;
    }
    if (typeof value['editMode'] !== 'boolean') {
        return false;
    }
    if (value['selectedNodeId'] !== null && !isOptionalString(value['selectedNodeId'], MAX_ID_LENGTH)) {
        return false;
    }
    if (!Array.isArray(value['stagedEdits'])) {
        return false;
    }
    const edits = value['stagedEdits'] as unknown[];
    if (edits.length > MAX_EDITS) {
        return false;
    }
    // IDs within the edit array must be unique
    const ids = edits.map(e => (isRecord(e) ? e['id'] : null));
    if (new Set(ids).size !== ids.length) {
        return false;
    }
    return edits.every(isPersistedStagedEdit);
}
