/// <reference lib="dom" />

/**
 * #423: an arrow-key move of a multi-selection must not squash the group at
 * the left or top canvas edge. The keyboard path uses the pointer path's one
 * shared, clamped delta (sharedDragDelta), so the group stops as a unit, the
 * members keep their relative offsets, and the positions staged for Save are
 * the positions shown. Boundaries enclosing the moved nodes still re-wrap.
 *
 * Production preview client in the synthetic harnesses.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const PROTOTYPE = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');
const BOUNDARY = process.env.C4X_BOUNDARY_HARNESS ??
    path.join(ROOT, 'test/visual-layout/boundary-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'), PROTOTYPE], { cwd: ROOT });
    execFileSync(process.execPath, [path.join(ROOT, 'test/visual-layout/generate-boundary-harness.js'), BOUNDARY], { cwd: ROOT });
});

async function load(page: Page, harness: string): Promise<void> {
    await page.goto(url.pathToFileURL(harness).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
}

async function position(page: Page, id: string): Promise<{ x: number; y: number }> {
    const node = page.locator(`g.node[data-id="${id}"]`);
    return {
        x: Number(await node.getAttribute('data-current-x')),
        y: Number(await node.getAttribute('data-current-y')),
    };
}

async function selectBoth(page: Page, first: string, second: string): Promise<void> {
    await page.locator(`g.node[data-id="${first}"]`).click();
    await page.locator(`g.node[data-id="${second}"]`).click({ modifiers: ['Shift'] });
    await page.locator(`g.node[data-id="${first}"]`).focus();
}

/** Press a Shift+arrow until well past the edge, so the group is pushed into it. */
async function pushIntoEdge(page: Page, key: 'ArrowLeft' | 'ArrowUp', distance: number): Promise<void> {
    const presses = Math.ceil(distance / 25) + 3;
    for (let i = 0; i < presses; i++) {
        await page.keyboard.press(`Shift+${key}`);
    }
}

async function stagedSave(page: Page): Promise<Record<string, { x?: number; y?: number }>> {
    await page.locator('#save-staged-changes').click();
    const edits = await page.evaluate(() => {
        const messages = (window as unknown as { __visualLayoutMessages?: { type?: string; edits?: { id: string; x?: number; y?: number }[] }[] }).__visualLayoutMessages ?? [];
        const save = messages.filter(m => m.type === 'visualLayout.applySemanticEdits').pop();
        return save?.edits ?? [];
    });
    return Object.fromEntries(edits.map(e => [e.id, { x: e.x, y: e.y }]));
}

for (const [edge, key, axis] of [['left', 'ArrowLeft', 'x'], ['top', 'ArrowUp', 'y']] as const) {
    test(`[#423] a keyboard group move into the ${edge} edge keeps the selection's shape and stages what it shows`, async ({ page }) => {
        await load(page, PROTOTYPE);
        await selectBoth(page, 'customer', 'web');
        const startA = await position(page, 'customer');
        const startB = await position(page, 'web');
        const offset = { x: startB.x - startA.x, y: startB.y - startA.y };
        expect(startA[axis]).not.toBe(startB[axis]);

        await pushIntoEdge(page, key, Math.max(startA[axis], startB[axis]));

        const endA = await position(page, 'customer');
        const endB = await position(page, 'web');
        expect({ x: endB.x - endA.x, y: endB.y - endA.y }).toEqual(offset);
        expect(Math.min(endA[axis], endB[axis])).toBe(0);
        const other = axis === 'x' ? 'y' : 'x';
        expect(endA[other]).toBe(Math.round(startA[other]));
        expect(endB[other]).toBe(Math.round(startB[other]));

        const staged = await stagedSave(page);
        expect(staged.customer).toEqual(endA);
        expect(staged.web).toEqual(endB);
    });
}

test('[#423] a boundary enclosing a keyboard-moved group re-wraps it at the edge', async ({ page }) => {
    await load(page, BOUNDARY);
    const frame = () => page.evaluate(() => {
        const group = document.querySelector('g.boundary[data-id="backend-boundary"]');
        const rect = group?.querySelector('rect');
        const parsed = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(group?.getAttribute('transform') ?? '');
        return {
            x: Number(rect?.getAttribute('x')) + (parsed ? Number(parsed[1]) : 0),
            width: Number(rect?.getAttribute('width')),
        };
    });
    const before = await frame();
    await selectBoth(page, 'api', 'database');
    const startA = await position(page, 'api');
    const startB = await position(page, 'database');

    await pushIntoEdge(page, 'ArrowLeft', Math.max(startA.x, startB.x));

    const endA = await position(page, 'api');
    const endB = await position(page, 'database');
    expect(endB.x - endA.x).toBe(startB.x - startA.x);
    expect(Math.min(endA.x, endB.x)).toBe(0);
    const after = await frame();
    expect(after.x).toBeLessThan(before.x);
    expect(after.x).toBeLessThanOrEqual(Math.min(endA.x, endB.x));
});
