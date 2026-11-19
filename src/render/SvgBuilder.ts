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
import { measureTextPx, textMetricVariant, TEXT_METRICS } from './textLayout';
import {
    toPath,
    midpoint,
    calculateOptimalConnectionPoints,
    BIDIRECTIONAL_EDGE_OFFSET,
    findReversePairIds,
    offsetPerpendicular,
    formatPolylineD,
    polylineLabelPoint,
    distanceToBoxBorder,
} from './EdgeRouter';
import { LabelCollisionTracker } from './LabelRenderer';
import { isBundledSprite, renderNode } from './ElementRenderer';
import { computeAccentSlots, resolveElementStyle, type ElementStyleContext } from './elementStyle';
import { renderBoundary } from './BoundaryRenderer';
import { boundaryLabelInkBox } from './boundaryLabel';
import { viewBrandColors } from './deploymentNotation';
import { shapeSideInsets } from './shapeGeometry';
import { C4ViewType } from '../parser';
import type { C4View } from '../model/C4Model';

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
    /**
     * The view being drawn. Supplies the `elementStyle` rules and the external
     * accent order (declaration order within the view). Without it only the
     * theme layer applies and accents follow source offsets (notation decision #320).
     */
    view?: Pick<C4View, 'elements' | 'elementStyles'>;
}

