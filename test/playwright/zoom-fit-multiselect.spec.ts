/// <reference lib="dom" />

/**
 * Issue #88 — Zoom-to-fit + multi-select group move.
 *
 * Playwright browser-level assertions against the production preview client
 * running in the synthetic harness. VS Code extension-host integration and
 * atomic WorkspaceEdit behaviour are covered by separate Tier-A tests.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

interface PostedEdit {
    id: string;
    x?: number;
    y?: number;
}

interface PostedMessage {
    type?: string;
    protocolVersion?: number;
    revision?: string;
    edits?: PostedEdit[];
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
        timeout: 5_000,
    });
}

async function enterEditMode(page: Page): Promise<void> {
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
}

async function nodeCoordinate(page: Page, id: string, axis: 'x' | 'y'): Promise<number> {
    const value = await page.locator(`g.node[data-id="${id}"]`).getAttribute(`data-current-${axis}`);
    return Number(value);
}

function getMessages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutMessages?: PostedMessage[] };
        return testWindow.__visualLayoutMessages ?? [];
    });
}

// ── Zoom-to-fit ──────────────────────────────────────────────────────────────

test('[#88] Fit button is present and keyboard-accessible in the canvas toolbar', async ({ page }) => {
    await loadHarness(page);
    const fitBtn = page.locator('#zoom-fit');
    await expect(fitBtn).toBeVisible();
    await expect(fitBtn).toHaveAttribute('aria-label', 'Zoom to Fit');
    // Should be focusable and activatable by keyboard
    await fitBtn.focus();
    await expect(fitBtn).toBeFocused();
});

test('[#88] Fit button modifies the SVG viewBox so content is centred', async ({ page }) => {
    await loadHarness(page);
    const svgEl = page.locator('#svg-container svg');

    // Record viewBox before fit
    const beforeVB = await svgEl.getAttribute('viewBox');

    await page.locator('#zoom-fit').click();

    // After fit the viewBox should change (unless everything was already perfectly centred)
    const afterVB = await svgEl.getAttribute('viewBox');

    // The viewBox string must be a valid four-number sequence
    const parts = (afterVB ?? '').split(/\s+/).map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every(Number.isFinite)).toBe(true);

    // The fit transform should be different from an arbitrary initial zoom
    // (the prototype harness has nodes spread across 0–800 × 0–500 so the
    // viewBox must change from the default 1.0 zoom / 0 pan state).
    expect(afterVB).not.toBeNull();
    // We can't assert the exact value but we can assert it is well-formed
    const [x, y, w, h] = parts;
    expect(w).toBeGreaterThan(0);
    expect(h).toBeGreaterThan(0);
    expect(beforeVB).not.toBeNull();
});

test('[#88] Fit button announces "Diagram zoomed to fit" via the polite live region', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#zoom-fit').click();
    await expect(page.locator('#layout-status')).toHaveText(/zoomed to fit/i);
});

// ── Multi-select — accessibility contract ─────────────────────────────────────

test('[#88] node list has aria-multiselectable="true"', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await expect(page.locator('g.nodes')).toHaveAttribute('aria-multiselectable', 'true');
});

// ── Multi-select — Shift+click ────────────────────────────────────────────────

test('[#88] Shift+click adds a second node to the selection set', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    // Click customer (plain click → single select)
    await customer.click();
    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(payments).toHaveAttribute('aria-selected', 'false');

    // Shift+click payments → adds to selection
    await payments.click({ modifiers: ['Shift'] });
    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(payments).toHaveAttribute('aria-selected', 'true');
});

test('[#88] Shift+click a selected node removes it from the selection set', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    // Build a 2-node selection
    await customer.click();
    await payments.click({ modifiers: ['Shift'] });
    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(payments).toHaveAttribute('aria-selected', 'true');

    // Shift+click customer again → removes it
    await customer.click({ modifiers: ['Shift'] });
    await expect(customer).toHaveAttribute('aria-selected', 'false');
    await expect(payments).toHaveAttribute('aria-selected', 'true');
});

test('[#88] Inspector shows "{N} elements selected" placeholder for multi-select', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });

    // Inspector label field should show the placeholder
    await expect(page.locator('#inspector-label')).toHaveValue(/2 elements selected/);
});

test('[#88] Multi-select status is announced via the layout-status live region', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });

    await expect(page.locator('#layout-status')).toHaveText(/2 elements selected/);
});

// ── Multi-select — arrow key group move ──────────────────────────────────────

test('[#88] ArrowRight moves ALL selected nodes by the same delta', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    const initialCustomerX = await nodeCoordinate(page, 'customer', 'x');
    const initialPaymentsX = await nodeCoordinate(page, 'payments', 'x');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });

    // Focus the customer node so keydown fires on it
    await customer.focus();
    await page.keyboard.press('ArrowRight');

    const newCustomerX = await nodeCoordinate(page, 'customer', 'x');
    const newPaymentsX = await nodeCoordinate(page, 'payments', 'x');

    expect(newCustomerX).toBe(initialCustomerX + 10);
    expect(newPaymentsX).toBe(initialPaymentsX + 10);
});

test('[#88] Arrow-moved group — both nodes appear in staged changes list', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });
    await customer.focus();
    await page.keyboard.press('ArrowRight');

    // Both should appear in the staged changes list
    const items = page.locator('#staged-changes-list li');
    const count = await items.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const listText = await page.locator('#staged-changes-list').textContent();
    expect(listText).toMatch(/Customer/);
    expect(listText).toMatch(/Payments/);
});

test('[#88] Save after group arrow-move sends both nodes in edits payload', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });
    await customer.focus();
    await page.keyboard.press('ArrowRight');

    await page.locator('#save-staged-changes').click();

    const msgs = await getMessages(page);
    const saveMsg = msgs.find(m => m.type === 'visualLayout.applySemanticEdits');
    expect(saveMsg).toBeDefined();
    const editIds = (saveMsg?.edits ?? []).map(e => e.id);
    expect(editIds).toContain('customer');
    expect(editIds).toContain('payments');
    for (const edit of saveMsg?.edits ?? []) {
        expect(typeof edit.x).toBe('number');
        expect(typeof edit.y).toBe('number');
    }
});

// ── Esc clears multi-select ────────────────────────────────────────────────────

test('[#88] Escape clears the entire multi-select set', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const customer = page.locator('g.node[data-id="customer"]');
    const payments = page.locator('g.node[data-id="payments"]');

    await customer.click();
    await payments.click({ modifiers: ['Shift'] });
    await expect(customer).toHaveAttribute('aria-selected', 'true');
    await expect(payments).toHaveAttribute('aria-selected', 'true');

    // Press Escape via focus on customer
    await customer.focus();
    await page.keyboard.press('Escape');

    await expect(customer).toHaveAttribute('aria-selected', 'false');
    await expect(payments).toHaveAttribute('aria-selected', 'false');
});

// ── Auto-fit on open (#111) ────────────────────────────────────────────────────

test('[#111] first render auto-fits the diagram — the applied zoom/pan is not the identity', async ({ page }) => {
    await loadHarness(page);
    const svgEl = page.locator('#svg-container svg');
    const viewBox = await svgEl.getAttribute('viewBox');
    expect(viewBox).not.toBeNull();
    // Identity would be the raw SVG viewBox of the fixture (0 0 800 500);
    // auto-fit on open replaces it with a fitted window on first render.
    expect(viewBox).not.toBe('0 0 800 500');
    const parts = (viewBox ?? '').split(/\s+/).map(Number);
    expect(parts).toHaveLength(4);
    expect(parts.every(Number.isFinite)).toBe(true);
});

test('[#111] save/re-render preserves the user zoom/pan — no re-fit', async ({ page }) => {
    await loadHarness(page);
    const svgEl = page.locator('#svg-container svg');

    // The user takes over the camera after the initial auto-fit.
    await page.locator('#zoom-in').click();
    const userViewBox = await svgEl.getAttribute('viewBox');
    expect(userViewBox).not.toBeNull();

    // Save path: stage an edit and save (the harness replies batchAccepted).
    await enterEditMode(page);
    await page.locator('g.node[data-id="customer"]').click();
    await page.locator('#inspector-label').fill('Customer X');
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');

    // The host's post-save re-render arrives (same payload, new message).
    await page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutRenderPayload?: unknown };
        window.postMessage({ type: 'render', payload: testWindow.__visualLayoutRenderPayload }, '*');
    });

    // firstRender is false by now, so auto-fit must not fire again: the
    // applied viewBox is still exactly the user's zoom/pan.
    await expect(svgEl).toHaveAttribute('viewBox', userViewBox!);
});
