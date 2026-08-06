/**
 * Source mapping and pure native-writeback regression tests.
 *
 * Offsets in these tests are JavaScript/VS Code UTF-16 code-unit offsets.
 * Exact source slices also prove that UTF-8 bytes outside bounded edits remain
 * unchanged when the resulting string is written with the same encoding.
 */

import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4XParseError } from '../../parser/types';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import {
    SourceRange,
    applyBoundedEdits,
    isRangeConsistentWithSource,
    isValidRange,
    makeSourceId,
    sourcePositionAt,
    validateEditsForOverlap,
} from '../../writeback/SourceRange';
import {
    InvalidMetadataPatchError,
    LayoutMetadataPatch,
    NativeElementSourceRef,
    StaleRangeError,
    planMetadataUpdate,
    planMetadataReset,
    planElementDescriptionUpdate,
    planElementIdRename,
    planElementLabelUpdate,
    planElementSpriteUpdate,
    planElementTagsUpdate,
    planElementTechnologyUpdate,
} from '../../writeback/NativeMutationPlanner';
import { StructurizrAdapter } from '../../parser/structurizr/StructurizrAdapter';
import { PlantUMLAdapter } from '../../parser/plantuml/PlantUMLAdapter';

const parser = new C4XParser();
const builder = new C4ModelBuilder();

function slice(source: string, range: SourceRange): string {
    return source.slice(range.start.offset, range.end.offset);
}

function elementRef(source: string, elementId: string): NativeElementSourceRef {
    const element = parser.parse(source).elements.find(candidate => candidate.id === elementId);
    assert.ok(element, `Expected parser element ${elementId}`);
    assert.ok(element.sourceRange, `Expected source range for ${elementId}`);
    return { elementId, range: element.sourceRange };
}

function mutate(source: string, elementId: string, patch: LayoutMetadataPatch): string {
    return applyBoundedEdits(source, planMetadataUpdate(source, elementRef(source, elementId), patch));
}

describe('SourceRange UTF-16 utilities', () => {
    it('validates integer offsets and 1-based positions', () => {
        const valid: SourceRange = {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 5, line: 1, column: 6 },
        };
        assert.ok(isValidRange(valid, 10));

        assert.strictEqual(isValidRange({ ...valid, start: { ...valid.start, offset: -1 } }, 10), false);
        assert.strictEqual(isValidRange({ ...valid, end: { ...valid.end, offset: 11 } }, 10), false);
        assert.strictEqual(isValidRange({ ...valid, start: { ...valid.start, offset: 0.5 } }, 10), false);
        assert.strictEqual(isValidRange({ ...valid, start: { ...valid.start, column: 0 } }, 10), false);
    });

    it('counts astral Unicode as two UTF-16 code units', () => {
        const source = 'A😀B';
        assert.strictEqual(source.length, 4);
        assert.deepStrictEqual(sourcePositionAt(source, 3), { offset: 3, line: 1, column: 4 });
    });

    it('tracks CRLF using VS Code-compatible offsets', () => {
        const source = 'one\r\n  two';
        const offset = source.indexOf('two');
        assert.deepStrictEqual(sourcePositionAt(source, offset), { offset, line: 2, column: 3 });
    });

    it('detects cached line/column values that are stale', () => {
        const source = 'one\ntwo';
        const range: SourceRange = {
            start: { offset: 4, line: 1, column: 5 },
            end: { offset: 7, line: 2, column: 4 },
        };
        assert.strictEqual(isRangeConsistentWithSource(source, range), false);
    });

    it('produces stable opaque source identifiers', () => {
        assert.strictEqual(makeSourceId('element', 'WebApp'), 'element:WebApp');
        assert.strictEqual(makeSourceId('rel', 'User', 'System', '0'), 'rel:User:System:0');
        assert.strictEqual(makeSourceId('boundary', 'banking', '0'), 'boundary:banking:0');
    });

    it('rejects same-offset edits before they can be applied', () => {
        const atOne: SourceRange = {
            start: { offset: 1, line: 1, column: 2 },
            end: { offset: 1, line: 1, column: 2 },
        };
        assert.throws(
            () => validateEditsForOverlap([
                { range: atOne, newText: 'X' },
                { range: atOne, newText: 'Y' },
            ]),
            RangeError,
        );
    });

    it('rejects overlapping and out-of-bounds edits', () => {
        const source = 'hello world';
        const first: SourceRange = {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 5, line: 1, column: 6 },
        };
        const overlap: SourceRange = {
            start: { offset: 3, line: 1, column: 4 },
            end: { offset: 8, line: 1, column: 9 },
        };
        assert.throws(
            () => applyBoundedEdits(source, [
                { range: first, newText: 'A' },
                { range: overlap, newText: 'B' },
            ]),
            RangeError,
        );

        const outside: SourceRange = {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 20, line: 1, column: 21 },
        };
        assert.throws(() => applyBoundedEdits(source, [{ range: outside, newText: 'x' }]), RangeError);
    });

    it('accepts non-overlapping edits', () => {
        const first: SourceRange = {
            start: { offset: 0, line: 1, column: 1 },
            end: { offset: 1, line: 1, column: 2 },
        };
        const second: SourceRange = {
            start: { offset: 2, line: 1, column: 3 },
            end: { offset: 3, line: 1, column: 4 },
        };
        assert.doesNotThrow(() => validateEditsForOverlap([
            { range: first, newText: 'A' },
            { range: second, newText: 'B' },
        ]));
    });
});

