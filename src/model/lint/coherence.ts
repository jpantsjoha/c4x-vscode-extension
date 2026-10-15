/**
 * The coherence rules (#215): a view that is legal C4 but does not hang
 * together — a component view with no container in scope, or with several; a
 * relationship that reaches into another container; two boxes with one name; a
 * view declared at a level its elements never reach; a part connected to the
 * whole that contains it.
 *
 * These rules complement `../c4Legality` and never restate it. Where a rule
 * would see the same defect as C4X-L006 — a type the level allows nowhere, a
 * typed boundary in a place the nesting rules reject, a deployment node wired to
 * a logical element — it asks `./legality` and stays silent, so each defect is
 * reported once, by the rule that owns it. The unit suite holds the two sets
 * disjoint.
 *
 * Every rule judges only what the model states. Membership comes from the
 * boundaries an element is declared in (and from the children of a deployment
 * node); boundary nesting comes from source ranges, so a model without them —
 * one built by hand, or imported — is judged on direct membership only. Element
 * identity is by id, never by name.
 */
import type { C4Boundary, C4Element, C4View } from '../C4Model';
import { checkLegality } from './legality';
import {
    boundaryNesting,
    describeElement,
    describeRelationship,
    elementFinding,
    finding,
    hasText,
    isExternal,
    relationshipFinding,
    typeLabel,
    type LintContext,
    type RuleFinding,
} from './support';

/** Where an element sits: what encloses it, innermost first. */
interface Enclosure {
    /** Elements the element is nested in through `children` (deployment nodes, in native C4X). */
    readonly elements: readonly C4Element[];
    /** Boundaries around the element, or around its outermost parent element. */
    readonly boundaries: readonly C4Boundary[];
}

interface Placements {
    readonly enclosureOf: (id: string) => Enclosure;
    /** The boundary or element an element is directly declared in; `undefined` at the root. */
    readonly directParentOf: (id: string) => C4Boundary | C4Element | undefined;
}

const PLACEMENTS = new WeakMap<LintContext, Placements>();

/** Membership and nesting for one view, computed once and shared by the rules. */
function placements(context: LintContext): Placements {
    const cached = PLACEMENTS.get(context);
    if (cached) {
        return cached;
    }
    const boundaries = context.view.boundaries ?? [];
    const nesting = boundaryNesting(boundaries);
    const boundaryOf = new Map<string, C4Boundary>();
    for (const boundary of boundaries) {
        for (const id of boundary.elements) {
            if (!boundaryOf.has(id)) {
                boundaryOf.set(id, boundary);
            }
        }
    }
    const parentOf = new Map<string, C4Element>();
    for (const element of context.elements) {
        for (const child of element.children ?? []) {
            parentOf.set(child.id, element);
        }
    }

    const enclosureOf = (id: string): Enclosure => {
        const elements: C4Element[] = [];
        let outermost = id;
        for (let parent = parentOf.get(outermost); parent && !elements.includes(parent); parent = parentOf.get(outermost)) {
            elements.push(parent);
            outermost = parent.id;
        }
        const enclosing: C4Boundary[] = [];
        for (let boundary = boundaryOf.get(outermost); boundary && !enclosing.includes(boundary);
            boundary = nesting?.get(boundary)) {
            enclosing.push(boundary);
        }
        return { elements, boundaries: enclosing };
    };
    const result: Placements = {
        enclosureOf,
        directParentOf: id => parentOf.get(id) ?? boundaryOf.get(id),
    };
    PLACEMENTS.set(context, result);
    return result;
}

function viewFinding(view: C4View, message: string, hint: string): RuleFinding {
    return finding({ kind: 'view', id: view.type }, message, hint, undefined);
}

const LEGALITY = new WeakMap<LintContext, ReadonlySet<string>>();

/**
 * What C4X-L006 reports in this view, as `kind:id` keys. The coherence rules
 * consult it to stay silent where the nesting rules already speak; asking the
 * rule itself, rather than re-deriving its verdicts, is what keeps the two
 * rule sets disjoint as either one changes.
 */
function legalityFindings(context: LintContext): ReadonlySet<string> {
    let reported = LEGALITY.get(context);
    if (!reported) {
        reported = new Set(checkLegality(context).map(result => `${result.target.kind}:${result.target.id}`));
        LEGALITY.set(context, reported);
    }
    return reported;
}

function isContainerBoundary(boundary: C4Boundary): boolean {
    return boundary.boundaryType === 'Container_Boundary';
}

/** The Container_Boundaries C4X-L006 accepts where they are drawn. */
function containersInScope(context: LintContext): C4Boundary[] {
    const reported = legalityFindings(context);
    return (context.view.boundaries ?? [])
        .filter(boundary => isContainerBoundary(boundary) && !reported.has(`boundary:${boundary.id}`));
}

