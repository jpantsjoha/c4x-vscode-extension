/**
 * Element style resolution (notation decision #320, Decisions 1-3; issue #322).
 *
 * `resolveElementStyle` is the only place an element's stroke, fill, text
 * colour, shape, icon, border, stroke width and key label are computed. The
 * host renderer (ElementRenderer), the legend swatch colours (legendCatalog)
 * and the webview client consume it.
 *
 * Layers, later wins per field:
 *   1. Theme defaults: the type/external colour triple, then the external
 *      accent for the element's declaration slot, then the theme's default tag
 *      styles (every theme carries `Database -> Cylinder`).
 *   2. Tag styles (`elementStyle`), applied in tag order: implied tags
 *      (`Element`, the type tag, `External`, `Database`), then the element's
 *      other tags in order. Tag matching is case-insensitive.
 *   3. Element overrides: `$shape` and `$sprite`.
 *
 * A shape set only by a theme default never replaces an icon-node render (a
 * Person, or an element with a sprite); an explicit shape does.
 *
 * EMBEDDING CONTRACT: the webview client embeds these functions verbatim via
 * `fn.toString()` (previewClientScript.ts). Every function here must therefore
 * be self-contained: no runtime imports, no module-level constants, and calls
 * only to other functions in this file that the client also embeds
 * (see ELEMENT_STYLE_CLIENT_FUNCTIONS).
 */
import type { C4ElementStyleRule, C4StyleProperty } from '../model/C4Model';
import type { C4AccentColors, C4ElementColors, C4RelationshipColors } from '../themes/Theme';
import { BUNDLED_SPRITE_IDS } from '../assets/spriteIds';

/** The Structurizr element style keys C4X accepts, one spelling each. */
export type StyleKey = 'stroke' | 'background' | 'color' | 'shape' | 'sprite' | 'border' | 'strokeWidth' | 'legend';

export type StyleBorder = 'solid' | 'dashed' | 'dotted';

/**
 * The outline to draw. `rect` is the theme rectangle (no shape, or a shape not
 * drawn yet); the others are the named shapes #323 draws. #334's shapes are
 * drawn as `rect` until then.
 */
export type StyleOutline =
    | 'rect' | 'box' | 'roundedBox' | 'cylinder'
    | 'person' | 'bucket' | 'folder' | 'webBrowser' | 'terminal';

/** What the resolver needs from an element. */
export interface StyleableElement {
    readonly id?: string;
    readonly type: string;
    readonly tags?: readonly string[];
    readonly sprite?: string;
    readonly shape?: string;
    /**
     * Tags the model builder injected (`External` from a `_Ext` macro,
     * `Database` from a `Db` macro). They take the implied position; the same
     * tags written by the author keep their source position.
     */
    readonly impliedTags?: readonly string[];
}

/** What the resolver needs from a theme: a subset of C4Theme the client can carry. */
export interface ElementStyleTheme {
    readonly colors: {
        readonly person: C4ElementColors;
        readonly softwareSystem: C4ElementColors;
        readonly externalSystem: C4ElementColors;
        readonly container: C4ElementColors;
        readonly component: C4ElementColors;
        readonly deploymentNode: C4ElementColors;
        readonly externalPerson?: C4ElementColors;
        readonly externalContainer?: C4ElementColors;
        readonly externalComponent?: C4ElementColors;
        readonly relationship?: C4RelationshipColors;
    };
    readonly externalAccents?: ReadonlyArray<C4AccentColors>;
    /** Theme-level tag styles; when absent, `Database -> Cylinder`. */
    readonly defaultTagStyles?: ReadonlyArray<Pick<C4ElementStyleRule, 'tag' | 'properties'>>;
    /** Deployment notation (#326): `brandTint` outlines a deployment node in its sprite's brand colour. */
    readonly deploymentNotation?: { readonly brandTint: boolean };
}

