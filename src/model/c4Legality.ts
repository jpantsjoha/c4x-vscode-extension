import type { C4Element, C4ElementType as ModelC4ElementType } from './C4Model';

/**
 * Element types accepted by the semantic-editor palette and preflight.
 *
 * The existing rendered-model types (`SoftwareSystem` and `DeploymentNode`)
 * are retained. The source-facing aliases make it possible to validate C4X
 * and C4-PlantUML spellings before they are normalised by the model builder.
 */
export type C4ElementType =
    | ModelC4ElementType
    | 'Person_Ext'
    | 'System'
    | 'System_Ext'
    | 'SoftwareSystem_Ext'
    | 'Container_Ext'
    | 'Component_Ext'
    | 'Node'
    | 'SystemDb'
    | 'SystemDb_Ext'
    | 'ContainerDb'
    | 'ContainerDb_Ext'
    | 'ComponentDb'
    | 'ComponentDb_Ext'
    | 'System_Boundary'
    | 'Container_Boundary'
    | 'Enterprise_Boundary';

/** Parent locations understood by the C4 semantic editor. */
export type C4Scope =
    | 'root'
    | 'Root'
    | 'Enterprise_Boundary'
    | 'EnterpriseBoundary'
    | 'System_Boundary'
    | 'SystemBoundary'
    | 'Container_Boundary'
    | 'ContainerBoundary'
    | 'Node'
    | 'DeploymentNode';

/**
 * C4 levels accepted by the validator. C4X's parser names are accepted as
 * aliases so callers do not need a VS Code or parser dependency to validate
 * a draft model.
 */
export type C4Level =
    | 'C1'
    | 'C2'
    | 'C3'
    | 'C4'
    | 'system-context'
    | 'container'
    | 'component'
    | 'deployment';

/** Canonical levels used by the palette and exhaustive matrix tests. */
export const C4_LEVELS = ['C1', 'C2', 'C3', 'C4'] as const;

/** Canonical parent scopes used by the palette and exhaustive matrix tests. */
export const C4_SCOPES = [
    'root',
    'Enterprise_Boundary',
    'System_Boundary',
    'Container_Boundary',
    'Node',
] as const;

/**
 * Palette spellings. Database variants are intentionally normalised to their
 * base type for palette purposes, while still being accepted by preflight.
 */
export const C4_ELEMENT_TYPES = [
    'Person',
    'Person_Ext',
    'SoftwareSystem',
    'System_Ext',
    'Container',
    'Container_Ext',
    'Component',
    'Component_Ext',
    'Node',
    'System_Boundary',
    'Container_Boundary',
    'Enterprise_Boundary',
] as const satisfies readonly C4ElementType[];

type CanonicalC4Level = typeof C4_LEVELS[number];
type CanonicalC4Scope = typeof C4_SCOPES[number];
type ElementBase = 'Person' | 'SoftwareSystem' | 'Container' | 'Component' | 'Node'
    | 'System_Boundary' | 'Container_Boundary' | 'Enterprise_Boundary';

const ELEMENT_BASES: ReadonlyMap<C4ElementType, ElementBase> = new Map([
    ['Person', 'Person'],
    ['Person_Ext', 'Person'],
    ['SoftwareSystem', 'SoftwareSystem'],
    ['System', 'SoftwareSystem'],
    ['System_Ext', 'SoftwareSystem'],
    ['SoftwareSystem_Ext', 'SoftwareSystem'],
    ['SystemDb', 'SoftwareSystem'],
    ['SystemDb_Ext', 'SoftwareSystem'],
    ['Container', 'Container'],
    ['Container_Ext', 'Container'],
    ['ContainerDb', 'Container'],
    ['ContainerDb_Ext', 'Container'],
    ['Component', 'Component'],
    ['Component_Ext', 'Component'],
    ['ComponentDb', 'Component'],
    ['ComponentDb_Ext', 'Component'],
    ['DeploymentNode', 'Node'],
    ['Node', 'Node'],
    ['System_Boundary', 'System_Boundary'],
    ['Container_Boundary', 'Container_Boundary'],
    ['Enterprise_Boundary', 'Enterprise_Boundary'],
]);

