/**
 * Draft-scope identity for Markdown fences (#167 review, second round).
 *
 * A block ordinal is a position, not an identity: insert a fence above an
 * existing one and every later fence shifts, so an ordinal-scoped draft is
 * silently invalidated and collides with the different fence that moves into
 * its ordinal. `computeFenceDraftScope` derives the scope from the fence's own
 * content instead. These tests pin that behaviour against the exact scenarios
 * from the review:
 *
 *  1. A fence inserted above an existing one: the existing fence's scope does
 *     not change, and its draft cannot be claimed by the fence now sitting at
 *     its old ordinal.
 *  2. Two fences with identical content: the identity is ambiguous, and the
 *     draft is discarded rather than restored to either twin.
 *  3. A scope whose fence content no longer exists resolves to nothing.
 */

import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
    AMBIGUOUS_FENCE_SCOPE_MARKER,
    computeFenceDraftScope,
    computeNativeDraftScope,
} from '../../writeback/SaveAnchor';
import type { PersistedDraftState } from '../../webview/draftState';
import { isDraftStateForCurrentScope } from '../../webview/previewClientScript';

// ---------------------------------------------------------------------------
// Test helpers (same fake-document style as markdown-anchor.test.ts)
// ---------------------------------------------------------------------------

interface MutableDocument {
    document: vscode.TextDocument;
    setText(text: string): void;
}

function createDocument(uri: string, initialText: string): MutableDocument {
    let text = initialText;
    const document = {
        uri: { toString: () => uri },
        version: 1,
        getText: () => text,
    } as vscode.TextDocument;

    return {
        document,
        setText(nextText: string): void {
            text = nextText;
        },
    };
}

function c4xFence(source: string): string {
    return `\`\`\`c4x\n${source}\n\`\`\`\n`;
}

function draftForScope(scope: string): PersistedDraftState {
    return {
        schemaVersion: 2,
        scope,
        editMode: false,
        selectedNodeId: null,
        stagedEdits: [{ id: 'Alpha', x: 10, y: 20 }],
        zoom: 1.4,
        panX: 30,
        panY: -15,
    };
}

const FENCE_A = 'graph TB\nPerson(Alpha, "Alpha")';
const FENCE_B = 'graph TB\nPerson(Beta, "Beta")';

// ---------------------------------------------------------------------------
// Stable identity across insertion, removal and reordering
// ---------------------------------------------------------------------------

describe('computeFenceDraftScope — content identity, not position (#167 review)', () => {
    it('keeps a fence\'s scope stable when a fence is inserted above it', () => {
        const doc = createDocument('file:///arch.md', c4xFence(FENCE_A));
        const scopeBefore = computeFenceDraftScope(doc.document, 0);
        assert.ok(scopeBefore, 'scope resolves for the only fence');

        // Insert a DIFFERENT fence above: the target shifts from ordinal 0 to 1.
        doc.setText(c4xFence(FENCE_B) + '\nProse.\n\n' + c4xFence(FENCE_A));
        const scopeAfter = computeFenceDraftScope(doc.document, 1);

        assert.strictEqual(scopeAfter, scopeBefore,
            'the surviving fence keeps its identity at its new ordinal');
    });

    it('gives the inserted fence a different scope than the shifted one', () => {
        const doc = createDocument(
            'file:///arch2.md',
            c4xFence(FENCE_B) + '\nProse.\n\n' + c4xFence(FENCE_A),
        );
        const scopeInserted = computeFenceDraftScope(doc.document, 0);
        const scopeShifted = computeFenceDraftScope(doc.document, 1);
        assert.ok(scopeInserted && scopeShifted);
        assert.notStrictEqual(scopeInserted, scopeShifted);
    });

    it('contains no ordinal: the marker is the content-identity form', () => {
        const doc = createDocument('file:///arch3.md', c4xFence(FENCE_A));
        const scope = computeFenceDraftScope(doc.document, 0);
        assert.ok(scope);
        assert.ok(scope.startsWith('file:///arch3.md#c4x-fence:'), `unexpected scope shape: ${scope}`);
        assert.ok(!scope.includes('c4x-block'), 'the positional ordinal form is gone');
    });

    it('scopes identical content in different documents to different identities', () => {
        const doc1 = createDocument('file:///one.md', c4xFence(FENCE_A));
        const doc2 = createDocument('file:///two.md', c4xFence(FENCE_A));
        assert.notStrictEqual(
            computeFenceDraftScope(doc1.document, 0),
            computeFenceDraftScope(doc2.document, 0),
        );
    });

    it('changes the scope when the fence body is edited, so a stale binding resolves to nothing', () => {
        const doc = createDocument('file:///arch4.md', c4xFence(FENCE_A));
        const scopeBefore = computeFenceDraftScope(doc.document, 0);
        doc.setText(c4xFence(FENCE_A + '\nSoftwareSystem(Portal, "Portal")'));
        const scopeAfter = computeFenceDraftScope(doc.document, 0);
        assert.ok(scopeBefore && scopeAfter);
        assert.notStrictEqual(scopeBefore, scopeAfter,
            'a draft bound to the old content must not restore onto edited content');
    });

    it('returns undefined when the ordinal no longer resolves to any fence', () => {
        const doc = createDocument('file:///arch5.md', c4xFence(FENCE_A));
        doc.setText('# No diagrams here.\n');
        assert.strictEqual(computeFenceDraftScope(doc.document, 0), undefined);
    });
});