/** The view-level inputs: style rules and each external element's accent slot. */
export interface ElementStyleContext {
    readonly rules?: ReadonlyArray<Pick<C4ElementStyleRule, 'tag' | 'properties'>>;
    /** Element id -> declaration-order slot among the view's external elements. */
    readonly accentSlots?: Readonly<Record<string, number>>;
    /**
     * Sprite id -> brand colour of each `preserveColor` sprite the view uses
     * (#326, deploymentNotation.ts `viewBrandColors`). Read only when the theme
     * tints deployment nodes.
     */
    readonly brandColors?: Readonly<Record<string, string>>;
}

export interface ElementStyleOptions {
    /** Validates a tag style's `$sprite`. Absent: every sprite id is accepted. */
    readonly isKnownSprite?: (id: string) => boolean;
}

export interface ResolvedElementStyle {
    readonly stroke: string;
    readonly fill: string;
    /** Text colour. */
    readonly color: string;
    /** The resolved shape name, if any layer set one. */
    readonly shape?: string;
    /** Where `shape` came from. */
    readonly shapeSource: 'none' | 'theme' | 'explicit';
    /** A valid shape name the renderer cannot draw yet; it is drawn as the theme rectangle. */
    readonly undrawnShape?: string;
    /** An explicit shape outside the 19 names; it is drawn as the theme rectangle. */
    readonly unknownShape?: string;
    /** Bundled sprite id drawn as the element icon. */
    readonly icon?: string;
    readonly border: StyleBorder;
    /** Outline width; absent means the theme's border width. */
    readonly strokeWidth?: number;
    /** Key label for #327. */
    readonly legend?: string;
    /** Tags whose style set at least one field, in tag order, spelled as the element spells them. */
    readonly contributingTags: readonly string[];
    /** The outline to draw. */
    readonly outline: StyleOutline;
    /** True when the icon is drawn top centre with the text below it (today's icon node). */
    readonly iconLayout: boolean;
}

/** The 19 Structurizr shape names, spelled as Structurizr spells them (notation decision #320, Decision 2). */
export function styleShapeNames(): string[] {
    return [
        'Box', 'RoundedBox', 'Circle', 'Ellipse', 'Hexagon', 'Diamond', 'Cylinder', 'Bucket', 'Pipe',
        'Person', 'Robot', 'Folder', 'WebBrowser', 'Window', 'Terminal', 'Shell',
        'MobileDevicePortrait', 'MobileDeviceLandscape', 'Component',
    ];
}

/**
 * Shapes the renderer draws (#323). Every other valid name (#334's eleven) is
 * drawn as the theme rectangle with the undrawn-shape information.
 */
export function drawnShapeNames(): string[] {
    return ['Box', 'RoundedBox', 'Cylinder', 'Person', 'Bucket', 'Folder', 'WebBrowser', 'Terminal'];
}

/** The outline a drawn shape name selects; any other name is the theme rectangle. */
export function outlineForShape(shape: string | undefined): StyleOutline {
    switch (shape) {
        case 'Box': return 'box';
        case 'RoundedBox': return 'roundedBox';
        case 'Cylinder': return 'cylinder';
        case 'Person': return 'person';
        case 'Bucket': return 'bucket';
        case 'Folder': return 'folder';
        case 'WebBrowser': return 'webBrowser';
        case 'Terminal': return 'terminal';
        default: return 'rect';
    }
}

/**
 * True when `name` selects a bundled sprite, matching the host lookup
 * (`getSprite`): case-insensitive exact id, then a vendor prefix (`s3` ->
 * `aws-s3`), then an id ending in `-name`. `ids` is the bundled id list
 * (src/assets/spriteIds.ts), so the builder, the headless bundles and the
 * webview client check sprites identically.
 */
