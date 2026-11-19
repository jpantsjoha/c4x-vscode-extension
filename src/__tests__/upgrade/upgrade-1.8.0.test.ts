/**
 * Upgrade compatibility (#366): what a 1.8.0 user already has must survive the
 * update. Fixtures under test/fixtures/upgrade-1.8.0 are what the 1.8.0 code
 * wrote (see the README there); nothing here is generated from current code.
 *
 * Settings and theme resolution against a live VS Code are proven in
 * test/suite/upgrade-1.8.0.test.ts. This file covers the pure parts: drafts,
 * the layout sidecar, persisted state names, secret names and the manifest.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';

// GeminiService and SidecarPersistence import vscode; resolve it to the unit mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import type * as vscode from 'vscode';
import { GeminiService } from '../../ai/GeminiService';
import { dropInvalidPersistedAdds, isPersistedAddRelationshipList, isPersistedDraftState } from '../../webview/draftState';
import { loadBinding, saveBinding } from '../../webview/editorBinding';
import {
    migrateLegacyDraftState,
    pickPersistedEditFields,
    PREVIEW_CLIENT_SCRIPT,
} from '../../webview/previewClientScript';
import { loadSidecarLayout, saveSidecarLayout, type SidecarPersistenceBoundary } from '../../writeback/SidecarPersistence';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(ROOT, 'test', 'fixtures', 'upgrade-1.8.0');
const readJson = (rel: string): any => JSON.parse(fs.readFileSync(path.join(FIXTURES, rel), 'utf8')); // eslint-disable-line @typescript-eslint/no-explicit-any
const readText = (rel: string): string => fs.readFileSync(path.join(FIXTURES, rel), 'utf8');

describe('upgrade from 1.8.0 (#366)', () => {
    describe('b. a persisted draft', () => {
        const fixtureText = readText('draft-state.json');
        const draft = JSON.parse(fixtureText);

        it('is the 1.8.0 shape: schema 1, no source identity', () => {
            assert.strictEqual(draft.schemaVersion, 1);
            assert.strictEqual(draft.scope, undefined);
            assert.ok(draft.stagedEdits.length >= 2);
        });

        it('is not valid as it stands, so it is never attached by the normal restore path', () => {
            assert.strictEqual(isPersistedDraftState(draft), false);
        });

        /** Runs the real on-load block of the embedded webview script against the fixture. */
        function runOnLoad(state: unknown): {
            legacyDraft: unknown; pendingRestoreState: unknown; restoreDroppedAdds: number;
            setStateCalls: unknown[]; posted: unknown[];
        } {
            const begin = PREVIEW_CLIENT_SCRIPT.indexOf('// ── On load: pick up any persisted draft from before reload');
            assert.ok(begin >= 0, 'on-load marker moved: update this test with it');
            const tail = PREVIEW_CLIENT_SCRIPT.slice(begin);
            const end = tail.indexOf("vscode.postMessage({ type: 'ready' });");
            assert.ok(end > 0);
            const block = tail.slice(0, end + "vscode.postMessage({ type: 'ready' });".length);
            const setStateCalls: unknown[] = [];
            const posted: unknown[] = [];
            const sandbox: Record<string, unknown> = {
                vscode: {
                    getState: () => state,
                    setState: (value: unknown) => { setStateCalls.push(value); },
                    postMessage: (message: unknown) => { posted.push(message); },
                },
                dropInvalidPersistedAdds, isPersistedAddRelationshipList, migrateLegacyDraftState, pickPersistedEditFields,
                isValidPersistedDraftState: isPersistedDraftState,
                legacyDraft: null, pendingRestoreState: null, restoreDroppedAdds: 0,
            };
            vm.createContext(sandbox);
            vm.runInContext(block, sandbox);
            return {
                legacyDraft: sandbox.legacyDraft, pendingRestoreState: sandbox.pendingRestoreState,
                restoreDroppedAdds: sandbox.restoreDroppedAdds as number, setStateCalls, posted,
            };
        }

        it('is held as a legacy draft on load: not attached, nothing dropped, nothing written or deleted', () => {
            const result = runOnLoad(JSON.parse(fixtureText));
            assert.strictEqual(JSON.stringify(result.legacyDraft), JSON.stringify(draft), 'held unchanged for the explicit choice');
            assert.strictEqual(result.pendingRestoreState, null, 'not attached silently');
            assert.strictEqual(result.restoreDroppedAdds, 0, 'no staged relationship is dropped');
            assert.strictEqual(result.setStateCalls.length, 0, 'the stored draft is neither overwritten nor cleared');
            assert.strictEqual(JSON.stringify(result.posted), JSON.stringify([{ type: 'ready' }]));
        });

        it('offers an explicit restore and an explicit discard, and only discard clears the stored draft', () => {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes("'Restore legacy draft here'"));
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes("'Discard legacy draft'"));
            const discard = PREVIEW_CLIENT_SCRIPT.slice(PREVIEW_CLIENT_SCRIPT.indexOf("discardButton.textContent = 'Discard legacy draft'"));
            assert.ok(/discardButton\.addEventListener\('click'[\s\S]{0,200}vscode\.setState\(undefined\)/.test(discard));
            const restore = PREVIEW_CLIENT_SCRIPT.slice(
                PREVIEW_CLIENT_SCRIPT.indexOf("restoreButton.textContent = 'Restore legacy draft here'"),
                PREVIEW_CLIENT_SCRIPT.indexOf("discardButton.textContent = 'Discard legacy draft'"),
            );
            assert.ok(!restore.includes('setState(undefined)'), 'restore never deletes the stored draft');
        });

        it('restores on request with every staged change and the camera, and leaves the stored record untouched', () => {
            const before = JSON.stringify(draft);
            const scope = 'file:///workspace/diagrams/architecture.c4x';
            const restored = migrateLegacyDraftState(draft, scope, pickPersistedEditFields) as Record<string, unknown>;
            assert.strictEqual(isPersistedDraftState(restored), true);
            assert.strictEqual(restored.schemaVersion, 2);
            assert.strictEqual(restored.scope, scope);
            assert.deepStrictEqual(restored.stagedEdits, draft.stagedEdits, 'moves, properties and connect relationships survive');
            for (const key of ['editMode', 'selectedNodeId', 'zoom', 'panX', 'panY']) {
                assert.strictEqual(restored[key], draft[key], key);
            }
            assert.strictEqual(JSON.stringify(draft), before);
            const kept = dropInvalidPersistedAdds(draft, isPersistedAddRelationshipList);
            assert.strictEqual(kept.dropped, 0);
        });
    });

    describe('c. the layout sidecar', () => {
        const sidecarPath = '/workspace/.c4x-layout.json';
        const fixtureText = readText('sidecar/.c4x-layout.json');
        const arch = { fsPath: '/workspace/diagrams/architecture.c4x', scheme: 'file' };
        const other = { fsPath: '/workspace/other.c4x', scheme: 'file' };
        const root = { fsPath: '/workspace', scheme: 'file' };
        let files: Map<string, string>;

        const boundary = (): SidecarPersistenceBoundary => ({
            getWorkspaceFolder: () => ({ uri: root }),
            getWorkspaceFolders: () => [{ uri: root }],
            readFile: async uri => {
                const text = files.get(uri.fsPath);
                if (text === undefined) { throw new Error('ENOENT'); }
                return new TextEncoder().encode(text);
            },
            writeFile: async (uri, bytes) => { files.set(uri.fsPath, new TextDecoder().decode(bytes)); },
            deleteFile: async uri => { files.delete(uri.fsPath); },
            joinPath: (base, ...parts) => ({ fsPath: path.join(base.fsPath, ...parts), scheme: 'file' }),
            file: p => ({ fsPath: p, scheme: 'file' }),
            getWorkingDirectory: () => '/workspace',
        });

        beforeEach(() => { files = new Map([[sidecarPath, fixtureText]]); });

        it('reads the same positions for each diagram', async () => {
            assert.deepStrictEqual(await loadSidecarLayout(arch as vscode.Uri, boundary()), {
                api: { locked: true, x: 300, y: 80.1 },
                db: { x: 300, y: 240 },
                web: { x: 120.46, y: 80 },
            });
            assert.deepStrictEqual(await loadSidecarLayout(other as vscode.Uri, boundary()), { solo: { x: 10, y: 20 } });
        });

        it('saving one element rewrites no other entry, including a locked one', async () => {
            await saveSidecarLayout(arch as vscode.Uri, 'web', 140, 95, boundary());
            const after = JSON.parse(files.get(sidecarPath) as string);
            const before = JSON.parse(fixtureText);
            assert.deepStrictEqual(after.layouts['diagrams/architecture.c4x'].elements.web, { x: 140, y: 95 });
            after.layouts['diagrams/architecture.c4x'].elements.web = before.layouts['diagrams/architecture.c4x'].elements.web;
            assert.deepStrictEqual(after, before, 'every other entry, $schema and version are unchanged');
        });

        it('saving a position the file already holds leaves the file byte for byte as 1.8.0 wrote it', async () => {
            await saveSidecarLayout(arch as vscode.Uri, 'api', 300, 80.1, boundary());
            await saveSidecarLayout(other as vscode.Uri, 'solo', 10, 20, boundary());
            assert.strictEqual(files.get(sidecarPath), fixtureText);
        });
    });

    describe('d. secrets and persisted state names', () => {
        const names = readJson('secret-storage.json');

        it('the Gemini key is read from, and written to, the SecretStorage name 1.8.0 used', async () => {
            const [name] = names.secretKeys as string[];
            const written: string[] = [];
            const stored = new Map<string, string>([[name, 'AIza-from-1.8.0']]);
            const context = {
                secrets: {
                    get: async (key: string) => stored.get(key),
                    store: async (key: string, value: string) => { written.push(key); stored.set(key, value); },
                },
                extensionUri: {},
            } as unknown as vscode.ExtensionContext;
            const service = new GeminiService(context);
            assert.strictEqual(await service.checkReady(), true, 'a key stored by 1.8.0 is found');
            await service.saveKey('AIza-new');
            assert.deepStrictEqual([...new Set(written)], [name]);
        });

        it('the panel binding keeps its Memento key and reads what 1.8.0 stored', async () => {
            const state = readJson('workspace-state.json');
            const [key] = names.persistedMementoKeys as string[];
            assert.deepStrictEqual(Object.keys(state.native), [key]);
            const store = (value: unknown) => ({ get: <T>(k: string) => (k === key ? value as T : undefined), update: async () => undefined });
            assert.deepStrictEqual(loadBinding(store(state.native[key])), state.native[key]);
            assert.deepStrictEqual(loadBinding(store(state.markdown[key])), state.markdown[key]);
            const recorded: Record<string, unknown> = {};
            await saveBinding({ get: () => undefined, update: async (k, v) => { recorded[k] = v; } }, state.markdown[key]);
            assert.deepStrictEqual(recorded, state.markdown, 'written under the same key and shape');
        });

        /** Every non-test source file under src, as [relative path, text]. */
        function sourceFiles(): Array<[string, string]> {
            const out: Array<[string, string]> = [];
            const walk = (dir: string): void => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name !== '__tests__') { walk(full); }
                    } else if (full.endsWith('.ts')) {
                        out.push([path.relative(path.join(ROOT, 'src'), full).split(path.sep).join('/'), fs.readFileSync(full, 'utf8')]);
                    }
                }
            };
            walk(path.join(ROOT, 'src'));
            return out;
        }

        it('the SecretStorage names in source are exactly the 1.8.0 names', () => {
            const found = new Set<string>();
            for (const [, text] of sourceFiles()) {
                for (const m of text.matchAll(/secrets\s*\.\s*(?:get|store|delete)\(\s*([^,)]+)/g)) { found.add(m[1].trim()); }
            }
            assert.deepStrictEqual([...found].sort(), (names.secretKeys as string[]).map(k => `'${k}'`).sort());
        });

        it('Memento state is reached only through the panel binding, under the one 1.8.0 key', () => {
            const users = sourceFiles().filter(([, text]) => /\b(?:workspaceState|globalState)\b|\bMemento\b/.test(text)).map(([file]) => file).sort();
            assert.deepStrictEqual(users, ['webview/PreviewPanel.ts', 'webview/editorBinding.ts']);
            const panel = sourceFiles().find(([file]) => file === 'webview/PreviewPanel.ts')![1];
            const direct = [...panel.matchAll(/(?:workspaceState|globalState)\s*\.\s*(?:update|get|keys)\b/g)];
            assert.deepStrictEqual(direct, [], 'PreviewPanel hands workspaceState to the binding functions only');
            const binding = sourceFiles().find(([file]) => file === 'webview/editorBinding.ts')![1];
            const keys = [...binding.matchAll(/store\s*\.\s*(?:get|update)(?:<[^>]*>)?\(\s*([^,)]+)/g)].map(m => m[1].trim());
            assert.ok(keys.length >= 3);
            assert.deepStrictEqual([...new Set(keys)], ['BINDING_KEY']);
            assert.ok(binding.includes(`const BINDING_KEY = '${(names.persistedMementoKeys as string[])[0]}'`));
        });

        it('the extension asks VS Code for no storage folder, so it keeps no cache file of its own there', () => {
            // Proven: no storageUri, globalStorageUri or storagePath use. Not proven: writes to
            // other paths (exports, sidecar, user-chosen files) are product features, not caches.
            const users = sourceFiles().filter(([, text]) => /storageUri|globalStorageUri|storagePath|globalStoragePath/.test(text)).map(([file]) => file);
            assert.deepStrictEqual(users, []);
        });
    });

    describe('a. theme palettes (names are resolved against settings in the extension host suite)', () => {
        const old = readJson('themes.json');
        const current: Record<string, unknown> = {
            'c4-standard': C4StandardTheme, classic: ClassicTheme, modern: ModernTheme,
            muted: MutedTheme, 'high-contrast': HighContrastTheme,
        };
        const subset = (expected: unknown, actual: unknown, where: string): void => {
            if (expected !== null && typeof expected === 'object') {
                assert.ok(actual !== null && typeof actual === 'object', where);
                for (const [key, value] of Object.entries(expected as Record<string, unknown>)) {
                    subset(value, (actual as Record<string, unknown>)[key], `${where}.${key}`);
                }
            } else {
                assert.deepStrictEqual(actual, expected, where);
            }
        };
        for (const name of Object.keys(old)) {
            it(`${name} still draws with every colour and shape 1.8.0 gave it`, () => {
                const expected = { ...old[name] };
                delete expected.description;
                subset(expected, current[name], name);
            });
        }
    });

    describe('e. contributed ids and setting keys', () => {
        const old = readJson('manifest-contributes.json');
        const cur = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
        const contributes = cur.contributes;
        const props: Record<string, any> = Object.assign({}, ...[].concat(contributes.configuration).map((c: any) => c.properties)); // eslint-disable-line @typescript-eslint/no-explicit-any

        it('every 1.8.0 command id is still contributed', () => {
            const have = new Set((contributes.commands as Array<{ command: string }>).map(c => c.command));
            assert.deepStrictEqual((old.commands as string[]).filter(id => !have.has(id)), []);
        });

        it('every 1.8.0 registered command id is still registered in source, multi-line registrations included', () => {
            assert.strictEqual(old.registeredCommandCount, 19, 'the count at the tag, checked directly against its source');
            assert.strictEqual((old.registeredCommands as string[]).length, old.registeredCommandCount);
            const registered = new Set<string>();
            const walk = (dir: string): void => {
                for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                    const full = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        if (entry.name !== '__tests__') { walk(full); }
                    } else if (full.endsWith('.ts')) {
                        for (const m of fs.readFileSync(full, 'utf8').matchAll(/registerCommand\(\s*'([^']+)'/g)) { registered.add(m[1]); }
                    }
                }
            };
            walk(path.join(ROOT, 'src'));
            assert.deepStrictEqual((old.registeredCommands as string[]).filter(id => !registered.has(id)), []);
        });

        it('every 1.8.0 setting key is still contributed, with its type, default, enum values and range', () => {
            const problems: string[] = [];
            for (const [key, was] of Object.entries<any>(old.settings)) { // eslint-disable-line @typescript-eslint/no-explicit-any
                const now = props[key];
                if (!now) { problems.push(`${key}: removed`); continue; }
                if (now.type !== was.type) { problems.push(`${key}: type ${was.type} -> ${now.type}`); }
                if (JSON.stringify(now.default) !== JSON.stringify(was.default)) { problems.push(`${key}: default changed`); }
                for (const value of (was.enum ?? []) as unknown[]) {
                    if (!(now.enum ?? []).includes(value)) { problems.push(`${key}: enum value ${String(value)} removed`); }
                }
                if (was.minimum !== undefined && now.minimum > was.minimum) { problems.push(`${key}: minimum raised`); }
                if (was.maximum !== undefined && now.maximum < was.maximum) { problems.push(`${key}: maximum lowered`); }
            }
            assert.deepStrictEqual(problems, []);
        });

        it('the keybinding, language id, grammar scope and activation events are unchanged', () => {
            for (const kb of old.keybindings as Array<{ command: string; key: string; mac?: string; when?: string }>) {
                assert.ok((contributes.keybindings as Array<{ command: string; key: string; mac?: string; when?: string }>)
                    .some(k => k.command === kb.command && k.key === kb.key && k.mac === kb.mac && k.when === kb.when), kb.command);
            }
            const languages = (contributes.languages as Array<{ id: string }>).map(l => l.id);
            for (const id of old.languages as string[]) { assert.ok(languages.includes(id), id); }
            const scopes = (contributes.grammars as Array<{ scopeName: string }>).map(g => g.scopeName);
            for (const scope of old.grammars as string[]) { assert.ok(scopes.includes(scope), scope); }
            assert.deepStrictEqual(cur.activationEvents, old.activationEvents);
        });
    });
});
