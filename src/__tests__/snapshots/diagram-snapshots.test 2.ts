import * as assert from 'assert';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';

// Mock vscode module before importing modules that depend on it
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, LayoutResult, PositionedElement } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { ClassicTheme } from '../../themes/ClassicTheme';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = path.join(__dirname, 'fixtures');
const GOLDEN_DIR = path.join(__dirname, 'golden');

const parser = new C4XParser();
const modelBuilder = new C4ModelBuilder();
const layoutEngine = new DagreLayoutEngine();
const svgBuilder = new SvgBuilder();

/**
 * Render a C4X DSL string through the full pipeline to SVG.
 * Uses the ClassicTheme for deterministic output.
 */
function renderToSvg(dsl: string): string {
    const parsed = parser.parse(dsl);
    const model = modelBuilder.build(parsed, 'snapshot-test');
    const view = model.views[0];
    const layout = layoutEngine.layoutSync(view);
    return svgBuilder.build(layout, { theme: ClassicTheme });
}

/**
 * Render a C4X DSL string through parse -> model -> layout, returning the
 * LayoutResult for geometric assertions.
 */
function renderToLayout(dsl: string): LayoutResult {
    const parsed = parser.parse(dsl);
    const model = modelBuilder.build(parsed, 'snapshot-test');
    const view = model.views[0];
    return layoutEngine.layoutSync(view);
}

/**
 * Normalize an SVG string for deterministic comparison.
 *
 * Strips:
 *  - Floating-point rounding noise (round to 2 decimals)
 *  - Trailing whitespace on every line
 *  - Multiple consecutive blank lines
 *
 * The pipeline is already deterministic (no random IDs, no timestamps),
 * so normalisation is light.
 */
