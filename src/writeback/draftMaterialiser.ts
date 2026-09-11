/**
 * Draft materialisation — shared function used by both the source-diff panel
 * and the Save (WritebackTransaction) path.
 *
 * Given a C4X source string and a list of staged edits, materialises the text
 * that would result if those edits were applied at Save time. This is a
 * read-only, non-destructive operation: it never touches any document,
 * workspace, or sidecar. It is the single source of truth for what the diff
 * panel shows and what Save actually writes.
 *
 * Only native C4X (`.c4x` and Markdown-embedded blocks) is supported here.
 * Structurizr/PlantUML layout edits go to the sidecar — their source text is
 * unchanged by staged edits so the diff for those formats is always empty.
 */

import { C4XParser } from '../parser/C4XParser';
import {
    planElementAttributeUpdates,
    planElementIdRename,
    planElementTextUpdates,
    planMetadataUpdate,
    planRelationshipLabelUpdate,
    planBoundaryMetadataUpdate,
    planRelationshipTechnologyUpdate,
    planRelationshipTypeUpdate,
    planRelationshipEndpointUpdate,
    NativeElementSourceRef,
    NativeBoundarySourceRef,
} from './NativeMutationPlanner';
import {
    applyBoundedEdits,
    BoundedTextEdit,
} from './SourceRange';
import { StagedEdit } from '../webview/visualLayoutProtocol';
import { RawBoundary } from '../parser/types';

const parser = new C4XParser();

function findBoundaryByGeneratedId(boundaries: RawBoundary[], id: string): RawBoundary | undefined {
    for (let i = 0; i < boundaries.length; i++) {
        const generatedId = boundaries[i].label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + i;
        if (generatedId === id) {
            return boundaries[i];
        }
    }
    return undefined;
}

