import { VISUAL_LAYOUT_PROTOCOL_VERSION } from './visualLayoutProtocol';
import { emitLiveRegion } from './webviewA11y';
import { LEGEND_CATALOG, type LegendItem } from './legendCatalog';
import { ELEMENT_STYLE_CLIENT_FUNCTIONS } from '../render/elementStyle';
import { SHAPE_GEOMETRY_CLIENT_FUNCTIONS } from '../render/shapeGeometry';
import { TEXT_LAYOUT_CLIENT_FUNCTIONS, TEXT_METRICS } from '../render/textLayout';
import { BOUNDARY_LABEL_CLIENT_FUNCTIONS } from '../render/boundaryLabel';
import { KEY_CLIENT_FUNCTIONS } from '../render/KeyRenderer';
import { DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS } from '../render/deploymentNotation';
import { BUNDLED_SPRITE_IDS } from '../assets/spriteIds';
import { draftStyleElements, isValidElementStyleInputs, paintNodeWithStyle } from './elementStyleClient';
import { dropInvalidPersistedAdds, dropUnmovableBoundaryEdits, formatUnmovableBoundaryNotice, isPersistedAddRelationshipList, type PersistedDraftState, type PersistedStagedEdit } from './draftState';
import {
    INSPECTOR_LABEL_MAX,
    INSPECTOR_TECH_MAX,
    INSPECTOR_TAG_COUNT_MAX,
    INSPECTOR_TAG_LENGTH_MAX,
    INSPECTOR_TAG_RE,
    validateLabel,
    validateTechnology,
    validateTagsString,
} from './inspectorValidators';

// Re-export constants so tests can verify alignment with the shared module.
export { INSPECTOR_LABEL_MAX, INSPECTOR_TECH_MAX, INSPECTOR_TAG_COUNT_MAX, INSPECTOR_TAG_LENGTH_MAX };

/**
 * Serialize a shared validator for verbatim embedding into the webview script.
 * When this module is loaded through a tsc/ts-node CommonJS pipeline (e.g. the
 * Playwright harness generator), references to exported consts inside the
 * function source are qualified as `exports.X` — which does not exist in the
 * webview and throws `exports is not defined`. The template below declares the
 * same constants as locals, so stripping the qualification is safe; under
 * esbuild (extension bundle) the sources contain no `exports.` and the replace
 * is a no-op.
 */
function embedForWebview(fn: (...args: never[]) => unknown): string {
    return fn.toString().replace(/\bexports\./g, '');
}

export function formatMoveAnnouncement(
    elementName: string,
    x: number,
    y: number,
    moveCounter: number
): string {
    return `${elementName} moved to ${x}, ${y} (${moveCounter})`;
}

/**
 * Format an announcement string for a multi-select group move.
 * Exported for unit tests.
 */
export function formatMultiSelectAnnouncement(count: number): string {
    return `${count} element${count === 1 ? '' : 's'} selected`;
}

/**
 * How far, in screen pixels, the pointer must travel from pointer-down before
 * a press on a node or boundary becomes a drag (#251). Below it the gesture is
 * a click: it selects and never stages a move. Screen pixels, not SVG units, so
 * the tolerance for hand jitter does not change with zoom.
 */
export const DRAG_THRESHOLD_PX = 4;

/** The larger threshold for touch and pen, whose contact point jitters more than a mouse (#254). */
export const COARSE_DRAG_THRESHOLD_PX = 10;

/** The drag threshold for a pointer type: `coarsePx` for touch and pen, `mousePx` otherwise. */
export function dragThresholdFor(pointerType: string | undefined, mousePx: number, coarsePx: number): number {
    return pointerType === 'touch' || pointerType === 'pen' ? coarsePx : mousePx;
}

/**
 * The one delta a group drag applies to every member (#252, #254). The raw
 * pointer delta is rounded once, and clamped so that no member's rounded start
 * plus the delta falls below 0, so the group stops at the canvas edge as a unit
 * instead of squashing against it. Members are placed at round(start) + delta,
 * so each moves by the identical whole-unit delta.
 */
export function sharedDragDelta(
    starts: ReadonlyArray<{ x: number; y: number }>,
    dx: number,
    dy: number
): { dx: number; dy: number } {
    let minX = Infinity;
    let minY = Infinity;
    for (const start of starts) {
        minX = Math.min(minX, Math.round(start.x));
        minY = Math.min(minY, Math.round(start.y));
    }
    const floorX = Number.isFinite(minX) ? -minX : -Infinity;
    const floorY = Number.isFinite(minY) ? -minY : -Infinity;
    const rx = Number.isFinite(dx) ? Math.round(dx) : 0;
    const ry = Number.isFinite(dy) ? Math.round(dy) : 0;
    return { dx: Math.max(rx, floorX) + 0, dy: Math.max(ry, floorY) + 0 };
}

/** True once the pointer has moved at least `threshold` screen pixels from where it went down. */
export function hasPassedDragThreshold(
    startClientX: number,
    startClientY: number,
    clientX: number,
    clientY: number,
    threshold: number
): boolean {
    const dx = clientX - startClientX;
    const dy = clientY - startClientY;
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return false;
    }
    return dx * dx + dy * dy >= threshold * threshold;
}

/**
 * True when a pointer gesture ends where it started, at the whole-unit
 * precision the canvas writes. Such a move must never be staged or written
 * back (#251): an unrounded auto-layout start such as 609.0119565375295 and
 * its rounded canvas position 609 are the same place.
 */
export function isZeroDeltaMove(
    start: { x: number; y: number },
    end: { x: number; y: number }
): boolean {
    return Math.round(start.x) === Math.round(end.x) && Math.round(start.y) === Math.round(end.y);
}

/** A frame or node as `planBoundaryMove` sees it: layout position, pinning, current position. */
export interface BoundaryMoveItem {
    id: string;
    /** Position in the layout snapshot. */
    x: number;
    y: number;
    /** Where the editor currently shows it (after earlier, unsaved moves). */
    currentX: number;
    currentY: number;
    /** Pinned by an authored or staged coordinate on that axis. */
    pinnedX: boolean;
    pinnedY: boolean;
    childNodeIds?: string[];
    childBoundaryIds?: string[];
}

/**
 * Where every descendant of a moved boundary goes, axis by axis, by the rules
 * the host applies on save (DagreLayoutEngine.applyBoundaryManualGeometry): an
 * unpinned descendant follows its parent's displacement; a pinned one stays
 * where it is now, and its own contents follow ITS displacement on that axis,
 * so a staged nested move survives a later move of its parent.
 * Pure — exported for unit tests and embedded in the webview (#339).
 */
export function planBoundaryMove(
    movedId: string,
    dx: number,
    dy: number,
    boundaries: BoundaryMoveItem[],
    nodes: BoundaryMoveItem[],
): { boundaries: Array<{ id: string; x: number; y: number }>; nodes: Array<{ id: string; x: number; y: number }> } {
    const boundaryById = new Map(boundaries.map(b => [b.id, b]));
    const nodeById = new Map(nodes.map(n => [n.id, n]));
    const plan: { boundaries: Array<{ id: string; x: number; y: number }>; nodes: Array<{ id: string; x: number; y: number }> } =
        { boundaries: [], nodes: [] };
    const visited = new Set([movedId]);
    const walk = (frame: BoundaryMoveItem, ax: number, ay: number): void => {
        for (const nodeId of frame.childNodeIds || []) {
            const node = nodeById.get(nodeId);
            if (!node) { continue; }
            plan.nodes.push({
                id: node.id,
                x: node.pinnedX ? node.currentX : node.x + ax,
                y: node.pinnedY ? node.currentY : node.y + ay,
            });
        }
        for (const childId of frame.childBoundaryIds || []) {
            if (visited.has(childId)) { continue; }
            visited.add(childId);
            const child = boundaryById.get(childId);
            if (!child) { continue; }
            const nextX = child.pinnedX ? child.currentX : child.x + ax;
            const nextY = child.pinnedY ? child.currentY : child.y + ay;
            plan.boundaries.push({ id: child.id, x: nextX, y: nextY });
            // Contents follow the child's own displacement: zero for a frame
            // pinned where the layout put it, the staged step for a frame the
            // user already moved, the parent's step for an unpinned frame.
            walk(child, nextX - child.x, nextY - child.y);
        }
    };
    const moved = boundaryById.get(movedId);
    if (moved) {
        walk(moved, dx, dy);
    }
    return plan;
}

/**
 * Where a finished pointer drag leaves an element, and whether to stage it.
 * The canvas rounds every drag frame, so a drag that comes back home ends at
 * the rounded start (609), not the auto-layout start (609.0119565375295). A
 * zero-delta drag therefore returns the exact start to restore, and stages
 * nothing; a real move keeps its rounded end position and is staged (#251).
 */
export function settlePointerMove(
    start: { x: number; y: number },
    end: { x: number; y: number }
): { stage: boolean; x: number; y: number } {
    if (isZeroDeltaMove(start, end)) {
        return { stage: false, x: start.x, y: start.y };
    }
    return { stage: true, x: end.x, y: end.y };
}

/**
 * Whether pressing a node keeps the current selection rather than replacing
 * it (#252). Pressing any member of a multi-selection must keep the set so
 * the drag that follows moves the group; a click without a drag then narrows
 * the selection to that node on release.
 */
export function pointerDownKeepsSelection(selectedIds: readonly string[], pressedId: string): boolean {
    return selectedIds.length > 1 && selectedIds.indexOf(pressedId) !== -1;
}

export interface EdgeEndpoint {
    x: number;
    y: number;
}

export interface EdgeEndpoints {
    from: EdgeEndpoint;
    to: EdgeEndpoint;
}

/** Minimal structural DOM surface so applyEdgeGeometry stays unit-testable. */
export interface AttributeTarget {
    setAttribute(name: string, value: string): void;
}

export interface EdgeElementLike {
    querySelectorAll(selectors: string): ArrayLike<AttributeTarget>;
    querySelector(selectors: string): AttributeTarget | null;
}

/**
 * Format the straight-line `d` attribute for an edge between two endpoints.
 * Pure — no DOM access. Exported for unit tests.
 */
export function formatEdgePathD(points: EdgeEndpoints): string {
    return 'M' + points.from.x.toFixed(2) + ',' + points.from.y.toFixed(2) +
        ' L' + points.to.x.toFixed(2) + ',' + points.to.y.toFixed(2);
}

/**
 * Repaint an edge group (`g.edge`) after an endpoint node moved.
 * Updates EVERY descendant `path` — both the transparent hit-area and the
 * visible stroke — then re-centres the label. Updating only the first `path`
 * leaves the visible line behind (UAT regression, 2026-07).
 * Exported for unit tests; injected into the webview below.
 */
export function applyEdgeGeometry(edgeEl: EdgeElementLike, points: EdgeEndpoints): void {
    const d = formatEdgePathD(points);
    const paths = edgeEl.querySelectorAll('path');
    for (let i = 0; i < paths.length; i++) {
        paths[i].setAttribute('d', d);
    }
    const label = edgeEl.querySelector('text');
    if (label) {
        // #421: with a technology line the label baseline sits 3.5 px above the
        // centre of the block and the technology baseline 9.5 px below it, as the render drew them.
        const tech = edgeEl.querySelector('text[data-field="relationship-technology"]');
        const mid = ((points.from.y + points.to.y) / 2) - 6;
        const x = ((points.from.x + points.to.x) / 2).toFixed(2);
        label.setAttribute('x', x);
        label.setAttribute('y', (tech ? mid - 3.5 : mid).toFixed(2));
        if (tech) {
            tech.setAttribute('x', x);
            tech.setAttribute('y', (mid + 9.5).toFixed(2));
        }
    }
}

/** DOM surface for saving and restoring an edge's rendered geometry (#419). */
export interface ReadableAttributeTarget extends AttributeTarget {
    getAttribute(name: string): string | null;
}

export interface RestorableEdgeElement {
    getAttribute(name: string): string | null;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
    querySelectorAll(selectors: string): ArrayLike<ReadableAttributeTarget>;
    querySelector(selectors: string): ReadableAttributeTarget | null;
}

/**
 * Save an edge's rendered path and label position once, before the first
 * live repaint replaces its routed polyline (#419). Exported for unit tests;
 * injected into the webview below.
 */
export function rememberEdgeGeometry(edgeEl: RestorableEdgeElement): void {
    const path = edgeEl.querySelectorAll('path')[0];
    if (edgeEl.getAttribute('data-rendered-d') !== null || !path) {
        return;
    }
    edgeEl.setAttribute('data-rendered-d', path.getAttribute('d') ?? '');
    const label = edgeEl.querySelector('text');
    if (label) {
        edgeEl.setAttribute('data-rendered-label', (label.getAttribute('x') ?? '') + ',' + (label.getAttribute('y') ?? ''));
    }
    const tech = edgeEl.querySelector('text[data-field="relationship-technology"]');
    if (tech) {
        edgeEl.setAttribute('data-rendered-tech', (tech.getAttribute('x') ?? '') + ',' + (tech.getAttribute('y') ?? ''));
    }
}

/**
 * Put back the geometry rememberEdgeGeometry saved, when both endpoints are
 * back where the render drew them (a cancelled or zero-distance drag), so a
 * routed edge does not stay straight through another box (#419).
 * Exported for unit tests; injected into the webview below.
 */
export function restoreEdgeGeometry(edgeEl: RestorableEdgeElement): void {
    const d = edgeEl.getAttribute('data-rendered-d');
    if (d === null) {
        return;
    }
    const paths = edgeEl.querySelectorAll('path');
    for (let i = 0; i < paths.length; i++) {
        paths[i].setAttribute('d', d);
    }
    const label = edgeEl.querySelector('text');
    const saved = edgeEl.getAttribute('data-rendered-label');
    if (label && saved !== null) {
        const [x, y] = saved.split(',');
        label.setAttribute('x', x);
        label.setAttribute('y', y);
    }
    const tech = edgeEl.querySelector('text[data-field="relationship-technology"]');
    const savedTech = edgeEl.getAttribute('data-rendered-tech');
    if (tech && savedTech !== null) {
        const [tx, ty] = savedTech.split(',');
        tech.setAttribute('x', tx);
        tech.setAttribute('y', ty);
    }
    edgeEl.removeAttribute('data-rendered-d');
    edgeEl.removeAttribute('data-rendered-label');
    edgeEl.removeAttribute('data-rendered-tech');
}

export interface ViewBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface NodeBounds {
    x: number;
    y: number;
    width: number;
    height: number;
    /**
     * Where the node's outline crosses each side's midline (#323), from
     * `shapeSideInsets` (src/render/shapeGeometry.ts). Absent: the bounding box.
     */
    insets?: { top: number; right: number; bottom: number; left: number };
}

/**
 * Bounding box of a set of node boxes, or null when the set is empty or
 * degenerate. Pure — exported for unit tests.
 */
export function computeContentBounds(
    nodes: NodeBounds[],
): { x: number; y: number; w: number; h: number } | null {
    if (nodes.length === 0) {
        return null;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.width);
        maxY = Math.max(maxY, node.y + node.height);
    }

    const w = maxX - minX;
    const h = maxY - minY;
    if (!(w > 0) || !(h > 0)) {
        return null;
    }
    return { x: minX, y: minY, w, h };
}

/**
 * Calculate optimal connection points between two boxes using directional penalty scoring.
 * Matches EdgeRouter.ts:calculateOptimalConnectionPoints line-for-line.
 * Pure — no DOM access. Exported for unit tests.
 */
export function computeOptimalConnectionPoints(
    from: NodeBounds,
    to: NodeBounds
): EdgeEndpoints {
    // Points sit on the outline where it crosses each side's midline (#323).
    const none = { top: 0, right: 0, bottom: 0, left: 0 };
    const fi = from.insets || none;
    const ti = to.insets || none;
    const fromPoints = [
        { x: from.x + from.width / 2, y: from.y + fi.top, edge: 'top' },
        { x: from.x + from.width - fi.right, y: from.y + from.height / 2, edge: 'right' },
        { x: from.x + from.width / 2, y: from.y + from.height - fi.bottom, edge: 'bottom' },
        { x: from.x + fi.left, y: from.y + from.height / 2, edge: 'left' }
    ];

    const toPoints = [
        { x: to.x + to.width / 2, y: to.y + ti.top, edge: 'top' },
        { x: to.x + to.width - ti.right, y: to.y + to.height / 2, edge: 'right' },
        { x: to.x + to.width / 2, y: to.y + to.height - ti.bottom, edge: 'bottom' },
        { x: to.x + ti.left, y: to.y + to.height / 2, edge: 'left' }
    ];

    const isBelow = to.y >= from.y + from.height;
    const isAbove = from.y >= to.y + to.height;
    const isRight = to.x >= from.x + from.width;
    const isLeft = from.x >= to.x + to.width;

    let minScore = Infinity;
    let bestFrom = fromPoints[0];
    let bestTo = toPoints[0];

    for (let i = 0; i < fromPoints.length; i++) {
        const fp = fromPoints[i];
        for (let j = 0; j < toPoints.length; j++) {
            const tp = toPoints[j];
            const dist = Math.sqrt(
                Math.pow(tp.x - fp.x, 2) + Math.pow(tp.y - fp.y, 2)
            );

            let penalty = 0;
            if (isBelow) {
                if (fp.edge !== 'bottom') penalty += 150;
                if (tp.edge !== 'top') penalty += 150;
            } else if (isAbove) {
                if (fp.edge !== 'top') penalty += 150;
                if (tp.edge !== 'bottom') penalty += 150;
            } else if (isRight) {
                if (fp.edge !== 'right') penalty += 150;
                if (tp.edge !== 'left') penalty += 150;
            } else if (isLeft) {
                if (fp.edge !== 'left') penalty += 150;
                if (tp.edge !== 'right') penalty += 150;
            }

            const score = dist + penalty;
            if (score < minScore) {
                minScore = score;
                bestFrom = fp;
                bestTo = tp;
            }
        }
    }

    if (minScore === Infinity) {
        bestFrom = fromPoints[1];
        bestTo = toPoints[3];
    }

    return {
        from: { x: bestFrom.x, y: bestFrom.y },
        to: { x: bestTo.x, y: bestTo.y }
    };
}

/** The frame of a boundary as the editor currently knows it. */
export interface BoundaryWrapFrame {
    x: number;
    y: number;
    width: number;
    height: number;
    /** True when `$x` is authored on the subgraph, or a boundary move is staged. */
    manualX?: boolean;
    /** True when `$y` is authored on the subgraph, or a boundary move is staged. */
    manualY?: boolean;
    /** Authored `$w` (or a staged resize width). A minimum, never a cap. */
    manualWidth?: number;
    /** Authored `$h` (or a staged resize height). A minimum, never a cap. */
    manualHeight?: number;
}

/** Padding a boundary frame leaves around its children. Host defaults. */
export interface BoundaryWrapPadding {
    paddingX: number;
    paddingTop: number;
    paddingBottom: number;
    /** Narrowest frame that holds the boundary's label (#324); 0 or absent for none. */
    minWidth: number;
}

/**
 * The frame a boundary must occupy to contain `children`.
 *
 * Line-for-line mirror of `DagreLayoutEngine.adjustBoundariesToContainChildren`
 * so the editor's live preview and the layout the host computes on save agree
 * (#163). Four rules that the earlier inline re-wrap got wrong:
 *
 *   1. A manual origin is kept. `$x`/`$y` (or a staged boundary move) pins the
 *      frame; only an auto frame wraps to the child bounding box.
 *   2. `$w`/`$h` are minima, clamped up to fit the children — never a size the
 *      frame shrinks back to, and never a cap that clips content.
 *   3. Nested boundary frames count as children, exactly like leaf nodes.
 *   4. Size is measured from the frame's ACTUAL origin out to the far edge of
 *      the children, not from the child bounding-box extent. The two only
 *      agree while the origin auto-wraps; once it is pinned, the gap between
 *      the origin and the nearest child is real space the frame must span.
 *
 * Coordinate space: absolute SVG user units, the same space the layout
 * snapshot and the rendered `<rect>` use. `children` are already positioned in
 * it — this function never moves a child, only the frame around them.
 *
 * No clamp to zero. The host does not clamp a boundary either: it lets the
 * frame go negative and then translates the whole scene in `normalizeOrigin`.
 * Clamping the frame alone would change its geometry relative to its children,
 * which is the very divergence this helper exists to close.
 *
 * Pure — no DOM access, no module scope. Exported for unit tests and embedded
 * verbatim in the webview script.
 */
export function computeBoundaryWrap(
    frame: BoundaryWrapFrame,
    children: NodeBounds[],
    options?: Partial<BoundaryWrapPadding>,
): { x: number; y: number; width: number; height: number } {
    const paddingX = options && options.paddingX !== undefined ? options.paddingX : 40;
    const paddingTop = options && options.paddingTop !== undefined ? options.paddingTop : 60;
    const paddingBottom = options && options.paddingBottom !== undefined ? options.paddingBottom : 40;

    if (children.length === 0) {
        // Nothing to contain: honour explicit sizes as-is, otherwise leave the
        // empty computed frame alone.
        // A bottom-left label still has to fit (#324): the host raises an empty
        // frame to the label's width and bottom reserve when the theme has one.
        const labelWidth = options && options.minWidth !== undefined ? options.minWidth : 0;
        const emptyWidth = frame.manualWidth !== undefined ? frame.manualWidth : frame.width;
        const emptyHeight = frame.manualHeight !== undefined ? frame.manualHeight : frame.height;
        return {
            x: frame.x,
            y: frame.y,
            width: labelWidth > 0 ? Math.max(emptyWidth, labelWidth) : emptyWidth,
            height: labelWidth > 0 ? Math.max(emptyHeight, paddingBottom) : emptyHeight,
        };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const child of children) {
        minX = Math.min(minX, child.x);
        minY = Math.min(minY, child.y);
        maxX = Math.max(maxX, child.x + child.width);
        maxY = Math.max(maxY, child.y + child.height);
    }

    const x = frame.manualX ? frame.x : minX - paddingX;
    const y = frame.manualY ? frame.y : minY - paddingTop;

    const requiredWidth = (maxX + paddingX) - x;
    const requiredHeight = (maxY + paddingBottom) - y;

    const width = frame.manualWidth !== undefined ? Math.max(frame.manualWidth, requiredWidth) : requiredWidth;
    return {
        x,
        y,
        width: options && options.minWidth !== undefined ? Math.max(width, options.minWidth) : width,
        height: frame.manualHeight !== undefined ? Math.max(frame.manualHeight, requiredHeight) : requiredHeight,
    };
}

/**
 * Offset of a boundary's label from its frame origin. Mirrors
 * `BoundaryRenderer.renderBoundary`, which puts the label at
 * `x + 10`, `y + fontSize + 6` with a 14px font. Kept as constants so the
 * editor moves the label to the same place the host renders it (#163).
 */
export const BOUNDARY_LABEL_OFFSET_X = 10;
export const BOUNDARY_LABEL_OFFSET_Y = 20;

/**
 * Pan that puts the centre of the content on the centre of the viewport,
 * expressed in the same SVG units the camera uses. Pure — exported for tests.
 *
 * `applyZoomPan` places the window centre at `anchorCentre − pan`, so the pan
 * that centres the content is simply the offset between the two centres. It is
 * deliberately NOT scaled by zoom: the window is anchored in canvas units, so
 * multiplying by zoom (as the pre-#160 code did) left the content off-centre by
 * a factor that grew as the zoom moved away from 1.0.
 */
export function computeCentringPan(
    nodes: NodeBounds[],
    anchorBox: ViewBox,
): { panX: number; panY: number } {
    const content = computeContentBounds(nodes);
    if (!content) {
        return { panX: 0, panY: 0 };
    }
    return {
        panX: anchorBox.x + anchorBox.w / 2 - (content.x + content.w / 2),
        panY: anchorBox.y + anchorBox.h / 2 - (content.y + content.h / 2),
    };
}

/**
 * Compute a zoom+pan that fits all nodes within the viewport with the given
 * padding on each side. Returns updated zoom, panX, panY values.
 * Pure — no DOM access. Exported for unit tests.
 *
 * @param nodes       Array of node bounding boxes (in SVG/canvas coordinates).
 * @param anchorBox   The render-time SVG viewBox the camera is anchored to.
 * @param padding     Padding to leave around the content on each side (default 32).
 * @param viewport    Visible canvas size in CSS pixels. Defaults to the anchor
 *                    box's own dimensions, which is what the pure unit tests
 *                    use; the client always passes the measured container size
 *                    so `zoom` means "CSS pixels per SVG unit" (#160).
 */
export function computeZoomToFit(
    nodes: NodeBounds[],
    anchorBox: ViewBox,
    padding = 32,
    viewport: { w: number; h: number } = { w: anchorBox.w, h: anchorBox.h },
): { zoom: number; panX: number; panY: number } {
    const content = computeContentBounds(nodes);
    const availW = viewport.w - padding * 2;
    const availH = viewport.h - padding * 2;

    if (!content || availW <= 0 || availH <= 0) {
        return { zoom: 1.0, panX: 0, panY: 0 };
    }

    const zoom = Math.min(availW / content.w, availH / content.h, 5.0);
    const safeZoom = Math.max(0.2, zoom);
    const pan = computeCentringPan(nodes, anchorBox);

    return { zoom: safeZoom, panX: pan.panX, panY: pan.panY };
}

/**
 * Zoom to fit, kept clear of a bottom overlay (#262, #327). `obstacle` is the
 * overlay's box in viewport CSS pixels (the docked key). When the plain fit
 * would put any content under it, the fit is redone in the viewport above the
 * obstacle's top edge (less an 8 px gap) and the content is centred there, so
 * the key never covers a node after Fit or auto-fit. With no obstacle, or one
 * the plain fit already clears, the result is exactly `computeZoomToFit`'s.
 * Pure — exported for unit tests.
 */
export function computeZoomToFitClearOf(
    nodes: NodeBounds[],
    anchorBox: ViewBox,
    padding: number,
    viewport: { w: number; h: number },
    obstacle?: { x: number; y: number; w: number; h: number } | null,
): { zoom: number; panX: number; panY: number } {
    const fit = computeZoomToFit(nodes, anchorBox, padding, viewport);
    const content = computeContentBounds(nodes);
    if (!obstacle || !content || obstacle.w <= 0 || obstacle.h <= 0) {
        return fit;
    }
    // Content box on screen under the plain fit (applyZoomPan's mapping).
    const minX = anchorBox.x + anchorBox.w / 2 - viewport.w / (2 * fit.zoom) - fit.panX;
    const minY = anchorBox.y + anchorBox.h / 2 - viewport.h / (2 * fit.zoom) - fit.panY;
    const left = (content.x - minX) * fit.zoom;
    const right = (content.x + content.w - minX) * fit.zoom;
    const top = (content.y - minY) * fit.zoom;
    const bottom = (content.y + content.h - minY) * fit.zoom;
    const overlaps = right > obstacle.x && left < obstacle.x + obstacle.w &&
        bottom > obstacle.y && top < obstacle.y + obstacle.h;
    if (!overlaps) {
        return fit;
    }
    const inset = viewport.h - obstacle.y + 8;
    const availH = viewport.h - padding * 2 - inset;
    const availW = viewport.w - padding * 2;
    if (availH <= 0 || availW <= 0) {
        return fit;
    }
    const zoom = Math.max(0.2, Math.min(availW / content.w, availH / content.h, 5.0));
    // Centre the content in the band above the obstacle: shift it up by half the inset.
    return { zoom, panX: fit.panX, panY: fit.panY - inset / (2 * zoom) };
}

/**
 * Expand the canvas coordinate space when a dragged node extends beyond the
 * current viewBox bounds (right/bottom edges). Returns the expanded viewBox,
 * or null when the node already fits. The canvas never shrinks. Pure —
 * exported for unit tests.
 *
 * @param viewBox  Current base viewBox (x, y, w, h).
 * @param right    Node's right edge in canvas units (x + width).
 * @param bottom   Node's bottom edge in canvas units (y + height).
 * @param padding  Breathing room to keep beyond the node's edge (default 32).
 */
export function computeExpandedViewBox(
    viewBox: ViewBox,
    right: number,
    bottom: number,
    padding = 32,
): ViewBox | null {
    const w = Math.max(viewBox.w, right + padding - viewBox.x);
    const h = Math.max(viewBox.h, bottom + padding - viewBox.y);
    if (w === viewBox.w && h === viewBox.h) {
        return null;
    }
    return { x: viewBox.x, y: viewBox.y, w, h };
}

/**
 * Pure state helper: remove a single staged entry from stagedEdits and return
 * the updated map. The caller is responsible for DOM revert and announcement.
 * Exported so unit tests can exercise it without a browser environment.
 */
export function computeUnstage(
    stagedEdits: Record<string, Record<string, unknown>>,
    id: string
): { updated: Record<string, Record<string, unknown>>; hadPosition: boolean } {
    const entry = stagedEdits[id];
    const hadPosition = entry !== undefined && entry['x'] !== undefined;
    const updated = { ...stagedEdits };
    delete updated[id];
    return { updated, hadPosition };
}

/**
 * Pure state helper: stage a relationship technology edit. Empty input stages an
 * explicit clear (technology: null); restoring the original un-stages it.
 * Exported for unit tests.
 */
export function computeStageEdgeTechnology(
    edgeId: string,
    value: string,
    originalTechnology: string | undefined,
    stagedEdits: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const updated = { ...stagedEdits };
    if (!updated[edgeId]) {
        updated[edgeId] = {};
    }
    const edit = updated[edgeId];
    const unchanged = value === (originalTechnology || '');
    if (unchanged) {
        delete edit['technology'];
        if (Object.keys(edit).length === 1 && edit['edgeId'] !== undefined) {
            delete edit['edgeId'];
        }
    } else {
        edit['edgeId'] = edgeId;
        edit['technology'] = value === '' ? null : value;
    }
    if (Object.keys(edit).length === 0) {
        delete updated[edgeId];
    }
    return updated;
}

/**
 * Pure state helper: stage a relationship relType edit. Restoring the original
 * type un-stages it. Exported for unit tests.
 */
export function computeStageEdgeRelType(
    edgeId: string,
    value: string,
    originalRelType: string | undefined,
    stagedEdits: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const updated = { ...stagedEdits };
    if (!updated[edgeId]) {
        updated[edgeId] = {};
    }
    const edit = updated[edgeId];
    const original = originalRelType || 'uses';
    if (value === original) {
        delete edit['relType'];
        if (Object.keys(edit).length === 1 && edit['edgeId'] !== undefined) {
            delete edit['edgeId'];
        }
    } else {
        edit['edgeId'] = edgeId;
        edit['relType'] = value;
    }
    if (Object.keys(edit).length === 0) {
        delete updated[edgeId];
    }
    return updated;
}

/**
 * Pure state helper: stage a relationship endpoint re-assignment. Setting the
 * endpoint back to its original id un-stages it. Exported for unit tests.
 */
export function computeStageEdgeEndpoint(
    edgeId: string,
    field: 'from' | 'to',
    value: string,
    originalEndpointId: string,
    stagedEdits: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const updated = { ...stagedEdits };
    if (!updated[edgeId]) {
        updated[edgeId] = {};
    }
    const edit = updated[edgeId];
    if (value === originalEndpointId) {
        delete edit[field];
        if (Object.keys(edit).length === 1 && edit['edgeId'] !== undefined) {
            delete edit['edgeId'];
        }
    } else {
        edit['edgeId'] = edgeId;
        edit[field] = value;
    }
    if (Object.keys(edit).length === 0) {
        delete updated[edgeId];
    }
    return updated;
}

/**
 * Pure validation helper: check whether two element types may be connected by a
 * relationship, mirroring the C4 legality rules used by the writeback service.
 * Exported for unit tests.
 */
export function isRelationshipEndpointLegal(sourceType: string, targetType: string): boolean {
    const deploymentTypes = ['DeploymentNode', 'Node'];
    const sourceIsDeployment = deploymentTypes.includes(sourceType);
    const targetIsDeployment = deploymentTypes.includes(targetType);
    return sourceIsDeployment === targetIsDeployment;
}

/**
 * Connect mode (#66) — the state a two-click "add relationship" gesture moves
 * through: idle -> awaiting-source -> awaiting-target -> (dialog) -> idle.
 */
