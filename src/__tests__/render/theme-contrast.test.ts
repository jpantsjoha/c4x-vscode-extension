/**
 * Theme contrast audit.
 *
 * Every built-in theme must render element label text and relationship label
 * text at WCAG 2.1 AA contrast (>= 4.5:1) against the surface it sits on:
 *   - element label text  -> against that element's own fill
 *   - relationship text   -> against the theme background
 *
 * Seven themes are audited (c4-model and auto in light and dark); `c4-standard`
 * is the one named exception (see EXCEPTIONS).
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
import { C4Theme, accentTextColor } from '../../themes/Theme';
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { THEME_NAMES } from '../../themes/ThemeManager';

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

/**
 * Named exceptions: element tokens that do not reach AA and are kept on purpose.
 * `c4-standard` reproduces the Structurizr / C4-PlantUML palette exactly (white
 * text on #999999 and #438DD5), so its colours are not changed to pass; the
 * README names it as the one theme below AA. An exception must still fail: if a
 * token starts passing, this test says to remove it from the list.
 *   container (white on #438DD5) 3.49:1
 *   externalSystem, externalPerson, externalContainer, externalComponent
 *   (white on #999999) 2.85:1
 */
const EXCEPTIONS: Readonly<Record<string, ReadonlyArray<string>>> = {
    'c4-standard': ['container', 'externalSystem', 'externalPerson', 'externalContainer', 'externalComponent'],
};

const THEMES: ReadonlyArray<readonly [string, C4Theme]> = [
    ['c4-standard', C4StandardTheme],
    ['classic (default)', ClassicTheme],
    ['modern', ModernTheme],
    ['muted', MutedTheme],
    ['high-contrast', HighContrastTheme],
    ['auto/dark', DarkTheme],
    ['auto/light', LightTheme],
    ['c4-model', C4ModelTheme],
    ['c4-model/dark', C4ModelDarkTheme],
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
                if (EXCEPTIONS[themeName]?.includes(token)) {
                    it(`${token} label text is a named exception and still below AA`, () => {
                        const ratio = contrastRatio(colors.text, colors.fill);
                        assert.ok(
                            ratio < AA_NORMAL_TEXT,
                            `${themeName}.${token} now clears AA (${ratio.toFixed(2)}:1): remove it from EXCEPTIONS and the README`,
                        );
                    });
                    continue;
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

            theme.externalAccents.forEach((accent, index) => {
                // Accented externals keep the theme's external fill (#322).
                it(`external accent ${index + 1} text clears AA against the external fill`, () => {
                    const text = accentTextColor(accent);
                    const fill = theme.colors.externalSystem.fill;
                    const ratio = contrastRatio(text, fill);
                    assert.ok(
                        ratio >= AA_NORMAL_TEXT,
                        `${themeName}.externalAccents[${index}]: text ${text} on fill ${fill} ` +
                        `is ${ratio.toFixed(2)}:1, below the AA minimum of ${AA_NORMAL_TEXT}:1`,
                    );
                });
            });

            for (const [label, colour] of [
                ['boundary label', theme.boundary.text],
                ['title', theme.title.color],
            ] as const) {
                it(`${label} text clears AA against the theme background`, () => {
                    const ratio = contrastRatio(colour, theme.colors.background);
                    assert.ok(
                        ratio >= AA_NORMAL_TEXT,
                        `${themeName}.${label}: text ${colour} on background ${theme.colors.background} ` +
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

    it('covers all seven themes, and names every exception', () => {
        // THEME_NAMES is the registry order the picker and package.json use;
        // `auto` is audited through its light and dark palettes.
        const covered = new Set(THEMES.map(([name]) => name.replace(/ \(default\)$/, '').replace(/\/.*$/, '')));
        for (const name of THEME_NAMES) {
            assert.ok(covered.has(name), `theme "${name}" is not in the contrast audit`);
        }
        assert.strictEqual(THEME_NAMES.length, 7);
        assert.deepStrictEqual(Object.keys(EXCEPTIONS), ['c4-standard']);
    });

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

    it('keeps the sampled c4model.com accent outlines on c4-model', () => {
        // Contrast is met by a darker accent `text`, never by moving the outline.
        assert.deepStrictEqual(
            C4ModelTheme.externalAccents.map(a => a.stroke),
            ['#BF101D', '#ED8609', '#1A849C', '#8411BD'],
        );
    });
});
