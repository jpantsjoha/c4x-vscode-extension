import type * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { RawBoundary } from '../parser/types';
import { C4ModelBuilder } from '../model/C4ModelBuilder';
import {
    planElementAttributeUpdates,
    planElementIdRename,
    planElementTextUpdates,
    planMetadataUpdate,
    planMetadataReset,
    planRelationshipLabelUpdate,
    planBoundaryMetadataUpdate,
    planRelationshipTechnologyUpdate,
    planRelationshipTypeUpdate,
    planRelationshipEndpointUpdate,
    planRelationshipAdd,
    NativeElementSourceRef,
    NativeBoundarySourceRef,
} from './NativeMutationPlanner';
import { C4Model, C4Element } from '../model/C4Model';
import { isRelationshipLegal } from '../model/c4Legality';
import { SourceRange, BoundedTextEdit, sourcePositionAt, validateEditsForOverlap } from './SourceRange';
import { resetSidecarLayout, saveSidecarLayout } from './SidecarPersistence';
import { parseStructurizrDSL } from '../parser/structurizr';
import { parsePlantUMLtoC4Model } from '../parser/plantuml';
import {
    createDefaultVscodeWritebackTransactionBoundary,
    WritebackDocument,
    WritebackTransactionBoundary,
} from './VscodeWritebackBoundary';
import {
    captureAnchor,
    createNativeDocumentBlock,
    resolveAnchor,
    SaveAnchor,
    SaveAnchorRejectionReason,
} from './SaveAnchor';

const parser = new C4XParser();
const builder = new C4ModelBuilder();

import {
    VisualLayoutMessage,
    ApplySemanticEditsMessage,
} from '../webview/visualLayoutProtocol';

export class WritebackTransactionError extends Error {
    constructor(
        public readonly code: 'stale_revision' | 'validation_failed' | 'document_not_found' | 'invalid_payload' | 'missing_element' | SaveAnchorRejectionReason,
        message: string
    ) {
        super(message);
        this.name = 'WritebackTransactionError';
    }
}

interface HasIdAndChildren {
    id: string;
    children?: HasIdAndChildren[];
    sourceRange?: SourceRange;
    metadata?: Record<string, string>;
}

interface SemanticChangeAllowance {
    readonly label?: boolean;
    readonly technology?: boolean;
    readonly description?: boolean;
    readonly tags?: boolean;
    readonly sprite?: boolean;
    readonly newId?: string;
}

interface RelationshipChangeAllowance {
    readonly label?: boolean;
    readonly technology?: boolean;
    readonly relType?: boolean;
    readonly from?: boolean;
    readonly to?: boolean;
}

function hasSemanticChanges(edit: ApplySemanticEditsMessage['edits'][number]): boolean {
    return edit.description !== undefined ||
        edit.label !== undefined ||
        edit.technology !== undefined ||
        edit.tags !== undefined ||
        edit.sprite !== undefined ||
        edit.newId !== undefined;
}

function findElementById(elements: HasIdAndChildren[], id: string): HasIdAndChildren | null {
    for (const el of elements) {
        if (el.id === id) { return el; }
        if (el.children) {
            const found = findElementById(el.children, id);
            if (found) { return found; }
        }
    }
    return null;
}

/**
 * Find a raw boundary by the generated id produced by C4ModelBuilder.
 * The builder generates ids as `label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + index`.
 */
function findBoundaryByGeneratedId(boundaries: RawBoundary[], id: string): RawBoundary | undefined {
    for (let i = 0; i < boundaries.length; i++) {
        const generatedId = boundaries[i].label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + i;
        if (generatedId === id) {
            return boundaries[i];
        }
    }
    return undefined;
}

function modelHasElement(model: C4Model, id: string): boolean {
    const traverse = (elements: C4Element[]): boolean => {
        for (const el of elements) {
            if (el.id === id) { return true; }
            if (el.children && traverse(el.children)) { return true; }
        }
        return false;
    };
    for (const view of model.views) {
        if (traverse(view.elements)) { return true; }
    }
    return false;
}

/**
 * SaveAnchor helpers accept a `vscode.TextDocument`, but the transaction
 * service only depends on the narrower `WritebackDocument` shape. At runtime
 * SaveAnchor only touches `uri.toString()`, `getText()`, and `version` — all
 * present on `WritebackDocument`, so we cast to satisfy the typechecker
 * without pulling VS Code into the pure service.
 */
function anchorDocument(document: WritebackDocument): vscode.TextDocument {
    return document as unknown as vscode.TextDocument;
}

function createImplicitNativeAnchor(document: WritebackDocument): SaveAnchor {
    const anchorDoc = anchorDocument(document);
    return captureAnchor(anchorDoc, createNativeDocumentBlock(anchorDoc));
}

