import * as vscode from 'vscode';
import * as path from 'path';
import { GeminiService } from '../ai/GeminiService';
import { CodeContextExtractor } from '../ai/CodeContextExtractor';
import { ensureApiKey } from '../ai/AuthService';
import { readGenerationProvider } from '../ai/providerSetting';
import { type ExcludedFile } from '../ai/CodeContextExtractor';
import { type ContextSource, type OutgoingRequest, buildOutgoingRequest, describeOutgoing } from '../ai/outgoingRequest';
import { DEFAULT_MODEL, PRO_MODEL } from '../ai/models';

export const GEMINI_CONFIRM_BUTTON = 'Send to Gemini';

/**
 * Ask before a Gemini generation request leaves the machine, showing exactly
 * what it carries (#392). Resolves true only when the user chose to send.
 */
export async function confirmGeminiRequest(outgoing: OutgoingRequest, source: ContextSource): Promise<boolean> {
    const model = vscode.workspace.getConfiguration('c4x.ai').get<string>('model') || DEFAULT_MODEL;
    const detail = [
        `Model: Gemini "${model}" through Google's Gemini API, with your API key. If that model is withdrawn C4X may use a current one, and if it fails C4X tries "${model === PRO_MODEL ? DEFAULT_MODEL : PRO_MODEL}" once; each attempt sends this same request.`,
        ...describeOutgoing(outgoing, source, outgoing.files.some(file => file.role === 'guidelines')
            ? 'C4X\'s syntax rules. Your workspace guideline files listed below replace the built-in guidance.'
            : 'C4X\'s built-in guidance and syntax rules. No workspace file other than those listed is sent.'),
    ].join('\n\n');
    const answer = await vscode.window.showInformationMessage('Send this request to Gemini?', { modal: true, detail }, GEMINI_CONFIRM_BUTTON);
    return answer === GEMINI_CONFIRM_BUTTON;
}

