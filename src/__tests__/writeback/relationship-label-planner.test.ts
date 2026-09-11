/**
 * planRelationshipLabelUpdate unit tests (#105 Phase 2).
 *
 * The planner must only ever touch the |label| span of a relationship
 * statement — set, replace, or clear — with bounded validation.
 */
import * as assert from 'assert';
import {
    planRelationshipLabelUpdate,
    planRelationshipTechnologyUpdate,
    planRelationshipTypeUpdate,
    planRelationshipEndpointUpdate,
    planRelationshipAdd,
    InvalidMetadataPatchError,
    NativeElementSourceRef,
} from '../../writeback/NativeMutationPlanner';
import { sourcePositionAt, SourceRange } from '../../writeback/SourceRange';
import { executeWritebackTransaction } from '../../writeback/WritebackTransaction';
import type { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import type { SidecarUri, SidecarWorkspaceFolder } from '../../writeback/SidecarPersistence';
import type { AddRelationshipMessage } from '../../webview/visualLayoutProtocol';

function refFor(source: string, statement: string, elementId = 'rel-0'): NativeElementSourceRef {
    const start = source.indexOf(statement);
    assert.ok(start >= 0, `statement not found in source: ${statement}`);
    const range: SourceRange = {
        start: sourcePositionAt(source, start),
        end: sourcePositionAt(source, start + statement.length),
    };
    return { elementId, range };
}

function applyEdits(source: string, edits: { range: SourceRange; newText: string }[]): string {
    const sorted = [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset);
    let text = source;
    for (const edit of sorted) {
        text = text.slice(0, edit.range.start.offset) + edit.newText + text.slice(edit.range.end.offset);
    }
    return text;
}

describe('planRelationshipLabelUpdate', () => {
    it('inserts a label into an unlabeled relationship', () => {
        const source = 'graph TB\na --> b\n';
        const edits = planRelationshipLabelUpdate(source, refFor(source, 'a --> b'), 'Uses');
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Uses| b\n');
    });

    it('replaces an existing label', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipLabelUpdate(source, refFor(source, 'a -->|Uses| b'), 'Calls');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Calls| b\n');
    });

    it('clears an existing label with null', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipLabelUpdate(source, refFor(source, 'a -->|Uses| b'), null);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na --> b\n');
    });

    it('is a no-op when clearing an unlabeled relationship', () => {
        const source = 'graph TB\na --> b\n';
        const edits = planRelationshipLabelUpdate(source, refFor(source, 'a --> b'), null);
        assert.deepStrictEqual(edits, []);
    });

    it('handles async and sync arrow forms', () => {
        const sourceAsync = 'graph TB\na -.->|event| b\n';
        const editsAsync = planRelationshipLabelUpdate(sourceAsync, refFor(sourceAsync, 'a -.->|event| b'), 'tick');
        assert.strictEqual(applyEdits(sourceAsync, editsAsync), 'graph TB\na -.->|tick| b\n');

        const sourceSync = 'graph TB\na ==> b\n';
        const editsSync = planRelationshipLabelUpdate(sourceSync, refFor(sourceSync, 'a ==> b'), 'rpc');
        assert.strictEqual(applyEdits(sourceSync, editsSync), 'graph TB\na ==>|rpc| b\n');
    });

    it('rejects pipe characters, quotes, and newlines in labels', () => {
        const source = 'graph TB\na --> b\n';
        const ref = refFor(source, 'a --> b');
        for (const bad of ['x|y', 'has "quote"', 'line\nbreak']) {
            assert.throws(() => planRelationshipLabelUpdate(source, ref, bad), InvalidMetadataPatchError);
        }
    });

    it('rejects empty and over-length labels with a hint to clear instead', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const ref = refFor(source, 'a -->|Uses| b');
        assert.throws(() => planRelationshipLabelUpdate(source, ref, '   '), /pass null to clear/);
        assert.throws(() => planRelationshipLabelUpdate(source, ref, 'x'.repeat(121)), InvalidMetadataPatchError);
    });

    it('trims surrounding whitespace from labels', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipLabelUpdate(source, refFor(source, 'a -->|Uses| b'), '  Reads  ');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Reads| b\n');
    });
});

