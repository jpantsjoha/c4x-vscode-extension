// Set up mock before imports
if (typeof (global as any).vscode === 'undefined') {
    (global as any).vscode = {
        workspace: {
            getConfiguration: () => ({
                get: (key: any, defaultValue: any) => defaultValue,
                update: () => Promise.resolve(), // Mock update method
            }),
            ConfigurationTarget: { Workspace: 1 },
        },
        window: {
            activeColorTheme: { kind: 1 }
        },
        Uri: {
            parse: (s: string) => s,
            file: (s: string) => s
        }
    };
}