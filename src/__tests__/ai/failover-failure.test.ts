import * as assert from 'assert';

// Mock vscode before importing anything that reads settings or shows progress.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { ApiError } from '@google/genai';
import * as vscodeMock from '../__mocks__/vscode';
import { fakeGenAI, textResponse } from '../__mocks__/genai';
import { generateWithFallback } from '../../ai/FallbackStrategy';
import { GeminiService } from '../../ai/GeminiService';
import { DEFAULT_MODEL, PRO_MODEL } from '../../ai/models';

/**
 * #187: when the failover also failed, the error named the primary model and
 * the primary's error, and dropped the failover's. PRO_MODEL is a preview id
 * kept by a dated exemption; the day Google withdraws it, every failover fails
 * with a 404 that the user must be told about, and was not.
 */

function apiError(status: number, apiStatus: string, message: string): ApiError {
    return new ApiError({ status, message: JSON.stringify({ error: { code: status, message, status: apiStatus } }) });
}

const overloaded = () => apiError(503, 'UNAVAILABLE', 'The model is overloaded. Please try again later.');
const withdrawn = (model: string) => apiError(
    404,
    'NOT_FOUND',
    `models/${model} is not found for API version v1beta, or is not supported for generateContent.`,
);
const quota = () => apiError(429, 'RESOURCE_EXHAUSTED', 'You exceeded your current quota.');

/** A client whose models each fail or answer as scripted; calls are counted. */
function scriptedClient(script: Array<[string, Error | string]>) {
    const answers = new Map(script);
    const calls = new Map<string, number>();
    return {
        calls,
        client: fakeGenAI(async ({ model }) => {
            calls.set(model, (calls.get(model) ?? 0) + 1);
            const answer = answers.get(model);
            if (answer === undefined) {
                throw withdrawn(model);
            }
            if (answer instanceof Error) {
                throw answer;
            }
            return textResponse(answer);
        }),
    };
}

const originalGetConfiguration = vscodeMock.workspace.getConfiguration;

function configureModel(model: string): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vscodeMock.workspace.getConfiguration = (_section?: string): any => ({
        get: (key: string, defaultValue?: unknown) => (key === 'model' ? model : defaultValue),
    });
}

describe('a failover that also fails (#187)', () => {
    afterEach(() => {
        vscodeMock.workspace.getConfiguration = originalGetConfiguration;
    });

    it('GeminiService reports the failover\'s own cause, with the primary\'s as context', async () => {
        configureModel(DEFAULT_MODEL);
        const { client, calls } = scriptedClient([
            [DEFAULT_MODEL, overloaded()],
            [PRO_MODEL, withdrawn(PRO_MODEL)],
        ]);
        const service = Object.create(GeminiService.prototype) as GeminiService;
        const mutable = service as unknown as Record<string, unknown>;
        mutable.genAI = client;
        // Discovery unavailable: the configured id is called and nothing heals.
        mutable.discoverModels = async () => [];

        await assert.rejects(
            () => service.generateDiagram([], 'Create a diagram'),
            (error: Error) => {
                // The failover's cause is the actionable one, and it leads.
                assert.ok(
                    error.message.includes(`The built-in failover model "${PRO_MODEL}" is not available to your API key`),
                    `the withdrawn failover must be named as the cause. Got: ${error.message}`,
                );
                // The user cannot configure the failover, so Settings is not the remedy.
                assert.ok(error.message.includes('update C4X'), error.message);
                assert.ok(!error.message.includes('Settings > C4X > AI > Model'), error.message);
                assert.match(error.message, /This was the failover/);
                // The primary's cause is kept, in the API's words.
                assert.ok(error.message.includes(`"${DEFAULT_MODEL}" failed: 503 UNAVAILABLE: The model is overloaded`), error.message);
                // And the primary is not blamed for the failover's fault.
                assert.ok(
                    !error.message.includes(`The model "${DEFAULT_MODEL}" is not available`),
                    'the primary model is not the one that is unavailable',
                );
                return true;
            },
        );
        assert.strictEqual(calls.get(DEFAULT_MODEL), 1, 'a failed call is not self-corrected');
        assert.strictEqual(calls.get(PRO_MODEL), 1, 'one failover, no cascade');
    });

    it('names each attempt in order when a heal and the failover both failed', async () => {
        const retired = 'gemini-3.1-flash-image-preview';
        const replacement = 'gemini-3.5-flash';
        configureModel(retired);
        const { client } = scriptedClient([
            [retired, withdrawn(retired)],
            [replacement, quota()],
            [PRO_MODEL, overloaded()],
        ]);

        await assert.rejects(
            () => generateWithFallback(client, 'prompt', undefined, {
                primaryModelName: retired,
                heal: async failed => ({ model: replacement, notice: { from: failed, to: replacement, reason: 'healed' } }),
            }),
            (error: Error) => {
                assert.ok(error.message.startsWith(`AI generation failed with "${PRO_MODEL}": 503 UNAVAILABLE`), error.message);
                assert.ok(error.message.includes('This was the failover.'), error.message);
                const primaryAt = error.message.indexOf(`"${retired}" failed: the model is not available to your API key`);
                const healedAt = error.message.indexOf(`"${replacement}" failed: rate limit or quota reached`);
                assert.ok(primaryAt > 0, `the primary and its cause are named. Got: ${error.message}`);
                assert.ok(healedAt > primaryAt, `the replacement follows the primary. Got: ${error.message}`);
                return true;
            },
        );
    });

    it('still leads with the failover\'s key problem when both attempts hit the same bad key', async () => {
        const rejected = () => apiError(400, 'INVALID_ARGUMENT', 'API key not valid. Please pass a valid API key.');
        configureModel(DEFAULT_MODEL);
        const { client } = scriptedClient([
            [DEFAULT_MODEL, rejected()],
            [PRO_MODEL, rejected()],
        ]);

        await assert.rejects(
            () => generateWithFallback(client, 'prompt'),
            (error: Error) => {
                assert.ok(/api key was rejected/i.test(error.message), error.message);
                assert.ok(error.message.includes(`"${DEFAULT_MODEL}" failed: the API key was rejected`), error.message);
                return true;
            },
        );
    });
});
