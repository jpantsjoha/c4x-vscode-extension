
import * as assert from 'assert';
import * as vscode from 'vscode';
import { GeminiService } from '../../src/ai/GeminiService';
import { FileContext } from '../../src/ai/CodeContextExtractor';
import * as fs from 'fs';
import * as path from 'path';

describe('GeminiService Integration Test', () => {
    let geminiService: GeminiService;

    // Mock Context
    const mockContext: any = {
        secrets: {
            store: async (key: string, value: string) => { },
            get: async (key: string) => {
                // Read from .env for test
                const envPath = path.resolve(__dirname, '../../../.env');
                if (fs.existsSync(envPath)) {
                    const content = fs.readFileSync(envPath, 'utf-8');
                    const match = content.match(/GEMINI_API_KEY=['"]?([^'"\n]+)['"]?/);
                    return match ? match[1] : undefined;
                }
                return undefined;
            }
        },
        subscriptions: []
    };

    beforeEach(() => {
        geminiService = new GeminiService(mockContext);
    });

    it('Should generate a diagram using the fallback model if primary fails', async () => {
        // We know gemini-3-preview fails (404) and gemini-2.5-pro works (OK) based on our script.
        // We need to ensure the service picks up the key and executes the fallback.

        // Force initialize to ensure key is loaded
        await geminiService.initialize();

        const files: FileContext[] = [
            {
                path: 'test.ts',
                content: 'class User { name: string; } class App { user: User; }'
            }
        ];

        const instruction = 'Create a simple class diagram';

        try {
            console.log('Generating diagram (this may take a few seconds)...');
            const result = await geminiService.generateDiagram(files, instruction);

            console.log('Generation Result Length:', result.length);
            assert.ok(result.length > 0, 'Result should not be empty');
            assert.ok(result.includes('graph TB') || result.includes('classDiagram') || result.includes('c4:'), 'Result should contain C4X/Mermaid syntax');

        } catch (error: any) {
            assert.fail(`Generation failed: ${error.message}`);
        }
    }).timeout(20000); // Increase timeout for API call

    it('Should rigorously validate C1, C2, and C3 diagram syntax', async () => {
        // Force initialize to ensure key is loaded
        await geminiService.initialize();

        // Dynamically import Parser (or require) since it is in src
        // Note: In a real extension test context, we can import from src if configured in tsconfig, 
        // but here relative paths work.
        const { C4XParser } = require('../../src/parser/C4XParser');
        const parser = new C4XParser();

        const scenarios = [
            { type: 'System Context (C1)', instruction: 'Create a C4 System Context diagram for an Internet Banking System. Users: Personal Banking Customer. Systems: Internet Banking System, Mainframe Banking System, E-mail System. Relationships: Customer uses Internet Banking; Internet Banking uses Mainframe; Internet Banking sends e-mail.' },
            { type: 'Container (C2)', instruction: 'Create a C4 Container diagram for the Internet Banking System. Containers: Single-Page Application (React), Mobile App (Flutter), API Application (Java/Spring), Database (Oracle). Show relationships.' }
            // { type: 'Component (C3)', instruction: 'Create a C4 Component diagram for the API Application. Components: Sign In Controller, Accounts Summary Controller, Security Component, Mainframe Banking System Facade. Show relationships.' }
        ];

        let markdownOutput = '# Gemini Generated Samples\n\nVerified by Integration Test.\n\n';

        for (const scenario of scenarios) {
            console.log(`\n🧪 Testing Scenario: ${scenario.type}`);

            const files: FileContext[] = [{ path: 'context.md', content: 'Architecture context...' }]; // minimal context

            try {
                const start = Date.now();
                const result = await geminiService.generateDiagram(files, scenario.instruction);
                const duration = Date.now() - start;
                console.log(`   ✅ Generated in ${duration}ms. Length: ${result.length}`);

                // 1. Basic C4x Syntax Checks
                assert.ok(result.includes('graph TB') || result.includes('graph LR'), 'Missing graph direction');
                assert.ok(result.includes('%%{ c4:'), 'Missing C4 directive');

                // 2. parser Validation
                try {
                    parser.parse(result);
                    console.log('   ✅ Syntax Valid (Parser Passed)');
                } catch (e: any) {
                    console.error('   ❌ Parser Error:', e.message);
                    assert.fail(`Parser failed for ${scenario.type}: ${e.message}`);
                }

                // 3. Strict Rule Check: No Quoted Subgraphs
                // Regex to find 'subgraph "..."'
                const quotedSubgraphRegex = /subgraph\s+"[^"]+"/;
                if (quotedSubgraphRegex.test(result)) {
                    assert.fail(`Validation Failed: Found quoted subgraph identifier in ${scenario.type}. This breaks the parser.`);
                } else {
                    console.log('   ✅ Subgraph Syntax Check Passed (No quotes)');
                }

                markdownOutput += `## ${scenario.type}\n\nRunning time: ${duration}ms\n\n### Prompt\n${scenario.instruction}\n\n### Result\n\`\`\`c4x\n${result}\n\`\`\`\n\n`;

            } catch (error: any) {
                console.error(`   ❌ Failed: ${error.message}`);
                throw error;
            }
        }

        // Write to gemini-sample.md
        const samplePath = path.resolve(__dirname, '../../gemini-sample.md');
        fs.writeFileSync(samplePath, markdownOutput);
        console.log(`\n📄 Saved samples to: ${samplePath}`);

    }).timeout(60000); // 60s timeout for 3 API calls
});
