/**
 * Draft state schema for webview persistence via VS Code's setState/getState API.
 *
 * Persistence contract: no hidden files. The only persistence layer allowed is the
 * VS Code webview state API (setState / getState). This module defines the schema
 * and the pure validation guard used by both the client script and host tests.
 */

/**
 * One relationship staged by connect mode (#66). The source element is the
 * owning staged edit's `id`, so it is deliberately not repeated here.
 */
export interface PersistedAddRelationship {
    targetId: string;
    label: string;
    relType: 'uses' | 'async' | 'sync';
    technology?: string;
}

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
    /**
     * Relationships staged by connect mode (#260). Additive and optional, so
     * `schemaVersion` stays 1: a reader that predates this field validates only
     * the fields it knows and drops this one, which loses the staged add (as
     * before) but never rejects or corrupts the rest of the draft.
     */
    addRelationship?: PersistedAddRelationship[];
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
    readonly zoom?: number;
    readonly panX?: number;
    readonly panY?: number;
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

/**
 * Exact-allowlist guard for a persisted `addRelationship` list (#260): at most
 * 64 entries, each holding only `targetId`, `label`, `relType` and an optional
 * `technology`, within the limits the protocol and the writeback planner
 * enforce, with no two entries sharing a target and label.
 *
 * Self-contained on purpose: the webview embeds this function's source
 * verbatim (`Function.prototype.toString`), so it may not reference anything
 * outside its own body.
 */
export function isPersistedAddRelationshipList(value: unknown): value is PersistedAddRelationship[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > 64) {
        return false;
    }
    const allowed = ['targetId', 'label', 'relType', 'technology'];
    const seen = new Set<string>();
    for (const add of value as unknown[]) {
        if (typeof add !== 'object' || add === null || Array.isArray(add)) {
            return false;
        }
        const entry = add as Record<string, unknown>;
        if (Object.keys(entry).some(key => !allowed.includes(key))) {
            return false;
        }
        const { targetId, label, relType, technology } = entry;
        if (typeof targetId !== 'string' || targetId.length > 256 || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(targetId)) {
            return false;
        }
        if (typeof label !== 'string' || label.trim().length === 0 || label.length > 120 ||
            /["|\r\n]/.test(label)) {
            return false;
        }
        if (relType !== 'uses' && relType !== 'async' && relType !== 'sync') {
            return false;
        }
        if (technology !== undefined &&
            (typeof technology !== 'string' || technology.length > 120 || /["\r\n]/.test(technology))) {
            return false;
        }
        const key = targetId + '\u0000' + label;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
    }
    return true;
}

/**
 * Restore-time repair for a persisted draft (#260): drops only the staged
 * relationships that `isList` (the guard above, passed in because this function
 * is embedded verbatim in the webview and may not reference anything outside
 * its body) rejects, keeping every other staged change. An add is kept only if
 * it passes together with the adds kept before it, so a duplicate, or an entry
 * past the 64-entry cap, is dropped and the first stays. An entry left with
 * nothing but its id is removed. Returns the repaired state and how many adds
 * were dropped, so the caller can say so; it never rejects the draft itself.
 */
export function dropInvalidPersistedAdds(
    state: unknown,
    isList: (value: unknown) => boolean,
): { state: unknown; dropped: number } {
    if (typeof state !== 'object' || state === null || !Array.isArray((state as Record<string, unknown>)['stagedEdits'])) {
        return { state, dropped: 0 };
    }
    let dropped = 0;
    const stagedEdits: unknown[] = [];
    for (const entry of (state as Record<string, unknown>)['stagedEdits'] as unknown[]) {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry) ||
            (entry as Record<string, unknown>)['addRelationship'] === undefined) {
            stagedEdits.push(entry);
            continue;
        }
        const record = entry as Record<string, unknown>;
        const adds = Array.isArray(record['addRelationship']) ? record['addRelationship'] as unknown[] : [];
        if (!Array.isArray(record['addRelationship'])) {
            dropped++;
        }
        const kept: unknown[] = [];
        for (const add of adds) {
            if (kept.length < 64 && isList([...kept, add])) {
                kept.push(add);
            } else {
                dropped++;
            }
        }
        const repaired: Record<string, unknown> = {};
        for (const key of Object.keys(record)) {
            if (key !== 'addRelationship') {
                repaired[key] = record[key];
            }
        }
        if (kept.length > 0) {
            repaired['addRelationship'] = kept;
        } else if (Object.keys(repaired).every(key => key === 'id')) {
            continue;
        }
        stagedEdits.push(repaired);
    }
    return { state: { ...(state as Record<string, unknown>), stagedEdits }, dropped };
}