/**
 * C4X-L101: a component view decomposes exactly one container.
 *
 * Several Container_Boundaries: every one after the first is reported, because
 * the first is the likeliest scope and the view does not say otherwise. None,
 * while the view draws an internal component: the view itself is reported,
 * because nothing says which container the components belong to. A component
 * view with no component at all is C4X-L105's, and a Container_Boundary or a
 * component that the nesting rules reject is C4X-L006's — none of them counts
 * here, and a view with any Container_Boundary at all is not "none".
 */
function checkSingleContainerInScope(context: LintContext): RuleFinding[] {
    const legal = containersInScope(context);
    if (legal.length === 0) {
        const anyContainerBoundary = (context.view.boundaries ?? []).some(isContainerBoundary);
        const reported = legalityFindings(context);
        const internal = context.elements.filter(element =>
            element.type === 'Component' && !isExternal(element) && !reported.has(`element:${element.id}`));
        if (anyContainerBoundary || internal.length === 0) {
            return [];
        }
        // An untyped subgraph around the components is often meant as the container; say how to state it.
        const { enclosureOf } = placements(context);
        const subgraph = internal.map(element => enclosureOf(element.id).boundaries.find(b => b.boundaryType === undefined))
            .find(candidate => candidate !== undefined);
        return [viewFinding(
            context.view,
            'This component view draws components but no Container_Boundary, so it does not say which container it decomposes.',
            subgraph
                ? `If subgraph ${subgraph.label} is the container in scope, declare it as one: `
                    + `Container_Boundary(<alias>, "${subgraph.label}") { ... }.`
                : 'Wrap the components of the container in scope in Container_Boundary(<alias>, "<container name>") { ... }.',
        )];
    }
    if (legal.length === 1) {
        return [];
    }
    const [scope, ...others] = legal;
    const names = legal.map(boundary => `"${boundary.label}"`).join(', ');
    return others.map(boundary => finding(
        { kind: 'boundary', id: boundary.id },
        `This component view decomposes ${legal.length} containers (${names}); a component view zooms into one container.`,
        `Keep "${scope.label}" as the container in scope: draw "${boundary.label}" as a Container box, or give it a component view of its own.`,
        boundary.sourceRange,
    ));
}

/**
 * C4X-L103: a relationship does not reach inside a different container.
 *
 * Reported when both ends are components and each sits inside a different
 * Container_Boundary that the nesting rules accept. A component whose container
 * the model does not state — at the root, or in an untyped subgraph — is never
 * judged, and neither is a relationship from a person, system or container box
 * to a component, which is how a component view shows who uses the container.
 */
function checkCrossContainerComponent(context: LintContext): RuleFinding[] {
    const legal = new Set(containersInScope(context));
    if (legal.size < 2) {
        return [];
    }
    const { enclosureOf } = placements(context);
    const containerOf = (element: C4Element): C4Boundary | undefined =>
        enclosureOf(element.id).boundaries.find(isContainerBoundary);
    const findings: RuleFinding[] = [];
    for (const rel of context.view.relationships) {
        const from = context.elementsById.get(rel.from);
        const to = context.elementsById.get(rel.to);
        if (from?.type !== 'Component' || to?.type !== 'Component') {
            continue;
        }
        const source = containerOf(from);
        const target = containerOf(to);
        if (!source || !target || source === target || !legal.has(source) || !legal.has(target)) {
            continue;
        }
        findings.push(relationshipFinding(
            rel,
            `Relationship ${describeRelationship(rel)} reaches from a component of "${source.label}" into `
                + `"${target.label}", a different container's boundary.`,
            `Point it at the container instead: draw "${target.label}" as a Container box outside the container in scope `
                + 'and connect to that. Its components belong in its own component view.',
        ));
    }
    return findings;
}

