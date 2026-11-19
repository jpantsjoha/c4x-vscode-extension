/// <reference lib="dom" />

/**
 * The C4 shape set in the visual editor (#323): shapes survive drag, resize,
 * save and reload.
 *
 * The harness (test/visual-layout/generate-shape-harness.js) renders a real
 * C4X source through the host pipeline in the c4-model theme, so the editor
 * works on the exact shapes the host draws. Save goes through the real
 * writeback transaction; reload renders the saved source again.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-shape-harness.js');

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    'Person(customer, "Customer", "A bank customer")',
    'subgraph Banking {',
    '    Container(static, "Static Content", "Directory", $shape="Folder")',
    '    Container(ui, "UI", "Angular", $shape="WebBrowser")',
    '    Container(backend, "Backend", "Spring Boot", $shape="Terminal")',
    '    Container(statements, "Statement Store", "Amazon S3", $shape="Bucket")',
    '    Container(db, "Database", "MySQL", $shape="Cylinder")',
    '    Container(agent, "Agent", "Java", $shape="Person")',
    '}',
    'customer -->|Loads the UI from| static',
    'static -->|Delivers| ui',
    'ui -->|Calls| backend',
    'backend -->|Writes| statements',
    'backend -->|Reads| db',
    'agent -->|Helps| customer',
    '',
].join('\n');

/** Element id -> the outline the host draws for it. */
const EXPECTED_SHAPES: Record<string, string> = {
    customer: 'person', static: 'folder', ui: 'webBrowser', backend: 'terminal', statements: 'bucket', db: 'cylinder', agent: 'person',
};

interface PostedMessage { type?: string; revision?: string; edits?: Array<Record<string, unknown>> }

let workDir: string;
let sourcePath: string;

function render(revision: string): string {
    const out = path.join(workDir, `harness-${revision}.html`);
    execFileSync(process.execPath, [GENERATOR, 'render', sourcePath, out], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_REVISION: revision } });
    return out;
}

async function load(page: Page, harness: string): Promise<void> {
    await page.goto(url.pathToFileURL(harness).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 5_000 });
}

/** Each node's drawn outline: `data-shape`, or `cylinder` for the database class. */
function drawnShapes(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
        const out: Record<string, string> = {};
        document.querySelectorAll('#content g.node').forEach(node => {
            const id = node.getAttribute('data-id') ?? '';
            out[id] = node.getAttribute('data-shape') ?? (node.classList.contains('database') ? 'cylinder' : 'rect');
        });
        return out;
    });
}

/** The node's outline markup, so a drag can be shown to move it whole (a transform), not redraw it. */
function outlineMarkup(page: Page, id: string): Promise<string> {
    return page.evaluate(nodeId => {
        const node = document.querySelector(`#content g.node[data-id="${nodeId}"]`);
        return node ? Array.from(node.children).filter(child => child.tagName !== 'text').map(child => child.outerHTML).join('') : '';
    }, id);
}

/** End points of an edge's visible path. */
function edgeEnds(page: Page, id: string): Promise<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
    return page.evaluate(edgeId => {
        const pathEl = document.querySelector(`#content g.edge[data-id="${edgeId}"] path:not(.edge-hit-area)`);
        const d = pathEl?.getAttribute('d') ?? '';
        const n = (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
        return { from: { x: n[0], y: n[1] }, to: { x: n[n.length - 2], y: n[n.length - 1] } };
    }, id);
}

/** The folder's current box: dragged origin and drawn size. */
function folderBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate(() => {
        const node = document.querySelector('#content g.node[data-id="static"]') as SVGGElement & { dataset: DOMStringMap };
        const outline = node.querySelector(':scope > path') as SVGPathElement;
        const bbox = outline.getBBox();
        return { x: Number(node.dataset.currentX), y: Number(node.dataset.currentY), width: bbox.width, height: bbox.height };
    });
}

/**
 * True when `p` is on the folder outline: the body's top edge right of the
 * tab, the tab's top, either side, or the bottom. Proportions as drawn
 * (src/render/shapeGeometry.ts folderShapeMetrics), restated here.
 */
function onFolderOutline(p: { x: number; y: number }, box: { x: number; y: number; width: number; height: number }): boolean {
    const tol = 0.6;
    const tabH = Math.min(14, box.height * 0.12);
    const tabX0 = box.x + box.width * 0.03;
    const tabX1 = box.x + box.width * 0.35;
    const within = (v: number, lo: number, hi: number) => v >= lo - tol && v <= hi + tol;
    return (Math.abs(p.y - (box.y + tabH)) < tol && (within(p.x, tabX1, box.x + box.width) || within(p.x, box.x, tabX0)))
        || (Math.abs(p.y - box.y) < tol && within(p.x, tabX0, tabX1))
        || (Math.abs(p.y - (box.y + box.height)) < tol && within(p.x, box.x, box.x + box.width))
        || ((Math.abs(p.x - box.x) < tol || Math.abs(p.x - (box.x + box.width)) < tol) && within(p.y, box.y + tabH, box.y + box.height));
}

function messages(page: Page): Promise<PostedMessage[]> {
    return page.evaluate(() => (window as Window & { __visualLayoutMessages?: PostedMessage[] }).__visualLayoutMessages ?? []);
}

