import type { LayoutResult } from '../layout/DagreLayoutEngine';
import { isBoundaryGeometryEditable, VisualLayoutBoundarySnapshot } from './visualLayoutProtocol';

/**
 * The boundary half of the layout snapshot the host sends the webview with
 * every render. Pure and VS Code-free so the payload the editor acts on can be
 * tested without a panel.
 */
export function buildBoundarySnapshots(layout: LayoutResult): VisualLayoutBoundarySnapshot[] {
    const elementIdSet = new Set(layout.elements.map(el => el.id));
    const boundaryIdSet = new Set(layout.boundaries?.map(b => b.id) ?? []);

    return (layout.boundaries ?? []).map(boundary => {
        const childNodeIds: string[] = [];
        const childBoundaryIds: string[] = [];
        for (const childId of boundary.boundary.elements) {
            if (elementIdSet.has(childId)) {
                childNodeIds.push(childId);
            } else if (boundaryIdSet.has(childId)) {
                childBoundaryIds.push(childId);
            }
        }
        const snapshot: VisualLayoutBoundarySnapshot = {
            id: boundary.id,
            label: boundary.boundary.label,
            x: boundary.x,
            y: boundary.y,
            width: boundary.width,
            height: boundary.height,
            childNodeIds,
            childBoundaryIds,
        };
        // Manual geometry travels with the frame so the editor's
        // live re-wrap honours a pinned origin and treats $w/$h as
        // minima, exactly as adjustBoundariesToContainChildren
        // does on save (#163).
        if (boundary.manualX) {
            snapshot.manualX = true;
        }
        if (boundary.manualY) {
            snapshot.manualY = true;
        }
        if (boundary.manualWidth !== undefined) {
            snapshot.manualWidth = boundary.manualWidth;
        }
        if (boundary.manualHeight !== undefined) {
            snapshot.manualHeight = boundary.manualHeight;
        }
        // A typed boundary has nowhere in source to keep a
        // position or size, so edit mode must not offer one (#271).
        if (!isBoundaryGeometryEditable(boundary.boundary)) {
            snapshot.movable = false;
        }
        return snapshot;
    });
}
