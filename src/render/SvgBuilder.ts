/**
 * SVG document orchestrator for C4 diagrams.
 *
 * Composes the final SVG by delegating to focused modules:
 *   - EdgeRouter     — connection-point geometry and path generation
 *   - LabelRenderer  — label collision detection and positioning
 *   - ElementRenderer — node/element rendering (boxes, persons, icons)
 *   - BoundaryRenderer — boundary/subgraph rendering
 */

import { PositionedElement, RoutedRelationship, LayoutResult, Point } from '../layout/DagreLayoutEngine';
import { C4Theme } from '../themes/Theme';
import { themeManager } from '../themes/ThemeManager';
import { escapeXml } from './svg-utils';
import { toPath, midpoint, calculateOptimalConnectionPoints } from './EdgeRouter';
import { LabelCollisionTracker } from './LabelRenderer';
import { renderNode } from './ElementRenderer';
import { renderBoundary } from './BoundaryRenderer';
import { C4ViewType } from '../parser';

interface SvgBuildOptions {
    theme?: C4Theme;
    /** View type for the diagram title (e.g. 'system-context', 'container'). */
    viewType?: C4ViewType;
    /** Workspace name for the diagram title. */
    workspaceName?: string;
}

function getEdgeDasharray(edge: RoutedRelationship): string | undefined {
    // C4 Model standard: Most relationships are dashed (following official C4 examples)
    switch (edge.relationship.relType) {
        case 'async':
            return '8,4';  // Dashed line for async relationships
        case 'sync':
            return undefined;  // Solid line for sync relationships
        case 'uses':
        default:
            return '8,4';  // Default to dashed (matches C4 model standard)
    }
}

export class SvgBuilder {
    private labelTracker = new LabelCollisionTracker();

