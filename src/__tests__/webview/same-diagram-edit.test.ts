import * as assert from 'assert';
import { isSameDiagramEdit, type SourceChange } from '../../webview/sameDiagramEdit';
import { findC4xFencedBlocksInSource } from '../../writeback/SaveAnchor';

/**
 * The host's decision that a source change stayed inside the diagram being
 * edited (#340 review 9). Edit mode continues only on `true`.
 */

const FENCE_A = '```c4x\ngraph TB\n    Container(api, "API", "Java", "Serves")\n    Container(db, "DB", "SQL", "Stores")\n```\n';
const FENCE_B = '```c4x\ngraph TB\n    Container(api, "API", "Java", "Serves")\n    Container(queue, "Queue", "MQ", "Buffers")\n```\n';
const DOC = `# Notes\n\nSome prose.\n\n${FENCE_A}\nMore prose.\n\n${FENCE_B}`;

/** Apply changes (offsets in the text before) and decide for the fence at `ordinal`. */
function decide(source: string, changes: SourceChange[], ordinal = 0): boolean {
    let after = source;
    for (const change of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
        after = after.slice(0, change.rangeOffset) + change.text + after.slice(change.rangeOffset + change.rangeLength);
    }
    return isSameDiagramEdit({
        native: false,
        beforeLength: source.length,
        fencesBefore: findC4xFencedBlocksInSource(source).map(b => b.bodyRange),
        fencesAfter: findC4xFencedBlocksInSource(after).map(b => b.bodyRange),
        ordinal,
        changes,
    });
}

const at = (needle: string, from = 0) => {
    const index = DOC.indexOf(needle, from);
    assert.ok(index >= 0, needle);
    return index;
};

describe('isSameDiagramEdit: did the change stay inside the diagram? (#340 review 9)', () => {
    it('an edit inside the fence body continues', () => {
        const offset = at('"Serves"');
        assert.strictEqual(decide(DOC, [{ rangeOffset: offset, rangeLength: 8, text: '"Serves requests"' }]), true);
    });
    it('an insertion at the start or end of the body continues (the delimiters are untouched)', () => {
        const body = findC4xFencedBlocksInSource(DOC)[0].bodyRange;
        assert.strictEqual(decide(DOC, [{ rangeOffset: body.start, rangeLength: 0, text: '%% note\n' }]), true);
        assert.strictEqual(decide(DOC, [{ rangeOffset: body.end, rangeLength: 0, text: '    Container(x, "X", "Go", "x")\n' }]), true);
    });
    it('a change touching the opening or closing delimiter ends it', () => {
        const opening = at('```c4x');
        assert.strictEqual(decide(DOC, [{ rangeOffset: opening, rangeLength: 6, text: '```c4x ' }]), false);
        const body = findC4xFencedBlocksInSource(DOC)[0].bodyRange;
        assert.strictEqual(decide(DOC, [{ rangeOffset: body.end - 1, rangeLength: 4, text: '\n``' }]), false);
    });
    it('an edit above the fence in the same change set ends it', () => {
        assert.strictEqual(decide(DOC, [
            { rangeOffset: at('Some prose'), rangeLength: 4, text: 'More' },
            { rangeOffset: at('"Serves"'), rangeLength: 8, text: '"Serves all"' },
        ]), false);
    });
    it('a two-range change with one range outside the fence ends it', () => {
        assert.strictEqual(decide(DOC, [
            { rangeOffset: at('"Serves"'), rangeLength: 8, text: '"S"' },
            { rangeOffset: at('More prose'), rangeLength: 4, text: 'Less' },
        ]), false);
    });
    it('swapping two fences that share element ids ends it', () => {
        const start = at('```c4x');
        const swapped = FENCE_B + '\nMore prose.\n\n' + FENCE_A;
        assert.strictEqual(decide(DOC, [{ rangeOffset: start, rangeLength: DOC.length - start, text: swapped }]), false);
    });
    it('a fence added above ends it', () => {
        assert.strictEqual(decide(DOC, [{ rangeOffset: at('Some prose'), rangeLength: 0, text: FENCE_B + '\n' }], 1), false);
    });
    it('a change that splits the fence (a new delimiter inside the body) ends it', () => {
        assert.strictEqual(decide(DOC, [{ rangeOffset: at('    Container(db'), rangeLength: 0, text: '```\n\n```c4x\n' }]), false);
    });
    it('an external change or revert that reports no content change ends it', () => {
        assert.strictEqual(decide(DOC, []), false);
        assert.strictEqual(isSameDiagramEdit({ native: true, beforeLength: 10, changes: [] }), false);
    });
    it('a .c4x document: an edit continues; a whole-document replacement (external reload) ends it', () => {
        assert.strictEqual(isSameDiagramEdit({ native: true, beforeLength: 100, changes: [{ rangeOffset: 40, rangeLength: 3, text: 'abc' }] }), true);
        assert.strictEqual(isSameDiagramEdit({ native: true, beforeLength: 100, changes: [{ rangeOffset: 0, rangeLength: 100, text: 'x' }] }), false);
    });
    it('without the fence list or a valid ordinal it ends', () => {
        assert.strictEqual(isSameDiagramEdit({ native: false, beforeLength: 10, changes: [{ rangeOffset: 1, rangeLength: 0, text: 'x' }] }), false);
        assert.strictEqual(decide(DOC, [{ rangeOffset: at('"Serves"'), rangeLength: 8, text: '"S"' }], 5), false);
    });
});
