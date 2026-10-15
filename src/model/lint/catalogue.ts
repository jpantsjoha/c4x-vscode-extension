import type { C4ViewType } from '../../parser/types';
import type { LintRuleDefinition, LintRuleId } from './types';

/**
 * The published C4 diagram review checklist. C4 has no formal standard; this
 * checklist is the closest executable reference, so every rule names the
 * question it answers rather than claiming conformance to a specification.
 */
export const C4_REVIEW_CHECKLIST_URL = 'https://c4model.com/diagrams/checklist';

const ALL_VIEWS: readonly C4ViewType[] = ['system-context', 'container', 'component', 'dynamic', 'deployment'];
const DETAIL_VIEWS: readonly C4ViewType[] = ['container', 'component'];

/**
 * The rule catalogue, in the order findings for the same target are reported.
 *
 * Ids are stable: a rule that is withdrawn keeps its id retired rather than
 * handing it to a different check, so a suppression written today cannot
 * silently switch off something else tomorrow. `C4X-L007` is reserved for a
 * view-title rule, which waits on the parser keeping `title` lines.
 *
 * `C4X-L1xx` are the coherence rules. None has a Structurizr workspace
 * inspection: Structurizr enforces the same ideas while it builds the model
 * instead (a component view is created for one container; names are unique per
 * parent; "Relationships cannot be added between parents and children"), so a
 * Structurizr workspace cannot express what these rules report.
 *
 * Every default is `info`. The shipped samples break most of these rules
 * (unlabelled arrows among them), and a first release that turns the samples
 * yellow teaches users to ignore the Problems panel. Raise a default only once
 * the corpus is clean at the new severity; the sample-corpus test enforces it.
 */
