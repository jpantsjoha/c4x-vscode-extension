/// <reference lib="dom" />

/**
 * #419: a routed edge (a polyline around another box) is redrawn straight
 * while one of its endpoints is dragged. When the drag is cancelled, or comes
 * back to where it started, the edge must get its rendered route back, not
 * stay straight (a straight A -> C would cross B again). Runs the production
 * client script in the prototype harness, with edge-1 given a routed path.
 */
import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_EDITOR_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-editor-harness.html');
const ROUTED_D = 'M300.00,100.00 L324.00,100.00 L324.00,20.00 L476.00,20.00 L476.00,100.00 L500.00,100.00';

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function openWithRoutedEdge(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5_000 });
    await page.locator('#toggle-layout').click();
    await page.evaluate(d => {
        document.addEventListener('pointerdown', e => {
            (window as unknown as { __c4xLastPointerId?: number }).__c4xLastPointerId = e.pointerId;
        }, true);
        document.querySelectorAll('g.edge[data-id="edge-1"] path').forEach(p => p.setAttribute('d', d));
        const label = document.querySelector('g.edge[data-id="edge-1"] text');
        label?.setAttribute('x', '400');
        label?.setAttribute('y', '14');
    }, ROUTED_D);
}

async function edgeGeometry(page: Page): Promise<{ d: string[]; label: string | null }> {
    return page.$eval('g.edge[data-id="edge-1"]', g => ({
        d: Array.from(g.querySelectorAll('path')).map(p => p.getAttribute('d') ?? ''),
        label: g.querySelector('text') ? `${g.querySelector('text')!.getAttribute('x')},${g.querySelector('text')!.getAttribute('y')}` : null,
    }));
}

async function startDrag(page: Page): Promise<{ x: number; y: number }> {
    const box = await page.locator('g.node[data-id="customer"]').boundingBox();
    if (!box) { throw new Error('no customer box'); }
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + 120, start.y + 90, { steps: 5 });
    return start;
}

test('[#419] a drag that returns to its start restores the routed edge exactly', async ({ page }) => {
    await openWithRoutedEdge(page);
    const before = await edgeGeometry(page);
    const start = await startDrag(page);
    const during = await edgeGeometry(page);
    expect(during.d[1]).not.toBe(ROUTED_D);
    await page.mouse.move(start.x, start.y, { steps: 5 });
    await page.mouse.up();
    expect(await edgeGeometry(page)).toEqual(before);
    expect(before.d).toEqual([ROUTED_D, ROUTED_D]);
});

test('[#419] a cancelled drag restores the routed edge exactly', async ({ page }) => {
    await openWithRoutedEdge(page);
    const before = await edgeGeometry(page);
    await startDrag(page);
    expect((await edgeGeometry(page)).d[1]).not.toBe(ROUTED_D);
    await page.$eval('g.node[data-id="customer"]', el => {
        const id = (window as unknown as { __c4xLastPointerId?: number }).__c4xLastPointerId ?? 1;
        el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: id }));
    });
    await page.mouse.up();
    expect(await edgeGeometry(page)).toEqual(before);
});

test('[#419] a drag that ends elsewhere keeps the straight live line', async ({ page }) => {
    await openWithRoutedEdge(page);
    await startDrag(page);
    await page.mouse.up();
    const after = await edgeGeometry(page);
    expect(after.d[1]).not.toBe(ROUTED_D);
    expect(after.d[1]).toMatch(/^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});
