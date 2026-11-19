import * as assert from 'assert';

// Mock vscode before importing modules that import it at module level.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as vscodeMock from '../__mocks__/vscode';
import { GenerateDiagramCommand } from '../../commands/GenerateDiagramCommand';
import { readGenerationProvider } from '../../ai/providerSetting';
import * as fs from 'fs';
import * as path from 'path';
import { LanguageModelChatMessage, stubChatModel } from '../__mocks__/languageModel';
import { GEMINI_CONFIRM_BUTTON } from '../../commands/GenerateDiagramCommand';
import { CodeContextExtractor } from '../../ai/CodeContextExtractor';
import { LM_API_MIN_VSCODE, LanguageModelUnavailableError, describeLanguageModelFailure } from '../../ai/providers/vscodeLanguageModel';

// `c4x.ai.provider` routes "Generate Diagram" (#392): `gemini` (the default)
// keeps today's path, key check first; `vscode-lm` never asks for a key.

function fakeContext() {
    return {
        secrets: { get: async () => undefined, store: async () => undefined, delete: async () => undefined },
        extensionUri: {},
        subscriptions: [],
    };
}

function editorWithSelection(text: string) {
    return {
        document: { getText: () => text, uri: { fsPath: '/ws/doc.md' } },
        selection: { isEmpty: false, active: 'cursor', end: 'end' },
        insertSnippet: async () => true,
    };
}

