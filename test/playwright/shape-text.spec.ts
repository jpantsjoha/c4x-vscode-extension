/// <reference lib="dom" />

/**
 * Text stays inside each shape's inner text box (#323), measured in Chrome.
 *
 * Payloads come from the real host pipeline (parser, model, layout, SvgBuilder,
 * node snapshots) in the theme under test, loaded into the production webview
 * client. Every drawn text line (a <text>, or each <tspan> of wrapped text) is
 * measured by the browser with getBoundingClientRect, in the font Chrome
 * actually uses, and must lie inside the inner text box that shapeTextBox
 * defines for the node's shape (below the icon when the node has one). The
 * saved-geometry variant pins every node with $x and $y: boxes do not grow, so
 * long text is cut with an ellipsis and must still lie inside the box, and no
 * node moves.
 *
 * Set C4X_SHAPE_SHOTS=<dir> to also write the documentation screenshots of
 * every shape (light and dark c4-model, and the modern theme) into <dir>.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';
import { shapeMinSize, shapeTextBox } from '../../src/render/shapeGeometry';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const THEMES = ['classic', 'c4-model', 'modern', 'auto-dark'] as const;
const WIDE = 'WWWWWWWWWWWWWWWWWWWWWWWW';
const LONG = 'A description long enough to need several lines inside the narrowest shapes, with an unbroken run of wide glyphs: WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW.';

const SHAPES: Array<[string, string]> = [
    ['person', 'Person'], ['bucket', 'Bucket'], ['folder', 'Folder'], ['browser', 'WebBrowser'], ['terminal', 'Terminal'],
];

/** One container per shape, plain and with an icon, long text; the saved variant pins every node. */
function source(saved: boolean): string {
    const lines = ['%%{ c4: container }%%', 'graph TB'];
    let n = 0;
    for (const [id, shape] of SHAPES) {
        for (const icon of [false, true]) {
            const pos = saved ? `, $x="${40 + (n % 5) * 330}", $y="${40 + Math.floor(n / 5) * 330}"` : '';
            const name = `${id}${icon ? '_icon' : ''}`;
            lines.push(`    Container(${name}, "${WIDE}", "Amazon Web Services S3", "${LONG}", $shape="${shape}"${icon ? ', $sprite="react"' : ''}${pos})`);
            n++;
        }
    }
    // Short text, to see every shape at rest.
    for (const [id, shape] of SHAPES) {
        lines.push(`    Container(${id}_short, "Store", "S3", "Documents", $shape="${shape}")`);
    }
    return lines.join('\n') + '\n';
}

function generate(theme: string, sourcePath: string, outPath: string): void {
    execFileSync(process.execPath, [GENERATOR, 'harness', sourcePath, outPath], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: theme } });
}

async function open(page: Page, harnessPath: string): Promise<void> {
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 10000 });
}

interface Measured { id: string; shape: string; icon: boolean; box: { x: number; y: number; width: number; height: number } | null; lines: Array<{ text: string; left: number; right: number; top: number; bottom: number }>; ctm: number[] }

/** Every named-shape node: its outline bounds (user space), its screen transform and the screen boxes of its text lines. */
async function measure(page: Page): Promise<Measured[]> {
    return page.evaluate(() => {
        const out: Array<{ id: string; shape: string; icon: boolean; box: { x: number; y: number; width: number; height: number } | null; lines: Array<{ text: string; left: number; right: number; top: number; bottom: number }>; ctm: number[] }> = [];
        for (const node of Array.from(document.querySelectorAll('#content svg g.node[data-shape]'))) {
            const parts = Array.from(node.querySelectorAll(':scope > rect, :scope > circle, :scope > path')) as SVGGraphicsElement[];
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (const part of parts) {
                const b = part.getBBox();
                x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
            }
            const ctm = (parts[0].getScreenCTM() as DOMMatrix);
            const lines: Array<{ text: string; left: number; right: number; top: number; bottom: number }> = [];
            for (const text of Array.from(node.querySelectorAll(':scope > text[data-field]'))) {
                const spans = Array.from(text.querySelectorAll('tspan'));
                for (const part of spans.length > 0 ? spans : [text]) {
                    const r = part.getBoundingClientRect();
                    lines.push({ text: part.textContent || '', left: r.left, right: r.right, top: r.top, bottom: r.bottom });
                }
            }
            out.push({
                id: node.getAttribute('data-id') || '',
                shape: node.getAttribute('data-shape') || '',
                icon: !!node.querySelector(':scope > g.element-icon svg, :scope > g.element-icon g'),
                box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
                lines,
                ctm: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e, ctm.f],
            });
        }
        return out;
    });
}

