/**
 * #218 in the extension host: `$code` completion and hover against the real
 * workspace (the host opens the repository itself as its workspace folder).
 */

import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'jpantsjoha.c4x';

async function openC4x(content: string): Promise<vscode.TextDocument> {
    await vscode.extensions.getExtension(EXTENSION_ID)?.activate();
    const document = await vscode.workspace.openTextDocument({ language: 'c4x', content });
    await vscode.window.showTextDocument(document);
    return document;
}

function labelOf(item: vscode.CompletionItem): string {
    return typeof item.label === 'string' ? item.label : item.label.label;
}

function hoverText(hovers: vscode.Hover[]): string {
    return hovers.flatMap(hover => hover.contents)
        .map(content => (typeof content === 'string' ? content : content.value))
        .join('\n');
}

describe('#218 $code completion and hover (extension host)', function () {
    this.timeout(20000);

    it('offers $code after "$" inside an element call', async () => {
        const line = 'Component(parser, "Parser", $';
        const document = await openC4x(`%%{ c4: component }%%\ngraph TB\n${line}`);
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', document.uri, new vscode.Position(2, line.length), '$',
        );
        assert.ok(list.items.some(item => labelOf(item) === '$code'), 'expected a $code completion');
    });

    it('completes workspace folders inside a $code value', async () => {
        const line = 'Component(parser, "Parser", $code="sr';
        const document = await openC4x(`%%{ c4: component }%%\ngraph TB\n${line}`);
        const list = await vscode.commands.executeCommand<vscode.CompletionList>(
            'vscode.executeCompletionItemProvider', document.uri, new vscode.Position(2, line.length),
        );
        const src = list.items.find(item => labelOf(item) === 'src/');
        assert.ok(src, `expected src/ among ${list.items.map(labelOf).slice(0, 20).join(', ')}`);
        assert.strictEqual(src.insertText, 'src/**');
    });

    it('hover counts the files each glob matches and flags one that matches none', async () => {
        const line = 'Component(parser, "Parser", $code="src/parser/**, src/no-such-folder/**")';
        const document = await openC4x(`%%{ c4: component }%%\ngraph TB\n${line}`);
        const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
            'vscode.executeHoverProvider', document.uri, new vscode.Position(2, line.indexOf('src/parser')),
        );
        const text = hoverText(hovers);
        assert.match(text, /`src\/parser\/\*\*`: \d+ files/);
        assert.match(text, /`src\/no-such-folder\/\*\*`: \*\*matches no file\*\*/);
    });
});
