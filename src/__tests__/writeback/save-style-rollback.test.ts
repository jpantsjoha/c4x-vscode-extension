/**
 * Rollback on style loss through the real Save transaction (#369).
 *
 * No planner path drops a style today, so the validation comparison is a
 * backstop that generated Saves never reach. This test makes it fire: the
 * injected host boundary applies the planned edits and then also damages the
 * document, as a defective planner or host would. Save must refuse with the
 * structural error, restore the document byte for byte, and write nothing else.
 * No product seam is added: the boundary is the transaction's own injection point.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import { executeWritebackTransaction, WritebackTransactionError } from '../../writeback/WritebackTransaction';
import { applyBoundedEdits, sourcePositionAt } from '../../writeback/SourceRange';
import type { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import type { SidecarUri, SidecarWorkspaceFolder } from '../../writeback/SidecarPersistence';

const SOURCE = '%%{ c4: system-context }%%\ngraph TB\n'
    + 'elementStyle legacy $stroke="#BF101D", $legend="Legacy"\n'
    + 'System(a, "A", $tags="legacy", $shape="Box")\n'
    + 'System(b, "B")\n';

function harness(damage: (text: string) => string) {
    let text = SOURCE;
    const writes: string[] = [];
    const document: WritebackDocument = {
        uri: { fsPath: '/test/d.c4x', scheme: 'file' },
        version: 1, languageId: 'c4x', fileName: '/test/d.c4x',
        getText: () => text,
        positionAt: (offset: number) => sourcePositionAt(text, offset),
    };
    let first = true;
    const boundary: WritebackTransactionBoundary = {
        getLayoutPersistenceMode: () => 'native',
        getWorkspaceFolder: (_u: SidecarUri): SidecarWorkspaceFolder | undefined => undefined,
        getWorkspaceFolders: (): readonly SidecarWorkspaceFolder[] => [],
        readFile: async () => new Uint8Array(),
        writeFile: async () => { writes.push('sidecar'); },
        deleteFile: async () => {},
        joinPath: (base: SidecarUri, ...parts: string[]): SidecarUri => ({ ...base, fsPath: [base.fsPath, ...parts].join('/') }),
        file: (p: string): SidecarUri => ({ fsPath: p, scheme: 'file' }),
        getWorkingDirectory: () => '/test',
        undo: async () => {},
        applyBoundedEdits: async (_doc, edits) => {
            text = applyBoundedEdits(text, [...edits]);
            if (first) { first = false; text = damage(text); }
            writes.push(text);
            return true;
        },
    };
    return { document, boundary, text: () => text, writes };
}

const MOVE = { type: 'visualLayout.applySemanticEdits', protocolVersion: 1, revision: '1',
    edits: [{ id: 'b', x: 40, y: 50 }] } as never;

const DAMAGES: ReadonlyArray<[string, (t: string) => string, RegExp]> = [
    ['deletes an elementStyle statement', t => t.replace(/elementStyle.*\n/, ''), /elementStyle/],
    ['alters an elementStyle value', t => t.replace('#BF101D', '#000000'), /elementStyle/],
    ['drops a $shape attribute', t => t.replace(', $shape="Box"', ''), /\$shape/],
];

describe('Save rolls back when the result would lose a style or shape (#369)', () => {
    for (const [name, damage, reason] of DAMAGES) {
        it(`refuses a Save whose result ${name}, and restores the text`, async () => {
            const h = harness(damage);
            await assert.rejects(
                executeWritebackTransaction(h.document, MOVE, undefined, h.boundary),
                (error: unknown) => error instanceof WritebackTransactionError
                    && error.code === 'validation_failed'
                    && /Structural validation failed, rolled back/.test(error.message)
                    && reason.test(error.message));
            assert.strictEqual(h.text(), SOURCE, 'document is byte-identical after the refusal');
            assert.ok(!h.writes.includes('sidecar'), 'no sidecar write');
            assert.strictEqual(h.writes.length, 2, 'one damaged write and one restore, nothing else');
            assert.strictEqual(h.writes[1], SOURCE);
        });
    }

    it('control: the same Save with no damage applies and keeps the styles', async () => {
        const h = harness(t => t);
        assert.strictEqual(await executeWritebackTransaction(h.document, MOVE, undefined, h.boundary), true);
        assert.ok(h.text().includes('elementStyle legacy') && h.text().includes('$shape="Box"'));
        assert.notStrictEqual(h.text(), SOURCE);
    });
});
