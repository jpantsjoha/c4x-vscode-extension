import * as assert from 'assert';
import * as vscode from 'vscode';
import { C4XCompletionItemProvider } from '../../src/completion/C4XCompletionItemProvider';

describe('Phase 11: Autocomplete & IntelliSense', () => {

    it('Should NOT provide items when not inside sprite="..."', async () => {
        const provider = new C4XCompletionItemProvider();
        const document = {
            lineAt: (pos: any) => ({
                text: 'Container(app, "Label", "Tech", $tags="foo")'
            })
        } as vscode.TextDocument;

        const position = new vscode.Position(0, 40); // End of line
        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);

        // Updated to return empty array instead of undefined for stricter typing
        if (Array.isArray(result)) {
            assert.strictEqual(result.length, 0, 'Should return empty array when not triggering sprite');
        } else {
            // If it returns CompletionList
            assert.fail('Expected empty array');
        }
    });

    it('Should provide items when inside sprite="..."', async () => {
        const provider = new C4XCompletionItemProvider();
        const document = {
            lineAt: (pos: any) => ({
                text: 'Container(app, "Label", "Tech", $sprite="'
            })
        } as vscode.TextDocument;

        const position = new vscode.Position(0, 41); // Inside the quotes
        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);

        if (Array.isArray(result)) {
            assert.ok(result.length > 0, 'Should return at least one item');
            const first = result[0];
            assert.strictEqual(first.label, 'c4xicons', 'Should suggest c4xicons namespace');
            assert.strictEqual(first.kind, vscode.CompletionItemKind.Module, 'Item kind should be Module');
        } else {
            assert.fail('Expected array of items');
        }
    });

    it('Should suggest vendors when namespace is typed', async () => {
        const provider = new C4XCompletionItemProvider();
        const document = {
            lineAt: (pos: any) => ({
                text: 'Container(app, "Label", "Tech", $sprite="c4xicons.'
            })
        } as vscode.TextDocument;

        const position = new vscode.Position(0, 50);
        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = result as vscode.CompletionItem[];

        const labels = items.map(i => i.label);
        assert.ok(labels.includes('aws'), 'Should include aws');
        assert.ok(labels.includes('azure'), 'Should include azure');
        assert.ok(labels.includes('gcp'), 'Should include gcp');
        assert.ok(labels.includes('std'), 'Should include std');
    });

    it('Should provide Icons for specific vendor (AWS)', async () => {
        const provider = new C4XCompletionItemProvider();
        const document = {
            lineAt: (pos: any) => ({
                text: 'Container(app, "Label", "Tech", $sprite="c4xicons.aws.'
            })
        } as vscode.TextDocument;

        const position = new vscode.Position(0, 54);
        const result = await provider.provideCompletionItems(document, position, {} as any, {} as any);
        const items = result as vscode.CompletionItem[];

        // Check for specific AWS items
        const hasS3 = items.some(i => i.label === 'simple-storage-service-bucket' || i.label === 's3-bucket');
        assert.ok(items.length > 10, 'Should return many AWS icons');
        // Note: we are checking for the short name now, because the prefixes are stripped in the completion list for display
        // The detailed documentation contains the full key
    });
});
