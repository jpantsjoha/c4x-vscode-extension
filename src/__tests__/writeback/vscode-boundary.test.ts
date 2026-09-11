import * as assert from 'assert';
import * as path from 'path';
import { C4Boundary, C4Element, C4Model, C4Rel } from '../../model/C4Model';
import { applyBoundedEdits, sourcePositionAt } from '../../writeback/SourceRange';
import {
    applySidecarLayoutOverrides,
    getRelativePath,
    getSidecarUri,
    loadSidecarLayout,
    resetSidecarLayout,
    saveSidecarLayout,
    SidecarPersistenceBoundary,
    SidecarUri,
    stringifyDeterministic,
    VscodeSidecarApi,
} from '../../writeback/SidecarPersistence';
import {
    executeResetLayoutTransaction,
    executeWritebackTransaction,
    assertStructuralEquivalence,
    WritebackTransactionError,
} from '../../writeback/WritebackTransaction';
import {
    createVscodeSidecarPersistenceBoundary,
    createVscodeWritebackTransactionBoundary,
    VscodeWritebackApi,
    WritebackDocument,
    WritebackTransactionBoundary,
} from '../../writeback/VscodeWritebackBoundary';
import { MoveElementMessage } from '../../webview/visualLayoutProtocol';

function fileUri(fsPath: string, scheme = 'file'): SidecarUri {
    return { fsPath, scheme };
}

function textBytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function decode(bytes: Uint8Array): string {
    return new TextDecoder().decode(bytes);
}

interface MemorySidecar {
    readonly boundary: SidecarPersistenceBoundary;
    readonly files: Map<string, Uint8Array>;
}

function createMemorySidecar(
    workspaceRoot: SidecarUri | undefined = fileUri('/workspace'),
    workspaceFolders: readonly SidecarUri[] = workspaceRoot ? [workspaceRoot] : [],
): MemorySidecar {
    // These fixture URIs deliberately use POSIX paths on every host. Keep the
    // in-memory boundary independent of the runner's filesystem separator so
    // the same persistence contract is exercised on Windows CI.
    const fixturePath = path.posix;
    const files = new Map<string, Uint8Array>();
    const boundary: SidecarPersistenceBoundary = {
        getWorkspaceFolder: uri => {
            const matchingRoot = workspaceFolders.find(folder =>
                uri.fsPath === folder.fsPath || uri.fsPath.startsWith(`${folder.fsPath}/`),
            );
            return matchingRoot ? { uri: matchingRoot } : undefined;
        },
        getWorkspaceFolders: () => workspaceFolders.map(uri => ({ uri })),
        readFile: uri => {
            const bytes = files.get(uri.fsPath);
            return bytes ? Promise.resolve(bytes) : Promise.reject(new Error('ENOENT'));
        },
        writeFile: (uri, content) => {
            files.set(uri.fsPath, content);
            return Promise.resolve();
        },
        deleteFile: uri => {
            files.delete(uri.fsPath);
            return Promise.resolve();
        },
        joinPath: (base, ...parts) => fileUri(fixturePath.join(base.fsPath, ...parts), base.scheme),
        file: filePath => fileUri(filePath),
        getWorkingDirectory: () => '/current',
    };
    return { boundary, files };
}

class MemoryDocument implements WritebackDocument {
    public version = 1;

    constructor(
        public readonly uri: SidecarUri,
        public readonly languageId: string,
        public readonly fileName: string,
        private text: string,
    ) {}

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): unknown {
        return { offset };
    }

    replaceText(text: string): void {
        this.text = text;
        this.version++;
    }
}

interface MemoryTransaction {
    readonly boundary: WritebackTransactionBoundary;
    readonly calls: {
        apply: number;
        undo: number;
    };
}