describe('relationship label edits through executeWritebackTransaction', () => {
    function createInMemoryDocument(text: string): { document: WritebackDocument; boundary: WritebackTransactionBoundary; state: () => string } {
        let currentText = text;
        const boundary: WritebackTransactionBoundary = {
            getLayoutPersistenceMode: () => 'native',
            getWorkspaceFolder: (_uri: SidecarUri): SidecarWorkspaceFolder | undefined => undefined,
            getWorkspaceFolders: (): readonly SidecarWorkspaceFolder[] => [],
            readFile: async (_uri: SidecarUri): Promise<Uint8Array> => new Uint8Array(),
            writeFile: async (_uri: SidecarUri, _content: Uint8Array): Promise<void> => {},
            deleteFile: async (_uri: SidecarUri): Promise<void> => {},
            joinPath: (base: SidecarUri, ...parts: string[]): SidecarUri => ({ ...base, fsPath: [base.fsPath, ...parts].join('/') }),
            file: (p: string): SidecarUri => ({ fsPath: p, scheme: 'file' }),
            getWorkingDirectory: () => '/test',
            undo: async () => {},
            applyBoundedEdits: async (_doc, edits) => {
                const sorted = [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset);
                for (const edit of sorted) {
                    currentText = currentText.slice(0, edit.range.start.offset) + edit.newText + currentText.slice(edit.range.end.offset);
                }
                return true;
            },
        };
        const document: WritebackDocument = {
            uri: { fsPath: '/test/diagram.c4x', scheme: 'file' },
            version: 1,
            languageId: 'c4x',
            fileName: '/test/diagram.c4x',
            getText: () => currentText,
            positionAt: (offset: number) => sourcePositionAt(currentText, offset),
        };
        return { document, boundary, state: () => currentText };
    }

    const message = (label: string | null) => ({
        type: 'visualLayout.applySemanticEdits' as const,
        protocolVersion: 1,
        revision: '1',
        edits: [{ id: 'rel-0', edgeId: 'rel-0', label }],
    });

    it('applies a staged relationship label edit through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\na -->|Uses| b\n');
        const applied = await executeWritebackTransaction(document, message('Calls') as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -->|Calls| b'), `expected updated label in source: ${state()}`);
        assert.ok(!state().includes('|Uses|'), `old label must be gone: ${state()}`);
    });

    it('clears a relationship label through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\na -->|Uses| b\n');
        const applied = await executeWritebackTransaction(document, message(null) as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a --> b'), `expected label removed: ${state()}`);
    });

    it('rejects an unknown edge id', async () => {
        const { document, boundary } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\na --> b\n');
        await assert.rejects(
            executeWritebackTransaction(document, {
                type: 'visualLayout.applySemanticEdits' as const,
                protocolVersion: 1,
                revision: '1',
                edits: [{ id: 'rel-99', edgeId: 'rel-99', label: 'X' }],
            } as never, undefined, boundary),
            /not found/,
        );
    });

    it('applies a staged relationship technology edit through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\na -->|Uses| b\n');
        const applied = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits' as const,
            protocolVersion: 1,
            revision: '1',
            edits: [{ id: 'rel-0', edgeId: 'rel-0', technology: 'HTTP' }],
        } as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -->|Uses| "HTTP" b'), `expected technology in source: ${state()}`);
    });

    it('applies a staged relationship relType edit through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\na -->|Uses| b\n');
        const applied = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits' as const,
            protocolVersion: 1,
            revision: '1',
            edits: [{ id: 'rel-0', edgeId: 'rel-0', relType: 'async' }],
        } as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -.->|Uses| b'), `expected async arrow in source: ${state()}`);
    });

    it('applies a staged relationship endpoint re-assignment through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\nSystem(c, "C")\na -->|Uses| b\n');
        const applied = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits' as const,
            protocolVersion: 1,
            revision: '1',
            edits: [{ id: 'rel-0', edgeId: 'rel-0', to: 'c' }],
        } as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -->|Uses| c'), `expected target changed in source: ${state()}`);
        assert.ok(!state().includes('a -->|Uses| b'), `old target must be gone: ${state()}`);
    });

    it('rejects an illegal endpoint re-assignment', async () => {
        const { document, boundary } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\nNode(n, "N")\na -->|Uses| b\n');
        await assert.rejects(
            executeWritebackTransaction(document, {
                type: 'visualLayout.applySemanticEdits' as const,
                protocolVersion: 1,
                revision: '1',
                edits: [{ id: 'rel-0', edgeId: 'rel-0', to: 'n' }],
            } as never, undefined, boundary),
            /Deployment Nodes cannot be connected directly to logical-view elements/,
        );
    });
});

