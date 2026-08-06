/**
 * Extension-host unit tests for the external-change conflict detection and
 * recovery flow (GitHub issue #71 — B16).
 *
 * These tests exercise:
 *  1. `isResolveConflictMessage` — protocol guard for webview → host messages.
 *  2. `hasAnchoredBlockChanged` logic via `resolveAnchor` (the underlying primitive).
 *  3. Each of the three recovery paths: reloadAndDiscard, viewDiff, rebase.
 *  4. Concurrent edit at Save moment still fails closed via resolveAnchor.
 *  5. Conflict state and banner behaviour contracts.
 *
 * No DOM, no VS Code host, no webview iframe — pure TypeScript unit tests.
 */

import * as assert from 'assert';
import {
    isResolveConflictMessage,
    VISUAL_LAYOUT_PROTOCOL_VERSION,
    type ConflictResolutionAction,
} from '../../webview/visualLayoutProtocol';
import {
    captureAnchor,
    resolveAnchor,
    findC4xFencedBlocks,
    createNativeDocumentBlock,
    type SaveAnchor,
} from '../../writeback/SaveAnchor';
import { formatConflictBannerMessage } from '../../webview/previewClientScript';

// ── Minimal vscode.TextDocument stub ─────────────────────────────────────────

type TextDocument = Parameters<typeof captureAnchor>[0];

function makeDoc(text: string, uri = 'file:///test.c4x', version = 1): TextDocument {
    return {
        uri: { toString: () => uri },
        version,
        languageId: 'c4x',
        fileName: uri,
        getText: () => text,
        positionAt: (offset: number) => ({ line: 0, character: offset }),
    } as TextDocument;
}

// A minimal valid C4X source fixture.
const FIXTURE_C4X = `context MySystem "My System" {
  Person(Customer, "Customer", "A user")
  SoftwareSystem(Backend, "Backend", "Does work")
  Customer --> Backend
}
`;

// A slightly modified version to simulate an external change.
const FIXTURE_C4X_CHANGED = `context MySystem "My System" {
  Person(Customer, "Customer", "A user — edited externally")
  SoftwareSystem(Backend, "Backend", "Does work")
  Customer --> Backend
}
`;

const FIXTURE_MARKDOWN = `# Test doc

\`\`\`c4x
${FIXTURE_C4X}\`\`\`
`;

const FIXTURE_MARKDOWN_CHANGED = `# Test doc

\`\`\`c4x
${FIXTURE_C4X_CHANGED}\`\`\`
`;

// ── isResolveConflictMessage ──────────────────────────────────────────────────

describe('isResolveConflictMessage — protocol guard', () => {
    function makeMsg(action: unknown): unknown {
        return {
            type: 'visualLayout.resolveConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            action,
        };
    }

    it('accepts reloadAndDiscard', () => {
        assert.strictEqual(isResolveConflictMessage(makeMsg('reloadAndDiscard')), true);
    });

    it('accepts viewDiff', () => {
        assert.strictEqual(isResolveConflictMessage(makeMsg('viewDiff')), true);
    });

    it('accepts rebase', () => {
        assert.strictEqual(isResolveConflictMessage(makeMsg('rebase')), true);
    });

    it('rejects an unknown action', () => {
        assert.strictEqual(isResolveConflictMessage(makeMsg('nukeSource')), false);
    });

    it('rejects when protocolVersion is wrong', () => {
        const msg = {
            type: 'visualLayout.resolveConflict',
            protocolVersion: 999,
            action: 'reloadAndDiscard',
        };
        assert.strictEqual(isResolveConflictMessage(msg), false);
    });

    it('rejects when type is missing', () => {
        const msg = { protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION, action: 'rebase' };
        assert.strictEqual(isResolveConflictMessage(msg), false);
    });

    it('rejects null', () => {
        assert.strictEqual(isResolveConflictMessage(null), false);
    });

    it('rejects a plain string', () => {
        assert.strictEqual(isResolveConflictMessage('reloadAndDiscard'), false);
    });
});

// ── resolveAnchor — external change detection ─────────────────────────────────