describe('Parser source mapping and graph injection', () => {
    it('maps omitted graph injection back to original offsets', () => {
        const source = 'Person(User, "End User")\nSystem(App, "My App", "Java")';
        const result = parser.parse(source);
        assert.strictEqual(result.elements[0].sourceRange?.start.offset, 0);
        assert.strictEqual(result.elements[0].sourceRange?.start.line, 1);
        assert.strictEqual(result.elements[1].sourceRange?.start.offset, source.indexOf('System('));
        assert.strictEqual(result.elements[1].sourceRange?.start.line, 2);
        assert.strictEqual(slice(source, result.elements[0].sourceRange!), 'Person(User, "End User")');
        assert.strictEqual(result.elements[0].loc, undefined, 'processed-input Peggy location must not leak');
    });

    it('recomputes Unicode/CRLF/indentation positions after directive injection', () => {
        const source = [
            '%%{ c4: container }%%',
            '  Person(User, "😀 User")',
            '  System(App, "Café")',
        ].join('\r\n');
        const result = parser.parse(source);
        const user = result.elements[0].sourceRange!;
        const app = result.elements[1].sourceRange!;

        assert.strictEqual(user.start.offset, source.indexOf('Person('));
        assert.deepStrictEqual(
            { line: user.start.line, column: user.start.column },
            { line: 2, column: 3 },
        );
        assert.strictEqual(user.end.offset, source.indexOf(')') + 1);
        assert.strictEqual(slice(source, user), 'Person(User, "😀 User")');

        assert.strictEqual(app.start.offset, source.indexOf('System('));
        assert.deepStrictEqual(
            { line: app.start.line, column: app.start.column },
            { line: 3, column: 3 },
        );
        assert.strictEqual(slice(source, app), 'System(App, "Café")');
    });

    it('preserves locations when graph direction is explicit', () => {
        const source = 'graph LR\r\n  Person(User, "End User")';
        const element = parser.parse(source).elements[0];
        assert.strictEqual(element.sourceRange?.start.offset, source.indexOf('Person('));
        assert.strictEqual(element.sourceRange?.start.line, 2);
        assert.strictEqual(element.sourceRange?.start.column, 3);
    });

    it('maps parse errors back to the original source line', () => {
        assert.throws(
            () => parser.parse('Person(User, "unterminated)'),
            (error: unknown) => error instanceof C4XParseError && error.location.line === 1,
        );
    });
});

