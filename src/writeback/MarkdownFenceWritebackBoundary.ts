/**
 * Markdown fence writeback boundary.
 *
 * Wraps the default VS Code writeback boundary to translate body-relative
 * edit offsets into document-absolute offsets before applying them.
 *
 * The mutation planners (NativeMutationPlanner) work on the fenced-block body
 * text only and produce offsets relative to that body slice.  This boundary
 * shifts each edit's start and end by `bodyStart` before applying the
 * WorkspaceEdit, so the final WorkspaceEdit targets only the fence slice of
 * the .md document — leaving all other Markdown bytes untouched.
 *
 * All other boundary operations (sidecar, undo, persistence mode) delegate
 * unchanged to the inner boundary.
 */
import type { BoundedTextEdit } from './SourceRange';
import { sourcePositionAt } from './SourceRange';
import type {
    WritebackDocument,
    WritebackTransactionBoundary,
} from './VscodeWritebackBoundary';

/**
 * Creates a writeback boundary that shifts body-relative edit offsets by
 * `bodyStart` so they address the correct byte range inside the outer
 * Markdown document.
 *
 * @param inner   The default VS Code boundary that will actually apply the edit.
 * @param bodyStart  The character offset of the first character of the fence
 *                   body within the full Markdown document.
 * @param absoluteDocument  A document view exposing the FULL Markdown text
 *                   with absolute position lookup (typically the real
 *                   TextDocument). Required because the call-site `document`
 *                   is the panel's virtual body view, whose text ends at the
 *                   fence boundary — absolute positions cannot be computed
 *                   from it (#100 UAT: every Markdown save threw RangeError).
 */
export function createMarkdownFenceWritebackBoundary(
    inner: WritebackTransactionBoundary,
    bodyStart: number,
    absoluteDocument: WritebackDocument,
): WritebackTransactionBoundary {
    return {
        // Sidecar / config operations: delegate directly.
        getLayoutPersistenceMode: () => inner.getLayoutPersistenceMode(),
        getWorkspaceFolder: uri => inner.getWorkspaceFolder(uri),
        getWorkspaceFolders: () => inner.getWorkspaceFolders(),
        readFile: uri => inner.readFile(uri),
        writeFile: (uri, content) => inner.writeFile(uri, content),
        deleteFile: uri => inner.deleteFile(uri),
        joinPath: (base, ...paths) => inner.joinPath(base, ...paths),
        file: filePath => inner.file(filePath),
        getWorkingDirectory: () => inner.getWorkingDirectory(),
        undo: () => inner.undo(),

        /**
         * Re-bases each edit's start/end offsets by `bodyStart` so they
         * address the fenced body inside the full Markdown document, then
         * applies the WorkspaceEdit through the inner boundary against the
         * absolute document (never the virtual body view).
         */
        applyBoundedEdits: async (_document: WritebackDocument, edits: readonly BoundedTextEdit[]): Promise<boolean> => {
            const fullText = absoluteDocument.getText();
            const rebased: BoundedTextEdit[] = edits.map(edit => {
                const absoluteStart = edit.range.start.offset + bodyStart;
                const absoluteEnd = edit.range.end.offset + bodyStart;
                return {
                    range: {
                        start: sourcePositionAt(fullText, absoluteStart),
                        end: sourcePositionAt(fullText, absoluteEnd),
                    },
                    newText: edit.newText,
                };
            });
            return inner.applyBoundedEdits(absoluteDocument, rebased);
        },
    };
}
