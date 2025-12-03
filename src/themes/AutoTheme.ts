/**
 * Auto Theme - Matches VS Code Color Theme
 * Automatically adapts to light or dark VS Code themes
 * Provides seamless integration with editor appearance
 */

import * as vscode from 'vscode';
import { C4Theme } from './Theme';

/**
 * Dark variant for dark VS Code themes
 * Uses VS Code's dark theme color palette
 */
const DarkTheme: C4Theme = {
    name: 'auto',
    displayName: 'Auto',
    description: 'Adapts to VS Code theme (currently dark)',
    colors: {
        person: {
            fill: '#569CD6',      // VS Code blue
            stroke: '#4EC9B0',
            text: '#D4D4D4',
        },
        softwareSystem: {
            fill: '#4EC9B0',      // VS Code cyan
            stroke: '#569CD6',
            text: '#D4D4D4',
        },
        externalSystem: {
            fill: '#6A737D',      // Muted gray
            stroke: '#8E949A',
            text: '#D4D4D4',
        },
        container: {
            fill: '#DCDCAA',      // VS Code yellow
            stroke: '#CE9178',
            text: '#1E1E1E',
        },
        component: {
            fill: '#C586C0',      // VS Code purple
            stroke: '#D16969',
            text: '#D4D4D4',
        },
        relationship: {
            stroke: '#858585',
            text: '#D4D4D4',
        },
        background: '#1E1E1E',
    },
    styles: {
        borderRadius: 4,
        borderWidth: 2,
        fontSize: 14,
        fontFamily: 'Consolas, monospace',
        shadowEnabled: false,
    },
};

/**
 * Light variant for light VS Code themes
 * Uses brighter colors suitable for light backgrounds
 */
const LightTheme: C4Theme = {
    name: 'auto',
    displayName: 'Auto',
    description: 'Adapts to VS Code theme (currently light)',
    colors: {
        person: {
            fill: '#0000FF',      // Blue
            stroke: '#000080',
            text: '#FFFFFF',
        },
        softwareSystem: {
            fill: '#008080',      // Teal
            stroke: '#006666',
            text: '#FFFFFF',
        },
        externalSystem: {
            fill: '#D3D3D3',      // Light gray
            stroke: '#A9A9A9',
            text: '#000000',
        },
        container: {
            fill: '#FFA500',      // Orange
            stroke: '#FF8C00',
            text: '#000000',
        },
        component: {
            fill: '#800080',      // Purple
            stroke: '#660066',
            text: '#FFFFFF',
        },
        relationship: {
            stroke: '#666666',
            text: '#000000',
        },
        background: '#FFFFFF',
    },
    styles: {
        borderRadius: 4,
        borderWidth: 2,
        fontSize: 14,
        fontFamily: 'Consolas, monospace',
        shadowEnabled: false,
    },
};

/**
 * Get the appropriate theme based on current VS Code color theme
 * @returns C4Theme matching the current VS Code appearance
 */
export function getAutoTheme(): C4Theme {
    const colorThemeKind = vscode.window.activeColorTheme.kind;

    switch (colorThemeKind) {
        case vscode.ColorThemeKind.Dark:
        case vscode.ColorThemeKind.HighContrast:
            return DarkTheme;

        case vscode.ColorThemeKind.Light:
            return LightTheme;

        default:
            return LightTheme; // Fallback to light
    }
}

// Export individual theme variants for testing
export { DarkTheme, LightTheme };
