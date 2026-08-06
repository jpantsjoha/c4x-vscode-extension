import { VISUAL_LAYOUT_PROTOCOL_VERSION } from './visualLayoutProtocol';
import { emitLiveRegion } from './webviewA11y';
import { LEGEND_CATALOG, type LegendItem } from './legendCatalog';
import { type PersistedDraftState, type PersistedStagedEdit } from './draftState';
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
        label.setAttribute('x', ((points.from.x + points.to.x) / 2).toFixed(2));
        label.setAttribute('y', (((points.from.y + points.to.y) / 2) - 6).toFixed(2));
    }
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

/** Staged-changes list text for a pending relationship add. Pure. */
export function formatAddRelationshipSummary(sourceId: string, targetId: string, label: string): string {
    return 'Added relationship ' + sourceId + ' → ' + targetId + ': ' + label;
}

/**
 * Serialise the current webview state to the shape persisted via vscode.setState().
 * Pure — no DOM access. Exported for unit tests.
 */
export function serializeDraftState(
    stagedEdits: Record<string, Record<string, unknown>>,
    selectedNodeId: string | null,
    editMode: boolean,
): PersistedDraftState {
    const editsArray: PersistedStagedEdit[] = Object.keys(stagedEdits).map(id => {
        const edit = stagedEdits[id];
        const entry: PersistedStagedEdit = { id };
        if (edit['edgeId'] !== undefined) { entry.edgeId = edit['edgeId'] as string; }
        if (edit['x'] !== undefined) { entry.x = edit['x'] as number; }
        if (edit['y'] !== undefined) { entry.y = edit['y'] as number; }
        if (edit['label'] !== undefined) { entry.label = edit['label'] as string | null; }
        if (edit['description'] !== undefined) { entry.description = edit['description'] as string | null; }
        if (edit['technology'] !== undefined) { entry.technology = edit['technology'] as string | null; }
        if (edit['tags'] !== undefined) { entry.tags = edit['tags'] as string[]; }
        if (edit['sprite'] !== undefined) { entry.sprite = edit['sprite'] as string | null; }
        if (edit['locked'] !== undefined) { entry.locked = edit['locked'] as boolean; }
        if (edit['newId'] !== undefined) { entry.newId = edit['newId'] as string; }
        if (edit['boundaryId'] !== undefined) { entry.boundaryId = edit['boundaryId'] as string; }
        if (edit['w'] !== undefined) { entry.w = edit['w'] as number; }
        if (edit['h'] !== undefined) { entry.h = edit['h'] as number; }
        if (edit['edgeId'] !== undefined) { entry.edgeId = edit['edgeId'] as string; }
        if (edit['relType'] !== undefined) { entry.relType = edit['relType'] as 'uses' | 'async' | 'sync'; }
        if (edit['from'] !== undefined) { entry.from = edit['from'] as string; }
        if (edit['to'] !== undefined) { entry.to = edit['to'] as string; }
        return entry;
    });
    return {
        schemaVersion: 1,
        editMode,
        selectedNodeId,
        stagedEdits: editsArray,
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
        const edit: Record<string, unknown> = {};
        if (entry.x !== undefined) { edit['x'] = entry.x; }
        if (entry.y !== undefined) { edit['y'] = entry.y; }
        if (entry.label !== undefined) { edit['label'] = entry.label; }
        if (entry.description !== undefined) { edit['description'] = entry.description; }
        if (entry.technology !== undefined) { edit['technology'] = entry.technology; }
        if (entry.tags !== undefined) { edit['tags'] = entry.tags; }
        if (entry.sprite !== undefined) { edit['sprite'] = entry.sprite; }
        if (entry.locked !== undefined) { edit['locked'] = entry.locked; }
        if (entry.newId !== undefined) { edit['newId'] = entry.newId; }
        if (entry.boundaryId !== undefined) { edit['boundaryId'] = entry.boundaryId; }
        if (entry.w !== undefined) { edit['w'] = entry.w; }
        if (entry.h !== undefined) { edit['h'] = entry.h; }
        if (entry.edgeId !== undefined) { edit['edgeId'] = entry.edgeId; }
        if (entry.relType !== undefined) { edit['relType'] = entry.relType; }
        if (entry.from !== undefined) { edit['from'] = entry.from; }
        if (entry.to !== undefined) { edit['to'] = entry.to; }
        result[entry.id] = edit;
    }
    return result;
}

