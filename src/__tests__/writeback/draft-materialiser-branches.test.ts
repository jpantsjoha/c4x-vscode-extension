/**
 * Branch coverage for materialiseDraft: the boundary and relationship edit
 * routes, nested-element lookup, the per-field spreads, insertion coalescing
 * and each planner failure that must be reported rather than thrown.
 *
 * Every case asserts the materialised text or the rejection reason.
 */
import * as assert from 'assert';
import { materialiseDraft } from '../../writeback/draftMaterialiser';
import type { StagedEdit } from '../../webview/visualLayoutProtocol';

const NESTED_SOURCE = `graph TB
Node(Cluster, "Cluster")  {
  Container(API, "API")
}
Person(User, "User")
User --> API
`;

const BOUNDARY_SOURCE = `graph TB
subgraph Backend {
  Container(API, "API")
}
Person(User, "User")
User --> API
`;

/** Materialises `edits` and fails the test if the planner rejected them. */
function materialised(source: string, edits: StagedEdit[], useSidecar = false): string {
    const result = materialiseDraft(source, edits, useSidecar);
    assert.ok(result.ok, `expected a materialised draft, got: ${result.ok ? '' : result.reason}`);
    return result.text;
}

/** Materialises `edits` and fails the test if the planner accepted them. */
function rejection(source: string, edits: StagedEdit[]): string {
    const result = materialiseDraft(source, edits);
    assert.ok(!result.ok, `expected a rejection, got:\n${result.ok ? result.text : ''}`);
    return result.reason;
}

describe('materialiseDraft — nested element lookup', () => {
    it('finds and edits a container nested inside a deployment node', () => {
        const text = materialised(NESTED_SOURCE, [{ id: 'API', label: 'Gateway' }]);

        assert.ok(text.includes('Container(API, "Gateway")'), `expected the nested label rewritten, got:\n${text}`);
        assert.ok(text.includes('Node(Cluster, "Cluster")'), 'the parent must be untouched');
    });

    it('reports a missing identifier rather than editing the wrong element', () => {
        assert.strictEqual(
            rejection(NESTED_SOURCE, [{ id: 'Missing', label: 'Gateway' }]),
            'Element "Missing" not found in source.',
        );
    });
});

describe('materialiseDraft — boundary edits', () => {
    it('writes boundary position metadata into the subgraph statement', () => {
        const text = materialised(BOUNDARY_SOURCE, [
            { id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', x: 10, y: 20 },
        ]);

        assert.ok(text.includes('subgraph Backend $x="10", $y="20" {'), `expected boundary coordinates, got:\n${text}`);
    });

    it('writes boundary size metadata independently of position', () => {
        const text = materialised(BOUNDARY_SOURCE, [
            { id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', w: 300, h: 200 },
        ]);

        assert.ok(text.includes('subgraph Backend $w="300", $h="200" {'), `expected boundary size, got:\n${text}`);
        assert.ok(!text.includes('$x='), 'position must not be invented');
    });

    it('reports a typed boundary as a rejection, as Save does, instead of showing a partial diff (#271)', () => {
        const source = `graph TB
System_Boundary(sb, "Shop") {
  System(x, "X")
}
Person(User, "User")
`;
        const reason = rejection(source, [
            { id: 'shop-boundary-0', boundaryId: 'shop-boundary-0', x: 10, y: 20 },
            { id: 'User', x: 5, y: 6 },
        ]);

        assert.ok(reason.includes('"Shop"') && reason.includes('System_Boundary'), `names the boundary and its form, got: ${reason}`);
    });

    it('rejects an unknown boundary id', () => {
        assert.strictEqual(
            rejection(BOUNDARY_SOURCE, [{ id: 'ghost-boundary-0', boundaryId: 'ghost-boundary-0', x: 1, y: 2 }]),
            'Boundary "ghost-boundary-0" not found in source.',
        );
    });

    it('reports a rejected boundary geometry instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [
            { id: 'backend-boundary-0', boundaryId: 'backend-boundary-0', w: Number.NaN, h: Number.NaN },
        ]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
        assert.ok(reason.includes('$w'), `expected the offending field named, got: ${reason}`);
    });
});

describe('materialiseDraft — relationship edits', () => {
    it('rewrites a relationship label', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', label: 'Calls' }]);

        assert.ok(text.includes('User -->|Calls| API'), `expected the relationship label, got:\n${text}`);
    });

    it('rewrites relationship technology, type and endpoints', () => {
        const technology = materialised(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', technology: 'HTTPS' }]);
        assert.ok(technology.includes('HTTPS'), `expected the technology written, got:\n${technology}`);

        const relType = materialised(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', relType: 'async' }]);
        assert.ok(relType.includes('User -.-> API'), `expected an async arrow, got:\n${relType}`);

        const from = materialised(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', from: 'API' }]);
        assert.ok(from.includes('API --> API'), `expected the source endpoint rewritten, got:\n${from}`);

        const to = materialised(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', to: 'User' }]);
        assert.ok(to.includes('User --> User'), `expected the target endpoint rewritten, got:\n${to}`);
    });

    it('rejects an edge id that does not address an existing relationship', () => {
        assert.strictEqual(
            rejection(BOUNDARY_SOURCE, [{ id: 'rel-9', edgeId: 'rel-9', label: 'Calls' }]),
            'Relationship "rel-9" not found in source.',
        );
        assert.strictEqual(
            rejection(BOUNDARY_SOURCE, [{ id: 'edge-a', edgeId: 'edge-a', label: 'Calls' }]),
            'Relationship "edge-a" not found in source.',
        );
    });

    it('reports a rejected endpoint instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [{ id: 'rel-0', edgeId: 'rel-0', to: 'not a valid id!' }]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
    });
});

describe('materialiseDraft — per-field text edits', () => {
    it('writes technology on its own without inventing a label or description', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', technology: 'Go' }]);

        assert.ok(text.includes('Container(API, "API", "Go")'), `expected technology only, got:\n${text}`);
    });

    it('writes description on its own', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', description: 'Serves requests' }]);

        assert.ok(
            text.includes('Container(API, "API", "", "Serves requests")'),
            `expected description only, got:\n${text}`,
        );
    });

    it('reports a label the planner refuses instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [{ id: 'API', label: 'He said "hello"' }]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
        assert.ok(reason.includes('label'), `expected the offending field named, got: ${reason}`);
    });
});