function createMemoryTransaction(
    document: MemoryDocument,
    sidecar: SidecarPersistenceBoundary,
    persistenceMode = 'native',
    applyEdit: (source: string, edits: Parameters<typeof applyBoundedEdits>[1]) => string = applyBoundedEdits,
): MemoryTransaction {
    const calls = { apply: 0, undo: 0 };
    let beforeEdit = document.getText();
    return {
        calls,
        boundary: {
            ...sidecar,
            getLayoutPersistenceMode: () => persistenceMode,
            applyBoundedEdits: async (target, edits) => {
                calls.apply++;
                beforeEdit = target.getText();
                document.replaceText(applyEdit(target.getText(), edits));
                return true;
            },
            undo: async () => {
                calls.undo++;
                document.replaceText(beforeEdit);
            },
        },
    };
}

function move(document: MemoryDocument, id = 'User'): MoveElementMessage {
    return {
        type: 'visualLayout.moveElement',
        protocolVersion: 1,
        revision: String(document.version),
        id,
        x: 120,
        y: 240,
        input: 'keyboard',
    };
}

function element(id: string, metadata?: Record<string, string>, children?: C4Element[]): C4Element {
    return { id, label: id, type: 'Person', metadata, children };
}

function relationship(label = 'Uses'): C4Rel {
    return { id: 'User->System', from: 'User', to: 'System', label, relType: 'uses' };
}

function boundary(label = 'System boundary'): C4Boundary {
    return { id: 'system', label, direction: 'TB', elements: ['System'] };
}

function structuralModel(
    elements: C4Element[],
    relationships: C4Rel[] = [],
    boundaries: C4Boundary[] = [],
    direction: 'TB' | 'LR' = 'TB',
): C4Model {
    return {
        workspace: 'Test',
        views: [{
            type: 'C1' as C4Model['views'][number]['type'],
            direction,
            elements,
            relationships,
            boundaries,
        }],
    };
}

