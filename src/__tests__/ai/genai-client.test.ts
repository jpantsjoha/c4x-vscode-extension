import * as assert from 'assert';

// FallbackStrategy imports vscode; resolve it to the unit-test mock.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { GenerateContentResponse } from '@google/genai';
import { describeGenerationFailure, isModelUnavailableError } from '../../ai/FallbackStrategy';
import {
    createGeminiClient,
    fetchModelList,
    GEMINI_API_BASE_URL,
    imagePartBytes,
    responseText,
} from '../../ai/geminiClient';
import { DEFAULT_IMAGE_MODEL, DEFAULT_MODEL } from '../../ai/models';

/**
 * These tests drive the real `@google/genai` client. Only `fetch` is replaced,
 * so what is asserted is what the SDK puts on the wire and what it throws back:
 * the parts of the migration a mocked client cannot see.
 */

interface RecordedRequest {
    url: string;
    method: string;
    headers: Headers;
    body: unknown;
}

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** Replace global fetch for one test; every request is recorded. */
function stubFetch(answer: (request: RecordedRequest) => Response | Promise<Response>): {
    requests: RecordedRequest[];
    restore: () => void;
} {
    const original = globalThis.fetch;
    const requests: RecordedRequest[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const request: RecordedRequest = {
            url: String(input),
            method: init?.method ?? 'GET',
            headers: new Headers(init?.headers),
            body: typeof init?.body === 'string' && init.body.length > 0 ? JSON.parse(init.body) : undefined,
        };
        requests.push(request);
        return answer(request);
    }) as typeof fetch;
    return { requests, restore: () => { globalThis.fetch = original; } };
}

const TEXT_OK = {
    candidates: [{ content: { role: 'model', parts: [{ text: 'graph TB' }] }, finishReason: 'STOP' }],
};

/** The Gemini API's error bodies for the failures the extension tells apart. */
const API_ERRORS = {
    keyRejected: {
        status: 400,
        body: {
            error: {
                code: 400,
                message: 'API key not valid. Please pass a valid API key.',
                status: 'INVALID_ARGUMENT',
                details: [{ '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' }],
            },
        },
    },
    permissionDenied: {
        status: 403,
        body: { error: { code: 403, message: 'Generative Language API has not been used in project 0 before or it is disabled.', status: 'PERMISSION_DENIED' } },
    },
    modelGone: {
        status: 404,
        body: {
            error: {
                code: 404,
                message: 'models/gemini-3-pro-preview is not found for API version v1beta, or is not supported for generateContent. ' +
                    'Call ListModels to see the list of available models and their supported methods.',
                status: 'NOT_FOUND',
            },
        },
    },
    quota: {
        status: 429,
        body: { error: { code: 429, message: 'You exceeded your current quota, please check your plan and billing details.', status: 'RESOURCE_EXHAUSTED' } },
    },
} as const;

async function generateAndCatch(answer: () => Response | Promise<Response>): Promise<unknown> {
    const { restore } = stubFetch(answer);
    try {
        await (await createGeminiClient('test-key')).models.generateContent({ model: DEFAULT_MODEL, contents: 'prompt' });
    } catch (error) {
        return error;
    } finally {
        restore();
    }
    assert.fail('the call was expected to fail');
}

