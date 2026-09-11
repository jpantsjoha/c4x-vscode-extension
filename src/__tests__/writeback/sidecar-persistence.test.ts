import * as assert from 'assert';
import * as path from 'path';

// Mock vscode before loading the sidecar persistence module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as vscodeMock from '../__mocks__/vscode';
import {
    normalizeCoordinate,
    resetSidecarLayout,
    saveSidecarLayout,
    stringifyDeterministic,
} from '../../writeback/SidecarPersistence';
import type * as vscode from 'vscode';

interface MockUri {
    fsPath: string;
}

interface MockWorkspace {
    workspaceFolders: unknown;
    getWorkspaceFolder: (uri: MockUri) => { uri: MockUri } | undefined;
    fs: {
        readFile: (uri: MockUri) => Promise<Uint8Array>;
        writeFile: (uri: MockUri, content: Uint8Array) => Promise<void>;
        delete: (uri: MockUri) => Promise<void>;
    };
}

const workspace = vscodeMock.workspace as unknown as MockWorkspace;
const files = new Map<string, string>();
const workspaceRoot: MockUri = { fsPath: '/workspace' };
const documentPath = '/workspace/diagrams/architecture.dsl';
const documentUri = { fsPath: documentPath, scheme: 'file' } as unknown as vscode.Uri;
const relativePath = 'diagrams/architecture.dsl';
const sidecarPath = path.join(workspaceRoot.fsPath, '.c4x-layout.json');

function readSidecar(): Record<string, unknown> {
    const content = files.get(sidecarPath);
    assert.ok(content, 'Expected the sidecar to be written');
    return JSON.parse(content) as Record<string, unknown>;
}

describe('SidecarPersistence', () => {
    beforeEach(() => {
        files.clear();
        workspace.workspaceFolders = [workspaceRoot];
        workspace.getWorkspaceFolder = () => ({ uri: workspaceRoot });
        workspace.fs = {
            readFile: async (uri) => {
                // Capture before yielding to reproduce the unqueued lost-update
                // race: two writers would otherwise both see a missing file.
                const content = files.get(uri.fsPath);
                await Promise.resolve();
                if (content === undefined) {
                    const error = Object.assign(new Error('File not found'), { code: 'FileNotFound' });
                    throw error;
                }
                return new TextEncoder().encode(content);
            },
            writeFile: async (uri, content) => {
                await Promise.resolve();
                files.set(uri.fsPath, new TextDecoder('utf-8').decode(content));
            },
            delete: async (uri) => {
                await Promise.resolve();
                files.delete(uri.fsPath);
            },
        };

        (vscodeMock.Uri as unknown as { joinPath: (base: MockUri, ...paths: string[]) => MockUri }).joinPath =
            (base, ...paths) => ({ fsPath: path.join(base.fsPath, ...paths) });
    });

    it('normalizes precision and negative zero', () => {
        assert.strictEqual(normalizeCoordinate(0.1 + 0.2), 0.3);
        assert.strictEqual(normalizeCoordinate(12.345), 12.35);
        assert.strictEqual(normalizeCoordinate(-0), 0);
        assert.strictEqual(Object.is(normalizeCoordinate(-0.004), -0), false);
    });

    it('sorts sidecar JSON keys and terminates the output with one newline', () => {
        const serialized = stringifyDeterministic({ z: 1, nested: { b: 2, a: 1 }, a: 0 });

        assert.strictEqual(
            serialized,
            '{\n  "a": 0,\n  "nested": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}\n',
        );
    });

    it('serializes concurrent writes and preserves an existing locked value', async () => {
        files.set(sidecarPath, JSON.stringify({
            layouts: {
                [relativePath]: {
                    elements: {
                        service: { x: 1, y: 2, locked: true },
                    },
                },
            },
        }));

        await Promise.all([
            saveSidecarLayout(documentUri, 'service', 12.345, -0),
            saveSidecarLayout(documentUri, 'database', 30, 40),
        ]);

        const sidecar = readSidecar();
        const layouts = sidecar.layouts as Record<string, { elements: Record<string, unknown> }>;
        assert.deepStrictEqual(Object.keys(layouts), [relativePath]);
        const [layout] = Object.values(layouts);
        assert.ok(layout);
        assert.deepStrictEqual(layout.elements.service, { locked: true, x: 12.35, y: 0 });
        assert.deepStrictEqual(layout.elements.database, { x: 30, y: 40 });
        assert.ok(files.get(sidecarPath)?.endsWith('\n'));
    });

    it('coerces a malformed array element entry instead of spreading array indices', async () => {
        files.set(sidecarPath, JSON.stringify({
            layouts: {
                [relativePath]: {
                    elements: {
                        service: [1, 2],
                    },
                },
            },
        }));

        await saveSidecarLayout(documentUri, 'service', 10, 20);

        const sidecar = readSidecar();
        const layouts = sidecar.layouts as Record<string, { elements: Record<string, unknown> }>;
        assert.deepStrictEqual(layouts[relativePath]!.elements.service, { x: 10, y: 20 });
    });

    it('rebuilds a malformed array layouts root as a plain object on save', async () => {
        files.set(sidecarPath, JSON.stringify({ layouts: [['unexpected']] }));

        await saveSidecarLayout(documentUri, 'service', 10, 20);

        const sidecar = readSidecar();
        assert.ok(!Array.isArray(sidecar.layouts));
        const layouts = sidecar.layouts as Record<string, { elements: Record<string, unknown> }>;
        assert.deepStrictEqual(layouts[relativePath]!.elements.service, { x: 10, y: 20 });
    });

    it('serializes a reset behind an in-flight save through the write chain', async () => {
        // Unchained, the reset would read the (still missing) sidecar before
        // the save lands and no-op, leaving the saved entry behind.
        await Promise.all([
            saveSidecarLayout(documentUri, 'service', 10, 20),
            resetSidecarLayout(documentUri),
        ]);

        assert.strictEqual(files.has(sidecarPath), false, 'reset must run after the queued save');
    });

    it('leaves a malformed array layouts root untouched on reset', async () => {
        const malformed = JSON.stringify({ layouts: [['unexpected']] });
        files.set(sidecarPath, malformed);

        await resetSidecarLayout(documentUri);

        assert.strictEqual(files.get(sidecarPath), malformed);
    });
});
