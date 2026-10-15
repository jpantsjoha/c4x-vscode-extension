import type { C4Element } from '../C4Model';
import type { LintRuleId } from './types';
import {
    checkCrossContainerComponent,
    checkDeclaredLevel,
    checkDuplicateNames,
    checkPartToWhole,
    checkSingleContainerInScope,
} from './coherence';
import { checkLegality } from './legality';
import {
    arrowOf,
    describeElement,
    describeRelationship,
    elementFinding,
    hasTag,
    hasText,
    isExternal,
    macroName,
    relationshipFinding,
    typeLabel,
    type LintContext,
    type RuleCheck,
    type RuleFinding,
} from './support';

export type { LintContext, RuleFinding } from './support';

/** Tags the model builder derives from the element type rather than the author's own words. */
const DERIVED_TAGS = new Set(['external', 'database', 'internal']);

/**
 * Text for a C4X quoted argument. C4X strings have no escape, so a double
 * quote (possible in a bracket-form label) becomes a single one, keeping the
 * suggested source parseable.
 */
function quoted(text: string): string {
    return `"${text.replace(/"/g, "'")}"`;
}

/** Scripts written without spaces between words; a label in one is not a "single word". */
const UNSPACED_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}\p{Script=Tibetan}]/u;

function isContainerOrComponent(element: C4Element): boolean {
    return element.type === 'Container' || element.type === 'Component';
}

/** C4X-L001: every container and component says what it does. */
function checkDescription(context: LintContext): RuleFinding[] {
    return context.elements
        .filter(element => isContainerOrComponent(element) && !hasText(element.description))
        .map(element => elementFinding(
            element,
            `${describeElement(element)} has no description.`,
            `Describe its responsibility in the fourth argument: ${macroName(element)}(${element.id}, `
                + `${quoted(element.label)}, ${quoted(hasText(element.technology) ? element.technology : 'Technology')}, "Description").`,
        ));
}

/** C4X-L002: every container and component names its technology. */
function checkTechnology(context: LintContext): RuleFinding[] {
    return context.elements
        .filter(element => isContainerOrComponent(element) && !hasText(element.technology))
        .map(element => {
            const authoredTags = (element.tags ?? []).filter(tag => !DERIVED_TAGS.has(tag.toLowerCase()));
            const bracketNote = authoredTags.length > 0
                ? ` A tag such as "${authoredTags[0]}" is not drawn as the element's technology.`
                : '';
            return elementFinding(
                element,
                `${describeElement(element)} declares no technology.`,
                `Name it in the third argument: ${macroName(element)}(${element.id}, ${quoted(element.label)}, "Technology"`
                    + `${hasText(element.description) ? `, ${quoted(element.description)}` : ''}).${bracketNote}`,
            );
        });
}

/** C4X-L003: every relationship carries its intent. */
function checkRelationshipLabel(context: LintContext): RuleFinding[] {
    return context.view.relationships
        .filter(rel => !hasText(rel.label))
        .map(rel => relationshipFinding(
            rel,
            `Relationship ${describeRelationship(rel)} has no label.`,
            `Label it with the intent, read in the direction of the arrow: ${rel.from} ${arrowOf(rel)}|<intent>| ${rel.to}.`,
        ));
}

/**
 * The process-boundary test behind C4X-L004, deliberately conservative.
 *
 * A container is a separately running process (or data store), and a software
 * system is at least one. So a relationship crosses a process boundary when its
 * two ends are different containers or systems, or when one end is a component
 * and the other a container or system: in native C4X the container a component
 * lives in is drawn as a boundary, never as a box, so a container box is always
 * a different process from the component.
 *
 * Not treated as crossing, because the model cannot prove it:
 * - two components: the model does not record which container a component
 *   belongs to, so two components are assumed to share a process;
 * - anything involving a person, which is a user rather than a process;
 * - anything involving a deployment node, which is infrastructure;
 * - a relationship from an element to itself.
 */
export function crossesProcessBoundary(from: C4Element, to: C4Element): boolean {
    if (from.id === to.id) {
        return false;
    }
    const outOfProcess = (element: C4Element) => element.type === 'Person' || element.type === 'DeploymentNode';
    if (outOfProcess(from) || outOfProcess(to)) {
        return false;
    }
    return !(from.type === 'Component' && to.type === 'Component');
}

