/**
 * Headless C4X lint: the notation rule engine with no VS Code dependency.
 *
 * The editor reports lint through `src/diagnostics/lintDiagnostics.ts`; this
 * module reports the same findings as plain records, for the `c4x-lint` CLI and
 * the MCP `lint_c4x` tool. Two things differ from the editor, deliberately:
 *
 * - A syntax error is a finding here (`C4X-SYNTAX`, always `error`). In the
 *   editor the syntax diagnostic comes from the same manager, so nothing is
 *   lost; headless, a file that does not parse must not pass silently.
 * - A source the model builder rejects (a duplicate id, a relationship to an
 *   unknown element) is a finding too (`C4X-MODEL`, always `error`). The editor
 *   leaves that to the preview, which refuses to render it; headless, there is
 *   no preview to say so.
 */
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import type { C4Model } from '../model/C4Model';
import { findingAnchor, lintModel, type LintFinding, type LintOptions, type LintSeverity } from '../model/lint';
import { c4xParser } from '../parser/C4XParser';
import { C4XParseError, type ParseResult } from '../parser/types';
import { findC4xFencedBlocksInSource } from '../writeback/SaveAnchor';

/** Rule id for a source the C4X parser rejects. Not a catalogue rule: it cannot be configured. */
export const SYNTAX_RULE_ID = 'C4X-SYNTAX';
/** Rule id for a parsed source the model builder rejects. Not configurable either. */
export const MODEL_RULE_ID = 'C4X-MODEL';

/**
 * A fault inside the rule engine, not a problem with the diagram. The editor
 * swallows it and shows no lint; headless callers must not, because a gate
 * that passes when its checker broke is not a gate. The CLI exits 2 and the
 * MCP tool returns an error.
 */
export class LintEngineError extends Error {
    constructor(cause: unknown) {
        super(`C4X lint failed internally: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = 'LintEngineError';
    }
}

/** What kind of file a source came from, which decides where the C4X is. */
export type SourceKind = 'c4x' | 'markdown';

/**
 * One finding with a file-relative location. Lines and columns are 1-based;
 * `endColumn` is exclusive, as in SARIF. `ruleId` is a catalogue id, or
 * `C4X-SYNTAX` / `C4X-MODEL`.
 */
export interface HeadlessFinding {
    readonly ruleId: string;
    readonly severity: LintSeverity;
    readonly message: string;
    /** How to fix it. Empty for syntax and model errors, whose message says it. */
    readonly hint: string;
    readonly line: number;
    readonly column: number;
    readonly endLine: number;
    readonly endColumn: number;
}

/** Severity order, lowest first. */
export const SEVERITY_ORDER: readonly LintSeverity[] = ['info', 'warning', 'error'];

/** `true` when `severity` is at or above `threshold`. */
export function atOrAbove(severity: LintSeverity, threshold: LintSeverity): boolean {
    return SEVERITY_ORDER.indexOf(severity) >= SEVERITY_ORDER.indexOf(threshold);
}

function pointFinding(ruleId: string, message: string, line: number, column: number): HeadlessFinding {
    return { ruleId, severity: 'error', message, hint: '', line, column, endLine: line, endColumn: column };
}

function locate(finding: LintFinding, model: C4Model, lineOffset: number): Pick<HeadlessFinding, 'line' | 'column' | 'endLine' | 'endColumn'> {
    const range = finding.range ?? findingAnchor(finding, model);
    if (!range) {
        return { line: lineOffset + 1, column: 1, endLine: lineOffset + 1, endColumn: 1 };
    }
    return {
        line: lineOffset + range.start.line,
        column: range.start.column,
        endLine: lineOffset + range.end.line,
        endColumn: range.end.column,
    };
}

/**
 * Lint one C4X source. `lineOffset` is the number of lines before it in its
 * file: 0 for a `.c4x` file, the line count up to the fence body in Markdown.
 * Blank sources yield nothing, as in the editor. Throws `LintEngineError`
 * only when a rule itself fails.
 */
export function lintC4xSource(text: string, options: LintOptions, lineOffset = 0): HeadlessFinding[] {
    if (!text.trim()) {
        return [];
    }
    let parsed: ParseResult;
    try {
        parsed = c4xParser.parse(text);
    } catch (error) {
        const location = error instanceof C4XParseError ? error.location : undefined;
        const message = error instanceof Error ? error.message : 'Unknown parser error';
        return [pointFinding(
            SYNTAX_RULE_ID,
            `C4X syntax error: ${message}`,
            lineOffset + Math.max(1, location?.line ?? 1),
            Math.max(1, location?.column ?? 1),
        )];
    }
    let model: C4Model;
    try {
        model = c4ModelBuilder.build(parsed, 'lint');
    } catch (error) {
        // The builder's location is an index into the element list, not a
        // source line, so the finding sits at the start of the source.
        const message = error instanceof Error ? error.message : 'Unknown model error';
        return [pointFinding(MODEL_RULE_ID, `C4X model error: ${message}`, lineOffset + 1, 1)];
    }
    // `enabled: false` switches the notation rules off, never the syntax and
    // model checks above: a diagram that cannot be drawn is never clean.
    if (options.enabled === false) {
        return [];
    }
    try {
        return lintModel(model, options).map(finding => ({
            ruleId: finding.ruleId,
            severity: finding.severity,
            message: finding.message,
            hint: finding.hint,
            ...locate(finding, model, lineOffset),
        }));
    } catch (error) {
        throw new LintEngineError(error);
    }
}

function countLines(text: string, end: number): number {
    let lines = 0;
    for (let index = text.indexOf('\n'); index !== -1 && index < end; index = text.indexOf('\n', index + 1)) {
        lines++;
    }
    return lines;
}

/**
 * Lint a whole file: the file itself for `.c4x`, every `c4x` fence for
 * Markdown. Fences are found by `findC4xFencedBlocksInSource`, the scanner the
 * editor's writeback uses, so they share its limits (#209).
 */
export function lintFileText(rawText: string, kind: SourceKind, options: LintOptions): HeadlessFinding[] {
    // A UTF-8 byte order mark is not part of the text: the parser would reject
    // it as a stray character on line 1, and it would shift every column there.
    const text = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
    if (kind === 'c4x') {
        return lintC4xSource(text, options);
    }
    const findings: HeadlessFinding[] = [];
    for (const block of findC4xFencedBlocksInSource(text)) {
        const body = text.slice(block.bodyRange.start, block.bodyRange.end);
        findings.push(...lintC4xSource(body, options, countLines(text, block.bodyRange.start)));
    }
    return findings;
}
