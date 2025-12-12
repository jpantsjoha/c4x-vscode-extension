
import * as assert from 'assert';
import * as vscode from 'vscode';
import { CodeContextExtractor } from '../../src/ai/CodeContextExtractor';

describe('Context Depth & Ignore Integration Test', function () {
    this.timeout(10000);

    before(function () {
        if (!vscode.workspace.workspaceFolders) {
            this.skip();
        }
    });

    it('Should respect depth limits and ignore patterns', async () => {
        const extractor = new CodeContextExtractor();

        // Workspace check already done in before()
        const root = vscode.workspace.workspaceFolders![0].uri;

        console.log(`Scanning context from: ${root.fsPath}`);
        const files = await extractor.extractContext(root);

        console.log(`Found ${files.length} files in context.`);

        // Assertions
        // 1. Check for absence of ignored files
        const hasNodeModules = files.some(f => f.path.includes('node_modules'));
        const hasTest = files.some(f => f.path.includes('test/'));
        const hasGit = files.some(f => f.path.includes('.git'));
        const hasDist = files.some(f => f.path.includes('dist/'));

        assert.strictEqual(hasNodeModules, false, 'Should ignore node_modules');
        assert.strictEqual(hasGit, false, 'Should ignore .git');
        assert.strictEqual(hasDist, false, 'Should ignore dist');

        // "test/" was added to ignore patterns in CodeContextExtractor.ts
        // Verify it is ignored
        assert.strictEqual(hasTest, false, 'Should ignore contents of test/ folder');

        // 2. Check Depth (Heuristic)
        // If the pattern is {*,*/*,*/*/*}, maximum slashes in relative path should be 2?
        // path: "src/ai/GeminiService.ts" -> 2 slashes? No, 'src/ai' is folder.
        // relPath "src/ai/GeminiService.ts" -> 2 slashes.
        // relPath "src/commands/GenerateDiagramCommand.ts" -> 2 slashes.
        // relPath "README.md" -> 0 slashes.

        files.forEach(f => {
            const depth = f.path.split('/').length - 1;
            // Allow up to 2 slashes (e.g. dir/dir/file)
            // But wait, {*,*/*,*/*/*}
            // * = file
            // */* = dir/file
            // */*/* = dir/dir/file
            // So depth count:
            // file -> 0 slashes
            // dir/file -> 1 slash
            // dir/dir/file -> 2 slashes

            // If we have dir/dir/dir/file -> 3 slashes -> Should be excluded.
            if (depth > 2) {
                console.warn(`Found deep file: ${f.path}`);
            }
            assert.ok(depth <= 2, `File ${f.path} is too deep (depth ${depth})`);
        });
    });
});
