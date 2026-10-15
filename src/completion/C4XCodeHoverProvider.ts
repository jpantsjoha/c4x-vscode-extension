import * as vscode from 'vscode';
import { DEFAULT_TEST_EXCLUDE, codePathProblem, toSearchGlob } from '../model/codePaths';
import { codeAttributeAt, isInsideC4xFence } from './codeAttribute';

/** Stop counting matches per glob after this many files. */
const MATCH_COUNT_LIMIT = 1000;
/** Counts are reused for this long, so moving the pointer across a line does not re-search. */
const CACHE_TTL_MS = 5000;
// A module constant, not user input.
// eslint-disable-next-line security/detect-non-literal-regexp
const TEST_FILE = new RegExp(DEFAULT_TEST_EXCLUDE);

interface GlobCount {
    readonly checked: number;
    readonly tests: number;
    readonly capped: boolean;
    readonly at: number;
}

/**
 * Hover for `$code="..."`: lists each glob and how many workspace files it
 * matches, so a glob that matches nothing is visible while authoring. This is
 * the editor-side view of lint rule C4X-L201, which the lint engine (#214)
 * will report as a diagnostic. Counts honour `files.exclude`, skip
 * `node_modules`, and leave out test files exactly as the conformance export does.
 */
export class C4XCodeHoverProvider implements vscode.HoverProvider {
    private readonly cache = new Map<string, GlobCount>();

    public async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
    ): Promise<vscode.Hover | undefined> {
        if (document.languageId === 'markdown' && !isInsideC4xFence(line => document.lineAt(line).text, position.line)) {
            return undefined;
        }
        const line = document.lineAt(position.line).text;
        const span = codeAttributeAt(line, position.character);
        if (!span) {
            return undefined;
        }

        const folder = vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0];
        const markdown = new vscode.MarkdownString();
        markdown.appendMarkdown('**Code mapping** (`$code`), relative to the workspace root\n\n');

        if (span.globs.length === 0) {
            markdown.appendMarkdown('No paths listed. Add at least one glob, such as `src/parser/**`.\n');
        }
        for (const glob of span.globs) {
            const problem = codePathProblem(glob);
            if (problem) {
                markdown.appendMarkdown(`- \`${glob}\`: invalid, ${problem}\n`);
                continue;
            }
            if (!folder) {
                markdown.appendMarkdown(`- \`${glob}\`\n`);
                continue;
            }
            const count = await this.count(folder, glob, token);
            if (!count) {
                return undefined;
            }
            const files = `${count.checked}${count.capped ? '+' : ''} file${count.checked === 1 ? '' : 's'}`;
            const tests = count.tests > 0 ? ` (plus ${count.tests} test file${count.tests === 1 ? '' : 's'}, not checked)` : '';
            markdown.appendMarkdown(count.checked === 0 && count.tests === 0
                ? `- \`${glob}\`: **matches no file** in ${folder.name}\n`
                : `- \`${glob}\`: ${files}${tests}\n`);
        }
        markdown.appendMarkdown('\nUsed by **C4X: Export Architecture Conformance**.');

        const range = new vscode.Range(position.line, span.start, position.line, span.end);
        return new vscode.Hover(markdown, range);
    }

    private async count(folder: vscode.WorkspaceFolder, glob: string, token: vscode.CancellationToken): Promise<GlobCount | undefined> {
        const key = `${folder.uri.toString()}\u0000${glob}`;
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
            return cached;
        }
        // `undefined` as the exclude keeps the user's files.exclude in force.
        const matches = await vscode.workspace.findFiles(
            new vscode.RelativePattern(folder, toSearchGlob(glob)), undefined, MATCH_COUNT_LIMIT, token,
        );
        if (token.isCancellationRequested) {
            return undefined;
        }
        const relative = matches
            .map(uri => vscode.workspace.asRelativePath(uri, false))
            .filter(path => !/(^|\/)node_modules\//.test(path));
        const tests = relative.filter(path => TEST_FILE.test(path)).length;
        const result: GlobCount = {
            checked: relative.length - tests,
            tests,
            capped: matches.length >= MATCH_COUNT_LIMIT,
            at: Date.now(),
        };
        this.cache.set(key, result);
        return result;
    }
}
