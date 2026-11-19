import * as assert from 'assert';

// Mock vscode before importing modules that import it at module level.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { DEFAULT_MODEL, PRO_MODEL } from '../../ai/models';
import { fakeGenAI, textResponse } from '../__mocks__/genai';
import { generateWithFallback } from '../../ai/FallbackStrategy';
import { executeWithRetry } from '../../ai/SyntaxValidator';
import { buildFixPrompt } from '../../ai/PromptBuilder';
import { C4XParser } from '../../parser/C4XParser';

// Pins the Gemini path's observable behaviour before and after #393 (the
// provider-neutral loop): every request in order (model id and the exact
// prompt), every progress message, the returned text and the error text. The
// refactor must leave each transcript byte-for-byte identical.

const VALID = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';
const VALID_FENCED = '```c4x\n' + VALID + '\n```';
const BROKEN = 'graph TB\nPerson(user "broken';
const BROKEN_FENCED = '```c4x\n' + BROKEN + '\n```';

interface Call { model: string; contents: unknown }

/** A client that answers each model id from its own script and records every request. */
function scriptedClient(script: Record<string, Array<string | Error>>) {
    const calls: Call[] = [];
    const counts: Record<string, number> = {};
    const client = fakeGenAI(async ({ model, contents }) => {
        calls.push({ model, contents });
        const replies = script[model];
        if (!replies) {
            throw new Error(`Unexpected model: ${model}`);
        }
        const index = counts[model] = (counts[model] ?? -1) + 1;
        const reply = replies[Math.min(index, replies.length - 1)];
        if (reply instanceof Error) {
            throw reply;
        }
        return textResponse(reply);
    });
    return { client, calls };
}

function recorder() {
    const messages: string[] = [];
    return { progress: { report: (value: { message?: string }) => { if (value.message) { messages.push(value.message); } } }, messages };
}

function parserError(source: string): string {
    try {
        new C4XParser().parse(source);
    } catch (error) {
        return (error as Error).message;
    }
    throw new Error('expected a parse error');
}

