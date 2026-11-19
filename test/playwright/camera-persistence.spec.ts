/// <reference lib="dom" />

/**
 * Issue #167 — the camera must survive a reload, and it must win over auto-fit.
 *
 * `e7b2a68` put zoom/panX/panY into the persisted draft state and restored them
 * on first render, but `persistState()` had exactly one caller — the staged
 * changes list — so the camera was written only when an edit changed. A reload
 * therefore restored the viewport as of the user's last EDIT, not where they
 * were looking.
 *
 * The harness's `vscode` mock now keeps state in memory, so a reload can be
 * simulated by seeding `window.__visualLayoutPersistedState` before load.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as path from 'path';
import { readFileSync, writeFileSync } from 'fs';
import * as url from 'url';

interface PersistedState {
    schemaVersion: number;
    scope?: string;
    editMode: boolean;
    selectedNodeId: string | null;
    stagedEdits: Array<{ id: string; x?: number; y?: number }>;
    zoom?: number;
    panX?: number;
    panY?: number;
}

declare global {
    interface Window {
        __visualLayoutPersistedState?: PersistedState | null;
        __visualLayoutRenderPayload?: { scope?: string };
    }
}

const ROOT = path.resolve(__dirname, '../..');
const HARNESS = process.env.C4X_VISUAL_LAYOUT_HARNESS ??
    path.join(ROOT, 'test/visual-layout/prototype-harness.html');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-prototype-harness.js');

function generateHarness(harnessPath: string, scope?: string): void {
    execFileSync(process.execPath, [GENERATOR, harnessPath], {
        cwd: ROOT,
        env: scope === undefined
            ? process.env
            : { ...process.env, C4X_HARNESS_SCOPE: scope },
    });
}

test.beforeAll(() => {
    generateHarness(HARNESS);
});

async function loadHarness(page: Page, harnessPath: string = HARNESS): Promise<void> {
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, {
        timeout: 5_000,
    });
}

function viewBox(page: Page): Promise<string> {
    return page.evaluate(
        () => document.querySelector('#svg-container svg')?.getAttribute('viewBox') ?? '',
    );
}

function zoomLabel(page: Page): Promise<string> {
    return page.locator('#zoom-reset').innerText();
}

function persistedState(page: Page): Promise<PersistedState | null> {
    return page.evaluate(() => window.__visualLayoutPersistedState ?? null);
}

/** Drag on empty canvas, which is what the pan handler listens for. */
async function pan(page: Page, dx: number, dy: number): Promise<void> {
    const container = await page.locator('#svg-container').boundingBox();
    if (!container) {
        throw new Error('no svg container');
    }
    const startX = container.x + 12;
    const startY = container.y + container.height - 12;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + dx, startY + dy, { steps: 6 });
    await page.mouse.up();
}

test('a zoom button persists the camera immediately', async ({ page }) => {
    await loadHarness(page);
    // The first render's settled persist writes the camera as opened, so the
    // baseline is the opening framing, not null.
    const before = await persistedState(page);
    expect(before).not.toBeNull();

    await page.locator('#zoom-in').click();

    const state = await persistedState(page);
    expect(state?.zoom).toBeGreaterThan(before?.zoom as number);
    expect(typeof state?.panX).toBe('number');
    expect(typeof state?.panY).toBe('number');
    expect(state?.stagedEdits).toEqual([]);
});

test('Fit and Reset persist the camera', async ({ page }) => {
    await loadHarness(page);

    await page.locator('#zoom-reset').click();
    const afterReset = await persistedState(page);
    expect(afterReset?.zoom).toBe(1);

    await page.locator('#zoom-fit').click();
    const afterFit = await persistedState(page);
    expect(afterFit?.zoom).not.toBe(1);
});

