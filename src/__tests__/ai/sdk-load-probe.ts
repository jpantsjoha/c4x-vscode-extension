// Child-process probe for sdk-lazy-load.test.ts. Not a test file itself: it
// runs in a fresh Node process so no other test has already loaded the SDK,
// and prints whether `@google/genai` is in require.cache at each stage.
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

const marker = `${path.sep}@google${path.sep}genai${path.sep}`;
const sdkLoaded = (): boolean => Object.keys(require.cache).some(file => file.includes(marker));

const validC4X = '%%{ c4: container }%%\ngraph TB\nPerson(user, "User", "A user")\nSystem(sys, "System", "Main system")\nuser -->|Uses| sys';

function json(body: unknown): Response {
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

async function main(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { GeminiService } = require('../../ai/GeminiService') as typeof import('../../ai/GeminiService');
    const afterImport = sdkLoaded();

    const context = {
        secrets: { get: async () => 'stored-key', store: async () => undefined },
        extensionUri: {},
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = new GeminiService(context as any);
    await service.initialize();
    const ready = await service.checkReady();
    const afterConstruction = sdkLoaded();

    globalThis.fetch = (async (input: string | URL | Request) => {
        const url = String(input);
        if (url.includes('/models?')) {
            return json({ models: [{ name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }] });
        }
        return json({ candidates: [{ content: { role: 'model', parts: [{ text: '```c4x\n' + validC4X + '\n```' }] }, finishReason: 'STOP' }] });
    }) as typeof fetch;
    const diagram = await service.generateDiagram([], 'Create a diagram');

    process.stdout.write(JSON.stringify({
        afterImport,
        ready,
        afterConstruction,
        generated: diagram.includes('graph TB'),
        afterGenerate: sdkLoaded(),
    }) + '\n');
}

main().catch(error => {
    process.stdout.write(JSON.stringify({ error: String(error) }) + '\n');
    process.exitCode = 1;
});
