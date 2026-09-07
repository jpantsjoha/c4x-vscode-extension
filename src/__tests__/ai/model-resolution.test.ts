import * as assert from 'assert';

// Mock vscode before importing anything that reads settings or shows messages.
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
import type { DiscoveredModel } from '../../ai/modelDiscovery';
import {
    announceModelChange,
    healModelAfterFailure,
    type ModelChangeNotice,
    type ModelResolution,
    readModelStrategy,
    resetModelChangeNoticesForTests,
    resolveModelForGeneration,
} from '../../ai/modelResolution';
import { generateWithFallback, isModelUnavailableError } from '../../ai/FallbackStrategy';
import { DISCOVERY_TIMEOUT_MS, fetchModelList, GeminiService } from '../../ai/GeminiService';
import { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL, PRO_MODEL } from '../../ai/models';

// ---------------------------------------------------------------------------
// Fixtures — shaped like the real /v1beta/models response
// ---------------------------------------------------------------------------

/** What a healthy key sees: the pinned defaults are both present. */
const REACHABLE: DiscoveredModel[] = [
    { id: DEFAULT_MODEL, supportedGenerationMethods: ['generateContent'] },
    { id: 'gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] },
    { id: 'gemini-3.9-flash-preview', supportedGenerationMethods: ['generateContent'] },
    { id: 'gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
    { id: 'gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
    { id: 'text-embedding-004', supportedGenerationMethods: ['embedContent'] },
];

/** The same key after Google removed the pinned ids from the list. */
const WITHOUT_PINNED: DiscoveredModel[] = REACHABLE.filter(
    m => m.id !== DEFAULT_MODEL && m.id !== DEFAULT_IMAGE_MODEL
).concat([{ id: 'gemini-3.9-flash-image', supportedGenerationMethods: ['generateContent'] }]);

/** A newer GA flash exists alongside the pinned one. */
const WITH_NEWER_GA: DiscoveredModel[] = [
    ...REACHABLE,
    { id: 'gemini-3.9-flash', supportedGenerationMethods: ['generateContent'] },
];

const validC4X = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';
const validResponse = `\`\`\`c4x\n${validC4X}\n\`\`\``;

/** What the SDK actually throws for a retired, renamed or ungranted model. */
function notFoundError(model: string): Error {
    return new Error(
        `[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent: ` +
        `[404 Not Found] models/${model} is not found for API version v1beta, or is not supported for generateContent.`
    );
}

/**
 * A Gemini client whose every model id has a scripted response, and which 404s
 * for any id not scripted — exactly like the real one when a model is gone.
 * Maps rather than plain objects, so a model id can never index into a
 * prototype.
 */
function createMockGenAI(behaviors: Array<[string, Array<string | Error>]>) {
    const scripted = new Map(behaviors);
    const calls = new Map<string, number>();
    return {
        calls,
        genAI: {
            getGenerativeModel: ({ model }: { model: string }) => ({
                generateContent: async () => {
                    const responses = scripted.get(model);
                    if (!responses) {
                        throw notFoundError(model);
                    }
                    const index = calls.get(model) ?? 0;
                    calls.set(model, index + 1);
                    const item = responses[index % responses.length];
                    if (item instanceof Error) {
                        throw item;
                    }
                    return { response: { text: () => item } };
                },
            }),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
    };
}

function createVisualService(
    initial: ModelResolution,
    behaviors: Array<[string, Array<string | Error | null>]>,
    healed?: ModelResolution,
): GeminiService {
    const scripted = new Map(behaviors);
    const calls = new Map<string, number>();
    const service = Object.create(GeminiService.prototype) as GeminiService;
    const mutable = service as unknown as Record<string, unknown>;

    mutable.context = { extensionUri: {} };
    mutable.genAI = {
        getGenerativeModel: ({ model }: { model: string }) => ({
            generateContent: async () => {
                const responses = scripted.get(model) ?? [notFoundError(model)];
                const index = calls.get(model) ?? 0;
                calls.set(model, index + 1);
                const selectedIndex = Math.min(index, responses.length - 1);
                const item = responses.find((_response, responseIndex) => responseIndex === selectedIndex);
                if (item instanceof Error) {
                    throw item;
                }
                return {
                    response: {
                        candidates: item === null
                            ? []
                            : [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: item } }] } }],
                    },
                };
            },
        }),
    };
    mutable.resolveModelId = async () => initial;
    mutable.healModelId = async () => healed;

    return service;
}

const originalGetConfiguration = vscodeMock.workspace.getConfiguration;

