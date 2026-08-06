/// <reference lib="dom" />

/**
 * Issue #134 — Markdown-originated editor opens at c4x.markdown.previewScale.
 *
 * The harness below is generated with C4X_HARNESS_INITIAL_ZOOM=0.5 so the stub
 * render payload mirrors what PreviewPanel sends for a Markdown-fence editor:
 * settings.initialZoom = 0.5. The default harness (no initialZoom) keeps the
 * auto-fit-on-open path — those scenarios live in zoom-fit-multiselect.spec.ts
 * (#111) and must stay green.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_INITIAL_ZOOM_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-initial-zoom-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], {
        cwd: ROOT,
        env: { ...process.env, C4X_HARNESS_INITIAL_ZOOM: '0.5' },
    });
});

async function loadHarness(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
}

/**
 * Since #160 the camera is anchored to the canvas viewport, so the applied
 * scale is the ratio between the visible width in CSS pixels and the viewBox
 * width in SVG units — "50%" now literally means half size on screen. The
 * expected viewBox therefore depends on the panel size, so the assertions
 * derive it rather than hard-coding a string.
 */
async function appliedScale(page: Page): Promise<number> {
    return page.evaluate(() => {
        const svg = document.querySelector('#svg-container svg') as SVGSVGElement | null;
        const container = document.getElementById('svg-container');
        if (!svg || !container) {
            return NaN;
        }
        const width = Number((svg.getAttribute('viewBox') ?? '').split(/\s+/)[2]);
        return container.getBoundingClientRect().width / width;
    });
}

async function viewBoxOf(page: Page): Promise<string> {
    const value = await page.locator('#svg-container svg').getAttribute('viewBox');
    return value ?? '';
}

test('[#134] first render applies settings.initialZoom instead of auto-fit', async ({ page }) => {
    await loadHarness(page);
    // Auto-fit would compute ~1.1 for this fixture (nodes spread over
    // 800 × 500), so a scale of 0.5 proves the fixed scale won over the fit.
    expect(await appliedScale(page)).toBeCloseTo(0.5, 3);
});

test('[#134] the fixed scale opens with the content centred, not off the fold', async ({ page }) => {
    await loadHarness(page);
    // Regression guard for #160: panX/panY used to be left at 0, which centred
    // the canvas box rather than the diagram, so a Markdown-opened editor could
    // put the diagram below the visible area and the user had to drag it back.
    const offset = await page.evaluate(() => {
        const svg = document.querySelector('#svg-container svg') as SVGSVGElement | null;
        if (!svg) {
            return null;
        }
        const [x, y, w, h] = (svg.getAttribute('viewBox') ?? '').split(/\s+/).map(Number);
        const nodes = Array.from(document.querySelectorAll('g.node > rect')) as SVGRectElement[];
        const lefts = nodes.map(rect => Number(rect.getAttribute('x')));
        const tops = nodes.map(rect => Number(rect.getAttribute('y')));
        const rights = nodes.map(rect => Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')));
        const bottoms = nodes.map(rect => Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')));
        return {
            dx: (Math.min(...lefts) + Math.max(...rights)) / 2 - (x + w / 2),
            dy: (Math.min(...tops) + Math.max(...bottoms)) / 2 - (y + h / 2),
        };
    });
    expect(offset).not.toBeNull();
    // Within a pixel of the window centre in SVG units.
    expect(Math.abs(offset!.dx)).toBeLessThan(2);
    expect(Math.abs(offset!.dy)).toBeLessThan(2);
});

test('[#134] zoom control displays the applied scale', async ({ page }) => {
    await loadHarness(page);
    await expect(page.locator('#zoom-reset')).toHaveText('50%');
});

test('[#134] live region announces the applied scale, not a false zoom-to-fit', async ({ page }) => {
    await loadHarness(page);
    const status = page.locator('#layout-status');
    await expect(status).toHaveText('Diagram opened at 50% zoom');
    await expect(status).not.toContainText(/zoomed to fit/i);
});

test('[#134] zoom controls keep working after the initial scale', async ({ page }) => {
    await loadHarness(page);
    const opened = await viewBoxOf(page);
    expect(await appliedScale(page)).toBeCloseTo(0.5, 3);

    await page.locator('#zoom-in').click();
    await expect(page.locator('#zoom-reset')).toHaveText('60%');
    expect(await appliedScale(page)).toBeCloseTo(0.6, 3);

    await page.locator('#zoom-out').click();
    await expect(page.locator('#zoom-reset')).toHaveText('50%');
    expect(await viewBoxOf(page)).toBe(opened);
});

test('[#134] Fit still works after open and announces truthfully', async ({ page }) => {
    await loadHarness(page);
    const opened = await viewBoxOf(page);

    await page.locator('#zoom-fit').click();
    await expect(page.locator('#layout-status')).toHaveText(/zoomed to fit/i);
    // Fit recomputes from the content bounds — it must leave the fixed 0.5 window.
    expect(await viewBoxOf(page)).not.toBe(opened);
});

test('[#134] save/re-render preserves the user zoom — initial zoom never re-applies', async ({ page }) => {
    await loadHarness(page);
    const svgEl = page.locator('#svg-container svg');

    // The user takes over the camera after the initial scale.
    const opened = await viewBoxOf(page);
    await page.locator('#zoom-in').click();
    const userViewBox = await svgEl.getAttribute('viewBox');
    expect(userViewBox).not.toBeNull();
    expect(userViewBox).not.toBe(opened);

    // The host's post-save re-render arrives (same payload, new message).
    await page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutRenderPayload?: unknown };
        window.postMessage({ type: 'render', payload: testWindow.__visualLayoutRenderPayload }, '*');
    });

    // firstRender is false by now, so neither the initial zoom nor auto-fit
    // may fire again: the applied viewBox is still exactly the user's zoom/pan.
    await expect(svgEl).toHaveAttribute('viewBox', userViewBox!);
});
