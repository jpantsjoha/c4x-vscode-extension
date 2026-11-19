import * as assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import {
    elementTextMarkup,
    layoutElementText,
    measureTextPx,
    TEXT_METRICS,
    textAdvanceEm,
    textMetricVariant,
    isExactlyMeasured,
    wrapTextLines,
    type ElementTextInput,
} from '../../render/textLayout';
import { TEXT_METRIC_RANGES, TEXT_METRIC_WIDTHS } from '../../render/textMetricsData';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { isBundledSpriteId, resolveElementStyle } from '../../render/elementStyle';
import type { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { LightTheme, DarkTheme } from '../../themes/AutoTheme';

/**
 * Element text wrapping (#340): the width model, the wrapping algorithm, the
 * growth rule and cap, and the issue's acceptance check that no line of the IBS
 * fixtures is wider than its element's text area.
 */

const SANS = 'Arial, sans-serif';
const px = (text: string, size = 12, variant = 'sans'): number => measureTextPx(text, size, variant, TEXT_METRICS);
const wrap = (text: string, max: number, maxLines = 99, size = 12, variant = 'sans') =>
    wrapTextLines(text, max, size, variant, TEXT_METRICS, maxLines);

describe('Text width model (#340)', () => {
    it('has one width per code point in every variant table', () => {
        const count = TEXT_METRIC_RANGES.reduce((n, [a, b]) => n + b - a + 1, 0);
        for (const [variant, table] of Object.entries(TEXT_METRIC_WIDTHS)) {
            assert.strictEqual(table.length, count, variant);
            assert.ok(table.every(w => Number.isInteger(w) && w >= 0 && w <= 3000), variant);
        }
    });

    it('resolves each theme font stack to its variant', () => {
        assert.strictEqual(textMetricVariant('Arial, sans-serif', false, false), 'sans');
        assert.strictEqual(textMetricVariant('Helvetica, Arial, sans-serif', true, false), 'sans-bold');
        assert.strictEqual(textMetricVariant('Georgia, serif', false, true), 'serif-italic');
        assert.strictEqual(textMetricVariant('Consolas, monospace', false, false), 'mono');
        assert.strictEqual(textMetricVariant('"Comic Sans MS", Georgia', false, false), 'serif');
        assert.strictEqual(textMetricVariant('Unknown Font', false, false), 'sans');
        assert.strictEqual(textMetricVariant('', true, true), 'sans-bold');
    });

    it('gives wide glyphs more width than narrow ones', () => {
        assert.ok(px('WWWWWWWWWW') > 2.5 * px('iiiiiiiiii'));
        assert.ok(px('Payments', 14, 'sans-bold') > px('Payments', 14, 'sans'));
    });

    it('scales linearly with font size', () => {
        assert.ok(Math.abs(px('Internet Banking', 24) - 2 * px('Internet Banking', 12)) < 1e-9);
    });

    it('treats combining marks, joiners, variation selectors and skin tones as zero width', () => {
        for (const cp of [0x301, 0x200d, 0xfe0f, 0x1f3fd, 0xe0041]) {
            assert.strictEqual(textAdvanceEm(cp, 'sans', TEXT_METRICS), 0, cp.toString(16));
        }
        assert.strictEqual(px('é'), px('e'));
    });

    it('draws CJK at the measured ideograph width and emoji at 1.2 em or more', () => {
        assert.strictEqual(textAdvanceEm(0x4e2d, 'sans', TEXT_METRICS), TEXT_METRICS.cjk);
        assert.strictEqual(textAdvanceEm(0xac00, 'serif', TEXT_METRICS), TEXT_METRICS.cjk);
        assert.ok(textAdvanceEm(0x1f680, 'sans', TEXT_METRICS) >= 1200);
    });

    it('falls back to the width of M for scripts outside the table', () => {
        const m = textAdvanceEm(0x4d, 'sans', TEXT_METRICS);
        assert.strictEqual(textAdvanceEm(0x10d0, 'sans', TEXT_METRICS), m); // Georgian an
        assert.strictEqual(textAdvanceEm(0x1200, 'sans', TEXT_METRICS), m); // Ethiopic ha
    });

    it('measures control characters as a space and unknown variants with the sans table', () => {
        assert.strictEqual(px('a\tb'), px('a b'));
        assert.strictEqual(px('Ledger', 12, 'no-such-variant'), px('Ledger'));
    });
});

describe('wrapTextLines (#340)', () => {
    it('word-wraps greedily and never splits a word that fits', () => {
        const text = 'Allows customers to view information about their bank accounts and make payments';
        const { lines, truncated } = wrap(text, 150);
        assert.strictEqual(truncated, false);
        assert.ok(lines.length >= 3);
        assert.strictEqual(lines.join(' '), text);
        for (const line of lines) { assert.ok(px(line) <= 150, line); }
        for (let i = 0; i < lines.length - 1; i++) {
            const nextWord = lines[i + 1].split(' ')[0];
            assert.ok(px(lines[i] + ' ' + nextWord) > 150, `"${nextWord}" would have fitted on line ${i}`);
        }
    });

    it('breaks a long URL after its separators', () => {
        const url = 'https://api.example.com/v2/accounts/{accountId}/transactions?limit=50';
        const { lines } = wrap(url, 120);
        assert.ok(lines.length >= 2);
        assert.strictEqual(lines.join(''), url);
        for (const line of lines.slice(0, -1)) { assert.match(line, /[/\-._,;:?&=+|\\)\]}]$/, line); }
        for (const line of lines) { assert.ok(px(line) <= 120, line); }
    });

    it('breaks an identifier with no separators between characters', () => {
        const id = 'MainframeBankingSystemFacadeImplementation';
        const { lines } = wrap(id, 100);
        assert.ok(lines.length >= 2);
        assert.strictEqual(lines.join(''), id);
        for (const line of lines) { assert.ok(px(line) <= 100, line); }
    });

    it('breaks CJK text between characters and keeps mixed scripts within the width', () => {
        const text = '网上银行系统允许客户查看账户信息 and pay bills 🚀 Система интернет-банкинга';
        const { lines } = wrap(text, 90);
        assert.ok(lines.length >= 4);
        assert.strictEqual(lines.join('').replace(/ /g, ''), text.replace(/ /g, ''));
        for (const line of lines) { assert.ok(px(line) <= 90, line); }
    });

    it('keeps a combining mark with its base character', () => {
        const text = 'é'.repeat(40);
        const { lines } = wrap(text, 50);
        for (const line of lines) { assert.ok(!line.startsWith('́'), 'line starts with a combining mark'); }
        assert.strictEqual(lines.join(''), text);
    });

    it('returns no lines for empty and whitespace-only text', () => {
        assert.deepStrictEqual(wrap('', 100), { lines: [], truncated: false });
        assert.deepStrictEqual(wrap('   \n\t ', 100), { lines: [], truncated: false });
    });

    it('collapses whitespace and treats a newline as a space (there is no forced break)', () => {
        assert.deepStrictEqual(wrap('  Reads\n and   writes  ', 500).lines, ['Reads and writes']);
    });

    it('caps the line count with an ellipsis that fits the width and ends on a word', () => {
        const text = 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen';
        const { lines, truncated } = wrap(text, 60, 3);
        assert.strictEqual(truncated, true);
        assert.strictEqual(lines.length, 3);
        assert.ok(lines[2].endsWith('…'));
        assert.ok(px(lines[2]) <= 60, lines[2]);
        const words = text.split(' ');
        const lastWords = lines[2].slice(0, -1).trim().split(' ');
        assert.ok(lastWords.every(w => words.includes(w)), `cut inside a word: ${lines[2]}`);
    });

    it('still produces one line when the width is smaller than a character', () => {
        const { lines } = wrap('abc', 1);
        assert.deepStrictEqual(lines, ['a', 'b', 'c']);
        assert.deepStrictEqual(wrap('abc', 1, 1).lines.length, 1);
    });
});