function patchSettings(values: Array<[string, string]>) {
    const settings = new Map(values);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vscodeMock.workspace.getConfiguration = (_section?: string): any => ({
        get: (key: string, defaultValue?: unknown) => settings.get(key) ?? defaultValue,
    });
}

function messages(): readonly string[] {
    return vscodeMock.recordedInformationMessages();
}

function announce(notice: ModelChangeNotice | undefined): void {
    if (notice) {
        announceModelChange(notice.from, notice.to, notice.reason);
    }
}

describe('model resolution in the generation path', () => {
    it('calls the newly configured model after a direct Settings change', async () => {
        const previous = DEFAULT_MODEL;
        const selected = PRO_MODEL;
        const { genAI, calls } = createMockGenAI([
            [previous, [validResponse]],
            [selected, [validResponse]],
        ]);
        const service = Object.create(GeminiService.prototype) as GeminiService;
        const mutable = service as unknown as Record<string, unknown>;
        mutable.genAI = genAI;
        mutable.model = genAI.getGenerativeModel({ model: previous });
        mutable.discoverModels = async () => [{ id: previous }, { id: selected }];

        patchSettings([['model', previous]]);
        await service.generateDiagram([], 'Create a diagram');
        patchSettings([['model', selected]]);
        await service.generateDiagram([], 'Create a diagram');

        assert.strictEqual(calls.get(previous), 1, 'the cached model must not serve the second request');
        assert.strictEqual(calls.get(selected), 1, 'the newly configured model must serve the second request');
    });

    beforeEach(() => {
        resetModelChangeNoticesForTests();
        vscodeMock.clearRecordedInformationMessages();
        patchSettings([]);
    });

    afterEach(() => {
        vscodeMock.workspace.getConfiguration = originalGetConfiguration;
    });

    // -----------------------------------------------------------------------
    // Strategy
    // -----------------------------------------------------------------------

    it('defaults to pinned when c4x.ai.modelStrategy is unset or unrecognised', () => {
        patchSettings([]);
        assert.strictEqual(readModelStrategy(), 'pinned');

        patchSettings([['modelStrategy', 'whatever-a-future-version-writes']]);
        assert.strictEqual(readModelStrategy(), 'pinned');

        patchSettings([['modelStrategy', 'auto-ga']]);
        assert.strictEqual(readModelStrategy(), 'auto-ga');
    });

    // -----------------------------------------------------------------------
    // Resolution before the first call
    // -----------------------------------------------------------------------

    it('pinned and reachable: the id is unchanged and the user is not interrupted', () => {
        const resolved = resolveModelForGeneration(DEFAULT_MODEL, REACHABLE, 'pinned');

        assert.strictEqual(resolved.model, DEFAULT_MODEL);
        assert.strictEqual(resolved.notice, undefined);
        assert.deepStrictEqual(messages(), [], 'nothing changed, so there is nothing to say');
    });

    it('pinned and unreachable: heals to the newest GA model in the tier', () => {
        const resolved = resolveModelForGeneration(DEFAULT_MODEL, WITHOUT_PINNED, 'pinned');

        assert.strictEqual(resolved.model, 'gemini-3.5-flash', 'newest GA flash left in the list');
        assert.deepStrictEqual(resolved.notice, {
            from: DEFAULT_MODEL,
            to: 'gemini-3.5-flash',
            reason: 'healed',
        });
        assert.strictEqual(messages().length, 0, 'choosing a substitute is not serving it');

        announce(resolved.notice);
        assert.strictEqual(messages().length, 1);
        assert.match(messages()[0], /no longer available to your API key/);
        assert.match(messages()[0], /gemini-3\.5-flash/);
    });

    it('heals the image tier the same way', () => {
        const resolved = resolveModelForGeneration(DEFAULT_IMAGE_MODEL, WITHOUT_PINNED, 'pinned');

        assert.strictEqual(resolved.model, 'gemini-3.9-flash-image');
        assert.strictEqual(messages().length, 0);
        announce(resolved.notice);
        assert.strictEqual(messages().length, 1);
    });

    it('tells the user once, even though each command owns its own service', () => {
        // GenerateDiagramCommand and VisualDiagramCommand construct separate
        // GeminiService instances. The once-per-session set is module-level for
        // exactly this reason.
        class ServiceStandIn {
            resolve() {
                return resolveModelForGeneration(DEFAULT_MODEL, WITHOUT_PINNED, 'pinned');
            }
        }
        const generateCommandService = new ServiceStandIn();
        const visualCommandService = new ServiceStandIn();

        const resolutions = [
            generateCommandService.resolve(),
            visualCommandService.resolve(),
            generateCommandService.resolve(),
        ];
        assert.ok(resolutions.every(resolved => resolved.model === 'gemini-3.5-flash'));
        assert.strictEqual(messages().length, 0, 'no command has served the substitute yet');
        resolutions.forEach(resolved => announce(resolved.notice));

        assert.strictEqual(messages().length, 1, 'one substitution, one notification');
    });

    it('auto-ga upgrades to a newer GA model and says so', () => {
        const resolved = resolveModelForGeneration(DEFAULT_MODEL, WITH_NEWER_GA, 'auto-ga');

        assert.strictEqual(resolved.model, 'gemini-3.9-flash');
        assert.strictEqual(resolved.notice?.reason, 'upgraded');
        assert.strictEqual(messages().length, 0);
        announce(resolved.notice);
        assert.strictEqual(messages().length, 1);
        assert.match(messages()[0], /a newer model than/);
    });

    it('auto-ga never selects a preview, an experimental build or a -latest alias', () => {
        const previewOnly: DiscoveredModel[] = [
            { id: DEFAULT_MODEL, supportedGenerationMethods: ['generateContent'] },
            { id: 'gemini-4.0-flash-preview', supportedGenerationMethods: ['generateContent'] },
            { id: 'gemini-flash-latest', supportedGenerationMethods: ['generateContent'] },
        ];

        assert.strictEqual(resolveModelForGeneration(DEFAULT_MODEL, previewOnly, 'auto-ga').model, DEFAULT_MODEL);
        assert.deepStrictEqual(messages(), []);
    });

    it('discovery failure changes nothing at all', () => {
        // No key, offline, proxied, rate-limited: the list comes back empty and
        // behaviour must be identical to the version before discovery existed.
        assert.strictEqual(resolveModelForGeneration(DEFAULT_MODEL, [], 'pinned').model, DEFAULT_MODEL);
        assert.strictEqual(resolveModelForGeneration(DEFAULT_MODEL, [], 'auto-ga').model, DEFAULT_MODEL);
        assert.strictEqual(resolveModelForGeneration('gemini-3.1-flash-image-preview', [], 'pinned').model, 'gemini-3.1-flash-image-preview');
        assert.deepStrictEqual(messages(), []);
    });

    // -----------------------------------------------------------------------
    // Healing after the call has already failed
    // -----------------------------------------------------------------------

    it('heals an id the API still lists but refuses to serve', () => {
        // The v1.6.3 scenario: models.list published the retired image model for
        // weeks after Google withdrew it. A list-based check says it is fine;
        // the 404 says otherwise, and the 404 wins.
        const stillListed: DiscoveredModel[] = [
            { id: 'gemini-3.1-flash-image-preview', supportedGenerationMethods: ['generateContent'] },
            { id: 'gemini-3.1-flash-image', supportedGenerationMethods: ['generateContent'] },
        ];

        assert.strictEqual(
            resolveModelForGeneration('gemini-3.1-flash-image-preview', stillListed, 'pinned').model,
            'gemini-3.1-flash-image-preview',
            'discovery cannot see the retirement — that is the registry\'s job'
        );
        const healed = healModelAfterFailure('gemini-3.1-flash-image-preview', stillListed, 'pinned');
        assert.strictEqual(
            healed?.model,
            'gemini-3.1-flash-image',
            'the failed call is stronger evidence than the list'
        );
        assert.strictEqual(messages().length, 0, 'a retry has not served yet');
    });

    it('does not heal when there is nothing better to heal to', () => {
        const onlyPinned: DiscoveredModel[] = [{ id: DEFAULT_MODEL, supportedGenerationMethods: ['generateContent'] }];

        assert.strictEqual(healModelAfterFailure(DEFAULT_MODEL, onlyPinned, 'pinned'), undefined);
        assert.strictEqual(healModelAfterFailure(DEFAULT_MODEL, [], 'pinned'), undefined);
        assert.deepStrictEqual(messages(), []);
    });

    it('classifies only the API missing-model signature as healable', () => {
        const statusOnly = Object.assign(new Error('Request failed'), { status: 404 });

        assert.ok(isModelUnavailableError(new Error(
            '[404 Not Found] models/gemini-x is not found for API version v1beta, or is not supported for generateContent.'
        )));
        assert.ok(isModelUnavailableError(statusOnly));
        assert.ok(isModelUnavailableError(new Error('models/x is not supported for generateContent')));
        assert.ok(!isModelUnavailableError(new Error('Resource not found')));
        assert.ok(!isModelUnavailableError(new Error('429 RESOURCE_EXHAUSTED: quota exceeded')));
        assert.ok(!isModelUnavailableError(new Error('getaddrinfo ENOTFOUND generativelanguage.googleapis.com')));
        assert.ok(!isModelUnavailableError(new Error('API key not valid. Please pass a valid API key.')));
    });

    // -----------------------------------------------------------------------
    // Discovery is on the hot path, so it must be bounded
    // -----------------------------------------------------------------------

    it('gives up on a server that accepts the connection and never answers', async () => {
        // A proxy or captive portal does not refuse the connection, it holds
        // it. Without the timeout every generation would wait for it.
        const originalFetch = globalThis.fetch;
        let sawAbort = false;
        globalThis.fetch = ((_url: string, init?: { signal?: AbortSignal }) =>
            new Promise((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    sawAbort = true;
                    reject(new Error('This operation was aborted'));
                });
            })) as typeof fetch;

        try {
            const startedAt = Date.now();
            const models = await fetchModelList('a-key', 40);
            const elapsed = Date.now() - startedAt;

            assert.ok(sawAbort, 'the request must actually be aborted, not just abandoned');
            assert.deepStrictEqual(models, [], 'a timeout looks like any other discovery failure');
            assert.ok(elapsed < 1000, `discovery returned in ${elapsed}ms, bounded by the timeout`);

            // And the caller carries on with the configured model, unbothered.
            assert.strictEqual(resolveModelForGeneration(DEFAULT_MODEL, models, 'pinned').model, DEFAULT_MODEL);
            assert.deepStrictEqual(messages(), []);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('treats a refused connection and a rejected request as an empty list', async () => {
        const originalFetch = globalThis.fetch;

        try {
            globalThis.fetch = (() => Promise.reject(new Error('fetch failed'))) as typeof fetch;
            assert.deepStrictEqual(await fetchModelList('a-key', 40), []);

            globalThis.fetch = (() => Promise.resolve({ ok: false, status: 403 })) as unknown as typeof fetch;
            assert.deepStrictEqual(await fetchModelList('a-key', 40), []);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('keeps the discovery timeout short enough to sit on the generation path', () => {
        assert.ok(DISCOVERY_TIMEOUT_MS > 0 && DISCOVERY_TIMEOUT_MS <= 10_000, 'a user is waiting on this');
    });

    // -----------------------------------------------------------------------
    // The call-time heal, through the real failover path
    // -----------------------------------------------------------------------

    it('announces a pre-call substitution only after the selected model serves', async () => {
        const resolution = resolveModelForGeneration(DEFAULT_MODEL, WITHOUT_PINNED, 'pinned');
        const { genAI } = createMockGenAI([
            [resolution.model, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: resolution.model });

        const generation = generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: resolution.model,
            onPrimaryModelServed: () => announce(resolution.notice),
        });

        assert.deepStrictEqual(messages(), [], 'the pending generation has not served yet');
        await generation;
        assert.strictEqual(messages().length, 1);
    });

    it('does not announce a pre-call substitution when only the failover serves', async () => {
        const resolution = resolveModelForGeneration(DEFAULT_MODEL, WITHOUT_PINNED, 'pinned');
        const { genAI } = createMockGenAI([
            [resolution.model, [new Error('overloaded')]],
            [PRO_MODEL, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: resolution.model });

        await generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: resolution.model,
            onPrimaryModelServed: () => announce(resolution.notice),
        });

        assert.deepStrictEqual(messages(), [], 'the selected substitute never served a result');
    });

    it('announces an image substitution only after it returns image bytes', async () => {
        const resolution = resolveModelForGeneration(DEFAULT_IMAGE_MODEL, WITHOUT_PINNED, 'pinned');
        const service = createVisualService(resolution, [[resolution.model, ['image-bytes']]]);

        assert.deepStrictEqual(messages(), []);
        const image = await service.generateVisualDiagram(
            'A system',
            'C1',
            'TB',
            { framework: 'C4', confidence: 1, reasoning: 'test' },
        );

        assert.strictEqual(image, 'image-bytes');
        assert.strictEqual(messages().length, 1);
    });

    it('does not announce an image heal when the healed model also fails', async () => {
        const initial = { model: DEFAULT_IMAGE_MODEL };
        const healed: ModelResolution = {
            model: 'gemini-3.9-flash-image',
            notice: {
                from: DEFAULT_IMAGE_MODEL,
                to: 'gemini-3.9-flash-image',
                reason: 'healed',
            },
        };
        const service = createVisualService(initial, [
            [DEFAULT_IMAGE_MODEL, [notFoundError(DEFAULT_IMAGE_MODEL)]],
            [healed.model, [new Error('overloaded')]],
        ], healed);

        const image = await service.generateVisualDiagram(
            'A system',
            'C1',
            'TB',
            { framework: 'C4', confidence: 1, reasoning: 'test' },
        );

        assert.strictEqual(image, null);
        assert.deepStrictEqual(messages(), [], 'the healed image model never served image bytes');
    });

    it('heals and retries once before the Pro/Flash failover runs', async () => {
        patchSettings([['model', 'gemini-3.1-flash-image-preview']]);

        const { genAI, calls } = createMockGenAI([
            // The pinned id 404s, the healed id works, the tier failover would
            // also work — and must not be needed.
            ['gemini-3.1-flash-image-preview', [notFoundError('gemini-3.1-flash-image-preview')]],
            ['gemini-3.5-flash', [validResponse]],
            [PRO_MODEL, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: 'gemini-3.1-flash-image-preview' });

        const healCalls: string[] = [];
        const served: Array<[string, string]> = [];
        const result = await generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: 'gemini-3.1-flash-image-preview',
            heal: async failed => {
                healCalls.push(failed);
                return {
                    model: 'gemini-3.5-flash',
                    notice: { from: failed, to: 'gemini-3.5-flash', reason: 'healed' },
                };
            },
            onHealedModelServed: (from, to) => served.push([from, to]),
        });

        assert.ok(result.includes('graph TB'), 'the healed model produced the diagram');
        assert.deepStrictEqual(healCalls, ['gemini-3.1-flash-image-preview'], 'healed exactly once');
        assert.deepStrictEqual(served, [['gemini-3.1-flash-image-preview', 'gemini-3.5-flash']]);
        assert.strictEqual(calls.get('gemini-3.5-flash'), 1, 'one retry, not a retry loop');
        assert.strictEqual(calls.get(PRO_MODEL), undefined, 'the tier failover never ran');
    });

    it('falls through to the normal failover without announcing a healed id that failed', async () => {
        patchSettings([['model', DEFAULT_MODEL]]);

        const { genAI, calls } = createMockGenAI([
            [DEFAULT_MODEL, [notFoundError(DEFAULT_MODEL)]],
            ['gemini-3.5-flash', [notFoundError('gemini-3.5-flash')]],
            [PRO_MODEL, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

        const served: Array<[string, string]> = [];
        const result = await generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: DEFAULT_MODEL,
            heal: async () => ({
                model: 'gemini-3.5-flash',
                notice: { from: DEFAULT_MODEL, to: 'gemini-3.5-flash', reason: 'healed' },
            }),
            onHealedModelServed: (from, to) => served.push([from, to]),
        });

        assert.ok(result.includes('graph TB'), 'the tier failover still catches it');
        assert.strictEqual(calls.get('gemini-3.5-flash'), 1);
        assert.strictEqual(calls.get(PRO_MODEL), 1);
        assert.deepStrictEqual(served, [], 'the healed model never served a result');
    });

    it('does not heal a failure that is not about the model', async () => {
        patchSettings([['model', DEFAULT_MODEL]]);

        const { genAI } = createMockGenAI([
            [DEFAULT_MODEL, [new Error('429 RESOURCE_EXHAUSTED: quota exceeded')]],
            [PRO_MODEL, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: DEFAULT_MODEL });

        let healed = false;
        await generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: DEFAULT_MODEL,
            heal: async () => {
                healed = true;
                return { model: 'gemini-3.5-flash' };
            },
        });

        assert.strictEqual(healed, false, 'an exhausted quota is not a reason to change model');
    });

    it('uses the resolved id, not the setting, to pick the failover', async () => {
        // The setting still says the dead id. Re-reading it here would name the
        // wrong model in the error and pick the wrong failover.
        patchSettings([['model', PRO_MODEL]]);

        const { genAI, calls } = createMockGenAI([
            ['gemini-3.5-flash', [new Error('overloaded')]],
            [PRO_MODEL, [validResponse]],
            [DEFAULT_MODEL, [validResponse]],
        ]);
        const primary = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

        const result = await generateWithFallback(genAI, primary, 'prompt', undefined, {
            primaryModelName: 'gemini-3.5-flash',
        });

        assert.ok(result.includes('graph TB'));
        assert.strictEqual(calls.get(PRO_MODEL), 1, 'failover elevates from the resolved id');
        assert.strictEqual(calls.get(DEFAULT_MODEL), undefined);
    });
});
