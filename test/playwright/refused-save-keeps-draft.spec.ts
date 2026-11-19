/// <reference lib="dom" />

/**
 * #439 (review round 4): a refused Save never discards the draft. For every
 * rejection code, including codes this client does not know, the client
 * leaves the saving state, keeps the staged edits and edit mode, shows the
 * host's reason with a hint, re-enables Save, and posts no `ready`. A second
 * Save posts again and can succeed once the cause is gone.
 *
 * Production preview client in the prototype harness; the stub host is told
 * to stay silent on Save and the test sends the host's answer itself.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');

const UNMATCHED_REASON = 'The preview could not confirm which version of the diagram your draft was made on. Your draft is preserved.';
const REBASE_NOTICE = 'The source changed while you were editing. These staged edits cannot be saved. Close and reopen this editor and make them again.';
const SAVE_REFUSAL = 'The preview is out of date with the source, so these staged edits cannot be saved.';

test.beforeAll(() => {
    execFileSync(process.execPath, [path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'), HARNESS], { cwd: ROOT });
});

async function loadAndStage(page: Page): Promise<string> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="customer"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    return (await page.locator('g.node[data-id="customer"]').getAttribute('data-current-x')) ?? '';
}

function count(page: Page, type: string): Promise<number> {
    return page.evaluate((t) => ((window as unknown as { __visualLayoutMessages: { type: string }[] }).__visualLayoutMessages)
        .filter(m => m.type === t).length, type);
}

/** Click Save with the stub host silent, then answer with a rejection. */
async function saveAndReject(page: Page, code: string, reason: string): Promise<void> {
    await page.evaluate(() => { (window as unknown as { __visualLayoutSilentNextSave: boolean }).__visualLayoutSilentNextSave = true; });
    await page.locator('#save-staged-changes').click();
    await page.evaluate(({ c, r }) => {
        window.postMessage({ type: 'visualLayout.rejected', protocolVersion: 1, code: c, reason: r }, '*');
    }, { c: code, r: reason });
}

async function expectDraftKept(page: Page, x: string, reason: string, hint: string): Promise<void> {
    await expect(page.locator('#layout-status')).toHaveAttribute('title', `${reason} ${hint}`);
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'rejected');
    await expect(page.locator('#layout-error')).toContainText(reason);
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('g.node[data-id="customer"]')).toHaveAttribute('data-current-x', x);
}

for (const code of ['malformed_message', 'layout_unavailable', 'stale_revision', 'missing_element', 'validation_failed', 'a_code_added_later']) {
    test(`[#439] a Save refused with ${code} keeps the draft, says why and can be retried`, async ({ page }) => {
        const x = await loadAndStage(page);
        const readyBefore = await count(page, 'ready');
        const reason = `Refused: ${code}.`;

        await saveAndReject(page, code, reason);
        await expectDraftKept(page, x, reason, 'Your edits are kept. Discard to reload from source.');
        await expect(page.locator('#save-staged-changes')).toBeEnabled();
        expect(await count(page, 'ready')).toBe(readyBefore);

        // The cause persists: refused again, still kept.
        await saveAndReject(page, code, reason);
        expect(await count(page, 'visualLayout.applySemanticEdits')).toBe(2);
        await expectDraftKept(page, x, reason, 'Your edits are kept. Discard to reload from source.');
        await expect(page.locator('#save-staged-changes')).toBeEnabled();

        // The cause is gone: the stub host accepts.
        await page.locator('#save-staged-changes').click();
        expect(await count(page, 'visualLayout.applySemanticEdits')).toBe(3);
        await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Changes successfully saved to document.');
        expect(await count(page, 'ready')).toBe(readyBefore);
    });
}

test('[#439] a rejection with no usable reason still ends the saving state', async ({ page }) => {
    const x = await loadAndStage(page);
    await page.evaluate(() => { (window as unknown as { __visualLayoutSilentNextSave: boolean }).__visualLayoutSilentNextSave = true; });
    await page.locator('#save-staged-changes').click();
    await page.evaluate(() => { window.postMessage({ type: 'visualLayout.rejected', protocolVersion: 1, code: 42 }, '*'); });
    await expectDraftKept(page, x, 'The staged changes could not be saved.', 'Your edits are kept. Discard to reload from source.');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
});

