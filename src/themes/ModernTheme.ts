/**
 * Modern Theme - Vibrant Colors with Rounded Corners
 * Designed for startup/tech-focused presentations
 * White boxes with vibrant colored borders
 */

import { C4Theme } from './Theme';

export const ModernTheme: C4Theme = {
    name: 'modern',
    displayName: 'Modern',
    description: 'Vibrant colors with rounded corners and shadows',
    colors: {
        person: {
            fill: '#FFFFFF',      // White background
            stroke: '#6366F1',    // Indigo border (modern)
            text: '#4338CA',      // Indigo-700 text - WCAG AA on white (7.90:1)
        },
        softwareSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#3B82F6',    // Blue border
            text: '#1D4ED8',      // Blue-700 text - WCAG AA on white (6.70:1)
        },
        container: {
            fill: '#FFFFFF',      // White background
            stroke: '#06B6D4',    // Cyan border
            text: '#155E75',      // Cyan-800 text - WCAG AA on white (7.27:1)
        },
        component: {
            fill: '#FFFFFF',      // White background
            stroke: '#8B5CF6',    // Purple border
            text: '#6D28D9',      // Violet-700 text - WCAG AA on white (7.10:1)
        },
        deploymentNode: {
            fill: '#F3F4F6',      // Very light gray background
            stroke: '#4B5563',    // Dark gray border
            text: '#374151',      // Gray-700 text - WCAG AA on the light-gray fill (9.37:1)
        },
        externalSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#9CA3AF',    // Gray border
            text: '#4B5563',      // Gray-600 text - WCAG AA on white (7.56:1)
        },
        relationship: {
            stroke: '#6B7280',    // Gray arrows
            text: '#374151',      // Gray-700 label text - WCAG AA on white (10.31:1)
        },
        background: '#FFFFFF',
    },
    styles: {
        borderRadius: 12,         // More rounded, modern look
        borderWidth: 2,           // Visible borders
        fontSize: 14,
        fontFamily: 'Helvetica, Arial, sans-serif',
        shadowEnabled: true,      // Drop shadows for depth
    },
};
