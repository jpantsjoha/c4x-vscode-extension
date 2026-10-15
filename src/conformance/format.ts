/**
 * Text renderings of a conformance result. `text` is for terminals and the
 * output channel; `github` emits workflow commands (`::error file=...`) so a
 * CI log annotates the `.c4x` lines: the default output planned for the
 * headless CLI (#216).
 */

import { ConformanceExport } from './dependencyCruiser';
import { ConformanceFinding, ConformanceResult } from './conform';

export type ConformanceFormat = 'text' | 'github';

function evidenceLines(finding: ConformanceFinding): string[] {
    const lines = (finding.evidence ?? []).map(edge => `    ${edge.from} -> ${edge.to}`);
    const total = finding.edgeCount ?? finding.evidence?.length ?? 0;
    if (finding.evidence && total > finding.evidence.length) {
        lines.push(`    ... and ${total - finding.evidence.length} more`);
    }
    return lines;
}

function summaryLine(result: ConformanceResult): string {
    const verdict = result.errorCount === 0 ? 'conforms' : 'does not conform';
    return `C4X conformance: ${verdict} — ${result.errorCount} error(s), ${result.warningCount} warning(s), ` +
        `${result.infoCount} note(s); ${result.modulesCruised} module(s) cruised, ${result.observedEdges.length} component edge(s) observed.` +
        (result.graphAvailable ? '' : ' The input had no module graph, so cycles and unused relationships were not computed.');
}

/** GitHub workflow commands escape `%`, CR and LF in messages, plus `,` and `:` in properties. */
function escapeData(value: string): string {
    return value.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(value: string): string {
    return escapeData(value).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

export function formatConformanceResult(result: ConformanceResult, c4xFile: string, format: ConformanceFormat = 'text'): string {
    const lines: string[] = [];
    for (const finding of result.findings) {
        const { line, column, endLine, endColumn } = finding.span;
        if (format === 'github') {
            const command = finding.severity === 'error' ? 'error' : finding.severity === 'warning' ? 'warning' : 'notice';
            const detail = [finding.message, ...evidenceLines(finding).map(l => l.trim())].join('\n');
            lines.push(
                `::${command} file=${escapeProperty(c4xFile)},line=${line},col=${column},endLine=${endLine},endColumn=${endColumn},` +
                `title=${escapeProperty(`C4X ${finding.kind}`)}::${escapeData(detail)}`,
            );
        } else {
            lines.push(`${c4xFile}:${line}:${column}: ${finding.severity} [${finding.kind}] ${finding.message}`);
            lines.push(...evidenceLines(finding));
        }
    }
    lines.push(summaryLine(result));
    return `${lines.join('\n')}\n`;
}

/** What the export did, including everything it could not turn into a rule. */
export function formatExportReport(exported: ConformanceExport, c4xFile: string): string {
    const lines: string[] = [
        `C4X conformance export from ${c4xFile}: ${exported.relationshipRules} relationship rule(s), ` +
        `${exported.mapped.length} component(s) mapped, ${exported.unmapped.length} without $code, ` +
        `${exported.skippedRelationships.length} relationship(s) skipped.`,
        `Scope: ${exported.scope.length > 0 ? exported.scope.join(', ') : '(none: no element has $code)'}`,
    ];
    for (const element of exported.unmapped) {
        lines.push(`${c4xFile}:${element.span.line}:${element.span.column}: note: ${element.id} (${element.type}) has no $code; its dependencies are not checked.`);
    }
    for (const rel of exported.skippedRelationships) {
        lines.push(`${c4xFile}:${rel.span.line}:${rel.span.column}: note: ${rel.from} --> ${rel.to} produced no rule: ${rel.reason}.`);
    }
    lines.push(`Run: ${exported.suggestedCommand}`);
    lines.push('For CI, pin dependency-cruiser and typescript as exact devDependencies in your lockfile and run `npx depcruise` with the same arguments.');
    return `${lines.join('\n')}\n`;
}
