/**
 * The test-only smoke handlers must not exist in a normal session (#368).
 * Client: the normal script holds no smoke code; only a session token adds it.
 * Host: every smoke message type is gated on the per-panel session (structural,
 * because PreviewPanel needs a full VS Code host to construct).
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vm from 'vm';
import { buildPreviewClientScript, PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';

const SMOKE_MARKERS = ['smoke.act', 'smoke.acted', 'smoke.rendered', 'smoke.renderFailed', 'smokeRequest', 'C4X_SMOKE_SESSION', 'smokeNodeReport'];

describe('smoke handlers are absent from a normal session (#368)', () => {
    it('the normal client script contains no smoke handler or message type', () => {
        for (const script of [PREVIEW_CLIENT_SCRIPT, buildPreviewClientScript(), buildPreviewClientScript(undefined)]) {
            for (const marker of SMOKE_MARKERS) {
                assert.ok(!script.includes(marker), `normal client script contains "${marker}"`);
            }
        }
    });

    it('the smoke client script adds the handlers, binds them to the session, and parses', () => {
        const script = buildPreviewClientScript('session-$&-123');
        for (const marker of SMOKE_MARKERS) {
            assert.ok(script.includes(marker), `smoke client script lacks "${marker}"`);
        }
        assert.ok(script.includes('"session-$&-123"'), 'the session token must be embedded verbatim');
        assert.ok(script.includes('message.session !== C4X_SMOKE_SESSION'), 'the handler must compare the session exactly');
        assert.doesNotThrow(() => new vm.Script(script, { filename: 'smoke.assembled.js' }));
    });

    describe('host', () => {
        const src = fs.readFileSync(path.join(__dirname, '..', '..', 'webview', 'PreviewPanel.ts'), 'utf-8');
        const handler = src.slice(src.indexOf('private async handleWebviewMessage'));

        it('derives the session from C4X_VSIX_SMOKE only', () => {
            assert.match(src, /private readonly smokeSession: string \| undefined = process\.env\.C4X_VSIX_SMOKE === '1' \? randomUUID\(\) : undefined;/);
        });

        it('treats a message as smoke only with this panel\'s session', () => {
            assert.match(handler, /const isSmoke = this\.smokeSession !== undefined[\s\S]*?\.session === this\.smokeSession;/);
        });

        it('guards every occurrence of a smoke message type, in the whole file', () => {
            // Every line outside the guarded branches that names a smoke.* message type
            // must be one of: the guard itself, the outgoing request (smokeAct), or a comment.
            const lines = src.split('\n');
            const offenders = lines
                .map((text, index) => ({ text: text.trim(), line: index + 1 }))
                .filter(entry => /smoke\.(act|acted|rendered|renderFailed)\b/.test(entry.text))
                .filter(entry => !entry.text.startsWith('//') && !entry.text.startsWith('*') && !entry.text.startsWith('/*'))
                .filter(entry => !/^if \(isSmoke && \(message as \{ type\?: unknown \}\)\.type === 'smoke\.(acted|rendered|renderFailed)'\) \{$/.test(entry.text))
                .filter(entry => !/postMessage\(\{ type: 'smoke\.act', session: panel\.smokeSession,/.test(entry.text));
            assert.deepStrictEqual(offenders, [], 'a smoke message type is referenced outside the isSmoke guard');
            const guarded = [...handler.matchAll(/if \(isSmoke && \(message as \{ type\?: unknown \}\)\.type === 'smoke\./g)].length;
            assert.strictEqual(guarded, 3, 'expected exactly the three guarded smoke branches');
            assert.ok(handler.indexOf("'smoke.rendered'") < handler.indexOf('isVisualLayoutMessage(message)'));
        });

        it('embeds the smoke client only with a session', () => {
            assert.ok(src.includes('${buildPreviewClientScript(this.smokeSession)}'));
            assert.ok(!src.includes('${PREVIEW_CLIENT_SCRIPT}'));
        });
    });
});
