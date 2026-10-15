import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';

// Exercise the real script with no key in the environment, never a real API
// call. A ./.env holding a key is planted: keys come from environment
// variables only, so the gate must neither read it nor use it. Any read of a
// .env file is reported on stderr as ENV-FILE-READ.
function runWithoutKey(required: boolean) {
    const script = path.resolve(__dirname, '../../scripts/test-live-generation.ts');
    const env: NodeJS.ProcessEnv = { ...process.env, C4X_REQUIRE_LIVE: required ? '1' : '0' };
    delete env.GEMINI_API_KEY;
    delete env.GEMINI_API_KEY_FALLBACK;
    return spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-e', `
        const fs = require('node:fs');
        const path = require('node:path');
        const isEnvFile = p => path.basename(String(p)) === '.env';
        const exists = fs.existsSync;
        const read = fs.readFileSync;
        fs.existsSync = p => isEnvFile(p) ? true : exists(p);
        fs.readFileSync = function (p, ...rest) {
            if (isEnvFile(p)) {
                process.stderr.write('ENV-FILE-READ\\n');
                return 'GEMINI_API_KEY=planted-env-file-key-must-not-be-used\\n';
            }
            return read.call(this, p, ...rest);
        };
        global.fetch = () => { throw new Error('Unexpected network request'); };
        require(${JSON.stringify(script)});
    `], { env, encoding: 'utf8', timeout: 15000 });
}

/**
 * Run the real gate against the fake API in __mocks__/liveGateFakeApi.ts, with a
 * fake key in the environment. Nothing leaves the process.
 */
const FAKE_KEY = 'fake-live-gate-key-not-a-real-key-000';

function runAgainstFakeApi(scenario: 'healthy' | 'pro-gone' | 'key-dead' | 'hang', required: boolean, extraEnv: NodeJS.ProcessEnv = {}) {
    const script = path.resolve(__dirname, '../../scripts/test-live-generation.ts');
    const fake = path.resolve(__dirname, '__mocks__/liveGateFakeApi.ts');
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        C4X_REQUIRE_LIVE: required ? '1' : '0',
        C4X_FAKE_GEMINI: scenario,
        GEMINI_API_KEY: FAKE_KEY,
        ...extraEnv,
    };
    delete env.GEMINI_API_KEY_FALLBACK;
    const result = spawnSync(process.execPath, ['-r', 'ts-node/register/transpile-only', '-r', fake, script], {
        env,
        encoding: 'utf8',
        timeout: 60000,
    });
    const line = result.stderr.split('\n').find(text => text.startsWith('FAKE-GEMINI '));
    const sent = line ? JSON.parse(line.slice('FAKE-GEMINI '.length)) as Array<{
        method: string; url: string; kind: string; model?: string; keyHeaderMatches: boolean; urlCarriesKey: boolean; bodyKeys: string[];
        startedAt?: number; abortedAt?: number; answeredLate?: boolean;
    }> : [];
    return { ...result, sent };
}

describe('Live generation gate, dry-run against a fake Gemini API', function () {
    this.timeout(90000);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const models = require('../ai/models') as typeof import('../ai/models');
    const shipped = [
        models.DEFAULT_MODEL, models.PRO_MODEL, models.LITE_MODEL,
        models.DEFAULT_IMAGE_MODEL, models.PRO_IMAGE_MODEL, models.LITE_IMAGE_MODEL,
    ];

    it('passes when every shipped model answers, calling each one the way the extension does', () => {
        const result = runAgainstFakeApi('healthy', true);
        const output = result.stdout + result.stderr;
        assert.equal(result.status, 0, output);
        assert.match(result.stdout, /All \d+ shipped models generate and parse\./);

        const generated = result.sent.filter(request => request.kind === 'generate');
        for (const model of shipped) {
            assert.ok(generated.some(request => request.model === model), `the gate must call ${model}`);
        }
        for (const request of result.sent) {
            assert.ok(request.url.startsWith('https://generativelanguage.googleapis.com/v1beta/models'), request.url);
            assert.ok(request.keyHeaderMatches, `the key travels in x-goog-api-key: ${request.method} ${request.url}`);
            assert.ok(!request.urlCarriesKey, `the key must not be in the URL: ${request.url}`);
        }
        for (const request of generated) {
            assert.deepEqual(request.bodyKeys, ['contents'], 'the request body the extension sends: the prompt and nothing else');
        }
        assert.ok(result.sent.some(request => request.kind === 'list'), 'the key is probed and discovery runs through the model list');
        assert.ok(!output.includes(FAKE_KEY), 'the gate never prints the key');
    });

    it('fails, naming the model, when one shipped model is withdrawn', () => {
        const result = runAgainstFakeApi('pro-gone', true);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        const failure = result.stdout.split('\n').find(line => line.includes('FAIL') && line.includes('failover text'));
        assert.ok(failure, result.stdout);
        assert.ok(failure!.includes(models.PRO_MODEL) && failure!.includes('404 NOT_FOUND'), failure);
        assert.match(result.stderr, /1 of \d+ shipped models failed\./);
        assert.ok(!(result.stdout + result.stderr).includes(FAKE_KEY));
    });

    it('aborts a call that misses its deadline before the next model is called, so a late answer is never read', () => {
        // The gate used to race a timer against the call: it stopped waiting at
        // the deadline but left the request running, so the next model started
        // while the old one was still open and a late answer could still be
        // validated and logged. 300 ms here stands for the real 120 s.
        const result = runAgainstFakeApi('hang', true, { C4X_LIVE_TIMEOUT_MS: '300', C4X_FAKE_LATE_MS: '450' });
        assert.equal(result.status, 1, result.stdout + result.stderr);

        const generated = result.sent.filter(request => request.kind === 'generate');
        assert.ok(generated.length >= shipped.length, `every shipped model is called (${generated.length})`);
        generated.forEach((request, index) => {
            assert.ok(request.abortedAt !== undefined, `${request.model}: the request was left open past its deadline`);
            assert.ok(!request.answeredLate, `${request.model}: a late answer was delivered to the gate`);
            const waited = request.abortedAt! - request.startedAt!;
            assert.ok(waited >= 250 && waited < 450, `${request.model}: aborted after ${waited} ms, expected about 300`);
            assert.deepEqual(request.bodyKeys, ['contents'], 'the deadline does not change the request body');
            if (index > 0) {
                const previous = generated[index - 1];
                assert.ok(request.startedAt! >= previous.abortedAt!, `${request.model} started before ${previous.model} was aborted`);
            }
        });
        for (const model of shipped) {
            const line = result.stdout.split('\n').find(text => text.includes('FAIL') && text.includes(` ${model} `));
            assert.ok(line && line.includes('no answer within 0.3 s'), `${model}: ${line ?? 'no FAIL line'}`);
        }
        assert.ok(!(result.stdout + result.stderr).includes(FAKE_KEY));
    });

    it('fails closed under C4X_REQUIRE_LIVE=1 when the only key is rejected, without generating anything', () => {
        const result = runAgainstFakeApi('key-dead', true);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /REQUIRED but no working Gemini key/);
        assert.deepEqual(result.sent.filter(request => request.kind === 'generate'), [], 'a dead key is probed, never spent');
        assert.ok(!(result.stdout + result.stderr).includes(FAKE_KEY));
    });
});

describe('Release live generation policy', () => {
    it('fails a required release gate when no working key is available', () => {
        const result = runWithoutKey(true);
        assert.equal(result.status, 1, result.stdout + result.stderr);
        assert.match(result.stdout + result.stderr, /required|REQUIRED/i);
        assert.ok(!result.stderr.includes('ENV-FILE-READ'), 'the gate read a .env file');
    });
    it('allows an explicitly non-release developer run without credentials', () => {
        const result = runWithoutKey(false);
        assert.equal(result.status, 0, result.stdout + result.stderr);
        assert.match(result.stdout, /SKIPPED/);
        assert.ok(!result.stderr.includes('ENV-FILE-READ'), 'the gate read a .env file');
        assert.ok(!result.stdout.includes('.env'), 'the SKIPPED message still points at ./.env');
    });
});
