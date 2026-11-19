/**
 * Theme setting reconciliation (#321).
 *
 * The package.json `c4x.theme` enum, the ThemeManager registry, the
 * `C4X: Change Theme` picker and the README theme count must agree. This test
 * fails when any of them diverges.
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
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { DEFAULT_THEME_NAME, THEME_NAMES, ThemeManager } from '../../themes/ThemeManager';
import { changeThemeCommand } from '../../commands/changeTheme';

const ROOT = path.resolve(__dirname, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const setting = manifest.contributes.configuration.properties['c4x.theme'];

async function pickerThemeNames(): Promise<string[]> {
    const win = vscode.window as unknown as { showQuickPick: (items: unknown) => Promise<unknown> };
    const original = win.showQuickPick;
    let captured: Array<{ themeName: string }> = [];
    win.showQuickPick = async (items: unknown) => {
        captured = items as Array<{ themeName: string }>;
        return undefined; // user cancels
    };
    try {
        await changeThemeCommand();
    } finally {
        win.showQuickPick = original;
    }
    return captured.map(item => item.themeName);
}

describe('theme setting reconciliation (#321)', () => {
    it('manifest enum matches the registry, in order', () => {
        assert.deepStrictEqual(setting.enum, [...THEME_NAMES]);
    });

    it('every enum value has a description', () => {
        assert.strictEqual(setting.enumDescriptions.length, setting.enum.length);
        for (const d of setting.enumDescriptions) {
            assert.ok(typeof d === 'string' && d.length > 0);
        }
    });

    it('getAllThemes returns one theme per registered name, in order', () => {
        assert.deepStrictEqual(ThemeManager.getAllThemes().map(t => t.name), [...THEME_NAMES]);
    });

    it('the Change Theme picker offers exactly the manifest enum', async () => {
        assert.deepStrictEqual(await pickerThemeNames(), setting.enum);
    });

    it('the manifest default is the code fallback, and is classic', () => {
        assert.strictEqual(setting.default, DEFAULT_THEME_NAME);
        assert.strictEqual(DEFAULT_THEME_NAME, 'classic');
        assert.ok(setting.enum.includes(setting.default));
    });

    it('README states the theme count', () => {
        const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
        const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
        const match = readme.match(/\b(\w+) themes\b/);
        assert.ok(match, 'README has no "<n> themes" statement');
        assert.strictEqual(match[1], words[setting.enum.length]);
    });
});
