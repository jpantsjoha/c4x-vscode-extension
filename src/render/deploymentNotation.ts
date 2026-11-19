/**
 * Deployment notation geometry (#326), as in the c4model.com deployment
 * examples, for themes that set `deploymentNotation` (c4-model):
 *
 *   - a deployment node draws its name, `[Deployment Node: technology]` and
 *     description at the bottom left, its icon (32 px) beside them; a node
 *     that holds other nodes reserves that label row under its children;
 *   - an infrastructure node draws its text centred, its icon centred under it;
 *   - a node whose sprite keeps its own colours (`preserveColor`) can be
 *     outlined in the sprite's brand colour (resolved in elementStyle.ts).
 *
 * The label-row text itself is laid out by `layoutElementText` (textLayout.ts,
 * `labelRow` input) so the webview redraws it on a live edit exactly as the
 * host draws it. `infrastructureTextBox` is embedded verbatim in the webview
 * (DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS), so it is self-contained.
 *
 * Widths come from the measured text tables (textLayout.ts), never from
 * character counts.
 */
import type { C4Element } from '../model/C4Model';
import type { C4Theme } from '../themes/Theme';
import { getSprite } from '../assets/icons';
import { layoutElementText, measureTextPx, textMetricVariant, TEXT_METRICS, elementTypeLabel } from './textLayout';
import type { StyleOutline } from './elementStyle';

/** Icon edge length in the label row and under an infrastructure node's text. */
export const DEPLOYMENT_ICON_SIZE = 32;
/** Horizontal room an icon takes in the label row: the icon and an 8 px gap. */
export const DEPLOYMENT_ICON_SLOT = DEPLOYMENT_ICON_SIZE + 8;
/** Gap between a node's left edge and its icon (or text), and the text's right gap. */
export const DEPLOYMENT_LABEL_MARGIN_X = 10;
/** The label row's last baseline sits this far above the node's bottom edge. */
export const DEPLOYMENT_LABEL_BOTTOM = 10;
/** Line step of the label row. */
export const DEPLOYMENT_LABEL_LINE = 16;
/** The label row's icon sits this far above the node's bottom edge. */
export const DEPLOYMENT_ICON_BOTTOM = 8;
/** Room under an infrastructure node's text: the icon, a 4 px gap above it and 10 px under it. */
export const INFRASTRUCTURE_ICON_BLOCK = DEPLOYMENT_ICON_SIZE + 14;
/** Gap between a nested node's lowest child and the top of its label row. */
export const DEPLOYMENT_LABEL_GAP = 16;
/** Bottom margin dagre leaves under a group's children (layoutRecursive marginy). */
export const DEPLOYMENT_GROUP_MARGIN = 40;
/** A nested node never grows wider than this to keep its label on one line; past it, the label wraps. */
export const DEPLOYMENT_LABEL_MAX_WIDTH = 480;

/** Outlines the notation draws over: the theme rectangle and the boxes. A named shape keeps its own text box. */
export function isDeploymentNotationOutline(outline: StyleOutline): boolean {
    return outline === 'rect' || outline === 'box' || outline === 'roundedBox';
}

/** True when the theme draws deployment nodes in the notation and this element is one. */
export function usesDeploymentNotation(theme: Pick<C4Theme, 'deploymentNotation'>, element: Pick<C4Element, 'type'>, outline: StyleOutline): boolean {
    return !!theme.deploymentNotation && element.type === 'DeploymentNode' && isDeploymentNotationOutline(outline);
}

/** An infrastructure node: icon centred under its text. */
export function isInfrastructureNode(element: Pick<C4Element, 'nodeKind'>): boolean {
    return element.nodeKind === 'infrastructure';
}

/** The type line name: `Infrastructure Node` for an infrastructure node, else the type's name. */
export function deploymentTypeLabel(element: Pick<C4Element, 'type' | 'nodeKind'>): string | undefined {
    return isInfrastructureNode(element) ? 'Infrastructure Node' : elementTypeLabel(element.type);
}

/** Horizontal room the label row gives its icon: the slot when the sprite resolves, else 0. */
export function deploymentIconSlot(icon: string | undefined): number {
    return icon && getSprite(icon) ? DEPLOYMENT_ICON_SLOT : 0;
}

/** The label row icon's top-left corner for a node at (x, y, width, height). */
export function deploymentRowIconOrigin(x: number, y: number, height: number): { x: number; y: number } {
    return { x: x + DEPLOYMENT_LABEL_MARGIN_X, y: y + height - DEPLOYMENT_ICON_BOTTOM - DEPLOYMENT_ICON_SIZE };
}

/** An infrastructure node's icon top-left corner: centred, 10 px above the bottom edge. */
export function infrastructureIconOrigin(x: number, y: number, width: number, height: number): { x: number; y: number } {
    return { x: x + width / 2 - DEPLOYMENT_ICON_SIZE / 2, y: y + height - 10 - DEPLOYMENT_ICON_SIZE };
}

