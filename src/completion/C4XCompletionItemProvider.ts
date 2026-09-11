import * as vscode from 'vscode';
import { SPRITES } from '../assets/icons';

export class C4XCompletionItemProvider implements vscode.CompletionItemProvider {

    private vendorMap: Map<string, vscode.CompletionItem[]> = new Map();
    private rootItems: vscode.CompletionItem[] = [];
    private vendorItems: vscode.CompletionItem[] = [];

    constructor() {
        this.initializeItems();
    }

    private initializeItems() {
        // 1. Root Item
        const root = new vscode.CompletionItem('c4xicons', vscode.CompletionItemKind.Module);
        root.detail = 'C4X Icon Namespace';
        root.documentation = new vscode.MarkdownString('Access cloud provider icons: `c4xicons.<provider>.<icon>`');
        root.commitCharacters = ['.'];
        this.rootItems.push(root);

        // 2. Vendors
        const vendors = ['aws', 'azure', 'gcp', 'std'];
        vendors.forEach(v => {
            const item = new vscode.CompletionItem(v, vscode.CompletionItemKind.Module);
            item.detail = `${v.toUpperCase()} Icons`;
            item.commitCharacters = ['.'];
            this.vendorItems.push(item);
            this.vendorMap.set(v, []);
        });

        // 3. Icons -> Vendor Buckets
        Object.keys(SPRITES).forEach(key => {
            const parts = key.split('-');
            if (parts.length > 1) {
                const potentialVendor = parts[0];
                if (this.vendorMap.has(potentialVendor)) {
                    // aws-s3-bucket -> s3-bucket
                    const label = key.substring(potentialVendor.length + 1);
                    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Value);
                    item.detail = key;
                    item.documentation = new vscode.MarkdownString(`$sprite="c4xicons.${potentialVendor}.${label}"`);
                    // Add to specific vendor bucket
                    this.vendorMap.get(potentialVendor)?.push(item);
                    return;
                }
            }

            // Fallback for 'std' or others (person, database)
            // If it doesn't start with a known vendor, put it in 'std'
            const item = new vscode.CompletionItem(key, vscode.CompletionItemKind.Value);
            item.detail = key;
            item.documentation = new vscode.MarkdownString(`$sprite="c4xicons.std.${key}"`);
            this.vendorMap.get('std')?.push(item);
        });
    }

    public async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        _context: vscode.CompletionContext
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList> {

        const linePrefix = document.lineAt(position).text.substr(0, position.character);

        // Regex to detect context
        // 1. sprite="<cursor>  -> Suggest 'c4xicons'
        // 2. sprite="c4xicons.<cursor> -> Suggest vendors
        // 3. sprite="c4xicons.<vendor>.<cursor> -> Suggest icons

        const spriteAttrMatch = linePrefix.match(/sprite=["']([^"']*)$/);

        if (!spriteAttrMatch) {
            return [];
        }

        const currentVal = spriteAttrMatch[1];

        // Case 1: Start of value
        if (currentVal === '' || (currentVal.length > 0 && !currentVal.includes('.'))) {
            // Suggest 'c4xicons', but also maybe filter if user started typing 'c4'
            return this.rootItems;
        }

        // Case 2: c4xicons. -> Vendors
        if (currentVal === 'c4xicons.' || (currentVal.startsWith('c4xicons.') && currentVal.split('.').length === 2)) {
            return this.vendorItems;
        }

        // Case 3: c4xicons.<vendor>. -> Icons
        // Match: c4xicons.aws. or c4xicons.aws.s3
        const vendorMatch = currentVal.match(/^c4xicons\.(\w+)\./);
        if (vendorMatch) {
            const vendor = vendorMatch[1];
            if (this.vendorMap.has(vendor)) {
                return this.vendorMap.get(vendor) || [];
            }
        }

        return [];
    }
}
