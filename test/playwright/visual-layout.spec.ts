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

// ── Click versus drag (#251) ─────────────────────────────────────────────────

async function nodeCentre(page: Page, id: string): Promise<{ x: number; y: number }> {
    const box = await page.locator(`g.node[data-id="${id}"]`).boundingBox();
    if (!box) {
        throw new Error(`Could not get the ${id} node bounding box.`);
    }
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test('[#251] a plain click selects a node without staging a move', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const customer = page.locator('g.node[data-id="customer"]');
    const initialX = await nodeCoordinate(page, 'customer', 'x');
    const initialY = await nodeCoordinate(page, 'customer', 'y');

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.up();

    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(customer).toBeFocused();
    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX);
    expect(await nodeCoordinate(page, 'customer', 'y')).toBe(initialY);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
    await expect(page.locator('#layout-status')).not.toHaveText(/moved to/);
});

test('[#251] pointer jitter below the drag threshold neither moves nor stages', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const initialX = await nodeCoordinate(page, 'customer', 'x');
    const initialY = await nodeCoordinate(page, 'customer', 'y');

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 2, centre.y + 1, { steps: 2 });
    await page.mouse.up();

    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX);
    expect(await nodeCoordinate(page, 'customer', 'y')).toBe(initialY);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
});

test('[#251] a drag that returns to its start stages no move', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();
    const initialX = await nodeCoordinate(page, 'customer', 'x');

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 80, centre.y, { steps: 4 });
    await page.mouse.move(centre.x, centre.y, { steps: 4 });
    await page.mouse.up();

    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(initialX);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
});

/**
 * Re-render the harness with unrounded auto-layout positions, the shape ELK
 * produces (the UAT saw $y="609.0119565375295").
 */
async function renderWithPositions(page: Page, positions: Record<string, { x: number; y: number }>): Promise<void> {
    await page.evaluate((byId: Record<string, { x: number; y: number }>) => {
        const testWindow = window as Window & {
            __visualLayoutRenderPayload?: { visualLayout: { nodes: Array<{ id: string; x: number; y: number }> } };
        };
        const payload = JSON.parse(JSON.stringify(testWindow.__visualLayoutRenderPayload));
        for (const node of payload.visualLayout.nodes) {
            if (byId[node.id]) {
                node.x = byId[node.id].x;
                node.y = byId[node.id].y;
            }
        }
        window.postMessage({ type: 'render', payload }, '*');
    }, positions);
    for (const [id, pos] of Object.entries(positions)) {
        await expect(page.locator(`g.node[data-id="${id}"]`)).toHaveAttribute('data-current-x', String(pos.x));
        await expect(page.locator(`g.node[data-id="${id}"]`)).toHaveAttribute('data-current-y', String(pos.y));
    }
}

async function expectExactlyAt(page: Page, id: string, pos: { x: number; y: number }): Promise<void> {
    const node = page.locator(`g.node[data-id="${id}"]`);
    await expect(node).toHaveAttribute('data-current-x', String(pos.x));
    await expect(node).toHaveAttribute('data-current-y', String(pos.y));
    await expect(node).toHaveAttribute('transform', 'translate(0 0)');
}

const FRACTIONAL = {
    customer: { x: 100.37, y: 50.6119565375295 },
    payments: { x: 500.42, y: 49.71 },
};

test('[#251] a zero-delta drag restores an unrounded start position exactly', async ({ page }) => {
    await loadHarness(page);
    await renderWithPositions(page, { customer: FRACTIONAL.customer });
    await page.locator('#toggle-layout').click();

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 80, centre.y + 30, { steps: 4 });
    await page.mouse.move(centre.x, centre.y, { steps: 4 });
    await page.mouse.up();

    await expectExactlyAt(page, 'customer', FRACTIONAL.customer);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
});

test('[#251] a zero-delta group drag restores every member exactly', async ({ page }) => {
    await loadHarness(page);
    await renderWithPositions(page, FRACTIONAL);
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="customer"]').click();
    await page.locator('g.node[data-id="payments"]').click({ modifiers: ['Shift'] });

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 80, centre.y + 30, { steps: 4 });
    await page.mouse.move(centre.x, centre.y, { steps: 4 });
    await page.mouse.up();

    await expectExactlyAt(page, 'customer', FRACTIONAL.customer);
    await expectExactlyAt(page, 'payments', FRACTIONAL.payments);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
});

test('[#251] pointercancel restores an unrounded group start position exactly', async ({ page }) => {
    await loadHarness(page);
    await renderWithPositions(page, FRACTIONAL);
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="customer"]').click();
    await page.locator('g.node[data-id="payments"]').click({ modifiers: ['Shift'] });

    const customer = page.locator('g.node[data-id="customer"]');
    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 80, centre.y + 30, { steps: 4 });
    const pointerId = await customer.evaluate((element: SVGElement) => {
        for (let candidate = 1; candidate <= 10; candidate += 1) {
            if (element.hasPointerCapture(candidate)) {
                return candidate;
            }
        }
        return 1;
    });
    await customer.dispatchEvent('pointercancel', { pointerId, bubbles: true });

    await expectExactlyAt(page, 'customer', FRACTIONAL.customer);
    await expectExactlyAt(page, 'payments', FRACTIONAL.payments);
});

