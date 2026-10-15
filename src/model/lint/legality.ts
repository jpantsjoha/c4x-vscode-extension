/**
 * C4X-L006: surfaces the verdicts of `../c4Legality` — C4X's one table of C4
 * nesting rules, whose relationship rule the visual editor enforces today and
 * whose placement rules are written for its element palette — as lint
 * findings. It wraps that module and adds no nesting rule of its own.
 *
 * The one judgement it makes is where to be quiet. The nesting matrix is a
 * placement policy: it says a container belongs inside a System_Boundary. C4X,
 * like C4 itself, lets the author leave that enclosing boundary undrawn, so a
 * container at the root of a container view means "boundary implicit", not
 * "wrong level". At the diagram root, therefore, only a type the level does not
 * allow anywhere is reported — a component in a system context view, a
 * deployment node in a container view. Inside an explicit boundary or node,
 * every verdict is reported, because the author stated the parent.
 *
 * Where the parent is unknown — an untyped `subgraph`, which may be a system, a
 * container or just a visual group, or a boundary whose nesting the model
 * cannot recover — only a type the level does not allow anywhere is reported.
 */
import type { C4Boundary, C4View } from '../C4Model';
import {
    C4_LEVELS,
    C4_SCOPES,
    isElementLegalIn,
    isRelationshipLegal,
    legalChildTypes,
    type C4ElementType,
} from '../c4Legality';
import {
    boundaryNesting,
    describeRelationship,
    elementFinding,
    finding,
    relationshipFinding,
    type LintContext,
    type RuleFinding,
} from './support';

type Scope = typeof C4_SCOPES[number];
type CanonicalLevel = typeof C4_LEVELS[number];
/** A typed boundary: both a nesting-rule element type and the scope it gives its members. */
type BoundaryKind = 'System_Boundary' | 'Container_Boundary' | 'Enterprise_Boundary';

const BOUNDARY_KINDS: ReadonlySet<string> = new Set<BoundaryKind>(['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary']);

const LEVEL_NAMES: ReadonlyMap<CanonicalLevel, string> = new Map<CanonicalLevel, string>([
    ['C1', 'system context (C1)'],
    ['C2', 'container (C2)'],
    ['C3', 'component (C3)'],
    ['C4', 'deployment'],
]);

const DIRECTIVES: ReadonlyMap<CanonicalLevel, string> = new Map<CanonicalLevel, string>([
    ['C1', 'system-context'],
    ['C2', 'container'],
    ['C3', 'component'],
    ['C4', 'deployment'],
]);

const VIEW_LEVELS: ReadonlyMap<string, CanonicalLevel> = new Map<string, CanonicalLevel>([
    ['system-context', 'C1'],
    ['container', 'C2'],
    ['component', 'C3'],
    ['deployment', 'C4'],
]);

/** The legality level of a view, or `undefined` for a view the nesting rules do not cover (dynamic). */
function legalityLevel(view: C4View): CanonicalLevel | undefined {
    return VIEW_LEVELS.get(view.type);
}

/** A boundary's kind, which is also the scope it gives its members; `null` for an untyped subgraph. */
function kindOf(boundary: C4Boundary): BoundaryKind | null {
    return boundary.boundaryType !== undefined && BOUNDARY_KINDS.has(boundary.boundaryType)
        ? boundary.boundaryType as BoundaryKind
        : null;
}

/**
 * The parent scope of every element that is not at the root. `null` means the
 * parent is an untyped subgraph and the element is not judged.
 */
function elementParents(context: LintContext): Map<string, Scope | null> {
    const parents = new Map<string, Scope | null>();
    for (const boundary of context.view.boundaries ?? []) {
        for (const id of boundary.elements) {
            if (!parents.has(id)) {
                parents.set(id, kindOf(boundary));
            }
        }
    }
    for (const element of context.elements) {
        if (element.type === 'DeploymentNode') {
            for (const child of element.children ?? []) {
                parents.set(child.id, 'Node');
            }
        }
    }
    return parents;
}

/**
 * The parent scope of a boundary, from source-range containment, since the
 * model keeps boundaries flat. `null` when the parent is unknown: an untyped
 * subgraph, or a model without the source ranges nesting is recovered from.
 */
function boundaryParent(boundary: C4Boundary, nesting: ReturnType<typeof boundaryNesting>): Scope | null {
    if (!nesting) {
        return null;
    }
    const parent = nesting.get(boundary);
    return parent ? kindOf(parent) : 'root';
}

