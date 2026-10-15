import * as assert from 'assert';
import { inspect } from 'util';

// GeminiService imports vscode; resolve it to the unit-test mock.
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
import * as vscodeMock from '../__mocks__/vscode';
import {
    API_FAILURES,
    type ApiAnswer,
    type FakeGeminiApi,
    installFakeGeminiApi,
    modelListAnswer,
    partsAnswer,
    textAnswer,
    VALID_C4X_ANSWER,
} from '../__mocks__/geminiApi';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { GeminiService } from '../../ai/GeminiService';
import { VisualDiagramCommand } from '../../commands/VisualDiagramCommand';
import { GEMINI_API_BASE_URL, type GenerateContentClient } from '../../ai/geminiClient';
import { parseModelId } from '../../ai/modelDiscovery';
import { resetModelChangeNoticesForTests } from '../../ai/modelResolution';
import { DEFAULT_IMAGE_MODEL, DEFAULT_MODEL, PRO_IMAGE_MODEL, PRO_MODEL } from '../../ai/models';

type GenerateContentFn = GenerateContentClient['models']['generateContent'];

/**
 * GeminiService end to end through the real `@google/genai` client, with only
 * `fetch` replaced (#181). The other AI unit tests inject a scripted client and
 * so cannot see what the SDK sends, what it throws, or how many HTTP requests a
 * failure costs. These can: every assertion here is about the wire, or about
 * what the user is shown as a result of it.
 */

/** Distinctive, so a leak anywhere is unambiguous. Never a real key. */
const KEY = 'wire-test-key-must-never-be-shown-0123456789';

const GENERATE_URL = (model: string) => `${GEMINI_API_BASE_URL}v1beta/models/${model}:generateContent`;

/** Ids derived from the shipped defaults, so the fixtures cannot go stale when a default moves. */
function newerIds(model: string): { ga: string; preview: string; exp: string; alias: string } {
    const { major, tier } = parseModelId(model);
    assert.ok(tier, `${model} must parse to a tier`);
    const suffix = tier!;
    return {
        ga: `gemini-${major + 1}.0-${suffix}`,
        preview: `gemini-${major + 2}.0-${suffix}-preview`,
        exp: `gemini-${major + 2}.1-${suffix}-exp`,
        alias: `gemini-${suffix}-latest`,
    };
}

/** Everything a user or a log could see during one call. */
interface Observed {
    logs: string[];
    progress: string[];
    notices: string[];
    error?: Error;
}

/**
 * Console output for the whole current test, from before the service is built
 * (initialize() logs) to the end. Kept off the test report.
 */
const consoleLines: string[] = [];
const originalConsole = { log: console.log, info: console.info, warn: console.warn, error: console.error, debug: console.debug };

function captureConsole(): void {
    consoleLines.length = 0;
    const record = (...args: unknown[]): void => {
        // inspect, not String: a logged error object shows every field it carries.
        consoleLines.push(args.map(arg => (typeof arg === 'string' ? arg : inspect(arg, { depth: 6 }))).join(' '));
    };
    Object.assign(console, { log: record, info: record, warn: record, error: record, debug: record });
}

function releaseConsole(): void {
    Object.assign(console, originalConsole);
}

/** Run `action` with progress and notices captured, and return what was shown. */
async function observe(action: () => Promise<unknown>): Promise<Observed & { value?: unknown }> {
    const logs = consoleLines;
    const progress: string[] = [];
    const originalWithProgress = vscodeMock.window.withProgress;
    vscodeMock.window.withProgress = async <T>(_options: unknown, task: (p: unknown) => Promise<T>): Promise<T> =>
        task({ report: (value: { message?: string }) => { if (value.message) { progress.push(value.message); } } });
    vscodeMock.clearRecordedInformationMessages();
    try {
        const value = await action();
        return { logs, progress, notices: [...vscodeMock.recordedInformationMessages()], value };
    } catch (error) {
        return { logs, progress, notices: [...vscodeMock.recordedInformationMessages()], error: error as Error };
    } finally {
        vscodeMock.window.withProgress = originalWithProgress;
    }
}

function assertKeyNeverShown(observed: Observed, api: FakeGeminiApi): void {
    const shown = [
        ...observed.logs,
        ...observed.progress,
        ...observed.notices,
        observed.error ? inspect(observed.error, { depth: 6 }) : '',
    ];
    for (const text of shown) {
        assert.ok(!text.includes(KEY), `the API key appeared in user- or log-visible text: ${text.slice(0, 200)}`);
    }
    for (const request of api.requests) {
        assert.ok(!request.url.includes(KEY), `the API key was put in a URL: ${request.url}`);
        assert.strictEqual(request.headers.get('x-goog-api-key'), KEY, 'the key travels in its header, and only there');
    }
}

async function serviceWithStoredKey(): Promise<GeminiService> {
    const context = {
        secrets: { get: async (name: string) => (name === 'c4x.ai.apiKey' ? KEY : undefined), store: async () => undefined },
        extensionUri: {},
    } as unknown as vscode.ExtensionContext;
    const service = new GeminiService(context);
    await service.initialize();
    return service;
}

function settings(values: { model?: string; modelStrategy?: string; imageModel?: string }): void {
    vscodeMock.setConfigurationValueForTests('model', values.model);
    vscodeMock.setConfigurationValueForTests('modelStrategy', values.modelStrategy);
    vscodeMock.setConfigurationValueForTests('imageModel', values.imageModel);
}

