/**
 * Shared legend catalogue for the preview webview overlay (#98).
 *
 * The catalogue keys are the contract between the host (which computes which
 * element types are present in the current view) and the webview client
 * (which filters the overlay down to those types). Host-side helpers here are
 * pure and unit-testable; the webview receives the catalogue as injected JSON
 * via previewClientScript.
 */
import type { C4Element, C4View } from '../model/C4Model';

/**
 * Keys carried by the render payload's `presentElementTypes` field. The five
 * C4 element types match `C4ElementType`; `External`, `Boundary`, and
 * `Relationship` are derived markers for tag/boundary/relationship presence.
 */
export type LegendItemKey =
    | 'Person'
    | 'SoftwareSystem'
    | 'Container'
    | 'Component'
    | 'DeploymentNode'
    | 'External'
    | 'Boundary'
    | 'Relationship';

/** Swatch style buckets rendered by the overlay CSS. */
export type LegendSwatchKind = 'disc' | 'box' | 'dashed-box' | 'dashed-line';

export interface LegendItem {
    /** Key matched against the payload's `presentElementTypes` entries. */
    key: LegendItemKey;
    label: string;
    swatch: LegendSwatchKind;
    /**
     * Key into the payload's `legendSwatchColors` map. Undefined for
     * chrome-coloured swatches (boundary/relationship line styles).
     */
    colorKey?: 'person' | 'softwareSystem' | 'container' | 'component' | 'deploymentNode' | 'external';
}

/**
 * Every legend entry the overlay can show, in classic C4 cheat-sheet order.
 * The client filters this list down to the types actually present in the
 * current diagram.
 */
export const LEGEND_CATALOG: readonly LegendItem[] = [
    { key: 'Person', label: 'Person', swatch: 'disc', colorKey: 'person' },
    { key: 'SoftwareSystem', label: 'Software System', swatch: 'box', colorKey: 'softwareSystem' },
    { key: 'Container', label: 'Container', swatch: 'box', colorKey: 'container' },
    { key: 'Component', label: 'Component', swatch: 'box', colorKey: 'component' },
    { key: 'DeploymentNode', label: 'Deployment Node', swatch: 'box', colorKey: 'deploymentNode' },
    { key: 'External', label: 'External', swatch: 'box', colorKey: 'external' },
    { key: 'Boundary', label: 'Boundary', swatch: 'dashed-box' },
    { key: 'Relationship', label: 'Relationship', swatch: 'dashed-line' },
];

/**
 * Compute the legend keys present in a view: every element type in the
 * (possibly nested) element tree, plus the derived `External` marker when any
 * element carries the external tag (mirroring ElementRenderer's styling
 * rule), `Boundary` when the view declares boundaries, and `Relationship`
 * when the view has relationships.
 * Pure — no vscode or DOM access. Exported for unit tests.
 */
export function computePresentElementTypes(view: C4View): string[] {
    const present = new Set<string>();
    const walk = (elements: C4Element[]): void => {
        for (const element of elements) {
            present.add(element.type);
            if (element.tags?.some(tag => tag.toLowerCase() === 'external')) {
                present.add('External');
            }
            if (element.children) {
                walk(element.children);
            }
        }
    };
    walk(view.elements);
    if (view.boundaries && view.boundaries.length > 0) {
        present.add('Boundary');
    }
    if (view.relationships.length > 0) {
        present.add('Relationship');
    }
    return [...present];
}