test('[#439] the review round-4 sequence: unmatched decline, conflict, Rebase, refused Save keeps the draft', async ({ page }) => {
    const x = await loadAndStage(page);
    const readyBefore = await count(page, 'ready');
    // What the host sends for a decline it cannot match, then for an accepted Rebase without a layout.
    await page.evaluate((reason) => {
        window.postMessage({ type: 'visualLayout.externalChangeConflict', protocolVersion: 1, reason }, '*');
    }, UNMATCHED_REASON);
    await expect(page.locator('#conflict-banner')).toBeVisible();
    await page.evaluate((reason) => {
        window.postMessage({ type: 'visualLayout.conflictActionAcknowledged', protocolVersion: 1, action: 'rebaseAccepted', reason }, '*');
    }, REBASE_NOTICE);
    await expect(page.locator('#save-staged-changes')).toBeEnabled();

    await saveAndReject(page, 'layout_unavailable', SAVE_REFUSAL);
    await expectDraftKept(page, x, SAVE_REFUSAL, 'Your edits are kept. Discard to reload from source.');
    expect(await count(page, 'ready')).toBe(readyBefore);

    // The way out is the user's: Discard reports the draft clean, and the
    // host answers that clean report with the render it owes (marked, as a
    // repaid debt is), which the now-clean client accepts.
    const sourceX = await page.evaluate(() => {
        const w = window as unknown as { __visualLayoutRenderPayload: { visualLayout: { nodes: { id: string; x: number }[] } } };
        return String(w.__visualLayoutRenderPayload.visualLayout.nodes.find(n => n.id === 'customer')!.x);
    });
    await page.locator('#discard-staged-changes').click();
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
    const reports = await page.evaluate(() => (window as unknown as { __visualLayoutMessages: { type: string; dirty?: boolean }[] }).__visualLayoutMessages
        .filter(m => m.type === 'dirtyStateChanged').map(m => m.dirty));
    expect(reports[reports.length - 1]).toBe(false);
    await page.evaluate(() => {
        const w = window as unknown as { __visualLayoutRenderPayload: unknown };
        window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload, refresh: true, renderToken: 99 }, '*');
    });
    await expect(page.locator('g.node[data-id="customer"]')).toHaveAttribute('data-current-x', sourceX);
    expect(x).not.toBe(sourceX);
    expect(await count(page, 'visualLayout.refreshDeclined')).toBe(0);
});

test('[#439] a marked render that fails validation is declined, not shown, while a move is staged', async ({ page }) => {
    const x = await loadAndStage(page);
    const svgBefore = await page.locator('#content svg').first().evaluate(el => el.outerHTML.length);
    await page.evaluate(() => {
        const w = window as unknown as { __visualLayoutRenderPayload: { visualLayout: { nodes: { label: string }[] } } };
        const payload = JSON.parse(JSON.stringify(w.__visualLayoutRenderPayload));
        payload.visualLayout.nodes[0].label = 'x'.repeat(4097);   // over the client's 4,096 limit
        window.postMessage({ type: 'render', payload, refresh: true, renderToken: 50 }, '*');
    });
    await expect.poll(() => count(page, 'visualLayout.refreshDeclined')).toBe(1);
    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('g.node[data-id="customer"]')).toHaveAttribute('data-current-x', x);
    expect(await page.locator('#content svg').first().evaluate(el => el.outerHTML.length)).toBe(svgBefore);
});

test('[#439] an unmarked invalid render still reports the validation failure', async ({ page }) => {
    await loadAndStage(page);
    await page.evaluate(() => {
        window.postMessage({ type: 'render', payload: { svg: 42 } }, '*');
    });
    await expect(page.locator('#error')).toContainText('rejected by webview validation');
    expect(await count(page, 'visualLayout.refreshDeclined')).toBe(0);
});

test('[#439] a refusal while the conflict banner shows points to the banner', async ({ page }) => {
    const x = await loadAndStage(page);
    await page.evaluate(() => { (window as unknown as { __visualLayoutSilentNextSave: boolean }).__visualLayoutSilentNextSave = true; });
    await page.locator('#save-staged-changes').click();
    await page.evaluate((reason) => {
        window.postMessage({ type: 'visualLayout.externalChangeConflict', protocolVersion: 1, reason }, '*');
    }, 'Source changed elsewhere. Your draft is preserved.');
    await page.evaluate((reason) => {
        window.postMessage({ type: 'visualLayout.rejected', protocolVersion: 1, code: 'stale_revision', reason }, '*');
    }, 'Document revision mismatch.');
    // While the banner shows, the list is hidden and Save disabled; the draft is still on the canvas.
    await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Document revision mismatch. Your edits are kept; use the banner above to reload or rebase.');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('g.node[data-id="customer"]')).toHaveAttribute('data-current-x', x);
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
    // Reload and discard from the banner is the way out.
    await expect(page.locator('#conflict-banner')).toBeVisible();
});
