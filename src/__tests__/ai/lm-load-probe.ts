// Child-process probe for vscode-lm-lazy-load.test.ts. Not a test file: it runs
// in a fresh Node process and reports whether the `vscode-lm` provider modules
// are in require.cache at each stage.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

const providerLoaded = (): boolean => Object.keys(require.cache).some(file => /[\\/]ai[\\/]providers[\\/]/.test(file));

async function main(): Promise<void> {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const vscodeMock = require('../__mocks__/vscode') as typeof import('../__mocks__/vscode');
    require('../../commands/GenerateDiagramCommand');
    const { selectModelCommand } = require('../../commands/selectModel') as typeof import('../../commands/selectModel');
    /* eslint-enable @typescript-eslint/no-require-imports */
    const afterImport = providerLoaded();

    await selectModelCommand(async () => [], 'text');
    const afterGeminiPicker = providerLoaded();

    vscodeMock.setConfigurationValueForTests('provider', 'vscode-lm');
    await selectModelCommand(async () => [], 'text');
    const afterLanguageModelPicker = providerLoaded();

    process.stdout.write(JSON.stringify({ afterImport, afterGeminiPicker, afterLanguageModelPicker }) + '\n');
}

main().catch(error => {
    process.stdout.write(JSON.stringify({ error: String(error) }) + '\n');
});
