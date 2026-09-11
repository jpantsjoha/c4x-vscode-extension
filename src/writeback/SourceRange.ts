/**
 * Stable source-range types for the native C4X syntax writeback pipeline.
 *
 * All positions are expressed against the *original* source text as the user
 * typed it, before any parser preprocessing (graph-directive injection, etc.).
 * Offsets are 0-based JavaScript/VS Code UTF-16 code-unit offsets; line and
 * column are 1-based. This matches Peggy's `location()` offsets and can be
 * converted losslessly to VS Code `Position` values (after subtracting one
 * from line and column).
 */

/** A single character position in the source file. */
export interface SourcePosition {
    readonly offset: number;
    readonly line: number;
    readonly column: number;
}

/** Half-open [start, end) UTF-16 code-unit span in the original source. */
export interface SourceRange {
    readonly start: SourcePosition;
    readonly end: SourcePosition;
}

/**
 * Stable opaque identifier for a model entity's source location.
 * Format: "<kind>:<parts…>"
 *   element:WebApp
 *   rel:User:System:0
 *   boundary:banking:0
 */
export type SourceId = string;

export function makeSourceId(kind: 'element' | 'rel' | 'boundary', ...parts: string[]): SourceId {
    return `${kind}:${parts.join(':')}`;
}

/** Returns true when range is well-formed and its offsets fit within sourceLength. */
export function isValidRange(range: SourceRange, sourceLength: number): boolean {
    return (
        Number.isInteger(sourceLength) &&
        sourceLength >= 0 &&
        Number.isInteger(range.start.offset) &&
        Number.isInteger(range.end.offset) &&
        Number.isInteger(range.start.line) &&
        Number.isInteger(range.start.column) &&
        Number.isInteger(range.end.line) &&
        Number.isInteger(range.end.column) &&
        range.start.line >= 1 &&
        range.start.column >= 1 &&
        range.end.line >= 1 &&
        range.end.column >= 1 &&
        range.start.offset >= 0 &&
        range.end.offset >= range.start.offset &&
        range.end.offset <= sourceLength
    );
}

/** Convert an absolute UTF-16 code-unit offset to a 1-based source position. */
export function sourcePositionAt(source: string, offset: number): SourcePosition {
    if (!Number.isInteger(offset) || offset < 0 || offset > source.length) {
        throw new RangeError(`Offset ${offset} is outside source length ${source.length}`);
    }

    let line = 1;
    let column = 1;
    for (let i = 0; i < offset; i++) {
        if (source.charAt(i) === '\n') {
            line++;
            column = 1;
        } else {
            column++;
        }
    }
    return { offset, line, column };
}

/**
 * Verify that both offsets and their cached line/column values still describe
 * the supplied source. This catches shifted ranges before a writer can touch a
 * different statement.
 */
export function isRangeConsistentWithSource(source: string, range: SourceRange): boolean {
    if (!isValidRange(range, source.length)) {
        return false;
    }

    const start = sourcePositionAt(source, range.start.offset);
    const end = sourcePositionAt(source, range.end.offset);
    return (
        start.line === range.start.line &&
        start.column === range.start.column &&
        end.line === range.end.line &&
        end.column === range.end.column
    );
}

/**
 * A single bounded text edit expressed against source offsets.
 * Consumers may convert these directly to vscode.WorkspaceEdit TextEdits.
 */
export interface BoundedTextEdit {
    readonly range: SourceRange;
    readonly newText: string;
}

/**
 * Validates that bounded edits do not overlap or share a start offset.
 * Throws RangeError when edits cannot be applied deterministically.
 */
export function validateEditsForOverlap(edits: readonly BoundedTextEdit[]): void {
    const sorted = edits
        .map((edit, index) => ({ edit, index }))
        .sort((a, b) => {
            const byStart = a.edit.range.start.offset - b.edit.range.start.offset;
            if (byStart !== 0) { return byStart; }

            const byEnd = a.edit.range.end.offset - b.edit.range.end.offset;
            if (byEnd !== 0) { return byEnd; }

            return a.index - b.index;
        });

    let previous: SourceRange | undefined;
    for (const { edit } of sorted) {
        const current = edit.range;
        if (!previous) {
            previous = current;
            continue;
        }
        if (current.start.offset === previous.start.offset) {
            throw new RangeError(
                `Ambiguous same-offset edits detected at offset ${current.start.offset}`
            );
        }
        if (current.start.offset < previous.end.offset) {
            throw new RangeError(
                `Overlapping edits detected at offsets ` +
                `${previous.start.offset}–${previous.end.offset} and ` +
                `${current.start.offset}–${current.end.offset}`
            );
        }
        previous = current;
    }
}

/**
 * Apply a list of non-overlapping edits to source text.
 * Edits are applied in descending offset order so earlier positions remain stable.
 * Throws RangeError for out-of-bounds or overlapping edits.
 */
export function applyBoundedEdits(source: string, edits: readonly BoundedTextEdit[]): string {
    validateEditsForOverlap(edits);
    const sorted = edits
        .map((edit, index) => ({ edit, index }))
        .sort((a, b) => {
            const byStart = b.edit.range.start.offset - a.edit.range.start.offset;
            if (byStart !== 0) { return byStart; }

            const byEnd = b.edit.range.end.offset - a.edit.range.end.offset;
            if (byEnd !== 0) { return byEnd; }

            return b.index - a.index;
        });
    let result = source;
    for (const { edit } of sorted) {
        if (!isRangeConsistentWithSource(source, edit.range)) {
            throw new RangeError(
                `Edit [${edit.range.start.offset}, ${edit.range.end.offset}) is invalid or stale ` +
                `for source length ${source.length}`
            );
        }
        result =
            result.slice(0, edit.range.start.offset) +
            edit.newText +
            result.slice(edit.range.end.offset);
    }
    return result;
}