describe('GeminiService over the real @google/genai client (#181)', function () {
    this.timeout(20_000);

    let api: FakeGeminiApi | undefined;
    const savedEnvKey = process.env.GEMINI_API_KEY;

    beforeEach(() => {
        // The stored key must be the one used; an environment key must not mask a leak test.
        delete process.env.GEMINI_API_KEY;
        resetModelChangeNoticesForTests();
        settings({});
        captureConsole();
    });

    afterEach(() => {
        releaseConsole();
        api?.restore();
        api = undefined;
        settings({});
        if (savedEnvKey === undefined) {
            delete process.env.GEMINI_API_KEY;
        } else {
            process.env.GEMINI_API_KEY = savedEnvKey;
        }
    });

    // -----------------------------------------------------------------------
    // Which key reaches the wire
    // -----------------------------------------------------------------------

    /** A context whose SecretStorage holds `stored` (or nothing), recording what is written. */
    function contextWith(stored: string | undefined): { context: vscode.ExtensionContext; written: string[] } {
        const written: string[] = [];
        let secret = stored;
        const context = {
            secrets: {
                get: async (name: string) => (name === 'c4x.ai.apiKey' ? secret : undefined),
                store: async (_name: string, value: string) => { written.push(value); secret = value; },
            },
            extensionUri: {},
        } as unknown as vscode.ExtensionContext;
        return { context, written };
    }

    /** c4x.ai settings with a legacy plaintext `apiKey`, recording updates. */
    function legacySetting(apiKey: string | undefined): Array<[string, unknown, unknown]> {
        const updates: Array<[string, unknown, unknown]> = [];
        let current = apiKey;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vscodeMock.workspace.getConfiguration = (_section?: string): any => ({
            get: (key: string, fallback?: unknown) => (key === 'apiKey' ? current : key === 'model' ? DEFAULT_MODEL : fallback),
            update: async (key: string, value: unknown, target: unknown) => {
                updates.push([key, value, target]);
                if (key === 'apiKey') { current = value as string | undefined; }
            },
        });
        return updates;
    }

    async function generateWith(context: vscode.ExtensionContext): Promise<Observed & { value?: unknown }> {
        const service = new GeminiService(context);
        await service.initialize();
        return observe(() => service.generateDiagram([], 'Create a diagram'));
    }

    /** A context whose stored key the test can change, as Set/Clear Gemini API Key do. */
    function contextWithChangeableKey(initial: string | undefined): {
        context: vscode.ExtensionContext;
        setStoredKey: (key: string | undefined) => void;
    } {
        let secret = initial;
        const context = {
            secrets: {
                get: async (name: string) => (name === 'c4x.ai.apiKey' ? secret : undefined),
                store: async (_name: string, value: string) => { secret = value; },
            },
            extensionUri: {},
        } as unknown as vscode.ExtensionContext;
        return { context, setStoredKey: key => { secret = key; } };
    }

    /**
     * Hold every client construction until `release()`, so a credential change
     * can land while the first client is still being built (loading the SDK
     * takes real time on first use). The real factory runs once released.
     */
    function holdClientConstruction(): { release: () => void; restore: () => void } {
        // The module object itself: GeminiService reads createGeminiClient from it at call time.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const clientModule = require('../../ai/geminiClient') as {
            createGeminiClient: (...args: unknown[]) => Promise<unknown>;
        };
        const real = clientModule.createGeminiClient;
        let release: () => void = () => undefined;
        const gate = new Promise<void>(resolve => { release = resolve; });
        clientModule.createGeminiClient = async (...args: unknown[]) => {
            await gate;
            return real(...args);
        };
        return { release: () => release(), restore: () => { clientModule.createGeminiClient = real; } };
    }

    /** Start building the client, change the stored key, refresh, then let the build finish. */
    async function changeKeyDuringClientConstruction(
        service: GeminiService,
        setStoredKey: (key: string | undefined) => void,
        next: string | undefined,
    ): Promise<void> {
        const hold = holdClientConstruction();
        try {
            const building = (service as unknown as { client: () => Promise<unknown> }).client();
            setStoredKey(next);
            await service.refreshCredentials();
            hold.release();
            await building;
        } finally {
            hold.restore();
        }
    }

    it('a key replaced while the client is being built is the key every later request sends', async () => {
        const replacement = 'replacement-test-key-0123456789';
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        await changeKeyDuringClientConstruction(service, setStoredKey, replacement);
        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.ok(api.requests.some(request => request.kind === 'generate'), 'the generation reached the API');
        for (const request of api.requests) {
            assert.strictEqual(
                request.headers.get('x-goog-api-key'),
                replacement,
                `${request.kind} went out with the replaced key, from a client built before the change`,
            );
        }
    });

    it('a key cleared while the client is being built stays cleared: no credentials, no request', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        await changeKeyDuringClientConstruction(service, setStoredKey, undefined);

        assert.strictEqual(service.hasCredentials(), false, 'a client built from the cleared key was cached after the clear');
        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));
        assert.match(observed.error?.message ?? '', /Gemini API Key not configured/);
        assert.deepStrictEqual(api.requests, [], 'nothing is sent with a cleared key');
    });

    // -----------------------------------------------------------------------
    // A key changed while a request is under way. Every later request must use
    // the key held at the moment it is sent: nothing may keep a client across
    // discovery, a heal, a self-correction pass or a failover (#232 review).
    // -----------------------------------------------------------------------

    /** A point the fake API stops at until released; reaching it resolves `reached`. */
    function pausePoint(): { reached: Promise<void>; hold: () => Promise<void>; release: () => void } {
        let reach: () => void = () => undefined;
        let release: () => void = () => undefined;
        const reached = new Promise<void>(resolve => { reach = resolve; });
        const released = new Promise<void>(resolve => { release = resolve; });
        return { reached, release: () => release(), hold: async () => { reach(); await released; } };
    }

    /** Change the stored key the way the Set/Clear commands do, at a pause point, then let the API answer. */
    async function changeKeyAt(
        pause: ReturnType<typeof pausePoint>,
        service: GeminiService,
        setStoredKey: (key: string | undefined) => void,
        next: string | undefined,
    ): Promise<void> {
        await pause.reached;
        setStoredKey(next);
        await service.refreshCredentials();
        pause.release();
    }

    const REPLACEMENT = 'replacement-test-key-0123456789';
    const generateKeys = (fake: FakeGeminiApi) =>
        fake.requests.filter(request => request.kind === 'generate').map(request => `${request.model} ${request.headers.get('x-goog-api-key')}`);

    for (const next of [undefined, REPLACEMENT]) {
        for (const pauseRead of [true, false]) {
            it(`discovery: ${next ? 'replacing' : 'clearing'} the key during ${pauseRead ? 'SecretStorage reading' : 'SDK construction'} sends no stale request`, async () => {
                const pause = pausePoint();
                let secret: string | undefined = KEY;
                let pauseNextRead = false;
                const context = {
                    secrets: {
                        get: async () => {
                            const captured = secret;
                            if (pauseNextRead) {
                                pauseNextRead = false;
                                await pause.hold();
                            }
                            return captured;
                        },
                    },
                    extensionUri: {},
                } as unknown as vscode.ExtensionContext;
                api = installFakeGeminiApi({
                    list: () => modelListAnswer([DEFAULT_MODEL]),
                    generate: () => textAnswer(VALID_C4X_ANSWER),
                });
                const service = new GeminiService(context);
                await service.initialize();
                pauseNextRead = pauseRead;
                const pending = service.discoverModels(true);
                if (pauseRead) {
                    await pause.reached;
                    secret = next;
                    await service.refreshCredentials();
                    pause.release();
                } else {
                    // Discovery resumes its key read first, then client construction
                    // yields before models.list. Refresh in that asynchronous gap.
                    await new Promise<void>(resolve => queueMicrotask(() => {
                        secret = next;
                        void service.refreshCredentials().then(resolve);
                    }));
                }

                assert.deepStrictEqual(await pending, [], 'stale discovery falls back without caching');
                assert.strictEqual(api.requests.length, 0, 'no request carries the old key after refresh');
                assert.strictEqual(service.hasCredentials(), !!next);
                const current = await service.discoverModels();
                if (next) {
                    assert.ok(current.length > 0, 'the new key can discover models normally');
                    assert.deepStrictEqual(api.requests.map(request => request.headers.get('x-goog-api-key')), [next]);
                } else {
                    assert.deepStrictEqual(current, []);
                    assert.deepStrictEqual(api.requests, []);
                }
            });
        }
    }

    it('image: a key replaced during discovery is the key the image request sends', async () => {
        const pause = pausePoint();
        api = installFakeGeminiApi({
            list: async () => { await pause.hold(); return modelListAnswer([DEFAULT_IMAGE_MODEL]); },
            generate: () => partsAnswer([{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }]),
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));
        await changeKeyAt(pause, service, setStoredKey, REPLACEMENT);
        const observed = await pending;

        assert.strictEqual(observed.value, PNG_BASE64);
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_IMAGE_MODEL} ${REPLACEMENT}`]);
    });

    it('image: a key cleared during discovery sends no image request', async () => {
        const pause = pausePoint();
        api = installFakeGeminiApi({
            list: async () => { await pause.hold(); return modelListAnswer([DEFAULT_IMAGE_MODEL]); },
            generate: () => partsAnswer([{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }]),
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));
        await changeKeyAt(pause, service, setStoredKey, undefined);
        const observed = await pending;

        // Rejected, not null: null reads as "the model cannot make images".
        assert.match(observed.error?.message ?? '', /^Gemini API Key not configured/);
        assert.deepStrictEqual(generateKeys(api), [], 'nothing is sent after the key was cleared');
    });

    it('image command: a key cleared mid-generation is reported as a missing key, not as a model that cannot draw', async () => {
        const pause = pausePoint();
        api = installFakeGeminiApi({
            list: async () => { await pause.hold(); return modelListAnswer([DEFAULT_IMAGE_MODEL]); },
            generate: model => (model.includes('-image')
                ? partsAnswer([{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }])
                : textAnswer('{"framework":"C4","confidence":0.9,"reasoning":"test","bestType":"C1","direction":"TB"}')),
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const command = new VisualDiagramCommand(context);
        const service = (command as unknown as { geminiService: GeminiService }).geminiService;
        await service.initialize();
        const errors: string[] = [];
        const originalShowError = vscodeMock.window.showErrorMessage;
        vscodeMock.window.showErrorMessage = ((message?: string) => { errors.push(String(message)); return undefined; }) as typeof originalShowError;
        const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-visual-'));
        const editor = {
            document: { getText: () => 'A bank and its customers', uri: { fsPath: path.join(folder, 'notes.md') } },
            selection: { end: {} },
        } as unknown as vscode.TextEditor;
        let written: string[];
        try {
            const running = observe(() => command.generateVisualDiagram(editor));
            await changeKeyAt(pause, service, setStoredKey, undefined);
            await running;
        } finally {
            vscodeMock.window.showErrorMessage = originalShowError;
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- the temp folder made above
            written = fs.readdirSync(folder);
            fs.rmSync(folder, { recursive: true, force: true });
        }

        assert.equal(errors.length, 1, errors.join(' | '));
        assert.match(errors[0], /^Visual generation failed: Gemini API Key not configured/);
        assert.ok(!errors[0].includes('may not support image generation'), errors[0]);
        assert.deepStrictEqual(written, [], 'no image file was written');
        assert.deepStrictEqual(generateKeys(api).filter(entry => entry.includes('-image')), [], 'no image request after the clear');
    });

    it('text: a key replaced during the heal\'s discovery is the key the healed request sends', async () => {
        const { ga } = newerIds(DEFAULT_MODEL);
        const pause = pausePoint();
        let lists = 0;
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: async () => {
                lists++;
                if (lists === 2) { await pause.hold(); }
                return modelListAnswer([DEFAULT_MODEL, ga]);
            },
            generate: model => (model === DEFAULT_MODEL ? API_FAILURES.modelNotFound(model) : textAnswer(VALID_C4X_ANSWER)),
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateDiagram([], 'Create a diagram'));
        await changeKeyAt(pause, service, setStoredKey, REPLACEMENT);
        const observed = await pending;

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_MODEL} ${KEY}`, `${ga} ${REPLACEMENT}`]);
    });

    it('text: a key replaced during a self-correction pass is the key the next pass sends', async () => {
        const pause = pausePoint();
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            generate: async (_model, _request, nth) => {
                if (nth === 1) {
                    await pause.hold();
                    return textAnswer('this is not C4X');
                }
                return textAnswer(VALID_C4X_ANSWER);
            },
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateDiagram([], 'Create a diagram'));
        await changeKeyAt(pause, service, setStoredKey, REPLACEMENT);
        const observed = await pending;

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_MODEL} ${KEY}`, `${DEFAULT_MODEL} ${REPLACEMENT}`]);
    });

    it('text: a key cleared during the primary request sends no failover, and says the key is not configured', async () => {
        const pause = pausePoint();
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            generate: async () => { await pause.hold(); return API_FAILURES.overloaded(); },
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateDiagram([], 'Create a diagram'));
        await changeKeyAt(pause, service, setStoredKey, undefined);
        const observed = await pending;

        assert.match(observed.error?.message ?? '', /^Gemini API Key not configured/);
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_MODEL} ${KEY}`], 'no failover request after the clear');
    });

    it('discovery: a model list fetched for a key replaced meanwhile is not cached for the new key', async () => {
        const pause = pausePoint();
        let lists = 0;
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: async () => {
                lists++;
                if (lists === 1) { await pause.hold(); }
                return modelListAnswer([DEFAULT_MODEL]);
            },
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        const first = observe(() => service.generateDiagram([], 'one'));
        await changeKeyAt(pause, service, setStoredKey, REPLACEMENT);
        await first;
        await observe(() => service.generateDiagram([], 'two'));

        const listKeys = api.requests.filter(request => request.kind === 'list').map(request => request.headers.get('x-goog-api-key'));
        assert.deepStrictEqual(listKeys, [KEY, REPLACEMENT], 'the new key gets its own model list');
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_MODEL} ${REPLACEMENT}`, `${DEFAULT_MODEL} ${REPLACEMENT}`]);
    });

    it('discovery: a credential change drops the cached model list', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({ list: () => modelListAnswer([DEFAULT_MODEL]), generate: () => textAnswer(VALID_C4X_ANSWER) });
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();

        await observe(() => service.generateDiagram([], 'one'));
        setStoredKey(REPLACEMENT);
        await service.refreshCredentials();
        await observe(() => service.generateDiagram([], 'two'));

        const listKeys = api.requests.filter(request => request.kind === 'list').map(request => request.headers.get('x-goog-api-key'));
        assert.deepStrictEqual(listKeys, [KEY, REPLACEMENT], 'a list cached for the old key is not used for the new one');
    });

    /** The service's single send path, as FallbackStrategy and SyntaxValidator call it. */
    function sendPath(service: GeminiService): GenerateContentFn {
        const requests = (service as unknown as { requests: { models: { generateContent: GenerateContentFn } } }).requests;
        return params => requests.models.generateContent(params);
    }

    /**
     * Start a send with the client already built and cached, then change the
     * key in the same tick: after the send has acquired its client, before its
     * continuation runs. `await this.client()` yields even for a cached client.
     */
    async function changeKeyBetweenAcquireAndSend(next: string | undefined): Promise<{ sent: Promise<unknown>; fake: FakeGeminiApi }> {
        settings({ model: DEFAULT_MODEL });
        const fake = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
        api = fake;
        const { context, setStoredKey } = contextWithChangeableKey(KEY);
        const service = new GeminiService(context);
        await service.initialize();
        const send = sendPath(service);
        await send({ model: DEFAULT_MODEL, contents: 'warm the cached client' });

        const sent = send({ model: DEFAULT_MODEL, contents: 'prompt' });
        setStoredKey(next);
        const refreshed = service.refreshCredentials();
        const outcome = sent.then(value => value, (error: Error) => error);
        await refreshed;
        await outcome;
        return { sent: outcome, fake };
    }

    it('send path: a key replaced between acquiring the cached client and sending is the key sent', async () => {
        const { sent, fake } = await changeKeyBetweenAcquireAndSend(REPLACEMENT);

        assert.ok(!((await sent) instanceof Error), String(await sent));
        assert.deepStrictEqual(generateKeys(fake), [`${DEFAULT_MODEL} ${KEY}`, `${DEFAULT_MODEL} ${REPLACEMENT}`]);
    });

    it('send path: a key cleared between acquiring the cached client and sending sends nothing, and rejects', async () => {
        const { sent, fake } = await changeKeyBetweenAcquireAndSend(undefined);

        const outcome = await sent;
        assert.ok(outcome instanceof Error, 'the send must reject');
        assert.match((outcome as Error).message, /^Gemini API Key not configured/);
        assert.deepStrictEqual(generateKeys(fake), [`${DEFAULT_MODEL} ${KEY}`], 'only the warm-up request, sent before the clear');
    });

    it('text: a generation running while the key is being replaced is not told the key is missing', async () => {
        // refreshCredentials() used to clear the held key before reading the new
        // one, so for the length of that read a generation found no key and
        // failed with "not configured", although the user had just set one.
        const discovery = pausePoint();
        const keyRead = pausePoint();
        let pauseReads = false;
        let secret: string | undefined = KEY;
        const context = {
            secrets: {
                get: async (name: string) => {
                    if (pauseReads) { await keyRead.hold(); }
                    return name === 'c4x.ai.apiKey' ? secret : undefined;
                },
                store: async (_name: string, value: string) => { secret = value; },
            },
            extensionUri: {},
        } as unknown as vscode.ExtensionContext;
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: async () => { await discovery.hold(); return modelListAnswer([DEFAULT_MODEL]); },
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = new GeminiService(context);
        await service.initialize();

        const pending = observe(() => service.generateDiagram([], 'Create a diagram'));
        await discovery.reached;
        secret = REPLACEMENT;
        pauseReads = true;
        const refreshed = service.refreshCredentials();
        await keyRead.reached;
        // The generation resumes while the refresh is still reading the new key.
        discovery.release();
        for (let tick = 0; tick < 20; tick++) {
            await new Promise(resolve => setImmediate(resolve));
        }
        keyRead.release();
        await refreshed;
        const observed = await pending;

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(generateKeys(api), [`${DEFAULT_MODEL} ${REPLACEMENT}`]);
    });

    it('SecretStorage wins over GEMINI_API_KEY in the environment', async () => {
        process.env.GEMINI_API_KEY = 'environment-key-must-not-be-used';
        api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });

        const observed = await generateWith(contextWith(KEY).context);

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assertKeyNeverShown(observed, api);
    });

    it('a legacy plaintext setting is moved to SecretStorage, cleared, and used', async () => {
        const originalGetConfiguration = vscodeMock.workspace.getConfiguration;
        const updates = legacySetting(`  ${KEY}  `);
        try {
            api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
            const { context, written } = contextWith(undefined);

            const observed = await generateWith(context);

            assert.strictEqual(observed.error, undefined, observed.error?.message);
            // The constructor's own initialize() and the explicit one can both
            // find SecretStorage empty and both migrate; the writes are identical.
            assert.ok(written.length >= 1);
            assert.deepStrictEqual([...new Set(written)], [KEY], 'stored trimmed, in SecretStorage');
            assert.deepStrictEqual(
                [...new Set(updates.map(update => JSON.stringify(update)))].sort(),
                [
                    JSON.stringify(['apiKey', undefined, vscodeMock.ConfigurationTarget.Global]),
                    JSON.stringify(['apiKey', undefined, vscodeMock.ConfigurationTarget.Workspace]),
                ].sort(),
                'the plaintext copy is cleared from both scopes',
            );
            assertKeyNeverShown(observed, api);
        } finally {
            vscodeMock.workspace.getConfiguration = originalGetConfiguration;
        }
    });

    it('GEMINI_API_KEY is the last resort, and without any key nothing is sent', async () => {
        api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
        process.env.GEMINI_API_KEY = KEY;
        const fromEnvironment = await generateWith(contextWith(undefined).context);
        assert.strictEqual(fromEnvironment.error, undefined, fromEnvironment.error?.message);
        assertKeyNeverShown(fromEnvironment, api);

        api.restore();
        delete process.env.GEMINI_API_KEY;
        api = installFakeGeminiApi({ generate: () => textAnswer(VALID_C4X_ANSWER) });
        const withoutKey = await generateWith(contextWith(undefined).context);
        assert.match(withoutKey.error?.message ?? '', /Gemini API Key not configured/);
        assert.deepStrictEqual(api.requests, [], 'no request without a key');
    });

    // -----------------------------------------------------------------------
    // Request shape
    // -----------------------------------------------------------------------

    it('sends one generateContent request with the prompt as the only content: no system instruction, config or safety settings', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL]),
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Draw the payments system'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.ok(String(observed.value).includes('graph TB'));
        assert.deepStrictEqual(api.requests.map(r => `${r.method} ${r.kind}`), ['GET list', 'POST generate']);

        const [list, generate] = api.requests;
        assert.strictEqual(list.url, `${GEMINI_API_BASE_URL}v1beta/models?pageSize=200`);
        assert.strictEqual(generate.url, GENERATE_URL(DEFAULT_MODEL));
        // The request the old SDK sent for model.generateContent(prompt): the
        // prompt as one user turn and nothing else. A generationConfig,
        // responseMimeType, systemInstruction or safetySettings appearing here
        // would change what the model returns, and must be a deliberate change.
        const body = generate.body as { contents: Array<{ role: string; parts: Array<{ text?: string }> }> };
        assert.deepStrictEqual(Object.keys(body), ['contents']);
        assert.strictEqual(body.contents.length, 1);
        assert.strictEqual(body.contents[0].role, 'user');
        assert.strictEqual(body.contents[0].parts.length, 1);
        assert.ok(body.contents[0].parts[0].text?.includes('Draw the payments system'), 'the instruction is in the prompt');
        assertKeyNeverShown(observed, api);
    });

    // -----------------------------------------------------------------------
    // Error mapping: what each API failure costs and what the user reads
    // -----------------------------------------------------------------------

    interface FailureCase {
        name: string;
        answer: () => ApiAnswer;
        /** How the message the user sees starts, after "Failed to generate diagram: ". */
        message: string;
        /** What the primary's failure is called in the failover's history. */
        primaryCause: string;
        /** A forced re-discovery happens only for a missing model. */
        heals?: boolean;
    }

    const failures: FailureCase[] = [
        {
            name: '400 API_KEY_INVALID',
            answer: API_FAILURES.keyRejected,
            message: 'Your Gemini API key was rejected. Run "C4X: Set Gemini API Key"',
            primaryCause: 'the API key was rejected',
        },
        {
            name: '400 INVALID_ARGUMENT, not about the key',
            answer: API_FAILURES.badRequest,
            message: `AI generation failed with "${PRO_MODEL}": 400 INVALID_ARGUMENT: Request contains an invalid argument.`,
            primaryCause: '400 INVALID_ARGUMENT: Request contains an invalid argument',
        },
        {
            name: '401 UNAUTHENTICATED',
            answer: API_FAILURES.unauthenticated,
            message: `AI generation failed with "${PRO_MODEL}": 401 UNAUTHENTICATED: Request had invalid authentication credentials.`,
            primaryCause: '401 UNAUTHENTICATED: Request had invalid authentication credentials',
        },
        {
            name: '403 PERMISSION_DENIED',
            answer: API_FAILURES.permissionDenied,
            message: 'Your Gemini API key was refused for this request.',
            primaryCause: 'the API key was refused for this request',
        },
        {
            name: '404 NOT_FOUND',
            answer: () => API_FAILURES.modelNotFound('any'),
            message: `The built-in failover model "${PRO_MODEL}" is not available to your API key; it may have been withdrawn. Retry, or update C4X`,
            primaryCause: 'the model is not available to your API key',
            heals: true,
        },
        {
            name: '429 RESOURCE_EXHAUSTED',
            answer: API_FAILURES.quota,
            message: `You have hit the rate limit or quota for "${PRO_MODEL}".`,
            primaryCause: 'rate limit or quota reached',
        },
        {
            name: '500 INTERNAL',
            answer: API_FAILURES.internal,
            message: `AI generation failed with "${PRO_MODEL}": 500 INTERNAL: An internal error has occurred.`,
            primaryCause: '500 INTERNAL: An internal error has occurred',
        },
        {
            name: '503 UNAVAILABLE',
            answer: API_FAILURES.overloaded,
            message: `AI generation failed with "${PRO_MODEL}": 503 UNAVAILABLE: The model is overloaded. Please try again later.`,
            primaryCause: '503 UNAVAILABLE: The model is overloaded. Please try again later',
        },
        {
            name: 'network unreachable',
            answer: API_FAILURES.unreachable,
            message: 'Could not reach the Gemini API. Check your network connection or proxy settings.',
            primaryCause: 'the Gemini API could not be reached',
        },
    ];

    for (const failure of failures) {
        it(`${failure.name}: one request per model, the failover runs once, and its own cause leads`, async () => {
            settings({ model: DEFAULT_MODEL });
            api = installFakeGeminiApi({ list: failure.answer, generate: failure.answer });
            const service = await serviceWithStoredKey();

            const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

            assert.ok(observed.error, 'the generation must fail');
            const prefix = 'Failed to generate diagram: ';
            assert.ok(observed.error.message.startsWith(prefix), observed.error.message);
            const message = observed.error.message.slice(prefix.length);
            assert.ok(message.startsWith(failure.message), `expected "${failure.message}…". Got: ${message}`);
            assert.ok(
                message.includes(`This was the failover. Before it, "${DEFAULT_MODEL}" failed: ${failure.primaryCause}.`),
                `the primary's cause follows the failover's. Got: ${message}`,
            );
            // No SDK retries, no self-correction pass for an API error, one failover.
            assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, PRO_MODEL]);
            // Discovery once before the call; a missing model forces one fresh list to heal from.
            assert.strictEqual(api.listCount(), failure.heals ? 2 : 1);
            assertKeyNeverShown(observed, api);
        });
    }

    it('a proxy\'s HTML error page is summarised, not pasted into the message', async () => {
        // The old SDK reported "[502 Bad Gateway]" and dropped a non-JSON body.
        // @google/genai puts the whole body in the error, so without care a
        // corporate proxy's error page lands in the notification as markup.
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({ list: API_FAILURES.proxyHtml, generate: API_FAILURES.proxyHtml });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.ok(observed.error);
        const message = observed.error.message;
        assert.ok(!/<[a-z!/]/i.test(message), `markup reached the user: ${message.slice(0, 300)}`);
        assert.ok(message.length < 600, `the message stays readable (${message.length} characters)`);
        assert.ok(message.includes(`AI generation failed with "${PRO_MODEL}": 502 Bad Gateway`), message);
        assert.ok(message.includes(`"${DEFAULT_MODEL}" failed: 502 Bad Gateway`), message);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, PRO_MODEL]);
        assertKeyNeverShown(observed, api);
    });

    it('a blocked answer is a failed call: the failover runs and the block reason is reported', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            generate: () => partsAnswer([{ text: 'partial' }], 'SAFETY'),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.ok(observed.error);
        assert.ok(observed.error.message.includes(`AI generation failed with "${PRO_MODEL}": Candidate was blocked due to SAFETY`), observed.error.message);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, PRO_MODEL], 'a block is not self-corrected');
    });

    // -----------------------------------------------------------------------
    // Attempt budget: nothing is retried indefinitely
    // -----------------------------------------------------------------------

    it('an answer that never parses costs three attempts per model, and stops', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({ generate: () => textAnswer('this is not C4X') });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.ok(observed.error);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, DEFAULT_MODEL, DEFAULT_MODEL, PRO_MODEL, PRO_MODEL, PRO_MODEL]);
    });

    it('the worst case — heal, then the healed model and the failover never parse — is bounded at seven calls', async () => {
        const { ga } = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL, ga]),
            generate: model => (model === DEFAULT_MODEL ? API_FAILURES.modelNotFound(model) : textAnswer('not C4X')),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.ok(observed.error);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, ga, ga, ga, PRO_MODEL, PRO_MODEL, PRO_MODEL]);
        assert.strictEqual(api.listCount(), 2, 'one discovery, one forced refresh for the heal, no more');
    });

    it('heals only once: a healed model that is also gone goes to the failover, not to another heal', async () => {
        const { ga } = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL, ga]),
            generate: model => (model === PRO_MODEL ? textAnswer(VALID_C4X_ANSWER) : API_FAILURES.modelNotFound(model)),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, ga, PRO_MODEL]);
        assert.strictEqual(api.listCount(), 2);
        assert.deepStrictEqual(observed.notices, [], 'neither substitute served, so no model change is announced');
    });

    // -----------------------------------------------------------------------
    // c4x.ai.modelStrategy and discovery, through the SDK's model list
    // -----------------------------------------------------------------------

    it('pinned: a withdrawn model heals to the newest GA id the SDK lists, never a preview, -exp or -latest', async () => {
        const ids = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL, modelStrategy: 'pinned' });
        api = installFakeGeminiApi({
            // The decoys rank above the GA id; only the GA id may be chosen.
            list: () => modelListAnswer([DEFAULT_MODEL, ids.ga, ids.preview, ids.exp, ids.alias]),
            generate: model => (model === DEFAULT_MODEL ? API_FAILURES.modelNotFound(model) : textAnswer(VALID_C4X_ANSWER)),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, ids.ga]);
        assert.strictEqual(observed.notices.length, 1, 'the substitution is announced once it served');
        assert.ok(observed.notices[0].includes(ids.ga));
        assertKeyNeverShown(observed, api);
    });

    it('pinned: a reachable model is called as configured, even when a newer GA model is listed', async () => {
        const ids = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL, modelStrategy: 'pinned' });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL, ids.ga, ids.preview]),
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL]);
        assert.deepStrictEqual(observed.notices, []);
    });

    it('auto-ga: calls the newest GA model the SDK lists, skipping the newer preview, -exp and -latest ids', async () => {
        const ids = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL, modelStrategy: 'auto-ga' });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL, ids.ga, ids.preview, ids.exp, ids.alias]),
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [ids.ga]);
        assert.strictEqual(observed.notices.length, 1);
    });

    it('auto-ga: a model listed without generateContent is not selected', async () => {
        const ids = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL, modelStrategy: 'auto-ga' });
        api = installFakeGeminiApi({
            list: () => new Response(JSON.stringify({
                models: [
                    { name: `models/${DEFAULT_MODEL}`, supportedGenerationMethods: ['generateContent'] },
                    { name: `models/${ids.ga}`, supportedGenerationMethods: ['embedContent'] },
                ],
            }), { status: 200, headers: { 'content-type': 'application/json' } }),
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = await serviceWithStoredKey();

        await observe(() => service.generateDiagram([], 'Create a diagram'));

        // The SDK renames supportedGenerationMethods to supportedActions; if that
        // mapping were lost, the embedding-only id would be chosen here.
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL]);
    });

    it('auto-ga: the failover is still the built-in PRO_MODEL; the strategy does not choose it', async () => {
        const ids = newerIds(DEFAULT_MODEL);
        settings({ model: DEFAULT_MODEL, modelStrategy: 'auto-ga' });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL, ids.ga]),
            generate: model => (model === PRO_MODEL ? textAnswer(VALID_C4X_ANSWER) : API_FAILURES.overloaded()),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [ids.ga, PRO_MODEL]);
        assert.deepStrictEqual(observed.notices, [], 'the upgraded model never served, so it is not announced');
    });

    it('PRO_MODEL as the configured model fails over to DEFAULT_MODEL, once', async () => {
        settings({ model: PRO_MODEL });
        api = installFakeGeminiApi({
            generate: model => (model === DEFAULT_MODEL ? textAnswer(VALID_C4X_ANSWER) : API_FAILURES.overloaded()),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateDiagram([], 'Create a diagram'));

        assert.strictEqual(observed.error, undefined, observed.error?.message);
        assert.deepStrictEqual(api.generated(), [PRO_MODEL, DEFAULT_MODEL]);
    });

    it('discovery is cached for the day: a second generation does not list again', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_MODEL]),
            generate: () => textAnswer(VALID_C4X_ANSWER),
        });
        const service = await serviceWithStoredKey();

        await observe(() => service.generateDiagram([], 'one'));
        await observe(() => service.generateDiagram([], 'two'));

        assert.strictEqual(api.listCount(), 1);
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, DEFAULT_MODEL]);
    });

    // -----------------------------------------------------------------------
    // Recommendation and framework detection share the client
    // -----------------------------------------------------------------------

    it('recommendDiagramType calls the configured model and degrades to the default on an API error', async () => {
        settings({ model: DEFAULT_MODEL });
        api = installFakeGeminiApi({
            generate: (_model, _request, nth) => (nth === 1
                ? textAnswer('```json\n{"bestType":"C1","confidence":0.9,"direction":"LR"}\n```')
                : API_FAILURES.keyRejected()),
        });
        const service = await serviceWithStoredKey();

        const first = await observe(() => service.recommendDiagramType('A bank and its customers'));
        const second = await observe(() => service.recommendDiagramType('A bank and its customers'));

        assert.deepStrictEqual(first.value, { types: ['C1'], direction: 'LR', confidence: 0.9 });
        assert.deepStrictEqual(second.value, { types: ['C1', 'C2', 'C3'], direction: 'TB', confidence: 0 });
        assert.deepStrictEqual(api.generated(), [DEFAULT_MODEL, DEFAULT_MODEL]);
        assertKeyNeverShown(second, api);
    });

    // -----------------------------------------------------------------------
    // Image generation
    // -----------------------------------------------------------------------

    const C4_FRAMEWORK = { framework: 'C4' as const, confidence: 1, reasoning: 'test' };
    const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    it('image: calls DEFAULT_IMAGE_MODEL with the prompt then the reference images, and returns the image part\'s bytes', async () => {
        api = installFakeGeminiApi({
            generate: () => partsAnswer([{ text: 'Here is your diagram.' }, { inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }]),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));

        assert.strictEqual(observed.value, PNG_BASE64, 'a text part before the image is skipped, not returned');
        assert.deepStrictEqual(api.generated(), [DEFAULT_IMAGE_MODEL]);
        assert.strictEqual(api.requests[api.requests.length - 1].url, GENERATE_URL(DEFAULT_IMAGE_MODEL));
        const body = api.requests[api.requests.length - 1].body as {
            contents: Array<{ role: string; parts: Array<{ text?: string; inlineData?: { mimeType: string } }> }>;
        };
        assert.deepStrictEqual(Object.keys(body), ['contents']);
        assert.strictEqual(body.contents.length, 1, 'one user turn');
        const [first, ...references] = body.contents[0].parts;
        assert.ok(first.text && first.text.includes('A bank'), 'the prompt comes first');
        assert.strictEqual(references.length, 2, 'the level\'s diagram and key reference images follow');
        for (const reference of references) {
            assert.strictEqual(reference.inlineData?.mimeType, 'image/png');
        }
        assertKeyNeverShown(observed, api);
    });

    it('image: calls PRO_IMAGE_MODEL when c4x.ai.imageModel selects it, and accepts any image/* MIME type', async () => {
        settings({ imageModel: PRO_IMAGE_MODEL });
        api = installFakeGeminiApi({
            generate: () => partsAnswer([{ inlineData: { mimeType: 'image/jpeg', data: PNG_BASE64 } }]),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateVisualDiagram('A bank', 'C2', 'LR', C4_FRAMEWORK));

        assert.strictEqual(observed.value, PNG_BASE64);
        assert.deepStrictEqual(api.generated(), [PRO_IMAGE_MODEL]);
    });

    it('image: inline data that is not an image is not returned; one text-only corrective retry, then null', async () => {
        api = installFakeGeminiApi({
            generate: () => partsAnswer([{ inlineData: { mimeType: 'application/pdf', data: PNG_BASE64 } }]),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));

        assert.strictEqual(observed.value, null);
        assert.deepStrictEqual(api.generated(), [DEFAULT_IMAGE_MODEL, DEFAULT_IMAGE_MODEL]);
        const retry = api.requests.filter(r => r.kind === 'generate')[1].body as { contents: Array<{ parts: unknown[] }> };
        assert.strictEqual(retry.contents[0].parts.length, 1, 'the corrective retry drops the reference images');
    });

    it('image: a withdrawn image model heals to the newest GA image id, never a preview', async () => {
        const ids = newerIds(DEFAULT_IMAGE_MODEL);
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_IMAGE_MODEL, ids.ga, ids.preview, ids.alias]),
            generate: model => (model === DEFAULT_IMAGE_MODEL
                ? API_FAILURES.modelNotFound(model)
                : partsAnswer([{ inlineData: { mimeType: 'image/png', data: PNG_BASE64 } }])),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));

        assert.strictEqual(observed.value, PNG_BASE64);
        assert.deepStrictEqual(api.generated(), [DEFAULT_IMAGE_MODEL, ids.ga]);
        assert.strictEqual(observed.notices.length, 1);
    });

    it('image: when every image model is gone, the attempts stop at three', async () => {
        const ids = newerIds(DEFAULT_IMAGE_MODEL);
        api = installFakeGeminiApi({
            list: () => modelListAnswer([DEFAULT_IMAGE_MODEL, ids.ga]),
            generate: model => API_FAILURES.modelNotFound(model),
        });
        const service = await serviceWithStoredKey();

        const observed = await observe(() => service.generateVisualDiagram('A bank', 'C1', 'TB', C4_FRAMEWORK));

        assert.strictEqual(observed.value, null);
        assert.deepStrictEqual(api.generated(), [DEFAULT_IMAGE_MODEL, ids.ga, ids.ga]);
        assert.deepStrictEqual(observed.notices, []);
        assertKeyNeverShown(observed, api);
    });
});
