import type { C4Boundary, C4Element, C4Rel, C4View, RelType } from '../C4Model';
import type { SourceRange } from '../../writeback/SourceRange';
import type { LintTarget } from './types';

/** A rule's raw output. The engine adds the rule id and the resolved severity. */
export interface RuleFinding {
    readonly target: LintTarget;
    readonly message: string;
    readonly hint: string;
    readonly range?: SourceRange;
}

/** Everything a rule may read. Built once per view and shared by every rule. */
export interface LintContext {
    readonly view: C4View;
    /** Every element in the view, nested children included, in declaration order. */
    readonly elements: readonly C4Element[];
    readonly elementsById: ReadonlyMap<string, C4Element>;
}

export type RuleCheck = (context: LintContext) => RuleFinding[];

const ARROWS: Readonly<Record<RelType, string>> = {
    uses: '-->',
    async: '-.->',
    sync: '==>',
};

export function hasText(value: string | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
}

export function hasTag(element: C4Element, tag: string): boolean {
    return element.tags?.some(candidate => candidate.toLowerCase() === tag) ?? false;
}

/** The model builder turns every `_Ext` type into the `External` tag, which is what the renderer reads. */
export function isExternal(element: C4Element): boolean {
    return hasTag(element, 'external');
}

/** The element type as a reader says it. */
export function typeLabel(element: C4Element): string {
    switch (element.type) {
        case 'SoftwareSystem':
            return 'Software System';
        case 'DeploymentNode':
            return 'Deployment Node';
        default:
            return element.type;
    }
}

/** The C4X function-form macro that declares a container or component, e.g. `ContainerDb_Ext`. */
export function macroName(element: C4Element): string {
    return `${element.type}${hasTag(element, 'database') ? 'Db' : ''}${isExternal(element) ? '_Ext' : ''}`;
}

export function describeElement(element: C4Element): string {
    return `${typeLabel(element)} "${element.label}" (${element.id})`;
}

/** The C4X arrow a relationship was written with. */
export function arrowOf(rel: C4Rel): string {
    return ARROWS[rel.relType];
}

export function describeRelationship(rel: C4Rel): string {
    return `${rel.from} ${arrowOf(rel)} ${rel.to}`;
}

/** A finding on a target, carrying the target's source range only when the model has one. */
export function finding(target: LintTarget, message: string, hint: string, range: SourceRange | undefined): RuleFinding {
    return range ? { target, message, hint, range } : { target, message, hint };
}

export function elementFinding(element: C4Element, message: string, hint: string): RuleFinding {
    return finding({ kind: 'element', id: element.id }, message, hint, element.sourceRange);
}

export function relationshipFinding(rel: C4Rel, message: string, hint: string): RuleFinding {
    return finding({ kind: 'relationship', id: rel.id }, message, hint, rel.sourceRange);
}

/** True when `inner` lies inside `outer` and is not the same span. */
export function strictlyContains(outer: SourceRange, inner: SourceRange): boolean {
    return outer.start.offset <= inner.start.offset
        && inner.end.offset <= outer.end.offset
        && (outer.start.offset !== inner.start.offset || outer.end.offset !== inner.end.offset);
}

/**
 * The boundary that directly encloses each boundary, `undefined` for one at the
 * root. The model keeps boundaries flat, so nesting is recovered from source-range
 * containment: the innermost enclosing span wins. Returns `null` when any boundary
 * lacks a source range, because nesting cannot then be recovered at all.
 */
export function boundaryNesting(boundaries: readonly C4Boundary[]): ReadonlyMap<C4Boundary, C4Boundary | undefined> | null {
    if (boundaries.some(candidate => !candidate.sourceRange)) {
        return null;
    }
    const nesting = new Map<C4Boundary, C4Boundary | undefined>();
    for (const boundary of boundaries) {
        let parent: C4Boundary | undefined;
        for (const other of boundaries) {
            if (other !== boundary
                && strictlyContains(other.sourceRange!, boundary.sourceRange!)
                && (!parent || other.sourceRange!.start.offset > parent.sourceRange!.start.offset)) {
                parent = other;
            }
        }
        nesting.set(boundary, parent);
    }
    return nesting;
}
