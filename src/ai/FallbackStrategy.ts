// Smart model fallback / elevation logic for the C4X AI Agent.
//
// Extracted from GeminiService.ts as part of WS-5 decomposition.
// Independently testable — no VS Code UI dependencies beyond progress reporting.

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { DEFAULT_MODEL, PRO_MODEL } from './models';
import { executeWithRetry } from './SyntaxValidator';

// BUILD_ID for debugging version issues
const BUILD_ID = '20260502-V140-FLASH-DEFAULT';

/**
 * Generate C4X DSL with automatic model fallback.
 *
 * Strategy:
 *   1. Try the user's configured model (or DEFAULT_MODEL).
 *   2. If that fails entirely, elevate to PRO_MODEL (unless already on it).
 *   3. If PRO_MODEL also fails, surface a clear error.
 *
 * Each model attempt includes up to `maxRetries` self-correction passes
 * via the parser-driven retry loop in SyntaxValidator.
 */
export async function generateWithFallback(
    genAI: GoogleGenerativeAI,
    primaryModel: GenerativeModel,
    prompt: string,
    progress?: vscode.Progress<{ message?: string }>
): Promise<string> {
    console.log(`[FallbackStrategy] BUILD_ID: ${BUILD_ID}`);

    const parser = new C4XParser();
    const maxRetries = 3; // Integrated self-correction

    const config = vscode.workspace.getConfiguration('c4x.ai');
    // Default to gemini-3-flash-preview (fast, free-tier). User can override via settings.
    const primaryModelName = config.get<string>('model') || DEFAULT_MODEL;

    // Helper to get model instance
    const getModel = (name: string) => genAI.getGenerativeModel({ model: name });

    try {
        return await executeWithRetry(primaryModel, primaryModelName, prompt, 1, maxRetries, parser, progress);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // Smart fallback: Elevate to PRO_MODEL if user's default model fails.
        // If already on pro, no further fallback — surface the error.
        let fallbackModelName = PRO_MODEL;
        if (primaryModelName === PRO_MODEL) {
            fallbackModelName = DEFAULT_MODEL;
        }

        if (primaryModelName !== fallbackModelName) {
            progress?.report({ message: `Model failed. Trying ${fallbackModelName}...` });
            console.warn(`[FallbackStrategy] "${primaryModelName}" failed: ${error.message}. Falling back to "${fallbackModelName}".`);

            const fallbackModel = getModel(fallbackModelName);
            if (fallbackModel) {
                try {
                    return await executeWithRetry(fallbackModel, fallbackModelName, prompt, 1, maxRetries, parser, progress);
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (fallbackError: any) {
                    console.error(`[FallbackStrategy] Fallback "${fallbackModelName}" also failed: ${fallbackError.message}`);
                }
            }
        }

        // Both models failed. Say why.
        //
        // This used to discard error.message and blame model selection
        // unconditionally, which sent users to change a setting that was not
        // the problem. An expired API key and a retired model produce very
        // different fixes, and the API tells us which is which: 400
        // INVALID_ARGUMENT for a bad key, 404 NOT_FOUND for a bad model, 429
        // for quota.
        throw new Error(describeGenerationFailure(primaryModelName, error));
    }
}

/**
 * Turn a Gemini SDK failure into a message that names the actual cause.
 *
 * Exported for unit tests. Pure: no VS Code, no network.
 *
 * The failure modes are not interchangeable. An expired key, a retired model
 * and an exhausted quota each need a different action from the user, and the
 * previous message sent all three to the model setting.
 */
export function describeGenerationFailure(modelName: string, error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    const text = raw.toLowerCase();

    if (text.includes('api key not valid') || text.includes('api_key_invalid') || text.includes('invalid_argument') && text.includes('api key')) {
        return (
            'Your Gemini API key was rejected. Run "C4X: Set Gemini API Key" from the Command Palette to enter a current one. ' +
            'Keys from Google AI Studio expire and can be revoked. ' +
            `(Model "${modelName}" was never reached.)`
        );
    }

    if (text.includes('permission_denied') || text.includes('permission denied')) {
        return (
            'Your Gemini API key was refused for this request. Check that the key is enabled for the ' +
            'Generative Language API and that billing is active on its project. ' +
            `(Model "${modelName}".)`
        );
    }

    if (text.includes('not found') || text.includes('not_found') || text.includes('is not supported')) {
        return (
            `The model "${modelName}" is not available to your API key. It may have been retired, or your ` +
            'key may not have access to it. Change it in Settings > C4X > AI > Model. ' +
            'See https://ai.google.dev/gemini-api/docs/models for what is currently available.'
        );
    }

    if (text.includes('quota') || text.includes('resource_exhausted') || text.includes('429')) {
        return (
            `You have hit the rate limit or quota for "${modelName}". Wait and retry, or use a key with ` +
            'a paid tier. Free-tier keys are rate-limited per minute and per day.'
        );
    }

    if (text.includes('fetch failed') || text.includes('enotfound') || text.includes('etimedout') || text.includes('network')) {
        return (
            'Could not reach the Gemini API. Check your network connection or proxy settings. ' +
            `(Model "${modelName}".)`
        );
    }

    // Unrecognised: pass the API's own words through rather than inventing a
    // diagnosis. An opaque message the user can search beats a confident wrong one.
    return (
        `AI generation failed with "${modelName}": ${raw || 'no error detail was returned'}. ` +
        'If this names a model problem, change it in Settings > C4X > AI > Model.'
    );
}
