/// <reference lib="dom" />

/**
 * Boundary notation (#324): in the c4-model theme a boundary's name (and type
 * line) sit at the bottom left of the frame. The editor must keep them there
 * when the frame is dragged, resized, re-wrapped around a moved child, or
 * restored. The payload comes from the real host pipeline in the c4-model theme.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');

const SOURCE = `graph TB
    subgraph Backend {
        Container(api, "API", "Go", "Serves JSON")
        Container(worker, "Worker", "Go", "Runs jobs")
    }
    Container_Boundary(shop, "Shop Front") {
        Container(web, "Web", "Java", "Serves pages")
        Container(cart, "Cart", "Java", "Holds carts")
    }
    api --> worker
    web --> cart
`;

async function loadHarness(page: Page, testInfo: { outputPath(name: string): string }): Promise<void> {
    const sourcePath = testInfo.outputPath('notation.c4x');
    const harnessPath = testInfo.outputPath('notation-harness.html');
    writeFileSync(sourcePath, SOURCE);
    execFileSync(process.execPath, [GENERATOR, 'harness', sourcePath, harnessPath], {
        cwd: ROOT,
        env: { ...process.env, C4X_HARNESS_THEME: 'c4-model' },
    });
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });
}

interface LabelGeometry {
    rect: { x: number; y: number; width: number; height: number };
    name: { x: number; y: number; text: string };
    type: { x: number; y: number; text: string } | null;
    /** Screen boxes: the frame outline and the name's ink. */
    screenRect: { left: number; bottom: number };
    screenName: { left: number; bottom: number };
}

/** The frame and its label lines in the group's own coordinates, plus where they land on screen. */
async function geometry(page: Page, label: string): Promise<LabelGeometry> {
    return page.evaluate((boundaryLabel: string) => {
        const group = Array.from(document.querySelectorAll('g.boundary'))
            .find(g => g.querySelector(':scope > text')?.textContent === boundaryLabel);
        if (!group) { throw new Error(`no boundary ${boundaryLabel}`); }
        const rect = group.querySelector(':scope > rect:not(.boundary-resize-handle)') as SVGRectElement;
        const texts = Array.from(group.querySelectorAll(':scope > text')) as SVGTextElement[];
        const num = (el: Element, a: string): number => Number(el.getAttribute(a));
        const r = rect.getBoundingClientRect();
        const n = texts[0].getBoundingClientRect();
        return {
            rect: { x: num(rect, 'x'), y: num(rect, 'y'), width: num(rect, 'width'), height: num(rect, 'height') },
            name: { x: num(texts[0], 'x'), y: num(texts[0], 'y'), text: texts[0].textContent ?? '' },
            type: texts[1] ? { x: num(texts[1], 'x'), y: num(texts[1], 'y'), text: texts[1].textContent ?? '' } : null,
            screenRect: { left: r.left, bottom: r.bottom },
            screenName: { left: n.left, bottom: n.bottom },
        };
    }, label);
}

/** The label sits 10 right of the frame's left edge; its last baseline 10 above the bottom edge. */
function expectAnchored(g: LabelGeometry, typed: boolean): void {
    const lastBaseline = g.rect.y + g.rect.height - 10;
    if (typed) {
        expect(g.type).not.toBeNull();
        expect(g.type!.x).toBe(g.rect.x + 10);
        expect(g.type!.y).toBe(lastBaseline);
        expect(g.name.y).toBe(lastBaseline - 16);
    } else {
        expect(g.type).toBeNull();
        expect(g.name.y).toBe(lastBaseline);
    }
    expect(g.name.x).toBe(g.rect.x + 10);
    // On screen the name's ink starts inside the frame's left edge and ends above its bottom edge.
    expect(g.screenName.left).toBeGreaterThan(g.screenRect.left);
    expect(g.screenName.bottom).toBeLessThanOrEqual(g.screenRect.bottom);
}

test('[#324] the host draws the label at the bottom left, with a type line for a typed boundary', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    const plain = await geometry(page, 'Backend');
    expectAnchored(plain, false);
    const typed = await geometry(page, 'Shop Front');
    expectAnchored(typed, true);
    expect(typed.type!.text).toBe('[Container]');
});