describe('Stable identity and nested source propagation', () => {
    it('gives duplicate relationships collision-free semantic occurrence IDs', () => {
        const source = [
            'graph TB',
            'A[A<br/>Component]',
            'B[B<br/>Component]',
            'C[C<br/>Component]',
            'A --> B',
            'A --> C',
            'A --> B',
        ].join('\n');
        const result = parser.parse(source);

        assert.deepStrictEqual(
            result.relationships.map(rel => rel.sourceId),
            ['rel:A:B:0', 'rel:A:C:0', 'rel:A:B:1'],
        );
        assert.strictEqual(new Set(result.relationships.map(rel => rel.sourceId)).size, 3);
        for (const relationship of result.relationships) {
            assert.ok(slice(source, relationship.sourceRange!).includes('-->'));
            assert.strictEqual(relationship.loc, undefined);
        }

        const model = builder.build(result, 'Relationships');
        assert.deepStrictEqual(
            model.views[0].relationships.map(relationship => relationship.sourceId),
            ['rel:A:B:0', 'rel:A:C:0', 'rel:A:B:1'],
        );
    });

    it('propagates nested boundary and child ranges without identity collisions', () => {
        const source = [
            'graph TB',
            'System_Boundary(team, "Outer Team") {',
            '  Person(User, "User")',
            '  Container_Boundary(team, "Inner Team") {',
            '    Container(App, "Application", "Node.js")',
            '    User --> App',
            '  }',
            '}',
        ].join('\n');
        const parsed = parser.parse(source);

        assert.deepStrictEqual(parsed.elements.map(element => element.sourceId), ['element:User', 'element:App']);
        assert.deepStrictEqual(parsed.boundaries?.map(boundary => boundary.sourceId), [
            'boundary:team:0',
            'boundary:team:1',
        ]);
        assert.strictEqual(new Set(parsed.boundaries?.map(boundary => boundary.sourceId)).size, 2);
        assert.ok(parsed.boundaries?.every(boundary => slice(source, boundary.sourceRange!).includes('Team')));
        assert.ok(parsed.boundaries?.every(boundary => boundary.loc === undefined));
        assert.ok(parsed.relationships[0].sourceRange);

        const model = builder.build(parsed, 'Nested');
        assert.ok(model.views[0].elements.every(element => element.sourceRange && element.sourceId));
        assert.ok(model.views[0].boundaries?.every(boundary => boundary.sourceRange && boundary.sourceId));
        assert.ok(model.views[0].relationships[0].sourceRange);
    });

    it('propagates source mapping into deployment-node children', () => {
        const source = [
            '%%{ c4: deployment }%%',
            'graph TB',
            'Node(Cloud, "Cloud") {',
            '  Container(App, "App", "Node.js")',
            '}',
        ].join('\n');
        const parsed = parser.parse(source);
        assert.ok(parsed.elements[0].sourceRange);
        assert.ok(parsed.elements[0].children?.[0].sourceRange);

        const model = builder.build(parsed, 'Deployment');
        assert.ok(model.views[0].elements[0].sourceRange);
        assert.ok(model.views[0].elements[0].children?.[0].sourceRange);
        assert.strictEqual(model.views[0].elements[0].children?.[0].sourceId, 'element:App');
    });
});

