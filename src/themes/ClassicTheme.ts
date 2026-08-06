/**
 * Classic Theme - Official C4 Model Visual Style
 * Based on c4model.com official diagrams (2024 refresh)
 * White/transparent boxes with colored borders (not filled boxes)
 * @see https://c4model.com/#Notation
 * @see examples/SystemContext.png, examples/Containers.png for reference
 */

import { C4Theme } from './Theme';

export const ClassicTheme: C4Theme = {
    name: 'classic',
    displayName: 'Classic',
    description: 'Official C4 Model style - white boxes with colored borders',
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
};

// Export default theme for backward compatibility
export const CLASSIC_THEME = ClassicTheme;
