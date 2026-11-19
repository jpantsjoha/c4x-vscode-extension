/// <reference lib="dom" />

/**
 * Element text stays inside its shape (#340).
 *
 * Payloads come from the real host pipeline (parser, model, layout, SvgBuilder,
 * node snapshots) in the theme under test, loaded into the production webview
 * client. Every drawn text line (a <text>, or each <tspan> of wrapped text) is
 * measured by the browser with getBoundingClientRect, in the font Chrome
 * actually uses, and must lie inside its element's outline. The live-edit test
 * types a long description in the inspector: the canvas must re-wrap with the
 * host's wrapping and stay inside the box, and after Save the host re-render
 * must grow the box and show the whole text.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');
const IBS = path.join(ROOT, 'src/__tests__/snapshots/fixtures/ibs');
const FIXTURES = [
    ...readdirSync(IBS).filter(f => f.endsWith('.c4x')).sort().map(f => path.join(IBS, f)),
    path.join(ROOT, 'src/__tests__/snapshots/fixtures/text-wrapping.c4x'),
];
const THEMES = ['classic', 'c4-model'] as const;

interface Escape { id: string; field: string; text: string; by: number }

function generate(mode: 'harness', theme: string, sourcePath: string, outPath: string): void {
    execFileSync(process.execPath, [GENERATOR, mode, sourcePath, outPath], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: theme } });
}

async function openHarness(page: Page, harnessPath: string): Promise<void> {
    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg g.node') !== null, undefined, { timeout: 10000 });
}

/** Lines whose box reaches past their element outline's box, in screen px; and the number of lines checked. */
async function linesOutside(page: Page, root = '#content svg'): Promise<{ checked: number; escapes: Escape[] }> {
    return page.evaluate((rootSelector) => {
        const escapes: Array<{ id: string; field: string; text: string; by: number }> = [];
        let checked = 0;
        for (const node of Array.from(document.querySelectorAll(`${rootSelector} g.node`))) {
            const outline = node.querySelector(':scope > rect, :scope > path');
            if (!outline) { continue; }
            const o = outline.getBoundingClientRect();
            for (const text of Array.from(node.querySelectorAll(':scope > text[data-field]'))) {
                const spans = Array.from(text.querySelectorAll('tspan'));
                for (const part of spans.length > 0 ? spans : [text]) {
                    checked++;
                    const r = part.getBoundingClientRect();
                    const by = Math.max(o.left - r.left, r.right - o.right, o.top - r.top, r.bottom - o.bottom);
                    if (by > 0.5) {
                        escapes.push({ id: node.getAttribute('data-id') || '', field: text.getAttribute('data-field') || '', text: part.textContent || '', by });
                    }
                }
            }
        }
        return { checked, escapes };
    }, root);
}

for (const theme of THEMES) {
    for (const fixture of FIXTURES) {
        const name = path.basename(fixture, '.c4x');
        test(`[#340] every text line of ${name} lies inside its shape in ${theme}`, async ({ page }, testInfo) => {
            const harnessPath = testInfo.outputPath('harness.html');
            generate('harness', theme, fixture, harnessPath);
            await openHarness(page, harnessPath);
            const { checked, escapes } = await linesOutside(page);
            expect(checked).toBeGreaterThan(5);
            expect(escapes).toEqual([]);
        });
    }
}

const LIVE_SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Person(customer, "Customer", "Uses the app")',
    '    Container(api, "API Application", "Java and Spring Boot", "Provides the API")',
    '    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")',
    '    customer -->|Uses| api',
    '    api -->|Reads from| db',
    '',
].join('\n');

// Six description lines in a 240 px Container: more than its 130 px box holds
// (the canvas shows an ellipsis until Save), fewer than the six-line cap.
const LONG = 'Provides Internet banking functionality to customers via a JSON/HTTPS API, signs them in, '
    + 'summarises their accounts, sends one-time passwords, records every payment they make and alerts them to fraud';

