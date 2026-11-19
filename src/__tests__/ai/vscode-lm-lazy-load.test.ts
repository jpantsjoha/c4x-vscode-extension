import * as assert from 'assert';
import { execFileSync } from 'child_process';
import * as path from 'path';

/**
 * (d) of #392: the `vscode-lm` provider's code loads only when that provider is
 * chosen. Importing the generate command and the model picker, and running the
 * Gemini picker, must not load it. Checked in a fresh process, because in this
 * one other tests have already loaded the provider.
 */
describe('vscode-lm provider is loaded only when chosen (#392)', () => {
    it('is absent after import and on the Gemini path, present once vscode-lm is used', function () {
        this.timeout(60_000);
        const root = path.resolve(__dirname, '..', '..', '..');
        const output = execFileSync(
            process.execPath,
            ['-r', path.join(root, 'scripts', 'register-unit-ts.js'), path.join(__dirname, 'lm-load-probe.ts')],
            { cwd: root, encoding: 'utf8' },
        );
        const line = output.trim().split('\n').reverse().find(text => text.startsWith('{'));
        assert.ok(line, `the probe printed no result. Output: ${output}`);
        const result = JSON.parse(line);
        assert.strictEqual(result.error, undefined, result.error);
        assert.strictEqual(result.afterImport, false, 'importing the commands must not load the provider');
        assert.strictEqual(result.afterGeminiPicker, false, 'the Gemini picker must not load the provider');
        assert.strictEqual(result.afterLanguageModelPicker, true, 'choosing vscode-lm loads it');
    });
});
