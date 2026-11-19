/**
 * Edge routing and connection-point calculation for C4 diagram relationships.
 *
 * Pure geometry — no SVG generation, no side-effects.
 */

import type { Point } from '../layout/DagreLayoutEngine';
import { shapeSideInsets } from './shapeGeometry';

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
    /**
     * The resolved outline (#323). Each side's connection point moves in to
     * where the outline crosses that side's midline, so arrows end on the
     * shape, not on its bounding box. Absent: the bounding box.
     */
    outline?: string;
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

    // Calculate all possible connection points on both boxes, on the outline
    // where it crosses each side's midline (#323).
    const fi = shapeSideInsets(fromBox.outline, fromBox.width, fromBox.height);
    const ti = shapeSideInsets(toBox.outline, toBox.width, toBox.height);
    const fromPoints = [
        { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fi.top - arrowPadding, edge: 'top' },           // Top center
        { x: fromBox.x + fromBox.width - fi.right + arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'right' }, // Right center
        { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height - fi.bottom + arrowPadding, edge: 'bottom' }, // Bottom center
        { x: fromBox.x + fi.left - arrowPadding, y: fromBox.y + fromBox.height / 2, edge: 'left' }         // Left center
    ];

    const toPoints = [
        { x: toBox.x + toBox.width / 2, y: toBox.y + ti.top - arrowPadding, edge: 'top' },           // Top center
        { x: toBox.x + toBox.width - ti.right + arrowPadding, y: toBox.y + toBox.height / 2, edge: 'right' }, // Right center
        { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height - ti.bottom + arrowPadding, edge: 'bottom' }, // Bottom center
        { x: toBox.x + ti.left - arrowPadding, y: toBox.y + toBox.height / 2, edge: 'left' }         // Left center
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

// ---------------------------------------------------------------------------
// Obstacle-aware routing (#419)
//
// The layout engine routes every relationship with routeAroundObstacles and
// stores the result in RoutedRelationship.points; SvgBuilder draws those
// points as they are. An edge keeps the straight line between the nearest
// sides of its two boxes (calculateOptimalConnectionPoints) when that line
// crosses no other element. Only when it would pass through an unrelated box
// is it replaced by an orthogonal route found on a sparse grid around the
// obstacles (A*, cost = length plus a penalty per bend). If no route exists
// the straight line is kept, so routing never drops an edge.
// ---------------------------------------------------------------------------

/** Clearance (px) an orthogonal route keeps from every box it passes; also the length of the last segment, so the arrow head (10 x stroke width) sits on a straight run. */
export const ROUTE_CLEARANCE = 24;
/** Cost of one bend, in px of extra length, so routes prefer fewer turns. */
const BEND_PENALTY = 80;
/** Extra cost per px on a line that hugs a box (prefer channel centres). */
const HUG_WEIGHT = 1.15;
/** Grid size above which channel-centre lines are dropped to bound cost. */
export const MAX_GRID_NODES = 40000;
/** Margin (px) of the search window used when the whole-canvas grid is over budget. */
const ROUTE_WINDOW_MARGIN = 200;

/** Optional instrumentation: grid sizes searched and refused (tests only). */
export interface RouteStats {
    gridNodes: number[];
    refused: number[];
    /** Crossing length (px) of each edge that got no clear candidate. */
    fallbacks?: number[];
}

/**
 * Length (px) of the segment a-b that lies strictly inside the box
 * (Liang-Barsky clip). Pure — exported for unit tests.
 */
export function segmentLengthInBox(a: Point, b: Point, box: Box): number {
    let t0 = 0;
    let t1 = 1;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const checks: Array<[number, number]> = [
        [-dx, a.x - box.x],
        [dx, box.x + box.width - a.x],
        [-dy, a.y - box.y],
        [dy, box.y + box.height - a.y],
    ];
    for (const [p, q] of checks) {
        if (p === 0) {
            if (q <= 0) { return 0; }
        } else {
            const t = q / p;
            if (p < 0) {
                if (t > t1) { return 0; }
                if (t > t0) { t0 = t; }
            } else {
                if (t < t0) { return 0; }
                if (t < t1) { t1 = t; }
            }
        }
    }
    return Math.max(0, t1 - t0) * Math.hypot(dx, dy);
}

/**
 * Total length (px) of a polyline that lies inside any of the boxes.
 * Pure — exported for unit tests.
 */
export function polylineLengthInBoxes(points: Point[], boxes: Box[]): number {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        for (const box of boxes) {
            total += segmentLengthInBox(points[i - 1], points[i], box);
        }
    }
    return total;
}

