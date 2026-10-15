/**
 * The optional `c4x-lint` configuration file. Its shape mirrors the editor
 * settings `c4x.lint.enabled` and `c4x.lint.rules`, so one rule table can be
 * copied between them:
 *
 * ```json
 * { "enabled": true, "rules": { "C4X-L003": "warning", "C4X-L008": "off" } }
 * ```
 */
import * as fs from 'fs';
import * as path from 'path';
import { LINT_RULE_SETTINGS, isLintRuleId, normalizeLintOptions, type LintOptions } from '../model/lint';

/** Looked for in the working directory when `--config` is not given. */
export const DEFAULT_CONFIG_FILE = '.c4x-lint.json';

/** Config files are tiny; anything larger is a mistake, not a configuration. */
const MAX_CONFIG_BYTES = 256 * 1024;

export interface LoadedConfig {
    readonly options: LintOptions;
    /** The file read, relative to the working directory, or `undefined` for none. */
    readonly source?: string;
    /** Entries that were dropped, in words, for stderr. */
    readonly warnings: string[];
}

export class ConfigError extends Error {}

/**
 * What is wrong with a rule table, entry by entry, in words. Shared by the
 * configuration file and the MCP `lint_c4x` tool, so both report a typo
 * instead of silently running the rule at its default.
 */
export function ruleTableProblems(rules: unknown): string[] {
    if (rules === undefined) {
        return [];
    }
    if (typeof rules !== 'object' || rules === null || Array.isArray(rules)) {
        return ['"rules" must be an object; ignored'];
    }
    const problems: string[] = [];
    for (const [id, value] of Object.entries(rules as Record<string, unknown>)) {
        if (!isLintRuleId(id)) {
            problems.push(`unknown rule "${id}" ignored`);
        } else if (typeof value !== 'string' || !(LINT_RULE_SETTINGS as readonly string[]).includes(value)) {
            problems.push(`${id} must be one of ${LINT_RULE_SETTINGS.join(', ')}; using its default`);
        }
    }
    return problems;
}

/**
 * Read the configuration. An explicit `--config` path must exist; the default
 * file is optional. Unknown keys, rule ids and severities are reported as
 * warnings and dropped, so a typo cannot silently do something else.
 */
export function loadConfig(cwd: string, explicitPath: string | undefined): LoadedConfig {
    const relative = explicitPath ?? DEFAULT_CONFIG_FILE;
    const absolute = path.resolve(cwd, relative);
    let text: string;
    try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the user's own config path
        const stat = fs.statSync(absolute);
        if (stat.size > MAX_CONFIG_BYTES) {
            throw new ConfigError(`${relative}: larger than ${MAX_CONFIG_BYTES} bytes`);
        }
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- the user's own config path
        text = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
        if (error instanceof ConfigError) {
            throw error;
        }
        if (explicitPath === undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return { options: normalizeLintOptions(true, {}), warnings: [] };
        }
        throw new ConfigError(`${relative}: cannot be read`);
    }

    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch (error) {
        throw new ConfigError(`${relative}: not valid JSON (${error instanceof Error ? error.message : 'parse error'})`);
    }
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        throw new ConfigError(`${relative}: must be a JSON object`);
    }

    const record = raw as Record<string, unknown>;
    const warnings: string[] = [];
    for (const key of Object.keys(record)) {
        if (!['$schema', 'enabled', 'rules'].includes(key)) {
            warnings.push(`${relative}: unknown key "${key}" ignored`);
        }
    }
    if (record.enabled !== undefined && typeof record.enabled !== 'boolean') {
        warnings.push(`${relative}: "enabled" must be true or false; using true`);
    }
    const rules = record.rules;
    warnings.push(...ruleTableProblems(rules).map(problem => `${relative}: ${problem}`));
    return {
        options: normalizeLintOptions(record.enabled, rules),
        source: path.relative(cwd, absolute).split(path.sep).join('/'),
        warnings,
    };
}
