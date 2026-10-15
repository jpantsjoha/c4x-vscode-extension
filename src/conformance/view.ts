/**
 * The part of a C4 view that conformance checking reads: which elements own
 * code, which relationships permit dependencies, and where each sits in the
 * `.c4x` source. Pure and VS Code-free (#216 reuses it headless).
 */

import { C4XParser } from '../parser/C4XParser';
import { C4ModelBuilder } from '../model/C4ModelBuilder';
import { C4Element, C4Rel, C4View } from '../model/C4Model';
import { CODE_MAPPABLE_TYPES } from '../model/codePaths';

/** The model's source range, named without importing writeback (see #228). */
type SourceRange = NonNullable<C4Element['sourceRange']>;

/** A 1-based line/column span in the `.c4x` source. */
export interface SourceSpan {
    readonly line: number;
    readonly column: number;
    readonly endLine: number;
    readonly endColumn: number;
}

/** Where a finding goes when the model carries no source range. */
export const FILE_START: SourceSpan = { line: 1, column: 1, endLine: 1, endColumn: 1 };

export function spanOf(range: SourceRange | undefined): SourceSpan {
    if (!range) {
        return FILE_START;
    }
    return {
        line: range.start.line,
        column: range.start.column,
        endLine: range.end.line,
        endColumn: range.end.column,
    };
}

/** A Container or Component in the view, mapped to code or not. */
export interface ConformanceElement {
    readonly id: string;
    readonly label: string;
    readonly type: C4Element['type'];
    /** Present when the element declares `$code`. */
    readonly codePaths?: readonly string[];
    readonly span: SourceSpan;
}

/** A declared relationship between two Containers or Components. */
export interface ConformanceRelationship {
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly span: SourceSpan;
}

/** Thrown when a view cannot be checked for conformance at all. */
export class ConformanceInputError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConformanceInputError';
    }
}

/** Every element in the view, depth-first, in source order. */
function flatten(elements: readonly C4Element[]): C4Element[] {
    const result: C4Element[] = [];
    const visit = (element: C4Element) => {
        result.push(element);
        element.children?.forEach(visit);
    };
    elements.forEach(visit);
    return result.sort((a, b) => (a.sourceRange?.start.offset ?? 0) - (b.sourceRange?.start.offset ?? 0));
}

/** The Containers and Components of a view, in source order. */
export function codeElements(view: C4View): ConformanceElement[] {
    return flatten(view.elements)
        .filter(element => CODE_MAPPABLE_TYPES.has(element.type))
        .map(element => ({
            id: element.id,
            label: element.label,
            type: element.type,
            codePaths: element.codePaths,
            span: spanOf(element.sourceRange),
        }));
}

/** Every declared relationship, in source order, with its span. */
export function declaredRelationships(view: C4View): ConformanceRelationship[] {
    return view.relationships.map((rel: C4Rel) => ({
        from: rel.from,
        to: rel.to,
        label: rel.label,
        span: spanOf(rel.sourceRange),
    }));
}

/** Spans for every element id, including Persons and Systems. */
export function elementSpans(view: C4View): Map<string, SourceSpan> {
    return new Map(flatten(view.elements).map(element => [element.id, spanOf(element.sourceRange)]));
}

/**
 * Parse native C4X text into its single view and check that it is a
 * component (C3) view. Parse errors propagate unchanged, with their location.
 */
export function loadComponentView(text: string, workspace = 'conformance'): C4View {
    const model = new C4ModelBuilder().build(new C4XParser().parse(text), workspace);
    const view = model.views[0];
    if (!view) {
        throw new ConformanceInputError('The file declares no view.');
    }
    if (view.type !== 'component') {
        throw new ConformanceInputError(
            `Architecture conformance needs a component (C3) view, declared with %%{ c4: component }%%; this file is a ${view.type} view.`,
        );
    }
    return view;
}
