/**
 * The Change Theme command reports each outcome of the save and refreshes the
 * preview when the theme is applied or only shadowed (#399).
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
import { ThemeManager, ThemeNotEffectiveError } from '../../themes/ThemeManager';
import { changeThemeCommand } from '../../commands/changeTheme';

describe('changeThemeCommand outcomes (#399)', () => {
    const window = vscode.window as unknown as Record<string, unknown>;
    const holder = vscode as unknown as { commands?: { executeCommand: unknown } };
    const manager = ThemeManager.getInstance() as unknown as { setCurrentTheme: (n: string) => Promise<boolean> };
    const saved = {
        pick: window.showQuickPick, info: window.showInformationMessage,
        warn: window.showWarningMessage, error: window.showErrorMessage,
        commands: holder.commands, set: manager.setCurrentTheme,
    };
    let shown: string[];
    let executed: string[];

    beforeEach(() => {
        shown = [];
        executed = [];
        window.showQuickPick = async (items: unknown) => (items as unknown[])[0];
        window.showInformationMessage = (m: string) => { shown.push(`info:${m}`); };
        window.showWarningMessage = (m: string) => { shown.push(`warn:${m}`); };
        window.showErrorMessage = (m: string) => { shown.push(`error:${m}`); };
        holder.commands = { executeCommand: async (c: string) => { executed.push(c); } };
    });

    afterEach(() => {
        window.showQuickPick = saved.pick;
        window.showInformationMessage = saved.info;
        window.showWarningMessage = saved.warn;
        window.showErrorMessage = saved.error;
        holder.commands = saved.commands;
        manager.setCurrentTheme = saved.set;
    });

    it('announces a saved theme and refreshes the preview', async () => {
        manager.setCurrentTheme = async () => true;
        await changeThemeCommand();
        assert.ok(shown[0].startsWith('info:C4X theme changed to'), shown[0]);
        assert.deepStrictEqual(executed, ['c4x.refreshPreview']);
    });

    it('warns and still refreshes when a narrower setting overrides the choice', async () => {
        manager.setCurrentTheme = async () => { throw new ThemeNotEffectiveError('muted', 'modern'); };
        await changeThemeCommand();
        assert.ok(shown[0].startsWith('warn:') && shown[0].includes('modern'), shown[0]);
        assert.deepStrictEqual(executed, ['c4x.refreshPreview']);
    });

    it('reports a rejection that is not an Error by its text', async () => {
        manager.setCurrentTheme = async () => { throw 'locked'; };
        await changeThemeCommand();
        assert.deepStrictEqual(shown, ['error:Could not save the C4X theme: locked']);
        assert.deepStrictEqual(executed, []);
    });

    it('reports a false result as a failure without refreshing', async () => {
        manager.setCurrentTheme = async () => false;
        await changeThemeCommand();
        assert.ok(shown[0].startsWith('error:Failed to apply theme'), shown[0]);
        assert.deepStrictEqual(executed, []);
    });

    it('does nothing when the picker is cancelled', async () => {
        window.showQuickPick = async () => undefined;
        await changeThemeCommand();
        assert.deepStrictEqual(shown, []);
    });
});
