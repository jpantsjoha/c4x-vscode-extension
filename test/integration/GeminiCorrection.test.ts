
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GeminiService } from '../../src/ai/GeminiService';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { C4XParser } from '../../src/parser/C4XParser';

describe('Gemini Self-Correction Integration Test', function () {
    this.timeout(60000); // 60 seconds
    const parser = new C4XParser();

    let context: vscode.ExtensionContext;
    let service: GeminiService;
    let hasApiKey = false;

    before(async function () {
        // Check if we have a real API key for integration tests
        const envPath = path.resolve(__dirname, '../../../.env');
        let apiKey = process.env.GEMINI_API_KEY;

        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            const match = content.match(/GEMINI_API_KEY=['"]?([^'"\n]+)['"]?/);
            if (match) apiKey = match[1];
        }

        hasApiKey = !!apiKey;
        if (!hasApiKey) {
            console.warn('⚠️ Skipping Gemini Integration Test: No API Key found.');
        }
    });

    // Mock API that returns BAD then GOOD response
    class MockGenerativeModel {
        private attempt = 0;

        async generateContent(prompt: string) {
            this.attempt++;

            if (this.attempt === 1) {
                // Return conversational garbage + invalid syntax
                return {
                    response: {
                        text: () => "Here is the code, I hope you like it.\n```c4x\ngraph TB\n  User[User]\n  User -> System\n```\nIt is great." // -> is invalid, should be -->
                    }
                };
            }

            if (this.attempt === 2) {
                // Return fixed code VALID C4X
                return {
                    response: {
                        text: () => "```c4x\ngraph TB\n  User[User<br/>Person]\n  User --> System\n```" // Fixed --> and Valid Node
                    }
                };
            }

            throw new Error("Too many attempts");
        }
    }

    it.skip('Should detect syntax error and auto-correct using feedback loop in Mock Mode', async () => {
        // We mock the internal model instance to force our "Bad -> Good" scenario
        // identifying that the logic resides in private state is tricky in TS tests without partial mocks, 
        // so we will instantiate the service, then forcibly generic-cast it to inject our mock model.

        const mockContext = {
            secrets: { get: async () => "test-key", store: async () => { } },
            subscriptions: []
        } as any;

        service = new GeminiService(mockContext);

        // Wait for real initialization to complete before overwriting
        await service.initialize();

        // Inject mock model
        const mockModel = new MockGenerativeModel();
        (service as any).model = mockModel;
        (service as any).genAI = { getGenerativeModel: () => mockModel };

        // Execute
        const result = await service.generateDiagram([], "Create a diagram");

        // Assert
        assert.ok(result.includes('-->'), 'Result should have corrected arrow syntax');
        // assert.ok(!result.includes('-> '), 'Result should NOT have invalid arrow syntax'); // --> contains ->
        assert.strictEqual(parser.parse(result) !== undefined, true, 'Result should be valid C4X');
    });

    it.skip('Should sanitize output by removing HTML tags from relationships', async () => {
        // Mock returning dirty content (Valid C4X but with HTML tags in relationships)
        const dirtyResponse = `
\`\`\`c4x
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  App[App<br/>Container]
  DB[DB<br/>Container]
  User -->|Clicks<br>Button| App
  App -->|Sends</br>Data| DB
\`\`\`
`;

        // Mock Context
        const mockContext = {
            secrets: { get: async () => "test-key", store: async () => { } },
            subscriptions: []
        } as any;

        service = new GeminiService(mockContext);

        // Don't call initialize() - we're mocking everything below

        // Inject mock genAI (needed for fallback mechanism)
        (service as any).genAI = {
            getGenerativeModel: () => ({
                generateContent: async () => ({
                    response: { text: () => dirtyResponse }
                })
            })
        };

        // Inject mock model returning dirty response
        (service as any).model = {
            generateContent: async () => ({
                response: { text: () => dirtyResponse }
            })
        };

        const result = await service.generateDiagram([], 'clean me');

        // Check for absence of exact HTML tags in RELATIONSHIPS
        // Note: Node labels CAN have <br/>, so we can't check regex globally on result.
        // We verify that the bad strings are gone and replaced by space.

        assert.ok(result.includes('Clicks Button'), 'Should contain cleaned label Clicks Button');
        assert.ok(result.includes('Sends Data'), 'Should contain cleaned label Sends Data');

        // Ensure the original dirty strings are gone
        assert.ok(!result.includes('Clicks<br>Button'), 'Dirty tag should be removed');
    });

    it.skip('Should fallback to gemini-3.1-pro-preview if user model fails', async function () {
        if (!hasApiKey) {
            this.skip();
        }

        const mockContext = {
            secrets: { get: async () => "test-key", store: async () => { } },
            subscriptions: []
        } as any;

        service = new GeminiService(mockContext);
        // Don't call initialize() - we're mocking everything below

        let requestedModels: string[] = [];

        // Mock GenAI factory (inject before initialize)
        (service as any).genAI = {
            getGenerativeModel: (opts: { model: string }) => {
                requestedModels.push(opts.model);
                return {
                    generateContent: async () => {
                        if (opts.model === 'gemini-3-flash-preview') {
                            throw new Error('404 Model Not Found');
                        }
                        return {
                            response: {
                                text: () => "```c4x\n%%{ c4: container }%%\ngraph TB\nUser[User<br/>Person]\n```"
                            }
                        };
                    }
                };
            }
        };

        // Inject initial model (simulates user selecting gemini-3-flash-preview)
        (service as any).model = (service as any).genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });

        const result = await service.generateDiagram([], 'test fallback');

        assert.ok(result.includes('User'), 'Should return result from fallback');
        assert.deepStrictEqual(requestedModels, ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'], 'Should fallback to gemini-3.1-pro-preview');
    });
});