describe('generation loop behaviour pin (#393)', () => {
    it('executeWithRetry: first answer valid, one call, exact progress', async () => {
        const { client, calls } = scriptedClient({ m: [VALID_FENCED] });
        const { progress, messages } = recorder();

        const result = await executeWithRetry(client, 'm', 'P', 1, 3, new C4XParser(), progress);

        assert.strictEqual(result, VALID);
        assert.deepStrictEqual(calls, [{ model: 'm', contents: 'P' }]);
        assert.deepStrictEqual(messages, ['Generating with m...', 'Validating Syntax...']);
    });

    it('executeWithRetry: repairs with the exact fix prompt built from the raw answer and the parser error', async () => {
        const { client, calls } = scriptedClient({ m: [BROKEN_FENCED, VALID_FENCED] });
        const { progress, messages } = recorder();

        const result = await executeWithRetry(client, 'm', 'P', 1, 3, new C4XParser(), progress);

        assert.strictEqual(result, VALID);
        assert.deepStrictEqual(calls, [
            { model: 'm', contents: 'P' },
            { model: 'm', contents: buildFixPrompt(BROKEN_FENCED, parserError(BROKEN)) },
        ]);
        assert.deepStrictEqual(messages, [
            'Generating with m...',
            'Validating Syntax...',
            'Syntax Error Detected. Applying Fix...',
            'Auto-Correcting Syntax Error (Attempt 2/3)...',
            'Validating Syntax...',
        ]);
    });

    it('executeWithRetry: an answer with no code block is repaired with the "No C4X code block" error', async () => {
        const { client, calls } = scriptedClient({ m: ['', VALID_FENCED] });

        await executeWithRetry(client, 'm', 'P', 1, 3, new C4XParser());

        assert.deepStrictEqual(calls[1], { model: 'm', contents: buildFixPrompt('', 'No C4X code block found in response.') });
    });

    it('executeWithRetry: three attempts, then the parser error itself is thrown', async () => {
        const { client, calls } = scriptedClient({ m: [BROKEN_FENCED] });

        await assert.rejects(
            executeWithRetry(client, 'm', 'P', 1, 3, new C4XParser()),
            (error: Error) => error.message === parserError(BROKEN),
        );
        assert.strictEqual(calls.length, 3);
        assert.deepStrictEqual(calls.map(call => call.model), ['m', 'm', 'm']);
    });

    it('executeWithRetry: a failed request is not retried by the loop', async () => {
        const { client, calls } = scriptedClient({ m: [new Error('boom')] });

        await assert.rejects(executeWithRetry(client, 'm', 'P', 1, 3, new C4XParser()), /^Error: boom$/);
        assert.strictEqual(calls.length, 1);
    });

    it('generateWithFallback: primary exhausts its three attempts, failover succeeds; full transcript', async () => {
        const { client, calls } = scriptedClient({ [DEFAULT_MODEL]: [BROKEN_FENCED], [PRO_MODEL]: [VALID_FENCED] });
        const { progress, messages } = recorder();

        const result = await generateWithFallback(client, 'P', progress, { primaryModelName: DEFAULT_MODEL });

        assert.strictEqual(result, VALID);
        const fix = buildFixPrompt(BROKEN_FENCED, parserError(BROKEN));
        assert.deepStrictEqual(calls, [
            { model: DEFAULT_MODEL, contents: 'P' },
            { model: DEFAULT_MODEL, contents: fix },
            { model: DEFAULT_MODEL, contents: fix },
            { model: PRO_MODEL, contents: 'P' },
        ]);
        assert.deepStrictEqual(messages, [
            `Generating with ${DEFAULT_MODEL}...`,
            'Validating Syntax...',
            'Syntax Error Detected. Applying Fix...',
            'Auto-Correcting Syntax Error (Attempt 2/3)...',
            'Validating Syntax...',
            'Syntax Error Detected. Applying Fix...',
            'Auto-Correcting Syntax Error (Attempt 3/3)...',
            'Validating Syntax...',
            `Model failed. Trying ${PRO_MODEL}...`,
            `Generating with ${PRO_MODEL}...`,
            'Validating Syntax...',
        ]);
    });

    it('generateWithFallback: heal, then failover, each with three attempts: nine calls at most and the exact error', async () => {
        const gone = Object.assign(new Error('models/old is not found for API version v1beta'), { status: 404 });
        const { client, calls } = scriptedClient({
            old: [gone],
            healed: [BROKEN_FENCED],
            [PRO_MODEL]: [BROKEN_FENCED],
        });
        const { progress, messages } = recorder();

        let error: Error | undefined;
        try {
            await generateWithFallback(client, 'P', progress, {
                primaryModelName: 'old',
                heal: async () => ({ model: 'healed' }) as never,
            });
        } catch (caught) {
            error = caught as Error;
        }

        assert.deepStrictEqual(calls.map(call => call.model), ['old', 'healed', 'healed', 'healed', PRO_MODEL, PRO_MODEL, PRO_MODEL]);
        assert.ok(error, 'expected a failure');
        const cause = parserError(BROKEN).replace(/[.\s]+$/, '');
        assert.strictEqual(
            error!.message,
            `AI generation failed with "${PRO_MODEL}": ${cause}. If this names a model problem, change it in Settings > C4X > AI > Model.` +
            ` This was the failover. Before it, "old" failed: the model is not available to your API key; then "healed" failed: ${cause}.`,
        );
        assert.deepStrictEqual(messages.filter(message => /Trying|Generating with/.test(message)), [
            'Generating with old...',
            '"old" is unavailable. Trying healed...',
            'Generating with healed...',
            `Model failed. Trying ${PRO_MODEL}...`,
            `Generating with ${PRO_MODEL}...`,
        ]);
    });

    it('generateWithFallback: primary is the pro model, failover to the default; key rejected names the key', async () => {
        const rejected = new Error('API key not valid. Please pass a valid API key.');
        const { client, calls } = scriptedClient({ [PRO_MODEL]: [rejected], [DEFAULT_MODEL]: [rejected] });

        await assert.rejects(
            generateWithFallback(client, 'P', undefined, { primaryModelName: PRO_MODEL }),
            (error: Error) => error.message.startsWith('Your Gemini API key was rejected.')
                && error.message.includes(`(Model "${DEFAULT_MODEL}" was never reached.)`)
                && error.message.endsWith(`This was the failover. Before it, "${PRO_MODEL}" failed: the API key was rejected.`),
        );
        assert.deepStrictEqual(calls.map(call => call.model), [PRO_MODEL, DEFAULT_MODEL]);
    });
});