describe('NativeMutationPlanner allowlisted metadata', () => {
    it('inserts $x, $y and $locked as one canonical edit', () => {
        const source = 'graph TB\nPerson(User, "End User")';
        const edits = planMetadataUpdate(source, elementRef(source, 'User'), {
            locked: true,
            y: 200,
            x: 100,
        });

        assert.strictEqual(edits.length, 1);
        assert.strictEqual(edits[0].newText, ', $x="100", $y="200", $locked="true"');
        assert.strictEqual(
            applyBoundedEdits(source, edits),
            'graph TB\nPerson(User, "End User", $x="100", $y="200", $locked="true")',
        );
    });

    it('updates existing values with whitespace around equals', () => {
        const source = 'graph TB\nContainer(App, "App", "Java", $x = "0", $y="5", $locked=false)';
        const after = mutate(source, 'App', { x: -12.5, locked: true });

        assert.ok(after.includes('$x = "-12.5"'));
        assert.ok(after.includes('$y="5"'));
        assert.ok(after.includes('$locked="true"'));
        assert.strictEqual(parser.parse(after).elements[0].metadata?.x, '-12.5');
        assert.strictEqual(parser.parse(after).elements[0].metadata?.locked, 'true');
    });

    it('does not mistake metadata-like label text for a KV token', () => {
        const source = 'graph TB\nPerson(User, "Label contains $x=decoy", $x="1")';
        const after = mutate(source, 'User', { x: 2 });
        assert.ok(after.includes('"Label contains $x=decoy"'));
        assert.ok(after.endsWith('$x="2")'));
    });

    it('normalizes negative zero and safely serializes finite decimals', () => {
        const source = 'graph TB\nPerson(User, "User")';
        const after = mutate(source, 'User', { x: -0, y: 0.125, locked: false });
        assert.ok(after.includes('$x="0"'));
        assert.ok(after.includes('$y="0.125"'));
        assert.ok(after.includes('$locked="false"'));
    });

    it('supports the parenthesised Node deployment form', () => {
        const source = [
            '%%{ c4: deployment }%%',
            'graph TB',
            'Node(Cloud, "Cloud") {',
            '  Container(App, "App", "Node.js")',
            '}',
        ].join('\n');
        const mutated = mutate(source, 'Cloud', { x: 10, y: 20, locked: true });
        assert.ok(mutated.includes('Node(Cloud, "Cloud", $x="10", $y="20", $locked="true") {'));
        assert.strictEqual(parser.parse(mutated).elements[0].metadata?.locked, 'true');
    });

    it('preserves multiline closing-parenthesis whitespace on insert', () => {
        const source = [
            'graph TB',
            'Person(',
            '  User,',
            '  "User"',
            ')',
        ].join('\n');
        const mutated = mutate(source, 'User', { x: 10 });
        assert.ok(mutated.includes('  "User", $x="10"\n)'));
        assert.strictEqual(parser.parse(mutated).elements[0].metadata?.x, '10');
    });

    it('returns no edit when the canonical value is already present', () => {
        const source = 'graph TB\nPerson(User, "User", $x="10", $locked="true")';
        assert.deepStrictEqual(
            planMetadataUpdate(source, elementRef(source, 'User'), { x: 10, locked: true }),
            [],
        );
    });

    it('rejects arbitrary keys and string injection payloads', () => {
        const source = 'graph TB\nPerson(User, "User")';
        const ref = elementRef(source, 'User');

        assert.throws(
            () => planMetadataUpdate(source, ref, { x: 1, evil: '"), System(Pwned, "Pwned")' } as unknown as LayoutMetadataPatch),
            InvalidMetadataPatchError,
        );
        assert.throws(
            () => planMetadataUpdate(source, ref, { x: '1"), System(Pwned, "Pwned")' } as unknown as LayoutMetadataPatch),
            InvalidMetadataPatchError,
        );
    });

    it('rejects non-finite, out-of-bound and non-boolean values', () => {
        const source = 'graph TB\nPerson(User, "User")';
        const ref = elementRef(source, 'User');
        const invalid: LayoutMetadataPatch[] = [
            { x: Number.NaN },
            { x: Number.POSITIVE_INFINITY },
            { y: 1_000_001 },
            { y: -1_000_001 },
            { locked: 'true' } as unknown as LayoutMetadataPatch,
        ];

        for (const patch of invalid) {
            assert.throws(() => planMetadataUpdate(source, ref, patch), InvalidMetadataPatchError);
        }
    });

    it('rejects accessors instead of evaluating an untrusted getter', () => {
        const source = 'graph TB\nPerson(User, "User")';
        let evaluated = false;
        const patch = Object.defineProperty({}, 'x', {
            enumerable: true,
            get: () => {
                evaluated = true;
                return 1;
            },
        }) as LayoutMetadataPatch;

        assert.throws(
            () => planMetadataUpdate(source, elementRef(source, 'User'), patch),
            InvalidMetadataPatchError,
        );
        assert.strictEqual(evaluated, false);
    });
});

