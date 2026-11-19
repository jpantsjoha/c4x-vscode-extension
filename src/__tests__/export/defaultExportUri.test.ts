/**
 * Default save location for SVG, PNG and HTML export (#435).
 *
 * Before the fix the SVG command passed the absolute path of the active
 * document as the suggested name and the exporter joined it to the workspace
 * root, so the save dialog opened on `<workspace>/<absolute path>/x.svg`, a folder
 * that does not exist. Each exporter is driven through its public export()
 * and the `defaultUri` handed to the save dialog is asserted.
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
import * as path from 'path';
import * as vscodeMock from '../__mocks__/vscode';
import { SvgExporter } from '../../export/SvgExporter';
import { PngExporter, RESOLUTION_OPTIONS } from '../../export/PngExporter';
import { HtmlExporter } from '../../export/HtmlExporter';
import { themeManager } from '../../themes/ThemeManager';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = vscodeMock as any;
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
const WORKSPACE = '/work/space';

const doc = (fsPath: string) => ({ document: { fileName: fsPath, uri: { scheme: 'file', fsPath } } });

describe('export default save location (#435)', () => {
    const saved: Record<string, any> = {};
    let defaultUri: { fsPath: string } | undefined;

    beforeEach(() => {
        for (const key of ['showSaveDialog', 'showQuickPick', 'showInformationMessage', 'showErrorMessage', 'activeTextEditor', 'withProgress']) {
            saved[`window.${key}`] = mock.window[key];
        }
        saved.joinPath = mock.Uri.joinPath;
        saved.fs = mock.workspace.fs;
        saved.folders = mock.workspace.workspaceFolders;
        defaultUri = undefined;
        mock.Uri.joinPath = (base: { fsPath: string }, ...names: string[]) => ({ fsPath: path.join(base.fsPath, ...names) });
        // Cancel at the dialog: only the suggestion is under test.
        mock.window.showSaveDialog = async (options: { defaultUri?: { fsPath: string } }) => {
            defaultUri = options.defaultUri;
            return undefined;
        };
        mock.window.showQuickPick = async () => RESOLUTION_OPTIONS[0];
        mock.window.showInformationMessage = async () => undefined;
        mock.window.showErrorMessage = async () => undefined;
        mock.window.activeTextEditor = undefined;
        mock.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: WORKSPACE } }];
        mock.workspace.fs = { ...saved.fs, readFile: async () => Buffer.from('# x', 'utf8') };
    });

    afterEach(() => {
        for (const key of Object.keys(saved)) {
            if (key.startsWith('window.')) {
                mock.window[key.slice('window.'.length)] = saved[key];
            }
        }
        mock.Uri.joinPath = saved.joinPath;
        mock.workspace.fs = saved.fs;
        mock.workspace.workspaceFolders = saved.folders;
    });

    const svgSuggestion = async () => {
        await new SvgExporter().export(SVG, themeManager.getCurrentTheme());
        return defaultUri?.fsPath;
    };
    const pngSuggestion = async () => {
        await new PngExporter().export(SVG, themeManager.getCurrentTheme());
        return defaultUri?.fsPath;
    };

    for (const [format, suggest] of [['SVG', svgSuggestion], ['PNG', pngSuggestion]] as const) {
        const ext = format.toLowerCase();
        describe(format, () => {
            it('suggests the source folder when a .c4x file in a subfolder is active', async () => {
                mock.window.activeTextEditor = doc(`${WORKSPACE}/docs/arch/shop.c4x`);
                assert.strictEqual(await suggest(), `${WORKSPACE}/docs/arch/shop.${ext}`);
            });

            it('suggests the Markdown file folder when a Markdown file is active', async () => {
                mock.window.activeTextEditor = doc(`${WORKSPACE}/notes/readme.md`);
                assert.strictEqual(await suggest(), `${WORKSPACE}/notes/readme.${ext}`);
            });

            it('suggests the source folder when the source is outside the workspace', async () => {
                mock.window.activeTextEditor = doc(`/elsewhere/proj/shop.c4x`);
                assert.strictEqual(await suggest(), `/elsewhere/proj/shop.${ext}`);
            });

            it('falls back to diagram.<ext> in the workspace root with no active editor', async () => {
                assert.strictEqual(await suggest(), `${WORKSPACE}/diagram.${ext}`);
            });

            it('leaves the default to VS Code with no editor and no workspace folder', async () => {
                mock.workspace.workspaceFolders = undefined;
                assert.strictEqual(await suggest(), undefined);
            });

            it('never nests an absolute path under the workspace root', async () => {
                mock.window.activeTextEditor = doc(`/elsewhere/proj/shop.c4x`);
                const suggested = await suggest();
                assert.ok(!suggested?.startsWith(WORKSPACE), `got ${suggested}`);
            });
        });
    }

    describe('SVG, caller-supplied name', () => {
        it('uses only the basename of an absolute suggested name', async () => {
            mock.window.activeTextEditor = doc(`${WORKSPACE}/a/shop.c4x`);
            await new SvgExporter().export(SVG, themeManager.getCurrentTheme(), `${WORKSPACE}/a/shop.svg`);
            assert.strictEqual(defaultUri?.fsPath, `${WORKSPACE}/a/shop.svg`);
        });
    });

    describe('HTML', () => {
        it('suggests the folder of the Markdown file being exported', async () => {
            mock.window.activeTextEditor = doc(`${WORKSPACE}/other/unrelated.c4x`);
            await new HtmlExporter().export({ scheme: 'file', fsPath: `${WORKSPACE}/docs/shop.md` } as any);
            assert.strictEqual(defaultUri?.fsPath, `${WORKSPACE}/docs/shop.html`);
        });
    });
});
