export const VISUAL_LAYOUT_PROTOCOL_VERSION = 1 as const;

export interface VisualLayoutNodeSnapshot {
    id: string;
    label: string;
    type: string;
    x: number;
    y: number;
    width: number;
    height: number;
    locked?: boolean;
    description?: string;
    technology?: string;
    tags?: string[];
    sprite?: string;
}

export interface VisualLayoutBoundarySnapshot {
    id: string;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
    /** IDs of direct descendant nodes contained by this boundary. */
    childNodeIds: string[];
    /** IDs of direct descendant boundaries nested inside this boundary. */
    childBoundaryIds: string[];
}

export interface VisualLayoutEdgeSnapshot {
    id: string;
    from: string;
    to: string;
    /** Relationship label text (e.g. "Uses"), when declared in source. */
    label?: string;
    /** Relationship type (e.g. "uses", "async", "sync"), when declared. */
    relType?: string;
    /** Relationship technology/protocol (e.g. "HTTP"), when declared in source. */
    technology?: string;
}

export interface VisualLayoutSnapshot {
    revision: string;
    nodes: VisualLayoutNodeSnapshot[];
    boundaries: VisualLayoutBoundarySnapshot[];
    edges: VisualLayoutEdgeSnapshot[];
}

export interface MoveElementMessage {
    type: 'visualLayout.moveElement';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    id: string;
    x: number;
    y: number;
    input: 'pointer' | 'keyboard';
}

export interface StagedEdit {
    id: string;
    x?: number;
    y?: number;
    /** Boundary width, when resizing a boundary frame. */
    w?: number;
    /** Boundary height, when resizing a boundary frame. */
    h?: number;
    description?: string | null;
    /**
     * Element label, or relationship label when `edgeId` is present. A null
     * value is only valid alongside `edgeId` and explicitly clears the
     * relationship's `|label|` segment from source.
     */
    label?: string | null;
    technology?: string | null;
    tags?: string[];
    sprite?: string | null;
    /**
     * When present, this staged edit targets the relationship edge with this
     * id (e.g. `rel-0`, as assigned by C4ModelBuilder) instead of the element
     * named by `id`. Relationship edits support `label`, `technology`,
     * `relType`, and endpoint re-assignment via `from`/`to`.
     */
    edgeId?: string;
    /**
     * When present, this staged edit targets the boundary with this id
     * instead of the element named by `id`. `id` and `boundaryId` should
     * contain the same value for boundary edits so the staged-edit map key
     * and the target agree.
     */
    boundaryId?: string;
    /** Relationship type (arrow kind) for edge edits. */
    relType?: SemanticRelationshipType;
    /** Replacement source/target element id for edge endpoint re-assignment. */
    from?: string;
    to?: string;
    /**
     * When present on an element edit, adds new relationships from the element
     * named by `id` to each entry's `targetId`. Used by connect mode.
     *
     * A list rather than a single entry because staged edits are keyed by
     * element id and duplicate ids are rejected: two relationships drawn from
     * the same source element must share one staged edit.
     */
    addRelationship?: Array<{
        targetId: string;
        label: string;
        relType: SemanticRelationshipType;
        technology?: string | null;
    }>;
    /** When present, sets the $locked metadata flag on the element. */
    locked?: boolean;
    /** The replacement for `id`; the edit itself remains keyed by the old id. */
    newId?: string;
}

export interface ApplySemanticEditsMessage {
    type: 'visualLayout.applySemanticEdits';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    edits: StagedEdit[];
}

export interface AddRelationshipMessage {
    type: 'addRelationship';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    sourceId: string;
    targetId: string;
    label: string;
    technology?: string;
    relType: SemanticRelationshipType;
}

export type VisualLayoutMessage = MoveElementMessage | ApplySemanticEditsMessage | UpdateRelationshipMessage | AddRelationshipMessage;

/**
 * The element types that the semantic authoring protocol can carry. C4 scope
 * and placement legality are intentionally validated by the semantic command
 * service, not at this transport boundary.
 */
export type SemanticElementType =
    | 'Person'
    | 'SoftwareSystem'
    | 'Container'
    | 'Component'
    | 'DeploymentNode';

export type SemanticRelationshipType = 'uses' | 'async' | 'sync';

export interface VisualLayoutPosition {
    x: number;
    y: number;
}

