import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { isBoundaryGeometryEditable } from '../../webview/visualLayoutProtocol';
import { buildBoundarySnapshots } from '../../webview/boundarySnapshots';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';

/**
 * Which boundaries edit mode may offer to move or resize (#271). The grammar
 * gives only `subgraph` a metadata slot, so only a boundary built from one is
 * editable; the three typed C4 forms are not.
 */
function boundariesOf(source: string) {
    const model = new C4ModelBuilder().build(new C4XParser().parse(`%%{ c4: system-context }%%\ngraph TB\n${source}\n`), 'T');
    return model.views[0].boundaries ?? [];
}

describe('isBoundaryGeometryEditable (#271)', () => {
    it('is true for a subgraph boundary', () => {
        const [boundary] = boundariesOf('subgraph Shop {\n  System(x, "X")\n}');
        assert.strictEqual(isBoundaryGeometryEditable(boundary), true);
    });

    for (const keyword of ['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary']) {
        it(`is false for ${keyword}`, () => {
            const [boundary] = boundariesOf(`${keyword}(sb, "Shop") {\n  System(x, "X")\n}`);
            assert.strictEqual(boundary.boundaryType, keyword);
            assert.strictEqual(isBoundaryGeometryEditable(boundary), false);
        });
    }

    it('decides each boundary of a mixed diagram on its own', () => {
        const flags = boundariesOf(
            'System_Boundary(sb, "Shop") {\n  System(x, "X")\n}\nsubgraph Backend {\n  Container(api, "API")\n}',
        ).map(isBoundaryGeometryEditable);
        assert.deepStrictEqual(flags, [false, true]);
    });
});

/**
 * The payload the host sends the editor. The editor offers a drag to every
 * boundary the snapshot does not mark `movable: false`, so a host that stops
 * sending the flag makes typed boundaries draggable again (#271).
 */
describe('buildBoundarySnapshots — movable flag (#271)', () => {
    function snapshotsOf(source: string) {
        const model = new C4ModelBuilder().build(new C4XParser().parse(`%%{ c4: system-context }%%\ngraph TB\n${source}\n`), 'T');
        return buildBoundarySnapshots(new DagreLayoutEngine().layoutSync(model.views[0]));
    }

    for (const keyword of ['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary']) {
        it(`marks ${keyword} movable: false`, () => {
            const [snapshot] = snapshotsOf(`${keyword}(sb, "Shop") {\n  System(x, "X")\n}`);
            assert.strictEqual(snapshot.label, 'Shop');
            assert.strictEqual(snapshot.movable, false);
        });
    }

    it('leaves a subgraph boundary editable and sends no flag', () => {
        const [snapshot] = snapshotsOf('subgraph Shop {\n  System(x, "X")\n}');
        assert.strictEqual(snapshot.movable, undefined);
    });

    it('flags each boundary of a mixed diagram on its own', () => {
        const snapshots = snapshotsOf(
            'System_Boundary(sb, "Shop") {\n  System(x, "X")\n}\nsubgraph Backend {\n  Container(api, "API")\n}',
        );
        assert.deepStrictEqual(snapshots.map(s => [s.label, s.movable]), [['Shop', false], ['Backend', undefined]]);
    });

    it('still carries the manual geometry and children it carried before', () => {
        const [snapshot] = snapshotsOf('subgraph Shop $x="40", $y="50", $w="500", $h="400" {\n  System(x, "X")\n}');
        assert.strictEqual(snapshot.manualX, true);
        assert.strictEqual(snapshot.manualWidth, 500);
        assert.deepStrictEqual(snapshot.childNodeIds, ['x']);
    });
});
