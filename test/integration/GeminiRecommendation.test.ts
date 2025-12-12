
import * as assert from 'assert';
import { GeminiService } from '../../src/ai/GeminiService';
import * as vscode from 'vscode';

describe('Gemini Recommendation Engine', () => {
    let geminiService: GeminiService;

    beforeEach(() => {
        // Mock context (simplified)
        const mockContext = {
            globalState: {
                get: () => 'fake-key',
                update: () => Promise.resolve()
            },
            secrets: {
                get: () => Promise.resolve('fake-key'),
                store: () => Promise.resolve()
            }
        } as unknown as vscode.ExtensionContext;

        geminiService = new GeminiService(mockContext);

        // Mock the model
        (geminiService as any).model = {
            generateContent: async (prompt: string) => {
                if (prompt.includes('External Systems') || prompt.includes('high-level')) {
                    return { response: { text: () => JSON.stringify({ types: ['C1'], direction: 'TB' }) } };
                }
                if (prompt.includes('raw code') || prompt.includes('class User')) {
                    return { response: { text: () => JSON.stringify({ types: ['C3', 'C2'], direction: 'LR' }) } };
                }
                return { response: { text: () => JSON.stringify({ types: ['C1', 'C2'], direction: 'TB' }) } };
            }
        };
    });

    it('Should recommend C1 and TB for high-level description', async () => {
        const text = "The system interacts with External Systems like Stripe and AWS.";
        const result = await geminiService.recommendDiagramType(text);
        assert.ok(result.types.includes('C1'));
        assert.strictEqual(result.direction, 'TB');
    });

    it('Should recommend C3/C2 and LR for horizontally implied code', async () => {
        const text = "class User { login() { ... } }"; // Mock returns LR for this
        const result = await geminiService.recommendDiagramType(text);
        assert.ok(result.types.includes('C3'));
        assert.strictEqual(result.direction, 'LR');
    });

    it('Should fail gracefully and return defaults on error', async () => {
        // Mock error
        (geminiService as any).model = {
            generateContent: async () => { throw new Error('API Error'); }
        };

        const result = await geminiService.recommendDiagramType("Any text");
        assert.deepStrictEqual(result.types, ['C1', 'C2', 'C3']);
        assert.strictEqual(result.direction, 'TB');
    });
});
