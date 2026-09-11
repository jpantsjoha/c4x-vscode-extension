/// <reference lib="dom" />

/**
 * Regression coverage for issue #119: relationship lines must repaint live
 * while a node is dragged. The original bug: `updateConnectedEdges` updated
 * only the first `path` child of `g.edge` — the transparent `.edge-hit-area` —
 * leaving the visible stroked path frozen until Save. This scenario pins the
 * end-to-end behaviour against the real production client script: BOTH paths
 * of every connected edge change during the drag, and unrelated edges stay
 * put. (Permanent home for the scenario promised in #72 Phase 4.)
 */
import { expect, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_EDITOR_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-editor-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function readEdgePaths(page: import('@playwright/test').Page): Promise<string[]> {
    return page.$$eval('g.edge path:not(.edge-hit-area)', els =>
        els.map(e => e.getAttribute('d') ?? ''));
}

async function readHitAreaPaths(page: import('@playwright/test').Page): Promise<string[]> {
    return page.$$eval('g.edge path.edge-hit-area', els =>
        els.map(e => e.getAttribute('d') ?? ''));
}

test('visible edge paths repaint live while dragging a connected node (#119)', async ({ page }) => {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
    await page.locator('#toggle-layout').click();

    const beforeVisible = await readEdgePaths(page);
    const beforeHit = await readHitAreaPaths(page);
    expect(beforeVisible.length).toBeGreaterThan(0);
    expect(beforeVisible.length).toBe(beforeHit.length);

    // Drag the "customer" node (connected to edges 1-3 in the fixture).
    const customer = page.locator('g.node[data-id="customer"]');
    const box = await customer.boundingBox();
    if (!box) {
        throw new Error('Could not get the customer node bounding box.');
    }
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 120, centerY + 60, { steps: 5 });

    // Assert DURING the drag, before mouseup — the original failure mode.
    const duringVisible = await readEdgePaths(page);
    const duringHit = await readHitAreaPaths(page);
    await page.mouse.up();

    // Connected edges (fixture: first three) repaint — visible AND hit-area.
    for (let i = 0; i < 3; i++) {
        expect(duringVisible[i], `visible path of connected edge ${i} should repaint during drag`)
            .not.toBe(beforeVisible[i]);
        expect(duringHit[i], `hit-area of connected edge ${i} should track the visible path`)
            .toBe(duringVisible[i]);
    }
    // Unconnected edges stay untouched.
    for (let i = 3; i < beforeVisible.length; i++) {
        expect(duringVisible[i], `unrelated edge ${i} must not change`).toBe(beforeVisible[i]);
    }
});
