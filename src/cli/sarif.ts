/**
 * Minimal SARIF 2.1.0 output for `c4x-lint --format sarif`.
 *
 * The types are hand-written and cover only the properties C4X emits.
 * `@types/sarif` was not added: its last publish was 2025-08-03, and the subset
 * below is small enough to own. Specification:
 * https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
import { LINT_RULES } from '../model/lint';
import type { LintSeverity } from '../model/lint';
import { MODEL_RULE_ID, SYNTAX_RULE_ID } from './lintSource';
import type { FileReport } from './report';

export const SARIF_VERSION = '2.1.0';

/**
 * The CLI's own version, independent of the extension's: bump it when the
 * output formats, options or exit codes change. Written to SARIF and `--version`.
 */
export const C4X_LINT_VERSION = '0.1.0';
export const SARIF_SCHEMA = 'https://json.schemastore.org/sarif-2.1.0.json';
/** Where the rule catalogue is published; each rule's `helpUri` is an anchor in it. */
export const LINT_RULES_DOC_URL = 'https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/C4X-LINT-RULES.md';
/** Where `C4X-SYNTAX` and `C4X-MODEL`, which exist only outside the editor, are described. */
export const LINT_CLI_DOC_URL = 'https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/C4X-LINT-CLI.md';

export type SarifLevel = 'none' | 'note' | 'warning' | 'error';

export interface SarifMessage {
    text: string;
}

export interface SarifReportingDescriptor {
    id: string;
    name: string;
    shortDescription: SarifMessage;
    fullDescription?: SarifMessage;
    helpUri: string;
    defaultConfiguration: { level: SarifLevel };
}

export interface SarifRegion {
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
}

export interface SarifLocation {
    physicalLocation: {
        artifactLocation: { uri: string; uriBaseId: string };
        region: SarifRegion;
    };
}

export interface SarifResult {
    ruleId: string;
    ruleIndex: number;
    level: SarifLevel;
    message: SarifMessage;
    locations: SarifLocation[];
}

export interface SarifRun {
    tool: {
        driver: {
            name: string;
            semanticVersion: string;
            informationUri: string;
            rules: SarifReportingDescriptor[];
        };
    };
    columnKind: 'utf16CodeUnits';
    results: SarifResult[];
}

export interface SarifLog {
    $schema: string;
    version: typeof SARIF_VERSION;
    runs: SarifRun[];
}

/** SARIF calls `info` a note. */
export function sarifLevel(severity: LintSeverity): SarifLevel {
    return severity === 'info' ? 'note' : severity;
}

function ruleDescriptors(): SarifReportingDescriptor[] {
    const catalogue = LINT_RULES.map((rule): SarifReportingDescriptor => ({
        id: rule.id,
        name: rule.id.replace(/-/g, ''),
        shortDescription: { text: rule.title },
        fullDescription: { text: rule.rationale },
        helpUri: `${LINT_RULES_DOC_URL}#${rule.id.toLowerCase()}`,
        defaultConfiguration: { level: sarifLevel(rule.defaultSeverity) },
    }));
    return [
        ...catalogue,
        {
            id: SYNTAX_RULE_ID,
            name: 'C4XSyntax',
            shortDescription: { text: 'The diagram parses as C4X' },
            helpUri: `${LINT_CLI_DOC_URL}#what-is-linted`,
            defaultConfiguration: { level: 'error' },
        },
        {
            id: MODEL_RULE_ID,
            name: 'C4XModel',
            shortDescription: { text: 'The diagram builds a consistent model' },
            helpUri: `${LINT_CLI_DOC_URL}#what-is-linted`,
            defaultConfiguration: { level: 'error' },
        },
    ];
}

/** A relative POSIX path as a URI reference: each segment percent-encoded, the slashes kept. */
function toUriReference(file: string): string {
    return file.split('/').map(segment => encodeURIComponent(segment)).join('/');
}

/**
 * One SARIF run for every file. Paths stay relative to the directory the CLI
 * ran in, under `%SRCROOT%`, so no absolute workstation path leaves the machine.
 */
export function toSarif(reports: readonly FileReport[]): SarifLog {
    const rules = ruleDescriptors();
    const ruleIndex = new Map(rules.map((rule, index) => [rule.id, index]));
    const results: SarifResult[] = [];
    for (const report of reports) {
        for (const finding of report.findings) {
            results.push({
                ruleId: finding.ruleId,
                ruleIndex: ruleIndex.get(finding.ruleId) ?? -1,
                level: sarifLevel(finding.severity),
                message: { text: finding.hint ? `${finding.message} ${finding.hint}` : finding.message },
                locations: [{
                    physicalLocation: {
                        artifactLocation: { uri: toUriReference(report.file), uriBaseId: '%SRCROOT%' },
                        region: {
                            startLine: finding.line,
                            startColumn: finding.column,
                            endLine: finding.endLine,
                            // SARIF requires a non-empty region to end after it starts.
                            endColumn: finding.endLine === finding.line
                                ? Math.max(finding.endColumn, finding.column + 1)
                                : finding.endColumn,
                        },
                    },
                }],
            });
        }
    }
    return {
        $schema: SARIF_SCHEMA,
        version: SARIF_VERSION,
        runs: [{
            tool: {
                driver: {
                    name: 'c4x-lint',
                    semanticVersion: C4X_LINT_VERSION,
                    informationUri: LINT_RULES_DOC_URL,
                    rules,
                },
            },
            columnKind: 'utf16CodeUnits',
            results,
        }],
    };
}
