// The one place C4X builds a Gemini client, reads a response and lists models.
//
// No VS Code import, on purpose: the live generation gate
// (scripts/test-live-generation.ts) runs under plain ts-node and has to call
// exactly this code, or it proves the model ids and not the client users run.
//
// C4X talks to the Gemini Developer API with an API key, and nothing else. The
// `@google/genai` SDK also speaks to Vertex AI / Gemini Enterprise, and in Node
// it decides which from environment variables unless told otherwise:
// GOOGLE_GENAI_USE_ENTERPRISE and GOOGLE_GENAI_USE_VERTEXAI switch the backend,
// and GOOGLE_GEMINI_BASE_URL moves the endpoint. An extension host inherits the
// user's shell, so any of those would silently change where the key is sent.
// Every option below is explicit so that none of them can.

import type { GenerateContentResponse, GoogleGenAI, Models, Part } from '@google/genai';
import type { DiscoveredModel } from './modelDiscovery';

/** The Gemini Developer API endpoint. The key is sent here and nowhere else. */
export const GEMINI_API_BASE_URL = 'https://generativelanguage.googleapis.com/';

/**
 * The API version every call uses. The SDK defaults to it today; it is pinned
 * so discovery and generation cannot drift onto different versions, and so the
 * 404 wording `isModelUnavailableError` recognises stays the wording we get.
 */
export const GEMINI_API_VERSION = 'v1beta';

/**
 * How long the model list may take before discovery gives up.
 *
 * Discovery sits on the generation hot path: every generation resolves its
 * model id first. An unreachable host fails in milliseconds, but a proxy or a
 * captive portal that accepts the connection and then never answers would hang
 * generation for as long as the user was willing to wait. Five seconds is
 * generous for a list of 54 models and short enough that the fallback — call
 * the configured id, as before discovery existed — is barely noticed.
 */
export const DISCOVERY_TIMEOUT_MS = 5000;

/**
 * The one SDK call generation makes: what FallbackStrategy and SyntaxValidator
 * need, and all they get. A `GoogleGenAI` satisfies it. GeminiService passes
 * a source that resolves the client for the key held at the moment each
 * request is sent, never a client captured earlier: the key can be replaced
 * or cleared between a generation's requests (discovery, a heal, a
 * self-correction pass, the failover).
 */
export interface GenerateContentClient {
    readonly models: Pick<Models, 'generateContent'>;
}

/** The SDK module, loaded once, on first use. */
let sdk: Promise<typeof import('@google/genai')> | undefined;

/**
 * Load `@google/genai` the first time a client is needed, not at activation.
 *
 * The SDK and what it pulls in are about 1.8 MB of the bundle. A static import
 * runs all of it when the extension loads, for every user, AI or not. Timing
 * require() of the bundle in fresh Node processes (2026-09-29), a static import
 * put 30 to 90 ms on the median load; this dynamic import takes most of that
 * back, leaving the cost of parsing the bytes. esbuild wraps the SDK so that
 * its module body runs only here. This file is its only value import, and a
 * lint rule keeps it that way: everything else imports types, which cost
 * nothing at runtime.
 *
 * Only a successful load is kept. A failed one (a transient read error, say)
 * is forgotten, so the next call tries again rather than leaving AI broken
 * until VS Code reloads.
 */
function loadSdk(): Promise<typeof import('@google/genai')> {
    if (!sdk) {
        const loading = import('@google/genai');
        sdk = loading;
        loading.catch(() => {
            if (sdk === loading) {
                sdk = undefined;
            }
        });
    }
    return sdk;
}

/**
 * A client for the Gemini Developer API, authenticated by `apiKey`.
 *
 * No `retryOptions`: the SDK then makes exactly one HTTP request per call. The
 * retry and failover budget belongs to FallbackStrategy and SyntaxValidator.
 * A transport that quietly retried a 429 five times would multiply those caps.
 *
 * `timeoutMs` makes the SDK abort each HTTP request at that deadline
 * (`httpOptions.timeout`), so a caller that gives up also stops the request.
 * The extension passes none, as before. The live gate passes its deadline: a
 * per-request `config.abortSignal` would do the same but adds
 * `generationConfig: {}` to the request body, while this adds only an
 * `X-Server-Timeout` header (checked against @google/genai 2.24.0).
 */
