/**
 * A Save that stages a move or resize of a typed boundary (#271).
 *
 * `System_Boundary(id, "Label") { ... }`, `Container_Boundary(...)` and
 * `Enterprise_Boundary(...)` have no slot for `$x`/`$y`/`$w`/`$h` in the C4X
 * grammar (only `subgraph` does), so there is nothing the planner could write.
 * Edit mode no longer offers the drag, and a restored draft drops the edit
 * (draft-survival.test.ts), so the edit should never arrive. If one does, Save
 * stays all-or-nothing: it fails with a message naming the boundary
 * and its form, and the source is left exactly as it was, whatever else the
 * same Save staged.
 *
 * `subgraph` boundaries behave exactly as before.
 *
 * Every case runs against a plain `.c4x` document and against a `c4x` fence
 * inside a Markdown document, through the same body view and fence boundary
 * the preview panel builds.
 */
import * as assert from 'assert';
import { executeWritebackTransaction, WritebackTransactionError } from '../../writeback/WritebackTransaction';
import { createMarkdownFenceWritebackBoundary } from '../../writeback/MarkdownFenceWritebackBoundary';
import { findC4xFencedBlocksInSource } from '../../writeback/SaveAnchor';
import { applyBoundedEdits, sourcePositionAt } from '../../writeback/SourceRange';
import type { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import type { SidecarUri, SidecarWorkspaceFolder } from '../../writeback/SidecarPersistence';
import { C4XParser } from '../../parser/C4XParser';

type Kind = 'plain' | 'fenced';

interface Fixture {
    readonly document: WritebackDocument;
    readonly boundary: WritebackTransactionBoundary;
    /** The diagram source: the whole document, or the fence body. */
    readonly body: () => string;
    /** The whole document, so a test can prove the bytes around a fence are untouched. */
    readonly whole: () => string;
}

const PROSE_BEFORE = '# Architecture\n\nContext paragraph.\n\n';
const PROSE_AFTER = '\n\nTrailing prose.\n';

function createFixture(kind: Kind, body: string): Fixture {
    const inertBoundary = (applyEdits: WritebackTransactionBoundary['applyBoundedEdits']): WritebackTransactionBoundary => ({
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
        applyBoundedEdits: applyEdits,
    });

    if (kind === 'plain') {
        let text = body;
        const document: WritebackDocument = {
            uri: { fsPath: '/test/diagram.c4x', scheme: 'file' },
            version: 1,
            languageId: 'c4x',
            fileName: '/test/diagram.c4x',
            getText: () => text,
            positionAt: (offset: number) => sourcePositionAt(text, offset),
        };
        const boundary = inertBoundary(async (_doc, edits) => {
            text = applyBoundedEdits(text, [...edits]);
            return true;
        });
        return { document, boundary, body: () => text, whole: () => text };
    }

    // `body` ends with one newline, so the fence body does too.
    let full = `${PROSE_BEFORE}\`\`\`c4x\n${body}\`\`\`${PROSE_AFTER}`;
    const block = findC4xFencedBlocksInSource(full)[0];
    assert.ok(block, 'the fixture holds one editable c4x fence');
    const bodyStart = block.bodyRange.start;
    const sliceBody = (): string => {
        const live = findC4xFencedBlocksInSource(full)[0];
        return full.slice(live.bodyRange.start, live.bodyRange.end);
    };
    const absolute: WritebackDocument = {
        uri: { fsPath: '/test/doc.md', scheme: 'file' },
        version: 1,
        languageId: 'markdown',
        fileName: '/test/doc.md',
        getText: () => full,
        positionAt: (offset: number) => sourcePositionAt(full, offset),
    };
    const view: WritebackDocument = {
        uri: absolute.uri,
        version: 1,
        languageId: 'c4x',
        fileName: absolute.fileName,
        getText: sliceBody,
        positionAt: (offset: number) => absolute.positionAt(offset + bodyStart),
    };
    const inner = inertBoundary(async (_doc, edits) => {
        full = applyBoundedEdits(full, [...edits]);
        return true;
    });
    return {
        document: view,
        boundary: createMarkdownFenceWritebackBoundary(inner, bodyStart, absolute),
        body: sliceBody,
        whole: () => full,
    };
}

const HEADER = '%%{ c4: system-context }%%\ngraph TB\n';

function batch(edits: Array<Record<string, unknown>>): never {
    return {
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: 1,
        revision: '1',
        edits,
    } as never;
}

function relationshipsOf(source: string): string[] {
    return new C4XParser().parse(source).relationships.map(r => `${r.from}->${r.to}:${r.label}`);
}

const TYPED_FORMS = ['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary'] as const;

function typedSource(keyword: string): string {
    return `${HEADER}Person(a, "A")\n${keyword}(sb, "Shop") {\n  System(x, "X")\n}\n`;
}

const TYPED_ID = 'shop-boundary-0';

function refusal(keyword: string): (error: unknown) => boolean {
    return (error: unknown) => error instanceof WritebackTransactionError &&
        error.code === 'validation_failed' &&
        error.message.includes('"Shop"') && error.message.includes(keyword);
}

for (const kind of ['plain', 'fenced'] as const) {
    describe(`typed boundary geometry in a Save (${kind}) (#271)`, () => {
        for (const keyword of TYPED_FORMS) {
            describe(keyword, () => {
                it('fails the Save on a move of the boundary and leaves the source unchanged', async () => {
                    const source = typedSource(keyword);
                    const fixture = createFixture(kind, source);
                    const before = fixture.whole();
                    await assert.rejects(executeWritebackTransaction(fixture.document, batch([
                        { id: TYPED_ID, boundaryId: TYPED_ID, x: 120, y: 80 },
                    ]), undefined, fixture.boundary), refusal(keyword));
                    assert.strictEqual(fixture.body(), source);
                    assert.strictEqual(fixture.whole(), before);
                });

                it('fails the Save on a resize of the boundary and leaves the source unchanged', async () => {
                    const source = typedSource(keyword);
                    const fixture = createFixture(kind, source);
                    const before = fixture.whole();
                    await assert.rejects(executeWritebackTransaction(fixture.document, batch([
                        { id: TYPED_ID, boundaryId: TYPED_ID, w: 400, h: 300 },
                    ]), undefined, fixture.boundary), refusal(keyword));
                    assert.strictEqual(fixture.whole(), before);
                });

                it('writes none of an element move and a connect-mode add staged with the boundary move', async () => {
                    const fixture = createFixture(kind, typedSource(keyword));
                    const before = fixture.whole();
                    await assert.rejects(executeWritebackTransaction(fixture.document, batch([
                        { id: 'a', x: 5, y: 6, addRelationship: [{ targetId: 'x', label: 'Uses', relType: 'uses' }] },
                        { id: TYPED_ID, boundaryId: TYPED_ID, x: 120, y: 80 },
                        { id: 'x', x: 30, y: 40 },
                    ]), undefined, fixture.boundary), refusal(keyword));
                    assert.strictEqual(fixture.whole(), before, 'the other staged changes were not written either');
                });

                it('is the same Save without the boundary edit writing everything else', async () => {
                    const fixture = createFixture(kind, typedSource(keyword));
                    const applied = await executeWritebackTransaction(fixture.document, batch([
                        { id: 'a', x: 5, y: 6, addRelationship: [{ targetId: 'x', label: 'Uses', relType: 'uses' }] },
                        { id: 'x', x: 30, y: 40 },
                    ]), undefined, fixture.boundary);
                    assert.strictEqual(applied, true);
                    const body = fixture.body();
                    assert.ok(/Person\(a, "A"[^)]*\$x="5"[^)]*\$y="6"/.test(body), body);
                    assert.ok(/System\(x, "X"[^)]*\$x="30"[^)]*\$y="40"/.test(body), body);
                    assert.deepStrictEqual(relationshipsOf(body), ['a->x:Uses']);
                    assert.ok(body.includes(`${keyword}(sb, "Shop") {`), body);
                });
            });
        }

        it('fails the whole Save when a subgraph edit is staged beside a typed boundary edit', async () => {
            const source = `${HEADER}System_Boundary(sb, "Shop") {\n  System(x, "X")\n}\nsubgraph Backend {\n  Container(api, "API")\n}\n`;
            const fixture = createFixture(kind, source);
            const before = fixture.whole();
            await assert.rejects(executeWritebackTransaction(fixture.document, batch([
                { id: TYPED_ID, boundaryId: TYPED_ID, x: 1, y: 2 },
                { id: 'backend-boundary-1', boundaryId: 'backend-boundary-1', x: 10, y: 20, w: 300, h: 200 },
            ]), undefined, fixture.boundary), refusal('System_Boundary'));
            assert.strictEqual(fixture.whole(), before);
        });

        describe('subgraph boundaries are unchanged', () => {
            const SUBGRAPH = `${HEADER}subgraph Shop {\n  System(x, "X")\n}\n`;

            it('moves a subgraph boundary', async () => {
                const fixture = createFixture(kind, SUBGRAPH);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: TYPED_ID, boundaryId: TYPED_ID, x: 120, y: 80 },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                assert.ok(fixture.body().includes('subgraph Shop $x="120", $y="80" {'), fixture.body());
            });

            it('resizes a subgraph boundary', async () => {
                const fixture = createFixture(kind, SUBGRAPH);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: TYPED_ID, boundaryId: TYPED_ID, w: 400, h: 300 },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                assert.ok(fixture.body().includes('subgraph Shop $w="400", $h="300" {'), fixture.body());
            });

            it('still rejects a stale or mismatched boundary instead of dropping it', async () => {
                const fixture = createFixture(kind, SUBGRAPH);
                await assert.rejects(
                    executeWritebackTransaction(fixture.document, batch([
                        { id: 'ghost-boundary-9', boundaryId: 'ghost-boundary-9', x: 1, y: 2 },
                    ]), undefined, fixture.boundary),
                    /was not found in the current document/,
                );
            });
        });
    });
}