describe('layoutElementText (#340)', () => {
    const box: ElementTextInput = { x: 10, y: 20, width: 240, height: 130, iconLayout: false, cylinder: false, fontFamily: SANS };

    it('draws text that fits exactly as before: one line per field, unchanged, same height', () => {
        const layout = layoutElementText({ ...box, label: 'API Application', technology: 'Java', description: 'Provides the API  ' }, TEXT_METRICS);
        assert.strictEqual(layout.wrapped, false);
        assert.strictEqual(layout.requiredHeight, 130);
        assert.deepStrictEqual(layout.blocks.map(b => b.lines), [['API Application'], ['[Java]'], ['Provides the API  ']]);
        // Pre-#340 baselines: centred block of three 16 px lines.
        assert.deepStrictEqual(layout.blocks.map(b => b.ys[0]), [20 + (130 - 48) / 2 + 16, 20 + (130 - 48) / 2 + 32, 20 + (130 - 48) / 2 + 48]);
    });

    it('wraps a field wider than the box into lines that fit the text area with the safety margin', () => {
        const description = 'Provides Internet banking functionality to customers via a JSON/HTTPS API';
        const layout = layoutElementText({ ...box, label: 'API', description }, TEXT_METRICS);
        const block = layout.blocks.find(b => b.field === 'description')!;
        assert.strictEqual(layout.wrapped, true);
        assert.ok(block.lines.length >= 2);
        for (const line of block.lines) { assert.ok(px(line) * 1.03 <= box.width - 16, line); }
        assert.strictEqual(block.ys.length, block.lines.length);
        assert.ok(block.ys.every((y, i) => i === 0 || y - block.ys[i - 1] === 16));
    });

    it('grows the required height for wrapped lines and caps label, technology and description at 3, 2 and 6 lines', () => {
        const long = 'word '.repeat(200).trim();
        const layout = layoutElementText({ ...box, height: 2000, label: long, technology: long, description: long }, TEXT_METRICS);
        assert.deepStrictEqual(layout.blocks.map(b => [b.field, b.lines.length, b.truncated]), [['label', 3, true], ['technology', 2, true], ['description', 6, true]]);
        assert.strictEqual(layout.requiredHeight, 11 * 16 + 16);
        for (const b of layout.blocks) { assert.ok(b.lines[b.lines.length - 1].endsWith('…')); }
        assert.strictEqual(layout.blocks[2].full, long);
    });

    it('cuts lines from the description, then technology, then label when the box is shorter than required', () => {
        const long = 'word '.repeat(60).trim();
        const layout = layoutElementText({ ...box, height: 100, label: 'API', technology: 'Java', description: long }, TEXT_METRICS);
        const total = layout.blocks.reduce((n, b) => n + b.lines.length, 0);
        assert.ok(total * 16 <= 100 - 16, `${total} lines in a 100 px box`);
        assert.deepStrictEqual(layout.blocks.map(b => b.lines.length).slice(0, 2), [1, 1]);
        assert.strictEqual(layout.blocks[2].truncated, true);
        assert.ok(layout.requiredHeight > 100);
    });

    it('places text below the icon and inside the cylinder caps', () => {
        const long = 'Stores user registration information, hashed authentication credentials and access logs';
        const icon = layoutElementText({ ...box, height: 160, iconLayout: true, label: 'Customer', description: long }, TEXT_METRICS);
        const firstTop = icon.blocks[0].ys[0] - 14;
        assert.ok(firstTop >= box.y + 50, 'label starts below the icon');
        assert.strictEqual(icon.blocks[1].fontSize, 11);
        const dbInput: ElementTextInput = { ...box, cylinder: true, label: 'Database', technology: 'PostgreSQL', description: long };
        // Grown as the layout grows it: to the required height.
        const db = layoutElementText({ ...dbInput, height: layoutElementText(dbInput, TEXT_METRICS).requiredHeight }, TEXT_METRICS);
        const top = db.blocks[0].ys[0] - 14;
        const bottom = db.blocks[db.blocks.length - 1].ys.slice(-1)[0];
        assert.ok(top >= box.y + 24, `first line ${top} inside the lid`);
        assert.ok(bottom <= box.y + db.requiredHeight - 24, 'last line above the bottom cap');
        assert.strictEqual(db.requiredHeight, db.blocks.reduce((n, b) => n + b.lines.length, 0) * 16 + 16 + 48);
    });

    it('omits empty fields, as before', () => {
        const layout = layoutElementText({ ...box, label: 'Only', technology: '', description: '' }, TEXT_METRICS);
        assert.deepStrictEqual(layout.blocks.map(b => b.field), ['label']);
    });
});

