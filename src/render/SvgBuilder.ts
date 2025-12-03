import { PositionedElement, RoutedRelationship, LayoutResult, Point, PositionedBoundary } from '../layout/DagreLayoutEngine';
import { C4Theme } from '../themes/Theme';
import { themeManager } from '../themes/ThemeManager';

interface SvgBuildOptions {
    theme?: C4Theme;
}


function escapeXml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function toPath(points: Point[]): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

function midpoint(points: Point[]): Point {
    if (points.length === 0) {
        return { x: 0, y: 0 };
    }
    const middle = points[Math.floor(points.length / 2)];
    return middle;
}

function getFillColor(node: PositionedElement, theme: C4Theme): string {
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

function getStrokeColor(node: PositionedElement, theme: C4Theme): string {
    const isExternal = node.element.tags?.some(tag => tag.toLowerCase() === 'external');

    switch (node.element.type) {
        case 'Person':
            return isExternal ? (theme.colors.externalPerson?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.person.stroke;
        case 'Container':
            return isExternal ? (theme.colors.externalContainer?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.container.stroke;
        case 'Component':
            return isExternal ? (theme.colors.externalComponent?.stroke ?? theme.colors.externalSystem.stroke) : theme.colors.component.stroke;
        case 'SoftwareSystem':
        default:
            return isExternal ? theme.colors.externalSystem.stroke : theme.colors.softwareSystem.stroke;
    }
}

function getTextColor(node: PositionedElement, theme: C4Theme): string {
    const isExternal = node.element.tags?.some(tag => tag.toLowerCase() === 'external');

    switch (node.element.type) {
        case 'Person':
            return isExternal ? (theme.colors.externalPerson?.text ?? theme.colors.externalSystem.text) : theme.colors.person.text;
        case 'Container':
            return isExternal ? (theme.colors.externalContainer?.text ?? theme.colors.externalSystem.text) : theme.colors.container.text;
        case 'Component':
            return isExternal ? (theme.colors.externalComponent?.text ?? theme.colors.externalSystem.text) : theme.colors.component.text;
        case 'SoftwareSystem':
        default:
            return isExternal ? theme.colors.externalSystem.text : theme.colors.softwareSystem.text;
    }
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
    // Track label positions to prevent overlapping
    private labelPositions: Array<{ x: number; y: number; width: number; height: number }> = [];

    /**
     * Check if a label position overlaps with existing labels
     */
    private checkLabelCollision(x: number, y: number, width: number, height: number): boolean {
        return this.labelPositions.some(pos =>
            x < pos.x + pos.width &&
            x + width > pos.x &&
            y < pos.y + pos.height &&
            y + height > pos.y
        );
    }

    /**
     * Find non-overlapping position for a relationship label
     */
    private findNonOverlappingPosition(baseX: number, baseY: number, width: number, height: number): { x: number; y: number } {
        const offsets = [
            { x: 0, y: 0 },           // Original position
            { x: 0, y: -25 },         // Above
            { x: 0, y: 25 },          // Below
            { x: -30, y: 0 },         // Left
            { x: 30, y: 0 },          // Right
            { x: -20, y: -20 },       // Top-left
            { x: 20, y: -20 },        // Top-right
            { x: -20, y: 20 },        // Bottom-left
            { x: 20, y: 20 },         // Bottom-right
        ];

        for (const offset of offsets) {
            const testX = baseX + offset.x;
            const testY = baseY + offset.y;

            if (!this.checkLabelCollision(testX - width / 2, testY - height / 2, width, height)) {
                return { x: testX, y: testY };
            }
        }

        // If all positions collide, use original position (last resort)
        return { x: baseX, y: baseY };
    }

    /**
     * Register a label position to track for collisions
     */
    private registerLabelPosition(x: number, y: number, width: number, height: number): void {
        this.labelPositions.push({
            x: x - width / 2,
            y: y - height / 2,
            width,
            height
        });
    }

    /**
     * Calculate optimal connection points between two C4 model boxes
     * Uses true closest-edge routing for professional C4 diagram appearance
     * Returns the closest edge points for direct line routing
     */
    private calculateOptimalConnectionPoints(
        fromBox: { x: number; y: number; width: number; height: number },
        toBox: { x: number; y: number; width: number; height: number }
    ): { from: Point; to: Point; mid: Point } {
        // C4 model arrow spacing - small gap from box edge for professional appearance
        const arrowPadding = 5;

        // Calculate all possible connection points on both boxes
        const fromPoints = [
            { x: fromBox.x + fromBox.width / 2, y: fromBox.y - arrowPadding, edge: 'top' },           // Top center
            { x: fromBox.x + fromBox.width + arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'right' }, // Right center
            { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height + arrowPadding, edge: 'bottom' }, // Bottom center
            { x: fromBox.x - arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'left' }         // Left center
        ];

        const toPoints = [
            { x: toBox.x + toBox.width / 2, y: toBox.y - arrowPadding, edge: 'top' },           // Top center
            { x: toBox.x + toBox.width + arrowPadding, y: toBox.y + toBox.height / 2, edge: 'right' }, // Right center
            { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height + arrowPadding, edge: 'bottom' }, // Bottom center
            { x: toBox.x - arrowPadding, y: toBox.y + toBox.height / 2, edge: 'left' }         // Left center
        ];

        // Determine relative positions to bias connection choice
        // This helps achieve the "holistic top-down flow" requested by the user
        const isBelow = toBox.y >= fromBox.y + fromBox.height;
        const isAbove = fromBox.y >= toBox.y + toBox.height;
        const isRight = toBox.x >= fromBox.x + fromBox.width;
        const isLeft = fromBox.x >= toBox.x + toBox.width;

        // Find the closest pair of connection points with directional bias
        let minScore = Infinity;
        let bestFromPoint = fromPoints[0];
        let bestToPoint = toPoints[0];

        for (const fromPoint of fromPoints) {
            for (const toPoint of toPoints) {
                const distance = Math.sqrt(
                    Math.pow(toPoint.x - fromPoint.x, 2) +
                    Math.pow(toPoint.y - fromPoint.y, 2)
                );

                // Add penalties for non-ideal flows
                let penalty = 0;

                if (isBelow) {
                    // Vertical flow (Down): Prefer Bottom -> Top
                    if (fromPoint.edge !== 'bottom') {penalty += 150;}
                    if (toPoint.edge !== 'top') {penalty += 150;}
                } else if (isAbove) {
                    // Vertical flow (Up): Prefer Top -> Bottom
                    if (fromPoint.edge !== 'top') {penalty += 150;}
                    if (toPoint.edge !== 'bottom') {penalty += 150;}
                } else if (isRight) {
                    // Horizontal flow (Right): Prefer Right -> Left
                    if (fromPoint.edge !== 'right') {penalty += 150;}
                    if (toPoint.edge !== 'left') {penalty += 150;}
                } else if (isLeft) {
                    // Horizontal flow (Left): Prefer Left -> Right
                    if (fromPoint.edge !== 'left') {penalty += 150;}
                    if (toPoint.edge !== 'right') {penalty += 150;}
                }

                const score = distance + penalty;

                if (score < minScore) {
                    minScore = score;
                    bestFromPoint = fromPoint;
                    bestToPoint = toPoint;
                }
            }
        }

        // If no good connection found (boxes too close), use fallback
        if (minScore === Infinity) {
            bestFromPoint = fromPoints[1]; // Right
            bestToPoint = toPoints[3];     // Left
        }

        // Calculate midpoint for label positioning
        const midPoint = {
            x: (bestFromPoint.x + bestToPoint.x) / 2,
            y: (bestFromPoint.y + bestToPoint.y) / 2
        };

        return {
            from: { x: bestFromPoint.x, y: bestFromPoint.y },
            to: { x: bestToPoint.x, y: bestToPoint.y },
            mid: midPoint
        };
    }

    /**
     * Check if two edges are opposing (should be avoided for clean routing)
     */
    private areOpposingEdges(edge1: string, edge2: string): boolean {
        return (edge1 === 'left' && edge2 === 'right') ||
            (edge1 === 'right' && edge2 === 'left') ||
            (edge1 === 'top' && edge2 === 'bottom') ||
            (edge1 === 'bottom' && edge2 === 'top');
    }

    /**
     * Calculate optimal font size to fit text within box constraints
     * Ensures text scales down to fit within static C4 box sizes
     */
    private calculateOptimalFontSize(textLines: string[], boxWidth: number, boxHeight: number, baseFontSize: number): number {
        // Available space (with padding)
        const maxWidth = boxWidth - 20; // 10px padding on each side
        const maxHeight = boxHeight - 40; // 20px padding top/bottom

        // Calculate required height with base font size
        const lineHeight = baseFontSize * 1.2; // 20% line spacing
        const totalTextHeight = textLines.length * lineHeight;

        // Calculate required width (estimate 0.6 * fontSize per character for typical fonts)
        const charWidth = baseFontSize * 0.6;
        const maxTextWidth = Math.max(...textLines.map(line => line.length * charWidth));

        // Scale down if text doesn't fit
        const fontSizeForWidth = maxTextWidth > maxWidth ? (maxWidth / maxTextWidth) * baseFontSize : baseFontSize;
        const fontSizeForHeight = totalTextHeight > maxHeight ? (maxHeight / totalTextHeight) * baseFontSize : baseFontSize;

        // Use the more restrictive constraint, but ensure minimum readability
        const optimalSize = Math.min(fontSizeForWidth, fontSizeForHeight);
        return Math.max(optimalSize, baseFontSize * 0.7); // Never go below 70% of base size
    }

    public build(layout: LayoutResult, options: SvgBuildOptions = {}): string {
        // Reset label positions for this diagram
        this.labelPositions = [];

        const theme = options.theme ?? themeManager.getCurrentTheme();

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
        <marker id="arrow-uses" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 z" fill="${theme.colors.relationship.stroke}" />
        </marker>
        <marker id="arrow-async" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 z" fill="${theme.colors.relationship.stroke}" />
        </marker>
        <marker id="arrow-sync" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
          <path d="M0,0 L8,3 L0,6 z" fill="${theme.colors.relationship.stroke}" />
        </marker>
      </defs>`;

        const nodeSvg = layout.elements.map(node => this.renderNode(node, theme)).join('\n');

        // Create element lookup map for edge optimization
        const elementMap = new Map<string, PositionedElement>();
        layout.elements.forEach(el => elementMap.set(el.id, el));

        const edgeSvg = layout.relationships.map(edge => this.renderEdge(edge, theme, elementMap)).join('\n');

        // Render boundaries if they exist
        const boundarySvg = layout.boundaries ?
            layout.boundaries.map(boundary => this.renderBoundary(boundary, theme)).join('\n') : '';

        return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 ${layout.width} ${layout.height}" role="img">
  <rect x="0" y="0" width="${layout.width}" height="${layout.height}" fill="${theme.colors.background}" />
  ${defs}
  <g class="boundaries">
${boundarySvg}
  </g>
  <g class="edges">
${edgeSvg}
  </g>
  <g class="nodes">
${nodeSvg}
  </g>
</svg>`;
    }

    private renderNode(node: PositionedElement, theme: C4Theme): string {
        const fill = getFillColor(node, theme);
        const stroke = getStrokeColor(node, theme);
        const textColor = getTextColor(node, theme);

        // Add null checks for layout coordinates
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const width = node.width ?? 200;
        const height = node.height ?? 100;

        // Register element position to avoid label overlaps
        this.registerLabelPosition(x + width / 2, y + height / 2, width, height);

        const filter = theme.styles.shadowEnabled ? 'filter="url(#drop-shadow)"' : '';

        // Check if this is a Person element - render with stick figure icon
        if (node.element.type === 'Person') {
            return this.renderPersonNode(node, x, y, width, height, fill, stroke, textColor, theme, filter);
        }

        // Render C4-PlantUML style element structure for non-Person elements
        const textContent = this.renderC4ElementStructure(node, x, y, width, height, textColor, theme);

        return `<g class="node" data-id="${node.id}" ${filter}>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${theme.styles.borderRadius}" ry="${theme.styles.borderRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${theme.styles.borderWidth}" />
${textContent}
  </g>`;
    }

    /**
     * Render a Person element with stick-figure icon (official C4 Model style)
     * The person shape consists of a circle (head) and a body shape above a rounded rectangle
     */
    private renderPersonNode(
        node: PositionedElement,
        x: number,
        y: number,
        width: number,
        height: number,
        fill: string,
        stroke: string,
        textColor: string,
        theme: C4Theme,
        filter: string
    ): string {
        // Person icon dimensions (proportional to box)
        const iconHeight = 40;  // Height of the person icon area
        const headRadius = 12;  // Radius of the head circle
        const bodyWidth = 32;   // Width of the body/shoulders
        const bodyHeight = 18;  // Height of the body (shoulder area)

        // Position the icon at the top center of the element
        const iconCenterX = x + width / 2;
        const headCenterY = y + headRadius + 8;  // 8px padding from top
        const bodyCenterY = headCenterY + headRadius + bodyHeight / 2 - 2;

        // Adjust text area to account for icon
        const textAreaY = y + iconHeight;
        const textAreaHeight = height - iconHeight;

        // Render text content in the adjusted area
        const textContent = this.renderC4ElementStructureForPerson(node, x, textAreaY, width, textAreaHeight, textColor, theme);

        // Create the person icon SVG - filled with the stroke color
        // Head (circle)
        const head = `<circle cx="${iconCenterX.toFixed(2)}" cy="${headCenterY.toFixed(2)}" r="${headRadius}" fill="${stroke}" />`;

        // Body (rounded shoulders shape using a path)
        const bodyTop = bodyCenterY - bodyHeight / 2;
        const bodyPath = `M ${(iconCenterX - bodyWidth / 2).toFixed(2)} ${(bodyTop + bodyHeight).toFixed(2)} Q ${(iconCenterX - bodyWidth / 2).toFixed(2)} ${bodyTop.toFixed(2)} ${iconCenterX.toFixed(2)} ${bodyTop.toFixed(2)} Q ${(iconCenterX + bodyWidth / 2).toFixed(2)} ${bodyTop.toFixed(2)} ${(iconCenterX + bodyWidth / 2).toFixed(2)} ${(bodyTop + bodyHeight).toFixed(2)} Z`;
        const body = `<path d="${bodyPath}" fill="${stroke}" />`;

        return `<g class="node person" data-id="${node.id}" ${filter}>
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${width.toFixed(2)}" height="${height.toFixed(2)}" rx="${theme.styles.borderRadius}" ry="${theme.styles.borderRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${theme.styles.borderWidth}" />
    <g class="person-icon">
      ${head}
      ${body}
    </g>
${textContent}
  </g>`;
    }

    /**
     * Render text structure for Person elements (accounts for icon space)
     */
    private renderC4ElementStructureForPerson(
        node: PositionedElement,
        x: number,
        y: number,
        width: number,
        height: number,
        textColor: string,
        theme: C4Theme
    ): string {
        const title = node.element.label;
        const technology = node.element.type;
        const description = node.element.tags?.join(', ') || '';

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
     * Render C4-PlantUML style element structure:
     * == Title (Bold, 14pt)
     * //[Technology]// (Italic, 12pt)
     * Description (Normal, 12pt)
     */
    private renderC4ElementStructure(node: PositionedElement, x: number, y: number, width: number, height: number, textColor: string, theme: C4Theme): string {
        const title = node.element.label;
        const technology = node.element.type;
        const description = node.element.tags?.join(', ') || '';

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

    private renderEdge(edge: RoutedRelationship, theme: C4Theme, elementMap?: Map<string, PositionedElement>): string {
        const dasharray = getEdgeDasharray(edge);
        const marker = edge.relationship.relType === 'async' ? 'arrow-async' : edge.relationship.relType === 'sync' ? 'arrow-sync' : 'arrow-uses';

        let path: string;
        let labelPoint: Point;

        // Use optimized routing if element information is available
        if (elementMap) {
            const fromElement = elementMap.get(edge.relationship.from);
            const toElement = elementMap.get(edge.relationship.to);

            if (fromElement && toElement) {
                // Calculate optimal connection points
                const connectionPoints = this.calculateOptimalConnectionPoints(
                    { x: fromElement.x, y: fromElement.y, width: fromElement.width, height: fromElement.height },
                    { x: toElement.x, y: toElement.y, width: toElement.width, height: toElement.height }
                );

                // Create direct path with optimal connection points
                path = `M${connectionPoints.from.x.toFixed(2)},${connectionPoints.from.y.toFixed(2)} L${connectionPoints.to.x.toFixed(2)},${connectionPoints.to.y.toFixed(2)}`;
                labelPoint = connectionPoints.mid;
            } else {
                // Fallback to Dagre's routing
                path = toPath(edge.points);
                labelPoint = midpoint(edge.points);
            }
        } else {
            // Fallback to Dagre's routing
            path = toPath(edge.points);
            labelPoint = midpoint(edge.points);
        }

        // Render relationship label with C4 model styling
        let labelElement = '';
        if (edge.relationship.label) {
            // C4 model relationship labels: simple, clean, positioned along arrow
            const labelText = edge.relationship.label.trim();
            const fontSize = 12; // Standard C4 relationship label size
            const lineHeight = 14;

            // Estimate label dimensions for positioning
            const estimatedCharWidth = fontSize * 0.6;
            const labelWidth = labelText.length * estimatedCharWidth;
            const labelHeight = lineHeight;

            // Position label along the arrow path (C4 model standard)
            const adjustedPosition = this.findNonOverlappingPosition(
                labelPoint.x,
                labelPoint.y - 6, // Slight offset above the arrow
                labelWidth,
                labelHeight
            );

            // Register this label position
            this.registerLabelPosition(adjustedPosition.x, adjustedPosition.y, labelWidth, labelHeight);

            // Create clean, single-line label (C4 model standard)
            labelElement = `<text x="${adjustedPosition.x.toFixed(2)}" y="${adjustedPosition.y.toFixed(2)}" fill="${theme.colors.relationship.text}" text-anchor="middle" font-size="${fontSize}" font-family="${theme.styles.fontFamily}">${escapeXml(labelText)}</text>`;
        }

        return `<g class="edge" data-id="${edge.id}">
    <path d="${path}" fill="none" stroke="${theme.colors.relationship.stroke}" stroke-width="${theme.styles.borderWidth}" marker-end="url(#${marker})"${dasharray ? ` stroke-dasharray="${dasharray}"` : ''} />
    ${labelElement}
  </g>`;
    }

    /**
     * Render a C4 boundary (subgraph) as a rounded rectangle with dashed border
     * Following C4 model standards for system/container boundaries
     */
    private renderBoundary(boundary: PositionedBoundary, theme: C4Theme): string {
        const x = boundary.x;
        const y = boundary.y;
        const width = boundary.width;
        const height = boundary.height;
        const cornerRadius = 8; // Rounded corners for C4 boundaries

        // C4 boundary styling: dashed border, transparent fill, label at bottom
        const borderColor = theme.colors.relationship.stroke;
        const labelColor = theme.colors.relationship.text;
        const fontSize = 14;

        // Label positioned at bottom-left of boundary
        const labelX = x + 10;
        const labelY = y + height - 10;

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
}

export const svgBuilder = new SvgBuilder();
