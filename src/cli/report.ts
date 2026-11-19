/**
 * Output formats for `c4x-lint`: `text` for a terminal, `github` for workflow
 * annotations, `json` for tools. SARIF lives in `./sarif`.
 */
import type { LintSeverity } from '../model/lint';
import { SEVERITY_ORDER, type HeadlessFinding } from './lintSource';

export type OutputFormat = 'text' | 'github' | 'json' | 'sarif';
export const OUTPUT_FORMATS: readonly OutputFormat[] = ['text', 'github', 'json', 'sarif'];

/** The findings for one file. `file` is relative to the working directory, with `/` separators. */
export interface FileReport {
    readonly file: string;
    readonly findings: readonly HeadlessFinding[];
}

export type SeverityCounts = Record<LintSeverity, number>;

export function countBySeverity(reports: readonly FileReport[]): SeverityCounts {
    const counts: SeverityCounts = { info: 0, warning: 0, error: 0 };
    for (const report of reports) {
        for (const finding of report.findings) {
            counts[finding.severity]++;
        }
    }
    return counts;
}

const CONTROL_ESCAPES: Readonly<Record<string, string>> = { '\n': '\\n', '\r': '\\r', '\t': '\\t' };

/**
 * The one definition of characters that must never reach line-oriented or
 * terminal output raw (#362): every character in the Unicode categories Cc
 * (C0 and C1 controls, DEL), Cf (format characters: bidi embeddings,
 * overrides, isolates and marks such as U+061C, U+200E and U+200F, the BOM,
 * soft hyphen, invisible operators, tag characters), Zl (U+2028) and Zp
 * (U+2029). These can break a line for a Unicode-aware reader, rewrite a
 * terminal, or make text read differently from what it contains.
 *
 * Two Cf characters are kept: U+200C ZERO WIDTH NON-JOINER and U+200D ZERO
 * WIDTH JOINER. Persian, Arabic and Indic scripts need them to spell words
 * correctly and emoji sequences need U+200D; they neither break a line nor
 * reorder text. The categories come from the Unicode data Node ships, so the
 * set follows Node's Unicode version.
 */
