import * as assert from 'assert';

/**
 * Regression guard for a data-loss path in "C4X: Generate Diagram Here".
 *
 * `TextEditor.insertSnippet(snippet)` with no location targets the editor's
 * current selections and REPLACES them. The folder-mode branch called it that
 * way, so generating a diagram while any text was selected deleted that text.
 * Generation must only ever add to a document.
 *
 * This pins the decision itself, which is the part that was wrong. The VS Code
 * API call is exercised in the Extension Host suite.
 */

interface Selection {
    isEmpty: boolean;
    active: string;
    end: string;
}

/** The insertion point chosen by GenerateDiagramCommand. */
function chooseInsertPosition(mode: 'selection' | 'folder', selection: Selection): string {
    return mode === 'selection'
        ? selection.end
        : (selection.isEmpty ? selection.active : selection.end);
}

describe('generate diagram insert position', () => {
    it('never returns undefined, which would replace the selection', () => {
        const cases: Array<['selection' | 'folder', Selection]> = [
            ['selection', { isEmpty: true, active: 'cursor', end: 'selEnd' }],
            ['selection', { isEmpty: false, active: 'cursor', end: 'selEnd' }],
            ['folder', { isEmpty: true, active: 'cursor', end: 'selEnd' }],
            ['folder', { isEmpty: false, active: 'cursor', end: 'selEnd' }],
        ];
        for (const [mode, selection] of cases) {
            const position = chooseInsertPosition(mode, selection);
            assert.ok(position !== undefined, `${mode} with isEmpty=${selection.isEmpty} must pick a position`);
        }
    });

    it('inserts after a non-empty selection rather than over it', () => {
        assert.strictEqual(chooseInsertPosition('folder', { isEmpty: false, active: 'cursor', end: 'selEnd' }), 'selEnd');
        assert.strictEqual(chooseInsertPosition('selection', { isEmpty: false, active: 'cursor', end: 'selEnd' }), 'selEnd');
    });

    it('inserts at the cursor when nothing is selected', () => {
        assert.strictEqual(chooseInsertPosition('folder', { isEmpty: true, active: 'cursor', end: 'cursor' }), 'cursor');
    });
});