test('[#251] click-to-select then a label edit saves the label and no position', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    await page.locator('g.node[data-id="customer"]').click();
    await page.locator('#inspector-label').fill('Customer X');
    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(saveMsg?.edits).toHaveLength(1);
    const edit = saveMsg?.edits?.[0] as Record<string, unknown> | undefined;
    expect(edit).toMatchObject({ id: 'customer', label: 'Customer X' });
    expect(edit).not.toHaveProperty('x');
    expect(edit).not.toHaveProperty('y');
});

test('[#251] a real pointer drag stages whole-number coordinates', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 37.3, centre.y + 21.7, { steps: 5 });
    await page.mouse.up();

    await expect(page.locator('#staged-changes-list li')).toContainText('Moved to');
    await page.locator('#save-staged-changes').click();
    const messages = await getMessages(page);
    const saveMsg = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    const edit = saveMsg?.edits?.find(candidate => candidate.id === 'customer');
    expect(Number.isInteger(edit?.x)).toBe(true);
    expect(Number.isInteger(edit?.y)).toBe(true);
});

async function groupDrag(page: Page, grabId: string, dx: number, dy: number, ids: string[]): Promise<void> {
    await page.locator('#toggle-layout').click();
    await page.locator(`g.node[data-id="${ids[0]}"]`).click();
    for (const id of ids.slice(1)) {
        await page.locator(`g.node[data-id="${id}"]`).click({ modifiers: ['Shift'] });
    }
    const centre = await nodeCentre(page, grabId);
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + dx, centre.y + dy, { steps: 6 });
    await page.mouse.up();
}

test('[#254] a group drag into the canvas edge stops as a unit and keeps its shape', async ({ page }) => {
    await loadHarness(page);
    await renderWithPositions(page, { customer: { x: 20, y: 300 }, payments: { x: 300, y: 300 } });
    const scale = await page.evaluate(() => {
        const rect = document.querySelector('g.node[data-id="payments"]')!.getBoundingClientRect();
        const box = (document.querySelector('g.node[data-id="payments"] rect') as SVGGraphicsElement).getBBox();
        return rect.width / box.width;
    });
    await groupDrag(page, 'payments', -60 * scale, 0, ['customer', 'payments']);

    // customer can only move -20 before it reaches x=0, so payments moves -20 too.
    expect(await nodeCoordinate(page, 'customer', 'x')).toBe(0);
    expect(await nodeCoordinate(page, 'payments', 'x')).toBe(280);
    expect(await nodeCoordinate(page, 'customer', 'y')).toBe(300);
    expect(await nodeCoordinate(page, 'payments', 'y')).toBe(300);
});

test('[#254] every member of a group drag moves by the identical whole-unit delta', async ({ page }) => {
    await loadHarness(page);
    const start = { customer: { x: 100.37, y: 61.5 }, payments: { x: 500.42, y: 60.6 } };
    await renderWithPositions(page, start);
    await groupDrag(page, 'customer', 40, 30, ['customer', 'payments']);

    const dxs = [
        (await nodeCoordinate(page, 'customer', 'x')) - Math.round(start.customer.x),
        (await nodeCoordinate(page, 'payments', 'x')) - Math.round(start.payments.x),
    ];
    const dys = [
        (await nodeCoordinate(page, 'customer', 'y')) - Math.round(start.customer.y),
        (await nodeCoordinate(page, 'payments', 'y')) - Math.round(start.payments.y),
    ];
    expect(dxs[0]).toBe(dxs[1]);
    expect(dys[0]).toBe(dys[1]);
    expect(dxs[0]).not.toBe(0);
    expect(Number.isInteger(await nodeCoordinate(page, 'payments', 'y'))).toBe(true);
});

test('[#254] a group drag that ends near its start restores or stages every member together', async ({ page }) => {
    await loadHarness(page);
    const start = { customer: { x: 100.37, y: 50.2 }, payments: { x: 500.42, y: 49.2 } };
    await renderWithPositions(page, start);
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="customer"]').click();
    await page.locator('g.node[data-id="payments"]').click({ modifiers: ['Shift'] });
    const scale = await page.evaluate(() => {
        const rect = document.querySelector('g.node[data-id="customer"]')!.getBoundingClientRect();
        const box = (document.querySelector('g.node[data-id="customer"] rect') as SVGGraphicsElement).getBBox();
        return rect.width / box.width;
    });

    const centre = await nodeCentre(page, 'customer');
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 60, centre.y, { steps: 4 });
    // 0.1 SVG units from the start: a shared delta of 0, so nothing moved.
    await page.mouse.move(centre.x + 0.1 * scale, centre.y, { steps: 4 });
    await page.mouse.up();

    await expectExactlyAt(page, 'customer', start.customer);
    await expectExactlyAt(page, 'payments', start.payments);
    await expect(page.locator('#staged-changes-list')).toHaveText('No changes staged');
});
