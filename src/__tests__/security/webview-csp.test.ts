/**
 * The two browser-side controls the threat model rates Prevent (#362):
 *
 * - SVG-6: the preview webview's content security policy. Injected markup in
 *   a diagram is already escaped; the CSP is the second layer, so an inline
 *   event handler or an injected script cannot run even if escaping failed.
 * - SVG-10: the PNG export page embeds the SVG in a script template literal.
 *   The SVG must come back out of the literal byte for byte (backslash,
 *   backtick and `${` escaped), and no `</script>` may reach the page from
 *   diagram text, because the renderer escapes `<`.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import { PreviewPanel } from '../../webview/PreviewPanel';
import { PngExporter } from '../../export/PngExporter';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';

const NONCE = 'TESTNONCE0123456789abcdefghijklm';

function cspOf(html: string): Map<string, string[]> {
    const meta = /<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html);
    assert.ok(meta, 'the page declares a Content-Security-Policy');
    const directives = new Map<string, string[]>();
    for (const part of meta[1].split(';').map(p => p.trim()).filter(Boolean)) {
        const [name, ...values] = part.split(/\s+/);
        directives.set(name, values);
    }
    return directives;
}

function assertStrictScriptPolicy(html: string, label: string): void {
    const csp = cspOf(html);
    assert.deepStrictEqual(csp.get('default-src'), ["'none'"], `${label}: default-src`);
    assert.deepStrictEqual(csp.get('script-src'), [`'nonce-${NONCE}'`], `${label}: scripts only with the page's nonce, so inline handlers cannot run`);
    for (const [name, values] of csp) {
        for (const value of values) {
            assert.ok(!/unsafe-inline|unsafe-eval|unsafe-hashes|^\*$|^https?:|^data:$/.test(value) || (name === 'img-src' && value === 'data:') || (name === 'img-src' && value === 'blob:'),
                `${label}: ${name} allows ${value}`);
        }
    }
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)];
    assert.ok(scripts.length > 0, `${label}: has a script`);
    for (const script of scripts) {
        assert.match(script[1], new RegExp(`nonce="${NONCE}"`), `${label}: every script carries the nonce`);
    }
}

function render(source: string): string {
    const model = new C4ModelBuilder().build(new C4XParser().parse(source), 'csp');
    return new SvgBuilder().build(new DagreLayoutEngine().layoutSync(model.views[0]), { theme: ClassicTheme, view: model.views[0] });
}

describe('Security: webview CSP and the PNG export page (#362)', () => {
    it('SVG-6: the preview page allows scripts only by nonce, loads nothing external, and every script carries the nonce', () => {
        const getHtml = (PreviewPanel.prototype as unknown as { getHtml(this: unknown): string }).getHtml;
        const html = getHtml.call({ getNonce: () => NONCE });
        assertStrictScriptPolicy(html, 'preview');
        assert.deepStrictEqual(cspOf(html).get('img-src'), ['data:']);
        assert.doesNotMatch(html.replace(/<script\b[\s\S]*?<\/script>/g, ''), /\son[a-z]+\s*=/i, 'no inline event handler in the page markup');
    });

    describe('SVG-10: the PNG export page', () => {
        const exporter = new PngExporter() as unknown as { buildExportHtml(svg: string, theme: unknown, scale: number): string; getNonce(): string };
        const page = (svg: string) => {
            const original = exporter.getNonce;
            exporter.getNonce = () => NONCE;
            try {
                return exporter.buildExportHtml(svg, ClassicTheme, 2);
            } finally {
                exporter.getNonce = original;
            }
        };
        const embedded = (html: string): string => {
            const literal = /const svgMarkup = (`(?:\\[\s\S]|\$(?!\{)|[^`\\$])*`);/.exec(html);
            assert.ok(literal, 'the SVG is embedded as one template literal');
            // Evaluating the literal is what the page does; a broken escape changes its value.
            return new Function(`return ${literal[1]};`)() as string;
        };

        it('carries the same strict script policy', () => {
            assertStrictScriptPolicy(page('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'png export');
        });

        it('returns the SVG byte for byte through the template literal (backslash, backtick, ${ and $)', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>a`b ${"INJECTED"} $x \\` \\${y} \\\\ end</text></svg>';
            assert.strictEqual(embedded(page(svg)), svg);
        });

        it('cannot be closed early by diagram text: a hostile label yields one script element', () => {
            const svg = render('graph TB\nSystem(a, "</script><script>alert(1)</script>` ${alert(2)}", "d")\n');
            const html = page(svg);
            assert.strictEqual((html.match(/<script\b/g) ?? []).length, 1);
            assert.strictEqual((html.match(/<\/script>/g) ?? []).length, 1);
            assert.strictEqual(embedded(html), svg);
        });
    });
});