const SCOPE_ALIASES: ReadonlyMap<C4Scope, CanonicalC4Scope> = new Map([
    ['root', 'root'],
    ['Root', 'root'],
    ['Enterprise_Boundary', 'Enterprise_Boundary'],
    ['EnterpriseBoundary', 'Enterprise_Boundary'],
    ['System_Boundary', 'System_Boundary'],
    ['SystemBoundary', 'System_Boundary'],
    ['Container_Boundary', 'Container_Boundary'],
    ['ContainerBoundary', 'Container_Boundary'],
    ['Node', 'Node'],
    ['DeploymentNode', 'Node'],
]);

const LEVEL_ALIASES: ReadonlyMap<C4Level, CanonicalC4Level> = new Map([
    ['C1', 'C1'],
    ['C2', 'C2'],
    ['C3', 'C3'],
    ['C4', 'C4'],
    ['system-context', 'C1'],
    ['container', 'C2'],
    ['component', 'C3'],
    ['deployment', 'C4'],
]);

const PERSON_TYPES: readonly C4ElementType[] = ['Person', 'Person_Ext'];
const SYSTEM_TYPES: readonly C4ElementType[] = ['SoftwareSystem', 'System_Ext'];
const CONTAINER_TYPES: readonly C4ElementType[] = ['Container', 'Container_Ext'];
const COMPONENT_TYPES: readonly C4ElementType[] = ['Component', 'Component_Ext'];

/**
 * C4 nesting rules used by both the palette and save preflight.
 *
 * | View | Root / Enterprise boundary | System boundary | Container boundary | Deployment node |
 * | --- | --- | --- | --- | --- |
 * | C1 — system context | Person, Software System, Enterprise boundary | — | — | — |
 * | C2 — container | C1 types plus System boundary | Container | — | — |
 * | C3 — component | C2 top-level types | Container and Container boundary | Component | — |
 * | C4 — deployment | Node | — | — | Node and Container |
 *
 * `_Ext` variants are legal wherever their base type is legal. Database
 * variants are normalised to the same base type by the existing model builder
 * and therefore follow the same rule. Logical boundaries are never available
 * in a deployment view, and deployment nodes are never available in a logical
 * view.
 */
const CHILD_TYPES: ReadonlyMap<CanonicalC4Level, ReadonlyMap<CanonicalC4Scope, readonly C4ElementType[]>> = new Map([
    ['C1', new Map([
        ['root', [...PERSON_TYPES, ...SYSTEM_TYPES, 'Enterprise_Boundary']],
        ['Enterprise_Boundary', [...PERSON_TYPES, ...SYSTEM_TYPES]],
        ['System_Boundary', []],
        ['Container_Boundary', []],
        ['Node', []],
    ])],
    ['C2', new Map([
        ['root', [...PERSON_TYPES, ...SYSTEM_TYPES, 'System_Boundary', 'Enterprise_Boundary']],
        ['Enterprise_Boundary', [...PERSON_TYPES, ...SYSTEM_TYPES, 'System_Boundary']],
        ['System_Boundary', [...CONTAINER_TYPES]],
        ['Container_Boundary', []],
        ['Node', []],
    ])],
    ['C3', new Map([
        ['root', [...PERSON_TYPES, ...SYSTEM_TYPES, 'System_Boundary', 'Enterprise_Boundary']],
        ['Enterprise_Boundary', [...PERSON_TYPES, ...SYSTEM_TYPES, 'System_Boundary']],
        ['System_Boundary', [...CONTAINER_TYPES, 'Container_Boundary']],
        ['Container_Boundary', [...COMPONENT_TYPES]],
        ['Node', []],
    ])],
    ['C4', new Map([
        ['root', ['Node']],
        ['Enterprise_Boundary', []],
        ['System_Boundary', []],
        ['Container_Boundary', []],
        ['Node', ['Node', ...CONTAINER_TYPES]],
    ])],
]);

function canonicalScope(scope: C4Scope): CanonicalC4Scope | undefined {
    return SCOPE_ALIASES.get(scope);
}

function canonicalLevel(level: C4Level): CanonicalC4Level | undefined {
    return LEVEL_ALIASES.get(level);
}

function baseType(type: string): ElementBase | undefined {
    return ELEMENT_BASES.get(type as C4ElementType);
}