test('a wheel zoom persists once the gesture stops, not on every event', async ({ page }) => {
    await loadHarness(page);
    const container = await page.locator('#svg-container').boundingBox();
    if (!container) {
        throw new Error('no svg container');
    }
    await page.mouse.move(container.x + container.width / 2, container.y + container.height / 2);
    const before = await persistedState(page);
    const baselineZoom = before?.zoom as number;

    for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -60);
    }
    const liveZoom = await page.evaluate(
        () => Number((document.getElementById('zoom-reset')?.textContent ?? '').replace('%', '')) / 100,
    );
    expect(liveZoom).toBeGreaterThan(baselineZoom);
    // Debounced: the wheel changed the camera but has not written it yet.
    expect((await persistedState(page))?.zoom).toBe(baselineZoom);

    await expect.poll(() => persistedState(page).then(s => s?.zoom), { timeout: 2_000 })
        .toBeGreaterThan(baselineZoom);
});

test('pan end persists the camera, and a reload comes back to the same view', async ({ page }) => {
    await loadHarness(page);

    await page.locator('#zoom-in').click();
    await page.locator('#zoom-in').click();
    await pan(page, 90, -40);

    const saved = await persistedState(page);
    expect(saved).not.toBeNull();
    const expectedViewBox = await viewBox(page);
    const expectedZoom = await zoomLabel(page);

    // Reload with the state the client wrote, exactly as VS Code would hand it
    // back to a restored webview.
    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, saved as PersistedState);
    await loadHarness(page);

    // The harness payload has autoFitOnOpen: true, so the opening camera fits
    // the diagram — and the restored camera overrides it. That precedence is
    // the documented behaviour (#167).
    await expect.poll(() => viewBox(page), { timeout: 2_000 }).toBe(expectedViewBox);
    expect(await zoomLabel(page)).toBe(expectedZoom);
    await expect(page.locator('#layout-status')).not.toContainText('Diagram zoomed to fit');
    const restoredState = await persistedState(page);
    expect(restoredState).toMatchObject({
        zoom: saved?.zoom,
        panX: saved?.panX,
        panY: saved?.panY,
    });
});

test('a camera saved beside edits that no longer apply is not restored, and the user is told', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#zoom-in').click();
    const saved = await persistedState(page);
    expect(saved).not.toBeNull();

    const stale: PersistedState = {
        ...(saved as PersistedState),
        stagedEdits: [{ id: 'element_deleted_since', x: 10, y: 20 }],
    };

    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, stale);
    await loadHarness(page);

    await expect(page.locator('#layout-status')).toContainText(
        'Draft not restored: its 1 change refer',
    );
    // The camera came from a draft that no longer matches the diagram, so the
    // opening auto-fit frames the document instead.
    const fitted = await viewBox(page);
    await page.locator('#zoom-fit').click();
    expect(await viewBox(page)).toBe(fitted);
});

test('a partly stale draft restores what still applies and names what it dropped', async ({ page }) => {
    await loadHarness(page);
    const liveId = await page.locator('g.node').first().getAttribute('data-id');
    expect(liveId).toBeTruthy();
    const scope = await page.evaluate(() => window.__visualLayoutRenderPayload?.scope);
    expect(scope).toBeTruthy();

    const partly: PersistedState = {
        // Schema v2: a draft without the diagram identity of the panel that
        // wrote it is discarded rather than guessed at (#167 review).
        schemaVersion: 2,
        scope: scope as string,
        editMode: true,
        selectedNodeId: null,
        stagedEdits: [
            { id: liveId as string, x: 120, y: 140 },
            { id: 'element_deleted_since', x: 10, y: 20 },
        ],
    };

    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, partly);
    await loadHarness(page);

    await expect(page.locator('#layout-status')).toContainText(
        'Draft restored — 1 staged change; 1 no longer applies and was dropped.',
    );
});

