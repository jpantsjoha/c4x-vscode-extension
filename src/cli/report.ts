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
 * Make a string safe to print on one line: every C0 control character and
 * DEL becomes a visible escape (`\n`, `\x1b`). A file name may legally hold
 * a newline, which would otherwise forge a second finding or annotation, or
 * an escape sequence that rewrites the terminal.
 */
export function escapeControl(value: string): string {
    // eslint-disable-next-line no-control-regex
    return value.replace(/[\u0000-\u001f\u007f]/g, char =>
        CONTROL_ESCAPES[char] ?? `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`);
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

/** Escape a Markdown table cell. */
function cell(value: string): string {
    return escapeControl(value).replace(/\|/g, '\\|');
}

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

/** Stable JSON: the summary counts and every finding with its file. */
export function formatJson(reports: readonly FileReport[], fileCount: number, counts = countBySeverity(reports)): string {
    const findings = reports.flatMap(report => report.findings.map(finding => ({ file: report.file, ...finding })));
    return `${JSON.stringify({ files: fileCount, summary: counts, findings }, null, 2)}\n`;
}
