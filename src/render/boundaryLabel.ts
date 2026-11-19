/**
 * Boundary label geometry (#324): the type line text, where the name and type
 * lines sit for a theme's `boundary.labelPosition`, and the room a frame must
 * reserve so no child node, nested frame or edge label overlaps the label.
 *
 * Host (BoundaryRenderer, DagreLayoutEngine) and webview share this module.
 * `boundaryLabelPlacement` is embedded verbatim in the webview (see
 * BOUNDARY_LABEL_CLIENT_FUNCTIONS), so it is self-contained: no imports, no
 * module constants. Widths come from the measured text tables
 * (src/render/textLayout.ts), never from character counts.
 */
import type { C4Theme } from '../themes/Theme';
import { measureTextPx, textMetricVariant, TEXT_METRICS } from './textLayout';

/** Name line: bold 14 px, as every theme has drawn boundary names. */
export const BOUNDARY_NAME_FONT_SIZE = 14;
/** Type line, `[Container]`: regular 12 px. */
export const BOUNDARY_TYPE_FONT_SIZE = 12;
/** Gap between a frame's left edge and its label (and the label's right gap). */
export const BOUNDARY_LABEL_MARGIN_X = 10;
/**
 * Room a bottom-left label needs under the lowest child: 10 px under the last
 * baseline, a 16 px line step, the name's ~13 px cap height and an 8 px gap.
 * With no type line the name sits on the last baseline and the frame's
 * ordinary 40 px bottom padding already clears it.
 */
export const BOUNDARY_BOTTOM_RESERVE_TYPED = 48;
export const BOUNDARY_BOTTOM_RESERVE_PLAIN = 40;

/** The type line a `boundaryType` keyword prints, or undefined for an untyped subgraph. */
export function boundaryTypeLabel(boundaryType: string | undefined): string | undefined {
    switch (boundaryType) {
        case 'System_Boundary': return '[Software System]';
        case 'Container_Boundary': return '[Container]';
        case 'Enterprise_Boundary': return '[Enterprise]';
        default: return undefined;
    }
}

/** Where a theme puts the type line: only a theme that asks for it, and only a typed boundary. */
export function boundaryTypeLineText(theme: C4Theme, boundaryType: string | undefined): string | undefined {
    return theme.boundary.showType ? boundaryTypeLabel(boundaryType) : undefined;
}

export interface BoundaryLabelPlacement {
    nameX: number;
    nameY: number;
    typeX: number;
    typeY: number;
}

/**
 * Baselines of the name and type lines for a frame at (x, y, width, height).
 * `top-left` is the long-standing placement (x + 10, y + 20) and has no type
 * line. `bottom-left` puts the type line's baseline 10 px above the frame's
 * bottom edge and the name one 16 px line above it.
 *
 * Self-contained: embedded verbatim in the webview.
 */
export function boundaryLabelPlacement(
    position: string,
    hasType: boolean,
    x: number,
    y: number,
    width: number,
    height: number,
): BoundaryLabelPlacement {
    void width;
    if (position === 'bottom-left') {
        const typeY = y + height - 10;
        const nameY = hasType ? typeY - 16 : typeY;
        return { nameX: x + 10, nameY, typeX: x + 10, typeY };
    }
    return { nameX: x + 10, nameY: y + 20, typeX: x + 10, typeY: y + 20 };
}

/** Extra bottom padding a frame reserves for its label; 40 (no change) for a top-left label. */
export function boundaryBottomPadding(theme: C4Theme, boundaryType: string | undefined): number {
    if (theme.boundary.labelPosition !== 'bottom-left') {
        return BOUNDARY_BOTTOM_RESERVE_PLAIN;
    }
    return boundaryTypeLineText(theme, boundaryType) !== undefined
        ? BOUNDARY_BOTTOM_RESERVE_TYPED
        : BOUNDARY_BOTTOM_RESERVE_PLAIN;
}

/**
 * Narrowest frame that holds the label with its side margins, from the measured
 * text widths. 0 for a top-left label, whose width the frame never constrained.
 */
export function boundaryLabelMinWidth(theme: C4Theme, label: string, boundaryType: string | undefined): number {
    if (theme.boundary.labelPosition !== 'bottom-left') {
        return 0;
    }
    const fontFamily = theme.styles.fontFamily;
    let widest = measureTextPx(label, BOUNDARY_NAME_FONT_SIZE, textMetricVariant(fontFamily, true, false), TEXT_METRICS);
    const typeLine = boundaryTypeLineText(theme, boundaryType);
    if (typeLine !== undefined) {
        widest = Math.max(widest, measureTextPx(typeLine, BOUNDARY_TYPE_FONT_SIZE, textMetricVariant(fontFamily, false, false), TEXT_METRICS));
    }
    return Math.ceil(widest) + 2 * BOUNDARY_LABEL_MARGIN_X;
}

/**
 * Drawn ink of a bottom-left label (name and type line together), padded by
 * 2 px, for edge routing and relationship-label placement (#324). Undefined for
 * a top-left label: those themes keep their routes and label positions as they
 * were. Widths come from the measured text tables.
 */
export function boundaryLabelInkBox(
    theme: C4Theme,
    boundary: { x: number; y: number; width: number; height: number; label: string; boundaryType: string | undefined },
): { x: number; y: number; width: number; height: number } | undefined {
    if (theme.boundary.labelPosition !== 'bottom-left') {
        return undefined;
    }
    const typeLine = boundaryTypeLineText(theme, boundary.boundaryType);
    const place = boundaryLabelPlacement(theme.boundary.labelPosition, typeLine !== undefined, boundary.x, boundary.y, boundary.width, boundary.height);
    const fontFamily = theme.styles.fontFamily;
    let right = place.nameX + measureTextPx(boundary.label, BOUNDARY_NAME_FONT_SIZE, textMetricVariant(fontFamily, true, false), TEXT_METRICS);
    if (typeLine !== undefined) {
        right = Math.max(right, place.typeX + measureTextPx(typeLine, BOUNDARY_TYPE_FONT_SIZE, textMetricVariant(fontFamily, false, false), TEXT_METRICS));
    }
    const top = place.nameY - BOUNDARY_NAME_FONT_SIZE;
    const bottom = place.typeY + 4;
    return { x: place.nameX - 2, y: top - 2, width: right - place.nameX + 4, height: bottom - top + 2 };
}

/** The functions the webview embeds verbatim. */
export const BOUNDARY_LABEL_CLIENT_FUNCTIONS: ReadonlyArray<(...args: never[]) => unknown> = [
    boundaryLabelPlacement,
];