describe('Whitespace is measured as SVG draws it (#340 review)', () => {
    const box: ElementTextInput = { x: 0, y: 0, width: 240, height: 130, iconLayout: false, cylinder: false, fontFamily: SANS };
    // SVG without xml:space collapses runs of space, tab, CR, LF and FF and trims the ends.
    const cases: Array<[string, string]> = [
        ['a run of spaces', 'API' + ' '.repeat(100) + 'Application'],
        ['leading and trailing spaces', ' '.repeat(60) + 'API Application' + ' '.repeat(60)],
        ['tabs', 'API\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tApplication'],
        ['newlines inside the quoted text', 'API\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\n\nApplication'],
        ['CRLF and form feeds', 'API\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\r\n\f\f\f\f\f\f\f\fApplication'],
    ];
    for (const [name, label] of cases) {
        it(`keeps text that fits once collapsed on one line, unchanged: ${name}`, () => {
            assert.ok(px(label, 14, 'sans-bold') > box.width, 'the raw string is wider than the box');
            for (const field of ['label', 'technology', 'description'] as const) {
                const layout = layoutElementText({ ...box, label: 'X', [field]: label }, TEXT_METRICS);
                const block = layout.blocks.find(b => b.field === field)!;
                assert.strictEqual(layout.wrapped, false, field);
                assert.deepStrictEqual(block.lines, [field === 'technology' ? `[${label}]` : label], field);
                assert.strictEqual(layout.requiredHeight, 130);
                assert.ok(!elementTextMarkup(layout, '#000', SANS).includes('<tspan'), field);
            }
        });
    }

    // Measured in Chrome Canary 160 (SVG <text>, no xml:space): U+00A0, U+202F and
    // U+3000 are drawn at their width and never collapse or trim; U+200B and U+FEFF
    // are drawn at zero width and never collapse or trim. Only space, tab, CR, LF
    // and FF collapse.
    const kept: Array<[string, string]> = [
        ['no-break space U+00A0', ' '], ['narrow no-break space U+202F', ' '], ['ideographic space U+3000', '　'],
        ['zero-width space U+200B', '​'], ['byte order mark U+FEFF', '﻿'],
    ];
    for (const [name, ch] of kept) {
        it(`does not collapse or trim the ${name}`, () => {
            const drawnWide = textAdvanceEm(ch.codePointAt(0)!, 'sans-bold', TEXT_METRICS) > 0;
            // Enough drawn spaces to be wider than the box; zero-width ones leave "A", which fits.
            const em = textAdvanceEm(ch.codePointAt(0)!, 'sans-bold', TEXT_METRICS);
            const label = ch.repeat(drawnWide ? Math.ceil(260 / (em * 14 / 1000)) : 80) + 'A';
            const layout = layoutElementText({ ...box, label }, TEXT_METRICS);
            assert.strictEqual(layout.wrapped, drawnWide, `${name} wrapped`);
            assert.deepStrictEqual(wrap(ch + 'a b' + ch, 1000).lines, [ch + 'a b' + ch], 'kept at both ends');
            assert.deepStrictEqual(wrap('a' + ch + ch + 'b', 1000).lines, ['a' + ch + ch + 'b'], 'kept in the middle');
            if (drawnWide) {
                for (const line of layout.blocks[0].lines) { assert.ok(px(line, 14, 'sans-bold') <= (240 - 16) / 1.03, name); }
            }
        });
    }

    it('measures a label of 80 no-break spaces then "A" at its drawn width, so it wraps', () => {
        const label = ' '.repeat(80) + 'A';
        assert.ok(px(label, 14, 'sans-bold') > 240);
        assert.strictEqual(layoutElementText({ ...box, label }, TEXT_METRICS).wrapped, true);
    });

    it('wraps collapsed text that is still too wide, with single spaces', () => {
        const text = 'Provides   Internet\tbanking\nfunctionality  to  customers  via  a  JSON/HTTPS  API';
        const block = layoutElementText({ ...box, label: 'X', description: text }, TEXT_METRICS).blocks[1];
        assert.strictEqual(block.lines.join(' '), text.replace(/[ \t\n\r\f]+/g, ' '));
    });
});

