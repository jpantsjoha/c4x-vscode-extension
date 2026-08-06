import { C4XParseError, ParseResult, PegLocation, PegPosition, RawElement, RawRelationship, RawBoundary } from './types';
import { SourceRange, SourcePosition, makeSourceId, sourcePositionAt } from '../writeback/SourceRange';
import * as pegParser from './c4x.generated.js';

const GRAPH_INJECTION = 'graph TB\n'; // 9 UTF-16 code units

/**
 * Map a Peggy position from processed-input coordinates back to the original
 * source. The injected directive adds one line. Column is recomputed from the
 * original line start because injection may occur after indentation that
 * Peggy moved onto a different line. This remains O(line length), rather than
 * rescanning the whole document for every AST node.
 */
function adjustPos(
    pos: PegPosition,
    originalInput: string,
    injectedAt: number,
    injLen: number,
): SourcePosition {
    if (injLen === 0 || injectedAt < 0 || pos.offset <= injectedAt) {
        return { offset: pos.offset, line: pos.line, column: pos.column };
    }
    if (pos.offset >= injectedAt + injLen) {
        const originalOffset = pos.offset - injLen;
        const previousNewline = originalInput.lastIndexOf('\n', originalOffset - 1);
        return {
            offset: originalOffset,
            line: pos.line - 1,
            column: originalOffset - previousNewline,
        };
    }

    // Parser errors should never originate inside our known-valid injected
    // directive. Clamp defensively to the original insertion point.
    return sourcePositionAt(originalInput, injectedAt);
}

export class C4XParser {
    public parse(input: string): ParseResult {
        // Preprocess: ensure a default graph direction exists to reduce syntax friction
        // If user omitted 'graph TB|BT|LR|RL', inject 'graph TB' after an optional directive
        const hasExplicitDirection = /\bgraph\s+(TB|BT|LR|RL)\b/.test(input);
        let processedInput = input;
        let injectedAt = -1; // offset in processedInput where the injection starts
        if (!hasExplicitDirection) {
            const directiveMatch = /^\s*%%\{[^\n]*\}%%\s*/m.exec(input);
            if (directiveMatch) {
                const insertPos = directiveMatch.index + directiveMatch[0].length;
                processedInput = input.slice(0, insertPos) + GRAPH_INJECTION + input.slice(insertPos);
                injectedAt = insertPos;
            } else {
                processedInput = GRAPH_INJECTION + input;
                injectedAt = 0;
            }
        }

        try {
            const result = pegParser.parse(processedInput) as ParseResult;
            result.hasExplicitDirection = hasExplicitDirection;

            // Convert raw Peggy locations to SourceRanges in original-file coordinates
            const injLen = hasExplicitDirection ? 0 : GRAPH_INJECTION.length;
            const adjustLoc = (loc: PegLocation | undefined): SourceRange | undefined => {
                if (!loc) { return undefined; }
                return {
                    start: adjustPos(loc.start, input, injectedAt, injLen),
                    end: adjustPos(loc.end, input, injectedAt, injLen),
                };
            };

            const assignElementRanges = (elements: RawElement[]) => {
                for (const el of elements) {
                    if (el.loc) {
                        el.sourceRange = adjustLoc(el.loc);
                        el.sourceId = makeSourceId('element', el.id);
                        delete el.loc;
                    }
                    if (el.children) { assignElementRanges(el.children); }
                }
            };

            assignElementRanges(result.elements);

            const relationshipOccurrences = new Map<string, number>();
            result.relationships.forEach((rel: RawRelationship) => {
                if (rel.loc) {
                    const key = `${rel.from}\u0000${rel.to}`;
                    const occurrence = relationshipOccurrences.get(key) ?? 0;
                    relationshipOccurrences.set(key, occurrence + 1);
                    rel.sourceRange = adjustLoc(rel.loc);
                    rel.sourceId = makeSourceId('rel', rel.from, rel.to, String(occurrence));
                    delete rel.loc;
                }
            });

            if (result.boundaries) {
                const boundaryOccurrences = new Map<string, number>();
                result.boundaries.forEach((raw: RawBoundary) => {
                    if (raw.loc) {
                        const key = raw.id ?? raw.label;
                        const occurrence = boundaryOccurrences.get(key) ?? 0;
                        boundaryOccurrences.set(key, occurrence + 1);
                        raw.sourceRange = adjustLoc(raw.loc);
                        raw.sourceId = makeSourceId('boundary', key, String(occurrence));
                        delete raw.loc;
                    }
                });
            }

            // Normalize c4xicons (Syntax Sugar) -> Internal Keys
            // c4xicons.aws.s3-bucket -> aws-s3-bucket
            // c4xicons.std.person -> person
            const normalizeSprite = (sprite: string | undefined): string | undefined => {
                if (!sprite || !sprite.startsWith('c4xicons.')) { return sprite; }

                if (sprite.startsWith('c4xicons.aws.')) { return 'aws-' + sprite.substring(13); } // c4xicons.aws.
                if (sprite.startsWith('c4xicons.azure.')) { return 'azure-' + sprite.substring(15); } // c4xicons.azure.
                if (sprite.startsWith('c4xicons.gcp.')) { return 'gcp-' + sprite.substring(13); } // c4xicons.gcp.
                if (sprite.startsWith('c4xicons.std.')) { return sprite.substring(13); } // c4xicons.std.

                return sprite;
            };

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const traverseAndNormalize = (elements: any[]) => {
                for (const el of elements) {
                    if (el.sprite) { el.sprite = normalizeSprite(el.sprite); }
                    if (el.children) { traverseAndNormalize(el.children); }
                }
            };

            // Allow searching in boundaries too if they are separate structure, but ParseResult 
            // usually puts everything in elements or boundaries.
            traverseAndNormalize(result.elements);
            if (result.boundaries) {
                // Check boundary containers (if they have sprites? usually only elements have sprites)
                traverseAndNormalize(result.boundaries);
                // Also traverse elements inside boundaries if strictly hierarchical? 
                // The parser flattens or keeps structure. 'result.elements' usually contains ALL elements.
                // But let's be safe.
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result.boundaries.forEach((b: any) => {
                    if (b.elements) { traverseAndNormalize(b.elements); }
                });
            }

            return result;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (e: any) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const error = e as any;
            if (error.location) {
                const adjusted = adjustPos(error.location.start, input, injectedAt, hasExplicitDirection ? 0 : GRAPH_INJECTION.length);
                throw new C4XParseError(error.message, { line: adjusted.line, column: adjusted.column });
            } else {
                throw new C4XParseError(error.message, { line: 1, column: 1 });
            }
        }
    }
}

export const c4xParser = new C4XParser();