export type ConnectModeState =
    | { phase: 'idle' }
    | { phase: 'awaitingSource' }
    | { phase: 'awaitingTarget'; sourceId: string };

/**
 * Which nodes may be picked given the current connect-mode phase.
 *
 * While awaiting a source every node is eligible. Once a source is chosen,
 * only nodes that form a legal C4 pair with it remain eligible, and the source
 * itself is excluded — a self-relationship is not something the palette should
 * offer. Pure; exported for unit tests and used to drive the canvas
 * highlighting so the visual affordance and the click guard cannot disagree.
 */
export function eligibleConnectTargets(
    state: ConnectModeState,
    nodes: ReadonlyArray<{ id: string; type: string }>,
): string[] {
    if (state.phase === 'awaitingSource') {
        return nodes.map(node => node.id);
    }
    if (state.phase !== 'awaitingTarget') {
        return [];
    }
    const source = nodes.find(node => node.id === state.sourceId);
    if (!source) {
        return [];
    }
    return nodes
        .filter(node => node.id !== state.sourceId && isRelationshipEndpointLegal(source.type, node.type))
        .map(node => node.id);
}

/** The status-line prompt for a connect-mode phase. Pure; exported for tests. */
export function connectModePrompt(state: ConnectModeState): string {
    switch (state.phase) {
        case 'awaitingSource':
            return 'Connect mode: choose the source element (or Cmd/Ctrl+click two elements). Press Escape to cancel.';
        case 'awaitingTarget':
            return 'Connect mode: choose the target element. Press Escape to cancel.';
        default:
            return '';
    }
}

/**
 * Advance connect mode by picking a node. Returns the next state plus an
 * optional rejection reason, so the caller can announce a refusal without
 * having to re-derive why. Pure; exported for unit tests.
 */
export function advanceConnectMode(
    state: ConnectModeState,
    pickedId: string,
    nodes: ReadonlyArray<{ id: string; type: string }>,
): { state: ConnectModeState; rejected?: string; completed?: { sourceId: string; targetId: string } } {
    if (state.phase === 'awaitingSource') {
        if (!nodes.some(node => node.id === pickedId)) {
            return { state, rejected: 'That element is not on the canvas.' };
        }
        return { state: { phase: 'awaitingTarget', sourceId: pickedId } };
    }
    if (state.phase === 'awaitingTarget') {
        if (pickedId === state.sourceId) {
            return { state, rejected: 'A relationship needs two different elements.' };
        }
        if (!eligibleConnectTargets(state, nodes).includes(pickedId)) {
            return {
                state,
                rejected: 'Deployment Nodes cannot be connected directly to logical-view elements.',
            };
        }
        return { state: { phase: 'idle' }, completed: { sourceId: state.sourceId, targetId: pickedId } };
    }
    return { state };
}

/**
 * Stage a new relationship as a staged edit keyed by a synthetic id, in the
 * `addRelationship` shape the protocol validates and the writeback planner
 * consumes. Pure; exported for unit tests.
 */
export function computeStageAddRelationship(
    sourceId: string,
    targetId: string,
    label: string,
    relType: string,
    technology: string | null,
    stagedEdits: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    const updated = { ...stagedEdits };
    // Staged edits are keyed by element id and duplicate ids are rejected by
    // the protocol, so every relationship drawn from the same source element
    // appends to that element's one staged edit.
    const existing = updated[sourceId] ? { ...updated[sourceId] } : {};
    const adds = Array.isArray(existing['addRelationship'])
        ? [...(existing['addRelationship'] as unknown[])]
        : [];
    adds.push({
        targetId,
        label,
        relType,
        ...(technology !== null && technology !== '' ? { technology } : {}),
    });
    existing['addRelationship'] = adds;
    updated[sourceId] = existing;
    return updated;
}

/**
 * Why a relationship cannot be staged, or null when it can. The limits are the
 * ones a Save and a restored draft enforce, so refusing here keeps an add that
 * could never be saved out of the draft, where it would otherwise get in the
 * way of every other change. Pure and self-contained (embedded verbatim);
 * exported for unit tests.
 */
export function checkStageAddRelationship(
    sourceId: string,
    targetId: string,
    label: string,
    stagedEdits: Record<string, Record<string, unknown>>,
): string | null {
    if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(targetId) || targetId.length > 256) {
        return 'The target id "' + targetId + '" cannot be used in a relationship.';
    }
    const staged = stagedEdits[sourceId];
    const existing: Array<Record<string, unknown>> = staged && Array.isArray(staged['addRelationship'])
        ? staged['addRelationship'] as Array<Record<string, unknown>>
        : [];
    if (existing.length >= 64) {
        return 'At most 64 relationships can be staged from one element. Save them first.';
    }
    if (existing.some(add => add['targetId'] === targetId && add['label'] === label)) {
        return 'This relationship is already staged.';
    }
    return null;
}

/** Staged-changes list text for a pending relationship add. Pure. */
export function formatAddRelationshipSummary(sourceId: string, targetId: string, label: string): string {
    return 'Added relationship ' + sourceId + ' → ' + targetId + ': ' + label;
}

/**
 * The one allowlist of staged-edit fields that are persisted via
 * vscode.setState() and restored from it. Serialising and restoring both go
 * through it, in the host-side helpers below and in the webview, which embeds
 * this function's source, so a field cannot be saved but not restored, or
 * missing from one of two copies (#260). Returns a new object holding only the
 * allowlisted fields; `addRelationship` entries are rebuilt from their four
 * known keys. Pure and self-contained (it is embedded verbatim).
 */
export function pickPersistedEditFields(edit: Record<string, unknown>): Record<string, unknown> {
    const keys = [
        'edgeId', 'boundaryId', 'x', 'y', 'w', 'h', 'label', 'description', 'technology',
        'tags', 'sprite', 'locked', 'newId', 'relType', 'from', 'to',
    ];
    const picked: Record<string, unknown> = {};
    for (const key of keys) {
        if (edit[key] !== undefined) { picked[key] = edit[key]; }
    }
    const adds = edit['addRelationship'];
    if (Array.isArray(adds)) {
        picked['addRelationship'] = adds.map((add: Record<string, unknown>) => {
            const entry: Record<string, unknown> = {
                targetId: add['targetId'],
                label: add['label'],
                relType: add['relType'],
            };
            if (add['technology'] !== undefined) { entry['technology'] = add['technology']; }
            return entry;
        });
    }
    return picked;
}

/**
 * Serialise the current webview state to the shape persisted via vscode.setState().
 * `scope` identifies the diagram the draft belongs to (document URI, plus the
 * fence's content identity for Markdown-bound panels) — the panel is reused
 * across documents, so a draft without an identity could be restored onto the
 * wrong diagram. Pure — no DOM access. Exported for unit tests.
 */
export function serializeDraftState(
    stagedEdits: Record<string, Record<string, unknown>>,
    selectedNodeId: string | null,
    editMode: boolean,
    scope: string,
    camera?: { zoom?: number; panX?: number; panY?: number },
): PersistedDraftState {
    const editsArray = Object.keys(stagedEdits).map(
        id => ({ id, ...pickPersistedEditFields(stagedEdits[id]) }) as PersistedStagedEdit,
    );
    return {
        schemaVersion: 2,
        scope,
        editMode,
        selectedNodeId,
        stagedEdits: editsArray,
        ...(camera?.zoom !== undefined ? { zoom: camera.zoom } : {}),
        ...(camera?.panX !== undefined ? { panX: camera.panX } : {}),
        ...(camera?.panY !== undefined ? { panY: camera.panY } : {}),
    };
}

/**
 * Reconstruct the `stagedEdits` map from a persisted state snapshot.
 * Pure — no DOM access. Exported for unit tests.
 */
export function deserializeDraftState(
    state: PersistedDraftState,
): Record<string, Record<string, unknown>> {
    const result: Record<string, Record<string, unknown>> = {};
    for (const entry of state.stagedEdits) {
        result[entry.id] = pickPersistedEditFields(entry as unknown as Record<string, unknown>);
    }
    return result;
}

/** Upgrade an unscoped v1 draft once, retaining the current field allowlist. */
export function migrateLegacyDraftState(
    value: unknown,
    scope: string,
    pick: (edit: Record<string, unknown>) => Record<string, unknown>,
): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const record = value as Record<string, unknown>;
    if (record['schemaVersion'] !== 1 || !Array.isArray(record['stagedEdits'])) return value;
    // Leave malformed entries for the normal validator to reject, never throw.
    const stagedEdits = record['stagedEdits'].map(entry => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) return entry;
        const edit = entry as Record<string, unknown>;
        if (edit['addRelationship'] !== undefined && !Array.isArray(edit['addRelationship'])) return entry;
        if (Array.isArray(edit['addRelationship']) && edit['addRelationship'].some(add =>
            typeof add !== 'object' || add === null || Array.isArray(add))) return entry;
        return { id: edit['id'], ...pick(edit) };
    });
    return { ...record, schemaVersion: 2, scope, stagedEdits };
}

/** Zero-sized background viewports cannot supply a durable camera. */
export function isPersistableViewport(width: number, height: number): boolean {
    return Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
}

/**
 * Runtime validation for a render payload's `scope` field (#167 review). The
 * TypeScript type requires it, so the boundary guard must too: a non-empty,
 * bounded string. An unscoped render must be rejected wholesale — never let it
 * run a settled persist that would overwrite valid persisted state with an
 * unscoped record. Pure — exported for unit tests.
 */
export function isRenderScopeValue(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= 2048;
}

/**
 * Identity guard for a persisted draft (#167 review). vscode.setState is scoped
 * to the webview panel, and the singleton preview panel is reused for different
 * documents and Markdown fences — so a schema-valid state can still belong to a
 * DIFFERENT diagram than the one now on screen. The stored scope must equal the
 * scope of the render the panel is showing; any difference (including a missing
 * current scope) rejects the whole state, camera and edits alike. Element-id
 * overlap between two diagrams is irrelevant: identical ids across diagrams are
 * common (`api`, `db`, `Person(User)`), which is exactly why the per-id filter
 * alone was not enough.
 *
 * An ambiguous current scope — two fences in one document with identical
 * content share one identity — also rejects: the binding cannot be resolved to
 * exactly one fence, so the draft is discarded rather than guessed onto one of
 * the twins. The marker literal is duplicated in SaveAnchor.ts, which stamps
 * it; keep them in sync. Pure — exported for unit tests.
 */
export function isDraftStateForCurrentScope(
    state: PersistedDraftState,
    currentScope: string | undefined,
): boolean {
    return typeof currentScope === 'string' &&
        !currentScope.includes('#c4x-fence-ambiguous:') &&
        state.scope === currentScope;
}

/**
 * What to tell the user after a reload consumed a persisted draft (#167).
 *
 * Staged edits whose element is no longer in the diagram are dropped on
 * restore. That used to happen in silence: the user came back to a draft that
 * had quietly lost changes, or to no draft at all and no explanation. Returns
 * null when there was nothing to restore. Pure — exported for unit tests.
 */
export function formatDraftRestoreStatus(
    restoredCount: number,
    droppedCount: number,
): { text: string; tone: 'info'; state: 'dirty' | 'clean' } | null {
    if (restoredCount === 0 && droppedCount === 0) {
        return null;
    }
    if (restoredCount === 0) {
        return {
            text: 'Draft not restored: its ' + droppedCount +
                (droppedCount === 1 ? ' change refers' : ' changes refer') +
                ' to elements no longer in the diagram.',
            tone: 'info',
            state: 'clean',
        };
    }
    const restored = 'Draft restored — ' + restoredCount + ' staged change' +
        (restoredCount === 1 ? '' : 's');
    if (droppedCount === 0) {
        return { text: restored + '.', tone: 'info', state: 'dirty' };
    }
    return {
        text: restored + '; ' + droppedCount + ' no longer appl' +
            (droppedCount === 1 ? 'ies' : 'y') + ' and ' +
            (droppedCount === 1 ? 'was' : 'were') + ' dropped.',
        tone: 'info',
        state: 'dirty',
    };
}

/**
 * Pure helper: derive conflict banner text from a conflict reason string.
 * Exported for unit tests.
 */
export function formatConflictBannerMessage(reason: string): string {
    return reason;
}

/**
 * Polite live-region announcement for a canvas text update.
 * Pure — exported for unit tests.
 */
export function formatCanvasUpdateAnnouncement(field: string): string {
    const name = field.charAt(0).toUpperCase() + field.slice(1);
    return `${name} updated on canvas`;
}

/**
 * The one rule for geometry edits (#340 review round 4): a drag, keyboard move,
 * boundary move or resize may be staged only in edit mode AND while the canvas
 * shows the edit layout, the standard-size layout a Save of the first move
 * produces. A render is the edit layout when the host laid it out in edit mode,
 * or when its view-mode layout grew nothing (then the two are identical).
 * Pure; exported for tests and embedded in the webview.
 */
export function isGeometryEditAllowed(editModeOn: boolean, layoutMode: string, textGrown: boolean): boolean {
    return editModeOn === true && (layoutMode === 'edit' || textGrown !== true);
}

/**
 * What to do with a persisted draft on a settled render (#340 reviews 4-7). Pure;
 * exported for tests and embedded in the webview.
 * - `none`: no draft with staged edits is waiting.
 * - `hold-other-source`: the draft was made on other source text (its scope is
 *   not the current one). It is kept, unapplied and untouched in storage, in
 *   every layout mode; only new staged changes replace it.
 * - `defer-edit-layout`: the canvas is not the edit layout yet; keep the draft
 *   and apply it when the edit layout arrives.
 * - `restore`: apply it now.
 */
export function decideDraftRestore(pending: unknown, currentScope: string | null, editLayoutShown: boolean): 'none' | 'hold-other-source' | 'defer-edit-layout' | 'restore' {
    if (!pending || typeof pending !== 'object') {
        return 'none';
    }
    const draft = pending as { stagedEdits?: unknown; scope?: unknown };
    if (!Array.isArray(draft.stagedEdits) || draft.stagedEdits.length === 0) {
        return 'none';
    }
    if (typeof draft.scope === 'string' && draft.scope !== currentScope) {
        return 'hold-other-source';
    }
    return editLayoutShown ? 'restore' : 'defer-edit-layout';
}

/** What the webview knows about the diagram a render shows (#340 reviews 7-9). */
export interface RenderedDiagram {
    /** Document URI, plus the fence ordinal for a Markdown-bound panel; null from an older host. */
    identity: string | null;
    /** Draft scope (includes the source fingerprint). */
    scope: string | null;
    /** C4 view type; null from an older host. */
    viewType: string | null;
    /** The host's render token; null when the host sent none. */
    token: number | null;
    /**
     * The host's proof that every source change since render `since` stayed
     * inside this diagram (isSameDiagramEdit in sameDiagramEdit.ts); null from an
     * older host.
     */
    sameDiagramEdit: { since: number | null; value: boolean } | null;
}

/**
 * Whether a render shows the same diagram as the one before it (#340 review 9).
 * The webview never infers identity from content: edit mode continues only with
 * the host's flag that every change since the render on screen stayed inside the
 * diagram, for that very render (its token), with the same document identity
 * and the same view type. Without the flag (an older host, an external change,
 * an edit outside the fence, a fence added, moved or swapped, a document
 * switch) it is another diagram. Pure; exported for tests and embedded.
 */
export function isSameDiagram(previous: RenderedDiagram | null, next: RenderedDiagram): boolean {
    if (previous === null) {
        return true;
    }
    const flag = next.sameDiagramEdit;
    if (!flag || flag.value !== true) {
        return false;
    }
    if (flag.since !== null && previous.token !== null && flag.since !== previous.token) {
        return false;
    }
    if (previous.identity !== next.identity) {
        return false;
    }
    return (previous.viewType || null) === (next.viewType || null);
}

/**
 * Whether a pending edit-layout request may be answered by this render (#340
 * review 8): the diagram stayed the same since the request (every render in
 * between was the same diagram, or the request would have been cancelled) and
 * the render came after the one the request was made on. Pure; exported.
 */
export function pendingEditMatches(pending: { afterToken: number | null } | null, sameDiagram: boolean, token: number | null): boolean {
    if (pending === null || !sameDiagram) {
        return false;
    }
    return pending.afterToken === null || token === null || token > pending.afterToken;
}

/**
 * What a settled render does to edit mode and to a persisted draft (#340 reviews
 * 4-8). Pure; exported for tests and embedded in the webview; the webview acts
 * on `action` and takes `heldForOtherSource` and `deferRestore` from here.
 * - `enter`: an edit-layout render of the diagram the edit request was for.
 * - `leave`: an edit-layout render of another diagram (another document, or a
 *   fence ordinal now showing another diagram), or one for a request that was
 *   made on another diagram: edit mode is off and the host is told `view`.
 * - `hold-quiet`: a held draft waits; ask for nothing (after a give-up, or a
 *   draft made on other source text).
 * - `request-edit-for-restore`: a draft for this source waits for the edit layout.
 * - `keep-waiting`: a view render that was in flight when Edit was clicked on
 *   this same diagram; the edit layout follows.
 * - `view`: an ordinary render; any pending request is cancelled.
 */
export function planRenderEditState(input: {
    layoutMode: string;
    reportedLayoutMode: string;
    sameDiagram: boolean;
    awaiting: boolean;
    pendingMatches: boolean;
    restoreDecision: string;
    editLayoutAbandoned: boolean;
}): { action: 'enter' | 'leave' | 'hold-quiet' | 'request-edit-for-restore' | 'keep-waiting' | 'view'; heldForOtherSource: boolean; deferRestore: boolean } {
    const heldForOtherSource = input.restoreDecision === 'hold-other-source';
    const deferRestore = heldForOtherSource || input.restoreDecision === 'defer-edit-layout';
    const plan = (action: 'enter' | 'leave' | 'hold-quiet' | 'request-edit-for-restore' | 'keep-waiting' | 'view') =>
        ({ action, heldForOtherSource, deferRestore });
    if (input.layoutMode === 'edit' && input.reportedLayoutMode === 'edit') {
        if (!input.sameDiagram || (input.awaiting && !input.pendingMatches)) {
            return plan('leave');
        }
        return plan('enter');
    }
    if (deferRestore && (input.editLayoutAbandoned || heldForOtherSource)) {
        return plan('hold-quiet');
    }
    if (deferRestore) {
        return plan('request-edit-for-restore');
    }
    if (input.awaiting && input.reportedLayoutMode === 'edit' && input.pendingMatches) {
        return plan('keep-waiting');
    }
    return plan('view');
}


/**
 * The whole render-time transition of edit mode and of a held draft (#340
 * reviews 4-9), as one pure step from the webview's state and the render to the
 * next state and an action. The webview assigns every field of `state` from the
 * result and performs `action`; nothing at the call site decides on its own.
 * Pure; exported for tests and embedded in the webview.
 */
export function renderTransition(input: {
    state: { awaiting: boolean; pendingEditFor: { afterToken: number | null } | null; editLayoutAbandoned: boolean; lastRenderDiagram: RenderedDiagram | null };
    diagram: RenderedDiagram;
    layoutMode: string;
    editLayoutShown: boolean;
    reportedLayoutMode: string;
    pendingRestoreState: unknown;
    currentScope: string | null;
}): {
    action: 'enter' | 'leave' | 'hold-quiet' | 'request-edit-for-restore' | 'keep-waiting' | 'view';
    state: { awaiting: boolean; pendingEditFor: { afterToken: number | null } | null; lastRenderDiagram: RenderedDiagram; heldDraftForOtherSource: boolean; restoreDeferred: boolean };
} {
    const sameDiagram = isSameDiagram(input.state.lastRenderDiagram, input.diagram);
    const plan = planRenderEditState({
        layoutMode: input.layoutMode,
        reportedLayoutMode: input.reportedLayoutMode,
        sameDiagram,
        awaiting: input.state.awaiting,
        pendingMatches: pendingEditMatches(input.state.pendingEditFor, sameDiagram, input.diagram.token),
        restoreDecision: decideDraftRestore(input.pendingRestoreState, input.currentScope, input.editLayoutShown),
        editLayoutAbandoned: input.state.editLayoutAbandoned,
    });
    const waiting = plan.action === 'keep-waiting' || plan.action === 'request-edit-for-restore';
    return {
        action: plan.action,
        state: {
            awaiting: waiting,
            pendingEditFor: plan.action === 'request-edit-for-restore'
                ? { afterToken: input.diagram.token }
                : plan.action === 'keep-waiting' ? input.state.pendingEditFor : null,
            lastRenderDiagram: input.diagram,
            heldDraftForOtherSource: plan.heldForOtherSource,
            restoreDeferred: plan.deferRestore,
        },
    };
}

/** A drawn `<text data-field>` element, as replaceCanvasText reads it. */
export interface CanvasTextElement {
    getAttribute(name: string): string | null;
    readonly textContent: string | null;
    querySelectorAll(selector: string): ArrayLike<{ readonly textContent: string | null }>;
    remove(): void;
}

/** Minimal structural view of a rendered SVG node for live text updates (#340). */
export interface CanvasTextNode {
    querySelectorAll(selector: string): ArrayLike<CanvasTextElement>;
    insertAdjacentHTML(position: 'beforeend', markup: string): void;
}

/**
 * What a text layout draws, field by field: first baseline and lines. Equal
 * signatures mean the canvas already shows the layout. Pure; exported for tests.
 */
export function elementTextSignature(layout: { blocks: ReadonlyArray<{ field: string; ys: number[]; lines: string[]; truncated: boolean; full: string }> }): string {
    // A truncated field also carries its full text: an edit past the cut changes
    // the tooltip even when the visible lines stay the same.
    return layout.blocks.map(block => block.field + '@' + block.ys[0].toFixed(2) + ':' + block.lines.join('\n')
        + (block.truncated ? '#' + block.full : '')).join('|');
}

/**
 * Replace a node's drawn text with `markup` (from elementTextMarkup, the
 * host's own text renderer) unless the canvas already shows `signature`.
 * Returns true when the text changed. DOM access is confined to the passed-in
 * node so unit tests can drive it with a plain fake.
 */
export function replaceCanvasText(nodeEl: CanvasTextNode, markup: string, signature: string): boolean {
    const texts = Array.from(nodeEl.querySelectorAll(':scope > text[data-field]'));
    const current = texts.map(text => {
        const spans = Array.from(text.querySelectorAll('tspan'));
        const lines = spans.length > 0 ? spans.map(span => span.textContent || '') : [text.textContent || ''];
        const titles = Array.from(text.querySelectorAll('title'));
        return text.getAttribute('data-field') + '@' + text.getAttribute('y') + ':' + lines.join('\n')
            + (titles.length > 0 ? '#' + (titles[0].textContent || '') : '');
    }).join('|');
    if (current === signature) {
        return false;
    }
    texts.forEach(text => text.remove());
    nodeEl.insertAdjacentHTML('beforeend', markup);
    return true;
}

/**
 * Pure decision helper: leaving edit mode is gated behind the discard
 * confirmation banner only when unsaved staged edits exist.
 * Exported for unit tests.
 */
export function shouldConfirmExitEdit(dirty: boolean): boolean {
    return dirty;
}

/**
 * Pure decision helper for the Escape key: it opens the exit-edit
 * confirmation only in edit mode, with unsaved edits, and with nothing
 * selected (a live selection consumes Escape to clear itself first).
 * Exported for unit tests.
 */
export function shouldEscapeTriggerExitConfirm(editMode: boolean, dirty: boolean, selectionCount: number): boolean {
    return editMode && dirty && selectionCount === 0;
}

/**
 * Pure decision helper: auto-fit runs only on the very first render of a
 * webview session and only when the `c4x.canvas.autoFitOnOpen` setting is
 * enabled. Save-triggered re-renders never re-fit (firstRender is false by
 * then). Exported for unit tests.
 */
export function shouldAutoFitOnOpen(firstRender: boolean, autoFitOnOpen: boolean): boolean {
    return firstRender && autoFitOnOpen;
}

/**
 * Bounds for the Markdown-originated initial zoom (#134) — mirrors
 * `c4x.markdown.previewScale` in package.json and PREVIEW_SCALE_MIN/MAX in
 * src/markdown/c4xPlugin.ts. The template below re-declares them as locals so
 * the embedded helpers resolve them inside the webview.
 */
export const INITIAL_ZOOM_MIN = 0.2;
export const INITIAL_ZOOM_MAX = 1.0;

/**
 * How long a wheel gesture must be still before the camera is written to draft
 * state (#167). Discrete camera actions persist immediately; only the wheel is
 * debounced, because one gesture fires dozens of events.
 */
export const CAMERA_PERSIST_DEBOUNCE_MS = 150;

/**
 * Pure decision helper: resolve the explicit initial zoom carried by a render
 * payload's settings block. The host only includes it for Markdown-fence
 * editors (#134), resolved from `c4x.markdown.previewScale`; a finite
 * in-bounds number wins over the auto-fit-on-open path (#111). Absent or
 * invalid values return undefined, leaving the auto-fit decision in charge.
 * Exported for unit tests.
 */
export function resolveInitialZoom(
    settings: { initialZoom?: unknown } | undefined | null
): number | undefined {
    const value = settings ? settings.initialZoom : undefined;
    if (typeof value !== 'number' || !Number.isFinite(value) ||
        value < INITIAL_ZOOM_MIN || value > INITIAL_ZOOM_MAX) {
        return undefined;
    }
    return value;
}

/**
 * Polite live-region announcement for the Markdown-originated initial zoom
 * (#134): states the applied scale so the announcement reflects what actually
 * happened instead of the auto-fit claim ("Diagram zoomed to fit").
 * Pure — exported for unit tests.
 */
export function formatInitialZoomAnnouncement(zoom: number): string {
    return `Diagram opened at ${Math.round(zoom * 100)}% zoom`;
}

// ---------------------------------------------------------------------------
// Legend overlay (#98)
// ---------------------------------------------------------------------------

/**
 * Filter the legend catalogue down to the entries whose keys are present in
 * the render payload. Unknown keys are ignored; catalogue order is preserved.
 * The catalogue is passed in (rather than referenced as a module binding) so
 * the function serialises cleanly into the webview script.
 * Pure — no DOM access. Exported for unit tests.
 */
export function filterLegendItems(
    catalog: readonly LegendItem[],
    presentElementTypes: readonly string[]
): LegendItem[] {
    const present = new Set(presentElementTypes);
    return catalog.filter(item => present.has(item.key));
}

/**
 * Clamp a legend overlay position so the whole box stays inside the canvas
 * area. Coordinates are rounded to whole pixels; an area smaller than the
 * legend pins it to the origin. Pure — no DOM access. Exported for unit tests.
 */
export function clampLegendPosition(
    left: number,
    top: number,
    legendWidth: number,
    legendHeight: number,
    areaWidth: number,
    areaHeight: number
): { left: number; top: number } {
    const maxLeft = Math.max(0, areaWidth - legendWidth);
    const maxTop = Math.max(0, areaHeight - legendHeight);
    return {
        left: Math.min(Math.max(0, Math.round(left)), maxLeft),
        top: Math.min(Math.max(0, Math.round(top)), maxTop),
    };
}

/**
 * Polite announcement for a legend reposition (pointer drop or keyboard
 * nudge); includes the new position so repeated announcements keep changing
 * the live-region text. Pure — exported for unit tests.
 */
export function formatLegendMoveAnnouncement(left: number, top: number): string {
    return `Legend repositioned to ${left}, ${top}`;
}

/**
 * Render-payload validator for the optional `presentElementTypes` field
 * (#98): a bounded array of non-empty bounded strings. Undefined is accepted
 * so older hosts keep rendering. Exported for unit tests.
 */
export function isValidPresentElementTypes(value: unknown): boolean {
    return value === undefined ||
        (Array.isArray(value) && value.length <= 64 &&
            value.every(entry => typeof entry === 'string' && entry.length > 0 && entry.length <= 128));
}

/**
 * Render-payload validator for the optional `legendSwatchColors` field
 * (#98): a small record of colour strings. Undefined is accepted so older
 * hosts keep rendering. Exported for unit tests.
 */
export function isValidLegendSwatchColors(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    const entries = Object.values(value);
    return entries.length <= 32 &&
        entries.every(colour => typeof colour === 'string' && colour.length > 0 && colour.length <= 64);
}

/**
 * Render-payload validator for the optional `legendEntries` field (#327): a
 * bounded list of derived key entries, each a bounded label, a known kind and
 * a host-drawn standalone `<svg>` swatch. Undefined is accepted so older hosts
 * keep rendering (the overlay then falls back to the fixed catalogue).
 * Exported for unit tests.
 */
export function isValidLegendEntries(value: unknown): boolean {
    if (value === undefined) {
        return true;
    }
    if (!Array.isArray(value) || value.length > 128) {
        return false;
    }
    return value.every(entry => entry !== null && typeof entry === 'object' && !Array.isArray(entry) &&
        typeof entry.label === 'string' && entry.label.length > 0 && entry.label.length <= 300 &&
        (entry.kind === 'element' || entry.kind === 'boundary' || entry.kind === 'relationship') &&
        typeof entry.swatch === 'string' && entry.swatch.length <= 8192 &&
        entry.swatch.indexOf('<svg ') === 0 && entry.swatch.slice(-6) === '</svg>');
}

/**
 * Render-payload validator for the optional `legendKeyTheme` field (#327): the
 * swatch colours and widths the client needs to redraw key swatches after a
 * staged tag edit. Exported for unit tests.
 */
export function isValidLegendKeyTheme(value: unknown): boolean {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const v = value as Record<string, unknown>;
    const colour = (c: unknown): boolean => typeof c === 'string' && c.length > 0 && c.length <= 64;
    const num = (x: unknown): boolean => typeof x === 'number' && isFinite(x) && x >= 0 && x <= 100;
    const b = v.boundary as Record<string, unknown> | undefined;
    return num(v.borderRadius) && num(v.borderWidth) && colour(v.background) && colour(v.relationshipStroke) &&
        b !== null && typeof b === 'object' && colour(b.stroke) && num(b.strokeWidth) && num(b.opacity) &&
        (b.dash === null || (typeof b.dash === 'string' && b.dash.length <= 32));
}

/**
 * Browser-side preview controller. It is kept separate from PreviewPanel so the
 * extension-host lifecycle and the untrusted webview boundary stay reviewable.
 * The generated script deliberately contains no persistence API.
 */
