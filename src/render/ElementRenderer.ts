/**
 * Element (node) rendering for C4 diagrams.
 *
 * Handles boxes, persons/icons, and text structure following the C4-PlantUML style.
 */

import { PositionedElement } from '../layout/DagreLayoutEngine';
import { C4Theme } from '../themes/Theme';
import { getSprite } from '../assets/icons';
import { escapeXml } from './svg-utils';
import { LabelCollisionTracker } from './LabelRenderer';
import { elementTextMarkup, layoutElementText, TEXT_METRICS } from './textLayout';
import {
    DEPLOYMENT_ICON_SIZE,
    deploymentIconSlot,
    deploymentLabelInkBox,
    deploymentLabelLineCount,
    deploymentLabelText,
    deploymentLeafLineCapacity,
    deploymentRowIconOrigin,
    deploymentTypeLabel,
    infrastructureIconOrigin,
    infrastructureTextBox,
    isInfrastructureNode,
    usesDeploymentNotation,
} from './deploymentNotation';
import { shapeOutlineSvg, shapeTextBox, type ShapePaint } from './shapeGeometry';
import {
    borderDashArray,
    isBundledSpriteId,
    resolveElementStyle,
    themeElementColors,
    type ElementStyleContext,
    type StyleOutline,
} from './elementStyle';

// ── Colour helpers ───────────────────────────────────────────────────
// Theme-layer colours only (no tag styles, no accents). Kept for callers that
// want the type/external colour; rendering goes through resolveElementStyle.

export function getFillColor(node: PositionedElement, theme: C4Theme): string {
    return themeElementColors(node.element, theme).fill;
}

export function getStrokeColor(node: PositionedElement, theme: C4Theme): string {
    return themeElementColors(node.element, theme).stroke;
}

export function getTextColor(node: PositionedElement, theme: C4Theme): string {
    return themeElementColors(node.element, theme).text;
}

/** Host sprite check for tag-style `$sprite` values: a bundled icon must exist. */
export function isBundledSprite(id: string): boolean {
    return isBundledSpriteId(id);
}

// ── Rendering ────────────────────────────────────────────────────────

/** Outline drawing inputs shared by the plain and icon renders. */
interface OutlinePaint extends ShapePaint {
    readonly outline: StyleOutline;
}

function renderOutline(x: number, y: number, width: number, height: number, paint: OutlinePaint, theme: C4Theme): string {
    return shapeOutlineSvg(paint.outline, x, y, width, height, theme.styles.borderRadius, paint);
}

/**
 * ` data-shape="…"` for the outlines #323 added, so the webview client clips
 * edges to them. Absent for the rectangle, box, rounded box and cylinder,
 * whose side midpoints are on the outline (and whose markup predates #323).
 */
function shapeDataAttr(outline: StyleOutline): string {
    return isNamedShapeOutline(outline) ? ` data-shape="${escapeXml(outline)}"` : '';
}

/** The outlines #323 added; their text is wrapped to the text box. */
function isNamedShapeOutline(outline: StyleOutline): boolean {
    return outline === 'person' || outline === 'bucket' || outline === 'folder' || outline === 'webBrowser' || outline === 'terminal';
}

/**
 * Render a single C4 element node as SVG markup. `styles` carries the view's
 * `elementStyle` rules and external accent slots; without it only the theme
 * layer applies.
 */
export function renderNode(
    node: PositionedElement,
    theme: C4Theme,
    labelTracker: LabelCollisionTracker,
    styles?: ElementStyleContext
): string {
    const style = resolveElementStyle(node.element, theme, styles, { isKnownSprite: isBundledSprite });
    const dash = borderDashArray(style.border);
    const paint: OutlinePaint = {
        outline: style.outline,
        fill: style.fill,
        stroke: style.stroke,
        strokeWidth: style.strokeWidth ?? theme.styles.borderWidth,
        dashAttr: dash ? ` stroke-dasharray="${dash}"` : '',
    };
    const textColor = style.color;

    // Add null checks for layout coordinates
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 200;
    const height = node.height ?? 100;

    // Register element position to avoid label overlaps. A nested deployment
    // node in the notation (#326) registers only its label row: relationship
    // labels between its children belong inside it.
    const notation = usesDeploymentNotation(theme, node.element, paint.outline);
    if (notation && (node.element.children?.length ?? 0) > 0) {
        const ink = deploymentLabelInkBox(theme, { x, y, width, height }, deploymentLabelText(node.element, theme), deploymentIconSlot(style.icon));
        labelTracker.registerPosition(ink.x + ink.width / 2, ink.y + ink.height / 2, ink.width, ink.height);
        // Its outline too, as four 6 px strips, so no label is printed across it.
        labelTracker.registerPosition(x + width / 2, y, width, 6);
        labelTracker.registerPosition(x + width / 2, y + height, width, 6);
        labelTracker.registerPosition(x, y + height / 2, 6, height);
        labelTracker.registerPosition(x + width, y + height / 2, 6, height);
    } else {
        labelTracker.registerPosition(x + width / 2, y + height / 2, width, height);
    }

    const filter = theme.styles.shadowEnabled ? 'filter="url(#drop-shadow)"' : '';

    // Deployment notation (#326): icon bottom left beside the label row, or
    // centred under an infrastructure node's text.
    if (notation) {
        return renderDeploymentNode(node, x, y, width, height, paint, textColor, theme, filter, style.icon);
    }

    // A Person, an element with a sprite, or an explicit shape with an icon:
    // icon top centre, text below (the icon-node layout).
    if (style.iconLayout && style.icon) {
        return renderIconNode(node, x, y, width, height, paint, textColor, theme, filter, style.icon, elementTextShape(style).cylinder);
    }

    const isLocked = node.element.metadata?.locked === 'true';
    const lockedClass = isLocked ? ' locked' : '';
    const lockedAttr = isLocked ? ' data-locked="true"' : '';
    const shapeClass = paint.outline === 'cylinder' ? ' database' : '';

    // C4-PlantUML style element text, wrapped to the shape's text area (#340, #323)
    const textContent = renderElementText(node, x, y, width, height, elementTextShape(style), textColor, theme);

    return `<g class="node${shapeClass}${lockedClass}" data-id="${escapeXml(node.id)}"${lockedAttr}${shapeDataAttr(paint.outline)}${typeLabelAttr(node, theme)} ${filter}>
    ${renderOutline(x, y, width, height, paint, theme)}
${textContent}
  </g>`;
}

