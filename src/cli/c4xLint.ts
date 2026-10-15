/**
 * `c4x-lint`: the C4X notation rules outside VS Code — in a Git hook, a CI job
 * or an agent loop. No `vscode` import anywhere below this file; the bundle in
 * `cli/c4x-lint.cjs` is built from `./main.ts` and fails its build if one
 * appears.
 *
 * Exit codes: 0 when nothing reaches `--max-severity`, 1 when a finding does,
 * 2 for a usage, configuration or input error, or a fault in the rule engine.
 */
import * as fs from 'fs';
import * as path from 'path';
import type { LintSeverity } from '../model/lint';
import { ConfigError, DEFAULT_CONFIG_FILE, loadConfig } from './config';
import { expandInputs, sourceKindOf } from './files';
import { LintEngineError, SEVERITY_ORDER, atOrAbove, lintFileText, type HeadlessFinding } from './lintSource';
import {
    OUTPUT_FORMATS,
    countBySeverity,
    escapeControl,
    formatGithub,
    formatJson,
    formatStepSummary,
    formatText,
    summaryLine,
    type FileReport,
    type OutputFormat,
    type SeverityCounts,
} from './report';
import { C4X_LINT_VERSION, toSarif } from './sarif';

export const EXIT_OK = 0;
export const EXIT_FINDINGS = 1;
export const EXIT_USAGE = 2;

/** A source file larger than this is refused: no diagram is that big. */
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;

/** Everything the CLI touches outside its arguments, so tests can run it in-process. */
export interface CliIo {
    readonly cwd: string;
    readonly env: Readonly<Record<string, string | undefined>>;
    stdout(text: string): void;
    stderr(text: string): void;
    /** Append to a file; used for `GITHUB_STEP_SUMMARY`. */
    appendFile(file: string, text: string): void;
}

/** `off` never fails the run; the others fail at that severity or above. */
export type FailLevel = LintSeverity | 'off';
const FAIL_LEVELS: readonly FailLevel[] = [...SEVERITY_ORDER, 'off'];

export const USAGE = `Usage: c4x-lint [options] <file | directory | glob>...

Lints .c4x files and c4x fences in Markdown (.md, .markdown) against the C4X
notation rules. Quote globs so every shell passes them through unchanged.

Options:
  --format <text|github|json|sarif>   Output format (default: text)
  --max-severity <info|warning|error|off>
                                      Exit 1 when a finding is at or above this
                                      severity; off never fails (default: error)
  --config <file>                     Rule settings (default: ${DEFAULT_CONFIG_FILE} if present)
  --quiet                             Report only the findings that fail the run;
                                      the summary still counts every finding
  -h, --help                          Show this help
  --version                           Print the c4x-lint version

Exit codes: 0 clean, 1 findings at or above --max-severity, 2 usage, input or
internal error. Every argument must match a file, or the run exits 2.
Syntax errors (C4X-SYNTAX) and model errors (C4X-MODEL) are always errors.
Rules: https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/C4X-LINT-RULES.md
CLI:   https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/C4X-LINT-CLI.md
`;

interface ParsedArgs {
    readonly inputs: string[];
    readonly format: OutputFormat;
    readonly failLevel: FailLevel;
    readonly configPath?: string;
    readonly quiet: boolean;
    readonly help: boolean;
    readonly version: boolean;
}

class UsageError extends Error {}

function parseArgs(argv: readonly string[]): ParsedArgs {
    const inputs: string[] = [];
    let format: OutputFormat = 'text';
    let failLevel: FailLevel = 'error';
    let configPath: string | undefined;
    let quiet = false;
    let help = false;
    let version = false;
    let literal = false;

    const valueOf = (flag: string, inline: string | undefined, index: number): [string, number] => {
        if (inline !== undefined) {
            return [inline, index];
        }
        const next = argv[index + 1];
        if (next === undefined) {
            throw new UsageError(`${flag} needs a value`);
        }
        return [next, index + 1];
    };

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        if (literal || !arg.startsWith('-') || arg === '-') {
            inputs.push(arg);
            continue;
        }
        if (arg === '--') {
            literal = true;
            continue;
        }
        const equals = arg.indexOf('=');
        const flag = equals === -1 ? arg : arg.slice(0, equals);
        const inline = equals === -1 ? undefined : arg.slice(equals + 1);
        let value: string;
        switch (flag) {
            case '--format':
                [value, index] = valueOf(flag, inline, index);
                if (!(OUTPUT_FORMATS as readonly string[]).includes(value)) {
                    throw new UsageError(`--format must be one of ${OUTPUT_FORMATS.join(', ')}`);
                }
                format = value as OutputFormat;
                break;
            case '--max-severity':
                [value, index] = valueOf(flag, inline, index);
                if (!(FAIL_LEVELS as readonly string[]).includes(value)) {
                    throw new UsageError(`--max-severity must be one of ${FAIL_LEVELS.join(', ')}`);
                }
                failLevel = value as FailLevel;
                break;
            case '--config':
                [configPath, index] = valueOf(flag, inline, index);
                break;
            case '--quiet':
                quiet = true;
                break;
            case '-h':
            case '--help':
                help = true;
                break;
            case '--version':
                version = true;
                break;
            default:
                throw new UsageError(`unknown option ${flag}`);
        }
    }
    return { inputs, format, failLevel, configPath, quiet, help, version };
}

