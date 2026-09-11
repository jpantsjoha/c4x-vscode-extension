/**
 * Host-level tests for the source diff / draft-materialisation path.
 * Validates that staged label and move edits produce correctly diffed output
 * via materialiseDraft + computeLineDiff (issue #83 DoD).
 */

import * as assert from 'assert';
import { materialiseDraft } from '../../writeback/draftMaterialiser';
import { computeLineDiff, diffHasChanges } from '../../writeback/lineDiff';
import type { StagedEdit } from '../../webview/visualLayoutProtocol';

/** Minimal C4X source used throughout these tests. */
const FIXTURE_SOURCE = `graph LR
Person(Customer, "Customer", "A user of the system")
SoftwareSystem(BankingSystem, "Internet Banking System", "Allows customers to check their accounts")
Customer --> BankingSystem
`;

describe('materialiseDraft — label-only edit', () => {
    it('produces updated source when label is changed', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', label: 'Client' }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits);
        assert.ok(result.ok, `Expected ok, got: ${!result.ok ? result.reason : ''}`);
        if (!result.ok) { return; }
        assert.ok(result.text.includes('"Client"'), 'Updated label should appear in materialised text');
        // The identifier 'Customer' still appears in Rel, but the label string '"Customer"' should be replaced
        assert.ok(!result.text.includes('"Customer"'), 'Old label string should be replaced by "Client"');
    });

    it('returns unchanged text when edits list is empty', () => {
        const result = materialiseDraft(FIXTURE_SOURCE, []);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        assert.strictEqual(result.text, FIXTURE_SOURCE);
    });
});

describe('materialiseDraft — coordinate (move) edit', () => {
    it('inlines coordinates into native source', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', x: 100, y: 200 }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits, false);
        assert.ok(result.ok, `Expected ok, got: ${!result.ok ? result.reason : ''}`);
        if (!result.ok) { return; }
        // The materialised source should contain x/y metadata tokens
        assert.ok(result.text.includes('100') || result.text.includes('200'),
            'Coordinate values should appear in materialised source');
    });

    it('returns original text unchanged for sidecar mode', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', x: 100, y: 200 }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits, true);
        assert.ok(result.ok);
        if (!result.ok) { return; }
        // In sidecar mode the source is not changed by coordinates
        assert.strictEqual(result.text, FIXTURE_SOURCE);
    });
});

describe('materialiseDraft — combined label and move', () => {
    it('materialises both label rename and coordinates in one pass', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', label: 'Client', x: 50, y: 80 }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits, false);
        assert.ok(result.ok, `Expected ok, got: ${!result.ok ? result.reason : ''}`);
        if (!result.ok) { return; }
        assert.ok(result.text.includes('"Client"'), 'Label should be updated');
    });
});

describe('materialiseDraft → computeLineDiff — label edit diff content', () => {
    it('diff contains removed original line and added updated line for a label change', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', label: 'Client' }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits);
        assert.ok(result.ok, `Materialise failed: ${!result.ok ? result.reason : ''}`);
        if (!result.ok) { return; }

        const diff = computeLineDiff(FIXTURE_SOURCE, result.text);
        assert.ok(diffHasChanges(diff), 'Diff should have changes');

        const added = diff.filter(l => l.kind === 'added');
        const removed = diff.filter(l => l.kind === 'removed');

        assert.ok(added.some(l => l.text.includes('"Client"')),
            `Expected added line with "Client", got: ${JSON.stringify(added)}`);
        assert.ok(removed.some(l => l.text.includes('Customer')),
            `Expected removed line with "Customer", got: ${JSON.stringify(removed)}`);
    });

    it('unchanged relationship line survives a label edit on another element', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', label: 'Client' }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits);
        assert.ok(result.ok);
        if (!result.ok) { return; }

        const diff = computeLineDiff(FIXTURE_SOURCE, result.text);
        const unchanged = diff.filter(l => l.kind === 'unchanged');
        assert.ok(unchanged.some(l => l.text.includes('Customer --> BankingSystem') || l.text.includes('-->')),
            'Relationship line should remain unchanged');
    });
});

describe('materialiseDraft → computeLineDiff — move edit diff content', () => {
    it('diff has changes when coordinates are inlined into native source', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', x: 100, y: 200 }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits, false);
        assert.ok(result.ok, `Materialise failed: ${!result.ok ? result.reason : ''}`);
        if (!result.ok) { return; }

        const diff = computeLineDiff(FIXTURE_SOURCE, result.text);
        // For a fresh fixture without existing coords, inlining coords always changes the Person line
        assert.ok(diffHasChanges(diff),
            'Diff should have changes when coordinates are added to native source');
    });

    it('diff has no changes in sidecar mode (source unchanged)', () => {
        const edits: StagedEdit[] = [{ id: 'Customer', x: 100, y: 200 }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits, true);
        assert.ok(result.ok);
        if (!result.ok) { return; }

        const diff = computeLineDiff(FIXTURE_SOURCE, result.text);
        assert.ok(!diffHasChanges(diff),
            'Diff should have no changes for sidecar-mode coordinate edits');
    });
});

describe('materialiseDraft — error cases', () => {
    it('returns ok:false for a missing element id', () => {
        const edits: StagedEdit[] = [{ id: 'NonExistent', label: 'Ghost' }];
        const result = materialiseDraft(FIXTURE_SOURCE, edits);
        assert.strictEqual(result.ok, false);
        if (result.ok) { return; }
        assert.ok(result.reason.toLowerCase().includes('nonexistent') ||
            result.reason.toLowerCase().includes('not found'),
            `Expected "not found" in reason, got: ${result.reason}`);
    });

    it('returns ok:false for invalid C4X source', () => {
        const result = materialiseDraft('THIS IS NOT VALID C4X !!!', [{ id: 'x', label: 'X' }]);
        assert.strictEqual(result.ok, false);
    });
});
