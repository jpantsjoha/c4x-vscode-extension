/// <reference lib="dom" />

/**
 * #408: a theme change must not discard unsaved staged edits.
 *
 * Every render clears the client's staged draft, so the host holds back a
 * theme-triggered render while the webview reports dirty and sends
 * `visualLayout.refreshDeferred` instead; the render follows once the draft is
 * saved or discarded.
 *
 * Seam: the boundary harness runs the production client with a stub host. This
 * spec loads the production NonSourceRenderGate (transpiled from
 * src/webview/nonSourceRenderGate.ts) into the page and wires it the way
 * PreviewPanel does: the dirty flag comes from the client's own
 * `dirtyStateChanged` messages, a theme change goes through `request()`, and a
 * clean report goes through `dirtyChanged()`. What reaches the client is
 * counted at the stub. The PreviewPanel wiring itself is proven in the unit
 * tier (theme-rerender-dirty-gate.test.ts) and the extension host
 * (test/suite/theme-deferred-while-dirty.test.ts).
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_BOUNDARY_HARNESS ??
    path.join(ROOT, 'test/visual-layout/boundary-harness.html');

const GATE_JS = ts.transpileModule(
    readFileSync(path.join(ROOT, 'src/webview/nonSourceRenderGate.ts'), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
).outputText;

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-boundary-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

/** Load the harness, then install the gate-backed host model. */
async function loadHarnessWithHost(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    await page.addScriptTag({
        content: `(function (exports) {\n${GATE_JS}\nwindow.__C4xGate = exports.NonSourceRenderGate;\n})({});`,
    });
    await page.evaluate(() => {
        type Message = { type?: string; dirty?: boolean };
        const w = window as unknown as {
            __C4xGate: new () => {
                request(dirty: boolean): 'schedule' | 'defer';
                dirtyChanged(dirty: boolean): boolean;
                rendered(): void;
                isPending: boolean;
            };
            __visualLayoutMessages: Message[];
            __visualLayoutRenderPayload: { svg: string };
            __host: Record<string, unknown>;
        };
        const gate = new w.__C4xGate();
        const hostDirty = () => {
            const reports = w.__visualLayoutMessages.filter(m => m.type === 'dirtyStateChanged');
            return reports.length > 0 && reports[reports.length - 1].dirty === true;
        };
        const host = {
            gate,
            themedRenders: 0,
            deferredNotices: 0,
            theme: 'light',
            deliverRender() {
                gate.rendered();
                const base = w.__visualLayoutRenderPayload;
                const payload = { ...base, svg: base.svg.replace('<svg ', `<svg data-test-theme="${host.theme}" `) };
                host.themedRenders++;
                window.postMessage({ type: 'render', payload }, '*');
            },
            /** What PreviewPanel does on a colour-theme or c4x.theme change. */
            changeTheme(theme: string) {
                host.theme = theme;
                if (gate.request(hostDirty()) === 'schedule') {
                    host.deliverRender();
                } else {
                    host.deferredNotices++;
                    window.postMessage({ type: 'visualLayout.refreshDeferred', protocolVersion: 1 }, '*');
                }
            },
            /** What PreviewPanel does when a dirtyStateChanged message arrives. */
            syncDirty() {
                if (gate.dirtyChanged(hostDirty())) {
                    host.deliverRender();
                }
            },
        };
        w.__host = host;
    });
}

async function host<T>(page: Page, fn: string, ...args: unknown[]): Promise<T> {
    return page.evaluate(([name, rest]) => {
        const h = (window as unknown as { __host: Record<string, unknown> }).__host;
        const value = h[name as string];
        return (typeof value === 'function' ? (value as (...a: unknown[]) => unknown)(...(rest as unknown[])) : value) as T;
    }, [fn, args] as const);
}

async function stageOneMove(page: Page): Promise<void> {
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="worker"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');
}

test('a theme change while a move is staged sends no render and keeps the staged move', async ({ page }) => {
    await loadHarnessWithHost(page);
    await stageOneMove(page);
    const workerX = await page.locator('g.node[data-id="worker"]').getAttribute('data-current-x');

    await host(page, 'changeTheme', 'dark');

    // Wait until the client has handled whatever the host sent, then check
    // that the draft survived it.
    await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Theme change or refresh will apply after you save or discard.');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
    await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', workerX ?? '');
    expect(await host<number>(page, 'themedRenders')).toBe(0);
    expect(await host<number>(page, 'deferredNotices')).toBe(1);
    await expect(page.locator('#content svg').first()).not.toHaveAttribute('data-test-theme', 'dark');
});

for (const exit of ['save', 'discard'] as const) {
    test(`the deferred theme render arrives with the new theme after ${exit}`, async ({ page }) => {
        await loadHarnessWithHost(page);
        await stageOneMove(page);
        await host(page, 'changeTheme', 'dark');
        expect(await host<number>(page, 'themedRenders')).toBe(0);

        if (exit === 'save') {
            await page.locator('#save-staged-changes').click();
            await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Changes successfully saved to document.');
        } else {
            await page.locator('#discard-staged-changes').click();
        }
        await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
        await host(page, 'syncDirty');

        expect(await host<number>(page, 'themedRenders')).toBe(1);
        await expect(page.locator('#content svg').first()).toHaveAttribute('data-test-theme', 'dark');
        expect(await page.evaluate(() => (window as unknown as { __host: { gate: { isPending: boolean } } }).__host.gate.isPending)).toBe(false);

        await host(page, 'syncDirty');
        expect(await host<number>(page, 'themedRenders')).toBe(1);
    });
}

test('a theme change on a clean preview renders at once', async ({ page }) => {
    await loadHarnessWithHost(page);
    await host(page, 'changeTheme', 'dark');
    expect(await host<number>(page, 'themedRenders')).toBe(1);
    await expect(page.locator('#content svg').first()).toHaveAttribute('data-test-theme', 'dark');
});
