/// <reference lib="dom" />

/**
 * Deployment notation (#326): in the c4-model theme a deployment node's icon
 * sits at the bottom left beside its name and `[Deployment Node: technology]`,
 * and nested nodes reserve their label row so nothing overlaps. (The
 * infrastructure-node placement has no source spelling yet; unit tests cover it.) The payload comes from the real
 * host pipeline (C4X_HARNESS_THEME=c4-model); the editor must redraw a node's
 * label row on a live edit exactly where the host draws it after Save, and the
 * Export SVG file must place every icon where the preview does.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const FIXTURE = path.join(ROOT, 'src/__tests__/snapshots/fixtures/deployment-aws.c4x');
const ENV = { ...process.env, C4X_HARNESS_THEME: 'c4-model' };

interface Box { left: number; top: number; right: number; bottom: number }

async function loadHarness(page: Page, testInfo: { outputPath(name: string): string }): Promise<string> {
    const sourcePath = testInfo.outputPath('aws.c4x');
    const harnessPath = testInfo.outputPath('aws-harness.html');
    writeFileSync(sourcePath, readFileSync(FIXTURE, 'utf8'));
    execFileSync(process.execPath, [GENERATOR, 'harness', sourcePath, harnessPath], { cwd: ROOT, env: ENV });
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    return sourcePath;
}

interface NodeGeometry {
    /** Outline, in SVG user units, and on screen. */
    rect: { x: number; y: number; width: number; height: number };
    screenRect: Box;
    /** The icon group's screen box, if drawn. */
    icon: Box | null;
    placement: string | null;
    /** Each drawn text field: anchor, x, first baseline, screen box. */
    texts: Array<{ field: string; anchor: string; x: number; y: number; box: Box }>;
}

async function nodeGeometry(page: Page, id: string): Promise<NodeGeometry> {
    return page.evaluate((nodeId: string) => {
        const group = document.querySelector(`g.node[data-id="${nodeId}"]`);
        if (!group) { throw new Error(`no node ${nodeId}`); }
        // The outline: a rectangle, or a cylinder's body path for a database.
        const rect = (group.querySelector(':scope > rect') ?? group.querySelector(':scope > path')) as SVGGraphicsElement;
        const box = (el: Element): { left: number; top: number; right: number; bottom: number } => {
            const r = el.getBoundingClientRect();
            return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
        };
        const num = (el: Element, a: string): number => Number(el.getAttribute(a));
        const icon = group.querySelector(':scope > .element-icon');
        return {
            rect: rect.tagName === 'rect'
                ? { x: num(rect, 'x'), y: num(rect, 'y'), width: num(rect, 'width'), height: num(rect, 'height') }
                : (({ x, y, width, height }) => ({ x, y, width, height }))(rect.getBBox()),
            screenRect: box(rect),
            icon: icon ? box(icon) : null,
            placement: icon ? icon.getAttribute('data-icon-placement') : null,
            texts: Array.from(group.querySelectorAll(':scope > text[data-field]')).map(t => ({
                field: t.getAttribute('data-field') ?? '',
                anchor: t.getAttribute('text-anchor') ?? '',
                x: num(t, 'x'),
                y: num(t, 'y'),
                box: box(t),
            })),
        };
    }, id);
}

function overlaps(a: Box, b: Box): boolean {
    return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/** A label row: left-aligned 10 px plus the icon slot in, last baseline 10 px above the bottom edge, icon beside it. */
function expectLabelRow(g: NodeGeometry, iconSlot: number): void {
    expect(g.texts.length).toBeGreaterThanOrEqual(2);
    for (const t of g.texts) {
        expect(t.anchor).toBe('start');
        expect(t.x).toBe(g.rect.x + 10 + iconSlot);
    }
    expect(g.texts[g.texts.length - 1].y).toBe(g.rect.y + g.rect.height - 10);
    // On screen: the label's ink sits inside the outline, in its bottom part.
    for (const t of g.texts) {
        expect(t.box.left).toBeGreaterThan(g.screenRect.left);
        expect(t.box.bottom).toBeLessThanOrEqual(g.screenRect.bottom);
    }
    if (iconSlot > 0) {
        expect(g.placement).toBe('label-row');
        const icon = g.icon!;
        // Bottom left: just inside the left edge, its bottom just above the bottom edge.
        expect(icon.left).toBeGreaterThan(g.screenRect.left);
        expect(icon.left - g.screenRect.left).toBeLessThan(20);
        expect(icon.bottom).toBeLessThan(g.screenRect.bottom);
        expect(g.screenRect.bottom - icon.bottom).toBeLessThan(16);
        // Beside the text, never under it.
        for (const t of g.texts) { expect(t.box.left).toBeGreaterThanOrEqual(icon.right); }
    }
}

test('[#326] nested deployment nodes draw the icon bottom left beside the name and type line', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    for (const id of ['asg', 'ec2', 'rds']) {
        const g = await nodeGeometry(page, id);
        expectLabelRow(g, 40);
        expect(g.texts[0].field).toBe('label');
        expect(g.texts[1].field).toBe('technology');
    }
    // A node with no icon starts its label at the left margin.
    for (const id of ['aws', 'region', 'customerComputer', 'browser']) {
        const g = await nodeGeometry(page, id);
        expect(g.icon).toBeNull();
        expectLabelRow(g, 0);
    }
    const ec2 = await page.locator('g.node[data-id="ec2"] text[data-field="technology"]').textContent();
    expect(ec2).toBe('[Deployment Node: Ubuntu 22.04 LTS]');
});