// ── Icon / sprite node ───────────────────────────────────────────────

function renderIconNode(
    node: PositionedElement,
    x: number,
    y: number,
    width: number,
    height: number,
    paint: OutlinePaint,
    textColor: string,
    theme: C4Theme,
    filter: string,
    spriteName: string,
    cylinder: boolean
): string {
    const stroke = paint.stroke;
    // Icon dimensions
    const iconSize = 40;  // Size of the icon area

    // The icon sits at the top centre of a named shape's text box (the whole
    // element for the theme rectangle, box and cylinder, as before #323), the text below it.
    const box = isNamedShapeOutline(paint.outline) ? shapeTextBox(paint.outline, x, y, width, height) : { x, y, width, height };
    const iconCenterX = box.x + box.width / 2;
    const iconY = box.y + 10; // 10px padding from top

    // Text below the icon (layoutElementText reserves the icon and its gap)
    const textContent = renderElementText(node, x, y, width, height, { iconLayout: true, cylinder, outline: paint.outline }, textColor, theme);

    const iconSvg = spriteMarkup(spriteName, iconCenterX, iconY, iconSize, stroke);

    const isLocked = node.element.metadata?.locked === 'true';
    const lockedClass = isLocked ? ' locked' : '';
    const lockedAttr = isLocked ? ' data-locked="true"' : '';

    return `<g class="node person${lockedClass}" data-id="${escapeXml(node.id)}"${lockedAttr}${shapeDataAttr(paint.outline)}${typeLabelAttr(node, theme)} ${filter}>
    ${renderOutline(x, y, width, height, paint, theme)}
    <g class="element-icon">
      ${iconSvg}
    </g>
${textContent}
  </g>`;
}

/**
 * A sprite scaled to `size` px wide, its top centre at (centerX, top): the
 * markup every icon has had. A sprite that keeps its own colours gets no
 * fill; any other is filled with `stroke`. Empty when the sprite is unknown.
 */
function spriteMarkup(spriteName: string, centerX: number, top: number, size: number, stroke: string): string {
    const spriteDef = getSprite(spriteName);
    if (!spriteDef) {
        return '';
    }
    let body: string;
    let viewBox = '0 0 100 100';
    let preserveColor = false;

    if (typeof spriteDef === 'string') {
        body = spriteDef;
    } else {
        body = spriteDef.body;
        viewBox = spriteDef.viewBox || '0 0 100 100';
        preserveColor = spriteDef.preserveColor || false;
    }

    // Parse viewBox to calculate scale
    const parts = viewBox.split(' ').map(Number);
    const vbWidth = parts.length === 4 ? parts[2] : 100;
    const scale = size / vbWidth;

    const translateX = centerX - (vbWidth * scale) / 2;
    const translateY = top;

    // Apply fill color only if not preserving original colors
    const fillAttr = preserveColor ? '' : `fill="${stroke}"`;

    return `<g transform="translate(${translateX.toFixed(2)}, ${translateY.toFixed(2)}) scale(${scale.toFixed(4)})" ${fillAttr} stroke="none">${body}</g>`;
}

// ── Deployment notation (#326) ───────────────────────────────────────

/**
 * A deployment node in the notation. A deployment node prints its name,
 * `[Deployment Node: technology]` and description at the bottom left, its
 * icon (32 px) beside them; an infrastructure node prints its text centred
 * with its icon centred under it. The node group carries what the webview
 * needs to redraw the text on a live edit exactly as here: `data-label-row`
 * and `data-icon-slot`, or `data-icon-below`.
 */