describe('SidecarPersistence boundary seam', () => {
    it('resolves workspace-relative paths and deterministic sidecar locations without VS Code', () => {
        const memory = createMemorySidecar();
        const documentUri = fileUri('/workspace/diagrams/system.c4x');

        assert.strictEqual(getRelativePath(documentUri, memory.boundary), 'diagrams/system.c4x');
        assert.strictEqual(getSidecarUri(documentUri, memory.boundary).fsPath, '/workspace/.c4x-layout.json');
        assert.strictEqual(
            stringifyDeterministic({ z: 1, a: { y: 2, x: 3 } }),
            '{\n  "a": {\n    "x": 3,\n    "y": 2\n  },\n  "z": 1\n}\n',
        );
    });

    it('uses the first workspace folder or a local fallback when no containing folder exists', () => {
        const fallbackWorkspace = createMemorySidecar(undefined, [fileUri('/fallback')]);
        const outside = fileUri('/outside/system.c4x');
        assert.strictEqual(getSidecarUri(outside, fallbackWorkspace.boundary).fsPath, '/fallback/.c4x-layout.json');

        const standalone = createMemorySidecar(undefined, []);
        assert.strictEqual(getRelativePath(outside, standalone.boundary), 'system.c4x');
        assert.strictEqual(getSidecarUri(outside, standalone.boundary).fsPath, '/outside/.c4x-layout.json');
        assert.strictEqual(
            getSidecarUri(fileUri('untitled:diagram', 'untitled'), standalone.boundary).fsPath,
            '/current/.c4x-layout.json',
        );
    });

    it('loads, saves, resets, and deterministically rewrites in-memory sidecar data', async () => {
        const memory = createMemorySidecar();
        const firstDocument = fileUri('/workspace/diagrams/first.c4x');
        const secondDocument = fileUri('/workspace/diagrams/second.c4x');
        const sidecarUri = getSidecarUri(firstDocument, memory.boundary);

        await saveSidecarLayout(firstDocument, 'User', 10, 20, memory.boundary);
        await saveSidecarLayout(secondDocument, 'System', 30, 40, memory.boundary);

        assert.deepStrictEqual(await loadSidecarLayout(firstDocument, memory.boundary), {
            User: { x: 10, y: 20 },
        });
        assert.deepStrictEqual(await loadSidecarLayout(secondDocument, memory.boundary), {
            System: { x: 30, y: 40 },
        });

        await resetSidecarLayout(firstDocument, memory.boundary);
        const afterFirstReset = JSON.parse(decode(memory.files.get(sidecarUri.fsPath)!));
        assert.deepStrictEqual(Object.keys(afterFirstReset.layouts), ['diagrams/second.c4x']);

        await resetSidecarLayout(secondDocument, memory.boundary);
        assert.strictEqual(memory.files.has(sidecarUri.fsPath), false);
    });

    it('treats missing and malformed sidecars as absent layouts', async () => {
        const memory = createMemorySidecar();
        const documentUri = fileUri('/workspace/system.c4x');
        const sidecarUri = getSidecarUri(documentUri, memory.boundary);

        assert.strictEqual(await loadSidecarLayout(documentUri, memory.boundary), null);
        memory.files.set(sidecarUri.fsPath, textBytes('not json'));
        assert.strictEqual(await loadSidecarLayout(documentUri, memory.boundary), null);
        await resetSidecarLayout(documentUri, memory.boundary);
    });

    it('normalizes partial sidecar data and preserves array and null values deterministically', async () => {
        const memory = createMemorySidecar();
        const documentUri = fileUri('/workspace/system.c4x');
        const sidecarUri = getSidecarUri(documentUri, memory.boundary);
        memory.files.set(sidecarUri.fsPath, textBytes('{"layouts":{"system.c4x":{}}}'));

        await saveSidecarLayout(documentUri, 'User', 1, 2, memory.boundary);
        assert.deepStrictEqual(await loadSidecarLayout(documentUri, memory.boundary), {
            User: { x: 1, y: 2 },
        });
        assert.strictEqual(
            stringifyDeterministic({ values: [null, { z: 1, a: 2 }] }),
            '{\n  "values": [\n    null,\n    {\n      "a": 2,\n      "z": 1\n    }\n  ]\n}\n',
        );

        memory.files.set(sidecarUri.fsPath, textBytes('{"version":"1.0"}'));
        assert.strictEqual(await loadSidecarLayout(documentUri, memory.boundary), null);
        await resetSidecarLayout(documentUri, memory.boundary);
    });

    it('merges overrides for nested elements without reading VS Code state', async () => {
        const memory = createMemorySidecar();
        const documentUri = fileUri('/workspace/system.c4x');
        await saveSidecarLayout(documentUri, 'Api', 50, 75, memory.boundary);
        const model = {
            views: [{
                elements: [{
                    id: 'System',
                    metadata: {},
                    children: [{ id: 'Api', metadata: {} }],
                }],
            }],
        } as unknown as C4Model;

        await applySidecarLayoutOverrides(model, documentUri, memory.boundary);
        assert.deepStrictEqual(model.views[0].elements[0].children?.[0].metadata, { x: '50', y: '75' });
    });

    it('creates missing metadata and applies only defined locked overrides', async () => {
        const memory = createMemorySidecar();
        const documentUri = fileUri('/workspace/system.c4x');
        const sidecarUri = getSidecarUri(documentUri, memory.boundary);
        memory.files.set(sidecarUri.fsPath, textBytes(JSON.stringify({
            layouts: {
                'system.c4x': {
                    elements: {
                        User: { x: 10, y: 20, locked: true },
                    },
                },
            },
        })));
        const model = structuralModel([element('User'), element('Unchanged')]);

        await applySidecarLayoutOverrides(model, documentUri, memory.boundary);
        assert.deepStrictEqual(model.views[0].elements[0].metadata, { x: '10', y: '20', locked: 'true' });
        assert.strictEqual(model.views[0].elements[1].metadata, undefined);
    });
});

