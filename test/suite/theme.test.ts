import * as assert from 'assert';
import { themeManager, ThemeManager } from '../../src/themes/ThemeManager';
import { ClassicTheme } from '../../src/themes/ClassicTheme';
import { ModernTheme } from '../../src/themes/ModernTheme';
import { MutedTheme } from '../../src/themes/MutedTheme';
import { HighContrastTheme } from '../../src/themes/HighContrastTheme';
import { getAutoTheme } from '../../src/themes/AutoTheme';
import { ThemeName } from '../../src/themes/Theme';

describe('Theme System', () => {
    describe('ThemeManager', () => {
        it('should return classic theme as default', () => {
            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'classic');
        });

        it('should switch to modern theme', () => {
            themeManager.setCurrentTheme('modern');
            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'modern');
            assert.strictEqual(theme.displayName, 'Modern');
        });

        it('should switch to muted theme', () => {
            themeManager.setCurrentTheme('muted');
            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'muted');
            assert.strictEqual(theme.displayName, 'Muted');
        });

        it('should switch to high-contrast theme', () => {
            themeManager.setCurrentTheme('high-contrast');
            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'high-contrast');
            assert.strictEqual(theme.displayName, 'High Contrast');
        });

        it('should switch to auto theme', () => {
            themeManager.setCurrentTheme('auto');
            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'auto');
            assert.strictEqual(theme.displayName, 'Auto');
        });

        it('should return all available themes', () => {
            const themes = ThemeManager.getAllThemes();
            assert.strictEqual(themes.length, 5);

            const themeNames = themes.map((t: { name: string }) => t.name);
            assert.ok(themeNames.includes('classic'));
            assert.ok(themeNames.includes('modern'));
            assert.ok(themeNames.includes('muted'));
            assert.ok(themeNames.includes('high-contrast'));
            assert.ok(themeNames.includes('auto'));
        });

        it('should persist theme selection', () => {
            themeManager.setCurrentTheme('modern');
            let theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'modern');

            // Switch to another theme
            themeManager.setCurrentTheme('muted');
            theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'muted');

            // Reset to classic
            themeManager.setCurrentTheme('classic');
            theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'classic');
        });

        it('should switch to requested theme', async () => {
            const success = await themeManager.setCurrentTheme('modern');
            assert.strictEqual(success, true);

            const theme = themeManager.getCurrentTheme();
            assert.strictEqual(theme.name, 'modern');
        });

        it('should validate theme exists in getAllThemes', () => {
            const themes = ThemeManager.getAllThemes();
            const modernTheme = themes.find((t: { name: string }) => t.name === 'modern');
            assert.ok(modernTheme);
            assert.strictEqual(modernTheme.name, 'modern');
        });
    });

    describe('Classic Theme', () => {
        it('should have correct metadata', () => {
            assert.strictEqual(ClassicTheme.name, 'classic');
            assert.strictEqual(ClassicTheme.displayName, 'Classic');
            assert.ok(ClassicTheme.description);
        });

        it('should have official C4 colors', () => {
            assert.strictEqual(ClassicTheme.colors.person.fill, '#FFFFFF'); // Changed to white fill
            assert.strictEqual(ClassicTheme.colors.person.stroke, '#438DD5'); // New border color
            assert.strictEqual(ClassicTheme.colors.person.text, '#438DD5'); // New text color

            assert.strictEqual(ClassicTheme.colors.softwareSystem.fill, '#FFFFFF'); // Changed to white fill
            assert.strictEqual(ClassicTheme.colors.softwareSystem.stroke, '#1168BD'); // New border color
            assert.strictEqual(ClassicTheme.colors.softwareSystem.text, '#1168BD'); // New text color

            assert.strictEqual(ClassicTheme.colors.container.fill, '#FFFFFF'); // Changed to white fill
            assert.strictEqual(ClassicTheme.colors.container.stroke, '#438DD5'); // New border color
            assert.strictEqual(ClassicTheme.colors.container.text, '#438DD5'); // New text color

            assert.strictEqual(ClassicTheme.colors.component.fill, '#FFFFFF'); // Changed to white fill
            assert.strictEqual(ClassicTheme.colors.component.stroke, '#85BBF0'); // New border color
            assert.strictEqual(ClassicTheme.colors.component.text, '#85BBF0'); // New text color

            assert.strictEqual(ClassicTheme.colors.externalSystem.fill, '#FFFFFF'); // New
            assert.strictEqual(ClassicTheme.colors.externalSystem.stroke, '#999999'); // New
            assert.strictEqual(ClassicTheme.colors.externalSystem.text, '#999999'); // New

            assert.strictEqual(ClassicTheme.colors.relationship.stroke, '#707070'); // New
            assert.strictEqual(ClassicTheme.colors.relationship.text, '#707070'); // New
        });

        it('should have rounded corners', () => {
            assert.strictEqual(ClassicTheme.styles.borderRadius, 10); // Changed to 10
        });

        it('should have white background', () => {
            assert.strictEqual(ClassicTheme.colors.background, '#FFFFFF');
        });
    });

    describe('Modern Theme', () => {
        it('should have correct metadata', () => {
            assert.strictEqual(ModernTheme.name, 'modern');
            assert.strictEqual(ModernTheme.displayName, 'Modern');
            assert.ok(ModernTheme.description);
        });

        it('should have vibrant colors', () => {
            assert.strictEqual(ModernTheme.colors.person.fill, '#FFFFFF');
            assert.strictEqual(ModernTheme.colors.person.stroke, '#6366F1');
            assert.strictEqual(ModernTheme.colors.person.text, '#6366F1');

            assert.strictEqual(ModernTheme.colors.softwareSystem.fill, '#FFFFFF');
            assert.strictEqual(ModernTheme.colors.softwareSystem.stroke, '#3B82F6');
            assert.strictEqual(ModernTheme.colors.softwareSystem.text, '#3B82F6');

            assert.strictEqual(ModernTheme.colors.container.fill, '#FFFFFF');
            assert.strictEqual(ModernTheme.colors.container.stroke, '#06B6D4');
            assert.strictEqual(ModernTheme.colors.container.text, '#06B6D4');

            assert.strictEqual(ModernTheme.colors.component.fill, '#FFFFFF');
            assert.strictEqual(ModernTheme.colors.component.stroke, '#8B5CF6');
            assert.strictEqual(ModernTheme.colors.component.text, '#8B5CF6');

            assert.strictEqual(ModernTheme.colors.externalSystem.fill, '#FFFFFF');
            assert.strictEqual(ModernTheme.colors.externalSystem.stroke, '#9CA3AF');
            assert.strictEqual(ModernTheme.colors.externalSystem.text, '#9CA3AF');

            assert.strictEqual(ModernTheme.colors.relationship.stroke, '#6B7280');
            assert.strictEqual(ModernTheme.colors.relationship.text, '#6B7280');
        });

        it('should have rounded corners', () => {
            assert.strictEqual(ModernTheme.styles.borderRadius, 12);
        });
    });

    describe('Muted Theme', () => {
        it('should have correct metadata', () => {
            assert.strictEqual(MutedTheme.name, 'muted');
            assert.strictEqual(MutedTheme.displayName, 'Muted');
            assert.ok(MutedTheme.description);
        });

        it('should have grayscale colors', () => {
            assert.strictEqual(MutedTheme.colors.person.fill, '#FFFFFF');
            assert.strictEqual(MutedTheme.colors.person.stroke, '#4A5568');
            assert.strictEqual(MutedTheme.colors.person.text, '#4A5568');

            assert.strictEqual(MutedTheme.colors.softwareSystem.fill, '#FFFFFF');
            assert.strictEqual(MutedTheme.colors.softwareSystem.stroke, '#718096');
            assert.strictEqual(MutedTheme.colors.softwareSystem.text, '#718096');

            assert.strictEqual(MutedTheme.colors.container.fill, '#FFFFFF');
            assert.strictEqual(MutedTheme.colors.container.stroke, '#718096');
            assert.strictEqual(MutedTheme.colors.container.text, '#718096');

            assert.strictEqual(MutedTheme.colors.component.fill, '#FFFFFF');
            assert.strictEqual(MutedTheme.colors.component.stroke, '#A0AEC0');
            assert.strictEqual(MutedTheme.colors.component.text, '#A0AEC0');

            assert.strictEqual(MutedTheme.colors.externalSystem.fill, '#FFFFFF');
            assert.strictEqual(MutedTheme.colors.externalSystem.stroke, '#A0AEC0');
            assert.strictEqual(MutedTheme.colors.externalSystem.text, '#A0AEC0');

            assert.strictEqual(MutedTheme.colors.relationship.stroke, '#4A5568');
            assert.strictEqual(MutedTheme.colors.relationship.text, '#4A5568');
        });

        it('should use Georgia font', () => {
            assert.ok(MutedTheme.styles.fontFamily.includes('Georgia'));
        });
    });

    describe('High Contrast Theme', () => {
        it('should have correct metadata', () => {
            assert.strictEqual(HighContrastTheme.name, 'high-contrast');
            assert.strictEqual(HighContrastTheme.displayName, 'High Contrast');
            assert.ok(HighContrastTheme.description);
        });

        it('should have high contrast colors', () => {
            assert.strictEqual(HighContrastTheme.colors.person.fill, '#FFFFFF');
            assert.strictEqual(HighContrastTheme.colors.person.text, '#000000');
            assert.strictEqual(HighContrastTheme.colors.person.stroke, '#000000');

            assert.strictEqual(HighContrastTheme.colors.softwareSystem.fill, '#FFFFFF');
            assert.strictEqual(HighContrastTheme.colors.softwareSystem.text, '#0000CC');
            assert.strictEqual(HighContrastTheme.colors.softwareSystem.stroke, '#0000CC');

            assert.strictEqual(HighContrastTheme.colors.container.fill, '#FFFFFF');
            assert.strictEqual(HighContrastTheme.colors.container.text, '#006600');
            assert.strictEqual(HighContrastTheme.colors.container.stroke, '#006600');

            assert.strictEqual(HighContrastTheme.colors.component.fill, '#FFFFFF');
            assert.strictEqual(HighContrastTheme.colors.component.text, '#CC0000');
            assert.strictEqual(HighContrastTheme.colors.component.stroke, '#CC0000');

            assert.strictEqual(HighContrastTheme.colors.externalSystem.fill, '#FFFFFF');
            assert.strictEqual(HighContrastTheme.colors.externalSystem.text, '#666666');
            assert.strictEqual(HighContrastTheme.colors.externalSystem.stroke, '#666666');

            assert.strictEqual(HighContrastTheme.colors.relationship.stroke, '#000000');
            assert.strictEqual(HighContrastTheme.colors.relationship.text, '#000000');
        });

        it('should have thicker borders', () => {
            assert.strictEqual(HighContrastTheme.styles.borderWidth, 3);
        });

        it('should have larger font size', () => {
            assert.strictEqual(HighContrastTheme.styles.fontSize, 16);
        });
    });

    describe('Auto Theme', () => {
        it('should have correct metadata', () => {
            const autoTheme = getAutoTheme();
            assert.strictEqual(autoTheme.name, 'auto');
            assert.strictEqual(autoTheme.displayName, 'Auto');
            assert.ok(autoTheme.description);
        });

        it('should have VS Code color palette', () => {
            const autoTheme = getAutoTheme();
            // Auto theme should have colors defined
            assert.ok(autoTheme.colors.person.fill);
            assert.ok(autoTheme.colors.softwareSystem.fill);
            assert.ok(autoTheme.colors.container.fill);
            assert.ok(autoTheme.colors.component.fill);
        });
    });

    describe('Theme Structure Validation', () => {
        const themes = [ClassicTheme, ModernTheme, MutedTheme, HighContrastTheme, getAutoTheme()];

        themes.forEach(theme => {
            describe(`${theme.displayName} Theme`, () => {
                it('should have required metadata', () => {
                    assert.ok(theme.name);
                    assert.ok(theme.displayName);
                    assert.ok(theme.description);
                });

                it('should have all element colors', () => {
                    assert.ok(theme.colors.person.fill);
                    assert.ok(theme.colors.person.stroke);
                    assert.ok(theme.colors.person.text);

                    assert.ok(theme.colors.softwareSystem.fill);
                    assert.ok(theme.colors.softwareSystem.stroke);
                    assert.ok(theme.colors.softwareSystem.text);

                    assert.ok(theme.colors.container.fill);
                    assert.ok(theme.colors.container.stroke);
                    assert.ok(theme.colors.container.text);

                    assert.ok(theme.colors.component.fill);
                    assert.ok(theme.colors.component.stroke);
                    assert.ok(theme.colors.component.text);
                });

                it('should have external system colors', () => {
                    assert.ok(theme.colors.externalSystem.fill);
                    assert.ok(theme.colors.externalSystem.stroke);
                    assert.ok(theme.colors.externalSystem.text);
                });

                it('should have relationship colors', () => {
                    assert.ok(theme.colors.relationship.stroke);
                    assert.ok(theme.colors.relationship.text);
                });

                it('should have background color', () => {
                    assert.ok(theme.colors.background);
                });

                it('should have all style properties', () => {
                    assert.ok(typeof theme.styles.borderRadius === 'number');
                    assert.ok(typeof theme.styles.borderWidth === 'number');
                    assert.ok(typeof theme.styles.fontSize === 'number');
                    assert.ok(theme.styles.fontFamily);
                });
            });
        });
    });
});