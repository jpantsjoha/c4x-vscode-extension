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
import { resolveElementStyle, type ElementStyleContext, type ElementStyleTheme } from '../render/elementStyle';
import type { LayoutResult } from '../layout/DagreLayoutEngine';
import type { C4Theme } from '../themes/Theme';
import { boundLegendEntries, computeKeyEntries, keySwatchImage, keySwatchTheme, KEY_SWATCH_DEPS } from '../render/KeyRenderer';

/**
 * One overlay entry derived from the drawn view (#327): its label, its kind
 * and a decorative swatch image drawn with the shared shape geometry.
 */
export interface LegendEntry {
    label: string;
    kind: 'element' | 'boundary' | 'relationship';
    /** A standalone `<svg>` built by the host from validated colours; aria-hidden. */
    swatch: string;
}

/**
 * The overlay's entries: the same derived key the exports draw
 * (`computeKeyEntries`), with webview-sized swatches. Replaces the fixed
 * catalogue below whenever the host sends it. `styles` is the context the
 * SVG was drawn with (`elementStyleContextFor`).
 * Pure — no vscode or DOM access. Exported for unit tests.
 */
export function computeLegendEntries(
    layout: LayoutResult,
    theme: C4Theme,
    styles: ElementStyleContext,
): LegendEntry[] {
    const swatchTheme = keySwatchTheme(theme);
    // Bounded to the payload validator's limits, so the key never fails a render.
    return boundLegendEntries(computeKeyEntries(layout, theme, styles)
        .map(entry => ({ label: entry.label, kind: entry.kind, swatch: keySwatchImage(entry, swatchTheme, KEY_SWATCH_DEPS) })));
}

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

/**
 * Swatch colours for the legend overlay, keyed by `LegendItem.colorKey`.
 * Each is the resolved fill (`resolveElementStyle`, #322) of an untagged
 * element of that type, so an `elementStyle` rule on an implied tag
 * (`Container`, `Person`, `External`, ...) recolours the swatch as it
 * recolours the elements. With no rules this is the theme's fill per type,
 * as before. Deriving one entry per distinct style is #327.
 * Pure — no vscode or DOM access. Exported for unit tests.
 */
export function computeLegendSwatchColors(
    view: Pick<C4View, 'elementStyles'>,
    theme: ElementStyleTheme,
): Record<string, string> {
    const styles = { rules: view.elementStyles ?? [] };
    const fill = (type: string, tags?: string[]): string => resolveElementStyle({ type, tags }, theme, styles).fill;
    return {
        person: fill('Person'),
        softwareSystem: fill('SoftwareSystem'),
        container: fill('Container'),
        component: fill('Component'),
        deploymentNode: theme.colors.deploymentNode.fill,
        external: fill('SoftwareSystem', ['External']),
    };
}
