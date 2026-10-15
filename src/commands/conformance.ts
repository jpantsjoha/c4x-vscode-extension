/**
 * C4X: Export Architecture Conformance, and C4X: Check Architecture
 * Conformance from a dependency-cruiser result (#219).
 *
 * Thin VS Code shells around the pure core in `src/conformance/`: they pick
 * files, write the allow-list, and publish findings as diagnostics on the
 * `.c4x` lines. No checker runs inside the extension.
 */

import * as vscode from 'vscode';
import {
    CONFORMANCE_CONFIG_FILE,
    ConformanceFinding,
    ConformanceInputError,
    conformFromDependencyCruiser,
    countMappedSourceFiles,
    exportDependencyCruiserAllowList,
    formatConformanceResult,
    formatExportReport,
    loadComponentView,
    parseDepCruiseResult,
    realRelativePaths,
    serializeConfig,
    toSearchGlob,
} from '../conformance';
import * as fs from 'fs';

/** Upper bound for the on-disk file count behind the coverage check. */
const MAX_COUNTED_FILES = 20000;

let output: vscode.OutputChannel | undefined;
let diagnostics: vscode.DiagnosticCollection | undefined;

function channel(): vscode.OutputChannel {
    output ??= vscode.window.createOutputChannel('C4X Conformance');
    return output;
}

/** The active `.c4x` document, or an error message explaining why there is none. */
function activeC4xDocument(): vscode.TextDocument | undefined {
    const document = vscode.window.activeTextEditor?.document;
    if (!document || document.languageId !== 'c4x') {
        void vscode.window.showErrorMessage('C4X: Open a .c4x file with a component (C3) view to check architecture conformance.');
        return undefined;
    }
    return document;
}

function loadView(document: vscode.TextDocument): ReturnType<typeof loadComponentView> | undefined {
    try {
        return loadComponentView(document.getText(), document.fileName);
    } catch (error) {
        const location = (error as { location?: { line: number; column: number } }).location;
        const where = location ? ` (line ${location.line})` : '';
        void vscode.window.showErrorMessage(`C4X: ${error instanceof Error ? error.message : String(error)}${where}`);
        return undefined;
    }
}

function workspaceRootFor(document: vscode.TextDocument): vscode.Uri | undefined {
    return (vscode.workspace.getWorkspaceFolder(document.uri) ?? vscode.workspace.workspaceFolders?.[0])?.uri;
}

export async function exportConformanceCommand(): Promise<vscode.Uri | undefined> {
    const document = activeC4xDocument();
    const view = document && loadView(document);
    if (!document || !view) {
        return undefined;
    }
    const exported = exportDependencyCruiserAllowList(view);
    const relative = vscode.workspace.asRelativePath(document.uri);
    const report = formatExportReport(exported, relative);
    channel().appendLine(report);

    if (exported.mapped.length === 0) {
        void vscode.window.showErrorMessage(
            'C4X: No Container or Component in this view has a $code mapping, so there is nothing to export. ' +
            'Add $code="src/your-module/**" to the components first.',
        );
        return undefined;
    }

    const root = workspaceRootFor(document);
    const target = await vscode.window.showSaveDialog({
        title: 'Export Architecture Conformance (dependency-cruiser allow-list)',
        defaultUri: root ? vscode.Uri.joinPath(root, CONFORMANCE_CONFIG_FILE) : undefined,
        filters: { JSON: ['json'] },
    });
    if (!target) {
        return undefined;
    }
    await vscode.workspace.fs.writeFile(target, Buffer.from(serializeConfig(exported.config), 'utf8'));
    channel().appendLine(`Wrote ${target.fsPath}`);

    const gaps = exported.unmapped.length + exported.skippedRelationships.length;
    const message = `C4X: Wrote ${exported.relationshipRules} relationship rule(s) for ${exported.mapped.length} component(s).` +
        (exported.unmapped.length > 0 ? ` ${exported.unmapped.length} component(s) have no $code and are not checked.` : '') +
        ' Run dependency-cruiser from the workspace root (Node 22 or later).';
    const choice = await vscode.window.showInformationMessage(message, 'Copy Run Command', gaps > 0 ? 'Show Report' : 'Show Output');
    if (choice === 'Copy Run Command') {
        await vscode.env.clipboard.writeText(exported.suggestedCommand);
    } else if (choice) {
        channel().show(true);
    }
    return target;
}

