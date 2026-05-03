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

// ── Colour helpers ───────────────────────────────────────────────────

export function getFillColor(node: PositionedElement, theme: C4Theme): string {
    const isExternal = node.element.tags?.some(tag => tag.toLowerCase() === 'external');

    switch (node.element.type) {
        case 'Person':
            return isExternal ? (theme.colors.externalPerson?.fill ?? theme.colors.externalSystem.fill) : theme.colors.person.fill;
        case 'Container':
            return isExternal ? (theme.colors.externalContainer?.fill ?? theme.colors.externalSystem.fill) : theme.colors.container.fill;
        case 'Component':
            return isExternal ? (theme.colors.externalComponent?.fill ?? theme.colors.externalSystem.fill) : theme.colors.component.fill;
        case 'SoftwareSystem':
        default:
            return isExternal ? theme.colors.externalSystem.fill : theme.colors.softwareSystem.fill;
    }
}

export function getStrokeColor(node: PositionedElement, theme: C4Theme): string {
    const isExternal = node.element.tags?.some(tag => tag.toLowerCase() === 'external');

    switch (node.element.type) {
        case 'Person':
            return isExternal ? (theme.colors.externalPerson?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.person.stroke;
        case 'Container':
            return isExternal ? (theme.colors.externalContainer?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.container.stroke;
        case 'Component':
            return isExternal ? (theme.colors.externalComponent?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.component.stroke;
        case 'DeploymentNode':
            return theme.colors.deploymentNode.stroke;
        case 'SoftwareSystem':
        default:
            return isExternal ? theme.colors.externalSystem.stroke : theme.colors.softwareSystem.stroke;
    }
}

export function getTextColor(node: PositionedElement, theme: C4Theme): string {
    const isExternal = node.element.tags?.some(tag => tag.toLowerCase() === 'external');

    switch (node.element.type) {
        case 'Person':
            return isExternal ? (theme.colors.externalPerson?.text ?? theme.colors.externalSystem.text) : theme.colors.person.text;
        case 'Container':
            return isExternal ? (theme.colors.externalContainer?.text ?? theme.colors.externalSystem.text) : theme.colors.container.text;
        case 'Component':
            return isExternal ? (theme.colors.externalComponent?.text ?? theme.colors.externalSystem.text) : theme.colors.component.text;
        case 'DeploymentNode':
            return theme.colors.deploymentNode.text;
        case 'SoftwareSystem':
        default:
            return isExternal ? theme.colors.externalSystem.text : theme.colors.softwareSystem.text;
    }
}

// ── Shape helpers ────────────────────────────────────────────────────

/**
 * Check if an element should render as a database cylinder.
 * Matches elements with ContainerDb, ComponentDb, SystemDb origin (tagged "Database")
 * or with an explicit "Database" tag.
 */
function isDatabase(node: PositionedElement): boolean {
    return node.element.tags?.some(tag => tag.toLowerCase() === 'database') ?? false;
}

/**
 * Render a classic database cylinder shape (rectangle with elliptical top and bottom).
 */
function renderCylinder(
    x: number,
    y: number,
    width: number,
    height: number,
    fill: string,
    stroke: string,
    borderWidth: number
): string {
    const ellipseRy = 12; // Height of the elliptical cap

    // The body is the rectangle between the two ellipses
    const bodyTop = y + ellipseRy;
    const bodyBottom = y + height - ellipseRy;

    // Build the cylinder path:
    // 1. Bottom ellipse (visible lower half-arc)
    // 2. Left side going up
    // 3. Top ellipse (full visible ellipse — front arc + back arc)
    // 4. Right side going down
    const path = [
        // Start at top-left of body
        `M ${x.toFixed(2)} ${bodyTop.toFixed(2)}`,
        // Left side down to bottom
        `L ${x.toFixed(2)} ${bodyBottom.toFixed(2)}`,
        // Bottom ellipse (front arc, curving down)
        `A ${(width / 2).toFixed(2)} ${ellipseRy} 0 0 0 ${(x + width).toFixed(2)} ${bodyBottom.toFixed(2)}`,
        // Right side up to top
        `L ${(x + width).toFixed(2)} ${bodyTop.toFixed(2)}`,
        // Top ellipse back arc (curving down — the "back" of the lid)
        `A ${(width / 2).toFixed(2)} ${ellipseRy} 0 0 0 ${x.toFixed(2)} ${bodyTop.toFixed(2)}`,
        'Z',
    ].join(' ');

    // Top ellipse front arc (the visible lid highlight)
    const lidPath = [
        `M ${x.toFixed(2)} ${bodyTop.toFixed(2)}`,
        `A ${(width / 2).toFixed(2)} ${ellipseRy} 0 0 1 ${(x + width).toFixed(2)} ${bodyTop.toFixed(2)}`,
    ].join(' ');

    return [
        `<path d="${path}" fill="${fill}" stroke="${stroke}" stroke-width="${borderWidth}" />`,
        `<path d="${lidPath}" fill="none" stroke="${stroke}" stroke-width="${borderWidth}" />`,
    ].join('\n    ');
}

// ── Rendering ────────────────────────────────────────────────────────

/**
 * Render a single C4 element node as SVG markup.
 */
export function renderNode(
    node: PositionedElement,
    theme: C4Theme,
    labelTracker: LabelCollisionTracker
): string {
    const fill = getFillColor(node, theme);
    const stroke = getStrokeColor(node, theme);
    const textColor = getTextColor(node, theme);

    // Add null checks for layout coordinates
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const width = node.width ?? 200;
    const height = node.height ?? 100;

    // Register element position to avoid label overlaps
    labelTracker.registerPosition(x + width / 2, y + height / 2, width, height);

    const filter = theme.styles.shadowEnabled ? 'filter="url(#drop-shadow)"' : '';

    // Check if this is a Person element or has a custom sprite - render with icon
    const spriteName = node.element.sprite ?? (node.element.type === 'Person' ? 'person' : undefined);

    if (spriteName) {
        return renderIconNode(node, x, y, width, height, fill, stroke, textColor, theme, filter, spriteName);
    }

    // Check if this is a database element — render as cylinder
    if (isDatabase(node)) {
        const textContent = renderC4ElementStructure(node, x, y, width, height, textColor, theme);
        return `<g class="node database" data-id="${node.id}" ${filter}>
    ${renderCylinder(x, y, width, height, fill, stroke, theme.styles.borderWidth)}
${textContent}
  </g>`;
    }

    // Render C4-PlantUML style element structure for non-Person elements
    const textContent = renderC4ElementStructure(node, x, y, width, height, textColor, theme);

    return `<g class="node" data-id="${node.id}" ${filter}>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${theme.styles.borderRadius}" ry="${theme.styles.borderRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${theme.styles.borderWidth}" />
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
    fill: string,
    stroke: string,
    textColor: string,
    theme: C4Theme,
    filter: string,
    spriteName: string
): string {
    // Icon dimensions
    const iconSize = 40;  // Size of the icon area

    // Position the icon at the top center of the element
    const iconCenterX = x + width / 2;
    const iconY = y + 10; // 10px padding from top

    // Adjust text area to account for icon
    const textAreaY = y + iconSize + 10;
    const textAreaHeight = height - iconSize - 10;

    // Render text content in the adjusted area
    const textContent = renderC4ElementStructureForPerson(node, x, textAreaY, width, textAreaHeight, textColor, theme);

    // Get SVG path for sprite
    const spriteDef = getSprite(spriteName);

    let iconSvg = '';
    if (spriteDef) {
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
        const scale = iconSize / vbWidth;

        const translateX = iconCenterX - (vbWidth * scale) / 2;
        const translateY = iconY;

        // Apply fill color only if not preserving original colors
        const fillAttr = preserveColor ? '' : `fill="${stroke}"`;

        iconSvg = `<g transform="translate(${translateX.toFixed(2)}, ${translateY.toFixed(2)}) scale(${scale.toFixed(4)})" ${fillAttr} stroke="none">${body}</g>`;
    }

    return `<g class="node person" data-id="${node.id}" ${filter}>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${theme.styles.borderRadius}" ry="${theme.styles.borderRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${theme.styles.borderWidth}" />
    <g class="element-icon">
      ${iconSvg}
    </g>
${textContent}
  </g>`;
}

// ── Text structures ──────────────────────────────────────────────────

/**
 * Text structure for Person elements (accounts for icon space at top).
 */
function renderC4ElementStructureForPerson(
    node: PositionedElement,
    x: number,
    y: number,
    width: number,
    height: number,
    textColor: string,
    theme: C4Theme
): string {
    const title = node.element.label;
    const technology = node.element.technology;
    const description = node.element.description || '';

    const titleFontSize = 14;
    const techFontSize = 11;
    const descFontSize = 11;
    const lineHeight = 15;

    const totalLines = (title ? 1 : 0) + (technology ? 1 : 0) + (description ? 1 : 0);
    const totalHeight = totalLines * lineHeight;
    const startY = y + (height - totalHeight) / 2 + lineHeight - 2;

    let currentY = startY;
    const textElements: string[] = [];

    if (title) {
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${titleFontSize}" font-family="${theme.styles.fontFamily}" font-weight="bold">${escapeXml(title)}</text>`);
        currentY += lineHeight;
    }

    if (technology) {
        const techText = `[${technology}]`;
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${techFontSize}" font-family="${theme.styles.fontFamily}" font-style="italic">${escapeXml(techText)}</text>`);
        currentY += lineHeight;
    }

    if (description) {
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${descFontSize}" font-family="${theme.styles.fontFamily}">${escapeXml(description)}</text>`);
    }

    return textElements.join('\n    ');
}

/**
 * C4-PlantUML style element structure:
 *   == Title (Bold, 14pt)
 *   //[Technology]// (Italic, 12pt)
 *   Description (Normal, 12pt)
 */
function renderC4ElementStructure(
    node: PositionedElement,
    x: number,
    y: number,
    width: number,
    height: number,
    textColor: string,
    theme: C4Theme
): string {
    const title = node.element.label;
    const technology = node.element.technology;
    const description = node.element.description || '';

    // Font sizes following C4-PlantUML standards
    const titleFontSize = 14;  // Bold title
    const techFontSize = 12;   // Italic technology
    const descFontSize = 12;  // Normal description

    const lineHeight = 16; // Standard line height

    // Calculate starting Y position (centered)
    const totalLines = (title ? 1 : 0) + (technology ? 1 : 0) + (description ? 1 : 0);
    const totalHeight = totalLines * lineHeight;
    const startY = y + (height - totalHeight) / 2 + lineHeight;

    let currentY = startY;
    const textElements: string[] = [];

    // Title (Bold, 14pt) - Primary identifier
    if (title) {
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${titleFontSize}" font-family="${theme.styles.fontFamily}" font-weight="bold">${escapeXml(title)}</text>`);
        currentY += lineHeight;
    }

    // Technology (Italic, 12pt) - In brackets
    if (technology) {
        const techText = `[${technology}]`;
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${techFontSize}" font-family="${theme.styles.fontFamily}" font-style="italic">${escapeXml(techText)}</text>`);
        currentY += lineHeight;
    }

    // Description (Normal, 12pt) - Supporting information
    if (description) {
        textElements.push(`<text x="${(x + width / 2).toFixed(2)}" y="${currentY.toFixed(2)}" fill="${textColor}" text-anchor="middle" font-size="${descFontSize}" font-family="${theme.styles.fontFamily}">${escapeXml(description)}</text>`);
    }

    return textElements.join('\n    ');
}
