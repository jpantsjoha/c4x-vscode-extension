/// <reference lib="dom" />

/**
 * Issue #160 — dragging an element must not move the camera.
 *
 * Reported from the installed VSIX: dragging a box made the whole diagram
 * shrink, faster the further it was dragged, and the element ran away from the
 * cursor. Root cause: the on-screen scale was derived from the canvas box, and
 * the canvas grew under the dragged element (#142), so every frame rescaled the
 * picture — which also changed getScreenCTM mid-gesture and corrupted the
 * pointer-to-canvas mapping.
 *
 * The invariants below are what "the canvas holds still" means in machine
 * terms: the rendered scale, the element's own screen size, and the pointer
 * tracking are all independent of how far a node is dragged.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function loadHarness(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
}

/** CSS pixels per SVG unit, read straight off the rendered geometry. */
async function renderedScale(page: Page): Promise<number> {
    return page.evaluate(() => {
        const svg = document.querySelector('#svg-container svg') as SVGSVGElement | null;
        const container = document.getElementById('svg-container');
        if (!svg || !container) {
            return NaN;
        }
        const viewBoxWidth = Number((svg.getAttribute('viewBox') ?? '').split(/\s+/)[2]);
        return container.getBoundingClientRect().width / viewBoxWidth;
    });
}

async function nodeScreenBox(page: Page, id: string): Promise<{ width: number; height: number }> {
    const box = await page.locator(`g.node[data-id="${id}"]`).boundingBox();
    return { width: box?.width ?? 0, height: box?.height ?? 0 };
}

async function nodeCoordinates(page: Page, id: string): Promise<{ x: number; y: number }> {
    const el = page.locator(`g.node[data-id="${id}"]`);
    return {
        x: Number(await el.getAttribute('data-current-x')),
        y: Number(await el.getAttribute('data-current-y')),
    };
}

/**
 * Drag a node by a screen-space delta in steps, like a real pointer gesture.
 * Returns where the cursor finished.
 */
async function dragNode(
    page: Page,
    id: string,
    dx: number,
    dy: number,
): Promise<{ x: number; y: number }> {
    const box = await page.locator(`g.node[data-id="${id}"]`).boundingBox();
    if (!box) {
        throw new Error(`node ${id} has no bounding box`);
    }
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 20 });
    await page.mouse.up();
    return { x: startX + dx, y: startY + dy };
}

/**
 * The reported gesture: 1:1 zoom, then drag an element well past the right edge
 * of the 800-unit fixture canvas so the canvas has to grow under it (#142).
 * Every regression below needs that growth to happen — a drag that stays inside
 * the existing canvas never triggered the defect.
 */
async function dragPastTheCanvasEdge(page: Page): Promise<{ x: number; y: number }> {
    await resetZoom(page);
    return dragNode(page, 'customer', 1400, 260);
}

async function resetZoom(page: Page): Promise<void> {
    await page.locator('#zoom-reset').click();
    await expect(page.locator('#zoom-reset')).toHaveText('100%');
}

test('[#160] a drag past the canvas edge leaves the rendered scale untouched', async ({ page }) => {
    await loadHarness(page);
    await resetZoom(page);
    const before = await renderedScale(page);

    await dragNode(page, 'customer', 1400, 260);

    // The whole diagram used to shrink here, further with every pixel dragged.
    expect(await renderedScale(page)).toBeCloseTo(before, 5);
});

test('[#160] the dragged element keeps its on-screen size throughout the drag', async ({ page }) => {
    await loadHarness(page);
    // Measure while already selected: selection thickens the border, which
    // would otherwise show up as a size change that has nothing to do with zoom.
    await page.locator('g.node[data-id="customer"]').click();
    await resetZoom(page);
    const before = await nodeScreenBox(page, 'customer');

    await dragNode(page, 'customer', 1400, 260);

    const after = await nodeScreenBox(page, 'customer');
    expect(after.width).toBeCloseTo(before.width, 1);
    expect(after.height).toBeCloseTo(before.height, 1);
});

test('[#160] the element stays under the cursor instead of running away from it', async ({ page }) => {
    await loadHarness(page);

    const cursor = await dragPastTheCanvasEdge(page);

    const box = await page.locator('g.node[data-id="customer"]').boundingBox();
    expect(box).not.toBeNull();
    // The element is grabbed by its centre, so its centre must finish under the
    // cursor. When the canvas rescaled mid-gesture the element slid away from
    // the pointer by a gap that grew with the drag distance.
    expect(box!.x + box!.width / 2).toBeCloseTo(cursor.x, -1);
    expect(box!.y + box!.height / 2).toBeCloseTo(cursor.y, -1);
});

test('[#160] the canvas still grows to keep a painted background under the element', async ({ page }) => {
    await loadHarness(page);
    const backgroundWidth = () => page.evaluate(() => {
        const rect = document.querySelector('#svg-container svg > rect');
        return Number(rect?.getAttribute('width') ?? 0);
    });
    const before = await backgroundWidth();

    await dragPastTheCanvasEdge(page);

    // #142's guarantee survives the #160 rework: the paint follows the element,
    // it just no longer drags the camera along with it.
    expect(await backgroundWidth()).toBeGreaterThan(before);
});

test('[#160] a drag stages the element at the position it was dropped', async ({ page }) => {
    await loadHarness(page);
    await dragNode(page, 'customer', 240, 120);

    const dropped = await nodeCoordinates(page, 'customer');
    const staged = await page.locator('#staged-changes-list').textContent();
    expect(staged).toContain(`${dropped.x}, ${dropped.y}`);
});
