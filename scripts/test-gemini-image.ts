/**
 * Test Script: Gemini Image Model - Visual C4 Diagram Generation
 * 
 * This script tests the gemini-3-pro-image-preview model's ability to generate
 * C4 Model diagrams as PNG images from text descriptions.
 * 
 * Usage: npx ts-node scripts/test-gemini-image.ts
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

// Load API key
const envPath = path.resolve(__dirname, '../.env');
let apiKey = process.env.GEMINI_API_KEY;

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=['"]?([^'"\n]+)['"]?/);
    if (match) {
        apiKey = match[1];
    }
}

if (!apiKey) {
    console.error('❌ Error: GEMINI_API_KEY not found');
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);

// Visual Design System Prompt
const VISUAL_DESIGN_PROMPT = `
You are an expert C4 Model diagram designer. Generate a professional, presentation-ready C4 diagram as a PNG image.

## Visual Style Requirements (STRICT)
- **Color Scheme**: 
  - Person: Dark Blue (#08427B)
  - Software System: Blue (#1168BD)
  - External System: Grey (#999999)
  - Container: Light Blue (#438DD5)
  - Component: Lighter Blue (#85BBF0)
- **Shapes**: Rounded rectangles, stick-figure icons for Person
- **Arrows**: Solid lines with filled triangle heads, labels on arrows
- **Layout**: Top-to-bottom for hierarchy, clean spacing
- **Legend**: Include a small legend in the corner explaining the notation
- **Background**: White or very light grey
- **Font**: Clean sans-serif (like Arial or Helvetica)

## C4 Level Detection
Analyze the context and determine the appropriate level:
- C1 (System Context): High-level users and systems
- C2 (Container): Applications, databases, services within a system
- C3 (Component): Internal structure of a container

Generate a clear, professional diagram matching the detected level.
`;

async function testImageGeneration() {
    console.log('🎨 Testing Gemini Image Model for C4 Diagram Generation...\n');

    const MODEL_NAME = 'gemini-3-pro-image-preview';

    // Test context: Web3 DeFi Architecture
    const testContext = `
    Create a C4 Container diagram for a "DeFi Trading Platform" with:
    
    Users:
    - Retail Trader (uses web interface)
    - Institutional Client (uses API)
    
    Containers within "DeFi Platform":
    - Web Dashboard (React + TypeScript)
    - Trading API (Node.js/Express)
    - Order Matching Engine (Rust)
    - Portfolio Database (PostgreSQL)
    - Redis Cache (Session/Price data)
    
    External Systems:
    - Ethereum Blockchain (smart contracts)
    - Price Oracle (Chainlink)
    - KYC Provider (external service)
    
    Relationships:
    - Trader uses Web Dashboard
    - Dashboard calls Trading API
    - API submits to Matching Engine
    - Engine writes to Database
    - Engine broadcasts to Blockchain
    - API queries Price Oracle
    `;

    try {
        console.log(`📡 Using model: ${MODEL_NAME}`);
        console.log('📝 Context: DeFi Trading Platform (C2 Container Diagram)\n');

        const model = genAI.getGenerativeModel({ model: MODEL_NAME });

        const fullPrompt = `${VISUAL_DESIGN_PROMPT}\n\n## Architecture Context:\n${testContext}\n\nGenerate the C4 diagram now.`;

        console.log('⏳ Generating image...');
        const result = await model.generateContent(fullPrompt);
        const response = await result.response;

        // Check for image parts in response
        const candidates = response.candidates;
        if (!candidates || candidates.length === 0) {
            console.error('❌ No response candidates');
            return;
        }

        const parts = candidates[0].content?.parts || [];
        let imageFound = false;

        for (const part of parts) {
            if (part.inlineData && part.inlineData.mimeType?.startsWith('image/')) {
                console.log('✅ Image generated successfully!');
                console.log(`   MIME Type: ${part.inlineData.mimeType}`);

                // Save the image
                const imageData = part.inlineData.data;
                const outputPath = path.resolve(__dirname, '../examples/generated-defi-c2.png');

                // Decode base64 and save
                const buffer = Buffer.from(imageData, 'base64');
                fs.writeFileSync(outputPath, buffer);

                console.log(`📁 Saved to: ${outputPath}`);
                console.log(`   Size: ${(buffer.length / 1024).toFixed(1)} KB`);
                imageFound = true;
            } else if (part.text) {
                console.log('\n📝 Text response:', part.text.substring(0, 200) + '...');
            }
        }

        if (!imageFound) {
            console.log('⚠️  No image in response. Model returned text only.');
            console.log('   This may indicate the model does not support image generation for this prompt.');
        }

    } catch (error: any) {
        if (error.message.includes('404')) {
            console.error(`❌ Model not found: ${MODEL_NAME}`);
        } else if (error.message.includes('400')) {
            console.error('❌ Bad request - model may not support image generation');
        } else {
            console.error('❌ Error:', error.message);
        }
    }
}

async function main() {
    console.log('🔍 Gemini Image Model Test\n');
    console.log('='.repeat(50));

    // First verify the model exists
    const MODEL_NAME = 'gemini-3-pro-image-preview';
    console.log(`\n1️⃣ Checking model availability: ${MODEL_NAME}`);

    try {
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const testResult = await model.generateContent('Say "ready" if you can generate images.');
        console.log('   ✅ Model is available\n');
    } catch (error: any) {
        console.error(`   ❌ Model check failed: ${error.message}\n`);
        return;
    }

    console.log('2️⃣ Testing image generation...\n');
    await testImageGeneration();

    console.log('\n' + '='.repeat(50));
    console.log('Test complete.');
}

main();