describe('Unicode spaces and zero-width characters have measured widths (#340 review 3)', () => {
    const box: ElementTextInput = { x: 0, y: 0, width: 240, height: 130, iconLayout: false, cylinder: false, fontFamily: SANS };
    const spaces: Array<[string, number]> = [
        ['U+00A0', 0xa0], ['U+1680', 0x1680], ['U+2000', 0x2000], ['U+2001', 0x2001], ['U+2002', 0x2002], ['U+2003', 0x2003],
        ['U+2004', 0x2004], ['U+2005', 0x2005], ['U+2006', 0x2006], ['U+2007', 0x2007], ['U+2008', 0x2008], ['U+2009', 0x2009],
        ['U+200A', 0x200a], ['U+202F', 0x202f], ['U+205F', 0x205f], ['U+3000', 0x3000],
    ];
    const zeroWidth: Array<[string, number]> = [['U+200B', 0x200b], ['U+200C', 0x200c], ['U+200D', 0x200d], ['U+2060', 0x2060], ['U+FEFF', 0xfeff]];

    it('measures every space separator from the tables, and the zero-width characters as zero', () => {
        const rangeHas = (cp: number) => TEXT_METRIC_RANGES.some(([a, b]) => cp >= a && cp <= b);
        for (const [name, cp] of spaces) {
            assert.ok(rangeHas(cp), `${name} is measured`);
            const em = textAdvanceEm(cp, 'sans', TEXT_METRICS);
            assert.ok(em > 0 && em <= 1010, `${name}: ${em}`);
        }
        for (const [name, cp] of zeroWidth) { assert.strictEqual(textAdvanceEm(cp, 'serif', TEXT_METRICS), 0, name); }
        // The narrow no-break space is narrow, not the width of "M".
        assert.ok(textAdvanceEm(0x202f, 'sans-bold', TEXT_METRICS) < textAdvanceEm(0x20, 'sans-bold', TEXT_METRICS));
    });

    it('keeps the reviewer\'s fitting label "A" + 30 U+202F + "B" on one line, unchanged', () => {
        const label = 'A' + ' '.repeat(30) + 'B';
        const layout = layoutElementText({ ...box, label, technology: 'Java' }, TEXT_METRICS);
        assert.strictEqual(layout.wrapped, false);
        assert.ok(!elementTextMarkup(layout, '#000', SANS).includes('<tspan'));
    });

    for (const [name, cp] of [...spaces, ...zeroWidth]) {
        const ch = String.fromCodePoint(cp);
        it(`${name}: a fitting label keeps its markup, a long run wraps within the padded width`, () => {
            const fitting = layoutElementText({ ...box, label: 'Payment' + ch + 'API' }, TEXT_METRICS);
            assert.strictEqual(fitting.wrapped, false);
            assert.ok(!elementTextMarkup(fitting, '#000', SANS).includes('<tspan'));
            const run = layoutElementText({ ...box, height: 2000, label: 'X', description: 'X' + ch.repeat(120) + 'Y' }, TEXT_METRICS);
            const block = run.blocks[1];
            for (const line of block.lines) {
                if (Array.from(line).filter(c => textAdvanceEm(c.codePointAt(0)!, 'sans', TEXT_METRICS) > 0).length > 1) {
                    // Wrapped lines keep the padding and margin; an unwrapped line fits the box.
                    const limit = block.wrapped ? (240 - 16) / 1.03 : 240;
                    assert.ok(px(line) <= limit + 1e-9, `${name}: ${px(line)} over ${limit}`);
                }
            }
        });
    }

    it('falls back by general category for characters outside the tables', () => {
        assert.strictEqual(textAdvanceEm(0x0591, 'sans', TEXT_METRICS), 0, 'a non-spacing mark outside the explicit ranges');
        assert.strictEqual(textAdvanceEm(0x110bd, 'sans', TEXT_METRICS), 0, 'a format character outside the tables');
        assert.strictEqual(textAdvanceEm(0x10d0, 'sans', TEXT_METRICS), textAdvanceEm(0x4d, 'sans', TEXT_METRICS), 'a letter: the width of M');
        // Every space separator is in the tables; with tables that lack one, a space falls back to an en space.
        const asciiOnly = { ...TEXT_METRICS, ranges: [[0x20, 0x7e]] as Array<[number, number]>, widths: { sans: TEXT_METRICS.widths.sans.slice(0, 95) } };
        assert.strictEqual(textAdvanceEm(0x2003, 'sans', asciiOnly), 500, 'em space outside the tables');
        assert.strictEqual(textAdvanceEm(0x202f, 'sans', asciiOnly), 500, 'narrow no-break space outside the tables');
    });
});

