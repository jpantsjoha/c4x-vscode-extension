// Minimal vscode mock for unit tests that import modules depending on 'vscode'.
// Only stubs the APIs actually used by the imported modules.

// Test-controllable value for c4x.markdown.previewScale (#128).
// `undefined` means "not set" — the configuration getter then returns the
// caller-provided default, like the real Settings API does.
let markdownPreviewScale: unknown;

export function setMarkdownPreviewScaleForTests(value: unknown): void {
    markdownPreviewScale = value;
}

// Test-controllable values for any other `c4x.*` key, e.g. `lint.rules`.
// A key absent from the map behaves as "not set".
const configurationValues = new Map<string, unknown>();

export function setConfigurationValueForTests(key: string, value: unknown): void {
    if (value === undefined) {
        configurationValues.delete(key);
    } else {
        configurationValues.set(key, value);
    }
}

export const workspace = {
    workspaceFolders: undefined as unknown,
    getConfiguration: (_section?: string, _scope?: unknown) => ({
        get: (key: string, defaultValue?: unknown) => {
            if (key === 'markdown.previewScale' && markdownPreviewScale !== undefined) {
                return markdownPreviewScale;
            }
            if (configurationValues.has(key)) {
                return configurationValues.get(key);
            }
            return defaultValue;
        },
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

// Information messages shown during a test, so a test can assert that the user
// was told something once and only once.
const informationMessages: string[] = [];

export function recordedInformationMessages(): readonly string[] {
    return informationMessages;
}

export function clearRecordedInformationMessages(): void {
    informationMessages.length = 0;
}

export const window = {
    showWarningMessage: () => undefined,
    showErrorMessage: () => undefined,
    showInformationMessage: (message?: string) => {
        if (typeof message === 'string') {
            informationMessages.push(message);
        }
        return undefined;
    },
    withProgress: async <T>(_options: unknown, task: (progress: unknown) => Promise<T>): Promise<T> => {
        return task({ report: () => undefined });
    },
};

export enum ProgressLocation {
    Notification = 15,
    SourceControl = 1,
    Window = 10,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum FileType {
    Unknown = 0,
    File = 1,
    Directory = 2,
    SymbolicLink = 64,
}

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Position {
    constructor(public readonly line: number, public readonly character: number) {}
}

export class Range {
    public readonly start: Position;
    public readonly end: Position;

    constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
        this.start = new Position(startLine, startCharacter);
        this.end = new Position(endLine, endCharacter);
    }
}

export class Diagnostic {
    public code?: string | number;
    public source?: string;

    constructor(public range: Range, public message: string, public severity: DiagnosticSeverity = DiagnosticSeverity.Error) {}
}