interface HasIdAndChildren {
    id: string;
    children?: HasIdAndChildren[];
    sourceRange?: import('./SourceRange').SourceRange;
    metadata?: Record<string, string>;
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
 * Several independently bounded planners may append to the same syntactic
 * slot. Joining only zero-width insertions preserves one atomic edit without
 * weakening the overlap guard for replacements.
 */
function coalesceSameOffsetInsertions(edits: readonly BoundedTextEdit[]): BoundedTextEdit[] {
    const result: BoundedTextEdit[] = [];
    for (const edit of edits) {
        const isInsertion = edit.range.start.offset === edit.range.end.offset;
        const previous = result[result.length - 1];
        if (
            isInsertion &&
            previous &&
            previous.range.start.offset === previous.range.end.offset &&
            previous.range.start.offset === edit.range.start.offset
        ) {
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

export type MaterialiseResult =
    | { ok: true; text: string }
    | { ok: false; reason: string };

/**
 * Compute the source text that would result from applying `edits` to
 * `originalSource`. Returns `{ ok: true, text }` on success, or
 * `{ ok: false, reason }` when the edits cannot be planned (e.g. parse
 * failure, missing element, unsupported syntax).
 *
 * Sidecar-only edits (position-only updates for non-native formats) return
 * the original source unchanged because the position data is stored in the
 * sidecar, not in the source.
 *
 * @param originalSource   The C4X block body or native document text.
 * @param edits            The staged edits from the webview.
 * @param useSidecar       When true, position edits are sidecar-only; source
 *                         text is unchanged.
 */
export function materialiseDraft(
    originalSource: string,
    edits: readonly StagedEdit[],
    useSidecar = false,
): MaterialiseResult {
    if (edits.length === 0) {
        return { ok: true, text: originalSource };
    }

    let parsedAST: ReturnType<typeof parser.parse> | null = null;
    try {
        parsedAST = parser.parse(originalSource);
    } catch (err) {
        return {
            ok: false,
            reason: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }

    const pendingEdits: BoundedTextEdit[] = [];

    for (const staged of edits) {
        // Boundary geometry edits target a subgraph boundary, not an element.
        if (staged.boundaryId !== undefined) {
            const rawBoundary = findBoundaryByGeneratedId(parsedAST.boundaries ?? [], staged.boundaryId);
            if (!rawBoundary || !rawBoundary.sourceRange) {
                return { ok: false, reason: `Boundary "${staged.boundaryId}" not found in source.` };
            }
            const ref: NativeBoundarySourceRef = { boundaryLabel: rawBoundary.label, range: rawBoundary.sourceRange };
            try {
                pendingEdits.push(...planBoundaryMetadataUpdate(originalSource, ref, {
                    ...(staged.x !== undefined && staged.y !== undefined ? { x: staged.x, y: staged.y } : {}),
                    ...(staged.w !== undefined && staged.h !== undefined ? { w: staged.w, h: staged.h } : {}),
                }));
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
            continue;
        }

        // Relationship edits target an edge, not an element.
        if (staged.edgeId !== undefined) {
            const edgeIndexMatch = /^rel-(\d+)$/.exec(staged.edgeId);
            const relationship = edgeIndexMatch
                ? parsedAST.relationships[Number(edgeIndexMatch[1])]
                : undefined;
            if (!relationship || !relationship.sourceRange) {
                return { ok: false, reason: `Relationship "${staged.edgeId}" not found in source.` };
            }
            const relRef: NativeElementSourceRef = {
                elementId: staged.edgeId,
                range: relationship.sourceRange,
            };
            try {
                if (staged.label !== undefined) {
                    pendingEdits.push(...planRelationshipLabelUpdate(originalSource, relRef, staged.label));
                }
                if (staged.technology !== undefined) {
                    pendingEdits.push(...planRelationshipTechnologyUpdate(originalSource, relRef, staged.technology));
                }
                if (staged.relType !== undefined) {
                    pendingEdits.push(...planRelationshipTypeUpdate(originalSource, relRef, staged.relType));
                }
                if (staged.from !== undefined) {
                    pendingEdits.push(...planRelationshipEndpointUpdate(originalSource, relRef, 'from', staged.from));
                }
                if (staged.to !== undefined) {
                    pendingEdits.push(...planRelationshipEndpointUpdate(originalSource, relRef, 'to', staged.to));
                }
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
            continue;
        }

        const element = findElementById(parsedAST.elements, staged.id);
        if (!element) {
            return { ok: false, reason: `Element "${staged.id}" not found in source.` };
        }

        // Semantic text edits (label, technology, description)
        if (staged.label !== undefined || staged.technology !== undefined || staged.description !== undefined) {
            if (!element.sourceRange) {
                return { ok: false, reason: `Element "${staged.id}" has no source range.` };
            }
            const ref: NativeElementSourceRef = { elementId: staged.id, range: element.sourceRange };
            try {
                pendingEdits.push(...planElementTextUpdates(originalSource, ref, {
                    ...(typeof staged.label === 'string' ? { label: staged.label } : {}),
                    ...(staged.technology !== undefined ? { technology: staged.technology } : {}),
                    ...(staged.description !== undefined ? { description: staged.description } : {}),
                }));
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
        }

        // Attribute edits (tags, sprite)
        if (staged.tags !== undefined || staged.sprite !== undefined) {
            if (!element.sourceRange) {
                return { ok: false, reason: `Element "${staged.id}" has no source range.` };
            }
            const ref: NativeElementSourceRef = { elementId: staged.id, range: element.sourceRange };
            try {
                pendingEdits.push(...planElementAttributeUpdates(originalSource, ref, {
                    ...(staged.tags !== undefined ? { tags: staged.tags } : {}),
                    ...(staged.sprite !== undefined ? { sprite: staged.sprite } : {}),
                }));
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
        }

        // Identifier rename
        if (staged.newId !== undefined) {
            if (!element.sourceRange) {
                return { ok: false, reason: `Element "${staged.id}" has no source range.` };
            }
            const ref: NativeElementSourceRef = { elementId: staged.id, range: element.sourceRange };
            try {
                pendingEdits.push(...planElementIdRename(originalSource, ref, staged.newId));
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
        }

        // Layout coordinate and lock edits — coordinates only for native (non-sidecar) mode;
        // locked flag is always written to native source.
        const hasCoordinates = !useSidecar && staged.x !== undefined && staged.y !== undefined;
        const hasLocked = staged.locked !== undefined;
        if (hasCoordinates || hasLocked) {
            if (!element.sourceRange) {
                return { ok: false, reason: `Element "${staged.id}" has no source range.` };
            }
            const ref: NativeElementSourceRef = { elementId: staged.id, range: element.sourceRange };
            try {
                pendingEdits.push(...planMetadataUpdate(originalSource, ref, {
                    ...(hasCoordinates ? { x: staged.x!, y: staged.y! } : {}),
                    ...(hasLocked ? { locked: staged.locked! } : {}),
                }));
            } catch (err) {
                return { ok: false, reason: String(err) };
            }
        }
    }

    if (pendingEdits.length === 0) {
        return { ok: true, text: originalSource };
    }

    try {
        const coalesced = coalesceSameOffsetInsertions(pendingEdits);
        const materialisedText = applyBoundedEdits(originalSource, coalesced);
        return { ok: true, text: materialisedText };
    } catch (err) {
        return {
            ok: false,
            reason: `Edit planning error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