describe('Only exactly measured text wraps; everything else is drawn as before (#340 review 6)', () => {
    const box: ElementTextInput = { x: 0, y: 0, width: 240, height: 130, iconLayout: false, cylinder: false, fontFamily: SANS };

    it('treats Latin and its extensions, IPA, Greek, Cyrillic, punctuation and spaces as exactly measured', () => {
        for (const text of ['Payment API', 'Sistem de plăți și facturări', 'Hệ thống thanh toán', 'ʃʒθðŋ ɐɑɒ', 'Σύστημα πληρωμών', 'Платёжная система', '“quotes” — dashes… €5 → x y z　w']) {
            assert.strictEqual(isExactlyMeasured(text, 'sans', TEXT_METRICS), true, text);
        }
    });

    it('treats every other script, emoji, symbols, combining marks outside the tables and bidi controls as not exactly measured', () => {
        const samples = ['نظام', 'מערכת', 'ระบบ', 'भुगतान', '支付', '결제', '각', 'カタカナ', '🚀', '👨‍👩‍👧', '\u{1F1EC}\u{1F1E7}', '✓', '♠', '⚙', 'é', 'abc‮def', 'a‏b', 'a⁧b⁩', 'ქართული'];
        for (const text of samples) {
            assert.strictEqual(isExactlyMeasured('Payment ' + text, 'sans', TEXT_METRICS), false, text);
        }
    });

    // Long samples of each such script: drawn as one line, exactly as origin/main draws them
    // (single <text>, original string, standard box height). The `scripts-long` golden is
    // byte-identical to origin/main be0d34a's render (checked when captured).
    const longSamples: Record<string, string> = {
        arabic: 'يعالج النظام جميع المدفوعات الواردة من العملاء ويرسل الإيصالات ويحفظ سجلاً كاملاً لكل عملية دفع وتحويل',
        hebrew: 'המערכת מעבדת את כל התשלומים הנכנסים מהלקוחות, שולחת קבלות ושומרת תיעוד מלא של כל תשלום והעברה',
        thai: 'ระบบนี้ประมวลผลการชำระเงินทั้งหมดจากลูกค้าส่งใบเสร็จและเก็บบันทึกการชำระเงินและการโอนเงินทุกรายการอย่างครบถ้วน',
        devanagari: 'यह प्रणाली ग्राहकों से आने वाले सभी भुगतानों को संसाधित करती है, रसीदें भेजती है और हर भुगतान का पूरा रिकॉर्ड रखती है',
        cjk: '该系统处理客户的所有付款发送收据并完整记录每一笔付款和转账以便日后审计和对账',
        hangul: '이 시스템은 고객의 모든 결제를 처리하고 영수증을 보내며 모든 결제와 이체에 대한 전체 기록을 보관합니다',
        hangulNfd: '이 시스템은 고객의 모든 결제를 처리하고 영수증을 보내며 모든 결제와 이체에 대한 전체 기록을 보관합니다'.normalize('NFD'),
        emoji: '👨‍👩‍👧‍👦'.repeat(30),
        flags: '\u{1F1EC}\u{1F1E7}'.repeat(40),
        symbols: '✓ ♠ ♣ ♥ ♦ ⚙ ★ ☐ '.repeat(12),
        mixed: 'Payments API that sends receipts 支付 to every customer and records every payment and every refund',
    };
    for (const [name, text] of Object.entries(longSamples)) {
        it(`draws long ${name} text exactly as before: one line, unchanged, standard height`, () => {
            for (const field of ['label', 'technology', 'description'] as const) {
                const layout = layoutElementText({ ...box, label: 'X', [field]: text }, TEXT_METRICS);
                const block = layout.blocks.find(b => b.field === field)!;
                assert.strictEqual(layout.wrapped, false, field);
                assert.deepStrictEqual(block.lines, [field === 'technology' ? `[${text}]` : text]);
                assert.strictEqual(layout.requiredHeight, 130);
                assert.ok(!elementTextMarkup(layout, '#000', SANS).includes('<tspan'));
            }
        });
    }

    it('wraps exactly measured text that is wider than the inner width, and keeps every line within it', () => {
        const text = 'Provides Internet banking functionality to customers via a JSON/HTTPS API and the mobile app';
        const layout = layoutElementText({ ...box, label: 'X', description: text }, TEXT_METRICS);
        assert.strictEqual(layout.wrapped, true);
        for (const line of layout.blocks[1].lines) { assert.ok(px(line) <= 240 - 16, line); }
    });

    it('wraps a single exactly measured line that fits the box but not the inner width', () => {
        let text = 'Stores user account information';
        while (px(text + ' x') <= 240) { text += ' x'; }
        assert.ok(px(text) > 240 - 16 && px(text) <= 240, 'between the inner and the outer width');
        const layout = layoutElementText({ ...box, label: 'X', description: text }, TEXT_METRICS);
        assert.strictEqual(layout.wrapped, true);
        for (const line of layout.blocks[1].lines) { assert.ok(px(line) <= 240 - 16, line); }
    });
});

