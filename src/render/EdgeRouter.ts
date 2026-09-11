/**
 * Edge routing and connection-point calculation for C4 diagram relationships.
 *
 * Pure geometry — no SVG generation, no side-effects.
 */

import { Point } from '../layout/DagreLayoutEngine';

/**
 * Convert an array of points into an SVG path string (M … L … L …).
 */
export function toPath(points: Point[]): string {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
}

/**
 * Return the middle point of an array (used for label positioning).
 */
export function midpoint(points: Point[]): Point {
    if (points.length === 0) {
        return { x: 0, y: 0 };
    }
    const middle = points[Math.floor(points.length / 2)];
    return middle;
}

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ConnectionResult {
    from: Point;
    to: Point;
    mid: Point;
}

/**
 * Calculate optimal connection points between two C4 model boxes.
 *
 * Uses true closest-edge routing for professional C4 diagram appearance.
 * Returns the closest edge points for direct line routing.
 */
export function calculateOptimalConnectionPoints(
    fromBox: Box,
    toBox: Box
): ConnectionResult {
    // C4 model arrow spacing - 0 to ensure arrows touch the element edges
    const arrowPadding = 0;

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
                if (fromPoint.edge !== 'bottom') { penalty += 150; }
                if (toPoint.edge !== 'top') { penalty += 150; }
            } else if (isAbove) {
                // Vertical flow (Up): Prefer Top -> Bottom
                if (fromPoint.edge !== 'top') { penalty += 150; }
                if (toPoint.edge !== 'bottom') { penalty += 150; }
            } else if (isRight) {
                // Horizontal flow (Right): Prefer Right -> Left
                if (fromPoint.edge !== 'right') { penalty += 150; }
                if (toPoint.edge !== 'left') { penalty += 150; }
            } else if (isLeft) {
                // Horizontal flow (Left): Prefer Left -> Right
                if (fromPoint.edge !== 'left') { penalty += 150; }
                if (toPoint.edge !== 'right') { penalty += 150; }
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
