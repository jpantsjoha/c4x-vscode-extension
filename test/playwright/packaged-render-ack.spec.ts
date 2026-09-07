/// <reference lib="dom" />
import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(__dirname, '../..');
let directory: string;
let healthy: string;
let broken: string;

test.beforeAll(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-render-ack-'));
    healthy = path.join(directory, 'healthy.html');
    broken = path.join(directory, 'broken.html');
    execFileSync(process.execPath, [path.join(root, 'test/visual-layout/generate-boundary-harness.js'), healthy], { cwd: root });
    const html = fs.readFileSync(healthy, 'utf8');
    const renderCall = 'showSvg(message.payload.svg, message.payload.metrics, message.payload.visualLayout, message.payload.settings, message.payload.presentElementTypes, message.payload.legendSwatchColors);';
    expect(html).toContain(renderCall);
    fs.writeFileSync(broken, html.replace(renderCall, 'throw new Error("Deliberately broken render path");'));
});

test.afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));

for (const fault of [false, true]) {
    test(`render acknowledgement requires a working client (${fault ? 'broken' : 'healthy'})`, async ({ page }) => {
        await page.goto(pathToFileURL(fault ? broken : healthy).href);
        if (!fault) await expect(page.locator('#content svg')).toBeVisible();
        await page.evaluate(() => {
            const host = window as Window & { __visualLayoutRenderPayload?: unknown };
            // Background Electron windows may suspend animation frames. DOM
            // layout evidence must not depend on receiving a paint callback.
            window.requestAnimationFrame = () => 0;
            window.postMessage({ type: 'render', payload: host.__visualLayoutRenderPayload, smokeRequest: 'fresh-probe' }, '*');
        });
        if (fault) {
            await expect(page.locator('#content svg')).toHaveCount(0);
            await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0)));
        } else {
            await page.waitForFunction(() => {
                const host = window as Window & { __visualLayoutMessages?: Array<{ type: string }> };
                return host.__visualLayoutMessages?.some(message => message.type === 'smoke.rendered');
            }, undefined, { timeout: 2000, polling: 25 });
        }
        const acknowledgements = await page.evaluate(() => {
            const host = window as Window & { __visualLayoutMessages?: Array<Record<string, unknown>> };
            return host.__visualLayoutMessages?.filter(message => message.type === 'smoke.rendered') ?? [];
        });
        if (fault) {
            expect(acknowledgements).toEqual([]);
        } else {
            expect(acknowledgements).toHaveLength(1);
            expect(acknowledgements[0]).toMatchObject({ token: 'fresh-probe', nodeCount: 4 });
            expect(acknowledgements[0].text).toContain('Worker');
        }
    });
}