describe('WritebackTransaction boundary seam', () => {
    it('persists a native move through the injected edit operation', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const sidecar = createMemorySidecar();
        const transaction = createMemoryTransaction(document, sidecar.boundary);

        assert.strictEqual(await executeWritebackTransaction(document, move(document), undefined, transaction.boundary), true);
        assert.ok(document.getText().includes('$x="120"'));
        assert.ok(document.getText().includes('$y="240"'));
        assert.strictEqual(transaction.calls.apply, 1);
        assert.strictEqual(transaction.calls.undo, 0);
    });

    it('rejects malformed coordinates and stale revisions before invoking the boundary', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);
        const invalid = { ...move(document), x: Number.NaN };

        await assert.rejects(
            executeWritebackTransaction(document, invalid, undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'invalid_payload',
        );
        await assert.rejects(
            executeWritebackTransaction(document, { ...move(document), revision: '0' }, undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'stale_revision',
        );
        assert.strictEqual(transaction.calls.apply, 0);
    });

    it('routes configured sidecar moves through the injected filesystem', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const sidecar = createMemorySidecar();
        const transaction = createMemoryTransaction(document, sidecar.boundary, 'sidecar');

        assert.strictEqual(await executeWritebackTransaction(document, move(document), undefined, transaction.boundary), true);
        assert.strictEqual(transaction.calls.apply, 0);
        assert.deepStrictEqual(await loadSidecarLayout(document.uri, sidecar.boundary), {
            User: { x: 120, y: 240 },
        });
    });

    it('routes Structurizr and PlantUML documents to sidecar persistence after model validation', async () => {
        const structurizr = new MemoryDocument(
            fileUri('/workspace/system.dsl'),
            'structurizr-dsl',
            '/workspace/system.dsl',
            'workspace "Test" {\n' +
                '  model {\n' +
                '    user = person "User"\n' +
                '    system = softwareSystem "System"\n' +
                '    user -> system "Uses"\n' +
                '  }\n' +
                '  views { systemContext system "Context" { include * } }\n' +
                '}',
        );
        const structurizrSidecar = createMemorySidecar();
        const structurizrTransaction = createMemoryTransaction(structurizr, structurizrSidecar.boundary);
        assert.strictEqual(
            await executeWritebackTransaction(structurizr, move(structurizr, 'user'), undefined, structurizrTransaction.boundary),
            true,
        );

        const plantuml = new MemoryDocument(
            fileUri('/workspace/system.puml'),
            'plantuml',
            '/workspace/system.puml',
            '@startuml\nPerson(user, "User")\n@enduml',
        );
        const plantumlSidecar = createMemorySidecar();
        const plantumlTransaction = createMemoryTransaction(plantuml, plantumlSidecar.boundary);
        assert.strictEqual(
            await executeWritebackTransaction(plantuml, move(plantuml, 'user'), undefined, plantumlTransaction.boundary),
            true,
        );
    });

    it('rejects invalid native source and skips an edit that is already canonical', async () => {
        const invalid = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(',
        );
        const invalidTransaction = createMemoryTransaction(invalid, createMemorySidecar().boundary);
        await assert.rejects(
            executeWritebackTransaction(invalid, move(invalid), undefined, invalidTransaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'validation_failed',
        );

        const canonical = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User", $x="120", $y="240")',
        );
        const canonicalTransaction = createMemoryTransaction(canonical, createMemorySidecar().boundary);
        assert.strictEqual(await executeWritebackTransaction(canonical, move(canonical), undefined, canonicalTransaction.boundary), true);
        assert.strictEqual(canonicalTransaction.calls.apply, 0);
    });

    it('fails closed when an element is missing or the host refuses an edit', async () => {
        const missingDocument = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const missingTransaction = createMemoryTransaction(missingDocument, createMemorySidecar().boundary);
        await assert.rejects(
            executeWritebackTransaction(missingDocument, move(missingDocument, 'Missing'), undefined, missingTransaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'missing_element',
        );

        const rejectedDocument = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const rejectedTransaction = createMemoryTransaction(rejectedDocument, createMemorySidecar().boundary);
        const rejectedBoundary: WritebackTransactionBoundary = {
            ...rejectedTransaction.boundary,
            applyBoundedEdits: async () => false,
        };
        await assert.rejects(
            executeWritebackTransaction(rejectedDocument, move(rejectedDocument), undefined, rejectedBoundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'validation_failed',
        );
    });

    it('undoes when a host edit produces text that cannot be reparsed', async () => {
        const initialText = 'graph TB\nPerson(User, "User")';
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            initialText,
        );
        // First applyEdit call returns garbage (bad host edit); subsequent calls (rollback
        // restoration edit) use the real applyBoundedEdits so the inverse WorkspaceEdit is honored.
        let applyCall = 0;
        const transaction = createMemoryTransaction(
            document,
            createMemorySidecar().boundary,
            'native',
            (source, edits) => (++applyCall === 1 ? 'graph TB\nPerson(' : applyBoundedEdits(source, edits)),
        );

        await assert.rejects(
            executeWritebackTransaction(document, move(document), undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'validation_failed',
        );
        // Merged behavior: rollback goes through boundary.applyBoundedEdits with an inverse
        // WorkspaceEdit (per PR #48 audit fix), NOT through boundary.undo(). The bad edit
        // increments apply once; the restoration edit increments it again.
        assert.strictEqual(transaction.calls.apply, 2);
        assert.strictEqual(transaction.calls.undo, 0);
        assert.strictEqual(document.getText(), initialText);
    });

    it('resets native metadata and sidecar layout through the same injected boundary', async () => {
        const nativeDocument = new MemoryDocument(
            fileUri('/workspace/native.c4x'),
            'c4x',
            '/workspace/native.c4x',
            'graph TB\nPerson(User, "User", $x="1", $y="2", $locked="true")',
        );
        const nativeTransaction = createMemoryTransaction(nativeDocument, createMemorySidecar().boundary);
        assert.strictEqual(await executeResetLayoutTransaction(nativeDocument, undefined, nativeTransaction.boundary), true);
        assert.ok(!nativeDocument.getText().includes('$x'));

        const sidecar = createMemorySidecar();
        const sidecarDocument = new MemoryDocument(
            fileUri('/workspace/foreign.dsl'),
            'structurizr-dsl',
            '/workspace/foreign.dsl',
            'workspace "Test" { model { user = person "User" } }',
        );
        await saveSidecarLayout(sidecarDocument.uri, 'user', 1, 2, sidecar.boundary);
        const sidecarTransaction = createMemoryTransaction(sidecarDocument, sidecar.boundary);
        assert.strictEqual(await executeResetLayoutTransaction(sidecarDocument, undefined, sidecarTransaction.boundary), true);
        assert.strictEqual(await loadSidecarLayout(sidecarDocument.uri, sidecar.boundary), null);
    });

    it('returns without editing an already reset document and reports invalid or rejected reset edits', async () => {
        const empty = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const emptyTransaction = createMemoryTransaction(empty, createMemorySidecar().boundary);
        assert.strictEqual(await executeResetLayoutTransaction(empty, undefined, emptyTransaction.boundary), true);
        assert.strictEqual(emptyTransaction.calls.apply, 0);

        const invalid = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(',
        );
        await assert.rejects(
            executeResetLayoutTransaction(invalid, undefined, createMemoryTransaction(invalid, createMemorySidecar().boundary).boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'validation_failed',
        );

        const rejected = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User", $x="1")',
        );
        const rejectedTransaction = createMemoryTransaction(rejected, createMemorySidecar().boundary);
        const rejectedBoundary: WritebackTransactionBoundary = {
            ...rejectedTransaction.boundary,
            applyBoundedEdits: async () => false,
        };
        await assert.rejects(
            executeResetLayoutTransaction(rejected, undefined, rejectedBoundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'validation_failed',
        );
    });

    it('applies batch semantic edits including coordinates and description writeback', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")\nContainer(App, "App", "Java")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const batchMessage = {
            type: 'visualLayout.applySemanticEdits' as const,
            protocolVersion: 1 as const,
            revision: String(document.version),
            edits: [
                { id: 'User', x: 100, y: 150 },
                { id: 'App', description: 'Updated Description' }
            ]
        };

        const result = await executeWritebackTransaction(document, batchMessage, undefined, transaction.boundary);
        assert.strictEqual(result, true);

        const finalSource = document.getText();
        assert.ok(finalSource.includes('Person(User, "User", $x="100", $y="150")'));
        assert.ok(finalSource.includes('Container(App, "App", "Java", "Updated Description")'));
    });

    it('coalesces semantic and coordinate inserts at a minimal element call without overlap', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        assert.strictEqual(await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{
                id: 'User',
                technology: 'TypeScript',
                tags: ['Core'],
                x: 100,
                y: 150,
            }],
        }, undefined, transaction.boundary), true);

        assert.strictEqual(transaction.calls.apply, 1);
        assert.ok(document.getText().includes(
            'Person(User, "User", "TypeScript", $tags="Core", $x="100", $y="150")',
        ));
    });

    it('applies field edits and identifier rename with all relationship references in one workspace edit', async () => {
        const original = [
            'graph TB',
            'Person(User, "User", "TypeScript", "Old description")',
            'Container(App, "App")',
            'Container(Audit, "Audit")',
            'User -->|Uses| App',
            'App -->|Audits| User',
            'Audit -->|Reports| User',
        ].join('\n');
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            original,
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);
        const message = {
            type: 'visualLayout.applySemanticEdits' as const,
            protocolVersion: 1 as const,
            revision: String(document.version),
            edits: [{
                id: 'User',
                label: 'Customer',
                technology: 'Kotlin',
                tags: ['Core'],
                sprite: 'person',
                newId: 'Customer',
            }],
        };

        assert.strictEqual(await executeWritebackTransaction(document, message, undefined, transaction.boundary), true);
        assert.strictEqual(transaction.calls.apply, 1);
        assert.ok(document.getText().includes('Person(Customer, "Customer", "Kotlin", "Old description", $tags="Core", $sprite=person)'));
        assert.ok(document.getText().includes('Customer -->|Uses| App'));
        assert.ok(document.getText().includes('App -->|Audits| Customer'));
        assert.ok(document.getText().includes('Audit -->|Reports| Customer'));

        await transaction.boundary.undo();
        assert.strictEqual(document.getText(), original);
    });

    it('fails closed on an identifier conflict before applying a workspace edit', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")\nContainer(App, "App")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);
        await assert.rejects(
            executeWritebackTransaction(document, {
                type: 'visualLayout.applySemanticEdits',
                protocolVersion: 1,
                revision: String(document.version),
                edits: [{ id: 'User', newId: 'App' }],
            }, undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError &&
                error.code === 'validation_failed' && error.message.includes('id_conflict: App'),
        );
        assert.strictEqual(transaction.calls.apply, 0);
    });
});