export interface SemanticElement {
    id: string;
    type: SemanticElementType;
    label: string;
    description?: string;
    technology?: string;
    tags?: string[];
    parentId?: string;
}

/**
 * A null field value explicitly clears that optional source property. Omitted
 * fields leave it unchanged.
 */
export interface ElementUpdate {
    type?: SemanticElementType;
    label?: string;
    description?: string | null;
    technology?: string | null;
    tags?: string[];
    parentId?: string | null;
}

export interface SemanticRelationship {
    id: string;
    from: string;
    to: string;
    label: string;
    relType: SemanticRelationshipType;
    technology?: string;
}

/**
 * A null technology value explicitly clears that optional source property.
 * A null label explicitly clears the relationship's `|label|` source segment.
 */
export interface RelationshipUpdate {
    from?: string;
    to?: string;
    label?: string | null;
    relType?: SemanticRelationshipType;
    technology?: string | null;
}

export type PresentationOptionValue = string | number | boolean;

interface SemanticAuthoringMessageBase {
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
}

export interface AddElementMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.addElement';
    element: SemanticElement;
    position: VisualLayoutPosition;
}

export interface UpdateElementMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.updateElement';
    id: string;
    changes: ElementUpdate;
}

export interface DeleteElementMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.deleteElement';
    id: string;
}

export interface SemanticAddRelationshipMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.addRelationship';
    relationship: SemanticRelationship;
}

export interface UpdateRelationshipMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.updateRelationship';
    id: string;
    changes: RelationshipUpdate;
}

export interface DeleteRelationshipMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.deleteRelationship';
    id: string;
}

export interface SetPresentationOptionMessage extends SemanticAuthoringMessageBase {
    type: 'visualLayout.setPresentationOption';
    option: string;
    value: PresentationOptionValue;
}

/**
 * Semantic authoring is staged by the future editor. It deliberately remains
 * separate from VisualLayoutMessage, whose only current consumer writes
 * layout coordinates directly to an open document.
 */
export type SemanticAuthoringMessage =
    | AddElementMessage
    | UpdateElementMessage
    | DeleteElementMessage
    | SemanticAddRelationshipMessage
    | UpdateRelationshipMessage
    | DeleteRelationshipMessage
    | SetPresentationOptionMessage;

export type MoveRejectionCode =
    | 'malformed_message'
    | 'layout_unavailable'
    | 'stale_revision'
    | 'missing_element'
    | 'validation_failed'
    | 'document_not_found'
    | 'invalid_payload'
    | 'uri_mismatch'
    | 'block_ordinal_drift'
    | 'fingerprint_mismatch'
    | 'model_identity_changed'
    | 'range_out_of_bounds';

export interface MoveAcceptedMessage {
    type: 'visualLayout.accepted';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    id: string;
    x: number;
    y: number;
    input: 'pointer' | 'keyboard';
    persisted: boolean;
}

export interface MoveRejectedMessage {
    type: 'visualLayout.rejected';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    code: MoveRejectionCode;
    reason: string;
    revision?: string;
}

export interface BatchAcceptedMessage {
    type: 'visualLayout.batchAccepted';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    persisted: boolean;
}

/** Webview → host: request a fresh source diff for the given staged edits. */
export interface RequestSourceDiffMessage {
    type: 'visualLayout.requestSourceDiff';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    edits: StagedEdit[];
}

export type DiffLineKind = 'unchanged' | 'added' | 'removed';

export interface SourceDiffLine {
    kind: DiffLineKind;
    text: string;
}

/** Host → webview: result of a source diff computation. */
export interface SourceDiffMessage {
    type: 'visualLayout.sourceDiff';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    revision: string;
    /** Ordered diff lines. Empty when there are no staged edits or no changes. */
    lines: SourceDiffLine[];
    /** Human-readable error when materialisation failed. Undefined on success. */
    error?: string;
}

/** Host → webview: the anchored block changed externally while the editor is dirty. */
export interface ExternalChangeConflictMessage {
    type: 'visualLayout.externalChangeConflict';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    /** Human-readable description of what changed. */
    reason: string;
}

/** Webview → host: user chose a conflict-resolution action. */
export type ConflictResolutionAction = 'reloadAndDiscard' | 'viewDiff' | 'rebase';

export interface ResolveConflictMessage {
    type: 'visualLayout.resolveConflict';
    protocolVersion: typeof VISUAL_LAYOUT_PROTOCOL_VERSION;
    action: ConflictResolutionAction;
}

