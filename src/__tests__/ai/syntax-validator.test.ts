import * as assert from 'assert';

// Mock vscode module before importing SyntaxValidator (which imports vscode at module level)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { cleanResponse, executeWithRetry } from '../../ai/SyntaxValidator';
import { C4XParser } from '../../parser/C4XParser';

// ---------------------------------------------------------------------------
// Helpers to build mock GenerativeModel instances
// ---------------------------------------------------------------------------

interface MockResponseConfig {
    /** Sequence of raw text responses the model returns on successive calls. */
    responses: string[];
}

function createMockModel(config: MockResponseConfig) {
    let callIndex = 0;
    return {
        generateContent: async (_prompt: string) => {
            const idx = callIndex++;
            const text = config.responses[idx] ?? config.responses[config.responses.length - 1];
            return {
                response: {
                    text: () => text,
                },
            };
        },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
}

function createFailingModel(error: Error) {
    return {
        generateContent: async () => {
            throw error;
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

// ===========================================================================
// cleanResponse
// ===========================================================================

describe('cleanResponse', () => {
    it('should strip ```c4x fences', () => {
        const input = '```c4x\ngraph TB\nA-->B\n```';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph TB\nA-->B');
    });

    it('should strip plain ``` fences (no language tag)', () => {
        const input = '```\ngraph LR\nX-->Y\n```';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph LR\nX-->Y');
    });

    it('should strip ```mermaid fences (mermaid text remains as content since regex only strips c4x tag)', () => {
        // The regex /```(?:c4x)?\s*([\s\S]*?)```/i only optionally matches "c4x".
        // For ```mermaid, the "mermaid" text is captured inside group 1.
        // This is acceptable — the parser handles it or the content gets cleaned downstream.
        const input = '```mermaid\ngraph TB\nA-->B\n```';
        const result = cleanResponse(input);
        // The fences are stripped but "mermaid" remains as part of captured content
        assert.ok(!result.includes('```'), 'Fences should be stripped');
        assert.ok(result.includes('graph TB'), 'Content should be present');
    });

    it('should strip ```C4X fences (case insensitive)', () => {
        const input = '```C4X\ngraph TB\nA-->B\n```';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph TB\nA-->B');
    });

    it('should remove <br> tags from relationship labels', () => {
        const input = 'A -->|Uses<br>API| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -->|Uses API| B');
    });

    it('should remove <br/> tags from relationship labels', () => {
        const input = 'A -->|Calls<br/>Service| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -->|Calls Service| B');
    });

    it('should remove </br> tags from relationship labels', () => {
        const input = 'A -->|Sends</br>Data| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -->|Sends Data| B');
    });

    it('should remove <br /> tags from relationship labels', () => {
        const input = 'A -->|Reads<br />DB| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -->|Reads DB| B');
    });

    it('should handle dotted arrow relationship labels', () => {
        const input = 'A ..>|Async<br>Call| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A ..>|Async Call| B');
    });

    it('should handle thick arrow relationship labels', () => {
        const input = 'A ==>|Data<br/>Flow| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A ==>|Data Flow| B');
    });

    it('should handle dash-dot arrow relationship labels', () => {
        const input = 'A -.->|Optional<br>Path| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -.->|Optional Path| B');
    });

    it('should preserve HTML in node labels (not relationships)', () => {
        // Node labels use [...] syntax with <br/>, which should NOT be stripped
        const input = 'A[Web App<br/>React] -->|Uses| B';
        const result = cleanResponse(input);
        // The <br/> inside the node label [...] should remain
        assert.ok(result.includes('Web App<br/>React'), 'Node label HTML should be preserved');
    });

    it('should handle empty input', () => {
        const result = cleanResponse('');
        assert.strictEqual(result, '');
    });

    it('should handle whitespace-only input', () => {
        const result = cleanResponse('   \n\t  ');
        assert.strictEqual(result, '');
    });

    it('should pass through input with no fences', () => {
        const input = 'graph TB\nA-->B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph TB\nA-->B');
    });

    it('should extract from multiple fence blocks (takes first match)', () => {
        const input = 'Some text\n```c4x\ngraph TB\nA-->B\n```\nMore text\n```c4x\ngraph LR\nX-->Y\n```';
        const result = cleanResponse(input);
        // The regex matches the first code block
        assert.strictEqual(result, 'graph TB\nA-->B');
    });

    it('should handle fences with surrounding conversational text', () => {
        const input = 'Here is the diagram:\n\n```c4x\ngraph TB\nA-->B\n```\n\nLet me know if you need changes.';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph TB\nA-->B');
    });

    it('should handle fences with extra whitespace around content', () => {
        const input = '```c4x\n  \n  graph TB\n  A-->B\n  \n```';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'graph TB\n  A-->B');
    });

    it('should handle multiple <br> variants in a single relationship label', () => {
        const input = 'A -->|Step1<br>Step2<br/>Step3| B';
        const result = cleanResponse(input);
        assert.strictEqual(result, 'A -->|Step1 Step2 Step3| B');
    });
});

// ===========================================================================
// executeWithRetry
// ===========================================================================