test('a draft persisted under a different diagram scope is rejected wholesale', async ({ page }) => {
    // Fixture A: the default harness scope. Take the camera somewhere
    // non-default and let the client persist it.
    await loadHarness(page);
    await page.locator('#zoom-in').click();
    await page.locator('#zoom-in').click();
    await pan(page, 90, -40);
    const savedA = await persistedState(page);
    expect(savedA).not.toBeNull();
    expect(savedA?.scope).toBeTruthy();

    // Declare the harness is now showing a DIFFERENT diagram — the situation
    // the singleton preview panel is in after the user switches documents.
    // A separate harness file keeps the default-scope fixture untouched for
    // the other specs running in parallel.
    const SCOPE_B = 'file:///other-diagram.c4x';
    const harnessB = path.join(ROOT, 'test/visual-layout/prototype-harness.scope-b.html');
    generateHarness(harnessB, SCOPE_B);

    // Baseline: scope B with no persisted state opens with its own framing.
    await loadHarness(page, harnessB);
    const openingB = await viewBox(page);
    expect(openingB).not.toBe('');

    // Reload B carrying A's persisted draft: schema-valid, camera present,
    // and its edit ids could even exist in B — the scope alone must reject it.
    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, savedA as PersistedState);
    await loadHarness(page, harnessB);

    expect(await viewBox(page)).toBe(openingB);
    // The foreign draft is not kept: B's settled render overwrites it with
    // B's own clean state.
    const after = await persistedState(page);
    expect(after?.scope).toBe(SCOPE_B);
    expect(after?.stagedEdits).toEqual([]);
});

test('a fresh load persists the opening camera, so a reload keeps the same framing', async ({ page }) => {
    await loadHarness(page);
    const openingViewBox = await viewBox(page);
    const openingZoom = await zoomLabel(page);

    // The render's one persist must carry the framing actually in effect, not
    // the provisional default (zoom 1, pan 0,0) that staging-clear used to
    // write before the opening camera was applied (#167 review).
    const first = await persistedState(page);
    expect(first).not.toBeNull();
    expect(Math.round((first?.zoom as number) * 100) + '%').toBe(openingZoom);

    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, first as PersistedState);
    await loadHarness(page);

    expect(await viewBox(page)).toBe(openingViewBox);
    expect(await zoomLabel(page)).toBe(openingZoom);
});

test('a fully stale draft is replaced by the opening camera once, and stays framed on a second reload', async ({ page }) => {
    await loadHarness(page);
    const openingViewBox = await viewBox(page);
    const saved = await persistedState(page);
    expect(saved).not.toBeNull();

    // Every saved edit names an element the diagram no longer has: the whole
    // draft — including its camera — must be discarded.
    const stale: PersistedState = {
        ...(saved as PersistedState),
        stagedEdits: [{ id: 'element_deleted_since', x: 10, y: 20 }],
        zoom: 3,
        panX: 500,
        panY: 500,
    };
    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, stale);
    await loadHarness(page);

    // First load after the draft went stale: told once, framed by the
    // diagram's own opening camera, not by the stale camera.
    await expect(page.locator('#layout-status')).toContainText('Draft not restored');
    expect(await viewBox(page)).toBe(openingViewBox);

    // The discarded draft was overwritten by the settled persist, so a second
    // reload frames the diagram the same way and has nothing left to report.
    const settled = await persistedState(page);
    await page.addInitScript((state: PersistedState) => {
        window.__visualLayoutPersistedState = state;
    }, settled as PersistedState);
    await loadHarness(page);

    expect(await viewBox(page)).toBe(openingViewBox);
    await expect(page.locator('#layout-status')).not.toContainText('Draft not restored');
});

test('legacy drafts remain recoverable and never restore onto the first diagram automatically', async ({ page }) => {
    const legacy = {
        schemaVersion: 1, editMode: true, selectedNodeId: 'web', zoom: 2, panX: 12, panY: -8,
        stagedEdits: [{ id: 'web', x: 120, y: 80, addRelationship: [
            { targetId: 'api', label: 'Calls', relType: 'async', technology: 'HTTPS' },
        ] }],
    };
    await page.addInitScript(state => { window.__visualLayoutPersistedState = state; }, legacy);
    await loadHarness(page);
    await expect(page.getByRole('region', { name: 'Recover legacy draft' })).toBeVisible();
    expect(await persistedState(page)).toEqual(legacy);
    await expect(page.locator('#staged-changes-list')).not.toContainText('Added relationship');
    await page.locator('#zoom-in').click();
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'false');
    expect(await persistedState(page)).toEqual(legacy);
    // A different scope arriving before the choice still cannot claim the draft.
    await page.evaluate(() => {
        const payload = window.__visualLayoutRenderPayload!;
        window.postMessage({ type: 'render', payload: { ...payload, scope: 'file:///another.md#c4x-fence:other' } }, '*');
    });
    await expect(page.getByRole('region', { name: 'Recover legacy draft' })).toBeVisible();
    expect(await persistedState(page)).toEqual(legacy);
    await expect(page.locator('#staged-changes-list')).not.toContainText('Added relationship');
});

