/**
 * Connect-mode adds saved together with other staged changes (#268, #269).
 *
 * #268: every add is written at one offset, the end of the diagram. Edits are
 * planned in staging order, so another staged change between two adds'
 * sources left the two insertions apart in the edit list; only adjacent
 * insertions were merged, and the save failed with "Ambiguous same-offset
 * edits detected".
 *
 * #269: the add branch of the transaction ended in `continue`, so a move or
 * property edit staged on the same element as an add was dropped without a
 * word.
 *
 * Every case runs twice: against a plain `.c4x` document and against a
 * `c4x` fence inside a Markdown document, through the same body view and
 * fence boundary the preview panel builds.
 */
import * as assert from 'assert';
import { executeWritebackTransaction } from '../../writeback/WritebackTransaction';
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
    // The panel presents the fence body as the document and shifts the planned
    // offsets back through the fence boundary.
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
const FOUR = HEADER + 'Person(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nPerson(d, "D")\n';

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

for (const kind of ['plain', 'fenced'] as const) {
    describe(`connect-mode add saved with other staged changes (${kind})`, () => {
        // ---- #268 --------------------------------------------------------
        describe('adds from different sources (#268)', () => {
            it('saves two adds with a move staged between them in key order', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                    { id: 'c', x: 10, y: 20 },
                    { id: 'd', addRelationship: [{ targetId: 'b', label: 'Reads', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses', 'd->b:Reads']);
                assert.ok(body.endsWith('\na -->|Uses| b\nd -->|Reads| b\n'), `adds sit at the tail in staging order:\n${body}`);
                assert.ok(/System\(c, "C"[^)]*\$x="10"[^)]*\$y="20"/.test(body), `the move on c was written:\n${body}`);
            });

            it('keeps three adds from two sources in staging order around a move', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [
                        { targetId: 'b', label: 'First', relType: 'uses' },
                        { targetId: 'c', label: 'Second', relType: 'uses' },
                    ] },
                    { id: 'b', x: 40, y: 50 },
                    { id: 'd', addRelationship: [{ targetId: 'c', label: 'Third', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:First', 'a->c:Second', 'd->c:Third']);
                assert.ok(body.endsWith('\na -->|First| b\na -->|Second| c\nd -->|Third| c\n'), `tail order:\n${body}`);
                assert.ok(/System\(b, "B"[^)]*\$x="40"/.test(body), `the move on b was written:\n${body}`);
            });

            it('leaves the Markdown around a fence untouched', async function () {
                if (kind !== 'fenced') { this.skip(); }
                const fixture = createFixture(kind, FOUR);
                await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                    { id: 'c', x: 10, y: 20 },
                    { id: 'd', addRelationship: [{ targetId: 'b', label: 'Reads', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.ok(fixture.whole().startsWith(PROSE_BEFORE + '```c4x\n'));
                assert.ok(fixture.whole().endsWith('\n```' + PROSE_AFTER));
            });
        });

        // ---- #269 --------------------------------------------------------
        describe('other staged fields on the element that gets the add (#269)', () => {
            it('writes a move staged with an add on the same element', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', x: 120, y: 80, addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses']);
                assert.ok(/Person\(a, "A"[^)]*\$x="120"[^)]*\$y="80"/.test(body), `the move on a was written:\n${body}`);
                assert.ok(body.endsWith('\na -->|Uses| b\n'));
            });

            it('writes a label and description edit staged with an add on the same element', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    {
                        id: 'a',
                        label: 'Alice',
                        description: 'The customer',
                        addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }],
                    },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses']);
                assert.ok(body.includes('Person(a, "Alice"'), `the label was written:\n${body}`);
                assert.ok(body.includes('The customer'), `the description was written:\n${body}`);
            });

            it('writes a technology edit staged with an add on a container', async () => {
                const source = HEADER + 'Container(api, "API", "Node")\nSystem(b, "B")\n';
                const fixture = createFixture(kind, source);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'api', technology: 'Go', addRelationship: [{ targetId: 'b', label: 'Calls', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.includes('Container(api, "API", "Go")'), `the technology was written:\n${body}`);
                assert.deepStrictEqual(relationshipsOf(body), ['api->b:Calls']);
            });

            it('writes a move on the source and a move on another element together with an add', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', x: 1, y: 2, addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                    { id: 'c', x: 3, y: 4 },
                    { id: 'd', x: 5, y: 6, addRelationship: [{ targetId: 'c', label: 'Reads', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses', 'd->c:Reads']);
                for (const id of ['a', 'c', 'd']) {
                    const declaration = body.split('\n').find(line => line.includes(`(${id}, `));
                    assert.ok(declaration !== undefined && declaration.includes('$x='), `${id} was moved:\n${body}`);
                }
            });

            it('renames the source and writes the new relationship with the new id', async () => {
                const source = FOUR + 'd -->|Existing| a\n';
                const fixture = createFixture(kind, source);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', newId: 'alice', addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.includes('Person(alice, "A")'), `the rename was written:\n${body}`);
                assert.deepStrictEqual(relationshipsOf(body), ['d->alice:Existing', 'alice->b:Uses']);
            });

            it('writes the new id of a renamed target in the added relationship', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                    { id: 'b', newId: 'billing' },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->billing:Uses']);
            });

            it('writes tags staged with an add on the same element', async () => {
                const fixture = createFixture(kind, FOUR);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', tags: ['vip'], addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.includes('$tags="vip"'), `the tags were written:\n${body}`);
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses']);
            });

            const BOUNDARY = HEADER
                + 'Person(a, "A")\n'
                + 'subgraph Bd {\n'
                + '  System(x, "X")\n'
                + '  System(y, "Y")\n'
                + '}\n'
                + 'System(b, "B")\n';

            it('saves a boundary move staged between two adds', async () => {
                const fixture = createFixture(kind, BOUNDARY);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [{ targetId: 'b', label: 'Uses', relType: 'uses' }] },
                    { id: 'bd-boundary-0', boundaryId: 'bd-boundary-0', x: 10, y: 20 },
                    { id: 'x', addRelationship: [{ targetId: 'b', label: 'Calls', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses', 'x->b:Calls']);
                assert.ok(body.endsWith('\na -->|Uses| b\nx -->|Calls| b\n'), `tail order:\n${body}`);
                assert.ok(body.includes('$x="10"'), `the boundary move was written:\n${body}`);
            });

            it('saves a move and an add on an element inside a boundary', async () => {
                const fixture = createFixture(kind, BOUNDARY);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'x', x: 5, y: 6, addRelationship: [{ targetId: 'b', label: 'Calls', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.includes('System(x, "X", $x="5", $y="6")'), `the move was written:\n${body}`);
                assert.deepStrictEqual(relationshipsOf(body), ['x->b:Calls']);
                assert.ok(body.endsWith('\nx -->|Calls| b\n'), `the add sits at the tail:\n${body}`);
            });
        });

        // The last statement's own insertion and the new relationship's insertion
        // can share an offset: a bracket-form element has no closing parenthesis,
        // so its `$x`/`$y` go straight after the closing bracket, which is where
        // the new statement starts. The element's insertion has to come first.
        describe('a bracket-form element ends the diagram', () => {
            const BRACKET = HEADER + 'Person(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nd[D<br/>Person]\n';
            const addAB = { targetId: 'b', label: 'Uses', relType: 'uses' };

            it('saves a move and an add staged on that element', async () => {
                const fixture = createFixture(kind, BRACKET);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'd', x: 1, y: 2, addRelationship: [addAB] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.endsWith('\nd[D<br/>Person] $x="1", $y="2"\nd -->|Uses| b\n'), `move first, then the add:\n${body}`);
                assert.deepStrictEqual(relationshipsOf(body), ['d->b:Uses']);
            });

            it('saves an add, a move of another element and a move of that element', async () => {
                const fixture = createFixture(kind, BRACKET);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [addAB] },
                    { id: 'c', x: 3, y: 4 },
                    { id: 'd', x: 1, y: 2 },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.endsWith('\nd[D<br/>Person] $x="1", $y="2"\na -->|Uses| b\n'), `move first, then the add:\n${body}`);
                assert.ok(body.includes('System(c, "C", $x="3", $y="4")'), `the move on c was written:\n${body}`);
            });

            it('saves an add and a move of that element next to each other', async () => {
                const fixture = createFixture(kind, BRACKET);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [addAB] },
                    { id: 'd', x: 1, y: 2 },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.ok(body.endsWith('\nd[D<br/>Person] $x="1", $y="2"\na -->|Uses| b\n'), `move first, then the add:\n${body}`);
            });

            it('keeps adds from three sources in key order after that element\'s move', async () => {
                const fixture = createFixture(kind, BRACKET);
                const applied = await executeWritebackTransaction(fixture.document, batch([
                    { id: 'a', addRelationship: [addAB] },
                    { id: 'd', x: 1, y: 2, addRelationship: [{ targetId: 'c', label: 'Reads', relType: 'uses' }] },
                    { id: 'c', addRelationship: [{ targetId: 'b', label: 'Calls', relType: 'uses' }] },
                ]), undefined, fixture.boundary);
                assert.strictEqual(applied, true);
                const body = fixture.body();
                assert.deepStrictEqual(relationshipsOf(body), ['a->b:Uses', 'd->c:Reads', 'c->b:Calls']);
                assert.ok(body.includes('\nd[D<br/>Person] $x="1", $y="2"\na -->|Uses| b\n'), `move first, then the adds:\n${body}`);
            });
        });
    });
}
