// scripts/test-visual-generation.ts
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

// Mock VS Code
// We must mock it BEFORE importing any module that depends on 'vscode'
const mockVscode = {
    workspace: {
        fs: {
            stat: async (uri: any) => {
                try {
                    const stats = fs.statSync(uri.fsPath);
                    return { type: stats.isFile() ? 1 : 0 };
                } catch { throw new Error('File not found'); }
            },
            readFile: async (uri: any) => {
                return new Uint8Array(fs.readFileSync(uri.fsPath));
            }
        },
        getConfiguration: () => ({
            get: (key: string) => {
                if (key === 'c4x.ai.model') return 'gemini-3-pro-image-preview';
                if (key === 'c4x.ai.apiKey') return process.env.GEMINI_API_KEY;
                return undefined;
            }
        }),
        workspaceFolders: [{ uri: { fsPath: process.cwd() } }]
    },
    Uri: {
        file: (path: string) => ({ fsPath: path }),
        joinPath: (base: any, ...args: string[]) => ({
            fsPath: path.join(base.fsPath, ...args)
        })
    },
    FileType: { File: 1, Directory: 2, Unknown: 0 },
    ExtensionContext: {},
    ProgressLocation: { Notification: 15 },
    window: {
        withProgress: async (_opts: any, task: any) => {
            return task({ report: (msg: any) => console.log(`[Progress] ${msg.message}`) });
        }
    }
};

// Mock module requires
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (this: any, id: string) {
    if (id === 'vscode') return mockVscode;
    return originalRequire.apply(this, arguments);
};

// Import Service (after mocking)
// Use relative path from scripts/ to src/
import { GeminiService } from '../src/ai/GeminiService';

async function run() {
    console.log('Starting Visual Generation E2E Test...');

    // Check key
    if (!process.env.GEMINI_API_KEY) {
        console.error('ERROR: GEMINI_API_KEY env var not set.');
        console.error('Please export GEMINI_API_KEY=... and run again.');
        process.exit(1);
    }

    const extPath = path.resolve(__dirname, '..');
    const context = {
        extensionUri: { fsPath: extPath },
        secrets: { get: async () => process.env.GEMINI_API_KEY, store: async () => { } }
    } as any;

    const service = new GeminiService(context);

    const outDir = path.join(extPath, 'out', 'visual-test');
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

    const tests = [
        {
            name: 'C1-AgentLoop',
            level: 'C1',
            text: `The Agent Loop: Reason, Act, Observe.
            At the heart of every agentic system is a loop.
            GOAL -> REASON -> ACT -> OBSERVE.
            ACT calls External Systems.
            OBSERVE returns results to REASON.`
        },
        {
            name: 'C2-FunctionCalling',
            level: 'C2',
            text: `Function Calling:
            1. User asks Agent.
            2. Agent reasons and calls Tool.
            3. Tool calls External System API.
            4. External System returns data.
            5. Tool returns Observation.
            6. Agent answers User.`
        },
        {
            name: 'C3-ADKAgent',
            level: 'C3',
            text: `A Simple ADK Agent in Python.
            Class Agent has name, model, instructions, and tools list.
            Tool 'get_current_time' uses datetime library.
            Agent orchestrates the tool execution.`
        }
    ];

    for (const t of tests) {
        console.log(`\nGenerating ${t.name} (${t.level})...`);
        try {
            const base64 = await service.generateVisualDiagram(t.text, t.level, 'TB');
            if (base64) {
                const buffer = Buffer.from(base64, 'base64');
                const outFile = path.join(outDir, `${t.name}.png`);
                fs.writeFileSync(outFile, buffer);
                console.log(`✅ Success! Saved to ${outFile} (${buffer.length} bytes)`);
            } else {
                console.error(`❌ Failed: No image returned for ${t.name}`);
            }
        } catch (e) {
            console.error(`❌ Error in ${t.name}:`, e);
        }
    }
}

run();
