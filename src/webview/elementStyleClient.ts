/**
 * Element styles in the webview client (#322, notation decision #320).
 *
 * The client embeds the host's style resolver (`ELEMENT_STYLE_CLIENT_FUNCTIONS`
 * in src/render/elementStyle.ts) and the paint helper below, so a staged tag
 * edit recolours the canvas with exactly the colours the host draws after
 * Save. Only paint changes live: an outline whose drawing changes (a rectangle
 * becoming a cylinder) is redrawn by the save-triggered re-render. Dragging
 * moves the drawn shape as one group, and edges re-clip to it with the host's
 * shape geometry (src/render/shapeGeometry.ts, #323).
 *
 * Functions embedded into the client must be self-contained (see
 * previewClientScript.ts `embedForWebview`).
 */
import type { C4Element, C4View } from '../model/C4Model';
import type { C4Theme } from '../themes/Theme';
import type { ElementStyleTheme, ResolvedElementStyle } from '../render/elementStyle';
import { viewBrandColors } from '../render/deploymentNotation';

/** What the render payload carries for the client resolver. */
export interface ElementStyleClientInputs {
    readonly theme: ElementStyleTheme;
    /** The theme's border width, used when no style sets `strokeWidth`. */
    readonly borderWidth: number;
    readonly rules: ReadonlyArray<{ readonly tag: string; readonly properties: ReadonlyArray<{ readonly key: string; readonly value: string }> }>;
    /** Element ids in source declaration order (depth first), for accent slots. */
    readonly order: readonly string[];
    /** Element id -> `$shape` as written. */
    readonly shapes: Readonly<Record<string, string>>;
    /** Element id -> tags the builder injected this parse (`External`, `Database`); see StyleableElement.impliedTags. */
    readonly implied: Readonly<Record<string, readonly string[]>>;
    /**
     * Element id -> tags its macro requires (`External` for `_Ext`, `Database`
     * for `Db`), injected or authored. After Save the builder re-injects any of
     * these the saved `$tags` lack, so a staged tag list is completed with them.
     */
    readonly macro: Readonly<Record<string, readonly string[]>>;
    /**
     * Sprite id -> brand colour (#326), present only when the theme tints
     * deployment nodes, so a staged tag edit keeps a node's brand outline.
     */
    readonly brandColors?: Readonly<Record<string, string>>;
}

/** Build the payload field from the rendered view and theme. Host only. */
export function elementStyleClientInputs(view: Pick<C4View, 'elements' | 'elementStyles'>, theme: C4Theme): ElementStyleClientInputs {
    const order: string[] = [];
    const shapes: Record<string, string> = Object.create(null);
    const implied: Record<string, string[]> = Object.create(null);
    const macro: Record<string, string[]> = Object.create(null);
    const walk = (elements: readonly C4Element[]): void => {
        for (const element of elements) {
            order.push(element.id);
            if (element.shape !== undefined) { shapes[element.id] = element.shape; }
            if (element.impliedTags) { implied[element.id] = [...element.impliedTags]; }
            if (element.macroTags) { macro[element.id] = [...element.macroTags]; }
            if (element.children) { walk(element.children); }
        }
    };
    walk(view.elements);
    return {
        theme: {
            colors: {
                person: theme.colors.person,
                softwareSystem: theme.colors.softwareSystem,
                externalSystem: theme.colors.externalSystem,
                container: theme.colors.container,
                component: theme.colors.component,
                deploymentNode: theme.colors.deploymentNode,
                ...(theme.colors.externalPerson ? { externalPerson: theme.colors.externalPerson } : {}),
                ...(theme.colors.externalContainer ? { externalContainer: theme.colors.externalContainer } : {}),
                ...(theme.colors.externalComponent ? { externalComponent: theme.colors.externalComponent } : {}),
            },
            externalAccents: theme.externalAccents,
            ...(theme.defaultTagStyles ? { defaultTagStyles: theme.defaultTagStyles } : {}),
            ...(theme.deploymentNotation ? { deploymentNotation: { brandTint: theme.deploymentNotation.brandTint } } : {}),
        },
        borderWidth: theme.styles.borderWidth,
        rules: (view.elementStyles ?? []).map(rule => ({
            tag: rule.tag,
            properties: rule.properties.map(property => ({ key: property.key, value: property.value })),
        })),
        order,
        shapes,
        implied,
        macro,
        ...(theme.deploymentNotation?.brandTint
            ? { brandColors: viewBrandColors(theme, view.elements, view.elementStyles ?? []) }
            : {}),
    };
}

