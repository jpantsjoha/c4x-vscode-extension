import * as vscode from 'vscode';
import { findC4xFencedBlocks } from '../writeback/SaveAnchor';

/** Open only a local Markdown fence explicitly identified by a preview link. */
export async function resolveMarkdownEditUri(uri: vscode.Uri): Promise<{ document: vscode.TextDocument; blockOrdinal: number }> {
    if (uri.scheme !== vscode.env.uriScheme || uri.authority !== 'jpantsjoha.c4x' || uri.path !== '/edit') {
        throw new Error('Invalid editor link.');
    }
    const params = new URLSearchParams(uri.query);
    const rawDocument = params.get('document');
    const rawLine = params.get('line');
    if (!rawDocument || rawLine === null || !/^\d+$/.test(rawLine)) {
        throw new Error('The editor link is missing its document or fence position.');
    }
    const target = vscode.Uri.parse(rawDocument, true);
    const line = Number(rawLine);
    if (target.scheme !== 'file' || target.authority || target.query || target.fragment || !Number.isSafeInteger(line)) {
        throw new Error('The editor link must identify a local Markdown file.');
    }
    const document = await vscode.workspace.openTextDocument(target);
    if (document.languageId !== 'markdown') {
        throw new Error('The editor link does not identify a Markdown document.');
    }
    const block = findC4xFencedBlocks(document).find(candidate =>
        document.positionAt(candidate.blockRange.start).line === line);
    if (!block) {
        throw new Error('This diagram has moved or is not editable. Refresh the Markdown preview and try again.');
    }
    return { document, blockOrdinal: block.blockOrdinal };
}

export async function handleMarkdownEditUri(uri: vscode.Uri): Promise<void> {
    try {
        const { document, blockOrdinal } = await resolveMarkdownEditUri(uri);
        await vscode.commands.executeCommand('c4x.editMarkdownBlock', document.uri, blockOrdinal);
    } catch (error) {
        void vscode.window.showWarningMessage(`C4X: ${error instanceof Error ? error.message : 'Could not open this diagram.'}`);
    }
}

export function registerMarkdownEditUriHandler(): vscode.Disposable {
    return vscode.window.registerUriHandler({ handleUri: handleMarkdownEditUri });
}
