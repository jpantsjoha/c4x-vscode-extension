import * as vscode from 'vscode';
import * as path from 'path';
import { GeminiService } from '../ai/GeminiService';
import { CodeContextExtractor } from '../ai/CodeContextExtractor';

export class GenerateDiagramCommand {
    private geminiService: GeminiService;
    private contextExtractor: CodeContextExtractor;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.geminiService = new GeminiService(context);
        this.contextExtractor = new CodeContextExtractor();
    }

    public async generateFromMarkdown(editor: vscode.TextEditor) {
        await this.runGeneration(editor, 'folder');
    }

    public async generateFromSelection(editor: vscode.TextEditor) {
        await this.runGeneration(editor, 'selection');
    }

    private async runGeneration(editor: vscode.TextEditor, mode: 'folder' | 'selection') {
        if (!editor) { return; }

        // Check if verified
        const isReady = await this.geminiService.checkReady();
        if (!isReady) {
            const authed = await this.handleAuthFlow();
            if (!authed) { return; }
        }

        let selectionText: string | undefined;
        let recommendedTypes: string[] = [];
        let recommendedDirection: 'TB' | 'LR' | undefined;

        if (mode === 'selection') {
            selectionText = editor.document.getText(editor.selection);
            if (!selectionText || selectionText.trim().length === 0) {
                vscode.window.showErrorMessage('No text selected.');
                return;
            }

            // AI Recommendation Step
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Consulting Gemini Architect...',
                cancellable: false
            }, async () => {
                const result = await this.geminiService.recommendDiagramType(selectionText!);
                recommendedTypes = result.types;
                recommendedDirection = result.direction;
            });
        }

        const selection = await this.promptForInstruction(recommendedTypes);
        if (!selection) { return; }

        const { text: instruction, depth } = selection;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating C4 Diagram (${mode === 'selection' ? 'From Selection' : 'From Workspace'})...`,
            cancellable: false
        }, async (progress) => {
            try {
                let files: { path: string, content: string }[] = [];

                if (mode === 'folder') {
                    progress.report({ message: 'Reading workspace context...' });
                    const folderUri = vscode.Uri.file(path.dirname(editor.document.uri.fsPath));
                    files = await this.contextExtractor.extractContext(folderUri, depth);
                } else {
                    progress.report({ message: 'Reading selection...' });
                    files = [{
                        path: `Selected_Context_from_${path.basename(editor.document.uri.fsPath)}`,
                        content: selectionText!
                    }];
                }

                progress.report({ message: 'Consulting Gemini Architect...' });

                const generationOptions = recommendedDirection ? { direction: recommendedDirection } : undefined;
                const diagramCode = await this.geminiService.generateDiagram(files, instruction, generationOptions);

                // Insert at cursor (or after selection for clarity)
                const snippet = new vscode.SnippetString(`\n\`\`\`c4x\n${diagramCode}\n\`\`\`\n`);

                if (mode === 'selection') {
                    // Insert AFTER the selection
                    const endPos = editor.selection.end;
                    editor.insertSnippet(snippet, endPos);
                } else {
                    editor.insertSnippet(snippet);
                }

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                vscode.window.showErrorMessage(`Generation Failed: ${error.message}`);
                console.error(error);
            }
        });
    }

    private async promptForLevel(): Promise<'C1' | 'C2' | 'C3' | undefined> {
        const items = [
            { label: 'System Context (C1)', description: 'Big picture: Users & Systems', value: 'C1' },
            { label: 'Container (C2)', description: 'Applications & Databases', value: 'C2' },
            { label: 'Component (C3)', description: 'Internal Modules & Classes', value: 'C3' }
        ];

        const selection = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select Diagram Level'
        });

        return selection ? (selection.value as 'C1' | 'C2' | 'C3') : undefined;
    }

    private async promptForInstruction(recommendations: string[] = []): Promise<{ text: string, depth: number } | undefined> {
        const baseItems = [
            { label: 'System Context (C1)', type: 'C1', description: 'Users & Systems (Scans 2 levels deep)', instruction: 'Create a C4 System Context (Level 1) diagram.', depth: 2 },
            { label: 'Container Architecture (C2)', type: 'C2', description: 'Apps & DBs (Scans 1 level deep)', instruction: 'Create a C4 Container (Level 2) diagram.', depth: 1 },
            { label: 'Component Diagram (C3)', type: 'C3', description: 'Classes & Modules (Scans current folder)', instruction: 'Create a C4 Component (Level 3) diagram.', depth: 1 },
            { label: 'Custom / Ask Architect...', type: 'CUSTOM', description: 'Describe what you want (e.g. "Focus on Cloud")', instruction: 'CUSTOM', depth: 2 }
        ];

        // Sort items: Recommended first
        const sortedItems = baseItems.sort((a, b) => {
            const aRec = recommendations.includes(a.type);
            const bRec = recommendations.includes(b.type);
            if (aRec && !bRec) { return -1; }
            if (!aRec && bRec) { return 1; }
            return 0;
        });

        // Add visual indicators
        const displayItems = sortedItems.map(item => {
            if (recommendations.includes(item.type)) {
                return { ...item, label: `$(star-full) ${item.label}`, description: `Recommended for your selection. ${item.description}` };
            }
            return item;
        });

        const selection = await vscode.window.showQuickPick(displayItems, {
            placeHolder: recommendations.length > 0 ? 'Gemini recommends the following based on your selection:' : 'Select Diagram Type or Ask Custom Question'
        });

        if (!selection) { return undefined; }

        if (selection.instruction === 'CUSTOM') {
            const customText = await vscode.window.showInputBox({
                placeHolder: 'e.g. "Show me the authentication flow", "Visualize cloud infrastructure"',
                prompt: 'Describe the architecture diagram you want Gemini to generate'
            });
            return customText ? { text: customText, depth: 2 } : undefined;
        }

        return { text: selection.instruction, depth: selection.depth };
    }

    private async handleAuthFlow(): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            'Gemini API Key is missing. Connect to Google Gemini to proceed.',
            'Get Free Key',
            'Enter Key'
        );

        if (choice === 'Get Free Key') {
            vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/app/apikey'));
            // Don't return yet, let them loop or click Enter Key next time? 
            // Better UX: Show InputBox immediately after opening browser?
            return await this.promptForKey();
        } else if (choice === 'Enter Key') {
            return await this.promptForKey();
        }

        return false;
    }

    private async promptForKey(): Promise<boolean> {
        const key = await vscode.window.showInputBox({
            placeHolder: 'Paste your Google Gemini API Key here (starts with AIza...)',
            prompt: 'Enter API Key to enable C4X AI Architect',
            password: true,
            ignoreFocusOut: true
        });

        if (key && key.trim().length > 0) {
            await this.geminiService.saveKey(key.trim());
            vscode.window.showInformationMessage('Gemini connected successfully!');
            return true;
        }
        return false;
    }
}