/** The node facts the client keeps per element (VisualLayoutNodeSnapshot subset). */
export interface DraftStyleSnapshot {
    readonly type: string;
    readonly tags?: readonly string[];
    readonly sprite?: string;
}

/**
 * The elements the client resolves for a repaint, in declaration order, with
 * the tags the draft would save (#322). A staged tag list becomes, after Save,
 * the element's `$tags`; the builder then re-injects, after them, each tag the
 * element's macro requires that the list lacks (exact spelling), and those take
 * the implied position. An unstaged element keeps its parsed tags and the tags
 * injected this parse. `overrides` forces parsed tags (used when reverting).
 * Embedded in the webview; exported for the parity test.
 */
export function draftStyleElements(
    inputs: Pick<ElementStyleClientInputs, 'order' | 'shapes' | 'implied' | 'macro'>,
    snapshotOf: (id: string) => DraftStyleSnapshot | undefined,
    stagedTagsOf: (id: string) => readonly string[] | undefined,
    overrides?: Readonly<Record<string, readonly string[]>>,
): Array<{ id: string; type: string; tags: string[]; sprite?: string; shape?: string; impliedTags: string[] }> {
    const own = (map: Readonly<Record<string, readonly string[]>>, id: string): string[] =>
        Object.prototype.hasOwnProperty.call(map, id) ? [...map[id]] : [];
    return inputs.order.map(id => {
        const snapshot = snapshotOf(id);
        const staged = stagedTagsOf(id);
        let tags: string[];
        let impliedTags: string[];
        if (overrides && Object.prototype.hasOwnProperty.call(overrides, id)) {
            tags = [...overrides[id]];
            impliedTags = own(inputs.implied, id);
        } else if (staged !== undefined) {
            impliedTags = own(inputs.macro, id).filter(tag => staged.indexOf(tag) < 0);
            tags = [...staged, ...impliedTags];
        } else {
            tags = snapshot && snapshot.tags ? [...snapshot.tags] : [];
            impliedTags = own(inputs.implied, id);
        }
        return {
            id,
            type: snapshot ? snapshot.type : '',
            tags,
            sprite: snapshot ? snapshot.sprite : undefined,
            shape: Object.prototype.hasOwnProperty.call(inputs.shapes, id) ? inputs.shapes[id] : undefined,
            impliedTags,
        };
    });
}

/** Minimal DOM surface `paintNodeWithStyle` needs, so it is testable without a browser. */
export interface PaintableElement {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
}
export interface PaintableNode {
    querySelectorAll(selector: string): ArrayLike<PaintableElement>;
}

/**
 * Apply a resolved style's paint to a rendered node `<g>`: outline fill,
 * stroke, width and dash; text colour; icon colour (unless the sprite keeps
 * its own colours). Mirrors the attributes ElementRenderer writes.
 */