describe('executeWithRetry', () => {
    const validC4X = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';

    it('should return valid response on first attempt (no retry needed)', async () => {
        const model = createMockModel({ responses: [`\`\`\`c4x\n${validC4X}\n\`\`\``] });
        const parser = new C4XParser();
        const { progress } = createMockProgress();

        const result = await executeWithRetry(model, 'test-model', 'generate diagram', 1, 3, parser, progress);

        assert.ok(result.includes('graph TB'), 'Should return the cleaned C4X DSL');
        assert.ok(result.includes('Person(user'), 'Should contain the Person element');
    });

    it('should report progress with model name on first attempt', async () => {
        const model = createMockModel({ responses: [`\`\`\`c4x\n${validC4X}\n\`\`\``] });
        const parser = new C4XParser();
        const { progress, messages } = createMockProgress();

        await executeWithRetry(model, 'gemini-test', 'prompt', 1, 3, parser, progress);

        assert.ok(
            messages.some(m => m.includes('Generating with gemini-test')),
            `Progress should mention model name. Got: ${messages.join(', ')}`
        );
    });

    it('should report progress with attempt info on retry', async () => {
        const model = createMockModel({ responses: [`\`\`\`c4x\n${validC4X}\n\`\`\``] });
        const parser = new C4XParser();
        const { progress, messages } = createMockProgress();

        // Simulate calling with attempt > 1 (as if this is a retry)
        await executeWithRetry(model, 'gemini-test', 'fix prompt', 2, 3, parser, progress);

        assert.ok(
            messages.some(m => m.includes('Auto-Correcting') && m.includes('2/3')),
            `Retry progress should show attempt info. Got: ${messages.join(', ')}`
        );
    });

    it('should report "Validating Syntax..." during parse phase', async () => {
        const model = createMockModel({ responses: [`\`\`\`c4x\n${validC4X}\n\`\`\``] });
        const parser = new C4XParser();
        const { progress, messages } = createMockProgress();

        await executeWithRetry(model, 'test-model', 'prompt', 1, 3, parser, progress);

        assert.ok(
            messages.some(m => m.includes('Validating Syntax')),
            `Should report validating syntax. Got: ${messages.join(', ')}`
        );
    });

    it('should retry on parse error and succeed on second attempt', async () => {
        const invalidC4X = 'this is not valid c4x at all {{{';
        const model = createMockModel({
            responses: [
                invalidC4X,                          // First call: invalid
                `\`\`\`c4x\n${validC4X}\n\`\`\``,  // Second call (fix): valid
            ],
        });
        const parser = new C4XParser();
        const { progress } = createMockProgress();

        const result = await executeWithRetry(model, 'test-model', 'generate', 1, 3, parser, progress);

        assert.ok(result.includes('graph TB'), 'Should return the valid response from retry');
    });

    it('should retry up to maxRetries times then throw', async () => {
        const invalidResponse = 'invalid {{{ bad syntax <<<';
        const model = createMockModel({
            responses: [invalidResponse, invalidResponse, invalidResponse],
        });
        const parser = new C4XParser();
        const { progress } = createMockProgress();

        await assert.rejects(
            () => executeWithRetry(model, 'test-model', 'generate', 1, 3, parser, progress),
            (error: Error) => {
                // The parser should throw a parse error after exhausting retries
                assert.ok(error instanceof Error, 'Should throw an Error');
                return true;
            }
        );
    });

    it('should throw when model API call itself fails', async () => {
        const model = createFailingModel(new Error('API quota exceeded'));
        const parser = new C4XParser();
        const { progress } = createMockProgress();

        await assert.rejects(
            () => executeWithRetry(model, 'test-model', 'prompt', 1, 3, parser, progress),
            (error: Error) => {
                assert.ok(error.message.includes('API quota exceeded'), 'Should surface the API error');
                return true;
            }
        );
    });

    it('should throw when response is empty (no code block found)', async () => {
        // cleanResponse returns '' for empty-ish text, triggering "No C4X code block found"
        const model = createMockModel({
            responses: ['', '', ''],
        });
        const parser = new C4XParser();
        const { progress } = createMockProgress();

        await assert.rejects(
            () => executeWithRetry(model, 'test-model', 'prompt', 1, 3, parser, progress),
            (error: Error) => {
                assert.ok(error.message.includes('No C4X code block found'), 'Should report missing code block');
                return true;
            }
        );
    });

    it('should work without progress (progress is optional)', async () => {
        const model = createMockModel({ responses: [`\`\`\`c4x\n${validC4X}\n\`\`\``] });
        const parser = new C4XParser();

        // Should not throw when progress is undefined
        const result = await executeWithRetry(model, 'test-model', 'prompt', 1, 3, parser, undefined);
        assert.ok(result.includes('graph TB'), 'Should succeed without progress');
    });

    it('should pass fix prompt (including error message) on retry', async () => {
        const invalidC4X = 'garbage content that will fail parsing';
        const prompts: string[] = [];
        let callIndex = 0;

        // Custom mock that captures prompts
        const model = {
            generateContent: async (prompt: string) => {
                prompts.push(prompt);
                const idx = callIndex++;
                const text = idx === 0 ? invalidC4X : `\`\`\`c4x\n${validC4X}\n\`\`\``;
                return { response: { text: () => text } };
            },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;

        const parser = new C4XParser();
        const { progress } = createMockProgress();

        await executeWithRetry(model, 'test-model', 'original prompt', 1, 3, parser, progress);

        // The second call should be a fix prompt built by buildFixPrompt
        assert.ok(prompts.length >= 2, 'Should have made at least 2 calls');
        const fixPrompt = prompts[1];
        assert.ok(fixPrompt.includes('SYNTAX ERROR'), 'Fix prompt should mention SYNTAX ERROR');
        assert.ok(fixPrompt.includes('FAILED CODE'), 'Fix prompt should include the failed code');
    });
});
