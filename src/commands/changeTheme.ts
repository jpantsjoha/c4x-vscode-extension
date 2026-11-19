/**
 * Change Theme Command
 * Allows users to switch between C4X diagram themes via Quick Pick UI
 */

import * as vscode from 'vscode';
import { ThemeManager, ThemeNotEffectiveError } from '../themes/ThemeManager';
import { ThemeName } from '../themes/Theme';

export async function changeThemeCommand(): Promise<void> {
    const themes = ThemeManager.getAllThemes();

    // Create Quick Pick items with theme metadata
    const items = themes.map(theme => ({
        label: theme.displayName,
        description: theme.description,
        detail: `${theme.name} theme`,
        themeName: theme.name as ThemeName,
    }));

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a C4X diagram theme',
        matchOnDescription: true,
        matchOnDetail: true,
    });

    if (!selected) {
        return; // User cancelled
    }

    // Apply selected theme
    const themeManager = ThemeManager.getInstance();
    let success: boolean;
    try {
        success = await themeManager.setCurrentTheme(selected.themeName);
    } catch (error) {
        if (error instanceof ThemeNotEffectiveError) {
            vscode.window.showWarningMessage(error.message);
            vscode.commands.executeCommand('c4x.refreshPreview');
            return;
        }
        const reason = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Could not save the C4X theme: ${reason}`);
        return;
    }

    if (success) {
        vscode.window.showInformationMessage(`C4X theme changed to ${selected.label}`);

        // Trigger refresh of all open C4X previews
        vscode.commands.executeCommand('c4x.refreshPreview');
    } else {
        vscode.window.showErrorMessage(`Failed to apply theme: ${selected.label}`);
    }
}
