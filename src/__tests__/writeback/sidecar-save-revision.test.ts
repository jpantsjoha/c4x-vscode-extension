import * as assert from 'assert';
import * as path from 'path';
import { applyBoundedEdits } from '../../writeback/SourceRange';
import {
    saveSidecarLayout,
    SidecarUri,
    writeSidecarLayoutEntries,
} from '../../writeback/SidecarPersistence';
import { executeWritebackTransaction, WritebackTransactionError } from '../../writeback/WritebackTransaction';
import { WritebackDocument, WritebackTransactionBoundary } from '../../writeback/VscodeWritebackBoundary';
import { ApplySemanticEditsMessage } from '../../webview/visualLayoutProtocol';
import { captureAnchor, createNativeDocumentBlock } from '../../writeback/SaveAnchor';
import type * as vscode from 'vscode';

/**
 * #443: check, then write last; a shared sidecar is never rolled back.
 *
 * - Sidecar-only Save: read, check the source, write, with no await between
 *   the check and the write call. A change before that point refuses the Save
 *   and writes nothing. A change while writeFile is pending is a later event.
 * - Mixed Save: the text edit is applied and validated first, as before; the
 *   sidecar is then written against the source as it stood after that edit.
 *   If the sidecar half refuses or fails, the text edit stands and the error
 *   says so (`sourceSaved`).
 */

const SIDECAR_PATH = '/workspace/.c4x-layout.json';

class Pause {
    private releaseHold: () => void = () => undefined;
    private signalReached: () => void = () => undefined;
    private armed = false;
    public readonly reached: Promise<void>;

    constructor() {
        this.reached = new Promise(resolve => { this.signalReached = resolve; });
    }

    arm(): void {
        this.armed = true;
    }

    async hold(): Promise<void> {
        if (!this.armed) { return; }
        this.armed = false;
        const held = new Promise<void>(resolve => { this.releaseHold = resolve; });
        this.signalReached();
        await held;
    }

    release(): void {
        this.releaseHold();
    }
}

class MemoryDocument implements WritebackDocument {
    public version = 1;
    public readonly uri: SidecarUri;
    public readonly languageId: string;
    public readonly fileName: string;
    private text: string;

    constructor(fsPath: string, languageId: string, text: string) {
        this.uri = { fsPath, scheme: 'file' };
        this.languageId = languageId;
        this.fileName = fsPath;
        this.text = text;
    }

    getText(): string {
        return this.text;
    }

    positionAt(offset: number): unknown {
        return { offset };
    }

    /** An external change: the host bumps the version. */
    replaceText(text: string): void {
        this.text = text;
        this.version++;
    }

    /**
     * A change the version does not show, as with the Markdown fence view
     * PreviewPanel hands the transaction (its `version` is fixed).
     */
    replaceTextKeepingVersion(text: string): void {
        this.text = text;
    }
}

interface HarnessOptions {
    readonly files?: Map<string, Uint8Array>;
    readonly readError?: unknown;
    readonly writeError?: unknown;
    readonly applyError?: unknown;
}

interface Harness {
    readonly boundary: WritebackTransactionBoundary;
    readonly files: Map<string, Uint8Array>;
    readonly readPause: Pause;
    readonly writePause: Pause;
    readonly applyPause: Pause;
    readonly calls: { apply: number; write: number };
    /** Runs inside the host edit, after the pause, before the edit lands. */
    duringApply?: () => void;
}

function notFound(): Error {
    return Object.assign(new Error('EntryNotFound'), { code: 'FileNotFound' });
}