test('[#326] a leaf deployment node draws the same label row, its icon beside the text', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    for (const id of ['dns', 'lb']) {
        const g = await nodeGeometry(page, id);
        expect(g.texts.map(t => t.field)).toEqual(['label', 'technology', 'description']);
        for (const t of g.texts) {
            expect(t.anchor).toBe('start');
            expect(t.x).toBe(g.rect.x + 10 + 40);
        }
        expect(g.placement).toBe('label-row');
        for (const t of g.texts) { expect(t.box.left).toBeGreaterThanOrEqual(g.icon!.right); }
    }
    const dns = await page.locator('g.node[data-id="dns"] text[data-field="technology"]').textContent();
    expect(dns).toBe('[Deployment Node: Amazon Route 53]');
});

test('[#326] four nested nodes: no label row overlaps a child, a sibling or a relationship label', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    const ids = await page.evaluate(() => Array.from(document.querySelectorAll('g.node')).map(g => g.getAttribute('data-id') ?? ''));
    const nodes = new Map<string, NodeGeometry>();
    for (const id of ids) { nodes.set(id, await nodeGeometry(page, id)); }
    // Containment from the drawing: a node whose outline encloses another is its ancestor.
    const encloses = (a: Box, b: Box): boolean => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom;
    const depth = (id: string): number => ids.filter(other => other !== id && encloses(nodes.get(other)!.screenRect, nodes.get(id)!.screenRect)).length;
    // AWS > US-East-1 > Autoscaling group > Amazon EC2 > API Application.
    expect(depth('api')).toBe(4);
    const labelInk = (g: NodeGeometry): Box[] => [...g.texts.map(t => t.box), ...(g.icon ? [g.icon] : [])];
    const edgeLabels = await page.evaluate(() => Array.from(document.querySelectorAll('g.edge text, g.relationship text, text[data-field="relationship-technology"]'))
        .map(t => { const r = t.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; }));
    for (const [id, g] of nodes) {
        for (const [otherId, other] of nodes) {
            if (otherId === id) { continue; }
            // No node's label ink overlaps another node's outline area unless that node encloses it.
            if (!encloses(other.screenRect, g.screenRect)) {
                for (const ink of labelInk(g)) {
                    expect(overlaps(ink, other.screenRect), `${id} label vs ${otherId}`).toBe(false);
                }
            }
        }
        for (const ink of labelInk(g)) {
            for (const label of edgeLabels) {
                expect(overlaps(ink, label), `${id} label vs a relationship label`).toBe(false);
            }
        }
    }
    // Siblings never overlap.
    for (const a of ids) {
        for (const b of ids) {
            if (a >= b) { continue; }
            const ga = nodes.get(a)!.screenRect;
            const gb = nodes.get(b)!.screenRect;
            if (!encloses(ga, gb) && !encloses(gb, ga)) {
                expect(overlaps(ga, gb), `${a} vs ${b}`).toBe(false);
            }
        }
    }
});