/** Lines that leave the inner text box, in screen px, and the number of lines checked. */
function escapes(nodes: Measured[]): { checked: number; escapes: string[] } {
    const found: string[] = [];
    let checked = 0;
    for (const node of nodes) {
        const box = shapeTextBox(node.shape, node.box!.x, node.box!.y, node.box!.width, node.box!.height);
        const [a, , , d, e, f] = node.ctm;
        const top = (node.icon ? box.y + 50 : box.y);
        const left = box.x * a + e;
        const right = (box.x + box.width) * a + e;
        const topPx = top * d + f;
        const bottomPx = (box.y + box.height) * d + f;
        for (const line of node.lines) {
            checked++;
            const by = Math.max(left - line.left, line.right - right, topPx - line.top, line.bottom - bottomPx);
            if (by > 0.5) {
                found.push(`${node.id} (${node.shape}${node.icon ? ' + icon' : ''}) "${line.text}" leaves the text box by ${by.toFixed(1)}px`);
            }
        }
    }
    return { checked, escapes: found };
}

for (const theme of THEMES) {
    test(`[#323] no text line leaves its shape's inner text box in ${theme}`, async ({ page }, testInfo) => {
        const src = testInfo.outputPath('shapes.c4x');
        mkdirSync(path.dirname(src), { recursive: true });
        writeFileSync(src, source(false), 'utf8');
        const harness = testInfo.outputPath('harness.html');
        generate(theme, src, harness);
        await open(page, harness);
        const nodes = await measure(page);
        expect(nodes.length).toBe(SHAPES.length * 3);
        const result = escapes(nodes);
        expect(result.checked).toBeGreaterThan(60);
        expect(result.escapes).toEqual([]);
    });

    test(`[#323] with saved geometry nothing moves or grows and cut text stays inside in ${theme}`, async ({ page }, testInfo) => {
        const src = testInfo.outputPath('saved.c4x');
        mkdirSync(path.dirname(src), { recursive: true });
        writeFileSync(src, source(true), 'utf8');
        const harness = testInfo.outputPath('saved.html');
        generate(theme, src, harness);
        await open(page, harness);
        const nodes = await measure(page);
        const result = escapes(nodes.filter(n => n.id.includes('_icon') || !n.id.endsWith('_short')));
        expect(result.checked).toBeGreaterThan(30);
        expect(result.escapes).toEqual([]);
        // No box grows: every node keeps its base size (the Container size, raised to the shape's minimum).
        for (const node of nodes.filter(n => !n.id.endsWith('_short'))) {
            const min = shapeMinSize(node.shape, node.icon);
            expect(node.box!.height, `${node.id} height`).toBeCloseTo(Math.max(130, min.height), 0);
            expect(node.box!.width, `${node.id} width`).toBeCloseTo(Math.max(240, min.width), 0);
        }
    });
}

const SHOT_DIR = process.env.C4X_SHAPE_SHOTS;
for (const theme of ['c4-model', 'c4-model-dark', 'modern'] as const) {
    test(`[#323] screenshot of every shape in ${theme}`, async ({ page }, testInfo) => {
        test.skip(!SHOT_DIR, 'set C4X_SHAPE_SHOTS=<dir> to write documentation screenshots');
        const src = testInfo.outputPath('shot.c4x');
        mkdirSync(path.dirname(src), { recursive: true });
        writeFileSync(src, [
            '%%{ c4: container }%%', 'graph TB',
            ...SHAPES.map(([id, shape]) => `    Container(${id}, "${shape}", "Technology", "Short description of the shape", $shape="${shape}")`),
            '    Container(cylinder, "Cylinder", "MySQL", "Short description of the shape", $shape="Cylinder")',
            '    Container(box, "Box", "Technology", "Short description of the shape", $shape="Box")',
            '    Container(rounded, "RoundedBox", "Technology", "Short description of the shape", $shape="RoundedBox")',
            '    Container(longtext, "Statement Store Service", "Amazon Web Services S3 Bucket", "Keeps every customer statement as a PDF for seven years and serves it on request.", $shape="Bucket")',
        ].join('\n') + '\n', 'utf8');
        const harness = testInfo.outputPath('shot.html');
        generate(theme, src, harness);
        await page.setViewportSize({ width: 2600, height: 900 });
        await open(page, harness);
        mkdirSync(SHOT_DIR!, { recursive: true });
        // The diagram only, at the viewer's fit zoom, with a margin.
        const clip = await page.evaluate(() => {
            const rects = Array.from(document.querySelectorAll('#content svg g.node')).map(n => n.getBoundingClientRect());
            const left = Math.min(...rects.map(r => r.left)) - 16;
            const top = Math.min(...rects.map(r => r.top)) - 16;
            return { x: Math.max(0, left), y: Math.max(0, top), width: Math.max(...rects.map(r => r.right)) + 16 - Math.max(0, left), height: Math.max(...rects.map(r => r.bottom)) + 16 - Math.max(0, top) };
        });
        await page.screenshot({ path: path.join(SHOT_DIR!, `shapes-${theme}.png`), clip });
    });
}
