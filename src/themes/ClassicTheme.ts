/**
 * Classic Theme - outlined boxes in the earlier C4 blues
 * White boxes with blue borders for person, systems, containers and
 * components, grey borders for externals (not filled boxes). The c4model.com
 * example colours are the `c4-model` theme (#321).
 */

import { C4Theme, legacyThemeTokens } from './Theme';

export const ClassicTheme: C4Theme = {
    name: 'classic',
    displayName: 'Classic',
    description: 'White boxes with blue outlines and grey externals',
    colors: {
        // Person - Green border (official C4 model)
        person: {
            fill: '#FFFFFF',      // White/transparent background
            stroke: '#438DD5',    // Blue border for Person (C4 model 2024)
            text: '#2B76BF',      // Darkened border hue - WCAG AA on white (4.72:1)
        },
        // Internal Software System - Blue border
        softwareSystem: {
            fill: '#FFFFFF',      // White/transparent background
            stroke: '#1168BD',    // Blue border for internal systems
            text: '#1168BD',      // Text matches border color
        },
        // External System - Gray border
        externalSystem: {
            fill: '#FFFFFF',      // White/transparent background
            stroke: '#999999',    // Gray border for external systems
            text: '#757575',      // Darkened border hue - WCAG AA on white (4.61:1)
        },
        // Container - Lighter blue border
        container: {
            fill: '#FFFFFF',      // White/transparent background
            stroke: '#438DD5',    // Lighter blue border
            text: '#2B76BF',      // Darkened border hue - WCAG AA on white (4.72:1)
        },
        // Component - Light blue border
        component: {
            fill: '#FFFFFF',      // White/transparent background
            stroke: '#85BBF0',    // Light blue border
            text: '#1974CD',      // Darkened border hue - WCAG AA on white (4.75:1)
        },
        // Deployment Node - Light gray
        deploymentNode: {
            fill: '#FFFFFF',
            stroke: '#666666',
            text: '#666666',
        },
        // External variants
        externalPerson: {
            fill: '#FFFFFF',      // White background
            stroke: '#999999',    // Gray border for external
            text: '#757575',      // WCAG AA on white (4.61:1)
        },
        externalContainer: {
            fill: '#FFFFFF',      // White background
            stroke: '#999999',    // Gray border
            text: '#757575',      // WCAG AA on white (4.61:1)
        },
        externalComponent: {
            fill: '#FFFFFF',      // White background
            stroke: '#CCCCCC',    // Light gray border
            text: '#757575',      // WCAG AA on white (4.61:1)
        },
        relationship: {
            stroke: '#707070',    // Dark gray arrows
            text: '#707070',      // Gray label text
        },
        background: '#FFFFFF',
    },
    styles: {
        borderRadius: 10,         // Rounded corners (official C4 style)
        borderWidth: 2,           // Visible border
        fontSize: 14,
        fontFamily: 'Arial, sans-serif',
        shadowEnabled: false,     // No shadows in official C4
    },
    ...legacyThemeTokens({ stroke: '#707070', text: '#707070' }),
};

// Export default theme for backward compatibility
export const CLASSIC_THEME = ClassicTheme;