export function isResolveConflictMessage(value: unknown): value is ResolveConflictMessage {
    if (!isRecord(value)) {
        return false;
    }
    return value.type === 'visualLayout.resolveConflict' &&
        value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
        (value.action === 'reloadAndDiscard' || value.action === 'viewDiff' || value.action === 'rebase');
}

export type VisualLayoutHostMessage = MoveAcceptedMessage | MoveRejectedMessage | BatchAcceptedMessage | SourceDiffMessage | ExternalChangeConflictMessage;

export type MoveResult =
    | {
        accepted: true;
        id: string;
        x: number;
        y: number;
        revision: string;
        input: 'pointer' | 'keyboard';
        persisted: false;
        snapshot: VisualLayoutSnapshot;
    }
    | { accepted: false; code: Extract<MoveRejectionCode, 'stale_revision' | 'missing_element'>; reason: string };

const MAX_ID_LENGTH = 256;
/** Upper bound on relationships added from one element in a single transaction. */
const MAX_RELATIONSHIP_ADDS_PER_ELEMENT = 64;

const MAX_REVISION_LENGTH = 128;
const MAX_COORDINATE = 1_000_000;
const MAX_TEXT_LENGTH = 4_096;
const MAX_TAGS = 32;
const MAX_PRESENTATION_OPTION_LENGTH = 128;
const MAX_EDITOR_FIELD_LENGTH = 120;
const MAX_EDITOR_TAGS = 20;
const MAX_EDITOR_TAG_LENGTH = 40;
const EDITOR_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const EDITOR_TAG_RE = /^[A-Za-z0-9_-]+$/;

const SEMANTIC_ELEMENT_TYPES: readonly SemanticElementType[] = [
    'Person',
    'SoftwareSystem',
    'Container',
    'Component',
    'DeploymentNode',
];

const SEMANTIC_RELATIONSHIP_TYPES: readonly SemanticRelationshipType[] = [
    'uses',
    'async',
    'sync',
];

export function isRequestSourceDiffMessage(value: unknown): value is RequestSourceDiffMessage {
    if (!isRecord(value)) {
        return false;
    }
    return value.type === 'visualLayout.requestSourceDiff' &&
        value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
        isBoundedString(value.revision, MAX_REVISION_LENGTH) &&
        Array.isArray(value.edits) &&
        value.edits.every(isStagedEdit) &&
        new Set((value.edits as { id: unknown }[]).map(edit => edit.id)).size === (value.edits as unknown[]).length;
}

export function isVisualLayoutMessage(value: unknown): value is VisualLayoutMessage {
    if (!isRecord(value)) {
        return false;
    }
    if (value.type === 'visualLayout.moveElement') {
        return value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
            isBoundedString(value.revision, MAX_REVISION_LENGTH) &&
            isBoundedString(value.id, MAX_ID_LENGTH) &&
            isCoordinate(value.x) &&
            isCoordinate(value.y) &&
            (value.input === 'pointer' || value.input === 'keyboard');
    }
    if (value.type === 'visualLayout.applySemanticEdits') {
        return value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
            isBoundedString(value.revision, MAX_REVISION_LENGTH) &&
            Array.isArray(value.edits) &&
            value.edits.every(isStagedEdit) &&
            new Set(value.edits.map(edit => edit.id)).size === value.edits.length;
    }
    if (value.type === 'visualLayout.updateRelationship') {
        return isUpdateRelationshipMessage(value);
    }
    if (value.type === 'addRelationship') {
        return isAddRelationshipMessage(value);
    }
    return false;
}

/**
 * Validates a single relationship update at the webview boundary. The staged
 * editor currently writes only `changes.label`; other RelationshipUpdate
 * fields validate here but are rejected by the writeback transaction until
 * their planners land.
 */
export function isUpdateRelationshipMessage(value: unknown): value is UpdateRelationshipMessage {
    if (!isRecord(value) || !isSemanticAuthoringEnvelope(value)) {
        return false;
    }
    return value.type === 'visualLayout.updateRelationship' &&
        hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'id', 'changes']) &&
        isBoundedString(value.id, MAX_ID_LENGTH) &&
        isRelationshipUpdate(value.changes);
}

