/**
 * Property-based tests for the writeback Save transaction (#288).
 *
 * Four save-path defects reached main in one week (#259, #268, #269, #271),
 * each a particular mix of staged edits that no hand-written case combined.
 * This suite generates the mixes instead: random sets of staged moves, label
 * edits, tag edits, renames and connect-mode adds against fixture diagrams,
 * run through the real planner and transaction, as a plain `.c4x` document
 * and as a `c4x` fence inside Markdown.
 *
 * Style declarations (#322, #369): the editor stages no style or shape edit,
 * so a Save must carry every `elementStyle` statement and `$shape` attribute
 * through untouched. One fixture holds a fixed set; a second is generated from
 * the same seed as its edits, so the statements, the tags they match, the
 * shapes (Box, RoundedBox, Cylinder, and a name the renderer does not draw) and
 * their position among the elements all vary under moves, renames, tags and
 * adds. #323's new shapes extend the generator's shape list later.
 *
 * The property, for every generated case:
 *   - Save either applies, and the saved source re-parses to exactly the
 *     staged model (every element, every relationship, every staged field);
 *   - or it refuses, and not one byte of the document changed.
 *
 * Generation is deterministic from a seed. A failure prints the seed and the
 * case; replay it with `C4X_PROPERTY_SEED=<seed> pnpm run test:unit`.
 * `C4X_PROPERTY_CASES` sets the number of cases per fixture (default 200).
 */
// The transaction imports vscode through its boundary module; resolve it to the unit-test mock
// so this file also runs on its own.
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
    readonly body: () => string;
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

// ---------------------------------------------------------------------------
// Deterministic generation
// ---------------------------------------------------------------------------