export function spriteIdMatches(name: string, ids: readonly string[]): boolean {
    if (!name) { return false; }
    const key = name.toLowerCase();
    if (ids.indexOf(key) >= 0) { return true; }
    for (const vendor of ['aws', 'azure', 'gcp', 'google']) {
        if (ids.indexOf(vendor + '-' + key) >= 0) { return true; }
    }
    const suffix = '-' + key;
    return ids.some(id => id.length > suffix.length - 1 && id.slice(-suffix.length) === suffix);
}

/** The issue that draws an undrawn shape: #323 for its eight, #334 for the other eleven. */
export function shapeDrawingIssue(shape: string): string {
    return ['Person', 'Cylinder', 'Bucket', 'Folder', 'WebBrowser', 'Terminal', 'RoundedBox', 'Box'].indexOf(shape) >= 0
        ? '#323'
        : '#334';
}

/** The `elementStyle` keys, in documentation order. */
export function styleKeyNames(): StyleKey[] {
    return Object.keys(styleValueRules()) as StyleKey[];
}

/** How one style key's value is validated. The generated C4X reference reads this table. */
export type StyleValueRule =
    | { readonly kind: 'hex' }
    | { readonly kind: 'shape' }
    | { readonly kind: 'sprite' }
    | { readonly kind: 'set'; readonly values: readonly string[] }
    | { readonly kind: 'integer'; readonly min: number; readonly max: number }
    | { readonly kind: 'text'; readonly maxLength: number };

/**
 * The one table of what each style key accepts, in key order. `parseStyleValue`
 * validates by reading it, so the resolver and the reference cannot disagree.
 * A function, not a constant: the webview client embeds this file's functions
 * verbatim (see the embedding contract above).
 */
export function styleValueRules(): { readonly [key: string]: StyleValueRule } {
    return {
        stroke: { kind: 'hex' },
        background: { kind: 'hex' },
        color: { kind: 'hex' },
        shape: { kind: 'shape' },
        sprite: { kind: 'sprite' },
        border: { kind: 'set', values: ['solid', 'dashed', 'dotted'] },
        strokeWidth: { kind: 'integer', min: 1, max: 10 },
        // Bounded like an inspector label (INSPECTOR_LABEL_MAX = 120).
        legend: { kind: 'text', maxLength: 120 },
    };
}

/**
 * Validate one style value. Returns the parsed value, or `undefined` when the
 * value is not valid for the key (the caller ignores the key, and the field
 * falls back to the earlier layer).
 */
export function parseStyleValue(
    key: string,
    value: string,
    isKnownSprite?: (id: string) => boolean,
): string | number | undefined {
    const rules = styleValueRules();
    if (!Object.prototype.hasOwnProperty.call(rules, key)) { return undefined; }
    const rule = rules[key];
    if (rule.kind === 'hex') {
        return /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value) ? value : undefined;
    }
    if (rule.kind === 'shape') {
        return styleShapeNames().indexOf(value) >= 0 ? value : undefined;
    }
    if (rule.kind === 'sprite') {
        return value.length > 0 && (!isKnownSprite || isKnownSprite(value)) ? value : undefined;
    }
    if (rule.kind === 'set') {
        return rule.values.indexOf(value) >= 0 ? value : undefined;
    }
    if (rule.kind === 'integer') {
        if (!/^[0-9]+$/.test(value)) { return undefined; }
        const width = Number(value);
        return width >= rule.min && width <= rule.max ? width : undefined;
    }
    return value.trim().length > 0 && value.length <= rule.maxLength ? value : undefined;
}

/** True when an element carries the `External` tag (any case). */
export function isExternalStyleElement(element: StyleableElement): boolean {
    return (element.tags || []).some(tag => tag.toLowerCase() === 'external');
}

/** The implied type tag, spelled as Structurizr spells it. */
export function styleTypeTag(type: string): string {
    switch (type) {
        case 'Person': return 'Person';
        case 'SoftwareSystem': return 'Software System';
        case 'Container': return 'Container';
        case 'Component': return 'Component';
        case 'DeploymentNode': return 'Deployment Node';
        default: return type;
    }
}