/**
 * Pure helper: derive conflict banner text from a conflict reason string.
 * Exported for unit tests.
 */
export function formatConflictBannerMessage(reason: string): string {
    return reason;
}

/**
 * Format the canvas text content for a staged property edit, mirroring how
 * ElementRenderer renders each field: technology is bracketed, a cleared
 * value renders as empty. The render pipeline applies no truncation, so the
 * live preview does not either — the save-triggered re-render stays
 * authoritative for final layout.
 * Pure — no DOM access. Exported for unit tests.
 */
export function formatCanvasTextValue(field: string, value: string | null): string {
    if (value === null || value === '') {
        return '';
    }
    return field === 'technology' ? `[${value}]` : value;
}

/**
 * Polite live-region announcement for a canvas text update.
 * Pure — exported for unit tests.
 */
export function formatCanvasUpdateAnnouncement(field: string): string {
    const name = field.charAt(0).toUpperCase() + field.slice(1);
    return `${name} updated on canvas`;
}

/** Minimal structural view of a rendered SVG node for canvas text updates. */
export interface CanvasTextNode {
    querySelector(selector: string): { textContent: string } | null;
}

/**
 * Locate the `<text data-field="...">` child of a node element and set its
 * content to the staged value. Returns true only when the content actually
 * changed; false when the field has no rendered text element (e.g. it was
 * empty at render time — the save-triggered re-render stays authoritative in
 * that case). DOM access is confined to the passed-in element so unit tests
 * can drive it with a plain fake.
 */
