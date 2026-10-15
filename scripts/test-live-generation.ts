#!/usr/bin/env ts-node
/**
 * Live generation gate.
 *
 * Every other gate in this repo mocks the model. That is why v1.6.3 shipped a
 * default image model that had been retired for three weeks, and why nobody
 * noticed until a user right-clicked Generate: 1,351 unit tests, 117 browser
 * tests and a clean-VSIX smoke all passed without one real API call.
 *
 * This calls the Gemini API for real, against the exact model ids the
 * extension ships, and parses what comes back with the extension's own parser.
 * A model that has been retired, renamed, or is not granted to the key fails
 * here rather than in a user's editor.
 *
 * Every call goes through the extension's own client code in
 * src/ai/geminiClient.ts — the `@google/genai` client it builds, the response
 * reader and the model-list call — so the gate proves the SDK path users run,
 * not just that the model ids answer a hand-written request. A text model is
 * called through SyntaxValidator.executeWithRetry, the function generation
 * calls for every model attempt, so the answer is read, de-fenced and parsed by
 * the same code a user's diagram is. The gate allows it one attempt, not the
 * three a user gets: a model that needs self-correction to answer this prompt
 * is a finding, not a pass.
 *
 * Key resolution, first WORKING key wins:
 *   GEMINI_API_KEY, then GEMINI_API_KEY_FALLBACK, from the environment only.
 *   No .env file is read: keys come from environment variables.
 *
 * Each candidate is probed before use, so an expired primary key falls through
 * to the fallback rather than failing the whole gate. Keys expire; that should
 * cost you a retry, not a red build.
 *
 * Without a key it SKIPS rather than fails, so CI without secrets stays green.
 * Before a release, run it with a key. `make check-full` does.
 *
 * Run: pnpm run test:live
 */

import * as path from 'path';
import type { GenerateContentResponse } from '@google/genai';
import type { executeWithRetry as ExecuteWithRetry } from '../src/ai/SyntaxValidator';
import { C4XParser } from '../src/parser/C4XParser';
import { createGeminiClient, fetchModelList } from '../src/ai/geminiClient';
import {
    DEFAULT_MODEL,
    PRO_MODEL,
    LITE_MODEL,
    DEFAULT_IMAGE_MODEL,
    PRO_IMAGE_MODEL,
    LITE_IMAGE_MODEL,
} from '../src/ai/models';

const ROOT = path.resolve(__dirname, '..');

/**
 * SyntaxValidator imports `vscode`: for its progress type, and through
 * PromptBuilder for workspace reads that a single attempt never makes. Outside
 * VS Code that import resolves to the unit tier's stand-in, which is enough for
 * both. Loaded on first use, after the resolver is in place.
 */
