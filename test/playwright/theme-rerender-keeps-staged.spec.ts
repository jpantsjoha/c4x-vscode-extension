/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// A theme change re-renders the open preview (#390). Since #408 the host holds
// that render back while it knows the preview is dirty, and marks the render it
// does send with `refresh: true`. A marked render that reaches a webview which
// has just staged an edit (before the host heard) is declined, so the draft is
// kept; the host re-sends it after Save or Discard. An unmarked render, such as
// a source change, still replaces the draft: that is why the host defers.
const root = path.resolve(__dirname, '../..');
let directory: string;
let harness: string;

test.beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-theme-rerender-'));
    harness = path.join(directory, 'harness.html');
    execFileSync(process.execPath, [path.join(root, 'test/visual-layout/generate-boundary-harness.js'), harness], { cwd: root });
});

test.afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

async function stageMove(page: import('@playwright/test').Page) {
    await page.goto(pathToFileURL(harness).href);
    await expect(page.locator('#content svg')).toBeVisible();
    await page.locator('#toggle-layout').click();
    const node = page.locator('g.node').first();
    await node.focus();
    await node.press('Shift+ArrowRight');
    const staged = page.locator('#staged-changes-list li:not(.empty-changes-text)');
    expect(await staged.count(), 'the arrow key must stage an edit').toBeGreaterThan(0);
    return staged;
}

/** The host's theme re-render: the same render with a different theme's colours. */
async function postThemedRender(page: import('@playwright/test').Page, refresh: boolean) {
    await page.evaluate((marked) => {
        const host = window as Window & { __visualLayoutRenderPayload?: Record<string, unknown> };
        const payload = JSON.parse(JSON.stringify(host.__visualLayoutRenderPayload));
        payload.svg = String(payload.svg).replace(/#[0-9a-fA-F]{6}/g, '#7a3b9d');
        payload.legendSwatchColors = Object.fromEntries(Object.keys(payload.legendSwatchColors ?? {}).map(key => [key, '#7a3b9d']));
        window.postMessage({ type: 'render', payload, ...(marked ? { refresh: true } : {}) }, '*');
    }, refresh);
}

const recoloured = (page: import('@playwright/test').Page) =>
    page.locator('#content svg').innerHTML().then(html => html.includes('#7a3b9d'));

test('a theme re-render keeps the staged move and asks for it after Save or Discard (#408)', async ({ page }) => {
    const staged = await stageMove(page);
    const before = await staged.count();

    await postThemedRender(page, true);

    await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Theme change or refresh will apply after you save or discard.');
    expect(await staged.count(), 'the staged draft survives the theme re-render').toBe(before);
    expect(await recoloured(page), 'the declined render is not drawn').toBe(false);
    const declined = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: { type?: string }[] })
        .__visualLayoutMessages!.filter(m => m.type === 'visualLayout.refreshDeclined').length);
    expect(declined, 'the host is asked to re-send it later').toBe(1);

    // After Discard the host re-sends the theme render, and it applies.
    await page.locator('#discard-staged-changes').click();
    await postThemedRender(page, true);
    await expect.poll(() => recoloured(page)).toBe(true);
});

test('an unmarked render (a source change) still replaces the staged move (#408)', async ({ page }) => {
    const staged = await stageMove(page);
    expect(await staged.count()).toBeGreaterThan(0);
    await postThemedRender(page, false);
    await expect.poll(() => recoloured(page)).toBe(true);
    expect(await staged.count(), 'a real render clears the draft, which is why the host defers theme renders').toBe(0);
});

test('a failed theme render keeps the staged move and the canvas (#408)', async ({ page }) => {
    const staged = await stageMove(page);
    const before = await staged.count();

    await page.evaluate(() => {
        window.postMessage({ type: 'error', message: 'Layout failed for the new theme.', refresh: true }, '*');
    });

    await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Theme change or refresh will apply after you save or discard.');
    expect(await staged.count(), 'the staged draft survives the failed theme render').toBe(before);
    await expect(page.locator('#content svg')).toBeVisible();
    const declined = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: { type?: string }[] })
        .__visualLayoutMessages!.filter(m => m.type === 'visualLayout.refreshDeclined').length);
    expect(declined, 'the host is asked to re-send it later').toBe(1);
});

test('an unmarked error (a source render failed) still replaces the canvas (#408)', async ({ page }) => {
    await stageMove(page);
    await page.evaluate(() => {
        window.postMessage({ type: 'error', message: 'Syntax error in the source.' }, '*');
    });
    await expect(page.getByText('Syntax error in the source.').first()).toBeVisible();
    await expect(page.locator('#content svg')).toHaveCount(0);
    // The draft went with the canvas: the host is told the preview is clean,
    // so later Refresh or theme changes are not held for a draft that is gone.
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
    const reports = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: { type?: string; dirty?: boolean }[] })
        .__visualLayoutMessages!.filter(m => m.type === 'dirtyStateChanged'));
    expect(reports[reports.length - 1]?.dirty, 'the last dirty report after the error is clean').toBe(false);
});