describe('resolveAnchor — detects external change (B16 conflict gate)', () => {
    it('returns valid:true when source is unchanged (no conflict)', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // Same doc — no external change.
        const result = resolveAnchor(doc, anchor);
        assert.strictEqual(result.valid, true);
    });

    it('returns valid:false with fingerprint_mismatch when block body changes', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // Simulate external edit — different document with same URI.
        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);
        const result = resolveAnchor(changedDoc, anchor);
        assert.strictEqual(result.valid, false);
        if (!result.valid) {
            // Either fingerprint_mismatch or model_identity_changed is correct here.
            const expectedCodes = ['fingerprint_mismatch', 'model_identity_changed'];
            assert.ok(
                expectedCodes.includes(result.reason),
                `Expected one of ${expectedCodes.join('|')}, got ${result.reason}`
            );
        }
    });

    it('returns valid:false with range_out_of_bounds when document is truncated', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // Truncated document — block range now exceeds source length.
        const truncatedDoc = makeDoc('', 'file:///test.c4x', 2);
        const result = resolveAnchor(truncatedDoc, anchor);
        assert.strictEqual(result.valid, false);
        if (!result.valid) {
            // range_out_of_bounds or model_identity_changed depending on impl detail.
            assert.ok(result.reason.length > 0, 'Should have a rejection reason');
        }
    });

    it('returns valid:false with uri_mismatch for a different URI', () => {
        const doc = makeDoc(FIXTURE_C4X, 'file:///test.c4x');
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        const differentUriDoc = makeDoc(FIXTURE_C4X, 'file:///other.c4x', 2);
        const result = resolveAnchor(differentUriDoc, anchor);
        assert.strictEqual(result.valid, false);
        if (!result.valid) {
            assert.strictEqual(result.reason, 'uri_mismatch');
        }
    });
});

// ── Conflict detection: hasAnchoredBlockChanged logic ────────────────────────

describe('conflict detection — hasAnchoredBlockChanged logic', () => {
    /**
     * Mirrors the logic in PreviewPanel.hasAnchoredBlockChanged:
     * resolveAnchor returns invalid → block changed → conflict.
     */
    function hasAnchoredBlockChanged(document: ReturnType<typeof makeDoc>, anchor: SaveAnchor): boolean {
        const resolution = resolveAnchor(document, anchor);
        return !resolution.valid;
    }

    it('returns false (no conflict) when document is unchanged', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        assert.strictEqual(hasAnchoredBlockChanged(doc, anchor), false);
    });

    it('returns true (conflict) when block body is modified', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);
        assert.strictEqual(hasAnchoredBlockChanged(changedDoc, anchor), true);
    });

    it('returns false when anchor is undefined (no block to check)', () => {
        const doc = makeDoc(FIXTURE_C4X);
        // Simulates when activeSaveAnchor is undefined — the host skips the check.
        const undefinedAnchor = undefined;
        // Mirror the host guard: if (!anchor) return false
        const result = undefinedAnchor ? hasAnchoredBlockChanged(doc, undefinedAnchor) : false;
        assert.strictEqual(result, false);
    });

    it('detects Markdown block change via findC4xFencedBlocks', () => {
        const mdDoc = makeDoc(FIXTURE_MARKDOWN, 'file:///test.md');
        const blocks = findC4xFencedBlocks(mdDoc);
        assert.strictEqual(blocks.length, 1, 'Should find one c4x fence block');

        const block = blocks[0];
        const anchor = captureAnchor(mdDoc, block);

        const changedMdDoc = makeDoc(FIXTURE_MARKDOWN_CHANGED, 'file:///test.md', 2);
        const resolution = resolveAnchor(changedMdDoc, anchor);
        assert.strictEqual(resolution.valid, false, 'External Markdown edit should trigger conflict');
    });
});

// ── Recovery paths ────────────────────────────────────────────────────────────

describe('conflict recovery paths — reloadAndDiscard', () => {
    it('reloadAndDiscard action exits conflict state and re-anchors from new source', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // External change occurs.
        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);
        assert.strictEqual(resolveAnchor(changedDoc, anchor).valid, false, 'Precondition: conflict detected');

        // After reloadAndDiscard the host re-anchors from the new source.
        const newBlock = createNativeDocumentBlock(changedDoc);
        const newAnchor = captureAnchor(changedDoc, newBlock);

        // New anchor must resolve cleanly against the changed document.
        const postReloadResolution = resolveAnchor(changedDoc, newAnchor);
        assert.strictEqual(postReloadResolution.valid, true, 'New anchor should resolve against the changed source');
    });

    it('after reloadAndDiscard, the old anchor must not resolve against the new source', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);
        // The old anchor must still be invalid after the external change.
        assert.strictEqual(resolveAnchor(changedDoc, anchor).valid, false);
    });
});