/**
 * The text area of an infrastructure node: the box less the icon block under
 * it. Self-contained: embedded verbatim in the webview.
 */
export function infrastructureTextBox(x: number, y: number, width: number, height: number): { x: number; y: number; width: number; height: number } {
    return { x, y, width, height: height - 46 };
}

/** What the label row prints for an element. */
export interface DeploymentLabelText {
    readonly label: string;
    readonly technology?: string;
    readonly typeLabel?: string;
    readonly description?: string;
}

/**
 * Narrowest node that keeps every label-row field on one line, with the icon
 * slot and side margins, capped at DEPLOYMENT_LABEL_MAX_WIDTH (past it the
 * field wraps). Measured with the label-row fonts: name bold 14 px, type line
 * and description 12 px.
 */
export function deploymentLabelMinWidth(theme: C4Theme, text: DeploymentLabelText, iconSlot: number): number {
    const fontFamily = theme.styles.fontFamily;
    const lines: Array<[string, number, boolean]> = [[text.label, 14, true]];
    const typeLine = text.typeLabel
        ? (text.technology ? text.typeLabel + ': ' + text.technology : text.typeLabel)
        : text.technology;
    if (typeLine) { lines.push(['[' + typeLine + ']', 12, false]); }
    if (text.description) { lines.push([text.description, 12, false]); }
    let widest = 0;
    for (const [line, size, bold] of lines) {
        widest = Math.max(widest, measureTextPx(line, size, textMetricVariant(fontFamily, bold, false), TEXT_METRICS));
    }
    // 3 % over the measured width, as layoutElementText wraps, so a node this wide never wraps.
    const needed = Math.ceil(widest * 1.03) + 2 * DEPLOYMENT_LABEL_MARGIN_X + iconSlot + 1;
    return Math.min(needed, DEPLOYMENT_LABEL_MAX_WIDTH);
}

/** How many lines the label row draws for a node of this width. */
export function deploymentLabelLineCount(theme: C4Theme, text: DeploymentLabelText, iconSlot: number, width: number): number {
    const layout = layoutElementText({
        x: 0, y: 0, width, height: 1000,
        iconLayout: false,
        cylinder: false,
        fontFamily: theme.styles.fontFamily,
        label: text.label,
        technology: text.technology,
        typeLabel: text.typeLabel,
        description: text.description,
        labelRow: { iconSlot },
    }, TEXT_METRICS);
    return layout.blocks.reduce((sum, block) => sum + block.lines.length, 0);
}

/** Label-row lines a leaf node of this height holds with 8 px above them (at least one). */
export function deploymentLeafLineCapacity(height: number): number {
    return Math.max(1, Math.floor((height - 8 - DEPLOYMENT_LABEL_BOTTOM - 13) / DEPLOYMENT_LABEL_LINE) + 1);
}

/** Height of the drawn label row (its first line's cap top to the bottom edge), or the icon's, whichever is taller. */
export function deploymentLabelRowHeight(lines: number, iconSlot: number): number {
    const text = DEPLOYMENT_LABEL_BOTTOM + DEPLOYMENT_LABEL_LINE * Math.max(0, lines - 1) + 13;
    return Math.max(text, iconSlot > 0 ? DEPLOYMENT_ICON_BOTTOM + DEPLOYMENT_ICON_SIZE : 0);
}

/** Room a nested node reserves under its lowest child for its label row. */
export function deploymentLabelReserve(lines: number, iconSlot: number): number {
    return deploymentLabelRowHeight(lines, iconSlot) + DEPLOYMENT_LABEL_GAP;
}

/**
 * Drawn ink of a node's label row (text and icon), padded by 2 px, for edge
 * routing and relationship-label placement. Text widths are measured as drawn.
 */
export function deploymentLabelInkBox(
    theme: C4Theme,
    node: { x: number; y: number; width: number; height: number },
    text: DeploymentLabelText,
    iconSlot: number,
): { x: number; y: number; width: number; height: number } {
    const layout = layoutElementText({
        x: node.x, y: node.y, width: node.width, height: node.height,
        iconLayout: false,
        cylinder: false,
        fontFamily: theme.styles.fontFamily,
        label: text.label,
        technology: text.technology,
        typeLabel: text.typeLabel,
        description: text.description,
        labelRow: { iconSlot },
    }, TEXT_METRICS);
    const left = node.x + DEPLOYMENT_LABEL_MARGIN_X;
    let right = left + iconSlot;
    let lines = 0;
    for (const block of layout.blocks) {
        const variant = textMetricVariant(theme.styles.fontFamily, block.bold, block.italic);
        for (const line of block.lines) {
            right = Math.max(right, block.x + measureTextPx(line, block.fontSize, variant, TEXT_METRICS));
            lines++;
        }
    }
    const height = deploymentLabelRowHeight(lines, iconSlot);
    const bottom = node.y + node.height - DEPLOYMENT_ICON_BOTTOM + 4;
    const top = node.y + node.height - height;
    return { x: left - 2, y: top - 2, width: right - left + 4, height: bottom - top + 2 };
}