// ---------------------------------------------------------------------------
// The reviewer's collision scenario, end to end through the restore guard
// ---------------------------------------------------------------------------

describe('fence draft scope — insertion cannot steal a draft (#167 review)', () => {
    it('a draft restores to the right fence after an insertion above, and to no other', () => {
        const doc = createDocument('file:///steal.md', c4xFence(FENCE_A));
        const scopeA = computeFenceDraftScope(doc.document, 0);
        assert.ok(scopeA);
        // The draft is persisted while fence A sits at ordinal 0.
        const draft = draftForScope(scopeA);

        // A new fence is inserted above; A moves to ordinal 1.
        doc.setText(c4xFence(FENCE_B) + '\nProse.\n\n' + c4xFence(FENCE_A));

        const scopeNow0 = computeFenceDraftScope(doc.document, 0); // the inserted fence
        const scopeNow1 = computeFenceDraftScope(doc.document, 1); // fence A, shifted
        assert.ok(scopeNow0 && scopeNow1);

        assert.strictEqual(isDraftStateForCurrentScope(draft, scopeNow1), true,
            'the existing fence\'s draft still restores to it at its new ordinal');
        assert.strictEqual(isDraftStateForCurrentScope(draft, scopeNow0), false,
            'the fence that moved into the old ordinal must NOT inherit the draft');
    });
});

// ---------------------------------------------------------------------------
// Identical fences: ambiguous identity discards the draft
// ---------------------------------------------------------------------------

describe('fence draft scope — identical fences are ambiguous (#167 review)', () => {
    it('stamps both twins with the ambiguous marker', () => {
        const doc = createDocument(
            'file:///twins.md',
            c4xFence(FENCE_A) + '\nProse.\n\n' + c4xFence(FENCE_A),
        );
        const scope0 = computeFenceDraftScope(doc.document, 0);
        const scope1 = computeFenceDraftScope(doc.document, 1);
        assert.ok(scope0 && scope1);
        assert.strictEqual(scope0, scope1, 'identical content yields one identity');
        assert.ok(scope0.includes(AMBIGUOUS_FENCE_SCOPE_MARKER),
            `expected the ambiguous marker in ${scope0}`);
    });

    it('the restore guard discards an ambiguous binding rather than guessing a twin', () => {
        const doc = createDocument(
            'file:///twins2.md',
            c4xFence(FENCE_A) + '\nProse.\n\n' + c4xFence(FENCE_A),
        );
        const ambiguousScope = computeFenceDraftScope(doc.document, 0);
        assert.ok(ambiguousScope);
        // Even a draft persisted under exactly this scope must not restore:
        // the binding does not resolve to exactly one fence.
        const draft = draftForScope(ambiguousScope);
        assert.strictEqual(isDraftStateForCurrentScope(draft, ambiguousScope), false);
        assert.strictEqual(
            isDraftStateForCurrentScope(draft, computeFenceDraftScope(doc.document, 1)),
            false,
        );
    });

    it('becomes unambiguous again once the twins diverge', () => {
        const doc = createDocument(
            'file:///twins3.md',
            c4xFence(FENCE_A) + '\nProse.\n\n' + c4xFence(FENCE_A),
        );
        doc.setText(c4xFence(FENCE_A) + '\nProse.\n\n' + c4xFence(FENCE_B));
        const scope0 = computeFenceDraftScope(doc.document, 0);
        const scope1 = computeFenceDraftScope(doc.document, 1);
        assert.ok(scope0 && scope1);
        assert.ok(!scope0.includes(AMBIGUOUS_FENCE_SCOPE_MARKER));
        assert.ok(!scope1.includes(AMBIGUOUS_FENCE_SCOPE_MARKER));
        assert.notStrictEqual(scope0, scope1);
    });
});

describe('native and formatted-source draft identity (#186)', () => {
    it('rejects old native edits when content changes while element ids stay the same', () => {
        const native = createDocument('file:///same.c4x', 'C4Context\nPerson(Alpha, "Original")\n');
        const first = computeNativeDraftScope(native.document);
        native.setText('C4Context\nPerson(Alpha, "Replacement")\n');
        assert.notStrictEqual(computeNativeDraftScope(native.document), first);
        assert.strictEqual(isDraftStateForCurrentScope(draftForScope(first), computeNativeDraftScope(native.document)), false);
    });
    it('treats whitespace changes as a source change for both native files and fences', () => {
        const native = createDocument('file:///same.c4x', 'C4Context\nPerson(Alpha, "A")\n');
        const before = computeNativeDraftScope(native.document);
        native.setText('C4Context\n  Person(Alpha, "A")\n');
        assert.notStrictEqual(computeNativeDraftScope(native.document), before);
        const markdown = createDocument('file:///same.md', c4xFence('C4Context\nPerson(Alpha, "A")'));
        const fenceBefore = computeFenceDraftScope(markdown.document, 0);
        markdown.setText(c4xFence('C4Context\n  Person(Alpha, "A")'));
        assert.notStrictEqual(computeFenceDraftScope(markdown.document, 0), fenceBefore);
    });
});
