/// <reference lib="dom" />

/**
 * #439: saving the text editor, or editing a Markdown file outside the edited
 * fence, must not discard a staged move.
 *
 * Seam: the boundary harness runs the production client with a stub host.
 * This spec loads the production decideSourceEvent and NonSourceRenderGate
 * (transpiled from src/webview/nonSourceRenderGate.ts) into the page and wires
 * them the way PreviewPanel.handleSourceEvent and scheduleRender do: the dirty
 * flag comes from the client's own `dirtyStateChanged` messages, the save
 * event asks decideSourceEvent, the automatic render it queues is decided by
 * the gate when its timer fires (on the state at that moment), and a clean
 * report repays the debt. The PreviewPanel wiring
 * itself is proven in the unit tier (save-keeps-draft.test.ts) and the
 * extension host (test/suite/save-keeps-draft.test.ts).
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

async function loadHarnessWithHost(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    await page.addScriptTag({
        content: `(function (exports) {\n${GATE_JS}\nwindow.__C4xGateModule = exports;\n})({});`,
    });
    await page.evaluate(() => {
        type Message = { type?: string; dirty?: boolean };
        type Cause = 'source' | 'auto' | 'retry' | 'theme';
        const w = window as unknown as {
            __C4xGateModule: {
                NonSourceRenderGate: new () => {
                    scheduled(cause: Cause): void;
                    fire(dirty: boolean, conflict: boolean, anchor?: () => string): { decision: 'post' | 'post-marked' | 'hold' | 'conflict'; cause: Cause };
                    held(cause: Cause): void;
                    dirtyChanged(dirty: boolean): Cause | undefined;
                    rendered(): void;
                    owed: string;
                };
                decideSourceEvent(state: { dirty: boolean; conflict: boolean; anchor: string }): string;
            };
            __visualLayoutMessages: Message[];
            __visualLayoutRenderPayload: { svg: string };
            __host: Record<string, unknown>;
        };
        const gate = new w.__C4xGateModule.NonSourceRenderGate();
        const hostDirty = () => {
            const reports = w.__visualLayoutMessages.filter(m => m.type === 'dirtyStateChanged');
            return reports.length > 0 && reports[reports.length - 1].dirty === true;
        };
        const host = {
            renders: 0,
            conflict: false,
            /** What the anchor says about the diagram source when asked. */
            anchor: 'unchanged' as 'unchanged' | 'changed',
            conflictBanner() {
                host.conflict = true;
                gate.held('source');
                window.postMessage({ type: 'visualLayout.externalChangeConflict', protocolVersion: 1, reason: 'Source changed elsewhere. Your draft is preserved.' }, '*');
            },
            deliverRender(marked: boolean) {
                gate.rendered();
                host.renders++;
                window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload, ...(marked ? { refresh: true } : {}) }, '*');
            },
            /** scheduleRender(delay, cause): queue only. */
            queue(cause: Cause) {
                gate.scheduled(cause);
            },
            /** The debounce timer fires, decided on the state now. */
            fire() {
                const fired = gate.fire(hostDirty(), host.conflict, () => host.anchor);
                if (fired.decision === 'conflict') {
                    host.conflictBanner();
                } else if (fired.decision !== 'hold') {
                    host.deliverRender(fired.decision === 'post-marked');
                }
                return fired.decision;
            },
            schedule(cause: Cause) {
                host.queue(cause);
                return host.fire();
            },
            /**
             * PreviewPanel.handleSourceEvent: a text-editor save, or a text
             * change. `anchor` is what the save anchor says about the diagram
             * source: 'unchanged' for a save or an edit outside the fence.
             * With `queueOnly`, the timer has not fired yet.
             */
            sourceEvent(anchor: 'unchanged' | 'changed', queueOnly = false) {
                host.anchor = anchor;
                const decision = w.__C4xGateModule.decideSourceEvent({ dirty: hostDirty(), conflict: host.conflict, anchor });
                if (decision === 'schedule-auto') {
                    if (queueOnly) {
                        host.queue('auto');
                    } else {
                        host.schedule('auto');
                    }
                } else if (decision === 'enter-conflict') {
                    host.conflictBanner();
                } else {
                    gate.held('source');
                }
                return decision;
            },
            /** A dirtyStateChanged message reached PreviewPanel. */
            syncDirty() {
                if (!hostDirty()) {
                    host.conflict = false;
                }
                const owed = gate.dirtyChanged(hostDirty());
                if (owed) {
                    host.schedule(owed);
                }
            },
            owed: () => gate.owed,
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

