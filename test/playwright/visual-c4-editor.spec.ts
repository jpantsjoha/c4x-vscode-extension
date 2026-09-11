/// <reference lib="dom" />

/**
 * Browser acceptance coverage for the Visual C4 Editor webview. The harness
 * runs the production client script with a deterministic host stub; native
 * source round-trip and atomic WorkspaceEdit behaviour are covered by the
 * Tier-A writeback transaction tests alongside this suite.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

interface PostedEdit {
    id: string;
    x?: number;
    y?: number;
    description?: string | null;
    label?: string;
    technology?: string | null;
    tags?: string[];
    sprite?: string | null;
    locked?: boolean;
    newId?: string;
}

interface PostedMessage {
    type?: string;
    protocolVersion?: number;
    revision?: string;
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

async function selectNode(page: Page, id: string): Promise<void> {
    const node = page.locator(`g.node[data-id="${id}"]`);
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-selected', 'true');
}

async function selectEdge(page: Page, id: string): Promise<void> {
    const edge = page.locator(`g.edge[data-id="${id}"]`);
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(edge).toHaveAttribute('aria-selected', 'true');
}

function messages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => {
        const testWindow = window as Window & { __visualLayoutMessages?: PostedMessage[] };
        return testWindow.__visualLayoutMessages ?? [];
    });
}

async function rejectNextSave(page: Page): Promise<void> {
    await page.evaluate(() => {
        const testWindow = window as Window & {
            __visualLayoutRejectNextMove?: boolean;
            __visualLayoutRenderPayload?: unknown;
        };
        testWindow.__visualLayoutRejectNextMove = true;
        // Keep the rejection announcement observable instead of immediately
        // replacing it with the synthetic harness refresh notification.
        testWindow.__visualLayoutRenderPayload = undefined;
    });
}

test('1. discover entry point: toolbar control is visible and keyboard-focusable', async ({ page }) => {
    await loadHarness(page);
    const toggle = page.locator('#toggle-layout');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveText('Edit C4 Diagram');
    await toggle.focus();
    await expect(toggle).toBeFocused();
});

test('2. enter edit mode exposes the inspector, focusable nodes, and live announcement', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await expect(page.locator('#editor-sidebar')).toBeVisible();
    await expect(page.locator('g.node').first()).toHaveAttribute('tabindex', '0');
    await expect(page.locator('#layout-status')).toContainText('Edit mode');
});

test('3. inspector reflects the selected element type and authored fields', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'customer');
    await expect(page.locator('#inspector-type')).toHaveValue('Person');
    await expect(page.locator('#inspector-label')).toHaveValue('Customer');

    await selectNode(page, 'web');
    await expect(page.locator('#inspector-type')).toHaveValue('Container');
    await expect(page.locator('#inspector-tech')).toHaveValue('React');

    await selectNode(page, 'api');
    await expect(page.locator('#inspector-desc')).toHaveValue('Application API');
    await expect(page.locator('#inspector-tags')).toHaveValue('Internal');
});

test('4. description edit stages and saves through the bounded writeback message', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('Updated API description');
    await expect(page.locator('#staged-changes-list')).toContainText('Description updated');
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'api', description: 'Updated API description' }));
});

test('5. label rename stages and saves through the semantic patch schema', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'payments');
    await page.locator('#inspector-label').fill('Payments platform');
    await expect(page.locator('#staged-changes-list')).toContainText('Label updated');
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'payments', label: 'Payments platform' }));
});

test('6. identifier rename shows impact and stages an atomic reference update', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'customer');
    await page.locator('#rename-element').click();
    await expect(page.locator('#rename-dialog')).toBeVisible();
    await expect(page.locator('#rename-impact')).toContainText('3 relationships');
    await page.locator('#rename-new-id').fill('Client');
    await expect(page.locator('#rename-confirm')).toBeEnabled();
    await page.locator('#rename-confirm').click();
    await expect(page.locator('#staged-changes-list')).toContainText('Rename customer → Client (3 refs)');
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'customer', newId: 'Client' }));
});

test('7. reposition and semantic edit are committed together', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.keyboard.press('ArrowRight');
    await page.locator('#inspector-label').fill('Public API');
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'api', label: 'Public API' }));
    expect(save?.edits?.find(edit => edit.id === 'api')?.x).toEqual(expect.any(Number));
});

test('8. discard clears staged changes without posting a writeback request', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-tech').fill('Deno');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
    await page.locator('#discard-staged-changes').click();
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
    expect((await messages(page)).filter(message => message.type === 'visualLayout.applySemanticEdits')).toHaveLength(0);
});

test('9. [#96] exiting edit mode while dirty asks first; Cancel keeps the draft and leaves source untouched', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('Draft only');
    await page.locator('#toggle-layout').click();
    const banner = page.locator('#exit-edit-banner');
    await expect(banner).toHaveAttribute('data-active', 'true');
    await expect(banner).toContainText('You have unsaved changes');
    await page.locator('#exit-edit-cancel').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#staged-changes-list li')).toHaveCount(1);
    expect((await messages(page)).filter(message => message.type === 'visualLayout.applySemanticEdits')).toHaveLength(0);
});

test('9b. [#96] confirming the exit-edit banner discards the draft and announces it', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('Draft only');
    await page.locator('#toggle-layout').click();
    const banner = page.locator('#exit-edit-banner');
    await expect(banner).toHaveAttribute('data-active', 'true');
    await page.locator('#exit-edit-discard').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#layout-status')).toContainText('Unsaved changes discarded');
    await expect(page.locator('#staged-changes-list li.empty-changes-text')).toContainText('No changes staged');
    expect((await messages(page)).filter(message => message.type === 'visualLayout.applySemanticEdits')).toHaveLength(0);
});

test('10. changing selection reflects the latest element while staging remains keyed to each id', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-label').fill('API gateway');
    await selectNode(page, 'web');
    await expect(page.locator('#inspector-id')).toHaveValue('web');
    await page.locator('#inspector-label').fill('Web client');
    await expect(page.locator('#staged-changes-list')).toContainText('API');
    await expect(page.locator('#staged-changes-list')).toContainText('Web application');
});

test('11. empty description serializes as an explicit clear operation', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('');
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'api', description: null }));
});

test('12. keyboard-only description edit reaches the save affordance', async ({ page }) => {
    await loadHarness(page);
    const toggle = page.locator('#toggle-layout');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').focus();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.type('Keyboard authored description');
    await page.locator('#save-staged-changes').focus();
    await page.keyboard.press('Enter');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'api', description: 'Keyboard authored description' }));
});

test('13. host rejection fails closed and announces the error assertively', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('Will be rejected');
    await rejectNextSave(page);
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-error')).toContainText('stale revision');
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'rejected');
});

test('14. editor chrome with a staged change matches its visual regression baseline', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-tags').fill('Internal, Reviewed');
    await expect(page.locator('#main-viewport')).toHaveScreenshot('visual-c4-editor-chrome.png');
});

test('15. remove button: stage 2 edits, remove 1, Save applies only the remaining edit', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    // Stage edit on 'api'
    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('API description staged');

    // Stage edit on 'web'
    await selectNode(page, 'web');
    await page.locator('#inspector-label').fill('Web client staged');

    // Both entries visible in changes list
    await expect(page.locator('#staged-changes-list')).toContainText('API');
    await expect(page.locator('#staged-changes-list')).toContainText('Web application');

    // Remove the 'api' entry using the ✕ button (first remove button)
    const removeButtons = page.locator('#staged-changes-list .change-remove-btn');
    await expect(removeButtons).toHaveCount(2);
    await removeButtons.first().click();

    // 'api' entry gone; 'web' entry remains; Save still enabled
    await expect(page.locator('#staged-changes-list')).not.toContainText('Description updated');
    await expect(page.locator('#staged-changes-list')).toContainText('Web application');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();

    // Polite announcement was emitted
    await expect(page.locator('#layout-status')).toContainText('Removed staged change for');

    // Save → only the 'web' edit is in the posted message
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits?.map((e: PostedEdit) => e.id)).not.toContain('api');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'web', label: 'Web client staged' }));
});

test('16. remove button is keyboard-operable via Tab and Enter', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);

    await selectNode(page, 'api');
    await page.locator('#inspector-desc').fill('Keyboard removal test');

    // Confirm the remove button is present and focusable
    const removeBtn = page.locator('#staged-changes-list .change-remove-btn').first();
    await removeBtn.focus();
    await expect(removeBtn).toBeFocused();
    await page.keyboard.press('Enter');

    // Change removed and Save disabled
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
});

// ── #86 Lock toggle tests ─────────────────────────────────────────────────────

test('17. [#86] lock checkbox is present in the inspector and keyboard-accessible', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    const lockCheckbox = page.locator('#inspector-locked');
    await expect(lockCheckbox).toBeVisible();
    await expect(lockCheckbox).toBeEnabled();
    // Accessible via keyboard focus
    await lockCheckbox.focus();
    await expect(lockCheckbox).toBeFocused();
});

test('18. [#86] lock checkbox reflects pre-locked state from snapshot', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    // 'database' node has locked: true in the harness payload
    await selectNode(page, 'database');
    const lockCheckbox = page.locator('#inspector-locked');
    await expect(lockCheckbox).toBeChecked();
});

test('19. [#86] lock checkbox unchecked by default for unlocked element', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    const lockCheckbox = page.locator('#inspector-locked');
    await expect(lockCheckbox).not.toBeChecked();
});

test('20. [#86] toggling lock stages "Locked {element}" in the changes list', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-locked').check();
    await expect(page.locator('#staged-changes-list')).toContainText('Locked API');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
});

test('21. [#86] toggling locked off stages "Unlocked {element}" for a pre-locked node', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    // 'database' snapshot has locked: true
    await selectNode(page, 'database');
    await page.locator('#inspector-locked').uncheck();
    await expect(page.locator('#staged-changes-list')).toContainText('Unlocked Database');
});

test('22. [#86] save posts locked: true through the applySemanticEdits message', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-locked').check();
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'api', locked: true }));
});

test('23. [#86] save posts locked: false when unlocking a pre-locked node', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    // 'database' has locked: true in the harness
    await selectNode(page, 'database');
    await page.locator('#inspector-locked').uncheck();
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ id: 'database', locked: false }));
});

test('24. [#86] locking a node updates the canvas outline class live', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    // Initially unlocked
    await expect(page.locator('g.node[data-id="api"]')).not.toHaveClass(/locked/);
    await page.locator('#inspector-locked').check();
    // Canvas node gains the locked CSS class immediately
    await expect(page.locator('g.node[data-id="api"]')).toHaveClass(/locked/);
});

test('25. save shows pending feedback and the watchdog surfaces a silent host', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');
    await page.locator('#inspector-label').fill('Watchdog label');
    // Shorten the watchdog and make the host swallow the save message.
    await page.evaluate(() => {
        const w = window as Window & { __c4xSaveWatchdogMs?: number; __visualLayoutSilentNextSave?: boolean };
        w.__c4xSaveWatchdogMs = 150;
        w.__visualLayoutSilentNextSave = true;
    });
    await page.locator('#save-staged-changes').click();
    // Immediate pending feedback: button disables and status reports the attempt.
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
    await expect(page.locator('#layout-status')).toContainText('Saving…');
    // The message was posted to the host even though it never responds.
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save).toBeTruthy();
    // Watchdog fires: user gets a visible, actionable error instead of a dead button.
    await expect(page.locator('#layout-error')).toContainText('No response from the extension host');
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
});

test('26. [Phase 1] selecting an edge shows the read-only relationship inspector', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const edge = page.locator('g.edge[data-id="edge-4"]');
    await edge.locator('.edge-hit-area').click({ force: true });
    await expect(edge).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#edge-inspector')).toBeVisible();
    await expect(page.locator('#edge-from')).toHaveValue('Payments System');
    await expect(page.locator('#edge-to')).toHaveValue('Web application');
    await expect(page.locator('#edge-label')).toHaveValue('Calls API');
    await expect(page.locator('#edge-type')).toHaveValue('sync');
    // Element inspector is hidden while an edge is selected
    await expect(page.locator('#element-inspector')).toBeHidden();
});

test('27. [Phase 1] edge selection is keyboard-operable and Escape restores the element inspector', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const edge = page.locator('g.edge[data-id="edge-1"]');
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#edge-inspector')).toBeVisible();
    await expect(page.locator('#edge-from')).toHaveValue('Customer');
    await expect(page.locator('#edge-to')).toHaveValue('Payments System');
    await expect(page.locator('#edge-label')).toHaveValue('Uses');
    await page.keyboard.press('Escape');
    await expect(page.locator('#edge-inspector')).toBeHidden();
    await expect(page.locator('#element-inspector')).toBeVisible();
});

test('28. [Phase 2] editing a relationship label stages and saves it', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const edge = page.locator('g.edge[data-id="edge-4"]');
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#edge-inspector')).toBeVisible();
    // Replace the label and stage it
    await page.locator('#edge-label').fill('Sync call');
    await expect(page.locator('#staged-changes-list')).toContainText('Payments System → Web application');
    await expect(page.locator('#staged-changes-list')).toContainText('Label updated');
    // Save and verify the outbound message carries the edge edit
    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ edgeId: 'edge-4', label: 'Sync call' }));
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
});

test('29. [Phase 2] clearing a relationship label stages an explicit null clear', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const edge = page.locator('g.edge[data-id="edge-1"]');
    await edge.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#edge-inspector')).toBeVisible();
    await page.locator('#edge-label').fill('');
    await expect(page.locator('#staged-changes-list')).toContainText('Label cleared');
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ edgeId: 'edge-1', label: null }));
});

test('30. [#97] inspector label edit live-updates the canvas text before Save and reverts when un-staged', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectNode(page, 'api');

    const canvasLabel = page.locator('g.node[data-id="api"] text[data-field="label"]');
    await expect(canvasLabel).toHaveText('API');

    // Typing in the inspector updates the rendered node immediately — the
    // save-triggered re-render only confirms it later.
    await page.locator('#inspector-label').fill('Public API');
    await expect(canvasLabel).toHaveText('Public API');
    // Nothing was posted to the host: the preview is cosmetic, pre-Save.
    expect((await messages(page)).filter(message => message.type === 'visualLayout.applySemanticEdits')).toHaveLength(0);

    // Un-staging the edit reverts the canvas text to the snapshot label.
    await page.locator('#staged-changes-list .change-remove-btn').first().click();
    await expect(canvasLabel).toHaveText('API');
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
});

test('31. [#138] edge inspector shows relationship technology and editable relType selector', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectEdge(page, 'edge-4');
    await expect(page.locator('#edge-inspector')).toBeVisible();
    await expect(page.locator('#edge-technology')).toHaveValue('REST');
    await expect(page.locator('#edge-type')).toHaveValue('sync');
    await expect(page.locator('#reassign-from')).toBeEnabled();
    await expect(page.locator('#reassign-to')).toBeEnabled();
});

test('32. [#138] editing relationship technology and relType stages and saves them', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectEdge(page, 'edge-4');

    await page.locator('#edge-technology').fill('GraphQL');
    await page.locator('#edge-type').selectOption('async');
    await expect(page.locator('#staged-changes-list')).toContainText('Payments System → Web application');
    await expect(page.locator('#staged-changes-list')).toContainText('Technology updated');
    await expect(page.locator('#staged-changes-list')).toContainText('Type updated');

    await page.locator('#save-staged-changes').click();
    await expect(page.locator('#layout-status')).toContainText('Changes successfully saved');
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ edgeId: 'edge-4', technology: 'GraphQL', relType: 'async' }));
});

test('33. [#138] endpoint re-assignment picks a new target and stages it', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectEdge(page, 'edge-4');

    await page.locator('#reassign-to').click();
    // Pick the 'api' node as the new target
    const apiNode = page.locator('g.node[data-id="api"]');
    await apiNode.click();
    await expect(page.locator('#edge-to')).toHaveValue('API');
    await expect(page.locator('#staged-changes-list')).toContainText('Target endpoint updated');

    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(message => message.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(expect.objectContaining({ edgeId: 'edge-4', to: 'api' }));
});

test('34. [#138] keyboard-only endpoint re-assignment is operable', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await selectEdge(page, 'edge-4');

    const reassignBtn = page.locator('#reassign-to');
    await reassignBtn.focus();
    await page.keyboard.press('Enter');

    // Tab to the 'api' node and select it with Enter
    const apiNode = page.locator('g.node[data-id="api"]');
    await apiNode.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#edge-to')).toHaveValue('API');
    await expect(page.locator('#staged-changes-list')).toContainText('Target endpoint updated');
});
