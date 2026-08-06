/**
 * C4X CodeLens provider for Markdown documents.
 *
 * Adds an "Edit C4 diagram in visual editor" CodeLens above each ```c4x
 * fenced block in any Markdown file.  Clicking the lens fires the
 * c4x.editMarkdownBlock command with the document URI and block ordinal so
 * the editor panel can open locked to that specific fence.
 *
 * VS Code resolves CodeLens lazily, so this provider is lightweight: it only
 * scans fence-opening lines and emits one lens per block.
 */
import * as vscode from 'vscode';
import { findC4xFencedBlocks } from '../writeback/SaveAnchor';

export class C4XCodeLensProvider implements vscode.CodeLensProvider {
    provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        if (document.languageId !== 'markdown') {
            return [];
        }

        const blocks = findC4xFencedBlocks(document);
        return blocks.map(block => {
            // The fence opening line determines where the lens appears.
            const openingOffset = block.blockRange.start;
            const position = document.positionAt(openingOffset);
            const range = new vscode.Range(position, position);

            return new vscode.CodeLens(range, {
                title: '$(edit) Edit C4 diagram in visual editor',
                command: 'c4x.editMarkdownBlock',
                arguments: [document.uri, block.blockOrdinal],
                tooltip: 'Open this C4X diagram in the visual editor — move, rename, and edit elements, then save back to this Markdown file',
            });
        });
    }
}
