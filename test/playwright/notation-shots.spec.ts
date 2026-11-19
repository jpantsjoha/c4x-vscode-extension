/// <reference lib="dom" />

/**
 * The 1.9.0 notation, drawn in the c4-model theme through the real host
 * pipeline and measured in Chrome (#332).
 *
 * Every run checks that each notation feature appears in the drawn SVG: a
 * shape on the element it names, the type line, the boundary frame with its
 * type line, the relationship technology under its label, the deployment node
 * label row and the key. Set C4X_NOTATION_SHOTS=<dir> to also write the
 * marketplace and documentation screenshots into <dir>.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const HOST_GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const KEY_GENERATOR = path.join(ROOT, 'test/visual-layout/generate-key-harness.js');
const DEPLOYMENT = path.join(ROOT, 'src/__tests__/snapshots/fixtures/deployment-aws.c4x');
const SHOT_DIR = process.env.C4X_NOTATION_SHOTS;

/** The web shop: five shapes, a boundary and a technology on every relationship. */
const WEB_SHOP = `%%{ c4: container }%%
graph TB
Person(customer, "Customer", "Buys products online")
System_Boundary(shop, "Web Shop") {
    Container(web, "Storefront", "React", "Product catalogue and checkout", $shape="WebBrowser")
    Container(api, "Order API", "Node.js", "Takes and tracks orders")
    Container(db, "Order Database", "PostgreSQL", "Orders and customers", $shape="Cylinder")
    Container(receipts, "Receipt Store", "Amazon S3", "PDF receipts", $shape="Bucket")
    Container(admin, "Admin Tool", "Node.js", "Reports from a shell", $shape="Terminal")
}
System_Ext(pay, "Payment Provider", "Takes card payments")
customer -->|Browses and orders using| "HTTPS" web
web -->|Sends orders to| "JSON/HTTPS" api
api -->|Reads and writes| "SQL" db
api -->|Stores receipts in| "HTTPS" receipts
admin -->|Runs reports through| "JSON/HTTPS" api
api -->|Charges cards using| "HTTPS" pay
`;

function harness(theme: string, sourcePath: string, outPath: string): void {
    execFileSync(process.execPath, [HOST_GENERATOR, 'harness', sourcePath, outPath], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: theme } });
}

async function open(page: Page, file: string): Promise<void> {
    await page.goto(url.pathToFileURL(file).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 10000 });
}

/** The drawn diagram with a margin, in page pixels. */
async function diagramClip(page: Page, extraSelector?: string): Promise<{ x: number; y: number; width: number; height: number }> {
    return page.evaluate((extra: string | null) => {
        const parts = Array.from(document.querySelectorAll('#content svg g.node, #content svg g.boundary, #content svg g.edge'));
        if (extra) {
            const el = document.querySelector(extra);
            if (el) { parts.push(el); }
        }
        const rects = parts.map(n => n.getBoundingClientRect());
        const left = Math.max(0, Math.min(...rects.map(r => r.left)) - 16);
        const top = Math.max(0, Math.min(...rects.map(r => r.top)) - 16);
        return { x: left, y: top, width: Math.max(...rects.map(r => r.right)) + 16 - left, height: Math.max(...rects.map(r => r.bottom)) + 16 - top };
    }, extraSelector ?? null);
}

async function shoot(page: Page, name: string, extraSelector?: string): Promise<void> {
    if (!SHOT_DIR) { return; }
    // The timing panel is not part of the notation.
    await page.addStyleTag({ content: '#diagram-stats { display: none !important; }' });
    mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, name), clip: await diagramClip(page, extraSelector) });
}

for (const theme of ['c4-model', 'c4-model-dark'] as const) {
    test(`[#332] the container view draws shapes, type lines, a boundary and relationship technology in ${theme}`, async ({ page }, testInfo) => {
        const src = testInfo.outputPath('web-shop.c4x');
        mkdirSync(path.dirname(src), { recursive: true });
        writeFileSync(src, WEB_SHOP, 'utf8');
        const out = testInfo.outputPath('web-shop.html');
        harness(theme, src, out);
        await page.setViewportSize({ width: 1500, height: 1000 });
        await open(page, out);

        const shapes = await page.evaluate(() => Object.fromEntries(
            Array.from(document.querySelectorAll('#content svg g.node[data-shape]')).map(n => [n.getAttribute('data-id'), n.getAttribute('data-shape')])));
        expect(shapes).toMatchObject({ web: 'webBrowser', receipts: 'bucket', admin: 'terminal' });

        expect(await page.locator('#content svg g.node[data-id="db"]').count(), 'the cylinder node').toBe(1);
        const text = await page.evaluate(() => Array.from(document.querySelectorAll('#content svg text')).map(t => (t.textContent || '').trim()));
        for (const typeLine of ['[Person]', '[Container: React]', '[Container: PostgreSQL]', '[Container: Amazon S3]', '[Software System]']) {
            expect(text, `type line ${typeLine}`).toContain(typeLine);
        }
        for (const technology of ['[JSON/HTTPS]', '[SQL]', '[HTTPS]']) {
            expect(text, `relationship technology ${technology}`).toContain(technology);
        }
        expect(text.filter(t => t === 'Web Shop').length).toBeGreaterThan(0);

        await shoot(page, theme === 'c4-model' ? 'container-view-c4-model.png' : 'container-view-c4-model-dark.png');
    });
}