test('explicit legacy recovery retains connect fields and becomes scoped for the next reload', async ({ page }) => {
    const legacy = {
        schemaVersion: 1, editMode: true, selectedNodeId: null,
        stagedEdits: [{ id: 'web', x: 120, y: 80, addRelationship: [
            { targetId: 'api', label: 'Calls', relType: 'async', technology: 'HTTPS' },
        ] }],
    };
    await page.addInitScript(state => { window.__visualLayoutPersistedState = state; }, legacy);
    await loadHarness(page);
    await page.getByRole('button', { name: 'Restore legacy draft here', exact: true }).click();
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship web → api: Calls');
    await expect(page.locator('#layout-status')).toContainText('Legacy draft restored once');
    const scoped = await persistedState(page);
    expect(scoped).toMatchObject({ schemaVersion: 2, stagedEdits: legacy.stagedEdits });
    expect(scoped?.scope).toBeTruthy();
    await page.addInitScript(state => { window.__visualLayoutPersistedState = state; }, scoped);
    await page.reload();
    await expect(page.locator('#staged-changes-list')).toContainText('Added relationship web → api: Calls');
    await expect(page.getByRole('region', { name: 'Recover legacy draft' })).toHaveCount(0);
});

test('ambiguous fences warn and never write an unrestorable staged draft', async ({ page }, testInfo) => {
    const harness = testInfo.outputPath('ambiguous.html');
    generateHarness(harness, 'file:///twins.md#c4x-fence-ambiguous:same');
    await loadHarness(page, harness);
    await expect(page.locator('#layout-status')).toContainText('Draft persistence is unavailable');
    await page.locator('#toggle-layout').click();
    await page.locator('g.node[data-id="web"]').click();
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('#staged-changes-list')).toContainText('Moved');
    await expect(page.locator('#draft-persistence-notice')).toContainText('Save changes before reloading');
    expect(await persistedState(page)).toBeNull();
});

test('two hidden renders cannot replace a durable visible camera with a zero-sized framing', async ({ page }) => {
    await loadHarness(page);
    await page.locator('#zoom-in').click();
    const before = await persistedState(page);
    await page.evaluate(() => {
        document.getElementById('svg-container')!.style.display = 'none';
        window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
        window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
    });
    await expect(page.locator('#svg-container')).toBeHidden();
    expect(await persistedState(page)).toEqual(before);
    await page.evaluate(() => { document.getElementById('svg-container')!.style.display = ''; });
    await expect(page.locator('#svg-container')).toBeVisible();
    await expect.poll(() => viewBox(page)).not.toBe('0 0 0 0');
    expect((await persistedState(page))?.zoom).toBeGreaterThan(0);
});


test('a fresh hidden panel persists nothing until a usable viewport exists, even across renders', async ({ page }, testInfo) => {
    const harness = testInfo.outputPath('hidden.html');
    generateHarness(harness);
    writeFileSync(harness, readFileSync(harness, 'utf8').replace('</head>', '<style id="hide-viewport">#svg-container { display: none; }</style></head>'));
    await loadHarness(page, harness);
    await expect(page.locator('#svg-container')).toBeHidden();
    expect(await persistedState(page)).toBeNull();
    await page.evaluate(() => {
        window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
        window.postMessage({ type: 'render', payload: window.__visualLayoutRenderPayload }, '*');
    });
    await expect(page.locator('#svg-container')).toBeHidden();
    expect(await persistedState(page)).toBeNull();
    await page.evaluate(() => document.getElementById('hide-viewport')!.remove());
    await expect(page.locator('#svg-container')).toBeVisible();
    await expect.poll(() => persistedState(page)).not.toBeNull();
    expect((await persistedState(page))?.zoom).toBeGreaterThan(0);
});
