/// <reference lib="dom" />

/**
 * Exported SVG text matches the preview (#340 review).
 *
 * The Export SVG command adds a stylesheet to the preview SVG. Until #340 it
 * forced every text to the theme's base size and regular weight, which beat the
 * renderer's attributes. Each fixture is drawn by the host in every theme; the
 * preview SVG and the exported file are loaded in Chrome Canary and every text
 * element's computed font must be the same in both. A wrapped diagram's export
 * must keep every text line inside its shape.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const FIXTURES = path.join(ROOT, 'src/__tests__/snapshots/fixtures');
const THEMES = ['classic', 'c4-model', 'c4-standard', 'modern', 'muted', 'high-contrast', 'auto-light', 'auto-dark'];

function exportPair(theme: string, fixture: string, previewPath: string, exportPath: string): void {
    execFileSync(process.execPath, [GENERATOR, 'export', path.join(FIXTURES, fixture), previewPath, exportPath], {
        cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: theme },
    });
}

async function computedFonts(page: Page, file: string): Promise<string[]> {
    await page.goto(url.pathToFileURL(file).href);
    return page.evaluate(() => Array.from(document.querySelectorAll('text')).map(text => {
        const style = getComputedStyle(text);
        return `${text.textContent?.slice(0, 24)} | ${style.fontSize} ${style.fontWeight} ${style.fontStyle} ${style.fontFamily}`;
    }));
}

for (const theme of THEMES) {
    test(`[#340] exported SVG text has the preview's font size, weight, style and family in ${theme}`, async ({ page }, testInfo) => {
        for (const fixture of ['medium-container.c4x', 'simple-context.c4x']) {
            const previewPath = testInfo.outputPath(`${fixture}.preview.svg`);
            const exportPath = testInfo.outputPath(`${fixture}.export.svg`);
            exportPair(theme, fixture, previewPath, exportPath);
            const preview = await computedFonts(page, previewPath);
            const exported = await computedFonts(page, exportPath);
            expect(preview.length).toBeGreaterThan(3);
            expect(exported).toEqual(preview);
            if (fixture === 'medium-container.c4x') {
                // Bold labels and 12 px descriptions: the old stylesheet flattened both to the theme size, weight 400.
                expect(exported.some(line => / 700 /.test(line))).toBe(true);
                expect(exported.some(line => line.includes('| 12px '))).toBe(true);
            }
        }
    });
}

for (const theme of THEMES) {
    test(`[#340] a wrapped diagram's exported SVG keeps every text line inside its shape's text area in ${theme}`, async ({ page }, testInfo) => {
        const previewPath = testInfo.outputPath('preview.svg');
        const exportPath = testInfo.outputPath('export.svg');
        exportPair(theme, 'text-wrapping.c4x', previewPath, exportPath);
        await page.goto(url.pathToFileURL(exportPath).href);
        // Measured in the outline's own user units (the inverse of its screen
        // transform), in the font Chrome actually draws. Text area per shape:
        // wrapped lines keep 8 px from each side; under an icon text starts below
        // the 50 px icon band; in a cylinder text stays clear of the 24 px lid and
        // above the base arc.
        const result = await page.evaluate(() => {
            const tolerance = 0.5;
            const escapes: string[] = [];
            let wrapped = 0;
            let cylinders = 0;
            let icons = 0;
            for (const node of Array.from(document.querySelectorAll('g.node'))) {
                const outline = node.querySelector(':scope > rect, :scope > path') as SVGGraphicsElement | null;
                if (!outline) { continue; }
                const box = outline.getBBox();
                const toLocal = outline.getScreenCTM()!.inverse();
                const local = (r: DOMRect) => {
                    const a = new DOMPoint(r.left, r.top).matrixTransform(toLocal);
                    const b = new DOMPoint(r.right, r.bottom).matrixTransform(toLocal);
                    return { left: a.x, top: a.y, right: b.x, bottom: b.y };
                };
                const icon = node.classList.contains('person');
                const cylinder = outline.tagName === 'path';
                if (icon || node.getAttribute('data-shape') === 'person') { icons++; } // the c4-model person outline (#323) has no icon
                if (cylinder) { cylinders++; }
                const id = node.getAttribute('data-id');
                for (const text of Array.from(node.querySelectorAll(':scope > text[data-field]'))) {
                    const spans = Array.from(text.querySelectorAll('tspan'));
                    wrapped += spans.length;
                    for (const part of spans.length > 0 ? spans : [text]) {
                        const r = local(part.getBoundingClientRect());
                        const pad = spans.length > 0 ? 8 : 0;
                        const top = box.y + (icon ? 50 : cylinder ? 24 : 0);
                        const bottom = box.y + box.height - (cylinder ? 12 : 0);
                        const checks: Array<[string, number]> = [
                            ['left', box.x + pad - r.left], ['right', r.right - (box.x + box.width - pad)],
                            ['top', top - r.top], ['bottom', r.bottom - bottom],
                        ];
                        for (const [side, by] of checks) {
                            if (by > tolerance) { escapes.push(`${id}: "${part.textContent}" past the ${side} by ${by.toFixed(1)} px`); }
                        }
                    }
                }
            }
            return { escapes, wrapped, cylinders, icons };
        });
        expect(result.wrapped).toBeGreaterThan(10);
        expect(result.cylinders).toBeGreaterThanOrEqual(3);
        expect(result.icons).toBeGreaterThanOrEqual(3);
        expect(result.escapes).toEqual([]);
    });
}