describe('NativeMutationPlanner stale and unsupported source handling', () => {
    it('rejects an out-of-bounds parser range', () => {
        const source = 'Person(User, "User")';
        const stale: NativeElementSourceRef = {
            elementId: 'User',
            range: {
                start: { offset: 0, line: 1, column: 1 },
                end: { offset: 999, line: 1, column: 1000 },
            },
        };
        assert.throws(() => planMetadataUpdate(source, stale, { x: 1 }), StaleRangeError);
    });

    it('rejects a range whose cached line/column no longer matches', () => {
        const source = 'graph TB\nPerson(User, "User")';
        const current = elementRef(source, 'User');
        const stale: NativeElementSourceRef = {
            ...current,
            range: {
                start: { ...current.range.start, line: 1 },
                end: current.range.end,
            },
        };
        assert.throws(() => planMetadataUpdate(source, stale, { x: 1 }), StaleRangeError);
    });

    it('rejects a same-span declaration whose element identity changed', () => {
        const original = 'graph TB\nPerson(User, "User")';
        const changed = 'graph TB\nPerson(Evil, "User")';
        const ref = elementRef(original, 'User');
        assert.strictEqual(original.length, changed.length);
        assert.throws(() => planMetadataUpdate(changed, ref, { x: 1 }), StaleRangeError);
    });

    it('rejects duplicate target metadata as ambiguous', () => {
        const source = 'graph TB\nPerson(User, "User", $x="1", $x="2")';
        assert.throws(
            () => planMetadataUpdate(source, elementRef(source, 'User'), { x: 3 }),
            StaleRangeError,
        );
    });

    it('supports bracket syntax writeback and updates coordinates', () => {
        const source = 'graph TB\nCustomer[Customer<br/>Person]';
        const ref = elementRef(source, 'Customer');
        const edits = planMetadataUpdate(source, ref, { x: 100, y: 200, locked: true });
        assert.strictEqual(edits.length, 1);
        assert.strictEqual(edits[0].newText, ' $x="100", $y="200", $locked="true"');
        const mutated = applyBoundedEdits(source, edits);
        assert.strictEqual(mutated, 'graph TB\nCustomer[Customer<br/>Person] $x="100", $y="200", $locked="true"');
        assert.strictEqual(parser.parse(mutated).elements[0].metadata?.x, '100');
    });

    it('updates existing metadata for bracket syntax', () => {
        const source = 'graph TB\nCustomer[Customer<br/>Person] $x="10"';
        const ref = elementRef(source, 'Customer');
        const edits = planMetadataUpdate(source, ref, { x: 20, y: 30 });
        const mutated = applyBoundedEdits(source, edits);
        assert.strictEqual(mutated, 'graph TB\nCustomer[Customer<br/>Person] $x="20", $y="30"');
    });

    it('supports legacy non-parenthesised Node writeback', () => {
        const source = 'graph TB\nNode "Cloud" {\n  Container(App, "App")\n}';
        const ref = elementRef(source, 'Cloud');
        const edits = planMetadataUpdate(source, ref, { x: 10, y: 20 });
        const mutated = applyBoundedEdits(source, edits);
        assert.strictEqual(mutated, 'graph TB\nNode "Cloud" $x="10", $y="20" {\n  Container(App, "App")\n}');
    });
});

