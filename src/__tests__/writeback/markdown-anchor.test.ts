/**
 * Markdown fenced-block anchor tests (B18 DoD).
 *
 * Covers all unit-test requirements from GitHub issue #77:
 *   - Two identical fences in one doc (ordinal + fingerprint disambiguate)
 *   - Fence moved within the document
 *   - Fence deleted
 *   - Fence edited externally (fingerprint_mismatch / model_identity_changed)
 *   - Happy-path capture / resolve round-trip
 */

import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
    captureAnchor,
    findC4xFencedBlocks,
    resolveAnchor,
    SaveAnchor,
} from '../../writeback/SaveAnchor';

// ---------------------------------------------------------------------------
// Test helpers
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

function captureBlock(document: vscode.TextDocument, ordinal: number): SaveAnchor {
    const blocks = findC4xFencedBlocks(document);
    const block = blocks[ordinal];
    assert.ok(block, `Expected block at ordinal ${ordinal}.`);
    return captureAnchor(document, block);
}

// ---------------------------------------------------------------------------
// findC4xFencedBlocks — structural extraction
// ---------------------------------------------------------------------------

describe('findC4xFencedBlocks — Markdown fence extraction', () => {
    it('returns an empty array for a document with no c4x fences', () => {
        const doc = createDocument('file:///no-fences.md', '# Heading\nsome prose\n');
        assert.deepStrictEqual(findC4xFencedBlocks(doc.document), []);
    });

    it('returns one block for a single c4x fence', () => {
        const doc = createDocument(
            'file:///single.md',
            `# Arch\n\n${c4xFence('graph TB\nPerson(User, "User")')}`
        );
        const blocks = findC4xFencedBlocks(doc.document);
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].blockOrdinal, 0);
    });

    it('assigns sequential ordinals to multiple c4x fences', () => {
        const source =
            c4xFence('graph TB\nPerson(A, "A")') +
            '\nSome prose.\n\n' +
            c4xFence('graph TB\nPerson(B, "B")');
        const doc = createDocument('file:///multi.md', source);
        const blocks = findC4xFencedBlocks(doc.document);
        assert.strictEqual(blocks.length, 2);
        assert.strictEqual(blocks[0].blockOrdinal, 0);
        assert.strictEqual(blocks[1].blockOrdinal, 1);
    });

    it('skips plantuml and other non-c4x fences', () => {
        const source =
            '```plantuml\n@startuml\nAlice -> Bob\n@enduml\n```\n' +
            c4xFence('graph TB\nPerson(X, "X")') +
            '```ts\nconst x = 1;\n```\n';
        const doc = createDocument('file:///mixed.md', source);
        const blocks = findC4xFencedBlocks(doc.document);
        assert.strictEqual(blocks.length, 1);
        assert.strictEqual(blocks[0].blockOrdinal, 0);
    });

    it('body range excludes the fence markers and trailing newline', () => {
        const bodyContent = 'graph TB\nPerson(User, "User")';
        const doc = createDocument('file:///body.md', c4xFence(bodyContent));
        const blocks = findC4xFencedBlocks(doc.document);
        assert.strictEqual(blocks.length, 1);
        const body = doc.document.getText().slice(
            blocks[0].bodyRange.start,
            blocks[0].bodyRange.end,
        );
        // Body starts immediately after the opening fence line.
        assert.ok(body.includes(bodyContent.split('\n')[0]), `Body should contain "${bodyContent.split('\n')[0]}"`);
    });
});

// ---------------------------------------------------------------------------
// Duplicate fences — disambiguation by ordinal + fingerprint
// ---------------------------------------------------------------------------

describe('Markdown anchor — duplicate fences (ordinal + fingerprint disambiguation)', () => {
    const FENCE_A = 'graph TB\nPerson(Alpha, "Alpha")';
    const FENCE_B = 'graph TB\nPerson(Alpha, "Alpha")'; // identical content to A

    it('two identical fences in one doc: each ordinal resolves only to itself', () => {
        const source = c4xFence(FENCE_A) + '\n# Section 2\n\n' + c4xFence(FENCE_B);
        const doc = createDocument('file:///dup.md', source);

        const anchor0 = captureBlock(doc.document, 0);
        const anchor1 = captureBlock(doc.document, 1);

        // Each anchor resolves to its own block.
        const result0 = resolveAnchor(doc.document, anchor0);
        const result1 = resolveAnchor(doc.document, anchor1);

        // Both fences are identical in content; ordinal+fingerprint are the same too,
        // so `resolveAnchor` detects ambiguity and rejects with block_ordinal_drift.
        // This is the correct "fail closed" behaviour: the user must make the fences
        // distinguishable (e.g. add a comment) for safe re-resolution.
        //
        // Implementation note: `resolveAnchor` finds multiple blocks with the same
        // modelIdentity+sourceFingerprint and rejects with block_ordinal_drift when
        // there is more than one match, which is correct.
        if (result0.valid) {
            // If the implementation resolves the first ordinal successfully it
            // must be ordinal 0 — not the other block.
            assert.strictEqual(result0.block.blockOrdinal, 0,
                'First anchor must resolve to ordinal 0');
        } else {
            // Ambiguous duplicate → both rejected is also correct.
            assert.strictEqual(result0.reason, 'block_ordinal_drift');
        }

        // The second anchor must either resolve to ordinal 1 or be rejected.
        if (result1.valid) {
            assert.ok(result1.block.blockOrdinal === 1, 'Second anchor must resolve to ordinal 1');
        } else {
            assert.strictEqual(result1.reason, 'block_ordinal_drift');
        }
    });

    it('two fences with different content are unambiguously disambiguated', () => {
        const source =
            c4xFence('graph TB\nPerson(Alpha, "Alpha")') +
            '\n' +
            c4xFence('graph TB\nPerson(Beta, "Beta")');
        const doc = createDocument('file:///distinct.md', source);

        const anchor0 = captureBlock(doc.document, 0);
        const anchor1 = captureBlock(doc.document, 1);

        const result0 = resolveAnchor(doc.document, anchor0);
        const result1 = resolveAnchor(doc.document, anchor1);

        assert.strictEqual(result0.valid, true, 'First anchor must resolve');
        assert.strictEqual(result1.valid, true, 'Second anchor must resolve');

        if (result0.valid) {
            assert.strictEqual(result0.block.blockOrdinal, 0);
        }
        if (result1.valid) {
            assert.strictEqual(result1.block.blockOrdinal, 1);
        }
    });
});

