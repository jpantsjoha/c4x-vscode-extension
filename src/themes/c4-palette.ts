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
