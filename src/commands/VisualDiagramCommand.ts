import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { GeminiService } from '../ai/GeminiService';

/**
 * Command to generate visual C4 diagrams as PNG images using Gemini Image model
 */
export class VisualDiagramCommand {
    private geminiService: GeminiService;
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.geminiService = new GeminiService(context);
    }

    public async generateVisualDiagram(editor: vscode.TextEditor) {
        if (!editor) { return; }

        // Check if verified
        const isReady = await this.geminiService.checkReady();
        if (!isReady) {
            const authed = await this.handleAuthFlow();
            if (!authed) { return; }
        }

        const selectionText = editor.document.getText(editor.selection);
        if (!selectionText || selectionText.trim().length === 0) {
            vscode.window.showErrorMessage('No text selected. Please select architecture description text.');
            return;
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'Generating Visual Diagram (PNG)...',
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: 'Analyzing context...' });

                // Detect Framework (C4, Sequence, Flowchart) for accurate filename & generation
                const frameworkResult = await this.geminiService.detectDiagramFramework(selectionText);
                let diagramType = frameworkResult.framework as string; // Default type label

                // If C4, refine level (C1/C2/C3)
                let c4Level = 'C2';
                let direction: 'TB' | 'LR' = 'TB';

                if (frameworkResult.framework === 'C4') {
                    const recommendation = await this.geminiService.recommendDiagramType(selectionText);
                    c4Level = recommendation.types[0] || 'C2';
                    direction = recommendation.direction;
                    diagramType = c4Level; // e.g. "C2"
                }

                progress.report({ message: `Creating ${diagramType} diagram image...` });

                // Generate image using Gemini Image model
                const imageData = await this.geminiService.generateVisualDiagram(
                    selectionText,
                    c4Level,
                    direction,
                    frameworkResult // Pass pre-detected result
                );

                if (!imageData) {
                    vscode.window.showErrorMessage('Failed to generate image. The model may not support image generation.');
                    return;
                }

                progress.report({ message: 'Saving image...' });

                // Save PNG to same folder as document
                const docDir = path.dirname(editor.document.uri.fsPath);
                const timestamp = Date.now();
                const filename = `c4x-visual-${diagramType.toLowerCase()}-${timestamp}.png`;
                const imagePath = path.join(docDir, filename);

                // Decode base64 and save
                const buffer = Buffer.from(imageData, 'base64');
                fs.writeFileSync(imagePath, buffer);

                // Insert markdown image reference
                const relPath = `./${filename}`;
                const imageRef = `\n![${c4Level} Diagram](${relPath})\n`;
                const endPos = editor.selection.end;

                const wsEdit = new vscode.WorkspaceEdit();
                wsEdit.insert(editor.document.uri, endPos, imageRef);
                const applied = await vscode.workspace.applyEdit(wsEdit);

                if (applied) {
                    await editor.document.save();
                } else {
                    vscode.window.showWarningMessage('Could not insert image reference automatically.');
                }

                vscode.window.showInformationMessage(
                    `Visual diagram saved: ${filename}`,
                    'Open Image'
                ).then(action => {
                    if (action === 'Open Image') {
                        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(imagePath));
                    }
                });

                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
                vscode.window.showErrorMessage(`Visual generation failed: ${error.message}`);
                console.error(error);
            }
        });
    }

    private async handleAuthFlow(): Promise<boolean> {
        const choice = await vscode.window.showWarningMessage(
            'Gemini API Key is missing. Connect to Google Gemini to proceed.',
            'Get Free Key',
            'Enter Key'
        );

        if (choice === 'Get Free Key') {
            vscode.env.openExternal(vscode.Uri.parse('https://aistudio.google.com/app/apikey'));
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