function createHarness(document: MemoryDocument, persistenceMode: string, options: HarnessOptions = {}): Harness {
    const files = options.files ?? new Map<string, Uint8Array>();
    const readPause = new Pause();
    const writePause = new Pause();
    const applyPause = new Pause();
    const calls = { apply: 0, write: 0 };
    const harness: Harness = {
        files,
        readPause,
        writePause,
        applyPause,
        calls,
        boundary: {
            getWorkspaceFolder: () => ({ uri: { fsPath: '/workspace', scheme: 'file' } }),
            getWorkspaceFolders: () => [{ uri: { fsPath: '/workspace', scheme: 'file' } }],
            readFile: async uri => {
                const content = files.get(uri.fsPath);
                await readPause.hold();
                if (options.readError !== undefined) { throw options.readError; }
                if (!content) { throw notFound(); }
                return content;
            },
            writeFile: async (uri, content) => {
                calls.write++;
                files.set(uri.fsPath, content);
                await writePause.hold();
                if (options.writeError !== undefined) { throw options.writeError; }
            },
            deleteFile: async uri => {
                files.delete(uri.fsPath);
            },
            joinPath: (base, ...parts) => ({ fsPath: path.posix.join(base.fsPath, ...parts), scheme: base.scheme }),
            file: filePath => ({ fsPath: filePath, scheme: 'file' }),
            getWorkingDirectory: () => '/workspace',
            getLayoutPersistenceMode: () => persistenceMode,
            applyBoundedEdits: async (target, edits) => {
                calls.apply++;
                await applyPause.hold();
                if (options.applyError !== undefined) { throw options.applyError; }
                harness.duringApply?.();
                document.replaceText(applyBoundedEdits(target.getText(), [...edits]));
                return true;
            },
            undo: async () => undefined,
        },
    };
    return harness;
}

function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text);
}

function sidecarText(files: Map<string, Uint8Array>): string | undefined {
    const content = files.get(SIDECAR_PATH);
    return content ? new TextDecoder().decode(content) : undefined;
}

function sidecarElements(files: Map<string, Uint8Array>, relPath: string): Record<string, unknown> | undefined {
    const text = sidecarText(files);
    if (!text) { return undefined; }
    const data = JSON.parse(text) as { layouts?: Record<string, { elements: Record<string, unknown> }> };
    return data.layouts?.[relPath]?.elements;
}

function moveMessage(document: MemoryDocument, id: string, extra: Record<string, unknown> = {}, x = 120, y = 240): ApplySemanticEditsMessage {
    return {
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: 1,
        revision: String(document.version),
        edits: [{ id, x, y, ...extra }],
    };
}

function isCode(code: string, sourceSaved = false) {
    return (error: unknown): boolean =>
        error instanceof WritebackTransactionError && error.code === code &&
        ((error as { sourceSaved?: boolean }).sourceSaved ?? false) === sourceSaved;
}

interface Fixture {
    readonly name: string;
    readonly path: string;
    readonly rel: string;
    readonly languageId: string;
    readonly mode: string;
    readonly id: string;
    readonly source: string;
    readonly changed: string;
}

const FIXTURES: readonly Fixture[] = [
    {
        name: '.c4x with sidecar persistence',
        path: '/workspace/system.c4x',
        rel: 'system.c4x',
        languageId: 'c4x',
        mode: 'sidecar',
        id: 'User',
        source: 'graph TB\nPerson(User, "User")\nSystem(Sys, "System")\n',
        changed: 'graph TB\nPerson(User, "User renamed elsewhere")\nSystem(Sys, "System")\n',
    },
    {
        name: 'Structurizr .dsl',
        path: '/workspace/system.dsl',
        rel: 'system.dsl',
        languageId: 'structurizr-dsl',
        mode: 'native',
        id: 'user',
        source: 'workspace "Test" {\n  model {\n    user = person "User"\n    system = softwareSystem "System"\n    user -> system "Uses"\n  }\n  views { systemContext system "Context" { include * } }\n}\n',
        changed: 'workspace "Test" {\n  model {\n    user = person "User renamed elsewhere"\n    system = softwareSystem "System"\n    user -> system "Uses"\n  }\n  views { systemContext system "Context" { include * } }\n}\n',
    },
    {
        name: 'PlantUML .puml',
        path: '/workspace/system.puml',
        rel: 'system.puml',
        languageId: 'plantuml',
        mode: 'native',
        id: 'user',
        source: '@startuml\nPerson(user, "User")\nSystem(sys, "System")\n@enduml\n',
        changed: '@startuml\nPerson(user, "User renamed elsewhere")\nSystem(sys, "System")\n@enduml\n',
    },
];

const PRIOR_SIDECAR = '{\n  "layouts": {\n    "other.c4x": {\n      "elements": {\n        "A": {\n          "x": 1,\n          "y": 2\n        }\n      }\n    }\n  }\n}\n';

