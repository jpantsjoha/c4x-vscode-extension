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
    /**
     * Render relationship arrows above nodes (edges on top). Defaults to the
     * `c4x.edgesOnTop` setting (true): connectors stay visible over large
     * containers and deployment nodes. Explicit option wins over the setting.
     */
    edgesOnTop?: boolean;
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

/** Lateral offset (px) applied to each line of a bidirectional pair. */
export const BIDIRECTIONAL_EDGE_OFFSET = 10;

/**
 * Ids of relationships that form a bidirectional pair: an edge A→B for which
 * a reverse edge B→A also exists. Pure — exported for unit tests.
 */
export function findReversePairIds(relationships: RoutedRelationship[]): Set<string> {
    const ids = new Set<string>();
    for (let i = 0; i < relationships.length; i++) {
        for (let j = i + 1; j < relationships.length; j++) {
            const a = relationships[i].relationship;
            const b = relationships[j].relationship;
            if (a.from === b.to && a.to === b.from) {
                ids.add(relationships[i].id);
                ids.add(relationships[j].id);
            }
        }
    }
    return ids;
}

/**
 * Shift a segment perpendicular to its own direction (to its right). Applied
 * with the same sign to both directions of a bidirectional pair, the reversed
 * geometry separates the two lines onto opposite sides of the shared channel.
 * Pure — exported for unit tests.
 */
export function offsetPerpendicular(from: Point, to: Point, amount: number): { from: Point; to: Point } {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy) || 1;
    const nx = -dy / length;
    const ny = dx / length;
    return {
        from: { x: from.x + nx * amount, y: from.y + ny * amount },
        to: { x: to.x + nx * amount, y: to.y + ny * amount },
    };
}

export class SvgBuilder {
    private labelTracker = new LabelCollisionTracker();

    public build(layout: LayoutResult, options: SvgBuildOptions = {}): string {
        // Reset label positions for this diagram
        this.labelTracker.reset();

        const theme = options.theme ?? themeManager.getCurrentTheme();
        const elementCount = layout.elements.length;
        const isComplex = elementCount > 4;

        // Reserve space for the title only. The legend is a draggable HTML
        // overlay in the preview webview (#98), so the SVG no longer carries
        // a legend box or reserves canvas space for one.
        const titleHeight = options.viewType ? 40 : 0;
        const totalWidth = layout.width;
        const totalHeight = layout.height + titleHeight;

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

        // Bidirectional pairs (A→B and B→A) share one channel; their edges
        // and labels print on top of each other. Detect them so each line
        // can be offset to its own side of the channel.
        const bidirectionalIds = findReversePairIds(layout.relationships);

        // Pass complexity flag to renderEdge
        const edgeSvg = layout.relationships.map(edge => this.renderEdge(edge, theme, elementMap, bidirectionalIds.has(edge.id))).join('\n');

        // Render boundaries if they exist
        const boundarySvg = layout.boundaries ?
            layout.boundaries.map(boundary => renderBoundary(boundary, theme)).join('\n') : '';

        // Render diagram title
        const titleSvg = this.renderTitle(options.viewType, options.workspaceName, totalWidth, theme);

        // Paint order: with edges on top (the c4x.edgesOnTop default),
        // connectors render after nodes so they stay visible over large
        // containers; legacy order paints nodes over edges.
        const edgesOnTop = this.resolveEdgesOnTop(options);
        const layeredContent = edgesOnTop
            ? `    <g class="nodes">
${nodeSvg}
    </g>
    <g class="edges">
${edgeSvg}
    </g>`
            : `    <g class="edges">
${edgeSvg}
    </g>
    <g class="nodes">
${nodeSvg}
    </g>`;

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${totalWidth} ${totalHeight}" role="img">
  <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="${theme.colors.background}" />
  ${defs}
  ${titleSvg}
  <g class="diagram-content" transform="translate(0, ${titleHeight})">
    <g class="boundaries">
${boundarySvg}
    </g>
${layeredContent}
  </g>
</svg>`;
    }

    /**
     * Resolves the edges-on-top flag: explicit option first, then the
     * `c4x.edgesOnTop` setting (default true), falling back to true when the
     * vscode configuration API is unavailable (unit tests).
     */
    private resolveEdgesOnTop(options: SvgBuildOptions): boolean {
        if (options.edgesOnTop !== undefined) {
            return options.edgesOnTop;
        }
        return this.readC4xBooleanSetting('edgesOnTop', true);
    }

    private readC4xBooleanSetting(key: string, fallback: boolean): boolean {
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const vscodeApi = require('vscode');
            if (!vscodeApi.workspace) {
                return fallback;
            }
            const config = vscodeApi.workspace.getConfiguration('c4x') as { get<T>(key: string): T | undefined };
            const value = config.get<boolean>(key);
            return value ?? fallback;
        } catch {
            return fallback;
        }
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

    private renderEdge(edge: RoutedRelationship, theme: C4Theme, elementMap?: Map<string, PositionedElement>, isBidirectional = false): string {
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
                let connectionPoints = calculateOptimalConnectionPoints(
                    { x: fromElement.x, y: fromElement.y, width: fromElement.width, height: fromElement.height },
                    { x: toElement.x, y: toElement.y, width: toElement.width, height: toElement.height }
                );

                if (isBidirectional) {
                    // Bidirectional pair: shift this line to its own side of the
                    // shared channel so the two directions (and their labels)
                    // no longer print on top of each other.
                    const shifted = offsetPerpendicular(connectionPoints.from, connectionPoints.to, BIDIRECTIONAL_EDGE_OFFSET);
                    connectionPoints = { ...shifted, mid: { x: (shifted.from.x + shifted.to.x) / 2, y: (shifted.from.y + shifted.to.y) / 2 } };
                }

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
    <path class="edge-hit-area" d="${path}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" />
    <path d="${path}" fill="none" stroke="${theme.colors.relationship.stroke}" stroke-width="${theme.styles.borderWidth}" marker-end="url(#${marker})"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''} />
    ${labelElement}
  </g>`;
    }
}

export const svgBuilder = new SvgBuilder();