for (const theme of THEMES) {
    test(`[#340] a description live-edited to a long value re-wraps inside the box in ${theme}, and Save grows the box`, async ({ page }, testInfo) => {
        const sourcePath = testInfo.outputPath('before.c4x');
        const harnessPath = testInfo.outputPath('harness.html');
        writeFileSync(sourcePath, LIVE_SOURCE);
        generate('harness', theme, sourcePath, harnessPath);
        await openHarness(page, harnessPath);

        const descriptionLines = (id: string) => page.locator(`#content g.node[data-id="${id}"] text[data-field="description"] tspan`);
        await expect(descriptionLines('api')).toHaveCount(0);

        await page.locator('#toggle-layout').click();
        await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
        const api = page.locator('#content g.node[data-id="api"]');
        await api.focus();
        await page.keyboard.press('Enter');
        await expect(api).toHaveAttribute('aria-selected', 'true');
        const box = await api.locator(':scope > rect').getAttribute('height');

        // Type it, so every keystroke re-wraps the canvas, as a user sees it.
        await page.locator('#inspector-desc').fill('');
        await page.locator('#inspector-desc').pressSequentially(LONG.slice(0, 60));
        await page.locator('#inspector-desc').fill(LONG);
        await expect(page.locator('#staged-changes-list')).toContainText('Description updated');

        const lines = await descriptionLines('api').allTextContents();
        expect(lines.length).toBeGreaterThanOrEqual(2);
        // The box keeps its size until Save; text past what it holds ends in an ellipsis.
        expect(await api.locator(':scope > rect').getAttribute('height')).toBe(box);
        const shown = lines.join(' ');
        expect(shown.endsWith('\u2026')).toBe(true);
        expect(LONG.startsWith(shown.slice(0, -1).trim())).toBe(true);
        expect((await linesOutside(page)).escapes).toEqual([]);
        // The live redraw keeps the second line the host drew: the type line under c4-model (#348), the bare technology otherwise.
        expect((await api.locator('text[data-field="technology"]').allTextContents()).join(' ').replace(/\s+/g, ' '))
            .toBe(theme === 'c4-model' ? '[Container: Java and Spring Boot]' : '[Java and Spring Boot]');

        // Discard: the original single line comes back.
        await page.locator('#inspector-desc').fill('Provides the API');
        await expect(descriptionLines('api')).toHaveCount(0);
        await expect(api.locator('text[data-field="description"]')).toHaveText('Provides the API');

        // Stage the long value again and Save; render the saved source on the host.
        await page.locator('#inspector-desc').fill(LONG);
        await page.locator('#save-staged-changes').click();
        const messages = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: unknown[] }).__visualLayoutMessages ?? []) as Array<{ type?: string; edits?: unknown[] }>;
        const save = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
        expect(save?.edits).toEqual([expect.objectContaining({ id: 'api', description: LONG })]);
        const editsPath = testInfo.outputPath('edits.json');
        const afterPath = testInfo.outputPath('after.c4x');
        const svgPath = testInfo.outputPath('after.svg');
        writeFileSync(editsPath, JSON.stringify(save?.edits ?? []));
        execFileSync(process.execPath, [GENERATOR, 'save', sourcePath, editsPath, afterPath, svgPath], { cwd: ROOT, env: { ...process.env, C4X_HARNESS_THEME: theme } });
        expect(readFileSync(afterPath, 'utf8')).toContain(`Container(api, "API Application", "Java and Spring Boot", "${LONG}")`);

        await page.setContent(`<!doctype html><body style="margin:0">${readFileSync(svgPath, 'utf8').replace(/^<\?xml[^>]*>/, '')}</body>`);
        const saved = page.locator('g.node[data-id="api"]');
        expect(Number(await saved.locator(':scope > rect').getAttribute('height'))).toBeGreaterThan(Number(box));
        expect((await saved.locator('text[data-field="description"] tspan').allTextContents()).join(' ')).toBe(LONG);
        expect((await linesOutside(page, 'svg')).escapes).toEqual([]);
    });
}

// Long text in scripts the model does not measure exactly (#340 review 6) is
// drawn exactly as before: one line per field, no <tspan>.
for (const theme of THEMES) {
    test(`[#340] long text in non-Latin scripts, emoji and symbols is drawn as before, unwrapped, in ${theme}`, async ({ page }, testInfo) => {
        const harnessPath = testInfo.outputPath('harness.html');
        generate('harness', theme, path.join(ROOT, 'src/__tests__/snapshots/fixtures/scripts-long.c4x'), harnessPath);
        await openHarness(page, harnessPath);
        await expect(page.locator('#content g.node text tspan')).toHaveCount(0);
        expect(await page.locator('#content g.node').count()).toBe(9);
    });
}