describe('Every wrapped line fits the padded width (#340 review)', () => {
    // A small deterministic generator: the same strings on every run.
    function* strings(seed: number, count: number): Generator<string> {
        let state = seed;
        const next = (): number => { state = (state * 1103515245 + 12345) % 2147483648; return state; };
        const alphabet = ['W', 'M', 'i', 'l', 'a', 'Q', '/', '-', '.', '_', '?', '&', '=', ' ', ' ', '\u7f51', '\u94f6', '\u884c', '\u00e9', '\u0301', '\u0416', '\u{1f680}', '0', 'x',
            // Every Unicode space separator and the zero-width characters (#340 review 3).
            '\u00a0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003', '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009', '\u200a',
            '\u200b', '\u200c', '\u200d', '\u202f', '\u205f', '\u2060', '\u3000', '\ufeff'];
        for (let n = 0; n < count; n++) {
            const length = 1 + (next() % 160);
            let s = '';
            for (let i = 0; i < length; i++) {
                // Runs of one character make long unbroken tokens.
                const ch = alphabet[next() % alphabet.length];
                s += next() % 4 === 0 ? ch.repeat(1 + (next() % 30)) : ch;
            }
            yield s;
        }
    }

    it('keeps every output line within the limit for 20,000 random strings in three fonts and four widths', function () {
        this.timeout(300000);
        let lines = 0;
        let i = 0;
        for (const text of strings(340, 20000)) {
            const variant = ['sans', 'serif-bold', 'mono-italic'][i % 3];
            const max = [40, 120, 217.5, 300][i % 4];
            i++;
            const result = wrap(text, max, 1000, 12, variant);
            for (const line of result.lines) {
                lines++;
                const glyphs = Array.from(line).filter(ch => textAdvanceEm(ch.codePointAt(0)!, variant, TEXT_METRICS) > 0);
                if (glyphs.length > 1) {
                    assert.ok(measureTextPx(line, 12, variant, TEXT_METRICS) <= max + 1e-9, `${JSON.stringify(line)} wider than ${max}`);
                }
            }
            if (result.truncated) { continue; }
            assert.strictEqual(result.lines.join('').replace(/ /g, ''), text.replace(/[ \t\n\r\f]+/g, ' ').replace(/^ | $/g, '').replace(/ /g, ''), 'no text lost');
        }
        assert.ok(lines > 20000);
    });

    it('keeps a label of "/" and 40 W within (240 - 16) / 1.03 px', () => {
        const label = '/' + 'W'.repeat(40);
        const layout = layoutElementText({ x: 0, y: 0, width: 240, height: 400, iconLayout: false, cylinder: false, fontFamily: SANS, label }, TEXT_METRICS);
        for (const line of layout.blocks[0].lines) {
            assert.ok(px(line, 14, 'sans-bold') <= (240 - 16) / 1.03, `${line}: ${px(line, 14, 'sans-bold')}`);
        }
    });

    it('terminates on a glyph wider than the line', () => {
        assert.deepStrictEqual(wrap('🚀🚀🚀', 5).lines, ['🚀', '🚀', '🚀']);
    });
});

