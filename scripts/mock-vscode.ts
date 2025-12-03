// Mock vscode module
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string, defaultValue: any) => defaultValue,
            update: () => Promise.resolve(),
        }),
        ConfigurationTarget: {
            Workspace: 1,
        },
    },
    commands: {
        registerCommand: () => ({ dispose: () => { } }),
    },
    window: {
        showErrorMessage: console.error,
        showInformationMessage: console.log,
    },
};

// Register mock
import * as Module from 'module';
const originalRequire = Module.prototype.require;

(Module.prototype as any).require = function (this: any, ...args: any[]) {
    if (args[0] === 'vscode') {
        return vscodeMock;
    }
    return originalRequire.apply(this, args as any);

};
