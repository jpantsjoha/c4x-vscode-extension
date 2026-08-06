/**
 * MarkdownFenceWritebackBoundary unit tests (B18 DoD).
 *
 * Verifies that body-relative edit offsets are correctly shifted to
 * document-absolute positions before being applied via the inner boundary.
 * Unaffected Markdown bytes outside the fence body must not be touched.
 */

import * as assert from 'assert';
import { createMarkdownFenceWritebackBoundary } from '../../writeback/MarkdownFenceWritebackBoundary';
import { applyBoundedEdits, BoundedTextEdit, sourcePositionAt } from '../../writeback/SourceRange';
import type { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import type { SidecarWorkspaceFolder, SidecarUri } from '../../writeback/SidecarPersistence';

// ---------------------------------------------------------------------------
// In-memory inner boundary for tests
// ---------------------------------------------------------------------------

interface TestBoundaryState {
    appliedEdits: Array<{ start: number; end: number; newText: string }>;
}

function createInMemoryBoundary(
    documentText: string,
    state: TestBoundaryState
): WritebackTransactionBoundary {
    let currentText = documentText;

    return {
        getLayoutPersistenceMode: () => 'native',
        getWorkspaceFolder: (_uri: SidecarUri): SidecarWorkspaceFolder | undefined => undefined,
        getWorkspaceFolders: (): readonly SidecarWorkspaceFolder[] => [],
        readFile: async (_uri: SidecarUri): Promise<Uint8Array> => new Uint8Array(),
        writeFile: async (_uri: SidecarUri, _content: Uint8Array): Promise<void> => {},
        deleteFile: async (_uri: SidecarUri): Promise<void> => {},
        joinPath: (base: SidecarUri, ...parts: string[]): SidecarUri => ({
            ...base,
            fsPath: [base.fsPath, ...parts].join('/'),
        }),
        file: (filePath: string): SidecarUri => ({ fsPath: filePath, scheme: 'file' }),
        getWorkingDirectory: () => '/test',
        undo: async () => {},
        applyBoundedEdits: async (
            _document: WritebackDocument,
            edits: readonly BoundedTextEdit[]
        ): Promise<boolean> => {
            for (const edit of edits) {
                state.appliedEdits.push({
                    start: edit.range.start.offset,
                    end: edit.range.end.offset,
                    newText: edit.newText,
                });
            }
            currentText = applyBoundedEdits(currentText, [...edits]);
            return true;
        },
    };
}

function createTestDocument(fullText: string): WritebackDocument {
    return {
        uri: { fsPath: '/test/doc.md', scheme: 'file' },
        version: 1,
        languageId: 'markdown',
        fileName: '/test/doc.md',
        getText: () => fullText,
        positionAt: (offset: number) => sourcePositionAt(fullText, offset),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('MarkdownFenceWritebackBoundary — edit offset rebasing', () => {
    it('shifts a single body-relative insertion to the correct absolute position', async () => {
        const prefix = '# Markdown heading\n\n```c4x\n';
        const body = 'graph TB\nPerson(User, "User")';
        const suffix = '\n```\n\nMore prose.\n';
        const fullText = prefix + body + suffix;
        const bodyStart = prefix.length;

        const state: TestBoundaryState = { appliedEdits: [] };
        const inner = createInMemoryBoundary(fullText, state);
        const document = createTestDocument(fullText);
        const boundary = createMarkdownFenceWritebackBoundary(inner, bodyStart, document);

        // Body-relative edit: insert ' EDITED' at offset 28 in the body
        // (right after 'Person(User, "User")').
        const bodyRelativeOffset = body.length; // end of body
        const edit: BoundedTextEdit = {
            range: {
                start: sourcePositionAt(body, bodyRelativeOffset),
                end: sourcePositionAt(body, bodyRelativeOffset),
            },
            newText: '\nSoftwareSystem(Portal, "Portal")',
        };

        await boundary.applyBoundedEdits(document, [edit]);

        // The inner boundary should have received absolute offsets.
        assert.strictEqual(state.appliedEdits.length, 1);
        const applied = state.appliedEdits[0];
        const expectedAbsoluteOffset = bodyStart + bodyRelativeOffset;
        assert.strictEqual(applied.start, expectedAbsoluteOffset,
            `Expected absolute start ${expectedAbsoluteOffset}, got ${applied.start}`);
        assert.strictEqual(applied.end, expectedAbsoluteOffset,
            `Expected absolute end ${expectedAbsoluteOffset}, got ${applied.end}`);
        assert.strictEqual(applied.newText, '\nSoftwareSystem(Portal, "Portal")');
    });

    it('preserves all Markdown bytes outside the fence body after applying an edit', async () => {
        const prefix = '# Architecture\n\nSome prose.\n\n```c4x\n';
        const body = 'graph TB\nPerson(User, "User")';
        const suffix = '\n```\n\nTrailing prose.\n';
        const fullText = prefix + body + suffix;
        const bodyStart = prefix.length;

        // Apply edit in-memory using the boundary.
        let capturedText = fullText;
        const inner: WritebackTransactionBoundary = {
            getLayoutPersistenceMode: () => 'native',
            getWorkspaceFolder: () => undefined,
            getWorkspaceFolders: () => [],
            readFile: async () => new Uint8Array(),
            writeFile: async () => {},
            deleteFile: async () => {},
            joinPath: (base, ...parts) => ({ ...base, fsPath: [base.fsPath, ...parts].join('/') }),
            file: (p) => ({ fsPath: p, scheme: 'file' }),
            getWorkingDirectory: () => '/test',
            undo: async () => {},
            applyBoundedEdits: async (_doc, edits) => {
                capturedText = applyBoundedEdits(capturedText, [...edits]);
                return true;
            },
        };

        const boundary = createMarkdownFenceWritebackBoundary(inner, bodyStart, createTestDocument(fullText));
        const document = createTestDocument(fullText);

        // Replace 'User' label text with 'Admin' — offset 22 to 26 in the body.
        const userStart = body.indexOf('User, "User"');
        const edit: BoundedTextEdit = {
            range: {
                start: sourcePositionAt(body, userStart),
                end: sourcePositionAt(body, userStart + 4), // 'User'
            },
            newText: 'Admin',
        };

        await boundary.applyBoundedEdits(document, [edit]);

        // The prefix and suffix must be byte-for-byte identical.
        const resultPrefix = capturedText.slice(0, bodyStart);
        assert.strictEqual(resultPrefix, prefix,
            'Prefix bytes must be untouched');

        // Suffix starts at bodyStart + new body length.
        // new body = body with 'User' -> 'Admin' = body.slice(0, userStart) + 'Admin' + body.slice(userStart + 4)
        const newBody = body.slice(0, userStart) + 'Admin' + body.slice(userStart + 4);
        const resultSuffix = capturedText.slice(bodyStart + newBody.length);
        assert.strictEqual(resultSuffix, suffix,
            'Suffix bytes must be untouched');
    });

    it('handles multiple edits in the same body and applies them all with correct absolute offsets', async () => {
        const prefix = '```c4x\n'; // bodyStart = 7
        const body = 'graph TB\nPerson(A, "A")\nPerson(B, "B")';
        const suffix = '\n```\n';
        const fullText = prefix + body + suffix;
        const bodyStart = prefix.length;

        const state: TestBoundaryState = { appliedEdits: [] };
        const inner = createInMemoryBoundary(fullText, state);
        const document = createTestDocument(fullText);
        const boundary = createMarkdownFenceWritebackBoundary(inner, bodyStart, document);

        // Two zero-width insertions at different offsets.
        const offset1 = body.indexOf('"A"') + 3; // after first label
        const offset2 = body.indexOf('"B"') + 3; // after second label

        const edits: BoundedTextEdit[] = [
            {
                range: {
                    start: sourcePositionAt(body, offset1),
                    end: sourcePositionAt(body, offset1),
                },
                newText: '!',
            },
            {
                range: {
                    start: sourcePositionAt(body, offset2),
                    end: sourcePositionAt(body, offset2),
                },
                newText: '?',
            },
        ];

        await boundary.applyBoundedEdits(document, edits);

        assert.strictEqual(state.appliedEdits.length, 2);
        assert.strictEqual(state.appliedEdits[0].start, bodyStart + offset1);
        assert.strictEqual(state.appliedEdits[1].start, bodyStart + offset2);
    });

    it('works when the call-site document is a body-only virtual view (the panel wiring that threw RangeError in UAT)', async () => {
        // Regression for the installed-build failure: the panel passes a
        // virtual document exposing only the fence body. Before the fix, the
        // boundary computed absolute positions against that short body text
        // and sourcePositionAt threw RangeError — every Markdown save failed.
        const prefix = '# Long markdown document\n\nwith prose before the diagram.\n\n```c4x\n';
        const body = 'graph TB\nSystem_Ext(atm, "ATM Network", "External")';
        const suffix = '\n```\n\nMore prose after.\n';
        const fullText = prefix + body + suffix;
        const bodyStart = prefix.length;

        const state: TestBoundaryState = { appliedEdits: [] };
        const inner = createInMemoryBoundary(fullText, state);
        const absoluteDocument = createTestDocument(fullText);
        const boundary = createMarkdownFenceWritebackBoundary(inner, bodyStart, absoluteDocument);

        // The call-site document is a constant body-only view — exactly what
        // the panel used to construct.
        const virtualBodyDoc: WritebackDocument = {
            uri: { fsPath: '/test/doc.md', scheme: 'file' },
            version: 1,
            languageId: 'c4x',
            fileName: '/test/doc.md',
            getText: () => body,
            positionAt: (offset: number) => sourcePositionAt(fullText, offset + bodyStart),
        };

        const labelStart = body.indexOf('"ATM Network"') + 1;
        const edit: BoundedTextEdit = {
            range: {
                start: sourcePositionAt(body, labelStart),
                end: sourcePositionAt(body, labelStart + 'ATM Network'.length),
            },
            newText: 'ATM Network v2',
        };

        await boundary.applyBoundedEdits(virtualBodyDoc, [edit]);

        assert.strictEqual(state.appliedEdits.length, 1);
        assert.strictEqual(state.appliedEdits[0].start, bodyStart + labelStart);
        assert.strictEqual(state.appliedEdits[0].newText, 'ATM Network v2');
    });
});