export function isAddRelationshipMessage(value: unknown): value is AddRelationshipMessage {
    if (!isRecord(value)) {
        return false;
    }
    return value.type === 'addRelationship' &&
        value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
        isBoundedString(value.revision, MAX_REVISION_LENGTH) &&
        hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'sourceId', 'targetId', 'label', 'technology', 'relType']) &&
        isBoundedString(value.sourceId, MAX_ID_LENGTH) &&
        EDITOR_ID_RE.test(value.sourceId as string) &&
        isBoundedString(value.targetId, MAX_ID_LENGTH) &&
        EDITOR_ID_RE.test(value.targetId as string) &&
        isBoundedString(value.label, MAX_TEXT_LENGTH) &&
        !String(value.label).includes('|') &&
        (value.technology === undefined || isBoundedString(value.technology, MAX_TEXT_LENGTH)) &&
        isSemanticRelationshipType(value.relType);
}

function isStagedEdit(value: unknown): value is StagedEdit {
    if (!isRecord(value) || !isBoundedString(value.id, MAX_ID_LENGTH)) {
        return false;
    }
    if (value.edgeId !== undefined && !isBoundedString(value.edgeId, MAX_ID_LENGTH)) {
        return false;
    }
    if (value.boundaryId !== undefined && !isBoundedString(value.boundaryId, MAX_ID_LENGTH)) {
        return false;
    }
    // Relationship edits must target at least one supported edge property.
    if (value.edgeId !== undefined) {
        const hasEdgeChange = value.label !== undefined ||
            value.technology !== undefined ||
            value.relType !== undefined ||
            value.from !== undefined ||
            value.to !== undefined;
        if (!hasEdgeChange) {
            return false;
        }
    }
    if (value.x !== undefined && !isCoordinate(value.x)) {
        return false;
    }
    if (value.y !== undefined && !isCoordinate(value.y)) {
        return false;
    }
    if (value.w !== undefined && !isCoordinate(value.w)) {
        return false;
    }
    if (value.h !== undefined && !isCoordinate(value.h)) {
        return false;
    }
    if (value.description !== undefined && value.description !== null && !isOptionalBoundedString(value.description, MAX_TEXT_LENGTH)) {
        return false;
    }
    if (value.label !== undefined) {
        // A null label explicitly clears a relationship label; it is not a
        // valid element-label value.
        if (value.label === null) {
            if (value.edgeId === undefined) {
                return false;
            }
        } else if (!isEditorText(value.label, false)) {
            return false;
        } else if (value.edgeId !== undefined && value.label.includes('|')) {
            // Relationship labels are pipe-delimited in native C4X source.
            return false;
        }
    }
    if (value.technology !== undefined && value.technology !== null && !isEditorText(value.technology, true)) {
        return false;
    }
    if (value.tags !== undefined && !isEditorTags(value.tags)) {
        return false;
    }
    if (value.sprite !== undefined && value.sprite !== null && !isBoundedString(value.sprite, MAX_EDITOR_FIELD_LENGTH)) {
        return false;
    }
    if (value.locked !== undefined && typeof value.locked !== 'boolean') {
        return false;
    }
    if (value.newId !== undefined && (!isBoundedString(value.newId, MAX_ID_LENGTH) || !EDITOR_ID_RE.test(value.newId))) {
        return false;
    }
    if (value.relType !== undefined && !isSemanticRelationshipType(value.relType)) {
        return false;
    }
    if (value.from !== undefined && !isBoundedString(value.from, MAX_ID_LENGTH)) {
        return false;
    }
    if (value.to !== undefined && !isBoundedString(value.to, MAX_ID_LENGTH)) {
        return false;
    }
    // Endpoint and relType changes are only meaningful on edge edits.
    if ((value.relType !== undefined || value.from !== undefined || value.to !== undefined) && value.edgeId === undefined) {
        return false;
    }
    if (value.addRelationship !== undefined) {
        if (!Array.isArray(value.addRelationship) || value.addRelationship.length === 0 ||
            value.addRelationship.length > MAX_RELATIONSHIP_ADDS_PER_ELEMENT) {
            return false;
        }
        const seenTargets = new Set<string>();
        for (const add of value.addRelationship) {
            if (!isRecord(add)) {
                return false;
            }
            if (!hasOnlyKeys(add, ['targetId', 'label', 'relType', 'technology'])) {
                return false;
            }
            if (!isBoundedString(add.targetId, MAX_ID_LENGTH) || !EDITOR_ID_RE.test(add.targetId)) {
                return false;
            }
            if (!isBoundedString(add.label, MAX_TEXT_LENGTH) || String(add.label).includes('|')) {
                return false;
            }
            if (add.technology !== undefined && add.technology !== null &&
                !isBoundedString(add.technology, MAX_TEXT_LENGTH)) {
                return false;
            }
            if (!isSemanticRelationshipType(add.relType)) {
                return false;
            }
            // Two identical source->target pairs in one transaction would emit
            // duplicate Rel statements.
            const key = String(add.targetId) + '\u0000' + String(add.label);
            if (seenTargets.has(key)) {
                return false;
            }
            seenTargets.add(key);
        }
    }
    return true;
}