export const UNSAFE_OUTPUT_CHARACTERS = /(?![\u200c\u200d])[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** True when `char` (one code point) is in UNSAFE_OUTPUT_CHARACTERS. */
export function isUnsafeOutputCharacter(char: string): boolean {
    UNSAFE_OUTPUT_CHARACTERS.lastIndex = 0;
    const match = UNSAFE_OUTPUT_CHARACTERS.exec(char);
    return match !== null && match[0] === char;
}

function visibleEscape(char: string): string {
    const code = char.codePointAt(0)!;
    return CONTROL_ESCAPES[char] ?? (code <= 0xff
        ? `\\x${code.toString(16).padStart(2, '0')}`
        : code <= 0xffff ? `\\u${code.toString(16).padStart(4, '0')}` : `\\u{${code.toString(16)}}`);
}

/**
 * Make a string safe to print on one line: every UNSAFE_OUTPUT_CHARACTERS
 * character becomes a visible escape (`\n`, `\x1b`, `\x9b`, `\u2028`,
 * `\u202e`, `\u{e0041}`). Used by the `text` and `github` formats, the step
 * summary and every MCP output line that carries diagram or caller text.
 */
export function escapeControl(value: string): string {
    return value.replace(UNSAFE_OUTPUT_CHARACTERS, visibleEscape);
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** e.g. `3 files checked: 1 error, 0 warnings, 4 info`. */
export function summaryLine(fileCount: number, counts: SeverityCounts): string {
    return `${plural(fileCount, 'file')} checked: ${plural(counts.error, 'error')}, `
        + `${plural(counts.warning, 'warning')}, ${counts.info} info`;
}

function fullMessage(finding: HeadlessFinding): string {
    return finding.hint ? `${finding.message} ${finding.hint}` : finding.message;
}

/** `path:line:col: severity RULE message hint`, the shape editors and terminals link. */
export function formatText(reports: readonly FileReport[], fileCount: number, counts = countBySeverity(reports)): string {
    const lines: string[] = [];
    for (const report of reports) {
        for (const finding of report.findings) {
            lines.push(escapeControl(`${report.file}:${finding.line}:${finding.column}: ${finding.severity} ${finding.ruleId} ${fullMessage(finding)}`));
        }
    }
    lines.push(summaryLine(fileCount, counts));
    return `${lines.join('\n')}\n`;
}

/** Workflow-command escaping for the message part. */
function escapeData(value: string): string {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

/** Workflow-command escaping for a property value, which also reserves `:` and `,`. */
function escapeProperty(value: string): string {
    return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

const ANNOTATION_COMMAND: Record<LintSeverity, string> = { error: 'error', warning: 'warning', info: 'notice' };

/**
 * One `::error`, `::warning` or `::notice` workflow command per finding. Any
 * CI that does not understand them prints them as ordinary lines, and so does
 * a local shell, so the format is safe to use everywhere.
 */
export function formatGithub(reports: readonly FileReport[], fileCount: number, counts = countBySeverity(reports)): string {
    const lines: string[] = [];
    for (const report of reports) {
        for (const finding of report.findings) {
            const properties = [
                `file=${escapeProperty(escapeControl(report.file))}`,
                `line=${finding.line}`,
                `col=${finding.column}`,
                ...(finding.endLine !== finding.line ? [`endLine=${finding.endLine}`] : []),
                ...(finding.endLine === finding.line && finding.endColumn > finding.column ? [`endColumn=${finding.endColumn}`] : []),
                `title=${escapeProperty(finding.ruleId)}`,
            ];
            lines.push(`::${ANNOTATION_COMMAND[finding.severity]} ${properties.join(',')}::${escapeData(escapeControl(fullMessage(finding)))}`);
        }
    }
    lines.push(summaryLine(fileCount, counts));
    return `${lines.join('\n')}\n`;
}

/**
 * Make text literal in a Markdown table cell that a renderer may also read as
 * HTML (GitHub's step summary does both). Controls are escaped first, then
 * every ASCII punctuation character becomes a numeric character reference:
 * `<` and `&` cannot open a tag or an entity; backticks, brackets,
 * parentheses, asterisks, underscores, `#`, `>`, `-` and `!` cannot start
 * Markdown syntax; `:`, `/`, `.` and `@` cannot form an autolink; `|` cannot
 * split the cell. A character reference always renders as the character
 * itself, so the text reads the same (#362).
 */
export function markdownCell(value: string): string {
    return escapeControl(value).replace(/[!-/:-@[-`{-~]/g, char => `&#${char.charCodeAt(0)};`);
}

const cell = markdownCell;

/**
 * A Markdown summary for `GITHUB_STEP_SUMMARY`: the counts, then one row per
 * finding, most severe first. Written only when that variable is set.
 */
export function formatStepSummary(reports: readonly FileReport[], fileCount: number, counts = countBySeverity(reports)): string {
    const rows: Array<{ file: string; finding: HeadlessFinding }> = [];
    for (const report of reports) {
        for (const finding of report.findings) {
            rows.push({ file: report.file, finding });
        }
    }
    rows.sort((a, b) => SEVERITY_ORDER.indexOf(b.finding.severity) - SEVERITY_ORDER.indexOf(a.finding.severity));
    const lines = ['## C4X lint', '', summaryLine(fileCount, counts), ''];
    if (rows.length > 0) {
        lines.push('| Severity | Rule | Location | Finding |', '|---|---|---|---|');
        for (const { file, finding } of rows) {
            lines.push(`| ${finding.severity} | ${finding.ruleId} | ${cell(`${file}:${finding.line}`)} | ${cell(fullMessage(finding))} |`);
        }
        lines.push('');
    }
    return `${lines.join('\n')}\n`;
}

/**
 * JSON.stringify, with every UNSAFE_OUTPUT_CHARACTERS character written as
 * `\\uXXXX` escapes (a surrogate pair for one outside the BMP). JSON.stringify
 * escapes C0 controls but emits the rest raw; a terminal or viewer showing the
 * output would then act on them. The escapes decode to the same strings (#362).
 */
export function safeJsonStringify(value: unknown): string {
    // Inside strings JSON.stringify already escapes C0 controls, so a raw
    // newline in its output is formatting between tokens and is kept.
    const jsonEscape = (char: string) => Array.from({ length: char.length }, (_, index) =>
        `\\u${char.charCodeAt(index).toString(16).padStart(4, '0')}`).join('');
    return JSON.stringify(value, null, 2).replace(UNSAFE_OUTPUT_CHARACTERS, char => (char === '\n' ? char : jsonEscape(char)));
}

/** Stable JSON: the summary counts and every finding with its file. */
export function formatJson(reports: readonly FileReport[], fileCount: number, counts = countBySeverity(reports)): string {
    const findings = reports.flatMap(report => report.findings.map(finding => ({ file: report.file, ...finding })));
    return `${safeJsonStringify({ files: fileCount, summary: counts, findings })}\n`;
}
