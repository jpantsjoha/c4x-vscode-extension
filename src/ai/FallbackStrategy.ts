// Smart model fallback / elevation logic for the C4X AI Agent.
//
// Independently testable — no VS Code UI dependencies beyond progress reporting.

import type { GenerateContentClient } from './geminiClient';
import * as vscode from 'vscode';
import { C4XParser } from '../parser/C4XParser';
import { DEFAULT_MODEL, PRO_MODEL } from './models';
import type { ModelResolution } from './modelResolution';
import { executeWithRetry } from './SyntaxValidator';

// BUILD_ID for debugging version issues
const BUILD_ID = '20260502-V140-FLASH-DEFAULT';

export interface FallbackOptions {
    /**
     * The id to call first. Pass it whenever the caller has resolved the id
     * itself — runtime discovery can substitute a model, and re-reading the
     * setting here would call and report the wrong name and pick the wrong
     * failover.
     */
    primaryModelName?: string;
    /**
     * Called when the primary fails because the model itself is gone: returns
     * a replacement id, or undefined when there is nothing better. Supplied by
     * GeminiService, which owns discovery.
     */
    heal?: (failedModelName: string) => Promise<ModelResolution | undefined>;
    /** Called only when the initially selected model has returned a valid result. */
    onPrimaryModelServed?: (modelName: string) => void;
    /** Called only after a call-time replacement has returned a valid result. */
    onHealedModelServed?: (from: string, to: string) => void;
}

/**
 * Generate C4X DSL with automatic model fallback.
 *
 * Strategy:
 *   1. Try the user's configured model (or DEFAULT_MODEL).
 *   2. If it failed because that model is gone, heal once and retry.
 *   3. If it failed for any other reason, elevate to PRO_MODEL (unless already on it).
 *   4. If that also fails, surface a clear error.
 *
 * Each model attempt includes up to `maxRetries` self-correction passes
 * via the parser-driven retry loop in SyntaxValidator.
 */