describe('IBS fixtures: no wrapped line is wider than its element text area (#340)', () => {
    const FIXTURES = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs');
    const themes: Record<string, C4Theme> = {
        classic: ClassicTheme, 'c4-model': C4ModelTheme, 'c4-standard': C4StandardTheme, modern: ModernTheme,
        muted: MutedTheme, 'high-contrast': HighContrastTheme, 'auto-light': LightTheme, 'auto-dark': DarkTheme,
    };
    const files = readdirSync(FIXTURES).filter(f => f.endsWith('.c4x')).sort();
    it('has the seven fixtures', () => assert.strictEqual(files.length, 7));
    for (const file of files) {
        for (const [themeName, theme] of Object.entries(themes)) {
            it(`${file} in ${themeName}`, () => {
                const view = new C4ModelBuilder().build(new C4XParser().parse(readFileSync(path.join(FIXTURES, file), 'utf8')), file).views[0];
                const layout = new DagreLayoutEngine(() => undefined).layoutSync(view, { theme });
                let lines = 0;
                for (const node of layout.elements) {
                    const style = resolveElementStyle(node.element, theme, { rules: view.elementStyles ?? [], accentSlots: {} }, { isKnownSprite: isBundledSpriteId });
                    const text = layoutElementText({
                        x: node.x, y: node.y, width: node.width, height: node.height,
                        iconLayout: !!(style.iconLayout && style.icon), cylinder: style.outline === 'cylinder',
                        fontFamily: theme.styles.fontFamily,
                        label: node.element.label, technology: node.element.technology, description: node.element.description,
                    }, TEXT_METRICS);
                    if (!node.element.children?.length) {
                        assert.ok(node.height >= text.requiredHeight, `${node.id} is shorter than its text`);
                    }
                    for (const block of text.blocks) {
                        assert.ok(!block.truncated, `${node.id}.${block.field} truncated`);
                        const variant = textMetricVariant(theme.styles.fontFamily, block.bold, block.italic);
                        for (const line of block.lines) {
                            lines++;
                            // Issue #340's DoD: no line wider than the element's inner width.
                            const limit = node.width - 16;
                            assert.ok(measureTextPx(line, block.fontSize, variant, TEXT_METRICS) <= limit, `${node.id}.${block.field}: "${line}" wider than ${limit}`);
                        }
                    }
                }
                assert.ok(lines > 0);
            });
        }
    }
});
