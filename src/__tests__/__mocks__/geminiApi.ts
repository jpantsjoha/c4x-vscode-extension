// A fake Gemini Developer API at the HTTP boundary.
//
// Tests that use it drive the real `@google/genai` client: only `fetch` is
// replaced. What they assert is therefore what the SDK puts on the wire and
// what it throws back, through the extension's own code — the parts a mocked
// client cannot see.

/** One HTTP request the SDK made, as the fake API received it. */
export interface ApiRequest {
    url: string;
    method: string;
    headers: Headers;
    /** The parsed JSON body, if the request had one. */
    body: unknown;
    /** `generate` for `:generateContent`, `list` for the model list. */
    kind: 'generate' | 'list' | 'other';
    /** The model id a generate request names; undefined otherwise. */
    model?: string;
}

/** What the fake answers one request with: a Response, or a thrown error for a transport failure. */
export type ApiAnswer = Response | Error;

export interface FakeGeminiApiHandlers {
    /** Answers `GET …/models`. Defaults to a 200 with no models. */
    list?: (request: ApiRequest) => ApiAnswer | Promise<ApiAnswer>;
    /** Answers `POST …/models/{model}:generateContent`; `nth` counts calls to that model from 1. */
    generate: (model: string, request: ApiRequest, nth: number) => ApiAnswer | Promise<ApiAnswer>;
}

export interface FakeGeminiApi {
    readonly requests: ApiRequest[];
    /** Generate calls, in order, by model id. */
    generated(): string[];
    /** Generate calls to one model. */
    generateCount(model: string): number;
    /** Model-list calls. */
    listCount(): number;
    restore(): void;
}

export function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

/** The Gemini API's error envelope. */
export function apiErrorBody(code: number, status: string, message: string, details?: unknown[]): unknown {
    return { error: { code, message, status, ...(details ? { details } : {}) } };
}

/** The Gemini API's error answers, keyed by the failure the extension tells apart. */
export const API_FAILURES = {
    keyRejected: () => json(400, apiErrorBody(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.', [
        { '@type': 'type.googleapis.com/google.rpc.ErrorInfo', reason: 'API_KEY_INVALID', domain: 'googleapis.com' },
    ])),
    badRequest: () => json(400, apiErrorBody(400, 'INVALID_ARGUMENT', 'Request contains an invalid argument.')),
    unauthenticated: () => json(401, apiErrorBody(401, 'UNAUTHENTICATED', 'Request had invalid authentication credentials.')),
    permissionDenied: () => json(403, apiErrorBody(403, 'PERMISSION_DENIED', 'Generative Language API has not been used in project 0 before or it is disabled.')),
    modelNotFound: (model: string) => json(404, apiErrorBody(404, 'NOT_FOUND',
        `models/${model} is not found for API version v1beta, or is not supported for generateContent. ` +
        'Call ListModels to see the list of available models and their supported methods.')),
    quota: () => json(429, apiErrorBody(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota, please check your plan and billing details.')),
    internal: () => json(500, apiErrorBody(500, 'INTERNAL', 'An internal error has occurred.')),
    overloaded: () => json(503, apiErrorBody(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.')),
    /** A corporate proxy's error page: not JSON, not from the API. */
    proxyHtml: () => new Response(
        `<!DOCTYPE html><html><head><title>502 Bad Gateway</title></head><body>${'<p>The proxy could not reach the upstream server.</p>'.repeat(60)}</body></html>`,
        { status: 502, statusText: 'Bad Gateway', headers: { 'content-type': 'text/html' } },
    ),
    /** What Node's fetch throws when the host is unreachable. */
    unreachable: () => new TypeError('fetch failed'),
} as const;

/** A 200 answer carrying one text part. */
export function textAnswer(text: string, finishReason = 'STOP'): Response {
    return json(200, { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason }] });
}

/** A 200 answer carrying the given parts. */
export function partsAnswer(parts: unknown[], finishReason = 'STOP'): Response {
    return json(200, { candidates: [{ content: { role: 'model', parts }, finishReason }] });
}

/** A 200 model list, in the REST shape (`models/` prefix, `supportedGenerationMethods`). */
export function modelListAnswer(ids: string[], methods: string[] = ['generateContent', 'countTokens']): Response {
    return json(200, { models: ids.map(id => ({ name: `models/${id}`, displayName: id, supportedGenerationMethods: methods })) });
}

/** C4X the extension's parser accepts, fenced the way models answer. */
export const VALID_C4X_ANSWER =
    '```c4x\n%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys\n```';

function parseBody(init?: RequestInit): unknown {
    if (typeof init?.body !== 'string' || init.body.length === 0) {
        return undefined;
    }
    try {
        return JSON.parse(init.body);
    } catch {
        return init.body;
    }
}

/**
 * Replace `globalThis.fetch` with the fake API until `restore()`. Any request
 * that is neither a generate nor a list call fails the test loudly.
 */
export function installFakeGeminiApi(handlers: FakeGeminiApiHandlers): FakeGeminiApi {
    const original = globalThis.fetch;
    const requests: ApiRequest[] = [];
    const perModel = new Map<string, number>();

    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const generate = url.match(/\/models\/([^/:?]+):generateContent(?:\?|$)/);
        const list = /\/models(?:\?|$)/.test(url);
        const request: ApiRequest = {
            url,
            method: init?.method ?? 'GET',
            headers: new Headers(init?.headers),
            body: parseBody(init),
            kind: generate ? 'generate' : list ? 'list' : 'other',
            model: generate?.[1],
        };
        requests.push(request);

        let answer: ApiAnswer;
        if (request.kind === 'generate') {
            const model = request.model!;
            const nth = (perModel.get(model) ?? 0) + 1;
            perModel.set(model, nth);
            answer = await handlers.generate(model, request, nth);
        } else if (request.kind === 'list') {
            answer = handlers.list ? await handlers.list(request) : modelListAnswer([]);
        } else {
            answer = new Error(`fake Gemini API: unexpected request ${request.method} ${url}`);
        }
        if (answer instanceof Error) {
            throw answer;
        }
        return answer;
    }) as typeof fetch;

    return {
        requests,
        generated: () => requests.filter(r => r.kind === 'generate').map(r => r.model!),
        generateCount: model => requests.filter(r => r.kind === 'generate' && r.model === model).length,
        listCount: () => requests.filter(r => r.kind === 'list').length,
        restore: () => { globalThis.fetch = original; },
    };
}
