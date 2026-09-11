/**
 * Boundary (subgraph) rendering for C4 diagrams.
 *
 * Renders system/container boundaries as dashed rounded rectangles
 * following C4 model standards.
 */

import { PositionedBoundary } from '../layout/DagreLayoutEngine';
import { C4Theme } from '../themes/Theme';
import { escapeXml } from './svg-utils';

/**
 * Render a C4 boundary as a rounded rectangle with dashed border.
 */
export function renderBoundary(boundary: PositionedBoundary, theme: C4Theme): string {
    const x = boundary.x;
    const y = boundary.y;
    const width = boundary.width;
    const height = boundary.height;
    const cornerRadius = 8; // Rounded corners for C4 boundaries

    // C4 boundary styling: dashed border, transparent fill, label at top-left
    const borderColor = theme.colors.relationship.stroke;
    const labelColor = theme.colors.relationship.text;
    const fontSize = 14;

    // Label positioned at top-left of boundary (C4 model convention)
    const labelX = x + 10;
    const labelY = y + fontSize + 6; // Below the top edge with small padding

    return `<g class="boundary" data-id="${boundary.id}">
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}"
          rx="${cornerRadius}" ry="${cornerRadius}"
          fill="none"
          stroke="${borderColor}"
          stroke-width="2"
          stroke-dasharray="8,4"
          opacity="0.7" />
    <text x="${labelX.toFixed(2)}" y="${labelY.toFixed(2)}"
          fill="${labelColor}"
          font-size="${fontSize}"
          font-family="${theme.styles.fontFamily}"
          font-weight="bold">${escapeXml(boundary.boundary.label)}</text>
  </g>`;
}