describe('Save with sidecar persistence: check, then write last (#443)', () => {
    for (const fixture of FIXTURES) {
        const open = (): MemoryDocument => new MemoryDocument(fixture.path, fixture.languageId, fixture.source);

        describe(fixture.name, () => {
            for (const prior of [undefined, PRIOR_SIDECAR]) {
                const state = prior ? 'an existing sidecar' : 'no sidecar';

                it(`refuses and writes nothing when the source changes during the sidecar read (${state})`, async () => {
                    const document = open();
                    const harness = createHarness(document, fixture.mode);
                    if (prior) { harness.files.set(SIDECAR_PATH, bytes(prior)); }
                    harness.readPause.arm();

                    const save = executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary);
                    await harness.readPause.reached;
                    document.replaceText(fixture.changed);
                    harness.readPause.release();

                    await assert.rejects(save, isCode('stale_revision'));
                    assert.strictEqual(sidecarText(harness.files), prior, prior ? 'sidecar unchanged' : 'sidecar absent');
                    assert.strictEqual(harness.calls.write, 0, 'no sidecar write started');
                    assert.strictEqual(document.getText(), fixture.changed, 'source holds only the external change');
                    assert.strictEqual(harness.calls.apply, 0);
                });
            }

            it('refuses when the text changes during the sidecar read without a version change', async () => {
                const document = open();
                const harness = createHarness(document, fixture.mode);
                harness.readPause.arm();

                const save = executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary);
                await harness.readPause.reached;
                document.replaceTextKeepingVersion(fixture.changed);
                harness.readPause.release();

                await assert.rejects(save, isCode('stale_revision'));
                assert.strictEqual(sidecarText(harness.files), undefined);
                assert.strictEqual(document.getText(), fixture.changed);
            });

            it('accepts a source change that lands while writeFile is pending (commit point passed)', async () => {
                const document = open();
                const harness = createHarness(document, fixture.mode);
                harness.writePause.arm();

                const save = executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary);
                await harness.writePause.reached;
                document.replaceText(fixture.changed);
                harness.writePause.release();

                assert.strictEqual(await save, true);
                assert.deepStrictEqual(sidecarElements(harness.files, fixture.rel), { [fixture.id]: { x: 120, y: 240 } });
                assert.strictEqual(document.getText(), fixture.changed, 'the later change is left to the normal source-change path');
            });

            it('refuses and leaves the file untouched when the sidecar cannot be read', async () => {
                const document = open();
                const error = Object.assign(new Error('EIO: i/o error'), { code: 'EIO' });
                const harness = createHarness(document, fixture.mode, { readError: error });
                harness.files.set(SIDECAR_PATH, bytes(PRIOR_SIDECAR));

                await assert.rejects(
                    executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary),
                    (thrown: unknown) => isCode('validation_failed')(thrown) &&
                        (thrown as Error).message.includes(SIDECAR_PATH) && (thrown as Error).message.includes('EIO'),
                );
                assert.strictEqual(harness.calls.write, 0);
                assert.strictEqual(sidecarText(harness.files), PRIOR_SIDECAR);
                assert.strictEqual(document.getText(), fixture.source);
            });

            it('refuses and leaves the file untouched when the sidecar is not valid JSON', async () => {
                const document = open();
                const harness = createHarness(document, fixture.mode);
                const invalid = '{"layouts": {"other.c4x": {"elements": {"A": {"x": 1,';
                harness.files.set(SIDECAR_PATH, bytes(invalid));

                await assert.rejects(
                    executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary),
                    (thrown: unknown) => isCode('validation_failed')(thrown) &&
                        (thrown as Error).message.includes(SIDECAR_PATH) && (thrown as Error).message.includes('not valid JSON'),
                );
                assert.strictEqual(harness.calls.write, 0);
                assert.strictEqual(sidecarText(harness.files), invalid);
            });

            it('surfaces a rejected writeFile as a refusal', async () => {
                const document = open();
                const harness = createHarness(document, fixture.mode, { writeError: new Error('ENOSPC') });

                await assert.rejects(
                    executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary),
                    (thrown: unknown) => isCode('validation_failed')(thrown) &&
                        (thrown as Error).message ===
                        `Writing the layout file ${SIDECAR_PATH} failed (ENOSPC). The layout file may or may not hold the new coordinates.`,
                );
                assert.strictEqual(document.getText(), fixture.source);
            });

            it('treats an empty sidecar file as no layouts', async () => {
                const document = open();
                const harness = createHarness(document, fixture.mode);
                harness.files.set(SIDECAR_PATH, bytes('  \n'));

                assert.strictEqual(await executeWritebackTransaction(document, moveMessage(document, fixture.id), undefined, harness.boundary), true);
                assert.deepStrictEqual(sidecarElements(harness.files, fixture.rel), { [fixture.id]: { x: 120, y: 240 } });
            });
        });
    }

    describe('mixed Save: text edit plus sidecar coordinates (.c4x, sidecar persistence)', () => {
        const source = 'graph TB\nPerson(User, "User")\nSystem(Sys, "System")\n';
        const saved = 'graph TB\nPerson(User, "Customer")\nSystem(Sys, "System")\n';
        const open = (): MemoryDocument => new MemoryDocument('/workspace/system.c4x', 'c4x', source);
        const mixed = (document: MemoryDocument): ApplySemanticEditsMessage => moveMessage(document, 'User', { label: 'Customer' });

        it('writes the text edit first, then the sidecar', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar');
            const order: string[] = [];
            const boundary: WritebackTransactionBoundary = {
                ...harness.boundary,
                applyBoundedEdits: async (target, edits) => { order.push('text'); return harness.boundary.applyBoundedEdits(target, edits); },
                writeFile: async (uri, content) => { order.push('sidecar'); return harness.boundary.writeFile(uri, content); },
            };

            assert.strictEqual(await executeWritebackTransaction(document, mixed(document), undefined, boundary), true);
            assert.deepStrictEqual(order, ['text', 'sidecar']);
            assert.strictEqual(document.getText(), saved);
            assert.deepStrictEqual(sidecarElements(harness.files, 'system.c4x'), { User: { x: 120, y: 240 } });
        });

        it('keeps the text edit and reports the refused sidecar half when the source changes during the sidecar read', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar');
            harness.files.set(SIDECAR_PATH, bytes(PRIOR_SIDECAR));
            harness.readPause.arm();

            const save = executeWritebackTransaction(document, mixed(document), undefined, harness.boundary);
            await harness.readPause.reached;
            const textAtSidecarRead = document.getText();
            const external = `${saved}%% external note\n`;
            document.replaceText(external);
            harness.readPause.release();
            assert.strictEqual(textAtSidecarRead, saved, 'the text edit landed before the sidecar step');

            await assert.rejects(save, (thrown: unknown) => isCode('stale_revision', true)(thrown) &&
                (thrown as Error).message.startsWith('The text edit was saved; the layout coordinates were not written. Document changed during writeback') &&
                (thrown as Error).message.endsWith('. Reload the saved text, then move the elements again.'));
            assert.strictEqual(sidecarText(harness.files), PRIOR_SIDECAR, 'sidecar untouched');
            assert.strictEqual(harness.calls.write, 0);
            assert.strictEqual(document.getText(), external, 'text edit and external change both stand');
        });

        it('keeps the text edit and reports an unreadable sidecar without touching it', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar', { readError: Object.assign(new Error('EACCES'), { code: 'EACCES' }) });
            harness.files.set(SIDECAR_PATH, bytes(PRIOR_SIDECAR));

            await assert.rejects(executeWritebackTransaction(document, mixed(document), undefined, harness.boundary), isCode('stale_revision', true));
            assert.strictEqual(document.getText(), saved);
            assert.strictEqual(sidecarText(harness.files), PRIOR_SIDECAR);
        });

        it('keeps the text edit and reports a rejected sidecar write', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar', { writeError: new Error('ENOSPC') });

            await assert.rejects(executeWritebackTransaction(document, mixed(document), undefined, harness.boundary),
                (thrown: unknown) => isCode('stale_revision', true)(thrown) && (thrown as Error).message ===
                    `The text edit was saved. Writing the layout file ${SIDECAR_PATH} failed (ENOSPC). The layout file may or may not hold the new coordinates. Reload the saved text before moving the elements again.`);
            assert.strictEqual(document.getText(), saved);
        });

        it('refuses before any write when the source no longer matches the anchor the editor opened on', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar');
            const message = mixed(document);
            const anchor = captureAnchor(document as unknown as vscode.TextDocument, createNativeDocumentBlock(document as unknown as vscode.TextDocument));
            const changed = 'graph TB\nPerson(User, "User")\nSystem(Sys, "System renamed elsewhere")\n';
            document.replaceTextKeepingVersion(changed);

            await assert.rejects(executeWritebackTransaction(document, message, anchor, harness.boundary), isCode('fingerprint_mismatch'));
            assert.strictEqual(harness.calls.apply, 0);
            assert.strictEqual(harness.calls.write, 0);
            assert.strictEqual(document.getText(), changed);
        });

        it('surfaces a rejected host edit as a refusal and writes no sidecar', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar', { applyError: new Error('host gone') });

            await assert.rejects(executeWritebackTransaction(document, mixed(document), undefined, harness.boundary),
                (thrown: unknown) => isCode('validation_failed')(thrown) && (thrown as Error).message.includes('host gone'));
            assert.strictEqual(harness.calls.write, 0);
            assert.strictEqual(sidecarText(harness.files), undefined);
            assert.strictEqual(document.getText(), source);
        });

        it('writes no sidecar when the host refuses the edit', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar');
            const refusing: WritebackTransactionBoundary = { ...harness.boundary, applyBoundedEdits: async () => false };

            await assert.rejects(executeWritebackTransaction(document, mixed(document), undefined, refusing), isCode('validation_failed'));
            assert.strictEqual(harness.calls.write, 0);
            assert.strictEqual(document.getText(), source);
        });

        it('keeps an external comment appended during the host edit, as before #443', async () => {
            const document = open();
            const harness = createHarness(document, 'sidecar');
            harness.applyPause.arm();
            harness.duringApply = () => {
                harness.duringApply = undefined;
                document.replaceText(`${document.getText()}%% external note\n`);
            };

            const save = executeWritebackTransaction(document, mixed(document), undefined, harness.boundary);
            await harness.applyPause.reached;
            harness.applyPause.release();

            assert.strictEqual(await save, true);
            assert.strictEqual(document.getText(), `${saved}%% external note\n`, 'the external comment is kept');
            assert.deepStrictEqual(sidecarElements(harness.files, 'system.c4x'), { User: { x: 120, y: 240 } });
        });
    });

    describe('a refusal while planning writes nothing', () => {
        it('writes no sidecar when a later staged edit is refused', async () => {
            const document = new MemoryDocument('/workspace/system.puml', 'plantuml', '@startuml\nPerson(user, "User")\n@enduml\n');
            const harness = createHarness(document, 'native');
            const message: ApplySemanticEditsMessage = {
                type: 'visualLayout.applySemanticEdits',
                protocolVersion: 1,
                revision: '1',
                edits: [{ id: 'user', x: 1, y: 2 }, { id: 'missing', x: 3, y: 4 }],
            };
            await assert.rejects(executeWritebackTransaction(document, message, undefined, harness.boundary), isCode('missing_element'));
            assert.strictEqual(harness.calls.write, 0);
            assert.strictEqual(sidecarText(harness.files), undefined);
        });
    });

    describe('two Saves on one shared sidecar', () => {
        const dslSource = FIXTURES[1].source;
        const dslChanged = FIXTURES[1].changed;
        const pumlSource = FIXTURES[2].source;

        it('two documents: both accepted Saves are present', async () => {
            const files = new Map<string, Uint8Array>([[SIDECAR_PATH, bytes(PRIOR_SIDECAR)]]);
            const dsl = new MemoryDocument('/workspace/system.dsl', 'structurizr-dsl', dslSource);
            const puml = new MemoryDocument('/workspace/system.puml', 'plantuml', pumlSource);
            const a = createHarness(dsl, 'native', { files });
            const b = createHarness(puml, 'native', { files });
            a.writePause.arm();

            const saveA = executeWritebackTransaction(dsl, moveMessage(dsl, 'user'), undefined, a.boundary);
            await a.writePause.reached;
            const saveB = executeWritebackTransaction(puml, moveMessage(puml, 'user', {}, 5, 6), undefined, b.boundary);
            a.writePause.release();

            assert.strictEqual(await saveA, true);
            assert.strictEqual(await saveB, true);
            assert.deepStrictEqual(sidecarElements(files, 'system.dsl'), { user: { x: 120, y: 240 } });
            assert.deepStrictEqual(sidecarElements(files, 'system.puml'), { user: { x: 5, y: 6 } });
            assert.deepStrictEqual(sidecarElements(files, 'other.c4x'), { A: { x: 1, y: 2 } });
        });

        it('two documents: a refused Save contributes nothing and the accepted one is kept', async () => {
            const files = new Map<string, Uint8Array>();
            const dsl = new MemoryDocument('/workspace/system.dsl', 'structurizr-dsl', dslSource);
            const puml = new MemoryDocument('/workspace/system.puml', 'plantuml', pumlSource);
            const a = createHarness(dsl, 'native', { files });
            const b = createHarness(puml, 'native', { files });
            a.readPause.arm();

            const saveA = executeWritebackTransaction(dsl, moveMessage(dsl, 'user'), undefined, a.boundary);
            await a.readPause.reached;
            const saveB = executeWritebackTransaction(puml, moveMessage(puml, 'user', {}, 5, 6), undefined, b.boundary);
            dsl.replaceText(dslChanged);
            a.readPause.release();

            await assert.rejects(saveA, isCode('stale_revision'));
            assert.strictEqual(await saveB, true);
            assert.strictEqual(sidecarElements(files, 'system.dsl'), undefined, 'refused Save contributed nothing');
            assert.deepStrictEqual(sidecarElements(files, 'system.puml'), { user: { x: 5, y: 6 } });
        });

        it('same document, identical coordinates: a refused Save does not erase the accepted one', async () => {
            const files = new Map<string, Uint8Array>();
            const dsl = new MemoryDocument('/workspace/system.dsl', 'structurizr-dsl', dslSource);
            const a = createHarness(dsl, 'native', { files });
            const b = createHarness(dsl, 'native', { files });
            a.readPause.arm();

            const saveA = executeWritebackTransaction(dsl, moveMessage(dsl, 'user'), undefined, a.boundary);
            await a.readPause.reached;
            dsl.replaceText(dslChanged);
            const saveB = executeWritebackTransaction(dsl, moveMessage(dsl, 'user'), undefined, b.boundary);
            a.readPause.release();

            await assert.rejects(saveA, isCode('stale_revision'));
            assert.strictEqual(await saveB, true);
            assert.deepStrictEqual(sidecarElements(files, 'system.dsl'), { user: { x: 120, y: 240 } });
        });

        it('same document: two accepted Saves leave both entries', async () => {
            const files = new Map<string, Uint8Array>();
            const dsl = new MemoryDocument('/workspace/system.dsl', 'structurizr-dsl', dslSource);
            const a = createHarness(dsl, 'native', { files });
            const b = createHarness(dsl, 'native', { files });
            a.writePause.arm();

            const saveA = executeWritebackTransaction(dsl, moveMessage(dsl, 'user'), undefined, a.boundary);
            await a.writePause.reached;
            const saveB = executeWritebackTransaction(dsl, moveMessage(dsl, 'system', {}, 7, 8), undefined, b.boundary);
            a.writePause.release();

            assert.strictEqual(await saveA, true);
            assert.strictEqual(await saveB, true);
            assert.deepStrictEqual(sidecarElements(files, 'system.dsl'), { user: { x: 120, y: 240 }, system: { x: 7, y: 8 } });
        });
    });

    describe('batched sidecar write', () => {
        // Frozen reference: the exact bytes the pre-#443 saveSidecarLayout
        // (commit 9f4fc46) wrote for these entries, one call per entry in
        // order, from each starting sidecar. Recorded once from that code; do
        // not regenerate them from the current implementation.
        const cases: ReadonlyArray<{ label: string; prior: string | undefined; expected: string }> = [
            {
                label: "no file",
                prior: undefined,
                expected: "{\n  \"$schema\": \"https://c4model.com/schemas/c4x-layout.schema.json\",\n  \"layouts\": {\n    \"system.dsl\": {\n      \"elements\": {\n        \"a\": {\n          \"x\": 5.56,\n          \"y\": 6\n        },\n        \"b\": {\n          \"x\": 3,\n          \"y\": 4\n        }\n      }\n    }\n  },\n  \"version\": \"1.0\"\n}\n",
            },
            {
                label: "an empty file",
                prior: '',
                expected: "{\n  \"$schema\": \"https://c4model.com/schemas/c4x-layout.schema.json\",\n  \"layouts\": {\n    \"system.dsl\": {\n      \"elements\": {\n        \"a\": {\n          \"x\": 5.56,\n          \"y\": 6\n        },\n        \"b\": {\n          \"x\": 3,\n          \"y\": 4\n        }\n      }\n    }\n  },\n  \"version\": \"1.0\"\n}\n",
            },
            {
                label: "a file with another document and a locked entry",
                prior: '{"layouts":{"system.dsl":{"elements":{"a":{"x":0,"y":0,"locked":true}}},"other.c4x":{"elements":{"z":{"x":9,"y":9}}}}}',
                expected: "{\n  \"layouts\": {\n    \"other.c4x\": {\n      \"elements\": {\n        \"z\": {\n          \"x\": 9,\n          \"y\": 9\n        }\n      }\n    },\n    \"system.dsl\": {\n      \"elements\": {\n        \"a\": {\n          \"locked\": true,\n          \"x\": 5.56,\n          \"y\": 6\n        },\n        \"b\": {\n          \"x\": 3,\n          \"y\": 4\n        }\n      }\n    }\n  }\n}\n",
            },
            {
                label: "a malformed array root",
                prior: '{"layouts":[["unexpected"]]}',
                expected: "{\n  \"layouts\": {\n    \"system.dsl\": {\n      \"elements\": {\n        \"a\": {\n          \"x\": 5.56,\n          \"y\": 6\n        },\n        \"b\": {\n          \"x\": 3,\n          \"y\": 4\n        }\n      }\n    }\n  }\n}\n",
            },
            {
                label: "an array element entry",
                prior: '{"layouts":{"system.dsl":{"elements":{"a":[1,2]}}}}',
                expected: "{\n  \"layouts\": {\n    \"system.dsl\": {\n      \"elements\": {\n        \"a\": {\n          \"x\": 5.56,\n          \"y\": 6\n        },\n        \"b\": {\n          \"x\": 3,\n          \"y\": 4\n        }\n      }\n    }\n  }\n}\n",
            },
        ];

        for (const { label, prior, expected } of cases) {
            it(`is byte-identical to the pre-#443 per-entry writes (${label})`, async () => {
                const uri = { fsPath: '/workspace/system.dsl', scheme: 'file' };
                const entries = [{ id: 'a', x: 1.005, y: -0 }, { id: 'b', x: 3, y: 4 }, { id: 'a', x: 5.555, y: 6 }];
                const batched = createHarness(new MemoryDocument(uri.fsPath, 'structurizr-dsl', ''), 'native');
                if (prior !== undefined) { batched.files.set(SIDECAR_PATH, bytes(prior)); }
                await writeSidecarLayoutEntries(uri, entries, batched.boundary, () => undefined);
                assert.strictEqual(sidecarText(batched.files), expected);
            });
        }

        it('writes nothing and keeps the queue moving when the check before the write throws', async () => {
            const uri = { fsPath: '/workspace/system.dsl', scheme: 'file' };
            const harness = createHarness(new MemoryDocument(uri.fsPath, 'structurizr-dsl', ''), 'native');
            await assert.rejects(
                writeSidecarLayoutEntries(uri, [{ id: 'a', x: 1, y: 2 }], harness.boundary, () => { throw new Error('changed'); }),
                /changed/,
            );
            assert.strictEqual(harness.calls.write, 0);
            await saveSidecarLayout(uri, 'a', 1, 2, harness.boundary);
            assert.deepStrictEqual(sidecarElements(harness.files, 'system.dsl'), { a: { x: 1, y: 2 } });
        });
    });
});