function childTypesFor(level: CanonicalC4Level, scope: CanonicalC4Scope): readonly C4ElementType[] {
    return CHILD_TYPES.get(level)!.get(scope)!;
}

function isAllowedType(type: C4ElementType, allowedTypes: readonly C4ElementType[]): boolean {
    const base = baseType(type);
    return base !== undefined && allowedTypes.some(allowed => baseType(allowed) === base);
}

function scopeLabel(scope: CanonicalC4Scope): string {
    switch (scope) {
        case 'root':
            return 'the diagram root';
        case 'Enterprise_Boundary':
            return 'an Enterprise Boundary';
        case 'System_Boundary':
            return 'a System Boundary';
        case 'Container_Boundary':
            return 'a Container Boundary';
        case 'Node':
            return 'a deployment Node';
    }
}

function levelLabel(level: CanonicalC4Level): string {
    return level === 'C4' ? 'C4 deployment' : `${level} logical`;
}

function typeLabel(type: C4ElementType): string {
    const base = baseType(type);
    switch (base) {
        case 'SoftwareSystem':
            return 'Software System';
        case 'System_Boundary':
            return 'System Boundary';
        case 'Container_Boundary':
            return 'Container Boundary';
        case 'Enterprise_Boundary':
            return 'Enterprise Boundary';
        case 'Node':
            return 'Deployment Node';
        default:
            return type;
    }
}

/**
 * Return the element types a palette may present for one parent location and
 * C4 level. Invalid runtime values intentionally produce no choices.
 */
export function legalChildTypes(parentScope: C4Scope, c4Level: C4Level): C4ElementType[] {
    const scope = canonicalScope(parentScope);
    const level = canonicalLevel(c4Level);
    if (!scope || !level) {
        return [];
    }

    return [...childTypesFor(level, scope)];
}

/**
 * Check whether an element can be created in the requested parent location.
 * Reasons are intentionally complete, user-facing sentences because the UI
 * displays them verbatim when it refuses an illegal placement.
 */
export function isElementLegalIn(
    elementType: C4ElementType,
    parentScope: C4Scope,
    c4Level: C4Level,
): { legal: boolean; reason?: string } {
    const scope = canonicalScope(parentScope);
    if (!scope) {
        return {
            legal: false,
            reason: 'The selected parent scope is not supported by the C4 editor.',
        };
    }

    const level = canonicalLevel(c4Level);
    if (!level) {
        return {
            legal: false,
            reason: 'The selected C4 view level is not supported by the C4 editor.',
        };
    }

    if (!baseType(elementType)) {
        return {
            legal: false,
            reason: `${elementType} is not a supported C4 element type.`,
        };
    }

    if (isAllowedType(elementType, childTypesFor(level, scope))) {
        return { legal: true };
    }

    return {
        legal: false,
        reason: `${typeLabel(elementType)} cannot be placed in ${scopeLabel(scope)} in a ${levelLabel(level)} view.`,
    };
}

function isRelationshipEndpoint(element: C4Element | undefined): element is C4Element {
    return typeof element === 'object'
        && element !== null
        && typeof element.id === 'string'
        && element.id.trim().length > 0
        && typeof element.type === 'string'
        && baseType(element.type) !== undefined;
}

/**
 * Validate a relationship before it is added to a draft. The caller supplies
 * resolved elements rather than IDs, so an absent, malformed, or unsupported
 * endpoint is rejected before any relationship source is produced.
 */
export function isRelationshipLegal(
    source: C4Element,
    target: C4Element,
): { legal: boolean; reason?: string } {
    if (!isRelationshipEndpoint(source)) {
        return {
            legal: false,
            reason: 'Choose an existing C4 element as the relationship source.',
        };
    }

    if (!isRelationshipEndpoint(target)) {
        return {
            legal: false,
            reason: 'Choose an existing C4 element as the relationship target.',
        };
    }

    const sourceIsDeployment = baseType(source.type) === 'Node';
    const targetIsDeployment = baseType(target.type) === 'Node';
    if (sourceIsDeployment !== targetIsDeployment) {
        return {
            legal: false,
            reason: 'Deployment Nodes cannot be connected directly to logical-view elements.',
        };
    }

    return { legal: true };
}
