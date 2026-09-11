import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import {
    applyBoundedEdits,
    sourcePositionAt,
} from '../../writeback/SourceRange';
import {
    InvalidMetadataPatchError,
    NativeBoundarySourceRef,
    StaleRangeError,
    UnsupportedNativeSyntaxError,
    planBoundaryMetadataUpdate,
} from '../../writeback/NativeMutationPlanner';

const parser = new C4XParser();

function boundaryRef(source: string, generatedId: string): NativeBoundarySourceRef {
    const parseResult = parser.parse(source);
    assert.ok(parseResult.boundaries && parseResult.boundaries.length > 0, 'expected boundaries in source');
    const rawBoundary = parseResult.boundaries!.find((b, index) => {
        const id = b.label.toLowerCase().replace(/\s+/g, '-') + '-boundary-' + index;
        return id === generatedId;
    });
    assert.ok(rawBoundary, `expected boundary ${generatedId}`);
    assert.ok(rawBoundary.sourceRange, `expected source range for ${generatedId}`);
    return {
        boundaryLabel: rawBoundary.label,
        range: rawBoundary.sourceRange,
    };
}

function mutate(source: string, generatedId: string, patch: { x?: number; y?: number; w?: number; h?: number }): string {
    return applyBoundedEdits(source, planBoundaryMetadataUpdate(source, boundaryRef(source, generatedId), patch));
}

describe('planBoundaryMetadataUpdate (#137)', () => {
    it('inserts $x, $y, $w and $h into a minimal subgraph statement', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const result = mutate(source, 'backend-boundary-0', { x: 100, y: 200, w: 400, h: 300 });
        assert.ok(result.includes('subgraph Backend $x="100", $y="200", $w="400", $h="300" {'));
    });

    it('updates existing boundary geometry values', () => {
        const source = 'graph TB\nsubgraph Backend $x="10", $y="20", $w="30", $h="40" {\n    Container(API, "API")\n}';
        const result = mutate(source, 'backend-boundary-0', { x: 100, y: 200, w: 400, h: 300 });
        assert.ok(result.includes('subgraph Backend $x="100", $y="200", $w="400", $h="300" {'));
    });

    it('coalesces new fields after existing metadata', () => {
        const source = 'graph TB\nsubgraph Backend $locked="true" {\n    Container(API, "API")\n}';
        const result = mutate(source, 'backend-boundary-0', { x: 50, y: 60 });
        assert.ok(result.includes('subgraph Backend $locked="true", $x="50", $y="60" {'));
    });

    it('is idempotent when the requested values are already present', () => {
        const source = 'graph TB\nsubgraph Backend $x="100", $y="200" {\n    Container(API, "API")\n}';
        const edits = planBoundaryMetadataUpdate(source, boundaryRef(source, 'backend-boundary-0'), { x: 100, y: 200 });
        assert.deepStrictEqual(edits, []);
    });

    it('rejects a stale source range', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const ref = boundaryRef(source, 'backend-boundary-0');
        const start = sourcePositionAt(source, 0);
        const end = sourcePositionAt(source, source.length);
        const staleRange = {
            start,
            end: { ...end, line: end.line + 10, column: 1 },
        };
        assert.throws(
            () => planBoundaryMetadataUpdate(source, { boundaryLabel: ref.boundaryLabel, range: staleRange }, { x: 1 }),
            StaleRangeError,
        );
    });

    it('rejects a range whose label does not match the target', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const ref = boundaryRef(source, 'backend-boundary-0');
        assert.throws(
            () => planBoundaryMetadataUpdate(source, { boundaryLabel: 'Frontend', range: ref.range }, { x: 1 }),
            StaleRangeError,
        );
    });

    it('rejects unsupported boundary syntax', () => {
        const source = 'graph TB\nContainer(API, "API")';
        assert.throws(
            () => planBoundaryMetadataUpdate(source, { boundaryLabel: 'Backend', range: { start: sourcePositionAt(source, 0), end: sourcePositionAt(source, source.length) } }, { x: 1 }),
            UnsupportedNativeSyntaxError,
        );
    });

    it('rejects non-finite and out-of-range coordinates', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const ref = boundaryRef(source, 'backend-boundary-0');
        for (const patch of [
            { x: Number.NaN },
            { y: Number.POSITIVE_INFINITY },
            { w: -1_000_001 },
            { h: 1_000_001 },
        ]) {
            assert.throws(
                () => planBoundaryMetadataUpdate(source, ref, patch as { x?: number; y?: number; w?: number; h?: number }),
                InvalidMetadataPatchError,
            );
        }
    });

    it('rejects unsupported metadata keys', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const ref = boundaryRef(source, 'backend-boundary-0');
        assert.throws(
            () => planBoundaryMetadataUpdate(source, ref, { x: 1, locked: true } as { x?: number; y?: number; w?: number; h?: number }),
            InvalidMetadataPatchError,
        );
    });

    it('allows position-only and size-only patches independently', () => {
        const source = 'graph TB\nsubgraph Backend {\n    Container(API, "API")\n}';
        const positionOnly = mutate(source, 'backend-boundary-0', { x: 10, y: 20 });
        assert.ok(positionOnly.includes('subgraph Backend $x="10", $y="20" {'));

        const sizeOnly = mutate(source, 'backend-boundary-0', { w: 500, h: 400 });
        assert.ok(sizeOnly.includes('subgraph Backend $w="500", $h="400" {'));
    });
});