describe('Round-trip preservation and deterministic multi-element edits', () => {
    it('preserves Unicode, CRLF, comments and unrelated text exactly', () => {
        const source = [
            '%%{ c4: container }%%',
            'graph TB',
            '%% 😀 keep this comment byte-for-byte',
            '  Person(User, "José 😀")',
            '  Container(App, "Application", "Node.js")',
            '  User -->|Uses| App',
        ].join('\r\n');
        const ref = elementRef(source, 'User');
        const prefix = source.slice(0, ref.range.start.offset);
        const suffix = source.slice(ref.range.end.offset);
        const mutated = applyBoundedEdits(
            source,
            planMetadataUpdate(source, ref, { x: 100.5, y: 200, locked: true }),
        );

        assert.strictEqual(mutated.slice(0, prefix.length), prefix);
        assert.ok(mutated.endsWith(suffix));
        const reparsed = parser.parse(mutated);
        assert.strictEqual(reparsed.elements[0].metadata?.x, '100.5');
        assert.strictEqual(reparsed.elements[0].metadata?.y, '200');
        assert.strictEqual(reparsed.elements[0].metadata?.locked, 'true');
        assert.strictEqual(reparsed.elements[0].label, 'José 😀');
    });

    it('applies independent element inserts deterministically', () => {
        const source = [
            'graph TB',
            'Person(User, "User")',
            '%% separator',
            'System(App, "App")',
        ].join('\n');
        const userEdits = planMetadataUpdate(source, elementRef(source, 'User'), { x: 1, y: 2 });
        const appEdits = planMetadataUpdate(source, elementRef(source, 'App'), { x: 3, y: 4, locked: true });
        const forward = applyBoundedEdits(source, [...userEdits, ...appEdits]);
        const reverse = applyBoundedEdits(source, [...appEdits, ...userEdits]);

        assert.strictEqual(forward, reverse);
        assert.ok(forward.includes('%% separator'));
        assert.ok(forward.includes('$x="1", $y="2"'));
        assert.ok(forward.includes('$x="3", $y="4", $locked="true"'));
        assert.strictEqual(parser.parse(forward).elements.length, 2);
    });

    it('updates existing and inserts missing fields without overlapping edits', () => {
        const source = 'graph TB\nContainer(App, "App", "Java", $x="1")';
        const edits = planMetadataUpdate(source, elementRef(source, 'App'), { x: 2, y: 3, locked: false });
        assert.strictEqual(edits.length, 2);
        const mutated = applyBoundedEdits(source, edits);
        assert.ok(mutated.endsWith('$x="2", $y="3", $locked="false")'));
        assert.strictEqual(parser.parse(mutated).elements[0].metadata?.locked, 'false');
    });

    describe('planMetadataReset', () => {
        it('removes layout coordinates and commas cleanly from function syntax', () => {
            const source = 'graph TB\nPerson(User, "User", $x="100", $y="200", $locked="true")';
            const edits = planMetadataReset(source, elementRef(source, 'User'));
            assert.strictEqual(edits.length, 3);
            const mutated = applyBoundedEdits(source, edits);
            assert.strictEqual(mutated.replace(/\s+/g, ''), 'graphTBPerson(User,"User")');
        });

        it('removes coordinates when there are other metadata fields', () => {
            const source = 'graph TB\nPerson(User, "User", $x="100", $y="200", $locked="true", $custom="val")';
            const edits = planMetadataReset(source, elementRef(source, 'User'));
            const mutated = applyBoundedEdits(source, edits);
            assert.strictEqual(mutated.replace(/\s+/g, ''), 'graphTBPerson(User,"User",$custom="val")');
        });

        it('does nothing when no layout metadata is present', () => {
            const source = 'graph TB\nPerson(User, "User")';
            const edits = planMetadataReset(source, elementRef(source, 'User'));
            assert.strictEqual(edits.length, 0);
        });
    });

    describe('planElementDescriptionUpdate', () => {
        it('updates an existing description', () => {
            const source = 'graph TB\nPerson(User, "User Name", "Tech Stack", "Old Description", $x="10")';
            const ref = elementRef(source, 'User');
            const edits = planElementDescriptionUpdate(source, ref, 'New Description');
            assert.strictEqual(edits.length, 1);
            const mutated = applyBoundedEdits(source, edits);
            assert.ok(mutated.includes('"New Description"'));
            assert.ok(mutated.includes('$x="10"'));
            assert.strictEqual(parser.parse(mutated).elements[0].description, 'New Description');
        });

        it('adds description and initializes technology empty string if missing', () => {
            const source = 'graph TB\nPerson(User, "User Name")';
            const ref = elementRef(source, 'User');
            const edits = planElementDescriptionUpdate(source, ref, 'Added Description');
            assert.strictEqual(edits.length, 1);
            const mutated = applyBoundedEdits(source, edits);
            assert.ok(mutated.includes('Person(User, "User Name", "", "Added Description")'));
            assert.strictEqual(parser.parse(mutated).elements[0].description, 'Added Description');
            assert.strictEqual(parser.parse(mutated).elements[0].technology, '');
        });

        it('adds description when technology is already present', () => {
            const source = 'graph TB\nPerson(User, "User Name", "Tech Stack")';
            const ref = elementRef(source, 'User');
            const edits = planElementDescriptionUpdate(source, ref, 'Added Description');
            assert.strictEqual(edits.length, 1);
            const mutated = applyBoundedEdits(source, edits);
            assert.ok(mutated.includes('Person(User, "User Name", "Tech Stack", "Added Description")'));
            assert.strictEqual(parser.parse(mutated).elements[0].description, 'Added Description');
        });

        it('rejects bracket syntax elements since they do not support description parameters', () => {
            const source = 'graph TB\nCustomer[Customer<br/>Person]';
            const ref = elementRef(source, 'Customer');
            assert.throws(() => planElementDescriptionUpdate(source, ref, 'Desc'), Error);
        });
    });

    describe('semantic element field planners', () => {
        it('updates a label precisely, with no-op, empty, and oversize validation coverage', () => {
            const source = 'graph TB\nPerson(User, "Old name", "TypeScript")';
            const ref = elementRef(source, 'User');
            const edits = planElementLabelUpdate(source, ref, 'New name');
            const mutated = applyBoundedEdits(source, edits);
            assert.strictEqual(parser.parse(mutated).elements[0].label, 'New name');
            assert.strictEqual(planElementLabelUpdate(mutated, elementRef(mutated, 'User'), 'New name').length, 0);
            assert.throws(() => planElementLabelUpdate(source, ref, ''), /label/);
            assert.throws(() => planElementLabelUpdate(source, ref, 'x'.repeat(121)), /label/);
        });

        it('updates, clears, and validates the technology slot without disturbing description', () => {
            const source = 'graph TB\nPerson(User, "User", "Java", "Existing description")';
            const ref = elementRef(source, 'User');
            const updated = applyBoundedEdits(source, planElementTechnologyUpdate(source, ref, 'Kotlin'));
            assert.strictEqual(parser.parse(updated).elements[0].technology, 'Kotlin');
            assert.strictEqual(planElementTechnologyUpdate(updated, elementRef(updated, 'User'), 'Kotlin').length, 0);
            const cleared = applyBoundedEdits(updated, planElementTechnologyUpdate(updated, elementRef(updated, 'User'), null));
            const parsed = parser.parse(cleared).elements[0];
            assert.strictEqual(parsed.technology, '');
            assert.strictEqual(parsed.description, 'Existing description');
            assert.throws(() => planElementTechnologyUpdate(source, ref, 'x'.repeat(121)), /technology/);
        });

        it('updates, clears, and validates comma-separated tags', () => {
            const source = 'graph TB\nContainer(App, "App", $tags="Existing")';
            const ref = elementRef(source, 'App');
            const updated = applyBoundedEdits(source, planElementTagsUpdate(source, ref, ['Core', 'Internal']));
            assert.deepStrictEqual(parser.parse(updated).elements[0].tags, ['Core', 'Internal']);
            const cleared = applyBoundedEdits(updated, planElementTagsUpdate(updated, elementRef(updated, 'App'), []));
            assert.deepStrictEqual(parser.parse(cleared).elements[0].tags, []);
            const maxTags = Array.from({ length: 20 }, (_, index) => `tag${index}`);
            assert.doesNotThrow(() => planElementTagsUpdate(source, ref, maxTags));
            assert.throws(() => planElementTagsUpdate(source, ref, ['invalid tag']), /tags/);
            assert.throws(() => planElementTagsUpdate(source, ref, Array.from({ length: 21 }, (_, index) => `tag${index}`)), /tags/);
        });

        it('updates a known sprite and rejects an unknown catalogue entry', () => {
            const source = 'graph TB\nContainer(App, "App")';
            const ref = elementRef(source, 'App');
            const updated = applyBoundedEdits(source, planElementSpriteUpdate(source, ref, 'database'));
            assert.strictEqual(parser.parse(updated).elements[0].sprite, 'database');
            assert.throws(() => planElementSpriteUpdate(source, ref, 'not-a-c4x-sprite'), /Unknown sprite/);
        });

        it('renames an identifier and every source/target relationship endpoint as one edit set', () => {
            const source = [
                'graph TB',
                'Person(User, "User")',
                'Container(App, "App")',
                'Container(Audit, "Audit")',
                'User -->|Uses| App',
                'App -->|Audits| User',
                'User -->|Owns| User',
                'Audit -->|Reports| User',
            ].join('\n');
            const edits = planElementIdRename(source, elementRef(source, 'User'), 'Customer');
            assert.strictEqual(edits.length, 6);
            const mutated = applyBoundedEdits(source, edits);
            const parsed = parser.parse(mutated);
            assert.ok(parsed.elements.some(element => element.id === 'Customer'));
            assert.deepStrictEqual(parsed.relationships.map(rel => [rel.from, rel.to]), [
                ['Customer', 'App'],
                ['App', 'Customer'],
                ['Customer', 'Customer'],
                ['Audit', 'Customer'],
            ]);
        });

        it('renames an identifier with no references and rejects conflicts or invalid syntax before returning edits', () => {
            const source = 'graph TB\nPerson(User, "User")\nContainer(App, "App")';
            assert.strictEqual(planElementIdRename(source, elementRef(source, 'User'), 'Customer').length, 1);
            assert.throws(() => planElementIdRename(source, elementRef(source, 'User'), 'App'), /id_conflict/);
            assert.throws(() => planElementIdRename(source, elementRef(source, 'User'), '1customer'), /Element id/);
        });
    });
});

describe('Source mapping adapter compatibility', () => {
    it('leaves Structurizr models without native source ranges', () => {
        const adapter = new StructurizrAdapter();
        const workspace = {
            type: 'workspace' as const,
            location: { line: 1, column: 1 },
            name: 'Test',
            model: { type: 'model', location: { line: 1, column: 1 }, elements: [], relationships: [] },
            views: { type: 'views', location: { line: 1, column: 1 }, views: [] },
        } as Parameters<typeof adapter.convert>[0];
        const model = adapter.convert(workspace);
        assert.ok(model.views.length === 0 || model.views[0].elements.every(element => element.sourceRange === undefined));
    });

    it('leaves PlantUML models without native source ranges', () => {
        const model = new PlantUMLAdapter().convert({ macros: [] });
        assert.ok(model.views[0].elements.every(element => element.sourceRange === undefined));
    });
});
