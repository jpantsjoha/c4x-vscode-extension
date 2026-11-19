// The Gemini binding of the provider-neutral generation loop (#393).
//
// The loop itself — clean, parse, repair, three attempts per model — lives in
// `generationLoop.ts` and serves every provider. This module binds it to a
// Gemini client: `geminiCompletion` turns one `generateContent` call into the
// loop's `complete(prompt) → text`, and `executeWithRetry` keeps the signature
// FallbackStrategy, the live gate and the tests have always called.

import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { type GenerateContentClient, responseText } from './geminiClient';
import { type CompleteFn, runRepairLoop } from './generationLoop';

// Re-exported so existing callers and tests keep one import site.
export { cleanResponse } from './generationLoop';

/**
 * One Gemini request as the loop's `complete`: `generateContent` on
 * `modelName`, the answer's text out. `responseText` throws for a blocked
 * answer, like the call itself failing, and returns '' for an empty one.
 */
export function geminiCompletion(client: GenerateContentClient, modelName: string): CompleteFn {
    return async prompt => {
        const response = await client.models.generateContent({ model: modelName, contents: prompt });
        return responseText(response);
    };
}

/**
 * Execute a single generation attempt against a model, then validate the
 * output with the C4X parser.  On syntax errors, re-prompt with a fix
 * prompt up to `maxRetries` times (self-correction loop).
 *
 * `modelName` is both the id called and the id reported: the client has no
 * per-model handle that could disagree with it.
 */
export async function executeWithRetry(
    client: GenerateContentClient,
    modelName: string,
    currentPrompt: string,
    attempt: number,
    maxRetries: number,
    parser: C4XParser,
    progress?: vscode.Progress<{ message?: string }>
): Promise<string> {
    return runRepairLoop(geminiCompletion(client, modelName), modelName, currentPrompt, attempt, maxRetries, parser, progress);
}
