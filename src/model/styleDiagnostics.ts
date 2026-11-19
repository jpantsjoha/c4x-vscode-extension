/**
 * Diagnostics for the element style surface (notation decision #320, Decision 3; #322).
 *
 * None of these stops a file rendering: an unknown key is ignored, a bad value
 * falls back to the earlier layer, a repeated key uses the last value, and an
 * unknown or undrawn shape is drawn as the theme rectangle. Severities are the
 * ones the ADR fixes; the ids follow `C4X-L106` in the lint id space and are
 * reported by the editor, `c4x-lint` and the MCP `lint_c4x` tool.
 */
import type { C4Element, C4ElementStyleRule, C4ModelDiagnostic } from './C4Model';
import type { SourceRange } from '../writeback/SourceRange';
import { drawnShapeNames, parseStyleValue, shapeDrawingIssue, styleKeyNames, styleShapeNames } from '../render/elementStyle';

/* eslint-disable @typescript-eslint/naming-convention */
export const STYLE_DIAGNOSTIC_CODES = {
    /** An `elementStyle` key outside the eight allowed keys. Error. */
    unknownKey: 'C4X-L107',
    /** A key repeated in one `elementStyle` statement, or a repeated `$shape`. Error. */
    duplicateKey: 'C4X-L108',
    /** A value the key does not accept. Warning; the key is ignored. */
    badValue: 'C4X-L109',
    /** A shape name outside the 19. Warning; drawn as the theme rectangle. */
    unknownShape: 'C4X-L110',
    /** A valid shape the renderer does not draw yet. Information. */
    undrawnShape: 'C4X-L111',
    /** Two `elementStyle` statements for one tag (any case). Warning; they merge. */
    duplicateTag: 'C4X-L112',
    /** `$colour`, which is not an alias of `$color`. Error. */
    colourSpelling: 'C4X-L113',
    /** An element metadata key that looks like a style key. Information. */
    likelyStyleTypo: 'C4X-L114',
    /** A Mermaid `classDef`, which C4X parses and ignores. Information. */
    classDefNoEffect: 'C4X-L115',
    /** A subgraph, boundary or `direction` inside a deployment Node, which is not drawn there. Warning. */
    droppedInNode: 'C4X-L116',
} as const;
/* eslint-enable @typescript-eslint/naming-convention */

/** One element's `$shape` input, as the builder read it. */
export interface ElementShapeInput {
    readonly elementId: string;
    /** The value used: the last one written. */
    readonly value: string;
    readonly range?: SourceRange;
    /** One range per repeat after the first `$shape`. */
    readonly repeatRanges: ReadonlyArray<SourceRange | undefined>;
}

export interface StyleDiagnosticOptions {
    readonly isKnownSprite?: (id: string) => boolean;
    /** The view's elements, for the metadata typo check. */
    readonly elements?: readonly C4Element[];
}

/** Levenshtein distance, for did-you-mean suggestions. */
export function editDistance(a: string, b: string): number {
    const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let diagonal = previous[0];
        previous[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const above = previous[j];
            previous[j] = Math.min(
                previous[j] + 1,
                previous[j - 1] + 1,
                diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
            );
            diagonal = above;
        }
    }
    return previous[b.length];
}

