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

import { ATTEMPTS_PER_MODEL, runRepairLoop, type CompleteFn } from '../../ai/generationLoop';
import { executeWithRetry, geminiCompletion } from '../../ai/SyntaxValidator';
import { buildFixPrompt } from '../../ai/PromptBuilder';
import { C4XParser } from '../../parser/C4XParser';
import { fakeGenAI, textResponse } from '../__mocks__/genai';

// The provider-neutral loop (#393): any provider that can turn a prompt into
// text gets the same clean → parse → repair loop and the same attempt budget.

const VALID = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';
const fenced = (source: string) => '```c4x\n' + source + '\n```';
const BROKEN = 'graph TB\nPerson(user "broken';

/** A provider that is not Gemini: plain text replies from a script, prompts recorded. */
function textProvider(replies: Array<string | Error>): { complete: CompleteFn; prompts: string[] } {
    const prompts: string[] = [];
    let call = 0;
    return {
        prompts,
        complete: async prompt => {
            prompts.push(prompt);
            const reply = replies[Math.min(call++, replies.length - 1)];
            if (reply instanceof Error) {
                throw reply;
            }
            return reply;
        },
    };
}

function messagesOf() {
    const messages: string[] = [];
    return { progress: { report: (value: { message?: string }) => { if (value.message) { messages.push(value.message); } } }, messages };
}

describe('provider-neutral generation loop (#393)', () => {
    it('defines the budget as one attempt plus two repairs', () => {
        assert.strictEqual(ATTEMPTS_PER_MODEL, 3);
    });

    it('serves a non-Gemini provider: valid first answer, one request', async () => {
        const provider = textProvider([fenced(VALID)]);
        const result = await runRepairLoop(provider.complete, 'Any Model', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser());
        assert.strictEqual(result, VALID);
        assert.deepStrictEqual(provider.prompts, ['P']);
    });

    it('repairs a non-Gemini answer with the same fix prompt the Gemini path uses', async () => {
        const provider = textProvider([fenced(BROKEN), fenced(VALID)]);
        const { progress, messages } = messagesOf();

        const result = await runRepairLoop(provider.complete, 'Any Model', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser(), progress);

        assert.strictEqual(result, VALID);
        assert.strictEqual(provider.prompts.length, 2);
        assert.ok(provider.prompts[1].startsWith(buildFixPrompt(fenced(BROKEN), '').slice(0, 40)), 'the repair is the shared fix prompt');
        assert.ok(messages.includes('Generating with Any Model...'));
        assert.ok(messages.includes('Auto-Correcting Syntax Error (Attempt 2/3)...'));
    });

    it('stops after the budget and throws the parser error', async () => {
        const provider = textProvider([fenced(BROKEN)]);
        await assert.rejects(runRepairLoop(provider.complete, 'm', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser()));
        assert.strictEqual(provider.prompts.length, ATTEMPTS_PER_MODEL);
    });

    it('passes a failed request straight through, with no repair pass', async () => {
        const refused = Object.assign(new Error('no consent'), { code: 'NoPermissions' });
        const provider = textProvider([refused]);
        await assert.rejects(runRepairLoop(provider.complete, 'm', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser()), error => error === refused);
        assert.strictEqual(provider.prompts.length, 1);
    });

    it('binds Gemini through geminiCompletion: one generateContent call per completion, on the bound model', async () => {
        const calls: Array<{ model: string; contents: unknown }> = [];
        const client = fakeGenAI(async ({ model, contents }) => {
            calls.push({ model, contents });
            return textResponse('answer');
        });
        assert.strictEqual(await geminiCompletion(client, 'gemini-x')('hello'), 'answer');
        assert.deepStrictEqual(calls, [{ model: 'gemini-x', contents: 'hello' }]);
    });

    it('executeWithRetry is the loop bound to Gemini: same result as runRepairLoop over geminiCompletion', async () => {
        const script = [fenced(BROKEN), fenced(VALID)];
        const make = () => {
            let call = 0;
            return fakeGenAI(async () => textResponse(script[Math.min(call++, script.length - 1)]));
        };
        const viaWrapper = await executeWithRetry(make(), 'g', 'P', 1, 3, new C4XParser());
        const viaLoop = await runRepairLoop(geminiCompletion(make(), 'g'), 'g', 'P', 1, 3, new C4XParser());
        assert.strictEqual(viaWrapper, viaLoop);
    });
});