function fails(severity: LintSeverity, failLevel: FailLevel): boolean {
    return failLevel !== 'off' && atOrAbove(severity, failLevel);
}

function render(format: OutputFormat, reports: readonly FileReport[], fileCount: number, counts: SeverityCounts): string {
    switch (format) {
        case 'github':
            return formatGithub(reports, fileCount, counts);
        case 'json':
            return formatJson(reports, fileCount, counts);
        case 'sarif':
            return `${JSON.stringify(toSarif(reports), null, 2)}\n`;
        default:
            return formatText(reports, fileCount, counts);
    }
}

/** Run the CLI and return its exit code. Never throws for bad input. */
export function runLint(argv: readonly string[], io: CliIo): number {
    let args: ParsedArgs;
    try {
        args = parseArgs(argv);
    } catch (error) {
        io.stderr(`c4x-lint: ${escapeControl((error as Error).message)}\n\n${USAGE}`);
        return EXIT_USAGE;
    }
    if (args.help) {
        io.stdout(USAGE);
        return EXIT_OK;
    }
    if (args.version) {
        io.stdout(`${C4X_LINT_VERSION}\n`);
        return EXIT_OK;
    }
    if (args.inputs.length === 0) {
        io.stderr(`c4x-lint: no files given\n\n${USAGE}`);
        return EXIT_USAGE;
    }

    let config;
    try {
        config = loadConfig(io.cwd, args.configPath);
    } catch (error) {
        io.stderr(`c4x-lint: ${escapeControl(error instanceof ConfigError ? error.message : 'configuration could not be loaded')}\n`);
        return EXIT_USAGE;
    }
    // Everything on stderr that came from outside (paths, config text) goes
    // through escapeControl, so a hostile name cannot forge a line.
    const warn = (message: string) => io.stderr(`c4x-lint: ${escapeControl(message)}\n`);
    config.warnings.forEach(warn);

    // Every argument must reach a file. A renamed or mistyped path that matched
    // nothing would otherwise narrow the gate silently, so it fails the run
    // before anything is linted.
    const { files, unmatched } = expandInputs(args.inputs, io.cwd);
    unmatched.forEach(input => warn(`no .c4x or Markdown files match "${input}"`));
    if (unmatched.length > 0 || files.length === 0) {
        warn('nothing linted: every argument must match at least one .c4x or Markdown file');
        return EXIT_USAGE;
    }

    const allReports: FileReport[] = [];
    let inputError = false;
    for (const file of files) {
        const kind = sourceKindOf(file)!;
        const absolute = path.resolve(io.cwd, file);
        let text: string;
        try {
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the user asked to lint
            if (fs.statSync(absolute).size > MAX_SOURCE_BYTES) {
                warn(`${file}: larger than 4 MiB, not linted`);
                inputError = true;
                continue;
            }
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- a file the user asked to lint
            text = fs.readFileSync(absolute, 'utf8');
        } catch {
            warn(`${file}: cannot be read`);
            inputError = true;
            continue;
        }
        let findings: HeadlessFinding[];
        try {
            findings = lintFileText(text, kind, config.options);
        } catch (error) {
            // A broken rule must fail the gate loudly, never pass it.
            warn(`${file}: ${error instanceof LintEngineError ? error.message : 'unexpected failure'}`);
            inputError = true;
            continue;
        }
        allReports.push({ file, findings });
    }

    // --quiet hides findings below the threshold; the summary still counts them all.
    const counts = countBySeverity(allReports);
    const reports = args.quiet
        ? allReports.map(report => ({ file: report.file, findings: report.findings.filter(finding => fails(finding.severity, args.failLevel)) }))
        : allReports;
    io.stdout(render(args.format, reports, files.length, counts));
    if (args.format === 'json' || args.format === 'sarif') {
        io.stderr(`c4x-lint: ${summaryLine(files.length, counts)}\n`);
    }
    const summaryFile = io.env.GITHUB_STEP_SUMMARY;
    if (args.format === 'github' && summaryFile) {
        try {
            io.appendFile(summaryFile, formatStepSummary(reports, files.length, counts));
        } catch {
            io.stderr('c4x-lint: could not write GITHUB_STEP_SUMMARY\n');
        }
    }

    if (inputError) {
        return EXIT_USAGE;
    }
    const failing = allReports.some(report => report.findings.some(finding => fails(finding.severity, args.failLevel)));
    return failing ? EXIT_FINDINGS : EXIT_OK;
}

/** The real process: used by `./main.ts`. */
export function processIo(): CliIo {
    return {
        cwd: process.cwd(),
        env: process.env,
        stdout: text => process.stdout.write(text),
        stderr: text => process.stderr.write(text),
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the CI runner's own summary file
        appendFile: (file, text) => fs.appendFileSync(file, text),
    };
}