test('[#326] a live technology edit redraws the label row where the host draws it after Save', async ({ page }, testInfo) => {
    const sourcePath = await loadHarness(page, testInfo);
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const ec2 = page.locator('g.node[data-id="ec2"]');
    await ec2.focus();
    await page.keyboard.press('Enter');
    await expect(ec2).toHaveAttribute('aria-selected', 'true');
    await page.locator('#inspector-tech').fill('Ubuntu 24.04 LTS');
    await expect(page.locator('g.node[data-id="ec2"] text[data-field="technology"]')).toHaveText('[Deployment Node: Ubuntu 24.04 LTS]');
    const live = await nodeGeometry(page, 'ec2');
    expectLabelRow(live, 40);

    await page.locator('#save-staged-changes').click();
    const messages = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: unknown[] }).__visualLayoutMessages ?? []) as Array<{ type: string; edits?: unknown[] }>;
    const save = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    const editsPath = testInfo.outputPath('edits.json');
    const afterPath = testInfo.outputPath('after.c4x');
    const svgPath = testInfo.outputPath('after.svg');
    writeFileSync(editsPath, JSON.stringify(save?.edits ?? []));
    execFileSync(process.execPath, [GENERATOR, 'save', sourcePath, editsPath, afterPath, svgPath], { cwd: ROOT, env: ENV });
    expect(readFileSync(afterPath, 'utf8')).toContain('Node(ec2, "Amazon EC2", "Ubuntu 24.04 LTS"');

    await page.setContent(`<!doctype html><body>${readFileSync(svgPath, 'utf8').replace(/^<\?xml[^>]*>/, '')}</body>`);
    const saved = await nodeGeometry(page, 'ec2');
    // Same fields, same anchor, same offsets from the outline as the live redraw.
    expect(saved.texts.map(t => [t.field, t.anchor, t.x - saved.rect.x, saved.rect.y + saved.rect.height - t.y]))
        .toEqual(live.texts.map(t => [t.field, t.anchor, t.x - live.rect.x, live.rect.y + live.rect.height - t.y]));
});

test('[#326] Export SVG places every icon exactly where the preview draws it', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('aws.c4x');
    writeFileSync(sourcePath, readFileSync(FIXTURE, 'utf8'));
    const previewPath = testInfo.outputPath('preview.svg');
    const exportPath = testInfo.outputPath('exported.svg');
    execFileSync(process.execPath, [GENERATOR, 'export', sourcePath, previewPath, exportPath], { cwd: ROOT, env: ENV });
    const icons = (svg: string): string[] => [...svg.matchAll(/<g class="element-icon" data-icon-placement="([^"]+)">\s*<g transform="([^"]+)"/g)].map(m => `${m[1]} ${m[2]}`);
    const preview = icons(readFileSync(previewPath, 'utf8'));
    expect(preview.length).toBe(5);
    expect(icons(readFileSync(exportPath, 'utf8'))).toEqual(preview);

    // And on screen, the exported file draws each icon where the preview does.
    const screenIcons = async (file: string): Promise<Box[]> => {
        await page.setContent(`<!doctype html><body style="margin:0">${readFileSync(file, 'utf8').replace(/^<\?xml[^>]*>/, '')}</body>`);
        return page.evaluate(() => Array.from(document.querySelectorAll('.element-icon')).map(g => {
            const r = g.getBoundingClientRect();
            return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom) };
        }));
    };
    expect(await screenIcons(exportPath)).toEqual(await screenIcons(previewPath));
});

test('[#326] a live edit much longer than the label row stays under the child until Save', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('host.c4x');
    const harnessPath = testInfo.outputPath('host-harness.html');
    writeFileSync(sourcePath, '%%{ c4: deployment }%%\ngraph TB\nNode(parent, "Host", "Linux") {\n  Container(app, "App", "Go")\n}\n');
    execFileSync(process.execPath, [GENERATOR, 'harness', sourcePath, harnessPath], { cwd: ROOT, env: ENV });
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const parent = page.locator('g.node[data-id="parent"]');
    await parent.focus();
    await page.keyboard.press('Enter');
    await expect(parent).toHaveAttribute('aria-selected', 'true');
    await page.locator('#inspector-label').fill('Primary production application host in the eu-west-2 availability zone');
    await page.locator('#inspector-tech').fill('Amazon Linux 2023 on a Graviton m7g.4xlarge instance with encrypted volumes');
    await page.locator('#inspector-desc').fill('Runs the order, payment and notification services behind the internal load balancer, with nightly snapshots');
    await expect(page.locator('g.node[data-id="parent"] text[data-field="label"]')).toContainText('Primary');
    const g = await nodeGeometry(page, 'parent');
    const child = await nodeGeometry(page, 'app');
    for (const t of g.texts) {
        expect(t.anchor).toBe('start');
        expect(overlaps(t.box, child.screenRect), `${t.field} over the child`).toBe(false);
        expect(t.box.top).toBeGreaterThanOrEqual(child.screenRect.bottom);
        expect(t.box.bottom).toBeLessThanOrEqual(g.screenRect.bottom);
    }
    expect(g.texts[g.texts.length - 1].y).toBe(g.rect.y + g.rect.height - 10);
});
