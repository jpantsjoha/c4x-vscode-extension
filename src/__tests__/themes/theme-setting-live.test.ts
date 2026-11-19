/**
 * A changed `c4x.theme` setting applies without a reload (#390). The manager
 * reads the effective configuration and never writes it.
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

describe('c4x.theme setting applies live (#390)', () => {
    const workspace = vscode.workspace as unknown as { getConfiguration: (...a: unknown[]) => unknown };
    const originalGetConfiguration = workspace.getConfiguration;
    let updates: unknown[][];
    let watch: { dispose(): void };
    let savedForce: string | undefined;

    beforeEach(() => {
        savedForce = process.env.C4X_FORCE_THEME;
        delete process.env.C4X_FORCE_THEME;
        updates = [];
        const base = originalGetConfiguration as (...a: unknown[]) => { get: (k: string, d?: unknown) => unknown };
        workspace.getConfiguration = (...a: unknown[]) => ({
            ...base(...a),
            update: async (...args: unknown[]) => { updates.push(args); },
        });
        vscode.setConfigurationValueForTests('c4x.theme', 'classic');
        watch = ThemeManager.getInstance().watchConfiguration();
        vscode.fireConfigurationChangeForTests('c4x.theme');
    });

    afterEach(() => {
        watch.dispose();
        vscode.setConfigurationValueForTests('c4x.theme', undefined);
        workspace.getConfiguration = originalGetConfiguration;
        if (savedForce !== undefined) { process.env.C4X_FORCE_THEME = savedForce; }
    });

    const change = (value: unknown): void => {
        vscode.setConfigurationValueForTests('c4x.theme', value);
        vscode.fireConfigurationChangeForTests('c4x.theme');
    };

    it('a new valid value changes the current theme', () => {
        change('muted');
        assert.strictEqual(ThemeManager.getInstance().getCurrentTheme().name, 'muted');
    });

    it('an unknown value falls back to classic', () => {
        change('muted');
        change('no-such-theme');
        assert.strictEqual(ThemeManager.getInstance().getCurrentTheme().name, 'classic');
    });

    it('never writes a setting', () => {
        change('modern');
        change('bogus');
        assert.deepStrictEqual(updates, []);
    });

    it('ignores changes to other settings', () => {
        vscode.setConfigurationValueForTests('c4x.theme', 'modern');
        vscode.fireConfigurationChangeForTests('c4x.lint');
        assert.strictEqual(ThemeManager.getInstance().getCurrentTheme().name, 'classic');
    });

    it('C4X_FORCE_THEME still wins', () => {
        process.env.C4X_FORCE_THEME = 'high-contrast';
        change('muted');
        assert.strictEqual(ThemeManager.getInstance().getCurrentTheme().name, 'high-contrast');
    });

    it('stops following once disposed', () => {
        watch.dispose();
        change('muted');
        assert.strictEqual(ThemeManager.getInstance().getCurrentTheme().name, 'classic');
    });
});
