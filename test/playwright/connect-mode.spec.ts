/// <reference lib="dom" />

/**
 * Browser acceptance for connect mode (#66) — adding a relationship by picking
 * a source and a target on the canvas.
 *
 * The C4 legality refusal is asserted at unit level
 * (src/__tests__/webview/connect-mode.test.ts), because the shared harness
 * fixture contains only logical elements and every pair in it is legal.
 * Native source emission is covered by the writeback transaction tests.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

interface PostedAdd {
    targetId: string;
    label: string;
    relType: string;
    technology?: string;
}

interface PostedEdit {
    id: string;
    addRelationship?: PostedAdd[];
}

interface PostedMessage {
    type?: string;
    edits?: PostedEdit[];
}

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_EDITOR_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-editor-harness.html');

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

async function startConnect(page: Page): Promise<void> {
    await page.locator('#connect-mode').click();
    await expect(page.locator('#connect-mode')).toHaveAttribute('aria-pressed', 'true');
}

function messages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutMessages?: PostedMessage[] };
        return testWindow.__visualLayoutMessages ?? [];
    });
}

test('35. [#66] the Connect control is disabled until edit mode is entered', async ({ page }) => {
    await loadHarness(page);
    const connect = page.locator('#connect-mode');
    await expect(connect).toBeVisible();
    await expect(connect).toBeDisabled();
    await enterEditMode(page);
    await expect(connect).toBeEnabled();
    await expect(connect).toHaveAttribute('aria-pressed', 'false');
});

test('36. [#66] entering connect mode prompts for a source and highlights eligible nodes', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await expect(page.locator('#layout-status')).toContainText('choose the source element');
    await expect(page.locator('#content')).toHaveClass(/connect-mode-active/);
    await expect(page.locator('g.node.connect-eligible')).toHaveCount(6);
});

test('37. [#66] picking a source narrows the eligible targets and excludes the source', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await expect(page.locator('#layout-status')).toContainText('choose the target element');
    await expect(page.locator('g.node[data-id="web"]')).toHaveClass(/connect-source/);
    // Every fixture element is logical, so all five others stay eligible.
    await expect(page.locator('g.node.connect-eligible')).toHaveCount(5);
    await expect(page.locator('g.node[data-id="web"]')).not.toHaveClass(/connect-eligible/);
});

test('38. [#66] picking a target opens the dialog with both endpoints named', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await expect(page.locator('#connect-dialog')).toBeVisible();
    await expect(page.locator('#connect-endpoints')).toHaveText('Web application → API');
    await expect(page.locator('#connect-confirm')).toBeDisabled();
});

test('39. [#66] a label is required before the relationship can be added', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await expect(page.locator('#connect-confirm')).toBeDisabled();
    await page.locator('#connect-label').fill('Calls');
    await expect(page.locator('#connect-confirm')).toBeEnabled();
    await page.locator('#connect-label').fill('   ');
    await expect(page.locator('#connect-confirm')).toBeDisabled();
});

test('40. [#66] a pipe character in the label is refused with a message', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await page.locator('#connect-label').fill('a|b');
    await expect(page.locator('#connect-validation')).toContainText('|');
    await expect(page.locator('#connect-confirm')).toBeDisabled();
});

test('41. [#66] confirming stages the relationship in the changes list', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-confirm').click();
    await expect(page.locator('#connect-dialog')).not.toBeVisible();
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship web → api: Calls');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
    await expect(page.locator('#connect-mode')).toHaveAttribute('aria-pressed', 'false');
});

test('42. [#66] saving posts the addRelationship payload the protocol expects', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-technology').fill('HTTPS');
    await page.locator('#connect-reltype').selectOption('sync');
    await page.locator('#connect-confirm').click();
    await page.locator('#save-staged-changes').click();

    const posted = await messages(page);
    const save = posted.find(m => m.type === 'visualLayout.applySemanticEdits');
    expect(save).toBeTruthy();
    const edit = save?.edits?.find(e => e.id === 'web');
    expect(edit?.addRelationship).toEqual([
        { targetId: 'api', label: 'Calls', relType: 'sync', technology: 'HTTPS' },
    ]);
});

test('43. [#66] Escape cancels connect mode without staging anything', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('#connect-mode')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#content')).not.toHaveClass(/connect-mode-active/);
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
});

test('44. [#66] connect mode is fully keyboard-operable', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await page.locator('#connect-mode').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#connect-mode')).toHaveAttribute('aria-pressed', 'true');

    await page.locator('g.node[data-id="web"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#layout-status')).toContainText('choose the target element');

    await page.locator('g.node[data-id="api"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#connect-dialog')).toBeVisible();

    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-confirm').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship web → api: Calls');
});

test('45. [#66] two relationships from the same source share one staged edit', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-confirm').click();

    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="audit"]').click();
    await page.locator('#connect-label').fill('Notifies');
    await page.locator('#connect-reltype').selectOption('async');
    await page.locator('#connect-confirm').click();

    await page.locator('#save-staged-changes').click();
    const posted = await messages(page);
    const save = posted.find(m => m.type === 'visualLayout.applySemanticEdits');
    const webEdits = save?.edits?.filter(e => e.id === 'web') ?? [];
    // One staged edit carrying both adds — duplicate ids are protocol-invalid.
    expect(webEdits).toHaveLength(1);
    expect(webEdits[0].addRelationship).toEqual([
        { targetId: 'api', label: 'Calls', relType: 'uses' },
        { targetId: 'audit', label: 'Notifies', relType: 'async' },
    ]);
});

test('46. [#66] a staged relationship can be un-staged like any other change', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('g.node[data-id="api"]').click();
    await page.locator('#connect-label').fill('Calls');
    await page.locator('#connect-confirm').click();
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship');

    await page.locator('#staged-changes-list .change-remove-btn').first().click();
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
});

test('47. [#66] leaving edit mode clears an armed connect gesture', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await startConnect(page);
    await page.locator('g.node[data-id="web"]').click();
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#content')).not.toHaveClass(/connect-mode-active/);
    await expect(page.locator('#connect-mode')).toBeDisabled();
});

test('48. [#66 UAT] Cmd+click two elements creates a relationship without the toolbar', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    // No Connect button press — the modifier arms and picks in one gesture.
    await page.locator('g.node[data-id="customer"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#layout-status')).toContainText('choose the target element');
    await expect(page.locator('g.node[data-id="customer"]')).toHaveClass(/connect-source/);

    await page.locator('g.node[data-id="web"]').click({ modifiers: ['Meta'] });
    await expect(page.locator('#connect-dialog')).toBeVisible();
    await expect(page.locator('#connect-endpoints')).toHaveText('Customer → Web application');

    await page.locator('#connect-label').fill('Uses');
    await page.locator('#connect-confirm').click();
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship customer → web: Uses');
});

test('49. [#66 UAT] Ctrl+click is the same accelerator for non-mac keyboards', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await page.locator('g.node[data-id="customer"]').click({ modifiers: ['Control'] });
    await expect(page.locator('#layout-status')).toContainText('choose the target element');
});

test('50. [UAT] Save and Discard sit in the header beside Exit edit mode', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    // Both session decisions must be reachable without scrolling the sidebar.
    const actions = page.locator('#preview-actions #session-actions');
    await expect(actions.locator('#save-staged-changes')).toBeVisible();
    await expect(actions.locator('#discard-staged-changes')).toBeVisible();
    await expect(page.locator('#preview-actions #toggle-layout')).toBeVisible();
});

test('51. [UAT] the move status reads in full in the sidebar instead of being clipped', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await expect(page.locator('#editor-sidebar #layout-status')).toBeVisible();

    await page.locator('g.node[data-id="web"]').focus();
    await page.keyboard.press('ArrowRight');

    const status = page.locator('#editor-sidebar #layout-status');
    await expect(status).toContainText('moved to');
    // The header clamp (max-width 340px + ellipsis) truncated this to
    // "Web App moved to 299, …". Nothing may be visually clipped now.
    const clipped = await status.evaluate(el => el.scrollWidth > el.clientWidth + 1);
    expect(clipped).toBe(false);
});

// ── #160 chrome layout ───────────────────────────────────────────────────────

test('52. [#160] Edit, Save and Discard form one cluster at the top left', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    const title = await page.locator('#preview-title').boundingBox();
    const toggle = await page.locator('#toggle-layout').boundingBox();
    const save = await page.locator('#save-staged-changes').boundingBox();
    const discard = await page.locator('#discard-staged-changes').boundingBox();

    // Reading order left to right: title, enter/exit, then the two decisions
    // that end the session — no longer split across the header.
    expect(toggle!.x).toBeGreaterThan(title!.x);
    expect(save!.x).toBeGreaterThan(toggle!.x);
    expect(discard!.x).toBeGreaterThan(save!.x);
    // The whole cluster stays in the left half of the header.
    const viewport = page.viewportSize()!;
    expect(discard!.x + discard!.width).toBeLessThan(viewport.width / 2);
});

test('53. [#160] diagram stats are a table, and never sit in the header', async ({ page }) => {
    await loadHarness(page);

    await expect(page.locator('header #metrics')).toHaveCount(0);
    const rows = page.locator('#diagram-stats .stats-table tr');
    await expect(rows).toHaveCount(7);
    await expect(rows.first()).toContainText('Parse');
    await expect(page.locator('#diagram-stats')).toContainText('Relationships');
});

test('54. [#160] stats dock above the Properties Inspector in edit mode', async ({ page }) => {
    await loadHarness(page);
    // Preview mode: floating over the canvas, so it costs no canvas width.
    await expect(page.locator('#content > #diagram-stats.stats-floating')).toBeVisible();

    await enterEditMode(page);

    const stats = page.locator('#editor-sidebar > #diagram-stats');
    await expect(stats).toBeVisible();
    const statsBox = await stats.boundingBox();
    const inspectorBox = await page.locator('#element-inspector').boundingBox();
    expect(statsBox!.y).toBeLessThan(inspectorBox!.y);
});