let executeWithRetryLoaded: typeof ExecuteWithRetry | undefined;
function loadExecuteWithRetry(): typeof ExecuteWithRetry {
    if (executeWithRetryLoaded) {
        return executeWithRetryLoaded;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Module = require('module');
    const resolve = Module._resolveFilename;
    const standIn = path.join(ROOT, 'src', '__tests__', '__mocks__', 'vscode.ts');
    Module._resolveFilename = function (request: string, ...args: unknown[]) {
        return resolve.call(this, request === 'vscode' ? standIn : request, ...args);
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    executeWithRetryLoaded = (require('../src/ai/SyntaxValidator') as typeof import('../src/ai/SyntaxValidator')).executeWithRetry;
    return executeWithRetryLoaded;
}

const KEY_NAMES = ['GEMINI_API_KEY', 'GEMINI_API_KEY_FALLBACK'];

function candidateKeys(): Array<{ name: string; value: string }> {
    const found: Array<{ name: string; value: string }> = [];
    const seen = new Set<string>();

    const add = (name: string, value: string | undefined) => {
        if (value && !seen.has(value)) {
            seen.add(value);
            found.push({ name, value });
        }
    };

    for (const name of KEY_NAMES) {
        add(`${name} (env)`, process.env[name]);
    }

    return found;
}

/**
 * Probe a key with the cheapest call there is, so a dead key is skipped not
 * fatal. The model list is free, and fetchModelList never throws: a rejected
 * key comes back as an empty list.
 */
async function keyWorks(key: string): Promise<boolean> {
    return (await fetchModelList(key, 15_000)).length > 0;
}

async function resolveKey(): Promise<{ key: string; source: string } | undefined> {
    const candidates = candidateKeys();
    for (const candidate of candidates) {
        if (await keyWorks(candidate.value)) {
            return { key: candidate.value, source: candidate.name };
        }
        console.log(`  ${candidate.name}: rejected, trying the next candidate`);
    }
    return undefined;
}

interface Result {
    model: string;
    role: string;
    ok: boolean;
    detail: string;
}

const results: Result[] = [];

/** One line from an SDK error: the API's code, status and message when it sent them. */
function errorDetail(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    try {
        // @google/genai's ApiError carries the API's JSON error body as its message.
        const body = JSON.parse(message)?.error ?? {};
        const code = body.code ?? (error as { status?: number }).status ?? '';
        return `${code} ${body.status ?? ''} ${String(body.message ?? '').slice(0, 90)}`;
    } catch {
        return message.slice(0, 90);
    }
}

/**
 * How long one model call may take. 120 s; C4X_LIVE_TIMEOUT_MS overrides it,
 * which only the dry-run test does, to prove the deadline without waiting.
 */
const CALL_TIMEOUT_MS = Number(process.env.C4X_LIVE_TIMEOUT_MS) > 0 ? Number(process.env.C4X_LIVE_TIMEOUT_MS) : 120_000;

/** A client whose every request the SDK aborts at the call deadline. */
function clientWithDeadline(key: string): ReturnType<typeof createGeminiClient> {
    return createGeminiClient(key, { timeoutMs: CALL_TIMEOUT_MS });
}

/**
 * Bound one live call. The deadline is enforced by the transport: the client
 * from clientWithDeadline aborts the HTTP request, so the next model never
 * starts while this one is still open, and a late answer is never read. It
 * used to be a Promise.race, which stopped waiting but left the request
 * running.
 *
 * The timer here is only a backstop, a few seconds after the deadline, for a
 * call that somehow outlives its abort. It also holds the process open: the
 * SDK's own deadline timer is unref'd, and a pending fetch alone does not
 * always keep Node running.
 */
const BACKSTOP_GRACE_MS = 5_000;
async function withTimeout<T>(work: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; detail: string }> {
    const noAnswer = `no answer within ${CALL_TIMEOUT_MS / 1000} s`;
    let timer: NodeJS.Timeout | undefined;
    const backstop = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${noAnswer}, and the request outlived its abort`)), CALL_TIMEOUT_MS + BACKSTOP_GRACE_MS);
    });
    try {
        return { ok: true, value: await Promise.race([work, backstop]) };
    } catch (error) {
        const aborted = error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
        return { ok: false, detail: aborted ? `${noAnswer}; the request was cancelled` : errorDetail(error) };
    } finally {
        clearTimeout(timer);
    }
}

/** Call a model exactly as the extension does: its client, a prompt and no config. */
async function callModel(
    key: string,
    model: string,
    contents: string,
): Promise<{ ok: true; response: GenerateContentResponse } | { ok: false; detail: string }> {
    const call = await withTimeout(clientWithDeadline(key).then(client => client.models.generateContent({ model, contents })));
    return call.ok ? { ok: true, response: call.value } : call;
}

/** A text model must return C4X the extension's own parser accepts. */
async function checkTextModel(key: string, model: string, role: string): Promise<void> {
    const prompt =
        'Output ONLY a C4X diagram, no prose and no code fences. Exactly this shape:\n' +
        '%%{ c4: system-context }%%\n' +
        'graph TB\n' +
        '    User[Customer<br/>Person]\n' +
        '    App[Banking System<br/>Software System]\n' +
        '    User -->|Uses| App';

    try {
        // One attempt through the generation path: the extension's client, its
        // reader (throws for a blocked answer), its fence cleaner and its parser.
        // It throws when the API refuses, the answer is blocked or empty, or the
        // C4X does not parse; errorDetail reports which.
        const executeWithRetry = loadExecuteWithRetry();
        const call = await withTimeout(
            clientWithDeadline(key).then(client => executeWithRetry(client, model, prompt, 1, 1, new C4XParser())),
        );
        if (!call.ok) {
            results.push({ model, role, ok: false, detail: call.detail });
            return;
        }

        // The output survived the real parser. Count what it drew, so a
        // degenerate diagram does not pass.
        const parsed = new C4XParser().parse(call.value);
        const elements = parsed?.elements?.length ?? 0;
        if (elements < 2) {
            results.push({ model, role, ok: false, detail: `parsed but only ${elements} element(s)` });
            return;
        }
        results.push({ model, role, ok: true, detail: `parsed ${elements} elements, ${parsed?.relationships?.length ?? 0} relationships` });
    } catch (error) {
        results.push({ model, role, ok: false, detail: error instanceof Error ? error.message.slice(0, 90) : String(error) });
    }
}

/** An image model must return actual image bytes, not a text apology. */
async function checkImageModel(key: string, model: string, role: string): Promise<void> {
    try {
        const call = await callModel(
            key,
            model,
            'A simple architecture diagram: one blue box labelled "Web App" connected by an arrow to one grey box labelled "Database".',
        );
        if (!call.ok) {
            results.push({ model, role, ok: false, detail: call.detail });
            return;
        }

        // Read the parts the way GeminiService.generateVisualDiagram does.
        const parts = call.response.candidates?.[0]?.content?.parts ?? [];
        const image = parts.find(p => p.inlineData?.data && p.inlineData.mimeType?.startsWith('image/'));
        if (!image) {
            const text = parts.map(p => p.text ?? '').join('').slice(0, 70);
            results.push({ model, role, ok: false, detail: `no image bytes returned${text ? `; said "${text}"` : ''}` });
            return;
        }
        const bytes = Buffer.from(image.inlineData?.data ?? '', 'base64');
        const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50;
        results.push({
            model,
            role,
            ok: bytes.length > 1000,
            detail: `${(bytes.length / 1024).toFixed(0)} KB ${isPng ? 'PNG' : 'image'}`,
        });
    } catch (error) {
        results.push({ model, role, ok: false, detail: error instanceof Error ? error.message.slice(0, 90) : String(error) });
    }
}

async function main(): Promise<void> {
    const resolved = await resolveKey();
    if (!resolved) {
        if (process.env.C4X_REQUIRE_LIVE === '1') {
            console.error('Live generation gate: REQUIRED but no working Gemini key is available.');
            process.exit(1);
        }
        console.log('Live generation gate: SKIPPED (no working key in GEMINI_API_KEY or GEMINI_API_KEY_FALLBACK)');
        console.log('  Run with a key before releasing. This is the only gate that proves the');
        console.log('  shipped model ids still exist and still work.');
        process.exit(0);
    }

    const key = resolved.key;
    console.log(`Live generation gate — calling the Gemini API for real, using ${resolved.source}\n`);

    await checkTextModel(key, DEFAULT_MODEL, 'default text');
    await checkTextModel(key, PRO_MODEL, 'failover text');
    await checkTextModel(key, LITE_MODEL, 'budget text');
    await checkImageModel(key, DEFAULT_IMAGE_MODEL, 'default image');
    await checkImageModel(key, PRO_IMAGE_MODEL, 'pro image');
    await checkImageModel(key, LITE_IMAGE_MODEL, 'lite image');

    for (const r of results) {
        console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.role.padEnd(14)} ${r.model.padEnd(30)} ${r.detail}`);
    }

    // ── Discovery, through the extension's own call, against the live list ──
    try {
        // fetchModelList collapses every failure to an empty list, by design:
        // discovery must never block generation. Here, empty is a failure.
        const discovered = await fetchModelList(key, 15_000);
        if (discovered.length === 0) {
            throw new Error('Model discovery returned no models (fetchModelList reports every failure as an empty list)');
        }
        if (!discovered.some(m => m.supportedGenerationMethods?.includes('generateContent'))) {
            throw new Error('Model discovery lost supportedGenerationMethods: no model lists generateContent');
        }
        const { selectBestModel, resolveModelChoice } = await import('../src/ai/modelDiscovery');
        const { DEFAULT_MODEL, DEFAULT_IMAGE_MODEL } = await import('../src/ai/models');

        console.log('');
        console.log(`  discovery: ${discovered.length} models reachable by this key`);
        for (const [tier, pinned] of [['flash', DEFAULT_MODEL], ['flash-image', DEFAULT_IMAGE_MODEL]] as const) {
            const best = selectBestModel(discovered, tier as any);
            const choice = resolveModelChoice(pinned, discovered, 'pinned');
            const mark = choice.reason === 'pinned' ? 'PASS' : 'NOTE';
            console.log(`  ${mark}  ${tier.padEnd(12)} pinned ${pinned} · newest GA ${best ?? 'none'} · resolved ${choice.model} (${choice.reason})`);
            if (choice.reason === 'healed') {
                results.push({ model: pinned, role: `${tier} pinned`, ok: false, detail: `unreachable; would heal to ${choice.model}` });
            }
        }

        // ── A retired pin must heal to something that actually generates ────
        //
        // gemini-3.1-flash-image-preview was retired on 2026-07-17 and the API
        // still lists it, so it is dropped from the list here to stand for a
        // model the key genuinely cannot reach. That is the same list the
        // call-time heal resolves against once a 404 has proved the id dead.
        const RETIRED_PIN = 'gemini-3.1-flash-image-preview';
        const withoutRetired = discovered.filter((m: { id: string }) => m.id !== RETIRED_PIN);
        const healedChoice = resolveModelChoice(RETIRED_PIN, withoutRetired, 'pinned');
        if (healedChoice.reason !== 'healed') {
            results.push({ model: RETIRED_PIN, role: 'retired pin', ok: false, detail: 'did not heal to anything' });
        } else {
            console.log(`  ....  retired pin  ${RETIRED_PIN} heals to ${healedChoice.model}; calling it`);
            await checkImageModel(key, healedChoice.model, 'healed image');
            const healedResult = results[results.length - 1];
            console.log(`  ${healedResult.ok ? 'PASS' : 'FAIL'}  retired pin    ${RETIRED_PIN} -> ${healedChoice.model} ${healedResult.detail}`);
        }
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        results.push({ model: 'discovery', role: 'discovery', ok: false, detail });
        console.error(`  FAIL discovery: ${detail}`);
    }

    const failed = results.filter(r => !r.ok);
    console.log('');
    if (failed.length === 0) {
        console.log(`  All ${results.length} shipped models generate and parse.`);
        process.exit(0);
    }
    console.error(`  ${failed.length} of ${results.length} shipped models failed.`);
    console.error('  A failure here means users will see it too. Fix src/ai/models.ts.');
    process.exit(1);
}

void main();