export const LINT_RULES: readonly LintRuleDefinition[] = [
    {
        id: 'C4X-L001',
        title: 'Container and component have a description',
        defaultSeverity: 'info',
        levels: DETAIL_VIEWS,
        appliesTo: 'Container and Component elements, including database and external variants',
        rationale: 'A short description gives an at-a-glance view of the element\'s responsibility. '
            + 'Without it a reader has a name and a box, and has to guess what the element does.',
        checklist: {
            item: 'Do you understand what every element does?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: ['model.container.description', 'model.component.description'],
    },
    {
        id: 'C4X-L002',
        title: 'Container and component declare a technology',
        defaultSeverity: 'info',
        levels: DETAIL_VIEWS,
        appliesTo: 'Container and Component elements, including database and external variants',
        rationale: 'Container and component diagrams exist to show the major technology choices. '
            + 'An element without a technology leaves out the thing the diagram is for.',
        checklist: {
            item: 'Where applicable, do you understand the technology choices associated with every element?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: ['model.container.technology', 'model.component.technology'],
    },
    {
        id: 'C4X-L003',
        title: 'Relationship has a label',
        defaultSeverity: 'info',
        levels: ALL_VIEWS,
        appliesTo: 'Every relationship',
        rationale: 'An unlabelled arrow says that two elements are related but not how or why. '
            + 'The label carries the intent, and should read in the direction of the arrow.',
        checklist: {
            item: 'Does every arrow have a label describing the intent of that relationship?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: ['model.relationship.description'],
    },
    {
        id: 'C4X-L004',
        title: 'Relationship across a process boundary declares a technology',
        defaultSeverity: 'info',
        levels: DETAIL_VIEWS,
        appliesTo: 'Relationships whose endpoints run in different processes: between two different '
            + 'containers or software systems, or between a component and a container or software system. '
            + 'Relationships with a person at either end, and between two components, are not checked',
        rationale: 'A relationship between containers is inter-process communication. Naming the protocol '
            + '(JSON/HTTPS, JDBC, AMQP) tells the reader how the processes talk, which is what the '
            + 'container and component levels are meant to show.',
        checklist: {
            item: 'Where applicable, do you understand the technology choices associated with every '
                + 'relationship? (e.g. protocols for inter-process communication)',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: ['model.relationship.technology'],
    },
    {
        id: 'C4X-L005',
        title: 'Software system outside the scope is marked external',
        defaultSeverity: 'info',
        levels: DETAIL_VIEWS,
        appliesTo: 'Software System elements in a view that decomposes a system: a container view '
            + 'with at least one internal container, or a component view with at least one internal component',
        rationale: 'A container or component view zooms into one software system, drawn as the boundary '
            + 'around its parts. Any software system drawn as a box is therefore a neighbour, outside the '
            + 'scope. Marking it external draws it in the external style, so the reader can see where the '
            + 'scope ends.',
        checklist: {
            item: 'Do you understand what the diagram scope is?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L006',
        title: 'Element and relationship are legal at the view level',
        defaultSeverity: 'info',
        levels: ['system-context', 'container', 'component', 'deployment'],
        appliesTo: 'Every element and typed boundary, and every relationship. Inside a System_Boundary, '
            + 'Container_Boundary, Enterprise_Boundary or deployment Node every placement is checked; at the '
            + 'diagram root or inside an untyped subgraph, only types the view level allows nowhere. A deployment '
            + 'view may also hold software system instances in nodes and people at the root',
        rationale: 'Each C4 level shows one level of abstraction. A component in a system context view, '
            + 'or a container drawn inside another container, mixes levels and leaves the reader unsure '
            + 'what kind of thing each box is. The verdicts come from C4X\'s one table of C4 nesting rules, '
            + 'shared with the visual editor.',
        checklist: {
            item: 'Do you understand the type of every element? (i.e. the level of abstraction; e.g. '
                + 'software system, container, etc)',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L008',
        title: 'Relationship label says more than one word',
        defaultSeverity: 'info',
        levels: ALL_VIEWS,
        appliesTo: 'Every labelled relationship',
        rationale: 'A one-word label such as "Uses" says that a relationship exists, which the arrow '
            + 'already said. A phrase such as "Reads account balances from" says what it is for.',
        checklist: {
            item: 'Does every arrow have a label describing the intent of that relationship?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L101',
        title: 'Component view decomposes exactly one container',
        defaultSeverity: 'info',
        levels: ['component'],
        appliesTo: 'Component views. Counts the Container_Boundaries C4X-L006 accepts: more than one is reported '
            + 'on each boundary after the first; none at all, while the view draws an internal component that '
            + 'C4X-L006 accepts, is reported on the view',
        rationale: 'A component diagram zooms into one container and shows the components inside it. With two '
            + 'containers decomposed, or none named, the reader cannot tell which container the diagram is about '
            + 'or which container each component belongs to.',
        checklist: {
            item: 'Do you understand what the diagram scope is?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L102',
        title: 'Element is connected to the rest of the view',
        defaultSeverity: 'info',
        levels: ['system-context', 'container', 'component', 'dynamic'],
        appliesTo: 'Every element except deployment nodes. An element counts as connected when it, '
            + 'or an element nested inside it, is either end of a relationship',
        rationale: 'The supporting elements of a C4 view are the people and systems connected to the '
            + 'elements in scope. A box with no relationship shows neither what it depends on nor what '
            + 'depends on it, and is usually left over from an earlier version of the diagram.',
        checklist: {
            item: 'Do you understand what the diagram scope is?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: ['model.element.disconnected'],
    },
    {
        id: 'C4X-L103',
        title: 'Relationship does not reach into another container',
        defaultSeverity: 'info',
        levels: ['component'],
        appliesTo: 'Relationships between two components that sit inside two different Container_Boundaries. '
            + 'Relationships from a person, system or container box to a component are not checked',
        rationale: 'Outside the container in scope, a component view shows other containers as boxes, not their '
            + 'insides. A relationship from a component of one container to a component of another mixes two '
            + 'decompositions in one diagram; it should target the other container.',
        checklist: {
            item: 'Do you understand what the diagram scope is?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L104',
        title: 'Element names are unique within a boundary',
        defaultSeverity: 'info',
        levels: ['system-context', 'container', 'component', 'dynamic'],
        appliesTo: 'Every element, compared with the others declared directly in the same boundary or subgraph, '
            + 'in the same deployment node (dynamic views, which C4X-L006 does not check), or at the diagram root. '
            + 'Names are compared ignoring case and spacing. Elements C4X-L006 reports are left to it',
        rationale: 'Two boxes with one name in the same boundary are either the same thing drawn twice or two '
            + 'things the reader cannot tell apart. Either way the reader cannot say which box a sentence about '
            + 'that name refers to.',
        checklist: {
            item: 'Does every element have a name?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L105',
        title: 'Declared view level matches the elements drawn',
        defaultSeverity: 'info',
        levels: ['container', 'component'],
        appliesTo: 'Container views with no container and component views with no component. Empty views, and '
            + 'views in which C4X-L006 reports anything, are not checked',
        rationale: 'The view declaration tells the reader which level of zoom they are looking at. A container view '
            + 'that shows only people and software systems is a system context diagram, and labelling it otherwise '
            + 'sends the reader looking for detail that is not there.',
        checklist: {
            item: 'Do you understand what the diagram type is?',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
    {
        id: 'C4X-L106',
        title: 'Relationship does not join a part to its whole',
        defaultSeverity: 'info',
        levels: ['system-context', 'container', 'component', 'dynamic', 'deployment'],
        appliesTo: 'Relationships whose one end contains the other: an element nested in the other, or declared '
            + 'inside a typed boundary whose alias is the id of the other end. A relationship C4X-L006 reports, '
            + 'or whose end it reports, is left to it',
        rationale: 'A component and the software system it belongs to are two levels of abstraction of the same '
            + 'thing. An arrow between them says the system depends on part of itself, which tells the reader '
            + 'nothing and hides the real dependency on something outside.',
        checklist: {
            item: 'Do you understand the type of every element? (i.e. the level of abstraction; e.g. '
                + 'software system, container, etc)',
            url: C4_REVIEW_CHECKLIST_URL,
        },
        structurizrEquivalent: [],
    },
];

const RULES_BY_ID: ReadonlyMap<string, LintRuleDefinition> = new Map(LINT_RULES.map(rule => [rule.id, rule]));

/** Look a rule up by id. Returns `undefined` for an id the catalogue does not contain. */
export function lintRule(id: string): LintRuleDefinition | undefined {
    return RULES_BY_ID.get(id);
}

/** True when `id` names a rule in the catalogue. */
export function isLintRuleId(id: string): id is LintRuleId {
    return RULES_BY_ID.has(id);
}
