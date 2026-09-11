import * as assert from 'assert';
import type * as vscode from 'vscode';
import {
    captureAnchor,
    findC4xFencedBlocks,
    resolveAnchor,
    SaveAnchor,
} from '../../writeback/SaveAnchor';

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

function captureFirstBlock(document: vscode.TextDocument): SaveAnchor {
    const block = findC4xFencedBlocks(document)[0];
    assert.ok(block, 'Expected an editable C4X fence.');
    return captureAnchor(document, block);
}

describe('SaveAnchor resolver', () => {
    it('rejects uri_mismatch', () => {
        const source = c4xFence('graph TB\nPerson(User, "User")');
        const original = createDocument('file:///workspace/original.md', source);
        const replacement = createDocument('file:///workspace/replacement.md', source);

        const result = resolveAnchor(replacement.document, captureFirstBlock(original.document));

        assert.deepStrictEqual(result, { valid: false, reason: 'uri_mismatch' });
    });

    it('rejects block_ordinal_drift when the target moves after another C4X block', () => {
        const target = c4xFence('graph TB\nPerson(User, "User")');
        const document = createDocument('file:///workspace/architecture.md', target);
        const anchor = captureFirstBlock(document.document);

        document.setText(c4xFence('graph TB\nPerson(Other, "Other")') + target);

        const result = resolveAnchor(document.document, anchor);

        assert.deepStrictEqual(result, { valid: false, reason: 'block_ordinal_drift' });
    });

    it('rejects fingerprint_mismatch when the source body changes without changing model identity', () => {
        const document = createDocument(
            'file:///workspace/architecture.md',
            c4xFence('graph TB\nPerson(User, "User")')
        );
        const anchor = captureFirstBlock(document.document);

        document.setText(c4xFence('graph TB\nPerson(User, "User")\n'));

        const result = resolveAnchor(document.document, anchor);

        assert.deepStrictEqual(result, { valid: false, reason: 'fingerprint_mismatch' });
    });

    it('rejects model_identity_changed when a stable element identity changes', () => {
        const document = createDocument(
            'file:///workspace/architecture.md',
            c4xFence('graph TB\nPerson(User, "User")')
        );
        const anchor = captureFirstBlock(document.document);

        document.setText(c4xFence('graph TB\nPerson(Admin, "Admin")'));

        const result = resolveAnchor(document.document, anchor);

        assert.deepStrictEqual(result, { valid: false, reason: 'model_identity_changed' });
    });

    it('rejects range_out_of_bounds when the anchored block is deleted', () => {
        const document = createDocument(
            'file:///workspace/architecture.md',
            `# Architecture\n\n${c4xFence('graph TB\nPerson(User, "User")')}`
        );
        const anchor = captureFirstBlock(document.document);

        document.setText('# Architecture');

        const result = resolveAnchor(document.document, anchor);

        assert.deepStrictEqual(result, { valid: false, reason: 'range_out_of_bounds' });
    });

    it('resolves a block moved within the same document when its ordinal and source identity stay stable', () => {
        const target = c4xFence('graph TB\nPerson(User, "User")');
        const document = createDocument(
            'file:///workspace/architecture.md',
            `# Before\n\n${target}\nAfter\n`
        );
        const anchor = captureFirstBlock(document.document);

        document.setText(`# New introduction\n\nMore prose.\n\n${target}\nAfter\n`);

        const result = resolveAnchor(document.document, anchor);

        assert.strictEqual(result.valid, true);
        if (result.valid) {
            assert.strictEqual(
                document.document.getText().slice(result.block.bodyRange.start, result.block.bodyRange.end),
                'graph TB\nPerson(User, "User")\n'
            );
        }
    });
});
