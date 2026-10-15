import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../../../src/markdown/c4xPlugin';
import { resolveMarkdownEditUri } from '../../../src/commands/MarkdownEditUriHandler';

describe('Markdown preview link routing', () => {
    let dir: string;
    before(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), 'c4x-edit-link-')); });
    after(async () => { await fs.rm(dir, { recursive: true, force: true }); });
    const fence = (label: string) => `\`\`\`c4x\n%%{ c4: system-context }%%\ngraph TB\np[${label}<br/>Person]\n\`\`\`\n`;
    it('routes a rendered second-fence link to its document despite unrelated editor focus', async () => {
        const target = vscode.Uri.file(path.join(dir, 'gallery & notes.md'));
        await fs.writeFile(target.fsPath, fence('First') + '\n' + fence('Second'));
        const document = await vscode.workspace.openTextDocument(target);
        const other = await vscode.workspace.openTextDocument({ language: 'markdown', content: fence('Other') });
        await vscode.window.showTextDocument(other);
        const md = new MarkdownIt().use(c4xPlugin, { editLinkScheme: vscode.env.uriScheme });
        for (let count = 0; count < 2; count++) {
            const html = md.render(document.getText(), { currentDocument: document.uri });
            const links = [...html.matchAll(/href="([^"]*:\/\/jpantsjoha\.c4x\/edit[^"]*)"/g)];
            assert.strictEqual(links.length, 2);
            const result = await resolveMarkdownEditUri(vscode.Uri.parse(links[1][1].replace(/&amp;/g, '&')));
            assert.strictEqual(result.document.uri.toString(), target.toString());
            assert.strictEqual(result.blockOrdinal, 1);
        }
    });
    it('uses the cursor fence when the editor context menu supplies only a URI', async () => {
        await vscode.extensions.getExtension('jpantsjoha.c4x')!.activate();
        const target = vscode.Uri.file(path.join(dir, 'context-menu.md'));
        await fs.writeFile(target.fsPath, fence('First') + '\n' + fence('Second'));
        const document = await vscode.workspace.openTextDocument(target);
        const editor = await vscode.window.showTextDocument(document);
        const position = document.positionAt(document.getText().indexOf('Second'));
        editor.selection = new vscode.Selection(position, position);
        // The command returns before the workbench's asynchronous tab event.
        // Wait for that event, while still requiring the exact second-fence tab.
        await new Promise<void>((resolve, reject) => {
            const subscription = vscode.window.tabGroups.onDidChangeTabs(() => {
                if (vscode.window.tabGroups.all.flatMap(group => group.tabs)
                    .some(tab => tab.label === 'C4X — context-menu.md [block 1]')) {
                    clearTimeout(timeout);
                    subscription.dispose();
                    resolve();
                }
            });
            const timeout = setTimeout(() => {
                subscription.dispose();
                reject(new Error(`Expected second-fence tab; observed: ${vscode.window.tabGroups.all
                    .flatMap(group => group.tabs).map(tab => tab.label).join(', ')}`));
            }, 5000);
            void vscode.commands.executeCommand('c4x.editMarkdownBlock', target).then(undefined, error => {
                clearTimeout(timeout);
                subscription.dispose();
                reject(error);
            });
        });
        const tabs = vscode.window.tabGroups.all.flatMap(group => group.tabs)
            .filter(tab => tab.label === 'C4X — context-menu.md [block 1]');
        await vscode.window.tabGroups.close(tabs);
    });
    it('rejects invalid schemes, fence positions and non-local documents', async () => {
        const target = vscode.Uri.file(path.join(dir, 'invalid-position.md'));
        await fs.writeFile(target.fsPath, fence('First'));
        const link = (document: string, line: string) => vscode.Uri.parse(
            `${vscode.env.uriScheme}://jpantsjoha.c4x/edit?${new URLSearchParams({ document, line })}`);
        for (const value of ['-1', '1.5', 'NaN', '9007199254740992', '99']) {
            await assert.rejects(resolveMarkdownEditUri(link(target.toString(), value)));
        }
        await assert.rejects(resolveMarkdownEditUri(link('https://example.com/a.md', '0')));
        await assert.rejects(resolveMarkdownEditUri(link('file://server/a.md', '0')));
        await assert.rejects(resolveMarkdownEditUri(link(target.toString(), '0').with({ path: '/other' })));
    });
});
