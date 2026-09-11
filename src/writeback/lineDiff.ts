/**
 * Dependency-free LCS-based line diff utility.
 *
 * Computes a unified, line-level diff between two strings using a pure
 * Myers-LCS algorithm. The implementation is intentionally small and has
 * no runtime dependencies so it can run in both the extension host and
 * (via compiled output) in a sandboxed webview environment.
 *
 * Exported for unit testing and for the draft-materialisation diff path.
 */

export type DiffLineKind = 'unchanged' | 'added' | 'removed';

export interface DiffLine {
    readonly kind: DiffLineKind;
    readonly text: string;
}

/**
 * Compute the longest common subsequence of two arrays using a simple
 * O(n·m) DP table. Returns the length of the LCS, not the sequence itself.
 * Only called on arrays small enough to fit in typical JS heap.
 */
function lcsLength(a: readonly string[], b: readonly string[]): number[][] {
    const m = a.length;
    const n = b.length;
    // Allocate (m+1) × (n+1) table
    const table: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            if (a[i - 1] === b[j - 1]) {
                table[i][j] = table[i - 1][j - 1] + 1;
            } else {
                table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
            }
        }
    }
    return table;
}

/**
 * Back-trace the LCS DP table to produce a diff sequence.
 * Produces removed lines first at each divergence point, then added lines,
 * which follows the convention used by unified diff.
 */
function backtrack(
    table: number[][],
    a: readonly string[],
    b: readonly string[],
    i: number,
    j: number,
    result: DiffLine[],
): void {
    if (i === 0 && j === 0) {
        return;
    }
    if (i === 0) {
        backtrack(table, a, b, i, j - 1, result);
        result.push({ kind: 'added', text: b[j - 1] });
    } else if (j === 0) {
        backtrack(table, a, b, i - 1, j, result);
        result.push({ kind: 'removed', text: a[i - 1] });
    } else if (a[i - 1] === b[j - 1]) {
        backtrack(table, a, b, i - 1, j - 1, result);
        result.push({ kind: 'unchanged', text: a[i - 1] });
    } else if (table[i - 1][j] >= table[i][j - 1]) {
        backtrack(table, a, b, i - 1, j, result);
        result.push({ kind: 'removed', text: a[i - 1] });
    } else {
        backtrack(table, a, b, i, j - 1, result);
        result.push({ kind: 'added', text: b[j - 1] });
    }
}

/** Maximum lines supported before the diff falls back to a single change entry. */
const MAX_DIFF_LINES = 2_000;

/**
 * Compute a line-level diff between two source strings.
 *
 * Returns an array of `DiffLine` entries describing unchanged, added, and
 * removed lines in document order.
 *
 * - Empty inputs produce an empty diff array.
 * - When either input exceeds MAX_DIFF_LINES, a single synthetic entry is
 *   returned indicating the diff was too large to display inline.
 */
export function computeLineDiff(original: string, updated: string): DiffLine[] {
    if (original === updated) {
        // Fast path: no change
        return splitLines(original).map(text => ({ kind: 'unchanged', text }));
    }

    const aLines = splitLines(original);
    const bLines = splitLines(updated);

    if (aLines.length > MAX_DIFF_LINES || bLines.length > MAX_DIFF_LINES) {
        return [{ kind: 'added', text: '(diff too large to display)' }];
    }

    if (aLines.length === 0 && bLines.length === 0) {
        return [];
    }

    if (aLines.length === 0) {
        return bLines.map(text => ({ kind: 'added', text }));
    }

    if (bLines.length === 0) {
        return aLines.map(text => ({ kind: 'removed', text }));
    }

    const table = lcsLength(aLines, bLines);
    const result: DiffLine[] = [];
    backtrack(table, aLines, bLines, aLines.length, bLines.length, result);
    return result;
}

/**
 * Split a source string into lines. Preserves empty trailing lines only when
 * the source ends with a newline (consistent with how editors count lines).
 * CRLF line endings are normalised to LF before splitting.
 */
export function splitLines(source: string): string[] {
    if (source.length === 0) {
        return [];
    }
    const normalised = source.replace(/\r\n/g, '\n');
    const lines = normalised.split('\n');
    // When the source ends with '\n', split produces a trailing empty string.
    // Remove it so line counts match editor expectations.
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}

/**
 * Returns true when the diff contains at least one added or removed line.
 * Unchanged-only diffs indicate no effective change.
 */
export function diffHasChanges(diff: readonly DiffLine[]): boolean {
    return diff.some(line => line.kind !== 'unchanged');
}
