/**
 * The `$code` mapping: where a Container or Component lives in source code.
 *
 * Pure and VS Code-free. The C4X model builder, the Structurizr adapter, the
 * editor hover and the conformance exporter all read the attribute through
 * these helpers, so one value means the same thing everywhere.
 *
 * A value is a comma-separated list of workspace-relative POSIX globs:
 *
 *     $code="src/parser/**, src/extension.ts"
 *
 * Commas inside `{...}` or `[...]` belong to the glob, so
 * `$code="src/{parser,model}/**"` is one entry, not two.
 */

import { globToRegexBody, hasGlobSyntax, wildcardCount } from './codeGlobRegex';

export { hasGlobSyntax };

/**
 * Test files and mocks, which the conformance export leaves out of the check
 * by default and the `$code` hover counts separately.
 */
export const DEFAULT_TEST_EXCLUDE = '(^|/)(__tests__|__mocks__)/|\\.(test|spec)\\.[cm]?[jt]sx?$';

/** Most `*` or `**` tokens one glob may hold; see `wildcardCount`. */
export const MAX_WILDCARDS = 3;

/** Element types that may carry a `$code` mapping. */
export const CODE_MAPPABLE_TYPES: ReadonlySet<string> = new Set(['Container', 'Component']);

/**
 * Split a raw `$code` value into its glob entries. Whitespace around each
 * entry is trimmed and empty entries (a trailing comma) are ignored.
 */
export function splitCodePaths(raw: string): string[] {
    const entries: string[] = [];
    let depth = 0;
    let current = '';
    for (const char of raw) {
        if (char === '{' || char === '[') {
            depth++;
        } else if ((char === '}' || char === ']') && depth > 0) {
            depth--;
        }
        if (char === ',' && depth === 0) {
            entries.push(current);
            current = '';
            continue;
        }
        current += char;
    }
    entries.push(current);
    return entries.map(entry => entry.trim()).filter(entry => entry.length > 0);
}

/**
 * Return why a single glob is not an acceptable code path, or `undefined`
 * when it is. Globs are relative to the workspace root and never escape it.
 */
export function codePathProblem(glob: string): string | undefined {
    if (glob.length === 0) {
        return 'is empty';
    }
    if (glob.includes('\\')) {
        return 'uses a backslash; write paths with forward slashes';
    }
    if (glob.startsWith('/') || /^[A-Za-z]:/.test(glob)) {
        return 'is absolute; write it relative to the workspace root';
    }
    if (glob.startsWith('!')) {
        return 'is a negation, which $code does not support';
    }
    if (glob.split('/').some(segment => segment === '..')) {
        return 'climbs out of the workspace with ".."';
    }
    if (glob.startsWith('./')) {
        return 'starts with "./"; write it without, e.g. "src/parser/**"';
    }
    const unsafe = /[^A-Za-z0-9._\-/*?{}[\],!@+~()# ]/.exec(glob);
    if (unsafe) {
        // Globs reach shell commands (the suggested checker run) and regular
        // expressions; anything outside this set has no place in a path glob.
        return `contains "${unsafe[0]}"; use letters, digits, spaces and . _ - / * ? { } [ ] , ! @ + ~ ( ) # only`;
    }
    if (wildcardCount(glob) > MAX_WILDCARDS) {
        return `has ${wildcardCount(glob)} wildcards; use at most ${MAX_WILDCARDS} ("*" and "**" each count once)`;
    }
    let braces = 0;
    let brackets = 0;
    for (const char of glob) {
        if (char === '{') { braces++; }
        if (char === '}') { braces--; }
        if (char === '[') { brackets++; }
        if (char === ']') { brackets--; }
        if (braces < 0 || brackets < 0) {
            return 'has an unbalanced "}" or "]"';
        }
    }
    if (braces !== 0 || brackets !== 0) {
        return 'has an unbalanced "{" or "["';
    }
    try {
        // Compile now, so `src/[z-a]` fails at parse time rather than in a checker.
        // eslint-disable-next-line security/detect-non-literal-regexp
        new RegExp(`^${globToRegexBody(glob)}$`);
    } catch (error) {
        return `is not a valid glob (${error instanceof Error ? error.message : String(error)})`;
    }
    return undefined;
}

/**
 * Split and validate a raw `$code` value. Throws an `Error` naming the first
 * bad entry; callers wrap it in their own error type with a source location.
 */
export function parseCodePaths(raw: string): string[] {
    const entries = splitCodePaths(raw);
    if (entries.length === 0) {
        throw new Error('$code lists no paths; give at least one glob such as "src/parser/**"');
    }
    for (const entry of entries) {
        const problem = codePathProblem(entry);
        if (problem) {
            throw new Error(`$code entry "${entry}" ${problem}`);
        }
    }
    return entries;
}


/**
 * The glob a file-search API should use for one `$code` entry. A bare path
 * (no wildcard) means "this file, or everything below this folder", and a
 * trailing slash means "everything below this folder".
 */
export function toSearchGlob(glob: string): string {
    if (glob.endsWith('/')) {
        return `${glob}**`;
    }
    if (!hasGlobSyntax(glob)) {
        return `{${glob},${glob}/**}`;
    }
    return glob;
}