/** The label-row text of an element, with its type line name. */
export function deploymentLabelText(element: C4Element, theme: C4Theme): DeploymentLabelText {
    return {
        label: element.label,
        technology: element.technology,
        typeLabel: theme.showElementType ? deploymentTypeLabel(element) : undefined,
        description: element.description,
    };
}

/**
 * The brand colour of a sprite that keeps its own colours: the most used
 * saturated colour in its body (ties go to the first seen), or undefined for a
 * sprite drawn in the element's colour or one with no saturated colour. Grey,
 * white and black never count.
 */
export function spriteBrandColor(icon: string | undefined): string | undefined {
    if (!icon) { return undefined; }
    const sprite = getSprite(icon);
    if (!sprite || typeof sprite === 'string' || !sprite.preserveColor) { return undefined; }
    const counts = new Map<string, number>();
    const order: string[] = [];
    for (const match of sprite.body.matchAll(/(?:fill|stroke|stop-color)\s*[=:]\s*["']?#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)) {
        let hex = match[1].toUpperCase();
        if (hex.length === 3) { hex = hex.split('').map(c => c + c).join(''); }
        const r = parseInt(hex.slice(0, 2), 16);
        const g = parseInt(hex.slice(2, 4), 16);
        const b = parseInt(hex.slice(4, 6), 16);
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        // Saturation of the HSV model; under 0.25 reads as grey, white or black.
        if (max === 0 || (max - min) / max < 0.25 || max < 48) { continue; }
        const colour = '#' + hex;
        if (!counts.has(colour)) { order.push(colour); }
        counts.set(colour, (counts.get(colour) ?? 0) + 1);
    }
    let best: string | undefined;
    let bestCount = 0;
    for (const colour of order) {
        const count = counts.get(colour) ?? 0;
        if (count > bestCount) {
            best = colour;
            bestCount = count;
        }
    }
    return best;
}

/** WCAG relative luminance of a `#RRGGBB` or `#RGB` colour; undefined for any other form. */
export function relativeLuminance(colour: string): number | undefined {
    let hex = /^#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})$/.exec(colour.trim())?.[1];
    if (!hex) { return undefined; }
    if (hex.length === 3) { hex = hex.split('').map(c => c + c).join(''); }
    const channel = (i: number): number => {
        const v = parseInt(hex!.slice(i, i + 2), 16) / 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG contrast ratio of two colours; 1 when either is not a hex colour. */
export function contrastRatio(a: string, b: string): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    if (la === undefined || lb === undefined) { return 1; }
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG 2.1 non-text contrast (SC 1.4.11): an outline needs 3:1 against what it sits on. */
export const BRAND_TINT_MIN_CONTRAST = 3;

/**
 * True when a brand colour is legible as a node outline in this theme: at
 * least 3:1 against the canvas background and against every fill a deployment
 * node can have (internal and external). A darker or paler brand keeps the
 * neutral outline.
 */
export function brandTintIsLegible(theme: Pick<C4Theme, 'colors'>, colour: string): boolean {
    return [theme.colors.background, theme.colors.softwareSystem.fill, theme.colors.externalSystem.fill]
        .every(surface => contrastRatio(colour, surface) >= BRAND_TINT_MIN_CONTRAST);
}

/**
 * Sprite id -> brand colour for every sprite a view's elements or style rules
 * name that has one legible in the theme (`brandTintIsLegible`). Empty when the
 * theme does not tint.
 */
export function viewBrandColors(
    theme: Pick<C4Theme, 'deploymentNotation' | 'colors'>,
    elements: readonly C4Element[],
    rules: ReadonlyArray<{ readonly properties: ReadonlyArray<{ readonly key: string; readonly value: string }> }>,
): Record<string, string> {
    const colours: Record<string, string> = Object.create(null);
    if (!theme.deploymentNotation || !theme.deploymentNotation.brandTint) { return colours; }
    const add = (icon: string | undefined): void => {
        if (!icon || Object.prototype.hasOwnProperty.call(colours, icon)) { return; }
        const colour = spriteBrandColor(icon);
        if (colour && brandTintIsLegible(theme, colour)) { colours[icon] = colour; }
    };
    const walk = (list: readonly C4Element[]): void => {
        for (const element of list) {
            add(element.sprite);
            if (element.children) { walk(element.children); }
        }
    };
    walk(elements);
    for (const rule of rules) {
        for (const property of rule.properties) {
            if (property.key === 'sprite') { add(property.value); }
        }
    }
    return colours;
}

/** The functions the webview embeds verbatim. */
export const DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS: ReadonlyArray<(...args: never[]) => unknown> = [
    infrastructureTextBox,
];