/** A name as a reader compares it: case, surrounding space and runs of space do not count. */
function normalisedName(label: string): string {
    return label.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * C4X-L104: no two elements in one boundary share a name.
 *
 * The scope is what an element is directly declared in: a boundary, a typed or
 * untyped subgraph, a deployment node, or the diagram root. The same name in two
 * different boundaries is fine — two systems may each have a "Database". The
 * first element with a name is kept; each later one is reported. An element
 * C4X-L006 reports is misplaced, so it is left to that rule and not compared.
 */
function checkDuplicateNames(context: LintContext): RuleFinding[] {
    const { directParentOf } = placements(context);
    const reported = legalityFindings(context);
    const boundaries: ReadonlySet<C4Boundary | C4Element> = new Set(context.view.boundaries ?? []);
    const firstByScope = new Map<C4Boundary | C4Element | undefined, Map<string, C4Element>>();
    const findings: RuleFinding[] = [];
    for (const element of context.elements) {
        if (!hasText(element.label) || reported.has(`element:${element.id}`)) {
            continue;
        }
        const scope = directParentOf(element.id);
        const seen = firstByScope.get(scope) ?? new Map<string, C4Element>();
        firstByScope.set(scope, seen);
        const name = normalisedName(element.label);
        const first = seen.get(name);
        if (!first) {
            seen.set(name, element);
            continue;
        }
        const where = scope === undefined
            ? 'at the diagram root'
            : !boundaries.has(scope) ? `in "${scope.label}"`
                : (scope as C4Boundary).boundaryType === undefined ? `in subgraph "${scope.label}"` : `in boundary "${scope.label}"`;
        findings.push(elementFinding(
            element,
            `${describeElement(element)} has the same name as ${describeElement(first)} ${where}.`,
            'Give each element a name that tells it apart, or, if both boxes are the same thing, draw it once and point both relationships at it.',
        ));
    }
    return findings;
}

/**
 * C4X-L105: the declared level is the level of the elements drawn.
 *
 * A container view with no container, or a component view with no component,
 * shows a less detailed level than it claims. Only that direction is checked
 * here: an element *more* detailed than the level allows is a nesting-rule
 * violation, reported by C4X-L006. This rule stays silent on any view C4X-L006
 * reports at all, because a misplaced element is as likely to be the missing
 * container or component as a sign of the wrong level, and the nesting finding
 * is the one to fix first. Empty views are not judged.
 */
function checkDeclaredLevel(context: LintContext): RuleFinding[] {
    const { view, elements } = context;
    if (elements.length === 0) {
        return [];
    }
    if (legalityFindings(context).size > 0) {
        return [];
    }
    const required = view.type === 'component' ? 'Component' : 'Container';
    if (elements.some(element => element.type === required)) {
        return [];
    }
    const actual = elements.some(element => element.type === 'Container') ? 'container' : 'system-context';
    return [viewFinding(
        view,
        `This view is declared as a ${view.type} view but draws no ${required.toLowerCase()}: `
            + `its most detailed elements belong in a ${actual} view.`,
        `Declare %%{ c4: ${actual} }%% on the first line, or add the ${required.toLowerCase()}s this view is meant to show.`,
    )];
}

/**
 * C4X-L106: a relationship does not join an element to the element that contains it.
 *
 * A part and its whole are two abstraction levels of one thing: a component
 * connected to the software system it belongs to, a deployment node connected to
 * the node it runs in. Containment is read from the model, never from names: an
 * element nested in another through `children`, or declared inside a typed
 * boundary whose alias is the other element's id — the system in scope drawn
 * both as its boundary and as a box. A deployment node connected to a logical
 * element is C4X-L006's and is not judged here, and neither is any relationship
 * C4X-L006 reports, or whose end it reports as misplaced.
 */
function checkPartToWhole(context: LintContext): RuleFinding[] {
    const { enclosureOf } = placements(context);
    const reported = legalityFindings(context);
    const contains = (whole: C4Element, part: C4Element): 'child' | 'boundary' | undefined => {
        const enclosure = enclosureOf(part.id);
        if (enclosure.elements.includes(whole)) {
            return 'child';
        }
        return enclosure.boundaries.some(boundary => boundary.alias === whole.id) ? 'boundary' : undefined;
    };
    const findings: RuleFinding[] = [];
    for (const rel of context.view.relationships) {
        const from = context.elementsById.get(rel.from);
        const to = context.elementsById.get(rel.to);
        if (!from || !to || from.id === to.id
            || (from.type === 'DeploymentNode') !== (to.type === 'DeploymentNode')
            || reported.has(`relationship:${rel.id}`)
            || reported.has(`element:${from.id}`) || reported.has(`element:${to.id}`)) {
            continue;
        }
        const toContainsFrom = contains(to, from);
        const fromContainsTo = toContainsFrom ? undefined : contains(from, to);
        const how = toContainsFrom ?? fromContainsTo;
        if (!how) {
            continue;
        }
        const [part, whole] = toContainsFrom ? [from, to] : [to, from];
        findings.push(relationshipFinding(
            rel,
            `Relationship ${describeRelationship(rel)} connects ${describeElement(part)} to ${describeElement(whole)}, `
                + `${how === 'boundary' ? 'whose boundary contains it' : 'which contains it'}: `
                + `a ${typeLabel(part).toLowerCase()} and the ${typeLabel(whole).toLowerCase()} it belongs to are two levels of one thing.`,
            `Point it at the element outside "${whole.label}" that "${part.label}" actually uses, or remove it`
                + `${how === 'boundary' ? `; draw "${whole.label}" once, as the boundary` : ''}.`,
        ));
    }
    return findings;
}

export {
    checkCrossContainerComponent,
    checkDeclaredLevel,
    checkDuplicateNames,
    checkPartToWhole,
    checkSingleContainerInScope,
};