function boxesOverlap(a: Box, b: Box): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

interface Rect { x1: number; y1: number; x2: number; y2: number }

/** Directions: 0 right, 1 down, 2 left, 3 up. */
const DX = [1, 0, -1, 0];
const DY = [0, 1, 0, -1];

interface Port { port: Point; stub: Point; dir: number }

/** Side-midpoint ports of a box with a stub `clearance` px outside each. `outward` true = leaving. */
function portsOf(box: Box, clearance: number, outward: boolean): Port[] {
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const sides: Array<{ port: Point; out: number }> = [
        { port: { x: cx, y: box.y }, out: 3 },
        { port: { x: box.x + box.width, y: cy }, out: 0 },
        { port: { x: cx, y: box.y + box.height }, out: 1 },
        { port: { x: box.x, y: cy }, out: 2 },
    ];
    return sides.map(({ port, out }) => ({
        port,
        stub: { x: port.x + DX[out] * clearance, y: port.y + DY[out] * clearance },
        dir: outward ? out : (out + 2) % 4,
    }));
}

/** Minimal binary min-heap keyed on f, ties broken by insertion order (deterministic). */
class MinHeap {
    private items: Array<{ f: number; seq: number; state: number }> = [];
    private seq = 0;
    get size(): number { return this.items.length; }
    push(f: number, state: number): void {
        const item = { f, seq: this.seq++, state };
        const a = this.items;
        a.push(item);
        let i = a.length - 1;
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this.less(a[i], a[parent])) { [a[i], a[parent]] = [a[parent], a[i]]; i = parent; } else { break; }
        }
    }
    pop(): number {
        const a = this.items;
        const top = a[0];
        const last = a.pop()!;
        if (a.length > 0) {
            a[0] = last;
            let i = 0;
            for (;;) {
                const l = 2 * i + 1;
                const r = l + 1;
                let m = i;
                if (l < a.length && this.less(a[l], a[m])) { m = l; }
                if (r < a.length && this.less(a[r], a[m])) { m = r; }
                if (m === i) { break; }
                [a[i], a[m]] = [a[m], a[i]];
                i = m;
            }
        }
        return top.state;
    }
    private less(a: { f: number; seq: number }, b: { f: number; seq: number }): boolean {
        return a.f < b.f || (a.f === b.f && a.seq < b.seq);
    }
}

function uniqueSorted(values: number[]): number[] {
    const sorted = values.slice().sort((a, b) => a - b);
    const out: number[] = [];
    for (const v of sorted) {
        if (out.length === 0 || Math.abs(v - out[out.length - 1]) > 0.01) { out.push(v); }
    }
    return out;
}

/** Drop interior points that lie on a straight line between their neighbours. */
function simplify(points: Point[]): Point[] {
    const out: Point[] = [];
    for (const p of points) {
        while (out.length >= 2) {
            const a = out[out.length - 2];
            const b = out[out.length - 1];
            const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
            if (Math.abs(cross) < 0.01) { out.pop(); } else { break; }
        }
        out.push(p);
    }
    return out;
}

/**
 * Orthogonal route from a side of `from` to a side of `to` that keeps
 * `clearance` px away from every obstacle and from both endpoint boxes.
 * Returns null when no such route exists inside `bounds`.
 */
