// Responses shaped exactly like the ones `@google/genai` returns.
//
// Built on the SDK's own GenerateContentResponse class, so `.text` is the real
// getter and `.candidates` the real structure. A mock that returned a plain
// `{ text }` would pass tests the real client could fail.

import { GenerateContentResponse } from '@google/genai';
import type { Models } from '@google/genai';
import type { GenerateContentClient } from '../../ai/geminiClient';

/** A model answer made of one text part. */
export function textResponse(text: string): GenerateContentResponse {
    return Object.assign(new GenerateContentResponse(), {
        candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }],
    }) as GenerateContentResponse;
}

/** A model answer carrying one inline image, base64-encoded as the API sends it. */
export function imageResponse(data: string, mimeType = 'image/png'): GenerateContentResponse {
    return Object.assign(new GenerateContentResponse(), {
        candidates: [{ content: { role: 'model', parts: [{ inlineData: { mimeType, data } }] }, finishReason: 'STOP' }],
    }) as GenerateContentResponse;
}

/** A response with no candidates at all. */
export function emptyResponse(): GenerateContentResponse {
    return Object.assign(new GenerateContentResponse(), { candidates: [] }) as GenerateContentResponse;
}

/**
 * The one SDK method production calls, with the SDK's own signature.
 *
 * Typed against `Models['generateContent']` rather than `any`, so a change to
 * what `@google/genai` accepts or returns breaks the type-check here, in every
 * test that scripts a client, instead of leaving the mocks agreeing with each
 * other and not with the SDK.
 */
export type GenerateContent = Models['generateContent'];

/**
 * A `GenerateContentClient`: the one surface production sends through,
 * `models.generateContent`.
 *
 * Typed as what it is, not cast to `GoogleGenAI`: a `GoogleGenAI` would let a
 * test hand it to code that calls a second SDK method and type-check. At run
 * time, anything else a test touches throws, so a production change that
 * starts calling a second SDK method fails loudly instead of reading undefined.
 */
export function fakeGenAI(generateContent: GenerateContent): GenerateContentClient {
    const models: Pick<Models, 'generateContent'> = { generateContent };
    // `then` and symbols are probed by `await` and by util.inspect, not by
    // production code; everything else unscripted is a contract break.
    const guard = <T extends object>(target: T, prefix: string): T => new Proxy(target, {
        get: (object, name) => {
            if (name in object) {
                return object[name as keyof T];
            }
            if (typeof name === 'symbol' || name === 'then' || name === 'toJSON') {
                return undefined;
            }
            throw new Error(`fakeGenAI: production code used client.${prefix}${name}, which this fake does not script`);
        },
    });
    return guard<GenerateContentClient>({ models: guard(models, 'models.') }, '');
}

