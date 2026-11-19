import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { ThemeManager } from '../../src/themes/ThemeManager';

/**
 * Upgrade compatibility (#366), the parts that need a live VS Code: a 1.8.0
 * user's settings reach the extension and resolve to what they had, activation
 * writes nothing to their settings, and every 1.8.0 command is still registered.
 * Pure parts (drafts, sidecar, state names, manifest) are in
 * src/__tests__/upgrade/upgrade-1.8.0.test.ts. Fixtures: test/fixtures/upgrade-1.8.0.
 */
const FIXTURES = path.resolve(__dirname, '..', '..', '..', 'test', 'fixtures', 'upgrade-1.8.0');
const fixture = (name: string): any => JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any

type ManagerHolder = { instance: ThemeManager | undefined };

describe('Upgrade from 1.8.0 (#366)', function () {
    this.timeout(30000);

    describe('a. c4x.theme', () => {
        const holder = ThemeManager as unknown as ManagerHolder;
        const settings = fixture('settings.json')['c4x.theme'];
        let savedInstance: ThemeManager | undefined;
        let savedForce: string | undefined;
        let savedWorkspace: unknown;

        before(() => {
            // The suite pins C4X_FORCE_THEME for determinism; a real upgrade has none.
            savedForce = process.env.C4X_FORCE_THEME;
            delete process.env.C4X_FORCE_THEME;
            savedInstance = holder.instance;
            savedWorkspace = vscode.workspace.getConfiguration('c4x').inspect('theme')?.workspaceValue;
        });

        after(async () => {
            if (savedForce !== undefined) { process.env.C4X_FORCE_THEME = savedForce; }
            holder.instance = savedInstance;
            await vscode.workspace.getConfiguration('c4x').update('theme', savedWorkspace, vscode.ConfigurationTarget.Workspace);
        });

        const cases: Array<[string, string]> = [
            ...(settings.enumAt180 as string[]).map((v): [string, string] => [v, v]),
            ...(settings.pickerOnlyAt180 as string[]).map((v): [string, string] => [v, v]),
            [settings.unknown as string, 'classic'],
        ];

        for (const [stored, expected] of cases) {
            it(`a 1.8.0 workspace holding "${stored}" resolves to ${expected}, and starting up writes no setting`, async () => {
                await vscode.workspace.getConfiguration('c4x').update('theme', stored, vscode.ConfigurationTarget.Workspace); // where Change Theme wrote it in 1.8.0
                const before = JSON.stringify(vscode.workspace.getConfiguration('c4x').inspect('theme'));
                const changes: string[] = [];
                const listener = vscode.workspace.onDidChangeConfiguration(e => {
                    if (e.affectsConfiguration('c4x')) { changes.push('c4x'); }
                });
                try {
                    holder.instance = undefined;
                    const fresh = ThemeManager.getInstance();
                    const name = fresh.getCurrentTheme().name;
                    assert.ok(expected === 'auto' ? name.startsWith('auto') : name === expected,
                        `"${stored}" resolved to "${name}", expected "${expected}"`);
                    await new Promise(resolve => setTimeout(resolve, 150));
                } finally {
                    listener.dispose();
                }
                assert.deepStrictEqual(changes, [], 'no configuration change during startup');
                assert.strictEqual(JSON.stringify(vscode.workspace.getConfiguration('c4x').inspect('theme')), before,
                    'the stored value is untouched');
            });
        }
    });

    describe('e. commands and settings in the running extension', () => {
        it('every command 1.8.0 registered is still registered', async () => {
            const registered = new Set(await vscode.commands.getCommands(true));
            const missing = (fixture('manifest-contributes.json').registeredCommands as string[]).filter(id => !registered.has(id));
            assert.deepStrictEqual(missing, []);
        });

        it('every 1.8.0 setting key is known to VS Code with the 1.8.0 default', () => {
            const config = vscode.workspace.getConfiguration();
            for (const [key, was] of Object.entries<any>(fixture('manifest-contributes.json').settings)) { // eslint-disable-line @typescript-eslint/no-explicit-any
                const info = config.inspect(key);
                assert.ok(info, `${key} is not a known setting`);
                assert.deepStrictEqual(info.defaultValue, was.default, `${key} default`);
            }
        });

        it('values a 1.8.0 user holds for lint, canvas, layout, legend and AI settings are accepted and read back', async () => {
            const held = fixture('settings.json');
            const config = vscode.workspace.getConfiguration();
            const keys = Object.keys(held).filter(k => k.startsWith('c4x.') && k !== 'c4x.theme');
            const previous = new Map(keys.map(k => [k, config.inspect(k)?.globalValue]));
            try {
                for (const key of keys) {
                    await config.update(key, held[key], vscode.ConfigurationTarget.Global);
                }
                for (const key of keys) {
                    assert.deepStrictEqual(vscode.workspace.getConfiguration().get(key), held[key], key);
                }
            } finally {
                for (const [key, value] of previous) {
                    await config.update(key, value, vscode.ConfigurationTarget.Global);
                }
            }
        });
    });
});