/**
 * The element's tags in style order: `Element`, the type tag, `External` and
 * `Database` when the builder injected them, then every other tag in its
 * order (explicit `$tags` before `class` assignments, as the parser appends
 * them). An authored `External` or `Database` keeps its source position.
 * Case-insensitive duplicates keep their first position.
 */
export function orderedStyleTags(element: StyleableElement): string[] {
    const tags = element.tags || [];
    const ordered: string[] = [];
    // Null-prototype maps: tags and ids are user text ("__proto__" is a valid tag).
    const seen: Record<string, true> = Object.create(null);
    const add = (tag: string): void => {
        const key = tag.toLowerCase();
        if (!seen[key]) {
            seen[key] = true;
            ordered.push(tag);
        }
    };
    add('Element');
    add(styleTypeTag(element.type));
    for (const implied of element.impliedTags || []) {
        if (tags.indexOf(implied) >= 0) { add(implied); }
    }
    for (const tag of tags) { add(tag); }
    return ordered;
}

/**
 * Each external element's accent slot, in source declaration order within the
 * view (depth first, so a deployment node's children follow it). Every
 * external element takes one, deployment nodes included.
 */
export function computeAccentSlots(
    elements: ReadonlyArray<StyleableElement & { readonly children?: ReadonlyArray<unknown> }>,
): Record<string, number> {
    const slots: Record<string, number> = Object.create(null);
    let next = 0;
    const walk = (list: ReadonlyArray<StyleableElement & { readonly children?: ReadonlyArray<unknown> }>): void => {
        for (const element of list) {
            if (element.id !== undefined && isExternalStyleElement(element)
                && slots[element.id] === undefined) {
                slots[element.id] = next++;
            }
            if (element.children) {
                walk(element.children as ReadonlyArray<StyleableElement & { readonly children?: ReadonlyArray<unknown> }>);
            }
        }
    };
    walk(elements);
    return slots;
}

/** The theme's colour triple for an element's type and external flag (today's rule, unchanged). */
export function themeElementColors(element: StyleableElement, theme: ElementStyleTheme): C4ElementColors {
    const external = isExternalStyleElement(element);
    const colors = theme.colors;
    switch (element.type) {
        case 'Person':
            return external ? (colors.externalPerson || colors.externalSystem) : colors.person;
        case 'Container':
            return external ? (colors.externalContainer || colors.externalSystem) : colors.container;
        case 'Component':
            return external ? (colors.externalComponent || colors.externalSystem) : colors.component;
        case 'DeploymentNode': {
            // Fill follows the system triple, stroke and text the node triple,
            // exactly as ElementRenderer drew deployment nodes before #322.
            const system = external ? colors.externalSystem : colors.softwareSystem;
            return { fill: system.fill, stroke: colors.deploymentNode.stroke, text: colors.deploymentNode.text };
        }
        case 'SoftwareSystem':
        default:
            return external ? colors.externalSystem : colors.softwareSystem;
    }
}

/**
 * Merge rules by case-insensitive tag: a later rule's key replaces the same
 * key of an earlier rule, keeping the earlier key's position. Returns a map
 * from lower-cased tag to ordered properties.
 */
export function mergeStyleRules(
    rules: ReadonlyArray<Pick<C4ElementStyleRule, 'tag' | 'properties'>>,
): Record<string, Array<Pick<C4StyleProperty, 'key' | 'value'>>> {
    const merged: Record<string, Array<Pick<C4StyleProperty, 'key' | 'value'>>> = Object.create(null);
    for (const rule of rules) {
        const tag = rule.tag.toLowerCase();
        const list = merged[tag] || (merged[tag] = []);
        for (const property of rule.properties) {
            const existing = list.findIndex(entry => entry.key === property.key);
            if (existing >= 0) {
                list[existing] = { key: property.key, value: property.value };
            } else {
                list.push({ key: property.key, value: property.value });
            }
        }
    }
    return merged;
}

