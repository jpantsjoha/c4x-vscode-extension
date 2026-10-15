/// <reference lib="dom" />

/**
 * Issue #250 — the legend overlay must never cover the canvas toolbar.
 *
 * The installed walkthrough (#79, step J1.3c) put the preview in half of a
 * 1200 px window and entered Edit mode, which leaves a canvas 256 px wide.
 * The legend (bottom-right) then sat on top of the toolbar (bottom-left) and
 * swallowed the pointer hits for −, the zoom %, Fit and Connect.
 *
 * These assertions run against the production preview client in the
 * synthetic harness, at the narrow width from the walkthrough and at a wide
 * one, in a light and a dark theme:
 *   - the legend's box does not intersect the toolbar's box;
 *   - the whole toolbar stays inside the canvas (nothing clipped);
 *   - the hit target at the centre of every toolbar button is that button;
 *   - every toolbar button is reachable with Tab, in order.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');

const TOOLBAR_BUTTON_IDS = ['zoom-in', 'zoom-out', 'zoom-reset', 'zoom-fit', 'connect-mode'];

/** Dark-theme tokens, as a VS Code dark theme supplies them to the webview. */
const DARK_THEME_CSS = `:root {
  --vscode-editor-background: #1e1e1e;
  --vscode-foreground: #cccccc;
  --vscode-panel-border: #3c3c3c;
  --vscode-descriptionForeground: #9d9d9d;
  --vscode-focusBorder: #007fd4;
  --vscode-editorWidget-background: #252526;
  --vscode-widget-border: #454545;
  --vscode-widget-shadow: rgba(0, 0, 0, 0.36);
  --vscode-input-background: #3c3c3c;
  --vscode-input-foreground: #cccccc;
  --vscode-input-border: #3c3c3c;
}`;

type Theme = 'light' | 'dark';

interface Scenario {
    name: string;
    /** Viewport width; with edit mode the 320 px sidebar takes its share. */
    width: number;
    editMode: boolean;
    /** Expected canvas width, so the scenario cannot silently drift. */
    canvasWidth: number;
}

const SCENARIOS: Scenario[] = [
    // The J1.3c geometry: a 576 px preview minus the 320 px inspector.
    { name: 'narrow (256 px canvas, edit mode)', width: 576, editMode: true, canvasWidth: 256 },
    { name: 'narrow (360 px canvas, preview mode)', width: 360, editMode: false, canvasWidth: 360 },
    { name: 'wide (1600 px canvas, edit mode)', width: 1920, editMode: true, canvasWidth: 1600 },
];

test.beforeAll(() => {
    execFileSync(process.execPath, [
        path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js'),
        HARNESS,
    ], { cwd: ROOT });
});

async function open(page: Page, scenario: Scenario, theme: Theme): Promise<void> {
    await page.setViewportSize({ width: scenario.width, height: 800 });
    await page.goto(url.pathToFileURL(HARNESS).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
    if (theme === 'dark') {
        await page.addStyleTag({ content: DARK_THEME_CSS });
        await page.evaluate(() => {
            document.body.classList.remove('vscode-light');
            document.body.classList.add('vscode-dark');
        });
    }
    if (scenario.editMode) {
        await page.locator('#toggle-layout').click();
        await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    }
    await expect(page.locator('#legend-overlay')).toBeVisible();
    const content = await page.locator('#content').boundingBox();
    expect(content!.width).toBeCloseTo(scenario.canvasWidth, 0);
}

function intersects(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number },
): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width &&
        a.y < b.y + b.height && b.y < a.y + a.height;
}