async function stageOneMove(page: Page): Promise<string> {
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="worker"]').focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');
    return (await page.locator('g.node[data-id="worker"]').getAttribute('data-current-x')) ?? '';
}

for (const [name, events] of [
    ['saving the text editor', 1],
    ['an edit outside the fence, then a save', 2],
] as const) {
    test(`[#439] ${name} while a move is staged keeps the move staged`, async ({ page }) => {
        await loadHarnessWithHost(page);
        const workerX = await stageOneMove(page);

        for (let i = 0; i < events; i++) {
            expect(await host<string>(page, 'sourceEvent', 'unchanged')).toBe('schedule-auto');
        }
        // Let the client handle anything the host sent before checking the draft.
        await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));

        expect(await host<number>(page, 'renders')).toBe(0);
        await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
        await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');
        await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', workerX);
        expect(await host<string>(page, 'owed')).toBe('source');
    });
}

for (const exit of ['save', 'discard'] as const) {
    test(`[#439] the held render arrives once after ${exit}`, async ({ page }) => {
        await loadHarnessWithHost(page);
        await stageOneMove(page);
        await host(page, 'sourceEvent', 'unchanged');
        expect(await host<number>(page, 'renders')).toBe(0);

        if (exit === 'save') {
            await page.locator('#save-staged-changes').click();
            await expect(page.locator('#layout-status')).toHaveAttribute('title', 'Changes successfully saved to document.');
        } else {
            await page.locator('#discard-staged-changes').click();
        }
        await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
        await host(page, 'syncDirty');
        expect(await host<number>(page, 'renders')).toBe(1);
        expect(await host<string>(page, 'owed')).toBe('none');
        await host(page, 'syncDirty');
        expect(await host<number>(page, 'renders')).toBe(1);
    });
}

test('[#439] a real change to the diagram source while a move is staged opens the conflict banner, not a render', async ({ page }) => {
    await loadHarnessWithHost(page);
    const workerX = await stageOneMove(page);
    expect(await host<string>(page, 'sourceEvent', 'changed')).toBe('enter-conflict');
    await expect(page.locator('#conflict-banner')).toBeVisible();
    expect(await host<number>(page, 'renders')).toBe(0);
    await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', workerX);
});

test('[#439] saving the text editor on a clean preview renders as before', async ({ page }) => {
    await loadHarnessWithHost(page);
    expect(await host<string>(page, 'sourceEvent', 'unchanged')).toBe('schedule-auto');
    expect(await host<number>(page, 'renders')).toBe(1);
});

/** Wait until the client has handled whatever the host sent. */
async function settleClient(page: Page): Promise<void> {
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
}

test('[#439] a save queued while clean, then a move staged before its timer fires, then a second save: the move stays staged', async ({ page }) => {
    await loadHarnessWithHost(page);
    expect(await host<string>(page, 'sourceEvent', 'unchanged', true)).toBe('schedule-auto');
    const workerX = await stageOneMove(page);
    expect(await host<string>(page, 'sourceEvent', 'unchanged', true)).toBe('schedule-auto');
    expect(await host<string>(page, 'fire')).toBe('hold');
    await settleClient(page);
    expect(await host<number>(page, 'renders')).toBe(0);
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
    await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', workerX);
    expect(await host<string>(page, 'owed')).toBe('source');
});

test('[#439] a diagram change queued while clean, then a move staged before its timer fires: the conflict banner, not a render', async ({ page }) => {
    await loadHarnessWithHost(page);
    expect(await host<string>(page, 'sourceEvent', 'changed', true)).toBe('schedule-auto');
    const workerX = await stageOneMove(page);
    expect(await host<string>(page, 'fire')).toBe('conflict');
    await expect(page.locator('#conflict-banner')).toBeVisible();
    expect(await host<number>(page, 'renders')).toBe(0);
    await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', workerX);
});

test('[#439] a declined refresh names the render the webview still shows', async ({ page }) => {
    await loadHarnessWithHost(page);
    await page.evaluate(() => {
        const w = window as unknown as { __visualLayoutRenderPayload: unknown };
        window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload, refresh: true, renderToken: 7 }, '*');
    });
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 50)));
    await stageOneMove(page);
    await page.evaluate(() => {
        const w = window as unknown as { __visualLayoutRenderPayload: unknown };
        window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload, refresh: true, renderToken: 8 }, '*');
    });
    await expect.poll(() => page.evaluate(() => {
        const messages = (window as unknown as { __visualLayoutMessages: { type?: string; shownRenderToken?: number }[] }).__visualLayoutMessages;
        return messages.filter(m => m.type === 'visualLayout.refreshDeclined').map(m => m.shownRenderToken);
    })).toEqual([7]);
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
});
