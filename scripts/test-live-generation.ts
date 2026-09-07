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
 * Key resolution, first WORKING key wins:
 *   GEMINI_API_KEY, then GEMINI_API_KEY_FALLBACK, from the environment
 *   then the same two from ./.env
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

import * as fs from 'fs';
import * as path from 'path';
import { C4XParser } from '../src/parser/C4XParser';
import {
    DEFAULT_MODEL,
    PRO_MODEL,
    LITE_MODEL,
    DEFAULT_IMAGE_MODEL,
    PRO_IMAGE_MODEL,
    LITE_IMAGE_MODEL,
} from '../src/ai/models';

const ROOT = path.resolve(__dirname, '..');
const API = 'https://generativelanguage.googleapis.com/v1beta/models';

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

    const envFile = path.join(ROOT, '.env');
    if (fs.existsSync(envFile)) {
        const contents = fs.readFileSync(envFile, 'utf8');
        for (const name of KEY_NAMES) {
            const match = contents.match(new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*["']?([^"'\\s]+)`, 'm'));
            add(`${name} (.env)`, match?.[1]);
        }
    }

    return found;
}

/** Probe a key with the cheapest call there is, so a dead key is skipped not fatal. */
async function keyWorks(key: string): Promise<boolean> {
    try {
        const response = await fetch(`${API}?key=${key}&pageSize=1`, { signal: AbortSignal.timeout(15_000) });
        return response.ok;
    } catch {
        return false;
    }
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

async function callModel(key: string, model: string, body: unknown): Promise<{ ok: boolean; json: any; detail: string }> {
    const response = await fetch(`${API}/${model}:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
    });
    const json: any = await response.json();
    if (!response.ok) {
        const error = json?.error ?? {};
        return { ok: false, json, detail: `${error.code ?? response.status} ${error.status ?? ''} ${String(error.message ?? '').slice(0, 90)}` };
    }
    return { ok: true, json, detail: '' };
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
        const { ok, json, detail } = await callModel(key, model, {
            contents: [{ parts: [{ text: prompt }] }],
        });
        if (!ok) {
            results.push({ model, role, ok: false, detail });
            return;
        }

        const text: string = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
        if (!text.trim()) {
            results.push({ model, role, ok: false, detail: 'returned no text' });
            return;
        }

        // The point of this gate: the output must survive the real parser.
        const cleaned = text.replace(/```[a-z0-9]*\n?/gi, '').trim();
        const parsed = new C4XParser().parse(cleaned);
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
        const { ok, json, detail } = await callModel(key, model, {
            contents: [{ parts: [{ text: 'A simple architecture diagram: one blue box labelled "Web App" connected by an arrow to one grey box labelled "Database".' }] }],
        });
        if (!ok) {
            results.push({ model, role, ok: false, detail });
            return;
        }

        const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
        const image = parts.find(p => p.inlineData?.data || p.inline_data?.data);
        if (!image) {
            const text = parts.map(p => p.text ?? '').join('').slice(0, 70);
            results.push({ model, role, ok: false, detail: `no image bytes returned${text ? `; said "${text}"` : ''}` });
            return;
        }
        const bytes = Buffer.from(image.inlineData?.data ?? image.inline_data?.data, 'base64');
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
        console.log('Live generation gate: SKIPPED (no working key in GEMINI_API_KEY, GEMINI_API_KEY_FALLBACK, or ./.env)');
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

    // ── Discovery, against the same live list the extension will use ────────
    try {
        const response = await fetch(`${API}?key=${key}&pageSize=200`, { signal: AbortSignal.timeout(15_000) });
        if (!response.ok) {
            throw new Error(`Model discovery returned HTTP ${response.status}`);
        }
        const json: any = await response.json();
        if (!Array.isArray(json.models) || json.models.length === 0) {
            throw new Error('Model discovery returned no models');
        }
        const discovered = (json.models ?? []).map((m: any) => ({
            id: String(m.name ?? '').replace(/^models\//, ''),
            supportedGenerationMethods: m.supportedGenerationMethods,
        }));
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
