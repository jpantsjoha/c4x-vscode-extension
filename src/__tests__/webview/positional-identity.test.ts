/**
 * Rebasing a draft onto changed source (#261).
 *
 * Relationship and boundary ids are positional (`rel-<index>`,
 * `<label>-boundary-<index>`). After an external change the same id can name a
 * different statement, and a staged edit kept by Rebase would then be saved
 * onto that other statement. These cases build the real model from source
 * before and after the change and check what Rebase may keep.
 */
import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { ambiguousPositionalIds, changedPositionalIds, positionalIdentityOf, rebaseRefusal } from '../../webview/positionalIdentity';

const HEADER = '%%{ c4: container }%%\ngraph TB\n';

function identity(source: string) {
    return positionalIdentityOf(c4ModelBuilder.build(new C4XParser().parse(source), 'test').views[0]);
}

const BASE = HEADER + [
    'Person(u, "User")',
    'System(s, "Shop")',
    'System(p, "Payments")',
    'u -->|Browses| s',
    's -->|Charges| p',
].join('\n') + '\n';

describe('positional identity of relationships and boundaries (#261)', () => {
    it('names each rel-N by the statement it points at', () => {
        const ids = identity(BASE);
        assert.deepStrictEqual([...ids.keys()].filter(k => k.startsWith('rel-')), ['rel-0', 'rel-1']);
        assert.notStrictEqual(ids.get('rel-0'), ids.get('rel-1'));
    });

    it('reports rel-0 as changed when a relationship is inserted above it', () => {
        const after = BASE.replace('u -->|Browses| s', 'p -->|Notifies| u\nu -->|Browses| s');
        assert.deepStrictEqual(changedPositionalIds(identity(BASE), identity(after)), ['rel-0', 'rel-1']);
    });

    it('reports nothing when a relationship is appended after the existing ones', () => {
        const after = BASE + 'p -->|Notifies| u\n';
        assert.deepStrictEqual(changedPositionalIds(identity(BASE), identity(after)), []);
    });

    it('reports a relationship whose label changed in place', () => {
        const after = BASE.replace('|Charges|', '|Bills|');
        assert.deepStrictEqual(changedPositionalIds(identity(BASE), identity(after)), ['rel-1']);
    });

    it('does not list an id that no longer exists', () => {
        const after = BASE.replace('s -->|Charges| p\n', '');
        assert.deepStrictEqual(changedPositionalIds(identity(BASE), identity(after)), []);
    });

    it('reports two same-label boundaries that swapped places', () => {
        const before = HEADER + [
            'subgraph Zone {',
            '  Person(a, "A")',
            '}',
            'Container_Boundary(z2, "Zone") {',
            '  System(b, "B")',
            '}',
        ].join('\n') + '\n';
        const after = HEADER + [
            'Container_Boundary(z2, "Zone") {',
            '  System(b, "B")',
            '}',
            'subgraph Zone {',
            '  Person(a, "A")',
            '}',
        ].join('\n') + '\n';
        const changed = changedPositionalIds(identity(before), identity(after));
        assert.deepStrictEqual(changed.sort(), ['zone-boundary-0', 'zone-boundary-1']);
    });

    it('reports two boundaries with the same label and type that swapped places', () => {
        const zone = (member: string) => ['Container_Boundary(z, "Zone") {', `  System(${member}, "${member}")`, '}'].join('\n');
        const before = HEADER + zone('a') + '\n' + zone('b') + '\n';
        const after = HEADER + zone('b') + '\n' + zone('a') + '\n';
        const changed = changedPositionalIds(identity(before), identity(after));
        assert.strictEqual(changed.length, 2, 'both boundaries name different contents after the swap');
    });

    it('lists the ids of identical relationships as ambiguous', () => {
        const twin = BASE.replace('u -->|Browses| s\n', 'u -->|Browses| s\nu -->|Browses| s\n');
        assert.deepStrictEqual(ambiguousPositionalIds(identity(twin)), ['rel-0', 'rel-1']);
        assert.deepStrictEqual(ambiguousPositionalIds(identity(BASE)), []);
    });
});

