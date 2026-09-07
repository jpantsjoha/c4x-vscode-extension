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

/**
 * The frame a boundary is currently painted at, read off its rect and undoing
 * the group transform, so it is comparable with the layout snapshot (#163).
 */
async function paintedFrame(page: Page, id: string): Promise<{
    x: number; y: number; width: number; height: number;
}> {
    return page.evaluate((boundaryId: string) => {
        const group = document.querySelector(`g.boundary[data-id="${boundaryId}"]`);
        if (!group) {
            throw new Error(`no boundary ${boundaryId}`);
        }
        const rect = group.querySelector('rect');
        if (!rect) {
            throw new Error(`boundary ${boundaryId} has no rect`);
        }
        const transform = group.getAttribute('transform') ?? '';
        const parsed = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(transform);
        const dx = parsed ? Number(parsed[1]) : 0;
        const dy = parsed ? Number(parsed[2]) : 0;
        return {
            x: Number(rect.getAttribute('x')) + dx,
            y: Number(rect.getAttribute('y')) + dy,
            width: Number(rect.getAttribute('width')),
            height: Number(rect.getAttribute('height')),
        };
    }, id);
}

async function labelPosition(page: Page, id: string): Promise<{ x: number; y: number }> {
    return page.evaluate((boundaryId: string) => {
        const text = document.querySelector(`g.boundary[data-id="${boundaryId}"] text`);
        return { x: Number(text?.getAttribute('x')), y: Number(text?.getAttribute('y')) };
    }, id);
}

async function nudgeNode(page: Page, id: string, key: string, times: number): Promise<void> {
    await page.locator(`g.node[data-id="${id}"]`).focus();
    for (let i = 0; i < times; i++) {
        await page.keyboard.press(key);
    }
}

for (const action of ['remove', 'discard'] as const) {
    test(`reverting a child move rewraps the painted boundary (${action})`, async ({ page }) => {
        await loadHarness(page);
        await page.locator('#toggle-layout').click();
        await nudgeNode(page, 'worker', 'ArrowRight', 12);
        expect((await paintedFrame(page, 'pinned-boundary')).width).toBe(340);

        if (action === 'remove') {
            await page.getByRole('button', { name: 'Remove staged change for Worker' }).click();
        } else {
            await page.locator('#discard-staged-changes').click();
        }

        await expect(page.locator('g.node[data-id="worker"]')).toHaveAttribute('data-current-x', '100');
        expect(await paintedFrame(page, 'pinned-boundary')).toEqual({ x: 60, y: 230, width: 220, height: 160 });
    });
}

for (const includeValid of [false, true]) {
    test(`draft restoration reports omitted entries (${includeValid ? 'partial' : 'none'})`, async ({ page }) => {
        await page.addInitScript((partial: boolean) => {
            const host = window as Window & { __visualLayoutSavedState?: unknown };
            host.__visualLayoutSavedState = {
                schemaVersion: 1,
                editMode: true,
                selectedNodeId: null,
                stagedEdits: [
                    { id: 'removed-node', label: 'Unsaved change' },
                    ...(partial ? [{ id: 'worker', label: 'Still present' }] : []),
                ],
            };
        }, includeValid);
        await loadHarness(page);
        await expect(page.locator('#layout-status')).toContainText(
            `Draft restored: ${includeValid ? 1 : 0} staged changes; 1 could not be restored because its target is no longer present.`
        );
        if (includeValid) {
            await expect(page.locator('#save-staged-changes')).toBeEnabled();
        }
    });
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

/**
 * Boundary re-wrap parity with the host layout engine (#163). The frames these
 * assert are the ones `computeBoundaryWrap` produces, and the unit suite
 * (`src/__tests__/webview/boundary-wrap.test.ts`) proves those match what
 * DagreLayoutEngine saves. Together: what the editor previews is what the file
 * gets.
 */
test('dragging a child grows the enclosing frame', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    const before = await paintedFrame(page, 'backend-boundary');
    expect(before).toEqual({ x: 320, y: 340, width: 260, height: 120 });

    // database sits at 450,360 (120x80). Ten ArrowRights push it to 550, so the
    // frame must span 320 -> 550 + 120 + 40 = 710 wide.
    await nudgeNode(page, 'database', 'ArrowRight', 10);

    const after = await paintedFrame(page, 'backend-boundary');
    expect(after).toEqual({ x: 300, y: 300, width: 410, height: 180 });
    expect(after.width).toBeGreaterThan(before.width);
    expect(await labelPosition(page, 'backend-boundary')).toEqual({ x: 310, y: 320 });
});

test('a child drag inside a manually positioned frame leaves the frame origin alone', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    // pinned-boundary carries $x/$y, so the host keeps its origin on save and
    // the preview must too — only the size may follow the child.
    const before = await paintedFrame(page, 'pinned-boundary');
    expect(before).toEqual({ x: 60, y: 230, width: 220, height: 150 });

    await nudgeNode(page, 'worker', 'ArrowRight', 12);

    const after = await paintedFrame(page, 'pinned-boundary');
    expect(after.x).toBe(60);
    expect(after.y).toBe(230);
    // worker: 100 -> 220, so the frame spans 220 + 140 + 40 - 60 = 340 wide.
    expect(after.width).toBe(340);
    expect(after.height).toBe(160);
    // The label stays anchored to the frame origin, where BoundaryRenderer puts it.
    expect(await labelPosition(page, 'pinned-boundary')).toEqual({ x: 70, y: 250 });
});

test('a keyboard nudge after a child drag stages a move from the authored origin', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#toggle-layout').click();

    // Re-wrapping used to write dataset.currentX/currentY, which drag-start and
    // the keyboard nudge read as the boundary's own position: the next staged
    // move silently started from the auto-wrapped frame instead of the
    // authored one.
    await nudgeNode(page, 'worker', 'ArrowRight', 12);
    expect(await boundaryCoordinate(page, 'pinned-boundary', 'x')).toBe(60);

    // The clearest witness is the auto-positioned frame: its painted origin
    // moves to 300 while the position the next boundary edit starts from stays
    // at the 320 the layout gave it.
    await nudgeNode(page, 'database', 'ArrowRight', 10);
    expect((await paintedFrame(page, 'backend-boundary')).x).toBe(300);
    expect(await boundaryCoordinate(page, 'backend-boundary', 'x')).toBe(320);

    const boundary = page.locator('g.boundary[data-id="pinned-boundary"]');
    await boundary.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');

    expect(await boundaryCoordinate(page, 'pinned-boundary', 'x')).toBe(70);
    expect(await boundaryCoordinate(page, 'pinned-boundary', 'y')).toBe(230);

    await page.locator('#save-staged-changes').click();

    const messages = await getMessages(page);
    const saveMsg = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    const boundaryEdit = saveMsg?.edits?.find(edit => edit.boundaryId === 'pinned-boundary');
    expect(boundaryEdit).toMatchObject({ id: 'pinned-boundary', x: 70, y: 230 });
});
