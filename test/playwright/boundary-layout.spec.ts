/// <reference lib="dom" />

/**
 * Issue #137 boundary frame reposition + resize — browser acceptance.
 *
 * The harness injects the production preview client with a single boundary
 * containing two child nodes. It proves pointer-driven boundary moves produce
 * the correct semantic writeback message; it does not exercise the extension
 * host or actual WorkspaceEdit application.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

interface PostedEdit {
    id: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
    boundaryId?: string;
}

interface PostedMessage {
    type?: string;
    protocolVersion?: number;
    revision?: string;
    edits?: PostedEdit[];
}

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_BOUNDARY_HARNESS ??
    path.join(ROOT, 'test/visual-layout/boundary-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-boundary-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function loadHarness(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5000,
    });
}

async function boundaryCoordinate(page: Page, id: string, axis: 'x' | 'y'): Promise<number> {
    const value = await page.locator(`g.boundary[data-id="${id}"]`)
        .getAttribute(`data-current-${axis}`);
    return Number(value);
}

function getMessages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutMessages?: PostedMessage[] };
        return testWindow.__visualLayoutMessages ?? [];
    });
}

test('boundary is focusable and selectable in edit mode', async ({ page }) => {
    await loadHarness(page);
    const boundary = page.locator('g.boundary[data-id="backend-boundary"]');

    await expect(boundary).toHaveAttribute('role', 'option');
    await expect(boundary).toHaveAttribute('tabindex', '-1');

    await page.locator('#toggle-layout').click();
    await expect(boundary).toHaveAttribute('tabindex', '0');

    await boundary.focus();
    await page.keyboard.press('Enter');
    await expect(boundary).toHaveClass(/visual-layout-selected/);
    await expect(boundary).toHaveAttribute('aria-selected', 'true');
});

test('pointer drag on a boundary moves the frame and stages a boundary edit', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    const boundary = page.locator('g.boundary[data-id="backend-boundary"]');
    const initialX = await boundaryCoordinate(page, 'backend-boundary', 'x');
    const box = await boundary.boundingBox();
    if (!box) {
        throw new Error('Could not get the boundary bounding box.');
    }

    // Click on the boundary label area, well inside the frame but clear of
    // the child nodes that are rendered on top.
    const startX = box.x + 20;
    const startY = box.y + 15;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 60, startY + 40, { steps: 5 });
    await page.mouse.up();

    const movedX = await boundaryCoordinate(page, 'backend-boundary', 'x');
    expect(movedX).toBeGreaterThan(initialX);
    await expect(boundary).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');

    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(saveMsg).toMatchObject({
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: 1,
        revision: 'boundary-1',
    });
    expect(Array.isArray(saveMsg?.edits)).toBe(true);

    const boundaryEdit = saveMsg?.edits?.find(edit => edit.boundaryId === 'backend-boundary');
    expect(boundaryEdit).toBeDefined();
    expect(boundaryEdit).toMatchObject({
        id: 'backend-boundary',
        boundaryId: 'backend-boundary',
    });
    expect(typeof boundaryEdit?.x).toBe('number');
    expect(typeof boundaryEdit?.y).toBe('number');
});

test('Shift+Arrow resizes a selected boundary and stages a resize edit', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    const boundary = page.locator('g.boundary[data-id="backend-boundary"]');
    await boundary.focus();
    await page.keyboard.press('Enter');

    const initialWidth = Number(await boundary.getAttribute('data-current-width'));
    await page.keyboard.press('Shift+ArrowRight');
    const newWidth = Number(await boundary.getAttribute('data-current-width'));
    expect(newWidth).toBeGreaterThan(initialWidth);

    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    const boundaryEdit = saveMsg?.edits?.find(edit => edit.boundaryId === 'backend-boundary');
    expect(boundaryEdit).toBeDefined();
    expect(typeof boundaryEdit?.w).toBe('number');
    expect(typeof boundaryEdit?.h).toBe('number');
});