function orthogonalRoute(from: Box, to: Box, obstacles: Box[], clearance: number, bounds?: { width: number; height: number }, stats?: RouteStats): Point[] | null {
    const inflate = (b: Box): Rect => ({ x1: b.x - clearance, y1: b.y - clearance, x2: b.x + b.width + clearance, y2: b.y + b.height + clearance });
    const blockers: Rect[] = [...obstacles, from, to].map(inflate);
    const inBounds = (p: Point): boolean => !bounds || (p.x >= 0 && p.y >= 0 && p.x <= bounds.width && p.y <= bounds.height);
    const strictlyInside = (x: number, y: number): boolean => {
        for (const r of blockers) {
            if (x > r.x1 + 0.01 && x < r.x2 - 0.01 && y > r.y1 + 0.01 && y < r.y2 - 0.01) { return true; }
        }
        return false;
    };

    const starts = portsOf(from, clearance, true).filter(p => inBounds(p.stub) && !strictlyInside(p.stub.x, p.stub.y));
    const goals = portsOf(to, clearance, false).filter(p => inBounds(p.stub) && !strictlyInside(p.stub.x, p.stub.y));
    if (starts.length === 0 || goals.length === 0) { return null; }

    // Grid lines: every inflated box edge ("hug" lines), the stubs, and the
    // centre of every gap between consecutive box edges ("mid" lines).
    const hugX: number[] = [];
    const hugY: number[] = [];
    for (const r of blockers) { hugX.push(r.x1, r.x2); hugY.push(r.y1, r.y2); }
    const edgesX: number[] = [];
    const edgesY: number[] = [];
    for (const b of [...obstacles, from, to]) { edgesX.push(b.x, b.x + b.width); edgesY.push(b.y, b.y + b.height); }
    const mids = (edges: number[]): number[] => {
        const e = uniqueSorted(edges);
        const out: number[] = [];
        for (let i = 1; i < e.length; i++) {
            if (e[i] - e[i - 1] > 2 * clearance) { out.push((e[i] + e[i - 1]) / 2); }
        }
        return out;
    };
    const stubX = [...starts, ...goals].map(p => p.stub.x);
    const stubY = [...starts, ...goals].map(p => p.stub.y);
    const keep = (v: number, max?: number): boolean => max === undefined || (v >= 0 && v <= max);
    let xs = uniqueSorted([...hugX, ...stubX, ...mids(edgesX)]).filter(v => keep(v, bounds?.width));
    let ys = uniqueSorted([...hugY, ...stubY, ...mids(edgesY)]).filter(v => keep(v, bounds?.height));
    if (xs.length * ys.length > MAX_GRID_NODES) {
        // Over budget: drop the channel-centre lines first ...
        xs = uniqueSorted([...hugX, ...stubX]).filter(v => keep(v, bounds?.width));
        ys = uniqueSorted([...hugY, ...stubY]).filter(v => keep(v, bounds?.height));
    }
    if (xs.length * ys.length > MAX_GRID_NODES) {
        // ... then search only a window around the two boxes ...
        const wx1 = Math.min(from.x, to.x) - ROUTE_WINDOW_MARGIN;
        const wx2 = Math.max(from.x + from.width, to.x + to.width) + ROUTE_WINDOW_MARGIN;
        const wy1 = Math.min(from.y, to.y) - ROUTE_WINDOW_MARGIN;
        const wy2 = Math.max(from.y + from.height, to.y + to.height) + ROUTE_WINDOW_MARGIN;
        xs = xs.filter(v => v >= wx1 && v <= wx2);
        ys = ys.filter(v => v >= wy1 && v <= wy2);
    }
    if (xs.length * ys.length > MAX_GRID_NODES) {
        // ... and give up (the caller keeps the straight line) rather than
        // allocate a search larger than the budget.
        stats?.refused.push(xs.length * ys.length);
        return null;
    }
    stats?.gridNodes.push(xs.length * ys.length);
    const hugXSet = new Set(hugX.map(v => v.toFixed(2)));
    const hugYSet = new Set(hugY.map(v => v.toFixed(2)));
    const xWeight = xs.map(v => (hugXSet.has(v.toFixed(2)) ? HUG_WEIGHT : 1));
    const yWeight = ys.map(v => (hugYSet.has(v.toFixed(2)) ? HUG_WEIGHT : 1));
    // Every stub coordinate is a grid line by construction (same bounds
    // filter), so the lookup returns the first line at or above it.
    const indexOf = (arr: number[], v: number): number => {
        let lo = 0;
        let hi = arr.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (arr[mid] < v - 0.01) { lo = mid + 1; } else { hi = mid; }
        }
        return lo;
    };

    const nx = xs.length;
    const ny = ys.length;
    const nodeCount = nx * ny;
    // Blocked grid nodes and segments, precomputed per blocker from index
    // ranges (binary search) instead of testing every blocker per step. A
    // segment between consecutive lines is blocked when its midpoint lies
    // strictly inside a blocker: both its ends may sit on the blocker's frame.
    const midX = xs.slice(1).map((v, i) => (v + xs[i]) / 2);
    const midY = ys.slice(1).map((v, i) => (v + ys[i]) / 2);
    const strictRange = (arr: number[], lo: number, hi: number): [number, number] => {
        let a = 0;
        let b = arr.length;
        while (a < b) { const m = (a + b) >> 1; if (arr[m] > lo + 0.01) { b = m; } else { a = m + 1; } }
        const first = a;
        a = first;
        b = arr.length;
        while (a < b) { const m = (a + b) >> 1; if (arr[m] < hi - 0.01) { a = m + 1; } else { b = m; } }
        return [first, a - 1];
    };
    const nodeBlocked = new Uint8Array(nodeCount);
    const hBlocked = new Uint8Array(nodeCount); // segment (ix, iy) -> (ix + 1, iy)
    const vBlocked = new Uint8Array(nodeCount); // segment (ix, iy) -> (ix, iy + 1)
    for (const r of blockers) {
        const [x0, x1] = strictRange(xs, r.x1, r.x2);
        const [y0, y1] = strictRange(ys, r.y1, r.y2);
        const [hx0, hx1] = strictRange(midX, r.x1, r.x2);
        const [vy0, vy1] = strictRange(midY, r.y1, r.y2);
        for (let iy = y0; iy <= y1; iy++) {
            for (let ix = x0; ix <= x1; ix++) { nodeBlocked[iy * nx + ix] = 1; }
            for (let ix = hx0; ix <= hx1; ix++) { hBlocked[iy * nx + ix] = 1; }
        }
        for (let ix = x0; ix <= x1; ix++) {
            for (let iy = vy0; iy <= vy1; iy++) { vBlocked[iy * nx + ix] = 1; }
        }
    }

    const goalByNode = new Map<number, Port[]>();
    for (const g of goals) {
        const k = indexOf(ys, g.stub.y) * nx + indexOf(xs, g.stub.x);
        goalByNode.set(k, [...(goalByNode.get(k) ?? []), g]);
    }

    const heuristic = (ix: number, iy: number): number => {
        let best = Infinity;
        for (const g of goals) {
            best = Math.min(best, Math.abs(xs[ix] - g.stub.x) + Math.abs(ys[iy] - g.stub.y));
        }
        return best;
    };

    // State = node * 4 + direction of arrival. Virtual goal states follow.
    const stateCount = nodeCount * 4;
    const gCost = new Float64Array(stateCount + goals.length).fill(Infinity);
    const prev = new Int32Array(stateCount + goals.length).fill(-1);
    const startPort = new Map<number, Port>();
    const heap = new MinHeap();
    for (const s of starts) {
        const ix = indexOf(xs, s.stub.x);
        const iy = indexOf(ys, s.stub.y);
        const state = (iy * nx + ix) * 4 + s.dir;
        gCost[state] = clearance;
        startPort.set(state, s);
        heap.push(clearance + heuristic(ix, iy), state);
    }

    let found = -1;
    while (heap.size > 0) {
        const state = heap.pop();
        if (state >= stateCount) { found = state; break; }
        const g = gCost[state];
        const node = state >> 2;
        const dir = state & 3;
        const ix = node % nx;
        const iy = (node - ix) / nx;

        const arrivals = goalByNode.get(node);
        if (arrivals) {
            for (const a of arrivals) {
                const gi = stateCount + goals.indexOf(a);
                const cost = g + clearance + (dir === a.dir ? 0 : BEND_PENALTY);
                if (cost < gCost[gi]) { gCost[gi] = cost; prev[gi] = state; heap.push(cost, gi); }
            }
        }

        for (let d = 0; d < 4; d++) {
            if (d === (dir + 2) % 4) { continue; }
            const jx = ix + DX[d];
            const jy = iy + DY[d];
            if (jx < 0 || jy < 0 || jx >= nx || jy >= ny || nodeBlocked[jy * nx + jx]) { continue; }
            const segment = d % 2 === 0
                ? hBlocked[iy * nx + Math.min(ix, jx)]
                : vBlocked[Math.min(iy, jy) * nx + ix];
            if (segment) { continue; }
            const length = Math.abs(xs[jx] - xs[ix]) + Math.abs(ys[jy] - ys[iy]);
            const weight = d % 2 === 0 ? yWeight[iy] : xWeight[ix];
            const cost = g + length * weight + (d === dir ? 0 : BEND_PENALTY);
            const next = (jy * nx + jx) * 4 + d;
            if (cost < gCost[next]) {
                gCost[next] = cost;
                prev[next] = state;
                heap.push(cost + heuristic(jx, jy), next);
            }
        }
    }
    if (found < 0) { return null; }

    const goal = goals[found - stateCount];
    const trail: Point[] = [goal.port];
    let state = prev[found];
    let first = state;
    while (state >= 0) {
        const node = state >> 2;
        const ix = node % nx;
        const iy = (node - ix) / nx;
        trail.push({ x: xs[ix], y: ys[iy] });
        first = state;
        state = prev[state];
    }
    trail.push(startPort.get(first)!.port);
    return simplify(trail.reverse());
}

