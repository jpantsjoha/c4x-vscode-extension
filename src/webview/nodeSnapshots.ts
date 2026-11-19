import type { LayoutResult } from '../layout/DagreLayoutEngine';
import type { VisualLayoutNodeSnapshot } from './visualLayoutProtocol';

/** A coordinate the host honours as authored: present and finite (DagreLayoutEngine step 4). */
function isAuthoredCoordinate(value: string | undefined): boolean {
    return value !== undefined && Number.isFinite(parseFloat(value));
}

/**
 * The node half of the layout snapshot the host sends the webview with every
 * render. Pure and VS Code-free so the payload can be tested without a panel.
 * `manualX`/`manualY` tell the editor which nodes a boundary move must leave
 * in place, as the host does on save (#339).
 */
export function buildNodeSnapshots(layout: LayoutResult): VisualLayoutNodeSnapshot[] {
    return layout.elements.map(element => {
        const snapshot: VisualLayoutNodeSnapshot = {
            id: element.id,
            label: element.element.label,
            type: element.element.type,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            locked: element.element.metadata?.locked === 'true',
            description: element.element.description,
            technology: element.element.technology,
            tags: element.element.tags,
            sprite: element.element.sprite,
        };
        if (isAuthoredCoordinate(element.element.metadata?.x)) {
            snapshot.manualX = true;
        }
        if (isAuthoredCoordinate(element.element.metadata?.y)) {
            snapshot.manualY = true;
        }
        return snapshot;
    });
}
