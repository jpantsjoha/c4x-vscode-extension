/**
 * Unit tests for the dependency-free LCS line-diff utility.
 * Covers adds, removes, unchanged lines, and edge cases per issue #83 DoD.
 */

import * as assert from 'assert';
import {
    computeLineDiff,
    splitLines,
    diffHasChanges,
    DiffLine,
} from '../../writeback/lineDiff';

describe('splitLines', () => {
    it('returns empty array for empty string', () => {
        assert.deepStrictEqual(splitLines(''), []);
    });

    it('returns single element for a string with no newlines', () => {
        assert.deepStrictEqual(splitLines('hello'), ['hello']);
    });

    it('splits on LF', () => {
        assert.deepStrictEqual(splitLines('a\nb\nc'), ['a', 'b', 'c']);
    });

    it('normalises CRLF to LF before splitting', () => {
        assert.deepStrictEqual(splitLines('a\r\nb\r\nc'), ['a', 'b', 'c']);
    });

    it('does not emit a trailing empty line when source ends with newline', () => {
        assert.deepStrictEqual(splitLines('a\nb\n'), ['a', 'b']);
    });

    it('preserves blank lines that are not at the end', () => {
        assert.deepStrictEqual(splitLines('a\n\nb'), ['a', '', 'b']);
    });
});

describe('computeLineDiff — unchanged input', () => {
    it('returns all unchanged lines when inputs are identical', () => {
        const diff = computeLineDiff('Person(U, "User")\n', 'Person(U, "User")\n');
        assert.ok(diff.every(l => l.kind === 'unchanged'), 'Expected all unchanged');
    });

    it('returns empty array for two empty strings', () => {
        const diff = computeLineDiff('', '');
        assert.deepStrictEqual(diff, []);
    });
});

describe('computeLineDiff — additions', () => {
    it('marks lines that only appear in updated as added', () => {
        const original = 'Person(U, "User")\n';
        const updated = 'Person(U, "User")\nSoftwareSystem(S, "System")\n';
        const diff = computeLineDiff(original, updated);

        const added = diff.filter(l => l.kind === 'added');
        assert.strictEqual(added.length, 1);
        assert.ok(added[0].text.includes('SoftwareSystem'));
    });

    it('treats the full updated string as added when original is empty', () => {
        const diff = computeLineDiff('', 'line1\nline2\n');
        assert.ok(diff.length > 0);
        assert.ok(diff.every(l => l.kind === 'added'));
    });
});

describe('computeLineDiff — removals', () => {
    it('marks lines that only appear in original as removed', () => {
        const original = 'Person(U, "User")\nSoftwareSystem(S, "System")\n';
        const updated = 'Person(U, "User")\n';
        const diff = computeLineDiff(original, updated);

        const removed = diff.filter(l => l.kind === 'removed');
        assert.strictEqual(removed.length, 1);
        assert.ok(removed[0].text.includes('SoftwareSystem'));
    });

    it('treats the full original string as removed when updated is empty', () => {
        const diff = computeLineDiff('line1\nline2\n', '');
        assert.ok(diff.length > 0);
        assert.ok(diff.every(l => l.kind === 'removed'));
    });
});

describe('computeLineDiff — mixed adds and removes', () => {
    it('produces both added and removed lines for a label change', () => {
        const original = 'Person(Customer, "Customer")\nRel(Customer, S, "Uses")\n';
        const updated = 'Person(Customer, "Client")\nRel(Customer, S, "Uses")\n';
        const diff = computeLineDiff(original, updated);

        const added = diff.filter(l => l.kind === 'added');
        const removed = diff.filter(l => l.kind === 'removed');
        const unchanged = diff.filter(l => l.kind === 'unchanged');

        assert.strictEqual(added.length, 1);
        assert.strictEqual(removed.length, 1);
        assert.ok(added[0].text.includes('"Client"'));
        assert.ok(removed[0].text.includes('"Customer"'));
        assert.ok(unchanged.some(l => l.text.includes('Rel')));
    });

    it('unchanged lines are preserved when lines above and below change', () => {
        const original = 'A\nB\nC\n';
        const updated = 'X\nB\nY\n';
        const diff = computeLineDiff(original, updated);

        const unchanged = diff.filter(l => l.kind === 'unchanged');
        assert.ok(unchanged.some(l => l.text === 'B'), 'B should be unchanged');
    });
});

describe('computeLineDiff — edge cases', () => {
    it('handles single-line inputs correctly (one removed, one added)', () => {
        const diff = computeLineDiff('old line', 'new line');
        const added = diff.filter(l => l.kind === 'added');
        const removed = diff.filter(l => l.kind === 'removed');
        assert.strictEqual(added.length, 1);
        assert.strictEqual(removed.length, 1);
    });

    it('handles sources that only differ in trailing newline', () => {
        // Both should normalise to the same lines so diff has no changes
        const diff = computeLineDiff('abc\n', 'abc');
        // 'abc\n' → ['abc'], 'abc' → ['abc'] — identical after split
        assert.ok(diff.every(l => l.kind === 'unchanged'));
    });
});

describe('diffHasChanges', () => {
    it('returns false for all-unchanged diff', () => {
        const diff: DiffLine[] = [
            { kind: 'unchanged', text: 'a' },
            { kind: 'unchanged', text: 'b' },
        ];
        assert.strictEqual(diffHasChanges(diff), false);
    });

    it('returns true when at least one line is added', () => {
        const diff: DiffLine[] = [
            { kind: 'unchanged', text: 'a' },
            { kind: 'added', text: 'b' },
        ];
        assert.strictEqual(diffHasChanges(diff), true);
    });

    it('returns true when at least one line is removed', () => {
        const diff: DiffLine[] = [
            { kind: 'removed', text: 'a' },
        ];
        assert.strictEqual(diffHasChanges(diff), true);
    });

    it('returns false for an empty diff', () => {
        assert.strictEqual(diffHasChanges([]), false);
    });
});
