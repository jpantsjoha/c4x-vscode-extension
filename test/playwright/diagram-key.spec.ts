/// <reference lib="dom" />

/**
 * The diagram key in the preview (#327).
 *
 * The harness (test/visual-layout/generate-key-harness.js) renders the
 * Internet Banking System container fixture through the host pipeline and
 * sends the derived key entries, as PreviewPanel does. The overlay lists the
 * same entries as the exported key, is reachable by a screen reader, and
 * after auto-fit and Fit no node sits under it (#262).
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-key-harness.js');
const FIXTURE = path.join(ROOT, 'src/__tests__/snapshots/fixtures/ibs-shapes/03-container.c4x');

/** The derived key for the fixture: nine styles from the c4model.com container key, plus the relationship. */
const EXPECTED = [
    'Person',
    'Software System, Core Banking',
    'Software System, External Email',
    'Container, Folder',
    'Container, Web Browser',
    'Container, Terminal',
    'Container, Database, Bucket',
    'Container, Database',
    'Boundary, Software System',
    'Relationship',
];

let harness: string;

test.beforeAll(() => {
    const dir = fs.mkdtempSync(path.join(process.env.C4X_PLAYWRIGHT_TMP ?? os.tmpdir(), 'c4x-key-'));
    harness = path.join(dir, 'key-harness.html');
    execFileSync(process.execPath, [GENERATOR, FIXTURE, harness], { cwd: ROOT });
});

async function load(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(harness).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 5_000 });
    await expect(page.locator('#legend-overlay')).toBeVisible();
}

/** Node boxes and the key's box, in page pixels. */
async function boxes(page: Page): Promise<{ nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>; key: { x: number; y: number; w: number; h: number } }> {
    return page.evaluate(() => {
        const rect = (el: Element) => {
            const r = el.getBoundingClientRect();
            return { x: r.left, y: r.top, w: r.width, h: r.height };
        };
        const nodes = Array.from(document.querySelectorAll('#content svg g.node')).map(el => ({ id: el.getAttribute('data-id') ?? '', ...rect(el) }));
        return { nodes, key: rect(document.getElementById('legend-overlay')!) };
    });
}

function assertClear(result: Awaited<ReturnType<typeof boxes>>): void {
    const { key } = result;
    for (const node of result.nodes) {
        const overlap = node.x < key.x + key.w && node.x + node.w > key.x && node.y < key.y + key.h && node.y + node.h > key.y;
        expect(overlap, `node ${node.id} ${JSON.stringify(node)} is under the key ${JSON.stringify(key)}`).toBe(false);
    }
}

test('[#327] the overlay lists the derived key with shape swatches', async ({ page }) => {
    await load(page);
    const items = page.locator('#legend-items li');
    await expect(items).toHaveText(EXPECTED);
    // Shape swatches drawn with the diagram's geometry, not colour chips.
    await expect(page.locator('#legend-items li .legend-swatch-shape svg')).toHaveCount(EXPECTED.length);
    await expect(page.locator('#legend-items li.legend-entry-element .legend-swatch-shape svg [data-paint]')).not.toHaveCount(0);
    const folder = items.filter({ hasText: 'Container, Folder' }).locator('svg path');
    await expect(folder).toHaveCount(1);
});

test('[#327] every key entry is reachable and announced by a screen reader', async ({ page }) => {
    await load(page);
    const region = page.getByRole('region', { name: /Diagram legend/ });
    await expect(region).toBeVisible();
    await expect(region.getByRole('list')).toHaveCount(1);
    const listItems = region.getByRole('listitem');
    await expect(listItems).toHaveCount(EXPECTED.length);
    for (const [index, label] of EXPECTED.entries()) {
        await expect(listItems.nth(index)).toHaveAccessibleName(label);
    }
    // Swatches are decorative: hidden from the accessibility tree.
    await expect(region.getByRole('img')).toHaveCount(0);
    // Reachable by keyboard: Tab lands on the key region.
    await region.focus();
    await expect(region).toBeFocused();
});

// 700x900 and 600x600 put a node under the docked key with a plain fit (the
// test fails with computeZoomToFitClearOf reduced to computeZoomToFit).
for (const viewport of [{ width: 1920, height: 1080 }, { width: 1280, height: 720 }, { width: 700, height: 900 }, { width: 600, height: 600 }]) {
    test(`[#327][#262] ${viewport.width}x${viewport.height}: no node sits under the key after auto-fit and after Fit`, async ({ page }) => {
        await page.setViewportSize(viewport);
        await load(page);
        await page.waitForTimeout(200);
        assertClear(await boxes(page));
        await page.locator('#zoom-in').click();
        await page.locator('#zoom-in').click();
        await page.locator('#zoom-fit').click();
        await page.waitForTimeout(100);
        assertClear(await boxes(page));
    });
}

