/**
 * C4X notation lint in a real VS Code (#214): findings reach the Problems panel
 * for `.c4x` documents and Markdown fences, and follow `c4x.lint.*` settings
 * without waiting for an edit.
 */
import * as assert from 'assert';
import * as vscode from 'vscode';

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(web, "Web", "React", "Browser UI")',
    '    Container(api, "API", "Node.js", "JSON API")',
    '    web --> api',
    '',
].join('\n');

function lintDiagnostics(uri: vscode.Uri): vscode.Diagnostic[] {
    return vscode.languages.getDiagnostics(uri).filter(diagnostic => diagnostic.source === 'C4X lint');
}

async function waitFor(description: string, probe: () => boolean, timeoutMs = 10_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!probe()) {
        if (Date.now() > deadline) {
            assert.fail(`Timed out waiting for ${description}`);
        }
        await new Promise(resolve => setTimeout(resolve, 50));
    }
}

describe('C4X notation lint in the Problems panel (#214)', () => {
    const config = () => vscode.workspace.getConfiguration('c4x');

    afterEach(async () => {
        await config().update('lint.rules', undefined, vscode.ConfigurationTarget.Global);
        await config().update('lint.enabled', undefined, vscode.ConfigurationTarget.Global);
    });

    it('reports findings for an open .c4x document, with the rule id as the code', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'c4x', content: SOURCE });
        await waitFor('lint diagnostics', () => lintDiagnostics(document.uri).length === 2);

        const diagnostics = lintDiagnostics(document.uri);
        assert.deepStrictEqual(diagnostics.map(diagnostic => diagnostic.code), ['C4X-L003', 'C4X-L004']);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.severity, vscode.DiagnosticSeverity.Information);
            assert.strictEqual(diagnostic.range.start.line, 4);
            assert.strictEqual(document.getText(diagnostic.range), 'web --> api');
        }
    });

    it('places findings from a Markdown fence on the document line that holds them', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'markdown',
            content: `# Architecture\n\n\`\`\`c4x\n${SOURCE}\`\`\`\n`,
        });
        await waitFor('lint diagnostics in Markdown', () => lintDiagnostics(document.uri).length === 2);

        for (const diagnostic of lintDiagnostics(document.uri)) {
            assert.strictEqual(document.getText(diagnostic.range), 'web --> api');
        }
    });

    it('re-checks open documents when a rule\'s severity changes, and clears them when lint is disabled', async () => {
        const document = await vscode.workspace.openTextDocument({ language: 'c4x', content: SOURCE });
        await waitFor('lint diagnostics', () => lintDiagnostics(document.uri).length === 2);

        await config().update('lint.rules', { 'C4X-L003': 'error', 'C4X-L004': 'off' }, vscode.ConfigurationTarget.Global);
        await waitFor('the override', () => {
            const diagnostics = lintDiagnostics(document.uri);
            return diagnostics.length === 1 && diagnostics[0].severity === vscode.DiagnosticSeverity.Error;
        });
        assert.strictEqual(lintDiagnostics(document.uri)[0].code, 'C4X-L003');

        await config().update('lint.enabled', false, vscode.ConfigurationTarget.Global);
        await waitFor('lint to clear', () => lintDiagnostics(document.uri).length === 0);
    });

    it('keeps a syntax error and adds no lint for a document that does not parse', async () => {
        const document = await vscode.workspace.openTextDocument({
            language: 'c4x',
            content: '%%{ c4: container }%%\ngraph TB\n    Container(web, "Web"\n',
        });
        await waitFor('the syntax error', () => vscode.languages.getDiagnostics(document.uri).length > 0);

        const diagnostics = vscode.languages.getDiagnostics(document.uri);
        assert.ok(diagnostics.every(diagnostic => diagnostic.severity === vscode.DiagnosticSeverity.Error));
        assert.deepStrictEqual(lintDiagnostics(document.uri), []);
    });
});