describe('Gemini client (@google/genai)', () => {
    // -----------------------------------------------------------------------
    // Where the key goes
    // -----------------------------------------------------------------------

    it('calls the Gemini Developer API v1beta, with the key in a header and not in the URL', async () => {
        const { requests, restore } = stubFetch(() => jsonResponse(200, TEXT_OK));
        try {
            const response = await (await createGeminiClient('test-key')).models.generateContent({
                model: DEFAULT_MODEL,
                contents: 'Draw the system',
            });
            assert.strictEqual(responseText(response), 'graph TB');
        } finally {
            restore();
        }

        assert.strictEqual(requests.length, 1);
        const [request] = requests;
        assert.strictEqual(request.method, 'POST');
        assert.strictEqual(request.url, `${GEMINI_API_BASE_URL}v1beta/models/${DEFAULT_MODEL}:generateContent`);
        assert.strictEqual(request.headers.get('x-goog-api-key'), 'test-key');
        assert.ok(!request.url.includes('test-key'), 'a key in the URL ends up in proxy logs');
        assert.deepStrictEqual(request.body, { contents: [{ parts: [{ text: 'Draw the system' }], role: 'user' }] });
    });

    it('ignores the environment variables that would switch backend, endpoint or key', async () => {
        // An extension host inherits the user's shell. None of these may move
        // the key to Vertex AI, to another host, or swap it for another key.
        const overrides: Record<string, string> = {
            GOOGLE_GENAI_USE_ENTERPRISE: 'true',
            GOOGLE_GENAI_USE_VERTEXAI: 'true',
            GOOGLE_CLOUD_PROJECT: 'someone-elses-project',
            GOOGLE_CLOUD_LOCATION: 'us-central1',
            GOOGLE_GEMINI_BASE_URL: 'https://gemini.example.invalid/',
            GOOGLE_VERTEX_BASE_URL: 'https://vertex.example.invalid/',
            GOOGLE_API_KEY: 'a-different-key',
        };
        const saved = { ...process.env };
        Object.assign(process.env, overrides);

        const { requests, restore } = stubFetch(() => jsonResponse(200, TEXT_OK));
        try {
            await (await createGeminiClient('test-key')).models.generateContent({ model: DEFAULT_MODEL, contents: 'prompt' });
        } finally {
            restore();
            for (const name of Object.keys(overrides).filter(key => !(key in saved))) {
                Reflect.deleteProperty(process.env, name);
            }
            Object.assign(process.env, saved);
        }

        assert.strictEqual(requests.length, 1);
        assert.ok(requests[0].url.startsWith(`${GEMINI_API_BASE_URL}v1beta/models/`), requests[0].url);
        assert.strictEqual(requests[0].headers.get('x-goog-api-key'), 'test-key');
        assert.strictEqual(requests[0].headers.get('authorization'), null, 'no Google Cloud credentials are attached');
    });

    it('sends an image request as one user turn: the prompt, then the reference images', async () => {
        const { requests, restore } = stubFetch(() => jsonResponse(200, {
            candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] } }],
        }));
        try {
            const response = await (await createGeminiClient('test-key')).models.generateContent({
                model: DEFAULT_IMAGE_MODEL,
                contents: ['Draw it', { inlineData: { mimeType: 'image/png', data: 'cmVm' } }],
            });
            assert.strictEqual(response.candidates?.[0].content?.parts?.[0].inlineData?.data, 'aW1hZ2U=');
        } finally {
            restore();
        }

        assert.deepStrictEqual(requests[0].body, {
            contents: [{
                role: 'user',
                parts: [{ text: 'Draw it' }, { inlineData: { mimeType: 'image/png', data: 'cmVm' } }],
            }],
        });
    });

    it('imagePartBytes: an image part without data is not an image', () => {
        // The SDK types inlineData.data as optional. The image checks decoded
        // `data ?? ''`, so a part without data passed as a zero-byte image.
        const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        assert.deepStrictEqual(imagePartBytes({ inlineData: { mimeType: 'image/png', data: png.toString('base64') } }), png);
        assert.strictEqual(imagePartBytes({ inlineData: { mimeType: 'image/png' } }), undefined, 'missing data');
        assert.strictEqual(imagePartBytes({ inlineData: { mimeType: 'image/png', data: '' } }), undefined, 'empty data');
        assert.strictEqual(imagePartBytes({ inlineData: { mimeType: 'image/png', data: '====' } }), undefined, 'data that decodes to nothing');
        assert.strictEqual(imagePartBytes({ inlineData: { mimeType: 'text/plain', data: 'aGk=' } }), undefined, 'not an image');
        assert.strictEqual(imagePartBytes({}), undefined, 'no inline data');
    });

    it('retries loading the SDK after a failed load instead of caching the failure', async () => {
        // The SDK is loaded on first use and the load is cached. A failed load
        // (a transient file read error, say) was cached too, so AI stayed broken
        // until VS Code reloaded. A fresh copy of the module, so its cache is empty.
        const clientPath = require.resolve('../../ai/geminiClient');
        const cached = Reflect.get(require.cache, clientPath);
        Reflect.deleteProperty(require.cache, clientPath);
        const originalLoad = Module._load;
        let failures = 1;
        Module._load = function (request: string, ...rest: unknown[]) {
            if (request === '@google/genai' && failures > 0) {
                failures--;
                throw new Error('EIO: simulated failure reading the SDK');
            }
            return originalLoad.call(this, request, ...rest);
        };
        try {
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const fresh = require('../../ai/geminiClient') as typeof import('../../ai/geminiClient');
            await assert.rejects(() => fresh.createGeminiClient('test-key'), /EIO: simulated failure/);
            const client = await fresh.createGeminiClient('test-key');
            assert.strictEqual(typeof client.models.generateContent, 'function', 'the second attempt loads the SDK');
        } finally {
            Module._load = originalLoad;
            Reflect.deleteProperty(require.cache, clientPath);
            if (cached) {
                Reflect.set(require.cache, clientPath, cached);
            }
        }
    });

    // -----------------------------------------------------------------------
    // Deadline: only a caller that asks for one gets one
    // -----------------------------------------------------------------------

    /** A fetch that never answers; it settles only if its signal aborts. */
    function stubHangingFetch(): { seen: Array<{ init?: RequestInit; abortedAfterMs?: number }>; restore: () => void } {
        const original = globalThis.fetch;
        const seen: Array<{ init?: RequestInit; abortedAfterMs?: number }> = [];
        globalThis.fetch = ((_input: string | URL | Request, init?: RequestInit) => {
            const record: { init?: RequestInit; abortedAfterMs?: number } = { init };
            seen.push(record);
            const started = Date.now();
            return new Promise<Response>((_resolve, reject) => {
                init?.signal?.addEventListener('abort', () => {
                    record.abortedAfterMs = Date.now() - started;
                    reject(init.signal!.reason);
                });
            });
        }) as typeof fetch;
        return { seen, restore: () => { globalThis.fetch = original; } };
    }

    it('sets no request deadline for the extension: no signal, no X-Server-Timeout header', async () => {
        const { requests, restore } = stubFetch(() => jsonResponse(200, TEXT_OK));
        let signal: AbortSignal | null | undefined;
        const recording = globalThis.fetch;
        globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
            signal = init?.signal;
            return recording(input, init);
        }) as typeof fetch;
        try {
            await (await createGeminiClient('test-key')).models.generateContent({ model: DEFAULT_MODEL, contents: 'prompt' });
        } finally {
            restore();
        }
        assert.strictEqual(signal ?? undefined, undefined);
        assert.strictEqual(requests[0].headers.get('x-server-timeout'), null);
    });

    it('with timeoutMs, aborts the HTTP request at the deadline and leaves the body as the extension sends it', async () => {
        // The live gate's deadline (#232 review): stopping the wait is not
        // enough, the request itself must end. A per-request config.abortSignal
        // would also abort, but adds generationConfig: {} to the body.
        const { seen, restore } = stubHangingFetch();
        const keepAlive = setTimeout(() => undefined, 5_000);
        let error: unknown;
        try {
            await (await createGeminiClient('test-key', { timeoutMs: 150 })).models.generateContent({ model: DEFAULT_MODEL, contents: 'prompt' });
        } catch (caught) {
            error = caught;
        } finally {
            clearTimeout(keepAlive);
            restore();
        }

        assert.strictEqual(seen.length, 1, 'one request, not retried');
        assert.ok(seen[0].abortedAfterMs !== undefined, 'the request was aborted');
        assert.ok(seen[0].abortedAfterMs! >= 100 && seen[0].abortedAfterMs! < 1_000, `aborted after ${seen[0].abortedAfterMs} ms`);
        assert.strictEqual((error as Error | undefined)?.name, 'AbortError');
        assert.deepStrictEqual(JSON.parse(String(seen[0].init?.body)), { contents: [{ parts: [{ text: 'prompt' }], role: 'user' }] });
        assert.strictEqual(new Headers(seen[0].init?.headers).get('x-goog-api-key'), 'test-key');
    });

    // -----------------------------------------------------------------------
    // Cost: the SDK must not add attempts of its own
    // -----------------------------------------------------------------------

    it('makes exactly one HTTP request for a failed call, so the FinOps caps stay the caps', async () => {
        // The SDK can retry 408/429/5xx up to five times when retryOptions is
        // set. It is not set, and this proves it: one 429, one request.
        let calls = 0;
        const error = await generateAndCatch(() => {
            calls++;
            return jsonResponse(API_ERRORS.quota.status, API_ERRORS.quota.body);
        });

        assert.strictEqual(calls, 1);
        assert.ok(/rate limit or quota/i.test(describeGenerationFailure(DEFAULT_MODEL, error)));
    });

    // -----------------------------------------------------------------------
    // The errors the SDK throws still classify the way the old ones did
    // -----------------------------------------------------------------------

    it('classifies a rejected key as a key problem, and not as a model problem', async () => {
        const error = await generateAndCatch(() => jsonResponse(API_ERRORS.keyRejected.status, API_ERRORS.keyRejected.body));

        assert.strictEqual((error as { status?: number }).status, 400);
        assert.strictEqual(isModelUnavailableError(error), false, 'a bad key must never trigger a model heal');
        const message = describeGenerationFailure(DEFAULT_MODEL, error);
        assert.ok(/api key was rejected/i.test(message), message);
    });

    it('classifies a refused key as a permission problem', async () => {
        const error = await generateAndCatch(() => jsonResponse(API_ERRORS.permissionDenied.status, API_ERRORS.permissionDenied.body));

        assert.strictEqual(isModelUnavailableError(error), false);
        const message = describeGenerationFailure(DEFAULT_MODEL, error);
        assert.ok(/refused for this request/i.test(message), message);
    });

    it('classifies a withdrawn model as healable, from the status and from the wording', async () => {
        const error = await generateAndCatch(() => jsonResponse(API_ERRORS.modelGone.status, API_ERRORS.modelGone.body));

        assert.strictEqual((error as { status?: number }).status, 404);
        assert.strictEqual(isModelUnavailableError(error), true);
        // The wording alone is enough too, for an error that lost its status.
        assert.strictEqual(isModelUnavailableError(new Error((error as Error).message)), true);
        const message = describeGenerationFailure('gemini-3-pro-preview', error);
        assert.ok(/not available to your API key/i.test(message), message);
    });

    it('classifies an exhausted quota as quota, and not as a model problem', async () => {
        const error = await generateAndCatch(() => jsonResponse(API_ERRORS.quota.status, API_ERRORS.quota.body));

        assert.strictEqual(isModelUnavailableError(error), false, 'an exhausted quota is not a reason to change model');
        assert.ok(/rate limit or quota/i.test(describeGenerationFailure(DEFAULT_MODEL, error)));
    });

    it('classifies an unreachable host as a network problem', async () => {
        const error = await generateAndCatch(() => Promise.reject(new TypeError('fetch failed')));

        assert.strictEqual(isModelUnavailableError(error), false);
        assert.ok(/could not reach the gemini api/i.test(describeGenerationFailure(DEFAULT_MODEL, error)));
    });

    // -----------------------------------------------------------------------
    // responseText keeps the contract the retry loop was written against
    // -----------------------------------------------------------------------

    function response(body: unknown): GenerateContentResponse {
        return Object.assign(new GenerateContentResponse(), body);
    }

    it('returns the answer text', () => {
        assert.strictEqual(responseText(response({
            candidates: [{ content: { parts: [{ text: 'graph ' }, { text: 'TB' }] }, finishReason: 'STOP' }],
        })), 'graph TB');
    });

    it('returns an empty string, not undefined, when the answer has no text', () => {
        // Empty is a malformed answer: executeWithRetry turns it into a
        // self-correction pass rather than a crash.
        assert.strictEqual(responseText(response({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] })), '');
        assert.strictEqual(responseText(response({ candidates: [{ finishReason: 'MAX_TOKENS' }] })), '');
        assert.strictEqual(responseText(response({})), '');
    });

    it('throws when the answer was blocked, so the call counts as failed', () => {
        assert.throws(
            () => responseText(response({
                candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'SAFETY', finishMessage: 'unsafe' }],
            })),
            /Candidate was blocked due to SAFETY: unsafe/,
        );
        assert.throws(
            () => responseText(response({ candidates: [{ finishReason: 'RECITATION' }] })),
            /blocked due to RECITATION/,
        );
    });

    it('leaves out thought parts, which the old SDK concatenated into the answer', () => {
        // A thinking model can return its reasoning as `thought: true` parts.
        // Before, they reached the C4X parser glued to the diagram.
        assert.strictEqual(responseText(response({
            candidates: [{ content: { parts: [{ text: 'Let me think.', thought: true }, { text: 'graph TB' }] }, finishReason: 'STOP' }],
        })), 'graph TB');
    });

    it('returns a truncated answer as it is: MAX_TOKENS is short, not blocked', () => {
        // The self-correction pass, not the failover, deals with a cut-off diagram.
        assert.strictEqual(responseText(response({
            candidates: [{ content: { parts: [{ text: 'graph T' }] }, finishReason: 'MAX_TOKENS' }],
        })), 'graph T');
    });

    it('treats LANGUAGE as blocking, as the old SDK did, and reads only the first of several candidates', () => {
        assert.throws(() => responseText(response({ candidates: [{ finishReason: 'LANGUAGE' }] })), /blocked due to LANGUAGE/);
        assert.strictEqual(responseText(response({
            candidates: [{ content: { parts: [{ text: 'first' }] } }, { content: { parts: [{ text: 'second' }] } }],
        })), 'first');
    });

    it('returns no text for an image answer\'s inline data, only for its text parts', () => {
        assert.strictEqual(responseText(response({
            candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] } }],
        })), 'here');
    });

    it('names the block reason and its message when the prompt was blocked', () => {
        assert.throws(
            () => responseText(response({ promptFeedback: { blockReason: 'SAFETY', blockReasonMessage: 'not allowed' } })),
            /^Error: Text not available\. Response was blocked due to SAFETY: not allowed$/,
        );
        // Feedback without candidates is still a block, even with no reason given.
        assert.throws(() => responseText(response({ candidates: [], promptFeedback: {} })), /^Error: Text not available\. Response was blocked$/);
    });

    it('throws when the prompt itself was blocked', () => {
        assert.throws(
            () => responseText(response({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } })),
            /Text not available\. Response was blocked due to PROHIBITED_CONTENT/,
        );
    });

    // -----------------------------------------------------------------------
    // Discovery through the SDK's models.list
    // -----------------------------------------------------------------------

    it('lists models through the SDK: one page of 200, key in a header, ids and methods mapped', async () => {
        const { requests, restore } = stubFetch(() => jsonResponse(200, {
            models: [
                { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
                { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
                { displayName: 'no name, dropped' },
            ],
            nextPageToken: 'more',
        }));
        let models;
        try {
            models = await fetchModelList('test-key', 1000);
        } finally {
            restore();
        }

        assert.deepStrictEqual(models, [
            { id: 'gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'] },
            { id: 'text-embedding-004', displayName: undefined, supportedGenerationMethods: ['embedContent'] },
        ]);
        assert.strictEqual(requests.length, 1, 'the first page only, as before');
        assert.strictEqual(requests[0].method, 'GET');
        assert.strictEqual(requests[0].url, `${GEMINI_API_BASE_URL}v1beta/models?pageSize=200`);
        assert.strictEqual(requests[0].headers.get('x-goog-api-key'), 'test-key');
    });

    it('returns an empty list, never an error, when listing is refused', async () => {
        const { restore } = stubFetch(() => jsonResponse(API_ERRORS.keyRejected.status, API_ERRORS.keyRejected.body));
        try {
            assert.deepStrictEqual(await fetchModelList('test-key', 1000), []);
        } finally {
            restore();
        }
    });
});
