// Generation through the VS Code Language Model API (#392): the `vscode-lm`
// provider behind `c4x.ai.provider`.
//
// C4X asks VS Code for a chat model the user already has (GitHub Copilot, or a
// model another extension provides) and sends it the generation prompt. VS Code
// owns access, the consent dialog and quota; C4X holds no key, reads no other
// tool's credentials and never sees a token. The answer runs through the same
// provider-neutral loop as Gemini (`runRepairLoop`: parse, repair with the
// parser's error, three attempts at most). There is no failover: a failure is
// reported, because switching silently to another model would spend the user's
// allowance on something they did not choose.
//
// Everything that touches `vscode.lm` takes it as an argument (`host`), so unit
// tests pass a stub and no real model is ever called from a test. This module
// is loaded only when the provider is chosen (see GenerateDiagramCommand and
// selectModel), never at activation.

import type * as vscode from 'vscode';
import { C4XParser } from '../../parser/C4XParser';
import { ATTEMPTS_PER_MODEL, type CompleteFn, runRepairLoop } from '../generationLoop';

/** Shown by VS Code with its consent request: why C4X wants a model. */
/** The first VS Code release whose Stable build offers the Language Model API. */
export const LM_API_MIN_VSCODE = '1.91';

export const LM_JUSTIFICATION =
    'C4X asks a language model to draft a C4 diagram from the context you chose. ' +
    'C4X checks the draft with its own parser before inserting it.';

/** The parts of the VS Code API this provider uses, so tests can pass a stub. */
/* eslint-disable @typescript-eslint/naming-convention -- names are VS Code's own API */
export interface LanguageModelHost {
    readonly lm?: {
        selectChatModels?: (selector?: vscode.LanguageModelChatSelector) => Thenable<readonly vscode.LanguageModelChat[]>;
        onDidChangeChatModels?: vscode.Event<void>;
    };
    readonly LanguageModelChatMessage?: {
        User: (content: string) => vscode.LanguageModelChatMessage;
    };
}
/* eslint-enable @typescript-eslint/naming-convention */

/** A guessed cost tier. A guess: the API reports no tier, price or rank. */
export type ModelTierGuess = 'small' | 'mid' | 'large';

/** One model the user can choose, as C4X lists it. */
export interface LanguageModelChoice {
    readonly id: string;
    readonly name: string;
    readonly vendor: string;
    readonly family: string;
    readonly maxInputTokens: number;
    readonly tier: ModelTierGuess;
}

/**
 * `true` when this host has the Language Model API.
 *
 * C4X supports VS Code 1.90 and later (`engines.vscode`, a maintainer
 * decision). The API is Stable from 1.91 (1.91 release notes), and editor forks
 * may lack it or gate it, so the provider checks for `vscode.lm` and every
 * method it calls before each use. A host that throws when `vscode.lm` is read
 * counts as not having it.
 */
export function isLanguageModelApiAvailable(host: LanguageModelHost): boolean {
    try {
        return typeof host.lm?.selectChatModels === 'function'
            && typeof host.LanguageModelChatMessage?.User === 'function';
    } catch {
        return false;
    }
}

// Words that mark a model's size within its family. They describe tiers, not
// models, so no model name is written down here and nothing goes stale.
const SMALL_TIER_WORDS = ['mini', 'nano', 'lite', 'flash', 'haiku', 'small', 'tiny', 'fast'];
const LARGE_TIER_WORDS = ['opus', 'ultra', 'max', 'large', 'pro', 'xl'];

/**
 * Guess a model's cost tier from the whole words in its family, name and id.
 * Anything without a tier word counts as mid tier. A guess, shown as one: it
 * says nothing about what a request costs.
 */
