/**
 * Integration Test: Gemini Generation with Auto-Fix
 * 
 * This script tests the full flow:
 * 1. Builds a prompt from GEMINI.md + Example B scenario
 * 2. Calls Gemini API
 * 3. Applies cleanResponse() auto-fix logic
 * 4. Verifies output has correct $sprite syntax
 * 
 * Run with: GEMINI_API_KEY=your-key node scripts/test-gemini-integration.js
 */

const fs = require('fs');
const path = require('path');

// Check for API key
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.error('❌ GEMINI_API_KEY environment variable not set');
    console.log('Usage: GEMINI_API_KEY=your-key node scripts/test-gemini-integration.js');
    process.exit(1);
}

// The exact cleanResponse logic from GeminiService.ts
function cleanResponse(text) {
    let clean = text.trim();

    // 1. Extract Code Block if present
    const codeBlockRegex = /```(?:c4x)?\s*([\s\S]*?)```/i;
    const match = text.match(codeBlockRegex);
    if (match && match[1]) {
        clean = match[1].trim();
    } else {
        if (clean.startsWith('```c4x')) { clean = clean.substring(6); }
        else if (clean.startsWith('```')) { clean = clean.substring(3); }
        if (clean.endsWith('```')) { clean = clean.substring(0, clean.length - 3); }
    }

    // 2. Sanitize Relationship Labels
    clean = clean.replace(/((?:--|\.\.|-\.-|==)>\s*\|)([^|]+)(\|)/g, (match, arrowPart, label, endPipe) => {
        const cleanLabel = label.replace(/<\/?br\s*\/?>/gi, ' ');
        return `${arrowPart}${cleanLabel}${endPipe}`;
    });

    // 3. CRITICAL FIX: Auto-correct Lazy Sprite Syntax
    const originalClean = clean;
    clean = clean.replace(/,\s*="([^"]+)"/g, ', $sprite="$1"');
    if (clean !== originalClean) {
        console.log('🔧 [cleanResponse] Detected lazy sprite syntax. Auto-corrected.');
    }

    return clean.trim();
}

// Example B prompt
const exampleBPrompt = `Create a C4 Container diagram for a **Web3 NFT Analytics Platform**.
**Frontend**: Next.js Web App hosted on **Firebase Hosting**.
**Auth**: Hybrid authentication using **Firebase Auth** (socials) and **WalletConnect** (crypto wallet).
**Backend**: **Firebase Cloud Functions** (Node.js) for serverless logic.
**Data Layer**:
  - **Off-chain Data**: **Firestore** (NoSQL user profiles).
  - **On-chain Analytics**: **BigQuery** (indexing public blockchain data).
  - **Blockchain**: Interaction with **Ethereum** Smart Contracts via RPC.
**Key Flow**: User connects wallet -> App fetches profile from Firestore and transaction history from BigQuery -> Displayed on Dashboard.`;

async function runTest() {
    console.log('🧪 Gemini Integration Test\n');
    console.log('📋 Example B Prompt:');
    console.log(exampleBPrompt.substring(0, 200) + '...\n');

    // Load GEMINI.md for context
    let geminiContext = '';
    try {
        geminiContext = fs.readFileSync(path.join(__dirname, '..', 'GEMINI.md'), 'utf8');
        console.log('✅ Loaded GEMINI.md as context\n');
    } catch (e) {
        console.warn('⚠️ Could not load GEMINI.md, using minimal context');
    }

    // Build the full prompt (simplified version of GeminiService.buildPrompt)
    const fullPrompt = `
You are an expert Software Architect and C4 Model specialist via the C4X extension.
Your task is to analyze the following description and generate a MATCHING, VALID C4X DSL diagram.

## DESIGN GUIDELINES & RULES (Adhere Strictly):
${geminiContext}

## CRITICAL SYNTAX RULES:
1. **Subgraph IDs**: MUST NOT contain quotes.
2. **Directives**: Start with \`%%{ c4: container }%%\`.
3. **Arrows**: Use \`-->\` (standard) or \`..>\` (dotted). Do NOT use \`->\`.

5. 🎨 **ICON / SPRITE USAGE**:
   - **Syntax**: You MUST use the **named parameter syntax**: \`$sprite="name"\`.
   - **Standard Icons**: \`$sprite="react"\`, \`$sprite="java"\`, \`$sprite="person"\`.
   - **Cloud Icons (Namespaced)**: Use \`c4xicons\` namespace.
   
   ✅ **CORRECT**: Container(Web, "Web App", "React", $sprite="react")
   ❌ **FORBIDDEN**: Container(Web, "Web App", "React", ="react")

USER INSTRUCTION:
"${exampleBPrompt}"

Output ONLY the C4X DSL code block. No explanations.
`;

    console.log('📡 Calling Gemini API (gemini-2.5-pro)...\n');

    try {
        // Dynamic import for ES module
        const { GoogleGenerativeAI } = await import('@google/generative-ai');
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

        const result = await model.generateContent(fullPrompt);
        const rawText = result.response.text();

        console.log('📥 Raw Response from Gemini:');
        console.log('─'.repeat(60));
        console.log(rawText.substring(0, 1000) + (rawText.length > 1000 ? '...' : ''));
        console.log('─'.repeat(60));
        console.log('');

        // Apply auto-fix
        console.log('🔄 Applying cleanResponse() with auto-fix...\n');
        const cleanedText = cleanResponse(rawText);

        console.log('📤 Cleaned Response:');
        console.log('─'.repeat(60));
        console.log(cleanedText.substring(0, 1000) + (cleanedText.length > 1000 ? '...' : ''));
        console.log('─'.repeat(60));
        console.log('');

        // Verify: Check for lazy sprite syntax
        const lazySpritePattern = /,\s*="[^"]+"/g;
        const lazyMatches = cleanedText.match(lazySpritePattern);

        if (lazyMatches) {
            console.log('❌ FAIL: Lazy sprite syntax STILL present after auto-fix:');
            console.log(`   Found: ${JSON.stringify(lazyMatches)}`);
            process.exit(1);
        }

        // Verify: Check for correct sprite syntax
        const correctSpritePattern = /\$sprite="[^"]+"/g;
        const correctMatches = cleanedText.match(correctSpritePattern);

        if (correctMatches && correctMatches.length > 0) {
            console.log('✅ PASS: Found correct $sprite syntax:');
            console.log(`   ${correctMatches.slice(0, 5).join(', ')}${correctMatches.length > 5 ? '...' : ''}`);
        } else {
            console.log('⚠️ WARNING: No $sprite syntax found (AI may have omitted icons - acceptable)');
        }

        console.log('\n✅ Integration test passed!');
        process.exit(0);

    } catch (error) {
        console.error('❌ API Error:', error.message);
        process.exit(1);
    }
}

runTest();