function toDiagnostic(document: vscode.TextDocument, finding: ConformanceFinding): vscode.Diagnostic {
    const line = Math.min(Math.max(finding.span.line - 1, 0), Math.max(document.lineCount - 1, 0));
    const endLine = Math.min(Math.max(finding.span.endLine - 1, line), Math.max(document.lineCount - 1, 0));
    const start = new vscode.Position(line, Math.max(finding.span.column - 1, 0));
    const end = endLine === line && finding.span.endColumn <= finding.span.column
        ? document.lineAt(line).range.end
        : new vscode.Position(endLine, Math.max(finding.span.endColumn - 1, 0));
    const severity = finding.severity === 'error'
        ? vscode.DiagnosticSeverity.Error
        : finding.severity === 'warning' ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Information;
    const evidence = (finding.evidence ?? []).map(edge => `\n  ${edge.from} -> ${edge.to}`).join('');
    const more = finding.edgeCount && finding.evidence && finding.edgeCount > finding.evidence.length
        ? `\n  ... and ${finding.edgeCount - finding.evidence.length} more` : '';
    const diagnostic = new vscode.Diagnostic(new vscode.Range(start, end), `${finding.message}${evidence}${more}`, severity);
    diagnostic.source = 'c4x-conformance';
    diagnostic.code = finding.kind;
    return diagnostic;
}

export async function conformFromDependencyCruiserCommand(): Promise<number | undefined> {
    const document = activeC4xDocument();
    const view = document && loadView(document);
    if (!document || !view) {
        return undefined;
    }
    const root = workspaceRootFor(document);
    const picked = await vscode.window.showOpenDialog({
        title: 'Select a dependency-cruiser JSON result (--output-type json)',
        defaultUri: root,
        canSelectMany: false,
        filters: { JSON: ['json'] },
    });
    if (!picked || picked.length === 0) {
        return undefined;
    }

    let result;
    try {
        const text = Buffer.from(await vscode.workspace.fs.readFile(picked[0])).toString('utf8');
        // Count the mapped source files on disk, so a cruise that saw few of them fails loudly.
        let expectedSourceFiles: number | undefined;
        if (root) {
            const scope = exportDependencyCruiserAllowList(view).scope;
            const found = await Promise.all(scope.map(glob => vscode.workspace.findFiles(
                new vscode.RelativePattern(root, toSearchGlob(glob)), '**/node_modules/**', MAX_COUNTED_FILES)));
            const uris = found.flat();
            // findFiles follows symbolic links (search.followSymlinks defaults to true), so the same
            // file can come back under several paths. Collapsing them onto real paths keeps the
            // count a lower bound for the coverage guard, which is all it needs to be.
            // (dependency-cruiser itself keeps the link path for a module reached through a
            // non-cyclic symlink; only resolved dependency targets are real paths.)
            const relative = root.scheme === 'file'
                ? realRelativePaths(uris.map(uri => uri.fsPath), root.fsPath, absolute => {
                    try {
                        // A path findFiles just returned from the workspace; resolving it reads nothing.
                        // eslint-disable-next-line security/detect-non-literal-fs-filename
                        return fs.realpathSync(absolute);
                    } catch {
                        return undefined;
                    }
                })
                : uris.map(uri => vscode.workspace.asRelativePath(uri, false));
            expectedSourceFiles = countMappedSourceFiles(view, relative);
        }
        result = conformFromDependencyCruiser(view, parseDepCruiseResult(text), { expectedSourceFiles });
    } catch (error) {
        const message = error instanceof ConformanceInputError || error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`C4X: ${message}`);
        return undefined;
    }

    diagnostics?.set(document.uri, result.findings.map(finding => toDiagnostic(document, finding)));
    channel().appendLine(formatConformanceResult(result, vscode.workspace.asRelativePath(document.uri)));
    const summary = result.errorCount === 0
        ? `C4X: The code conforms to this view (${result.warningCount} warning(s)).`
        : `C4X: ${result.errorCount} conformance error(s), ${result.warningCount} warning(s). See the Problems panel.`;
    if (result.errorCount === 0) {
        void vscode.window.showInformationMessage(summary);
    } else {
        void vscode.window.showWarningMessage(summary);
    }
    return result.errorCount;
}

/** Register both commands and the diagnostics they publish. */
export function registerConformanceCommands(context: vscode.ExtensionContext): void {
    diagnostics = vscode.languages.createDiagnosticCollection('c4x-conformance');
    context.subscriptions.push(
        diagnostics,
        vscode.commands.registerCommand('c4x.exportConformance', exportConformanceCommand),
        vscode.commands.registerCommand('c4x.conformFromDependencyCruiser', conformFromDependencyCruiserCommand),
        // Findings describe the text they were computed from; editing it makes them stale.
        vscode.workspace.onDidChangeTextDocument(event => {
            if (event.contentChanges.length > 0) {
                diagnostics?.delete(event.document.uri);
            }
        }),
        vscode.workspace.onDidCloseTextDocument(document => diagnostics?.delete(document.uri)),
        { dispose: () => { output?.dispose(); output = undefined; diagnostics = undefined; } },
    );
}
