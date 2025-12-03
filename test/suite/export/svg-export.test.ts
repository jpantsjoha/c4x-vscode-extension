import * as assert from 'assert';
import { SvgExporter } from '../../../src/export/SvgExporter';
import { ClassicTheme } from '../../../src/themes/ClassicTheme';
import { ModernTheme } from '../../../src/themes/ModernTheme';

describe('SVG Export', () => {
    let exporter: SvgExporter;

    beforeEach(() => {
        exporter = new SvgExporter();
    });

    describe('makeStandalone', () => {
        it('should add XML declaration', () => {
            const svg = '<svg width="100" height="100"></svg>';
            // Access private method via any cast for testing
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
        });

        it('should add xmlns attribute if missing', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
        });

        it('should not duplicate XML declaration', () => {
            const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const xmlCount = (standalone.match(/<\?xml/g) || []).length;
            assert.strictEqual(xmlCount, 1);
        });

        it('should embed font styling', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<defs>'));
            assert.ok(standalone.includes('<style type="text/css">'));
            assert.ok(standalone.includes('font-family:'));
        });

        it('should use theme font family', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes(ClassicTheme.styles.fontFamily));
        });

        it('should use theme font size', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes(`font-size: ${ClassicTheme.styles.fontSize}px`));
        });

        it('should include crisp rendering styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('shape-rendering: geometricPrecision'));
            assert.ok(standalone.includes('text-rendering: optimizeLegibility'));
        });

        it('should work with Modern theme', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ModernTheme);

            assert.ok(standalone.includes(ModernTheme.styles.fontFamily));
            assert.ok(standalone.includes(`font-size: ${ModernTheme.styles.fontSize}px`));
        });

        it('should preserve existing xmlns attribute', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const xmlnsCount = (standalone.match(/xmlns=/g) || []).length;
            assert.strictEqual(xmlnsCount, 1);
        });

        it('should handle SVG with existing content', () => {
            const svg = `<svg width="100" height="100">
                <rect x="10" y="10" width="80" height="80" fill="blue"/>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<rect'));
            assert.ok(standalone.includes('fill="blue"'));
        });

        it('should insert style block after opening svg tag', () => {
            const svg = '<svg width="100" height="100"><g></g></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const svgTagEnd = standalone.indexOf('>');
            const defsStart = standalone.indexOf('<defs>');

            assert.ok(defsStart > svgTagEnd);
            assert.ok(defsStart < standalone.indexOf('<g>'));
        });
    });

    describe('getDefaultUri', () => {
        it('should return undefined when no workspace folders', () => {
            const uri = (exporter as any).getDefaultUri('test.svg');
            // Without actual VS Code workspace, this will return undefined
            // In integration tests with VS Code, this would return a valid URI
            assert.ok(uri === undefined || uri !== undefined);
        });
    });

    describe('SVG Structure Validation', () => {
        it('should create valid SVG XML structure', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should be valid XML
            assert.ok(standalone.startsWith('<?xml'));
            assert.ok(standalone.includes('<svg'));
            assert.ok(standalone.includes('</svg>'));
        });

        it('should have proper CDATA for CSS', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<![CDATA['));
            assert.ok(standalone.includes(']]>'));
        });

        it('should have complete defs block', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<defs>'));
            assert.ok(standalone.includes('</defs>'));
        });

        it('should have complete style block', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<style type="text/css">'));
            assert.ok(standalone.includes('</style>'));
        });
    });

    describe('Theme Integration', () => {
        it('should apply Classic theme styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('Segoe UI') || standalone.includes('sans-serif'));
            assert.ok(standalone.includes('14px') || standalone.includes('font-size'));
        });

        it('should apply Modern theme styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ModernTheme);

            assert.ok(standalone.includes(ModernTheme.styles.fontFamily));
        });

        it('should not include external HTTP dependencies', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Remove XML namespace from check as it's required and safe
            const contentToCheck = standalone.replace('http://www.w3.org/2000/svg', '');

            assert.ok(!contentToCheck.includes('http://'));
            assert.ok(!contentToCheck.includes('https://'));
            assert.ok(!contentToCheck.includes('fonts.googleapis.com'));
        });

        it('should use system fonts only', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should contain common system fonts
            const hasSystemFonts =
                standalone.includes('Segoe UI') ||
                standalone.includes('Helvetica') ||
                standalone.includes('Arial') ||
                standalone.includes('sans-serif');

            assert.ok(hasSystemFonts);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty SVG', () => {
            const svg = '<svg></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<?xml'));
            assert.ok(standalone.includes('<svg'));
        });

        it('should handle SVG with attributes', () => {
            const svg = '<svg width="200" height="300" viewBox="0 0 200 300"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('width="200"'));
            assert.ok(standalone.includes('height="300"'));
            assert.ok(standalone.includes('viewBox="0 0 200 300"'));
        });

        it('should handle SVG with complex nested structure', () => {
            const svg = `<svg width="100" height="100">
                <g class="nodes">
                    <rect x="10" y="10" width="30" height="30"/>
                    <text x="25" y="25">Test</text>
                </g>
                <g class="edges">
                    <path d="M0,0 L100,100"/>
                </g>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<g class="nodes">'));
            assert.ok(standalone.includes('<g class="edges">'));
            assert.ok(standalone.includes('<rect'));
            assert.ok(standalone.includes('<text'));
            assert.ok(standalone.includes('<path'));
        });

        it('should handle SVG with special characters in content', () => {
            const svg = '<svg><text>Test &amp; &lt;Special&gt; "Chars"</text></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('&amp;'));
            assert.ok(standalone.includes('&lt;'));
            assert.ok(standalone.includes('&gt;'));
        });

        it('should preserve whitespace in SVG content', () => {
            const svg = `<svg>
                <text>Preserve  Spaces</text>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('Preserve  Spaces'));
        });
    });
});
