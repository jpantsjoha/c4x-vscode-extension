import * as vscode from 'vscode';
import { C4ModelBuilder } from '../model/C4ModelBuilder';
import type { C4Model, C4ModelDiagnostic } from '../model/C4Model';
import { isBundledSprite } from '../render/ElementRenderer';
import type { ParseResult } from '../parser/types';
import {
    findingAnchor,
    lintModel,
    normalizeLintOptions,
    type LintFinding,
    type LintOptions,
    type LintSeverity,
} from '../model/lint';

/** Shown next to the rule id in the Problems panel, e.g. `C4X lint(C4X-L003)`. */
export const LINT_DIAGNOSTIC_SOURCE = 'C4X lint';

/** The editor's builder: the shared bundled sprite check, as in c4x-lint and lint_c4x. */
const editorModelBuilder = new C4ModelBuilder({ isKnownSprite: isBundledSprite });

/** Read `c4x.lint.enabled` and `c4x.lint.rules` for a document, dropping malformed values. */
export function readLintOptions(scope?: vscode.Uri): LintOptions {
    const config = vscode.workspace.getConfiguration('c4x', scope);
    return normalizeLintOptions(config.get<unknown>('lint.enabled'), config.get<unknown>('lint.rules'));
}

function toDiagnosticSeverity(severity: LintSeverity): vscode.DiagnosticSeverity {
    switch (severity) {
        case 'error':
            return vscode.DiagnosticSeverity.Error;
        case 'warning':
            return vscode.DiagnosticSeverity.Warning;
        default:
            return vscode.DiagnosticSeverity.Information;
    }
}

/**
 * Where a finding goes in the document: the target's own source range, cut to
 * its first line so a boundary block is not underlined from top to bottom;
 * else the whole declaration line of the element a relationship starts from;
 * else the first line of the source. `lineOffset` is the 0-based document line
 * the C4X source starts on — 0 for a `.c4x` file, the first line inside the
 * fence for Markdown.
 */
function toRange(finding: LintFinding, model: C4Model, lineOffset: number): vscode.Range {
    if (finding.range) {
        const { start, end } = finding.range;
        const line = lineOffset + start.line - 1;
        return end.line === start.line
            ? new vscode.Range(line, start.column - 1, line, end.column - 1)
            : new vscode.Range(line, start.column - 1, line, Number.MAX_VALUE);
    }
    const anchor = findingAnchor(finding, model);
    const line = lineOffset + (anchor ? anchor.start.line - 1 : 0);
    return new vscode.Range(line, 0, line, Number.MAX_VALUE);
}

/**
 * Lint diagnostics for one successfully parsed C4X source.
 *
 * Never throws and never blocks anything: the preview renders from its own
 * parse, and a source the model builder rejects (an unknown relationship
 * endpoint, a duplicate id) simply has nothing to lint — the preview reports
 * that error. A defect in a rule must not cost the user their syntax
 * diagnostics, so any failure yields no lint diagnostics rather than an
 * exception.
 */
export function lintDiagnostics(parsed: ParseResult, options: LintOptions, lineOffset: number): vscode.Diagnostic[] {
    try {
        const model = editorModelBuilder.build(parsed, 'diagnostics');
        // Element style diagnostics (#322) are model checks, not notation
        // rules: `c4x.lint.enabled: false` does not hide them.
        const styleDiagnostics = (model.diagnostics ?? []).map(entry => toModelDiagnostic(entry, lineOffset));
        if (options.enabled === false) {
            return styleDiagnostics;
        }
        return [...lintModel(model, options).map(finding => {
            const diagnostic = new vscode.Diagnostic(
                toRange(finding, model, lineOffset),
                `${finding.message} ${finding.hint}`,
                toDiagnosticSeverity(finding.severity),
            );
            diagnostic.code = finding.ruleId;
            diagnostic.source = LINT_DIAGNOSTIC_SOURCE;
            return diagnostic;
        }), ...styleDiagnostics];
    } catch {
        return [];
    }
}

function toModelDiagnostic(entry: C4ModelDiagnostic, lineOffset: number): vscode.Diagnostic {
    let range: vscode.Range;
    if (entry.range) {
        const { start, end } = entry.range;
        const line = lineOffset + start.line - 1;
        range = end.line === start.line
            ? new vscode.Range(line, start.column - 1, line, end.column - 1)
            : new vscode.Range(line, start.column - 1, line, Number.MAX_VALUE);
    } else {
        range = new vscode.Range(lineOffset, 0, lineOffset, Number.MAX_VALUE);
    }
    const diagnostic = new vscode.Diagnostic(range, entry.message, toDiagnosticSeverity(entry.severity));
    diagnostic.code = entry.code;
    diagnostic.source = LINT_DIAGNOSTIC_SOURCE;
    return diagnostic;
}
