/**
 * Muted Theme - Grayscale Minimalist
 * Professional and corporate-friendly design
 * White boxes with subtle gray borders
 */

import { C4Theme } from './Theme';

export const MutedTheme: C4Theme = {
    name: 'muted',
    displayName: 'Muted',
    description: 'Grayscale minimalist - great for B&W printing',
    colors: {
        person: {
            fill: '#FFFFFF',      // White background
            stroke: '#4A5568',    // Dark gray border
            text: '#4A5568',      // Matching text
        },
        softwareSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#718096',    // Medium gray border
            text: '#67768B',      // WCAG AA on white (4.62:1)
        },
        externalSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#A0AEC0',    // Light gray border
            text: '#607590',      // WCAG AA on white (4.72:1)
        },
        container: {
            fill: '#FFFFFF',      // White background
            stroke: '#718096',    // Medium gray border
            text: '#67768B',      // WCAG AA on white (4.62:1)
        },
        component: {
            fill: '#FFFFFF',      // White background
            stroke: '#A0AEC0',    // Lighter gray border
            text: '#607590',      // WCAG AA on white (4.72:1)
        },
        deploymentNode: {
            fill: '#FFFFFF',
            stroke: '#718096',
            text: '#67768B',      // WCAG AA on white (4.62:1)
        },
        relationship: {
            stroke: '#4A5568',    // Dark gray arrows
            text: '#4A5568',
        },
        background: '#FFFFFF',
    },
    styles: {
        borderRadius: 8,          // Slightly rounded
        borderWidth: 2,           // Visible borders
        fontSize: 13,
        fontFamily: 'Georgia, serif',
        shadowEnabled: false,     // No shadows for clean print
    },
};