/** The style context for a render: rules from the view, accent slots in declaration order. */
export function elementStyleContextFor(layout: LayoutResult, view?: Pick<C4View, 'elements' | 'elementStyles'>, theme?: Pick<C4Theme, 'deploymentNotation' | 'colors'>): ElementStyleContext {
    // Brand colours of the view's `preserveColor` sprites, only for a theme that tints (#326).
    const brandColors = theme?.deploymentNotation?.brandTint
        ? viewBrandColors(theme, view ? view.elements : layout.elements.map(node => node.element), view?.elementStyles ?? [])
        : undefined;
    const withBrand = (context: ElementStyleContext): ElementStyleContext => brandColors ? { ...context, brandColors } : context;
    if (view) {
        return withBrand({ rules: view.elementStyles ?? [], accentSlots: computeAccentSlots(view.elements) });
    }
    const bySource = layout.elements
        .map((node, index) => ({ element: node.element, index }))
        .sort((a, b) => (a.element.sourceRange?.start.offset ?? Number.MAX_SAFE_INTEGER) - (b.element.sourceRange?.start.offset ?? Number.MAX_SAFE_INTEGER)
            || a.index - b.index)
        .map(entry => ({ ...entry.element, children: undefined }));
    return withBrand({ rules: [], accentSlots: computeAccentSlots(bySource) });
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

// Bidirectional-pair helpers moved to EdgeRouter (#419) so the layout engine
// can apply the same separation to the routed points it returns.
export { BIDIRECTIONAL_EDGE_OFFSET, findReversePairIds, offsetPerpendicular } from './EdgeRouter';

export class SvgBuilder {
    private labelTracker = new LabelCollisionTracker();
    /**
     * Deployment notation (#326): when every usual candidate collides, a routed
     * label also tries every twentieth of each segment before falling back,
     * so it can sit in the gap between two nested node outlines. Off for every
     * other theme, which keep their placements.
     */
    private fineLabelSearch = false;

    public build(layout: LayoutResult, options: SvgBuildOptions = {}): string {
        // Reset label positions for this diagram
        this.labelTracker.reset();

        const theme = options.theme ?? themeManager.getCurrentTheme();
        this.fineLabelSearch = !!theme.deploymentNotation;
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

        const styles = elementStyleContextFor(layout, options.view, theme);
        const nodeSvg = layout.elements.map(node => renderNode(node, theme, this.labelTracker, styles)).join('\n');
        // A bottom-left boundary label is ink a relationship label must not cover (#324).
        for (const b of layout.boundaries ?? []) {
            const ink = boundaryLabelInkBox(theme, { x: b.x, y: b.y, width: b.width, height: b.height, label: b.boundary.label, boundaryType: b.boundary.boundaryType });
            if (ink) {
                this.labelTracker.registerPosition(ink.x + ink.width / 2, ink.y + ink.height / 2, ink.width, ink.height);
            }
        }

        // Create element lookup map for edge optimization
        const elementMap = new Map<string, PositionedElement>();
        layout.elements.forEach(el => elementMap.set(el.id, el));

        // Bidirectional pairs (A→B and B→A) share one channel; their edges
        // and labels print on top of each other. Detect them so each line
        // can be offset to its own side of the channel.
        const bidirectionalIds = findReversePairIds(layout.relationships);

        // Pass complexity flag to renderEdge
        // Each element's resolved outline, so arrows end on the shape (#323).
        const outlines = new Map<string, string>();
        layout.elements.forEach(el => outlines.set(el.id, resolveElementStyle(el.element, theme, styles, { isKnownSprite: isBundledSprite }).outline));
        const canvas = { width: layout.width, height: layout.height };
        const edgeSvg = layout.relationships.map(edge => this.renderEdge(edge, theme, elementMap, bidirectionalIds.has(edge.id), canvas, outlines)).join('\n');

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
        // Colour from theme.title; position stays top centre until #328
        // honours theme.title.position.

        return `<text class="diagram-title" x="${titleX.toFixed(2)}" y="${titleY.toFixed(2)}" fill="${theme.title.color}" text-anchor="middle" font-size="${fontSize}" font-family="${theme.styles.fontFamily}" font-weight="bold">${escapeXml(titleText)}</text>`;
    }

    /**
     * Label position for a routed polyline (#419): the first candidate along
     * its segments (longest segment first; at 1/2, then 3/10, 7/10, 3/20,
     * 17/20 of it) that collides with no earlier label, 6 px above the line
     * and clamped so the label box stays inside the canvas. Falls back to the
     * first candidate. Every candidate lies on the path, up to the clamp.
     */
    private placeRoutedLabel(points: Point[], width: number, height: number, canvas?: { width: number; height: number }, lift: number[] = [6], strict = false): { x: number; y: number } | undefined {
        const segments = points.slice(1)
            .map((p, i) => ({ a: points[i], b: p, length: Math.hypot(p.x - points[i].x, p.y - points[i].y) }))
            .sort((s, t) => t.length - s.length);
        const clamp = (x: number, y: number): { x: number; y: number } => {
            if (!canvas) { return { x, y }; }
            return {
                x: width < canvas.width ? Math.min(Math.max(x, width / 2), canvas.width - width / 2) : canvas.width / 2,
                y: Math.min(Math.max(y, height), canvas.height - height / 4),
            };
        };
        const candidates: Array<{ x: number; y: number }> = [];
        for (const up of lift) {
            for (const segment of segments) {
                for (const t of [0.5, 0.3, 0.7, 0.15, 0.85]) {
                    candidates.push(clamp(segment.a.x + (segment.b.x - segment.a.x) * t, segment.a.y + (segment.b.y - segment.a.y) * t - up));
                }
            }
        }
        if (this.fineLabelSearch) {
            for (const up of lift) {
                for (const segment of segments) {
                    for (let step = 1; step < 20; step++) {
                        const t = step / 20;
                        candidates.push(clamp(segment.a.x + (segment.b.x - segment.a.x) * t, segment.a.y + (segment.b.y - segment.a.y) * t - up));
                    }
                }
            }
        }
        const clear = (c: { x: number; y: number }): boolean => !this.labelTracker.checkCollision(c.x - width / 2, c.y - height / 2, width, height);
        const free = candidates.find(clear);
        if (free || !strict) {
            return free ?? candidates[0];
        }
        // A block taller than the gap: slide it sideways until it clears every box.
        return this.slideSideways(candidates.slice(0, 5), clear, width / 2 + 8);
    }

    /** Two-line (label + technology) placement for a straight edge: first collision-free block wins. */
    private placeTwoLineLabel(point: Point, width: number, height: number): { x: number; y: number } | undefined {
        const offsets = [[0, 0], [0, -25], [0, 25], [-30, 0], [30, 0], [-20, -20], [20, -20], [-20, 20], [20, 20]];
        const side = width / 2 + 10;
        offsets.push([side, 0], [-side, 0]);
        for (const baseY of [point.y - 6, point.y]) {
            for (const [dx, dy] of offsets) {
                const x = point.x + dx;
                const y = baseY + dy;
                if (!this.labelTracker.checkCollision(x - width / 2, y - height / 2, width, height)) {
                    return { x, y };
                }
            }
        }
        return this.slideSideways([{ x: point.x, y: point.y - 6 }, { x: point.x, y: point.y }], c => !this.labelTracker.checkCollision(c.x - width / 2, c.y - height / 2, width, height), width / 2 + 8);
    }

    /** First of the starting points, moved left or right in 10 px steps (up to `limit`, so the label stays on its path, #419), that `clear` accepts. */
    private slideSideways(starts: Array<{ x: number; y: number }>, clear: (c: { x: number; y: number }) => boolean, limit: number): { x: number; y: number } | undefined {
        for (let dx = 10; dx <= limit; dx += 10) {
            for (const start of starts) {
                for (const sign of [1, -1]) {
                    const c = { x: start.x + sign * dx, y: start.y };
                    if (clear(c)) {
                        return c;
                    }
                }
            }
        }
        return undefined;
    }

    private renderEdge(
        edge: RoutedRelationship,
        theme: C4Theme,
        elementMap?: Map<string, PositionedElement>,
        isBidirectional = false,
        canvas?: { width: number; height: number },
        outlines?: Map<string, string>,
    ): string {
        const dasharray = getEdgeDasharray(edge);
        // Unique namespace for markers to prevent collisions in VS Code DOM
        const marker = edge.relationship.relType === 'async' ? 'c4x-arrow-async' : edge.relationship.relType === 'sync' ? 'c4x-arrow-sync' : 'c4x-arrow-uses';

        let path: string;
        let labelPoint: Point;
        let routed = false;
        let routedDrawn: Point[] = edge.points;

        const fromElement = elementMap?.get(edge.relationship.from);
        const toElement = elementMap?.get(edge.relationship.to);

        if (fromElement && toElement) {
            if (routedPointsAttach(edge.points, fromElement, toElement)) {
                // #419: draw the layout engine's route as it is. It starts on
                // the source border, ends on the target border, goes around
                // unrelated boxes, and already carries the bidirectional offset.
                // #323: where the route leaves or enters a shape at the middle of a
                // side the outline does not reach, the end moves in to the outline.
                const drawn = clipRoutedEnds(edge.points, fromElement, toElement, outlines);
                routedDrawn = drawn;
                path = formatPolylineD(drawn);
                labelPoint = polylineLabelPoint(drawn);
                routed = drawn.length > 2;
            } else {
                // Points that do not attach to both boxes (a hand-built layout,
                // or boxes moved after routing): draw the straight line between
                // the nearest sides so the arrow still meets both elements.
                let connectionPoints = calculateOptimalConnectionPoints(
                    { x: fromElement.x, y: fromElement.y, width: fromElement.width, height: fromElement.height, outline: outlines?.get(fromElement.id) },
                    { x: toElement.x, y: toElement.y, width: toElement.width, height: toElement.height, outline: outlines?.get(toElement.id) }
                );

                if (isBidirectional) {
                    // Bidirectional pair: shift this line to its own side of the
                    // shared channel so the two directions (and their labels)
                    // no longer print on top of each other.
                    const shifted = offsetPerpendicular(connectionPoints.from, connectionPoints.to, BIDIRECTIONAL_EDGE_OFFSET);
                    connectionPoints = { ...shifted, mid: { x: (shifted.from.x + shifted.to.x) / 2, y: (shifted.from.y + shifted.to.y) / 2 } };
                }

                path = formatPolylineD([connectionPoints.from, connectionPoints.to]);
                labelPoint = connectionPoints.mid;
            }
        } else if (elementMap) {
            // At least one endpoint is missing: use whatever points exist.
            if (edge.points && edge.points.length > 0) {
                path = toPath(edge.points);
                labelPoint = midpoint(edge.points);
            } else {
                path = "";
                labelPoint = { x: 0, y: 0 };
            }
        } else {
            // Fallback
            path = toPath(edge.points);
            labelPoint = midpoint(edge.points);
        }

        // Render relationship label with C4 model styling
        let labelElement = '';
        const technology = (edge.relationship.technology || '').trim();
        if (edge.relationship.label || edge.relationship.order || technology) {
            // C4 model relationship labels: simple, clean, positioned along arrow
            // Prefix with sequence number for dynamic diagrams
            const prefix = edge.relationship.order ? `${edge.relationship.order}: ` : '';
            const labelText = prefix + (edge.relationship.label || '').trim();

            const fontSize = 12; // Standard C4 relationship label size
            const lineHeight = 14;

            // Estimate label dimensions for positioning
            const estimatedCharWidth = fontSize * 0.6;
            // #421: the technology is a second line, `[technology]`, italic and
            // smaller, under the label. The box grows to hold both lines.
            const techText = technology ? `[${technology}]` : '';
            const techFontSize = 11;
            const techLineHeight = 13;
            // The technology line is measured with the repository's italic metrics for the theme's font.
            const techWidth = techText
                ? measureTextPx(techText, techFontSize, textMetricVariant(theme.styles.fontFamily, false, true), TEXT_METRICS)
                : 0;
            const labelWidth = Math.max(labelText.length * estimatedCharWidth, techWidth);
            // Ink of the block: 9 px above the label baseline to 3 px below the technology baseline.
            // Ink of the block: 9 px above the label baseline to 3 px below the technology baseline.
            const labelHeight = techText ? 9 + techLineHeight + 3 + 1 : lineHeight;

            // Straight edges keep their 1.8.0 placement. A routed edge (#419)
            // places its label on its own path: candidates along its segments,
            // longest first, each clamped inside the canvas.
            // With a technology line the block is taller: try the usual spot 6 px
            // above the line, then centred on it, then beside it, and keep the
            // first position where the whole block collides with nothing.
            const oneLineWidth = labelText.length * estimatedCharWidth;
            const placeOneLine = (): { x: number; y: number } => routed
                ? this.placeRoutedLabel(routedDrawn, oneLineWidth, lineHeight, canvas)!
                : this.labelTracker.findNonOverlappingPosition(
                    labelPoint.x,
                    labelPoint.y - 6, // Slight offset above the arrow
                    oneLineWidth,
                    lineHeight
                );
            let adjustedPosition: { x: number; y: number };
            // Baseline of the label line, as an offset from the block's centre.
            let labelOffset = 0;
            if (!techText) {
                adjustedPosition = placeOneLine();
            } else {
                const block = routed
                    ? this.placeRoutedLabel(routedDrawn, labelWidth, labelHeight, canvas, [6, 0], true)
                    : this.placeTwoLineLabel(labelPoint, labelWidth, labelHeight);
                if (block) {
                    adjustedPosition = block;
                    labelOffset = -3.5;
                } else {
                    // No collision-free block: the label keeps exactly the position it has
                    // without a technology (same fallback), the technology goes under it,
                    // so the technology never adds an overlap the label alone would not have.
                    const one = placeOneLine();
                    adjustedPosition = { x: one.x, y: one.y + 3.5 };
                    labelOffset = -3.5;
                }
            }

            // Register this label position
            this.labelTracker.registerPosition(adjustedPosition.x, adjustedPosition.y, labelWidth, labelHeight);

            // Create clean, single-line label (C4 model standard)
            // Use paint-order: stroke fill to create a halo effect for legibility over lines
            const labelY = adjustedPosition.y + labelOffset;
            const techElement = techText
                ? `\n    <text data-field="relationship-technology" x="${adjustedPosition.x.toFixed(2)}" y="${(labelY + techLineHeight).toFixed(2)}" fill="${theme.colors.relationship.text}" stroke="${theme.colors.background}" stroke-width="2" paint-order="stroke" text-anchor="middle" font-size="${techFontSize}" font-style="italic" font-family="${theme.styles.fontFamily}">${escapeXml(techText)}</text>`
                : '';
            labelElement = `<text x="${adjustedPosition.x.toFixed(2)}" y="${labelY.toFixed(2)}" fill="${theme.colors.relationship.text}" stroke="${theme.colors.background}" stroke-width="2" paint-order="stroke" text-anchor="middle" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">${escapeXml(labelText)}</text>${techElement}`;
        }

        return `<g class="edge" data-id="${escapeXml(edge.id)}">
    <path class="edge-hit-area" d="${path}" fill="none" stroke="transparent" stroke-width="14" pointer-events="stroke" />
    <path d="${path}" fill="none" stroke="${theme.colors.relationship.stroke}" stroke-width="${theme.styles.borderWidth}" marker-end="url(#${marker})"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''} />
    ${labelElement}
  </g>`;
    }
}

/**
 * True when a routed polyline starts on the border of `from` and ends on the
 * border of `to` (within the bidirectional offset). Points that do not attach
 * (centre-to-centre points from a hand-built layout, or a box moved after
 * routing) are not drawn as they are. Pure — exported for unit tests.
 */
export function routedPointsAttach(points: Point[] | undefined, from: PositionedElement, to: PositionedElement): boolean {
    if (!points || points.length < 2) {
        return false;
    }
    const tolerance = BIDIRECTIONAL_EDGE_OFFSET + 0.5;
    return distanceToBoxBorder(points[0], from) <= tolerance
        && distanceToBoxBorder(points[points.length - 1], to) <= tolerance;
}

/**
 * Move the ends of a routed polyline onto the shape's outline (#323). The router
 * attaches at the bounding box; for a shape whose outline sits inside it at the
 * middle of a side (person and bucket sides, the folder body below its tab) an
 * end that is at that midpoint and runs straight along the side's normal is
 * extended inward by the outline's inset. Any other end (a bidirectional offset,
 * a bend at the side) keeps its bounding-box attachment. Pure; exported for tests.
 */
export function clipRoutedEnds(points: Point[], from: PositionedElement, to: PositionedElement, outlines?: Map<string, string>): Point[] {
    const eps = 0.5;
    const clip = (pt: Point, next: Point, el: PositionedElement): Point => {
        const ins = shapeSideInsets(outlines?.get(el.id), el.width, el.height);
        const cx = el.x + el.width / 2;
        const cy = el.y + el.height / 2;
        if (ins.top > 0 && Math.abs(pt.x - cx) <= eps && Math.abs(pt.y - el.y) <= eps && Math.abs(next.x - pt.x) <= eps && next.y < pt.y) {
            return { x: pt.x, y: pt.y + ins.top };
        }
        if (ins.bottom > 0 && Math.abs(pt.x - cx) <= eps && Math.abs(pt.y - (el.y + el.height)) <= eps && Math.abs(next.x - pt.x) <= eps && next.y > pt.y) {
            return { x: pt.x, y: pt.y - ins.bottom };
        }
        if (ins.left > 0 && Math.abs(pt.y - cy) <= eps && Math.abs(pt.x - el.x) <= eps && Math.abs(next.y - pt.y) <= eps && next.x < pt.x) {
            return { x: pt.x + ins.left, y: pt.y };
        }
        if (ins.right > 0 && Math.abs(pt.y - cy) <= eps && Math.abs(pt.x - (el.x + el.width)) <= eps && Math.abs(next.y - pt.y) <= eps && next.x > pt.x) {
            return { x: pt.x - ins.right, y: pt.y };
        }
        return pt;
    };
    if (!outlines || points.length < 2) {
        return points;
    }
    const out = points.slice();
    out[0] = clip(points[0], points[1], from);
    const last = points.length - 1;
    out[last] = clip(points[last], points[last - 1], to);
    return out;
}

export const svgBuilder = new SvgBuilder();