test('[#332] the deployment view draws nested nodes with their label row and icons in c4-model', async ({ page }, testInfo) => {
    const src = testInfo.outputPath('aws.c4x');
    mkdirSync(path.dirname(src), { recursive: true });
    writeFileSync(src, readFileSync(DEPLOYMENT, 'utf8'));
    const out = testInfo.outputPath('aws.html');
    harness('c4-model', src, out);
    await page.setViewportSize({ width: 1900, height: 1200 });
    await open(page, out);
    const text = await page.evaluate(() => Array.from(document.querySelectorAll('#content svg text')).map(t => (t.textContent || '').trim()));
    expect(text).toContain('Amazon Web Services');
    expect(text.some(t => t.startsWith('[Deployment Node'))).toBe(true);
    expect(await page.locator('#content svg .element-icon').count()).toBeGreaterThan(3);
    await shoot(page, 'deployment-view-c4-model.png');
});

test('[#332] the key lists the styles the container view draws', async ({ page }, testInfo) => {
    const src = testInfo.outputPath('web-shop.c4x');
    mkdirSync(path.dirname(src), { recursive: true });
    writeFileSync(src, WEB_SHOP, 'utf8');
    const out = testInfo.outputPath('web-shop-key.html');
    execFileSync(process.execPath, [KEY_GENERATOR, src, out], { cwd: ROOT });
    await page.setViewportSize({ width: 1000, height: 1000 });
    await open(page, out);
    const key = page.locator('#legend-overlay');
    await expect(key).toBeVisible();
    const entries = (await key.innerText()).split('\n').map(s => s.trim()).filter(Boolean);
    for (const wanted of ['Person', 'Boundary', 'Relationship']) {
        expect(entries.some(e => e.includes(wanted)), `${wanted} in ${JSON.stringify(entries)}`).toBe(true);
    }
    expect(entries.some(e => /Bucket/i.test(e)), 'a bucket entry').toBe(true);
    expect(entries.some(e => /Terminal/i.test(e)), 'a terminal entry').toBe(true);

    // The exported form puts the key directly below the diagram (c4x.export.includeKey on).
    const svgPath = testInfo.outputPath('web-shop-key.svg');
    execFileSync(process.execPath, [KEY_GENERATOR, src, out, '--key-svg', svgPath], { cwd: ROOT });
    await page.goto(url.pathToFileURL(svgPath).href);
    const box = await page.evaluate(() => {
        const r = document.documentElement.getBoundingClientRect();
        return { w: r.width, h: r.height };
    });
    expect(box.h).toBeGreaterThan(300);
    if (SHOT_DIR) {
        mkdirSync(SHOT_DIR, { recursive: true });
        await page.setViewportSize({ width: Math.ceil(box.w), height: Math.ceil(box.h) });
        await page.screenshot({ path: path.join(SHOT_DIR, 'key-c4-model.png') });
    }
});

const QUEUES = `%%{ c4: container }%%
graph TB
    elementStyle Queue $shape="Cylinder", $stroke="#BF101D", $color="#BF101D", $border="dashed", $legend="Message queue"
    Container(orders, "Order Queue", "RabbitMQ", "Holds orders until they are picked up", $tags="Queue")
    Container(mail, "Mail Queue", "RabbitMQ", "Holds receipts until they are sent", $tags="Queue")
    Container(worker, "Worker", "Node.js", "Processes both queues")
    worker -->|Reads from| "AMQP" orders
    worker -->|Reads from| "AMQP" mail
`;

test('[#332] a tag style gives every tagged element its outline colour and dash', async ({ page }, testInfo) => {
    const src = testInfo.outputPath('queues.c4x');
    mkdirSync(path.dirname(src), { recursive: true });
    writeFileSync(src, QUEUES, 'utf8');
    const out = testInfo.outputPath('queues.html');
    harness('c4-model', src, out);
    await page.setViewportSize({ width: 1000, height: 800 });
    await open(page, out);
    const strokes = await page.evaluate(() => ['orders', 'mail', 'worker'].map(id => {
        const outline = document.querySelector(`#content svg g.node[data-id="${id}"] > path, #content svg g.node[data-id="${id}"] > rect`);
        return { id, stroke: (outline?.getAttribute('stroke') || '').toLowerCase(), dash: outline?.getAttribute('stroke-dasharray') || '' };
    }));
    expect(strokes[0]).toMatchObject({ stroke: '#bf101d' });
    expect(strokes[0].dash).not.toBe('');
    expect(strokes[1]).toMatchObject({ stroke: '#bf101d', dash: strokes[0].dash });
    expect(strokes[2].stroke).not.toBe('#bf101d');
    await shoot(page, 'tag-style-c4-model.png');
});