const PREVIEW_CLIENT_TEMPLATE = String.raw`
    const PROTOCOL_VERSION = ${VISUAL_LAYOUT_PROTOCOL_VERSION};
    // Shown as the tooltip and spoken label of a boundary edit mode will not move (#271).
    const BOUNDARY_FIXED_REASON = 'Cannot be moved or resized here: System_Boundary, Container_Boundary and Enterprise_Boundary have no place in the source for a position or size, so the frame follows its contents. A subgraph boundary can be positioned.';

    // ── Shared validator constants (from inspectorValidators.ts — single source of truth) ──
    const INSPECTOR_LABEL_MAX = ${INSPECTOR_LABEL_MAX};
    const INSPECTOR_TECH_MAX = ${INSPECTOR_TECH_MAX};
    const INSPECTOR_TAG_COUNT_MAX = ${INSPECTOR_TAG_COUNT_MAX};
    const INSPECTOR_TAG_LENGTH_MAX = ${INSPECTOR_TAG_LENGTH_MAX};
    const INSPECTOR_TAG_RE = ${INSPECTOR_TAG_RE};

    // ── Initial-zoom bounds (#134 — mirror c4x.markdown.previewScale) ────────
    const INITIAL_ZOOM_MIN = ${INITIAL_ZOOM_MIN};
    const INITIAL_ZOOM_MAX = ${INITIAL_ZOOM_MAX};

    // ── Click versus drag (#251, #252) ────────────────────────────────────────
    const DRAG_THRESHOLD_PX = ${DRAG_THRESHOLD_PX};
    const COARSE_DRAG_THRESHOLD_PX = ${COARSE_DRAG_THRESHOLD_PX};
    ${embedForWebview(dragThresholdFor)}
    ${embedForWebview(sharedDragDelta)}
    ${embedForWebview(hasPassedDragThreshold)}
    ${embedForWebview(isZeroDeltaMove)}
    ${embedForWebview(pointerDownKeepsSelection)}
    ${embedForWebview(settlePointerMove)}
    ${embedForWebview(planBoundaryMove)}
    // ── Camera persistence (#167) ────────────────────────────────────────────
    // How long the wheel has to be still before the camera is written.
    const CAMERA_PERSIST_DEBOUNCE_MS = ${CAMERA_PERSIST_DEBOUNCE_MS};


    ${embedForWebview(validateLabel)}
    ${embedForWebview(validateTechnology)}
    ${embedForWebview(validateTagsString)}

    ${embedForWebview(computeStageEdgeTechnology)}
    ${embedForWebview(computeStageEdgeRelType)}
    ${embedForWebview(computeStageEdgeEndpoint)}
    ${embedForWebview(isRelationshipEndpointLegal)}
    ${embedForWebview(eligibleConnectTargets)}
    ${embedForWebview(connectModePrompt)}
    ${embedForWebview(advanceConnectMode)}
    ${embedForWebview(computeStageAddRelationship)}
    ${embedForWebview(checkStageAddRelationship)}
    ${embedForWebview(formatAddRelationshipSummary)}

    // ── Field-level inline validation state ───────────────────────────────────
    // Keys are field ids (e.g. 'inspector-label'). Save is blocked while non-empty.
    let validationErrors = new Set();

    /**
     * Show or clear an inline validation error on a single inspector field.
     *
     * @param fieldId   The id attribute of the <input>/<textarea> element.
     * @param errorMsg  Error string to display, or null to clear the error.
     */
    function setFieldError(fieldId, errorMsg) {
      const field = document.getElementById(fieldId);
      if (!field) return;

      const errorElId = fieldId + '-error';
      let errorEl = document.getElementById(errorElId);

      if (errorMsg) {
        field.setAttribute('aria-invalid', 'true');
        if (!field.getAttribute('aria-describedby') ||
            !field.getAttribute('aria-describedby').includes(errorElId)) {
          const existing = field.getAttribute('aria-describedby') || '';
          field.setAttribute('aria-describedby', (existing + ' ' + errorElId).trim());
        }
        if (!errorEl) {
          errorEl = document.createElement('p');
          errorEl.id = errorElId;
          errorEl.className = 'field-error';
          errorEl.setAttribute('role', 'alert');
          errorEl.setAttribute('aria-live', 'assertive');
          field.parentNode.insertBefore(errorEl, field.nextSibling);
        }
        // Only announce when the message changes (avoid repeated assertive blasts).
        if (errorEl.textContent !== errorMsg) {
          errorEl.textContent = errorMsg;
          emitLiveRegion(
            { polite: layoutStatusEl, assertive: layoutErrorEl },
            'assertive',
            errorMsg
          );
        }
        validationErrors.add(fieldId);
      } else {
        field.removeAttribute('aria-invalid');
        if (errorEl) {
          errorEl.textContent = '';
          // Remove the errorElId from aria-describedby
          const desc = field.getAttribute('aria-describedby') || '';
          const updated = desc.split(' ').filter(function(t) { return t !== errorElId; }).join(' ');
          if (updated) {
            field.setAttribute('aria-describedby', updated);
          } else {
            field.removeAttribute('aria-describedby');
          }
        }
        validationErrors.delete(fieldId);
      }

      // Update Save button gating after every field change.
      _updateSaveButtonGating();
    }

    /**
     * Clears all field errors and resets validationErrors. Called on node
     * deselection and on discard so the error state does not linger.
     */
    function clearAllFieldErrors() {
      const fieldIds = ['inspector-label', 'inspector-tech', 'inspector-tags', 'inspector-sprite'];
      for (const fid of fieldIds) {
        setFieldError(fid, null);
      }
      validationErrors = new Set();
      _updateSaveButtonGating();
    }

    /**
     * Update the Save button disabled state based on validationErrors and
     * whether there are staged edits. Called after every field validation.
     */
    function _updateSaveButtonGating() {
      const saveBtn = document.getElementById('save-staged-changes');
      if (!saveBtn) return;
      const hasEdits = Object.keys(stagedEdits).length > 0;
      const hasErrors = validationErrors.size > 0;
      // Save is also disabled in conflict state — that is managed by
      // showConflictBanner / hideConflictBanner; only touch it when no conflict.
      if (!inConflict) {
        saveBtn.disabled = !hasEdits || hasErrors;
      }
    }

    // ── Persisted draft state schema (inline — no module imports in webview) ──
    ${embedForWebview(isPersistedAddRelationshipList)}
    ${embedForWebview(dropInvalidPersistedAdds)}
    ${embedForWebview(dropUnmovableBoundaryEdits)}
    ${embedForWebview(formatUnmovableBoundaryNotice)}
    ${embedForWebview(pickPersistedEditFields)}
    function isPersistedStagedEditEntry(v) {
      if (!isRecord(v) || !isBoundedText(v.id, 256)) return false;
      if (v.edgeId !== undefined && (typeof v.edgeId !== 'string' || v.edgeId.length > 256)) return false;
      if (v.x !== undefined && !isCoordinate(v.x)) return false;
      if (v.y !== undefined && !isCoordinate(v.y)) return false;
      if (v.label !== undefined && v.label !== null && (typeof v.label !== 'string' || v.label.length > 120)) return false;
      if (v.description !== undefined && v.description !== null && typeof v.description !== 'string') return false;
      if (v.technology !== undefined && v.technology !== null && typeof v.technology !== 'string') return false;
      if (v.tags !== undefined && !Array.isArray(v.tags)) return false;
      if (v.sprite !== undefined && v.sprite !== null && typeof v.sprite !== 'string') return false;
      if (v.locked !== undefined && typeof v.locked !== 'boolean') return false;
      if (v.newId !== undefined && (typeof v.newId !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.newId))) return false;
      if (v.boundaryId !== undefined && (typeof v.boundaryId !== 'string' || v.boundaryId.length > 256)) return false;
      if (v.w !== undefined && !isCoordinate(v.w)) return false;
      if (v.h !== undefined && !isCoordinate(v.h)) return false;
      if (v.edgeId !== undefined && (typeof v.edgeId !== 'string' || v.edgeId.length > 256)) return false;
      if (v.relType !== undefined && !['uses', 'async', 'sync'].includes(v.relType)) return false;
      if (v.from !== undefined && (typeof v.from !== 'string' || v.from.length > 256)) return false;
      if (v.to !== undefined && (typeof v.to !== 'string' || v.to.length > 256)) return false;
      if (v.addRelationship !== undefined && !isPersistedAddRelationshipList(v.addRelationship)) return false;
      return true;
    }

    function isValidPersistedDraftState(v) {
      return isRecord(v) &&
        v.schemaVersion === 2 &&
        isBoundedText(v.scope, 2048) &&
        typeof v.editMode === 'boolean' &&
        (v.selectedNodeId === null || typeof v.selectedNodeId === 'string') &&
        Array.isArray(v.stagedEdits) &&
        v.stagedEdits.length <= 500 &&
        v.stagedEdits.every(isPersistedStagedEditEntry) &&
        new Set(v.stagedEdits.map(entry => entry.id)).size === v.stagedEdits.length &&
        (v.zoom === undefined || (typeof v.zoom === 'number' && Number.isFinite(v.zoom) && v.zoom > 0)) &&
        (v.panX === undefined || (typeof v.panX === 'number' && Number.isFinite(v.panX))) &&
        (v.panY === undefined || (typeof v.panY === 'number' && Number.isFinite(v.panY)));
    }

    // ── END draft state schema ─────────────────────────────────────────────────
    const metricsEl = document.getElementById('metrics');
    const contentEl = document.getElementById('content');
    const errorEl = document.getElementById('error');
    const placeholder = document.getElementById('placeholder');
    const toggleLayoutEl = document.getElementById('toggle-layout');
    const layoutStatusEl = document.getElementById('layout-status');
    const layoutErrorEl = document.getElementById('layout-error');

    ${formatMoveAnnouncement.toString()}
    ${formatMultiSelectAnnouncement.toString()}
    ${embedForWebview(computeContentBounds)}
    ${embedForWebview(computeCentringPan)}
    ${embedForWebview(computeZoomToFit)}
    ${embedForWebview(computeZoomToFitClearOf)}
    ${embedForWebview(formatEdgePathD)}
    ${embedForWebview(computeExpandedViewBox)}
    ${embedForWebview(applyEdgeGeometry)}
    ${embedForWebview(rememberEdgeGeometry)}
    ${embedForWebview(restoreEdgeGeometry)}
    ${embedForWebview(computeOptimalConnectionPoints)}
    ${embedForWebview(computeBoundaryWrap)}
    ${BOUNDARY_LABEL_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    ${DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    const BOUNDARY_LABEL_OFFSET_X = ${BOUNDARY_LABEL_OFFSET_X};
    const BOUNDARY_LABEL_OFFSET_Y = ${BOUNDARY_LABEL_OFFSET_Y};
    ${emitLiveRegion.toString()}
    ${embedForWebview(formatCanvasUpdateAnnouncement)}
    // ── Element text (#340): the host's wrapping and text markup, embedded verbatim ─
    ${TEXT_LAYOUT_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    const C4X_TEXT_METRICS = ${JSON.stringify(TEXT_METRICS)};
    ${embedForWebview(isGeometryEditAllowed)}
    ${embedForWebview(decideDraftRestore)}
    ${embedForWebview(isSameDiagram)}
    ${embedForWebview(planRenderEditState)}
    ${embedForWebview(pendingEditMatches)}
    ${embedForWebview(renderTransition)}
    ${embedForWebview(elementTextSignature)}
    ${embedForWebview(replaceCanvasText)}
    ${embedForWebview(formatDraftRestoreStatus)}
    ${embedForWebview(isDraftStateForCurrentScope)}
    ${embedForWebview(isRenderScopeValue)}
    ${embedForWebview(migrateLegacyDraftState)}
    ${embedForWebview(isPersistableViewport)}
    ${embedForWebview(shouldConfirmExitEdit)}
    ${embedForWebview(shouldEscapeTriggerExitConfirm)}
    ${embedForWebview(shouldAutoFitOnOpen)}
    ${embedForWebview(resolveInitialZoom)}
    ${embedForWebview(formatInitialZoomAnnouncement)}

    // ── Legend overlay shared helpers (#98) ─────────────────────────────────
    const LEGEND_CATALOG = ${JSON.stringify(LEGEND_CATALOG)};
    ${embedForWebview(filterLegendItems)}
    ${embedForWebview(clampLegendPosition)}
    ${embedForWebview(formatLegendMoveAnnouncement)}
    ${embedForWebview(isValidPresentElementTypes)}
    ${embedForWebview(isValidLegendSwatchColors)}
    ${embedForWebview(isValidLegendEntries)}
    ${embedForWebview(isValidLegendKeyTheme)}

    // ── Element styles (#322): the host resolver, embedded verbatim ─────────
    ${ELEMENT_STYLE_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    // ── Shape geometry (#323): the host's, embedded verbatim ────────────────
    ${SHAPE_GEOMETRY_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    // The key's element entries and swatches (#327): a staged tag edit rebuilds
    // the key with the host's own rule and drawing.
    ${KEY_CLIENT_FUNCTIONS.map(fn => embedForWebview(fn)).join('\n    ')}
    ${embedForWebview(paintNodeWithStyle)}
    ${embedForWebview(draftStyleElements)}
    ${embedForWebview(isValidElementStyleInputs)}
    /** Bundled sprite ids: tag-style $sprite values are checked as the host checks them. */
    const BUNDLED_SPRITE_IDS = ${JSON.stringify(BUNDLED_SPRITE_IDS)};
    /** Resolver inputs from the last render payload; null from an older host. */
    let elementStyleInputs = null;
    // The host's derived key (#327) and the swatch theme, so a staged tag edit
    // can rebuild the element entries; null for an older host.
    let hostLegendEntries = null;
    let legendKeyTheme = null;
    let lastLegendShow = true;

    let editMode = false;
    /** Layout mode and growth of the last render (#340), from its payload. */
    let renderLayoutInfo = { layoutMode: 'view', textGrown: false, diagramIdentity: null, viewType: null, sameDiagramEdit: null };
    /** Last layout mode reported to the host (#340). */
    let reportedLayoutMode = 'view';
    /** Waiting for the standard-size layout before edit mode starts (#340). */
    let awaitingEditLayout = false;
    let editLayoutTimer = null;
    /** The last render kept a restored draft back until the edit layout arrives (#340). */
    let restoreDeferred = false;
    /** The held draft was made on other source text; only new staged changes replace it (#340). */
    let heldDraftForOtherSource = false;
    /** The 15 s wait for the edit layout gave up; ask again only on the next Edit click (#340). */
    let editLayoutAbandoned = false;
    /** The diagram the last render showed, to keep edit mode only across re-renders of the same diagram (#340). */
    let lastRenderDiagram = null;
    /** The diagram (and render token) an edit-layout request was made on (#340 review 8). */
    let pendingEditFor = null;
    let dirty = false;
    // The renderToken of the render or error this webview shows (#439). A
    // declined refresh names it, so the host restores what is shown here.
    let shownRenderToken = null;
    function declineRefresh() {
      setLayoutStatus('Theme change or refresh will apply after you save or discard.', 'info', 'dirty');
      vscode.postMessage(typeof shownRenderToken === 'number'
        ? { type: 'visualLayout.refreshDeclined', shownRenderToken: shownRenderToken }
        : { type: 'visualLayout.refreshDeclined' });
    }
    function noteShownToken(message) {
      shownRenderToken = typeof message.renderToken === 'number' && Number.isInteger(message.renderToken)
        ? message.renderToken
        : null;
    }
    let inConflict = false;
    let visualLayout = { revision: '', nodes: [], boundaries: [], edges: [] };
    let selectedNode = null;
    /** Multi-select: set of node IDs currently in the selection. */
    let selectionSet = new Set();
    /** Currently selected relationship (g.edge element), read-only Phase 1. */
    let selectedEdge = null;
    /** Currently selected boundary (g.boundary element). */
    let selectedBoundary = null;
    /** Active endpoint re-assignment: 'from' | 'to' | null. */
    let reassignEndpointField = null;
    /** Connect mode (#66): { phase: 'idle' | 'awaitingSource' | 'awaitingTarget', sourceId? }. */
    let connectState = { phase: 'idle' };
    /** Endpoints held while the connect dialog collects label/technology/direction. */
    let pendingConnect = null;
    let dragState = null;
    let moveAnnouncementCounter = 0;

    let zoom = 1.0;
    let panX = 0;
    let panY = 0;
    /**
     * The canvas extent. Grows when an element is dragged past the edge (#142)
     * so the painted background follows it; purely a paint concern.
     */
    let originalViewBox = { x: 0, y: 0, w: 800, h: 600 };
    /**
     * The render-time viewBox. Never mutated after a render, so it is a stable
     * anchor for the camera (#160) — canvas growth must not move the picture.
     */
    let baseViewBox = { x: 0, y: 0, w: 800, h: 600 };
    /** True until the first render completes — gates auto-fit on open (#111). */
    let firstRender = true;
    /**
     * True once the user has moved the camera themselves (zoom control, wheel,
     * or pan). While false the camera is the extension's own framing and may be
     * re-fitted when the viewport changes; once true, it is the user's (#160).
     */
    let userAdjustedCamera = false;
    /**
     * The framing the extension applied when the diagram opened, kept so it can
     * be re-applied if the viewport only gains its size after the first render.
     * Null until the first render.
     */
    let openingCamera = null;
    /** Set when a camera calculation had to guess the viewport size. */
    let viewportWasDegenerate = false;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;

    function isRecord(value) {
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    }

    function isBoundedText(value, maxLength) {
      return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
    }

    function isCoordinate(value) {
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1000000;
    }

    function isNodeSnapshot(value) {
      return isRecord(value) &&
        isBoundedText(value.id, 256) &&
        typeof value.label === 'string' && value.label.length <= 4096 &&
        isBoundedText(value.type, 128) &&
        isCoordinate(value.x) && isCoordinate(value.y) &&
        isCoordinate(value.width) && value.width > 0 &&
        isCoordinate(value.height) && value.height > 0 &&
        (value.locked === undefined || typeof value.locked === 'boolean') &&
        (value.manualX === undefined || typeof value.manualX === 'boolean') &&
        (value.manualY === undefined || typeof value.manualY === 'boolean') &&
        (value.description === undefined || typeof value.description === 'string') &&
        (value.technology === undefined || typeof value.technology === 'string');
    }

    function isEdgeSnapshot(value) {
      return isRecord(value) &&
        isBoundedText(value.id, 256) &&
        isBoundedText(value.from, 256) &&
        isBoundedText(value.to, 256);
    }

    function isBoundarySnapshot(value) {
      return isRecord(value) &&
        isBoundedText(value.id, 256) &&
        typeof value.label === 'string' && value.label.length <= 4096 &&
        isCoordinate(value.x) && isCoordinate(value.y) &&
        isCoordinate(value.width) && value.width > 0 &&
        isCoordinate(value.height) && value.height > 0 &&
        Array.isArray(value.childNodeIds) &&
        value.childNodeIds.every(function(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256; }) &&
        Array.isArray(value.childBoundaryIds) &&
        value.childBoundaryIds.every(function(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256; }) &&
        // Manual geometry (#163) is optional: an older host omits it entirely.
        (value.manualX === undefined || typeof value.manualX === 'boolean') &&
        (value.manualY === undefined || typeof value.manualY === 'boolean') &&
        (value.manualWidth === undefined || isCoordinate(value.manualWidth)) &&
        (value.manualHeight === undefined || isCoordinate(value.manualHeight)) &&
        // movable (#271) is optional: absent means editable.
        (value.movable === undefined || typeof value.movable === 'boolean');
    }

    function isVisualLayoutSnapshot(value) {
      return isRecord(value) &&
        isBoundedText(value.revision, 128) &&
        Array.isArray(value.nodes) && value.nodes.every(isNodeSnapshot) &&
        Array.isArray(value.boundaries) && value.boundaries.every(isBoundarySnapshot) &&
        Array.isArray(value.edges) && value.edges.every(isEdgeSnapshot);
    }

    function isMetrics(value) {
      if (!isRecord(value)) {
        return false;
      }
      const timingFields = ['parseTime', 'modelTime', 'layoutTime', 'renderTime', 'totalTime'];
      return timingFields.every(field => typeof value[field] === 'number' && Number.isFinite(value[field])) &&
        Number.isInteger(value.elements) && value.elements >= 0 &&
        Number.isInteger(value.relationships) && value.relationships >= 0;
    }

    function isRenderMessage(message) {
      return isRecord(message) && message.type === 'render' && isRecord(message.payload) &&
        typeof message.payload.svg === 'string' &&
        isMetrics(message.payload.metrics) &&
        isVisualLayoutSnapshot(message.payload.visualLayout) &&
        // The draft-state identity is required (#167 review): without it the
        // settled persist would write an UNSCOPED record over valid persisted
        // state, and the restore guard would have nothing to compare against.
        isRenderScopeValue(message.payload.scope) &&
        // settings is optional; when present it must carry boolean flags.
        (message.payload.settings === undefined ||
          (isRecord(message.payload.settings) && typeof message.payload.settings.autoFitOnOpen === 'boolean' &&
            (message.payload.settings.legendShow === undefined ||
              typeof message.payload.settings.legendShow === 'boolean') &&
            // initialZoom (#134) is an optional numeric hint; out-of-range or
            // non-finite values are tolerated here and ignored by
            // resolveInitialZoom, which falls back to the auto-fit path.
            (message.payload.settings.initialZoom === undefined ||
              typeof message.payload.settings.initialZoom === 'number'))) &&
        // Legend overlay fields (#98) are optional but typed when present.
        isValidPresentElementTypes(message.payload.presentElementTypes) &&
        isValidLegendSwatchColors(message.payload.legendSwatchColors) &&
        // legendEntries (#327) is not part of the gate: a malformed key is
        // dropped in showSvg (the overlay falls back to the catalogue), it
        // never stops the diagram rendering.
        isValidElementStyleInputs(message.payload.elementStyleInputs);
    }

    function isErrorMessage(message) {
      return isRecord(message) && message.type === 'error' && isBoundedText(message.message, 8192);
    }

    function isAcceptedMessage(message) {
      return isRecord(message) &&
        message.type === 'visualLayout.accepted' &&
        message.protocolVersion === PROTOCOL_VERSION &&
        message.revision === visualLayout.revision &&
        isBoundedText(message.id, 256) && nodeSnapshot(message.id) !== undefined &&
        isCoordinate(message.x) && isCoordinate(message.y) &&
        (message.input === 'pointer' || message.input === 'keyboard') &&
        typeof message.persisted === 'boolean';
    }

    function setLayoutStatus(message, kind, state) {
      const isFailure = kind === 'error' || state === 'rejected';
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        isFailure ? 'assertive' : 'polite',
        message
      );
      layoutStatusEl.dataset.kind = kind || 'info';
      layoutStatusEl.dataset.state = state || 'clean';
      layoutStatusEl.title = message;
    }

    function nodeName(nodeEl) {
      const snapshot = nodeSnapshot(nodeEl.dataset.id);
      return snapshot && snapshot.label ? snapshot.label : nodeEl.dataset.id;
    }

    function findByDataId(selector, id) {
      const candidates = contentEl.querySelectorAll(selector);
      for (const candidate of candidates) {
        if (candidate.dataset.id === id) {
          return candidate;
        }
      }
      return null;
    }

    function nodeSnapshot(id) {
      return visualLayout.nodes.find(node => node.id === id);
    }

    function boundarySnapshot(id) {
      return visualLayout.boundaries.find(boundary => boundary.id === id);
    }

    /**
     * All node and boundary bounding boxes, used for zoom-to-fit so boundary
     * frames are included in the fitted region.
     */
    function allLayoutBoxes() {
      return visualLayout.nodes.map(function(n) {
        return { x: n.x, y: n.y, width: n.width, height: n.height };
      }).concat(visualLayout.boundaries.map(function(b) {
        return { x: b.x, y: b.y, width: b.width, height: b.height };
      }));
    }

    /**
     * Collect all descendant node IDs and boundary IDs of a boundary, including
     * nested boundaries, transitively.
     */
    function collectBoundaryDescendants(boundaryId) {
      const result = { nodeIds: [], boundaryIds: [] };
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) {
        return result;
      }
      const walk = function walk(id) {
        const b = boundarySnapshot(id);
        if (!b) {
          return;
        }
        result.boundaryIds.push(id);
        for (const childId of b.childNodeIds) {
          result.nodeIds.push(childId);
        }
        for (const childBoundaryId of b.childBoundaryIds) {
          walk(childBoundaryId);
        }
      };
      walk(boundaryId);
      return result;
    }

    let stagedEdits = {};
    let pendingRestoreState = null;
    // v1 has no document/fence provenance. Keep its original durable record
    // untouched until the user explicitly restores it here or discards it.
    let legacyDraft = null;
    let legacyRestoreAccepted = false;

    function showDraftPersistenceNotice() {
      const oldNotice = document.getElementById('draft-persistence-notice');
      if (oldNotice) oldNotice.remove();
      if (legacyDraft || !currentScope || !currentScope.includes('#c4x-fence-ambiguous:')) return;
      const notice = document.createElement('div');
      notice.id = 'draft-persistence-notice';
      notice.setAttribute('role', 'status');
      notice.style.cssText = 'position:absolute;top:12px;left:12px;right:12px;z-index:50;padding:12px;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border)';
      notice.textContent = 'Draft persistence is unavailable: identical C4X fences cannot be distinguished. Save changes before reloading, or make the fences differ.';
      contentEl.prepend(notice);
    }

    function showLegacyDraftPrompt() {
      if (!legacyDraft || document.getElementById('legacy-draft-recovery')) return;
      const prompt = document.createElement('div');
      prompt.id = 'legacy-draft-recovery';
      prompt.style.cssText = 'position:absolute;top:12px;left:12px;right:12px;z-index:50;padding:12px;background:var(--vscode-editor-background);color:var(--vscode-foreground);border:1px solid var(--vscode-panel-border)';
      prompt.setAttribute('role', 'region');
      prompt.setAttribute('aria-label', 'Recover legacy draft');
      const explanation = document.createElement('p');
      explanation.textContent = 'An older draft has no document or fence identity. It has been kept unchanged. Restore it here only if this is the diagram you were editing.';
      if (currentScope && currentScope.includes('#c4x-fence-ambiguous:')) explanation.textContent += ' Identical fences cannot be distinguished; make the fences differ before restoring.';
      const restoreButton = document.createElement('button');
      restoreButton.textContent = 'Restore legacy draft here';
      restoreButton.disabled = !isRenderScopeValue(currentScope) || currentScope.includes('#c4x-fence-ambiguous:');
      restoreButton.addEventListener('click', function() {
        if (!legacyDraft || !isRenderScopeValue(currentScope) || currentScope.includes('#c4x-fence-ambiguous:')) return;
        pendingRestoreState = migrateLegacyDraftState(legacyDraft, currentScope, pickPersistedEditFields);
        legacyDraft = null;
        legacyRestoreAccepted = true;
        prompt.remove();
        vscode.postMessage({ type: 'ready' });
      });
      const discardButton = document.createElement('button');
      discardButton.textContent = 'Discard legacy draft';
      discardButton.addEventListener('click', function() {
        legacyDraft = null;
        restoreDroppedAdds = 0;
        prompt.remove();
        vscode.setState(undefined);
        vscode.postMessage({ type: 'ready' });
      });
      prompt.append(explanation, restoreButton, discardButton);
      contentEl.prepend(prompt);
    }

    /** Staged relationships dropped from the saved draft because they were invalid (#260). */
    let restoreDroppedAdds = 0;
    /**
     * Identity of the diagram the panel is currently showing, taken from the
     * render message's scope field. Persisted with the draft and compared on
     * restore: the panel is reused across documents, so a draft from another
     * diagram must be rejected wholesale (#167 review).
     */
    let currentScope = undefined;
    /**
     * True while showSvg is settling a render. persistState honours it: the
     * render path clears staging (which would otherwise write a provisional,
     * default camera) BEFORE the opening camera and the restore/prune decision
     * are decided, and a reload would then restore that provisional camera
     * instead of the diagram's own framing (#167 review). Exactly one persist
     * runs at the end of showSvg, carrying the camera actually in effect.
     */
    let renderInFlight = false;


    function persistState() {
      if (renderInFlight) {
        return;
      }
      if (legacyDraft) return;
      // A restored draft held back for the edit layout (#340) stays in storage
      // untouched: no camera or other write may replace it before it is applied.
      if (restoreDeferred) return;
      // Never write an unscoped record: it would overwrite a valid persisted
      // draft with one that can never restore, destroying it (#167 review).
      if (!isRenderScopeValue(currentScope)) {
        return;
      }
      if (currentScope.includes('#c4x-fence-ambiguous:')) {
        showDraftPersistenceNotice();
        setLayoutStatus('Draft persistence is unavailable: identical C4X fences cannot be distinguished. Save changes before reloading, or make the fences differ.', 'info', dirty ? 'dirty' : 'clean');
        return;
      }
      // A hidden panel must not make its zero-sized opening camera durable.
      const viewport = document.getElementById('svg-container') || contentEl;
      if (!viewport || !isPersistableViewport(viewport.clientWidth, viewport.clientHeight)) return;
      try {
        const editsArray = Object.keys(stagedEdits).map(id => {
          return Object.assign({ id: id }, pickPersistedEditFields(stagedEdits[id]));
        });
        vscode.setState({
          schemaVersion: 2,
          scope: currentScope,
          editMode: editMode,
          selectedNodeId: selectedNode ? selectedNode.dataset.id : null,
          stagedEdits: editsArray,
          zoom: zoom,
          panX: panX,
          panY: panY
        });
      } catch (_e) {
        // setState is best-effort; never throw to the caller
      }
    }

    /**
     * Trailing debounce for camera persistence (#167).
     *
     * persistState() used to have exactly one caller, updateStagedChangesList,
     * so the camera was written only when a staged edit changed: a reload
     * restored where the user was at their last EDIT, not where they were
     * looking. Pan end, Fit, Reset and the zoom buttons are discrete, so they
     * call persistState() directly; a wheel gesture fires dozens of events, so
     * it goes through here and writes once the wheel stops.
     */
    let cameraPersistTimer = null;
    function persistCameraSoon() {
      if (cameraPersistTimer !== null) {
        clearTimeout(cameraPersistTimer);
      }
      cameraPersistTimer = setTimeout(function() {
        cameraPersistTimer = null;
        persistState();
      }, CAMERA_PERSIST_DEBOUNCE_MS);
    }

    /**
     * Drop a pending debounced camera write (#167 review). A wheel gesture's
     * timer that is still pending when a re-render begins must NOT fire after
     * it: the render re-derives the camera, and the stale write would put a
     * pre-render camera into the durable state. The render's one settled
     * persist carries the camera actually in effect instead.
     */
    function cancelPendingCameraPersist() {
      if (cameraPersistTimer !== null) {
        clearTimeout(cameraPersistTimer);
        cameraPersistTimer = null;
      }
    }

    function notifyDirtyChanged(isDirty) {
      // Staging new changes is the user's choice to replace a draft held for
      // other source text (#340 review 6): release it so the new draft persists.
      if (isDirty && heldDraftForOtherSource) {
        heldDraftForOtherSource = false;
        pendingRestoreState = null;
        restoreDeferred = false;
        setLayoutStatus('Your earlier draft, made on another version of this diagram, was replaced by these changes.', 'info', 'dirty');
        // The staging that brought us here persisted nothing while the old draft
        // was held: write the new draft now that it replaces the old one.
        setTimeout(persistState, 0);
      }
      vscode.postMessage({ type: 'dirtyStateChanged', dirty: isDirty });
    }

    function hasStagedProperties(edit) {
      return Object.keys(edit).some(key => edit[key] !== undefined);
    }

    function sameStringArrays(left, right) {
      return left.length === right.length && left.every((value, index) => value === right[index]);
    }

    function discardEmptyEdit(id) {
      if (stagedEdits[id] && !hasStagedProperties(stagedEdits[id])) {
        delete stagedEdits[id];
      }
    }

    function stageInspectorProperty(id, property, value, original) {
      if (!stagedEdits[id]) {
        stagedEdits[id] = {};
      }
      const unchanged = Array.isArray(value)
        ? Array.isArray(original) && sameStringArrays(value, original)
        : value === original;
      if (unchanged) {
        delete stagedEdits[id][property];
      } else {
        stagedEdits[id][property] = value;
      }
      discardEmptyEdit(id);
      updateStagedChangesList();
    }

    /**
     * Stage a relationship label edit. Empty input stages an explicit clear
     * (label: null); restoring the original text un-stages the edit.
     */
    function stageEdgeLabel(edgeId, value, originalLabel) {
      if (!stagedEdits[edgeId]) {
        stagedEdits[edgeId] = {};
      }
      const unchanged = value === originalLabel || (value === '' && !originalLabel);
      if (unchanged) {
        delete stagedEdits[edgeId].label;
        delete stagedEdits[edgeId].edgeId;
      } else {
        stagedEdits[edgeId].edgeId = edgeId;
        stagedEdits[edgeId].label = value === '' ? null : value;
      }
      discardEmptyEdit(edgeId);
      updateStagedChangesList();
    }

    /**
     * Redraw a node's text from its label, technology and description: the
     * values in overrides, else the staged edit, else the render snapshot.
     * Uses the host's own wrapping and markup (#340), so text wraps on the
     * canvas as the host draws it. The box keeps its rendered size until Save:
     * text longer than the box holds ends in an ellipsis, and the
     * save-triggered re-render grows the box. Returns true when the text changed.
     */
    function relayoutNodeText(id, overrides) {
      const nodeEl = findByDataId('g.node', id);
      const snapshot = nodeSnapshot(id);
      if (!nodeEl || !snapshot) return false;
      const drawn = nodeEl.querySelector(':scope > text[data-field]');
      if (!drawn) return false;
      const edit = stagedEdits[id] || {};
      const pick = function(field) {
        if (Object.prototype.hasOwnProperty.call(overrides, field)) return overrides[field];
        return edit[field] !== undefined ? edit[field] : snapshot[field];
      };
      const fill = drawn.getAttribute('fill') || '';
      const fontFamily = drawn.getAttribute('font-family') || '';
      // A named shape (#323) lays text out in its inner box; its outline paths are not a cylinder's.
      const shape = nodeEl.getAttribute('data-shape');
      // Deployment notation (#326): a bottom-left label row beside the icon, or
      // text above an infrastructure node's centred icon, as the host drew it.
      const labelRow = nodeEl.getAttribute('data-label-row') === 'bottom-left'
        ? { iconSlot: Number(nodeEl.getAttribute('data-icon-slot')) || 0, maxLines: Number(nodeEl.getAttribute('data-label-lines')) || undefined }
        : undefined;
      const iconBelow = nodeEl.getAttribute('data-icon-below') === 'true';
      const layout = layoutElementText({
        x: snapshot.x,
        y: snapshot.y,
        width: snapshot.width,
        height: snapshot.height,
        textBox: shape ? shapeTextBox(shape, snapshot.x, snapshot.y, snapshot.width, snapshot.height)
          : iconBelow ? infrastructureTextBox(snapshot.x, snapshot.y, snapshot.width, snapshot.height) : undefined,
        iconLayout: nodeEl.classList.contains('person'),
        cylinder: !shape && !labelRow && !iconBelow && !!nodeEl.querySelector(':scope > path'),
        labelRow: labelRow,
        fontFamily: fontFamily,
        label: pick('label') || undefined,
        technology: pick('technology') || undefined,
        typeLabel: nodeEl.getAttribute('data-type-label') || undefined,
        description: pick('description') || undefined,
      }, C4X_TEXT_METRICS);
      return replaceCanvasText(nodeEl, elementTextMarkup(layout, fill, fontFamily), elementTextSignature(layout));
    }

    /**
     * Live-update the node's rendered text for a staged property edit and
     * announce it politely. Cosmetic only — the save-triggered re-render
     * stays authoritative.
     */
    function updateCanvasText(id, field, value) {
      const overrides = {};
      overrides[field] = value;
      if (relayoutNodeText(id, overrides)) {
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          formatCanvasUpdateAnnouncement(field)
        );
      }
    }

    /**
     * Revert every canvas-visible aspect of a staged edit: the position (when
     * the edit moved the node) and any staged label/technology/description
     * text back to the snapshot values.
     */
    function revertNodeCanvasState(id, edit) {
      if (edit && edit.x !== undefined) {
        const nodeEl = findByDataId('g.node', id);
        if (nodeEl) {
          const baseX = Number(nodeEl.dataset.baseX);
          const baseY = Number(nodeEl.dataset.baseY);
          nodeEl.dataset.currentX = String(baseX);
          nodeEl.dataset.currentY = String(baseY);
          nodeEl.setAttribute('transform', 'translate(0 0)');
          updateConnectedEdges(id);
          updateEnclosingBoundariesForNode(id);
        }
      }
      if (!edit) return;
      const snapshot = nodeSnapshot(id);
      if (!snapshot) return;
      // All three fields at once: the staged edit is still in stagedEdits here,
      // so a field-by-field revert would lay out against the other staged values.
      if (edit.label !== undefined || edit.technology !== undefined || edit.description !== undefined) {
        relayoutNodeText(id, { label: snapshot.label, technology: snapshot.technology || null, description: snapshot.description || null });
      }
      if (edit.tags !== undefined) restyleNodesForTags({ [id]: snapshot.tags || [] });
    }

    /**
     * Repaint every node from the host's style resolver with the tags the
     * draft would save (#322): a staged tag edit recolours the canvas the way
     * the host draws it after Save, including the external accent order.
     * The overrides map forces an element's tags (used when reverting a staged edit
     * before it leaves stagedEdits). Paint only; outline redraws wait for Save.
     */
    function restyleNodesForTags(overrides) {
      if (!elementStyleInputs) return;
      const inputs = elementStyleInputs;
      const effective = draftStyleElements(
        inputs,
        function(id) { return nodeSnapshot(id); },
        function(id) { const staged = stagedEdits[id]; return staged && staged.tags !== undefined ? staged.tags : undefined; },
        overrides
      );
      const context = { rules: inputs.rules, accentSlots: computeAccentSlots(effective), brandColors: inputs.brandColors };
      effective.forEach(function(element) {
        if (!element.type) return;
        const nodeEl = findByDataId('g.node', element.id);
        if (!nodeEl) return;
        paintNodeWithStyle(nodeEl, resolveElementStyle(element, inputs.theme, context,
          { isKnownSprite: function(id) { return spriteIdMatches(id, BUNDLED_SPRITE_IDS); } }), inputs.borderWidth);
      });
      rebuildKeyForDraft(effective, inputs, context);
    }

    /**
     * Rebuild the key's element entries from the draft (#327), with the host's
     * own rule (computeElementKeyEntries) and swatch drawing, so a staged tag
     * edit shows its style in the key before Save. Boundary and relationship
     * entries do not depend on tags and are kept from the host.
     */
    function rebuildKeyForDraft(effective, inputs, context) {
      if (!hostLegendEntries || !legendKeyTheme) return;
      const swatchTheme = legendKeyTheme;
      const styleDeps = { resolveElementStyle: resolveElementStyle, orderedStyleTags: orderedStyleTags, styleTypeTag: styleTypeTag };
      const swatchDeps = { shapeOutlineSvg: shapeOutlineSvg, shapeNum: shapeNum, borderDashArray: borderDashArray };
      const elementEntries = computeElementKeyEntries(effective, inputs.theme, context, inputs.borderWidth,
        { isKnownSprite: function(id) { return spriteIdMatches(id, BUNDLED_SPRITE_IDS); } }, styleDeps)
        .map(function(entry) { return { label: entry.label, kind: entry.kind, swatch: keySwatchImage(entry, swatchTheme, swatchDeps) }; });
      const others = hostLegendEntries.filter(function(entry) { return entry.kind !== 'element'; });
      updateLegend(null, null, lastLegendShow, boundLegendEntries(elementEntries.concat(others)));
    }

    /**
     * Revert a boundary's canvas state to the snapshot geometry, including any
     * descendant nodes and nested boundaries that were translated with it.
     */
    function revertBoundaryCanvasState(id, edit) {
      if (!edit) return;
      const boundaryEl = findByDataId('g.boundary', id);
      const snapshot = boundarySnapshot(id);
      if (!snapshot) return;

      if (edit.x !== undefined || edit.y !== undefined) {
        if (boundaryEl) {
          boundaryEl.setAttribute('transform', 'translate(0 0)');
          boundaryEl.dataset.currentX = String(snapshot.x);
          boundaryEl.dataset.currentY = String(snapshot.y);
        }
        const descendants = collectBoundaryDescendants(id);
        for (const nodeId of descendants.nodeIds) {
          const nodeEl = findByDataId('g.node', nodeId);
          const nodeSnap = nodeSnapshot(nodeId);
          if (!nodeEl || !nodeSnap) continue;
          nodeEl.dataset.currentX = String(nodeSnap.x);
          nodeEl.dataset.currentY = String(nodeSnap.y);
          nodeEl.setAttribute('transform', 'translate(0 0)');
          updateConnectedEdges(nodeId);
        }
        for (const childBoundaryId of descendants.boundaryIds) {
          if (childBoundaryId === id) continue;
          const childEl = findByDataId('g.boundary', childBoundaryId);
          const childSnap = boundarySnapshot(childBoundaryId);
          if (!childEl || !childSnap) continue;
          childEl.setAttribute('transform', 'translate(0 0)');
          childEl.dataset.currentX = String(childSnap.x);
          childEl.dataset.currentY = String(childSnap.y);
        }
      }

      if (edit.w !== undefined || edit.h !== undefined) {
        if (boundaryEl) {
          const rect = boundaryEl.querySelector('rect');
          if (rect) {
            rect.setAttribute('width', String(snapshot.width));
            rect.setAttribute('height', String(snapshot.height));
            placeBoundaryLabel(boundaryEl, Number(rect.getAttribute('x')), Number(rect.getAttribute('y')), snapshot.width, snapshot.height);
          }
          boundaryEl.dataset.currentWidth = String(snapshot.width);
          boundaryEl.dataset.currentHeight = String(snapshot.height);
        }
      }

      if (selectedBoundary && selectedBoundary.dataset.id === id) {
        const handle = selectedBoundary.querySelector('.boundary-resize-handle');
        if (handle) {
          handle.setAttribute('x', String(snapshot.width - 10));
          handle.setAttribute('y', String(snapshot.height - 10));
        }
      }
    }

    function removeStagedEdit(id) {
      const edit = stagedEdits[id];
      let name;
      if (edit && edit.boundaryId !== undefined) {
        const boundary = boundarySnapshot(id);
        name = boundary ? boundary.label : id;
      } else {
        const node = nodeSnapshot(id);
        name = node ? node.label : id;
      }

      // Revert canvas position and staged text back to the snapshot values
      if (edit && edit.boundaryId !== undefined) {
        revertBoundaryCanvasState(id, edit);
      } else {
        revertNodeCanvasState(id, edit);
      }

      delete stagedEdits[id];

      // If this element is currently selected, repopulate inspector from snapshot
      if (selectedNode && selectedNode.dataset.id === id) {
        populateInspector(selectedNode);
      }

      updateStagedChangesList();
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        'Removed staged change for ' + name
      );
    }

    // ── Source diff ──────────────────────────────────────────────────────────

    let sourceDiffOpen = false;

    function toggleSourceDiff() {
      const body = document.getElementById('source-diff-body');
      const toggle = document.getElementById('source-diff-toggle');
      if (!body || !toggle) return;
      sourceDiffOpen = !sourceDiffOpen;
      body.hidden = !sourceDiffOpen;
      toggle.setAttribute('aria-expanded', String(sourceDiffOpen));
      if (sourceDiffOpen) {
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          'Source diff panel opened'
        );
        // Request fresh diff when the user opens the panel
        requestSourceDiff();
      }
    }

    function requestSourceDiff() {
      if (!sourceDiffOpen) return;
      const editsArray = Object.keys(stagedEdits).map(id => {
        const edit = stagedEdits[id];
        return {
          id: id,
          ...(edit.edgeId !== undefined ? { edgeId: edit.edgeId } : {}),
          ...(edit.x !== undefined ? { x: edit.x, y: edit.y } : {}),
          ...(edit.w !== undefined ? { w: edit.w } : {}),
          ...(edit.h !== undefined ? { h: edit.h } : {}),
          ...(edit.description !== undefined ? { description: edit.description } : {}),
          ...(edit.label !== undefined ? { label: edit.label } : {}),
          ...(edit.technology !== undefined ? { technology: edit.technology } : {}),
          ...(edit.tags !== undefined ? { tags: edit.tags } : {}),
          ...(edit.sprite !== undefined ? { sprite: edit.sprite } : {}),
          ...(edit.locked !== undefined ? { locked: edit.locked } : {}),
          ...(edit.newId !== undefined ? { newId: edit.newId } : {}),
          ...(edit.boundaryId !== undefined ? { boundaryId: edit.boundaryId } : {}),
          ...(edit.relType !== undefined ? { relType: edit.relType } : {}),
          ...(edit.from !== undefined ? { from: edit.from } : {}),
          ...(edit.to !== undefined ? { to: edit.to } : {})
        };
      });
      vscode.postMessage({
        type: 'visualLayout.requestSourceDiff',
        protocolVersion: PROTOCOL_VERSION,
        revision: visualLayout.revision,
        edits: editsArray
      });
    }

    function renderSourceDiff(lines, errorMsg) {
      const codeEl = document.getElementById('source-diff-code');
      const statusEl = document.getElementById('source-diff-status');
      if (!codeEl) return;

      codeEl.innerHTML = '';

      if (errorMsg) {
        if (statusEl) statusEl.textContent = 'Diff unavailable: ' + errorMsg;
        const msg = document.createElement('span');
        msg.className = 'diff-empty-msg';
        msg.textContent = errorMsg;
        codeEl.appendChild(msg);
        return;
      }

      if (!lines || lines.length === 0) {
        if (statusEl) statusEl.textContent = 'No changes staged.';
        const msg = document.createElement('span');
        msg.className = 'diff-empty-msg';
        msg.textContent = 'No changes staged.';
        codeEl.appendChild(msg);
        return;
      }

      const hasChanges = lines.some(function(l) { return l.kind !== 'unchanged'; });
      if (!hasChanges) {
        if (statusEl) statusEl.textContent = 'No source changes.';
        const msg = document.createElement('span');
        msg.className = 'diff-empty-msg';
        msg.textContent = 'No source changes.';
        codeEl.appendChild(msg);
        return;
      }

      const addedCount = lines.filter(function(l) { return l.kind === 'added'; }).length;
      const removedCount = lines.filter(function(l) { return l.kind === 'removed'; }).length;
      if (statusEl) {
        statusEl.textContent = '+' + addedCount + ' / -' + removedCount + ' lines';
      }

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var span = document.createElement('span');
        span.className = 'diff-line';
        span.dataset.kind = line.kind;
        span.setAttribute('role', 'row');
        span.setAttribute('aria-label', (line.kind === 'added' ? 'added' : line.kind === 'removed' ? 'removed' : 'unchanged') + ': ' + line.text);
        span.textContent = line.text;
        codeEl.appendChild(span);
      }
    }

    const sourceDiffToggleBtn = document.getElementById('source-diff-toggle');
    if (sourceDiffToggleBtn) {
      sourceDiffToggleBtn.addEventListener('click', toggleSourceDiff);
    }

    // ── End source diff ───────────────────────────────────────────────────────

    // ── Conflict state ────────────────────────────────────────────────────────

    function showConflictBanner(reason) {
      inConflict = true;
      const banner = document.getElementById('conflict-banner');
      const msgEl = document.getElementById('conflict-banner-message');
      if (!banner || !msgEl) return;
      // Sanitize: only set text content, never innerHTML
      msgEl.textContent = reason;
      banner.dataset.active = 'true';
      // Disable Save while in conflict
      const saveBtn = document.getElementById('save-staged-changes');
      if (saveBtn) saveBtn.disabled = true;
      // Assertive announcement via the existing live-region helper
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'assertive',
        reason
      );
    }

    function hideConflictBanner() {
      inConflict = false;
      const banner = document.getElementById('conflict-banner');
      if (banner) banner.dataset.active = 'false';
      // Re-enable Save if there are staged edits
      const saveBtn = document.getElementById('save-staged-changes');
      if (saveBtn) saveBtn.disabled = Object.keys(stagedEdits).length === 0;
    }

    function sendConflictResolution(action) {
      const message = {
        type: 'visualLayout.resolveConflict',
        protocolVersion: PROTOCOL_VERSION,
        action: action
      };
      // A rebase names the staged keys so the host can refuse one that would
      // move a relationship or boundary edit onto another statement (#261).
      // A list the host would reject is left out, never truncated: without the
      // list the host counts every unsafe positional id.
      if (action === 'rebase') {
        const stagedKeys = Object.keys(stagedEdits);
        if (stagedKeys.length <= 1000 && stagedKeys.every(function (key) { return key.length > 0 && key.length <= 512; })) {
          message.stagedKeys = stagedKeys;
        }
      }
      vscode.postMessage(message);
    }

    const conflictReloadBtn = document.getElementById('conflict-reload');
    const conflictDiffBtn = document.getElementById('conflict-diff');
    const conflictRebaseBtn = document.getElementById('conflict-rebase');

    if (conflictReloadBtn) {
      conflictReloadBtn.addEventListener('click', function() {
        // Discard the draft locally before sending the action
        Object.keys(stagedEdits).forEach(function(id) {
          const edit = stagedEdits[id];
          if (edit && edit.boundaryId !== undefined) {
            revertBoundaryCanvasState(id, edit);
          } else {
            revertNodeCanvasState(id, edit);
          }
        });
        stagedEdits = {};
        dirty = false;
        updateStagedChangesList();
        clearSelection();
        clearInspector();
        setEditMode(false);
        hideConflictBanner();
        sendConflictResolution('reloadAndDiscard');
      });
    }

    if (conflictDiffBtn) {
      conflictDiffBtn.addEventListener('click', function() {
        sendConflictResolution('viewDiff');
        // Open the source diff panel to show the draft vs. current source
        if (!sourceDiffOpen) {
          toggleSourceDiff();
        } else {
          requestSourceDiff();
        }
      });
    }

    if (conflictRebaseBtn) {
      conflictRebaseBtn.addEventListener('click', function() {
        sendConflictResolution('rebase');
      });
    }

    // ── End conflict state ────────────────────────────────────────────────────

    // ── Exit-edit confirmation (dirty guard) ─────────────────────────────────

    const exitEditBannerEl = document.getElementById('exit-edit-banner');
    const exitEditDiscardBtn = document.getElementById('exit-edit-discard');
    const exitEditCancelBtn = document.getElementById('exit-edit-cancel');

    function isExitEditConfirmVisible() {
      return !!(exitEditBannerEl && exitEditBannerEl.dataset.active === 'true');
    }

    function showExitEditConfirm() {
      if (!exitEditBannerEl) return;
      exitEditBannerEl.dataset.active = 'true';
      // Move focus to the banner so keyboard and screen-reader users land on
      // the confirmation; it is returned to the toggle on cancel.
      exitEditBannerEl.focus();
    }

    function hideExitEditConfirm() {
      if (exitEditBannerEl) exitEditBannerEl.dataset.active = 'false';
    }

    if (exitEditDiscardBtn) {
      exitEditDiscardBtn.addEventListener('click', function() {
        hideExitEditConfirm();
        discardStagedChanges();
        // Status message + assertive announcement (same pattern as the tail
        // of setLayoutStatus, but routed to the assertive region).
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'assertive',
          'Unsaved changes discarded'
        );
        layoutStatusEl.dataset.kind = 'info';
        layoutStatusEl.dataset.state = 'clean';
        layoutStatusEl.title = 'Unsaved changes discarded';
        layoutStatusEl.textContent = 'Unsaved changes discarded';
        toggleLayoutEl.focus();
      });
    }

    if (exitEditCancelBtn) {
      exitEditCancelBtn.addEventListener('click', function() {
        // Remain in edit mode with staged edits intact.
        hideExitEditConfirm();
        toggleLayoutEl.focus();
      });
    }

    // Escape with no selection while dirty opens the same confirmation.
    // A live selection consumes Escape first (clearing itself); form fields
    // and the rename dialog keep their native Escape behaviour.
    document.addEventListener('keydown', function(event) {
      if (event.key !== 'Escape') return;
      if (isExitEditConfirmVisible()) {
        // Escape on the banner itself cancels (dialog behaviour).
        event.preventDefault();
        hideExitEditConfirm();
        toggleLayoutEl.focus();
        return;
      }
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const renameDialogEl = document.getElementById('rename-dialog');
      if (renameDialogEl && renameDialogEl.open) return;
      const selectionCount = selectionSet.size + (selectedEdge ? 1 : 0);
      if (!shouldEscapeTriggerExitConfirm(editMode, dirty, selectionCount)) return;
      event.preventDefault();
      showExitEditConfirm();
    });

    // ── End exit-edit confirmation ────────────────────────────────────────────

    function updateStagedChangesList() {
      const listEl = document.getElementById('staged-changes-list');
      const saveBtn = document.getElementById('save-staged-changes');
      if (!listEl) return;

      listEl.innerHTML = '';
      const keys = Object.keys(stagedEdits);

      if (keys.length === 0) {
        const li = document.createElement('li');
        li.className = 'empty-changes-text';
        li.textContent = 'No changes staged';
        listEl.appendChild(li);
        if (saveBtn) saveBtn.disabled = true;
        dirty = false;
      } else if (inConflict) {
        // Keep Save disabled while in conflict state, even if edits exist.
        if (saveBtn) saveBtn.disabled = true;
        dirty = true;
      } else {
        keys.forEach(id => {
          const edit = stagedEdits[id];

          let name;
          const isEdgeEdit = edit.edgeId !== undefined;
          const isBoundaryEdit = edit.boundaryId !== undefined;
          const isAddRelationship = Array.isArray(edit.addRelationship);
          if (isAddRelationship && !isEdgeEdit && !isBoundaryEdit) {
            name = labelForNode(id);
          } else if (isEdgeEdit) {
            const edgeSnapshot = visualLayout.edges.find(e => e.id === edit.edgeId);
            if (edgeSnapshot) {
              const fromNode = visualLayout.nodes.find(n => n.id === edgeSnapshot.from);
              const toNode = visualLayout.nodes.find(n => n.id === edgeSnapshot.to);
              name = (fromNode ? fromNode.label : edgeSnapshot.from) + ' → ' + (toNode ? toNode.label : edgeSnapshot.to);
            } else {
              name = edit.edgeId;
            }
          } else if (isBoundaryEdit) {
            const boundary = boundarySnapshot(edit.boundaryId);
            name = boundary ? boundary.label : edit.boundaryId;
          } else {
            const node = nodeSnapshot(id);
            name = node ? node.label : id;
          }

          const li = document.createElement('li');

          const textWrap = document.createElement('span');
          textWrap.className = 'change-text';

          const title = document.createElement('span');
          title.className = 'change-title';
          title.textContent = name;
          textWrap.appendChild(title);

          const details = [];
          if (isAddRelationship) {
            for (const add of edit.addRelationship) {
              let line = formatAddRelationshipSummary(id, add.targetId, add.label);
              if (add.technology) {
                line += ' (' + add.technology + ')';
              }
              details.push(line);
            }
          }
          if (isEdgeEdit) {
            if (edit.label !== undefined) {
              details.push(edit.label === null ? 'Label cleared' : 'Label updated');
            }
            if (edit.technology !== undefined) {
              details.push(edit.technology === null ? 'Technology cleared' : 'Technology updated');
            }
            if (edit.relType !== undefined) {
              details.push('Type updated');
            }
            if (edit.from !== undefined) {
              details.push('Source endpoint updated');
            }
            if (edit.to !== undefined) {
              details.push('Target endpoint updated');
            }
          } else if (isBoundaryEdit) {
            if (edit.x !== undefined && edit.y !== undefined) {
              details.push('Moved to ' + edit.x + ', ' + edit.y);
            }
            if (edit.w !== undefined && edit.h !== undefined) {
              details.push('Resized to ' + edit.w + ' x ' + edit.h);
            }
          } else {
            if (edit.x !== undefined && edit.y !== undefined) {
              details.push('Moved to ' + edit.x + ', ' + edit.y);
            }
            if (edit.description !== undefined) {
              details.push('Description updated');
            }
            if (edit.label !== undefined) {
              details.push('Label updated');
            }
            if (edit.technology !== undefined) {
              details.push(edit.technology === null ? 'Technology cleared' : 'Technology updated');
            }
            if (edit.tags !== undefined) {
              details.push(edit.tags.length === 0 ? 'Tags cleared' : 'Tags updated');
            }
            if (edit.sprite !== undefined) {
              details.push(edit.sprite === null ? 'Sprite cleared' : 'Sprite updated');
            }
            if (edit.locked !== undefined) {
              details.push(edit.locked ? 'Locked ' + name : 'Unlocked ' + name);
            }
            if (edit.newId !== undefined) {
              const referenceCount = visualLayout.edges.filter(edge => edge.from === id || edge.to === id).length;
              details.push('Rename ' + id + ' → ' + edit.newId + ' (' + referenceCount + ' refs)');
            }
          }

          const detail = document.createElement('span');
          detail.className = 'change-detail';
          detail.textContent = details.join('; ');
          textWrap.appendChild(detail);

          li.appendChild(textWrap);

          const removeBtn = document.createElement('button');
          removeBtn.type = 'button';
          removeBtn.className = 'change-remove-btn';
          removeBtn.setAttribute('aria-label', 'Remove staged change for ' + name);
          removeBtn.textContent = '×';
          removeBtn.addEventListener('click', () => removeStagedEdit(id));
          li.appendChild(removeBtn);

          listEl.appendChild(li);
        });
        // Disable Save if any inspector field has a pending validation error.
        if (saveBtn) saveBtn.disabled = validationErrors.size > 0;
        dirty = true;
      }
      // Keep the diff panel in sync whenever the staged edits change
      requestSourceDiff();
      // Persist state for reload survival and notify host of dirty status
      persistState();
      notifyDirtyChanged(dirty);
    }

    function populateInspector(nodeEl) {
      const id = nodeEl.dataset.id;
      const snapshot = nodeSnapshot(id);
      if (!snapshot) return;

      document.getElementById('inspector-id').value = id;
      document.getElementById('inspector-type').value = snapshot.type;
      const staged = stagedEdits[id] || {};
      const labelField = document.getElementById('inspector-label');
      const techField = document.getElementById('inspector-tech');
      const tagsField = document.getElementById('inspector-tags');
      const spriteField = document.getElementById('inspector-sprite');
      const lockedField = document.getElementById('inspector-locked');
      const renameButton = document.getElementById('rename-element');
      labelField.value = staged.label !== undefined ? staged.label : snapshot.label;
      techField.value = staged.technology !== undefined ? (staged.technology || '') : (snapshot.technology || '');
      tagsField.value = (staged.tags !== undefined ? staged.tags : (snapshot.tags || [])).join(', ');
      spriteField.value = staged.sprite !== undefined ? (staged.sprite || '') : (snapshot.sprite || '');
      if (lockedField) {
        lockedField.checked = staged.locked !== undefined ? staged.locked : !!snapshot.locked;
        lockedField.disabled = !editMode;
      }
      labelField.disabled = !editMode;
      techField.disabled = !editMode;
      tagsField.disabled = !editMode;
      spriteField.disabled = !editMode;
      if (renameButton) renameButton.disabled = !editMode;

      const descField = document.getElementById('inspector-desc');
      if (staged.description !== undefined) {
        descField.value = staged.description || '';
      } else {
        descField.value = snapshot.description || '';
      }
      descField.disabled = !editMode;
    }

    function clearInspector() {
      const idField = document.getElementById('inspector-id');
      const typeField = document.getElementById('inspector-type');
      const labelField = document.getElementById('inspector-label');
      const techField = document.getElementById('inspector-tech');
      const tagsField = document.getElementById('inspector-tags');
      const spriteField = document.getElementById('inspector-sprite');
      const lockedField = document.getElementById('inspector-locked');
      const descField = document.getElementById('inspector-desc');
      const renameButton = document.getElementById('rename-element');
      if (idField) idField.value = '';
      if (typeField) typeField.value = '';
      if (labelField) labelField.value = '';
      if (techField) techField.value = '';
      if (tagsField) tagsField.value = '';
      if (spriteField) spriteField.value = '';
      if (lockedField) { lockedField.checked = false; lockedField.disabled = true; }
      if (descField) descField.value = '';
      if (labelField) labelField.disabled = true;
      if (techField) techField.disabled = true;
      if (tagsField) tagsField.disabled = true;
      if (spriteField) spriteField.disabled = true;
      if (descField) descField.disabled = true;
      if (renameButton) renameButton.disabled = true;
      // Clear any inline validation errors so they don't linger after deselect.
      clearAllFieldErrors();
    }

    function clearSelection() {
      clearEdgeSelection();
      if (selectedNode) {
        selectedNode.classList.remove('visual-layout-selected');
        selectedNode.setAttribute('aria-selected', 'false');
      }
      if (selectedBoundary) {
        selectedBoundary.classList.remove('visual-layout-selected');
        selectedBoundary.setAttribute('aria-selected', 'false');
        // Remove resize handles when deselecting.
        const handle = selectedBoundary.querySelector('.boundary-resize-handle');
        if (handle) {
          handle.remove();
        }
        selectedBoundary = null;
      }
      // Clear the multi-select set too
      for (const id of selectionSet) {
        const el = findByDataId('g.node', id);
        if (el) {
          el.classList.remove('visual-layout-selected');
          el.setAttribute('aria-selected', 'false');
        }
      }
      selectionSet = new Set();
      selectedNode = null;
      selectedBoundary = null;
      clearInspector();
    }

    /**
     * Add or remove nodeEl from the multi-select set (Shift+click).
     * selectedNode stays as the "primary" for the inspector or null when multi.
     */
    function toggleMultiSelect(nodeEl) {
      const id = nodeEl.dataset.id;
      if (selectionSet.has(id)) {
        // Deselect this node
        selectionSet.delete(id);
        nodeEl.classList.remove('visual-layout-selected');
        nodeEl.setAttribute('aria-selected', 'false');
        if (selectedNode === nodeEl) {
          selectedNode = null;
        }
      } else {
        selectionSet.add(id);
        nodeEl.classList.add('visual-layout-selected');
        nodeEl.setAttribute('aria-selected', 'true');
        selectedNode = nodeEl; // last added = primary
      }

      const count = selectionSet.size;
      if (count === 0) {
        clearInspector();
        setLayoutStatus('Selection cleared.', 'info', dirty ? 'dirty' : 'clean');
      } else if (count === 1) {
        // Back to single select — populate inspector normally
        const singleId = selectionSet.values().next().value;
        const singleEl = findByDataId('g.node', singleId);
        if (singleEl) {
          populateInspector(singleEl);
          const snapshot = nodeSnapshot(singleId);
          setLayoutStatus(
            nodeName(singleEl) + (snapshot && snapshot.locked ? ' selected and locked.' : ' selected.'),
            'info',
            dirty ? 'dirty' : 'clean'
          );
        }
      } else {
        // Multi-select: show placeholder in inspector
        clearInspector();
        showMultiSelectInspector(count);
        const announcement = formatMultiSelectAnnouncement(count);
        setLayoutStatus(announcement, 'info', dirty ? 'dirty' : 'clean');
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          announcement
        );
      }
    }

    /**
     * Show a placeholder in the inspector when multiple elements are selected.
     */
    function showMultiSelectInspector(count) {
      const idField = document.getElementById('inspector-id');
      const typeField = document.getElementById('inspector-type');
      const labelField = document.getElementById('inspector-label');
      if (idField) idField.value = '';
      if (typeField) typeField.value = '';
      if (labelField) labelField.value = count + ' elements selected';
    }

    function selectNode(nodeEl) {
      if (selectedNode !== nodeEl) {
        clearSelection();
        selectedNode = nodeEl;
        selectionSet = new Set([nodeEl.dataset.id]);
        selectedNode.classList.add('visual-layout-selected');
        selectedNode.setAttribute('aria-selected', 'true');
        populateInspector(nodeEl);
        const snapshot = nodeSnapshot(nodeEl.dataset.id);
        setLayoutStatus(
          nodeName(nodeEl) + (snapshot && snapshot.locked ? ' selected and locked.' : ' selected.'),
          'info',
          dirty ? 'dirty' : 'clean'
        );
      }
    }

    /**
     * Move a boundary to an absolute canvas position. The boundary and all
     * descendants are shifted by the delta from the snapshot position, and the
     * descendant nodes' current coordinates are updated so edge routing stays
     * correct.
     */
    function moveBoundary(boundaryId, x, y) {
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) return null;
      const dx = x - snapshot.x;
      const dy = y - snapshot.y;

      const boundaryEl = findByDataId('g.boundary', boundaryId);
      if (boundaryEl) {
        shiftWrappedFrame(boundaryEl, snapshot, x, y);
        boundaryEl.dataset.currentX = String(x);
        boundaryEl.dataset.currentY = String(y);
        boundaryEl.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
      }

      // The host moves a positioned frame's contents with it, axis by axis,
      // except contents pinned by their own authored (or staged) coordinate;
      // a pinned nested frame also holds its own contents on that axis
      // (applyBoundaryManualGeometry). The preview follows the same rules so
      // it shows what Save will render (#339).
      const nodeItems = [];
      for (const node of visualLayout.nodes || []) {
        const nodeEl = findByDataId('g.node', node.id);
        const pinned = nodePinned(node);
        nodeItems.push({
          id: node.id, x: node.x, y: node.y,
          currentX: nodeEl ? currentNodeCoordinate(nodeEl, node, 'x') : node.x,
          currentY: nodeEl ? currentNodeCoordinate(nodeEl, node, 'y') : node.y,
          pinnedX: pinned.x, pinnedY: pinned.y
        });
      }
      const boundaryItems = [];
      for (const b of visualLayout.boundaries || []) {
        const el = findByDataId('g.boundary', b.id);
        const pinned = boundaryPinned(b);
        boundaryItems.push({
          id: b.id, x: b.x, y: b.y,
          currentX: el ? currentBoundaryCoordinate(el, b, 'x') : b.x,
          currentY: el ? currentBoundaryCoordinate(el, b, 'y') : b.y,
          pinnedX: pinned.x, pinnedY: pinned.y,
          childNodeIds: b.childNodeIds, childBoundaryIds: b.childBoundaryIds
        });
      }
      const plan = planBoundaryMove(boundaryId, dx, dy, boundaryItems, nodeItems);
      for (const target of plan.nodes) {
        const nodeEl = findByDataId('g.node', target.id);
        const nodeSnap = nodeSnapshot(target.id);
        if (!nodeEl || !nodeSnap) continue;
        nodeEl.dataset.currentX = String(target.x);
        nodeEl.dataset.currentY = String(target.y);
        nodeEl.setAttribute('transform', 'translate(' + (target.x - nodeSnap.x) + ' ' + (target.y - nodeSnap.y) + ')');
        updateConnectedEdges(target.id);
      }
      for (const target of plan.boundaries) {
        const childEl = findByDataId('g.boundary', target.id);
        const childSnap = boundarySnapshot(target.id);
        if (!childEl || !childSnap) continue;
        shiftWrappedFrame(childEl, childSnap, target.x, target.y);
        childEl.dataset.currentX = String(target.x);
        childEl.dataset.currentY = String(target.y);
        childEl.setAttribute('transform', 'translate(' + (target.x - childSnap.x) + ' ' + (target.y - childSnap.y) + ')');
      }
      expandCanvasForBoundary(boundaryId, x, y);
      // Re-wrap as the host does on save: nested frames around their (possibly
      // pinned) contents, the moved frame at its new authored origin, then
      // every enclosing frame, so no frame shows a child hanging outside it.
      rewrapMovedBoundarySubtree(snapshot);
      updateEnclosingBoundariesForBoundary(boundaryId);
      return { x, y };
    }

    function nodePinned(nodeSnap) {
      const staged = stagedEdits[nodeSnap.id];
      return {
        x: nodeSnap.manualX === true || (staged !== undefined && staged.x !== undefined),
        y: nodeSnap.manualY === true || (staged !== undefined && staged.y !== undefined)
      };
    }

    function boundaryPinned(b) {
      const staged = stagedEdits[b.id];
      return {
        x: b.manualX === true || (staged !== undefined && staged.x !== undefined),
        y: b.manualY === true || (staged !== undefined && staged.y !== undefined)
      };
    }

    function currentNodeCoordinate(nodeEl, nodeSnap, axis) {
      const key = axis === 'x' ? 'currentX' : 'currentY';
      return nodeEl.dataset[key] !== undefined ? Number(nodeEl.dataset[key]) : nodeSnap[axis];
    }

    function currentBoundaryCoordinate(boundaryEl, b, axis) {
      const key = axis === 'x' ? 'currentX' : 'currentY';
      return boundaryEl.dataset[key] !== undefined ? Number(boundaryEl.dataset[key]) : b[axis];
    }

    /** Innermost first: every nested frame of the moved boundary, then the moved frame itself, pinned. */
    function rewrapMovedBoundarySubtree(moved) {
      const order = [];
      const seen = new Set([moved.id]);
      const walk = function walk(b) {
        for (const childId of b.childBoundaryIds || []) {
          if (seen.has(childId)) continue;
          seen.add(childId);
          const child = boundarySnapshot(childId);
          if (!child) continue;
          walk(child);
          order.push(child);
        }
      };
      walk(moved);
      for (let i = 0; i < order.length; i++) {
        rewrapBoundary(order[i]);
      }
      // A moved frame is saved with $x/$y, so its origin is authored.
      rewrapBoundary(moved, true);
    }

    /**
     * A frame that was live re-wrapped remembers its absolute frame in
     * dataset.wrap*, which an ancestor's re-wrap reads back. The group
     * transform carries the frame when the boundary moves, so the remembered
     * frame moves with it by the same step.
     */
    function shiftWrappedFrame(boundaryEl, snapshot, nextX, nextY) {
      if (boundaryEl.dataset.wrapX === undefined) return;
      const prevX = boundaryEl.dataset.currentX !== undefined ? Number(boundaryEl.dataset.currentX) : snapshot.x;
      const prevY = boundaryEl.dataset.currentY !== undefined ? Number(boundaryEl.dataset.currentY) : snapshot.y;
      boundaryEl.dataset.wrapX = String(Number(boundaryEl.dataset.wrapX) + (nextX - prevX));
      boundaryEl.dataset.wrapY = String(Number(boundaryEl.dataset.wrapY) + (nextY - prevY));
    }

    function expandCanvasForBoundary(boundaryId, nextX, nextY) {
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) return;
      const descendants = collectBoundaryDescendants(boundaryId);
      let maxRight = nextX + snapshot.width;
      let maxBottom = nextY + snapshot.height;
      for (const nodeId of descendants.nodeIds) {
        const nodeEl = findByDataId('g.node', nodeId);
        const nodeSnap = nodeSnapshot(nodeId);
        if (!nodeEl || !nodeSnap) continue;
        const cx = Number(nodeEl.dataset.currentX);
        const cy = Number(nodeEl.dataset.currentY);
        maxRight = Math.max(maxRight, cx + nodeSnap.width);
        maxBottom = Math.max(maxBottom, cy + nodeSnap.height);
      }
      growPaintedCanvas(contentEl.querySelector('svg'), maxRight, maxBottom);
    }

    function postBoundaryMove(boundaryId, x, y, input) {
      if (!geometryEditAllowed()) return;
      if (!stagedEdits[boundaryId]) {
        stagedEdits[boundaryId] = {};
      }
      stagedEdits[boundaryId].boundaryId = boundaryId;
      stagedEdits[boundaryId].x = x;
      stagedEdits[boundaryId].y = y;
      updateStagedChangesList();
      const snapshot = boundarySnapshot(boundaryId);
      const name = snapshot ? snapshot.label : boundaryId;
      setLayoutStatus(
        formatMoveAnnouncement(name, x, y, ++moveAnnouncementCounter),
        'info',
        'dirty'
      );
    }

    /**
     * Resize a boundary frame. Only the boundary's own rect is scaled; children
     * keep their positions. The new size is clamped to a minimum derived from
     * the contained descendants so children are never clipped.
     */
    function resizeBoundary(boundaryId, w, h) {
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) return null;
      const minSize = computeBoundaryMinimumSize(boundaryId);
      const nextW = Math.max(minSize.width, Math.round(w));
      const nextH = Math.max(minSize.height, Math.round(h));
      const boundaryEl = findByDataId('g.boundary', boundaryId);
      if (boundaryEl) {
        const rect = boundaryEl.querySelector('rect');
        if (rect) {
          rect.setAttribute('width', String(nextW));
          rect.setAttribute('height', String(nextH));
          placeBoundaryLabel(boundaryEl, Number(rect.getAttribute('x')), Number(rect.getAttribute('y')), nextW, nextH);
        }
        boundaryEl.dataset.currentWidth = String(nextW);
        boundaryEl.dataset.currentHeight = String(nextH);
      }
      expandCanvasForBoundary(boundaryId, snapshot.x, snapshot.y);
      return { width: nextW, height: nextH };
    }

    function computeBoundaryMinimumSize(boundaryId) {
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) return { width: 60, height: 60 };
      const descendants = collectBoundaryDescendants(boundaryId);
      const labelReserve = boundaryLabelReserve(findByDataId('g.boundary', boundaryId));
      let minW = Math.max(60, labelReserve.minWidth);
      let minH = 60;
      if (descendants.nodeIds.length === 0 && descendants.boundaryIds.length <= 1) {
        return { width: minW, height: minH };
      }
      let maxRight = 0;
      let maxBottom = 0;
      for (const nodeId of descendants.nodeIds) {
        const nodeSnap = nodeSnapshot(nodeId);
        if (!nodeSnap) continue;
        maxRight = Math.max(maxRight, nodeSnap.x + nodeSnap.width - snapshot.x);
        maxBottom = Math.max(maxBottom, nodeSnap.y + nodeSnap.height - snapshot.y);
      }
      for (const childBoundaryId of descendants.boundaryIds) {
        if (childBoundaryId === boundaryId) continue;
        const childSnap = boundarySnapshot(childBoundaryId);
        if (!childSnap) continue;
        maxRight = Math.max(maxRight, childSnap.x + childSnap.width - snapshot.x);
        maxBottom = Math.max(maxBottom, childSnap.y + childSnap.height - snapshot.y);
      }
      return {
        width: Math.max(minW, maxRight + 40),
        height: Math.max(minH, maxBottom + labelReserve.paddingBottom)
      };
    }

    function postBoundaryResize(boundaryId, width, height) {
      if (!geometryEditAllowed()) return;
      if (!stagedEdits[boundaryId]) {
        stagedEdits[boundaryId] = {};
      }
      stagedEdits[boundaryId].boundaryId = boundaryId;
      stagedEdits[boundaryId].w = width;
      stagedEdits[boundaryId].h = height;
      updateStagedChangesList();
      const snapshot = boundarySnapshot(boundaryId);
      const name = snapshot ? snapshot.label : boundaryId;
      setLayoutStatus(
        name + ' resized to ' + width + ' x ' + height + ' (' + ++moveAnnouncementCounter + ')',
        'info',
        'dirty'
      );
    }

    function selectBoundary(boundaryEl) {
      if (selectedBoundary !== boundaryEl) {
        clearSelection();
        selectedBoundary = boundaryEl;
        selectedBoundary.classList.add('visual-layout-selected');
        selectedBoundary.setAttribute('aria-selected', 'true');
        addBoundaryResizeHandle(selectedBoundary);
        const snapshot = boundarySnapshot(boundaryEl.dataset.id);
        const name = snapshot ? snapshot.label : boundaryEl.dataset.id;
        setLayoutStatus(
          name + ' selected. Drag to move; Shift+arrow keys to resize.',
          'info',
          dirty ? 'dirty' : 'clean'
        );
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          name + ' selected'
        );
      }
    }

    function addBoundaryResizeHandle(boundaryEl) {
      if (!boundaryEl || boundaryEl.querySelector('.boundary-resize-handle')) return;
      const snapshot = boundarySnapshot(boundaryEl.dataset.id);
      if (!snapshot) return;
      const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      handle.setAttribute('class', 'boundary-resize-handle');
      handle.setAttribute('x', String(snapshot.width - 10));
      handle.setAttribute('y', String(snapshot.height - 10));
      handle.setAttribute('width', '10');
      handle.setAttribute('height', '10');
      handle.setAttribute('fill', 'currentColor');
      handle.setAttribute('role', 'slider');
      handle.setAttribute('aria-label', 'Resize boundary');
      handle.setAttribute('tabindex', '0');
      boundaryEl.appendChild(handle);
    }

    function onBoundaryPointerDown(event) {
      if (!geometryEditAllowed() || event.button !== 0) return;
      const boundaryEl = event.currentTarget;
      const svg = boundaryEl.ownerSVGElement;
      if (!svg) return;
      selectBoundary(boundaryEl);
      boundaryEl.focus();
      const ctmInverse = captureDragFrame(svg);
      const point = svgPoint(event, svg, ctmInverse);
      dragState = {
        nodeEl: boundaryEl,
        svg: svg,
        pointerId: event.pointerId,
        ctmInverse: ctmInverse,
        pointerX: point.x,
        pointerY: point.y,
        clientX: event.clientX,
        clientY: event.clientY,
        threshold: dragThresholdFor(event.pointerType, DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX),
        // A click until the pointer passes the threshold (#251).
        dragging: false,
        startX: Number(boundaryEl.dataset.currentX || boundaryEl.dataset.baseX),
        startY: Number(boundaryEl.dataset.currentY || boundaryEl.dataset.baseY),
        isBoundaryMove: true
      };
      boundaryEl.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onBoundaryPointerMove(event) {
      if (!dragState || dragState.nodeEl !== event.currentTarget || dragState.pointerId !== event.pointerId || !dragState.isBoundaryMove) {
        return;
      }
      if (!dragState.dragging) {
        if (!hasPassedDragThreshold(dragState.clientX, dragState.clientY, event.clientX, event.clientY, dragState.threshold)) {
          event.preventDefault();
          return;
        }
        dragState.dragging = true;
      }
      const point = svgPoint(event, dragState.svg, dragState.ctmInverse);
      const dx = point.x - dragState.pointerX;
      const dy = point.y - dragState.pointerY;
      const boundaryId = dragState.nodeEl.dataset.id;
      // Whole units, as node moves are, so a written $x/$y is never a long float (#251).
      moveBoundary(boundaryId, Math.round(dragState.startX + dx), Math.round(dragState.startY + dy));
      event.preventDefault();
    }

    function finishBoundaryDrag(event, commit) {
      if (!dragState || dragState.nodeEl !== event.currentTarget || dragState.pointerId !== event.pointerId || !dragState.isBoundaryMove) {
        return;
      }
      const state = dragState;
      dragState = null;
      const boundaryEl = state.nodeEl;
      if (boundaryEl.hasPointerCapture(event.pointerId)) {
        boundaryEl.releasePointerCapture(event.pointerId);
      }
      const boundaryId = boundaryEl.dataset.id;
      if (!state.dragging) {
        // A click selects the boundary (done at pointer-down) and stages nothing (#251).
        return;
      }
      if (commit) {
        const x = Number(boundaryEl.dataset.currentX);
        const y = Number(boundaryEl.dataset.currentY);
        const settled = settlePointerMove({ x: state.startX, y: state.startY }, { x: x, y: y });
        if (!settled.stage) {
          // Dragged back to where it started: restore the exact start, stage nothing.
          moveBoundary(boundaryId, settled.x, settled.y);
          return;
        }
        postBoundaryMove(boundaryId, x, y, 'pointer');
      } else {
        moveBoundary(boundaryId, state.startX, state.startY);
        setLayoutStatus('Boundary move cancelled.', 'info', dirty ? 'dirty' : 'clean');
      }
    }

    function onBoundaryKeyDown(event) {
      if (!geometryEditAllowed()) return;
      const boundaryEl = event.currentTarget;
      const boundaryId = boundaryEl.dataset.id;
      const snapshot = boundarySnapshot(boundaryId);
      if (!snapshot) return;

      if (event.key === 'Enter' || event.key === ' ') {
        selectBoundary(boundaryEl);
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        if (selectedBoundary || selectedNode || selectedEdge || selectionSet.size > 0) {
          clearSelection();
          setLayoutStatus('Selection cleared.', 'info', dirty ? 'dirty' : 'clean');
          event.preventDefault();
          event.stopPropagation();
        }
        return;
      }

      if (!selectedBoundary || selectedBoundary !== boundaryEl) {
        selectBoundary(boundaryEl);
      }

      const step = event.shiftKey ? 25 : 10;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        if (event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
          // Shift+arrow resizes the boundary
          const rect = boundaryEl.querySelector('rect');
          const currentW = rect ? Number(rect.getAttribute('width')) : snapshot.width;
          const currentH = rect ? Number(rect.getAttribute('height')) : snapshot.height;
          let dw = 0;
          let dh = 0;
          if (event.key === 'ArrowRight') dw = step;
          else if (event.key === 'ArrowLeft') dw = -step;
          else if (event.key === 'ArrowDown') dh = step;
          else if (event.key === 'ArrowUp') dh = -step;
          const result = resizeBoundary(boundaryId, currentW + dw, currentH + dh);
          if (result) {
            postBoundaryResize(boundaryId, result.width, result.height);
          }
          event.preventDefault();
          return;
        }
        // Plain arrow moves the boundary and its children
        let dx = 0;
        let dy = 0;
        if (event.key === 'ArrowLeft') dx = -step;
        else if (event.key === 'ArrowRight') dx = step;
        else if (event.key === 'ArrowUp') dy = -step;
        else if (event.key === 'ArrowDown') dy = step;
        const currentX = Number(boundaryEl.dataset.currentX || snapshot.x);
        const currentY = Number(boundaryEl.dataset.currentY || snapshot.y);
        moveBoundary(boundaryId, Math.max(0, Math.round(currentX + dx)), Math.max(0, Math.round(currentY + dy)));
        postBoundaryMove(boundaryId, Number(boundaryEl.dataset.currentX), Number(boundaryEl.dataset.currentY), 'keyboard');
        event.preventDefault();
      }
    }

    function currentBox(id) {
      const nodeEl = findByDataId('g.node', id);
      const snapshot = nodeSnapshot(id);
      if (!nodeEl || !snapshot) {
        return null;
      }
      // The outline the host drew (#323): arrows end on it, as on the host.
      const shape = nodeEl.getAttribute('data-shape');
      return {
        x: Number(nodeEl.dataset.currentX),
        y: Number(nodeEl.dataset.currentY),
        width: snapshot.width,
        height: snapshot.height,
        insets: shape ? shapeSideInsets(shape, snapshot.width, snapshot.height) : undefined
      };
    }

    function connectionPoints(from, to) {
      return computeOptimalConnectionPoints(from, to);
    }

    function updateConnectedEdges(nodeId) {
      for (const edge of visualLayout.edges) {
        if (edge.from !== nodeId && edge.to !== nodeId) {
          continue;
        }

        const edgeEl = findByDataId('g.edge', edge.id);
        const from = currentBox(edge.from);
        const to = currentBox(edge.to);
        if (!edgeEl || !from || !to) {
          continue;
        }

        const fromHome = nodeSnapshot(edge.from);
        const toHome = nodeSnapshot(edge.to);
        if (Math.abs(from.x - fromHome.x) < 0.5 && Math.abs(from.y - fromHome.y) < 0.5
            && Math.abs(to.x - toHome.x) < 0.5 && Math.abs(to.y - toHome.y) < 0.5) {
          restoreEdgeGeometry(edgeEl); // back where the render drew it: routed geometry (#419)
          continue;
        }
        rememberEdgeGeometry(edgeEl);
        applyEdgeGeometry(edgeEl, connectionPoints(from, to));
      }
    }

    /**
     * The frame a boundary occupies right now, in absolute SVG units, plus the
     * manual-geometry flags computeBoundaryWrap needs.
     *
     * "Manual" means the host will keep this origin/size on save: either $x/$y
     * (or $w/$h) is authored on the subgraph — the snapshot says so — or the
     * session has a staged boundary move/resize for it (#137). The origin
     * itself is read from dataset.currentX/currentY, which only moveBoundary
     * writes, so it is always the authored or staged origin and never a
     * previously auto-wrapped one.
     */
    function boundaryWrapFrame(b) {
      const boundaryEl = findByDataId('g.boundary', b.id);
      const staged = stagedEdits[b.id];
      const stagedX = staged && staged.x !== undefined ? staged.x : undefined;
      const stagedY = staged && staged.y !== undefined ? staged.y : undefined;
      const stagedW = staged && staged.w !== undefined ? staged.w : undefined;
      const stagedH = staged && staged.h !== undefined ? staged.h : undefined;

      const originX = boundaryEl && boundaryEl.dataset.currentX !== undefined
        ? Number(boundaryEl.dataset.currentX)
        : b.x;
      const originY = boundaryEl && boundaryEl.dataset.currentY !== undefined
        ? Number(boundaryEl.dataset.currentY)
        : b.y;

      const readSize = function(wrapKey, currentKey, fallback) {
        if (boundaryEl && boundaryEl.dataset[wrapKey] !== undefined) {
          return Number(boundaryEl.dataset[wrapKey]);
        }
        if (boundaryEl && boundaryEl.dataset[currentKey] !== undefined) {
          return Number(boundaryEl.dataset[currentKey]);
        }
        return fallback;
      };

      const frame = {
        x: originX,
        y: originY,
        width: readSize('wrapWidth', 'currentWidth', b.width),
        height: readSize('wrapHeight', 'currentHeight', b.height)
      };

      if (b.manualX === true || stagedX !== undefined) { frame.manualX = true; }
      if (b.manualY === true || stagedY !== undefined) { frame.manualY = true; }
      const manualWidth = stagedW !== undefined ? stagedW : b.manualWidth;
      const manualHeight = stagedH !== undefined ? stagedH : b.manualHeight;
      if (manualWidth !== undefined) { frame.manualWidth = manualWidth; }
      if (manualHeight !== undefined) { frame.manualHeight = manualHeight; }
      return frame;
    }

    /** The frame a boundary is drawn at right now, after any live re-wrap. */
    function renderedBoundaryFrame(b) {
      const boundaryEl = findByDataId('g.boundary', b.id);
      if (boundaryEl && boundaryEl.dataset.wrapX !== undefined) {
        return {
          x: Number(boundaryEl.dataset.wrapX),
          y: Number(boundaryEl.dataset.wrapY),
          width: Number(boundaryEl.dataset.wrapWidth),
          height: Number(boundaryEl.dataset.wrapHeight)
        };
      }
      const frame = boundaryWrapFrame(b);
      return { x: frame.x, y: frame.y, width: frame.width, height: frame.height };
    }

    /** Direct children of a boundary, as boxes, at their current positions. */
    function boundaryChildBoxes(b) {
      const boxes = [];
      const nodeIds = b.childNodeIds || [];
      for (let i = 0; i < nodeIds.length; i++) {
        const cSnap = nodeSnapshot(nodeIds[i]);
        if (!cSnap) continue;
        const cEl = findByDataId('g.node', nodeIds[i]);
        boxes.push({
          x: cEl && cEl.dataset.currentX !== undefined ? Number(cEl.dataset.currentX) : cSnap.x,
          y: cEl && cEl.dataset.currentY !== undefined ? Number(cEl.dataset.currentY) : cSnap.y,
          width: cSnap.width,
          height: cSnap.height
        });
      }
      const boundaryIds = b.childBoundaryIds || [];
      for (let i = 0; i < boundaryIds.length; i++) {
        const childSnap = boundarySnapshot(boundaryIds[i]);
        if (!childSnap) continue;
        boxes.push(renderedBoundaryFrame(childSnap));
      }
      return boxes;
    }

    /**
     * Put a boundary's name (and type line) where the host draws them for a frame
     * at (x, y, width, height) in the group's own coordinates (#324). A
     * bottom-left label (c4-model) follows the frame's bottom edge, so it moves
     * on resize as well as on re-wrap; a top-left label follows its origin.
     */
    function placeBoundaryLabel(boundaryEl, x, y, width, height) {
      const texts = boundaryEl.querySelectorAll(':scope > text');
      if (texts.length === 0) return;
      const position = boundaryEl.getAttribute('data-label-position') === 'bottom-left' ? 'bottom-left' : 'top-left';
      const place = boundaryLabelPlacement(position, texts.length > 1, x, y, width, height);
      texts[0].setAttribute('x', String(place.nameX));
      texts[0].setAttribute('y', String(place.nameY));
      if (texts.length > 1) {
        texts[1].setAttribute('x', String(place.typeX));
        texts[1].setAttribute('y', String(place.typeY));
      }
    }

    /** Bottom padding and narrowest width a boundary's label asks of its frame (#324). */
    function boundaryLabelReserve(boundaryEl) {
      const reserve = boundaryEl ? Number(boundaryEl.getAttribute('data-label-reserve')) : NaN;
      const minWidth = boundaryEl ? Number(boundaryEl.getAttribute('data-label-min-width')) : NaN;
      return {
        paddingBottom: Number.isFinite(reserve) && reserve > 0 ? reserve : 40,
        minWidth: Number.isFinite(minWidth) && minWidth > 0 ? minWidth : 0
      };
    }

    /**
     * Paint one boundary at the given frame. Only the rect and the text label
     * move;
     * dataset.currentX/currentY stay untouched because boundary drag-start and
     * the keyboard nudge read them as the AUTHORED origin — rebasing them onto
     * an auto-wrapped frame silently changed where the next staged boundary
     * move started from (#163). The wrapped frame is remembered separately in
     * dataset.wrap*, which is what an ancestor's re-wrap reads back.
     *
     * moveBoundary offsets the whole group with a transform, so the rect is
     * written in the group's local space: absolute target minus that offset.
     */
    function paintBoundaryFrame(b, boundaryEl, frame) {
      const offsetX = (boundaryEl.dataset.currentX !== undefined ? Number(boundaryEl.dataset.currentX) : b.x) - b.x;
      const offsetY = (boundaryEl.dataset.currentY !== undefined ? Number(boundaryEl.dataset.currentY) : b.y) - b.y;
      const rect = boundaryEl.querySelector('rect');
      if (rect) {
        rect.setAttribute('x', String(frame.x - offsetX));
        rect.setAttribute('y', String(frame.y - offsetY));
        rect.setAttribute('width', String(frame.width));
        rect.setAttribute('height', String(frame.height));
      }
      placeBoundaryLabel(boundaryEl, frame.x - offsetX, frame.y - offsetY, frame.width, frame.height);
      boundaryEl.dataset.wrapX = String(frame.x);
      boundaryEl.dataset.wrapY = String(frame.y);
      boundaryEl.dataset.wrapWidth = String(frame.width);
      boundaryEl.dataset.wrapHeight = String(frame.height);
    }

    /** Re-wrap one boundary around its current children. Returns true if painted. */
    function rewrapBoundary(b, originAuthored) {
      const boundaryEl = findByDataId('g.boundary', b.id);
      if (!boundaryEl) return false;
      const base = boundaryWrapFrame(b);
      if (originAuthored) {
        base.manualX = true;
        base.manualY = true;
      }
      const frame = computeBoundaryWrap(base, boundaryChildBoxes(b), boundaryLabelReserve(boundaryEl));
      if (!Number.isFinite(frame.x) || !Number.isFinite(frame.y) ||
          !(frame.width > 0) || !(frame.height > 0)) {
        return false;
      }
      paintBoundaryFrame(b, boundaryEl, frame);
      return true;
    }

    /**
     * Re-wrap every boundary that encloses nodeId, then its ancestors,
     * bottom-up until no parent remains — a frame that grew must not be left
     * hanging outside the frame that contains it.
     */
    function updateEnclosingBoundariesForNode(nodeId) {
      if (!visualLayout.boundaries || visualLayout.boundaries.length === 0) return;

      const pending = [];
      for (let bi = 0; bi < visualLayout.boundaries.length; bi++) {
        const b = visualLayout.boundaries[bi];
        if (b.childNodeIds && b.childNodeIds.indexOf(nodeId) !== -1) {
          pending.push(b);
        }
      }
      rewrapBoundariesBottomUp(pending);
    }

    /**
     * Re-wrap every frame that encloses a moved boundary, then their
     * ancestors. The moved frame itself is not re-wrapped: it moved rigidly.
     */
    function updateEnclosingBoundariesForBoundary(boundaryId) {
      if (!visualLayout || !visualLayout.boundaries || visualLayout.boundaries.length === 0) return;

      const pending = [];
      for (let bi = 0; bi < visualLayout.boundaries.length; bi++) {
        const b = visualLayout.boundaries[bi];
        if (b.id !== boundaryId && b.childBoundaryIds && b.childBoundaryIds.indexOf(boundaryId) !== -1) {
          pending.push(b);
        }
      }
      rewrapBoundariesBottomUp(pending);
    }

    function rewrapBoundariesBottomUp(initial) {
      let pending = initial;
      const visited = new Set();
      // Bounded by the boundary count: every level consumes at least one
      // unvisited frame, so a malformed cyclic payload cannot spin here.
      for (let depth = 0; depth < visualLayout.boundaries.length && pending.length > 0; depth++) {
        const parents = [];
        for (let i = 0; i < pending.length; i++) {
          const b = pending[i];
          if (visited.has(b.id)) continue;
          visited.add(b.id);
          rewrapBoundary(b);
          for (let bi = 0; bi < visualLayout.boundaries.length; bi++) {
            const candidate = visualLayout.boundaries[bi];
            if (candidate.childBoundaryIds &&
                candidate.childBoundaryIds.indexOf(b.id) !== -1 &&
                !visited.has(candidate.id)) {
              parents.push(candidate);
            }
          }
        }
        pending = parents;
      }
    }

    /**
     * Put a node at exactly (x, y), without rounding or clamping. Callers
     * pass round(start) plus a delta from sharedDragDelta (pointer and
     * keyboard moves, #254, #423), or restore a gesture-start position, which
     * may be an unrounded auto-layout coordinate that must come back
     * unchanged (#251).
     */
    function placeNode(nodeEl, nextX, nextY) {
      const baseX = Number(nodeEl.dataset.baseX);
      const baseY = Number(nodeEl.dataset.baseY);
      nodeEl.dataset.currentX = String(nextX);
      nodeEl.dataset.currentY = String(nextY);
      nodeEl.setAttribute('transform', 'translate(' + (nextX - baseX) + ' ' + (nextY - baseY) + ')');
      updateConnectedEdges(nodeEl.dataset.id);
      updateEnclosingBoundariesForNode(nodeEl.dataset.id);
      expandCanvasForNode(nodeEl, nextX, nextY);
      return { x: nextX, y: nextY };
    }

    // Grow the painted canvas when a node is dragged beyond the current bounds
    // so it keeps a diagram background under it instead of falling off the
    // painted area (#142). This extends the coordinate space (originalViewBox)
    // and the background rect ONLY.
    //
    // It must never touch the camera or the svg element's box (#160). The
    // camera is anchored to baseViewBox and the element always fills the
    // viewport, so the picture holds still while the canvas grows. The old
    // version resized the element and re-derived the window from the growing
    // canvas, which shrank the whole diagram — and, because that also changed
    // getScreenCTM mid-gesture, made the dragged element accelerate away from
    // the cursor.
    function expandCanvasForNode(nodeEl, nextX, nextY) {
      const snapshot = nodeSnapshot(nodeEl.dataset.id);
      if (!snapshot) return;
      const svgEl = nodeEl.ownerSVGElement || nodeEl.closest('svg');
      growPaintedCanvas(svgEl, nextX + snapshot.width, nextY + snapshot.height);
    }

    /**
     * Extend originalViewBox and the background rect to cover (right, bottom).
     * Returns false when nothing needed growing.
     */
    function growPaintedCanvas(svgEl, right, bottom) {
      const expanded = computeExpandedViewBox(originalViewBox, right, bottom, 32);
      if (!expanded) return false;
      const dw = expanded.w - originalViewBox.w;
      const dh = expanded.h - originalViewBox.h;
      originalViewBox = expanded;
      if (svgEl) {
        const bg = svgEl.querySelector(':scope > rect');
        if (bg) {
          const bgW = Number(bg.getAttribute('width'));
          const bgH = Number(bg.getAttribute('height'));
          if (dw > 0 && Number.isFinite(bgW) && bgW > 0) bg.setAttribute('width', String(bgW + dw));
          if (dh > 0 && Number.isFinite(bgH) && bgH > 0) bg.setAttribute('height', String(bgH + dh));
        }
      }
      return true;
    }

    function postMove(nodeEl, input) {
      if (!geometryEditAllowed()) return;
      const id = nodeEl.dataset.id;
      const x = Number(nodeEl.dataset.currentX);
      const y = Number(nodeEl.dataset.currentY);

      if (!stagedEdits[id]) {
        stagedEdits[id] = {};
      }
      stagedEdits[id].x = x;
      stagedEdits[id].y = y;

      updateStagedChangesList();

      setLayoutStatus(
        formatMoveAnnouncement(
          nodeName(nodeEl),
          x,
          y,
          ++moveAnnouncementCounter
        ),
        'info',
        'dirty'
      );
    }

    /**
     * Map a pointer event into SVG user space.
     *
     * A drag MUST pass frozenInverse — the inverse CTM captured at
     * pointerdown. expandCanvasForNode() mutates the viewBox and the svg
     * element's width/height while the pointer is still down (#142), which
     * changes getScreenCTM() mid-gesture. Re-reading the live CTM on every
     * move then measures the delta against a different coordinate frame than
     * the one the drag started in; because a larger delta pushes the node
     * further out of bounds, which expands the canvas again, the error
     * compounds every frame. That is the runaway drag where the element
     * accelerates away from the cursor and the diagram appears to zoom out.
     */
    function svgPoint(event, svg, frozenInverse) {
      const point = svg.createSVGPoint();
      point.x = event.clientX;
      point.y = event.clientY;
      if (frozenInverse) {
        return point.matrixTransform(frozenInverse);
      }
      const matrix = svg.getScreenCTM();
      return matrix ? point.matrixTransform(matrix.inverse()) : point;
    }

    /** Inverse CTM to pin a drag to, or null when the browser cannot supply one. */
    function captureDragFrame(svg) {
      const matrix = svg.getScreenCTM();
      return matrix ? matrix.inverse() : null;
    }

    function onPointerDown(event) {
      if (!geometryEditAllowed() || event.button !== 0) {
        return;
      }
      const nodeEl = event.currentTarget;
      const svg = nodeEl.ownerSVGElement;
      if (!svg) {
        return;
      }

      if (connectState.phase !== 'idle') {
        pickConnectNode(nodeEl);
        event.preventDefault();
        return;
      }

      // Cmd/Ctrl+click is the accelerator for connect mode: the first one arms
      // the gesture and takes the source, the second takes the target. Shift is
      // already multi-select, so the two never collide.
      if ((event.metaKey || event.ctrlKey) && visualLayout.nodes.length >= 2) {
        startConnectMode();
        pickConnectNode(nodeEl);
        nodeEl.focus();
        event.preventDefault();
        return;
      }

      if (reassignEndpointField) {
        pickRelationshipEndpoint(nodeEl);
        event.preventDefault();
        return;
      }

      if (event.shiftKey) {
        // Shift+click: toggle this node in the multi-select set without starting a drag.
        toggleMultiSelect(nodeEl);
        nodeEl.focus();
        event.preventDefault();
        return;
      }

      // Pressing a member of a multi-selection keeps the set, so the drag that
      // follows moves the whole group (#252). Replacing the selection here, as
      // a click would, dropped the group before its start positions were read.
      // Any other press selects just this node, as before.
      const keepSelection = pointerDownKeepsSelection(Array.from(selectionSet), nodeEl.dataset.id);
      if (!keepSelection) {
        selectNode(nodeEl);
      }
      nodeEl.focus();
      const ctmInverse = captureDragFrame(svg);
      const point = svgPoint(event, svg, ctmInverse);
      // For multi-select, start a group drag tracking the primary node
      dragState = {
        nodeEl: nodeEl,
        svg: svg,
        pointerId: event.pointerId,
        ctmInverse: ctmInverse,
        pointerX: point.x,
        pointerY: point.y,
        clientX: event.clientX,
        clientY: event.clientY,
        threshold: dragThresholdFor(event.pointerType, DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX),
        lastDelta: { dx: 0, dy: 0 },
        // A press is a click until the pointer passes the threshold (#251):
        // nothing moves and nothing is staged before then.
        dragging: false,
        narrowSelectionOnClick: keepSelection,
        startX: Number(nodeEl.dataset.currentX),
        startY: Number(nodeEl.dataset.currentY),
        // Capture starting positions of ALL selected nodes for group move
        groupStartPositions: (function() {
          const positions = {};
          for (const id of selectionSet) {
            const el = findByDataId('g.node', id);
            if (el) {
              positions[id] = { x: Number(el.dataset.currentX), y: Number(el.dataset.currentY) };
            }
          }
          return positions;
        })()
      };
      nodeEl.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onPointerMove(event) {
      if (!dragState || dragState.nodeEl !== event.currentTarget || dragState.pointerId !== event.pointerId) {
        return;
      }
      if (!dragState.dragging) {
        if (!hasPassedDragThreshold(dragState.clientX, dragState.clientY, event.clientX, event.clientY, dragState.threshold)) {
          event.preventDefault();
          return;
        }
        dragState.dragging = true;
      }
      const point = svgPoint(event, dragState.svg, dragState.ctmInverse);
      const dx = point.x - dragState.pointerX;
      const dy = point.y - dragState.pointerY;
      // One delta for the whole gesture, clamped so no member leaves the canvas;
      // the group stops as a unit and every member moves by the same amount (#254).
      const members = dragMembers(dragState);
      const delta = sharedDragDelta(members.map(function(m) { return m.start; }), dx, dy);
      dragState.lastDelta = delta;
      for (const m of members) {
        placeNode(m.el, Math.round(m.start.x) + delta.dx, Math.round(m.start.y) + delta.dy);
      }
      event.preventDefault();
    }

    /** The dragged node and every other selected node, each with its gesture-start position. */
    function dragMembers(state) {
      const members = [{ el: state.nodeEl, start: { x: state.startX, y: state.startY } }];
      if (state.groupStartPositions) {
        for (const id of selectionSet) {
          if (id === state.nodeEl.dataset.id) continue;
          const el = findByDataId('g.node', id);
          const start = state.groupStartPositions[id];
          if (el && start) {
            members.push({ el: el, start: start });
          }
        }
      }
      return members;
    }

    function finishDrag(event, commit) {
      if (!dragState || dragState.nodeEl !== event.currentTarget || dragState.pointerId !== event.pointerId) {
        return;
      }
      const state = dragState;
      dragState = null;
      if (state.nodeEl.hasPointerCapture(event.pointerId)) {
        state.nodeEl.releasePointerCapture(event.pointerId);
      }
      if (commit) {
        if (!state.dragging) {
          // A click, not a drag (#251): it selects and stages nothing. A click
          // on a member of a multi-selection narrows the selection to that
          // node, which pointer-down deliberately deferred (#252).
          if (state.narrowSelectionOnClick) {
            clearSelection();
            selectNode(state.nodeEl);
          }
          return;
        }
        // Decide once, from the gesture's shared delta, so the group never
        // splits: either every member is restored to its exact start (a drag
        // that came home, #251) or every member is staged (#254).
        const members = dragMembers(state);
        const moved = state.lastDelta.dx !== 0 || state.lastDelta.dy !== 0;
        for (const m of members) {
          if (moved) {
            postMove(m.el, 'pointer');
          } else {
            placeNode(m.el, m.start.x, m.start.y);
          }
        }
      } else if (state.dragging) {
        // Revert all nodes in the group to their exact, unrounded starts.
        for (const m of dragMembers(state)) {
          placeNode(m.el, m.start.x, m.start.y);
        }
        setLayoutStatus('Move cancelled.', 'info', dirty ? 'dirty' : 'clean');
      }
    }

    function onNodeKeyDown(event) {
      if (!geometryEditAllowed()) {
        return;
      }
      const nodeEl = event.currentTarget;
      if (connectState.phase !== 'idle' && (event.key === 'Enter' || event.key === ' ')) {
        pickConnectNode(nodeEl);
        event.preventDefault();
        return;
      }
      if (reassignEndpointField && (event.key === 'Enter' || event.key === ' ')) {
        pickRelationshipEndpoint(nodeEl);
        event.preventDefault();
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        selectNode(nodeEl);
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        if (connectState.phase !== 'idle') {
          cancelConnectMode();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (reassignEndpointField) {
          cancelReassignEndpoint();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (selectionSet.size > 0) {
          // A live selection consumes Escape to clear itself.
          clearSelection();
          setLayoutStatus('Selection cleared.', 'info', dirty ? 'dirty' : 'clean');
          event.preventDefault();
          event.stopPropagation();
        }
        // With nothing selected, the document-level handler opens the
        // exit-edit confirmation when the draft is dirty.
        return;
      }

      // Shift+arrow: coarse step (25 units). Plain arrow: fine step (10 units).
      // Shift is also used for extending selection but only on click, not on arrow keys.
      const delta = event.shiftKey ? 25 : 10;
      let dx = 0, dy = 0;
      if (event.key === 'ArrowLeft') { dx = -delta; }
      else if (event.key === 'ArrowRight') { dx = delta; }
      else if (event.key === 'ArrowUp') { dy = -delta; }
      else if (event.key === 'ArrowDown') { dy = delta; }
      else { return; }

      // Ensure this node is in the selection
      if (!selectionSet.has(nodeEl.dataset.id)) {
        selectNode(nodeEl);
      }

      // Move ALL selected nodes by one shared delta, clamped as the pointer
      // path clamps it, so a group pushed into the left or top edge stops as
      // a unit instead of squashing against it (#423).
      const members = [];
      for (const id of selectionSet) {
        const el = findByDataId('g.node', id);
        if (!el) continue;
        members.push({ el: el, start: { x: Number(el.dataset.currentX), y: Number(el.dataset.currentY) } });
      }
      const shared = sharedDragDelta(members.map(function(m) { return m.start; }), dx, dy);
      for (const m of members) {
        placeNode(m.el, Math.round(m.start.x) + shared.dx, Math.round(m.start.y) + shared.dy);
        postMove(m.el, 'keyboard');
      }
      event.preventDefault();
    }

    /**
     * Visible canvas size in CSS pixels. The camera is anchored to this rather
     * than to the diagram canvas (#160): the SVG element always fills the
     * container exactly, so the window is viewport/zoom SVG units wide and the
     * zoom means "CSS pixels per SVG unit".
     *
     * Anchoring to the canvas — the pre-#160 model — coupled the on-screen
     * scale to the canvas box, so growing the canvas mid-drag shrank the whole
     * diagram, and a sub-1.0 zoom left the content centred inside an element
     * taller than the scroll port, i.e. below the fold on open.
     */
    function viewportSize() {
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const rect = svgContainer.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return { w: rect.width, h: rect.height };
      }
      // A render can arrive before the panel has been laid out (a webview that
      // is restored while hidden). Fall back to the canvas box so the camera is
      // still sane, and remember that the opening framing was a guess so the
      // first real resize can redo it.
      viewportWasDegenerate = true;
      return { w: baseViewBox.w, h: baseViewBox.h };
    }

    /**
     * Apply the framing the extension chose when the diagram opened: a fixed
     * scale from c4x.markdown.previewScale (#134), auto-fit (#111), or plain
     * content centring. Re-runnable, so a viewport that only gained its size
     * after the first render still ends up framed correctly.
     */
    function applyOpeningCamera() {
      if (!openingCamera) {
        return;
      }
      if (openingCamera.kind === 'fit') {
        const fit = computeZoomToFitClearOf(allLayoutBoxes(), baseViewBox, 32, viewportSize(), dockedKeyObstacle());
        zoom = fit.zoom;
        panX = fit.panX;
        panY = fit.panY;
      } else {
        // Centre on the content, not on the canvas box (#160). A canvas with
        // asymmetric padding — or one grown by a previous session's manual
        // positions — otherwise opens with the diagram pushed off the fold, so
        // the first thing the user has to do is drag it back into view.
        if (openingCamera.kind === 'fixed') {
          zoom = openingCamera.zoom;
        }
        const centred = computeCentringPan(allLayoutBoxes(), baseViewBox);
        panX = centred.panX;
        panY = centred.panY;
      }
      applyZoomPan();
      updateZoomDisplay();
    }

    /**
     * The docked key's box in viewport pixels (#262, #327), or null when the key
     * is hidden or the user dragged it out of the dock. Fit keeps nodes clear of it.
     */
    function dockedKeyObstacle() {
      const keyEl = document.getElementById('legend-overlay');
      if (!keyEl || keyEl.hidden || keyEl.classList.contains('legend-floating')) {
        return null;
      }
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const area = svgContainer.getBoundingClientRect();
      const box = keyEl.getBoundingClientRect();
      if (box.width <= 0 || box.height <= 0 || area.width <= 0 || area.height <= 0) {
        return null;
      }
      return { x: box.left - area.left, y: box.top - area.top, w: box.width, h: box.height };
    }

    function applyZoomPan() {
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const svgEl = svgContainer.querySelector('svg');
      if (!svgEl) return;
      const viewport = viewportSize();
      const w = viewport.w / zoom;
      const h = viewport.h / zoom;
      // The anchor is the render-time canvas centre and never moves, so canvas
      // growth during a drag cannot disturb the camera.
      const anchorX = baseViewBox.x + baseViewBox.w / 2;
      const anchorY = baseViewBox.y + baseViewBox.h / 2;
      const minX = anchorX - w / 2 - panX;
      const minY = anchorY - h / 2 - panY;
      svgEl.setAttribute('viewBox', minX + ' ' + minY + ' ' + w + ' ' + h);
    }

    // The reset control doubles as the zoom-level display (#134): refresh the
    // visible percentage whenever the zoom changes — the Markdown initial zoom,
    // auto-fit on open, or any user zoom action — so it shows the scale
    // actually in effect. Since #160 the zoom is a real CSS-pixels-per-SVG-unit
    // scale, so the label finally means what it says. Deliberately not called
    // from applyZoomPan itself, which also runs for pure pans and resizes.
    function updateZoomDisplay() {
      const zoomDisplayEl = document.getElementById('zoom-reset');
      if (zoomDisplayEl) {
        zoomDisplayEl.textContent = Math.round(zoom * 100) + '%';
      }
    }

    function onSvgPointerDown(event) {
      // A boundary that cannot be dragged does not take the pointer, so the canvas still pans from it (#271).
      if (event.button !== 0 || event.target.closest('g.node') || event.target.closest('g.boundary:not(.boundary-fixed)')) {
        return;
      }
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const svgEl = svgContainer.querySelector('svg');
      if (!svgEl) return;

      isPanning = true;
      panStartX = event.clientX - panX * zoom;
      panStartY = event.clientY - panY * zoom;
      svgEl.setPointerCapture(event.pointerId);
      event.preventDefault();
    }

    function onSvgPointerMove(event) {
      if (!isPanning) return;
      panX = (event.clientX - panStartX) / zoom;
      panY = (event.clientY - panStartY) / zoom;
      userAdjustedCamera = true;
      applyZoomPan();
      event.preventDefault();
    }

    function onSvgPointerUp(event) {
      if (!isPanning) return;
      isPanning = false;
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const svgEl = svgContainer.querySelector('svg');
      if (svgEl && svgEl.hasPointerCapture(event.pointerId)) {
        svgEl.releasePointerCapture(event.pointerId);
      }
      // Pan end is one discrete action: remember where the user left the
      // camera, not where they were at their last staged edit (#167).
      persistState();
    }

    function onSvgWheel(event) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.05 : 0.95;
      zoom = Math.max(0.2, Math.min(5.0, zoom * factor));
      userAdjustedCamera = true;
      applyZoomPan();
      updateZoomDisplay();
      persistCameraSoon();
    }

    /**
     * Keep the camera honest when the canvas viewport changes size — panel
     * resize, split-editor drag, or the sidebar opening on entering edit mode.
     * The window is derived from the container's pixel size, so without this
     * the scale would silently drift after a resize. Observed once; the
     * observer outlives individual renders.
     */
    let viewportResizeObserver = null;
    function observeViewportResize(svgContainer) {
      if (viewportResizeObserver || typeof ResizeObserver === 'undefined') {
        return;
      }
      viewportResizeObserver = new ResizeObserver(function() {
        if (legendOverlayEl && !legendOverlayEl.hidden) capLegendHeight();
        if (renderInFlight || !isPersistableViewport(svgContainer.clientWidth, svgContainer.clientHeight)) return;
        if (viewportWasDegenerate) {
          viewportWasDegenerate = false;
          // The opening framing was computed against a viewport with no size.
          // Now that there is one, redo it — unless the user has since taken
          // the camera, in which case theirs wins.
          if (!userAdjustedCamera) {
            applyOpeningCamera();
            // The corrected framing replaces the camera the settled persist
            // wrote at render time; make the APPLIED camera the durable one
            // (#167 review).
            persistState();
            return;
          }
        }
        applyZoomPan();
      });
      viewportResizeObserver.observe(svgContainer);
    }

    function initZoomPan() {
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const svgEl = svgContainer.querySelector('svg');
      if (svgEl) {
        const vbStr = svgEl.getAttribute('viewBox');
        if (vbStr) {
          const parts = vbStr.split(/\s+/).map(Number);
          if (parts.length === 4) {
            const oldAnchorX = baseViewBox.x + baseViewBox.w / 2;
            const oldAnchorY = baseViewBox.y + baseViewBox.h / 2;
            originalViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
            baseViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
            if (!firstRender) {
              const newAnchorX = baseViewBox.x + baseViewBox.w / 2;
              const newAnchorY = baseViewBox.y + baseViewBox.h / 2;
              panX += (newAnchorX - oldAnchorX);
              panY += (newAnchorY - oldAnchorY);
            }
          }
        }
        // The element fills the container, so the viewBox alone drives what is
        // visible. Intrinsic width/height attributes would otherwise fight the
        // camera through the CSS aspect ratio.
        svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svgEl.style.width = '100%';
        svgEl.style.height = '100%';
        observeViewportResize(svgContainer);
        svgEl.addEventListener('pointerdown', onSvgPointerDown);
        svgEl.addEventListener('pointermove', onSvgPointerMove);
        svgEl.addEventListener('pointerup', onSvgPointerUp);
        svgEl.addEventListener('pointercancel', onSvgPointerUp);
        svgEl.addEventListener('wheel', onSvgWheel, { passive: false });
      }
      applyZoomPan();
    }

    function prepareVisualLayout() {
      const nodesGroup = contentEl.querySelector('g.nodes');
      if (nodesGroup) {
        nodesGroup.setAttribute('role', 'listbox');
        nodesGroup.setAttribute('aria-label', 'Diagram elements');
        nodesGroup.setAttribute('aria-multiselectable', 'true');
      }

      const edgesGroup = contentEl.querySelector('g.edges');
      if (edgesGroup) {
        edgesGroup.setAttribute('role', 'listbox');
        edgesGroup.setAttribute('aria-label', 'Diagram relationships');
      }

      for (const snapshot of visualLayout.nodes) {
        const nodeEl = findByDataId('g.node', snapshot.id);
        if (!nodeEl) {
          continue;
        }
        nodeEl.dataset.baseX = String(snapshot.x);
        nodeEl.dataset.baseY = String(snapshot.y);
        nodeEl.dataset.currentX = String(snapshot.x);
        nodeEl.dataset.currentY = String(snapshot.y);
        nodeEl.setAttribute('role', 'option');

        if (snapshot.locked) {
          nodeEl.classList.add('locked');
          nodeEl.setAttribute('aria-label', snapshot.label + ', ' + snapshot.type + '. Locked. Press Enter to select; use arrow keys to move.');
        } else {
          nodeEl.classList.remove('locked');
          nodeEl.setAttribute('aria-label', snapshot.label + ', ' + snapshot.type + '. Press Enter to select; use arrow keys to move.');
        }

        nodeEl.setAttribute('aria-describedby', 'layout-status');
        nodeEl.setAttribute('aria-selected', 'false');
        nodeEl.setAttribute('tabindex', '-1');
        nodeEl.addEventListener('pointerdown', onPointerDown);
        nodeEl.addEventListener('pointermove', onPointerMove);
        nodeEl.addEventListener('pointerup', event => finishDrag(event, true));
        nodeEl.addEventListener('pointercancel', event => finishDrag(event, false));
        nodeEl.addEventListener('keydown', onNodeKeyDown);
      }

      // Boundaries: selectable/movable/resizable groups in edit mode
      for (const boundarySnapshot of visualLayout.boundaries) {
        const boundaryEl = findByDataId('g.boundary', boundarySnapshot.id);
        if (!boundaryEl) {
          continue;
        }
        boundaryEl.dataset.baseX = String(boundarySnapshot.x);
        boundaryEl.dataset.baseY = String(boundarySnapshot.y);
        boundaryEl.dataset.currentX = String(boundarySnapshot.x);
        boundaryEl.dataset.currentY = String(boundarySnapshot.y);
        boundaryEl.dataset.currentWidth = String(boundarySnapshot.width);
        boundaryEl.dataset.currentHeight = String(boundarySnapshot.height);
        if (boundarySnapshot.movable === false) {
          // A typed boundary (System_Boundary(...) and kin) has no place in
          // source for a position or size. Offering a drag that Save has to
          // refuse is worse than not offering it (#271), so it gets no
          // handlers. setEditMode adds the tooltip and spoken label that say
          // why, and only while editing.
          boundaryEl.classList.add('boundary-fixed');
          continue;
        }
        boundaryEl.setAttribute('role', 'option');
        boundaryEl.setAttribute('aria-label', boundarySnapshot.label + '. Boundary. Press Enter to select; use arrow keys to move, Shift+arrow keys to resize.');
        boundaryEl.setAttribute('aria-describedby', 'layout-status');
        boundaryEl.setAttribute('aria-selected', 'false');
        boundaryEl.setAttribute('tabindex', '-1');
        boundaryEl.addEventListener('pointerdown', onBoundaryPointerDown);
        boundaryEl.addEventListener('pointermove', onBoundaryPointerMove);
        boundaryEl.addEventListener('pointerup', event => finishBoundaryDrag(event, true));
        boundaryEl.addEventListener('pointercancel', event => finishBoundaryDrag(event, false));
        boundaryEl.addEventListener('keydown', onBoundaryKeyDown);
      }

      // Relationships: focusable + selectable in edit mode (read-only Phase 1)
      for (const edgeSnapshot of visualLayout.edges) {
        const edgeEl = findByDataId('g.edge', edgeSnapshot.id);
        if (!edgeEl) {
          continue;
        }
        edgeEl.setAttribute('role', 'option');
        edgeEl.setAttribute('aria-label', edgeAriaLabel(edgeSnapshot));
        edgeEl.setAttribute('aria-selected', 'false');
        edgeEl.setAttribute('tabindex', '-1');
        edgeEl.addEventListener('pointerdown', onEdgePointerDown);
        edgeEl.addEventListener('keydown', onEdgeKeyDown);
      }
    }

    function edgeAriaLabel(edgeSnapshot) {
      const fromNode = visualLayout.nodes.find(n => n.id === edgeSnapshot.from);
      const toNode = visualLayout.nodes.find(n => n.id === edgeSnapshot.to);
      const fromLabel = fromNode ? fromNode.label : edgeSnapshot.from;
      const toLabel = toNode ? toNode.label : edgeSnapshot.to;
      const relText = edgeSnapshot.label ? ', ' + edgeSnapshot.label : '';
      return fromLabel + ' to ' + toLabel + relText + '. Press Enter to select.';
    }

    function onEdgePointerDown(event) {
      if (!editMode) {
        return;
      }
      event.stopPropagation();
      const edgeEl = event.target.closest('g.edge');
      if (edgeEl) {
        selectEdge(edgeEl);
      }
    }

    function onEdgeKeyDown(event) {
      if (!editMode) {
        return;
      }
      const edgeEl = event.target.closest('g.edge');
      if (!edgeEl) {
        return;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        selectEdge(edgeEl);
      } else if (event.key === 'Escape') {
        if (selectedEdge || selectionSet.size > 0) {
          // A live selection consumes Escape to clear itself.
          event.preventDefault();
          event.stopPropagation();
          clearSelection();
        }
        // With nothing selected, the document-level handler opens the
        // exit-edit confirmation when the draft is dirty.
      }
    }

    function selectEdge(edgeEl) {
      clearSelection();
      clearInspector();
      selectedEdge = edgeEl;
      edgeEl.classList.add('visual-layout-selected');
      edgeEl.setAttribute('aria-selected', 'true');

      const snapshot = visualLayout.edges.find(e => e.id === edgeEl.dataset.id);
      if (!snapshot) {
        return;
      }
      const staged = stagedEdits[snapshot.id] || {};
      const fromId = staged.from !== undefined ? staged.from : snapshot.from;
      const toId = staged.to !== undefined ? staged.to : snapshot.to;
      const fromNode = visualLayout.nodes.find(n => n.id === fromId);
      const toNode = visualLayout.nodes.find(n => n.id === toId);
      const fromLabel = fromNode ? fromNode.label : fromId;
      const toLabel = toNode ? toNode.label : toId;

      const edgeInspector = document.getElementById('edge-inspector');
      const elementInspector = document.getElementById('element-inspector');
      if (elementInspector) {
        elementInspector.hidden = true;
      }
      if (edgeInspector) {
        edgeInspector.hidden = false;
        const fromField = document.getElementById('edge-from');
        const toField = document.getElementById('edge-to');
        fromField.value = fromLabel;
        toField.value = toLabel;
        fromField.dataset.endpointId = fromId;
        toField.dataset.endpointId = toId;
        const staged = stagedEdits[snapshot.id] || {};
        const labelField = document.getElementById('edge-label');
        labelField.value = staged.label !== undefined ? (staged.label || '') : (snapshot.label || '');
        labelField.disabled = !editMode;
        const typeField = document.getElementById('edge-type');
        typeField.value = staged.relType !== undefined ? staged.relType : (snapshot.relType || 'uses');
        typeField.disabled = !editMode;
        const techField = document.getElementById('edge-technology');
        techField.value = staged.technology !== undefined ? (staged.technology || '') : (snapshot.technology || '');
        techField.disabled = !editMode;
        const reassignFromBtn = document.getElementById('reassign-from');
        const reassignToBtn = document.getElementById('reassign-to');
        if (reassignFromBtn) reassignFromBtn.disabled = !editMode;
        if (reassignToBtn) reassignToBtn.disabled = !editMode;
        setFieldError('edge-type', null);
      }
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        'Relationship selected: ' + fromLabel + ' to ' + toLabel + (snapshot.label ? ', ' + snapshot.label : '')
      );
    }

    function clearEdgeSelection() {
      if (selectedEdge) {
        selectedEdge.classList.remove('visual-layout-selected');
        selectedEdge.setAttribute('aria-selected', 'false');
        selectedEdge = null;
      }
      reassignEndpointField = null;
      const edgeInspector = document.getElementById('edge-inspector');
      const elementInspector = document.getElementById('element-inspector');
      if (edgeInspector) {
        edgeInspector.hidden = true;
        const edgeLabelField = document.getElementById('edge-label');
        if (edgeLabelField) {
          edgeLabelField.disabled = true;
        }
        const edgeTypeField = document.getElementById('edge-type');
        if (edgeTypeField) {
          edgeTypeField.disabled = true;
        }
        const edgeTechField = document.getElementById('edge-technology');
        if (edgeTechField) {
          edgeTechField.disabled = true;
        }
        const reassignFromBtn = document.getElementById('reassign-from');
        const reassignToBtn = document.getElementById('reassign-to');
        if (reassignFromBtn) reassignFromBtn.disabled = true;
        if (reassignToBtn) reassignToBtn.disabled = true;
        setFieldError('edge-label', null);
        setFieldError('edge-type', null);
        setFieldError('edge-technology', null);
      }
      if (elementInspector) {
        elementInspector.hidden = false;
      }
    }

    function startReassignEndpoint(field) {
      if (!selectedEdge) return;
      reassignEndpointField = field;
      const label = field === 'from' ? 'source' : 'target';
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        'Reassign mode: click or press Enter on the new ' + label + ' element'
      );
      setLayoutStatus('Reassign mode: choose a new ' + label + ' element on the canvas.', 'info', dirty ? 'dirty' : 'clean');
    }

    function cancelReassignEndpoint() {
      reassignEndpointField = null;
      setLayoutStatus('Reassign cancelled.', 'info', dirty ? 'dirty' : 'clean');
    }

    function pickRelationshipEndpoint(nodeEl) {
      if (!selectedEdge || !reassignEndpointField) return;
      const edgeId = selectedEdge.dataset.id;
      const edgeSnapshot = visualLayout.edges.find(e => e.id === edgeId);
      if (!edgeSnapshot) return;
      const newEndpointId = nodeEl.dataset.id;
      const otherField = reassignEndpointField === 'from' ? 'to' : 'from';
      const otherId = stagedEdits[edgeId] && stagedEdits[edgeId][otherField] !== undefined
        ? stagedEdits[edgeId][otherField]
        : edgeSnapshot[otherField];
      const sourceNode = visualLayout.nodes.find(n => n.id === (reassignEndpointField === 'from' ? newEndpointId : otherId));
      const targetNode = visualLayout.nodes.find(n => n.id === (reassignEndpointField === 'to' ? newEndpointId : otherId));
      if (!sourceNode || !targetNode) return;
      if (!isRelationshipEndpointLegal(sourceNode.type, targetNode.type)) {
        const msg = 'Deployment Nodes cannot be connected directly to logical-view elements.';
        setFieldError('edge-type', msg);
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'assertive',
          msg
        );
        reassignEndpointField = null;
        return;
      }
      setFieldError('edge-type', null);
      stagedEdits = computeStageEdgeEndpoint(edgeId, reassignEndpointField, newEndpointId, edgeSnapshot[reassignEndpointField], stagedEdits);
      updateStagedChangesList();
      const endpointLabel = reassignEndpointField === 'from' ? 'source' : 'target';
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        'Reassigned relationship ' + endpointLabel + ' to ' + (targetNode ? targetNode.label : newEndpointId)
      );
      reassignEndpointField = null;
      // Refresh the inspector with the staged endpoint
      selectEdge(selectedEdge);
    }

    // -----------------------------------------------------------------------
    // Connect mode (#66): add a relationship by picking two elements.
    // -----------------------------------------------------------------------

    /**
     * Paint the eligibility affordance. Both the highlight and the click guard
     * read eligibleConnectTargets(), so what looks clickable always is.
     */
    function paintConnectEligibility() {
      const eligible = eligibleConnectTargets(connectState, visualLayout.nodes);
      const eligibleSet = new Set(eligible);
      const active = connectState.phase !== 'idle';
      contentEl.classList.toggle('connect-mode-active', active);
      for (const nodeEl of contentEl.querySelectorAll('g.node')) {
        const id = nodeEl.dataset.id;
        const isEligible = active && eligibleSet.has(id);
        const isChosenSource = connectState.phase === 'awaitingTarget' && id === connectState.sourceId;
        nodeEl.classList.toggle('connect-eligible', isEligible);
        nodeEl.classList.toggle('connect-source', isChosenSource);
        if (active && !isEligible && !isChosenSource) {
          nodeEl.classList.add('connect-ineligible');
          nodeEl.setAttribute('aria-disabled', 'true');
        } else {
          nodeEl.classList.remove('connect-ineligible');
          nodeEl.removeAttribute('aria-disabled');
        }
      }
    }

    function syncConnectButton() {
      const btn = document.getElementById('connect-mode');
      if (!btn) return;
      btn.disabled = !editMode || visualLayout.nodes.length < 2;
      btn.setAttribute('aria-pressed', String(connectState.phase !== 'idle'));
    }

    function startConnectMode() {
      if (!editMode || visualLayout.nodes.length < 2) return;
      clearSelection();
      connectState = { phase: 'awaitingSource' };
      paintConnectEligibility();
      syncConnectButton();
      const prompt = connectModePrompt(connectState);
      setLayoutStatus(prompt, 'info', dirty ? 'dirty' : 'clean');
      emitLiveRegion({ polite: layoutStatusEl, assertive: layoutErrorEl }, 'polite', prompt);
    }

    function cancelConnectMode(reason) {
      if (connectState.phase === 'idle' && !pendingConnect) return;
      connectState = { phase: 'idle' };
      pendingConnect = null;
      paintConnectEligibility();
      syncConnectButton();
      const message = reason || 'Connect cancelled.';
      setLayoutStatus(message, 'info', dirty ? 'dirty' : 'clean');
      emitLiveRegion({ polite: layoutStatusEl, assertive: layoutErrorEl }, 'polite', message);
    }

    function toggleConnectMode() {
      if (connectState.phase === 'idle') {
        startConnectMode();
      } else {
        cancelConnectMode();
      }
    }

    /** Handle a node pick while connect mode is armed. */
    function pickConnectNode(nodeEl) {
      const pickedId = nodeEl.dataset.id;
      const result = advanceConnectMode(connectState, pickedId, visualLayout.nodes);
      if (result.rejected) {
        emitLiveRegion({ polite: layoutStatusEl, assertive: layoutErrorEl }, 'assertive', result.rejected);
        setLayoutStatus(result.rejected, 'error', dirty ? 'dirty' : 'clean');
        return;
      }
      connectState = result.state;
      paintConnectEligibility();
      syncConnectButton();
      if (result.completed) {
        openConnectDialog(result.completed.sourceId, result.completed.targetId);
        return;
      }
      const prompt = connectModePrompt(connectState);
      setLayoutStatus(prompt, 'info', dirty ? 'dirty' : 'clean');
      emitLiveRegion({ polite: layoutStatusEl, assertive: layoutErrorEl }, 'polite', prompt);
    }

    function labelForNode(id) {
      const node = visualLayout.nodes.find(n => n.id === id);
      return node && node.label ? node.label : id;
    }

    function validateConnectDialog() {
      const labelInput = document.getElementById('connect-label');
      const techInput = document.getElementById('connect-technology');
      const validationEl = document.getElementById('connect-validation');
      const confirmBtn = document.getElementById('connect-confirm');
      if (!labelInput || !confirmBtn) return;
      const labelError = validateLabel(labelInput.value.trim());
      const pipeError = labelInput.value.includes('|') ? 'Label cannot contain the | character.' : null;
      const techError = techInput && techInput.value ? validateTechnology(techInput.value) : null;
      const stagingError = pendingConnect
        ? checkStageAddRelationship(pendingConnect.sourceId, pendingConnect.targetId, labelInput.value.trim(), stagedEdits)
        : null;
      const error = labelError || pipeError || techError || stagingError;
      if (validationEl) {
        validationEl.textContent = error || '';
      }
      labelInput.setAttribute('aria-invalid', String(Boolean(labelError || pipeError)));
      confirmBtn.disabled = Boolean(error) || labelInput.value.trim().length === 0;
    }

    function openConnectDialog(sourceId, targetId) {
      pendingConnect = { sourceId, targetId };
      const dialog = document.getElementById('connect-dialog');
      const endpointsEl = document.getElementById('connect-endpoints');
      const labelInput = document.getElementById('connect-label');
      const techInput = document.getElementById('connect-technology');
      const relTypeEl = document.getElementById('connect-reltype');
      if (endpointsEl) {
        endpointsEl.textContent = labelForNode(sourceId) + ' → ' + labelForNode(targetId);
      }
      if (labelInput) labelInput.value = '';
      if (techInput) techInput.value = '';
      if (relTypeEl) relTypeEl.value = 'uses';
      validateConnectDialog();
      if (dialog && typeof dialog.showModal === 'function') {
        dialog.showModal();
      }
      if (labelInput) labelInput.focus();
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        'Add relationship from ' + labelForNode(sourceId) + ' to ' + labelForNode(targetId) + '. Enter a label.'
      );
    }

    function closeConnectDialog() {
      const dialog = document.getElementById('connect-dialog');
      if (dialog && dialog.open && typeof dialog.close === 'function') {
        dialog.close();
      }
    }

    function confirmConnectDialog() {
      if (!pendingConnect) return;
      const labelInput = document.getElementById('connect-label');
      const techInput = document.getElementById('connect-technology');
      const relTypeEl = document.getElementById('connect-reltype');
      const label = labelInput ? labelInput.value.trim() : '';
      if (!label) return;
      const technology = techInput && techInput.value.trim() ? techInput.value.trim() : null;
      const relType = relTypeEl ? relTypeEl.value : 'uses';
      const { sourceId, targetId } = pendingConnect;
      const stagingError = checkStageAddRelationship(sourceId, targetId, label, stagedEdits);
      if (stagingError) {
        const validationEl = document.getElementById('connect-validation');
        if (validationEl) validationEl.textContent = stagingError;
        return;
      }

      stagedEdits = computeStageAddRelationship(sourceId, targetId, label, relType, technology, stagedEdits);
      pendingConnect = null;
      connectState = { phase: 'idle' };
      closeConnectDialog();
      paintConnectEligibility();
      syncConnectButton();
      updateStagedChangesList();
      const summary = formatAddRelationshipSummary(sourceId, targetId, label);
      setLayoutStatus(summary, 'info', 'dirty');
      emitLiveRegion({ polite: layoutStatusEl, assertive: layoutErrorEl }, 'polite', summary);
    }

    /**
     * Move the stats panel between its two homes (#160): the top of the
     * sidebar, immediately above the Properties Inspector, while editing; a
     * floating card in the canvas corner while previewing, when there is no
     * sidebar to dock to. One node, so the ids stay unique and the render path
     * never has to know which home is current.
     */
    /**
     * Zoom out to fit only when the diagram no longer fits the current
     * viewport, and only while the camera is still the one the extension
     * chose. Once the user has taken over the camera it is theirs: someone who
     * zoomed to 300% to work on one element must not be yanked back to fit
     * just because the sidebar opened.
     */
    function fitIfClipped() {
      const boxes = allLayoutBoxes();
      if (userAdjustedCamera || boxes.length === 0) {
        return;
      }
      const fit = computeZoomToFitClearOf(boxes, baseViewBox, 32, viewportSize(), dockedKeyObstacle());
      if (fit.zoom >= zoom) {
        return;
      }
      zoom = fit.zoom;
      panX = fit.panX;
      panY = fit.panY;
      applyZoomPan();
      updateZoomDisplay();
    }

    function dockDiagramStats(sidebarEl, docked) {
      const statsEl = document.getElementById('diagram-stats');
      if (!statsEl) {
        return;
      }
      if (docked && sidebarEl) {
        statsEl.className = 'sidebar-section stats-docked';
        if (statsEl.parentElement !== sidebarEl || sidebarEl.firstElementChild !== statsEl) {
          sidebarEl.insertBefore(statsEl, sidebarEl.firstChild);
        }
        return;
      }
      statsEl.className = 'stats-floating';
      if (statsEl.parentElement !== contentEl) {
        contentEl.appendChild(statsEl);
      }
    }

    /**
     * Tell the host the layout mode changed (#340), once per change. In edit
     * mode the host lays the diagram out at the standard box sizes, the layout
     * a Save of the first move produces.
     */
    function postLayoutMode(mode, force) {
      if (reportedLayoutMode === mode && !force) return;
      reportedLayoutMode = mode;
      vscode.postMessage({ type: 'visualLayout.layoutMode', mode: mode });
    }

    /**
     * Enter edit mode (#340). When boxes grew for wrapped text, a Save of the
     * first move would lay the diagram out at the standard sizes and shift what
     * the user did not move; so ask the host for the standard-size layout first
     * and enter edit mode when it arrives. The webview is clean here, so that
     * render is not held (nonSourceRenderGate.ts).
     */
    function requestEditMode() {
      editLayoutAbandoned = false;
      if (!isGeometryEditAllowed(true, renderLayoutInfo.layoutMode, renderLayoutInfo.textGrown)) {
        awaitingEditLayout = true;
        pendingEditFor = { afterToken: shownRenderToken };
        toggleLayoutEl.disabled = true;
        setLayoutStatus('Preparing the editor: boxes return to their standard size while you edit.', 'info', 'clean');
        postLayoutMode('edit');
        if (editLayoutTimer) clearTimeout(editLayoutTimer);
        editLayoutTimer = setTimeout(function() {
          // The edit layout never arrived. Never edit the layout on screen: a
          // Save would then shift what the user did not move. Leave edit mode
          // and let the user try again.
          if (!awaitingEditLayout) return;
          abandonEditLayout('The editable layout did not arrive, so edit mode was not started. Select Edit C4 Diagram to try again.');
        }, 15000);
        return;
      }
      setEditMode(true);
    }

    /** Give up waiting for the edit layout (#340): edit mode stays off, the reason is shown. */
    function abandonEditLayout(reason) {
      awaitingEditLayout = false;
      pendingEditFor = null;
      if (editLayoutTimer) { clearTimeout(editLayoutTimer); editLayoutTimer = null; }
      toggleLayoutEl.disabled = visualLayout.nodes.length === 0 && visualLayout.boundaries.length === 0;
      postLayoutMode('view');
      setLayoutStatus(reason, 'info', 'clean');
    }

    /** Geometry edits allowed now: edit mode on and the edit layout on screen (#340). */
    function geometryEditAllowed() {
      return isGeometryEditAllowed(editMode, renderLayoutInfo.layoutMode, renderLayoutInfo.textGrown);
    }

    function setEditMode(enabled, fromRender) {
      if (enabled && legacyDraft) {
        setLayoutStatus('Resolve the older draft before editing this diagram. It has been kept unchanged.', 'info', 'clean');
        showLegacyDraftPrompt();
        return;
      }
      // Edit mode is never on while the canvas shows a layout other than the
      // edit layout (#340 review round 4): every geometry entry point checks it.
      editMode = enabled && (visualLayout.nodes.length > 0 || visualLayout.boundaries.length > 0) &&
        isGeometryEditAllowed(true, renderLayoutInfo.layoutMode, renderLayoutInfo.textGrown);
      if (!fromRender) postLayoutMode(editMode ? 'edit' : 'view');
      contentEl.classList.toggle('visual-layout-editing', editMode);
      toggleLayoutEl.setAttribute('aria-pressed', String(editMode));
      toggleLayoutEl.textContent = editMode ? 'Exit edit mode' : 'Edit C4 Diagram';
      for (const nodeEl of contentEl.querySelectorAll('g.node')) {
        nodeEl.setAttribute('tabindex', editMode ? '0' : '-1');
      }
      for (const boundaryEl of contentEl.querySelectorAll('g.boundary')) {
        // A boundary that cannot be moved has no handlers, so it stays out of the tab order (#271).
        const fixed = boundaryEl.classList.contains('boundary-fixed');
        boundaryEl.setAttribute('tabindex', editMode && !fixed ? '0' : '-1');
        if (fixed) {
          // The explanation belongs to edit mode: in the read-only preview the
          // boundary is just a frame, and nothing there suggests it could move.
          const existingTitle = boundaryEl.querySelector(':scope > title');
          const fixedSnapshot = boundarySnapshot(boundaryEl.dataset.id);
          if (editMode) {
            boundaryEl.setAttribute('aria-label', (fixedSnapshot ? fixedSnapshot.label : 'Boundary') + '. Boundary. ' + BOUNDARY_FIXED_REASON);
            if (!existingTitle) {
              const tooltip = document.createElementNS('http://www.w3.org/2000/svg', 'title');
              tooltip.textContent = BOUNDARY_FIXED_REASON;
              boundaryEl.insertBefore(tooltip, boundaryEl.firstChild);
            }
          } else {
            boundaryEl.removeAttribute('aria-label');
            if (existingTitle && existingTitle.textContent === BOUNDARY_FIXED_REASON) {
              existingTitle.remove();
            }
          }
        }
      }
      for (const edgeEl of contentEl.querySelectorAll('g.edge')) {
        edgeEl.setAttribute('tabindex', editMode ? '0' : '-1');
      }
      const sidebarEl = document.getElementById('editor-sidebar');
      if (sidebarEl) {
        sidebarEl.style.display = editMode ? 'flex' : 'none';
      }
      dockDiagramStats(sidebarEl, editMode);
      if (editMode) {
        // The sidebar has just taken ~320px off the canvas. Hold the user's
        // zoom if the diagram still fits, but rescue it when it no longer does
        // — otherwise entering edit mode is immediately followed by the user
        // having to drag the diagram back into view (#160). Deferred a frame so
        // the sidebar's width is in the layout before the viewport is measured.
        requestAnimationFrame(fitIfClipped);
      }
      if (!editMode) {
        clearSelection(); // Also clears selectionSet and any selected edge
        clearInspector();
      }

      if (editMode) {
        setLayoutStatus(
          dirty
            ? 'Edit mode — draft is not persisted. Drag a node or use arrow keys.'
            : 'Edit mode: drag a node or focus it and use arrow keys.',
          'info',
          dirty ? 'dirty' : 'clean'
        );
      } else if (dirty) {
        setLayoutStatus('Draft only — not persisted; source is unchanged.', 'info', 'dirty');
      } else {
        setLayoutStatus('Preview mode', 'info', 'clean');
      }

      // Leaving edit mode must not strand an armed connect gesture.
      if (!editMode && (connectState.phase !== 'idle' || pendingConnect)) {
        connectState = { phase: 'idle' };
        pendingConnect = null;
        closeConnectDialog();
        paintConnectEligibility();
      }
      syncConnectButton();
    }

    function showError(message) {
      // Dismiss the exit-edit confirmation if it is open — the draft is gone.
      hideExitEditConfirm();
      // The edit layout we were waiting for failed (#340): edit mode stays off.
      if (awaitingEditLayout) {
        awaitingEditLayout = false;
        if (editLayoutTimer) { clearTimeout(editLayoutTimer); editLayoutTimer = null; }
      }
      errorEl.textContent = message;
      errorEl.style.display = 'block';
      metricsEl.textContent = '';
      placeholder.style.display = 'none';
      const svgContainer = document.getElementById('svg-container');
      if (svgContainer) {
        svgContainer.innerHTML = '';
      } else {
        contentEl.innerHTML = '';
      }
      // Hide the legend too — its content described a diagram that is gone.
      const legendEl = document.getElementById('legend-overlay');
      if (legendEl) {
        legendEl.hidden = true;
      }
      visualLayout = { revision: '', nodes: [], boundaries: [], edges: [] };
      // The canvas the draft was staged on is gone: tear the draft down and
      // report clean, so the host stops holding renders for it (#408).
      stagedEdits = {};
      updateStagedChangesList();
      dirty = false;
      toggleLayoutEl.disabled = true;
      setEditMode(false);
      setLayoutStatus(message, 'error', 'rejected');
    }

    function showSvg(svg, metrics, nextVisualLayout, renderSettings, presentElementTypes, legendSwatchColors, legendEntries, nextLegendKeyTheme) {
      renderInFlight = true; // no persists until the render has settled (#167)
      // A wheel-zoom debounce still pending from BEFORE this render must not
      // fire after it: it would write a camera the render has already
      // replaced. The settled persist at the bottom carries the camera
      // actually in effect (#167 review).
      cancelPendingCameraPersist();
      // The flag is released in a finally: a throw anywhere inside the render
      // must not leave persistence suppressed for the rest of the session
      // (#167 review). The one persist runs only after a successful settle.
      let renderSettled = false;
      try {
        const discardedDraft = dirty;
        // Clear conflict state on fresh render (host has resolved the conflict)
        if (inConflict) {
          hideConflictBanner();
        }
        // Dismiss the exit-edit confirmation too: a re-render resets the draft,
        // so a stale "unsaved changes" banner must not linger.
        hideExitEditConfirm();
        errorEl.style.display = 'none';
        placeholder.style.display = 'none';
        const svgContainer = document.getElementById('svg-container');
        if (svgContainer) {
          svgContainer.innerHTML = svg;
        } else {
          contentEl.innerHTML = svg;
        }
        visualLayout = nextVisualLayout;
        dirty = false;
        stagedEdits = {};
        updateStagedChangesList();
        selectedNode = null;
        selectionSet = new Set();
        dragState = null;
        initZoomPan();
        prepareVisualLayout();
        // ── Legend overlay (#98) ─────────────────────────────────────────────
        // Rebuild the contextual overlay on every render. c4x.legend.show=false
        // (delivered as settings.legendShow) hides it entirely; an absent
        // settings object defaults to showing it.
        const legendShow = !renderSettings || renderSettings.legendShow !== false;
        // A key the validator rejects is dropped, never the render (#327).
        const keyEntries = isValidLegendEntries(legendEntries) ? legendEntries : undefined;
        hostLegendEntries = Array.isArray(keyEntries) ? keyEntries : null;
        legendKeyTheme = isValidLegendKeyTheme(nextLegendKeyTheme) ? nextLegendKeyTheme : null;
        updateLegend(presentElementTypes, legendSwatchColors, legendShow, keyEntries);
        // ── Initial zoom on open (#111 auto-fit / #134 Markdown scale) ────────
        // A Markdown-originated payload carries settings.initialZoom (resolved
        // from c4x.markdown.previewScale): apply it exactly once on the first
        // render, centred like any fixed zoom, and skip the auto-fit path.
        // Otherwise fit the whole diagram into the viewport exactly once per
        // webview session, and only when c4x.canvas.autoFitOnOpen is enabled
        // (the host always sends the flag; an absent settings object defaults
        // to true). Save-triggered re-renders never re-fit: firstRender is
        // false by then.
        const autoFitOnOpen = !renderSettings || renderSettings.autoFitOnOpen !== false;
        const initialZoom = resolveInitialZoom(renderSettings);
        let didAutoFit = false;
        let appliedInitialZoom;
        // Only the first render frames the diagram. A save-triggered re-render
        // must leave the camera exactly where the user left it.
        let opening = null;
        if (firstRender && initialZoom !== undefined) {
          opening = { kind: 'fixed', zoom: initialZoom };
          appliedInitialZoom = initialZoom;
        } else if (shouldAutoFitOnOpen(firstRender, autoFitOnOpen)) {
          opening = { kind: 'fit' };
          didAutoFit = true;
        } else if (firstRender) {
          // No auto-fit and no explicit scale: still centre the content so the
          // diagram opens in the middle of the viewport rather than wherever the
          // canvas box happens to put it.
          opening = { kind: 'centre' };
        }
        if (opening) {
          openingCamera = opening;
          applyOpeningCamera();
        }
        firstRender = false;
        toggleLayoutEl.disabled = visualLayout.nodes.length === 0 && visualLayout.boundaries.length === 0;
        setEditMode(false, true);
        // Layout mode (#340): the standard-size layout asked for on entering
        // edit mode has arrived, so edit mode starts now, from the layout a
        // Save produces. A render in the other mode leaves edit mode off and
        // tells the host so.
        if (editLayoutTimer) { clearTimeout(editLayoutTimer); editLayoutTimer = null; }
        // A draft restored after a reload (#340 review round 4) is applied only
        // to the edit layout: when this render is the view layout of a diagram
        // whose boxes grew, keep the draft (in memory and in the persisted
        // state, untouched) and ask for the edit layout first. The webview
        // stays clean until then, so that render is an ordinary non-source
        // render reaching a clean webview: nothing is discarded.
        // A persisted draft made against other source text is held, unapplied and
        // untouched in storage, in every layout mode: nothing discards it except
        // the user staging new changes (#340 review 6).
        const thisDiagram = {
          identity: renderLayoutInfo.diagramIdentity,
          scope: currentScope,
          viewType: renderLayoutInfo.viewType,
          token: shownRenderToken,
          sameDiagramEdit: renderLayoutInfo.sameDiagramEdit,
        };
        const reportedBeforeRender = reportedLayoutMode;
        const editPlan = renderTransition({
          state: { awaiting: awaitingEditLayout, pendingEditFor: pendingEditFor, editLayoutAbandoned: editLayoutAbandoned, lastRenderDiagram: lastRenderDiagram },
          diagram: thisDiagram,
          layoutMode: renderLayoutInfo.layoutMode,
          editLayoutShown: isGeometryEditAllowed(true, renderLayoutInfo.layoutMode, renderLayoutInfo.textGrown),
          reportedLayoutMode: reportedLayoutMode,
          pendingRestoreState: pendingRestoreState,
          currentScope: currentScope,
        });
        // Every transition field comes from the pure step (#340 review 9).
        awaitingEditLayout = editPlan.state.awaiting;
        pendingEditFor = editPlan.state.pendingEditFor;
        lastRenderDiagram = editPlan.state.lastRenderDiagram;
        heldDraftForOtherSource = editPlan.state.heldDraftForOtherSource;
        const heldForOtherSource = editPlan.state.heldDraftForOtherSource;
        const deferRestore = editPlan.state.restoreDeferred;
        if (editPlan.action === 'leave') {
          postLayoutMode('view');
        } else if (editPlan.action === 'enter') {
          setEditMode(true, true);
          if (editMode) setLayoutStatus('Edit mode: boxes keep their standard size; long text is shortened, with the full text on hover.', 'info', 'clean');
        } else if (editPlan.action === 'request-edit-for-restore') {
          toggleLayoutEl.disabled = true;
          postLayoutMode('edit');
          if (editLayoutTimer) clearTimeout(editLayoutTimer);
          editLayoutTimer = setTimeout(function() {
            if (!awaitingEditLayout) return;
            editLayoutAbandoned = true;
            abandonEditLayout('The editable layout did not arrive. Your draft is kept: select Edit C4 Diagram to restore it.');
          }, 15000);
        } else if (editPlan.action === 'keep-waiting') {
          // A view render that was already in flight when Edit was clicked: the
          // edit layout follows it, so keep waiting and say so.
          setLayoutStatus('Preparing the editor: boxes return to their standard size while you edit.', 'info', 'clean');
          toggleLayoutEl.disabled = true;
          editLayoutTimer = setTimeout(function() {
            if (!awaitingEditLayout) return;
            abandonEditLayout('The editable layout did not arrive, so edit mode was not started. Select Edit C4 Diagram to try again.');
          }, 15000);
        } else if (editPlan.action === 'view') {
          postLayoutMode('view');
        }
        // An edit-layout render reaching a webview that is not editing or waiting
        // (a reloaded webview, say) means the host still thinks it is in edit
        // mode: tell it, so the next render grows boxes again (#340 review 8).
        if (reportedBeforeRender === 'view' && !editMode && !awaitingEditLayout && renderLayoutInfo.layoutMode === 'edit') {
          postLayoutMode('view', true);
        }

        // ── Draft restoration on first render after reload ────────────────────
        // Check once: if getState() has a valid persisted draft, restore it
        // rather than starting clean. pendingRestoreState is set at init time
        // and consumed exactly once here.
        let restoreStatus = null;
        restoreDeferred = deferRestore;
        if (heldForOtherSource) {
          restoreStatus = { text: 'Your draft was made on an earlier version of this diagram and has not been applied. It is kept: restore the earlier source text to get it back. Staging new changes replaces it.', tone: 'info', state: 'clean' };
        } else if (deferRestore && editLayoutAbandoned) {
          restoreStatus = { text: 'Your draft is kept: select Edit C4 Diagram to restore it.', tone: 'info', state: 'clean' };
        } else if (deferRestore) {
          restoreStatus = { text: 'Restoring your draft: preparing the editor at standard box sizes first.', tone: 'info', state: 'clean' };
        } else if (pendingRestoreState !== null) {
          const legacy = legacyRestoreAccepted;
          legacyRestoreAccepted = false;
          const restore = migrateLegacyDraftState(pendingRestoreState, currentScope, pickPersistedEditFields);
          pendingRestoreState = null;
          // The state must belong to the diagram now on screen (#167 review):
          // setState is panel-scoped and this panel is reused across documents
          // and fences, so a schema-valid draft can still be another diagram's.
          // A scope mismatch — or an ambiguous fence identity — rejects the
          // WHOLE state, camera and edits alike, even edits whose ids happen
          // to exist in both diagrams.
          if (isValidPersistedDraftState(restore) && isDraftStateForCurrentScope(restore, currentScope)) {
            {
              const pickedEdits = {};
              for (const entry of restore.stagedEdits) {
                pickedEdits[entry.id] = pickPersistedEditFields(entry);
              }
              const unmovable = dropUnmovableBoundaryEdits(pickedEdits, visualLayout.boundaries);
              const restored = unmovable.edits;
              const activeNodeIds = new Set(visualLayout.nodes.map(function(n) { return n.id; }));
              const activeBoundaryIds = new Set(visualLayout.boundaries.map(function(b) { return b.id; }));
              const activeEdgeIds = new Set(visualLayout.edges.map(function(e) { return e.id; }));
              const restoredKeys = Object.keys(restored);
              const validKeys = restoredKeys.filter(function(k) {
                return activeNodeIds.has(k) || activeBoundaryIds.has(k) || activeEdgeIds.has(k);
              });
              const missingCount = restoredKeys.length - validKeys.length;
              const droppedCount = missingCount + unmovable.labels.length;
              // ── Camera (#167) ───────────────────────────────────────────────
              // A remembered camera is only trustworthy next to the edits it was
              // framing. If any of them names an element the diagram no longer
              // has, the document moved on underneath the draft and the saved
              // viewport probably points at nothing; leave the opening camera
              // (auto-fit, or centred) to frame the diagram as it now is. With
              // no staged edits at all there is nothing to be stale against —
              // the camera is simply where the user was looking, so restore it.
              //
              // A restored camera sets userAdjustedCamera, which is what makes
              // it win over c4x.canvas.autoFitOnOpen: coming back to where you
              // were beats re-framing a diagram you had already framed.
              const cameraSaved = restore.zoom !== undefined &&
                restore.panX !== undefined && restore.panY !== undefined;
              if (cameraSaved && droppedCount === 0) {
                zoom = restore.zoom;
                panX = restore.panX;
                panY = restore.panY;
                userAdjustedCamera = true;
                applyZoomPan();
                updateZoomDisplay();
                // The opening camera was only provisional. Do not announce an
                // auto-fit or fixed initial zoom that the restored camera has
                // just replaced.
                didAutoFit = false;
                appliedInitialZoom = undefined;
                // The single persist at the end of showSvg writes the restored
                // camera back, so a camera-only draft stays durable across
                // repeated reloads without a dedicated write here.

              }

              if (validKeys.length > 0) {
                for (const k of validKeys) {
                  stagedEdits[k] = restored[k];
                }
                updateStagedChangesList();
                restyleNodesForTags();
                if (restore.editMode) {
                  setEditMode(true);
                }
                notifyDirtyChanged(true);
              }
              // Say what happened. Dropping edits used to be silent, so a user
              // came back to a draft that had quietly lost changes — or to no
              // draft and no explanation (#167). Emitted below, after the
              // auto-fit announcement, which would otherwise overwrite it.
              restoreStatus = formatDraftRestoreStatus(validKeys.length, missingCount);
              const notices = [];
              if (legacy) notices.push('Legacy draft restored once for this diagram; its old format did not record a source identity. Check the staged changes before saving.');
              if (unmovable.labels.length) notices.push(formatUnmovableBoundaryNotice(unmovable.labels));
              if (restoreDroppedAdds) notices.push(restoreDroppedAdds + (restoreDroppedAdds === 1 ? ' staged relationship was invalid and could not be restored.' : ' staged relationships were invalid and could not be restored.'));
              restoreDroppedAdds = 0;
              if (notices.length) {
                restoreStatus = { text: (restoreStatus ? restoreStatus.text + ' ' : '') + notices.join(' '), tone: 'info', state: validKeys.length ? 'dirty' : 'clean' };
              }
            }
          } else {
            restoreStatus = { text: 'Draft not restored: the diagram source changed or its fence identity is ambiguous. This includes whitespace changes. The saved camera and staged changes were discarded.', tone: 'info', state: 'clean' };
          }
        } else if (discardedDraft) {
          setLayoutStatus('Preview refreshed; the in-memory draft was discarded.', 'info', 'clean');
        }
        // Announce after all other first-render status messages so the polite
        // live region is not immediately overwritten. The announcement must
        // reflect what actually happened (#134): a fixed scale was applied for
        // Markdown-originated editors, not a zoom-to-fit.
        if (didAutoFit) {
          emitLiveRegion(
            { polite: layoutStatusEl, assertive: layoutErrorEl },
            'polite',
            'Diagram zoomed to fit'
          );
        } else if (appliedInitialZoom !== undefined) {
          emitLiveRegion(
            { polite: layoutStatusEl, assertive: layoutErrorEl },
            'polite',
            formatInitialZoomAnnouncement(appliedInitialZoom)
          );
        }
        // What happened to the draft is the last word on first render. Said
        // earlier it was overwritten by the auto-fit announcement above, so the
        // user was never told that staged changes had been dropped (#167).
        if (restoreStatus) {
          setLayoutStatus(restoreStatus.text, restoreStatus.tone, restoreStatus.state);
        }
        renderMetricsTable(metrics);
        renderSettled = true;
      } finally {
        // Always lift the suspension, settled or not (#167 review).
        renderInFlight = false;
      }
      // The render has settled: the opening camera, the restore/prune decision
      // and the status are all final. Run the render's one persist, carrying
      // the camera actually in effect — the applied opening framing, or the
      // restored camera that replaced it. A render that threw reaches here
      // with renderSettled false and persists nothing (#167 review).
      if (renderSettled) showDraftPersistenceNotice();
      if (renderSettled && legacyDraft) {
        const oldPrompt = document.getElementById('legacy-draft-recovery');
        if (oldPrompt) oldPrompt.remove();
        showLegacyDraftPrompt();
      }
      // A deferred draft restore (#340) persists nothing yet: the stored draft
      // must survive until the edit layout arrives and it is applied.
      if (renderSettled && !restoreDeferred) {
        persistState();
      }

    }

    /**
     * Render the diagram stats as a compact two-column table in the stats panel
     * (#160). They used to be a row of pill labels across the header, which
     * pushed the session buttons around and dominated the chrome; as a table
     * they read as the reference data they are.
     */
    function renderMetricsTable(metrics) {
      const rows = [
        ['Parse', metrics.parseTime.toFixed(2) + 'ms'],
        ['Model', metrics.modelTime.toFixed(2) + 'ms'],
        ['Layout', metrics.layoutTime.toFixed(2) + 'ms'],
        ['Render', metrics.renderTime.toFixed(2) + 'ms'],
        ['Total', metrics.totalTime.toFixed(2) + 'ms'],
        ['Elements', String(metrics.elements)],
        ['Relationships', String(metrics.relationships)]
      ];
      metricsEl.innerHTML =
        '<table class="stats-table"><tbody>' +
        rows.map(function(row) {
          return '<tr><th scope="row">' + row[0] + '</th><td>' + row[1] + '</td></tr>';
        }).join('') +
        '</tbody></table>';
    }

    toggleLayoutEl.disabled = true;
    toggleLayoutEl.addEventListener('click', () => {
      // Gate exit on the dirty state: staged edits would be silently lost.
      if (editMode && shouldConfirmExitEdit(dirty)) {
        showExitEditConfirm();
        return;
      }
      if (editMode) {
        setEditMode(false);
      } else if (!awaitingEditLayout) {
        requestEditMode();
      }
    });

    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    const zoomResetBtn = document.getElementById('zoom-reset');
    const zoomFitBtn = document.getElementById('zoom-fit');

    if (zoomInBtn) {
      zoomInBtn.addEventListener('click', () => {
        zoom = Math.min(5.0, zoom + 0.1);
        userAdjustedCamera = true;
        applyZoomPan();
        updateZoomDisplay();
        persistState();
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        zoom = Math.max(0.2, zoom - 0.1);
        userAdjustedCamera = true;
        applyZoomPan();
        updateZoomDisplay();
        persistState();
      });
    }
    if (zoomResetBtn) {
      zoomResetBtn.addEventListener('click', () => {
        // Reset means 1:1 with the content centred, not 1:1 with whatever the
        // canvas box happens to be.
        const centred = computeCentringPan(allLayoutBoxes(), baseViewBox);
        zoom = 1.0;
        panX = centred.panX;
        panY = centred.panY;
        userAdjustedCamera = true;
        applyZoomPan();
        updateZoomDisplay();
        persistState();
      });
    }
    if (zoomFitBtn) {
      zoomFitBtn.addEventListener('click', () => {
        const result = computeZoomToFitClearOf(allLayoutBoxes(), baseViewBox, 32, viewportSize(), dockedKeyObstacle());
        zoom = result.zoom;
        panX = result.panX;
        panY = result.panY;
        userAdjustedCamera = false;
        applyZoomPan();
        updateZoomDisplay();
        // Fit is a camera the user chose, even though it clears
        // userAdjustedCamera: persist it so a reload comes back fitted (#167).
        persistState();
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          'Diagram zoomed to fit'
        );
      });
    }

    // ── Connect mode wiring (#66) ───────────────────────────────────────────
    const connectModeBtn = document.getElementById('connect-mode');
    if (connectModeBtn) {
      connectModeBtn.addEventListener('click', () => {
        toggleConnectMode();
      });
    }

    const connectLabelInput = document.getElementById('connect-label');
    const connectTechInput = document.getElementById('connect-technology');
    const connectConfirmBtn = document.getElementById('connect-confirm');
    const connectCancelBtn = document.getElementById('connect-cancel');
    const connectDialogEl = document.getElementById('connect-dialog');

    if (connectLabelInput) {
      connectLabelInput.addEventListener('input', validateConnectDialog);
      connectLabelInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          if (connectConfirmBtn && !connectConfirmBtn.disabled) {
            confirmConnectDialog();
          }
        }
      });
    }
    if (connectTechInput) {
      connectTechInput.addEventListener('input', validateConnectDialog);
    }
    if (connectConfirmBtn) {
      connectConfirmBtn.addEventListener('click', () => {
        confirmConnectDialog();
      });
    }
    if (connectCancelBtn) {
      connectCancelBtn.addEventListener('click', () => {
        closeConnectDialog();
        cancelConnectMode();
      });
    }
    if (connectDialogEl) {
      // Covers Escape inside the dialog and any other native close path.
      connectDialogEl.addEventListener('close', () => {
        if (pendingConnect) {
          cancelConnectMode();
        }
      });
    }

    // ── Legend overlay (#98) ────────────────────────────────────────────────
    // The legend is a draggable HTML overlay floating over the canvas area,
    // outside the SVG (which is wholesale replaced on every render). Its
    // position lives only in webview memory — like zoom/pan — so it survives
    // re-renders within the session but never touches source. A null position
    // means the default anchor: in flow at the right-hand end of the canvas
    // overlay dock's row, beside or above the toolbar but never over it
    // (#250). An explicit position takes the legend out of that row
    // (.legend-floating) and pins it by left/top within the canvas.
    const legendOverlayEl = document.getElementById('legend-overlay');
    const legendItemsEl = document.getElementById('legend-items');
    let legendPosition = null;
    let legendDrag = null;

    function applyLegendPosition() {
      if (!legendOverlayEl || !legendPosition) return;
      legendOverlayEl.classList.add('legend-floating');
      legendOverlayEl.style.left = legendPosition.left + 'px';
      legendOverlayEl.style.top = legendPosition.top + 'px';
      legendOverlayEl.style.right = 'auto';
      legendOverlayEl.style.bottom = 'auto';
    }

    /**
     * Convert the default in-flow anchor into explicit left/top coordinates
     * so arrow keys and drags have a numeric starting point. The overlay dock
     * covers the canvas exactly, so canvas-relative coordinates are also the
     * floating legend's containing-block coordinates.
     */
    function ensureLegendExplicitPosition() {
      if (legendPosition || !legendOverlayEl) return;
      const contentRect = contentEl.getBoundingClientRect();
      const legendRect = legendOverlayEl.getBoundingClientRect();
      legendPosition = {
        left: legendRect.left - contentRect.left + contentEl.scrollLeft,
        top: legendRect.top - contentRect.top + contentEl.scrollTop
      };
    }

    function moveLegendBy(dx, dy) {
      if (!legendOverlayEl) return;
      ensureLegendExplicitPosition();
      const legendRect = legendOverlayEl.getBoundingClientRect();
      legendPosition = clampLegendPosition(
        legendPosition.left + dx,
        legendPosition.top + dy,
        legendRect.width,
        legendRect.height,
        contentEl.scrollWidth,
        contentEl.scrollHeight
      );
      applyLegendPosition();
    }

    /**
     * Keep the key to at most 40% of the canvas height (#327): a long key
     * scrolls inside the overlay instead of overflowing a short view, and Fit
     * clears the capped box. The list is its own focusable scroll region.
     */
    function capLegendHeight() {
      if (!legendItemsEl) return;
      const svgContainer = document.getElementById('svg-container') || contentEl;
      const areaHeight = svgContainer.getBoundingClientRect().height || contentEl.clientHeight || 0;
      const cap = Math.max(60, Math.floor(areaHeight * 0.4) - 40);
      legendItemsEl.style.maxHeight = cap + 'px';
      legendItemsEl.style.overflowY = 'auto';
      const scrolls = legendItemsEl.scrollHeight > legendItemsEl.clientHeight + 1;
      if (scrolls) {
        legendItemsEl.setAttribute('tabindex', '0');
        legendItemsEl.setAttribute('aria-label', 'Key entries, scrollable');
      } else {
        legendItemsEl.removeAttribute('tabindex');
        legendItemsEl.removeAttribute('aria-label');
      }
    }

    /**
     * Rebuild the overlay content for the current diagram. Contextual: only
     * the element types the host reported in presentElementTypes appear. The
     * overlay stays hidden when c4x.legend.show is false or when there is
     * nothing to list.
     */
    function updateLegend(presentElementTypes, swatchColors, legendShow, legendEntries) {
      if (!legendOverlayEl || !legendItemsEl) return;
      lastLegendShow = legendShow !== false;
      if (legendShow === false) {
        legendOverlayEl.hidden = true;
        return;
      }
      // The derived key (#327): one entry per distinct style, with the
      // host-drawn shape swatch. An older host sends no entries; the fixed
      // catalogue below then applies, as before.
      const derived = Array.isArray(legendEntries) ? legendEntries : null;
      const items = derived ? [] : filterLegendItems(LEGEND_CATALOG, presentElementTypes || []);
      if ((derived ? derived.length : items.length) === 0) {
        legendOverlayEl.hidden = true;
        return;
      }
      legendItemsEl.innerHTML = '';
      for (const entry of derived || []) {
        const li = document.createElement('li');
        li.className = 'legend-entry legend-entry-' + entry.kind;
        // A list item takes no name from its content; name it, so a screen
        // reader announces each entry's label (NR-N4).
        li.setAttribute('aria-label', entry.label);
        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch legend-swatch-shape';
        swatch.setAttribute('aria-hidden', 'true');
        // Host-drawn markup from validated colours; decorative, hidden from assistive tech.
        swatch.innerHTML = entry.swatch;
        const label = document.createElement('span');
        label.className = 'legend-label';
        label.textContent = entry.label;
        li.appendChild(swatch);
        li.appendChild(label);
        legendItemsEl.appendChild(li);
      }
      for (const item of items) {
        const li = document.createElement('li');
        const swatch = document.createElement('span');
        swatch.className = 'legend-swatch legend-swatch-' + item.swatch;
        swatch.setAttribute('aria-hidden', 'true');
        const colour = swatchColors && item.colorKey ? swatchColors[item.colorKey] : undefined;
        if (typeof colour === 'string') {
          // Property assignment (never innerHTML/cssText) keeps CSP happy.
          swatch.style.background = colour;
        }
        const label = document.createElement('span');
        label.textContent = item.label;
        li.appendChild(swatch);
        li.appendChild(label);
        legendItemsEl.appendChild(li);
      }
      legendOverlayEl.hidden = false;
      capLegendHeight();
      // A re-render can shrink the canvas; keep a dragged legend reachable.
      if (legendPosition) {
        const legendRect = legendOverlayEl.getBoundingClientRect();
        legendPosition = clampLegendPosition(
          legendPosition.left,
          legendPosition.top,
          legendRect.width,
          legendRect.height,
          contentEl.scrollWidth,
          contentEl.scrollHeight
        );
      }
      applyLegendPosition();
    }

    function onLegendPointerDown(event) {
      if (event.button !== 0 || !legendOverlayEl || legendOverlayEl.hidden) return;
      // A press on the list itself (its scrollbar) scrolls, it does not drag (#327).
      if (event.target === legendItemsEl && legendItemsEl.scrollHeight > legendItemsEl.clientHeight + 1) return;
      const legendRect = legendOverlayEl.getBoundingClientRect();
      legendDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - legendRect.left,
        offsetY: event.clientY - legendRect.top,
        moved: false
      };
      legendOverlayEl.setPointerCapture(event.pointerId);
      legendOverlayEl.focus();
      event.preventDefault();
    }

    function onLegendPointerMove(event) {
      if (!legendDrag || event.pointerId !== legendDrag.pointerId || !legendOverlayEl) return;
      const contentRect = contentEl.getBoundingClientRect();
      const legendRect = legendOverlayEl.getBoundingClientRect();
      legendPosition = clampLegendPosition(
        event.clientX - contentRect.left + contentEl.scrollLeft - legendDrag.offsetX,
        event.clientY - contentRect.top + contentEl.scrollTop - legendDrag.offsetY,
        legendRect.width,
        legendRect.height,
        contentEl.scrollWidth,
        contentEl.scrollHeight
      );
      legendDrag.moved = true;
      applyLegendPosition();
      event.preventDefault();
    }

    function onLegendPointerUp(event) {
      if (!legendDrag || event.pointerId !== legendDrag.pointerId || !legendOverlayEl) return;
      const didMove = legendDrag.moved;
      legendDrag = null;
      if (legendOverlayEl.hasPointerCapture(event.pointerId)) {
        legendOverlayEl.releasePointerCapture(event.pointerId);
      }
      if (didMove) {
        // Announce with the clamped position — identical textContent would
        // not re-announce, and the coordinates vary per drop.
        emitLiveRegion(
          { polite: layoutStatusEl, assertive: layoutErrorEl },
          'polite',
          formatLegendMoveAnnouncement(legendPosition.left, legendPosition.top)
        );
      }
    }

    function onLegendKeyDown(event) {
      // Arrow keys in the focused, scrollable key list scroll it (#327).
      if (event.target === legendItemsEl) return;
      // Match the node-movement pattern: arrows nudge 10px, Shift+arrow 25px.
      const delta = event.shiftKey ? 25 : 10;
      let dx = 0, dy = 0;
      if (event.key === 'ArrowLeft') { dx = -delta; }
      else if (event.key === 'ArrowRight') { dx = delta; }
      else if (event.key === 'ArrowUp') { dy = -delta; }
      else if (event.key === 'ArrowDown') { dy = delta; }
      else { return; }
      moveLegendBy(dx, dy);
      emitLiveRegion(
        { polite: layoutStatusEl, assertive: layoutErrorEl },
        'polite',
        formatLegendMoveAnnouncement(legendPosition.left, legendPosition.top)
      );
      event.preventDefault();
    }

    if (legendOverlayEl) {
      legendOverlayEl.addEventListener('pointerdown', onLegendPointerDown);
      legendOverlayEl.addEventListener('pointermove', onLegendPointerMove);
      legendOverlayEl.addEventListener('pointerup', onLegendPointerUp);
      legendOverlayEl.addEventListener('pointercancel', onLegendPointerUp);
      legendOverlayEl.addEventListener('keydown', onLegendKeyDown);
    }
    // ── End legend overlay ───────────────────────────────────────────────────

    // Sidebar event listeners
    const edgeLabelField = document.getElementById('edge-label');
    if (edgeLabelField) {
      edgeLabelField.addEventListener('input', () => {
        if (!selectedEdge) return;
        const edgeId = selectedEdge.dataset.id;
        const edgeSnapshot = visualLayout.edges.find(e => e.id === edgeId);
        if (!edgeSnapshot) return;
        const value = edgeLabelField.value;
        const labelError = value === '' ? null : validateLabel(value);
        setFieldError('edge-label', labelError || (value.includes('|') ? 'Labels must not contain the pipe character (|).' : null));
        if (labelError || value.includes('|')) {
          return;
        }
        stageEdgeLabel(edgeId, value, edgeSnapshot.label || '');
      });
    }

    const edgeTypeField = document.getElementById('edge-type');
    if (edgeTypeField) {
      edgeTypeField.addEventListener('change', () => {
        if (!selectedEdge) return;
        const edgeId = selectedEdge.dataset.id;
        const edgeSnapshot = visualLayout.edges.find(e => e.id === edgeId);
        if (!edgeSnapshot) return;
        const value = edgeTypeField.value;
        if (!['uses', 'async', 'sync'].includes(value)) {
          setFieldError('edge-type', 'Relationship type must be Uses, Async, or Sync.');
          return;
        }
        setFieldError('edge-type', null);
        stagedEdits = computeStageEdgeRelType(edgeId, value, edgeSnapshot.relType || 'uses', stagedEdits);
        updateStagedChangesList();
      });
    }

    const edgeTechnologyField = document.getElementById('edge-technology');
    if (edgeTechnologyField) {
      edgeTechnologyField.addEventListener('input', () => {
        if (!selectedEdge) return;
        const edgeId = selectedEdge.dataset.id;
        const edgeSnapshot = visualLayout.edges.find(e => e.id === edgeId);
        if (!edgeSnapshot) return;
        const value = edgeTechnologyField.value;
        const techError = value === '' ? null : validateTechnology(value);
        setFieldError('edge-technology', techError);
        if (techError) {
          return;
        }
        stagedEdits = computeStageEdgeTechnology(edgeId, value, edgeSnapshot.technology, stagedEdits);
        updateStagedChangesList();
      });
    }

    const reassignFromBtn = document.getElementById('reassign-from');
    if (reassignFromBtn) {
      reassignFromBtn.addEventListener('click', () => startReassignEndpoint('from'));
    }

    const reassignToBtn = document.getElementById('reassign-to');
    if (reassignToBtn) {
      reassignToBtn.addEventListener('click', () => startReassignEndpoint('to'));
    }

    const descField = document.getElementById('inspector-desc');
    if (descField) {
      descField.addEventListener('input', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        stageInspectorProperty(id, 'description', descField.value === '' ? null : descField.value, snapshot.description || null);
        updateCanvasText(id, 'description', descField.value === '' ? null : descField.value);
      });
    }

    const labelField = document.getElementById('inspector-label');
    if (labelField) {
      labelField.addEventListener('input', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        const label = labelField.value;
        const labelError = validateLabel(label);
        setFieldError('inspector-label', labelError);
        if (labelError) {
          return;
        }
        stageInspectorProperty(id, 'label', label, snapshot.label);
        updateCanvasText(id, 'label', label);
      });
    }

    const techField = document.getElementById('inspector-tech');
    if (techField) {
      techField.addEventListener('input', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        const techError = validateTechnology(techField.value);
        setFieldError('inspector-tech', techError);
        if (techError) {
          return;
        }
        const technology = techField.value === '' ? null : techField.value;
        stageInspectorProperty(id, 'technology', technology, snapshot.technology || null);
        updateCanvasText(id, 'technology', technology);
      });
    }

    const tagsField = document.getElementById('inspector-tags');
    if (tagsField) {
      tagsField.addEventListener('input', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        const tagsError = validateTagsString(tagsField.value);
        setFieldError('inspector-tags', tagsError);
        if (tagsError) {
          return;
        }
        const rawTags = tagsField.value.trim() === '' ? [] : tagsField.value.split(',').map(function(tag) { return tag.trim(); });
        stageInspectorProperty(id, 'tags', rawTags, snapshot.tags || []);
        restyleNodesForTags();
      });
    }

    const spriteField = document.getElementById('inspector-sprite');
    if (spriteField) {
      spriteField.addEventListener('input', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        const sprite = spriteField.value.trim() === '' ? null : spriteField.value.trim();
        // Sprite validation: length limit only in client (allowlist check requires asset catalogue).
        const spriteError = sprite !== null && sprite.length > 120
          ? 'Sprite names must be at most 120 characters.'
          : null;
        setFieldError('inspector-sprite', spriteError);
        if (spriteError) {
          return;
        }
        stageInspectorProperty(id, 'sprite', sprite, snapshot.sprite || null);
      });
    }

    const inspectorLockedField = document.getElementById('inspector-locked');
    if (inspectorLockedField) {
      inspectorLockedField.addEventListener('change', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const snapshot = nodeSnapshot(id);
        if (!snapshot) return;
        const lockedValue = inspectorLockedField.checked;
        const originalLocked = !!snapshot.locked;
        stageInspectorProperty(id, 'locked', lockedValue, originalLocked);
        // Update the canvas node's CSS class live so the dashed outline updates immediately
        const nodeEl = findByDataId('g.node', id);
        if (nodeEl) {
          if (lockedValue) {
            nodeEl.classList.add('locked');
          } else {
            nodeEl.classList.remove('locked');
          }
        }
      });
    }

    const renameButton = document.getElementById('rename-element');
    const renameDialog = document.getElementById('rename-dialog');
    const renameInput = document.getElementById('rename-new-id');
    const renameImpact = document.getElementById('rename-impact');
    const renameValidation = document.getElementById('rename-validation');
    const renameConfirm = document.getElementById('rename-confirm');
    const renameCancel = document.getElementById('rename-cancel');

    function validateRenameDialog() {
      if (!selectedNode || !renameInput || !renameValidation || !renameConfirm) return;
      const id = selectedNode.dataset.id;
      const newId = renameInput.value.trim();
      const conflicts = visualLayout.nodes.some(node => node.id !== id && node.id === newId);
      const valid = /^[A-Za-z_][A-Za-z0-9_]*$/.test(newId) && !conflicts && newId !== id;
      renameConfirm.disabled = !valid;
      renameValidation.textContent = valid
        ? ''
        : conflicts
          ? 'That identifier is already in use.'
          : 'Use a new identifier starting with a letter or underscore; only letters, digits, and underscores are allowed.';
    }

    if (renameButton && renameDialog && renameInput && renameImpact) {
      renameButton.addEventListener('click', () => {
        if (!selectedNode) return;
        const id = selectedNode.dataset.id;
        const references = visualLayout.edges.filter(edge => edge.from === id || edge.to === id);
        renameInput.value = (stagedEdits[id] && stagedEdits[id].newId) || id;
        renameImpact.textContent = 'Renaming ' + id + ' will update ' + references.length + ' relationship' + (references.length === 1 ? '' : 's') + ' that reference it.';
        validateRenameDialog();
        renameDialog.showModal();
        renameInput.focus();
        renameInput.select();
      });
      renameInput.addEventListener('input', validateRenameDialog);
    }
    if (renameCancel && renameDialog) {
      renameCancel.addEventListener('click', () => renameDialog.close());
    }
    if (renameConfirm && renameDialog) {
      renameConfirm.addEventListener('click', () => {
        if (!selectedNode || !renameInput) return;
        const id = selectedNode.dataset.id;
        const newId = renameInput.value.trim();
        if (!renameConfirm.disabled) {
          stageInspectorProperty(id, 'newId', newId, id);
          renameDialog.close();
          setLayoutStatus('Identifier rename staged. Save Changes to update all references atomically.', 'info', 'dirty');
        }
      });
    }

    const saveStagedBtn = document.getElementById('save-staged-changes');
    if (saveStagedBtn) {
      // Watchdog: if the host never responds (silent failure), surface it
      // instead of leaving a dead button. Delay is overridable for tests.
      let saveWatchdog = null;
      const clearSaveWatchdog = () => {
        if (saveWatchdog !== null) {
          clearTimeout(saveWatchdog);
          saveWatchdog = null;
        }
      };
      const armSaveWatchdog = () => {
        clearSaveWatchdog();
        // Read at arm time so tests can override via window.__c4xSaveWatchdogMs.
        const saveWatchdogMs = (typeof window !== 'undefined' && window.__c4xSaveWatchdogMs) || 8000;
        saveWatchdog = setTimeout(() => {
          saveStagedBtn.disabled = false;
          setLayoutStatus(
            'No response from the extension host — save may not have completed. Check the C4X output channel (View → Output → C4X) and report a bug.',
            'error',
            'rejected'
          );
        }, saveWatchdogMs);
      };
      window.__c4xClearSaveWatchdog = clearSaveWatchdog;

      saveStagedBtn.addEventListener('click', () => {
        const editsArray = Object.keys(stagedEdits).map(id => {
          const edit = stagedEdits[id];
          return {
            id: id,
            ...(edit.edgeId !== undefined ? { edgeId: edit.edgeId } : {}),
            ...(edit.boundaryId !== undefined ? { boundaryId: edit.boundaryId } : {}),
            ...(edit.x !== undefined ? { x: edit.x, y: edit.y } : {}),
            ...(edit.w !== undefined ? { w: edit.w } : {}),
            ...(edit.h !== undefined ? { h: edit.h } : {}),
            ...(edit.description !== undefined ? { description: edit.description } : {}),
            ...(edit.label !== undefined ? { label: edit.label } : {}),
            ...(edit.technology !== undefined ? { technology: edit.technology } : {}),
            ...(edit.tags !== undefined ? { tags: edit.tags } : {}),
            ...(edit.sprite !== undefined ? { sprite: edit.sprite } : {}),
            ...(edit.locked !== undefined ? { locked: edit.locked } : {}),
            ...(edit.newId !== undefined ? { newId: edit.newId } : {}),
            ...(edit.relType !== undefined ? { relType: edit.relType } : {}),
            ...(edit.from !== undefined ? { from: edit.from } : {}),
            ...(edit.to !== undefined ? { to: edit.to } : {}),
            ...(Array.isArray(edit.addRelationship) ? { addRelationship: edit.addRelationship } : {})
          };
        });

        saveStagedBtn.disabled = true;
        setLayoutStatus('Saving…', 'info', 'saving');
        armSaveWatchdog();

        vscode.postMessage({
          type: 'visualLayout.applySemanticEdits',
          protocolVersion: PROTOCOL_VERSION,
          revision: visualLayout.revision,
          edits: editsArray
        });
      });
    }

    /** The way out after a refused Save, chosen by what the user can see. */
    function refusedSaveHint() {
      if (inConflict) {
        return 'Your edits are kept; use the banner above to reload or rebase.';
      }
      return Object.keys(stagedEdits).length > 0 ? 'Your edits are kept. Discard to reload from source.' : '';
    }

    /**
     * Discard all staged edits: revert canvas state, clear the staging state
     * and leave edit mode. Shared by the Discard button and the exit-edit
     * confirmation banner.
     */
    function discardStagedChanges() {
      Object.keys(stagedEdits).forEach(id => {
        const edit = stagedEdits[id];
        if (edit && edit.boundaryId !== undefined) {
          revertBoundaryCanvasState(id, edit);
        } else {
          revertNodeCanvasState(id, edit);
        }
      });

      stagedEdits = {};
      updateStagedChangesList();
      clearSelection();
      clearInspector();
      setEditMode(false);
    }

    const discardStagedBtn = document.getElementById('discard-staged-changes');
    if (discardStagedBtn) {
      discardStagedBtn.addEventListener('click', () => {
        discardStagedChanges();
      });
    }

    /*C4X_SMOKE_DECLARATIONS*/

    window.addEventListener('message', event => {
      if (!event || !event.data || typeof event.data !== 'object') return;
      const message = event.data;
      if (typeof c4xSmokeMessage === 'function' && c4xSmokeMessage(message)) return;
      // Decline before validating (#439): a marked render or error that
      // reaches a webview holding staged edits is declined whether or not the
      // rest of it validates, so an invalid payload cannot tear the draft
      // down either. Only the type and the mark are read here.
      if ((message.type === 'render' || message.type === 'error') && message.refresh === true && dirty) {
        declineRefresh();
        return;
      }
      if (isRenderMessage(message)) {
        // A theme or refresh render (#408) that arrives while this webview
        // holds staged edits would discard them: the host had not yet heard
        // the draft was dirty. Keep the draft and ask for it after Save or
        // Discard.
        if (message.refresh === true && dirty) {
          declineRefresh();
          return;
        }
        noteShownToken(message);
        // Diagram identity for draft-state scoping (#167 review): required by
        // the guard above, so a render without a valid scope never reaches
        // here — it falls through to the rejection branch and leaves both
        // currentScope and the persisted state untouched.
        currentScope = message.payload.scope;
        elementStyleInputs = message.payload.elementStyleInputs || null;
        renderLayoutInfo = {
          layoutMode: message.payload.layoutMode === 'edit' ? 'edit' : 'view',
          textGrown: message.payload.textGrown === true,
          diagramIdentity: typeof message.payload.diagramIdentity === 'string' ? message.payload.diagramIdentity : null,
          viewType: typeof message.payload.viewType === 'string' ? message.payload.viewType : null,
          sameDiagramEdit: isRecord(message.payload.sameDiagramEdit) && typeof message.payload.sameDiagramEdit.value === 'boolean'
            ? { since: typeof message.payload.sameDiagramEdit.since === 'number' ? message.payload.sameDiagramEdit.since : null, value: message.payload.sameDiagramEdit.value }
            : null,
        };
        showSvg(message.payload.svg, message.payload.metrics, message.payload.visualLayout, message.payload.settings, message.payload.presentElementTypes, message.payload.legendSwatchColors, message.payload.legendEntries, message.payload.legendKeyTheme);
        if (typeof c4xSmokeRendered === 'function') c4xSmokeRendered(message);
        return;
      }
      if (message && message.type === 'render') {
        // Payload failed validation — surface the failure instead of hanging on "Waiting for render...".
        showError('The diagram render was rejected by webview validation. Check the C4X output channel for details.');
        return;
      }
      if (isErrorMessage(message)) {
        // A theme or refresh render that failed (#408) must not replace the
        // canvas of a webview holding staged edits: decline it like a
        // marked render, and the host owes it.
        if (message.refresh === true && dirty) {
          declineRefresh();
          return;
        }
        noteShownToken(message);
        showError(message.message);
        return;
      }
      if (message && message.type === 'visualLayout.batchAccepted') {
        if (window.__c4xClearSaveWatchdog) window.__c4xClearSaveWatchdog();
        dirty = false;
        stagedEdits = {};
        updateStagedChangesList();
        clearSelection();
        clearInspector();
        setEditMode(false);
        setLayoutStatus('Changes successfully saved to document.', 'success', 'clean');
        return;
      }
      if (message && message.type === 'visualLayout.accepted') {
        if (isAcceptedMessage(message)) {
          if (message.persisted) {
            const node = nodeSnapshot(message.id);
            setLayoutStatus(
              formatMoveAnnouncement(
                node && node.label ? node.label : message.id,
                message.x,
                message.y,
                ++moveAnnouncementCounter
              ),
              'success',
              'clean'
            );
          } else {
            dirty = true;
            setLayoutStatus('Draft accepted in memory — not persisted; source is unchanged.', 'info', 'dirty');
          }
        }
        return;
      }
      if (message && message.type === 'visualLayout.sourceDiff') {
        if (sourceDiffOpen && message.revision === visualLayout.revision) {
          renderSourceDiff(message.lines, message.error);
        }
        return;
      }
      if (message && message.type === 'visualLayout.rejected') {
        // A refused Save never discards the draft (#439, any code, including
        // codes this client does not know). Leave the saving state, keep the
        // staged edits and edit mode, say why, and leave the way out to the
        // user: Discard, Reload from the conflict banner, or close and reopen.
        // No 'ready' is posted, so nothing replaces the canvas. A message
        // without this protocol's version is not the host's and is ignored.
        if (!isRecord(message) || message.protocolVersion !== PROTOCOL_VERSION) return;
        if (window.__c4xClearSaveWatchdog) window.__c4xClearSaveWatchdog();
        const reason = isRecord(message) && typeof message.reason === 'string' &&
          message.reason.length > 0 && message.reason.length <= 1024
          ? message.reason
          : 'The staged changes could not be saved.';
        updateStagedChangesList();
        setLayoutStatus(reason + ' ' + refusedSaveHint(), 'error', 'rejected');
        return;
      }
      if (message && message.type === 'visualLayout.externalChangeConflict') {
        if (typeof message.reason === 'string' && message.reason.length > 0 && message.reason.length <= 1024) {
          showConflictBanner(message.reason);
        }
        return;
      }
      if (message && message.type === 'visualLayout.refreshDeferred') {
        // The host held back a theme change or refresh: a render would clear
        // the staged draft (#408). Say so without touching the draft.
        if (dirty) {
          setLayoutStatus('Theme change or refresh will apply after you save or discard.', 'info', 'dirty');
        }
        return;
      }
      if (message && message.type === 'visualLayout.conflictActionAcknowledged') {
        if (message.action === 'rebaseAccepted') {
          hideConflictBanner();
          setLayoutStatus(
            typeof message.reason === 'string' && message.reason.length > 0 && message.reason.length <= 1024
              ? message.reason
              : 'Rebase accepted. Your draft has been updated to the new source baseline.',
            'info',
            'dirty'
          );
        } else if (message.action === 'rebaseFailed') {
          const failReason = typeof message.reason === 'string' ? message.reason : 'Rebase failed.';
          setLayoutStatus(failReason, 'error', 'rejected');
        }
        // viewDiff: no further banner change needed; diff panel opened by button handler
      }
    });

    // ── On load: pick up any persisted draft from before reload ──────────────
    try {
      const saved = vscode.getState();
      // One invalid staged relationship must not discard the rest of the draft:
      // drop just that add, and say so once the draft is restored.
      const repaired = dropInvalidPersistedAdds(saved, isPersistedAddRelationshipList);
      const candidate = migrateLegacyDraftState(repaired.state, 'legacy-validation-only', pickPersistedEditFields);
      if (candidate && isValidPersistedDraftState(candidate)) {
        if (repaired.state.schemaVersion === 1) {
          legacyDraft = repaired.state;
        } else {
          pendingRestoreState = repaired.state;
        }
        restoreDroppedAdds = repaired.dropped;
      }
    } catch (_e) {
      // getState() is best-effort
    }

    vscode.postMessage({ type: 'ready' });
`;