/** Render a C4X source through the key harness; returns the harness path. */
function harnessFor(name: string, source: string): string {
    const dir = path.dirname(harness);
    const src = path.join(dir, `${name}.c4x`);
    const out = path.join(dir, `${name}.html`);
    fs.writeFileSync(src, source, 'utf8');
    execFileSync(process.execPath, [GENERATOR, src, out], { cwd: ROOT });
    return out;
}

/** A source with `count` containers, each in its own tag style. */
function manyStyles(count: number): string {
    const lines = ['%%{ c4: container }%%', 'graph TB'];
    for (let i = 0; i < count; i++) {
        const hex = (0x100000 + i * 997).toString(16).slice(-6);
        lines.push(`elementStyle S${i} $stroke="#${hex}"`);
        lines.push(`Container(c${i}, "C${i}", $tags="S${i}")`);
    }
    return lines.join('\n') + '\n';
}

test('[#327] 129 styles: the diagram renders and the key lists 127 entries and a count of the rest', async ({ page }) => {
    await page.goto(url.pathToFileURL(harnessFor('styles-129', manyStyles(129))).href);
    await page.waitForFunction(() => document.querySelectorAll('#content svg g.node').length === 129, undefined, { timeout: 10_000 });
    await expect(page.locator('#legend-items li')).toHaveCount(128);
    await expect(page.locator('#legend-items li').last()).toHaveText('and 2 more styles');
});

test('[#327] a key the client rejects is dropped, never the render', async ({ page }) => {
    await load(page);
    await page.evaluate(() => {
        const w = window as Window & { __visualLayoutRenderPayload?: Record<string, unknown> };
        const payload = { ...w.__visualLayoutRenderPayload! };
        payload.legendEntries = Array.from({ length: 300 }, () => ({ label: 'x'.repeat(400), kind: 'element', swatch: '<svg ></svg>' }));
        document.querySelector('#content svg')!.setAttribute('data-before', 'true');
        window.postMessage({ type: 'render', payload }, '*');
    });
    // The diagram is drawn again from this payload.
    await page.waitForFunction(() => document.querySelector('#content svg:not([data-before]) g.node') !== null, undefined, { timeout: 5_000 });
    // The overlay falls back to the fixed catalogue for the types present.
    await expect(page.locator('#legend-items li').first()).toHaveText('Person');
});

test('[#327] 40 entries in a 600 px view: the key stays inside the canvas, scrolls, stays reachable, and Fit clears it', async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 600 });
    await page.goto(url.pathToFileURL(harnessFor('styles-40', manyStyles(40))).href);
    await page.waitForFunction(() => document.querySelectorAll('#content svg g.node').length === 40, undefined, { timeout: 10_000 });
    const geometry = await page.evaluate(() => {
        const area = (document.getElementById('svg-container') || document.getElementById('content'))!.getBoundingClientRect();
        const key = document.getElementById('legend-overlay')!.getBoundingClientRect();
        const list = document.getElementById('legend-items')!;
        return { areaTop: area.top, areaBottom: area.bottom, keyTop: key.top, keyBottom: key.bottom, keyHeight: key.height, areaHeight: area.height, scrolls: list.scrollHeight > list.clientHeight, tabindex: list.getAttribute('tabindex') };
    });
    expect(geometry.keyTop).toBeGreaterThanOrEqual(geometry.areaTop);
    expect(geometry.keyBottom).toBeLessThanOrEqual(geometry.areaBottom);
    expect(geometry.keyHeight).toBeLessThanOrEqual(geometry.areaHeight * 0.5);
    expect(geometry.scrolls).toBe(true);
    expect(geometry.tabindex).toBe('0');
    const region = page.getByRole('region', { name: /Diagram legend/ });
    await expect(region.getByRole('listitem')).toHaveCount(40);
    // Arrow keys in the focused list scroll it; they do not move the key.
    const list = page.locator('#legend-items');
    await list.focus();
    const before = await page.locator('#legend-overlay').boundingBox();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    expect(await page.locator('#legend-overlay').boundingBox()).toEqual(before);
    await page.locator('#zoom-fit').click();
    await page.waitForTimeout(100);
    assertClear(await boxes(page));
});

test('[#327] a staged tag edit rebuilds the key before Save', async ({ page }) => {
    const source = [
        '%%{ c4: container }%%',
        'graph TB',
        'elementStyle Critical $stroke="#BF101D", $legend="Critical service"',
        'Container(api, "API", "Java")',
        'Container(web, "Web", "React")',
        'web -->|Calls| api',
        '',
    ].join('\n');
    await page.goto(url.pathToFileURL(harnessFor('staged-tag', source)).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 5_000 });
    const items = page.locator('#legend-items li');
    await expect(items).toHaveText(['Container', 'Relationship']);
    await page.locator('#toggle-layout').click();
    const node = page.locator('g.node[data-id="api"]');
    await node.focus();
    await page.keyboard.press('Enter');
    await page.locator('#inspector-tags').fill('Critical');
    await expect(items).toHaveText(['Critical service', 'Container', 'Relationship']);
    await page.locator('#inspector-tags').fill('');
    await expect(items).toHaveText(['Container', 'Relationship']);
});
