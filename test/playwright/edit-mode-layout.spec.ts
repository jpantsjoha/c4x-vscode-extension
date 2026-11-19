/// <reference lib="dom" />

/**
 * The first drag and Save in a diagram with grown boxes moves only what the
 * user moved (#340 review round 3).
 *
 * Boxes grow for wrapped text only in a diagram with no saved geometry; the
 * first Save of a move adds saved geometry, and the diagram is then laid out
 * at the standard sizes. Entering edit mode therefore asks the host for the
 * standard-size layout first, so a drag starts from the layout Save produces.
 * The payloads come from the real host pipeline in both modes; Save is applied
 * by the extension's writeback planner and the saved source laid out again.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const LONG = 'handles payments for customers and '.repeat(20).trim();

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    `    Container(a, "A", "Java", "${LONG}")`,
    '    Container(b, "B", "Java", "Short")',
    '    Container(c, "C", "Java", "Short")',
    '    a -->|Calls| b',
    '    b -->|Calls| c',
    '',
].join('\n');

interface Positions { elements: Record<string, { x: number; y: number }> }

function run(args: string[]): string {
    return execFileSync(process.execPath, [GENERATOR, ...args], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: 'classic' } }).toString();
}

async function canvasPositions(page: Page): Promise<Record<string, { x: number; y: number; height: number }>> {
    return page.evaluate(() => Object.fromEntries(Array.from(document.querySelectorAll('#content g.node')).map(node => {
        const el = node as SVGGElement;
        const rect = el.querySelector(':scope > rect')!;
        const x = Number(el.dataset.currentX ?? rect.getAttribute('x'));
        const y = Number(el.dataset.currentY ?? rect.getAttribute('y'));
        return [el.dataset.id!, { x, y, height: Number(rect.getAttribute('height')) }];
    })));
}

test('[#340] the first drag and Save in a diagram with grown boxes moves only the dragged element', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);

    // View mode: the long description grows a.
    const viewMode = await canvasPositions(page);
    expect(viewMode.a.height).toBeGreaterThan(130);

    // Entering edit mode waits for the standard-size layout, then starts editing.
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const posted = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: Array<{ type?: string; mode?: string }> }).__visualLayoutMessages ?? []);
    expect(posted.filter(m => m.type === 'visualLayout.layoutMode').map(m => m.mode)).toEqual(['edit']);
    const beforeDrag = await canvasPositions(page);
    expect(beforeDrag.a.height).toBe(130);
    // Long text is shortened, with the full text on hover.
    await expect(page.locator('#content g.node[data-id="a"] text[data-field="description"] title')).toHaveText(LONG);

    // Drag a by (+60, +20).
    const box = await page.locator('#content g.node[data-id="a"]').boundingBox();
    if (!box) { throw new Error('no box for a'); }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 20, { steps: 6 });
    await page.mouse.up();
    const dropped = await canvasPositions(page);
    expect(dropped.a.x).toBeGreaterThan(beforeDrag.a.x);

    await page.locator('#save-staged-changes').click();
    const messages = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: Array<{ type?: string; edits?: unknown[] }> }).__visualLayoutMessages ?? []);
    const save = messages.find(m => m.type === 'visualLayout.applySemanticEdits');
    expect(save?.edits).toEqual([expect.objectContaining({ id: 'a', x: dropped.a.x, y: dropped.a.y })]);

    // Save with the writeback planner and lay the saved source out on the host.
    const editsPath = testInfo.outputPath('edits.json');
    writeFileSync(editsPath, JSON.stringify(save?.edits ?? []));
    const saved: Positions = JSON.parse(run(['save-layout', sourcePath, editsPath, testInfo.outputPath('after.c4x')]));
    expect(saved.elements.a).toEqual({ x: dropped.a.x, y: dropped.a.y });
    for (const id of ['b', 'c']) {
        expect(saved.elements[id], `${id} moved on Save`).toEqual({ x: beforeDrag[id].x, y: beforeDrag[id].y });
    }
});

async function dragBy(page: Page, id: string, dx: number, dy: number): Promise<void> {
    const box = await page.locator(`#content g.node[data-id="${id}"]`).boundingBox();
    if (!box) { throw new Error(`no box for ${id}`); }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 6 });
    await page.mouse.up();
}

async function saveAndLayOut(page: Page, testInfo: { outputPath(name: string): string }, sourcePath: string): Promise<{ edits: Array<{ id: string; x?: number; y?: number }>; saved: Positions }> {
    await page.locator('#save-staged-changes').click();
    const messages = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: Array<{ type?: string; edits?: unknown[] }> }).__visualLayoutMessages ?? []);
    const save = messages.find(m => m.type === 'visualLayout.applySemanticEdits');
    const edits = (save?.edits ?? []) as Array<{ id: string; x?: number; y?: number }>;
    const editsPath = testInfo.outputPath('edits.json');
    writeFileSync(editsPath, JSON.stringify(edits));
    return { edits, saved: JSON.parse(run(['save-layout', sourcePath, editsPath, testInfo.outputPath('after.c4x')])) };
}

test('[#340] while the edit layout is delayed nothing can be dragged; once it arrives, drag and Save move only the dragged element', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.evaluate(() => { (window as Window & { __visualLayoutHoldModeRender?: boolean }).__visualLayoutHoldModeRender = true; });

    await page.locator('#toggle-layout').click();
    await expect(page.locator('#layout-status')).toContainText('Preparing the editor');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    // Well past the old five-second fallback: still no editing on the grown layout.
    await page.waitForTimeout(5600);
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    const held = await canvasPositions(page);
    expect(held.a.height).toBeGreaterThan(130);
    await dragBy(page, 'a', 60, 20);
    expect(await canvasPositions(page)).toEqual(held);
    await expect(page.locator('#staged-changes-list')).not.toContainText('moved');

    await page.evaluate(() => (window as Window & { __visualLayoutReleaseModeRender?: () => void }).__visualLayoutReleaseModeRender?.());
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const beforeDrag = await canvasPositions(page);
    expect(beforeDrag.a.height).toBe(130);
    await dragBy(page, 'a', 60, 20);
    const dropped = await canvasPositions(page);
    const { saved } = await saveAndLayOut(page, testInfo, sourcePath);
    expect(saved.elements.a).toEqual({ x: dropped.a.x, y: dropped.a.y });
    for (const id of ['b', 'c']) { expect(saved.elements[id], `${id} moved on Save`).toEqual({ x: beforeDrag[id].x, y: beforeDrag[id].y }); }
});

test('[#340] a draft restored after a reload is applied to the edit layout; dragging on and Save move only the dragged element', async ({ page, browser }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const editLayout = await canvasPositions(page);
    await dragBy(page, 'a', 60, 20);
    const firstDrop = await canvasPositions(page);
    const state = await page.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState);
    expect(state).toBeTruthy();

    // Reload: a new webview with the persisted draft; the host's first render is the view layout.
    const reloaded = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await reloaded.addInitScript(saved => { (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState = saved; }, state);
    await reloaded.goto(url.pathToFileURL(harnessPath).href);
    await expect(reloaded.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    // The draft is back (as before #340, restored moves are listed and saved; the
    // canvas draws the source positions), on the standard-size layout.
    await expect(reloaded.locator('#staged-changes-list')).toContainText(`Moved to ${firstDrop.a.x}, ${firstDrop.a.y}`);
    const restored = await canvasPositions(reloaded);
    expect(restored.a.height).toBe(130);
    for (const id of ['b', 'c']) { expect(restored[id]).toEqual(editLayout[id]); }
    const modes = await reloaded.evaluate(() => ((window as Window & { __visualLayoutMessages?: Array<{ type?: string; mode?: string }> }).__visualLayoutMessages ?? [])
        .filter(m => m.type === 'visualLayout.layoutMode').map(m => m.mode));
    expect(modes).toEqual(['edit']);

    await dragBy(reloaded, 'a', 40, 10);
    const secondDrop = await canvasPositions(reloaded);
    const { saved } = await saveAndLayOut(reloaded, testInfo, sourcePath);
    expect(saved.elements.a).toEqual({ x: secondDrop.a.x, y: secondDrop.a.y });
    for (const id of ['b', 'c']) { expect(saved.elements[id], `${id} moved on Save`).toEqual({ x: editLayout[id].x, y: editLayout[id].y }); }
    await reloaded.close();
});

test('[#340] a diagram whose boxes did not grow enters edit mode at once, with no layout-mode render', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('fits.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE.replace(LONG, 'Short'));
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    const before = await canvasPositions(page);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true', { timeout: 200 });
    await page.waitForTimeout(300);
    expect(await canvasPositions(page)).toEqual(before);
    await expect(page.locator('#layout-status')).not.toContainText('Preparing');
});

test('[#340] while a restored draft waits for the edit layout, zooming does not overwrite the stored draft', async ({ page, browser }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await dragBy(page, 'a', 60, 20);
    const state = await page.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState) as { stagedEdits: unknown[] };
    expect(state.stagedEdits.length).toBe(1);

    const reloaded = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await reloaded.addInitScript(saved => {
        const w = window as Window & { __visualLayoutSavedState?: unknown; __visualLayoutHoldModeRender?: boolean };
        w.__visualLayoutSavedState = saved;
        w.__visualLayoutHoldModeRender = true;
    }, state);
    await reloaded.goto(url.pathToFileURL(harnessPath).href);
    await expect(reloaded.locator('#layout-status')).toContainText('Restoring your draft');
    await reloaded.locator('#zoom-in').click();
    await reloaded.locator('#zoom-in').click();
    const stored = await reloaded.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState);
    expect(stored).toEqual(state);
    await reloaded.evaluate(() => (window as Window & { __visualLayoutReleaseModeRender?: () => void }).__visualLayoutReleaseModeRender?.());
    await expect(reloaded.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await expect(reloaded.locator('#staged-changes-list')).toContainText('Moved to');
    await reloaded.close();
});

test('[#340] a view render already in flight when Edit is clicked does not cancel the request', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.evaluate(() => { (window as Window & { __visualLayoutHoldModeRender?: boolean }).__visualLayoutHoldModeRender = true; });
    await page.locator('#toggle-layout').click();
    // The stale view render lands first.
    await page.evaluate(() => {
        const w = window as Window & { __visualLayoutRenderPayload?: { __modes: { view: unknown } } };
        window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload!.__modes.view, refresh: true }, '*');
    });
    await expect(page.locator('#layout-status')).toContainText('Preparing the editor');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    await page.evaluate(() => (window as Window & { __visualLayoutReleaseModeRender?: () => void }).__visualLayoutReleaseModeRender?.());
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    expect((await canvasPositions(page)).a.height).toBe(130);
});

test('[#340] a held draft is never discarded when the source changes before the edit layout arrives; new changes replace it', async ({ page, browser }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await dragBy(page, 'a', 60, 20);
    const state = await page.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState) as { stagedEdits: unknown[]; scope: string };
    expect(state.stagedEdits.length).toBe(1);

    const reloaded = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await reloaded.addInitScript(saved => {
        const w = window as Window & { __visualLayoutSavedState?: unknown; __visualLayoutHoldModeRender?: boolean };
        w.__visualLayoutSavedState = saved;
        w.__visualLayoutHoldModeRender = true;
    }, state);
    await reloaded.goto(url.pathToFileURL(harnessPath).href);
    await expect(reloaded.locator('#layout-status')).toContainText('Restoring your draft');
    // The source changes while the edit layout is on its way: the edit render carries another scope.
    await reloaded.evaluate(() => {
        const w = window as Window & { __visualLayoutRenderPayload?: { __modes: { edit: { scope: string } } }; __visualLayoutReleaseModeRender?: () => void };
        w.__visualLayoutRenderPayload!.__modes.edit.scope = 'file:///host-layout-harness.c4x#changed-source';
        w.__visualLayoutReleaseModeRender!();
    });
    await expect(reloaded.locator('#layout-status')).toContainText('has not been applied');
    expect(await reloaded.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState)).toEqual(state);
    await expect(reloaded.locator('#staged-changes-list')).not.toContainText('Moved to');

    // Staging new changes is the user's choice to replace it.
    await expect(reloaded.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await dragBy(reloaded, 'b', 30, 0);
    await expect.poll(() => reloaded.evaluate(() => ((window as Window & { __visualLayoutSavedState?: { scope?: string } }).__visualLayoutSavedState || {}).scope))
        .toBe('file:///host-layout-harness.c4x#changed-source');
    const replaced = await reloaded.evaluate(() => (window as Window & { __visualLayoutSavedState?: unknown }).__visualLayoutSavedState) as { stagedEdits: Array<{ id: string }>; scope: string };
    expect(replaced.scope).toBe('file:///host-layout-harness.c4x#changed-source');
    expect(replaced.stagedEdits.map(e => e.id)).toEqual(['b']);
    await reloaded.close();
});

test('[#340] a source edit of the same diagram keeps edit mode on; another diagram leaves it', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');

    // The host re-renders after a clean source edit: same document, new source fingerprint in the scope.
    const rerender = (scope: string, identity: string) => page.evaluate(({ scope, identity }) => {
        const w = window as Window & { __visualLayoutRenderPayload?: { __modes: { edit: Record<string, unknown> } } };
        window.postMessage({ type: 'render', payload: { ...w.__visualLayoutRenderPayload!.__modes.edit, scope, diagramIdentity: identity }, refresh: true }, '*');
    }, { scope, identity });
    await rerender('file:///host-layout-harness.c4x#c4x-native:m:EDITED', 'file:///host-layout-harness.c4x');
    await page.waitForTimeout(200);
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');

    await rerender('file:///other.c4x#c4x-native:m:X', 'file:///other.c4x');
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
});

const OTHER = [
    '%%{ c4: container }%%',
    'graph TB',
    `    Container(queue, "Queue", "RabbitMQ", "${LONG}")`,
    '    Container(worker, "Worker", "Go", "Short")',
    '    queue -->|Feeds| worker',
    '',
].join('\n');

function otherPayloads(testInfo: { outputPath(name: string): string }): { view: Record<string, unknown>; edit: Record<string, unknown> } {
    const otherPath = testInfo.outputPath('other.c4x');
    writeFileSync(otherPath, OTHER);
    return JSON.parse(run(['payload', otherPath]));
}

async function postRender(page: Page, payload: Record<string, unknown>): Promise<void> {
    await page.evaluate(p => window.postMessage({ type: 'render', payload: p, refresh: true }, '*'), payload);
}

test('[#340] fences swapped under edit mode: the same ordinal now shows another diagram, so edit mode leaves', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    const other = otherPayloads(testInfo);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    // Same document and ordinal (identity), different diagram; the host saw a change outside the fence body.
    await postRender(page, { ...other.edit, diagramIdentity: 'file:///host-layout-harness.c4x', scope: 'file:///host-layout-harness.c4x#swapped', sameDiagramEdit: { since: null, value: false } });
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#content g.node[data-id="queue"]')).toHaveCount(1);
});

const SHARED_IDS = [
    '%%{ c4: container }%%',
    'graph TB',
    `    Container(a, "A", "Java", "${LONG}")`,
    '    Container(b, "B", "Java", "Short")',
    '    Container(queue, "Queue", "RabbitMQ", "Short")',
    '    a -->|Calls| b',
    '    b -->|Feeds| queue',
    '',
].join('\n');

test('[#340] two fences that share element ids, swapped under edit mode: without the host\'s same-diagram flag edit mode leaves', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    const swappedPath = testInfo.outputPath('swapped.c4x');
    writeFileSync(sourcePath, SOURCE);
    writeFileSync(swappedPath, SHARED_IDS);
    run(['harness', sourcePath, harnessPath]);
    const swapped = JSON.parse(run(['payload', swappedPath])) as { edit: Record<string, unknown> };
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    // Same identity and view type, overlapping ids (a, b); the host did not prove the change stayed inside.
    const { sameDiagramEdit: _flag, ...withoutFlag } = swapped.edit;
    await postRender(page, { ...withoutFlag, scope: 'file:///host-layout-harness.c4x#swapped-shared' });
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#content g.node[data-id="queue"]')).toHaveCount(1);
});

test('[#340] an edit layout for another document, after switching away during preparation, does not enter edit mode', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    const other = otherPayloads(testInfo);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.evaluate(() => { (window as Window & { __visualLayoutHoldModeRender?: boolean }).__visualLayoutHoldModeRender = true; });
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#layout-status')).toContainText('Preparing the editor');
    // The user switches to document B; the host (still in edit mode) answers with B's edit layout.
    await postRender(page, { ...other.view, diagramIdentity: 'file:///other.c4x', scope: 'file:///other.c4x#s' });
    await postRender(page, { ...other.edit, diagramIdentity: 'file:///other.c4x', scope: 'file:///other.c4x#s' });
    await page.waitForTimeout(200);
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    const modes = await page.evaluate(() => ((window as Window & { __visualLayoutMessages?: Array<{ type?: string; mode?: string }> }).__visualLayoutMessages ?? [])
        .filter(m => m.type === 'visualLayout.layoutMode').map(m => m.mode));
    // The request, then 'view' (repeated when the stale edit layout arrives): never 'edit' again.
    expect(modes[0]).toBe('edit');
    expect(modes.length).toBeGreaterThanOrEqual(2);
    expect(modes.slice(1).every(m => m === 'view')).toBe(true);
});

test('[#340] an edit layout reaching a webview that is not editing (a reloaded webview) tells the host to leave edit mode', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    run(['harness', sourcePath, harnessPath]);
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null);
    await page.evaluate(() => {
        const w = window as Window & { __visualLayoutRenderPayload?: { __modes: { edit: Record<string, unknown> } } };
        window.postMessage({ type: 'render', payload: w.__visualLayoutRenderPayload!.__modes.edit, refresh: true }, '*');
    });
    await expect.poll(() => page.evaluate(() => ((window as Window & { __visualLayoutMessages?: Array<{ type?: string; mode?: string }> }).__visualLayoutMessages ?? [])
        .filter(m => m.type === 'visualLayout.layoutMode').map(m => m.mode))).toEqual(['view']);
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
});
