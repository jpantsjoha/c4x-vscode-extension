
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

    it('Should detect syntax error and auto-correct using feedback loop in Mock Mode', async () => {
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

    it('Should sanitize output by removing HTML tags from relationships', async () => {
        // Mock returning dirty content (Valid C4X but with HTML tags in relationships)
        const dirtyResponse = `
\`\`\`c4x
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

        // Wait for real initialization to complete before overwriting
        await service.initialize();

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

    it('Should fallback to gemini-2.5-pro if primary model fails', async () => {
        const mockContext = {
            secrets: { get: async () => "test-key", store: async () => { } },
            subscriptions: []
        } as any;

        service = new GeminiService(mockContext);
        await service.initialize();

        let requestedModels: string[] = [];

        // Mock GenAI factory
        (service as any).genAI = {
            getGenerativeModel: (opts: { model: string }) => {
                requestedModels.push(opts.model);
                return {
                    generateContent: async () => {
                        if (opts.model === 'gemini-3-preview') {
                            throw new Error('404 Model Not Found');
                        }
                        return {
                            response: {
                                text: () => "```c4x\ngraph TB\nUser[User<br/>Person]\n```"
                            }
                        };
                    }
                };
            }
        };

        // Inject initial model (failure one)
        (service as any).model = (service as any).genAI.getGenerativeModel({ model: 'gemini-3-preview' });

        const result = await service.generateDiagram([], 'test fallback');

        assert.ok(result.includes('User'), 'Should return result from fallback');
        assert.deepStrictEqual(requestedModels, ['gemini-3-preview', 'gemini-2.5-pro'], 'Should have requested both models in order');
    });
});
