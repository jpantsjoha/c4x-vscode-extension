/**
 * Theme Manager - Central theme registry and state management
 * Handles theme selection, persistence, and retrieval
 */

import * as vscode from 'vscode';
import { C4Theme, ThemeName } from './Theme';
import { ClassicTheme } from './ClassicTheme';
import { ModernTheme } from './ModernTheme';
import { MutedTheme } from './MutedTheme';
import { HighContrastTheme } from './HighContrastTheme';
import { getAutoTheme } from './AutoTheme';

/**
 * Registry of all available themes
 */
const THEME_REGISTRY: Map<ThemeName, C4Theme> = new Map([
    ['classic', ClassicTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
    // Auto theme is special - dynamically generated
]);

/**
 * Configuration key for theme persistence
 */
const CONFIG_KEY = 'c4x.theme';

export class ThemeManager {
    private static instance: ThemeManager;
    private currentTheme: C4Theme;

    private constructor() {
        // Load theme from workspace settings or default to Classic
        const savedThemeName = this.getPersistedTheme();
        this.currentTheme = this.getThemeByName(savedThemeName) ?? ClassicTheme;
    }

    /**
     * Get singleton instance
     */
    public static getInstance(): ThemeManager {
        if (!ThemeManager.instance) {
            ThemeManager.instance = new ThemeManager();
        }
        return ThemeManager.instance;
    }

    /**
     * Get all available themes
     */
    public static getAllThemes(): C4Theme[] {
        return [
            ClassicTheme,
            ModernTheme,
            MutedTheme,
            HighContrastTheme,
            getAutoTheme(), // Dynamic - changes based on VS Code theme
        ];
    }

    /**
     * Get theme by name
     */
    private getThemeByName(name: ThemeName): C4Theme | undefined {
        if (name === 'auto') {
            return getAutoTheme();
        }
        return THEME_REGISTRY.get(name);
    }

    /**
     * Get currently selected theme
     */
    public getCurrentTheme(): C4Theme {
        // If auto theme, always regenerate to reflect current VS Code theme
        if (this.currentTheme.name.startsWith('auto')) {
            return getAutoTheme();
        }
        return this.currentTheme;
    }

    /**
     * Set current theme
     * @param themeName Name of theme to activate
     * @returns True if theme was set successfully
     */
    public async setCurrentTheme(themeName: ThemeName): Promise<boolean> {
        const theme = this.getThemeByName(themeName);
        if (!theme) {
            return false;
        }

        this.currentTheme = theme;

        // Persist to workspace settings
        await this.persistTheme(themeName);

        return true;
    }

    /**
     * Get persisted theme from workspace settings
     */
    private getPersistedTheme(): ThemeName {
        const envOverride = process.env.C4X_FORCE_THEME as ThemeName | undefined;
        if (envOverride && this.isValidThemeName(envOverride)) {
            return envOverride;
        }

        // Safety check for tests or environments where vscode.workspace is not available
        if (!vscode.workspace) {
            return 'classic';
        }
        const config = vscode.workspace.getConfiguration();
        return config.get<ThemeName>(CONFIG_KEY, 'classic');
    }

    /**
     * Persist theme to workspace settings
     */
    private async persistTheme(themeName: ThemeName): Promise<void> {
        // Safety check for tests or environments where vscode.workspace is not available
        if (!vscode.workspace) {
            return;
        }
        const config = vscode.workspace.getConfiguration();
        await config.update(CONFIG_KEY, themeName, vscode.ConfigurationTarget.Workspace);
    }

    private isValidThemeName(name: string): name is ThemeName {
        if (name === 'auto') {
            return true;
        }
        return THEME_REGISTRY.has(name as ThemeName);
    }
}

// Export singleton accessor
export const themeManager = ThemeManager.getInstance();
