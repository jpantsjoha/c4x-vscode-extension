/// <reference lib="dom" />

/**
 * Issue 21 SVG interaction spike — automated Chromium assertions.
 *
 * The harness injects the production preview client into a synthetic SVG and a
 * small VS Code API stub. It proves browser interaction only; it does not claim
 * VS Code extension-host integration or persistence.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

interface PostedMessage {
    type?: string;
    protocolVersion?: number;
    revision?: string;
    id?: string;
    x?: number;
    y?: number;
    input?: string;
    edits?: Array<{ id: string; x?: number; y?: number; description?: string | null }>;
}

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function loadHarness(page: Page): Promise<void> {
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5000,
    });
}

async function nodeCoordinate(page: Page, id: string, axis: 'x' | 'y'): Promise<number> {
    const value = await page.locator(`g.node[data-id="${id}"]`)
        .getAttribute(`data-current-${axis}`);
    return Number(value);
}

function getMessages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutMessages?: PostedMessage[] };
        return testWindow.__visualLayoutMessages ?? [];
    });
}

function rejectNextMove(page: Page): Promise<void> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutRejectNextMove?: boolean };
        testWindow.__visualLayoutRejectNextMove = true;
    });
}

function dispatchHostMessage(page: Page, message: unknown): Promise<void> {
    return page.evaluate((data: unknown) => {
        window.dispatchEvent(new MessageEvent('message', { data }));
    }, message);
}

test('edit toggle has an accessible name, state and controlled region', async ({ page }) => {
    await loadHarness(page);
    const toggle = page.locator('#toggle-layout');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveText('Edit C4 Diagram');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveAttribute('aria-controls', 'content');
});

test('edit toggle enters and exits edit mode deterministically', async ({ page }) => {
    await loadHarness(page);
    const toggle = page.locator('#toggle-layout');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(toggle).toHaveText('Exit edit mode');
    await expect(page.locator('#content')).toHaveClass(/visual-layout-editing/);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await expect(toggle).toHaveText('Edit C4 Diagram');
    await expect(page.locator('#content')).not.toHaveClass(/visual-layout-editing/);
});

// NOTE: aria-multiselectable updated to "true" in #88 (multi-select group move).
test('node collection exposes multi-selection semantics and accessible node names', async ({ page }) => {
    await loadHarness(page);
    const nodes = page.locator('g.nodes');
    const customer = page.locator('g.node[data-id="customer"]');

    await expect(nodes).toHaveAttribute('role', 'listbox');
    await expect(nodes).toHaveAttribute('aria-multiselectable', 'true');
    await expect(customer).toHaveAttribute('role', 'option');
    await expect(customer).toHaveAttribute('aria-describedby', 'layout-status');
    await expect(customer).toHaveAttribute('aria-label', /Customer, Person/);
});

test('nodes join the tab order only while edit mode is active', async ({ page }) => {
    await loadHarness(page);
    const customer = page.locator('g.node[data-id="customer"]');

    await expect(customer).toHaveAttribute('tabindex', '-1');
    await page.locator('#toggle-layout').click();
    await expect(customer).toHaveAttribute('tabindex', '0');
    await page.locator('#toggle-layout').click();
    await expect(customer).toHaveAttribute('tabindex', '-1');
});

test('Enter selects one focused node and updates aria-selected', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.focus();
    await page.keyboard.press('Enter');
    await expect(customer).toHaveClass(/visual-layout-selected/);
    await expect(customer).toHaveAttribute('aria-selected', 'true');

    await payments.focus();
    await page.keyboard.press('Enter');
    await expect(payments).toHaveAttribute('aria-selected', 'true');
    await expect(customer).toHaveAttribute('aria-selected', 'false');
});

test('Escape clears the current selection', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');

    await customer.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(customer).not.toHaveClass(/visual-layout-selected/);
    await expect(customer).toHaveAttribute('aria-selected', 'false');
});

test('ArrowRight moves a focused node by 10 SVG units', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    await customer.focus();

    const initialX = await nodeCoordinate(page, 'customer', 'x');
    await page.keyboard.press('ArrowRight');
    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX + 10);
});

test('ArrowDown moves a focused node by 10 SVG units', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const payments = page.locator('g.node[data-id="payments"]');
    await payments.focus();

    const initialY = await nodeCoordinate(page, 'payments', 'y');
    await page.keyboard.press('ArrowDown');
    expect(await nodeCoordinate(page, 'payments', 'y')).toBe(initialY + 10);
});

test('Shift+Arrow uses the documented 25-unit coarse step', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    await customer.focus();

    const initialX = await nodeCoordinate(page, 'customer', 'x');
    await page.keyboard.press('Shift+ArrowRight');
    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX + 25);
});

test('keyboard move stages a move and click save applies it', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    await customer.focus();
    await page.keyboard.press('ArrowRight');

    await expect(page.locator('#layout-status')).toHaveText(/Customer moved to/);
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');

    const changeListItem = page.locator('#staged-changes-list li');
    await expect(changeListItem).toContainText('Customer');
    await expect(changeListItem).toContainText('Moved to');

    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message =>
        message.type === 'visualLayout.applySemanticEdits'
    );
    expect(saveMsg).toMatchObject({
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: 1,
        revision: 'prototype-1',
    });
    expect(Array.isArray(saveMsg?.edits)).toBe(true);
    expect(saveMsg?.edits?.[0]).toMatchObject({
        id: 'customer',
    });
    expect(typeof saveMsg?.edits?.[0].x).toBe('number');
    expect(typeof saveMsg?.edits?.[0].y).toBe('number');
});

test('pointer drag selects, focuses, stages a move and updates properties inspector', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    const initialX = await nodeCoordinate(page, 'customer', 'x');
    const box = await customer.boundingBox();
    if (!box) {
        throw new Error('Could not get the customer node bounding box.');
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 80, centerY, { steps: 5 });
    await page.mouse.up();

    expect(await nodeCoordinate(page, 'customer', 'x')).toBeGreaterThan(initialX);
    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(customer).toBeFocused();

    await expect(page.locator('#inspector-id')).toHaveValue('customer');
    await expect(page.locator('#inspector-label')).toHaveValue('Customer');
    await expect(page.locator('#inspector-type')).toHaveValue('Person');

    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message =>
        message.type === 'visualLayout.applySemanticEdits'
    );
    expect(saveMsg).toBeDefined();
});

test('pointercancel restores the node to its drag-start position', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    const initialX = await nodeCoordinate(page, 'customer', 'x');
    const box = await customer.boundingBox();
    if (!box) {
        throw new Error('Could not get the customer node bounding box.');
    }

    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 80, centerY, { steps: 3 });

    const pointerId = await customer.evaluate((element: SVGElement) => {
        for (let candidate = 1; candidate <= 10; candidate += 1) {
            if (element.hasPointerCapture(candidate)) {
                return candidate;
            }
        }
        return 1;
    });
    await customer.dispatchEvent('pointercancel', { pointerId, bubbles: true });

    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX);
});

test('a versioned host rejection discards the draft, refreshes and returns focus to the toggle', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    await customer.focus();
    const initialX = await nodeCoordinate(page, 'customer', 'x');

    await page.keyboard.press('ArrowRight');

    await rejectNextMove(page);
    await page.locator('#save-staged-changes').click();

    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#toggle-layout')).toBeFocused();
    await expect(page.locator('#layout-status')).toHaveText(
        /Draft discarded; refreshing from source|Preview refreshed|Preview mode/
    );
    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX);
});

test('a malformed rejection response is ignored and cannot exit edit mode', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    await dispatchHostMessage(page, {
        type: 'visualLayout.rejected',
        code: 'stale_revision',
        reason: 'Missing protocol version',
    });

    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#layout-status')).not.toHaveAttribute('data-kind', 'error');
});

test('an accepted response with the wrong protocol version is ignored', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const initialStatus = await page.locator('#layout-status').textContent();

    await dispatchHostMessage(page, {
        type: 'visualLayout.accepted',
        protocolVersion: 99,
        revision: 'prototype-1',
        id: 'customer',
        x: 110,
        y: 120,
        input: 'keyboard',
        persisted: false,
    });

    await expect(page.locator('#layout-status')).toHaveText(initialStatus ?? '');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'clean');
});

test('an accepted response claiming persistence is handled by the browser boundary', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    await dispatchHostMessage(page, {
        type: 'visualLayout.accepted',
        protocolVersion: 1,
        revision: 'prototype-1',
        id: 'customer',
        x: 110,
        y: 120,
        input: 'keyboard',
        persisted: true,
    });

    await expect(page.locator('#layout-status')).toHaveText('Customer moved to 110, 120 (1)');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'clean');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-kind', 'success');
});
