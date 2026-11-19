/**
 * Credential assignments in file content (#485). A file that assigns a value
 * to a credential-named key is never sent to a model.
 *
 * Two contexts, chosen from the file name:
 * - configuration: every file that is not source code (.env, JSON, YAML,
 *   TOML, INI, properties, shell, Dockerfile, Markdown, plain text and any
 *   unknown extension). Values are literals, so a credential-named key with
 *   any non-empty value excludes the file.
 * - source: the extensions in SOURCE_EXTENSIONS. A line that assigns to a
 *   credential-named key is safe only as one whole-line statement assigning
 *   a single allowed environment lookup (SAFE_STATEMENT). Otherwise a quote
 *   character or block-comment opener on that line or on the next WINDOW
 *   lines (up to a blank line) excludes the file. With no quote in that
 *   window (a reference, member access, call without a literal) it does not.
 *
 * Fail closed: every character of every line is examined (no length cap, no
 * truncation), and source code is never parsed as expressions.
 *
 * Linear time by construction: hand-written scanners, one pass per line, plus
 * a bounded look-ahead (the next WINDOW lines for a source credential line,
 * the next non-blank line for an empty configuration value). The only regular
 * expression is SAFE_STATEMENT, run on a trimmed line of at most
 * SAFE_LINE_CAP characters.
 */

export type ScanContext = 'configuration' | 'source';

// Languages where an unquoted value is an identifier, never a literal.
const SOURCE_EXTENSIONS = new Set([
    'ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte',
    'py', 'pyi', 'java', 'kt', 'kts', 'scala', 'groovy', 'go', 'rs', 'rb',
    'cs', 'fs', 'vb', 'swift', 'm', 'mm', 'c', 'h', 'cc', 'cpp', 'cxx', 'hpp',
    'hh', 'php', 'dart', 'lua', 'ex', 'exs', 'erl', 'clj', 'cljs', 'jl', 'r',
]);

/** The scan context for a file, from its name: source code or configuration. */
export function scanContextFor(relativePath: string): ScanContext {
    const name = (relativePath.split(/[\\/]/).pop() ?? relativePath).toLowerCase();
    const dot = name.lastIndexOf('.');
    const extension = dot > 0 ? name.slice(dot + 1) : '';
    return SOURCE_EXTENSIONS.has(extension) ? 'source' : 'configuration';
}

// A key is credential-named when its last segment names a credential.
// Segments split on `_ - . $` and camel-case boundaries: `dbPassword`,
// `DB_PASSWORD`, `api.key`, `APIKey`. `passwordField`, `PasswordOptions`,
// `author` and `max_tokens` are not credential names.
const CREDENTIAL_WORDS = new Set([
    'password', 'passwd', 'pwd', 'passphrase', 'secret', 'token', 'apikey',
    'privatekey', 'accesskey', 'secretkey', 'credential', 'credentials',
    'auth', 'authorization',
]);
// Words a single run-together segment may end with: `dbpassword`, `authtoken`.
const CREDENTIAL_ENDINGS = [
    'password', 'passwd', 'passphrase', 'secret', 'token', 'apikey',
    'privatekey', 'accesskey', 'secretkey', 'credential', 'credentials',
];
// `<qualifier>_key`: api_key, private_key, aws_secret_access_key.
const KEY_QUALIFIERS = new Set(['api', 'private', 'access', 'secret', 'signing', 'encryption', 'master', 'client']);

function isIdentChar(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '$' || c === '.' || c === '-';
}