    public build(layout: LayoutResult, options: SvgBuildOptions = {}): string {
        // Reset label positions for this diagram
        this.labelTracker.reset();

        const theme = options.theme ?? themeManager.getCurrentTheme();
        const elementCount = layout.elements.length;
        const isComplex = elementCount > 4;

        // Reserve space for title and legend
        const titleHeight = options.viewType ? 40 : 0;
        const legendHeight = 130;
        const totalWidth = layout.width;
        const totalHeight = layout.height + titleHeight + legendHeight;

        // Smart Sizing: Use 100% for complex diagrams to allow responsive scaling
        // Keep fixed pixel size for small diagrams to ensure tightness
        const svgWidth = isComplex ? '100%' : totalWidth;
        const svgHeight = isComplex ? '100%' : totalHeight;

        // Arrow markers: hollow/open arrow heads (official C4 model style)
        const defs = `
      <defs>
        <filter id="drop-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="3" result="blur"/>
          <feOffset in="blur" dx="3" dy="3" result="offsetBlur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        <marker id="c4x-arrow-uses" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,3.5 L0,7 z" fill="${theme.colors.relationship.stroke}" fill-opacity="1" />
        </marker>
        <marker id="c4x-arrow-async" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,3.5 L0,7 z" fill="${theme.colors.relationship.stroke}" fill-opacity="1" />
        </marker>
        <marker id="c4x-arrow-sync" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto" markerUnits="strokeWidth">
            <path d="M0,0 L10,3.5 L0,7 z" fill="${theme.colors.relationship.stroke}" fill-opacity="1" />
        </marker>
      </defs>`;

        const nodeSvg = layout.elements.map(node => renderNode(node, theme, this.labelTracker)).join('\n');

        // Create element lookup map for edge optimization
        const elementMap = new Map<string, PositionedElement>();
        layout.elements.forEach(el => elementMap.set(el.id, el));

        // Pass complexity flag to renderEdge
        const edgeSvg = layout.relationships.map(edge => this.renderEdge(edge, theme, elementMap)).join('\n');

        // Render boundaries if they exist
        const boundarySvg = layout.boundaries ?
            layout.boundaries.map(boundary => renderBoundary(boundary, theme)).join('\n') : '';

        // Render diagram title
        const titleSvg = this.renderTitle(options.viewType, options.workspaceName, totalWidth, theme);

        // Render legend
        const legendSvg = this.renderLegend(totalWidth, totalHeight, theme);

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" role="img">
  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${theme.colors.background}" />
  ${defs}
  ${titleSvg}
  <g class="diagram-content" transform="translate(0, ${titleHeight})">
    <g class="boundaries">
${boundarySvg}
    </g>
    <g class="edges">
${edgeSvg}
    </g>
    <g class="nodes">
${nodeSvg}
    </g>
  </g>
  ${legendSvg}
</svg>`;
    }

    /**
     * Format a C4ViewType into a human-readable title string.
     */
    private static formatViewType(viewType: C4ViewType): string {
        switch (viewType) {
            case 'system-context': return 'System Context';
            case 'container': return 'Container';
            case 'component': return 'Component';
            case 'deployment': return 'Deployment';
            case 'dynamic': return 'Dynamic';
            default: return String(viewType);
        }
    }

    /**
     * Render diagram title at the top of the SVG.
     */
    private renderTitle(
        viewType: C4ViewType | undefined,
        workspaceName: string | undefined,
        totalWidth: number,
        theme: C4Theme
    ): string {
        if (!viewType) {
            return '';
        }

        const formattedType = SvgBuilder.formatViewType(viewType);
        const titleText = workspaceName
            ? `${formattedType} \u2014 ${workspaceName}`
            : formattedType;

        const fontSize = 20;
        const titleX = totalWidth / 2;
        const titleY = 28; // Vertically centered in the 40px title area

        return `<text class="diagram-title" x="${titleX.toFixed(2)}" y="${titleY.toFixed(2)}" fill="${theme.colors.relationship.text}" text-anchor="middle" font-size="${fontSize}" font-family="${theme.styles.fontFamily}" font-weight="bold">${escapeXml(titleText)}</text>`;
    }

    /**
     * Render a compact C4 notation legend at the bottom-right of the SVG.
     */
    private renderLegend(totalWidth: number, totalHeight: number, theme: C4Theme): string {
        const legendWidth = 200;
        const legendHeight = 120;
        const padding = 10;
        const legendX = totalWidth - legendWidth - padding;
        const legendY = totalHeight - legendHeight - padding;
        const fontSize = 10;
        const lineHeight = 18;
        const swatchSize = 12;
        const textOffsetX = legendX + swatchSize + 8;

        let currentY = legendY + 20; // Start below the "Legend" header

        const items: string[] = [];

        // Legend border
        items.push(`<rect x="${legendX}" y="${legendY}" width="${legendWidth}" height="${legendHeight}" rx="4" ry="4" fill="${theme.colors.background}" stroke="${theme.colors.relationship.stroke}" stroke-width="1" opacity="0.9" />`);

        // Legend header
        items.push(`<text x="${(legendX + legendWidth / 2).toFixed(2)}" y="${(legendY + 14).toFixed(2)}" fill="${theme.colors.relationship.text}" text-anchor="middle" font-size="${fontSize + 1}" font-family="${theme.styles.fontFamily}" font-weight="bold">Legend</text>`);

        // Person icon (small person silhouette)
        items.push(`<circle cx="${(legendX + swatchSize / 2 + 2).toFixed(2)}" cy="${(currentY - 3).toFixed(2)}" r="3" fill="${theme.colors.person.fill}" />`);
        items.push(`<text x="${textOffsetX}" y="${currentY.toFixed(2)}" fill="${theme.colors.relationship.text}" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">Person</text>`);
        currentY += lineHeight;

        // Software System (blue box)
        items.push(`<rect x="${(legendX + 2).toFixed(2)}" y="${(currentY - swatchSize + 2).toFixed(2)}" width="${swatchSize}" height="${swatchSize}" rx="2" ry="2" fill="${theme.colors.softwareSystem.fill}" />`);
        items.push(`<text x="${textOffsetX}" y="${currentY.toFixed(2)}" fill="${theme.colors.relationship.text}" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">Software System</text>`);
        currentY += lineHeight;

        // External System (grey box)
        items.push(`<rect x="${(legendX + 2).toFixed(2)}" y="${(currentY - swatchSize + 2).toFixed(2)}" width="${swatchSize}" height="${swatchSize}" rx="2" ry="2" fill="${theme.colors.externalSystem.fill}" />`);
        items.push(`<text x="${textOffsetX}" y="${currentY.toFixed(2)}" fill="${theme.colors.relationship.text}" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">External System</text>`);
        currentY += lineHeight;

        // Boundary (dashed border)
        items.push(`<rect x="${(legendX + 2).toFixed(2)}" y="${(currentY - swatchSize + 2).toFixed(2)}" width="${swatchSize}" height="${swatchSize}" rx="2" ry="2" fill="none" stroke="${theme.colors.relationship.stroke}" stroke-width="1" stroke-dasharray="3,2" />`);
        items.push(`<text x="${textOffsetX}" y="${currentY.toFixed(2)}" fill="${theme.colors.relationship.text}" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">System Boundary</text>`);
        currentY += lineHeight;

        // Relationship arrow
        items.push(`<line x1="${(legendX + 2).toFixed(2)}" y1="${(currentY - 4).toFixed(2)}" x2="${(legendX + swatchSize + 2).toFixed(2)}" y2="${(currentY - 4).toFixed(2)}" stroke="${theme.colors.relationship.stroke}" stroke-width="1.5" stroke-dasharray="4,2" />`);
        items.push(`<text x="${textOffsetX}" y="${currentY.toFixed(2)}" fill="${theme.colors.relationship.text}" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">Relationship</text>`);

        return `<g class="legend">\n    ${items.join('\n    ')}\n  </g>`;
    }

