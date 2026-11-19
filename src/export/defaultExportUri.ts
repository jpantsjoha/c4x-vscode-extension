/**
 * Default save location for every export format (#435).
 *
 * One rule, shared by SVG, PNG and HTML export: suggest
 * `<folder of the source file>/<basename>.<ext>`. The source is the file the
 * caller names, else the active text editor's file. With no usable source the
 * suggestion falls back to `diagram.<ext>` in the first workspace folder, and
 * with no workspace either to `undefined`, so VS Code picks its own default.
 */

import * as path from 'path';
import * as vscode from 'vscode';

export interface DefaultExportUriOptions {
    /** A file name (any directory part is dropped) to use instead of the source's basename. */
    suggestedName?: string;
    /** The source file. Defaults to the active text editor's document. */
    source?: vscode.Uri;
}

function isLocalFile(uri: vscode.Uri | undefined): uri is vscode.Uri {
    if (!uri || !uri.fsPath) {
        return false;
    }
    const scheme = (uri as { scheme?: string }).scheme;
    return scheme === undefined || scheme === 'file';
}

export function defaultExportUri(
    extension: string,
    options: DefaultExportUriOptions = {},
): vscode.Uri | undefined {
    const source = options.source ?? vscode.window.activeTextEditor?.document?.uri;
    const hasSource = isLocalFile(source);

    let fileName: string;
    if (options.suggestedName) {
        fileName = path.basename(options.suggestedName);
    } else if (hasSource) {
        fileName = `${path.basename(source.fsPath, path.extname(source.fsPath))}.${extension}`;
    } else {
        fileName = `diagram.${extension}`;
    }

    if (hasSource) {
        return vscode.Uri.file(path.join(path.dirname(source.fsPath), fileName));
    }
    const [folder] = vscode.workspace.workspaceFolders ?? [];
    return folder ? vscode.Uri.joinPath(folder.uri, fileName) : undefined;
}