describe('planRelationshipTechnologyUpdate', () => {
    it('inserts technology into a relationship that has only a label', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipTechnologyUpdate(source, refFor(source, 'a -->|Uses| b'), 'HTTP');
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Uses| "HTTP" b\n');
    });

    it('inserts technology into a relationship without a label', () => {
        const source = 'graph TB\na --> b\n';
        const edits = planRelationshipTechnologyUpdate(source, refFor(source, 'a --> b'), 'HTTP');
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na --> "HTTP" b\n');
    });

    it('replaces an existing technology value', () => {
        const source = 'graph TB\na -->|Uses| "REST" b\n';
        const edits = planRelationshipTechnologyUpdate(source, refFor(source, 'a -->|Uses| "REST" b'), 'GraphQL');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Uses| "GraphQL" b\n');
    });

    it('clears an existing technology with null', () => {
        const source = 'graph TB\na -->|Uses| "REST" b\n';
        const edits = planRelationshipTechnologyUpdate(source, refFor(source, 'a -->|Uses| "REST" b'), null);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Uses| b\n');
    });

    it('is a no-op when clearing an un-technology-ed relationship', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipTechnologyUpdate(source, refFor(source, 'a -->|Uses| b'), null);
        assert.deepStrictEqual(edits, []);
    });

    it('preserves async and sync arrow forms', () => {
        const sourceAsync = 'graph TB\na -.->|event| "AMQP" b\n';
        const editsAsync = planRelationshipTechnologyUpdate(sourceAsync, refFor(sourceAsync, 'a -.->|event| "AMQP" b'), 'Kafka');
        assert.strictEqual(applyEdits(sourceAsync, editsAsync), 'graph TB\na -.->|event| "Kafka" b\n');

        const sourceSync = 'graph TB\na ==> "gRPC" b\n';
        const editsSync = planRelationshipTechnologyUpdate(sourceSync, refFor(sourceSync, 'a ==> "gRPC" b'), 'HTTP/2');
        assert.strictEqual(applyEdits(sourceSync, editsSync), 'graph TB\na ==> "HTTP/2" b\n');
    });

    it('rejects quotes, newlines, and over-length technology values', () => {
        const source = 'graph TB\na --> b\n';
        const ref = refFor(source, 'a --> b');
        assert.throws(() => planRelationshipTechnologyUpdate(source, ref, 'has "quote"'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipTechnologyUpdate(source, ref, 'line\nbreak'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipTechnologyUpdate(source, ref, 'x'.repeat(121)), InvalidMetadataPatchError);
    });
});

describe('planRelationshipTypeUpdate', () => {
    it('changes uses to async', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipTypeUpdate(source, refFor(source, 'a -->|Uses| b'), 'async');
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -.->|Uses| b\n');
    });

    it('changes uses to sync', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipTypeUpdate(source, refFor(source, 'a -->|Uses| b'), 'sync');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na ==>|Uses| b\n');
    });

    it('changes async to uses', () => {
        const source = 'graph TB\na -.->|event| b\n';
        const edits = planRelationshipTypeUpdate(source, refFor(source, 'a -.->|event| b'), 'uses');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|event| b\n');
    });

    it('is a no-op when the type already matches', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipTypeUpdate(source, refFor(source, 'a -->|Uses| b'), 'uses');
        assert.deepStrictEqual(edits, []);
    });

    it('rejects unsupported relationship types', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const ref = refFor(source, 'a -->|Uses| b');
        assert.throws(() => planRelationshipTypeUpdate(source, ref, 'bidirectional' as never), InvalidMetadataPatchError);
    });
});