export function updateCanvasTextInNode(nodeEl: CanvasTextNode, field: string, value: string | null): boolean {
    const textEl = nodeEl.querySelector(`text[data-field="${field}"]`);
    if (!textEl) {
        return false;
    }
    const next = formatCanvasTextValue(field, value);
    if (textEl.textContent === next) {
        return false;
    }
    textEl.textContent = next;
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
 * Browser-side preview controller. It is kept separate from PreviewPanel so the
 * extension-host lifecycle and the untrusted webview boundary stay reviewable.
 * The generated script deliberately contains no persistence API.
 */
export const PREVIEW_CLIENT_SCRIPT = String.raw`
    const PROTOCOL_VERSION = ${VISUAL_LAYOUT_PROTOCOL_VERSION};
    const REJECTION_CODES = new Set([
      'malformed_message',
      'layout_unavailable',
      'stale_revision',
      'missing_element'
    ]);

    // ── Shared validator constants (from inspectorValidators.ts — single source of truth) ──
    const INSPECTOR_LABEL_MAX = ${INSPECTOR_LABEL_MAX};
    const INSPECTOR_TECH_MAX = ${INSPECTOR_TECH_MAX};
    const INSPECTOR_TAG_COUNT_MAX = ${INSPECTOR_TAG_COUNT_MAX};
    const INSPECTOR_TAG_LENGTH_MAX = ${INSPECTOR_TAG_LENGTH_MAX};
    const INSPECTOR_TAG_RE = ${INSPECTOR_TAG_RE};

    // ── Initial-zoom bounds (#134 — mirror c4x.markdown.previewScale) ────────
    const INITIAL_ZOOM_MIN = ${INITIAL_ZOOM_MIN};
    const INITIAL_ZOOM_MAX = ${INITIAL_ZOOM_MAX};

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
      return true;
    }

    function isValidPersistedDraftState(v) {
      return isRecord(v) &&
        v.schemaVersion === 1 &&
        typeof v.editMode === 'boolean' &&
        (v.selectedNodeId === null || typeof v.selectedNodeId === 'string') &&
        Array.isArray(v.stagedEdits) &&
        v.stagedEdits.length <= 500 &&
        v.stagedEdits.every(isPersistedStagedEditEntry);
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
    ${embedForWebview(formatEdgePathD)}
    ${embedForWebview(computeExpandedViewBox)}
    ${embedForWebview(applyEdgeGeometry)}
    ${emitLiveRegion.toString()}
    ${embedForWebview(formatCanvasTextValue)}
    ${embedForWebview(formatCanvasUpdateAnnouncement)}
    ${embedForWebview(updateCanvasTextInNode)}
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

    let editMode = false;
    let dirty = false;
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
        value.childBoundaryIds.every(function(id) { return typeof id === 'string' && id.length > 0 && id.length <= 256; });
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
        isValidLegendSwatchColors(message.payload.legendSwatchColors);
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

    function isRejectedMessage(message) {
      return isRecord(message) &&
        message.type === 'visualLayout.rejected' &&
        message.protocolVersion === PROTOCOL_VERSION &&
        REJECTION_CODES.has(message.code) &&
        isBoundedText(message.reason, 1024) &&
        (message.revision === undefined || message.revision === visualLayout.revision);
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

    function persistState() {
      try {
        const editsArray = Object.keys(stagedEdits).map(id => {
          const edit = stagedEdits[id];
          const entry = { id };
          if (edit.x !== undefined) entry.x = edit.x;
          if (edit.y !== undefined) entry.y = edit.y;
          if (edit.w !== undefined) entry.w = edit.w;
          if (edit.h !== undefined) entry.h = edit.h;
          if (edit.label !== undefined) entry.label = edit.label;
          if (edit.description !== undefined) entry.description = edit.description;
          if (edit.technology !== undefined) entry.technology = edit.technology;
          if (edit.tags !== undefined) entry.tags = edit.tags;
          if (edit.sprite !== undefined) entry.sprite = edit.sprite;
          if (edit.locked !== undefined) entry.locked = edit.locked;
          if (edit.newId !== undefined) entry.newId = edit.newId;
          if (edit.boundaryId !== undefined) entry.boundaryId = edit.boundaryId;
          if (edit.edgeId !== undefined) entry.edgeId = edit.edgeId;
          if (edit.relType !== undefined) entry.relType = edit.relType;
          if (edit.from !== undefined) entry.from = edit.from;
          if (edit.to !== undefined) entry.to = edit.to;
          return entry;
        });
        vscode.setState({
          schemaVersion: 1,
          editMode: editMode,
          selectedNodeId: selectedNode ? selectedNode.dataset.id : null,
          stagedEdits: editsArray
        });
      } catch (_e) {
        // setState is best-effort; never throw to the caller
      }
    }

    function notifyDirtyChanged(isDirty) {
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
     * Live-update the node's rendered <text> for a staged property edit and
     * announce it politely. Cosmetic only — the save-triggered re-render
     * stays authoritative.
     */
    function updateCanvasText(id, field, value) {
      const nodeEl = findByDataId('g.node', id);
      if (!nodeEl) return;
      if (updateCanvasTextInNode(nodeEl, field, value)) {
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
        }
      }
      if (!edit) return;
      const snapshot = nodeSnapshot(id);
      if (!snapshot) return;
      if (edit.label !== undefined) updateCanvasText(id, 'label', snapshot.label);
      if (edit.technology !== undefined) updateCanvasText(id, 'technology', snapshot.technology || null);
      if (edit.description !== undefined) updateCanvasText(id, 'description', snapshot.description || null);
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
      vscode.postMessage({
        type: 'visualLayout.resolveConflict',
        protocolVersion: PROTOCOL_VERSION,
        action: action
      });
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
        boundaryEl.dataset.currentX = String(x);
        boundaryEl.dataset.currentY = String(y);
        boundaryEl.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
      }

      const descendants = collectBoundaryDescendants(boundaryId);
      for (const nodeId of descendants.nodeIds) {
        const nodeEl = findByDataId('g.node', nodeId);
        const nodeSnap = nodeSnapshot(nodeId);
        if (!nodeEl || !nodeSnap) continue;
        const nextX = nodeSnap.x + dx;
        const nextY = nodeSnap.y + dy;
        nodeEl.dataset.currentX = String(nextX);
        nodeEl.dataset.currentY = String(nextY);
        nodeEl.setAttribute('transform', 'translate(' + (nextX - nodeSnap.x) + ' ' + (nextY - nodeSnap.y) + ')');
        updateConnectedEdges(nodeId);
      }
      for (const childBoundaryId of descendants.boundaryIds) {
        if (childBoundaryId === boundaryId) continue;
        const childEl = findByDataId('g.boundary', childBoundaryId);
        const childSnap = boundarySnapshot(childBoundaryId);
        if (childEl && childSnap) {
          childEl.dataset.currentX = String(childSnap.x + dx);
          childEl.dataset.currentY = String(childSnap.y + dy);
          childEl.setAttribute('transform', 'translate(' + dx + ' ' + dy + ')');
        }
      }
      expandCanvasForBoundary(boundaryId, x, y);
      return { x, y };
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
      let minW = 60;
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
        height: Math.max(minH, maxBottom + 40)
      };
    }

    function postBoundaryResize(boundaryId, width, height) {
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
      if (!editMode || event.button !== 0) return;
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
      const point = svgPoint(event, dragState.svg, dragState.ctmInverse);
      const dx = point.x - dragState.pointerX;
      const dy = point.y - dragState.pointerY;
      const boundaryId = dragState.nodeEl.dataset.id;
      moveBoundary(boundaryId, dragState.startX + dx, dragState.startY + dy);
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
      if (commit) {
        const x = Number(boundaryEl.dataset.currentX);
        const y = Number(boundaryEl.dataset.currentY);
        postBoundaryMove(boundaryId, x, y, 'pointer');
      } else {
        moveBoundary(boundaryId, state.startX, state.startY);
        setLayoutStatus('Boundary move cancelled.', 'info', dirty ? 'dirty' : 'clean');
      }
    }

    function onBoundaryKeyDown(event) {
      if (!editMode) return;
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
        moveBoundary(boundaryId, Math.max(0, currentX + dx), Math.max(0, currentY + dy));
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
      return {
        x: Number(nodeEl.dataset.currentX),
        y: Number(nodeEl.dataset.currentY),
        width: snapshot.width,
        height: snapshot.height
      };
    }

    function connectionPoints(from, to) {
      const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
      const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;

      if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? {
          from: { x: from.x + from.width, y: fromCenter.y },
          to: { x: to.x, y: toCenter.y }
        } : {
          from: { x: from.x, y: fromCenter.y },
          to: { x: to.x + to.width, y: toCenter.y }
        };
      }

      return dy >= 0 ? {
        from: { x: fromCenter.x, y: from.y + from.height },
        to: { x: toCenter.x, y: to.y }
      } : {
        from: { x: fromCenter.x, y: from.y },
        to: { x: toCenter.x, y: to.y + to.height }
      };
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

        applyEdgeGeometry(edgeEl, connectionPoints(from, to));
      }
    }

    function moveNode(nodeEl, x, y) {
      const baseX = Number(nodeEl.dataset.baseX);
      const baseY = Number(nodeEl.dataset.baseY);
      const nextX = Math.max(0, Math.round(x));
      const nextY = Math.max(0, Math.round(y));
      nodeEl.dataset.currentX = String(nextX);
      nodeEl.dataset.currentY = String(nextY);
      nodeEl.setAttribute('transform', 'translate(' + (nextX - baseX) + ' ' + (nextY - baseY) + ')');
      updateConnectedEdges(nodeEl.dataset.id);
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
      if (!editMode || event.button !== 0) {
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

      selectNode(nodeEl);
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
      const point = svgPoint(event, dragState.svg, dragState.ctmInverse);
      const dx = point.x - dragState.pointerX;
      const dy = point.y - dragState.pointerY;
      // Move primary node
      moveNode(dragState.nodeEl, dragState.startX + dx, dragState.startY + dy);
      // Move all other selected nodes by the same delta
      if (dragState.groupStartPositions) {
        for (const id of selectionSet) {
          if (id === dragState.nodeEl.dataset.id) continue;
          const el = findByDataId('g.node', id);
          const start = dragState.groupStartPositions[id];
          if (el && start) {
            moveNode(el, start.x + dx, start.y + dy);
          }
        }
      }
      event.preventDefault();
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
        // Stage moves for the primary node
        postMove(state.nodeEl, 'pointer');
        // Stage moves for all other nodes in the group
        if (state.groupStartPositions) {
          for (const id of selectionSet) {
            if (id === state.nodeEl.dataset.id) continue;
            const el = findByDataId('g.node', id);
            if (el) {
              postMove(el, 'pointer');
            }
          }
        }
      } else {
        // Revert all nodes in the group
        moveNode(state.nodeEl, state.startX, state.startY);
        if (state.groupStartPositions) {
          for (const id of selectionSet) {
            if (id === state.nodeEl.dataset.id) continue;
            const el = findByDataId('g.node', id);
            const start = state.groupStartPositions[id];
            if (el && start) {
              moveNode(el, start.x, start.y);
            }
          }
        }
        setLayoutStatus('Move cancelled.', 'info', dirty ? 'dirty' : 'clean');
      }
    }

    function onNodeKeyDown(event) {
      if (!editMode) {
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

      // Move ALL selected nodes by the same delta
      for (const id of selectionSet) {
        const el = findByDataId('g.node', id);
        if (!el) continue;
        const nx = Number(el.dataset.currentX) + dx;
        const ny = Number(el.dataset.currentY) + dy;
        moveNode(el, nx, ny);
        postMove(el, 'keyboard');
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
        const fit = computeZoomToFit(allLayoutBoxes(), baseViewBox, 32, viewportSize());
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
      if (event.button !== 0 || event.target.closest('g.node') || event.target.closest('g.boundary')) {
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
    }

    function onSvgWheel(event) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.05 : 0.95;
      zoom = Math.max(0.2, Math.min(5.0, zoom * factor));
      userAdjustedCamera = true;
      applyZoomPan();
      updateZoomDisplay();
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
        if (viewportWasDegenerate) {
          viewportWasDegenerate = false;
          // The opening framing was computed against a viewport with no size.
          // Now that there is one, redo it — unless the user has since taken
          // the camera, in which case theirs wins.
          if (!userAdjustedCamera) {
            applyOpeningCamera();
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
            originalViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
            baseViewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
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
      const error = labelError || pipeError || techError;
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
      const fit = computeZoomToFit(boxes, baseViewBox, 32, viewportSize());
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

    function setEditMode(enabled) {
      editMode = enabled && (visualLayout.nodes.length > 0 || visualLayout.boundaries.length > 0);
      contentEl.classList.toggle('visual-layout-editing', editMode);
      toggleLayoutEl.setAttribute('aria-pressed', String(editMode));
      toggleLayoutEl.textContent = editMode ? 'Exit edit mode' : 'Edit C4 Diagram';
      for (const nodeEl of contentEl.querySelectorAll('g.node')) {
        nodeEl.setAttribute('tabindex', editMode ? '0' : '-1');
      }
      for (const boundaryEl of contentEl.querySelectorAll('g.boundary')) {
        boundaryEl.setAttribute('tabindex', editMode ? '0' : '-1');
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
      dirty = false;
      toggleLayoutEl.disabled = true;
      setEditMode(false);
      setLayoutStatus(message, 'error', 'rejected');
    }

    function showSvg(svg, metrics, nextVisualLayout, renderSettings, presentElementTypes, legendSwatchColors) {
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
      updateLegend(presentElementTypes, legendSwatchColors, legendShow);
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
      setEditMode(false);

      // ── Draft restoration on first render after reload ────────────────────
      // Check once: if getState() has a valid persisted draft, restore it
      // rather than starting clean. pendingRestoreState is set at init time
      // and consumed exactly once here.
      if (pendingRestoreState !== null) {
        const restore = pendingRestoreState;
        pendingRestoreState = null;
        if (isValidPersistedDraftState(restore) && restore.stagedEdits.length > 0) {
          const restored = {};
          for (const entry of restore.stagedEdits) {
            const edit = {};
            if (entry.x !== undefined) edit.x = entry.x;
            if (entry.y !== undefined) edit.y = entry.y;
            if (entry.w !== undefined) edit.w = entry.w;
            if (entry.h !== undefined) edit.h = entry.h;
            if (entry.label !== undefined) edit.label = entry.label;
            if (entry.description !== undefined) edit.description = entry.description;
            if (entry.technology !== undefined) edit.technology = entry.technology;
            if (entry.tags !== undefined) edit.tags = entry.tags;
            if (entry.sprite !== undefined) edit.sprite = entry.sprite;
            if (entry.locked !== undefined) edit.locked = entry.locked;
            if (entry.newId !== undefined) edit.newId = entry.newId;
            if (entry.boundaryId !== undefined) edit.boundaryId = entry.boundaryId;
            if (entry.edgeId !== undefined) edit.edgeId = entry.edgeId;
            if (entry.relType !== undefined) edit.relType = entry.relType;
            if (entry.from !== undefined) edit.from = entry.from;
            if (entry.to !== undefined) edit.to = entry.to;
            restored[entry.id] = edit;
          }
          // Keep only edits that still correspond to nodes, boundaries, or edges in this layout.
          const activeNodeIds = new Set(visualLayout.nodes.map(function(n) { return n.id; }));
          const activeBoundaryIds = new Set(visualLayout.boundaries.map(function(b) { return b.id; }));
          const activeEdgeIds = new Set(visualLayout.edges.map(function(e) { return e.id; }));
          const validKeys = Object.keys(restored).filter(function(k) {
            return activeNodeIds.has(k) || activeBoundaryIds.has(k) || activeEdgeIds.has(k);
          });
          if (validKeys.length > 0) {
            for (const k of validKeys) {
              stagedEdits[k] = restored[k];
            }
            updateStagedChangesList();
            if (restore.editMode) {
              setEditMode(true);
            }
            const count = validKeys.length;
            setLayoutStatus('Draft restored — ' + count + ' staged change' + (count === 1 ? '' : 's') + '.', 'info', 'dirty');
            notifyDirtyChanged(true);
          }
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
      renderMetricsTable(metrics);
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
      setEditMode(!editMode);
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
      });
    }
    if (zoomOutBtn) {
      zoomOutBtn.addEventListener('click', () => {
        zoom = Math.max(0.2, zoom - 0.1);
        userAdjustedCamera = true;
        applyZoomPan();
        updateZoomDisplay();
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
      });
    }
    if (zoomFitBtn) {
      zoomFitBtn.addEventListener('click', () => {
        const result = computeZoomToFit(allLayoutBoxes(), baseViewBox, 32, viewportSize());
        zoom = result.zoom;
        panX = result.panX;
        panY = result.panY;
        userAdjustedCamera = false;
        applyZoomPan();
        updateZoomDisplay();
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
    // means the CSS default anchor (bottom: 20px; right: 20px).
    const legendOverlayEl = document.getElementById('legend-overlay');
    const legendItemsEl = document.getElementById('legend-items');
    let legendPosition = null;
    let legendDrag = null;

    function applyLegendPosition() {
      if (!legendOverlayEl || !legendPosition) return;
      legendOverlayEl.style.left = legendPosition.left + 'px';
      legendOverlayEl.style.top = legendPosition.top + 'px';
      legendOverlayEl.style.right = 'auto';
      legendOverlayEl.style.bottom = 'auto';
    }

    /**
     * Convert the CSS default anchor (bottom/right) into explicit left/top
     * coordinates so arrow keys and drags have a numeric starting point.
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
     * Rebuild the overlay content for the current diagram. Contextual: only
     * the element types the host reported in presentElementTypes appear. The
     * overlay stays hidden when c4x.legend.show is false or when there is
     * nothing to list.
     */
    function updateLegend(presentElementTypes, swatchColors, legendShow) {
      if (!legendOverlayEl || !legendItemsEl) return;
      if (legendShow === false) {
        legendOverlayEl.hidden = true;
        return;
      }
      const items = filterLegendItems(LEGEND_CATALOG, presentElementTypes || []);
      if (items.length === 0) {
        legendOverlayEl.hidden = true;
        return;
      }
      legendItemsEl.innerHTML = '';
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

    window.addEventListener('message', event => {
      const message = event.data;
      if (isRenderMessage(message)) {
        showSvg(message.payload.svg, message.payload.metrics, message.payload.visualLayout, message.payload.settings, message.payload.presentElementTypes, message.payload.legendSwatchColors);
        return;
      }
      if (message && message.type === 'render') {
        // Payload failed validation — surface the failure instead of hanging on "Waiting for render...".
        showError('The diagram render was rejected by webview validation. Check the C4X output channel for details.');
        return;
      }
      if (isErrorMessage(message)) {
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
        if (window.__c4xClearSaveWatchdog) window.__c4xClearSaveWatchdog();
        if (isRejectedMessage(message)) {
          // Revert all visual translations on nodes and boundaries to their baseline positions
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
          setLayoutStatus(message.reason + ' Draft discarded; refreshing from source.', 'error', 'rejected');
          toggleLayoutEl.focus();
          vscode.postMessage({ type: 'ready' });
        }
        return;
      }
      if (message && message.type === 'visualLayout.externalChangeConflict') {
        if (typeof message.reason === 'string' && message.reason.length > 0 && message.reason.length <= 1024) {
          showConflictBanner(message.reason);
        }
        return;
      }
      if (message && message.type === 'visualLayout.conflictActionAcknowledged') {
        if (message.action === 'rebaseAccepted') {
          hideConflictBanner();
          setLayoutStatus('Rebase accepted. Your draft has been updated to the new source baseline.', 'info', 'dirty');
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
      if (saved && isValidPersistedDraftState(saved)) {
        pendingRestoreState = saved;
      }
    } catch (_e) {
      // getState() is best-effort
    }

    vscode.postMessage({ type: 'ready' });
`;
