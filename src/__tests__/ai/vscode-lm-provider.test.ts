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

import { LanguageModelError, stubChatModel, stubHost, stubToken, type StubChatModel } from '../__mocks__/languageModel';
import {
    LM_JUSTIFICATION,
    LanguageModelUnavailableError,
    classifyLanguageModelFailure,
    describeLanguageModelFailure,
    generateWithLanguageModel,
    guessModelTier,
    languageModelCompletion,
    isLanguageModelApiAvailable,
    proposeDefaultModel,
    type LanguageModelChoice,
    type LanguageModelHost,
} from '../../ai/providers/vscodeLanguageModel';
import {
    CHOOSE_ANOTHER_BUTTON,
    CONFIRM_BUTTON,
    LM_MODEL_SETTING,
    LM_WORKSPACE_GUIDELINES_SETTING,
    buildLanguageModelPickItems,
    buildOutgoingRequest,
    runLanguageModelGeneration,
    selectLanguageModel,
    vscodeLanguageModelUi,
    type LanguageModelUi,
} from '../../ai/providers/vscodeLanguageModelFlow';
import { ATTEMPTS_PER_MODEL } from '../../ai/generationLoop';
import { DEFAULT_GUIDELINES } from '../../ai/prompts/defaultGuidelines';
import { buildGenerationPrompt } from '../../ai/PromptBuilder';
import * as vscodeMock from '../__mocks__/vscode';

// The `vscode-lm` provider (#392), against a stubbed `vscode.lm`. Findings of
// the prototype review are labelled (a) to (d) as in the issue.

const CONTAINER = [
    '%%{ c4: container }%%',
    'graph TB',
    'Person(user, "Customer", "Buys things")',
    'subgraph shop {',
    '    Container(web, "Web App", "TypeScript", "Serves the shop")',
    '    ContainerDb(db, "Database", "PostgreSQL", "Holds orders")',
    '}',
    'user -->|Uses| web',
    'web -->|Reads and writes| db',
].join('\n');
const fenced = (source: string) => '```c4x\n' + source + '\n```';
const BROKEN = fenced('graph TB\nPerson(user "broken');

const asHost = (stub: ReturnType<typeof stubHost>) => stub.host as unknown as LanguageModelHost;

interface UiScript {
    confirm?: Array<string | undefined>;
    pick?: (initial: readonly LanguageModelChoice[], reload: () => Promise<readonly LanguageModelChoice[]>) => Promise<LanguageModelChoice | undefined>;
    settings?: Record<string, unknown>;
    cancelDuring?: boolean;
}

function scriptedUi(script: UiScript = {}) {
    const record = {
        confirms: [] as Array<{ message: string; detail: string; buttons: readonly string[] }>,
        writes: [] as Array<[string, unknown]>,
        infos: [] as string[],
        warnings: [] as string[],
        progress: [] as string[],
    };
    const settings = { ...(script.settings ?? {}) };
    const confirmAnswers = [...(script.confirm ?? [CONFIRM_BUTTON])];
    const tokenStub = stubToken();
    const ui: LanguageModelUi = {
        confirm: async (message, detail, buttons) => {
            record.confirms.push({ message, detail, buttons });
            return confirmAnswers.shift();
        },
        pickModel: async (initial, _current, reload) => script.pick ? script.pick(initial, reload) : undefined,
        readSetting: <T>(key: string, fallback: T) => (key in settings ? settings[key] : fallback) as T,
        writeSetting: async (key, value) => { record.writes.push([key, value]); settings[key] = value; },
        info: message => { record.infos.push(message); },
        warn: message => { record.warnings.push(message); },
        withCancellableProgress: async (_title, task) => {
            if (script.cancelDuring) {
                tokenStub.cancel();
            }
            return task({ report: value => { if (value.message) { record.progress.push(value.message); } } }, tokenStub.token as never);
        },
    };
    return { ui, record };
}

const request = {
    files: [{ path: 'Selected_Context_from_a.md', content: 'A shop' }],
    instruction: 'Create a C4 Container (Level 2) diagram.',
    source: { kind: 'selection' as const, label: 'Selected text from a.md' },
};