export interface RouteOptions {
    /** Canvas extent; no returned point leaves it (unless no route exists). */
    bounds?: { width: number; height: number };
    /**
     * Lane offset (px) for one direction of a bidirectional pair. The route
     * is offset by this much and the offset result is what gets validated,
     * so the final line never enters an obstacle or leaves the canvas.
     */
    laneOffset?: number;
    /** Instrumentation for tests. */
    stats?: RouteStats;
}

/**
 * Route one relationship from `from` to `to` around `obstacles` (#419).
 *
 * The first point lies on the border of `from`, the last on the border of
 * `to`. Candidates, in order: the straight nearest-sides line; an orthogonal
 * route keeping ROUTE_CLEARANCE px from every box; the same with less
 * clearance. Each candidate is offset by `laneOffset` first and accepted only
 * if the final line crosses no obstacle and stays inside `bounds`. With no
 * acceptable candidate (no route exists) the straight line is returned.
 * Boxes that overlap (a parent and its child) always get the straight line.
 * Pure — exported for unit tests.
 */
export function routeAroundObstacles(from: Box, to: Box, obstacles: Box[], options: RouteOptions = {}): Point[] {
    const lane = options.laneOffset ?? 0;
    const finish = (points: Point[]): Point[] => (lane ? offsetPolyline(points, lane) : points);
    const bounds = options.bounds;
    const inCanvas = (points: Point[]): boolean => !bounds
        || points.every(p => p.x >= -0.01 && p.y >= -0.01 && p.x <= bounds.width + 0.01 && p.y <= bounds.height + 0.01);
    const acceptable = (points: Point[]): boolean => inCanvas(points) && polylineLengthInBoxes(points, obstacles) <= 1;

    const crossing = (points: Point[]): number => polylineLengthInBoxes(points, obstacles);
    const direct = calculateOptimalConnectionPoints(from, to);
    const unshiftedStraight = [direct.from, direct.to];
    const straight = finish(unshiftedStraight);
    if (boxesOverlap(from, to) || acceptable(straight)) {
        return straight;
    }
    // Candidates in order of preference; the first that is clear (no obstacle
    // crossed, inside the canvas) wins: the lane-shifted straight line, the
    // lane-shifted orthogonal routes, then (one shared lane) the unshifted
    // straight line and the unshifted routes.
    const clearances = lane ? [ROUTE_CLEARANCE, ROUTE_CLEARANCE / 3 + lane, ROUTE_CLEARANCE / 3] : [ROUTE_CLEARANCE, ROUTE_CLEARANCE / 3];
    const candidates: Array<{ points: Point[]; shifted: boolean }> = [{ points: straight, shifted: lane !== 0 }];
    const routes: Point[][] = [];
    for (const clearance of clearances) {
        const route = orthogonalRoute(from, to, obstacles, clearance, bounds, options.stats);
        if (route && route.length >= 2) {
            routes.push(route);
            const final = finish(route);
            if (acceptable(final)) {
                return final;
            }
            candidates.push({ points: final, shifted: lane !== 0 });
        }
    }
    if (lane) {
        for (const points of [unshiftedStraight, ...routes]) {
            if (acceptable(points)) {
                return points;
            }
            candidates.push({ points, shifted: false });
        }
    }
    // Nothing is clear (no route exists, or the grid search was refused for
    // its size): the in-canvas candidate that crosses the least, unshifted on
    // a tie. Counted in stats.fallbacks.
    const ranked = candidates
        .filter(c => inCanvas(c.points))
        .map((c, order) => ({ ...c, order, length: crossing(c.points) }))
        .sort((a, b) => (a.length - b.length) || (Number(a.shifted) - Number(b.shifted)) || (a.order - b.order));
    const chosen = ranked.length > 0 ? ranked[0].points : unshiftedStraight;
    options.stats?.fallbacks?.push(crossing(chosen));
    return chosen;
}