export function guessModelTier(model: Pick<vscode.LanguageModelChat, 'family' | 'name' | 'id'>): ModelTierGuess {
    const words = `${model.family} ${model.name} ${model.id}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    if (words.some(word => LARGE_TIER_WORDS.includes(word))) {
        return 'large';
    }
    if (words.some(word => SMALL_TIER_WORDS.includes(word))) {
        return 'small';
    }
    return 'mid';
}

export function toChoice(model: vscode.LanguageModelChat): LanguageModelChoice {
    return {
        id: model.id,
        name: model.name,
        vendor: model.vendor,
        family: model.family,
        maxInputTokens: model.maxInputTokens,
        tier: guessModelTier(model),
    };
}

const TIER_PREFERENCE: Record<ModelTierGuess, number> = { mid: 0, small: 1, large: 2 };

/**
 * The model C4X proposes when none is chosen: mid tier, then small, then large;
 * within a tier the largest context window, then id, so the proposal is stable.
 * Only a proposal: the user confirms it before any request is sent.
 */
export function proposeDefaultModel<T extends Pick<vscode.LanguageModelChat, 'id' | 'family' | 'name' | 'maxInputTokens'>>(
    models: readonly T[],
): T | undefined {
    return [...models].sort((a, b) =>
        TIER_PREFERENCE[guessModelTier(a)] - TIER_PREFERENCE[guessModelTier(b)]
        || b.maxInputTokens - a.maxInputTokens
        || a.id.localeCompare(b.id))[0];
}

/** Why the Language Model route could not run, before or outside a request. */
export type LanguageModelUnavailableKind = 'no-api' | 'no-model' | 'model-missing' | 'cancelled' | 'invalid-output';

export class LanguageModelUnavailableError extends Error {
    constructor(public readonly kind: LanguageModelUnavailableKind, public readonly modelId?: string, public readonly detail?: string) {
        super({
            'no-api': 'Language Model API not available',
            'no-model': 'No language model available',
            'model-missing': `Language model "${modelId ?? ''}" is not available`,
            'cancelled': 'Generation cancelled',
            'invalid-output': 'The model did not produce valid C4X',
        }[kind]);
        this.name = 'LanguageModelUnavailableError';
    }
}

/**
 * Every chat model VS Code offers this extension. Throws `no-api` on a host
 * without the API; a discovery failure (VS Code's own error) propagates so the
 * caller reports it with the rest. Listing sends no request.
 */
export async function listLanguageModels(host: LanguageModelHost): Promise<readonly vscode.LanguageModelChat[]> {
    if (!isLanguageModelApiAvailable(host)) {
        throw new LanguageModelUnavailableError('no-api');
    }
    return await host.lm!.selectChatModels!();
}

/**
 * One request to `model` as the loop's `complete`: a single user message (the
 * API has no system role), VS Code's consent flow on the first request (C4X
 * passes `justification` and nothing else), the streamed text joined. A
 * cancelled token rejects with `cancelled`, before or during the request.
 */
export function languageModelCompletion(
    host: LanguageModelHost,
    model: vscode.LanguageModelChat,
    token?: vscode.CancellationToken,
): CompleteFn {
    return async prompt => {
        if (token?.isCancellationRequested) {
            throw new LanguageModelUnavailableError('cancelled');
        }
        const messages = [host.LanguageModelChatMessage!.User(prompt)];
        const response = await model.sendRequest(messages, { justification: LM_JUSTIFICATION }, token);
        let text = '';
        for await (const fragment of response.text) {
            if (token?.isCancellationRequested) {
                throw new LanguageModelUnavailableError('cancelled');
            }
            text += fragment;
        }
        // Cancelled while the stream was finishing: the answer is discarded.
        if (token?.isCancellationRequested) {
            throw new LanguageModelUnavailableError('cancelled');
        }
        return text;
    };
}

/**
 * Generate one diagram with `model`. Must run from a user action: the first
 * request may show VS Code's consent dialog. Throws the request's own error (a
 * `LanguageModelError`), `cancelled`, or `invalid-output` when the third
 * answer still fails to parse. No failover to another model.
 */
export async function generateWithLanguageModel(
    host: LanguageModelHost,
    model: vscode.LanguageModelChat,
    prompt: string,
    options: { token?: vscode.CancellationToken; progress?: vscode.Progress<{ message?: string }> } = {},
): Promise<string> {
    const request = languageModelCompletion(host, model, options.token);
    let requestFailed = false;
    const complete: CompleteFn = async prompt => {
        try {
            return await request(prompt);
        } catch (error) {
            requestFailed = true;
            throw error;
        }
    };
    try {
        const source = await runRepairLoop(complete, model.name || model.id, prompt, 1, ATTEMPTS_PER_MODEL, new C4XParser(), options.progress);
        // Cancelled after the last answer arrived but before it is handed on:
        // nothing may be inserted.
        if (options.token?.isCancellationRequested) {
            throw new LanguageModelUnavailableError('cancelled');
        }
        return source;
    } catch (error) {
        // A request cancelled through the token may reject with VS Code's own
        // cancellation error; report it as a cancellation, not a failure.
        if (options.token?.isCancellationRequested) {
            throw new LanguageModelUnavailableError('cancelled');
        }
        if (!requestFailed) {
            // Every request succeeded and the last answer still failed to parse.
            const message = error instanceof Error ? error.message : String(error);
            throw new LanguageModelUnavailableError('invalid-output', model.id, message);
        }
        throw error;
    }
}

/** What a failure on this route means for the user. */
export type LanguageModelFailureKind =
    | LanguageModelUnavailableKind
    | 'no-consent'
    | 'blocked'
    | 'model-gone'
    | 'model-error'
    | 'other';

/**
 * Classify a failure. `LanguageModelError.code` is the name of the factory that
 * made it (`NoPermissions`, `Blocked`, `NotFound`) or `Unknown`, with the
 * model's own error in `cause`.
 */
export function classifyLanguageModelFailure(error: unknown): LanguageModelFailureKind {
    if (error instanceof LanguageModelUnavailableError) {
        return error.kind;
    }
    const fields = typeof error === 'object' && error !== null ? error as { code?: unknown; name?: unknown } : {};
    if (fields.name === 'Canceled' || fields.name === 'CancellationError') {
        return 'cancelled';
    }
    switch (fields.code) {
        case 'NoPermissions':
            return 'no-consent';
        case 'Blocked':
            return 'blocked';
        case 'NotFound':
            return 'model-gone';
        case 'Unknown':
            return 'model-error';
        default:
            return 'other';
    }
}

function detailOf(error: unknown): string {
    const cause = typeof error === 'object' && error !== null ? (error as { cause?: unknown }).cause : undefined;
    const source = cause instanceof Error ? cause : error;
    const message = source instanceof Error ? source.message : String(source ?? '');
    return message.replace(/[.\s]+$/, '') || 'no detail was returned';
}

/** A message that names the cause and the fix. */
export function describeLanguageModelFailure(error: unknown, modelLabel?: string): string {
    const model = modelLabel ? `"${modelLabel}"` : 'the language model';
    switch (classifyLanguageModelFailure(error)) {
        case 'no-api':
            return `This editor does not offer the VS Code Language Model API. It needs VS Code ${LM_API_MIN_VSCODE} or later. ` +
                'Set "c4x.ai.provider" to "gemini" and use a Gemini API key, or generate from an AI assistant with the C4X skill.';
        case 'no-model':
            return 'VS Code offered no chat model to C4X. Install and sign in to a model provider such as GitHub Copilot, ' +
                'or set "c4x.ai.provider" to "gemini" and use a Gemini API key.';
        case 'model-missing': {
            const id = error instanceof LanguageModelUnavailableError && error.modelId ? `"${error.modelId}"` : 'The chosen model';
            return `The chosen language model ${id} is not offered by VS Code any more. ` +
                'Run "C4X: Select AI Model" to choose another. C4X does not switch models for you.';
        }
        case 'cancelled':
            return 'Generation cancelled. Nothing was inserted.';
        case 'invalid-output': {
            const detail = error instanceof LanguageModelUnavailableError && error.detail ? error.detail.replace(/[.\s]+$/, '') : 'no detail';
            return `${model[0].toUpperCase()}${model.slice(1)} did not produce valid C4X after ${ATTEMPTS_PER_MODEL} attempts: ${detail}. ` +
                'Retry, or run "C4X: Select AI Model" to choose another model.';
        }
        case 'no-consent':
            return `C4X was not given access to ${model}. Run the command again and allow access when VS Code asks.`;
        case 'blocked':
            return `${model[0].toUpperCase()}${model.slice(1)} refused the request, usually because a quota or rate limit was reached. ` +
                'Wait and retry, or run "C4X: Select AI Model" to choose another model.';
        case 'model-gone':
            return `${model[0].toUpperCase()}${model.slice(1)} is no longer available. Run "C4X: Select AI Model" to choose another and retry.`;
        case 'model-error':
            return `${model[0].toUpperCase()}${model.slice(1)} returned an error: ${detailOf(error)}.`;
        default:
            return `Generation with ${model} failed: ${detailOf(error)}.`;
    }
}