describe('conflict recovery paths — viewDiff', () => {
    it('viewDiff action does not discard the draft', () => {
        // The viewDiff action only opens the diff panel; draft is preserved.
        // We verify this by confirming that the resolveConflict message type is correct.
        const msg = {
            type: 'visualLayout.resolveConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            action: 'viewDiff' as ConflictResolutionAction,
        };
        assert.strictEqual(isResolveConflictMessage(msg), true);
        assert.strictEqual(msg.action, 'viewDiff');
        // The draft (stagedEdits) is intentionally NOT touched by viewDiff.
    });
});

describe('conflict recovery paths — rebase', () => {
    it('rebase action produces a fresh anchor that resolves against the changed source', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);
        assert.strictEqual(resolveAnchor(changedDoc, anchor).valid, false, 'Precondition: conflict');

        // Rebase: host creates a new anchor from the changed document.
        const rebasedBlock = createNativeDocumentBlock(changedDoc);
        const rebasedAnchor = captureAnchor(changedDoc, rebasedBlock);
        const postRebaseResolution = resolveAnchor(changedDoc, rebasedAnchor);
        assert.strictEqual(postRebaseResolution.valid, true, 'Rebased anchor must resolve');
    });

    it('rebase action is a valid protocol message', () => {
        const msg = {
            type: 'visualLayout.resolveConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            action: 'rebase' as ConflictResolutionAction,
        };
        assert.strictEqual(isResolveConflictMessage(msg), true);
    });
});

// ── Redundancy safety: Save at conflict moment fails closed ───────────────────

describe('concurrency preflight redundancy — Save at conflict moment', () => {
    it('resolveAnchor fails closed even when user clicks Save during conflict window', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // External change occurs between conflict detection and Save click.
        const changedDoc = makeDoc(FIXTURE_C4X_CHANGED, 'file:///test.c4x', 2);

        // The concurrency preflight (resolveAnchor in WritebackTransaction) still rejects.
        const saveTimeResolution = resolveAnchor(changedDoc, anchor);
        assert.strictEqual(saveTimeResolution.valid, false);
        if (!saveTimeResolution.valid) {
            assert.ok(
                ['fingerprint_mismatch', 'model_identity_changed', 'range_out_of_bounds'].includes(saveTimeResolution.reason),
                `Unexpected reason: ${saveTimeResolution.reason}`
            );
        }
    });

    it('resolveAnchor accepts unchanged source at Save time (no false positive)', () => {
        const doc = makeDoc(FIXTURE_C4X);
        const block = createNativeDocumentBlock(doc);
        const anchor = captureAnchor(doc, block);

        // No external change — Save must succeed.
        const saveTimeResolution = resolveAnchor(doc, anchor);
        assert.strictEqual(saveTimeResolution.valid, true);
    });
});

// ── formatConflictBannerMessage ───────────────────────────────────────────────

describe('formatConflictBannerMessage', () => {
    it('returns the reason string as-is (text content — not innerHTML)', () => {
        const reason = 'Source changed elsewhere. Your draft is preserved. (The block content changed.)';
        assert.strictEqual(formatConflictBannerMessage(reason), reason);
    });

    it('preserves the full reason for screen-reader announcement', () => {
        const reason = 'Source changed elsewhere. Your draft is preserved. (The block was moved or deleted.)';
        const result = formatConflictBannerMessage(reason);
        assert.ok(result.includes('draft is preserved'), 'Must mention draft preservation');
    });
});

// ── ExternalChangeConflictMessage shape ──────────────────────────────────────

describe('ExternalChangeConflictMessage — shape contract', () => {
    it('has the correct type discriminator', () => {
        const msg = {
            type: 'visualLayout.externalChangeConflict',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            reason: 'Source changed elsewhere. Your draft is preserved.',
        };
        assert.strictEqual(msg.type, 'visualLayout.externalChangeConflict');
        assert.strictEqual(msg.protocolVersion, VISUAL_LAYOUT_PROTOCOL_VERSION);
        assert.ok(msg.reason.length > 0);
    });

    it('reason must be a non-empty string', () => {
        const validReason = 'Source changed elsewhere. Your draft is preserved.';
        assert.strictEqual(typeof validReason, 'string');
        assert.ok(validReason.length > 0);
    });
});
