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

export type ThemeName = 'classic' | 'modern' | 'muted' | 'high-contrast' | 'auto';
