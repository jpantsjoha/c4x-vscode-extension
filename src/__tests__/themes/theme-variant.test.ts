/**
 * Dark-variant selection (#329, notation decision #320 Decision 4).
 *
 * A theme that declares `dark` is drawn with it when the editor is dark; the
 * preview follows the editor, exports use the light variant, and themes
 * without a `dark` variant are untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import * as vscode from '../__mocks__/vscode';
import { ThemeManager, resolveThemeVariant, isEditorDark } from '../../themes/ThemeManager';
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';

function setEditor(kind: vscode.ColorThemeKind): void {
    vscode.window.activeColorTheme = { kind };
}

describe('theme dark variant selection (#329)', () => {
    const workspace = vscode.workspace as unknown as { getConfiguration: () => unknown };
    const originalGetConfiguration = workspace.getConfiguration;
    beforeEach(() => {
        // persistTheme writes the setting; take it without a real configuration.
        const base = originalGetConfiguration as () => object;
        workspace.getConfiguration = () => ({
            ...base(),
            update: async (k: string, v: unknown) => { vscode.setConfigurationValueForTests(k, v); },
        });
    });
    afterEach(() => {
        workspace.getConfiguration = originalGetConfiguration;
        vscode.setConfigurationValueForTests('c4x.theme', undefined);
        void ThemeManager.getInstance().setCurrentTheme('classic');
        setEditor(vscode.ColorThemeKind.Light);
    });

    it('resolveThemeVariant picks dark only when the editor is dark and a variant exists', () => {
        assert.strictEqual(resolveThemeVariant(C4ModelTheme, true), C4ModelDarkTheme);
        assert.strictEqual(resolveThemeVariant(C4ModelTheme, false), C4ModelTheme);
        assert.strictEqual(resolveThemeVariant(ClassicTheme, true), ClassicTheme);
    });

    it('isEditorDark is true for dark and high-contrast kinds, false for light kinds', () => {
        setEditor(vscode.ColorThemeKind.Dark);
        assert.strictEqual(isEditorDark(), true);
        setEditor(vscode.ColorThemeKind.HighContrast);
        assert.strictEqual(isEditorDark(), true);
        setEditor(vscode.ColorThemeKind.Light);
        assert.strictEqual(isEditorDark(), false);
        setEditor(vscode.ColorThemeKind.HighContrastLight);
        assert.strictEqual(isEditorDark(), false);
    });

    it('the preview theme follows the editor; the export theme stays light', async () => {
        const manager = ThemeManager.getInstance();
        await manager.setCurrentTheme('c4-model');

        setEditor(vscode.ColorThemeKind.Light);
        assert.strictEqual(manager.getCurrentTheme(), C4ModelTheme);
        assert.strictEqual(manager.getExportTheme(), C4ModelTheme);

        setEditor(vscode.ColorThemeKind.Dark);
        assert.strictEqual(manager.getCurrentTheme(), C4ModelDarkTheme);
        assert.strictEqual(manager.getExportTheme(), C4ModelTheme, 'exports are read off-editor');

        await manager.setCurrentTheme('classic');
        assert.strictEqual(manager.getCurrentTheme(), ClassicTheme, 'a theme without dark is untouched');
    });

    it('auto keeps following the editor in exports, as before', async () => {
        const manager = ThemeManager.getInstance();
        await manager.setCurrentTheme('auto');
        setEditor(vscode.ColorThemeKind.Dark);
        assert.strictEqual(manager.getExportTheme().description, manager.getCurrentTheme().description);
        assert.ok(manager.getCurrentTheme().description.includes('dark'));
    });
});
