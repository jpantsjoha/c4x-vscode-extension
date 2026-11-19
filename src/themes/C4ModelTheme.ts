/**
 * c4-model Theme - outlined notation matching the c4model.com example diagrams
 *
 * White fills; outline and text share one colour per element: person green,
 * in-scope system/container/component blue, each external system its own
 * accent, relationships and captions dark grey, a solid blue system boundary.
 * Values come from the shared palette in c4-palette.ts (sampled 2026-11-14;
 * see that file). notation decision #320, issue #321.
 *
 * Tokens consumed by later issues are set here so those issues change the
 * renderer, not the theme:
 *   - boundary.labelPosition 'bottom-left' and boundary.showType: #324
 *   - title.position 'bottom-left' and title.showDescription: #328
 *   - externalAccents (declaration-order assignment): #322
 *   - defaultTagStyles `Person -> Person` (the person outline): #323
 * Until those land, boundaries keep today's top-left label and the title stays
 * top centre; colour, dash and opacity tokens are already honoured.
 */

import { C4AccentColors, C4ElementColors, C4Theme, accentTextColor } from './Theme';
import {
    C4_MODEL_FILL,
    C4_MODEL_PERSON,
    C4_MODEL_INTERNAL,
    C4_MODEL_NEUTRAL,
    C4_MODEL_BOUNDARY,
    C4_MODEL_BACKGROUND,
    C4_MODEL_EXTERNAL_ACCENTS,
    C4_MODEL_DARK_BACKGROUND,
    C4_MODEL_DARK_PERSON,
    C4_MODEL_DARK_INTERNAL,
    C4_MODEL_DARK_NEUTRAL,
    C4_MODEL_DARK_EXTERNAL_ACCENTS,
} from './c4-palette';

function outlined(fill: string, colour: string): C4ElementColors {
    return { fill, stroke: colour, text: colour };
}

function fromAccent(fill: string, accent: C4AccentColors): C4ElementColors {
    return { fill, stroke: accent.stroke, text: accentTextColor(accent) };
}

interface C4ModelPalette {
    background: string;
    fill: string;
    person: string;
    internal: string;
    neutral: string;
    boundary: string;
    accents: ReadonlyArray<C4AccentColors>;
}

function buildC4ModelTheme(p: C4ModelPalette, variant: 'light' | 'dark'): C4Theme {
    // The first accent is the colour of an external element until #322
    // assigns accents per element in declaration order.
    const external = fromAccent(p.fill, p.accents[0]);
    return {
        name: 'c4-model',
        displayName: 'C4 Model',
        description: variant === 'light'
            ? 'White boxes outlined in the c4model.com example colours: green person, blue systems, coloured externals'
            : 'Dark variant: c4model.com example hues lightened for a dark background',
        colors: {
            person: outlined(p.fill, p.person),
            softwareSystem: outlined(p.fill, p.internal),
            externalSystem: external,
            container: outlined(p.fill, p.internal),
            component: outlined(p.fill, p.internal),
            // Not in the reference examples: neutral grey, like relationships.
            deploymentNode: outlined(p.fill, p.neutral),
            externalPerson: external,
            externalContainer: external,
            externalComponent: external,
            relationship: { stroke: p.neutral, text: p.neutral },
            background: p.background,
        },
        styles: {
            borderRadius: 6,          // Small rounded corners
            borderWidth: 2,
            fontSize: 14,
            fontFamily: 'Arial, sans-serif',
            shadowEnabled: false,
        },
        boundary: {
            stroke: p.boundary,
            text: p.boundary,
            strokeWidth: 1,           // Thin
            dash: null,               // Solid
            opacity: 1,
            labelPosition: 'bottom-left', // Honoured by #324
            showType: true,               // Honoured by #324
        },
        title: {
            position: 'bottom-left',  // Honoured by #328
            color: p.neutral,
            showDescription: true,    // Honoured by #328
        },
        externalAccents: p.accents,
        // Every theme's database rule, plus the person outline (#323): a
        // Person with no explicit $sprite draws a head over a rounded body.
        defaultTagStyles: [
            { tag: 'Database', properties: [{ key: 'shape', value: 'Cylinder' }] },
            { tag: 'Person', properties: [{ key: 'shape', value: 'Person' }] },
        ],
        showElementType: true,        // #348: [Container: technology] under the name
        // #326: icon bottom left beside the node name, nested label rows, brand-tinted outlines.
        deploymentNotation: { brandTint: true },
    };
}

/** Dark variant: fill equals the background ("no fill"); see c4-palette.ts. */
export const C4ModelDarkTheme: C4Theme = buildC4ModelTheme({
    background: C4_MODEL_DARK_BACKGROUND,
    fill: C4_MODEL_DARK_BACKGROUND,
    person: C4_MODEL_DARK_PERSON,
    internal: C4_MODEL_DARK_INTERNAL,
    neutral: C4_MODEL_DARK_NEUTRAL,
    boundary: C4_MODEL_DARK_INTERNAL,
    accents: C4_MODEL_DARK_EXTERNAL_ACCENTS,
}, 'dark');

export const C4ModelTheme: C4Theme = {
    ...buildC4ModelTheme({
        background: C4_MODEL_BACKGROUND,
        fill: C4_MODEL_FILL,
        person: C4_MODEL_PERSON,
        internal: C4_MODEL_INTERNAL,
        neutral: C4_MODEL_NEUTRAL,
        boundary: C4_MODEL_BOUNDARY,
        accents: C4_MODEL_EXTERNAL_ACCENTS,
    }, 'light'),
    dark: C4ModelDarkTheme,
};