/** The closest candidate within edit distance 2 (case-insensitive match first), or undefined. */
export function suggest(value: string, candidates: readonly string[]): string | undefined {
    const caseMatch = candidates.find(candidate => candidate.toLowerCase() === value.toLowerCase());
    if (caseMatch) { return caseMatch; }
    let best: string | undefined;
    let bestDistance = 3;
    for (const candidate of candidates) {
        const distance = editDistance(value.toLowerCase(), candidate.toLowerCase());
        if (distance < bestDistance) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best;
}

function didYouMean(value: string, candidates: readonly string[]): string {
    const suggestion = suggest(value, candidates);
    return suggestion ? ` Did you mean "${suggestion}"?` : '';
}

function at(range: SourceRange | undefined): { range?: SourceRange } {
    return range ? { range } : {};
}

/** Diagnostics for a shape value; `where` names the element or rule. */
function shapeDiagnostics(value: string, where: string, range: SourceRange | undefined): C4ModelDiagnostic[] {
    if (styleShapeNames().indexOf(value) < 0) {
        return [{
            code: STYLE_DIAGNOSTIC_CODES.unknownShape,
            severity: 'warning',
            message: `Unknown shape "${value}" on ${where}; it is drawn as the theme rectangle.${didYouMean(value, styleShapeNames())}`,
            ...at(range),
        }];
    }
    if (drawnShapeNames().indexOf(value) < 0) {
        const issue = shapeDrawingIssue(value);
        return [{
            code: STYLE_DIAGNOSTIC_CODES.undrawnShape,
            severity: 'info',
            message: `Shape "${value}" on ${where} is not drawn yet (${issue} draws it); it is drawn as the theme rectangle until then.`,
            ...at(range),
        }];
    }
    return [];
}

function valueProblem(key: string, value: string): string {
    switch (key) {
        case 'stroke':
        case 'background':
        case 'color':
            return `$${key} takes a hex colour, "#RGB" or "#RRGGBB"; got "${value}"`;
        case 'border':
            return `$border takes "solid", "dashed" or "dotted"; got "${value}"`;
        case 'strokeWidth':
            return `$strokeWidth takes a whole number from 1 to 10, quoted; got "${value}"`;
        case 'sprite':
            return `$sprite "${value}" is not a bundled icon`;
        case 'legend':
            return `$legend takes non-empty text of at most 120 characters`;
        default:
            return `$${key} does not accept "${value}"`;
    }
}

/** Every style diagnostic for a view's rules and its elements' `$shape` inputs, unsorted. */
export function styleDiagnosticsFor(
    rules: readonly C4ElementStyleRule[],
    shapes: readonly ElementShapeInput[],
    options: StyleDiagnosticOptions = {},
): C4ModelDiagnostic[] {
    const diagnostics: C4ModelDiagnostic[] = [];
    const keys = styleKeyNames() as string[];
    const seenTags = new Map<string, string>();

    for (const rule of rules) {
        const tagKey = rule.tag.toLowerCase();
        const earlier = seenTags.get(tagKey);
        if (earlier !== undefined) {
            diagnostics.push({
                code: STYLE_DIAGNOSTIC_CODES.duplicateTag,
                severity: 'warning',
                message: `A second elementStyle for tag "${rule.tag}" (also styled as "${earlier}"); the two merge and later keys win.`,
                ...at(rule.sourceRange),
            });
        } else {
            seenTags.set(tagKey, rule.tag);
        }

        const seenKeys = new Set<string>();
        for (const property of rule.properties) {
            const where = `elementStyle ${rule.tag}`;
            if (seenKeys.has(property.key)) {
                diagnostics.push({
                    code: STYLE_DIAGNOSTIC_CODES.duplicateKey,
                    severity: 'error',
                    message: `$${property.key} is repeated in ${where}; the last value is used.`,
                    ...at(property.sourceRange),
                });
            }
            seenKeys.add(property.key);

            if (property.key === 'colour') {
                diagnostics.push({
                    code: STYLE_DIAGNOSTIC_CODES.colourSpelling,
                    severity: 'error',
                    message: `$colour is not a style key in ${where}; write $color. The key is ignored.`,
                    ...at(property.sourceRange),
                });
                continue;
            }
            if (keys.indexOf(property.key) < 0) {
                diagnostics.push({
                    code: STYLE_DIAGNOSTIC_CODES.unknownKey,
                    severity: 'error',
                    message: `Unknown style key $${property.key} in ${where}; it is ignored. Keys: ${keys.map(key => `$${key}`).join(', ')}.${didYouMean(property.key, keys)}`,
                    ...at(property.sourceRange),
                });
                continue;
            }
            if (property.key === 'shape') {
                diagnostics.push(...shapeDiagnostics(property.value, where, property.sourceRange));
                continue;
            }
            if (parseStyleValue(property.key, property.value, options.isKnownSprite) === undefined) {
                diagnostics.push({
                    code: STYLE_DIAGNOSTIC_CODES.badValue,
                    severity: 'warning',
                    message: `${valueProblem(property.key, property.value)} in ${where}; the key is ignored.`,
                    ...at(property.sourceRange),
                });
            }
        }
    }

    for (const input of shapes) {
        const where = `element "${input.elementId}"`;
        for (const range of input.repeatRanges) {
            diagnostics.push({
                code: STYLE_DIAGNOSTIC_CODES.duplicateKey,
                severity: 'error',
                message: `$shape is repeated on ${where}; the last value ("${input.value}") is used.`,
                ...at(range),
            });
        }
        diagnostics.push(...shapeDiagnostics(input.value, where, input.range));
    }

    const walk = (elements: readonly C4Element[]): void => {
        for (const element of elements) {
            for (const key of Object.keys(element.metadata ?? {})) {
                const match = keys.find(styleKey => editDistance(key.toLowerCase(), styleKey.toLowerCase()) <= 2)
                    ?? (key === 'colour' ? 'color' : undefined);
                if (match && key.length >= 3) {
                    diagnostics.push({
                        code: STYLE_DIAGNOSTIC_CODES.likelyStyleTypo,
                        severity: 'info',
                        message: match === key
                            ? `$${key} on element "${element.id}" is kept as metadata and does not style it; colours come from tags (elementStyle).`
                            : `$${key} on element "${element.id}" is kept as metadata; did you mean the style key $${match}?`,
                        ...at(element.sourceRange),
                    });
                }
            }
            if (element.children) { walk(element.children); }
        }
    };
    walk(options.elements ?? []);

    return diagnostics;
}