test('[#324] a pointer drag of a frame keeps its label anchored', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    await page.locator('#toggle-layout').click();
    const before = await geometry(page, 'Backend');

    const group = page.locator('g.boundary').filter({ has: page.locator(':scope > text', { hasText: /^Backend$/ }) });
    const label = group.locator(':scope > text').first();
    const box = await label.boundingBox();
    if (!box) { throw new Error('no label box'); }
    const grab = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await page.mouse.move(grab.x, grab.y);
    await page.mouse.down();
    await page.mouse.move(grab.x + 70, grab.y + 50, { steps: 6 });
    await page.mouse.up();

    const after = await geometry(page, 'Backend');
    expect(after.screenRect.left).toBeGreaterThan(before.screenRect.left + 30);
    expectAnchored(after, false);
    // The label travelled with the frame, not behind it.
    expect(after.screenName.left - after.screenRect.left).toBeCloseTo(before.screenName.left - before.screenRect.left, 0);
    expect(after.screenRect.bottom - after.screenName.bottom).toBeCloseTo(before.screenRect.bottom - before.screenName.bottom, 0);
});

test('[#324] resizing a frame keeps its label at the bottom left', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    await page.locator('#toggle-layout').click();
    const before = await geometry(page, 'Backend');

    const group = page.locator('g.boundary').filter({ has: page.locator(':scope > text', { hasText: /^Backend$/ }) });
    await group.focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Shift+ArrowDown');
        await page.keyboard.press('Shift+ArrowRight');
    }

    const after = await geometry(page, 'Backend');
    expect(after.rect.height).toBeGreaterThan(before.rect.height);
    expect(after.rect.width).toBeGreaterThan(before.rect.width);
    expectAnchored(after, false);
    // The label moved down with the bottom edge by exactly the growth.
    expect(after.name.y - before.name.y).toBe(after.rect.height - before.rect.height);
    expect(after.name.x).toBe(before.name.x);
});

test('[#324] a frame that re-wraps around a moved child keeps both label lines at its bottom left', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    await page.locator('#toggle-layout').click();
    const before = await geometry(page, 'Shop Front');

    await page.locator('g.node[data-id="cart"]').focus();
    for (let i = 0; i < 12; i++) {
        await page.keyboard.press('ArrowDown');
    }

    const after = await geometry(page, 'Shop Front');
    expect(after.rect.height).toBeGreaterThan(before.rect.height);
    expectAnchored(after, true);
    // The type line follows the new bottom edge, and the child clears the label's reserve.
    expect(after.type!.y - before.type!.y).toBe(after.rect.y + after.rect.height - (before.rect.y + before.rect.height));
    const cartBottom = await page.evaluate(() => {
        const el = document.querySelector('g.node[data-id="cart"]') as SVGGElement;
        const r = el.querySelector('rect') as SVGRectElement;
        return Number(el.dataset.currentY) + Number(r.getAttribute('height'));
    });
    expect(after.rect.y + after.rect.height - cartBottom).toBeGreaterThanOrEqual(48);
});

test('[#324] discarding staged changes puts the label back with its frame', async ({ page }, testInfo) => {
    await loadHarness(page, testInfo);
    await page.locator('#toggle-layout').click();
    const before = await geometry(page, 'Backend');

    const group = page.locator('g.boundary').filter({ has: page.locator(':scope > text', { hasText: /^Backend$/ }) });
    await group.focus();
    await page.keyboard.press('Enter');
    for (let i = 0; i < 3; i++) {
        await page.keyboard.press('Shift+ArrowDown');
    }
    expect((await geometry(page, 'Backend')).rect.height).toBeGreaterThan(before.rect.height);

    await page.locator('#discard-staged-changes').click();
    const after = await geometry(page, 'Backend');
    expect(after.rect.height).toBe(before.rect.height);
    expect(after.name).toEqual(before.name);
    expectAnchored(after, false);
});