test.beforeEach(() => {
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-shapes-'));
    sourcePath = path.join(workDir, 'shapes.c4x');
    fs.writeFileSync(sourcePath, SOURCE, 'utf8');
});

test.afterEach(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
});

test('[#323] shapes survive drag, resize, save and reload in the visual editor', async ({ page }) => {
    await load(page, render('1'));
    expect(await drawnShapes(page)).toEqual(EXPECTED_SHAPES);
    await page.locator('#toggle-layout').click();

    // Drag the folder by pointer.
    const folder = page.locator('#content g.node[data-id="static"]');
    const before = await outlineMarkup(page, 'static');
    const box = await folder.boundingBox();
    if (!box) { throw new Error('no folder box'); }
    // Grab the folder near its lower-left corner, clear of the arrows drawn over
    // it, and drop it below the UI, so its arrow to the UI leaves from the
    // folder's top, where the outline sits below the bounding box (the tab).
    const uiBox = await page.locator('#content g.node[data-id="ui"]').boundingBox();
    if (!uiBox) { throw new Error('no ui box'); }
    const grab = { x: box.x + 15, y: box.y + box.height - 12 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x - 40, grab.y + (uiBox.y + uiBox.height + 60 - box.y), { steps: 8 });
    await page.mouse.up();
    await expect(page.locator('#layout-status')).toHaveAttribute('data-state', 'dirty');
    // The shape moved whole: same outline markup, carried by the group transform.
    expect(await outlineMarkup(page, 'static')).toBe(before);
    expect(await folder.getAttribute('transform')).toMatch(/^translate\(-?\d/);
    expect(await folder.getAttribute('data-shape')).toBe('folder');
    // The arrows into and out of the folder end on its outline after the drag, not on its bounding box.
    const fbox = await folderBox(page);
    const toFolder = await edgeEnds(page, 'rel-0');   // customer -> static
    const fromFolder = await edgeEnds(page, 'rel-1'); // static -> ui, leaving from the folder's top
    expect(fromFolder.from.y).toBeLessThan(fbox.y + fbox.height / 2);
    expect(onFolderOutline(toFolder.to, fbox), `rel-0 ends at ${JSON.stringify(toFolder.to)}; folder ${JSON.stringify(fbox)}`).toBe(true);
    expect(onFolderOutline(fromFolder.from, fbox), `rel-1 starts at ${JSON.stringify(fromFolder.from)}`).toBe(true);
    // The bounding-box top centre is not on the outline (the tab ends left of centre), so the check has teeth.
    expect(onFolderOutline({ x: fbox.x + fbox.width / 2, y: fbox.y }, fbox)).toBe(false);

    // Resize the subgraph frame by keyboard.
    const frame = page.locator('#content g.boundary').first();
    await frame.focus();
    await page.keyboard.press('Enter');
    const width0 = Number(await frame.getAttribute('data-current-width'));
    for (let i = 0; i < 4; i++) { await page.keyboard.press('Shift+ArrowRight'); }
    for (let i = 0; i < 2; i++) { await page.keyboard.press('Shift+ArrowDown'); }
    const width1 = Number(await frame.getAttribute('data-current-width'));
    expect(width1).toBeGreaterThan(width0);
    expect(await drawnShapes(page)).toEqual(EXPECTED_SHAPES);

    // Save: the posted edits go through the real writeback transaction.
    await page.locator('#save-staged-changes').click();
    const save = (await messages(page)).find(m => m.type === 'visualLayout.applySemanticEdits');
    expect(save).toBeDefined();
    const moved = save!.edits!.find(e => e.id === 'static') as { x: number; y: number };
    expect(moved).toBeDefined();
    const resized = save!.edits!.find(e => typeof e.boundaryId === 'string') as { w: number };
    expect(resized).toBeDefined();
    const messagePath = path.join(workDir, 'save.json');
    fs.writeFileSync(messagePath, JSON.stringify(save), 'utf8');
    execFileSync(process.execPath, [GENERATOR, 'save', sourcePath, messagePath], { cwd: ROOT });
    const saved = fs.readFileSync(sourcePath, 'utf8');
    for (const shape of ['Folder', 'WebBrowser', 'Terminal', 'Bucket', 'Cylinder', 'Person']) {
        expect(saved).toContain(`$shape="${shape}"`);
    }
    expect(saved).toMatch(/Container\(static, "Static Content", "Directory", \$shape="Folder", \$x="\d+", \$y="\d+"\)/);
    expect(saved).toMatch(/subgraph Banking \$w="\d+", \$h="\d+" \{/);

    // Reload from the saved source: every shape is drawn again, the folder where it was dropped.
    await load(page, render('2'));
    expect(await drawnShapes(page)).toEqual(EXPECTED_SHAPES);
    const reloaded = await page.evaluate(() => {
        const node = document.querySelector('#content g.node[data-id="static"]') as SVGGElement & { dataset: DOMStringMap };
        return { x: Number(node.dataset.currentX), y: Number(node.dataset.currentY) };
    });
    expect(reloaded).toEqual({ x: moved.x, y: moved.y });
    const frameWidth = Number(await page.locator('#content g.boundary').first().getAttribute('data-current-width'));
    expect(frameWidth).toBeGreaterThanOrEqual(resized.w);
});