function isEditorText(value: unknown, emptyAllowed: boolean): value is string {
    return typeof value === 'string' &&
        value.length <= MAX_EDITOR_FIELD_LENGTH &&
        (emptyAllowed || value.trim().length > 0) &&
        !value.includes('"') &&
        !/[\r\n]/.test(value);
}

function isEditorTags(value: unknown): value is string[] {
    return Array.isArray(value) &&
        value.length <= MAX_EDITOR_TAGS &&
        new Set(value).size === value.length &&
        value.every(tag => typeof tag === 'string' && tag.length > 0 && tag.length <= MAX_EDITOR_TAG_LENGTH && EDITOR_TAG_RE.test(tag));
}

/**
 * Validates a staged semantic authoring operation at the webview boundary.
 * The validator accepts only bounded, typed fields and rejects arbitrary
 * source text, paths, objects, and unrecognised operation properties.
 */
export function isSemanticAuthoringMessage(value: unknown): value is SemanticAuthoringMessage {
    if (!isRecord(value) || !isSemanticAuthoringEnvelope(value)) {
        return false;
    }

    switch (value.type) {
    case 'visualLayout.addElement':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'element', 'position']) &&
            isSemanticElement(value.element) &&
            isVisualLayoutPosition(value.position);
    case 'visualLayout.updateElement':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'id', 'changes']) &&
            isBoundedString(value.id, MAX_ID_LENGTH) &&
            isElementUpdate(value.changes);
    case 'visualLayout.deleteElement':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'id']) &&
            isBoundedString(value.id, MAX_ID_LENGTH);
    case 'visualLayout.addRelationship':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'relationship']) &&
            isSemanticRelationship(value.relationship);
    case 'visualLayout.updateRelationship':
        return isUpdateRelationshipMessage(value);
    case 'visualLayout.deleteRelationship':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'id']) &&
            isBoundedString(value.id, MAX_ID_LENGTH);
    case 'visualLayout.setPresentationOption':
        return hasOnlyKeys(value, ['type', 'protocolVersion', 'revision', 'option', 'value']) &&
            isPresentationOption(value.option) &&
            isPresentationOptionValue(value.value);
    default:
        return false;
    }
}

/**
 * Applies a validated draft move immutably. The returned snapshot exists only in
 * extension/webview memory; this helper has no source or workspace write path.
 */
export function applyMoveMessage(snapshot: VisualLayoutSnapshot, message: MoveElementMessage): MoveResult {
    if (message.revision !== snapshot.revision) {
        return {
            accepted: false,
            code: 'stale_revision',
            reason: 'The diagram changed while it was being edited. Refresh and try again.',
        };
    }

    if (!snapshot.nodes.some(node => node.id === message.id)) {
        return {
            accepted: false,
            code: 'missing_element',
            reason: `Element "${message.id}" no longer exists in this diagram.`,
        };
    }

    const nextSnapshot: VisualLayoutSnapshot = {
        ...snapshot,
        nodes: snapshot.nodes.map(node => node.id === message.id
            ? { ...node, x: message.x, y: message.y }
            : node),
    };

    return {
        accepted: true,
        id: message.id,
        x: message.x,
        y: message.y,
        revision: snapshot.revision,
        input: message.input,
        persisted: false,
        snapshot: nextSnapshot,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowedKeys: readonly string[]): boolean {
    return Object.keys(value).every(key => allowedKeys.includes(key));
}

function isBoundedString(value: unknown, maxLength: number): value is string {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function isCoordinate(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COORDINATE;
}

function isSemanticAuthoringEnvelope(value: Record<string, unknown>): boolean {
    return value.protocolVersion === VISUAL_LAYOUT_PROTOCOL_VERSION &&
        isBoundedString(value.revision, MAX_REVISION_LENGTH);
}

function isVisualLayoutPosition(value: unknown): value is VisualLayoutPosition {
    return isRecord(value) &&
        hasOnlyKeys(value, ['x', 'y']) &&
        isCoordinate(value.x) &&
        isCoordinate(value.y);
}

function isSemanticElement(value: unknown): value is SemanticElement {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'id',
        'type',
        'label',
        'description',
        'technology',
        'tags',
        'parentId',
    ])) {
        return false;
    }

    return isBoundedString(value.id, MAX_ID_LENGTH) &&
        isSemanticElementType(value.type) &&
        isBoundedString(value.label, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(value.description, MAX_TEXT_LENGTH) &&
        isOptionalBoundedString(value.technology, MAX_TEXT_LENGTH) &&
        isOptionalTags(value.tags) &&
        isOptionalBoundedString(value.parentId, MAX_ID_LENGTH);
}

