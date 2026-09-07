import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

// Exercise the real script with key lookup disabled, never a real API call.
function runWithoutKey(required: boolean) {
    const script = path.resolve(__dirname, '../../scripts/test-live-generation.ts');
    const env: NodeJS.ProcessEnv = { ...process.env, C4X_REQUIRE_LIVE: required ? '1' : '0' };
    delete env.GEMINI_API_KEY;
    delete env.GEMINI_API_KEY_FALLBACK;
    return spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', `
        const fs = require('node:fs');
        const exists = fs.existsSync;
        fs.existsSync = p => String(p).endsWith('/.env') ? false : exists(p);
        global.fetch = () => { throw new Error('Unexpected network request'); };
        require(${JSON.stringify(script)});
    `], { env, encoding: 'utf8', timeout: 15000 });
}

describe('Release live generation policy', () => {
    it('fails a required release gate when no working key is available', () => {
        const result = runWithoutKey(true);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /required|REQUIRED/i);
    });
    it('allows an explicitly non-release developer run without credentials', () => {
        const result = runWithoutKey(false);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /SKIPPED/);
    });
});
