/**
 * Theme system for C4X diagrams
 * Provides color palettes and styling options for different visual styles
 */

export interface C4Theme {
    name: string;
    displayName: string;
    description: string;
    colors: {
        person: C4ElementColors;
        softwareSystem: C4ElementColors;
        externalSystem: C4ElementColors;
        container: C4ElementColors;
        component: C4ElementColors;
        deploymentNode: C4ElementColors;
        // External variants for C4-PlantUML compatibility
        externalPerson?: C4ElementColors;
        externalContainer?: C4ElementColors;
        externalComponent?: C4ElementColors;
        relationship: C4RelationshipColors;
        background: string;
    };
    styles: {
        borderRadius: number;      // 0 = square, 10 = rounded
        borderWidth: number;        // 1-4px
        fontSize: number;           // 12-16px
        fontFamily: string;         // 'Arial', 'Helvetica', etc.
        shadowEnabled: boolean;     // Drop shadow on elements
    };
    /** System/container boundary drawing (notation decision #320). */
    boundary: C4BoundaryStyle;
    /** Diagram title / caption (notation decision #320). */
    title: C4TitleStyle;
    /**
     * Ordered accents for external elements, assigned in source declaration
     * order within a view and cycling (consumed by #322). Empty in themes whose
     * externals all use `colors.externalSystem`.
     */
    externalAccents: ReadonlyArray<C4AccentColors>;
    /**
     * Theme-level tag styles, in the shape of `elementStyle` rules (notation decision #320,
     * Decision 4). Absent means `Database -> Cylinder`, today's database rule.
     * A shape set here never replaces an icon-node render.
     */
    defaultTagStyles?: ReadonlyArray<C4TagStyle>;
    /**
     * Print each element's C4 type line, `[Type]` or `[Type: technology]`, in place of
     * the bare technology line (#348). Absent or false keeps today's output.
     */
    showElementType?: boolean;
    /**
     * Deployment notation (#326), as in the c4model.com deployment examples: a
     * deployment node's icon sits at the bottom left beside its name and
     * `[Deployment Node: technology]`, nested nodes reserve that label row, and
     * an infrastructure node's icon is centred under its text. `brandTint`
     * outlines a node in its sprite's brand colour when the sprite keeps its own
     * colours (`preserveColor`). Absent: deployment nodes draw as before (sprite
     * 40 px top centre, label header on top).
     */
    deploymentNotation?: C4DeploymentNotation;
    /** Optional variant used when the editor is dark (notation decision #320). */
    dark?: C4Theme;
}

export interface C4BoundaryStyle {
    stroke: string;               // Outline colour
    text: string;                 // Label colour
    strokeWidth: number;          // Outline width in px
    dash: string | null;          // SVG stroke-dasharray, or null for a solid line
    opacity: number;              // Outline opacity, 0-1
    labelPosition: 'top-left' | 'bottom-left'; // Honoured by #324
    showType: boolean;            // Show "[Software System]" type line; honoured by #324
}

export interface C4DeploymentNotation {
    /** Outline a node in its `preserveColor` sprite's brand colour. An `elementStyle` `$stroke` still wins. */
    brandTint: boolean;
}

export interface C4TitleStyle {
    position: 'top-center' | 'bottom-left'; // Honoured by #328
    color: string;                // Title text colour
    showDescription: boolean;     // Honoured by #328
}

/** A theme default tag style: the same tag and ordered properties an `elementStyle` rule has. */
export interface C4TagStyle {
    readonly tag: string;
    readonly properties: ReadonlyArray<{ readonly key: string; readonly value: string }>;
}

/** An external accent.`text` defaults to `stroke` (see accentTextColor). */
export interface C4AccentColors {
    readonly stroke: string;
    readonly text?: string;
}

/** Resolved text colour of an external accent: `text`, else `stroke`. */
export function accentTextColor(accent: C4AccentColors): string {
    return accent.text ?? accent.stroke;
}

export interface C4ElementColors {
    fill: string;                 // Element background color
    stroke: string;               // Border color
    text: string;                 // Text color
}

export interface C4RelationshipColors {
    stroke: string;               // Arrow line color
    text: string;                 // Label text color
}

export type ThemeName = 'classic' | 'c4-model' | 'c4-standard' | 'modern' | 'muted' | 'high-contrast' | 'auto';

/**
 * Boundary, title and accent tokens that reproduce the drawing every theme had
 * before the notation decision (#320): boundaries and the title borrow the relationship colours,
 * boundaries are 2px dashed `8,4` at 0.7 opacity with the label top left and no
 * type line, the title sits top centre, and there are no external accents.
 */
export function legacyThemeTokens(
    relationship: C4RelationshipColors,
): Pick<C4Theme, 'boundary' | 'title' | 'externalAccents'> {
    return {
        boundary: {
            stroke: relationship.stroke,
            text: relationship.text,
            strokeWidth: 2,
            dash: '8,4',
            opacity: 0.7,
            labelPosition: 'top-left',
            showType: false,
        },
        title: {
            position: 'top-center',
            color: relationship.text,
            showDescription: false,
        },
        externalAccents: [],
    };
}
