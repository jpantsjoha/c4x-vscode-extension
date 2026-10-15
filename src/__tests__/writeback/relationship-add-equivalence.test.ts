/**
 * Structural equivalence for connect-mode relationship adds (#66, BUG-2).
 *
 * `assertStructuralEquivalence` runs per view. The first implementation added
 * the *global* count of allowed relationship adds to every view's expected
 * relationship count, and demanded that every allowed add materialise in every
 * view. A new relationship lands only in the views that contain both of its
 * endpoints, so on any multi-view document connect mode failed with
 * "Relationships count changed in view N".
 *
 * The count check is now per view; materialisation is checked once across all
 * views.
 */
import * as assert from 'assert';
import { assertStructuralEquivalence } from '../../writeback/WritebackTransaction';
import { C4Model, C4Element, C4Rel, C4Boundary } from '../../model/C4Model';

type AllowedAdd = { from: string; to: string; label: string; relType: string; technology?: string };

function element(id: string): C4Element {
    return { id, type: 'SoftwareSystem', label: id, metadata: {} } as unknown as C4Element;
}

function rel(id: string, from: string, to: string, label = 'Uses'): C4Rel {
    return { id, from, to, label, relType: 'uses' } as unknown as C4Rel;
}

function view(elements: C4Element[], relationships: C4Rel[], boundaries: C4Boundary[] = []) {
    return {
        type: 'C1' as C4Model['views'][number]['type'],
        direction: 'TB' as const,
        elements,
        relationships,
        boundaries,
    };
}

function model(views: ReturnType<typeof view>[]): C4Model {
    return { workspace: 'Test', views } as unknown as C4Model;
}

const ADD: AllowedAdd = { from: 'a', to: 'b', label: 'Uses', relType: 'uses' };

describe('relationship-add structural equivalence (#66)', () => {
    describe('single view', () => {
        it('accepts an allowed add', () => {
            const before = model([view([element('a'), element('b')], [])]);
            const after = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b')])]);
            assert.doesNotThrow(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
            );
        });

        it('still rejects an add that was never allowed', () => {
            const before = model([view([element('a'), element('b')], [])]);
            const after = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a'])),
                /was added or source\/target changed/,
            );
        });

        it('rejects an add whose label does not match what was staged', () => {
            const before = model([view([element('a'), element('b')], [])]);
            const after = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b', 'Something else')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /was added or source\/target changed|Relationships count changed/,
            );
        });

        it('rejects a silent deletion alongside an allowed add', () => {
            const before = model([view([element('a'), element('b')], [rel('rel-0', 'b', 'a', 'Existing')])]);
            const after = model([view([element('a'), element('b')], [rel('rel-1', 'a', 'b')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /Relationship rel-1 was added or source\/target changed/,
            );
        });

        it('accepts an add at the tail that duplicates an existing endpoint pair (#259)', () => {
            const before = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b')])]);
            const after = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b'), rel('rel-1', 'a', 'b')])]);
            assert.doesNotThrow(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
            );
        });

        it('rejects an add that renumbers the relationships after it (#259)', () => {
            const before = model([view([element('a'), element('b'), element('c')], [rel('rel-0', 'b', 'c', 'Calls')])]);
            const after = model([view([element('a'), element('b'), element('c')], [rel('rel-0', 'a', 'b'), rel('rel-1', 'b', 'c', 'Calls')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /added or source\/target changed unexpectedly/,
            );
        });

        // On main the add is accepted wherever it sits, because only the id is
        // looked at; a survivor that still has its own id does not make it the tail.
        it('rejects a new relationship that sits before an original one, even with its own id (#259)', () => {
            const before = model([view([element('a'), element('b'), element('c')], [rel('rel-0', 'b', 'c', 'Calls')])]);
            const after = model([view([element('a'), element('b'), element('c')], [rel('rel-9', 'a', 'b'), rel('rel-0', 'b', 'c', 'Calls')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /Relationship rel-9 was added or source\/target changed/,
            );
        });

        it('requires several adds in staging order', () => {
            const ab: AllowedAdd = { from: 'a', to: 'b', label: 'Uses', relType: 'uses' };
            const ac: AllowedAdd = { from: 'a', to: 'c', label: 'Reads', relType: 'uses' };
            const els = [element('a'), element('b'), element('c')];
            const before = model([view(els, [rel('rel-0', 'b', 'c', 'Calls')])]);
            const inOrder = model([view(els, [rel('rel-0', 'b', 'c', 'Calls'), rel('rel-1', 'a', 'b'), rel('rel-2', 'a', 'c', 'Reads')])]);
            const reversed = model([view(els, [rel('rel-0', 'b', 'c', 'Calls'), rel('rel-1', 'a', 'c', 'Reads'), rel('rel-2', 'a', 'b')])]);
            assert.doesNotThrow(
                () => assertStructuralEquivalence(before, inOrder, new Set(['a']), undefined, undefined, undefined, undefined, [ab, ac]),
            );
            assert.throws(
                () => assertStructuralEquivalence(before, reversed, new Set(['a']), undefined, undefined, undefined, undefined, [ab, ac]),
                /was added or source\/target changed/,
            );
        });

        it('lets one allowed add account for only one new relationship (#259)', () => {
            const before = model([view([element('a'), element('b')], [])]);
            const after = model([view([element('a'), element('b')], [rel('rel-0', 'a', 'b'), rel('rel-1', 'a', 'b')])]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /was added or source\/target changed/,
            );
        });
    });

    describe('multi view (BUG-2)', () => {
        it('accepts an add that lands in only one of two views', () => {
            // View 2 does not contain the new relationship, and must not be
            // required to. This is the case that used to fail.
            const before = model([
                view([element('a'), element('b')], []),
                view([element('c'), element('d')], [rel('rel-9', 'c', 'd', 'Other')]),
            ]);
            const after = model([
                view([element('a'), element('b')], [rel('rel-0', 'a', 'b')]),
                view([element('c'), element('d')], [rel('rel-9', 'c', 'd', 'Other')]),
            ]);
            assert.doesNotThrow(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
            );
        });

        it('accepts an add that lands in both views', () => {
            const before = model([
                view([element('a'), element('b')], []),
                view([element('a'), element('b')], []),
            ]);
            const after = model([
                view([element('a'), element('b')], [rel('rel-0', 'a', 'b')]),
                view([element('a'), element('b')], [rel('rel-0', 'a', 'b')]),
            ]);
            assert.doesNotThrow(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
            );
        });

        it('rejects an allowed add that materialised in no view at all', () => {
            const before = model([
                view([element('a'), element('b')], []),
                view([element('c'), element('d')], []),
            ]);
            const after = model([
                view([element('a'), element('b')], []),
                view([element('c'), element('d')], []),
            ]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /was not materialised in the updated model/,
            );
        });

        it('rejects an unrelated relationship appearing in the second view', () => {
            const before = model([
                view([element('a'), element('b')], []),
                view([element('c'), element('d')], []),
            ]);
            const after = model([
                view([element('a'), element('b')], [rel('rel-0', 'a', 'b')]),
                view([element('c'), element('d')], [rel('rel-1', 'c', 'd', 'Sneaked in')]),
            ]);
            assert.throws(
                () => assertStructuralEquivalence(before, after, new Set(['a']), undefined, undefined, undefined, undefined, [ADD]),
                /was added or source\/target changed|Relationships count changed/,
            );
        });
    });
});
