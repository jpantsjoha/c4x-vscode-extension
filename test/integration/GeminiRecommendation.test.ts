
import * as assert from 'assert';
import { GeminiService } from '../../src/ai/GeminiService';
import * as vscode from 'vscode';
import { fakeGenAI, textResponse } from '../../src/__tests__/__mocks__/genai';

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

        // Mock the client. It answers in the shape the recommendation prompt asks
        // for ({ bestType, confidence, direction }, fenced as models often do). It
        // used to answer { types, direction }, which the service ignores, so every
        // call fell back to "C2 at 0.5" and returned all three types: an assertion
        // that C1 was among them could not fail.
        (geminiService as unknown as { genAI: unknown }).genAI = fakeGenAI(async ({ contents }) => {
            const prompt = String(contents);
            if (prompt.includes('Stripe')) {
                return textResponse('```json\n' + JSON.stringify({ bestType: 'C1', confidence: 0.9, direction: 'TB' }) + '\n```');
            }
            if (prompt.includes('class User')) {
                return textResponse(JSON.stringify({ bestType: 'C3', confidence: 0.4, direction: 'LR' }));
            }
            return textResponse(JSON.stringify({ bestType: 'C2', confidence: 0.5, direction: 'TB' }));
        });
    });

    it('Should recommend C1 and TB for high-level description', async () => {
        const text = "The system interacts with External Systems like Stripe and AWS.";
        const result = await geminiService.recommendDiagramType(text);
        // Confident: one type, the recommended one.
        assert.deepStrictEqual(result, { types: ['C1'], direction: 'TB', confidence: 0.9 });
    });

    it('Should recommend C3/C2 and LR for horizontally implied code', async () => {
        const text = "class User { login() { ... } }"; // Mock returns LR for this
        const result = await geminiService.recommendDiagramType(text);
        // Not confident: the recommendation first, then the others to choose from.
        assert.deepStrictEqual(result, { types: ['C3', 'C1', 'C2'], direction: 'LR', confidence: 0.4 });
    });

    it('Should fail gracefully and return defaults on error', async () => {
        // Mock error
        (geminiService as unknown as { genAI: unknown }).genAI = fakeGenAI(async () => { throw new Error('API Error'); });

        const result = await geminiService.recommendDiagramType("Any text");
        assert.deepStrictEqual(result.types, ['C1', 'C2', 'C3']);
        assert.strictEqual(result.direction, 'TB');
    });
});
