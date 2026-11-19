/**
 * Theme Manager - Central theme registry and state management
 * Handles theme selection, persistence, and retrieval
 */

import * as vscode from 'vscode';
import { C4Theme, ThemeName } from './Theme';
import { C4StandardTheme } from './C4StandardTheme';
import { C4ModelTheme } from './C4ModelTheme';
import { ClassicTheme } from './ClassicTheme';
import { ModernTheme } from './ModernTheme';
import { MutedTheme } from './MutedTheme';
import { HighContrastTheme } from './HighContrastTheme';
import { getAutoTheme } from './AutoTheme';

/**
 * Every theme name, in the order the `C4X: Change Theme` picker and the
 * `c4x.theme` setting list them. package.json `c4x.theme` enum must match
 * (theme-setting-reconciliation.test.ts).
 */
export const THEME_NAMES: ReadonlyArray<ThemeName> = [
    'classic',
    'c4-model',
    'c4-standard',
    'modern',
    'muted',
    'high-contrast',
    'auto',
];

/**
 * Default theme when nothing is configured. Matches the package.json
 * `c4x.theme` default (classic stays the default
 * in the release that ships c4-model).
 */
export const DEFAULT_THEME_NAME: ThemeName = 'classic';

/**
 * Registry of all available themes
 */
const THEME_REGISTRY: Map<ThemeName, C4Theme> = new Map([
    ['classic', ClassicTheme],
    ['c4-model', C4ModelTheme],
    ['c4-standard', C4StandardTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
    // Auto theme is special - dynamically generated
]);

/**
 * Configuration key for theme persistence
 */
const CONFIG_KEY = 'c4x.theme';

/**
 * The theme to draw for an editor that is dark or light: a theme's own `dark`
 * variant when the editor is dark and the theme declares one, else the theme.
 * Pure, so the choice is testable without a VS Code host.
 */
export function resolveThemeVariant(theme: C4Theme, editorIsDark: boolean): C4Theme {
    return editorIsDark && theme.dark ? theme.dark : theme;
}

/** True when VS Code's active colour theme is dark or high contrast. */
export function isEditorDark(): boolean {
    const kind = vscode.window?.activeColorTheme?.kind;
    return kind === vscode.ColorThemeKind.Dark || kind === vscode.ColorThemeKind.HighContrast;
}

/** The theme was saved, but a narrower settings scope overrides it. */
export class ThemeNotEffectiveError extends Error {
    constructor(public readonly requested: string, public readonly effective: string) {
        super(`Saved "${requested}", but a workspace or folder setting overrides it; the effective C4X theme is "${effective}".`);
        this.name = 'ThemeNotEffectiveError';
    }
}

export class ThemeManager {
    private static instance: ThemeManager;
    private currentTheme: C4Theme;
    private latestRequest = 0;

    private constructor() {
        // Load theme from workspace settings or fall back to the default (classic)
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
        // Auto is dynamic - it changes with the VS Code colour theme
        return THEME_NAMES.map(name => name === 'auto' ? getAutoTheme() : THEME_REGISTRY.get(name) as C4Theme);
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
        return resolveThemeVariant(this.currentTheme, isEditorDark());
    }

    /**
     * Theme for exported images, which are read off-editor: the light variant
     * of the selected theme whatever the editor shows. `auto` is the exception
     * and keeps following the editor, as it always has.
     */
    public getExportTheme(): C4Theme {
        if (this.currentTheme.name.startsWith('auto')) {
            return getAutoTheme();
        }
        return this.currentTheme;
    }

    /**
     * Follow the `c4x.theme` setting while the extension runs. Reads the
     * effective value (user, workspace or folder scope) and never writes, so
     * editing the setting restyles without a reload. Unknown values resolve to
     * classic as at construction, and `C4X_FORCE_THEME` still wins.
     * The Change Theme command writes the setting, which fires this with the
     * value already applied: re-applying it is a no-op.
     */
    public watchConfiguration(): vscode.Disposable {
        if (!vscode.workspace?.onDidChangeConfiguration) {
            return { dispose: () => undefined };
        }
        return vscode.workspace.onDidChangeConfiguration(event => {
            if (event.affectsConfiguration(CONFIG_KEY)) {
                this.currentTheme = this.getThemeByName(this.getPersistedTheme()) ?? ClassicTheme;
            }
        });
    }

    /**
     * Set current theme
     * @param themeName Name of theme to activate
     * @returns True if theme was set successfully
     * @throws When the setting cannot be saved; the current theme is unchanged
     */
    public async setCurrentTheme(themeName: ThemeName): Promise<boolean> {
        const theme = this.getThemeByName(themeName);
        if (!theme) {
            return false;
        }

        // Apply immediately, then persist. On rejection, reconcile from the
        // effective setting (as the watcher does) rather than restoring a
        // captured value, which a concurrent settings change may have made stale.
        this.currentTheme = theme;
        const requestId = ++this.latestRequest;
        let written: number | undefined;
        try {
            written = await this.persistTheme(themeName);
        } catch (error) {
            this.currentTheme = this.getThemeByName(this.getPersistedTheme()) ?? ClassicTheme;
            throw error;
        }

        // A newer request supersedes this one: a later choice winning is not an error.
        if (requestId !== this.latestRequest || written === undefined || !vscode.workspace) {
            return true;
        }

        // Report only a NARROWER scope than the one written overriding the value.
        const config = vscode.workspace.getConfiguration();
        const effective = config.get<string>(CONFIG_KEY, DEFAULT_THEME_NAME);
        if (effective !== themeName) {
            const info = config.inspect?.<string>(CONFIG_KEY);
            const narrower = written === vscode.ConfigurationTarget.Global
                ? info?.workspaceValue !== undefined || info?.workspaceFolderValue !== undefined
                : info?.workspaceFolderValue !== undefined;
            if (narrower) {
                this.currentTheme = this.getThemeByName(this.getPersistedTheme()) ?? ClassicTheme;
                throw new ThemeNotEffectiveError(themeName, String(effective));
            }
        }

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
            return DEFAULT_THEME_NAME;
        }
        const config = vscode.workspace.getConfiguration();
        return config.get<ThemeName>(CONFIG_KEY, DEFAULT_THEME_NAME);
    }

    /**
     * Persist theme: Workspace scope when a folder or workspace file is open, else Global (user
     * settings), because VS Code rejects a Workspace write with no folder (#399).
     */
    private async persistTheme(themeName: ThemeName): Promise<number | undefined> {
        // Safety check for tests or environments where vscode.workspace is not available
        if (!vscode.workspace) {
            return undefined;
        }
        const config = vscode.workspace.getConfiguration();
        // A saved or untitled workspace may have zero folders yet own settings.
        const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0
            || vscode.workspace.workspaceFile !== undefined;
        const target = hasWorkspace
            ? vscode.ConfigurationTarget.Workspace
            : vscode.ConfigurationTarget.Global;
        await config.update(CONFIG_KEY, themeName, target);
        return target;
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