function isLower(c: string): boolean {
    return (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9');
}

function isUpper(c: string): boolean {
    return c >= 'A' && c <= 'Z';
}

/** The last two segments of an identifier, lower-cased. One backward pass. */
function lastSegments(id: string): [string, string] {
    const found: string[] = [];
    let end = id.length;
    let i = id.length - 1;
    while (i >= 0 && found.length < 2) {
        const c = id[i];
        if (c === '_' || c === '-' || c === '.' || c === '$') {
            if (end > i + 1) {
                found.push(id.slice(i + 1, end));
            }
            end = i;
            i--;
            continue;
        }
        // A camel boundary sits before c when c is upper case and either the
        // previous character is lower case (dbPassword) or the previous is
        // upper case and the next lower case (APIKey).
        if (isUpper(c) && i > 0) {
            const previous = id[i - 1];
            const next = i + 1 < id.length ? id[i + 1] : '';
            if (isLower(previous) || (isUpper(previous) && next >= 'a' && next <= 'z')) {
                found.push(id.slice(i, end));
                end = i;
            }
        }
        i--;
    }
    if (found.length < 2 && end > 0) {
        found.push(id.slice(0, end));
    }
    return [(found[0] ?? '').toLowerCase(), (found[1] ?? '').toLowerCase()];
}

/** True when an identifier names a credential. */
export function isCredentialName(id: string): boolean {
    const [last, previous] = lastSegments(id);
    if (!last) {
        return false;
    }
    if (CREDENTIAL_WORDS.has(last)) {
        return true;
    }
    if (last === 'key' && KEY_QUALIFIERS.has(previous)) {
        return true;
    }
    return CREDENTIAL_ENDINGS.some(word => last.length > word.length && last.endsWith(word));
}

function skipBlanks(line: string, k: number): number {
    while (k < line.length && (line[k] === ' ' || line[k] === '\t')) {
        k++;
    }
    return k;
}

/**
 * The index just after an assignment separator starting at or after k, or -1.
 * `:` `=` `:=` count; `::` `==` `===` `=>` do not. Source code may put a `?`
 * before the separator (an optional property) or use a compound assignment.
 */
function separatorEnd(line: string, k: number, allowOptional: boolean): number {
    k = skipBlanks(line, k);
    if (allowOptional) {
        // Compound assignment in source code: `??=`, `||=`, `&&=`, `+=`.
        let m = k;
        while (m < k + 2 && '?|&+'.includes(line[m] ?? '\n')) {
            m++;
        }
        if (m > k && line[m] === '=' && line[m + 1] !== '=') {
            return m + 1;
        }
        if (line[k] === '?' && line[k + 1] === ':') {
            k++;
        }
    }
    if (line[k] === ':') {
        if (line[k + 1] === ':') {
            return -1;
        }
        return line[k + 1] === '=' ? k + 2 : k + 1;
    }
    if (line[k] === '=') {
        return line[k + 1] === '=' || line[k + 1] === '>' ? -1 : k + 1;
    }
    return -1;
}

function nextNonBlankLine(lines: readonly string[], index: number): number {
    for (let n = index + 1; n < lines.length; n++) {
        if (lines[n].trim() !== '') {
            return n;
        }
    }
    return -1;
}

function indentOf(line: string): number {
    return skipBlanks(line, 0);
}

// ---------------------------------------------------------------- configuration

/** True when a configuration value starting at k is non-empty. */
function configValuePresent(lines: readonly string[], index: number, k: number): boolean {
    const line = lines[index];
    k = skipBlanks(line, k);
    if (k >= line.length || line[k] === '\r') {
        // Nothing after the separator: a value continued on the next line
        // (an opening quote, or a deeper-indented block) still counts.
        const next = nextNonBlankLine(lines, index);
        if (next < 0) {
            return false;
        }
        const first = lines[next][indentOf(lines[next])];
        return indentOf(lines[next]) > indentOf(line) || first === '"' || first === '\'' || first === '`';
    }
    const c = line[k];
    if ((c === '"' || c === '\'') && line[k + 1] === c) {
        // An empty string, `""` or `''`, unless more value follows it.
        const after = skipBlanks(line, k + 2);
        const d = line[after];
        return !(after >= line.length || d === ',' || d === ';' || d === '#' || d === '}' || d === ']' || d === '\r' || d === '/');
    }
    return true;
}

/** Scan configuration-context text (whole lines, or a run inside a source string). */
function configLineHasCredential(lines: readonly string[], index: number, start: number, end: number): boolean {
    const line = lines[index];
    let i = start;
    while (i < end) {
        if (!isIdentChar(line[i])) {
            i++;
            continue;
        }
        let j = i;
        while (j < end && isIdentChar(line[j])) {
            j++;
        }
        if (isCredentialName(line.slice(i, j))) {
            // XML element: <password>value</password>
            if (i > 0 && line[i - 1] === '<' && line[j] === '>') {
                const k = j + 1;
                if (k < line.length && line[k] !== '<' && line[k] !== '\r') {
                    return true;
                }
                if (k >= line.length || line[k] === '\r') {
                    const next = nextNonBlankLine(lines, index);
                    if (next >= 0 && lines[next][indentOf(lines[next])] !== '<') {
                        return true;
                    }
                }
            } else {
                // A quoted key ("password":) closes its quote first.
                const k = line[j] === '"' || line[j] === '\'' ? j + 1 : j;
                const valueStart = separatorEnd(line, k, false);
                if (valueStart >= 0 && valueStart <= end && configValuePresent(lines, index, valueStart)) {
                    return true;
                }
            }
        }
        i = j;
    }
    return false;
}

// ---------------------------------------------------------------- source
//
// No expression parsing. A line that assigns to a credential-named key
// (matched anywhere on the line, comments and strings included) is safe only
// as one whole-line statement assigning a single allowed environment lookup.
// Otherwise a quote character or a block-comment opener on that line, or on
// any of the next WINDOW lines up to the next blank line, excludes the file.

const WINDOW = 10;
const SAFE_LINE_CAP = 300;

// Exactly one environment lookup with a single identifier-like name.
const QUOTED_NAME = String.raw`(?:"[A-Za-z_][A-Za-z0-9_]*"|'[A-Za-z_][A-Za-z0-9_]*')`;
const NAME = String.raw`\([ \t]*${QUOTED_NAME}[ \t]*\)`;
const SUBSCRIPT = String.raw`\[[ \t]*${QUOTED_NAME}[ \t]*\]`;
const LOOKUP = [
    String.raw`(?:os\.)?getenv${NAME}`,
    String.raw`os\.environ${SUBSCRIPT}`,
    String.raw`(?:os\.)?environ\.get${NAME}`,
    String.raw`process\.env${SUBSCRIPT}`,
    String.raw`System\.getenv${NAME}`,
    String.raw`Environment\.GetEnvironmentVariable${NAME}`,
    String.raw`ENV${SUBSCRIPT}`,
    String.raw`ENV\.fetch${NAME}`,
].join('|');
// [declaration keywords] [type] key [: annotation] (= | : | :=) lookup [;] [line comment without quotes]
const SAFE_STATEMENT = new RegExp(
    String.raw`^(?:(?:export|const|let|var|final|val|readonly|private|public|protected|static|my|our)[ \t]+)*`
    + String.raw`(?:[A-Za-z_][\w.]*(?:<[\w.,? ]*>)?(?:\[\])?\??[ \t]+)?`
    + String.raw`(\$?[A-Za-z_][\w.$]*)`
    + String.raw`(?:[ \t]*:[ \t]*[A-Za-z_][\w.\[\]|]*)?`
    + String.raw`[ \t]*(?::=|=|:)[ \t]*(?:${LOOKUP})`
    + String.raw`[ \t]*;?[ \t]*(?:(?:\/\/|#)[^'"\x60]*)?$`,
);
/** True when the line assigns to a credential-named key anywhere on it. */
function lineAssignsCredential(line: string): boolean {
    let i = 0;
    while (i < line.length) {
        if (!isIdentChar(line[i])) {
            i++;
            continue;
        }
        let j = i;
        while (j < line.length && isIdentChar(line[j])) {
            j++;
        }
        if (isCredentialName(line.slice(i, j))) {
            const k = line[j] === '"' || line[j] === '\'' || line[j] === '`' ? j + 1 : j;
            if (separatorEnd(line, k, true) >= 0) {
                return true;
            }
        }
        i = j;
    }
    return false;
}

/** True when a line holds a quote character or opens a block comment. */
function hasQuoteOrBlockComment(line: string): boolean {
    for (let k = 0; k < line.length; k++) {
        const c = line[k];
        if (c === '"' || c === '\'' || c === '`' || (c === '/' && line[k + 1] === '*')) {
            return true;
        }
    }
    return false;
}

/**
 * True when the whole line is one safe statement: a credential key assigned one allowed lookup.
 * Whether the statement continues on later lines is not judged here: the caller still applies the
 * quote window to the lines that follow, so a continuation carrying a literal excludes the file.
 */
function isSafeLookupLine(line: string): boolean {
    const trimmed = line.trim();
    if (trimmed.length > SAFE_LINE_CAP || trimmed.endsWith('\\')) {
        return false;
    }
    const match = SAFE_STATEMENT.exec(trimmed);
    return match !== null && isCredentialName(match[1]);
}

function sourceHasCredential(lines: readonly string[]): boolean {
    // One pass to mark quoted or block-commented lines, so each window check is O(WINDOW).
    const flagged = lines.map(hasQuoteOrBlockComment);
    const blank = lines.map(line => line.trim() === '');
    for (let n = 0; n < lines.length; n++) {
        if (!lineAssignsCredential(lines[n])) {
            continue;
        }
        // A safe lookup line's own quotes are the lookup name; every following line in the window
        // still counts, so a literal on a continuation line excludes the file whatever operator joins it.
        const start = isSafeLookupLine(lines[n]) ? n + 1 : n;
        for (let m = start; m < lines.length && m <= n + WINDOW; m++) {
            if (m > n && blank[m]) {
                break;
            }
            if (flagged[m]) {
                return true;
            }
        }
    }
    return false;
}

/** True when the content assigns a value to a credential-named key, judged in the file's context. */
export function hasCredentialAssignment(relativePath: string, content: string): boolean {
    if (content === '') {
        return false;
    }
    const lines = content.split('\n');
    if (scanContextFor(relativePath) === 'configuration') {
        for (let n = 0; n < lines.length; n++) {
            if (configLineHasCredential(lines, n, 0, lines[n].length)) {
                return true;
            }
        }
        return false;
    }
    return sourceHasCredential(lines);
}