/** Resolve one element's style. Pure; see the module comment for the layer order. */
export function resolveElementStyle(
    element: StyleableElement,
    theme: ElementStyleTheme,
    styles?: ElementStyleContext,
    options?: ElementStyleOptions,
): ResolvedElementStyle {
    const base = themeElementColors(element, theme);
    let stroke = base.stroke;
    let fill = base.fill;
    let color = base.text;
    let shape: string | undefined;
    let shapeSource: 'none' | 'theme' | 'explicit' = 'none';
    let unknownShape: string | undefined;
    let icon: string | undefined = element.type === 'Person' ? 'person' : undefined;
    // True once a tag style or the element sets the icon (not the implicit person icon).
    let iconExplicit = false;
    let border: StyleBorder = 'solid';
    let strokeWidth: number | undefined;
    let legend: string | undefined;
    const contributing: string[] = [];

    // Layer 1: external accent for the element's declaration slot.
    const accents = theme.externalAccents || [];
    const slots = styles && styles.accentSlots;
    const slot = element.id !== undefined && slots && Object.prototype.hasOwnProperty.call(slots, element.id)
        ? slots[element.id]
        : undefined;
    // True once an accent or a tag style sets the stroke: a brand tint (#326) never replaces it.
    let strokeLayered = false;
    if (accents.length > 0 && typeof slot === 'number' && slot >= 0 && isExternalStyleElement(element)) {
        const accent = accents[Math.floor(slot) % accents.length];
        stroke = accent.stroke;
        color = accent.text !== undefined ? accent.text : accent.stroke;
        strokeLayered = true;
    }

    const tags = orderedStyleTags(element);
    const isKnownSprite = options ? options.isKnownSprite : undefined;
    const applyRules = (
        rules: ReadonlyArray<Pick<C4ElementStyleRule, 'tag' | 'properties'>>,
        source: 'theme' | 'explicit',
    ): void => {
        const merged = mergeStyleRules(rules);
        for (const tag of tags) {
            const properties = merged[tag.toLowerCase()];
            if (!properties) { continue; }
            let contributed = false;
            for (const property of properties) {
                const value = parseStyleValue(property.key, property.value, isKnownSprite);
                if (value === undefined) {
                    // A shape outside the 19 names is still an explicit choice:
                    // it draws the theme rectangle (Decision 2), not the earlier layer's shape.
                    if (property.key === 'shape' && source === 'explicit') {
                        shape = undefined;
                        unknownShape = property.value;
                        shapeSource = 'explicit';
                        contributed = true;
                    }
                    continue;
                }
                contributed = true;
                switch (property.key) {
                    case 'stroke': stroke = String(value); strokeLayered = true; break;
                    case 'background': fill = String(value); break;
                    case 'color': color = String(value); break;
                    case 'shape': shape = String(value); shapeSource = source; unknownShape = undefined; break;
                    case 'sprite': icon = String(value); iconExplicit = true; break;
                    case 'border': border = value as StyleBorder; break;
                    case 'strokeWidth': strokeWidth = Number(value); break;
                    case 'legend': legend = String(value); break;
                }
            }
            if (contributed && contributing.indexOf(tag) < 0) {
                contributing.push(tag);
            }
        }
    };

    // Layer 1 (end): the theme's default tag styles.
    applyRules(theme.defaultTagStyles || [{ tag: 'Database', properties: [{ key: 'shape', value: 'Cylinder' }] }], 'theme');
    // Layer 2: the view's tag styles.
    applyRules(styles && styles.rules ? styles.rules : [], 'explicit');

    // Layer 3: element overrides. `$sprite` keeps today's meaning: any value
    // selects the icon layout, whether or not the sprite exists. An unknown
    // `$shape` draws the theme rectangle (Decision 2).
    if (element.shape !== undefined) {
        if (parseStyleValue('shape', element.shape) !== undefined) {
            shape = element.shape;
            unknownShape = undefined;
        } else {
            shape = undefined;
            unknownShape = element.shape;
        }
        shapeSource = 'explicit';
    }
    if (element.sprite) {
        icon = element.sprite;
        iconExplicit = true;
    }

    // Deployment notation (#326): a deployment node whose sprite keeps its own
    // colours takes the sprite's brand colour as its outline, a theme-layer
    // value that any accent or `$stroke` style replaces. Text keeps its colour.
    const brandColors = styles && styles.brandColors;
    if (element.type === 'DeploymentNode' && !strokeLayered && icon !== undefined && brandColors
        && theme.deploymentNotation && theme.deploymentNotation.brandTint
        && Object.prototype.hasOwnProperty.call(brandColors, icon)) {
        stroke = brandColors[icon];
    }

    // Drawing: an explicit shape replaces the icon-node layout; a theme
    // default shape never does, except that the person outline replaces the
    // implicit person icon (c4-model's `Person -> Person`). The person outline
    // is itself the person icon, so it draws no icon unless one is set
    // explicitly. A shape not drawn yet is the theme rectangle.
    const drawn = shape !== undefined && drawnShapeNames().indexOf(shape) >= 0;
    const undrawnShape = shape !== undefined && !drawn ? shape : undefined;
    const personOutline = drawn && shape === 'Person' && !iconExplicit;
    let outline: StyleOutline = 'rect';
    let iconLayout = false;
    if (shapeSource === 'explicit') {
        outline = outlineForShape(drawn ? shape : undefined);
        iconLayout = icon !== undefined && !personOutline;
    } else if (personOutline) {
        outline = 'person';
    } else if (icon) {
        iconLayout = true;
    } else if (drawn) {
        outline = outlineForShape(shape);
    }

    const resolved: {
        stroke: string; fill: string; color: string; shape?: string; shapeSource: 'none' | 'theme' | 'explicit';
        undrawnShape?: string; unknownShape?: string; icon?: string; border: StyleBorder; strokeWidth?: number; legend?: string;
        contributingTags: string[]; outline: StyleOutline; iconLayout: boolean;
    } = { stroke, fill, color, shapeSource, border, contributingTags: contributing, outline, iconLayout };
    if (shape !== undefined) { resolved.shape = shape; }
    if (undrawnShape !== undefined) { resolved.undrawnShape = undrawnShape; }
    if (unknownShape !== undefined) { resolved.unknownShape = unknownShape; }
    if (icon !== undefined) { resolved.icon = icon; }
    if (strokeWidth !== undefined) { resolved.strokeWidth = strokeWidth; }
    if (legend !== undefined) { resolved.legend = legend; }
    return resolved;
}

/**
 * Host-side sprite check against the bundled id list. Not embedded: the client
 * declares BUNDLED_SPRITE_IDS itself and calls spriteIdMatches.
 */
export function isBundledSpriteId(id: string): boolean {
    return spriteIdMatches(id, BUNDLED_SPRITE_IDS);
}

/** The SVG dash pattern for a border style, or undefined for solid. */
export function borderDashArray(border: StyleBorder): string | undefined {
    return border === 'dashed' ? '8,4' : border === 'dotted' ? '2,3' : undefined;
}

/**
 * Every function above, in dependency order, for the webview client to embed.
 * The client and host therefore run the same code (host/client parity).
 */
export const ELEMENT_STYLE_CLIENT_FUNCTIONS: ReadonlyArray<(...args: never[]) => unknown> = [
    styleShapeNames,
    drawnShapeNames,
    outlineForShape,
    spriteIdMatches,
    styleValueRules,
    parseStyleValue,
    isExternalStyleElement,
    styleTypeTag,
    orderedStyleTags,
    computeAccentSlots,
    themeElementColors,
    mergeStyleRules,
    resolveElementStyle,
    borderDashArray,
];