    private renderEdge(edge: RoutedRelationship, theme: C4Theme, elementMap?: Map<string, PositionedElement>): string {
        const dasharray = getEdgeDasharray(edge);
        // Unique namespace for markers to prevent collisions in VS Code DOM
        const marker = edge.relationship.relType === 'async' ? 'c4x-arrow-async' : edge.relationship.relType === 'sync' ? 'c4x-arrow-sync' : 'c4x-arrow-uses';

        let path: string;
        let labelPoint: Point;

        // Use optimized routing if element information is available
        if (elementMap) {
            const fromElement = elementMap.get(edge.relationship.from);
            const toElement = elementMap.get(edge.relationship.to);

            if (fromElement && toElement) {
                // Use optimal edge routing for ALL diagrams to ensure arrows connect to edges
                // This prevents arrows from being hidden behind nodes (center-to-center issue)
                const connectionPoints = calculateOptimalConnectionPoints(
                    { x: fromElement.x, y: fromElement.y, width: fromElement.width, height: fromElement.height },
                    { x: toElement.x, y: toElement.y, width: toElement.width, height: toElement.height }
                );

                // Create direct path with optimal connection points
                path = `M${connectionPoints.from.x.toFixed(2)},${connectionPoints.from.y.toFixed(2)} L${connectionPoints.to.x.toFixed(2)},${connectionPoints.to.y.toFixed(2)}`;
                labelPoint = connectionPoints.mid;
            } else {
                // COMPLEX DIAGRAMS (or missing elements): Fallback to Dagre's routing
                // Dagre handles routing around nodes better, avoiding 'spiderwebs'
                if (edge.points && edge.points.length > 0) {
                    path = toPath(edge.points);
                    labelPoint = midpoint(edge.points);
                } else {
                    // Fallback if no points from Dagre (shouldn't happen usually)
                    // Just do center to center
                    if (fromElement && toElement) {
                        path = `M${(fromElement.x + fromElement.width / 2).toFixed(2)},${(fromElement.y + fromElement.height / 2).toFixed(2)} L${(toElement.x + toElement.width / 2).toFixed(2)},${(toElement.y + toElement.height / 2).toFixed(2)}`;
                        labelPoint = { x: (fromElement.x + fromElement.width / 2 + toElement.x + toElement.width / 2) / 2, y: (fromElement.y + fromElement.height / 2 + toElement.y + toElement.height / 2) / 2 };
                    } else {
                        path = "";
                        labelPoint = { x: 0, y: 0 };
                    }
                }
            }
        } else {
            // Fallback
            path = toPath(edge.points);
            labelPoint = midpoint(edge.points);
        }

        // Render relationship label with C4 model styling
        let labelElement = '';
        if (edge.relationship.label || edge.relationship.order) {
            // C4 model relationship labels: simple, clean, positioned along arrow
            // Prefix with sequence number for dynamic diagrams
            const prefix = edge.relationship.order ? `${edge.relationship.order}: ` : '';
            const labelText = prefix + (edge.relationship.label || '').trim();

            const fontSize = 12; // Standard C4 relationship label size
            const lineHeight = 14;

            // Estimate label dimensions for positioning
            const estimatedCharWidth = fontSize * 0.6;
            const labelWidth = labelText.length * estimatedCharWidth;
            const labelHeight = lineHeight;

            // Position label along the arrow path (C4 model standard)
            const adjustedPosition = this.labelTracker.findNonOverlappingPosition(
                labelPoint.x,
                labelPoint.y - 6, // Slight offset above the arrow
                labelWidth,
                labelHeight
            );

            // Register this label position
            this.labelTracker.registerPosition(adjustedPosition.x, adjustedPosition.y, labelWidth, labelHeight);

            // Create clean, single-line label (C4 model standard)
            // Use paint-order: stroke fill to create a halo effect for legibility over lines
            labelElement = `<text x="${adjustedPosition.x.toFixed(2)}" y="${adjustedPosition.y.toFixed(2)}" fill="${theme.colors.relationship.text}" stroke="${theme.colors.background}" stroke-width="2" paint-order="stroke" text-anchor="middle" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">${escapeXml(labelText)}</text>`;
        }

        return `<g class="edge" data-id="${edge.id}">
    <path d="${path}" fill="none" stroke="${theme.colors.relationship.stroke}" stroke-width="${theme.styles.borderWidth}" marker-end="url(#${marker})"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''} />
    ${labelElement}
  </g>`;
    }
}

export const svgBuilder = new SvgBuilder();
