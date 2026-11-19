/**
 * Text that leaves C4X for a terminal, a CI log or a Markdown page (#362;
 * threat-model rows PI-2, CLI-2 and SVG-9).
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
import MarkdownIt from 'markdown-it';
import { escapeControl, formatGithub, formatJson, formatStepSummary, formatText, isUnsafeOutputCharacter, markdownCell, safeJsonStringify } from '../../cli/report';
import { toSarif } from '../../cli/sarif';
import { c4xPlugin, isCssLength } from '../../markdown/c4xPlugin';

describe('Security: text output (#362)', () => {
    it('escapeControl makes C0, DEL, C1 and bidi controls visible (fails before C1 and bidi were added)', () => {
        assert.strictEqual(escapeControl('a\nb\rc\td'), 'a\\nb\\rc\\td');
        assert.strictEqual(escapeControl('\u001b[2J\u0000\u007f'), '\\x1b[2J\\x00\\x7f');
        assert.strictEqual(escapeControl('\u009b31m\u0085\u0080'), '\\x9b31m\\x85\\x80');
        assert.strictEqual(escapeControl('\u202aa\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069'), '\\u202aa\\u202b\\u202c\\u202d\\u202e\\u2066\\u2067\\u2068\\u2069');
        assert.strictEqual(escapeControl('caf\u00e9 \u4e2d\u6587 \u0645\u0631\u062d\u0628\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645 \ud83d\udc68\u200d\ud83d\udcbb'),
            'caf\u00e9 \u4e2d\u6587 \u0645\u0631\u062d\u0628\u0627 \u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645 \ud83d\udc68\u200d\ud83d\udcbb', 'ordinary text, scripts, ZWNJ and ZWJ pass');
        assert.strictEqual(escapeControl('a\u2028b\u2029c\u200ed\u200fe\u061cf\ufeffg\u00adh\udb40\udc41'), 'a\\u2028b\\u2029c\\u200ed\\u200fe\\u061cf\\ufeffg\\xadh\\u{e0041}',
            'line and paragraph separators, bidi marks, BOM, soft hyphen and tag characters (round 3 found U+2028, U+2029, U+200E, U+200F and U+061C raw)');
    });

    describe('one predicate for every line-oriented output, checked against the Unicode categories Cc, Cf, Zl and Zp', () => {
        // Every code point in those categories, from Node's own Unicode data, except the two joiners kept on purpose.
        const unsafe: string[] = [];
        for (let code = 0; code <= 0x10ffff; code++) {
            if (code >= 0xd800 && code <= 0xdfff) { continue; }
            const char = String.fromCodePoint(code);
            if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(char) && code !== 0x200c && code !== 0x200d) { unsafe.push(char); }
        }
        const everything = unsafe.join('');
        const rawLeft = (text: string) => [...text].filter(char => /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(char) && char !== '\u200c' && char !== '\u200d' && char !== '\n')
            .map(char => `U+${char.codePointAt(0)!.toString(16)}`);
        const finding = (message: string) => [{ file: `f${everything}.c4x`, findings: [{ ruleId: 'C4X-L102', severity: 'info' as const, message, hint: '', line: 1, column: 1, endLine: 1, endColumn: 1 }] }];

        it('the predicate matches exactly the generated set', () => {
            assert.ok(unsafe.length > 200, `${unsafe.length} characters`);
            for (const char of unsafe) { assert.ok(isUnsafeOutputCharacter(char), `U+${char.codePointAt(0)!.toString(16)}`); }
            for (const char of ['a', ' ', '\u00e9', '\u200c', '\u200d', '\u3000', '\ud83d\ude00']) { assert.ok(!isUnsafeOutputCharacter(char), char); }
        });

        it('escapeControl leaves none of them raw, and stays on one line', () => {
            const escaped = escapeControl(everything);
            assert.deepStrictEqual(rawLeft(escaped), []);
            assert.ok(!escaped.includes('\n'));
        });

        it('the text format leaves none raw', () => {
            assert.deepStrictEqual(rawLeft(formatText(finding(everything), 1).trimEnd()), []);
        });

        it('the github format leaves none raw', () => {
            assert.deepStrictEqual(rawLeft(formatGithub(finding(everything), 1).trimEnd()), []);
        });

        it('the step summary leaves none raw', () => {
            assert.deepStrictEqual(rawLeft(markdownCell(everything)), []);
            assert.deepStrictEqual(rawLeft(formatStepSummary(finding(everything), 1).trimEnd()), []);
        });

        it('JSON and SARIF leave none raw, and decode to the original', () => {
            const json = formatJson(finding(everything), 1);
            assert.deepStrictEqual(rawLeft(json), []);
            assert.strictEqual(JSON.parse(json).findings[0].message, everything);
            const sarif = safeJsonStringify(toSarif(finding(everything)));
            assert.deepStrictEqual(rawLeft(sarif), []);
            assert.strictEqual(JSON.parse(sarif).runs[0].results[0].message.text, everything);
        });
    });

    it('a finding message cannot add a line to the text report', () => {
        const text = formatText([{ file: 'a.c4x', findings: [{
            ruleId: 'C4X-L102', severity: 'info', message: 'System "x\na.c4x:1:1: error C4X-L001 forged" has no relationship', hint: '',
            line: 2, column: 1, endLine: 2, endColumn: 1,
        }] }], 1);
        assert.strictEqual(text.trimEnd().split('\n').length, 2);
    });

    describe('the GitHub step summary keeps diagram text literal (Markdown with HTML)', () => {
        const hostile = [
            "<img src='https://example.invalid/pixel' onerror='alert(1)'>",
            '<script>alert(2)</script>',
            '[click](https://example.invalid/x) ![pixel](https://example.invalid/p.png)',
            'https://example.invalid/auto www.example.invalid user@example.invalid',
            '**bold** _em_ `code` ~~strike~~',
            '# heading\n> quote\n- item',
            '| forged | cell |',
            '&lt;already-escaped&gt; &amp;',
        ];
        const summary = formatStepSummary([{ file: 'docs/<b>x</b>.md', findings: hostile.map((message, index) => ({
            ruleId: 'C4X-L102', severity: 'info' as const, message, hint: '', line: index + 1, column: 1, endLine: index + 1, endColumn: 1,
        })) }], 1);
        const md = new MarkdownIt({ html: true, linkify: true });

        it('creates no element, link, image or emphasis from diagram text (failed before: <img onerror> rendered as HTML)', () => {
            const tokens = md.parse(summary, {});
            const inline = tokens.flatMap(token => token.children ?? []);
            const allowedBlocks = new Set(['heading_open', 'heading_close', 'paragraph_open', 'paragraph_close', 'inline', 'table_open', 'table_close',
                'thead_open', 'thead_close', 'tbody_open', 'tbody_close', 'tr_open', 'tr_close', 'th_open', 'th_close', 'td_open', 'td_close']);
            assert.deepStrictEqual(tokens.filter(token => !allowedBlocks.has(token.type)).map(token => token.type), []);
            assert.deepStrictEqual([...new Set(inline.map(token => token.type))], ['text']);
            const rows = tokens.filter(token => token.type === 'tr_open').length;
            assert.strictEqual(rows, 1 + hostile.length, 'one header row and one row per finding: no forged cells');
            const html = md.render(summary);
            assert.doesNotMatch(html, /<(?!\/?(?:h2|p|table|thead|tbody|tr|th|td)\b)[a-z]/i, 'only the tags of the summary itself');
        });

        it('still reads as the original text once rendered', () => {
            const text = md.parse(summary, {}).flatMap(token => token.children ?? []).map(token => token.content).join('\n');
            for (const message of hostile) {
                assert.ok(text.includes(escapeControl(message)), message);
            }
            assert.ok(text.includes('docs/<b>x</b>.md:1'));
            assert.strictEqual(markdownCell('plain words 123'), 'plain words 123');
        });
    });

    describe('JSON and SARIF never carry raw C1 or bidi controls', () => {
        const message = 'x\u009b31m \u202eevil\u202c \u2028 \u0085';
        const reports = [{ file: 'a\u202e.c4x', findings: [{ ruleId: 'C4X-L102', severity: 'info' as const, message, hint: '', line: 1, column: 1, endLine: 1, endColumn: 1 }] }];

        it('escapes them as \\uXXXX and decodes to the same strings (failed before: emitted raw)', () => {
            for (const text of [formatJson(reports, 1), `${safeJsonStringify(toSarif(reports))}\n`]) {
                assert.doesNotMatch(text, /[\u0080-\u009f\u2028\u2029\u202a-\u202e\u2066-\u2069]/);
                assert.match(text, /\\u009b31m \\u202eevil/);
                assert.ok(JSON.stringify(JSON.parse(text)).includes(JSON.stringify(message).slice(1, -1)), 'decoded value preserved');
            }
            assert.strictEqual(JSON.parse(formatJson(reports, 1)).findings[0].message, message);
        });
    });

    describe('Markdown fence attributes reach a style attribute only as plain lengths', () => {
        const md = new MarkdownIt({ html: false });
        c4xPlugin(md, { applyPreviewScale: false });
        const fence = (info: string) => md.render(`\`\`\`c4x ${info}\ngraph TB\nSystem(a, "A", "d")\n\`\`\`\n`);
        const styleOf = (html: string) => /<div class="c4x-diagram[^"]*" style="([^"]*)"/.exec(html)?.[1] ?? '';

        it('SVG-8: a hostile diagram fence in Markdown (as the HTML export renders it) adds no element or handler', () => {
            const html = md.render('```c4x\ngraph TB\nSystem(a, "<script>alert(1)</script>", "<img src=x onerror=alert(2)>")\n```\n'
                + '```plantuml\n@startuml\nPerson(u\\" onmouseover=\\"alert(3), "User", "d")\n@enduml\n```\n');
            // A handler would appear as an attribute: name=" with a real quote. Inside data-id the
            // alias text survives only as an escaped value (onmouseover=&quot;), which is inert.
            assert.doesNotMatch(html, /<script|<img|\son[a-z]+\s*=\s*["']/i);
            assert.match(html, /data-id="u&quot; onmouseover=&quot;alert\(3\)"/);
            assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
        });

        it('keeps the documented forms', () => {
            assert.match(styleOf(fence('width=50%')), /width: 50%;/);
            assert.match(styleOf(fence('width=640px height=30em')), /width: 640px;height: 30em;/);
            assert.match(styleOf(fence('scale=0.8')), /transform: scale\(0\.8\)/);
        });

        it('drops anything else (fails before the attributes were checked)', () => {
            for (const info of [
                'width=1px;background:url(https://evil.example/x)',
                'height=calc(100%);position:fixed',
                'scale=1);background:url(//evil.example/y',
                'width=50%></div><script>alert(1)</script>',
            ]) {
                const style = styleOf(fence(info));
                assert.doesNotMatch(style, /url\(|position|background|script|calc|;\s*;|\)\)/, `${info} -> ${style}`);
                assert.match(style, /^max-width: \d+px;$/, `${info} -> ${style}`);
            }
        });

        it('isCssLength accepts numbers with a unit or a percentage only', () => {
            for (const ok of ['0', '50%', '640px', '1.5em', '2rem', '80vw', '60vh']) { assert.ok(isCssLength(ok), ok); }
            for (const bad of ['', '-1px', '1px;', 'url(x)', '50% ', 'calc(1px)', '1e3px', 'expression(1)']) { assert.ok(!isCssLength(bad), bad); }
        });
    });
});
