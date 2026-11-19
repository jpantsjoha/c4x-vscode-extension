/**
 * Boundary (subgraph) rendering for C4 diagrams.
 *
 * Renders system/container boundaries as rounded rectangles styled by the
 * theme's boundary tokens (dashed in the legacy themes, solid in c4-model).
 * The label sits where `boundary.labelPosition` says: top left (every theme but
 * c4-model, byte-identical to before) or bottom left with a `[Software System]`
 * style type line under the name (#324).
 */

import { PositionedBoundary } from '../layout/DagreLayoutEngine';
import { C4Theme } from '../themes/Theme';
import { escapeXml } from './svg-utils';
import {
    BOUNDARY_TYPE_FONT_SIZE,
    boundaryBottomPadding,
    boundaryLabelMinWidth,
    boundaryLabelPlacement,
    boundaryTypeLineText,
} from './boundaryLabel';

/**
 * Render a C4 boundary as a rounded rectangle styled by `theme.boundary`.
 */
export function renderBoundary(boundary: PositionedBoundary, theme: C4Theme): string {
    const x = boundary.x;
    const y = boundary.y;
    const width = boundary.width;
    const height = boundary.height;
    const cornerRadius = 8; // Rounded corners for C4 boundaries

    // Colour, width, dash and opacity come from the theme's boundary tokens
    // (notation decision #320); label placement and the type line from
    // labelPosition and showType (#324).
    const style = theme.boundary;
    const borderColor = style.stroke;
    const labelColor = style.text;
    const dashAttr = style.dash === null ? '' : `
          stroke-dasharray="${style.dash}"`;
    const fontSize = 14;

    const bottomLeft = style.labelPosition === 'bottom-left';
    const typeLine = boundaryTypeLineText(theme, boundary.boundary.boundaryType);
    const place = boundaryLabelPlacement(style.labelPosition, typeLine !== undefined, x, y, width, height);

    // The editor re-places the label from these when a frame is dragged-resized
    // or re-wrapped. Absent for a top-left label, so those themes draw as before.
    const labelAttrs = bottomLeft
        ? ` data-label-position="bottom-left" data-label-reserve="${boundaryBottomPadding(theme, boundary.boundary.boundaryType)}" data-label-min-width="${boundaryLabelMinWidth(theme, boundary.boundary.label, boundary.boundary.boundaryType)}"`
        : '';

    const typeText = typeLine === undefined ? '' : `
    <text class="boundary-type" x="${place.typeX.toFixed(2)}" y="${place.typeY.toFixed(2)}"
          fill="${labelColor}"
          font-size="${BOUNDARY_TYPE_FONT_SIZE}"
          font-family="${theme.styles.fontFamily}">${escapeXml(typeLine)}</text>`;

    return `<g class="boundary" data-id="${escapeXml(boundary.id)}"${labelAttrs}>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}"
          rx="${cornerRadius}" ry="${cornerRadius}"
          fill="none"
          stroke="${borderColor}"
          stroke-width="${style.strokeWidth}"${dashAttr}
          opacity="${style.opacity}" />
    <text x="${place.nameX.toFixed(2)}" y="${place.nameY.toFixed(2)}"
          fill="${labelColor}"
          font-size="${fontSize}"
          font-family="${theme.styles.fontFamily}"
          font-weight="bold">${escapeXml(boundary.boundary.label)}</text>${typeText}
  </g>`;
}