function renderDeploymentNode(
    node: PositionedElement,
    x: number,
    y: number,
    width: number,
    height: number,
    paint: OutlinePaint,
    textColor: string,
    theme: C4Theme,
    filter: string,
    icon: string | undefined,
): string {
    const fontFamily = theme.styles.fontFamily;
    const infrastructure = isInfrastructureNode(node.element);
    const iconSlot = infrastructure ? 0 : deploymentIconSlot(icon);
    // The lines the row may use: a nested node's reserve holds the lines laid out
    // at its width; a leaf holds as many as fit with 8 px above them.
    const maxLines = (node.element.children?.length ?? 0) > 0
        ? deploymentLabelLineCount(theme, deploymentLabelText(node.element, theme), iconSlot, width)
        : deploymentLeafLineCapacity(height);
    const layout = layoutElementText({
        x, y, width, height,
        textBox: infrastructure ? infrastructureTextBox(x, y, width, height) : undefined,
        iconLayout: false,
        cylinder: false,
        fontFamily,
        label: node.element.label,
        technology: node.element.technology,
        typeLabel: typeLabelFor(node, theme),
        description: node.element.description,
        ...(infrastructure ? {} : { labelRow: { iconSlot, maxLines } }),
    }, TEXT_METRICS);
    const textContent = '    ' + elementTextMarkup(layout, textColor, fontFamily);

    let iconSvg = '';
    if (icon) {
        const origin = infrastructure ? infrastructureIconOrigin(x, y, width, height) : deploymentRowIconOrigin(x, y, height);
        iconSvg = spriteMarkup(icon, origin.x + DEPLOYMENT_ICON_SIZE / 2, origin.y, DEPLOYMENT_ICON_SIZE, paint.stroke);
    }
    const iconGroup = iconSvg ? `
    <g class="element-icon" data-icon-placement="${infrastructure ? 'below' : 'label-row'}">
      ${iconSvg}
    </g>` : '';

    const isLocked = node.element.metadata?.locked === 'true';
    const lockedClass = isLocked ? ' locked' : '';
    const lockedAttr = isLocked ? ' data-locked="true"' : '';
    const kindClass = infrastructure ? ' infrastructure-node' : ' deployment-node';
    const placement = infrastructure ? ' data-icon-below="true"' : ` data-label-row="bottom-left" data-icon-slot="${iconSlot}" data-label-lines="${maxLines}"`;

    return `<g class="node${kindClass}${lockedClass}" data-id="${escapeXml(node.id)}"${lockedAttr}${placement}${typeLabelAttr(node, theme)} ${filter}>
    ${renderOutline(x, y, width, height, paint, theme)}${iconGroup}
${textContent}
  </g>`;
}

// ── Text structures ──────────────────────────────────────────────────

/** Which text area an element's style gives it: below an icon, inside a cylinder, or the box. */
export function elementTextShape(style: { iconLayout: boolean; icon?: string; outline: StyleOutline }): { iconLayout: boolean; cylinder: boolean; outline: StyleOutline } {
    return { iconLayout: !!(style.iconLayout && style.icon), cylinder: style.outline === 'cylinder', outline: style.outline };
}

/** The type name for the type line, or undefined when the theme keeps today's look (#348). */
function typeLabelFor(node: PositionedElement, theme: C4Theme): string | undefined {
    return theme.showElementType ? deploymentTypeLabel(node.element) : undefined;
}

/** `data-type-label` on a node group, so the webview redraws the type line on live edits. */
function typeLabelAttr(node: PositionedElement, theme: C4Theme): string {
    return typeLabelAttribute(typeLabelFor(node, theme));
}

/**
 * The ` data-type-label="…"` attribute for a type name, escaped like every
 * attribute value (#362), or nothing when there is no type line. Exported so
 * the escaping can be tested with any string, not only today's five names.
 */
export function typeLabelAttribute(label: string | undefined): string {
    return label ? ` data-type-label="${escapeXml(label)}"` : '';
}

/**
 * C4-PlantUML style element text: bold title, `[technology]` in italics, then
 * the description, centred in the shape's text area. Text that fits on one line
 * is drawn exactly as before #340; text that does not is wrapped into `<tspan>`
 * lines by layoutElementText (the webview runs the same functions on live edits).
 */
function renderElementText(
    node: PositionedElement,
    x: number,
    y: number,
    width: number,
    height: number,
    shape: { iconLayout: boolean; cylinder: boolean; outline: StyleOutline },
    textColor: string,
    theme: C4Theme
): string {
    const fontFamily = theme.styles.fontFamily;
    // A named shape's text area is its inner box, not its bounding box (#323).
    const textBox = isNamedShapeOutline(shape.outline) ? shapeTextBox(shape.outline, x, y, width, height) : undefined;
    const layout = layoutElementText({
        x, y, width, height,
        textBox,
        iconLayout: shape.iconLayout,
        cylinder: shape.cylinder,
        fontFamily,
        label: node.element.label,
        technology: node.element.technology,
        typeLabel: typeLabelFor(node, theme),
        description: node.element.description,
    }, TEXT_METRICS);
    return elementTextMarkup(layout, textColor, fontFamily);
}