describe('materialiseDraft — attribute and identifier edits', () => {
    it('writes tags', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', tags: ['Database'] }]);

        assert.ok(text.includes('$tags="Database"'), `expected the tag metadata, got:\n${text}`);
    });

    it('writes a sprite', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', sprite: 'server' }]);

        assert.ok(text.includes('$sprite=server'), `expected the sprite metadata, got:\n${text}`);
    });

    it('renames an identifier', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', newId: 'Gateway' }]);

        assert.ok(text.includes('Container(Gateway, "API")'), `expected the rename, got:\n${text}`);
    });

    it('reports a refused identifier instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [{ id: 'API', newId: '9 not valid!' }]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
    });

    it('reports a refused sprite instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [{ id: 'API', sprite: 'no such sprite!' }]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
    });
});

describe('materialiseDraft — layout metadata edits', () => {
    it('writes the locked flag alone when no coordinates are staged', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', locked: true }]);

        assert.ok(text.includes('$locked="true"'), `expected the locked flag, got:\n${text}`);
        assert.ok(!text.includes('$x='), 'no coordinates may be invented');
    });

    it('writes coordinates alone when no locked flag is staged', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', x: 40, y: 60 }]);

        assert.ok(text.includes('$x="40", $y="60"'), `expected the coordinates, got:\n${text}`);
        assert.ok(!text.includes('$locked'), 'no lock state may be invented');
    });

    it('still writes the locked flag to native source in sidecar mode, but not the coordinates', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', x: 40, y: 60, locked: true }], true);

        assert.ok(text.includes('$locked="true"'), `expected the locked flag, got:\n${text}`);
        assert.ok(!text.includes('$x='), 'sidecar mode keeps coordinates out of the source');
    });

    it('reports a refused coordinate instead of throwing', () => {
        const reason = rejection(BOUNDARY_SOURCE, [{ id: 'API', x: Number.NaN, y: Number.NaN }]);

        assert.ok(reason.includes('InvalidMetadataPatchError'), `expected the planner error, got: ${reason}`);
        assert.ok(reason.includes('$x'), `expected the offending field named, got: ${reason}`);
    });

    it('returns the source unchanged when the staged edits plan no text change', () => {
        const result = materialiseDraft(BOUNDARY_SOURCE, [{ id: 'API', x: 40, y: 60 }], true);

        assert.ok(result.ok);
        assert.strictEqual(result.text, BOUNDARY_SOURCE);
    });
});

describe('materialiseDraft — insertion coalescing', () => {
    it('joins two zero-width insertions at the same offset into one metadata run', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', tags: ['Db'], locked: true }]);

        assert.ok(
            text.includes('Container(API, "API", $tags="Db", $locked="true")'),
            `expected one coalesced metadata run, got:\n${text}`,
        );
    });

    it('joins a sprite insertion with a coordinate insertion at the same offset', () => {
        const text = materialised(BOUNDARY_SOURCE, [{ id: 'API', sprite: 'server', x: 5, y: 6 }]);

        assert.ok(
            text.includes('Container(API, "API", $sprite=server, $x="5", $y="6")'),
            `expected one coalesced metadata run, got:\n${text}`,
        );
    });

    it('keeps edits at different offsets separate', () => {
        const text = materialised(BOUNDARY_SOURCE, [
            { id: 'API', locked: true },
            { id: 'User', locked: true },
        ]);

        assert.ok(text.includes('Container(API, "API", $locked="true")'), `expected the container flag, got:\n${text}`);
        assert.ok(text.includes('Person(User, "User", $locked="true")'), `expected the person flag, got:\n${text}`);
    });
});

describe('materialiseDraft — parse failures', () => {
    it('reports a parse error rather than throwing', () => {
        const reason = rejection('graph TB\nPerson(', [{ id: 'API', label: 'Gateway' }]);

        assert.ok(reason.startsWith('Parse error:'), `expected a parse error, got: ${reason}`);
    });

    it('reports an edit-planning failure rather than throwing when two edits target one offset', () => {
        const reason = rejection(NESTED_SOURCE, [
            { id: 'API', label: 'First' } as StagedEdit,
            { id: 'API', label: 'Second' } as StagedEdit,
        ]);

        assert.ok(
            reason.startsWith('Edit planning error:'),
            `expected a planner rejection, got: ${reason}`,
        );
        assert.ok(reason.includes('offset'), `expected the offset in the reason, got: ${reason}`);
    });
});