function assertAnchorResolves(document: WritebackDocument, anchor: SaveAnchor): void {
    const resolution = resolveAnchor(anchorDocument(document), anchor);
    if (!resolution.valid) {
        throw new WritebackTransactionError(
            resolution.reason,
            `Save anchor could not be resolved: ${resolution.reason}`
        );
    }
}

async function restoreDocument(
    document: WritebackDocument,
    originalText: string,
    reason: string,
    boundary: WritebackTransactionBoundary,
): Promise<void> {
    const currentText = document.getText();
    const rollbackEdit: BoundedTextEdit = {
        range: {
            start: sourcePositionAt(currentText, 0),
            end: sourcePositionAt(currentText, currentText.length),
        },
        newText: originalText,
    };

    const restored = await boundary.applyBoundedEdits(document, [rollbackEdit]);
    if (!restored || document.getText() !== originalText) {
        throw new WritebackTransactionError(
            'validation_failed',
            `Rollback failed while attempting to restore original source (${reason}).`
        );
    }

    try {
        parser.parse(document.getText());
    } catch (error) {
        throw new WritebackTransactionError(
            'validation_failed',
            `Rollback restored source that no longer parses cleanly. Reason: ${error instanceof Error ? error.message : String(error)}`
        );
    }
}

function validateWritebackEdits(edits: readonly BoundedTextEdit[]): void {
    try {
        validateEditsForOverlap(edits);
    } catch (error) {
        throw new WritebackTransactionError(
            'validation_failed',
            error instanceof Error ? error.message : String(error)
        );
    }
}

/**
 * Several independently bounded planners may append to the same syntactic
 * slot (for example technology, `$tags`, and coordinates on a minimal
 * element call). Joining only zero-width insertions preserves one atomic
 * WorkspaceEdit without weakening the overlap guard for replacements.
 */
function coalesceSameOffsetInsertions(edits: readonly BoundedTextEdit[]): BoundedTextEdit[] {
    const result: BoundedTextEdit[] = [];
    for (const edit of edits) {
        const isInsertion = edit.range.start.offset === edit.range.end.offset;
        const previous = result[result.length - 1];
        if (isInsertion && previous &&
            previous.range.start.offset === previous.range.end.offset &&
            previous.range.start.offset === edit.range.start.offset) {
            result[result.length - 1] = {
                range: previous.range,
                newText: previous.newText + edit.newText,
            };
        } else {
            result.push(edit);
        }
    }
    return result;
}

/**
 * Executes an atomic metadata writeback transaction through an injected host boundary.
 * Performs revision validation, plans edits, applies WorkspaceEdit, and runs re-parse structural validation.
 * If structural validation fails, restores the original source text through the host boundary.
 */
/**
 * The exact source text a range covers, captured so planners can reject a
 * same-length rewrite that offset/line/column geometry cannot detect.
 */
function sliceForRange(source: string, range: { start: { offset: number }; end: { offset: number } }): string {
    return source.slice(range.start.offset, range.end.offset);
}

