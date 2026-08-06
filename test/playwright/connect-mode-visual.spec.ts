/// <reference lib="dom" />

/**
 * Visual evidence capture for connect mode (#66).
 *
 * Not an assertion suite — it drives the real client script through each phase
 * of the connect gesture and writes a screenshot per phase, so the affordances
 * can actually be looked at rather than inferred from passing selectors.
 *
 * Output: .tmp/visual-evidence/*.png (gitignored). Run with
 *   node ./node_modules/@playwright/test/cli.js test test/playwright/connect-mode-visual.spec.ts
 */
import { Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_EDITOR_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-editor-harness.html');
const SHOTS = path.join(ROOT, '.tmp/visual-evidence');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
    fs.mkdirSync(SHOTS, { recursive: true });
});

async function loadHarness(page: Page): Promise<void> {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
}

async function shot(page: Page, name: string): Promise<void> {
    await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
}

test('capture connect-mode visual evidence', async ({ page }) => {
    await loadHarness(page);

    // 1 — preview mode, before anything is armed
    await shot(page, '01-preview-mode');

    // 2 — edit mode: sidebar open, Connect enabled
    await page.locator('#toggle-layout').click();
    await shot(page, '02-edit-mode-connect-enabled');

    // 3 — connect armed: every node eligible, prompt showing
    await page.locator('#connect-mode').click();
    await shot(page, '03-connect-armed-awaiting-source');

    // 4 — source chosen: source highlighted, targets narrowed
    await page.locator('g.node[data-id="web"]').click();
    await shot(page, '04-source-chosen-awaiting-target');

    // 5 — dialog open with both endpoints named
    await page.locator('g.node[data-id="api"]').click();
    await shot(page, '05-dialog-open');

    // 6 — validation refusing a pipe character
    await page.locator('#connect-label').fill('a|b');
    await shot(page, '06-dialog-validation-error');

    // 7 — dialog filled and valid
    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-technology').fill('HTTPS');
    await page.locator('#connect-reltype').selectOption('sync');
    await shot(page, '07-dialog-valid');

    // 8 — staged in the changes list
    await page.locator('#connect-confirm').click();
    await shot(page, '08-staged-change');
});