/**
 * Offset a polyline `amount` px to the right of its direction of travel,
 * mitring the corners. For a two-point line this is offsetPerpendicular.
 * Applied with the same sign to both directions of a bidirectional pair, the
 * two lines separate onto opposite sides. Pure — exported for unit tests.
 */
export function offsetPolyline(points: Point[], amount: number): Point[] {
    if (points.length < 2) { return points.slice(); }
    const normals: Point[] = [];
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const length = Math.hypot(dx, dy) || 1;
        normals.push({ x: -dy / length, y: dx / length });
    }
    return points.map((p, i) => {
        if (i === 0) { return { x: p.x + normals[0].x * amount, y: p.y + normals[0].y * amount }; }
        if (i === points.length - 1) {
            const n = normals[normals.length - 1];
            return { x: p.x + n.x * amount, y: p.y + n.y * amount };
        }
        const a = normals[i - 1];
        const b = normals[i];
        const denom = 1 + a.x * b.x + a.y * b.y;
        if (denom < 0.1) { return { x: p.x + a.x * amount, y: p.y + a.y * amount }; }
        return { x: p.x + ((a.x + b.x) / denom) * amount, y: p.y + ((a.y + b.y) / denom) * amount };
    });
}

/**
 * Label anchor for a drawn polyline: the midpoint of its longest segment
 * (for a straight line, its midpoint). Pure — exported for unit tests.
 */