export async function executeWritebackTransaction(
    document: WritebackDocument,
    rawMessage: VisualLayoutMessage,
    anchor: SaveAnchor = createImplicitNativeAnchor(document),
    boundary: WritebackTransactionBoundary = createDefaultVscodeWritebackTransactionBoundary(),
): Promise<boolean> {
    const message = normalizeMessage(rawMessage);

    // 1. Revision Check
    if (String(document.version) !== String(message.revision)) {
        throw new WritebackTransactionError(
            'stale_revision',
            `Document revision mismatch: expected ${message.revision}, got ${document.version}`
        );
    }

    const observedVersion = document.version;
    const originalText = document.getText();
    const textTrim = originalText.trim();
    const isStructurizrDsl = document.languageId === 'structurizr-dsl' ||
                             document.fileName.endsWith('.dsl') ||
                             textTrim.startsWith('workspace') ||
                             textTrim.includes('workspace {');
    const isPlantUML = document.languageId === 'plantuml' ||
                       document.fileName.endsWith('.puml') ||
                       textTrim.startsWith('@startuml');

    const edits: BoundedTextEdit[] = [];
    const persistenceMode = boundary.getLayoutPersistenceMode();
    const useSidecar = persistenceMode === 'sidecar' || isStructurizrDsl || isPlantUML;

    let parsedAST: ReturnType<C4XParser['parse']> | null = null;
    if (!isStructurizrDsl && !isPlantUML) {
        try {
            parsedAST = parser.parse(originalText);
        } catch (err) {
            throw new WritebackTransactionError(
                'validation_failed',
                `Failed to parse C4X document: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    let originalModel: C4Model | null = null;
    if (parsedAST) {
        try {
            originalModel = builder.build(parsedAST, 'Original');
        } catch (err) {
            throw new WritebackTransactionError(
                'validation_failed',
                `Failed to build C4 model: ${err instanceof Error ? err.message : String(err)}`
            );
        }
    }

    const targetIds = new Set<string>();
    const allowedDescriptionChanges = new Set<string>();
    const allowedSemanticChanges = new Map<string, SemanticChangeAllowance>();
    const allowedRelationshipChanges = new Map<string, RelationshipChangeAllowance>();
    const allowedBoundaryChanges = new Set<string>();
    const allowedRelationshipAdds: Array<{ from: string; to: string; label: string; relType: string; technology?: string }> = [];

    function findModelElement(id: string): C4Element | undefined {
        if (!originalModel) {
            return undefined;
        }
        const search = (elements: C4Element[]): C4Element | undefined => {
            for (const el of elements) {
                if (el.id === id) { return el; }
                if (el.children) {
                    const found = search(el.children);
                    if (found) { return found; }
                }
            }
            return undefined;
        };
        for (const view of originalModel.views) {
            const found = search(view.elements);
            if (found) { return found; }
        }
        return undefined;
    }

    for (const stagedEdit of message.edits) {
        targetIds.add(stagedEdit.id);

        // Boundary geometry edits target a subgraph boundary, not an element.
        if (stagedEdit.boundaryId !== undefined) {
            if (isStructurizrDsl || isPlantUML) {
                throw new WritebackTransactionError('validation_failed', 'Boundary editing is only supported for native C4X source.');
            }
            if (!parsedAST) {
                throw new WritebackTransactionError('validation_failed', 'C4X source could not be parsed for boundary editing.');
            }
            const rawBoundary = findBoundaryByGeneratedId(parsedAST.boundaries ?? [], stagedEdit.boundaryId);
            if (!rawBoundary || !rawBoundary.sourceRange) {
                throw new WritebackTransactionError(
                    'missing_element',
                    `Boundary "${stagedEdit.boundaryId}" was not found in the current document.`
                );
            }
            const hasBoundaryPosition = stagedEdit.x !== undefined || stagedEdit.y !== undefined;
            const hasBoundarySize = stagedEdit.w !== undefined || stagedEdit.h !== undefined;
            if (hasBoundaryPosition && (stagedEdit.x === undefined || stagedEdit.y === undefined)) {
                throw new WritebackTransactionError('invalid_payload', 'Boundary position edits require both x and y.');
            }
            if (hasBoundarySize && (stagedEdit.w === undefined || stagedEdit.h === undefined)) {
                throw new WritebackTransactionError('invalid_payload', 'Boundary size edits require both w and h.');
            }
            const targetRef: NativeBoundarySourceRef = {
                boundaryLabel: rawBoundary.label,
                range: rawBoundary.sourceRange,
            };
            try {
                edits.push(...planBoundaryMetadataUpdate(originalText, targetRef, {
                    ...(stagedEdit.x !== undefined && stagedEdit.y !== undefined ? { x: stagedEdit.x, y: stagedEdit.y } : {}),
                    ...(stagedEdit.w !== undefined && stagedEdit.h !== undefined ? { w: stagedEdit.w, h: stagedEdit.h } : {}),
                }));
            } catch (error) {
                throw new WritebackTransactionError(
                    'validation_failed',
                    error instanceof Error ? error.message : String(error),
                );
            }
            allowedBoundaryChanges.add(stagedEdit.boundaryId);
            if (rawBoundary.sourceId) {
                allowedBoundaryChanges.add(rawBoundary.sourceId);
            }
            continue;
        }

        // Relationship edits target an edge (rel-N), not an element.
        if (stagedEdit.edgeId !== undefined) {
            if (isStructurizrDsl || isPlantUML) {
                throw new WritebackTransactionError('validation_failed', 'Relationship editing is only supported for native C4X source.');
            }
            if (!parsedAST) {
                throw new WritebackTransactionError('validation_failed', 'C4X source could not be parsed for relationship editing.');
            }
            const edgeIndexMatch = /^rel-(\d+)$/.exec(stagedEdit.edgeId);
            const relationship = edgeIndexMatch
                ? parsedAST.relationships[Number(edgeIndexMatch[1])]
                : undefined;
            if (!relationship || !relationship.sourceRange) {
                throw new WritebackTransactionError(
                    'missing_element',
                    `Relationship "${stagedEdit.edgeId}" was not found in the current document.`
                );
            }
            const relRef: NativeElementSourceRef = {
                elementId: stagedEdit.edgeId,
                range: relationship.sourceRange,
                expectedText: sliceForRange(originalText, relationship.sourceRange),
            };
            const allowance: { label?: boolean; technology?: boolean; relType?: boolean; from?: boolean; to?: boolean; } = {};
            try {
                if (stagedEdit.label !== undefined) {
                    edits.push(...planRelationshipLabelUpdate(originalText, relRef, stagedEdit.label));
                    allowance.label = true;
                }
                if (stagedEdit.technology !== undefined) {
                    edits.push(...planRelationshipTechnologyUpdate(originalText, relRef, stagedEdit.technology));
                    allowance.technology = true;
                }
                if (stagedEdit.relType !== undefined) {
                    edits.push(...planRelationshipTypeUpdate(originalText, relRef, stagedEdit.relType));
                    allowance.relType = true;
                }
                if (stagedEdit.from !== undefined || stagedEdit.to !== undefined) {
                    const fromId = stagedEdit.from ?? relationship.from;
                    const toId = stagedEdit.to ?? relationship.to;
                    const sourceEl = findModelElement(fromId);
                    const targetEl = findModelElement(toId);
                    if (!sourceEl || !targetEl) {
                        throw new WritebackTransactionError('missing_element', `Relationship endpoint "${fromId}" or "${toId}" was not found in the current document.`);
                    }
                    const legality = isRelationshipLegal(sourceEl, targetEl);
                    if (!legality.legal) {
                        throw new WritebackTransactionError('validation_failed', legality.reason ?? 'Illegal relationship endpoint');
                    }
                    if (stagedEdit.from !== undefined) {
                        edits.push(...planRelationshipEndpointUpdate(originalText, relRef, 'from', stagedEdit.from));
                        allowance.from = true;
                    }
                    if (stagedEdit.to !== undefined) {
                        edits.push(...planRelationshipEndpointUpdate(originalText, relRef, 'to', stagedEdit.to));
                        allowance.to = true;
                    }
                }
            } catch (error) {
                throw new WritebackTransactionError(
                    'validation_failed',
                    error instanceof Error ? error.message : String(error),
                );
            }
            if (Object.keys(allowance).length > 0) {
                allowedRelationshipChanges.set(stagedEdit.edgeId, allowance);
            }
            continue;
        }

        if (stagedEdit.addRelationship !== undefined) {
            if (isStructurizrDsl || isPlantUML) {
                throw new WritebackTransactionError('validation_failed', 'Relationship addition is only supported for native C4X source.');
            }
            if (!parsedAST) {
                throw new WritebackTransactionError('validation_failed', 'C4X source could not be parsed for relationship addition.');
            }
            const sourceElement = findElementById(parsedAST.elements, stagedEdit.id);
            if (!sourceElement || !sourceElement.sourceRange) {
                throw new WritebackTransactionError(
                    'missing_element',
                    `Element "${stagedEdit.id}" was not found in the current document.`,
                );
            }
            const sourceC4Element = findModelElement(stagedEdit.id);
            if (!sourceC4Element) {
                throw new WritebackTransactionError(
                    'missing_element',
                    `Relationship endpoint "${stagedEdit.id}" was not found in the current document.`,
                );
            }
            const sourceRef: NativeElementSourceRef = {
                elementId: stagedEdit.id,
                range: sourceElement.sourceRange,
                expectedText: sliceForRange(originalText, sourceElement.sourceRange),
            };
            // Each add is planned as an independent insertion at the same
            // anchor. They are zero-width insertions at one offset, so the
            // overlap guard coalesces rather than rejects them.
            for (const add of stagedEdit.addRelationship) {
                const targetC4Element = findModelElement(add.targetId);
                if (!targetC4Element) {
                    throw new WritebackTransactionError(
                        'missing_element',
                        `Relationship endpoint "${add.targetId}" was not found in the current document.`,
                    );
                }
                const legality = isRelationshipLegal(sourceC4Element, targetC4Element);
                if (!legality.legal) {
                    throw new WritebackTransactionError('validation_failed', legality.reason ?? 'Illegal relationship');
                }
                try {
                    edits.push(...planRelationshipAdd(
                        originalText,
                        sourceRef,
                        add.targetId,
                        add.label,
                        add.technology ?? null,
                        add.relType,
                    ));
                } catch (error) {
                    throw new WritebackTransactionError(
                        'validation_failed',
                        error instanceof Error ? error.message : String(error),
                    );
                }
                allowedRelationshipAdds.push({
                    from: stagedEdit.id,
                    to: add.targetId,
                    label: add.label,
                    relType: add.relType,
                    technology: add.technology ?? undefined,
                });
            }
            targetIds.add(stagedEdit.id);
            continue;
        }

        if (stagedEdit.description !== undefined) {
            allowedDescriptionChanges.add(stagedEdit.id);
        }
        if (hasSemanticChanges(stagedEdit)) {
            allowedSemanticChanges.set(stagedEdit.id, {
                ...(stagedEdit.label !== undefined ? { label: true } : {}),
                ...(stagedEdit.technology !== undefined ? { technology: true } : {}),
                ...(stagedEdit.description !== undefined ? { description: true } : {}),
                ...(stagedEdit.tags !== undefined ? { tags: true } : {}),
                ...(stagedEdit.sprite !== undefined ? { sprite: true } : {}),
                ...(stagedEdit.newId !== undefined ? { newId: stagedEdit.newId } : {}),
            });
        }

        let elementExists = false;
        let element: HasIdAndChildren | null = null;

        if (isStructurizrDsl) {
            if (hasSemanticChanges(stagedEdit)) {
                throw new WritebackTransactionError('validation_failed', 'Semantic editing is not supported for external DSL diagrams.');
            }
            try {
                const model = parseStructurizrDSL(originalText);
                elementExists = modelHasElement(model, stagedEdit.id);
            } catch (err) {
                throw new WritebackTransactionError('validation_failed', `Failed to parse Structurizr: ${err instanceof Error ? err.message : String(err)}`);
            }
        } else if (isPlantUML) {
            if (hasSemanticChanges(stagedEdit)) {
                throw new WritebackTransactionError('validation_failed', 'Semantic editing is not supported for PlantUML diagrams.');
            }
            try {
                const model = parsePlantUMLtoC4Model(originalText);
                elementExists = modelHasElement(model, stagedEdit.id);
            } catch (err) {
                throw new WritebackTransactionError('validation_failed', `Failed to parse PlantUML: ${err instanceof Error ? err.message : String(err)}`);
            }
        } else {
            if (parsedAST) {
                element = findElementById(parsedAST.elements, stagedEdit.id);
                elementExists = !!element;
            }
        }

        if (!elementExists) {
            throw new WritebackTransactionError(
                'missing_element',
                `Element "${stagedEdit.id}" was not found in the current document.`
            );
        }

        if (hasSemanticChanges(stagedEdit)) {
            if (!element || !element.sourceRange) {
                throw new WritebackTransactionError(
                    'missing_element',
                    `Element "${stagedEdit.id}" has no source range in the native document.`
                );
            }
            const targetRef: NativeElementSourceRef = {
                elementId: stagedEdit.id,
                range: element.sourceRange,
                expectedText: sliceForRange(originalText, element.sourceRange),
            };
            try {
                if (stagedEdit.label !== undefined || stagedEdit.technology !== undefined || stagedEdit.description !== undefined) {
                    edits.push(...planElementTextUpdates(originalText, targetRef, {
                        ...(typeof stagedEdit.label === 'string' ? { label: stagedEdit.label } : {}),
                        ...(stagedEdit.technology !== undefined ? { technology: stagedEdit.technology } : {}),
                        ...(stagedEdit.description !== undefined ? { description: stagedEdit.description } : {}),
                    }));
                }
                if (stagedEdit.tags !== undefined || stagedEdit.sprite !== undefined) {
                    edits.push(...planElementAttributeUpdates(originalText, targetRef, {
                        ...(stagedEdit.tags !== undefined ? { tags: stagedEdit.tags } : {}),
                        ...(stagedEdit.sprite !== undefined ? { sprite: stagedEdit.sprite } : {}),
                    }));
                }
                if (stagedEdit.newId !== undefined) {
                    edits.push(...planElementIdRename(originalText, targetRef, stagedEdit.newId));
                }
            } catch (error) {
                throw new WritebackTransactionError(
                    'validation_failed',
                    error instanceof Error ? error.message : String(error),
                );
            }
        }

        // Plan positional semantic fields before metadata. On a minimal call
        // such as `Person(User, "User")`, both can insert at the closing
        // parenthesis; their order must remain grammar-valid when coalesced.
        if (stagedEdit.x !== undefined || stagedEdit.y !== undefined || stagedEdit.locked !== undefined) {
            if (stagedEdit.x !== undefined || stagedEdit.y !== undefined) {
                if (stagedEdit.x === undefined || typeof stagedEdit.x !== 'number' || !Number.isFinite(stagedEdit.x) ||
                    stagedEdit.y === undefined || typeof stagedEdit.y !== 'number' || !Number.isFinite(stagedEdit.y)) {
                    throw new WritebackTransactionError('invalid_payload', 'Invalid layout coordinates');
                }
            }
            if (useSidecar) {
                if (stagedEdit.x !== undefined && stagedEdit.y !== undefined) {
                    await saveSidecarLayout(document.uri, stagedEdit.id, stagedEdit.x, stagedEdit.y, boundary);
                }
                // locked flag is not stored in the sidecar; it requires native C4X source
            } else {
                if (!element || !element.sourceRange) {
                    throw new WritebackTransactionError(
                        'missing_element',
                        `Element "${stagedEdit.id}" has no source range in the native document.`
                    );
                }
                const targetRef: NativeElementSourceRef = {
                    elementId: stagedEdit.id,
                    range: element.sourceRange,
                    expectedText: sliceForRange(originalText, element.sourceRange),
                };
                edits.push(...planMetadataUpdate(originalText, targetRef, {
                    ...(stagedEdit.x !== undefined && stagedEdit.y !== undefined ? { x: stagedEdit.x, y: stagedEdit.y } : {}),
                    ...(stagedEdit.locked !== undefined ? { locked: stagedEdit.locked } : {}),
                }));
            }
        }
    }

    if (edits.length === 0) {
        return true;
    }

    const coalescedEdits = coalesceSameOffsetInsertions(edits);
    validateWritebackEdits(coalescedEdits);

    if (document.version !== observedVersion) {
        throw new WritebackTransactionError(
            'stale_revision',
            `Document changed during writeback: expected version ${observedVersion}, got ${document.version}`
        );
    }

    assertAnchorResolves(document, anchor);

    const editApplied = await boundary.applyBoundedEdits(document, coalescedEdits);
    if (!editApplied) {
        throw new WritebackTransactionError('validation_failed', 'Failed to apply workspace edit');
    }

    const updatedText = document.getText();
    try {
        const originalAST = parser.parse(originalText);
        const updatedAST = parser.parse(updatedText);

        const originalModel = builder.build(originalAST, 'Original');
        const updatedModel = builder.build(updatedAST, 'Updated');

        assertStructuralEquivalence(originalModel, updatedModel, targetIds, allowedDescriptionChanges, allowedSemanticChanges, allowedRelationshipChanges, allowedBoundaryChanges, allowedRelationshipAdds);
        return true;
    } catch (err) {
        await restoreDocument(
            document,
            originalText,
            err instanceof Error ? err.message : String(err),
            boundary,
        );
        throw new WritebackTransactionError(
            'validation_failed',
            `Structural validation failed, rolled back changes. Reason: ${err instanceof Error ? err.message : String(err)}`
        );
    }
}

function normalizeMessage(message: VisualLayoutMessage): ApplySemanticEditsMessage {
    if (message.type === 'visualLayout.applySemanticEdits') {
        return message;
    }
    if (message.type === 'visualLayout.updateRelationship') {
        // Normalize the single-relationship message into the batch shape; the
        // transaction's edge branch validates the payload from there.
        return {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: message.protocolVersion,
            revision: message.revision,
            edits: [{
                id: message.id,
                edgeId: message.id,
                ...(message.changes.label !== undefined ? { label: message.changes.label } : {}),
                ...(message.changes.technology !== undefined ? { technology: message.changes.technology } : {}),
                ...(message.changes.relType !== undefined ? { relType: message.changes.relType } : {}),
                ...(message.changes.from !== undefined ? { from: message.changes.from } : {}),
                ...(message.changes.to !== undefined ? { to: message.changes.to } : {}),
            }],
        };
    }
    if (message.type === 'addRelationship') {
        return {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: message.protocolVersion,
            revision: message.revision,
            edits: [{
                id: message.sourceId,
                description: `Added relationship ${message.sourceId} → ${message.targetId}: ${message.label}`,
                addRelationship: [{
                    targetId: message.targetId,
                    label: message.label,
                    relType: message.relType,
                    technology: message.technology ?? null,
                }],
            }],
        };
    }
    return {
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: message.protocolVersion,
        revision: message.revision,
        edits: [{
            id: message.id,
            x: message.x,
            y: message.y
        }]
    };
}

export function assertStructuralEquivalence(
    original: C4Model,
    updated: C4Model,
    targetIds: Set<string> | string,
    allowedDescriptionChanges?: Set<string>,
    allowedSemanticChanges: ReadonlyMap<string, SemanticChangeAllowance> = new Map(),
    allowedRelationshipChanges: ReadonlyMap<string, RelationshipChangeAllowance> = new Map(),
    allowedBoundaryChanges?: ReadonlySet<string>,
    allowedRelationshipAdds: ReadonlyArray<{ from: string; to: string; label: string; relType: string; technology?: string }> = [],
): void {
    const targets = typeof targetIds === 'string' ? new Set([targetIds]) : targetIds;

    if (original.views.length !== updated.views.length) {
        throw new Error('Views count changed');
    }

    const getFlatElements = (elements: C4Element[]): Map<string, C4Element> => {
        const map = new Map<string, C4Element>();
        const traverse = (el: C4Element) => {
            map.set(el.id, el);
            if (el.children) {
                for (const child of el.children) {
                    traverse(child);
                }
            }
        };
        for (const el of elements) {
            traverse(el);
        }
        return map;
    };

    // An allowed relationship add lands in whichever views contain both of its
    // endpoints — usually one of several. Materialisation is therefore checked
    // once across all views, never per view.
    const addsSeenInSomeView = new Set<number>();

    for (let vIdx = 0; vIdx < original.views.length; vIdx++) {
        const origView = original.views[vIdx];
        const updView = updated.views[vIdx];

        if (origView.type !== updView.type) {
            throw new Error(`View type changed at index ${vIdx}`);
        }
        if (origView.direction !== updView.direction) {
            throw new Error(`View layout direction changed at index ${vIdx}`);
        }

        const origElMap = getFlatElements(origView.elements);
        const updElMap = getFlatElements(updView.elements);

        if (origElMap.size !== updElMap.size) {
            throw new Error(`Elements count changed in view ${vIdx}`);
        }

        for (const [id, origEl] of origElMap.entries()) {
            const allowance = allowedSemanticChanges.get(id);
            const updatedId = allowance?.newId ?? id;
            const updEl = updElMap.get(updatedId);
            if (!updEl) {
                throw new Error(`Element ${id} was deleted or renamed`);
            }

            const origTech = origEl.technology ?? '';
            const updTech = updEl.technology ?? '';
            const origDesc = origEl.description ?? '';
            const updDesc = updEl.description ?? '';

            if (origEl.type !== updEl.type ||
                (origEl.label !== updEl.label && !allowance?.label) ||
                (origTech !== updTech && !allowance?.technology) ||
                (origDesc !== updDesc && !allowedDescriptionChanges?.has(id) && !allowance?.description) ||
                (JSON.stringify(origEl.tags) !== JSON.stringify(updEl.tags) && !allowance?.tags) ||
                ((origEl.sprite ?? '') !== (updEl.sprite ?? '') && !allowance?.sprite)) {
                throw new Error(`Structural property mismatch on element ${id}`);
            }

            // If it is NOT one of the target elements, the metadata MUST be completely identical
            if (!targets.has(id)) {
                if (JSON.stringify(origEl.metadata) !== JSON.stringify(updEl.metadata)) {
                    throw new Error(`Metadata changed for non-target element ${id}`);
                }
            } else {
                // If it IS a target element, let's verify only $x, $y, $locked are added/changed
                const origMeta = origEl.metadata || {};
                const updMeta = updEl.metadata || {};
                const allowedPatchKeys = ['x', 'y', 'locked'];

                for (const key of Object.keys(origMeta)) {
                    if (!allowedPatchKeys.includes(key) && origMeta[key] !== updMeta[key]) {
                        throw new Error(`Non-layout metadata key "${key}" was modified on target element ${id}`);
                    }
                }
                for (const key of Object.keys(updMeta)) {
                    if (!allowedPatchKeys.includes(key) && origMeta[key] !== updMeta[key]) {
                        throw new Error(`Non-layout metadata key "${key}" was added to target element ${id}`);
                    }
                }
            }
        }

        // Check relationships. The expected count is per view: only the allowed
        // adds that actually materialised in THIS view may increase it.
        const remapId = (id: string): string => allowedSemanticChanges.get(id)?.newId ?? id;
        const origRelsById = new Map(origView.relationships.map(r => [r.id, r]));
        let addsMatchedInThisView = 0;
        for (const updRel of updView.relationships) {
            let origRel = origRelsById.get(updRel.id);
            if (!origRel) {
                // Stable rel-N ids may be absent in synthetic test models; fall
                // back to matching by the remapped endpoint pair.
                origRel = origView.relationships.find(r =>
                    remapId(r.from) === updRel.from && remapId(r.to) === updRel.to
                );
            }
            if (!origRel) {
                // The relationship may be an explicitly allowed new relationship.
                const addIndex = allowedRelationshipAdds.findIndex(add =>
                    add.from === updRel.from &&
                    add.to === updRel.to &&
                    add.label === updRel.label &&
                    add.relType === updRel.relType &&
                    (add.technology ?? '') === (updRel.technology ?? '')
                );
                if (addIndex !== -1) {
                    addsSeenInSomeView.add(addIndex);
                    addsMatchedInThisView++;
                    continue;
                }
                throw new Error(`Relationship ${updRel.id} was added or source/target changed`);
            }
            const allowance = allowedRelationshipChanges.get(origRel.id);
            const fromRenamedTo = allowedSemanticChanges.get(origRel.from)?.newId;
            const toRenamedTo = allowedSemanticChanges.get(origRel.to)?.newId;

            const fromChanged = origRel.from !== updRel.from;
            const toChanged = origRel.to !== updRel.to;
            const fromAllowed = allowance?.from === true || (fromRenamedTo !== undefined && fromRenamedTo === updRel.from);
            const toAllowed = allowance?.to === true || (toRenamedTo !== undefined && toRenamedTo === updRel.to);

            if (fromChanged && !fromAllowed) {
                throw new Error(`Relationship ${origRel.from}->${origRel.to} was added or source/target changed unexpectedly`);
            }
            if (toChanged && !toAllowed) {
                throw new Error(`Relationship ${origRel.from}->${origRel.to} was added or source/target changed unexpectedly`);
            }
            if ((origRel.label !== updRel.label && !allowance?.label) ||
                (origRel.relType !== updRel.relType && !allowance?.relType) ||
                (origRel.technology !== updRel.technology && !allowance?.technology)) {
                throw new Error(`Relationship properties changed for ${origRel.from}->${origRel.to}`);
            }
        }

        if (origView.relationships.length + addsMatchedInThisView !== updView.relationships.length) {
            throw new Error(`Relationships count changed in view ${vIdx}`);
        }

        // Check boundaries
        const origBoundaries = origView.boundaries || [];
        const updBoundaries = updView.boundaries || [];
        if (origBoundaries.length !== updBoundaries.length) {
            throw new Error(`Boundaries count changed in view ${vIdx}`);
        }

        const origBMap = new Map(origBoundaries.map(b => [b.sourceId || b.id, b]));
        for (const updB of updBoundaries) {
            const bKey = updB.sourceId || updB.id;
            const origB = origBMap.get(bKey);
            if (!origB) {
                throw new Error(`Boundary ${bKey} was added or modified`);
            }
            // A permitted identifier rename necessarily changes the element
            // membership recorded by a boundary. Compare against that
            // explicit remapping, while still rejecting every other boundary
            // mutation.
            const expectedElements = allowedSemanticChanges.size > 0
                ? origB.elements.map(remapId)
                : origB.elements;
            if (origB.label !== updB.label ||
                origB.direction !== updB.direction ||
                JSON.stringify(expectedElements) !== JSON.stringify(updB.elements)) {
                throw new Error(`Boundary properties changed for ${bKey}`);
            }

            // Boundary metadata may only change when the boundary is an explicit
            // target of this transaction.
            if (!allowedBoundaryChanges?.has(bKey)) {
                if (JSON.stringify(origB.metadata) !== JSON.stringify(updB.metadata)) {
                    throw new Error(`Boundary metadata changed for non-target boundary ${bKey}`);
                }
            }
        }
    }

    // Every planned relationship add must show up somewhere, or the write did
    // not do what the staged edit said it would.
    for (let addIndex = 0; addIndex < allowedRelationshipAdds.length; addIndex++) {
        if (!addsSeenInSomeView.has(addIndex)) {
            const add = allowedRelationshipAdds[addIndex];
            throw new Error(
                `Allowed relationship add ${add.from}->${add.to} was not materialised in the updated model`,
            );
        }
    }
}

/**
 * Resets all layout coordinates ($x, $y, $locked) for the active document.
 * Removes coordinates from .c4x-layout.json if sidecar mode, or strips them inline if native mode.
 */
export async function executeResetLayoutTransaction(
    document: WritebackDocument,
    anchor: SaveAnchor = createImplicitNativeAnchor(document),
    boundary: WritebackTransactionBoundary = createDefaultVscodeWritebackTransactionBoundary(),
): Promise<boolean> {
    const originalText = document.getText();
    const observedVersion = document.version;
    const textTrim = originalText.trim();
    const isStructurizrDsl = document.languageId === 'structurizr-dsl' ||
                             document.fileName.endsWith('.dsl') ||
                             textTrim.startsWith('workspace') ||
                             textTrim.includes('workspace {');
    const isPlantUML = document.languageId === 'plantuml' ||
                       document.fileName.endsWith('.puml') ||
                       textTrim.startsWith('@startuml');

    const persistenceMode = boundary.getLayoutPersistenceMode();
    const useSidecar = persistenceMode === 'sidecar' || isStructurizrDsl || isPlantUML;

    if (useSidecar) {
        await resetSidecarLayout(document.uri, boundary);
        return true;
    }

    // Native inline reset
    let parsedAST;
    try {
        parsedAST = parser.parse(originalText);
    } catch (err) {
        throw new WritebackTransactionError('validation_failed', `Failed to parse C4X document: ${err instanceof Error ? err.message : String(err)}`);
    }

    const edits: BoundedTextEdit[] = [];
    const collectEdits = (elements: HasIdAndChildren[]) => {
        for (const el of elements) {
            if (el.sourceRange && el.metadata && (el.metadata.x || el.metadata.y || el.metadata.locked)) {
                const targetRef: NativeElementSourceRef = {
                    elementId: el.id,
                    range: el.sourceRange,
                    expectedText: sliceForRange(originalText, el.sourceRange),
                };
                const resetEdits = planMetadataReset(originalText, targetRef);
                edits.push(...resetEdits);
            }
            if (el.children) {
                collectEdits(el.children);
            }
        }
    };

    collectEdits(parsedAST.elements);

    if (edits.length === 0) {
        return true; // No layout coordinates to reset
    }

    // Sort edits back-to-front by start offset to prevent range shift errors
    edits.sort((a, b) => b.range.start.offset - a.range.start.offset);

    // Validate edits do not overlap before touching the document
    validateWritebackEdits(edits);

    // Re-check version immediately before apply to catch races
    if (document.version !== observedVersion) {
        throw new WritebackTransactionError(
            'stale_revision',
            `Document changed during layout reset: expected version ${observedVersion}, got ${document.version}`
        );
    }

    // Resolve the save anchor immediately before apply — fails closed if the
    // document drifted between anchor capture and this reset. No edits applied.
    assertAnchorResolves(document, anchor);

    // Apply the host edit as one transaction through the boundary
    const editApplied = await boundary.applyBoundedEdits(document, edits);
    if (!editApplied) {
        throw new WritebackTransactionError('validation_failed', 'Failed to apply workspace edit for layout reset');
    }

    return true;
}
