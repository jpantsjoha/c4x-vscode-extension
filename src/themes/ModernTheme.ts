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
            text: '#6366F1',      // Matching text
        },
        softwareSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#3B82F6',    // Blue border
            text: '#3B82F6',      // Matching text
        },
        container: {
            fill: '#FFFFFF',      // White background
            stroke: '#06B6D4',    // Cyan border
            text: '#06B6D4',      // Matching text
        },
        component: {
            fill: '#FFFFFF',      // White background
            stroke: '#8B5CF6',    // Purple border
            text: '#8B5CF6',      // Matching text
        },
        deploymentNode: {
            fill: '#F3F4F6',      // Very light gray background
            stroke: '#4B5563',    // Dark gray border
            text: '#4B5563',
        },
        externalSystem: {
            fill: '#FFFFFF',      // White background
            stroke: '#9CA3AF',    // Gray border
            text: '#9CA3AF',      // Matching text
        },
        relationship: {
            stroke: '#6B7280',    // Gray arrows
            text: '#6B7280',
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
