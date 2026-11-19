// The colours an image prompt asks for, read from a theme.
//
// `buildVisualDiagramPrompt` used to quote the filled c4-standard hex values
// whatever theme was active, so a c4-model diagram (white boxes, coloured
// outlines) was asked for in the wrong colours (#330). A prompt palette is the
// theme's own element colours; the c4-standard theme yields the same hex
// values the prompts always carried.
//
// Pure: no VS Code API, so tests build one from any theme.

import type { C4ElementColors, C4Theme } from '../themes/Theme';
import { C4StandardTheme } from '../themes/C4StandardTheme';

export interface PromptPalette {
    /** The theme the palette came from. */
    readonly themeName: string;
    readonly person: C4ElementColors;
    readonly system: C4ElementColors;
    readonly external: C4ElementColors;
    readonly container: C4ElementColors;
    readonly component: C4ElementColors;
    readonly boundary: string;
    /** Boundary outline is dashed (else solid). */
    readonly boundaryDashed: boolean;
    /** Boundary title sits bottom-left (else top-left). */
    readonly boundaryLabelBottom: boolean;
    readonly arrow: string;
    readonly background: string;
    /** Colours for external systems in declaration order (c4-model); empty when all share `external`. */
    readonly externalAccents: readonly string[];
    /** True when the theme draws a Person as the person outline instead of an icon over a box. */
    readonly personOutline: boolean;
}

/** The palette of a theme (use the export theme: an image is read off-editor). */
export function promptPaletteFromTheme(theme: C4Theme): PromptPalette {
    return {
        themeName: theme.name,
        person: theme.colors.person,
        system: theme.colors.softwareSystem,
        external: theme.colors.externalSystem,
        container: theme.colors.container,
        component: theme.colors.component,
        boundary: theme.boundary.stroke,
        boundaryDashed: theme.boundary.dash !== null,
        boundaryLabelBottom: theme.boundary.labelPosition === 'bottom-left',
        arrow: theme.colors.relationship.stroke,
        background: theme.colors.background,
        externalAccents: theme.externalAccents.map(accent => accent.stroke),
        personOutline: (theme.defaultTagStyles ?? []).some(
            style => style.tag === 'Person' && style.properties.some(p => p.key === 'shape' && p.value === 'Person'),
        ),
    };
}

/** The palette the prompts carried before #330. */
export const C4_STANDARD_PROMPT_PALETTE: PromptPalette = promptPaletteFromTheme(C4StandardTheme);

/** `fill #438DD5, border #3C7FC0, text #FFFFFF` for one element kind. */
export function describeColours(colours: C4ElementColors): string {
    return `fill ${colours.fill}, border ${colours.stroke}, text ${colours.text}`;
}