describe('WritebackTransaction structural equivalence', () => {
    it('allows only target layout metadata changes across nested elements', () => {
        const original = structuralModel([
            element('System', undefined, [element('User', { owner: 'team' })]),
            element('Other', { owner: 'other-team' }),
        ], [relationship()], [boundary()]);
        const updated = structuralModel([
            element('System', undefined, [element('User', { owner: 'team', x: '120', y: '240' })]),
            element('Other', { owner: 'other-team' }),
        ], [relationship()], [boundary()]);

        assert.doesNotThrow(() => assertStructuralEquivalence(original, updated, 'User'));
    });

    it('rejects changed view, element, relationship, and boundary semantics', () => {
        const original = structuralModel([element('User'), element('System')], [relationship()], [boundary()]);
        assert.throws(
            () => assertStructuralEquivalence(original, structuralModel([element('User'), element('System')], [relationship()], [boundary()], 'LR'), 'User'),
            /layout direction changed/,
        );
        assert.throws(
            () => assertStructuralEquivalence(original, structuralModel([element('User')], [relationship()], [boundary()]), 'User'),
            /Elements count changed/,
        );
        assert.throws(
            () => assertStructuralEquivalence(original, structuralModel([element('User'), element('System')], [], [boundary()]), 'User'),
            /Relationships count changed/,
        );
        assert.throws(
            () => assertStructuralEquivalence(original, structuralModel([element('User'), element('System')], [relationship()], []), 'User'),
            /Boundaries count changed/,
        );
    });

    it('rejects non-layout target metadata and modified non-target metadata', () => {
        const original = structuralModel([element('User', { owner: 'team' }), element('Other', { owner: 'other' })]);
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([element('User', { owner: 'changed' }), element('Other', { owner: 'other' })]),
                'User',
            ),
            /Non-layout metadata key "owner" was modified/,
        );
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([element('User', { owner: 'team' }), element('Other', { owner: 'changed' })]),
                'User',
            ),
            /Metadata changed for non-target element/,
        );
    });

    it('allows a declared identifier rename to update relationship endpoints and boundary membership only', () => {
        const original = structuralModel(
            [element('User'), element('System')],
            [relationship()],
            [boundary()],
        );
        const updated = structuralModel(
            [element('User'), { ...element('System'), id: 'Platform' }],
            [{ ...relationship(), id: 'User->Platform', to: 'Platform' }],
            [{ ...boundary(), elements: ['Platform'] }],
        );

        assert.doesNotThrow(() => assertStructuralEquivalence(
            original,
            updated,
            'System',
            new Set(),
            new Map([['System', { newId: 'Platform' }]]),
        ));
    });

    it('rejects changed element, relationship, boundary, and added metadata identities', () => {
        const original = structuralModel([element('User', { owner: 'team' }), element('System')], [relationship()], [boundary()]);
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([{ ...element('User', { owner: 'team' }), label: 'Renamed' }, element('System')], [relationship()], [boundary()]),
                'User',
            ),
            /Structural property mismatch/,
        );
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([element('User', { owner: 'team' }), element('System')], [relationship('Changed')], [boundary()]),
                'User',
            ),
            /Relationship properties changed/,
        );
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([element('User', { owner: 'team' }), element('System')], [relationship()], [boundary('Changed boundary')]),
                'User',
            ),
            /Boundary properties changed/,
        );
        assert.throws(
            () => assertStructuralEquivalence(
                original,
                structuralModel([element('User', { owner: 'team', added: 'value' }), element('System')], [relationship()], [boundary()]),
                'User',
            ),
            /Non-layout metadata key "added" was added/,
        );
    });
});