for (const theme of ['light', 'dark'] as const) {
    for (const scenario of SCENARIOS) {
        test(`[#250] ${theme}, ${scenario.name}: legend does not cover the toolbar`, async ({ page }) => {
            await open(page, scenario, theme);

            const legend = await page.locator('#legend-overlay').boundingBox();
            const toolbar = await page.locator('.canvas-toolbar').boundingBox();
            const content = await page.locator('#content').boundingBox();
            expect(legend).not.toBeNull();
            expect(toolbar).not.toBeNull();

            expect(
                intersects(legend!, toolbar!),
                `legend ${JSON.stringify(legend)} intersects toolbar ${JSON.stringify(toolbar)}`,
            ).toBe(false);

            // The whole toolbar is inside the canvas: #content clips overflow,
            // so a button past its edge would be cut off.
            expect(toolbar!.x).toBeGreaterThanOrEqual(content!.x);
            expect(toolbar!.x + toolbar!.width).toBeLessThanOrEqual(content!.x + content!.width);
            expect(toolbar!.y).toBeGreaterThanOrEqual(content!.y);
            expect(toolbar!.y + toolbar!.height).toBeLessThanOrEqual(content!.y + content!.height);

            // The legend stays inside the canvas too.
            expect(legend!.x).toBeGreaterThanOrEqual(content!.x);
            expect(legend!.x + legend!.width).toBeLessThanOrEqual(content!.x + content!.width);

            // Default anchors are kept (#98, audit Appendix B): toolbar
            // bottom-left and legend bottom-right, each 20 px in from the
            // canvas edges. The toolbar always owns the bottom line.
            const contentRight = content!.x + content!.width;
            const contentBottom = content!.y + content!.height;
            expect(toolbar!.x - content!.x).toBeCloseTo(20, 0);
            expect(contentBottom - (toolbar!.y + toolbar!.height)).toBeCloseTo(20, 0);
            expect(contentRight - (legend!.x + legend!.width)).toBeCloseTo(20, 0);
            if (legend!.width + toolbar!.width + 40 + 12 <= content!.width) {
                // Room for both on one line: they share its bottom edge.
                expect(contentBottom - (legend!.y + legend!.height)).toBeCloseTo(20, 0);
            } else {
                // No room: the legend stacks above the toolbar.
                expect(legend!.y + legend!.height).toBeLessThanOrEqual(toolbar!.y);
            }
        });

        test(`[#250] ${theme}, ${scenario.name}: every toolbar button takes the pointer hit`, async ({ page }) => {
            await open(page, scenario, theme);

            // elementFromPoint is exactly what the walkthrough measured: a
            // covered button reports the legend (or one of its children).
            const hits = await page.evaluate((ids) => ids.map(id => {
                const button = document.getElementById(id)!;
                const rect = button.getBoundingClientRect();
                const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
                return { id, hitsButton: hit !== null && button.contains(hit), hit: hit?.id || hit?.tagName || null };
            }), TOOLBAR_BUTTON_IDS);
            for (const hit of hits) {
                expect(hit.hitsButton, `#${hit.id} is covered by ${hit.hit}`).toBe(true);
            }

            // Playwright's own actionability check (visible, stable, receives
            // events) on every enabled button, then real clicks on Fit and −.
            for (const id of TOOLBAR_BUTTON_IDS) {
                const button = page.locator(`#${id}`);
                if (await button.isEnabled()) {
                    await button.click({ trial: true, timeout: 2_000 });
                }
            }
            await page.locator('#zoom-out').click({ timeout: 2_000 });
            await page.locator('#zoom-fit').click({ timeout: 2_000 });
        });

        test(`[#250] ${theme}, ${scenario.name}: toolbar buttons are reachable with Tab`, async ({ page }) => {
            await open(page, scenario, theme);

            await page.locator('#zoom-in').focus();
            await expect(page.locator('#zoom-in')).toBeFocused();
            const enabled: string[] = [];
            for (const id of TOOLBAR_BUTTON_IDS) {
                if (await page.locator(`#${id}`).isEnabled()) {
                    enabled.push(id);
                }
            }
            for (const id of enabled.slice(1)) {
                await page.keyboard.press('Tab');
                await expect(page.locator(`#${id}`)).toBeFocused();
            }
            // In edit mode Connect is enabled and must be among the stops.
            if (scenario.editMode) {
                expect(enabled).toContain('connect-mode');
            }
            // The legend follows the toolbar in the Tab order.
            await page.keyboard.press('Tab');
            await expect(page.locator('#legend-overlay')).toBeFocused();
        });
    }
}

test('[#250] a dragged legend sits beneath the toolbar, so it can never take a toolbar hit', async ({ page }) => {
    await open(page, SCENARIOS[2], 'light');
    const legend = page.locator('#legend-overlay');
    const toolbar = await page.locator('.canvas-toolbar').boundingBox();
    const before = await legend.boundingBox();

    // Drag the legend's top-left corner onto the toolbar's top-left corner.
    const grabX = before!.x + 10;
    const grabY = before!.y + 10;
    await page.mouse.move(grabX, grabY);
    await page.mouse.down();
    await page.mouse.move(toolbar!.x + 10, toolbar!.y + 10, { steps: 8 });
    await page.mouse.up();

    const after = await legend.boundingBox();
    expect(intersects(after!, toolbar!)).toBe(true);

    for (const id of TOOLBAR_BUTTON_IDS) {
        await page.locator(`#${id}`).click({ trial: true, timeout: 2_000 });
    }
});