/** C4X-L004: inter-process relationships name their protocol. */
function checkRelationshipTechnology(context: LintContext): RuleFinding[] {
    const findings: RuleFinding[] = [];
    for (const rel of context.view.relationships) {
        const from = context.elementsById.get(rel.from);
        const to = context.elementsById.get(rel.to);
        if (!from || !to || hasText(rel.technology) || !crossesProcessBoundary(from, to)) {
            continue;
        }
        findings.push(relationshipFinding(
            rel,
            `Relationship ${describeRelationship(rel)} crosses a process boundary `
                + `(${typeLabel(from)} to ${typeLabel(to)}) but declares no technology.`,
            `Name the protocol in quotes after the label: ${rel.from} ${arrowOf(rel)}`
                + `|${hasText(rel.label) ? rel.label.trim() : '<intent>'}| "<protocol>" ${rel.to}.`,
        ));
    }
    return findings;
}

/**
 * C4X-L005: software systems outside the scope are marked external.
 *
 * Runs only when the view evidently decomposes a system — a container view with
 * an internal container, or a component view with an internal component. A view
 * with neither is more likely mislabelled than a decomposition, and the rule
 * stays silent rather than guess where its scope is. A software system with
 * children is drawn as a boundary around them, which makes it the system in
 * scope, not a neighbour of it.
 */
function checkExternalMarking(context: LintContext): RuleFinding[] {
    const partType = context.view.type === 'component' ? 'Component' : 'Container';
    const decomposes = context.elements.some(element => element.type === partType && !isExternal(element));
    if (!decomposes) {
        return [];
    }
    return context.elements
        .filter(element => element.type === 'SoftwareSystem'
            && !isExternal(element)
            && (element.children?.length ?? 0) === 0)
        .map(element => elementFinding(
            element,
            `${describeElement(element)} is outside the system this ${context.view.type} view decomposes, `
                + 'but is not marked external.',
            `Declare it as ${hasTag(element, 'database') ? 'SystemDb_Ext' : 'System_Ext'}(${element.id}, `
                + `"${element.label}", ...), or add External as a tag in the bracket form.`,
        ));
}

/** C4X-L008: a label says what the relationship is for, not merely that it exists. */
function checkSingleWordLabel(context: LintContext): RuleFinding[] {
    return context.view.relationships
        .filter(rel => hasText(rel.label) && !/\s/.test(rel.label.trim()) && !UNSPACED_SCRIPT.test(rel.label))
        .map(rel => relationshipFinding(
            rel,
            `Relationship ${describeRelationship(rel)} is labelled with the single word "${rel.label.trim()}".`,
            'Replace it with a phrase that says what the relationship is for, read in the direction of the arrow '
                + '(for example "Reads orders from" rather than "Uses").',
        ));
}

/** C4X-L102: every element takes part in at least one relationship. */
function checkDisconnected(context: LintContext): RuleFinding[] {
    const endpoints = new Set<string>();
    for (const rel of context.view.relationships) {
        endpoints.add(rel.from);
        endpoints.add(rel.to);
    }
    const connected = (element: C4Element): boolean =>
        endpoints.has(element.id) || (element.children ?? []).some(connected);
    return context.elements
        .filter(element => element.type !== 'DeploymentNode' && !connected(element))
        .map(element => elementFinding(
            element,
            `${describeElement(element)} has no relationship in this view.`,
            'Connect it to what it uses or what uses it, or remove it from this view.',
        ));
}

/** The executable half of the catalogue. Every catalogue id has exactly one check. */
export const RULE_CHECKS: Readonly<Record<LintRuleId, RuleCheck>> = {
    'C4X-L001': checkDescription,
    'C4X-L002': checkTechnology,
    'C4X-L003': checkRelationshipLabel,
    'C4X-L004': checkRelationshipTechnology,
    'C4X-L005': checkExternalMarking,
    'C4X-L006': checkLegality,
    'C4X-L008': checkSingleWordLabel,
    'C4X-L101': checkSingleContainerInScope,
    'C4X-L102': checkDisconnected,
    'C4X-L103': checkCrossContainerComponent,
    'C4X-L104': checkDuplicateNames,
    'C4X-L105': checkDeclaredLevel,
    'C4X-L106': checkPartToWhole,
};
