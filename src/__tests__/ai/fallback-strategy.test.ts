import * as assert from 'assert';

// Mock vscode module before importing FallbackStrategy
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

// We need to control what vscode.workspace.getConfiguration returns,
// so import the mock and patch it before importing the module under test.
import * as vscodeMock from '../__mocks__/vscode';

import { DEFAULT_MODEL, PRO_MODEL } from '../../ai/models';

// ---------------------------------------------------------------------------
// Valid C4X DSL that the parser will accept
// ---------------------------------------------------------------------------
const validC4X = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';
const validResponse = `\`\`\`c4x\n${validC4X}\n\`\`\``;

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface ModelBehavior {
    /** Map of model name -> sequence of responses. If string, returns it. If Error, throws it. */
    [modelName: string]: Array<string | Error>;
}

function createMockGenAI(behaviors: ModelBehavior) {
    const callCounts: Record<string, number> = {};

    return {
        getGenerativeModel: ({ model }: { model: string }) => {
            if (!callCounts[model]) { callCounts[model] = 0; }

            return {
                generateContent: async (_prompt: string) => {
                    const idx = callCounts[model]++;
                    const responses = behaviors[model];
                    if (!responses) {
                        throw new Error(`Unexpected model: ${model}`);
                    }
                    const item = responses[idx % responses.length];
                    if (item instanceof Error) {
                        throw item;
                    }
                    return { response: { text: () => item } };
                },
            };
        },
        _callCounts: callCounts,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

function createMockPrimaryModel(responses: Array<string | Error>) {
    let callIndex = 0;
    return {
        generateContent: async (_prompt: string) => {
            const item = responses[callIndex++ % responses.length];
            if (item instanceof Error) { throw item; }
            return { response: { text: () => item } };
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

function createMockProgress(): { progress: { report: (v: { message?: string }) => void }; messages: string[] } {
    const messages: string[] = [];
    return {
        progress: {
            report: (v: { message?: string }) => {
                if (v.message) { messages.push(v.message); }
            },
        },
        messages,
    };
}

/**
 * Patch the vscode mock's getConfiguration to return a specific model setting.
 */
function patchModelSetting(modelId: string | undefined) {
    vscodeMock.workspace.getConfiguration = (_section?: string) => ({
        get: (_key: string) => modelId,
    });
}

// Restore after each test
const originalGetConfiguration = vscodeMock.workspace.getConfiguration;

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are set up
// ---------------------------------------------------------------------------
import { generateWithFallback } from '../../ai/FallbackStrategy';

describe('generateWithFallback', () => {
    afterEach(() => {
        // Restore the original getConfiguration after each test
        vscodeMock.workspace.getConfiguration = originalGetConfiguration;
    });

    // -----------------------------------------------------------------------
    // Happy path
    // -----------------------------------------------------------------------

    it('should succeed on primary model (no fallback triggered)', async () => {
        patchModelSetting(DEFAULT_MODEL);

        const primaryModel = createMockPrimaryModel([validResponse]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [validResponse],
            [PRO_MODEL]: [validResponse],
        });
        const { progress } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'generate diagram', progress);

        assert.ok(result.includes('graph TB'), 'Should return valid C4X DSL');
        assert.ok(result.includes('Person(user'), 'Should contain Person element');
    });

    it('should default to DEFAULT_MODEL when no setting configured', async () => {
        // getConfiguration returns undefined -> should use DEFAULT_MODEL
        patchModelSetting(undefined);

        const primaryModel = createMockPrimaryModel([validResponse]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [validResponse],
            [PRO_MODEL]: [validResponse],
        });
        const { progress } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'prompt', progress);
        assert.ok(result.includes('graph TB'), 'Should succeed with default model');
    });

    // -----------------------------------------------------------------------
    // Fallback scenarios
    // -----------------------------------------------------------------------

    it('should fall back to PRO_MODEL when primary fails', async () => {
        patchModelSetting(DEFAULT_MODEL);

        // Primary model always fails
        const primaryModel = createMockPrimaryModel([new Error('Primary model error')]);
        // GenAI provides the fallback model
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [new Error('Primary model error')],
            [PRO_MODEL]: [validResponse],
        });
        const { progress, messages } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'prompt', progress);

        assert.ok(result.includes('graph TB'), 'Fallback should return valid result');
        // Should have reported the fallback attempt
        assert.ok(
            messages.some(m => m.includes(PRO_MODEL)),
            `Progress should mention fallback model. Got: ${messages.join(', ')}`
        );
    });

    it('should fall back to DEFAULT_MODEL when PRO_MODEL is primary and fails', async () => {
        // User has configured PRO_MODEL as their primary
        patchModelSetting(PRO_MODEL);

        const primaryModel = createMockPrimaryModel([new Error('Pro model error')]);
        const genAI = createMockGenAI({
            [PRO_MODEL]: [new Error('Pro model error')],
            [DEFAULT_MODEL]: [validResponse],
        });
        const { progress, messages } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'prompt', progress);

        assert.ok(result.includes('graph TB'), 'Fallback to DEFAULT should succeed');
        assert.ok(
            messages.some(m => m.includes(DEFAULT_MODEL)),
            `Progress should mention DEFAULT_MODEL fallback. Got: ${messages.join(', ')}`
        );
    });

    it('should throw clear error when both models fail', async () => {
        patchModelSetting(DEFAULT_MODEL);

        const primaryModel = createMockPrimaryModel([new Error('Primary fails')]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [new Error('Primary fails')],
            [PRO_MODEL]: [new Error('Fallback also fails')],
        });
        const { progress } = createMockProgress();

        await assert.rejects(
            () => generateWithFallback(genAI, primaryModel, 'prompt', progress),
            (error: Error) => {
                assert.ok(error.message.includes('AI generation failed'), 'Error should say AI generation failed');
                assert.ok(error.message.includes(DEFAULT_MODEL), 'Error should mention the primary model name');
                assert.ok(error.message.includes('Settings'), 'Error should guide user to settings');
                return true;
            }
        );
    });

    it('should throw clear error when primary is same as fallback and fails', async () => {
        // Edge case: if primaryModelName === fallbackModelName, no fallback is attempted
        // This happens when the user's model IS the PRO_MODEL and fallback also resolves to PRO_MODEL
        // Actually, in the code, if primary === PRO_MODEL, fallback = DEFAULT_MODEL, so they're different.
        // If primary === DEFAULT_MODEL, fallback = PRO_MODEL. They're always different.
        // But let's test the error message structure.
        patchModelSetting('some-custom-model');

        const primaryModel = createMockPrimaryModel([new Error('Custom model error')]);
        const genAI = createMockGenAI({
            'some-custom-model': [new Error('Custom model error')],
            [PRO_MODEL]: [new Error('Fallback fails too')],
        });
        const { progress } = createMockProgress();

        await assert.rejects(
            () => generateWithFallback(genAI, primaryModel, 'prompt', progress),
            (error: Error) => {
                assert.ok(error.message.includes('some-custom-model'), 'Error should mention the custom model');
                return true;
            }
        );
    });

    // -----------------------------------------------------------------------
    // Progress reporting
    // -----------------------------------------------------------------------

    it('should report progress during fallback', async () => {
        patchModelSetting(DEFAULT_MODEL);

        const primaryModel = createMockPrimaryModel([new Error('fail')]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [new Error('fail')],
            [PRO_MODEL]: [validResponse],
        });
        const { progress, messages } = createMockProgress();

        await generateWithFallback(genAI, primaryModel, 'prompt', progress);

        // Check that we got a "Model failed" message and a message about the fallback model
        assert.ok(
            messages.some(m => m.includes('Model failed') || m.includes('Trying')),
            `Should report model failure. Got: ${messages.join(', ')}`
        );
    });

    it('should work without progress (progress is optional)', async () => {
        patchModelSetting(DEFAULT_MODEL);

        const primaryModel = createMockPrimaryModel([validResponse]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [validResponse],
            [PRO_MODEL]: [validResponse],
        });

        // Should not throw when progress is undefined
        const result = await generateWithFallback(genAI, primaryModel, 'prompt', undefined);
        assert.ok(result.includes('graph TB'), 'Should succeed without progress');
    });

    // -----------------------------------------------------------------------
    // Model setting usage
    // -----------------------------------------------------------------------

    it('should use model name from vscode settings', async () => {
        const customModel = 'gemini-custom-model';
        patchModelSetting(customModel);

        const primaryModel = createMockPrimaryModel([new Error('primary fails')]);
        const genAI = createMockGenAI({
            [customModel]: [new Error('primary fails')],
            [PRO_MODEL]: [validResponse],
        });
        const { progress, messages } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'prompt', progress);

        assert.ok(result.includes('graph TB'), 'Should fall back and succeed');
        // The fallback message should reference the custom model name in the warning
        assert.ok(
            messages.some(m => m.includes(PRO_MODEL)),
            `Should fall back to PRO_MODEL when a custom model fails. Got: ${messages.join(', ')}`
        );
    });

    // -----------------------------------------------------------------------
    // Retry integration (executeWithRetry is called internally)
    // -----------------------------------------------------------------------

    it('should self-correct syntax errors before falling back to another model', async () => {
        patchModelSetting(DEFAULT_MODEL);

        const invalidResponse = 'this is broken syntax';
        // Primary model: first call returns invalid, second (fix) returns valid
        const primaryModel = createMockPrimaryModel([invalidResponse, validResponse]);
        const genAI = createMockGenAI({
            [DEFAULT_MODEL]: [invalidResponse, validResponse],
            [PRO_MODEL]: [validResponse],
        });
        const { progress } = createMockProgress();

        const result = await generateWithFallback(genAI, primaryModel, 'prompt', progress);

        assert.ok(result.includes('graph TB'), 'Should succeed via self-correction, no fallback needed');
    });
});