/** mulberry32: a small, well-mixed 32-bit PRNG, so a seed replays exactly. */
function prng(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

interface Gen {
    readonly int: (min: number, max: number) => number;
    readonly bool: (p?: number) => boolean;
    readonly pick: <T>(items: readonly T[]) => T;
    readonly subset: <T>(items: readonly T[], min: number, max: number) => T[];
}

function gen(seed: number): Gen {
    const next = prng(seed);
    const int = (min: number, max: number) => min + Math.floor(next() * (max - min + 1));
    const pick = <T>(items: readonly T[]): T => items[int(0, items.length - 1)];
    return {
        int,
        bool: (p = 0.5) => next() < p,
        pick,
        subset: <T>(items: readonly T[], min: number, max: number): T[] => {
            const pool = [...items];
            const count = Math.min(pool.length, int(min, max));
            const chosen: T[] = [];
            for (let i = 0; i < count; i++) {
                chosen.push(pool.splice(int(0, pool.length - 1), 1)[0]);
            }
            return chosen;
        },
    };
}

const WORDS = ['Alpha', 'Billing', 'Catalog', 'Delivery', 'Edge', 'Front', 'Gateway', 'Hub', 'Index', 'Journal'];
const TAGS = ['core', 'legacy', 'external', 'pii', 'beta'];
const VERBS = ['Calls', 'Reads', 'Writes', 'Sends', 'Queries', 'Notifies'];

interface StagedAdd { targetId: string; label: string; relType: 'uses' }
interface Staged {
    id: string;
    x?: number;
    y?: number;
    label?: string;
    tags?: string[];
    newId?: string;
    addRelationship?: StagedAdd[];
}

interface Diagram { readonly name: string; readonly source: string }

const HEADER = '%%{ c4: system-context }%%\ngraph TB\n';
const DIAGRAMS: readonly Diagram[] = [
    {
        name: 'four elements, one relationship',
        source: HEADER + 'Person(a, "A")\nSystem(b, "B")\nSystem(c, "C")\nPerson(d, "D")\na -->|Uses| b\n',
    },
    {
        name: 'relationships between and after the elements',
        source: HEADER + 'Person(u, "User")\nSystem(s, "Shop")\nu -->|Browses| s\nSystem(p, "Payments")\nSystem(m, "Mail")\ns -->|Charges| p\ns -->|Sends| m\n',
    },
    {
        name: 'element style declarations and $shape attributes (#322)',
        source: HEADER
            + 'elementStyle legacy $stroke="#BF101D", $color="#BF101D", $legend="Legacy"\n'
            + 'Person(a, "A", $shape="Box")\n'
            + 'elementStyle "Core Banking" $shape="Cylinder", $border="dashed", $strokeWidth="2"\n'
            + 'System(b, "B", "Ledger", $tags="legacy", $shape="Folder")\n'
            + 'System(c, "C", $shape="RoundedBox", $tags="core")\n'
            + 'Person(d, "D")\n'
            + 'a -->|Uses| b\n'
            + 'elementStyle core $background="#F5F5F5"\n',
    },
];

const DRAWN_SHAPES = ['Box', 'RoundedBox', 'Cylinder'] as const;
/** A name the renderer does not draw: it must reach a diagnostic, never break Save. */
const UNDRAWN_SHAPE = 'Hexagon';
const STYLE_PROPS: readonly string[] = [
    '$stroke="#BF101D"', '$color="#0B5FFF"', '$background="#F5F5F5"', '$border="dashed"', '$strokeWidth="2"', '$legend="Legacy"',
];

/**
 * A diagram generated from `seed`: elements with optional tags and `$shape`,
 * and `elementStyle` statements (bare and quoted tags, with and without
 * `$shape`) placed before, between and after the elements.
 */
function generateStyledDiagram(seed: number): Diagram {
    const g = gen(seed ^ 0x5A5A5A5A);
    const count = g.int(3, 5);
    const names = ['a', 'b', 'c', 'd', 'e'].slice(0, count);
    const tagPool = ['legacy', 'core', 'Core Banking', 'pii'];
    const shapeOf = () => g.pick<string>([...DRAWN_SHAPES, UNDRAWN_SHAPE]);
    const styles: string[] = [];
    for (const tag of g.subset(tagPool, 1, 3)) {
        const props = g.subset(STYLE_PROPS, 1, 3);
        if (g.bool(0.5)) { props.push(`$shape="${shapeOf()}"`); }
        const head = /\s/.test(tag) ? `"${tag}"` : tag;
        styles.push(`elementStyle ${head} ${props.join(', ')}\n`);
    }
    const lines: string[] = [];
    names.forEach((id, i) => {
        const args = [`${id}`, `"${id.toUpperCase()}"`];
        const tags = g.subset(tagPool, 0, 2);
        if (tags.length > 0) { args.push(`$tags="${tags.join(',')}"`); }
        if (g.bool(0.6)) { args.push(`$shape="${shapeOf()}"`); }
        lines.push(`${i % 2 === 0 ? 'System' : 'Person'}(${args.join(', ')})\n`);
    });
    for (const style of styles) { lines.splice(g.int(0, lines.length), 0, style); }
    lines.push(`${names[0]} -->|Uses| ${names[1]}\n`);
    return { name: 'generated elementStyle statements and $shape attributes (#369)', source: HEADER + lines.join('') };
}

function idsOf(source: string): string[] {
    return new C4XParser().parse(source).elements.map(e => e.id);
}

/** Generate one mix of staged edits: at most one entry per element, as the editor stages them. */
function generateCase(g: Gen, source: string): Staged[] {
    const ids = idsOf(source);
    const chosen = g.subset(ids, 1, Math.min(4, ids.length));
    const renames = new Map<string, string>();
    const staged: Staged[] = [];
    let fresh = 0;
    const usedLabels = new Set<string>();
    for (const id of chosen) {
        const entry: Staged = { id };
        let fields = 0;
        if (g.bool(0.6)) { entry.x = g.int(0, 900); entry.y = g.int(0, 600); fields++; }
        if (g.bool(0.35)) { entry.label = `${g.pick(WORDS)} ${g.int(1, 99)}`; fields++; }
        if (g.bool(0.3)) { entry.tags = g.subset(TAGS, 1, 3); fields++; }
        if (g.bool(0.25)) {
            entry.newId = `n${fresh++}${id}`;
            renames.set(id, entry.newId);
            fields++;
        }
        if (g.bool(0.45)) {
            const targets = g.subset(ids.filter(t => t !== id), 1, 2);
            entry.addRelationship = targets.map(targetId => {
                let label = `${g.pick(VERBS)} ${g.int(1, 999)}`;
                while (usedLabels.has(label)) { label += 'x'; }
                usedLabels.add(label);
                return { targetId, label, relType: 'uses' as const };
            });
            fields++;
        }
        if (fields === 0) { entry.x = g.int(0, 900); entry.y = g.int(0, 600); }
        staged.push(entry);
    }
    return staged;
}

// ---------------------------------------------------------------------------
// The staged model, and structural comparison
// ---------------------------------------------------------------------------

interface ModelElement { id: string; elementType: string; label: string; tags: string[]; x?: string; y?: string; shape?: string }
interface Model { elements: ModelElement[]; relationships: string[]; elementStyles: string[] }

function modelOf(source: string): Model {
    const parsed = new C4XParser().parse(source);
    return {
        elements: parsed.elements.map(e => ({
            id: e.id,
            elementType: String((e as { elementType?: string }).elementType),
            label: e.label,
            tags: [...(e.tags ?? [])],
            x: (e.metadata as Record<string, string> | undefined)?.x,
            y: (e.metadata as Record<string, string> | undefined)?.y,
            shape: e.shape,
        })),
        relationships: parsed.relationships.map(r => `${r.from}->${r.to}:${r.label ?? ''}`),
        // Tag, keys, values and order: what the Save validation ladder compares.
        elementStyles: (parsed.elementStyles ?? []).map(style =>
            `${style.tag}: ${style.properties.map(p => `${p.key}=${p.value}`).join(', ')}`),
    };
}

/** What the source must say after a Save that applied `staged` to `source`. */
function expectedModel(source: string, staged: readonly Staged[]): Model {
    const model = modelOf(source);
    const byId = new Map(staged.map(s => [s.id, s]));
    const rename = (id: string) => byId.get(id)?.newId ?? id;
    const elements = model.elements.map(e => {
        const s = byId.get(e.id);
        if (!s) { return e; }
        return {
            ...e,
            id: s.newId ?? e.id,
            label: s.label ?? e.label,
            tags: s.tags ? [...s.tags] : e.tags,
            x: s.x !== undefined ? String(s.x) : e.x,
            y: s.y !== undefined ? String(s.y) : e.y,
        };
    });
    const relationships = new C4XParser().parse(source).relationships
        .map(r => `${rename(r.from)}->${rename(r.to)}:${r.label ?? ''}`);
    for (const s of staged) {
        for (const add of s.addRelationship ?? []) {
            relationships.push(`${rename(s.id)}->${rename(add.targetId)}:${add.label}`);
        }
    }
    // The editor never edits style declarations: they stay exactly as they were.
    return { elements, relationships, elementStyles: model.elementStyles };
}

function normalise(model: Model): Model {
    return {
        elements: [...model.elements]
            .map(e => ({ ...e, tags: [...e.tags].sort() }))
            .sort((a, b) => a.id.localeCompare(b.id)),
        relationships: [...model.relationships].sort(),
        elementStyles: model.elementStyles,
    };
}

function batch(edits: readonly Staged[]): never {
    return {
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: 1,
        revision: '1',
        edits,
    } as never;
}

// ---------------------------------------------------------------------------
// The property
// ---------------------------------------------------------------------------

const BASE_SEED = process.env.C4X_PROPERTY_SEED !== undefined
    ? Number(process.env.C4X_PROPERTY_SEED)
    : 0x288;
const CASES = process.env.C4X_PROPERTY_SEED !== undefined
    ? 1
    : Number(process.env.C4X_PROPERTY_CASES ?? 200);

interface Outcome { applied: number; refused: number }

async function runCase(kind: Kind, base: Diagram, seed: number, outcome: Outcome, styled = false): Promise<void> {
    const diagram = styled ? generateStyledDiagram(seed) : base;
    const staged = generateCase(gen(seed), diagram.source);
    const fixture = createFixture(kind, diagram.source);
    const before = fixture.whole();
    const replay = `seed ${seed} (replay: C4X_PROPERTY_SEED=${seed}); ${kind}; ${diagram.name}\nsource:\n${diagram.source}staged: ${JSON.stringify(staged)}`;
    let applied = false;
    let failure: unknown;
    try {
        applied = await executeWritebackTransaction(fixture.document, batch(staged), undefined, fixture.boundary);
    } catch (error) {
        failure = error;
    }
    if (!applied) {
        outcome.refused++;
        assert.strictEqual(fixture.whole(), before,
            `a refused Save changed the document (${failure instanceof Error ? failure.message : 'returned false'}).\n${replay}`);
        // Save refuses by returning false, or by a WritebackTransactionError after
        // it rolled the text back (checked above). Any other throw is a crash.
        assert.ok(failure === undefined || failure instanceof WritebackTransactionError,
            `Save threw instead of refusing: ${failure instanceof Error ? failure.stack : String(failure)}\n${replay}`);
        return;
    }
    outcome.applied++;
    const body = fixture.body();
    assert.deepStrictEqual(normalise(modelOf(body)), normalise(expectedModel(diagram.source, staged)),
        `the saved source does not re-parse to the staged model.\n${replay}\nsaved:\n${body}`);
    if (kind === 'fenced') {
        const whole = fixture.whole();
        assert.ok(whole.startsWith(PROSE_BEFORE + '```c4x\n') && whole.endsWith('\n```' + PROSE_AFTER),
            `the Markdown around the fence changed.\n${replay}`);
    }
}

describe('Save transaction: generated mixes of staged edits (#288)', function () {
    this.timeout(60_000);

    it('generation replays exactly from a seed', () => {
        for (const diagram of DIAGRAMS) {
            assert.deepStrictEqual(generateCase(gen(12345), diagram.source), generateCase(gen(12345), diagram.source));
        }
    });

    for (const kind of ['plain', 'fenced'] as const) {
        for (const diagram of DIAGRAMS) {
            it(`${kind}, ${diagram.name}: ${CASES} generated Saves from seed ${BASE_SEED} each write the staged model or nothing`, async () => {
                const outcome: Outcome = { applied: 0, refused: 0 };
                for (let i = 0; i < CASES; i++) {
                    await runCase(kind, diagram, BASE_SEED + i, outcome);
                }
                // A suite where every Save refuses would pass the property vacuously.
                if (process.env.C4X_PROPERTY_SEED === undefined) {
                    assert.ok(outcome.applied >= Math.ceil(CASES * 0.9),
                        `only ${outcome.applied} of ${CASES} generated Saves applied (seeds ${BASE_SEED}..${BASE_SEED + CASES - 1})`);
                }
            });
        }
    }

    for (const kind of ['plain', 'fenced'] as const) {
        it(`${kind}, generated styles and shapes: ${CASES} Saves from seed ${BASE_SEED} keep every elementStyle and $shape or write nothing`, async () => {
            const outcome: Outcome = { applied: 0, refused: 0 };
            const placeholder: Diagram = { name: 'generated', source: '' };
            for (let i = 0; i < CASES; i++) {
                await runCase(kind, placeholder, BASE_SEED + i, outcome, true);
            }
            console.log(`      seeds ${BASE_SEED}..${BASE_SEED + CASES - 1}: applied ${outcome.applied}, refused ${outcome.refused}`);
            if (process.env.C4X_PROPERTY_SEED === undefined) {
                assert.ok(outcome.applied >= Math.ceil(CASES * 0.9),
                    `only ${outcome.applied} of ${CASES} generated Saves applied (seeds ${BASE_SEED}..${BASE_SEED + CASES - 1})`);
            }
        });
    }

    it('the styled generator produces every drawn shape, the undrawn one, and styles with and without $shape', () => {
        const all = Array.from({ length: 200 }, (_, i) => generateStyledDiagram(BASE_SEED + i).source).join('');
        for (const shape of [...DRAWN_SHAPES, UNDRAWN_SHAPE]) {
            assert.ok(all.includes(`$shape="${shape}"`), `${shape} is generated`);
        }
        assert.ok(/elementStyle [^\n]*\$shape=/.test(all) && /elementStyle [^\n]*\$stroke/.test(all));
    });
});