export async function createGeminiClient(apiKey: string, options: { timeoutMs?: number } = {}): Promise<GoogleGenAI> {
    const { GoogleGenAI } = await loadSdk();
    return new GoogleGenAI({
        apiKey,
        enterprise: false,
        apiVersion: GEMINI_API_VERSION,
        httpOptions: {
            baseUrl: GEMINI_API_BASE_URL,
            ...(options.timeoutMs && options.timeoutMs > 0 ? { timeout: options.timeoutMs } : {}),
        },
    });
}

/**
 * The decoded bytes of an image part, or `undefined` when the part is not an
 * image or carries no image data.
 *
 * The SDK types `inlineData.data` as optional. Decoding a missing or empty
 * payload gives a zero-byte buffer, which a check would count as an image and
 * save as an empty file; this returns nothing instead.
 */
export function imagePartBytes(part: Pick<Part, 'inlineData'>): Buffer | undefined {
    const inline = part.inlineData;
    if (!inline?.mimeType?.startsWith('image/') || !inline.data) {
        return undefined;
    }
    const bytes = Buffer.from(inline.data, 'base64');
    return bytes.length > 0 ? bytes : undefined;
}

/** Finish reasons that mean the answer was withheld, not merely short. */
const BLOCKING_FINISH_REASONS = new Set<string>(['SAFETY', 'RECITATION', 'LANGUAGE']);

/**
 * The text of a generation response, with the contract the extension was
 * written against.
 *
 * The previous SDK's `response.text()` threw when the prompt or the answer was
 * blocked, and returned '' when there was simply no text. The new SDK's `text`
 * getter never throws: it returns whatever text there is, blocked or not, and
 * `undefined` when there is none. The difference
 * matters in `executeWithRetry`: a blocked answer is a failed call, which
 * moves on to the failover, while an empty one is a malformed answer, which
 * earns a self-correction pass. Without this, a blocked answer would reach the
 * parser as `undefined` and fail as a TypeError that names neither.
 */
export function responseText(
    response: Pick<GenerateContentResponse, 'candidates' | 'promptFeedback' | 'text'>,
): string {
    const candidate = response.candidates?.[0];
    if (candidate) {
        if (candidate.finishReason && BLOCKING_FINISH_REASONS.has(candidate.finishReason)) {
            throw new Error(
                `Candidate was blocked due to ${candidate.finishReason}` +
                (candidate.finishMessage ? `: ${candidate.finishMessage}` : '')
            );
        }
        return response.text ?? '';
    }

    if (response.promptFeedback) {
        const feedback = response.promptFeedback;
        throw new Error(
            'Text not available. Response was blocked' +
            (feedback.blockReason ? ` due to ${feedback.blockReason}` : '') +
            (feedback.blockReasonMessage ? `: ${feedback.blockReasonMessage}` : '')
        );
    }

    return response.text ?? '';
}

/**
 * Fetch the model list for a key. Never throws and never blocks for longer than
 * `timeoutMs`; every failure, the timeout included, comes back as an empty list.
 *
 * Uses the SDK's own `models.list`, so discovery reaches the same endpoint and
 * API version as generation, and sends the key in the `x-goog-api-key` header
 * rather than in the URL, where a proxy log would keep it.
 *
 * Only the first page is read, as before: 200 models is four times what the
 * API lists today, and a failed second page must not throw away a good first.
 *
 * A free function rather than a method so a test can drive it with a short
 * timeout and a stubbed `fetch`, without a VS Code extension context.
 * `canSend` rechecks the service's credential generation after asynchronous
 * client construction. A stale key must not reach models.list; returning an
 * empty list lets generation use its configured model with current credentials.
 */
export async function fetchModelList(
    apiKey: string,
    timeoutMs: number = DISCOVERY_TIMEOUT_MS,
    canSend: () => boolean = () => true,
): Promise<DiscoveredModel[]> {
    try {
        const client = await createGeminiClient(apiKey);
        // No await between the credential check and SDK dispatch.
        if (!canSend()) {
            return [];
        }
        const pager = await client.models.list({
            config: { pageSize: 200, abortSignal: AbortSignal.timeout(timeoutMs) },
        });
        return pager.page
            .filter(model => typeof model.name === 'string')
            .map(model => ({
                id: model.name!.replace(/^models\//, ''),
                displayName: model.displayName,
                // The SDK renames the REST field `supportedGenerationMethods`.
                supportedGenerationMethods: model.supportedActions,
            }));
    } catch {
        // Offline, proxied, rate-limited, or timed out — an AbortError from the
        // signal lands here like any other. The pinned defaults still work.
        return [];
    }
}
