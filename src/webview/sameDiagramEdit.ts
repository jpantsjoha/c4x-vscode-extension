/**
 * Did a source change stay inside the diagram being edited? (#340 review 9)
 *
 * The preview keeps the Visual C4 Editor's edit mode across a re-render only
 * when the host can prove, from the edit itself, that every change stayed
 * inside the diagram on screen. The webview never infers identity from the
 * diagram's content; it continues edit mode only with this host flag for the
 * render it receives.
 *
 * Pure and VS Code-free so the decision can be tested on its own.
 */

/** One content change, as `onDidChangeTextDocument` reports it (offsets in the text before the change). */
export interface SourceChange {
    readonly rangeOffset: number;
    readonly rangeLength: number;
    readonly text: string;
}

/** A diagram's body range in a document: the whole text, or one fence's body. */
export interface DiagramRange {
    readonly start: number;
    readonly end: number;
}

export interface SameDiagramEditInput {
    /** A standalone diagram file (.c4x): the whole document is the diagram. */
    readonly native: boolean;
    /** Length of the text before the change. */
    readonly beforeLength: number;
    /** For a Markdown panel: the c4x fence bodies before and after the change, in order. */
    readonly fencesBefore?: ReadonlyArray<DiagramRange>;
    readonly fencesAfter?: ReadonlyArray<DiagramRange>;
    /** For a Markdown panel: the ordinal of the fence the panel shows. */
    readonly ordinal?: number;
    readonly changes: ReadonlyArray<SourceChange>;
}

/**
 * True only when the change provably stayed inside the diagram:
 * - there is at least one content change (an external change or revert that
 *   reports none counts as another change);
 * - for a .c4x document, no change replaces the whole text (an external reload);
 * - for a Markdown fence, every changed range lies inside that fence's body
 *   (insertions at either end of the body included; nothing that touches the
 *   delimiter lines or any text outside), the fence still exists, and the number
 *   of c4x fences before it (its ordinal) and in the document is unchanged.
 * In every other case the change is treated as leaving the diagram.
 */
export function isSameDiagramEdit(input: SameDiagramEditInput): boolean {
    if (input.changes.length === 0) {
        return false;
    }
    if (input.native) {
        return !input.changes.some(change => change.rangeOffset === 0 && change.rangeLength >= input.beforeLength && input.beforeLength > 0);
    }
    const before = input.fencesBefore;
    const after = input.fencesAfter;
    const ordinal = input.ordinal;
    if (!before || !after || ordinal === undefined || ordinal < 0 || ordinal >= before.length || ordinal >= after.length) {
        return false;
    }
    if (before.length !== after.length) {
        return false;
    }
    const body = before[ordinal];
    return input.changes.every(change =>
        change.rangeOffset >= body.start && change.rangeOffset + change.rangeLength <= body.end);
}
