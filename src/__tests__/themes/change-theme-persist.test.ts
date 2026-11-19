/**
 * Change Theme saves to the right scope and stays consistent when the write
 * fails (#399).
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
import { ThemeManager } from '../../themes/ThemeManager';
import { changeThemeCommand } from '../../commands/changeTheme';

describe('Change Theme persistence (#399)', () => {
    const workspace = vscode.workspace as unknown as {
        getConfiguration: (...a: unknown[]) => unknown;
        workspaceFolders: unknown;
        workspaceFile: unknown;
    };
    const window = vscode.window as unknown as Record<string, unknown>;
    const originalGetConfiguration = workspace.getConfiguration;
    const originalQuickPick = window.showQuickPick;
    const originalError = window.showErrorMessage;
    let updates: unknown[][];
    let failWith: Error | undefined;
    let errors: string[];
    let watch: { dispose(): void };
    let savedForce: string | undefined;

    beforeEach(() => {
        savedForce = process.env.C4X_FORCE_THEME;
        delete process.env.C4X_FORCE_THEME;
        updates = [];
        errors = [];
        failWith = undefined;
        const base = originalGetConfiguration as (...a: unknown[]) => object;
        workspace.getConfiguration = (...a: unknown[]) => ({
            ...base(...a),
            update: async (...args: unknown[]) => {
                if (failWith) { throw failWith; }
                updates.push(args);
                // Like VS Code: a successful write fires the change event.
                vscode.setConfigurationValueForTests('c4x.theme', args[1]);
                vscode.fireConfigurationChangeForTests('c4x.theme');
            },
        });
        window.showErrorMessage = (m: string) => { errors.push(m); };
        vscode.setConfigurationValueForTests('c4x.theme', 'classic');
        watch = ThemeManager.getInstance().watchConfiguration();
        vscode.fireConfigurationChangeForTests('c4x.theme');
    });

    afterEach(() => {
        watch.dispose();
        vscode.setConfigurationValueForTests('c4x.theme', undefined);
        workspace.getConfiguration = originalGetConfiguration;
        workspace.workspaceFolders = undefined;
        workspace.workspaceFile = undefined;
        window.showQuickPick = originalQuickPick;
        window.showErrorMessage = originalError;
        if (savedForce !== undefined) { process.env.C4X_FORCE_THEME = savedForce; }
    });

    const current = (): string => ThemeManager.getInstance().getCurrentTheme().name;

    it('no workspace folder: writes Global and applies the theme', async () => {
        workspace.workspaceFolders = undefined;
        assert.strictEqual(await ThemeManager.getInstance().setCurrentTheme('muted'), true);
        assert.deepStrictEqual(updates, [['c4x.theme', 'muted', vscode.ConfigurationTarget.Global]]);
        assert.strictEqual(current(), 'muted');
    });

    it('workspace open: writes Workspace as before', async () => {
        workspace.workspaceFolders = [{ uri: { fsPath: '/w' } }];
        await ThemeManager.getInstance().setCurrentTheme('modern');
        assert.deepStrictEqual(updates, [['c4x.theme', 'modern', vscode.ConfigurationTarget.Workspace]]);
        assert.strictEqual(current(), 'modern');
    });

    it('rejected write: error shown with the reason, theme unchanged', async () => {
        failWith = new Error('cannot write settings');
        window.showQuickPick = async (items: unknown) => (items as unknown[]).find(
            i => (i as { themeName: string }).themeName === 'muted');
        await changeThemeCommand();
        assert.strictEqual(errors.length, 1);
        assert.ok(errors[0].includes('cannot write settings'), errors[0]);
        assert.strictEqual(current(), 'classic');
    });

    it('the watcher re-reads the written value once and does not write', async () => {
        await ThemeManager.getInstance().setCurrentTheme('high-contrast');
        assert.strictEqual(updates.length, 1);
        assert.strictEqual(current(), 'high-contrast');
    });

    it('empty saved workspace (no folders, workspaceFile set) writes Workspace', async () => {
        workspace.workspaceFolders = [];
        workspace.workspaceFile = { fsPath: '/w.code-workspace' };
        await ThemeManager.getInstance().setCurrentTheme('muted');
        assert.deepStrictEqual(updates, [['c4x.theme', 'muted', vscode.ConfigurationTarget.Workspace]]);
    });

    it('a narrower override shadowing the write is reported, in-memory equals effective', async () => {
        workspace.workspaceFolders = [];
        workspace.workspaceFile = { fsPath: '/w.code-workspace' };
        const base = workspace.getConfiguration;
        workspace.getConfiguration = (...a: unknown[]) => ({
            ...(base(...a) as object),
            update: async () => { /* write lands but the effective value stays modern */ },
            inspect: () => ({ workspaceFolderValue: 'modern' }),
        });
        vscode.setConfigurationValueForTests('c4x.theme', 'modern');
        vscode.fireConfigurationChangeForTests('c4x.theme');
        await assert.rejects(ThemeManager.getInstance().setCurrentTheme('muted'),
            (e: Error) => e.name === 'ThemeNotEffectiveError' && e.message.includes('modern'));
        assert.strictEqual(current(), 'modern');
    });

    it('rejection reconciles from the effective setting, not a captured value', async () => {
        let reject!: (e: Error) => void;
        const base = workspace.getConfiguration;
        workspace.getConfiguration = (...a: unknown[]) => ({
            ...(base(...a) as object),
            update: () => new Promise<void>((_r, rej) => { reject = rej; }),
        });
        const pending = ThemeManager.getInstance().setCurrentTheme('muted');
        vscode.setConfigurationValueForTests('c4x.theme', 'modern');
        vscode.fireConfigurationChangeForTests('c4x.theme');
        assert.strictEqual(current(), 'modern');
        reject(new Error('denied'));
        await assert.rejects(pending, /denied/);
        assert.strictEqual(current(), 'modern');
    });

    it('one change event reads the setting once', () => {
        const base = workspace.getConfiguration;
        let reads = 0;
        workspace.getConfiguration = (...a: unknown[]) => {
            const c = base(...a) as { get: (k: string, d?: unknown) => unknown };
            return { ...c, get: (k: string, d?: unknown) => { if (k === 'c4x.theme') { reads++; } return c.get(k, d); } };
        };
        vscode.setConfigurationValueForTests('c4x.theme', 'modern');
        vscode.fireConfigurationChangeForTests('c4x.theme');
        assert.strictEqual(reads, 1);
    });

    it('three overlapping successful writes: no unhandled rejection, last choice wins, no warning', async () => {
        const unhandled: unknown[] = [];
        const onUnhandled = (e: unknown): void => { unhandled.push(e); };
        process.on('unhandledRejection', onUnhandled);
        const warnings: string[] = [];
        const originalWarning = window.showWarningMessage;
        window.showWarningMessage = (m: string) => { warnings.push(m); };
        try {
            workspace.workspaceFolders = [{ uri: { fsPath: '/w' } }];
            const m = ThemeManager.getInstance();
            const pending = [m.setCurrentTheme('modern'), m.setCurrentTheme('muted'), m.setCurrentTheme('high-contrast')];
            await Promise.all(pending);
            await new Promise(r => setImmediate(r));
            assert.deepStrictEqual(unhandled, []);
            assert.deepStrictEqual(warnings, []);
            assert.strictEqual(current(), 'high-contrast');
        } finally {
            process.removeListener('unhandledRejection', onUnhandled);
            window.showWarningMessage = originalWarning;
        }
    });
});