const SMOKE_PLACEHOLDER = '/*C4X_SMOKE_DECLARATIONS*/';

/**
 * Test-only client code, spliced into the webview script ONLY when the host
 * runs under C4X_VSIX_SMOKE=1. In a normal session this text does not exist
 * in the webview at all, so no page script can reach these handlers. The
 * session token is generated by the host per panel and compared exactly.
 */
const SMOKE_CLIENT_CODE = String.raw`
    const C4X_SMOKE_SESSION = __SESSION__;
    function smokeNodeReport(svg) {
      return Array.from(svg.querySelectorAll('g.node')).slice(0, 500).map(function(node) {
        const bbox = node.getBBox();
        const shape = node.querySelector('rect, path, ellipse, circle, polygon');
        const style = shape ? window.getComputedStyle(shape) : null;
        return {
          id: node.getAttribute('data-id') || '',
          x: Math.round((bbox.x + (node.transform.baseVal.numberOfItems ? node.transform.baseVal.getItem(0).matrix.e : 0)) * 10) / 10,
          y: Math.round((bbox.y + (node.transform.baseVal.numberOfItems ? node.transform.baseVal.getItem(0).matrix.f : 0)) * 10) / 10,
          w: Math.round(bbox.width * 10) / 10, h: Math.round(bbox.height * 10) / 10,
          fill: style ? style.fill : '', stroke: style ? style.stroke : ''
        };
      });
    }
    // Drives the packaged client's own edit and Discard handlers: 'stage' enters
    // edit mode and sends a real ArrowRight keydown to the node; 'discard' presses
    // the real Discard button. Replies with what the DOM shows afterwards.
    function c4xSmokeMessage(message) {
      if (message.type !== 'smoke.act' || message.session !== C4X_SMOKE_SESSION) return false;
      const svg = contentEl.querySelector('svg');
      if (message.action === 'stage' && svg) {
        setEditMode(true);
        const nodeEl = findByDataId('g.node', String(message.id));
        if (nodeEl) {
          nodeEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
        }
      } else if (message.action === 'discard') {
        const button = document.getElementById('discard-staged-changes');
        if (button) button.click();
      }
      vscode.postMessage({
        type: 'smoke.acted', session: C4X_SMOKE_SESSION, token: String(message.token), action: String(message.action),
        staged: Object.keys(stagedEdits).length, editMode: !!editMode,
        nodes: svg ? smokeNodeReport(svg) : []
      });
      return true;
    }
    // Reports the actual DOM after a render the host asked to have acknowledged.
    function c4xSmokeRendered(message) {
      if (typeof message.smokeRequest !== 'string' || message.smokeRequest.length > 64) return;
      const svg = contentEl.querySelector('svg');
      if (!svg || svg.getBoundingClientRect().width <= 0 || svg.getBoundingClientRect().height <= 0) {
        vscode.postMessage({ type: 'smoke.renderFailed', session: C4X_SMOKE_SESSION, token: message.smokeRequest });
        return;
      }
      const nodes = svg.querySelectorAll('g.node');
      vscode.postMessage({
        type: 'smoke.rendered', session: C4X_SMOKE_SESSION, token: message.smokeRequest,
        nodeCount: nodes.length,
        text: Array.from(nodes).map(function(node) { return node.textContent || ''; }).join(' ').slice(0, 20000),
        nodes: smokeNodeReport(svg)
      });
    }
`;

/**
 * The webview script. With no argument it is the normal script, which holds no
 * smoke handler. A session token adds the test-only block (host: C4X_VSIX_SMOKE=1).
 */
export function buildPreviewClientScript(smokeSession?: string): string {
    const inject = smokeSession === undefined ? '' : SMOKE_CLIENT_CODE.replace('__SESSION__', () => JSON.stringify(smokeSession));
    return PREVIEW_CLIENT_TEMPLATE.replace(SMOKE_PLACEHOLDER, () => inject);
}

export const PREVIEW_CLIENT_SCRIPT = buildPreviewClientScript();
