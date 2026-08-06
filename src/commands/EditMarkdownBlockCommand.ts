/**
 * Command handler for c4x.editMarkdownBlock.
 *
 * Opens the visual C4 editor panel locked to a specific c4x fenced block
 * inside a Markdown document.  The command is invoked by:
 *   - The C4XCodeLensProvider (above each fence in a Markdown editor)
 *   - The editor/context menu for Markdown files when the cursor is inside a
 *     c4x fence
 *   - The Markdown preview "Edit C4 diagram" link (via c4x://edit URI)
 *
 * Arguments: [uri: vscode.Uri, blockOrdinal: number]
 */
import * as vscode from 'vscode';
import { PreviewPanel } from '../webview/PreviewPanel';
import { findC4xFencedBlocks } from '../writeback/SaveAnchor';

export function registerEditMarkdownBlockCommand(context: vscode.ExtensionContext): vscode.Disposable {
    return vscode.commands.registerCommand(
        'c4x.editMarkdownBlock',
        async (uriOrArg?: vscode.Uri, blockOrdinalArg?: number) => {
            let targetUri: vscode.Uri | undefined = uriOrArg;
            let blockOrdinal: number = blockOrdinalArg ?? 0;

            // If called from the command palette without arguments, use the
            // active editor and find the first c4x fence (or the fence the
            // cursor is positioned inside).
            if (!targetUri) {
                const editor = vscode.window.activeTextEditor;
                if (!editor || editor.document.languageId !== 'markdown') {
                    void vscode.window.showWarningMessage('C4X: Place the cursor inside a c4x fenced block in a Markdown file.');
                    return;
                }
                targetUri = editor.document.uri;
                // Find the fence the cursor sits in.
                const cursorOffset = editor.document.offsetAt(editor.selection.active);
                const blocks = findC4xFencedBlocks(editor.document);
                const enclosing = blocks.find(
                    block => cursorOffset >= block.blockRange.start && cursorOffset <= block.blockRange.end
                );
                blockOrdinal = enclosing?.blockOrdinal ?? 0;
            }

            // Open (or reuse) the Markdown document.
            let document: vscode.TextDocument;
            try {
                document = await vscode.workspace.openTextDocument(targetUri);
            } catch {
                void vscode.window.showErrorMessage(`C4X: Could not open document: ${targetUri.fsPath}`);
                return;
            }

            // Verify the block exists.
            const blocks = findC4xFencedBlocks(document);
            if (blocks.length === 0) {
                void vscode.window.showWarningMessage('C4X: No editable c4x fenced blocks found in this Markdown file.');
                return;
            }
            if (blockOrdinal >= blocks.length) {
                blockOrdinal = 0;
            }

            PreviewPanel.createOrShowForMarkdownBlock(context, document, blockOrdinal);
        }
    );
}
