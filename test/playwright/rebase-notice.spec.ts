/// <reference lib="dom" />

/**
 * #293 — with a real staged edit in the real client: an accepted Rebase keeps
 * the draft and posts no render request, and says plainly that it cannot be
 * saved; a refused Save keeps the draft and says why (#439).
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');

const REBASE_NOTICE = 'The source changed while you were editing. These staged edits cannot be saved. Close and reopen this editor and make them again.';
const SAVE_REFUSAL = 'The preview is out of date with the source, so these staged edits cannot be saved.';

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function loadHarness(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5_000 });
}

async function stageMove(page: Page): Promise<void> {
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="customer"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
}

async function readyCount(page: Page): Promise<number> {
    return page.evaluate(() => {
        const w = window as Window & { __visualLayoutMessages?: Array<{ type: string }> };
        return (w.__visualLayoutMessages ?? []).filter(m => m.type === 'ready').length;
    });
}

test('[#293] accepted Rebase keeps the staged draft, posts no refresh and says it cannot be saved', async ({ page }) => {
    await loadHarness(page);
    await stageMove(page);
    const readyBefore = await readyCount(page);

    await page.evaluate((reason) => {
        window.postMessage({
            type: 'visualLayout.conflictActionAcknowledged',
            protocolVersion: 1,
            action: 'rebaseAccepted',
            reason,
        }, '*');
    }, REBASE_NOTICE);

    await expect(page.locator('#layout-status')).toHaveText(REBASE_NOTICE);
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
    expect(await readyCount(page)).toBe(readyBefore);
});

test('[#293] accepted Rebase without a notice keeps the original text', async ({ page }) => {
    await loadHarness(page);
    await page.evaluate(() => {
        window.postMessage({ type: 'visualLayout.conflictActionAcknowledged', protocolVersion: 1, action: 'rebaseAccepted' }, '*');
    });
    await expect(page.locator('#layout-status')).toContainText('Your draft has been updated');
});

test('[#293] a refused Save keeps the staged draft, explains why and asks for no refresh (#439)', async ({ page }) => {
    await loadHarness(page);
    await stageMove(page);
    const readyBefore = await readyCount(page);

    await page.evaluate((reason) => {
        window.postMessage({
            type: 'visualLayout.rejected',
            protocolVersion: 1,
            code: 'layout_unavailable',
            reason,
        }, '*');
    }, SAVE_REFUSAL);

    await expect(page.locator('#layout-status')).toHaveAttribute('title', SAVE_REFUSAL + ' Your edits are kept. Discard to reload from source.');
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
    expect(await readyCount(page)).toBe(readyBefore);
});
