// Where runtime discovery meets the generation path.
//
// modelDiscovery.ts decides *what* a discovery result means. This decides
// *when* that answer is used and *how* the user is told, because both of those
// need VS Code and neither belongs in a pure module.
//
// Two rules shape it:
//
//   1. Discovery is an optimisation. An empty list — no key, offline, a proxy,
//      a rate limit — must leave behaviour exactly as it was before any of this
//      existed. The configured id is called and the normal failover handles the
//      rest.
//
//   2. A substitution is announced once per session per (from, to) pair. The
//      set is module-level on purpose: GenerateDiagramCommand and
//      VisualDiagramCommand each own a separate GeminiService, and a
//      per-instance flag would announce the same swap twice.

import * as vscode from 'vscode';
import { describeModelChange, resolveModelChoice, type DiscoveredModel } from './modelDiscovery';

/** The value of `c4x.ai.modelStrategy`. */
export type ModelStrategy = 'pinned' | 'auto-ga';

export type ModelChangeReason = 'healed' | 'upgraded';

/** A substitution to announce only after `model` has served a result. */
export interface ModelChangeNotice {
    from: string;
    to: string;
    reason: ModelChangeReason;
}

/** The model selected for a call and any notification it must earn by serving. */
export interface ModelResolution {
    model: string;
    notice?: ModelChangeNotice;
}

/** (from, to) pairs already announced this session. */
const announced = new Set<string>();

/** Unit tests share one process, so the session set needs a reset. */
export function resetModelChangeNoticesForTests(): void {
    announced.clear();
}

/**
 * Read `c4x.ai.modelStrategy`.
 *
 * Anything other than `auto-ga` — unset, misspelled, a value from a newer
 * version of the extension — is treated as `pinned`, which is the conservative
 * choice and the declared default.
 */
export function readModelStrategy(): ModelStrategy {
    const configured = vscode.workspace.getConfiguration('c4x.ai').get<string>('modelStrategy');
    return configured === 'auto-ga' ? 'auto-ga' : 'pinned';
}

/**
 * Tell the user the model changed underneath them, at most once per session
 * per (from, to) pair. Silent substitution is not acceptable: a different model
 * can mean different output and a different bill.
 */
export function announceModelChange(from: string, to: string, reason: ModelChangeReason): void {
    const pair = `${from} -> ${to}`;
    if (announced.has(pair)) {
        return;
    }
    announced.add(pair);
    vscode.window.showInformationMessage(describeModelChange(from, to, reason));
}

/**
 * The id to call, resolved before the first API call.
 *
 * `pinned` keeps the configured id whenever the key can still reach it and
 * heals when it cannot; `auto-ga` also tracks the newest generally available
 * model in the tier. Neither ever selects a preview, an experimental build or
 * a `-latest` alias — `resolveModelChoice` guarantees that.
 */
export function resolveModelForGeneration(
    configured: string,
    models: DiscoveredModel[],
    strategy: ModelStrategy,
): ModelResolution {
    if (models.length === 0) {
        return { model: configured };
    }

    const { model, reason } = resolveModelChoice(configured, models, strategy);
    if (model === configured || reason === 'pinned') {
        return { model: configured };
    }

    return {
        model,
        notice: { from: configured, to: model, reason },
    };
}

/**
 * Re-resolve after a call has already failed because the model is gone.
 *
 * The failed id is dropped from the list before resolving. This is the v1.6.3
 * scenario: `models.list` kept publishing `gemini-3.1-flash-image-preview` for
 * weeks after Google retired it, so a list-based check says the id is fine
 * while the call says otherwise. The call is the stronger evidence.
 *
 * Returns undefined when nothing better exists, and the caller falls through to
 * the normal tier failover.
 */
export function healModelAfterFailure(
    failed: string,
    models: DiscoveredModel[],
    strategy: ModelStrategy,
): ModelResolution | undefined {
    if (models.length === 0) {
        return undefined;
    }

    const reachable = models.filter(m => m.id !== failed);
    const { model, reason } = resolveModelChoice(failed, reachable, strategy);
    if (model === failed || reason !== 'healed') {
        return undefined;
    }

    return {
        model,
        notice: { from: failed, to: model, reason: 'healed' },
    };
}