describe('planRelationshipEndpointUpdate', () => {
    it('changes the source endpoint', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipEndpointUpdate(source, refFor(source, 'a -->|Uses| b'), 'from', 'c');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\nc -->|Uses| b\n');
    });

    it('changes the target endpoint', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipEndpointUpdate(source, refFor(source, 'a -->|Uses| b'), 'to', 'c');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\na -->|Uses| c\n');
    });

    it('changes both endpoints when composed', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const fromEdits = planRelationshipEndpointUpdate(source, refFor(source, 'a -->|Uses| b'), 'from', 'x');
        const toEdits = planRelationshipEndpointUpdate(source, refFor(source, 'a -->|Uses| b'), 'to', 'y');
        assert.strictEqual(applyEdits(source, [...fromEdits, ...toEdits]), 'graph TB\nx -->|Uses| y\n');
    });

    it('is a no-op when the endpoint already matches', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const edits = planRelationshipEndpointUpdate(source, refFor(source, 'a -->|Uses| b'), 'from', 'a');
        assert.deepStrictEqual(edits, []);
    });

    it('rejects invalid endpoint identifiers', () => {
        const source = 'graph TB\na -->|Uses| b\n';
        const ref = refFor(source, 'a -->|Uses| b');
        assert.throws(() => planRelationshipEndpointUpdate(source, ref, 'from', '1bad'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipEndpointUpdate(source, ref, 'to', 'has space'), InvalidMetadataPatchError);
    });
});

describe('planRelationshipAdd', () => {
    function elementRef(source: string, elementId: string): NativeElementSourceRef {
        // Declarations look like `Person(a, "A")` — locate the identifier inside
        // the parentheses, then widen to the whole declaration statement.
        const idIndex = source.indexOf(`(${elementId},`);
        assert.ok(idIndex >= 0, `element ${elementId} not found in source`);
        let start = idIndex;
        while (start > 0 && source.charAt(start - 1) !== '\n') {
            start--;
        }
        while (/[ \t]/.test(source.charAt(start))) {
            start++;
        }
        const end = source.indexOf(')', idIndex) + 1;
        return {
            elementId,
            range: {
                start: sourcePositionAt(source, start),
                end: sourcePositionAt(source, end),
            },
        };
    }

    it('inserts a relationship statement after the source element', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const edits = planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'Uses', null, 'uses');
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(applyEdits(source, edits), 'graph TB\nPerson(a, "A")\na -->|Uses| b\nSystem(b, "B")\n');
    });

    it('includes technology when provided', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const edits = planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'Uses', 'HTTP', 'uses');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\nPerson(a, "A")\na -->|Uses| "HTTP" b\nSystem(b, "B")\n');
    });

    it('omits technology when null or empty', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const editsNull = planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'Uses', null, 'uses');
        const editsEmpty = planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'Uses', '', 'uses');
        assert.strictEqual(applyEdits(source, editsNull), 'graph TB\nPerson(a, "A")\na -->|Uses| b\nSystem(b, "B")\n');
        assert.strictEqual(applyEdits(source, editsEmpty), 'graph TB\nPerson(a, "A")\na -->|Uses| b\nSystem(b, "B")\n');
    });

    it('maps relationship types to the correct arrow', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        assert.strictEqual(applyEdits(source, planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'event', null, 'async')), 'graph TB\nPerson(a, "A")\na -.->|event| b\nSystem(b, "B")\n');
        assert.strictEqual(applyEdits(source, planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'rpc', null, 'sync')), 'graph TB\nPerson(a, "A")\na ==>|rpc| b\nSystem(b, "B")\n');
    });

    it('preserves indentation of the source element line', () => {
        const source = 'graph TB\nsubgraph boundary\n  Person(a, "A")\n  System(b, "B")\nend\n';
        const edits = planRelationshipAdd(source, elementRef(source, 'a'), 'b', 'Uses', null, 'uses');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\nsubgraph boundary\n  Person(a, "A")\n  a -->|Uses| b\n  System(b, "B")\nend\n');
    });

    it('trims label whitespace', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const edits = planRelationshipAdd(source, elementRef(source, 'a'), 'b', '  Uses  ', null, 'uses');
        assert.strictEqual(applyEdits(source, edits), 'graph TB\nPerson(a, "A")\na -->|Uses| b\nSystem(b, "B")\n');
    });

    it('rejects empty, over-length, and malformed labels', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const ref = elementRef(source, 'a');
        assert.throws(() => planRelationshipAdd(source, ref, 'b', '', null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'b', '   ', null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'b', 'x'.repeat(121), null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'b', 'has "quote"', null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'b', 'line\nbreak', null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'b', 'has | pipe', null, 'uses'), InvalidMetadataPatchError);
    });

    it('rejects invalid target identifiers', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const ref = elementRef(source, 'a');
        assert.throws(() => planRelationshipAdd(source, ref, '1bad', 'Uses', null, 'uses'), InvalidMetadataPatchError);
        assert.throws(() => planRelationshipAdd(source, ref, 'has space', 'Uses', null, 'uses'), InvalidMetadataPatchError);
    });

    it('rejects unsupported relationship types', () => {
        const source = 'graph TB\nPerson(a, "A")\nSystem(b, "B")\n';
        const ref = elementRef(source, 'a');
        assert.throws(() => planRelationshipAdd(source, ref, 'b', 'Uses', null, 'bidirectional' as never), InvalidMetadataPatchError);
    });

    it('rejects stale source ranges', () => {
        const source = 'graph TB\nPerson(a, "A")\n';
        const ref = elementRef(source, 'a');
        const changedSource = 'graph TB\nPerson(x, "X")\n';
        assert.throws(() => planRelationshipAdd(changedSource, ref, 'b', 'Uses', null, 'uses'), /StaleRangeError|invalid or no longer matches/);
    });
});

