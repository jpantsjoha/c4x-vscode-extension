/**
 * Stale-range content guard (BUG-1).
 *
 * `isRangeConsistentWithSource` verifies only that a range's offsets still
 * agree with their cached line/column values. That is geometry, not identity:
 * a rewrite that preserves length — `Person(a, "A")` becoming `Person(x, "X")`
 * — leaves every offset, line and column intact and sails through the check.
 * A planner anchored on that range then edits the wrong statement.
 *
 * Two guards close it, because the two anchor kinds differ:
 *
 *   - Element refs carry a real declaration identifier, so the planner can
 *     re-derive identity from the statement it just parsed.
 *   - Relationship refs carry a synthetic id (`rel-0`) that appears nowhere in
 *     the source, so identity cannot be re-derived. Those rely on the optional
 *     `expectedText` captured alongside the range.
 *
 * These cases exercise planners already shipped on `main`, so they document
 * live exposure rather than a defect confined to one unreleased feature.
 */
import * as assert from 'assert';
import {
    planMetadataUpdate,
    planMetadataReset,
    planRelationshipLabelUpdate,
    planRelationshipTechnologyUpdate,
    planRelationshipTypeUpdate,
    planRelationshipEndpointUpdate,
    StaleRangeError,
    NativeElementSourceRef,
} from '../../writeback/NativeMutationPlanner';
import { sourcePositionAt, isRangeConsistentWithSource, SourceRange } from '../../writeback/SourceRange';

function rangeOf(source: string, statement: string): SourceRange {
    const start = source.indexOf(statement);
    assert.ok(start >= 0, `statement not found in source: ${statement}`);
    return {
        start: sourcePositionAt(source, start),
        end: sourcePositionAt(source, start + statement.length),
    };
}

function refFor(source: string, statement: string, elementId: string, pinContent = true): NativeElementSourceRef {
    const range = rangeOf(source, statement);
    return pinContent
        ? { elementId, range, expectedText: statement }
        : { elementId, range };
}

describe('stale-range content guard (BUG-1)', () => {
    describe('the gap this closes', () => {
        it('geometry alone cannot detect a same-length rewrite', () => {
            // The premise of the whole fix. If this ever starts failing,
            // isRangeConsistentWithSource has grown a content check and these
            // guards may be redundant.
            const before = 'graph TB\nPerson(a, "A")\n';
            const after = 'graph TB\nPerson(x, "X")\n';
            const range = rangeOf(before, 'Person(a, "A")');
            assert.strictEqual(before.length, after.length);
            assert.strictEqual(isRangeConsistentWithSource(after, range), true);
        });
    });

    describe('element-anchored planners re-derive identity', () => {
        const before = 'graph TB\nPerson(a, "A")\n';
        const after = 'graph TB\nPerson(x, "X")\n';

        it('planMetadataUpdate rejects a range that now declares a different element', () => {
            const ref = refFor(before, 'Person(a, "A")', 'a', false);
            assert.throws(
                () => planMetadataUpdate(after, ref, { x: 10, y: 20 }),
                (error: unknown) => error instanceof StaleRangeError && /now points to "x"/.test(String(error)),
            );
        });

        it('planMetadataReset rejects a range that now declares a different element', () => {
            const withMetadata = 'graph TB\nPerson(a, "A", $x=1, $y=2)\n';
            const rewritten = 'graph TB\nPerson(z, "Z", $x=1, $y=2)\n';
            const ref = refFor(withMetadata, 'Person(a, "A", $x=1, $y=2)', 'a', false);
            assert.strictEqual(withMetadata.length, rewritten.length);
            assert.throws(
                () => planMetadataReset(rewritten, ref),
                (error: unknown) => error instanceof StaleRangeError && /now points to "z"/.test(String(error)),
            );
        });

        it('still plans normally when the element is unchanged', () => {
            const ref = refFor(before, 'Person(a, "A")', 'a', false);
            const edits = planMetadataUpdate(before, ref, { x: 10, y: 20 });
            assert.ok(edits.length > 0);
        });
    });

    describe('relationship-anchored planners rely on expectedText', () => {
        // Synthetic ids (rel-0) appear nowhere in the source, so a relationship
        // range can only be re-verified against the text captured with it.
        const before = 'graph TB\na -->|Uses| b\nc -->|Calls| d\n';
        const rewritten = 'graph TB\na -->|Uses| b\nc -->|Talks| d\n';

        it('planRelationshipLabelUpdate rejects a mutated anchor', () => {
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1');
            assert.throws(
                () => planRelationshipLabelUpdate(rewritten, ref, 'Reads'),
                (error: unknown) => error instanceof StaleRangeError &&
                    /no longer matches the source text captured with its range/.test(String(error)),
            );
        });

        it('planRelationshipTechnologyUpdate rejects a mutated anchor', () => {
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1');
            assert.throws(
                () => planRelationshipTechnologyUpdate(rewritten, ref, 'HTTP'),
                StaleRangeError,
            );
        });

        it('planRelationshipTypeUpdate rejects a mutated anchor', () => {
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1');
            assert.throws(
                () => planRelationshipTypeUpdate(rewritten, ref, 'async'),
                StaleRangeError,
            );
        });

        it('planRelationshipEndpointUpdate rejects a mutated anchor', () => {
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1');
            assert.throws(
                () => planRelationshipEndpointUpdate(rewritten, ref, 'to', 'e'),
                StaleRangeError,
            );
        });

        it('still plans normally when the anchored statement is unchanged', () => {
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1');
            const edits = planRelationshipLabelUpdate(before, ref, 'Reads');
            assert.strictEqual(edits.length, 1);
        });

        it('stays backward compatible when no expectedText is supplied', () => {
            // Existing callers that have not been migrated keep the old
            // geometry-only behaviour rather than breaking.
            const ref = refFor(before, 'c -->|Calls| d', 'rel-1', false);
            const edits = planRelationshipLabelUpdate(before, ref, 'Reads');
            assert.strictEqual(edits.length, 1);
        });
    });
});
