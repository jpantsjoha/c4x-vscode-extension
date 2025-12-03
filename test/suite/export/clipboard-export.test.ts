import * as assert from 'assert';
import { ClipboardExporter } from '../../../src/export/ClipboardExporter';
import { ClassicTheme } from '../../../src/themes/ClassicTheme';

describe('Clipboard Export', () => {
    let exporter: ClipboardExporter;

    beforeEach(() => {
        exporter = new ClipboardExporter();
    });

    describe('makeStandalone', () => {
        it('should add xmlns attribute if missing', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
        });

        it('should preserve xmlns if already present', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const xmlnsCount = (standalone.match(/xmlns=/g) || []).length;
            assert.strictEqual(xmlnsCount, 1);
        });

        it('should not add XML declaration', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Clipboard export should NOT have XML declaration
            assert.ok(!standalone.startsWith('<?xml'));
        });

        it('should preserve SVG structure', () => {
            const svg = `<svg width="100" height="100">
                <rect x="10" y="10" width="80" height="80" fill="blue"/>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<rect'));
            assert.ok(standalone.includes('fill="blue"'));
        });

        it('should handle empty SVG', () => {
            const svg = '<svg></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<svg'));
            assert.ok(standalone.includes('xmlns='));
        });

        it('should handle SVG with attributes', () => {
            const svg = '<svg width="200" height="300" viewBox="0 0 200 300"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('width="200"'));
            assert.ok(standalone.includes('height="300"'));
            assert.ok(standalone.includes('viewBox="0 0 200 300"'));
        });

        it('should preserve existing content', () => {
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

        it('should handle SVG with special characters', () => {
            const svg = '<svg><text>Test &amp; &lt;Special&gt; "Chars"</text></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('&amp;'));
            assert.ok(standalone.includes('&lt;'));
            assert.ok(standalone.includes('&gt;'));
        });
    });

    describe('Clipboard Format', () => {
        it('should produce valid SVG for clipboard', () => {
            const svg = '<svg width="100" height="100"><rect x="0" y="0" width="100" height="100"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should start with <svg tag (no XML declaration)
            assert.ok(standalone.trim().startsWith('<svg'));
            // Should have xmlns for standalone compatibility
            assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
            // Should preserve content
            assert.ok(standalone.includes('<rect'));
        });

        it('should be ready for paste into applications', () => {
            const svg = '<svg width="100" height="100"><circle cx="50" cy="50" r="40"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should be a single line or minimal whitespace for clipboard
            // Should have xmlns for compatibility with design tools
            assert.ok(standalone.includes('xmlns='));
            // Should preserve all SVG elements
            assert.ok(standalone.includes('<circle'));
        });

        it('should handle complex diagrams', () => {
            const svg = `<svg width="800" height="600" viewBox="0 0 800 600">
                <defs>
                    <marker id="arrow" viewBox="0 0 10 10">
                        <path d="M0,0 L10,5 L0,10 z"/>
                    </marker>
                </defs>
                <g class="diagram">
                    <rect class="node" x="100" y="100" width="200" height="100"/>
                    <text x="200" y="150">Component A</text>
                    <rect class="node" x="500" y="100" width="200" height="100"/>
                    <text x="600" y="150">Component B</text>
                    <path class="edge" d="M300,150 L500,150" marker-end="url(#arrow)"/>
                </g>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<defs>'));
            assert.ok(standalone.includes('<marker'));
            assert.ok(standalone.includes('class="node"'));
            assert.ok(standalone.includes('class="edge"'));
            assert.ok(standalone.includes('marker-end'));
        });
    });

    describe('SVG Compatibility', () => {
        it('should work in browsers', () => {
            const svg = '<svg width="100" height="100"><rect x="10" y="10" width="80" height="80"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should have xmlns for browser compatibility
            assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
        });

        it('should work in design tools (Figma, Sketch, etc)', () => {
            const svg = '<svg width="100" height="100"><rect x="10" y="10" width="80" height="80"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should be standalone SVG with xmlns
            assert.ok(standalone.includes('xmlns='));
            // Should not have XML declaration (some tools don't like it from clipboard)
            assert.ok(!standalone.includes('<?xml'));
        });

        it('should preserve SVG 1.1 features', () => {
            const svg = `<svg width="100" height="100">
                <rect x="10" y="10" width="30" height="30" rx="5"/>
                <circle cx="70" cy="70" r="20"/>
                <path d="M10,90 Q50,50 90,90"/>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('rx="5"')); // rounded rect
            assert.ok(standalone.includes('<circle')); // circle
            assert.ok(standalone.includes('Q50,50')); // quadratic bezier
        });
    });

    describe('Edge Cases', () => {
        it('should handle minimal SVG', () => {
            const svg = '<svg/>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('xmlns='));
        });

        it('should handle SVG with inline styles', () => {
            const svg = '<svg><rect style="fill:red;stroke:blue"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('style="fill:red;stroke:blue"'));
        });

        it('should handle SVG with CSS classes', () => {
            const svg = '<svg><rect class="node primary"/></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('class="node primary"'));
        });

        it('should handle SVG with transforms', () => {
            const svg = '<svg><g transform="translate(50,50) rotate(45)"><rect x="0" y="0" width="30" height="30"/></g></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('transform="translate(50,50) rotate(45)"'));
        });

        it('should handle SVG with gradients', () => {
            const svg = `<svg>
                <defs>
                    <linearGradient id="grad1">
                        <stop offset="0%" stop-color="rgb(255,255,0)"/>
                        <stop offset="100%" stop-color="rgb(255,0,0)"/>
                    </linearGradient>
                </defs>
                <rect fill="url(#grad1)" x="10" y="10" width="80" height="80"/>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<linearGradient'));
            assert.ok(standalone.includes('fill="url(#grad1)"'));
        });

        it('should handle SVG with text elements', () => {
            const svg = `<svg>
                <text x="10" y="20" font-family="Arial" font-size="14">Hello World</text>
                <text x="10" y="40">
                    <tspan font-weight="bold">Bold</tspan>
                    <tspan font-style="italic">Italic</tspan>
                </text>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<text'));
            assert.ok(standalone.includes('<tspan'));
            assert.ok(standalone.includes('font-weight="bold"'));
        });

        it('should preserve whitespace in text content', () => {
            const svg = '<svg><text>  Spaces  Around  </text></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('  Spaces  Around  '));
        });
    });
});
