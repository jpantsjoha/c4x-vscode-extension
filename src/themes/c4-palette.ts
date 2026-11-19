/**
 * C4 Standard Color Palette
 *
 * The canonical C4 model colors matching Structurizr and C4-PlantUML defaults.
 * This palette is the single source of truth shared by both the SVG theme
 * renderer (C4StandardTheme) and the AI visual prompt builder (PromptBuilder).
 *
 * @see https://c4model.com
 * @see https://structurizr.com
 */

// ---------------------------------------------------------------------------
// Element fills
// ---------------------------------------------------------------------------

/** Person element fill - dark blue */
export const C4_PERSON_FILL = '#08427B';
/** Person element border */
export const C4_PERSON_STROKE = '#073B6F';

/** Internal software system fill - blue */
export const C4_SYSTEM_FILL = '#1168BD';
/** Internal software system border */
export const C4_SYSTEM_STROKE = '#0E5CA8';

/** External software system fill - grey */
export const C4_EXTERNAL_FILL = '#999999';
/** External software system border */
export const C4_EXTERNAL_STROKE = '#8A8A8A';

/** Container fill - medium blue */
export const C4_CONTAINER_FILL = '#438DD5';
/** Container border */
export const C4_CONTAINER_STROKE = '#3C7FC0';

/** Component fill - light blue */
export const C4_COMPONENT_FILL = '#85BBF0';
/** Component border */
export const C4_COMPONENT_STROKE = '#78A8D8';

/** Deployment node fill */
export const C4_NODE_FILL = '#FFFFFF';
/** Deployment node border */
export const C4_NODE_STROKE = '#888888';

// ---------------------------------------------------------------------------
// Boundary
// ---------------------------------------------------------------------------

/** Boundary border - dashed grey */
export const C4_BOUNDARY_STROKE = '#444444';
/** Boundary title text */
export const C4_BOUNDARY_TEXT = '#444444';

// ---------------------------------------------------------------------------
// Text colors
// ---------------------------------------------------------------------------

/** White text (used on dark fills) */
export const C4_TEXT_WHITE = '#FFFFFF';
/** Dark text (used on light fills like components) */
export const C4_TEXT_DARK = '#000000';

// ---------------------------------------------------------------------------
// Relationship / arrow colors
// ---------------------------------------------------------------------------

/** Arrow line stroke */
export const C4_ARROW_STROKE = '#707070';
/** Arrow label text */
export const C4_ARROW_TEXT = '#707070';

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

/** Default diagram background */
export const C4_BACKGROUND = '#FFFFFF';

// ===========================================================================
// c4-model theme palette (#321, notation decision #320)
//
// Sampled 2026-11-14 from the example diagrams and keys on c4model.com
// (CC BY 4.0). c4model.com states the C4 model is notation independent; these
// values match its published examples, not a standard. White fills; outline
// and text share one colour per element.
// ===========================================================================

/** White fill used for every c4-model element. */
export const C4_MODEL_FILL = '#FFFFFF';
/** Person outline and text - green. 5.15:1 on white. */
export const C4_MODEL_PERSON = '#297E06';
/** In-scope software system, container and component outline and text - blue. 5.62:1 on white. */
export const C4_MODEL_INTERNAL = '#1168BD';
/** Relationship line, relationship label, title and caption text - dark grey. 9.74:1 on white. */
export const C4_MODEL_NEUTRAL = '#444444';
/** System boundary outline and label - the in-scope blue, solid. */
export const C4_MODEL_BOUNDARY = C4_MODEL_INTERNAL;
/** Diagram background. */
export const C4_MODEL_BACKGROUND = '#FFFFFF';

/**
 * Ordered external-system accents: red, orange, teal, purple.
 * `text` is omitted where the stroke reads at WCAG AA (4.5:1) on white and set
 * to a darker tone of the same hue where it does not:
 *   - #ED8609 is 2.62:1 on white -> text #B35F00 (4.61:1)
 *   - #1A849C is 4.35:1 on white -> text #197F96 (4.65:1), same hue scaled
 * Full contrast work is #329.
 */
export const C4_MODEL_EXTERNAL_ACCENTS: ReadonlyArray<{ readonly stroke: string; readonly text?: string }> = [
    { stroke: '#BF101D' },                    // 6.35:1 on white
    { stroke: '#ED8609', text: '#B35F00' },
    { stroke: '#1A849C', text: '#197F96' },
    { stroke: '#8411BD' },                    // 7.51:1 on white
];

// ---------------------------------------------------------------------------
// c4-model dark variant. Chosen for this repository, not sampled: the same
// hues mixed toward white until each clears about 6:1 on #1E1E1E (VS Code's
// dark editor background), so text reads at AA with margin. Fill equals the
// background ("no fill"). Contrast figures are against #1E1E1E.
// ---------------------------------------------------------------------------

/** Dark background and element fill. */
export const C4_MODEL_DARK_BACKGROUND = '#1E1E1E';
/** Person, dark. 6.05:1. */
export const C4_MODEL_DARK_PERSON = '#72AA5B';
/** In-scope system, container, component and boundary, dark. 6.03:1. */
export const C4_MODEL_DARK_INTERNAL = '#69A0D5';
/** Relationship, title and caption text, dark. 6.07:1. */
export const C4_MODEL_DARK_NEUTRAL = '#9C9C9C';
/** Ordered external accents, dark: 6.12:1, 6.36:1, 6.02:1, 6.11:1. */
export const C4_MODEL_DARK_EXTERNAL_ACCENTS: ReadonlyArray<{ readonly stroke: string; readonly text?: string }> = [
    { stroke: '#DE8389' },
    { stroke: '#ED8609' },
    { stroke: '#5AA6B8' },
    { stroke: '#C086DD' },
];