export async function generateWithFallback(
    client: GenerateContentClient,
    prompt: string,
    progress?: vscode.Progress<{ message?: string }>,
    options: FallbackOptions = {}
): Promise<string> {
    console.log(`[FallbackStrategy] BUILD_ID: ${BUILD_ID}`);

    const parser = new C4XParser();
    const maxRetries = 3; // Integrated self-correction

    const config = vscode.workspace.getConfiguration('c4x.ai');
    // Default to gemini-3-flash-preview (fast, free-tier). User can override via settings.
    const primaryModelName = options.primaryModelName || config.get<string>('model') || DEFAULT_MODEL;

    try {
        const result = await executeWithRetry(client, primaryModelName, prompt, 1, maxRetries, parser, progress);
        options.onPrimaryModelServed?.(primaryModelName);
        return result;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
        // Every model that failed, in order, so the final error can name them all.
        const failed: FailedAttempt[] = [{ model: primaryModelName, error }];

        // The model is gone: heal to the newest GA id in the same tier and try
        // that once, ahead of the tier failover. A key that cannot reach the
        // primary usually cannot reach PRO_MODEL either, so healing first turns
        // a two-failure error into a generated diagram.
        if (options.heal && isModelUnavailableError(error)) {
            const healed = await options.heal(primaryModelName);
            const healedName = healed?.model;
            if (healedName && healedName !== primaryModelName) {
                progress?.report({ message: `"${primaryModelName}" is unavailable. Trying ${healedName}...` });
                console.warn(`[FallbackStrategy] "${primaryModelName}" is unavailable: ${error.message}. Healed to "${healedName}".`);
                try {
                    const result = await executeWithRetry(client, healedName, prompt, 1, maxRetries, parser, progress);
                    options.onHealedModelServed?.(primaryModelName, healedName);
                    return result;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } catch (healedError: any) {
                    console.error(`[FallbackStrategy] Healed "${healedName}" also failed: ${healedError.message}`);
                    failed.push({ model: healedName, error: healedError });
                }
            }
        }

        // Smart fallback: Elevate to PRO_MODEL if user's default model fails.
        // If already on pro, no further fallback — surface the error.
        let fallbackModelName = PRO_MODEL;
        if (primaryModelName === PRO_MODEL) {
            fallbackModelName = DEFAULT_MODEL;
        }

        if (primaryModelName !== fallbackModelName) {
            progress?.report({ message: `Model failed. Trying ${fallbackModelName}...` });
            console.warn(`[FallbackStrategy] "${primaryModelName}" failed: ${error.message}. Falling back to "${fallbackModelName}".`);

            try {
                return await executeWithRetry(client, fallbackModelName, prompt, 1, maxRetries, parser, progress);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (fallbackError: any) {
                console.error(`[FallbackStrategy] Fallback "${fallbackModelName}" also failed: ${fallbackError.message}`);
                // The failover's own cause leads; the earlier failures follow
                // as context. This used to report the primary's error alone,
                // so a withdrawn failover read as a primary-model problem and
                // the failover was never mentioned (#187).
                throw new Error(describeFailoverFailure({ model: fallbackModelName, error: fallbackError }, failed));
            }
        }

        // No failover ran. Say why the primary failed.
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

/** One model that was called and failed. */
export interface FailedAttempt {
    model: string;
    error: unknown;
}

/**
 * The error for a generation whose failover also failed (#187).
 *
 * The failover's cause leads, because it is the last thing that went wrong and
 * the one to act on: a withdrawn preview failover must read as exactly that.
 * Every earlier failure follows, in order, so the user can see what was tried
 * and why each step moved on — the primary, and a heal replacement if one ran.
 *
 * Exported for unit tests. Pure: no VS Code, no network.
 */
export function describeFailoverFailure(failover: FailedAttempt, earlier: readonly FailedAttempt[]): string {
    // The failover is always a model C4X chose (PRO_MODEL, or DEFAULT_MODEL when
    // the primary was PRO_MODEL), never the user's setting. A withdrawn failover
    // is fixed by an extension update, not by changing Settings.
    const lead = classifyGenerationFailure(failover.error) === 'model-unavailable'
        ? `The built-in failover model "${failover.model}" is not available to your API key; it may have been withdrawn. ` +
          'Retry, or update C4X to get a current failover model.'
        : describeGenerationFailure(failover.model, failover.error);
    if (earlier.length === 0) {
        return lead;
    }
    const history = earlier
        .map(attempt => `"${attempt.model}" failed: ${briefFailureCause(attempt.error).replace(/[.\s]+$/, '')}`)
        .join('; then ');
    return `${lead} This was the failover. Before it, ${history}.`;
}

/**
 * True when the API said the model itself is the problem: retired, renamed, or
 * never granted to this key. The service answers 404 NOT_FOUND for all three —
 * "models/x is not found for API version v1beta, or is not supported for
 * generateContent".
 *
 * Deliberately narrow. A rejected key, an exhausted quota and a dead network
 * are not model problems, and healing away from a perfectly good model because
 * the key expired would hide the real fault.
 */
export function isModelUnavailableError(error: unknown): boolean {
    const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
    if (text.includes('api key not valid') || text.includes('api_key_invalid')) {
        return false;
    }

    const status = typeof error === 'object' && error !== null
        ? (error as { status?: unknown }).status
        : undefined;
    if (status === 404) {
        return true;
    }

    return text.includes('models/') && (
        text.includes('not found') || text.includes('is not supported for generatecontent')
    );
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
    const kind = classifyGenerationFailure(error);

    if (kind === 'key-rejected') {
        return (
            'Your Gemini API key was rejected. Run "C4X: Set Gemini API Key" from the Command Palette to enter a current one. ' +
            'Keys from Google AI Studio expire and can be revoked. ' +
            `(Model "${modelName}" was never reached.)`
        );
    }

    if (kind === 'key-refused') {
        return (
            'Your Gemini API key was refused for this request. Check that the key is enabled for the ' +
            'Generative Language API and that billing is active on its project. ' +
            `(Model "${modelName}".)`
        );
    }

    if (kind === 'model-unavailable') {
        return (
            `The model "${modelName}" is not available to your API key. It may have been retired, or your ` +
            'key may not have access to it. Change it in Settings > C4X > AI > Model. ' +
            'See https://ai.google.dev/gemini-api/docs/models for what is currently available.'
        );
    }

    if (kind === 'quota') {
        return (
            `You have hit the rate limit or quota for "${modelName}". Wait and retry, or use a key with ` +
            'a paid tier. Free-tier keys are rate-limited per minute and per day.'
        );
    }

    if (kind === 'network') {
        return (
            'Could not reach the Gemini API. Check your network connection or proxy settings. ' +
            `(Model "${modelName}".)`
        );
    }

    // Unrecognised: pass the API's own words through rather than inventing a
    // diagnosis. An opaque message the user can search beats a confident wrong one.
    return (
        `AI generation failed with "${modelName}": ${(apiErrorText(error) || 'no error detail was returned').replace(/[.\s]+$/, '')}. ` +
        'If this names a model problem, change it in Settings > C4X > AI > Model.'
    );
}

/** What kind of failure a Gemini call reported. */
export type GenerationFailureKind = 'key-rejected' | 'key-refused' | 'model-unavailable' | 'quota' | 'network' | 'unrecognised';

/**
 * Classify a Gemini failure from what the API said. Checked in this order,
 * because the texts overlap: a rejected key arrives as a 400 INVALID_ARGUMENT,
 * and must never be read as a model problem that would trigger a heal.
 */
export function classifyGenerationFailure(error: unknown): GenerationFailureKind {
    const text = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();

    if (text.includes('api key not valid') || text.includes('api_key_invalid') || text.includes('invalid_argument') && text.includes('api key')) {
        return 'key-rejected';
    }
    if (text.includes('permission_denied') || text.includes('permission denied')) {
        return 'key-refused';
    }
    if (isModelUnavailableError(error)) {
        return 'model-unavailable';
    }
    if (text.includes('quota') || text.includes('resource_exhausted') || text.includes('429')) {
        return 'quota';
    }
    if (text.includes('fetch failed') || text.includes('enotfound') || text.includes('etimedout') || text.includes('network')) {
        return 'network';
    }
    return 'unrecognised';
}

/** A few words for why an earlier attempt failed: context, not the diagnosis. */
function briefFailureCause(error: unknown): string {
    switch (classifyGenerationFailure(error)) {
        case 'key-rejected':
            return 'the API key was rejected';
        case 'key-refused':
            return 'the API key was refused for this request';
        case 'model-unavailable':
            return 'the model is not available to your API key';
        case 'quota':
            return 'rate limit or quota reached';
        case 'network':
            return 'the Gemini API could not be reached';
        default:
            return apiErrorText(error) || 'no error detail was returned';
    }
}

/**
 * The API's own words for a failure, without the SDK's envelope.
 *
 * `@google/genai` throws an ApiError whose message is the API's whole JSON
 * error body — `{"error":{"code":503,"message":"The model is overloaded…",
 * "status":"UNAVAILABLE"}}`. Shown as-is, that is the API's words buried in
 * syntax. This renders `503 UNAVAILABLE: The model is overloaded…` instead.
 * Anything that is not such a body passes through unchanged. Classification
 * never uses this: it reads the raw text, status fields included.
 */
export function apiErrorText(error: unknown): string {
    const raw = error instanceof Error ? error.message : String(error ?? '');
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return raw;
    }
    const body = typeof parsed === 'object' && parsed !== null ? (parsed as { error?: unknown }).error : undefined;
    if (typeof body !== 'object' || body === null) {
        return raw;
    }
    const { code, status, message } = body as { code?: unknown; status?: unknown; message?: unknown };
    if (typeof message !== 'string' || message.trim() === '') {
        return raw;
    }
    const prefix = [code, status]
        .filter(part => typeof part === 'number' || (typeof part === 'string' && part !== ''))
        .join(' ');
    // A body that is not JSON — a proxy's or gateway's error page — reaches us
    // as the SDK's envelope around the raw markup. The old SDK dropped such a
    // body and showed only "[502 Bad Gateway]"; pasting a whole HTML page into
    // a notification is worse than that. Keep the status, name the cause.
    if (/^\s*</.test(message)) {
        const summary = 'the server answered with an HTML page, not a Gemini API error; a proxy may be in the way';
        return prefix ? `${prefix}: ${summary}` : summary;
    }
    return prefix ? `${prefix}: ${message}` : message;
}
