import * as vscode from 'vscode';
import type { BoundedTextEdit } from './SourceRange';
import type {
    SidecarPersistenceBoundary,
    SidecarUri,
    VscodeSidecarApi,
} from './SidecarPersistence';

/** The subset of a VS Code text document used by the writeback service. */
export interface WritebackDocument {
    readonly uri: SidecarUri;
    readonly version: number;
    readonly languageId: string;
    readonly fileName: string;
    getText(): string;
    positionAt(offset: number): unknown;
}

/**
 * The complete host boundary for a writeback transaction.
 *
 * The transaction service only depends on these operations, allowing unit
 * tests to use an in-memory document and filesystem rather than VS Code.
 */
export interface WritebackTransactionBoundary extends SidecarPersistenceBoundary {
    getLayoutPersistenceMode(): string;
    applyBoundedEdits(document: WritebackDocument, edits: readonly BoundedTextEdit[]): PromiseLike<boolean>;
    undo(): PromiseLike<unknown>;
}

/**
 * The small VS Code API surface used by the adapter. Kept separate from the
 * service contracts so this is the only runtime boundary that knows VS Code.
 */
export interface VscodeWritebackApi extends VscodeSidecarApi {
    readonly workspace: VscodeSidecarApi['workspace'] & {
        getConfiguration(section?: string): {
            get<T>(section: string, defaultValue: T): T;
        };
        applyEdit(edit: unknown): PromiseLike<boolean>;
    };
    readonly ['WorkspaceEdit']: new () => {
        replace(uri: unknown, range: unknown, newText: string): void;
    };
    readonly ['Range']: new (start: unknown, end: unknown) => unknown;
    readonly commands: {
        executeCommand(command: string): PromiseLike<unknown>;
    };
}

/** Adapts VS Code's APIs to the isolated sidecar persistence boundary. */
export function createVscodeSidecarPersistenceBoundary(
    vscodeApi: VscodeSidecarApi,
): SidecarPersistenceBoundary {
    return {
        getWorkspaceFolder: uri => vscodeApi.workspace.getWorkspaceFolder(uri as vscode.Uri),
        getWorkspaceFolders: () => vscodeApi.workspace.workspaceFolders ?? [],
        readFile: uri => vscodeApi.workspace.fs.readFile(uri as vscode.Uri),
        writeFile: (uri, content) => vscodeApi.workspace.fs.writeFile(uri as vscode.Uri, content),
        deleteFile: uri => vscodeApi.workspace.fs.delete(uri as vscode.Uri),
        joinPath: (base, ...paths) => vscodeApi.Uri.joinPath(base as vscode.Uri, ...paths),
        file: filePath => vscodeApi.Uri.file(filePath),
        getWorkingDirectory: () => process.cwd(),
    };
}

/** Adapts VS Code's document-editing APIs to the pure writeback service. */
export function createVscodeWritebackTransactionBoundary(
    vscodeApi: VscodeWritebackApi,
): WritebackTransactionBoundary {
    return {
        ...createVscodeSidecarPersistenceBoundary(vscodeApi),
        getLayoutPersistenceMode: () =>
            vscodeApi.workspace.getConfiguration('c4x').get<string>('layout.persistence', 'native'),
        applyBoundedEdits: async (document, edits) => {
            const workspaceEdit = new vscodeApi.WorkspaceEdit();
            for (const edit of edits) {
                const start = document.positionAt(edit.range.start.offset);
                const end = document.positionAt(edit.range.end.offset);
                workspaceEdit.replace(document.uri, new vscodeApi.Range(start, end), edit.newText);
            }
            return vscodeApi.workspace.applyEdit(workspaceEdit);
        },
        undo: () => vscodeApi.commands.executeCommand('undo'),
    };
}

/**
 * Preserves the public entry points used by the extension-host tier while
 * keeping the runtime VS Code import outside the unit-testable services.
 */
export function createDefaultVscodeSidecarPersistenceBoundary(): SidecarPersistenceBoundary {
    return createVscodeSidecarPersistenceBoundary(resolveVscode());
}

/** Creates the default VS Code transaction boundary for extension-host calls. */
export function createDefaultVscodeWritebackTransactionBoundary(): WritebackTransactionBoundary {
    return createVscodeWritebackTransactionBoundary(resolveVscode());
}

function resolveVscode(): VscodeWritebackApi {
    return vscode as unknown as VscodeWritebackApi;
}