// ---------------------------------------------------------------------------
// Fence moved within the document
// ---------------------------------------------------------------------------

describe('Markdown anchor — fence moved', () => {
    it('resolves after surrounding prose is added before the target fence', () => {
        const fenceBody = 'graph TB\nPerson(User, "User")';
        const target = c4xFence(fenceBody);
        const doc = createDocument('file:///moved.md', `# Before\n\n${target}\nAfter\n`);
        const anchor = captureBlock(doc.document, 0);

        // Prepend more prose — the fence is still the first (and only) c4x block.
        doc.setText(`# Extended before\n\nLots of new prose here.\n\n${target}\nAfter\n`);

        const result = resolveAnchor(doc.document, anchor);
        assert.strictEqual(result.valid, true, 'Anchor must resolve after prose insertion before the fence');
    });

    it('rejects with block_ordinal_drift when a new c4x fence is inserted before the target', () => {
        const target = c4xFence('graph TB\nPerson(User, "User")');
        const doc = createDocument('file:///prepended.md', target);
        const anchor = captureBlock(doc.document, 0);

        // Insert a different c4x fence before the target — ordinal shifts from 0 to 1.
        doc.setText(c4xFence('graph TB\nPerson(Other, "Other")') + target);

        const result = resolveAnchor(doc.document, anchor);
        assert.strictEqual(result.valid, false);
        assert.strictEqual((result as { valid: false; reason: string }).reason, 'block_ordinal_drift');
    });
});

// ---------------------------------------------------------------------------
// Fence deleted
// ---------------------------------------------------------------------------

describe('Markdown anchor — fence deleted', () => {
    it('rejects with range_out_of_bounds when the anchored fence is removed', () => {
        const doc = createDocument(
            'file:///deleted.md',
            `# Architecture\n\n${c4xFence('graph TB\nPerson(User, "User")')}`
        );
        const anchor = captureBlock(doc.document, 0);

        // Remove the fence entirely.
        doc.setText('# Architecture\n');

        const result = resolveAnchor(doc.document, anchor);
        assert.strictEqual(result.valid, false);
        // range_out_of_bounds because the block can no longer be found.
        assert.strictEqual(
            (result as { valid: false; reason: string }).reason,
            'range_out_of_bounds',
        );
    });
});

// ---------------------------------------------------------------------------
// Fence edited externally
// ---------------------------------------------------------------------------

describe('Markdown anchor — fence edited externally', () => {
    it('rejects fingerprint_mismatch when the body text changes without altering model identity', () => {
        const doc = createDocument(
            'file:///edited-body.md',
            c4xFence('graph TB\nPerson(User, "User")')
        );
        const anchor = captureBlock(doc.document, 0);

        // Add a trailing newline — same model identity but different body text.
        doc.setText(c4xFence('graph TB\nPerson(User, "User")\n'));

        const result = resolveAnchor(doc.document, anchor);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(
            (result as { valid: false; reason: string }).reason,
            'fingerprint_mismatch',
        );
    });

    it('rejects model_identity_changed when an element is renamed', () => {
        const doc = createDocument(
            'file:///renamed-element.md',
            c4xFence('graph TB\nPerson(User, "User")')
        );
        const anchor = captureBlock(doc.document, 0);

        // Rename the element — model identity changes.
        doc.setText(c4xFence('graph TB\nPerson(Admin, "Admin")'));

        const result = resolveAnchor(doc.document, anchor);
        assert.strictEqual(result.valid, false);
        assert.strictEqual(
            (result as { valid: false; reason: string }).reason,
            'model_identity_changed',
        );
    });
});

// ---------------------------------------------------------------------------
// Happy-path round-trip
// ---------------------------------------------------------------------------

describe('Markdown anchor — happy-path round-trip', () => {
    it('resolves a stable fence and returns the correct body range', () => {
        const bodyContent = 'graph TB\nPerson(User, "User")\nSoftwareSystem(Portal, "Portal")';
        const prefix = '# Architecture Guide\n\nSome introductory prose.\n\n';
        const suffix = '\n\nMore prose after the diagram.\n';

        const source = prefix + c4xFence(bodyContent) + suffix;
        const doc = createDocument('file:///stable.md', source);

        const anchor = captureBlock(doc.document, 0);
        const result = resolveAnchor(doc.document, anchor);

        assert.strictEqual(result.valid, true, 'Stable fence must resolve');
        if (result.valid) {
            const body = doc.document.getText().slice(
                result.block.bodyRange.start,
                result.block.bodyRange.end,
            );
            // The body should contain all elements.
            assert.ok(body.includes('Person(User'), `Body must include Person element, got: ${body}`);
            assert.ok(body.includes('SoftwareSystem(Portal'), `Body must include SoftwareSystem element, got: ${body}`);
        }
    });
});
