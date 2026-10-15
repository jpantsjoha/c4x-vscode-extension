import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * Both commands construct a GeminiService at activation, and a stored key used
 * to make that build a client, which loads the 1.8 MB `@google/genai` for every
 * user. The service now holds the key and builds the client on the first call
 * that reaches the API. Checked in a fresh process, because in this one other
 * tests have already loaded the SDK.
 */
describe('@google/genai is loaded on first use, not at construction', () => {
    it('is absent after construction with a stored key, and present after the first generation', function () {
        this.timeout(60_000);
        const root = path.resolve(__dirname, '..', '..', '..');
        const output = execFileSync(
            process.execPath,
            ['-r', path.join(root, 'scripts', 'register-unit-ts.js'), path.join(__dirname, 'sdk-load-probe.ts')],
            { cwd: root, encoding: 'utf8', env: { ...process.env, GEMINI_API_KEY: '' } },
        );
        const line = output.trim().split('\n').reverse().find(text => text.startsWith('{'));
        assert.ok(line, `the probe printed no result. Output: ${output}`);
        const result = JSON.parse(line);

        assert.strictEqual(result.error, undefined, result.error);
        assert.strictEqual(result.afterImport, false, 'importing the service must not load the SDK');
        assert.strictEqual(result.ready, true, 'a stored key makes the service ready');
        assert.strictEqual(result.afterConstruction, false, 'construction and initialize() with a stored key must not load the SDK');
        assert.strictEqual(result.generated, true, 'the first generation succeeds');
        assert.strictEqual(result.afterGenerate, true, 'the first generation loads the SDK');
    });
});