export function polylineLabelPoint(points: Point[]): Point {
    if (points.length === 0) { return { x: 0, y: 0 }; }
    if (points.length === 1) { return points[0]; }
    let best = 1;
    let bestLength = -1;
    for (let i = 1; i < points.length; i++) {
        const length = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
        if (length > bestLength + 0.01) { bestLength = length; best = i; }
    }
    return { x: (points[best - 1].x + points[best].x) / 2, y: (points[best - 1].y + points[best].y) / 2 };
}

/** SVG `d` for a drawn polyline, in the comma form the renderer always used. */
export function formatPolylineD(points: Point[]): string {
    return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
}

/** Distance (px) from a point to the border of a box (0 when on it). */
export function distanceToBoxBorder(p: Point, box: Box): number {
    const dx = Math.max(box.x - p.x, 0, p.x - (box.x + box.width));
    const dy = Math.max(box.y - p.y, 0, p.y - (box.y + box.height));
    if (dx > 0 || dy > 0) { return Math.hypot(dx, dy); }
    return Math.min(p.x - box.x, box.x + box.width - p.x, p.y - box.y, box.y + box.height - p.y);
}

/** Lateral offset (px) applied to each line of a bidirectional pair. */
export const BIDIRECTIONAL_EDGE_OFFSET = 10;

/**
 * Ids of relationships that form a bidirectional pair: an edge A→B for which
 * a reverse edge B→A also exists. Pure — exported for unit tests.
 */
export function findReversePairIds(relationships: Array<{ id: string; relationship: { from: string; to: string } }>): Set<string> {
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
