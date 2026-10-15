import * as vscode from 'vscode';
import { SPRITES } from '../assets/icons';
import { attributeNameContext, codeValueContext, isInsideC4xFence, isOfferedEntry } from './codeAttribute';

/** Path completion never lists more entries than this from one directory. */
const MAX_PATH_ITEMS = 200;

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

        // In Markdown, $code help belongs inside c4x fences only, never in prose.
        const codeAllowed = document.languageId !== 'markdown' ||
            isInsideC4xFence(line => document.lineAt(line).text, position.line);
        const codeContext = codeAllowed ? codeValueContext(linePrefix) : undefined;
        if (codeContext) {
            return this.codePathItems(document, position, codeContext.directory, codeContext.fragment);
        }

        const attributeContext = codeAllowed ? attributeNameContext(linePrefix) : undefined;
        if (attributeContext) {
            const item = new vscode.CompletionItem('$code', vscode.CompletionItemKind.Property);
            item.detail = 'Map this Container or Component to source code';
            item.documentation = new vscode.MarkdownString(
                'Comma-separated, workspace-relative globs naming the code this element owns, e.g. ' +
                '`$code="src/parser/**, src/extension.ts"`. Used by **C4X: Export Architecture Conformance**.'
            );
            item.insertText = new vscode.SnippetString('\\$code="${1:src/}$0"');
            item.range = new vscode.Range(
                position.line, position.character - attributeContext.typed.length,
                position.line, position.character,
            );
            item.filterText = '$code';
            item.command = { title: 'Suggest paths', command: 'editor.action.triggerSuggest' };
            return [item];
        }

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

    /**
     * List the entries of one workspace directory as `$code` path candidates:
     * folders become `name/**`, files stay exact. Reads one directory only.
     */
    private async codePathItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        directory: string,
        fragment: string,
    ): Promise<vscode.CompletionItem[]> {
        const folder = vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0];
        if (!folder) {
            return [];
        }
        let entries: [string, vscode.FileType][];
        try {
            const target = directory ? vscode.Uri.joinPath(folder.uri, directory) : folder.uri;
            entries = await vscode.workspace.fs.readDirectory(target);
        } catch {
            return [];
        }
        const range = new vscode.Range(position.line, position.character - fragment.length, position.line, position.character);
        return entries
            .filter(([name]) => isOfferedEntry(name))
            .slice(0, MAX_PATH_ITEMS)
            .map(([name, type]) => {
                const isDirectory = (type & vscode.FileType.Directory) !== 0;
                const item = new vscode.CompletionItem(
                    isDirectory ? `${name}/` : name,
                    isDirectory ? vscode.CompletionItemKind.Folder : vscode.CompletionItemKind.File,
                );
                item.range = range;
                item.filterText = name;
                if (isDirectory) {
                    item.insertText = `${name}/**`;
                    item.detail = `${directory}${name}/** (all files below)`;
                    item.sortText = `0${name}`;
                } else {
                    item.insertText = name;
                    item.detail = `${directory}${name}`;
                    item.sortText = `1${name}`;
                }
                return item;
            });
    }
}