export function paintNodeWithStyle(nodeEl: PaintableNode, style: ResolvedElementStyle, borderWidth: number): void {
    const dash = style.border === 'dashed' ? '8,4' : style.border === 'dotted' ? '2,3' : null;
    // A person's head is a top-level circle (#323); it is part of the outline.
    const outlines = nodeEl.querySelectorAll(':scope > rect, :scope > path, :scope > circle');
    for (let i = 0; i < outlines.length; i++) {
        const outline = outlines[i];
        // A cylinder's or bucket's lid is an unfilled arc over the body; it keeps fill="none".
        if (outline.getAttribute('fill') !== 'none') {
            outline.setAttribute('fill', style.fill);
        }
        outline.setAttribute('stroke', style.stroke);
        outline.setAttribute('stroke-width', String(style.strokeWidth !== undefined ? style.strokeWidth : borderWidth));
        if (dash) {
            outline.setAttribute('stroke-dasharray', dash);
        } else {
            outline.removeAttribute('stroke-dasharray');
        }
    }
    // Shape detail (#323): a web browser's title bar and dots, a terminal's prompt glyph.
    const details = nodeEl.querySelectorAll(':scope > .shape-detail > *');
    for (let i = 0; i < details.length; i++) {
        const paint = details[i].getAttribute('data-paint');
        if (paint === 'stroke') {
            details[i].setAttribute('fill', style.stroke);
        } else if (paint === 'fill') {
            details[i].setAttribute('fill', style.fill);
        } else if (paint === 'line') {
            details[i].setAttribute('stroke', style.stroke);
        }
    }
    const texts = nodeEl.querySelectorAll(':scope > text');
    for (let i = 0; i < texts.length; i++) {
        texts[i].setAttribute('fill', style.color);
    }
    const icons = nodeEl.querySelectorAll(':scope > .element-icon > g');
    for (let i = 0; i < icons.length; i++) {
        if (icons[i].getAttribute('fill') !== null) {
            icons[i].setAttribute('fill', style.stroke);
        }
    }
}

/**
 * Render-payload validator for the optional `elementStyleInputs` field.
 * Undefined is accepted so older hosts keep rendering. It checks shape and
 * types only, never counts or lengths: the model accepts any number of rules,
 * keys and elements and any `$shape` text (reporting bad input as a
 * diagnostic), so every payload a valid model produces must pass, or the
 * webview would show an error where the host drew a diagram. Exported for tests.
 */
export function isValidElementStyleInputs(value: unknown): boolean {
    if (value === undefined) { return true; }
    const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    if (!isObject(value) || !isObject(value.theme) || !isObject(value.theme.colors) || !isObject(value.shapes) || !isObject(value.implied) || !isObject(value.macro)) { return false; }
    if (typeof value.borderWidth !== 'number' || !Number.isFinite(value.borderWidth)) { return false; }
    const colors = value.theme.colors;
    const triple = (v: unknown): boolean => isObject(v) && typeof v.fill === 'string' && typeof v.stroke === 'string' && typeof v.text === 'string';
    if (!['person', 'softwareSystem', 'externalSystem', 'container', 'component', 'deploymentNode'].every(key => triple(colors[key]))) { return false; }
    if (value.theme.externalAccents !== undefined && !(Array.isArray(value.theme.externalAccents)
        && value.theme.externalAccents.every(accent => isObject(accent) && typeof accent.stroke === 'string'))) { return false; }
    const isRuleList = (v: unknown): boolean => Array.isArray(v) && v.every(rule => isObject(rule)
        && typeof rule.tag === 'string' && Array.isArray(rule.properties)
        && rule.properties.every(p => isObject(p) && typeof p.key === 'string' && typeof p.value === 'string'));
    if (value.theme.defaultTagStyles !== undefined && !isRuleList(value.theme.defaultTagStyles)) { return false; }
    if (value.theme.deploymentNotation !== undefined && !(isObject(value.theme.deploymentNotation) && typeof value.theme.deploymentNotation.brandTint === 'boolean')) { return false; }
    if (value.brandColors !== undefined && !(isObject(value.brandColors) && Object.values(value.brandColors).every(colour => typeof colour === 'string'))) { return false; }
    if (!isRuleList(value.rules)) { return false; }
    if (!Array.isArray(value.order) || !value.order.every(id => typeof id === 'string')) { return false; }
    const isTagMap = (map: Record<string, unknown>): boolean => Object.values(map).every(tags => Array.isArray(tags) && tags.every(tag => typeof tag === 'string'));
    if (!isTagMap(value.implied) || !isTagMap(value.macro)) { return false; }
    return Object.values(value.shapes).every(shape => typeof shape === 'string');
}
