/**
 * Integration Test: Gemini Image Model for Visual C4 Diagrams
 * 
 * Tests the shipped Pro image model's capability to generate C4 diagrams as
 * PNG images from architectural descriptions, and the default image model
 * through GeminiService.generateVisualDiagram, the path the command runs.
 * Model ids come from src/ai/models.ts: this file named a retired preview id
 * literally, so an opted-in run could only fail.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import type { GoogleGenAI } from '@google/genai';
import { createGeminiClient, imagePartBytes, responseText } from '../../src/ai/geminiClient';
import { GeminiService } from '../../src/ai/GeminiService';
import { PRO_IMAGE_MODEL } from '../../src/ai/models';

describe('Gemini Image Model Integration Test', function () {
    this.timeout(120000); // 2 minutes for image generation

    const MODEL_NAME = PRO_IMAGE_MODEL;
    let genAI: GoogleGenAI | null = null;
    let liveKey: string | undefined;
    let skipTests = false;

    before(async function () {
        if (process.env.C4X_RUN_LIVE_AI_TESTS !== '1') {
            // @skip-reason: Live AI tests require an explicit opt-in to avoid network calls in normal gates
            console.warn('⚠️ Skipping Gemini Image tests: set C4X_RUN_LIVE_AI_TESTS=1 to opt in');
            skipTests = true;
            this.skip();
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            // @skip-reason: Opted-in live integration test also requires GEMINI_API_KEY
            console.warn('⚠️ Skipping Gemini Image tests: No API Key found');
            skipTests = true;
            this.skip();
            return;
        }

        try {
            genAI = await createGeminiClient(apiKey);
            liveKey = apiKey;
        } catch (error) {
            // @skip-reason: Integration test requires working Gemini client initialization
            console.warn('⚠️ Skipping Gemini Image tests: Failed to initialize the Gemini client', error);
            skipTests = true;
            this.skip();
        }
    });

    it('Should verify the Pro image model is available', async function () {
        if (skipTests || !genAI) {
            this.skip();
        }

        const response = await genAI!.models.generateContent({ model: MODEL_NAME, contents: 'Say "ready" if you can generate images.' });
        const candidates = response.candidates;
        const text = responseText(response);

        assert.ok(candidates && candidates.length > 0, 'Model should return candidates');
        console.log(`   ✅ Model ${MODEL_NAME} is available (Response received)`);
    });

    it('Should generate a C4 System Context diagram image', async function () {
        if (skipTests || !genAI) {
            this.skip();
        }

        const prompt = `
Generate a C4 System Context diagram as a professional-looking image.

## Requirements:
- Use the official C4 Model color scheme (Person: dark blue #08427B, System: blue #1168BD, External: grey #999999)
- Include a "Customer" person who uses an "Online Banking System"
- The banking system connects to an external "Email System" and "Mainframe Banking"
- Use rounded rectangles, clean arrows with labels
- Include a small legend
- White background, clean professional style

Create this as a clear, presentation-ready diagram image.
`;

        const response = await genAI!.models.generateContent({ model: MODEL_NAME, contents: prompt });
        const candidates = response.candidates;

        assert.ok(candidates && candidates.length > 0, 'Should have response candidates');

        const parts = candidates[0].content?.parts || [];
        let imageFound = false;

        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                // A part without image data is not an image; it must not pass as one.
                const buffer = imagePartBytes(part);
                assert.ok(buffer, `the ${part.inlineData.mimeType} part carries image data`);
                imageFound = true;
                console.log(`   ✅ Image generated (${part.inlineData.mimeType})`);

                // Optionally save for inspection
                const testOutputPath = path.resolve(__dirname, '../../test-output-c1.png');
                fs.writeFileSync(testOutputPath, buffer);
                console.log(`   📁 Saved to: ${testOutputPath} (${(buffer.length / 1024).toFixed(1)} KB)`);
            }
        }

        assert.ok(imageFound, 'Response should contain an image');
    });

    it('Should generate a C4 Container diagram image', async function () {
        if (skipTests || !genAI) {
            this.skip();
        }

        const prompt = `
Generate a C4 Container diagram as a professional-looking image.

## Requirements:
- Show a "Web3 DeFi Platform" system boundary
- Inside the boundary:
  - Web Dashboard (React) - light blue container
  - Trading API (Node.js) - light blue container
  - Order Engine (Rust) - light blue container
  - Database (PostgreSQL) - cylinder shape
- External: "Ethereum Blockchain" (grey)
- User: "Trader" (dark blue person icon)
- Show relationships with labeled arrows
- Include color legend
- Professional, clean styling matching C4 Model standards

Create this as a high-quality diagram image.
`;

        const response = await genAI!.models.generateContent({ model: MODEL_NAME, contents: prompt });
        const candidates = response.candidates;

        assert.ok(candidates && candidates.length > 0, 'Should have response candidates');

        const parts = candidates[0].content?.parts || [];
        let hasImage = false;

        for (const part of parts) {
            if (part.inlineData?.mimeType?.startsWith('image/')) {
                const buffer = imagePartBytes(part);
                assert.ok(buffer, `the ${part.inlineData.mimeType} part carries image data`);
                hasImage = true;
                console.log(`   ✅ C2 Container diagram generated (${(buffer.length / 1024).toFixed(1)} KB)`);
            }
        }

        assert.ok(hasImage, 'Should generate container diagram image');
    });

    it('Should generate an image through GeminiService.generateVisualDiagram, as the command does', async function () {
        if (skipTests || !liveKey) {
            this.skip();
        }

        // The service as the command builds it: a stored key, the extension's own
        // reference images, the image model from settings (DEFAULT_IMAGE_MODEL unless
        // c4x.ai.imageModel says otherwise), resolution, heal and retry included.
        const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
        assert.ok(extension, 'the extension under test is installed');
        const context = {
            secrets: { get: async () => liveKey, store: async () => undefined },
            extensionUri: extension!.extensionUri,
        } as unknown as vscode.ExtensionContext;
        const service = new GeminiService(context);
        await service.initialize();

        const image = await service.generateVisualDiagram(
            'A Customer uses the Online Banking System, which sends e-mail through an external E-mail System.',
            'C1',
            'TB',
            { framework: 'C4', confidence: 1, reasoning: 'live integration test' },
        );

        assert.ok(image, 'generateVisualDiagram returned no image');
        const bytes = Buffer.from(image!, 'base64');
        assert.ok(bytes.length > 1000, `an image, not a fragment (${bytes.length} bytes)`);
    });

    // DELETED: 'Should auto-detect C4 level from context' -- empty stub, never implemented.
    // Feature does not exist yet; will be added as a proper test when level detection is built.
});
