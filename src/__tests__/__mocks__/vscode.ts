// Minimal vscode mock for unit tests that import modules depending on 'vscode'.
// Only stubs the APIs actually used by the imported modules.

export const workspace = {
    workspaceFolders: undefined as unknown,
    getConfiguration: (_section?: string) => ({
        get: (_key: string) => undefined,
    }),
    fs: {
        readFile: async () => Buffer.from(''),
        stat: async () => ({ type: 1 }),
    },
};

export const Uri = {
    joinPath: (..._args: unknown[]) => ({ fsPath: '' }),
    file: (path: string) => ({ fsPath: path }),
};

export const window = {
    showWarningMessage: () => undefined,
    showErrorMessage: () => undefined,
    showInformationMessage: () => undefined,
    withProgress: async <T>(_options: unknown, task: (progress: unknown) => Promise<T>): Promise<T> => {
        return task({ report: () => undefined });
    },
};

export enum ProgressLocation {
    Notification = 15,
    SourceControl = 1,
    Window = 10,
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}