describe('relationship add through executeWritebackTransaction', () => {
    function createInMemoryDocument(text: string): { document: WritebackDocument; boundary: WritebackTransactionBoundary; state: () => string } {
        let currentText = text;
        const boundary: WritebackTransactionBoundary = {
            getLayoutPersistenceMode: () => 'native',
            getWorkspaceFolder: (_uri: SidecarUri): SidecarWorkspaceFolder | undefined => undefined,
            getWorkspaceFolders: (): readonly SidecarWorkspaceFolder[] => [],
            readFile: async (_uri: SidecarUri): Promise<Uint8Array> => new Uint8Array(),
            writeFile: async (_uri: SidecarUri, _content: Uint8Array): Promise<void> => {},
            deleteFile: async (_uri: SidecarUri): Promise<void> => {},
            joinPath: (base: SidecarUri, ...parts: string[]): SidecarUri => ({ ...base, fsPath: [base.fsPath, ...parts].join('/') }),
            file: (p: string): SidecarUri => ({ fsPath: p, scheme: 'file' }),
            getWorkingDirectory: () => '/test',
            undo: async () => {},
            applyBoundedEdits: async (_doc, edits) => {
                const sorted = [...edits].sort((a, b) => b.range.start.offset - a.range.start.offset);
                for (const edit of sorted) {
                    currentText = currentText.slice(0, edit.range.start.offset) + edit.newText + currentText.slice(edit.range.end.offset);
                }
                return true;
            },
        };
        const document: WritebackDocument = {
            uri: { fsPath: '/test/diagram.c4x', scheme: 'file' },
            version: 1,
            languageId: 'c4x',
            fileName: '/test/diagram.c4x',
            getText: () => currentText,
            positionAt: (offset: number) => sourcePositionAt(currentText, offset),
        };
        return { document, boundary, state: () => currentText };
    }

    const addMessage = (sourceId: string, targetId: string, label: string, relType: 'uses' | 'async' | 'sync', technology?: string): AddRelationshipMessage => ({
        type: 'addRelationship' as const,
        protocolVersion: 1,
        revision: '1',
        sourceId,
        targetId,
        label,
        ...(technology !== undefined ? { technology } : {}),
        relType,
    });

    it('applies a legal relationship add through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\n');
        const applied = await executeWritebackTransaction(document, addMessage('a', 'b', 'Uses', 'uses'), undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -->|Uses| b'), `expected relationship in source: ${state()}`);
    });

    it('applies a relationship add with technology through the guarded pipeline', async () => {
        const { document, boundary, state } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nSystem(b, "B")\n');
        const applied = await executeWritebackTransaction(document, addMessage('a', 'b', 'Uses', 'uses', 'HTTP'), undefined, boundary);
        assert.strictEqual(applied, true);
        assert.ok(state().includes('a -->|Uses| "HTTP" b'), `expected relationship with technology in source: ${state()}`);
    });

    it('rejects an illegal relationship add', async () => {
        const { document, boundary } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\nNode(n, "N")\n');
        await assert.rejects(
            executeWritebackTransaction(document, addMessage('a', 'n', 'Uses', 'uses'), undefined, boundary),
            /Deployment Nodes cannot be connected directly to logical-view elements/,
        );
    });

    it('rejects a relationship add with a missing endpoint', async () => {
        const { document, boundary } = createInMemoryDocument('%%{ c4: system-context }%%\ngraph TB\nPerson(a, "A")\n');
        await assert.rejects(
            executeWritebackTransaction(document, addMessage('a', 'missing', 'Uses', 'uses'), undefined, boundary),
            /not found/,
        );
    });
});
