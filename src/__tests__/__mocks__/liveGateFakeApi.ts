// Preloaded (node -r) into a child process that runs scripts/test-live-generation.ts
// against a fake Gemini API, so the live gate's own logic can be tested with no
// key and no network. Not a test file.
//
// C4X_FAKE_GEMINI selects the behaviour:
//   healthy     every shipped model answers as a working one does
//   pro-gone    PRO_MODEL answers 404, as a withdrawn preview would
//   key-dead    every request is refused with API_KEY_INVALID
//   hang        the key probe and model list answer, but no generate request
//               does: each settles only when its signal aborts. One that is
//               not aborted answers late (C4X_FAKE_LATE_MS, default 450 ms),
//               as a slow model would, and is recorded as answeredLate.
//
// On exit it writes one line to stderr: FAKE-GEMINI <json>, a summary of what
// the gate sent. It records whether the key header matched, never the key.
const scenario = process.env.C4X_FAKE_GEMINI ?? 'healthy';
const expectedKey = process.env.GEMINI_API_KEY ?? '';

interface Sent {
    method: string;
    url: string;
    kind: 'generate' | 'list' | 'other';
    model?: string;
    keyHeaderMatches: boolean;
    urlCarriesKey: boolean;
    bodyKeys: string[];
    /** Milliseconds since the fake loaded, for generate requests in the hang scenario. */
    startedAt?: number;
    abortedAt?: number;
    answeredLate?: boolean;
}
const sent: Sent[] = [];

function json(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

// A real 1x1 PNG, zero-padded past the gate's 1,000-byte floor; the gate checks the signature and the size, nothing more.
const PNG = Buffer.concat([
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'),
    Buffer.alloc(4096),
]).toString('base64');

const C4X = '```c4x\n%%{ c4: system-context }%%\ngraph TB\n    User[Customer<br/>Person]\n    App[Banking System<br/>Software System]\n    User -->|Uses| App\n```';

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const headers = new Headers(init?.headers);
    const generate = url.match(/\/models\/([^/:?]+):generateContent(?:\?|$)/);
    const kind: Sent['kind'] = generate ? 'generate' : /\/models(?:\?|$)/.test(url) ? 'list' : 'other';
    let bodyKeys: string[] = [];
    if (typeof init?.body === 'string' && init.body) {
        bodyKeys = Object.keys(JSON.parse(init.body));
    }
    sent.push({
        method: init?.method ?? 'GET',
        url: url.split('?')[0],
        kind,
        model: generate?.[1],
        keyHeaderMatches: expectedKey !== '' && headers.get('x-goog-api-key') === expectedKey,
        urlCarriesKey: expectedKey !== '' && url.includes(expectedKey),
        bodyKeys,
    });

    if (kind === 'other' || !url.startsWith('https://generativelanguage.googleapis.com/v1beta/')) {
        return json(418, { error: { code: 418, message: `fake Gemini API: unexpected ${url}`, status: 'UNEXPECTED' } });
    }
    if (scenario === 'key-dead') {
        return json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.', status: 'INVALID_ARGUMENT' } });
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const models = require('../../ai/models') as typeof import('../../ai/models');
    if (kind === 'list') {
        const ids = models.MODEL_REGISTRY.filter(model => model.channel !== 'retired').map(model => model.id);
        return json(200, { models: ids.map(id => ({ name: `models/${id}`, supportedGenerationMethods: ['generateContent'] })) });
    }
    const model = generate![1];
    if (scenario === 'pro-gone' && model === models.PRO_MODEL) {
        return json(404, { error: { code: 404, message: `models/${model} is not found for API version v1beta, or is not supported for generateContent.`, status: 'NOT_FOUND' } });
    }
    if (scenario === 'hang') {
        const record = sent[sent.length - 1];
        record.startedAt = Math.round(performance.now());
        const late = Number(process.env.C4X_FAKE_LATE_MS) > 0 ? Number(process.env.C4X_FAKE_LATE_MS) : 450;
        return new Promise<Response>((resolve, reject) => {
            const answer = setTimeout(() => {
                record.answeredLate = true;
                resolve(json(200, { candidates: [{ content: { role: 'model', parts: [{ text: C4X }] }, finishReason: 'STOP' }] }));
            }, late);
            init?.signal?.addEventListener('abort', () => {
                clearTimeout(answer);
                record.abortedAt = Math.round(performance.now());
                reject(init.signal!.reason);
            });
        });
    }
    const part = model.includes('-image') ? { inlineData: { mimeType: 'image/png', data: PNG } } : { text: C4X };
    return json(200, { candidates: [{ content: { role: 'model', parts: [part] }, finishReason: 'STOP' }] });
}) as typeof fetch;

process.on('exit', () => {
    process.stderr.write(`\nFAKE-GEMINI ${JSON.stringify(sent)}\n`);
});
