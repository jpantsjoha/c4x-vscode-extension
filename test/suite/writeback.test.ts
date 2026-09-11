import * as assert from 'assert';
import * as vscode from 'vscode';
import { executeWritebackTransaction, executeResetLayoutTransaction, WritebackTransactionError } from '../../src/writeback/WritebackTransaction';
import { MoveElementMessage } from '../../src/webview/visualLayoutProtocol';
import { C4XParser } from '../../src/parser/C4XParser';
import * as nativeMutationPlanner from '../../src/writeback/NativeMutationPlanner';
import { captureAnchor, createNativeDocumentBlock, findC4xFencedBlocks, resolveAnchor } from '../../src/writeback/SaveAnchor';

const parser = new C4XParser();

function c4xFence(source: string): string {
    return `\`\`\`c4x\n${source}\n\`\`\`\n`;
}

async function replaceDocumentText(document: vscode.TextDocument, text: string): Promise<void> {
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
    assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
}

describe('Visual Layout Writeback Integration Tests', () => {
    it('applies a valid move and verifies re-parse', async () => {
        const initialText = 'graph TB\nPerson(User, "User")';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'c4x'
        });
        await vscode.window.showTextDocument(doc);

        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'User',
            x: 100,
            y: 200,
            input: 'keyboard'
        };

        const success = await executeWritebackTransaction(doc, msg);
        assert.strictEqual(success, true);

        const updatedText = doc.getText();
        assert.ok(updatedText.includes('$x="100"'));
        assert.ok(updatedText.includes('$y="200"'));

        // Verify AST re-parse has ranges
        const parsed = parser.parse(updatedText);
        assert.strictEqual(parsed.elements[0].metadata?.x, '100');
        assert.strictEqual(parsed.elements[0].metadata?.y, '200');
    });

    it('rejects a move with a stale revision', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'graph TB\nPerson(User, "User")',
            language: 'c4x'
        });

        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(Number(doc.version) - 1), // stale
            id: 'User',
            x: 100,
            y: 200,
            input: 'keyboard'
        };

        try {
            await executeWritebackTransaction(doc, msg);
            assert.fail('Expected stale revision to throw');
        } catch (error: any) {
            assert.strictEqual(error instanceof WritebackTransactionError, true);
            assert.strictEqual(error.code, 'stale_revision');
        }
    });

    it('restores the first non-active document after a failing writeback', async () => {
        const initialText = 'graph TB\nPerson(User, "User")';
        const firstDocument = await vscode.workspace.openTextDocument({ content: initialText, language: 'c4x' });
        await vscode.window.showTextDocument(firstDocument);
        const secondDocument = await vscode.workspace.openTextDocument({ content: 'graph TB\nPerson(Other, "Other")', language: 'c4x' });
        await vscode.window.showTextDocument(secondDocument);
        assert.strictEqual(vscode.window.activeTextEditor?.document.uri.toString(), secondDocument.uri.toString());

        const planner = nativeMutationPlanner as {
            planMetadataUpdate: typeof nativeMutationPlanner.planMetadataUpdate;
        };
        const originalPlanMetadataUpdate = planner.planMetadataUpdate;
        planner.planMetadataUpdate = (_source, target) => [{ range: target.range, newText: 'Broken' }];

        try {
            const message: MoveElementMessage = {
                type: 'visualLayout.moveElement',
                protocolVersion: 1,
                revision: String(firstDocument.version),
                id: 'User',
                x: 100,
                y: 200,
                input: 'keyboard'
            };

            let thrown: unknown;
            try {
                await executeWritebackTransaction(firstDocument, message);
            } catch (error) {
                thrown = error;
            }

            assert.ok(thrown instanceof WritebackTransactionError);
            assert.strictEqual(firstDocument.getText(), initialText);
            assert.strictEqual(secondDocument.getText(), 'graph TB\nPerson(Other, "Other")');
        } finally {
            planner.planMetadataUpdate = originalPlanMetadataUpdate;
        }
    });

    it('rejects a simulated revision change before applying a writeback', async () => {
        const initialText = 'graph TB\nPerson(User, "User")';
        let versionReads = 0;
        const racedDocument = {
            get version() {
                versionReads++;
                // Read counting: 1 = default-anchor capture (openingDocumentVersion),
                // 2 = message.revision check, 3 = observedVersion capture, 4 = pre-apply race guard.
                // Flip to version 2 on the 4th read to simulate a concurrent doc change.
                return versionReads > 3 ? 2 : 1;
            },
            getText: () => initialText,
            languageId: 'c4x',
            fileName: 'race.c4x',
            uri: vscode.Uri.parse('untitled:writeback-race.c4x'),
            positionAt: (offset: number) => new vscode.Position(0, offset),
        } as unknown as vscode.TextDocument;
        const message: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: '1',
            id: 'User',
            x: 100,
            y: 200,
            input: 'keyboard'
        };

        let thrown: unknown;
        try {
            await executeWritebackTransaction(racedDocument, message);
        } catch (error) {
            thrown = error;
        }

        assert.ok(
            thrown instanceof WritebackTransactionError,
            thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)
        );
        assert.strictEqual(thrown.code, 'stale_revision');
        assert.strictEqual(racedDocument.getText(), initialText);
    });

    it('rejects overlapping planned edits before constructing a WorkspaceEdit', async () => {
        const source = 'graph TB\nPerson(User, "User")';
        const planner = nativeMutationPlanner as {
            planMetadataUpdate: typeof nativeMutationPlanner.planMetadataUpdate;
        };
        const originalPlanMetadataUpdate = planner.planMetadataUpdate;
        planner.planMetadataUpdate = (_source, target) => [{
            range: target.range,
            newText: 'A'
        }, {
            range: {
                start: {
                    ...target.range.start,
                    offset: target.range.start.offset + 1,
                    column: target.range.start.column + 1
                },
                end: target.range.end
            },
            newText: 'B'
        }];
        const noWorkspaceEditDocument = {
            version: 1,
            getText: () => source,
            languageId: 'c4x',
            fileName: 'overlap.c4x',
            uri: vscode.Uri.parse('untitled:writeback-overlap.c4x'),
            positionAt: () => assert.fail('WorkspaceEdit should not be constructed for overlapping edits'),
        } as unknown as vscode.TextDocument;

        try {
            const message: MoveElementMessage = {
                type: 'visualLayout.moveElement',
                protocolVersion: 1,
                revision: '1',
                id: 'User',
                x: 100,
                y: 200,
                input: 'keyboard'
            };
            let thrown: unknown;
            try {
                await executeWritebackTransaction(noWorkspaceEditDocument, message);
            } catch (error) {
                thrown = error;
            }

            assert.ok(
                thrown instanceof WritebackTransactionError,
                thrown instanceof Error ? `${thrown.name}: ${thrown.message}` : String(thrown)
            );
            assert.strictEqual(noWorkspaceEditDocument.getText(), source);
        } finally {
            planner.planMetadataUpdate = originalPlanMetadataUpdate;
        }
    });

    it('triggers a rollback when re-parse structural validation fails', async () => {
        const initialText = 'graph TB\nPerson(User, "User")';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'c4x'
        });
        await vscode.window.showTextDocument(doc);

        // We can cause validation failure by passing a target ID that exists in AST,
        // but wait! If we modify `planMetadataUpdate` or pass a target ID that is valid,
        // but the planMetadataUpdate plans something that corrupts the syntax?
        // Wait, since planMetadataUpdate itself checks ranges and throws StaleRangeError if range doesn't match,
        // if we mock planMetadataUpdate or if we modify doc manually to have duplicate metadata,
        // wait: if we have invalid syntax in document itself?
        // Let's pass a document that gets corrupted. Or we can just pass an ID that isn't present,
        // which throws missing_element error!
        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'NonExistentNode',
            x: 100,
            y: 200,
            input: 'keyboard'
        };

        try {
            await executeWritebackTransaction(doc, msg);
            assert.fail('Expected missing element to throw');
        } catch (error: any) {
            assert.strictEqual(error instanceof WritebackTransactionError, true);
            assert.strictEqual(error.code, 'missing_element');
        }

        // Document must remain unchanged
        assert.strictEqual(doc.getText(), initialText);
    });

    it('uses sidecar persistence for native C4X when configuration sets persistence to sidecar', async () => {
        const config = vscode.workspace.getConfiguration('c4x');
        await config.update('layout.persistence', 'sidecar', vscode.ConfigurationTarget.Global);

        const initialText = 'graph TB\nPerson(User, "User")';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'c4x'
        });
        await vscode.window.showTextDocument(doc);

        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'User',
            x: 150,
            y: 250,
            input: 'keyboard'
        };

        try {
            const success = await executeWritebackTransaction(doc, msg);
            assert.strictEqual(success, true);

            // Document must be unchanged
            assert.strictEqual(doc.getText(), initialText);

            // Sidecar file should exist and have the coordinate
            const { getSidecarUri, getRelativePath } = require('../../src/writeback/SidecarPersistence');
            const sidecarUri = getSidecarUri(doc.uri);
            const bytes = await vscode.workspace.fs.readFile(sidecarUri);
            const content = new TextDecoder('utf-8').decode(bytes);
            const parsed = JSON.parse(content);
            
            const relPathActual = getRelativePath(doc.uri);
            assert.strictEqual(parsed.layouts[relPathActual].elements.User.x, 150);
            assert.strictEqual(parsed.layouts[relPathActual].elements.User.y, 250);

            // Clean up sidecar
            await vscode.workspace.fs.delete(sidecarUri);
        } finally {
            // Restore configuration
            await config.update('layout.persistence', undefined, vscode.ConfigurationTarget.Global);
        }
    });

    it('automatically uses sidecar persistence for Structurizr DSL files', async () => {
        const initialText = 'workspace "Test Workspace" {\n  model {\n    user = person "User"\n    sys = softwareSystem "System"\n    user -> sys "Uses"\n  }\n  views {\n    systemContext sys "SystemContext" {\n      include *\n    }\n  }\n}';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'structurizr-dsl'
        });
        await vscode.window.showTextDocument(doc);

        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'user',
            x: 180,
            y: 280,
            input: 'keyboard'
        };

        const success = await executeWritebackTransaction(doc, msg);
        assert.strictEqual(success, true);

        // Document must be unchanged
        assert.strictEqual(doc.getText(), initialText);

        // Sidecar file should exist and have the coordinate
        const { getSidecarUri, getRelativePath } = require('../../src/writeback/SidecarPersistence');
        const sidecarUri = getSidecarUri(doc.uri);
        const bytes = await vscode.workspace.fs.readFile(sidecarUri);
        const content = new TextDecoder('utf-8').decode(bytes);
        const parsed = JSON.parse(content);
        
        const relPathActual = getRelativePath(doc.uri);
        assert.strictEqual(parsed.layouts[relPathActual].elements.user.x, 180);
        assert.strictEqual(parsed.layouts[relPathActual].elements.user.y, 280);

        // Clean up sidecar
        await vscode.workspace.fs.delete(sidecarUri);
    });

    it('resets visual layout natively in C4X files', async () => {
        const initialText = 'graph TB\nPerson(User, "User", $x="100", $y="200", $locked="true")';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'c4x'
        });
        await vscode.window.showTextDocument(doc);

        const success = await executeResetLayoutTransaction(doc);
        assert.strictEqual(success, true);

        // Check that layout coordinates are stripped
        const text = doc.getText();
        assert.ok(!text.includes('$x'));
        assert.ok(!text.includes('$y'));
        assert.ok(!text.includes('$locked'));
        assert.strictEqual(text.replace(/\s+/g, ''), 'graphTBPerson(User,"User")');
    });

    it('resets visual layout from sidecar in sidecar mode', async () => {
        const initialText = 'workspace "Test" {\n  model {\n    user = person "User"\n  }\n  views {\n    systemContext user "Ctx" {\n      include *\n    }\n  }\n}';
        const doc = await vscode.workspace.openTextDocument({
            content: initialText,
            language: 'structurizr-dsl'
        });
        await vscode.window.showTextDocument(doc);

        // Save coordinate first
        const msg: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'user',
            x: 200,
            y: 300,
            input: 'keyboard'
        };

        const successMove = await executeWritebackTransaction(doc, msg);
        assert.strictEqual(successMove, true);

        // Verify sidecar exists
        const { getSidecarUri } = require('../../src/writeback/SidecarPersistence');
        const sidecarUri = getSidecarUri(doc.uri);
        const existsBefore = await vscode.workspace.fs.stat(sidecarUri).then(() => true, () => false);
        assert.strictEqual(existsBefore, true);

        // Reset
        const successReset = await executeResetLayoutTransaction(doc);
        assert.strictEqual(successReset, true);

        // Document must be unchanged
        assert.strictEqual(doc.getText(), initialText);

        // Sidecar file should be deleted (or layouts entry removed)
        const existsAfter = await vscode.workspace.fs.stat(sidecarUri).then(() => true, () => false);
        assert.strictEqual(existsAfter, false);
    });

    it('fails closed with the anchor reason before applying a native move', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: 'graph TB\nPerson(User, "User")',
            language: 'c4x',
        });
        const anchor = captureAnchor(doc, createNativeDocumentBlock(doc));

        await replaceDocumentText(doc, 'graph TB\nPerson(Admin, "Admin")');
        const message: MoveElementMessage = {
            type: 'visualLayout.moveElement',
            protocolVersion: 1,
            revision: String(doc.version),
            id: 'Admin',
            x: 100,
            y: 200,
            input: 'keyboard',
        };

        try {
            await executeWritebackTransaction(doc, message, anchor);
            assert.fail('Expected stale anchor to fail before applyEdit.');
        } catch (error) {
            assert.ok(error instanceof WritebackTransactionError);
            assert.strictEqual(error.code, 'model_identity_changed');
        }
        assert.strictEqual(doc.getText(), 'graph TB\nPerson(Admin, "Admin")');
    });

    it('fails closed with the anchor reason before applying a native layout reset', async () => {
        const initialText = 'graph TB\nPerson(User, "User", $x="100", $y="200")';
        const doc = await vscode.workspace.openTextDocument({ content: initialText, language: 'c4x' });
        const anchor = captureAnchor(doc, createNativeDocumentBlock(doc));

        await replaceDocumentText(doc, `${initialText}\n`);

        try {
            await executeResetLayoutTransaction(doc, anchor);
            assert.fail('Expected stale anchor to fail before applyEdit.');
        } catch (error) {
            assert.ok(error instanceof WritebackTransactionError);
            assert.strictEqual(error.code, 'fingerprint_mismatch');
        }
        assert.ok(doc.getText().includes('$x="100"'));
    });

    it('resolves an anchored Markdown block after it moves within the same document', async () => {
        const target = c4xFence('graph TB\nPerson(User, "User")');
        const doc = await vscode.workspace.openTextDocument({
            content: `# Before\n\n${target}\nAfter\n`,
            language: 'markdown',
        });
        const block = findC4xFencedBlocks(doc)[0];
        assert.ok(block, 'Expected a C4X block to anchor.');
        const anchor = captureAnchor(doc, block);

        await replaceDocumentText(doc, `# New introduction\n\nMore prose.\n\n${target}\nAfter\n`);

        const result = resolveAnchor(doc, anchor);
        assert.strictEqual(result.valid, true);
        if (result.valid) {
            assert.strictEqual(doc.getText().slice(result.block.bodyRange.start, result.block.bodyRange.end), 'graph TB\nPerson(User, "User")\n');
        }
    });

    it('fails range_out_of_bounds when an anchored Markdown block is deleted', async () => {
        const doc = await vscode.workspace.openTextDocument({
            content: `# Architecture\n\n${c4xFence('graph TB\nPerson(User, "User")')}`,
            language: 'markdown',
        });
        const block = findC4xFencedBlocks(doc)[0];
        assert.ok(block, 'Expected a C4X block to anchor.');
        const anchor = captureAnchor(doc, block);

        await replaceDocumentText(doc, '# Architecture');

        assert.deepStrictEqual(resolveAnchor(doc, anchor), { valid: false, reason: 'range_out_of_bounds' });
    });

    it('fails fingerprint_mismatch when a second semantically identical Markdown block is inserted before the target', async () => {
        const target = c4xFence('graph TB\nPerson(User, "User")');
        const doc = await vscode.workspace.openTextDocument({
            content: target,
            language: 'markdown',
        });
        const block = findC4xFencedBlocks(doc)[0];
        assert.ok(block, 'Expected a C4X block to anchor.');
        const anchor = captureAnchor(doc, block);

        await replaceDocumentText(doc, c4xFence('graph TB\nPerson(User, "User")\n') + target);

        assert.deepStrictEqual(resolveAnchor(doc, anchor), { valid: false, reason: 'fingerprint_mismatch' });
    });
});
