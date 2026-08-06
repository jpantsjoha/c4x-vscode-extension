/// <reference lib="dom" />

/**
 * Issue #98 — Contextual legend overlay.
 *
 * Playwright browser-level assertions against the production preview client
 * running in the synthetic harness: the overlay lists only the element types
 * the host reports in presentElementTypes, follows the payload swatch
 * colours, is repositionable by mouse and keyboard, honours
 * settings.legendShow, and keeps its position across re-renders.
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
}

/** Re-post the (optionally mutated) harness render payload, simulating a host re-render. */
async function rerender(page: Page, legendShow?: boolean): Promise<void> {
    await page.evaluate((nextLegendShow) => {
        const testWindow = window as Window & {
            __visualLayoutRenderPayload?: { settings: { legendShow: boolean } };
        };
        const payload = testWindow.__visualLayoutRenderPayload;
        if (!payload) {
            throw new Error('harness render payload missing');
        }
        if (nextLegendShow !== undefined) {
            payload.settings.legendShow = nextLegendShow;
        }
        window.postMessage({ type: 'render', payload }, '*');
    }, legendShow);
}

test('[#98] legend overlay is visible on load and lists only the element types present in the diagram', async ({ page }) => {
    await loadHarness(page);
    const overlay = page.locator('#legend-overlay');
    await expect(overlay).toBeVisible();

    // Fixture contains Person, SoftwareSystem, Container nodes plus edges:
    // exactly those catalogue entries (plus the derived Relationship marker)
    // appear, in catalogue order.
    const labels = overlay.locator('#legend-items li');
    await expect(labels).toHaveCount(4);
    await expect(labels).toHaveText(['Person', 'Software System', 'Container', 'Relationship']);

    // Contextual filtering: types absent from the fixture never appear.
    const text = await overlay.textContent();
    for (const absent of ['Component', 'Deployment Node', 'External', 'Boundary']) {
        expect(text).not.toContain(absent);
    }
});

test('[#98] swatch colours come from the payload legendSwatchColors map', async ({ page }) => {
    await loadHarness(page);
    const swatches = page.locator('#legend-items li .legend-swatch');
    // Person → #08427B, Container → #438DD5 (harness payload values).
    await expect(swatches.nth(0)).toHaveCSS('background-color', 'rgb(8, 66, 123)');
    await expect(swatches.nth(2)).toHaveCSS('background-color', 'rgb(67, 141, 213)');
});

test('[#98] mouse drag repositions the overlay and announces the drop', async ({ page }) => {
    await loadHarness(page);
    const overlay = page.locator('#legend-overlay');
    await expect(overlay).toBeVisible();

    const before = await overlay.boundingBox();
    expect(before).not.toBeNull();

    // Drag up-left; the default anchor is bottom-right so there is room.
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 - 150, before!.y + before!.height / 2 - 100, { steps: 5 });
    await page.mouse.up();

    const after = await overlay.boundingBox();
    expect(after).not.toBeNull();
    expect(after!.x).toBeCloseTo(before!.x - 150, 0);
    expect(after!.y).toBeCloseTo(before!.y - 100, 0);

    // Position is now explicit inline left/top (no longer the CSS anchor).
    const inlineRight = await overlay.evaluate(el => (el as HTMLElement).style.right);
    expect(inlineRight).toBe('auto');

    await expect(page.locator('#layout-status')).toContainText('Legend repositioned to');
});

test('[#98] arrow keys nudge the focused overlay 10px (25px with Shift)', async ({ page }) => {
    await loadHarness(page);
    const overlay = page.locator('#legend-overlay');
    await expect(overlay).toBeVisible();

    await overlay.focus();
    await expect(overlay).toBeFocused();

    const initial = await overlay.boundingBox();
    expect(initial).not.toBeNull();

    await page.keyboard.press('ArrowLeft');
    let box = await overlay.boundingBox();
    expect(box!.x).toBeCloseTo(initial!.x - 10, 0);
    expect(box!.y).toBeCloseTo(initial!.y, 0);

    await page.keyboard.press('ArrowUp');
    box = await overlay.boundingBox();
    expect(box!.y).toBeCloseTo(initial!.y - 10, 0);

    await page.keyboard.press('Shift+ArrowRight');
    box = await overlay.boundingBox();
    expect(box!.x).toBeCloseTo(initial!.x - 10 + 25, 0);

    await expect(page.locator('#layout-status')).toContainText('Legend repositioned to');
});

test('[#98] overlay hides when a render payload carries legendShow: false and returns when re-enabled', async ({ page }) => {
    await loadHarness(page);
    const overlay = page.locator('#legend-overlay');
    await expect(overlay).toBeVisible();

    await rerender(page, false);
    await expect(overlay).toBeHidden();

    await rerender(page, true);
    await expect(overlay).toBeVisible();
});

test('[#98] dragged position survives a host re-render', async ({ page }) => {
    await loadHarness(page);
    const overlay = page.locator('#legend-overlay');
    await expect(overlay).toBeVisible();

    const before = await overlay.boundingBox();
    expect(before).not.toBeNull();
    await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2);
    await page.mouse.down();
    await page.mouse.move(before!.x + before!.width / 2 - 120, before!.y + before!.height / 2 - 80, { steps: 5 });
    await page.mouse.up();

    const dragged = await overlay.boundingBox();
    expect(dragged).not.toBeNull();

    await rerender(page);

    const afterRerender = await overlay.boundingBox();
    expect(afterRerender).not.toBeNull();
    expect(afterRerender!.x).toBeCloseTo(dragged!.x, 0);
    expect(afterRerender!.y).toBeCloseTo(dragged!.y, 0);
});