/** The `### File:` headers in a sent prompt: the files that actually went out. */
const sentFileHeaders = (prompt: string) => [...prompt.matchAll(/^### File: (.+)$/gm)].map(match => match[1]);
/** The file lines of a confirmation: what the user was told goes out. */
const shownFiles = (detail: string) => [...detail.matchAll(/^- (.+) \(([\d,]+) bytes\)$/gm)].map(match => ({ path: match[1], bytes: Number(match[2].replace(/,/g, '')) }));

describe('vscode-lm generation provider (#392)', () => {
    describe('host detection and engines floor', () => {
        it('finds the API on a host that has it, not on one without it or one that throws', () => {
            assert.strictEqual(isLanguageModelApiAvailable(asHost(stubHost())), true);
            assert.strictEqual(isLanguageModelApiAvailable({}), false);
            assert.strictEqual(isLanguageModelApiAvailable({ lm: {} }), false);
            const gated = Object.defineProperty({}, 'lm', { get() { throw new Error('API proposal not enabled'); } });
            assert.strictEqual(isLanguageModelApiAvailable(gated as LanguageModelHost), false);
        });

        it('on a host without the API, fails with an actionable message and confirms nothing', async () => {
            const { ui, record } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration({}, ui, request), /does not offer the VS Code Language Model API\. It needs VS Code 1\.91 or later\./);
            assert.strictEqual(record.confirms.length, 0);
        });
    });

    describe('(a) model discovery inside the error handling', () => {
        it('no model offered: actionable message, nothing sent', async () => {
            const stub = stubHost([]);
            const { ui, record } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stub), ui, request), /VS Code offered no chat model to C4X\. Install and sign in/);
            assert.strictEqual(record.confirms.length, 0);
        });

        it('discovery itself throws: reported through the provider message, not as an unhandled error', async () => {
            const stub = stubHost([stubChatModel({ id: 'm' })]);
            stub.failDiscovery(LanguageModelError.NoPermissions());
            const { ui } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stub), ui, request), /C4X was not given access to the language model\. Run the command again and allow access/);
        });

        it('consent refused on the first request: one request, no repair, the consent message', async () => {
            const model = stubChatModel({ id: 'm', name: 'Model M' }, [LanguageModelError.NoPermissions()]);
            const { ui } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stubHost([model])), ui, request), /C4X was not given access to "Model M"\. Run the command again and allow access when VS Code asks\./);
            assert.strictEqual(model.prompts.length, 1);
        });

        it('quota or rate limit (Blocked): one request, the quota message', async () => {
            const model = stubChatModel({ id: 'm', name: 'Model M' }, [LanguageModelError.Blocked()]);
            const { ui } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stubHost([model])), ui, request), /"Model M" refused the request, usually because a quota or rate limit was reached/);
            assert.strictEqual(model.prompts.length, 1);
        });

        it('model error (Unknown with a cause): names the cause', async () => {
            const model = stubChatModel({ id: 'm', name: 'Model M' }, [LanguageModelError.Unknown(new Error('context length exceeded.'))]);
            const { ui } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stubHost([model])), ui, request), /"Model M" returned an error: context length exceeded\.$/);
        });

        it('model gone mid-run (NotFound): says so and does not switch', async () => {
            const model = stubChatModel({ id: 'm', name: 'Model M' }, [LanguageModelError.NotFound()]);
            const other = stubChatModel({ id: 'o' }, [fenced(CONTAINER)]);
            const { ui } = scriptedUi({ settings: { [LM_MODEL_SETTING]: 'm' } });
            await assert.rejects(runLanguageModelGeneration(asHost(stubHost([model, other])), ui, request), /"Model M" is no longer available/);
            assert.strictEqual(other.prompts.length, 0);
        });
    });

    describe('(b) disclosure and built-in guidance by default', () => {
        it('sends C4X\'s built-in guidance and never reads workspace guideline files by default', async () => {
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi();

            const source = await runLanguageModelGeneration(asHost(stubHost([model])), ui, request);

            assert.strictEqual(source, CONTAINER);
            assert.ok(model.prompts[0].includes('## DESIGN GUIDELINES & RULES (Built-in Defaults):'));
            assert.ok(model.prompts[0].includes(DEFAULT_GUIDELINES.slice(0, 80)));
            assert.ok(!model.prompts[0].includes('## REFERENCE EXAMPLES:'));
            assert.match(record.confirms[0].detail, /C4X's built-in guidance and syntax rules\. No workspace file other than those listed is sent\./);
            assert.deepStrictEqual(shownFiles(record.confirms[0].detail), [{ path: 'Selected text from a.md', bytes: 6 }]);
        });

        describe('with a workspace that has guideline files', () => {
            const originalFolders = vscodeMock.workspace.workspaceFolders;
            const originalReadFile = vscodeMock.workspace.fs.readFile;
            let reads = 0;
            beforeEach(() => {
                reads = 0;
                vscodeMock.workspace.workspaceFolders = [{ uri: { fsPath: '/ws' } }];
                vscodeMock.workspace.fs.readFile = async () => { reads++; return Buffer.from('WORKSPACE GUIDE TEXT'); };
            });
            afterEach(() => {
                vscodeMock.workspace.workspaceFolders = originalFolders;
                vscodeMock.workspace.fs.readFile = originalReadFile;
            });

            it('the Gemini default still reads them (unchanged); built-in guidance reads none', async () => {
                const gemini = await buildGenerationPrompt([], 'x');
                assert.ok(gemini.includes('WORKSPACE GUIDE TEXT'));
                assert.ok(reads > 0);
                reads = 0;
                const builtIn = await buildGenerationPrompt([], 'x', { guidance: 'built-in' });
                assert.ok(!builtIn.includes('WORKSPACE GUIDE TEXT'));
                assert.strictEqual(reads, 0);
            });

            it('the vscode-lm route sends none of them by default', async () => {
                const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
                const { ui } = scriptedUi();
                await runLanguageModelGeneration(asHost(stubHost([model])), ui, request);
                assert.strictEqual(reads, 0);
                assert.ok(!model.prompts[0].includes('WORKSPACE GUIDE TEXT'));
            });

            it('and sends them only when the setting is on, listing each with its size', async () => {
                const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
                const { ui, record } = scriptedUi({ settings: { [LM_WORKSPACE_GUIDELINES_SETTING]: true } });
                await runLanguageModelGeneration(asHost(stubHost([model])), ui, request);
                assert.ok(model.prompts[0].includes('WORKSPACE GUIDE TEXT'));
                const size = Buffer.byteLength('WORKSPACE GUIDE TEXT');
                assert.deepStrictEqual(shownFiles(record.confirms[0].detail), [
                    { path: 'Selected text from a.md', bytes: 6 },
                    { path: 'docs/C4X-GENERATION-GUIDELINES.md', bytes: size },
                    { path: 'EXAMPLES.md', bytes: size },
                ]);
            });

            it('(P2) a setting changed while the dialog is open changes nothing sent', async () => {
                const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
                const { ui, record } = scriptedUi();
                const confirm = ui.confirm;
                ui.confirm = async (message, detail, buttons) => {
                    // The user (or a sync) turns the setting on while the dialog is up.
                    await ui.writeSetting(LM_WORKSPACE_GUIDELINES_SETTING, true);
                    return confirm(message, detail, buttons);
                };
                await runLanguageModelGeneration(asHost(stubHost([model])), ui, request);
                assert.strictEqual(ui.readSetting(LM_WORKSPACE_GUIDELINES_SETTING, false), true, 'the setting did change');
                assert.ok(!model.prompts[0].includes('WORKSPACE GUIDE TEXT'), 'the request is the one shown');
                assert.strictEqual(reads, 0);
                assert.deepStrictEqual(shownFiles(record.confirms[0].detail), [{ path: 'Selected text from a.md', bytes: 6 }]);
            });
        });

        describe('(P1) folder generation: the files shown are the files sent', () => {
            const folderFiles = [
                { path: 'src/app.ts', content: 'export const app = 1;' },
                { path: 'notes.md', content: '# Notes — café' },
                { path: 'GEMINI.md', content: 'GUIDELINES IN FOLDER' },
                { path: 'docs/EXAMPLES.md', content: 'EXAMPLES IN FOLDER' },
                { path: 'docs/C4X-Generation-Guidelines.md', content: 'MORE GUIDELINES' },
                { path: '.env', content: 'SECRET=1' },
                { path: 'config/server.pem', content: 'PEM' },
            ];
            const folderRequest = { files: folderFiles, instruction: 'Create a C4 Container (Level 2) diagram.', source: { kind: 'folder' as const, label: 'services/shop' } };

            it('sends source files only; guideline documents and credential files are listed as left out and never sent', async () => {
                const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
                const { ui, record } = scriptedUi();
                await runLanguageModelGeneration(asHost(stubHost([model])), ui, folderRequest);

                const shown = shownFiles(record.confirms[0].detail);
                assert.deepStrictEqual(shown, [
                    { path: 'src/app.ts', bytes: Buffer.byteLength('export const app = 1;') },
                    { path: 'notes.md', bytes: Buffer.byteLength('# Notes — café') },
                ]);
                assert.deepStrictEqual(sentFileHeaders(model.prompts[0]), shown.map(file => file.path), 'every shown file is sent and nothing else');
                for (const text of ['GUIDELINES IN FOLDER', 'EXAMPLES IN FOLDER', 'MORE GUIDELINES', 'SECRET=1', 'PEM']) {
                    assert.ok(!model.prompts[0].includes(text), `${text} must not be sent`);
                }
                assert.match(record.confirms[0].detail, /Sent from services\/shop: 2 workspace inputs/);
                assert.match(record.confirms[0].detail, /- GEMINI\.md \(guideline document; never sent as source\)/);
                assert.match(record.confirms[0].detail, /- \.env \(holds or may hold credentials; never sent\)/);
                assert.match(record.confirms[0].detail, /- config\/server\.pem \(holds or may hold credentials; never sent\)/);
                assert.match(record.confirms[0].detail, new RegExp(`Request size: ${Buffer.byteLength(model.prompts[0]).toLocaleString('en-US')} bytes`));
            });

            it('with guidelines on, folder copies are still left out; guidance comes only from the guidance section', async () => {
                const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
                const { ui } = scriptedUi({ settings: { [LM_WORKSPACE_GUIDELINES_SETTING]: true } });
                await runLanguageModelGeneration(asHost(stubHost([model])), ui, folderRequest);
                assert.deepStrictEqual(sentFileHeaders(model.prompts[0]), ['src/app.ts', 'notes.md']);
            });

            it('the snapshot is frozen', async () => {
                const outgoing = await buildOutgoingRequest(folderRequest, false);
                assert.ok(Object.isFrozen(outgoing) && Object.isFrozen(outgoing.files) && Object.isFrozen(outgoing.files[0]));
            });
        });

        it('with the workspace-guidelines setting on and no guideline file present, says the workspace files replace the built-in guidance and lists none', async () => {
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi({ settings: { [LM_WORKSPACE_GUIDELINES_SETTING]: true } });
            await runLanguageModelGeneration(asHost(stubHost([model])), ui, request);
            assert.match(record.confirms[0].detail, /Your workspace guideline files listed below replace the built-in guidance\./);
            assert.deepStrictEqual(shownFiles(record.confirms[0].detail), [{ path: 'Selected text from a.md', bytes: 6 }]);
        });

        it('declining the confirmation sends nothing and inserts nothing', async () => {
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const { ui } = scriptedUi({ confirm: [undefined] });
            assert.strictEqual(await runLanguageModelGeneration(asHost(stubHost([model])), ui, request), undefined);
            assert.strictEqual(model.prompts.length, 0);
        });
    });

    describe('(c) the user confirms the actual model; no silent fallback', () => {
        const small = stubChatModel({ id: 's', name: 'Model Mini', family: 'x-mini' });
        const mid = stubChatModel({ id: 'm', name: 'Model', family: 'x', maxInputTokens: 100000 });
        const large = stubChatModel({ id: 'l', name: 'Model Pro', family: 'x-pro' });

        it('guesses tiers from whole tier words only', () => {
            assert.strictEqual(guessModelTier({ id: 'a', family: 'x-mini', name: 'X' }), 'small');
            assert.strictEqual(guessModelTier({ id: 'c', family: 'z-pro', name: 'Z' }), 'large');
            assert.strictEqual(guessModelTier({ id: 'f', family: 'maximal', name: 'Promptly' }), 'mid');
        });

        it('proposes a mid-tier model, then small, then large, stably', () => {
            assert.strictEqual(proposeDefaultModel([large, small, mid])?.id, 'm');
            assert.strictEqual(proposeDefaultModel([large, small])?.id, 's');
            assert.strictEqual(proposeDefaultModel([large])?.id, 'l');
        });

        it('names the proposed model and its guessed tier in the confirmation, and says the tier is not a price', async () => {
            const model = stubChatModel({ id: 'm', name: 'Model', family: 'x', vendor: 'copilot' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi();
            await runLanguageModelGeneration(asHost(stubHost([model, large])), ui, request);
            assert.strictEqual(record.confirms[0].message, 'Generate with Model (proposed by C4X)?');
            assert.match(record.confirms[0].detail, /Model: Model from copilot, mid tier \(guessed from its name\)\. The tier is a guess, not a price\./);
            assert.match(record.confirms[0].detail, /count against your plan there/);
            assert.deepStrictEqual(record.confirms[0].buttons, [CONFIRM_BUTTON, CHOOSE_ANOTHER_BUTTON]);
        });

        it('a sole premium model is still confirmed, never used silently', async () => {
            const premium = stubChatModel({ id: 'l', name: 'Model Pro', family: 'x-pro' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi({ confirm: [undefined] });
            await runLanguageModelGeneration(asHost(stubHost([premium])), ui, request);
            assert.strictEqual(record.confirms.length, 1);
            assert.match(record.confirms[0].detail, /large tier/);
            assert.strictEqual(premium.prompts.length, 0);
        });

        it('a chosen model that disappeared is an error, not a switch to another', async () => {
            const offered = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi({ settings: { [LM_MODEL_SETTING]: 'gone' } });
            await assert.rejects(
                runLanguageModelGeneration(asHost(stubHost([offered])), ui, request),
                /The chosen language model "gone" is not offered by VS Code any more\. Run "C4X: Select AI Model" to choose another\. C4X does not switch models for you\./,
            );
            assert.strictEqual(offered.prompts.length, 0);
            assert.strictEqual(record.confirms.length, 0);
        });

        it('uses the chosen model while VS Code offers it, and still confirms it', async () => {
            const chosen = stubChatModel({ id: 'l', name: 'Model Pro', family: 'x-pro' }, [fenced(CONTAINER)]);
            const other = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi({ settings: { [LM_MODEL_SETTING]: 'l' } });
            await runLanguageModelGeneration(asHost(stubHost([other, chosen])), ui, request);
            assert.strictEqual(record.confirms[0].message, 'Generate with Model Pro?');
            assert.strictEqual(chosen.prompts.length, 1);
            assert.strictEqual(other.prompts.length, 0);
        });

        it('"Choose Another Model" picks, saves the choice and generates with it', async () => {
            const a = stubChatModel({ id: 'a' }, [fenced(CONTAINER)]);
            const b = stubChatModel({ id: 'b', name: 'B' }, [fenced(CONTAINER)]);
            const { ui, record } = scriptedUi({
                confirm: [CHOOSE_ANOTHER_BUTTON],
                pick: async initial => initial.find(model => model.id === 'b'),
            });
            const source = await runLanguageModelGeneration(asHost(stubHost([a, b])), ui, request);
            assert.strictEqual(source, CONTAINER);
            assert.deepStrictEqual(record.writes, [[LM_MODEL_SETTING, 'b']]);
            assert.strictEqual(b.prompts.length, 1);
            assert.strictEqual(a.prompts.length, 0);
        });
    });

    describe('requests, consent and the shared loop', () => {
        it('one user message per request with VS Code\'s justification, the token passed through, the stream joined', async () => {
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const token = stubToken();
            const source = await generateWithLanguageModel(asHost(stubHost([model])), model as never, 'Draw', { token: token.token as never });
            assert.strictEqual(source, CONTAINER);
            assert.deepStrictEqual(model.prompts, ['Draw']);
            assert.deepStrictEqual(model.requestOptions, [{ justification: LM_JUSTIFICATION }]);
            assert.strictEqual(model.tokens[0], token.token);
        });

        it('repairs with the parser error, and reports invalid output after the shared budget', async () => {
            const fixed = stubChatModel({ id: 'm' }, [BROKEN, fenced(CONTAINER)]);
            assert.strictEqual(await generateWithLanguageModel(asHost(stubHost([fixed])), fixed as never, 'Draw'), CONTAINER);
            assert.match(fixed.prompts[1], /SYNTAX ERROR/);

            const hopeless = stubChatModel({ id: 'h', name: 'H' }, [BROKEN]);
            const { ui } = scriptedUi();
            await assert.rejects(runLanguageModelGeneration(asHost(stubHost([hopeless])), ui, request), /"H" did not produce valid C4X after 3 attempts: /);
            assert.strictEqual(hopeless.prompts.length, ATTEMPTS_PER_MODEL);
        });

        it('cancellation during generation: no further request, nothing inserted, told once', async () => {
            const model = stubChatModel({ id: 'm' }, [BROKEN]);
            const { ui, record } = scriptedUi({ cancelDuring: true });
            assert.strictEqual(await runLanguageModelGeneration(asHost(stubHost([model])), ui, request), undefined);
            assert.strictEqual(model.prompts.length, 0);
            assert.deepStrictEqual(record.infos, ['C4X: Generation cancelled. Nothing was inserted.']);
        });

        it('(P2) cancelled just after the last fragment, before the stream completes: the answer is discarded', async () => {
            const token = stubToken();
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)], undefined, () => token.cancel());
            await assert.rejects(
                languageModelCompletion(asHost(stubHost([model])), model as never, token.token as never)('Draw'),
                (error: unknown) => classifyLanguageModelFailure(error) === 'cancelled',
            );
        });

        it('(P2) cancelled after a valid answer arrived, before it is handed on: nothing is returned for insertion', async () => {
            const token = stubToken();
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)]);
            const progress = { report: (value: { message?: string }) => { if (value.message === 'Validating Syntax...') { token.cancel(); } } };
            await assert.rejects(
                generateWithLanguageModel(asHost(stubHost([model])), model as never, 'Draw', { token: token.token as never, progress }),
                (error: unknown) => classifyLanguageModelFailure(error) === 'cancelled',
            );
        });

        it('(P2) through the flow, a late cancellation inserts nothing and says so', async () => {
            const { ui, record } = scriptedUi();
            const late = stubToken();
            ui.withCancellableProgress = async (_title, task) => task({ report: () => undefined }, late.token as never);
            const model = stubChatModel({ id: 'm' }, [fenced(CONTAINER)], undefined, () => late.cancel());
            assert.strictEqual(await runLanguageModelGeneration(asHost(stubHost([model])), ui, request), undefined);
            assert.deepStrictEqual(record.infos, ['C4X: Generation cancelled. Nothing was inserted.']);
        });

        it('cancellation while the answer streams stops the request', async () => {
            const token = stubToken();
            const model: StubChatModel = stubChatModel({ id: 'm' }, [fenced(CONTAINER)], () => token.cancel());
            await assert.rejects(
                generateWithLanguageModel(asHost(stubHost([model])), model as never, 'Draw', { token: token.token as never }),
                (error: unknown) => classifyLanguageModelFailure(error) === 'cancelled',
            );
            assert.strictEqual(model.prompts.length, 1);
        });
    });

    describe('model picker', () => {
        it('lists the active provider\'s models with current, proposed, vendor and guessed tier', () => {
            const choices: LanguageModelChoice[] = [
                { id: 's', name: 'S Mini', vendor: 'copilot', family: 's-mini', maxInputTokens: 1, tier: 'small' },
                { id: 'm', name: 'M', vendor: 'other', family: 'm', maxInputTokens: 1, tier: 'mid' },
            ];
            const rows = buildLanguageModelPickItems(choices, undefined);
            assert.deepStrictEqual(rows.map(row => row.description), [
                'copilot · small tier (guessed from its name)',
                'proposed · other · mid tier (guessed from its name)',
            ]);
            assert.strictEqual(buildLanguageModelPickItems(choices, 's')[0].description, 'current · copilot · small tier (guessed from its name)');
        });

        it('re-queries VS Code when its models change while the picker is open, and saves the pick', async () => {
            const stub = stubHost([stubChatModel({ id: 'a' })]);
            const { ui, record } = scriptedUi({
                pick: async (initial, reload) => {
                    assert.deepStrictEqual(initial.map(model => model.id), ['a']);
                    stub.setModels([stubChatModel({ id: 'a' }), stubChatModel({ id: 'b' })]);
                    const reloaded = await reload();
                    return reloaded.find(model => model.id === 'b');
                },
            });
            assert.strictEqual(await selectLanguageModel(asHost(stub), ui), 'b');
            assert.deepStrictEqual(record.writes, [[LM_MODEL_SETTING, 'b']]);
            assert.strictEqual(stub.selectCalls, 2);
        });

        it('warns, without a picker, when there is no API or no model', async () => {
            const none = scriptedUi();
            assert.strictEqual(await selectLanguageModel(asHost(stubHost([])), none.ui), undefined);
            assert.match(none.record.warnings[0], /VS Code offered no chat model/);
            const old = scriptedUi();
            assert.strictEqual(await selectLanguageModel({}, old.ui), undefined);
            assert.match(old.record.warnings[0], /does not offer the VS Code Language Model API/);
        });
    });

    describe('failure messages', () => {
        it('classifies VS Code\'s error codes and cancellation', () => {
            assert.strictEqual(classifyLanguageModelFailure(LanguageModelError.NoPermissions()), 'no-consent');
            assert.strictEqual(classifyLanguageModelFailure(LanguageModelError.Blocked()), 'blocked');
            assert.strictEqual(classifyLanguageModelFailure(LanguageModelError.NotFound()), 'model-gone');
            assert.strictEqual(classifyLanguageModelFailure(LanguageModelError.Unknown(new Error('x'))), 'model-error');
            assert.strictEqual(classifyLanguageModelFailure(Object.assign(new Error('Canceled'), { name: 'Canceled' })), 'cancelled');
            assert.strictEqual(classifyLanguageModelFailure(new LanguageModelUnavailableError('no-model')), 'no-model');
            assert.strictEqual(classifyLanguageModelFailure(undefined), 'other');
            assert.strictEqual(describeLanguageModelFailure(new Error('boom.')), 'Generation with the language model failed: boom.');
        });
    });
    describe('the real UI adapter on vscode.window', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = vscodeMock.window as any;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ws = vscodeMock.workspace as any;
        const saved = { ...win };
        const savedGetConfiguration = ws.getConfiguration;
        afterEach(() => {
            Object.keys(win).forEach(key => { if (!(key in saved)) { delete win[key]; } });
            Object.assign(win, saved);
            ws.getConfiguration = savedGetConfiguration;
        });

        it('confirms with a modal message carrying the disclosure and the buttons', async () => {
            const calls: unknown[][] = [];
            win.showInformationMessage = async (...args: unknown[]) => { calls.push(args); return CONFIRM_BUTTON; };
            const answer = await vscodeLanguageModelUi(asHost(stubHost())).confirm('Generate?', 'DETAIL', [CONFIRM_BUTTON, CHOOSE_ANOTHER_BUTTON]);
            assert.strictEqual(answer, CONFIRM_BUTTON);
            assert.deepStrictEqual(calls[0], ['Generate?', { modal: true, detail: 'DETAIL' }, CONFIRM_BUTTON, CHOOSE_ANOTHER_BUTTON]);
        });

        it('reads and writes c4x.ai settings in user settings, and shows info and warnings', async () => {
            const updates: unknown[][] = [];
            ws.getConfiguration = (section: string) => ({
                get: (key: string, fallback: unknown) => (section === 'c4x.ai' && key === LM_MODEL_SETTING ? 'chosen' : fallback),
                update: async (...args: unknown[]) => { updates.push(args); },
            });
            const shown: string[] = [];
            win.showInformationMessage = (message: string) => { shown.push(`info:${message}`); };
            win.showWarningMessage = (message: string) => { shown.push(`warn:${message}`); };
            const ui = vscodeLanguageModelUi(asHost(stubHost()));
            assert.strictEqual(ui.readSetting(LM_MODEL_SETTING, ''), 'chosen');
            assert.strictEqual(ui.readSetting(LM_WORKSPACE_GUIDELINES_SETTING, false), false);
            await ui.writeSetting(LM_MODEL_SETTING, 'b');
            assert.deepStrictEqual(updates, [[LM_MODEL_SETTING, 'b', vscodeMock.ConfigurationTarget.Global]]);
            ui.info('i');
            ui.warn('w');
            assert.deepStrictEqual(shown, ['info:i', 'warn:w']);
        });

        it('runs generation in a cancellable notification and passes its token', async () => {
            const token = stubToken().token;
            let options: unknown;
            win.withProgress = async (opts: unknown, task: (progress: unknown, token: unknown) => Promise<unknown>) => {
                options = opts;
                return task({ report: () => undefined }, token);
            };
            const seen = await vscodeLanguageModelUi(asHost(stubHost())).withCancellableProgress('T', async (_progress, given) => given);
            assert.strictEqual(seen, token);
            assert.deepStrictEqual(options, { location: vscodeMock.ProgressLocation.Notification, title: 'T', cancellable: true });
        });

        it('the picker re-lists when VS Code\'s models change, resolves the accepted model and disposes its listener', async () => {
            const stub = stubHost();
            const handlers: Record<string, () => void> = {};
            let disposed = false;
            const quickPick = {
                items: [] as Array<{ model: LanguageModelChoice }>,
                selectedItems: [] as Array<{ model: LanguageModelChoice }>,
                onDidAccept: (handler: () => void) => { handlers.accept = handler; return { dispose: () => undefined }; },
                onDidHide: (handler: () => void) => { handlers.hide = handler; return { dispose: () => undefined }; },
                show: () => undefined,
                hide: () => handlers.hide(),
                dispose: () => { disposed = true; },
            };
            win.createQuickPick = () => quickPick;
            const a: LanguageModelChoice = { id: 'a', name: 'A', vendor: 'v', family: 'a', maxInputTokens: 1, tier: 'mid' };
            const b: LanguageModelChoice = { ...a, id: 'b', name: 'B' };
            const picking = vscodeLanguageModelUi(asHost(stub)).pickModel([a], undefined, async () => [a, b]);
            assert.deepStrictEqual(quickPick.items.map(item => item.model.id), ['a']);
            assert.strictEqual(stub.listenerCount, 1);
            stub.fireChange();
            await new Promise(resolve => setImmediate(resolve));
            assert.deepStrictEqual(quickPick.items.map(item => item.model.id), ['a', 'b']);
            quickPick.selectedItems = [quickPick.items[1]];
            handlers.accept();
            assert.strictEqual((await picking)?.id, 'b');
            assert.strictEqual(stub.listenerCount, 0);
            assert.ok(disposed);
        });
    });
});
