import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

describe('Extension-host completion receipt', () => {
    it('rejects a successful Electron exit that never ran the test suite', () => {
        const entry = path.resolve(__dirname, '../../test/runTest.ts');
        const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', `
            const Module = require('node:module');
            const original = Module._load;
            Module._load = function(id, ...args) {
                if (id === '@vscode/test-electron') return {
                    downloadAndUnzipVSCode: async () => '/unused-test-executable',
                    runTests: async () => undefined,
                };
                return original.call(this, id, ...args);
            };
            require(${JSON.stringify(entry)});
        `], { encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stderr, /without a completed test receipt/);
    });
});