describe('Rebase refuses a draft whose positional edit would move to another statement (#261)', () => {
    const inserted = BASE.replace('u -->|Browses| s', 'p -->|Notifies| u\nu -->|Browses| s');

    it('refuses when a staged relationship edit now names a different relationship', () => {
        const reason = rebaseRefusal(identity(BASE), identity(inserted), ['rel-1', 's']);
        assert.ok(reason && reason.startsWith('Cannot rebase: 1 staged relationship or boundary edit'), reason);
    });

    it('allows a draft with element edits only, whatever moved', () => {
        assert.strictEqual(rebaseRefusal(identity(BASE), identity(inserted), ['u', 's']), undefined);
    });

    it('allows a staged relationship edit whose statement did not move', () => {
        const appended = BASE + 'p -->|Notifies| u\n';
        assert.strictEqual(rebaseRefusal(identity(BASE), identity(appended), ['rel-0', 'rel-1']), undefined);
    });

    it('counts every changed positional id when the staged keys are not given', () => {
        const reason = rebaseRefusal(identity(BASE), identity(inserted), undefined);
        assert.ok(reason && reason.startsWith('Cannot rebase: 2 staged relationship or boundary edits'), reason);
    });

    it('refuses when the diagram the draft was staged against is unknown, unless nothing is staged', () => {
        assert.ok(rebaseRefusal(undefined, identity(inserted), ['rel-0']));
        assert.strictEqual(rebaseRefusal(undefined, identity(inserted), []), undefined);
    });

    it('refuses a staged edit on one of two identical relationships when one is removed', () => {
        const twin = BASE.replace('u -->|Browses| s\n', 'u -->|Browses| s\nu -->|Browses| s\n');
        const removedFirst = twin.replace('u -->|Browses| s\n', '');
        assert.strictEqual(identity(removedFirst).get('rel-0'), identity(twin).get('rel-0'), 'rel-0 keeps its fingerprint while naming the other statement');
        assert.ok(rebaseRefusal(identity(twin), identity(removedFirst), ['rel-0']));
    });

    it('allows an element-only draft even when identical relationships exist', () => {
        const twin = BASE.replace('u -->|Browses| s\n', 'u -->|Browses| s\nu -->|Browses| s\n');
        assert.strictEqual(rebaseRefusal(identity(twin), identity(twin), ['u']), undefined);
    });
});

describe('positional identity of nested boundaries (#339 review)', () => {
    const outer = (member: string) => ['subgraph Outer {', `  Person(${member}, "${member}")`, '  subgraph Inner {', '  }', '}'].join('\n');
    const emptyPair = HEADER + ['subgraph Outer {', '  subgraph Inner {', '  }', '}'].join('\n') + '\n';

    it('a parent fingerprint names its nested boundaries by structure, not by their positional ids', () => {
        const twin = emptyPair + emptyPair.slice(HEADER.length);
        const ids = identity(twin);
        assert.strictEqual(ids.get('outer-boundary-0'), ids.get('outer-boundary-2'),
            'two identical Outer blocks must not be told apart by the positional ids of their children');
    });

    it('refuses a staged edit on one of two identical outer blocks after they swap', () => {
        const before = HEADER + ['subgraph Outer {', '  subgraph Inner {', '  }', '}', 'subgraph Outer {', '  subgraph Inner {', '  }', '}'].join('\n') + '\n';
        // Swapping two identical blocks leaves the source text identical; the
        // staged id names a block that cannot be told apart from the other.
        assert.ok(rebaseRefusal(identity(before), identity(before), ['outer-boundary-0']));
    });

    it('a parent containing a boundary that cannot be told apart is itself ambiguous', () => {
        const source = HEADER + outer('a') + '\n' + outer('b') + '\n';
        const ambiguous = ambiguousPositionalIds(identity(source)).sort();
        assert.deepStrictEqual(ambiguous, ['inner-boundary-1', 'inner-boundary-3', 'outer-boundary-0', 'outer-boundary-2']);
    });

    it('a parent with uniquely identifiable nested boundaries stays unambiguous', () => {
        const source = HEADER + ['subgraph Outer {', '  subgraph Inner {', '    Person(a, "A")', '  }', '}',
            'subgraph Outer {', '  subgraph Inner {', '    Person(b, "B")', '  }', '}'].join('\n') + '\n';
        assert.deepStrictEqual(ambiguousPositionalIds(identity(source)), []);
    });
});