function isElementUpdate(value: unknown): value is ElementUpdate {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'type',
        'label',
        'description',
        'technology',
        'tags',
        'parentId',
    ]) || Object.keys(value).length === 0) {
        return false;
    }

    return (value.type === undefined || isSemanticElementType(value.type)) &&
        (value.label === undefined || isBoundedString(value.label, MAX_TEXT_LENGTH)) &&
        isOptionalNullableBoundedString(value.description, MAX_TEXT_LENGTH) &&
        isOptionalNullableBoundedString(value.technology, MAX_TEXT_LENGTH) &&
        isOptionalTags(value.tags) &&
        isOptionalNullableBoundedString(value.parentId, MAX_ID_LENGTH);
}

function isSemanticRelationship(value: unknown): value is SemanticRelationship {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'id',
        'from',
        'to',
        'label',
        'relType',
        'technology',
    ])) {
        return false;
    }

    return isBoundedString(value.id, MAX_ID_LENGTH) &&
        isBoundedString(value.from, MAX_ID_LENGTH) &&
        isBoundedString(value.to, MAX_ID_LENGTH) &&
        isBoundedString(value.label, MAX_TEXT_LENGTH) &&
        isSemanticRelationshipType(value.relType) &&
        isOptionalBoundedString(value.technology, MAX_TEXT_LENGTH);
}

function isRelationshipUpdate(value: unknown): value is RelationshipUpdate {
    if (!isRecord(value) || !hasOnlyKeys(value, [
        'from',
        'to',
        'label',
        'relType',
        'technology',
    ]) || Object.keys(value).length === 0) {
        return false;
    }

    return (value.from === undefined || isBoundedString(value.from, MAX_ID_LENGTH)) &&
        (value.to === undefined || isBoundedString(value.to, MAX_ID_LENGTH)) &&
        (value.label === undefined || value.label === null || isBoundedString(value.label, MAX_TEXT_LENGTH)) &&
        (value.relType === undefined || isSemanticRelationshipType(value.relType)) &&
        isOptionalNullableBoundedString(value.technology, MAX_TEXT_LENGTH);
}

function isPresentationOption(value: unknown): value is string {
    return isBoundedString(value, MAX_PRESENTATION_OPTION_LENGTH) &&
        /^[A-Za-z][A-Za-z0-9.-]*$/.test(value) &&
        value !== 'constructor' &&
        value !== 'prototype' &&
        value !== '__proto__';
}

function isPresentationOptionValue(value: unknown): value is PresentationOptionValue {
    return typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && value.length <= MAX_TEXT_LENGTH);
}

function isSemanticElementType(value: unknown): value is SemanticElementType {
    return typeof value === 'string' && SEMANTIC_ELEMENT_TYPES.includes(value as SemanticElementType);
}

function isSemanticRelationshipType(value: unknown): value is SemanticRelationshipType {
    return typeof value === 'string' && SEMANTIC_RELATIONSHIP_TYPES.includes(value as SemanticRelationshipType);
}

function isOptionalBoundedString(value: unknown, maxLength: number): boolean {
    return value === undefined || (typeof value === 'string' && value.length <= maxLength);
}

function isOptionalNullableBoundedString(value: unknown, maxLength: number): boolean {
    return value === undefined || value === null ||
        (typeof value === 'string' && value.length <= maxLength);
}

function isOptionalTags(value: unknown): boolean {
    return value === undefined ||
        (Array.isArray(value) && value.length <= MAX_TAGS &&
            value.every(tag => isBoundedString(tag, MAX_ID_LENGTH)));
}
