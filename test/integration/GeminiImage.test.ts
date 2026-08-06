/**
 * Integration Test: Gemini Image Model for Visual C4 Diagrams
 * 
 * Tests the gemini-3-pro-image-preview model's capability to generate
 * C4 diagrams as PNG images from architectural descriptions.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleGenerativeAI } from '@google/generative-ai';

describe('Gemini Image Model Integration Test', function () {
    this.timeout(120000); // 2 minutes for image generation

    const MODEL_NAME = 'gemini-3-pro-image-preview';
    let genAI: GoogleGenerativeAI | null = null;
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
            genAI = new GoogleGenerativeAI(apiKey);
        } catch (error) {
            // @skip-reason: Integration test requires working GoogleGenerativeAI initialization
            console.warn('⚠️ Skipping Gemini Image tests: Failed to initialize GoogleGenerativeAI', error);
            skipTests = true;
            this.skip();
        }
    });

    it('Should verify gemini-3-pro-image-preview model is available', async function () {
        if (skipTests || !genAI) {
            this.skip();
        }

        const model = genAI!.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent('Say "ready" if you can generate images.');
        const response = await result.response;
        const candidates = response.candidates;
        const text = response.text();

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

        const model = genAI!.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const candidates = response.candidates;

        assert.ok(candidates && candidates.length > 0, 'Should have response candidates');

        const parts = candidates[0].content?.parts || [];
        let imageFound = false;

        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                imageFound = true;
                console.log(`   ✅ Image generated (${part.inlineData.mimeType})`);

                // Optionally save for inspection
                const testOutputPath = path.resolve(__dirname, '../../test-output-c1.png');
                const buffer = Buffer.from(part.inlineData.data, 'base64');
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

        const model = genAI!.getGenerativeModel({ model: MODEL_NAME });
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const candidates = response.candidates;

        assert.ok(candidates && candidates.length > 0, 'Should have response candidates');

        const parts = candidates[0].content?.parts || [];
        let hasImage = false;

        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                hasImage = true;
                const buffer = Buffer.from(part.inlineData.data, 'base64');
                console.log(`   ✅ C2 Container diagram generated (${(buffer.length / 1024).toFixed(1)} KB)`);
            }
        }

        assert.ok(hasImage, 'Should generate container diagram image');
    });

    // DELETED: 'Should auto-detect C4 level from context' -- empty stub, never implemented.
    // Feature does not exist yet; will be added as a proper test when level detection is built.
});