export class GenerateDiagramCommand {
    private geminiService: GeminiService;
    private contextExtractor: CodeContextExtractor;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.geminiService = new GeminiService(context);
        this.contextExtractor = new CodeContextExtractor();
    }
    /**
     * Rebuild the Gemini client after the stored key changes. Each command owns
     * its own service instance, so both must be refreshed or one keeps a stale
     * client and fails while the other works.
     */
    /** Model ids this API key can actually reach. Empty on any failure. */
    public async discoverModels() {
        return this.geminiService.discoverModels();
    }

    public async refreshCredentials(): Promise<void> {
        await this.geminiService.refreshCredentials();
    }


    public async generateFromMarkdown(editor: vscode.TextEditor) {
        await this.runGeneration(editor, 'folder');
    }

    public async generateFromSelection(editor: vscode.TextEditor) {
        await this.runGeneration(editor, 'selection');
    }

    private async runGeneration(editor: vscode.TextEditor, mode: 'folder' | 'selection') {
        if (!editor) { return; }

        // `c4x.ai.provider` = `vscode-lm`: a VS Code chat model, no key. The
        // provider's code is loaded here, on first use, never at activation.
        if (readGenerationProvider() === 'vscode-lm') {
            await this.runLanguageModelGeneration(editor, mode);
            return;
        }

        // Check if verified
        const isReady = await this.geminiService.checkReady();
        if (!isReady) {
            const key = await ensureApiKey(this.context);
            if (!key) { return; }
            await this.geminiService.saveKey(key);
            vscode.window.showInformationMessage('Gemini connected successfully!');
        }

        let selectionText: string | undefined;
        let recommendedTypes: string[] = [];
        let recommendedDirection: 'TB' | 'LR' | undefined;
        let confidence = 0;

        if (mode === 'selection') {
            selectionText = editor.document.getText(editor.selection);
            if (!selectionText || selectionText.trim().length === 0) {
                vscode.window.showErrorMessage('No text selected.');
                return;
            }

            // AI Recommendation Step
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Analyzing context...',
                cancellable: false
            }, async () => {
                const result = await this.geminiService.recommendDiagramType(selectionText!);
                recommendedTypes = result.types;
                recommendedDirection = result.direction;
                confidence = result.confidence;
            });
        }

        // Smart Auto-Detection: Skip dropdown if high confidence single recommendation
        let selection: { text: string, depth: number } | undefined;

        if (mode === 'selection' && recommendedTypes.length === 1 && confidence >= 0.7) {
            // Auto-select based on AI recommendation
            const typeMap: Record<string, { text: string, depth: number }> = {
                'C1': { text: 'Create a C4 System Context (Level 1) diagram.', depth: 2 },
                'C2': { text: 'Create a C4 Container (Level 2) diagram.', depth: 1 },
                'C3': { text: 'Create a C4 Component (Level 3) diagram.', depth: 1 }
            };
            selection = typeMap[recommendedTypes[0]];

            // Show notification of auto-detection
            vscode.window.showInformationMessage(
                `Auto-detected: ${recommendedTypes[0]} diagram (${Math.round(confidence * 100)}% confidence)`
            );
        } else {
            // Show dropdown for user selection
            selection = await this.promptForInstruction(recommendedTypes);
        }

        if (!selection) { return; }

        const { text: instruction, depth } = selection;

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `Generating C4 Diagram (${mode === 'selection' ? 'From Selection' : 'From Workspace'})...`,
            cancellable: false
        }, async (progress) => {
            try {
                let files: { path: string, content: string }[] = [];
                let excluded: ExcludedFile[] = [];
                let source: ContextSource;

                if (mode === 'folder') {
                    progress.report({ message: 'Reading workspace context...' });
                    const folderUri = vscode.Uri.file(path.dirname(editor.document.uri.fsPath));
                    // The shared scan leaves out guideline documents and
                    // credential files for every provider.
                    ({ files, excluded } = await this.contextExtractor.extractContextDetailed(folderUri, depth));
                    source = { kind: 'folder', label: vscode.workspace.asRelativePath(folderUri) };
                } else {
                    progress.report({ message: 'Reading selection...' });
                    files = [{
                        path: `Selected_Context_from_${path.basename(editor.document.uri.fsPath)}`,
                        content: selectionText!
                    }];
                    source = { kind: 'selection', label: `Selected text from ${path.basename(editor.document.uri.fsPath)}` };
                }

                // Build the request once and show it; only that request is sent.
                const outgoing = await buildOutgoingRequest(
                    { files, excluded, instruction, source, ...(recommendedDirection ? { direction: recommendedDirection } : {}) },
                    'workspace',
                );
                if (!(await confirmGeminiRequest(outgoing, source))) {
                    return;
                }

                progress.report({ message: 'Consulting Gemini Architect...' });

                const diagramCode = await this.geminiService.generateDiagramFromPrompt(outgoing.prompt);

                await this.insertDiagram(editor, mode, diagramCode);

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                vscode.window.showErrorMessage(`Generation Failed: ${error.message}`);
                console.error(error);
            }
        });
    }

    /** Insert a generated diagram as a fenced block, after the selection or at the cursor. */
    private async insertDiagram(editor: vscode.TextEditor, mode: 'folder' | 'selection', diagramCode: string): Promise<void> {
        // Insert at cursor (or after selection for clarity)
        const snippet = new vscode.SnippetString(`\n\`\`\`c4x\n${diagramCode}\n\`\`\`\n`);

        // Always insert at an explicit position, never at "wherever the
        // editor happens to be". insertSnippet() with no location
        // targets the current selections and REPLACES them, so running
        // this with text selected destroyed that text. Generating a
        // diagram must only ever add to the document.
        const insertAt = mode === 'selection'
            ? editor.selection.end
            : (editor.selection.isEmpty ? editor.selection.active : editor.selection.end);
        await editor.insertSnippet(snippet, insertAt);
    }

    /**
     * Generation through the VS Code Language Model API (#392). No API key is
     * asked for. The diagram type is chosen from the list (no extra model call
     * to recommend one), the user confirms the model and what is sent, and the
     * answer goes through the same parser loop as Gemini.
     */
    private async runLanguageModelGeneration(editor: vscode.TextEditor, mode: 'folder' | 'selection'): Promise<void> {
        let selectionText: string | undefined;
        if (mode === 'selection') {
            selectionText = editor.document.getText(editor.selection);
            if (!selectionText || selectionText.trim().length === 0) {
                vscode.window.showErrorMessage('No text selected.');
                return;
            }
        }

        const selection = await this.promptForInstruction([]);
        if (!selection) { return; }

        try {
            let files: { path: string, content: string }[];
            let source: ContextSource;
            let scanExcluded: ExcludedFile[] = [];
            if (mode === 'folder') {
                const folderUri = vscode.Uri.file(path.dirname(editor.document.uri.fsPath));
                let excluded: ExcludedFile[];
                ({ files, excluded } = await this.contextExtractor.extractContextDetailed(folderUri, selection.depth));
                scanExcluded = excluded;
                source = { kind: 'folder', label: vscode.workspace.asRelativePath(folderUri) };
            } else {
                files = [{ path: `Selected_Context_from_${path.basename(editor.document.uri.fsPath)}`, content: selectionText! }];
                source = { kind: 'selection', label: `Selected text from ${path.basename(editor.document.uri.fsPath)}` };
            }

            const { runLanguageModelGeneration, vscodeLanguageModelUi } = await import('../ai/providers/vscodeLanguageModelFlow');
            const host = vscode as unknown as import('../ai/providers/vscodeLanguageModel').LanguageModelHost;
            // The flow builds the request once, shows it, and sends only that.
            const diagramCode = await runLanguageModelGeneration(host, vscodeLanguageModelUi(host), {
                files,
                excluded: scanExcluded,
                instruction: selection.text,
                source,
            });
            if (diagramCode === undefined) { return; }
            await this.insertDiagram(editor, mode, diagramCode);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
            vscode.window.showErrorMessage(`Generation Failed: ${error.message}`);
            console.error(error);
        }
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
            { label: 'System Context (C1)', type: 'C1', description: 'High-level systems & actors (Scans 1 level - broad overview)', instruction: 'Create a C4 System Context (Level 1) diagram.', depth: 1 },
            { label: 'Container Architecture (C2)', type: 'C2', description: 'Apps, services & DBs (Scans 2 levels - find all containers)', instruction: 'Create a C4 Container (Level 2) diagram.', depth: 2 },
            { label: 'Component Diagram (C3)', type: 'C3', description: 'Classes & modules (Scans 3 levels - detailed structure)', instruction: 'Create a C4 Component (Level 3) diagram.', depth: 3 },
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
}