function legalAnywhere(type: C4ElementType, level: CanonicalLevel): boolean {
    return C4_SCOPES.some(scope => isElementLegalIn(type, scope, level).legal);
}

/** The C4X spelling of a nesting-rule type, as a user would write it. */
function spelling(type: C4ElementType): string {
    return type === 'SoftwareSystem' ? 'System' : type === 'DeploymentNode' ? 'Node' : type;
}

/**
 * Placements the editor's matrix rejects but C4 deployment diagrams allow: a
 * software system instance deployed to a node, and the people who use what is
 * deployed. The matrix stays strict for the palette; lint stays quiet here.
 */
function deploymentAllows(type: C4ElementType, scope: Scope | null, level: CanonicalLevel): boolean {
    return level === 'C4'
        && ((type === 'SoftwareSystem' && scope === 'Node') || (type === 'Person' && scope === 'root'));
}

/**
 * The reason the nesting rules reject this placement, or `undefined` when L006
 * has nothing to say. `scope` is `null` when the parent is unknown.
 */
function verdict(type: C4ElementType, scope: Scope | null, level: CanonicalLevel): string | undefined {
    if (deploymentAllows(type, scope, level)) {
        return undefined;
    }
    if (scope === null) {
        return legalAnywhere(type, level)
            ? undefined
            : `${spelling(type)} cannot be placed anywhere in a ${LEVEL_NAMES.get(level)} view.`;
    }
    const result = isElementLegalIn(type, scope, level);
    if (result.legal || (scope === 'root' && legalAnywhere(type, level))) {
        return undefined;
    }
    return result.reason;
}

function placementHint(type: C4ElementType, scope: Scope | null, level: CanonicalLevel): string {
    const allowed = scope === null ? [] : legalChildTypes(scope, level).map(spelling);
    const here = scope === null
        ? ''
        : allowed.length > 0 ? `Allowed here in this view: ${allowed.join(', ')}. ` : 'Nothing may be placed here in this view. ';
    if (legalAnywhere(type, level)) {
        return `${here}Move it into a boundary where it is legal, or change its type.`;
    }
    const homes = C4_LEVELS.filter(candidate => legalAnywhere(type, candidate));
    const levels = homes.map(candidate => LEVEL_NAMES.get(candidate));
    const advice = `${here}${spelling(type)} belongs in ${levels.join(' or ')} views: move it to one, or change its type.`;
    // A view without a `%%{ c4: ... }%%` line is read as system context, so a
    // C1 verdict may only mean the declaration is missing.
    return level === 'C1'
        ? `${advice} If this view is not a system context view, declare its level on the first line, `
            + `e.g. %%{ c4: ${DIRECTIVES.get(homes[0])} }%%.`
        : advice;
}

/** C4X-L006: elements, typed boundaries and relationships are legal at the view's level. */
export function checkLegality(context: LintContext): RuleFinding[] {
    const level = legalityLevel(context.view);
    if (!level) {
        return [];
    }
    const findings: RuleFinding[] = [];
    const parents = elementParents(context);

    for (const element of context.elements) {
        const scope = parents.has(element.id) ? parents.get(element.id)! : 'root';
        const type = element.type as C4ElementType;
        const reason = verdict(type, scope, level);
        if (reason) {
            findings.push(elementFinding(element, `"${element.label}" (${element.id}): ${reason}`, placementHint(type, scope, level)));
        }
    }

    const boundaries = context.view.boundaries ?? [];
    const nesting = boundaryNesting(boundaries);
    for (const boundary of boundaries) {
        const type = kindOf(boundary);
        if (type === null) {
            continue;
        }
        const scope = boundaryParent(boundary, nesting);
        const reason = verdict(type, scope, level);
        if (reason) {
            findings.push(finding(
                { kind: 'boundary', id: boundary.id },
                `Boundary "${boundary.label}": ${reason}`,
                placementHint(type, scope, level),
                boundary.sourceRange,
            ));
        }
    }

    for (const rel of context.view.relationships) {
        const from = context.elementsById.get(rel.from);
        const to = context.elementsById.get(rel.to);
        if (!from || !to) {
            continue;
        }
        const result = isRelationshipLegal(from, to);
        if (!result.legal) {
            findings.push(relationshipFinding(
                rel,
                `Relationship ${describeRelationship(rel)}: ${result.reason}`,
                'Connect the elements deployed inside the node instead, or remove the node from this view.',
            ));
        }
    }
    return findings;
}