/**
 * Restore-time repair for a persisted draft (#271): a staged boundary move or
 * resize for a boundary the source cannot position (`movable === false`, a
 * typed `System_Boundary(...)` and its siblings) is dropped, because Save
 * refuses the whole batch for it and Save is all-or-nothing. Every other
 * staged change is kept. `edits` is keyed by staged-edit id; `boundaries` is
 * the layout snapshot's boundary list. Returns the kept edits and the labels of
 * the boundaries whose edits were dropped, in staging order, so the caller can
 * say so. Self-contained: the webview embeds this function's source verbatim.
 */
export function dropUnmovableBoundaryEdits(
    edits: Record<string, Record<string, unknown>>,
    boundaries: ReadonlyArray<{ id: string; label: string; movable?: boolean }>,
): { edits: Record<string, Record<string, unknown>>; labels: string[] } {
    const fixed = new Map<string, string>();
    for (const boundary of boundaries) {
        if (boundary.movable === false) {
            fixed.set(boundary.id, boundary.label);
        }
    }
    const kept: Array<[string, Record<string, unknown>]> = [];
    const labels: string[] = [];
    for (const [key, edit] of Object.entries(edits)) {
        const boundaryId = edit && typeof edit['boundaryId'] === 'string' ? edit['boundaryId'] as string : undefined;
        if (boundaryId !== undefined && fixed.has(boundaryId)) {
            labels.push(fixed.get(boundaryId) as string);
            continue;
        }
        kept.push([key, edit]);
    }
    return { edits: Object.fromEntries(kept), labels };
}

/**
 * The status sentence for boundary edits `dropUnmovableBoundaryEdits` removed
 * (#271). Never silent and never too long to show: each label is cut to 40
 * characters, at most three are named, and the rest are counted ("and N more").
 */
export function formatUnmovableBoundaryNotice(labels: readonly string[]): string {
    const named = labels.slice(0, 3).map(label =>
        '"' + (label.length > 40 ? label.slice(0, 40) + '\u2026' : label) + '"');
    const rest = labels.length - named.length;
    const list = named.join(', ') + (rest > 0 ? ' and ' + rest + ' more' : '');
    return labels.length + (labels.length === 1 ? ' staged boundary change' : ' staged boundary changes') +
        ' could not be restored: ' + list +
        ' cannot be moved or resized, because System_Boundary, Container_Boundary and Enterprise_Boundary have no place in the source for a position or size.';
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
    if (value['addRelationship'] !== undefined && !isPersistedAddRelationshipList(value['addRelationship'])) {
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
    if (value['zoom'] !== undefined && (typeof value['zoom'] !== 'number' || !Number.isFinite(value['zoom']) || value['zoom'] <= 0)) {
        return false;
    }
    if (value['panX'] !== undefined && (typeof value['panX'] !== 'number' || !Number.isFinite(value['panX']))) {
        return false;
    }
    if (value['panY'] !== undefined && (typeof value['panY'] !== 'number' || !Number.isFinite(value['panY']))) {
        return false;
    }
    return edits.every(isPersistedStagedEdit);
}
