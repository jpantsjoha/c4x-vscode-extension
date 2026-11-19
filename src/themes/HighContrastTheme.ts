/**
 * High-Contrast Theme - meets WCAG AA text contrast (4.5:1) on every token
 * Designed for accessibility with strong contrast ratios: white boxes with
 * thick dark borders. The lowest label ratio is the external system text,
 * #666666 on white, at 5.74:1; black text is 21:1. Several tokens are below the
 * AAA text threshold (7:1), so this theme does not claim AAA.
 * @see https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 */

import { C4Theme, legacyThemeTokens } from './Theme';

export const HighContrastTheme: C4Theme = {
    name: 'high-contrast',
    displayName: 'High Contrast',
    description: 'Black and saturated outlines on white, 3px borders - maximum visibility',
    colors: {
        person: {
            fill: '#FFFFFF',      // White background
            stroke: '#000000',    // Black border
            text: '#000000',      // Black text (maximum contrast)
        },
        softwareSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#0000CC',    // Dark blue border
            text: '#0000CC',      // Matching text
        },
        externalSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#666666',    // Dark gray border
            text: '#666666',      // Matching text
        },
        container: {
            fill: '#FFFFFF',      // White background
            stroke: '#006600',    // Dark green border
            text: '#006600',      // Matching text
        },
        component: {
            fill: '#FFFFFF',      // White background
            stroke: '#CC0000',    // Dark red border
            text: '#CC0000',      // Matching text
        },
        deploymentNode: {
            fill: '#FFFFFF',
            stroke: '#000000',
            text: '#000000',
        },
        relationship: {
            stroke: '#000000',    // Black arrows
            text: '#000000',      // Black text
        },
        background: '#FFFFFF',
    },
    styles: {
        borderRadius: 8,          // Slightly rounded
        borderWidth: 3,           // Thick borders for visibility
        fontSize: 16,             // Larger text for readability
        fontFamily: 'Arial, sans-serif',
        shadowEnabled: false,     // No shadows
    },
    ...legacyThemeTokens({ stroke: '#000000', text: '#000000' }),
};