describe('VscodeWritebackBoundary adapter', () => {
    it('maps a VS Code-shaped object into sidecar and transaction operations', async () => {
        const root = fileUri('/workspace');
        const files = new Map<string, Uint8Array>();
        const replacements: Array<{ uri: unknown; range: unknown; newText: string }> = [];
        let undoCount = 0;

        class FakeWorkspaceEdit {
            replace(uri: unknown, range: unknown, newText: string): void {
                replacements.push({ uri, range, newText });
            }
        }
        class FakeRange {
            constructor(readonly start: unknown, readonly end: unknown) {}
        }
        const vscodeApi = {
            workspace: {
                getWorkspaceFolder: () => ({ uri: root }),
                workspaceFolders: [{ uri: root }],
                fs: {
                    readFile: async (uri: SidecarUri) => files.get(uri.fsPath) ?? textBytes(''),
                    writeFile: async (uri: SidecarUri, content: Uint8Array) => { files.set(uri.fsPath, content); },
                    delete: async (uri: SidecarUri) => { files.delete(uri.fsPath); },
                },
                getConfiguration: () => ({ get: <T>(_key: string, defaultValue: T) => defaultValue }),
                applyEdit: async () => true,
            },
            Uri: {
                joinPath: (base: SidecarUri, ...parts: string[]) => fileUri(path.join(base.fsPath, ...parts)),
                file: (filePath: string) => fileUri(filePath),
            },
            WorkspaceEdit: FakeWorkspaceEdit,
            Range: FakeRange,
            commands: {
                executeCommand: async () => { undoCount++; },
            },
        } as unknown as VscodeWritebackApi;
        const document = new MemoryDocument(root, 'c4x', '/workspace/system.c4x', 'abc');
        const range = {
            start: sourcePositionAt('abc', 0),
            end: sourcePositionAt('abc', 1),
        };

        const sidecarBoundary = createVscodeSidecarPersistenceBoundary(vscodeApi as VscodeSidecarApi);
        await sidecarBoundary.writeFile(fileUri('/workspace/a'), textBytes('data'));
        assert.strictEqual(decode(await sidecarBoundary.readFile(fileUri('/workspace/a'))), 'data');

        const transactionBoundary = createVscodeWritebackTransactionBoundary(vscodeApi);
        assert.strictEqual(transactionBoundary.getLayoutPersistenceMode(), 'native');
        assert.strictEqual(await transactionBoundary.applyBoundedEdits(document, [{ range, newText: 'A' }]), true);
        await transactionBoundary.undo();
        assert.strictEqual(replacements.length, 1);
        assert.ok(replacements[0].range instanceof FakeRange);
        assert.strictEqual(undoCount, 1);
    });

    // ── #86 Lock toggle tests ─────────────────────────────────────────────────

    it('[#86] toggles $locked to true and persists in native C4X source', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'User', locked: true }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        assert.ok(document.getText().includes('$locked="true"'), `Expected $locked="true" in: ${document.getText()}`);
        assert.ok(!document.getText().includes('$x='), 'No coordinate should be written when only locked is staged');
    });

    it('[#86] toggles $locked to false on a previously-locked element in native C4X source', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User", $x="10", $y="20", $locked="true")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'User', locked: false }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        assert.ok(document.getText().includes('$locked="false"'), `Expected $locked="false" in: ${document.getText()}`);
        // Coordinates must survive untouched
        assert.ok(document.getText().includes('$x="10"'));
        assert.ok(document.getText().includes('$y="20"'));
    });

    it('[#86] stages locked together with coordinates as one atomic write', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nPerson(User, "User")',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'User', x: 100, y: 200, locked: true }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        assert.strictEqual(transaction.calls.apply, 1, 'Must be one atomic WorkspaceEdit undo unit');
        assert.ok(document.getText().includes('$x="100"'));
        assert.ok(document.getText().includes('$y="200"'));
        assert.ok(document.getText().includes('$locked="true"'));
    });

    it('[#86] sidecar mode preserves locked flag already in native source (C11 guarantee)', async () => {
        // In sidecar mode coordinates go to the sidecar; the native source with $locked
        // is untouched by a coordinate-only staged edit. The $locked value read from
        // source is what subsequent renderers use.
        const initialSource = 'graph TB\nPerson(User, "User", $locked="true")';
        const sidecar = createMemorySidecar();
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            initialSource,
        );
        const transaction = createMemoryTransaction(document, sidecar.boundary, 'sidecar');

        // Staged coord-only edit in sidecar mode must NOT alter $locked in source
        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'User', x: 50, y: 75 }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        // In sidecar mode, coords go to the sidecar file, not the source document.
        // The source text must remain unchanged, so $locked="true" is preserved.
        assert.strictEqual(document.getText(), initialSource);
    });

    // ── #137 Boundary frame reposition + resize ─────────────────────────────────

    it('[#137] persists a native boundary move as subgraph metadata', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', x: 120, y: 240 }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        assert.ok(document.getText().includes('subgraph Backend $x="120", $y="240"'));
    });

    it('[#137] persists a native boundary resize independently of position', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        const result = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: String(document.version),
            edits: [{ id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', w: 500, h: 400 }],
        }, undefined, transaction.boundary);

        assert.strictEqual(result, true);
        assert.ok(document.getText().includes('subgraph Backend $w="500", $h="400"'));
    });

    it('[#137] rejects a boundary edit with incomplete position or size pairs', async () => {
        const document = new MemoryDocument(
            fileUri('/workspace/system.c4x'),
            'c4x',
            '/workspace/system.c4x',
            'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}',
        );
        const transaction = createMemoryTransaction(document, createMemorySidecar().boundary);

        await assert.rejects(
            executeWritebackTransaction(document, {
                type: 'visualLayout.applySemanticEdits',
                protocolVersion: 1,
                revision: String(document.version),
                edits: [{ id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', x: 120 }],
            }, undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'invalid_payload',
        );

        await assert.rejects(
            executeWritebackTransaction(document, {
                type: 'visualLayout.applySemanticEdits',
                protocolVersion: 1,
                revision: String(document.version),
                edits: [{ id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', w: 500 }],
            }, undefined, transaction.boundary),
            (error: unknown) => error instanceof WritebackTransactionError && error.code === 'invalid_payload',
        );
    });
});
