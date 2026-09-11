
import * as assert from 'assert';
import { GeminiService } from '../../src/ai/GeminiService';
import { buildGenerationPrompt } from '../../src/ai/PromptBuilder';
import * as vscode from 'vscode';

describe('Gemini Issue Reproduction', () => {
    let geminiService: GeminiService;

    beforeEach(async () => {
        const mockContext = {
            globalState: {
                get: () => 'fake-key',
                update: () => Promise.resolve()
            },
            secrets: {
                get: () => Promise.resolve('fake-key'),
                store: () => Promise.resolve()
            },
            extensionUri: { fsPath: '/tmp' }
        } as unknown as vscode.ExtensionContext;

        geminiService = new GeminiService(mockContext);
        await geminiService.initialize();

        // MOCK THE MODEL to simulate what might be happening, 
        // OR better yet, if we can't make real calls, we inspect the Logic.
        // Since I cannot make real calls without a Key, I must verify the LOGIC and PROMPTS.
        // I will inspect the buildPrompt method output indirectly if possible, 
        // but for now let's Mock the model to ensure the wiring is correct.

        (geminiService as any).model = {
            generateContent: async (prompt: string) => {
                // LOG THE PROMPT TO SEE IF IT IS CORRECT
                console.log("PROMPT RECEIVED:", prompt);

                if (prompt.includes('DETECTION RULES')) {
                    // Simulate CORRECT behavior based on prompt text
                    if (prompt.includes('--->')) {
                        return { response: { text: () => JSON.stringify({ bestType: 'C1', direction: 'LR', confidence: 0.9 }) } };
                    }
                    return { response: { text: () => JSON.stringify({ bestType: 'C1', direction: 'TB', confidence: 0.9 }) } };
                }

                if (prompt.includes('FORCE LAYOUT')) {
                    // Check if FORCE LAYOUT is present
                    if (prompt.includes('FORCE LAYOUT: You MUST use `graph LR`')) {
                        return { response: { text: () => "```c4x\ngraph LR\n...```" } };
                    }
                }

                // Simulate Generation
                return { response: { text: () => "```c4x\ngraph TB\n...```" } }; // Default response
            }
        };
    });

    it('Should detect LR from arrow notation', async () => {
        const text = "user ---> C4X_EXTENSION ---> Gemini ---> DIAGRAM_VISUAL";
        const result = await geminiService.recommendDiagramType(text);

        console.log("Recommendation Result:", result);
        assert.strictEqual(result.direction, 'LR', 'Should detect LR from arrows');
    });

    it('Should FORCE LAYOUT LR in Prompt', async () => {
        const text = "user ---> C4X_EXTENSION ---> Gemini";
        const files = [{ path: 'test.md', content: text }];
        const instruction = "Visualize this";
        const options = { direction: 'LR' as 'LR' };

        const prompt = await buildGenerationPrompt(files, instruction, options);

        console.log("Generated Prompt Snippet:", prompt.substring(prompt.indexOf('CRITICAL SYNTAX RULES')));

        assert.ok(prompt.includes('FORCE LAYOUT'), 'Prompt should contain FORCE LAYOUT rule');
        assert.ok(prompt.includes('MUST use `graph LR`'), 'Prompt should enforce graph LR');
    });
});
