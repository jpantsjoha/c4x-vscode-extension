/**
 * ThemeManager branches that depend on the environment: a forced theme, no
 * settings API, an unknown name, and the auto theme (#399).
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

describe('ThemeManager environment branches (#399)', () => {
    const holder = vscode as unknown as { workspace: unknown };
    const original = holder.workspace;
    const manager = ThemeManager.getInstance();
    let savedForce: string | undefined;

    beforeEach(() => { savedForce = process.env.C4X_FORCE_THEME; delete process.env.C4X_FORCE_THEME; });
    afterEach(() => {
        holder.workspace = original;
        if (savedForce !== undefined) { process.env.C4X_FORCE_THEME = savedForce; } else { delete process.env.C4X_FORCE_THEME; }
    });

    it('refuses an unknown theme name without saving', async () => {
        assert.strictEqual(await manager.setCurrentTheme('nope' as never), false);
    });

    it('applies a theme in memory when there is no settings API', async () => {
        holder.workspace = undefined;
        assert.strictEqual(await manager.setCurrentTheme('muted'), true);
        assert.strictEqual(manager.getCurrentTheme().name, 'muted');
        const watch = manager.watchConfiguration();
        assert.doesNotThrow(() => watch.dispose());
        await manager.setCurrentTheme('classic');
    });

    it('follows a forced theme from the environment', () => {
        process.env.C4X_FORCE_THEME = 'muted';
        const watch = manager.watchConfiguration();
        vscode.fireConfigurationChangeForTests('c4x.theme');
        assert.strictEqual(manager.getCurrentTheme().name, 'muted');
        watch.dispose();
        delete process.env.C4X_FORCE_THEME;
        const again = manager.watchConfiguration();
        vscode.setConfigurationValueForTests('c4x.theme', 'classic');
        vscode.fireConfigurationChangeForTests('c4x.theme');
        again.dispose();
    });

    it('keeps following the editor for the auto theme, in the editor and in exports', async () => {
        const base = original as { getConfiguration: (...a: unknown[]) => object };
        holder.workspace = { ...base, getConfiguration: (...a: unknown[]) => ({ ...base.getConfiguration(...a), update: async () => undefined }) };
        vscode.setConfigurationValueForTests('c4x.theme', 'classic');
        await manager.setCurrentTheme('auto');
        assert.ok(manager.getCurrentTheme().name.startsWith('auto'));
        assert.ok(manager.getExportTheme().name.startsWith('auto'));
        await manager.setCurrentTheme('classic');
    });
});
