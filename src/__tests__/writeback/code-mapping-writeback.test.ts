/**
 * #218 regression: visual write-back must leave a `$code="..."` mapping
 * byte-for-byte unchanged when the element is moved, renamed, relabelled,
 * retagged or reset. The attribute has no visual editor, so any change to it
 * is a write-back bug.
 */

import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { C4Model } from '../../model/C4Model';
import { applyBoundedEdits, sourcePositionAt } from '../../writeback/SourceRange';
import {
    NativeElementSourceRef,
    planElementAttributeUpdates,
    planElementIdRename,
    planElementTextUpdates,
    planMetadataReset,
    planMetadataUpdate,
} from '../../writeback/NativeMutationPlanner';
import { assertStructuralEquivalence, executeWritebackTransaction } from '../../writeback/WritebackTransaction';
import type { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import type { SidecarUri, SidecarWorkspaceFolder } from '../../writeback/SidecarPersistence';

const parser = new C4XParser();
const builder = new C4ModelBuilder();

const CODE = '$code="src/{parser,model}/**, src/extension.ts"';

const SOURCE = [
    '%%{ c4: component }%%',
    'graph TB',
    'Container_Boundary(host, "Extension host") {',
    `    Component(parser, "Parser", "Peggy", "Turns .c4x into an AST", ${CODE}, $sprite=person)`,
    '    Component(model, "Model", $code="src/model/**")',
    '}',
    'parser -->|builds| model',
    '',
].join('\n');

function ref(source: string, elementId: string): NativeElementSourceRef {
    const element = parser.parse(source).elements.find(candidate => candidate.id === elementId);
    assert.ok(element?.sourceRange, `Expected a source range for ${elementId}`);
    return { elementId, range: element.sourceRange };
}

function codeAttributes(source: string): string[] {
    return source.match(/\$code="[^"]*"/g) ?? [];
}

function assertCodeUnchanged(before: string, after: string): void {
    assert.deepStrictEqual(codeAttributes(after), codeAttributes(before), `$code changed:\n${after}`);
    const model = builder.build(parser.parse(after), 'after');
    const mapped = model.views[0].elements.map(element => element.codePaths);
    assert.deepStrictEqual(mapped, [['src/{parser,model}/**', 'src/extension.ts'], ['src/model/**']]);
}

describe('#218 $code survives native write-back byte-for-byte', () => {
    it('inserting coordinates on a move appends after $code and leaves it intact', () => {
        const after = applyBoundedEdits(SOURCE, planMetadataUpdate(SOURCE, ref(SOURCE, 'parser'), { x: 120, y: -40 }));
        assertCodeUnchanged(SOURCE, after);
        assert.ok(after.includes(`${CODE}, $sprite=person, $x="120", $y="-40")`), after);
    });

    it('updating existing coordinates on a second move does not touch $code', () => {
        const moved = applyBoundedEdits(SOURCE, planMetadataUpdate(SOURCE, ref(SOURCE, 'parser'), { x: 1, y: 2, locked: true }));
        const movedAgain = applyBoundedEdits(moved, planMetadataUpdate(moved, ref(moved, 'parser'), { x: 300, y: 400 }));
        assertCodeUnchanged(SOURCE, movedAgain);
        assert.ok(movedAgain.includes('$x="300", $y="400", $locked="true"'), movedAgain);
    });

    it('resetting the layout removes coordinates but keeps $code', () => {
        const moved = applyBoundedEdits(SOURCE, planMetadataUpdate(SOURCE, ref(SOURCE, 'parser'), { x: 1, y: 2 }));
        const reset = applyBoundedEdits(moved, planMetadataReset(moved, ref(moved, 'parser')));
        assert.strictEqual(reset, SOURCE);
    });

    it('renaming the element rewrites only the identifier and relationship endpoints', () => {
        const after = applyBoundedEdits(SOURCE, planElementIdRename(SOURCE, ref(SOURCE, 'parser'), 'grammar'));
        assertCodeUnchanged(SOURCE, after);
        assert.ok(after.includes(`Component(grammar, "Parser", "Peggy", "Turns .c4x into an AST", ${CODE}, $sprite=person)`), after);
        assert.ok(after.includes('grammar -->|builds| model'), after);
    });

    it('label, technology and description edits stop before the attribute list', () => {
        const after = applyBoundedEdits(SOURCE, planElementTextUpdates(SOURCE, ref(SOURCE, 'parser'), {
            label: 'Grammar', technology: 'Peggy 5', description: 'Parses',
        }));
        assertCodeUnchanged(SOURCE, after);
        assert.ok(after.includes(`Component(parser, "Grammar", "Peggy 5", "Parses", ${CODE}, $sprite=person)`), after);
    });

    it('adding a technology to a minimal element inserts before $code', () => {
        const after = applyBoundedEdits(SOURCE, planElementTextUpdates(SOURCE, ref(SOURCE, 'model'), { technology: 'TypeScript' }));
        assert.ok(after.includes('Component(model, "Model", "TypeScript", $code="src/model/**")'), after);
        assertCodeUnchanged(SOURCE, after);
    });

    it('adding tags, changing and removing the sprite leave the neighbouring $code alone', () => {
        const tagged = applyBoundedEdits(SOURCE, planElementAttributeUpdates(SOURCE, ref(SOURCE, 'parser'), { tags: ['core'] }));
        assertCodeUnchanged(SOURCE, tagged);
        const resprited = applyBoundedEdits(tagged, planElementAttributeUpdates(tagged, ref(tagged, 'parser'), { sprite: 'database' }));
        assertCodeUnchanged(SOURCE, resprited);
        const unsprited = applyBoundedEdits(resprited, planElementAttributeUpdates(resprited, ref(resprited, 'parser'), { sprite: null }));
        assertCodeUnchanged(SOURCE, unsprited);
        assert.ok(unsprited.includes(`${CODE}, $tags="core")`), unsprited);
    });

    it('a $code that is the only attribute survives a move of a bracket element', () => {
        const source = '%%{ c4: component }%%\ngraph TB\nparser[Parser<br/>Component] $code="src/parser/**"\n';
        const after = applyBoundedEdits(source, planMetadataUpdate(source, ref(source, 'parser'), { x: 10, y: 20 }));
        assert.strictEqual(after, '%%{ c4: component }%%\ngraph TB\nparser[Parser<br/>Component] $code="src/parser/**", $x="10", $y="20"\n');
    });
});

describe('#218 $code through the guarded write-back transaction', () => {
    function inMemory(text: string): { document: WritebackDocument; boundary: WritebackTransactionBoundary; state: () => string } {
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
                currentText = applyBoundedEdits(currentText, edits);
                return true;
            },
        };
        const document: WritebackDocument = {
            uri: { fsPath: '/test/components.c4x', scheme: 'file' },
            version: 1,
            languageId: 'c4x',
            fileName: '/test/components.c4x',
            getText: () => currentText,
            positionAt: (offset: number) => sourcePositionAt(currentText, offset),
        };
        return { document, boundary, state: () => currentText };
    }

    it('moves, renames and relabels in one transaction with $code byte-identical', async () => {
        const { document, boundary, state } = inMemory(SOURCE);
        const applied = await executeWritebackTransaction(document, {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: 1,
            revision: '1',
            edits: [{ id: 'parser', x: 64, y: 32, label: 'Grammar', newId: 'grammar' }],
        } as never, undefined, boundary);
        assert.strictEqual(applied, true);
        assertCodeUnchanged(SOURCE, state());
        assert.ok(state().includes(`Component(grammar, "Grammar", "Peggy", "Turns .c4x into an AST", ${CODE}, $sprite=person, $x="64", $y="32")`), state());
    });

    it('structural verification rejects any change to codePaths', () => {
        const original: C4Model = builder.build(parser.parse(SOURCE), 'original');
        const tampered: C4Model = builder.build(parser.parse(SOURCE.replace('src/model/**', 'src/models/**')), 'tampered');
        assert.throws(
            () => assertStructuralEquivalence(original, tampered, 'model'),
            /Code mapping \(\$code\) changed on element model/,
        );
        const removed: C4Model = builder.build(parser.parse(SOURCE.replace(', $code="src/model/**"', '')), 'removed');
        assert.throws(() => assertStructuralEquivalence(original, removed, 'model'), /Code mapping/);
    });
});
