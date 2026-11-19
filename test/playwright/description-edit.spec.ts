/// <reference lib="dom" />

/**
 * A Person's description, edited in the inspector and saved (#420).
 *
 * The payload comes from the real host pipeline (parser, model, layout,
 * SvgBuilder, node snapshots). After Save, the posted edit is applied to the
 * source by the same writeback planner the extension uses and the result is
 * rendered again by the host, so the test checks the source argument and the
 * picture, not just the message.
 */
import { expect, Page, test } from '@playwright/test';
import { execFileSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import * as url from 'url';

const ROOT = path.resolve(__dirname, '../..');
const GENERATOR = path.join(ROOT, 'test/visual-layout/generate-host-layout-harness.js');

const SOURCE = [
    '%%{ c4: system-context }%%',
    'graph TB',
    '    Person(customer, "Customer", "Pays bills online")',
    '    System(bank, "Online Banking", "Lets customers pay bills")',
    '    System_Ext(email, "Email Service", "Sends receipts")',
    '    customer -->|Pays bills using| bank',
    '    bank -->|Sends receipts using| email',
    '',
].join('\n');

interface PostedEdit { id: string; description?: string | null; technology?: string | null }
interface PostedMessage { type?: string; edits?: PostedEdit[] }

async function nodeText(page: Page, id: string, field: string): Promise<string[]> {
    return page.locator(`g.node[data-id="${id}"] text[data-field="${field}"]`).allTextContents();
}

test('[#420] a Person description edited in the inspector saves to its third argument and draws as plain text', async ({ page }, testInfo) => {
    const sourcePath = testInfo.outputPath('before.c4x');
    const harnessPath = testInfo.outputPath('harness.html');
    writeFileSync(sourcePath, SOURCE);
    execFileSync(process.execPath, [GENERATOR, 'harness', sourcePath, harnessPath], { cwd: ROOT });

    await page.goto(url.pathToFileURL(harnessPath).href);
    await page.waitForFunction(() => document.querySelector('#content svg') !== null, undefined, { timeout: 5000 });

    // Before editing: every description is description text; nothing is drawn as technology.
    for (const [id, text] of [['customer', 'Pays bills online'], ['bank', 'Lets customers pay bills'], ['email', 'Sends receipts']]) {
        expect(await nodeText(page, id, 'description')).toEqual([text]);
        expect(await nodeText(page, id, 'technology')).toEqual([]);
    }

    await page.locator('#toggle-layout').click();
    await expect(page.locator('#toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    const customer = page.locator('g.node[data-id="customer"]');
    await customer.focus();
    await page.keyboard.press('Enter');
    await expect(customer).toHaveAttribute('aria-selected', 'true');

    await expect(page.locator('#inspector-desc')).toHaveValue('Pays bills online');
    await expect(page.locator('#inspector-tech')).toHaveValue('');

    await page.locator('#inspector-desc').fill('Pays bills and checks balances');
    await expect(page.locator('#staged-changes-list')).toContainText('Description updated');
    // The live canvas update writes plain text, no brackets.
    expect(await nodeText(page, 'customer', 'description')).toEqual(['Pays bills and checks balances']);
    expect(await nodeText(page, 'customer', 'technology')).toEqual([]);

    await page.locator('#save-staged-changes').click();
    const messages = await page.evaluate(() => (window as Window & { __visualLayoutMessages?: unknown[] }).__visualLayoutMessages ?? []) as PostedMessage[];
    const save = messages.find(message => message.type === 'visualLayout.applySemanticEdits');
    const edit = save?.edits?.find(e => e.id === 'customer');
    expect(edit).toMatchObject({ id: 'customer', description: 'Pays bills and checks balances' });
    expect(edit?.technology).toBeUndefined();

    // Apply the posted edit through the extension's writeback planner, then render the saved source.
    const editsPath = testInfo.outputPath('edits.json');
    const afterPath = testInfo.outputPath('after.c4x');
    const svgPath = testInfo.outputPath('after.svg');
    writeFileSync(editsPath, JSON.stringify(save?.edits ?? []));
    execFileSync(process.execPath, [GENERATOR, 'save', sourcePath, editsPath, afterPath, svgPath], { cwd: ROOT });

    const after = readFileSync(afterPath, 'utf8');
    expect(after).toContain('Person(customer, "Customer", "Pays bills and checks balances")');
    expect(after.replace('Person(customer, "Customer", "Pays bills and checks balances")', 'Person(customer, "Customer", "Pays bills online")')).toBe(SOURCE);

    const svg = readFileSync(svgPath, 'utf8');
    await page.setContent(`<!doctype html><body>${svg.replace(/^<\?xml[^>]*>/, '')}</body>`);
    expect(await nodeText(page, 'customer', 'description')).toEqual(['Pays bills and checks balances']);
    expect(await nodeText(page, 'customer', 'technology')).toEqual([]);
    expect(svg).not.toContain('[Pays bills and checks balances]');
});