describe('generation provider routing (#392)', () => {
    const originalQuickPick = vscodeMock.window.showQuickPick;
    let quickPicks = 0;
    let readyChecks = 0;

    function command() {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const instance = new GenerateDiagramCommand(fakeContext() as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const service = (instance as any).geminiService;
        // Answering "ready" keeps the Gemini path from prompting for a key, and
        // its recommendation call returns the no-key fallback.
        service.checkReady = async () => { readyChecks++; return true; };
        return instance;
    }

    beforeEach(() => {
        quickPicks = 0;
        readyChecks = 0;
        vscodeMock.window.showQuickPick = async () => { quickPicks++; return undefined; };
    });
    afterEach(() => {
        vscodeMock.window.showQuickPick = originalQuickPick;
        vscodeMock.setConfigurationValueForTests('provider', undefined);
    });

    it('defaults to gemini; any value but vscode-lm means gemini', () => {
        assert.strictEqual(readGenerationProvider(), 'gemini');
        vscodeMock.setConfigurationValueForTests('provider', 'claude-code');
        assert.strictEqual(readGenerationProvider(), 'gemini');
        vscodeMock.setConfigurationValueForTests('provider', 'vscode-lm');
        assert.strictEqual(readGenerationProvider(), 'vscode-lm');
    });

    it('gemini (default): checks the key before anything else, as before', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await command().generateFromSelection(editorWithSelection('A shop') as any);
        assert.strictEqual(readyChecks, 1);
        assert.strictEqual(quickPicks, 1);
    });

    it('vscode-lm: never checks or asks for a Gemini key', async () => {
        vscodeMock.setConfigurationValueForTests('provider', 'vscode-lm');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await command().generateFromSelection(editorWithSelection('A shop') as any);
        assert.strictEqual(readyChecks, 0);
        assert.strictEqual(quickPicks, 1, 'the diagram type is still chosen from the list');
    });
    it('contributes c4x.ai.provider with default gemini, user (application) scope, and only gemini and vscode-lm', () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
        const properties = Object.assign({}, ...[].concat(manifest.contributes.configuration).map((section: { properties: object }) => section.properties));
        const provider = properties['c4x.ai.provider'];
        assert.strictEqual(provider.default, 'gemini');
        assert.strictEqual(provider.scope, 'application');
        assert.deepStrictEqual(provider.enum, ['gemini', 'vscode-lm']);
        for (const key of ['c4x.ai.vscodeLm.model', 'c4x.ai.vscodeLm.sendWorkspaceGuidelines']) {
            assert.strictEqual(properties[key].scope, 'application', key);
        }
        assert.strictEqual(properties['c4x.ai.vscodeLm.sendWorkspaceGuidelines'].default, false);
    });

    it('keeps the engines floor at 1.90 (a maintainer decision) and gates vscode-lm at run time, naming VS Code 1.91', () => {
        const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
        assert.strictEqual(manifest.engines.vscode, '^1.90.0');
        assert.strictEqual(LM_API_MIN_VSCODE, '1.91');
        assert.match(describeLanguageModelFailure(new LanguageModelUnavailableError('no-api')), /It needs VS Code 1\.91 or later\./);
    });

    describe('the shared folder scan, end to end through each provider (P1)', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const mock = vscodeMock as any;
        const added = ['lm', 'LanguageModelChatMessage', 'SnippetString', 'RelativePattern'];
        const savedWindow = { ...mock.window };
        const savedWorkspace = { ...mock.workspace, fs: { ...mock.workspace.fs } };
        const FOLDER = '/ws/services/shop';
        const DISK: Record<string, string> = {
            'src/app.ts': 'export const app = 1;',
            'notes.md': 'Plain notes.',
            'GEMINI.md': 'FOLDER GUIDELINES',
            'docs/EXAMPLES.md': 'FOLDER EXAMPLES',
            '.env': 'marker env file content',
            '.env.production': 'marker production env content',
            'deploy/server.key': 'KEY-FILE-SECRET',
            'config/settings.json': `{"aws": "${'AKIA' + 'ABCDEFGHIJKLMNOP'}"}`,
            // Built at run time so this file carries no literal key block.
            'certs/client.txt': ['-----BEGIN RSA', 'PRIVATE KEY-----\nPEM-BODY-SECRET\n-----END RSA', 'PRIVATE KEY-----'].join(' '),
        };
        const SECRETS = ['marker env file content', 'marker production env content', 'KEY-FILE-SECRET', 'AKIA' + 'ABCDEFGHIJKLMNOP', 'PEM-BODY-SECRET', 'FOLDER GUIDELINES', 'FOLDER EXAMPLES'];
        let reads: string[] = [];
        let details: string[] = [];
        let inserted: string[] = [];

        beforeEach(() => {
            reads = [];
            details = [];
            inserted = [];
            mock.RelativePattern = class { constructor(public base: string, public pattern: string) {} };
            mock.SnippetString = class { constructor(public value: string) {} };
            mock.workspace.asRelativePath = () => 'services/shop';
            mock.workspace.findFiles = async () => Object.keys(DISK).map(name => ({ fsPath: path.join(FOLDER, name) }));
            mock.workspace.fs.stat = async (uri: { fsPath: string }) => ({ type: 1, size: Buffer.byteLength(DISK[path.relative(FOLDER, uri.fsPath)] ?? '') });
            mock.workspace.fs.readFile = async (uri: { fsPath: string }) => {
                const name = path.relative(FOLDER, uri.fsPath);
                reads.push(name);
                if (!(name in DISK)) { throw new Error('ENOENT'); }
                return Buffer.from(DISK[name]);
            };
            vscodeMock.window.showQuickPick = async (items: unknown) => (items as Array<{ type: string }>).find(item => item.type === 'C2');
        });
        afterEach(() => {
            added.forEach(key => { delete mock[key]; });
            Object.assign(mock.window, savedWindow);
            Object.assign(mock.workspace, savedWorkspace);
            mock.workspace.fs = savedWorkspace.fs;
        });

        const editor = () => ({
            document: { getText: () => '', uri: { fsPath: `${FOLDER}/README.md` } },
            selection: { isEmpty: true, active: 'cursor', end: 'cursor' },
            insertSnippet: async (snippet: { value: string }) => { inserted.push(snippet.value); return true; },
        });
        const shownOf = (detail: string) => [...detail.matchAll(/^- (.+) \(([\d,]+) bytes\)$/gm)].map(match => match[1]);
        const sentOf = (prompt: string) => [...prompt.matchAll(/^### File: (.+)$/gm)].map(match => match[1]);
        const answer = (label: string | undefined) => {
            mock.window.showInformationMessage = async (_message: string, options?: { detail?: string }) => {
                if (options?.detail) { details.push(options.detail); return label; }
                return undefined;
            };
        };

        it('scan: credential files by name are never read; credential content and guideline documents are dropped', async () => {
            const { files, excluded } = await new CodeContextExtractor().extractContextDetailed({ fsPath: FOLDER } as never, 2);
            assert.deepStrictEqual(files.map(file => file.path), ['src/app.ts', 'notes.md']);
            assert.deepStrictEqual(excluded, [
                { path: 'GEMINI.md', reason: 'guidelines' },
                { path: 'docs/EXAMPLES.md', reason: 'guidelines' },
                { path: '.env', reason: 'credentials' },
                { path: '.env.production', reason: 'credentials' },
                { path: 'deploy/server.key', reason: 'credentials' },
                { path: 'config/settings.json', reason: 'credentials' },
                { path: 'certs/client.txt', reason: 'credentials' },
            ]);
            for (const name of ['.env', '.env.production', 'deploy/server.key', 'GEMINI.md', 'docs/EXAMPLES.md']) {
                assert.ok(!reads.includes(name), `${name} must not be read`);
            }
        });

        it('Gemini: no credential or folder guideline content reaches the request; the dialog lists exactly what is sent and left out', async () => {
            answer(GEMINI_CONFIRM_BUTTON);
            const instance = command();
            const prompts: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (instance as any).geminiService.generateDiagramFromPrompt = async (prompt: string) => { prompts.push(prompt); return 'graph TB'; };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await instance.generateFromMarkdown(editor() as any);

            assert.strictEqual(prompts.length, 1);
            for (const secret of SECRETS) {
                assert.ok(!prompts[0].includes(secret), `${secret} reached the Gemini request`);
            }
            assert.strictEqual(details.length, 1);
            assert.deepStrictEqual(sentOf(prompts[0]), ['src/app.ts', 'notes.md']);
            assert.deepStrictEqual(shownOf(details[0]).filter(name => !name.endsWith('GUIDELINES.md') && name !== 'GEMINI.md' && !name.endsWith('EXAMPLES.md')), ['src/app.ts', 'notes.md']);
            assert.match(details[0], /- \.env \(holds or may hold credentials; never sent\)/);
            assert.match(details[0], /- deploy\/server\.key \(holds or may hold credentials; never sent\)/);
            assert.match(details[0], /Model: Gemini "/);
            assert.match(details[0], new RegExp(`Request size: ${Buffer.byteLength(prompts[0]).toLocaleString('en-US')} bytes`));
            assert.strictEqual(inserted.length, 1);
        });

        it('Gemini: a file changed on disk while the dialog is open does not change what is sent (#485)', async () => {
            const instance = command();
            const prompts: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (instance as any).geminiService.generateDiagramFromPrompt = async (prompt: string) => { prompts.push(prompt); return 'graph TB'; };
            mock.window.showInformationMessage = async (_message: string, options?: { detail?: string }) => {
                if (!options?.detail) { return undefined; }
                details.push(options.detail);
                // Between "shown" and "sent": a source file changes and a credential lands in another.
                DISK['src/app.ts'] = 'export const changedAfterShown = 2;';
                DISK['notes.md'] = 'changed-after-shown credential: ' + ['AKIA', 'ABCDEFGHIJKLMNOP'].join('');
                return GEMINI_CONFIRM_BUTTON;
            };
            try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await instance.generateFromMarkdown(editor() as any);
            } finally {
                DISK['src/app.ts'] = 'export const app = 1;';
                DISK['notes.md'] = 'Plain notes.';
            }

            assert.strictEqual(prompts.length, 1);
            assert.ok(prompts[0].includes('export const app = 1;'), 'the content as shown was sent');
            assert.ok(!prompts[0].includes('changedAfterShown'), 'content read after the dialog was sent');
            assert.ok(prompts[0].includes('Plain notes.'), 'the shown notes were sent');
            assert.deepStrictEqual(sentOf(prompts[0]), ['src/app.ts', 'notes.md']);
        });

        it('Gemini: declining the dialog sends nothing', async () => {
            answer(undefined);
            const instance = command();
            let sent = 0;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (instance as any).geminiService.generateDiagramFromPrompt = async () => { sent++; return 'graph TB'; };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await instance.generateFromMarkdown(editor() as any);
            assert.strictEqual(sent, 0);
            assert.strictEqual(inserted.length, 0);
        });

        it('vscode-lm: no credential or folder guideline content reaches the request; the dialog lists exactly what is sent', async () => {
            const model = stubChatModel({ id: 'm', name: 'M' }, ['```c4x\n%%{ c4: container }%%\ngraph TB\nPerson(u, "User", "A user")\n```']);
            mock.lm = { selectChatModels: async () => [model], onDidChangeChatModels: () => ({ dispose: () => undefined }) };
            mock.LanguageModelChatMessage = LanguageModelChatMessage;
            vscodeMock.setConfigurationValueForTests('provider', 'vscode-lm');
            answer('Generate');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await command().generateFromMarkdown(editor() as any);

            assert.strictEqual(details.length, 1);
            for (const secret of SECRETS) {
                assert.ok(!model.prompts[0].includes(secret), `${secret} reached the vscode-lm request`);
            }
            assert.deepStrictEqual(shownOf(details[0]), ['src/app.ts', 'notes.md']);
            assert.deepStrictEqual(sentOf(model.prompts[0]), ['src/app.ts', 'notes.md']);
            assert.match(details[0], /- \.env\.production \(holds or may hold credentials; never sent\)/);
            assert.strictEqual(inserted.length, 1);
            assert.strictEqual(readyChecks, 0);
        });
    });
});
