/**
 * Theme contrast audit.
 *
 * Every built-in theme must render element label text and relationship label
 * text at WCAG 2.1 AA contrast (>= 4.5:1) against the surface it sits on:
 *   - element label text  -> against that element's own fill
 *   - relationship text   -> against the theme background
 *
 * Before this test five of the six themes shipped unreadable label text — the
 * `text` colour was set equal to the `stroke` colour, which is tuned for a 2px
 * border rather than for glyphs. Classic (the default theme) failed on seven
 * of nine tokens. The fix darkens `text` only; `fill` and `stroke` keep their
 * official C4 / VS Code palette values.
 *
 * Pure colour maths — no DOM and no VS Code host.
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
import { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';

/** WCAG 2.1 AA minimum for normal-size text. */
const AA_NORMAL_TEXT = 4.5;

/** Relative luminance per WCAG 2.1 definition. */
function relativeLuminance(hex: string): number {
    const value = hex.replace('#', '');
    const channel = (offset: number): number => {
        const raw = parseInt(value.substr(offset, 2), 16) / 255;
        return raw <= 0.03928 ? raw / 12.92 : Math.pow((raw + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/** WCAG 2.1 contrast ratio between two sRGB hex colours. */
export function contrastRatio(foreground: string, background: string): number {
    const a = relativeLuminance(foreground);
    const b = relativeLuminance(background);
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const ELEMENT_TOKENS = [
    'person',
    'softwareSystem',
    'externalSystem',
    'container',
    'component',
    'deploymentNode',
    'externalPerson',
    'externalContainer',
    'externalComponent',
] as const;

const THEMES: ReadonlyArray<readonly [string, C4Theme]> = [
    ['classic (default)', ClassicTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
    ['auto/dark', DarkTheme],
    ['auto/light', LightTheme],
];

describe('theme contrast (WCAG 2.1 AA)', () => {
    it('computes known contrast ratios correctly', () => {
        // Anchors the maths itself against WCAG's own worked examples.
        assert.strictEqual(Number(contrastRatio('#000000', '#FFFFFF').toFixed(2)), 21);
        assert.strictEqual(Number(contrastRatio('#FFFFFF', '#FFFFFF').toFixed(2)), 1);
        assert.strictEqual(Number(contrastRatio('#777777', '#FFFFFF').toFixed(2)), 4.48);
    });

    for (const [themeName, theme] of THEMES) {
        describe(themeName, () => {
            for (const token of ELEMENT_TOKENS) {
                const colors = theme.colors[token];
                if (!colors) {
                    continue; // optional external variants
                }
                it(`${token} label text clears AA against its own fill`, () => {
                    const ratio = contrastRatio(colors.text, colors.fill);
                    assert.ok(
                        ratio >= AA_NORMAL_TEXT,
                        `${themeName}.${token}: text ${colors.text} on fill ${colors.fill} ` +
                        `is ${ratio.toFixed(2)}:1, below the AA minimum of ${AA_NORMAL_TEXT}:1`,
                    );
                });
            }

            it('relationship label text clears AA against the theme background', () => {
                const ratio = contrastRatio(theme.colors.relationship.text, theme.colors.background);
                assert.ok(
                    ratio >= AA_NORMAL_TEXT,
                    `${themeName}.relationship: text ${theme.colors.relationship.text} on background ` +
                    `${theme.colors.background} is ${ratio.toFixed(2)}:1, below the AA minimum ` +
                    `of ${AA_NORMAL_TEXT}:1`,
                );
            });
        });
    }

    it('keeps the official C4 palette on Classic strokes', () => {
        // The contrast fix darkens `text` only. If a future change "fixes"
        // contrast by moving the border colours instead, Classic stops
        // matching c4model.com and this test says so.
        assert.strictEqual(ClassicTheme.colors.person.stroke, '#438DD5');
        assert.strictEqual(ClassicTheme.colors.softwareSystem.stroke, '#1168BD');
        assert.strictEqual(ClassicTheme.colors.container.stroke, '#438DD5');
        assert.strictEqual(ClassicTheme.colors.component.stroke, '#85BBF0');
        assert.strictEqual(ClassicTheme.colors.externalSystem.stroke, '#999999');
    });
});
