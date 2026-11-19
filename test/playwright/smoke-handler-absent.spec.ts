/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

// The test-only smoke handlers must not exist in a user's webview (#368): any
// script able to post to the page could otherwise discard staged edits.
const root = path.resolve(__dirname, '../..');
let directory: string;
let normal: string;
let smoke: string;

test.beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-smoke-absent-'));
    normal = path.join(directory, 'normal.html');
    smoke = path.join(directory, 'smoke.html');
    const generator = path.join(root, 'test/visual-layout/generate-boundary-harness.js');
    execFileSync(process.execPath, [generator, normal], { cwd: root });
    execFileSync(process.execPath, [generator, smoke], { cwd: root, env: { ...process.env, C4X_HARNESS_SMOKE_SESSION: 'real-session' } });
});

test.afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

async function stageThenProbe(page: import('@playwright/test').Page, file: string, session: string) {
    await page.goto(pathToFileURL(file).href);
    await expect(page.locator('#content svg')).toBeVisible();
    return page.evaluate(async (sessionValue) => {
        const host = window as Window & { __visualLayoutMessages?: Array<Record<string, unknown>> };
        const send = async (action: string) => {
            window.postMessage({ type: 'smoke.act', session: sessionValue, token: 'probe', action, id: 'worker' }, '*');
            await new Promise(resolve => setTimeout(resolve, 400));
        };
        await send('stage');
        const afterStage = (host.__visualLayoutMessages ?? []).filter(message => message.type === 'smoke.acted').length;
        return { replies: afterStage, discardButton: !!document.getElementById('discard-staged-changes') };
    }, session);
}

test('a normal-mode client ignores smoke.act and sends no reply', async ({ page }) => {
    const result = await stageThenProbe(page, normal, 'real-session');
    expect(result.replies).toBe(0);
});

test('a staged edit in a normal-mode client survives smoke.act discard', async ({ page }) => {
    await page.goto(pathToFileURL(normal).href);
    await expect(page.locator('#content svg')).toBeVisible();
    const node = page.locator('g.node').first();
    await node.focus();
    // Stage through the real UI: the Edit control, then an arrow key on the node.
    await page.locator('#toggle-layout').click();
    await node.press('Shift+ArrowRight');
    const staged = await page.locator('#staged-changes-list li:not(.empty-changes-text)').count();
    expect(staged, 'the arrow key must stage an edit for this test to mean anything').toBeGreaterThan(0);
    await page.evaluate(() => window.postMessage({ type: 'smoke.act', session: 'real-session', token: 'x', action: 'discard', id: '' }, '*'));
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 150)));
    expect(await page.locator('#staged-changes-list li:not(.empty-changes-text)').count()).toBe(staged);
});

test('the smoke-mode client answers only the right session (control)', async ({ page }) => {
    const wrong = await stageThenProbe(page, smoke, 'wrong-session');
    expect(wrong.replies).toBe(0);
    const right = await stageThenProbe(page, smoke, 'real-session');
    expect(right.replies).toBe(1);
});