function normalizeSvg(svg: string): string {
    return svg
        // Normalise floating-point precision: 12.300000001 -> 12.30
        .replace(/(\d+\.\d{2})\d+/g, '$1')
        // Collapse trailing whitespace per line
        .replace(/[ \t]+$/gm, '')
        // Collapse multiple blank lines
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

// ---------------------------------------------------------------------------
// Snapshot Tests — Golden-File SVG Comparison
// ---------------------------------------------------------------------------

describe('Diagram Snapshot Tests', () => {
    const fixtures = [
        'simple-context',
        'medium-container',
        'complex-component',
        'horizontal-layout',
        'dynamic-sequence',
    ];

    // Ensure the golden directory exists before any test writes to it
    before(() => {
        if (!existsSync(GOLDEN_DIR)) {
            mkdirSync(GOLDEN_DIR, { recursive: true });
        }
    });

    fixtures.forEach(name => {
        it(`renders "${name}" consistently`, () => {
            const fixturePath = path.join(FIXTURES_DIR, `${name}.c4x`);
            assert.ok(existsSync(fixturePath), `Fixture file not found: ${fixturePath}`);

            const dsl = readFileSync(fixturePath, 'utf-8');
            const svg = renderToSvg(dsl);

            // Basic sanity: output should be a valid SVG
            assert.ok(svg.includes('<svg'), 'Output should contain an SVG element');
            assert.ok(svg.includes('</svg>'), 'Output should contain a closing SVG tag');
            assert.ok(svg.includes('<?xml'), 'Output should contain an XML declaration');

            const goldenPath = path.join(GOLDEN_DIR, `${name}.svg`);

            // When UPDATE_SNAPSHOTS is set, write the golden file and skip comparison
            if (process.env.UPDATE_SNAPSHOTS) {
                writeFileSync(goldenPath, svg, 'utf-8');
                return;
            }

            assert.ok(
                existsSync(goldenPath),
                `Golden file not found: ${goldenPath}. ` +
                'Run with UPDATE_SNAPSHOTS=1 to generate initial baselines.'
            );

            const expected = readFileSync(goldenPath, 'utf-8');
            assert.strictEqual(
                normalizeSvg(svg),
                normalizeSvg(expected),
                `SVG output for "${name}" does not match golden file.\n` +
                'If the change is intentional, run with UPDATE_SNAPSHOTS=1 to regenerate.'
            );
        });
    });

    // Determinism check: rendering the same input twice must produce identical output
    it('is deterministic across repeated renders', () => {
        const dsl = readFileSync(
            path.join(FIXTURES_DIR, 'simple-context.c4x'),
            'utf-8'
        );
        const svg1 = renderToSvg(dsl);
        const svg2 = renderToSvg(dsl);
        assert.strictEqual(
            normalizeSvg(svg1),
            normalizeSvg(svg2),
            'Two renders of the same input should produce identical SVG'
        );
    });
});

// ---------------------------------------------------------------------------
// Geometric Assertion Tests — Layout Property Validation
// ---------------------------------------------------------------------------

describe('Diagram Geometric Assertions', () => {

    /**
     * Check whether two axis-aligned bounding boxes overlap.
     */
    function boxesOverlap(
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number }
    ): boolean {
        return (
            a.x < b.x + b.width &&
            a.x + a.width > b.x &&
            a.y < b.y + b.height &&
            a.y + a.height > b.y
        );
    }

    /**
     * Return the overlap area between two boxes (0 if no overlap).
     */
    function overlapArea(
        a: { x: number; y: number; width: number; height: number },
        b: { x: number; y: number; width: number; height: number }
    ): number {
        const overlapX = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
        const overlapY = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
        return overlapX * overlapY;
    }

    // Load all layouts once for efficiency
    const layouts: Record<string, LayoutResult> = {};
    const fixtureNames = [
        'simple-context',
        'medium-container',
        'complex-component',
        'horizontal-layout',
        'dynamic-sequence',
    ];

    before(() => {
        for (const name of fixtureNames) {
            const dsl = readFileSync(
                path.join(FIXTURES_DIR, `${name}.c4x`),
                'utf-8'
            );
            layouts[name] = renderToLayout(dsl);
        }
    });

    // ------------------------------------------------------------------
    // 1. No element overlap
    // ------------------------------------------------------------------
    fixtureNames.forEach(name => {
        it(`"${name}": elements do not significantly overlap`, () => {
            const layout = layouts[name];
            const elements = layout.elements;

            for (let i = 0; i < elements.length; i++) {
                for (let j = i + 1; j < elements.length; j++) {
                    const a = elements[i];
                    const b = elements[j];

                    // Allow tiny overlap (< 1% of smaller element area) for rounding
                    const smallerArea = Math.min(a.width * a.height, b.width * b.height);
                    const overlap = overlapArea(a, b);
                    const overlapPct = (overlap / smallerArea) * 100;

                    assert.ok(
                        overlapPct < 1,
                        `Elements "${a.id}" and "${b.id}" overlap by ${overlapPct.toFixed(1)}% ` +
                        `(${overlap.toFixed(0)}px^2) in "${name}"`
                    );
                }
            }
        });
    });

    // ------------------------------------------------------------------
    // 2. All elements within SVG viewBox
    // ------------------------------------------------------------------
    fixtureNames.forEach(name => {
        it(`"${name}": all elements are within the SVG viewBox`, () => {
            const layout = layouts[name];
            const svgWidth = layout.width;
            const svgHeight = layout.height;

            for (const el of layout.elements) {
                assert.ok(
                    el.x >= 0,
                    `Element "${el.id}" has negative x (${el.x}) in "${name}"`
                );
                assert.ok(
                    el.y >= 0,
                    `Element "${el.id}" has negative y (${el.y}) in "${name}"`
                );
                assert.ok(
                    el.x + el.width <= svgWidth,
                    `Element "${el.id}" extends beyond SVG width ` +
                    `(${el.x + el.width} > ${svgWidth}) in "${name}"`
                );
                assert.ok(
                    el.y + el.height <= svgHeight,
                    `Element "${el.id}" extends beyond SVG height ` +
                    `(${el.y + el.height} > ${svgHeight}) in "${name}"`
                );
            }
        });
    });

    // ------------------------------------------------------------------
    // 3. Minimum spacing between elements
    // ------------------------------------------------------------------
    fixtureNames.forEach(name => {
        it(`"${name}": minimum spacing between elements is maintained`, () => {
            const layout = layouts[name];
            const elements = layout.elements;
            // The DagreLayoutEngine uses nodesep=60 and ranksep=80,
            // so we expect at least some gap between non-overlapping elements.
            // Use a small threshold (5px) to avoid false positives from
            // elements that are in different ranks or groups.
            const MIN_GAP = 5;

            for (let i = 0; i < elements.length; i++) {
                for (let j = i + 1; j < elements.length; j++) {
                    const a = elements[i];
                    const b = elements[j];

                    if (boxesOverlap(a, b)) {
                        // If they overlap, the overlap test above covers it
                        continue;
                    }

                    // Calculate gap between closest edges
                    const gapX = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
                    const gapY = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
                    const gap = Math.max(gapX, gapY);

                    assert.ok(
                        gap >= MIN_GAP,
                        `Elements "${a.id}" and "${b.id}" are only ${gap.toFixed(1)}px apart ` +
                        `(minimum: ${MIN_GAP}px) in "${name}"`
                    );
                }
            }
        });
    });

    // ------------------------------------------------------------------
    // 4. Relationships have valid points
    // ------------------------------------------------------------------
    fixtureNames.forEach(name => {
        it(`"${name}": all relationships have routed points`, () => {
            const layout = layouts[name];

            for (const rel of layout.relationships) {
                assert.ok(
                    rel.points.length >= 2,
                    `Relationship "${rel.id}" (${rel.relationship.from} -> ${rel.relationship.to}) ` +
                    `has fewer than 2 route points in "${name}"`
                );

                // Points should have finite coordinates
                for (const pt of rel.points) {
                    assert.ok(
                        Number.isFinite(pt.x) && Number.isFinite(pt.y),
                        `Relationship "${rel.id}" has non-finite point (${pt.x}, ${pt.y}) in "${name}"`
                    );
                }
            }
        });
    });

    // ------------------------------------------------------------------
    // 5. SVG text labels have minimum readable font size
    // ------------------------------------------------------------------
    fixtureNames.forEach(name => {
        it(`"${name}": SVG labels use readable font sizes`, () => {
            const dsl = readFileSync(
                path.join(FIXTURES_DIR, `${name}.c4x`),
                'utf-8'
            );
            const svg = renderToSvg(dsl);

            // Extract all font-size values from SVG text elements
            const fontSizeMatches = svg.match(/font-size="(\d+(?:\.\d+)?)"/g);
            if (!fontSizeMatches) {
                return; // No text elements to check
            }

            const MIN_FONT_SIZE = 8; // Minimum readable font size in px
            for (const match of fontSizeMatches) {
                const sizeStr = match.match(/font-size="(\d+(?:\.\d+)?)"/);
                if (sizeStr) {
                    const size = parseFloat(sizeStr[1]);
                    assert.ok(
                        size >= MIN_FONT_SIZE,
                        `Font size ${size}px is below minimum ${MIN_FONT_SIZE}px in "${name}"`
                    );
                }
            }
        });
    });

    // ------------------------------------------------------------------
    // 6. Horizontal layout produces wider-than-tall diagram
    // ------------------------------------------------------------------
    it('"horizontal-layout": LR direction produces wider diagram', () => {
        const layout = layouts['horizontal-layout'];
        assert.ok(
            layout.width > layout.height,
            `Horizontal layout should be wider than tall, ` +
            `but got ${layout.width}x${layout.height}`
        );
    });

    // ------------------------------------------------------------------
    // 7. Vertical layout produces taller-than-wide diagram
    // ------------------------------------------------------------------
    it('"simple-context": TB direction produces taller diagram', () => {
        const layout = layouts['simple-context'];
        assert.ok(
            layout.height > layout.width,
            `Vertical layout should be taller than wide, ` +
            `but got ${layout.width}x${layout.height}`
        );
    });

    // ------------------------------------------------------------------
    // 8. Dynamic diagram relationships have order numbers
    // ------------------------------------------------------------------
    it('"dynamic-sequence": relationships have sequential order', () => {
        const layout = layouts['dynamic-sequence'];

        const orders = layout.relationships
            .map(r => r.relationship.order)
            .filter((o): o is number => o !== undefined);

        assert.ok(
            orders.length > 0,
            'Dynamic diagram relationships should have order numbers'
        );

        // Orders should be sequential starting from 1
        for (let i = 0; i < orders.length; i++) {
            assert.strictEqual(
                orders[i],
                i + 1,
                `Expected order ${i + 1} but got ${orders[i]}`
            );
        }
    });
});
