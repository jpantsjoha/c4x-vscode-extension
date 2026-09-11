/// <reference lib="dom" />

/**
 * Playwright acceptance tests for the Markdown Preview edit entry point (B18).
 *
 * Scope:
 *   - Verifies the "Edit C4 diagram" affordance renders in the HTML produced by
 *     the c4xPlugin for each c4x fenced block (discoverability from preview).
 *   - Verifies the editor panel opened for a Markdown block uses the same
 *     PreviewPanel UI surface — keyboard + pointer discoverability.
 *
 * The actual VS Code Markdown Preview webview cannot be driven by Playwright
 * without the extension host. Instead, tests B18-2 through B18-5 use the
 * existing prototype-editor harness (same HTML as the Markdown block panel
 * since both open PreviewPanel).
 *
 * Extension-host save round-trip coverage is in:
 *   src/__tests__/writeback/markdown-anchor.test.ts
 *   src/__tests__/writeback/markdown-fence-boundary.test.ts
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_EDITOR_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-editor-harness.html');

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

// ---------------------------------------------------------------------------
// Rendered Markdown Preview HTML — entry affordance present
// ---------------------------------------------------------------------------

test('B18-1. c4xPlugin source emits the "Edit C4 diagram" HTML template for c4x fences', () => {
    // Read the plugin source directly to verify the edit affordance template.
    // We cannot import c4xPlugin at Playwright test runtime (it has a
    // transitive vscode dependency via SvgBuilder → ThemeManager), but we can
    // assert the template is present in the source.
    const pluginSource = fs.readFileSync(
        path.join(ROOT, 'src/markdown/c4xPlugin.ts'),
        'utf8'
    );

    // The plugin source must include the edit toolbar template.
    expect(pluginSource).toContain('c4x-edit-toolbar');
    expect(pluginSource).toContain('c4x.editMarkdownBlock');
    expect(pluginSource).toContain('Edit C4 diagram');
    expect(pluginSource).toContain('command:c4x.editMarkdownBlock');

    // Verify the CSS provides the toolbar affordance.
    const cssSource = fs.readFileSync(
        path.join(ROOT, 'assets/styles/markdown.css'),
        'utf8'
    );
    expect(cssSource).toContain('.c4x-edit-toolbar');
    expect(cssSource).toContain('.c4x-edit-button');
    // Toolbar is discoverable on hover AND focus (keyboard).
    expect(cssSource).toContain('.c4x-diagram:hover .c4x-edit-toolbar');
    expect(cssSource).toContain('.c4x-diagram:focus-within .c4x-edit-toolbar');
});

// ---------------------------------------------------------------------------
// Editor panel UI — Markdown block panel uses same PreviewPanel interface
// ---------------------------------------------------------------------------

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

test('B18-2. Markdown block editor panel exposes the same "Edit C4 Diagram" button as the native panel', async ({ page }) => {
    await loadHarness(page);
    const toggle = page.locator('#toggle-layout');
    await expect(toggle).toBeVisible();
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveText('Edit C4 Diagram');
    // Keyboard-focusable.
    await toggle.focus();
    await expect(toggle).toBeFocused();
});

test('B18-3. Markdown block edit mode shows inspector sidebar and staged-changes pane', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    await expect(page.locator('#editor-sidebar')).toBeVisible();
    await expect(page.locator('#staged-changes-list')).toContainText('No changes staged');
    await expect(page.locator('#save-staged-changes')).toBeDisabled();
});

test('B18-4. Save affordance is keyboard-reachable after staging a change in Markdown block panel', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const node = page.locator('g.node[data-id="api"]');
    await node.focus();
    await page.keyboard.press('Enter');
    await expect(node).toHaveAttribute('aria-selected', 'true');
    await page.locator('#inspector-desc').fill('Keyboard-authored description from Markdown flow');
    await page.locator('#save-staged-changes').focus();
    await expect(page.locator('#save-staged-changes')).toBeFocused();
    await expect(page.locator('#save-staged-changes')).toBeEnabled();
});

test('B18-5. Markdown block panel: description change posts the correct writeback message', async ({ page }) => {
    await loadHarness(page);
    await enterEditMode(page);
    const node = page.locator('g.node[data-id="api"]');
    await node.focus();
    await page.keyboard.press('Enter');
    await page.locator('#inspector-desc').fill('Updated via Markdown entry');
    await page.locator('#save-staged-changes').click();
    const messages = await page.evaluate(() => {
        const win = window as Window & { __visualLayoutMessages?: unknown[] };
        return win.__visualLayoutMessages ?? [];
    });
    const save = (messages as Array<{ type?: string; edits?: Array<{ id: string; description?: string }> }>)
        .find(m => m.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toContainEqual(
        expect.objectContaining({ id: 'api', description: 'Updated via Markdown entry' })
    );
});
