import * as assert from 'assert';
import * as vm from 'vm';
import { PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';

/**
 * The webview builds its script at runtime from a String.raw template plus
 * `fn.toString()` of a few exported helpers (see `embedForWebview`). That
 * string is inserted verbatim into a <script> tag in the panel HTML
 * (PreviewPanel.ts), so the TypeScript compiler never parses its contents.
 *
 * On 2026-09-04 one unclosed brace in the draft-restore block passed
 * typecheck, 1,393 unit tests, 497 Extension Host tests and the clean-VSIX
 * smoke, and killed the visual editor on open with a SyntaxError. Only
 * Playwright noticed, and Playwright does not run on pushes to main.
 *
 * `vm.Script` parses the text as a classic script, the same grammar the
 * <script> tag uses, without running it. `new Function` would be the wrong
 * check: it wraps the text in a function body, where a top-level `return`
 * is legal, and would pass text the browser rejects.
 */
describe('PREVIEW_CLIENT_SCRIPT', () => {
    it('parses as a classic script, the grammar a <script> tag uses', () => {
        assert.doesNotThrow(
            () => new vm.Script(PREVIEW_CLIENT_SCRIPT, { filename: 'previewClientScript.assembled.js' }),
            'the assembled webview script does not parse; the editor would throw on open',
        );
    });

    it('never contains "</script", which ends the tag early however valid the JavaScript is', () => {
        assert.ok(
            !/<\/script/i.test(PREVIEW_CLIENT_SCRIPT),
            'a "</script" sequence inside the script closes the HTML tag before the code ends',
        );
    });
});
