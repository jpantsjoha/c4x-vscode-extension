/**
 * Convert `$code` globs into the regular expressions dependency-cruiser
 * matches module paths against (`from.path`, `to.path`).
 *
 * dependency-cruiser reports paths relative to the directory it runs in,
 * with forward slashes, e.g. `src/parser/C4XParser.ts`. Globs are relative to
 * the workspace root, so the checker must run from that root.
 *
 * Supported glob syntax, matching the `$code` documentation:
 *   `**`    any number of path segments (including none)
 *   `*`     any characters within one segment
 *   `?`     one character within a segment
 *   `{a,b}` either alternative (may nest)
 *   `[abc]` / `[!abc]` a character class
 * A path with none of these means "this file, or everything below this
 * folder"; a trailing slash means "everything below this folder".
 *
 * The output never puts a quantifier on a group, so its star height is 1.
 * dependency-cruiser rejects rules whose regular expressions fail
 * `safe-regex` (star height > 1, e.g. `(?:/.*)?`) and bails out.
 */

/** True when the glob contains a wildcard, a class or an alternative. */
export function hasGlobSyntax(glob: string): boolean {
    return /[*?[\]{}]/.test(glob);
}

/**
 * Wildcard tokens in a glob: each `**` and each `*` counts once. Several
 * unanchored `.*`/`[^/]*` runs in one pattern backtrack polynomially: on a
 * 200-character adversarial path, three tokens took about 10 ms, four about
 * 450 ms and nine did not finish. `$code` therefore allows three.
 */
export function wildcardCount(glob: string): number {
    return (glob.match(/\*\*|\*/g) ?? []).length;
}

const REGEX_SPECIALS = /[.+^$()|\\{}[\]*?]/;

function escapeChar(char: string): string {
    return REGEX_SPECIALS.test(char) ? `\\${char}` : char;
}

function escapeLiteral(text: string): string {
    return Array.from(text, escapeChar).join('');
}

/** The unanchored regular-expression body for one glob. */
export function globToRegexBody(glob: string): string {
    if (glob.endsWith('/')) {
        return `${escapeLiteral(glob.slice(0, -1))}/.*`;
    }
    if (!hasGlobSyntax(glob)) {
        return `${escapeLiteral(glob)}(?:$|/.*)`;
    }

    let out = '';
    let braceDepth = 0;
    let i = 0;
    while (i < glob.length) {
        const char = glob.charAt(i);
        const atSegmentStart = i === 0 || glob.charAt(i - 1) === '/';

        if (char === '*' && glob.charAt(i + 1) === '*') {
            const next = glob.charAt(i + 2);
            if (atSegmentStart && next === '/') {
                out += '(?:|.*/)';     // `**/` — zero or more leading segments
                i += 3;
                continue;
            }
            if (out.endsWith('/') && next === '') {
                out = `${out.slice(0, -1)}(?:$|/.*)`; // trailing `/**` — the folder and everything below
                i += 2;
                continue;
            }
            out += '.*';
            i += 2;
            continue;
        }
        if (char === '*') {
            out += '[^/]*';
            i++;
            continue;
        }
        if (char === '?') {
            out += '[^/]';
            i++;
            continue;
        }
        if (char === '{') {
            braceDepth++;
            out += '(?:';
            i++;
            continue;
        }
        if (char === '}' && braceDepth > 0) {
            braceDepth--;
            out += ')';
            i++;
            continue;
        }
        if (char === ',' && braceDepth > 0) {
            out += '|';
            i++;
            continue;
        }
        if (char === '[') {
            const close = glob.indexOf(']', i + 1);
            if (close > i + 1) {
                let body = glob.slice(i + 1, close);
                let negated = false;
                if (body.startsWith('!') || body.startsWith('^')) {
                    negated = true;
                    body = body.slice(1);
                }
                const safeBody = body.replace(/[\\\]^]/g, match => `\\${match}`);
                out += negated ? `[^/${safeBody}]` : `[${safeBody}]`;
                i = close + 1;
                continue;
            }
        }
        out += escapeChar(char);
        i++;
    }
    return out;
}

/** One anchored regular expression matching any of the globs. */
export function globsToRegex(globs: readonly string[]): string {
    if (globs.length === 1) {
        return `^${globToRegexBody(globs[0])}$`;
    }
    return `^(?:${globs.map(globToRegexBody).join('|')})$`;
}

/**
 * The fixed leading part of a glob, before its first wildcard. Longer means
 * more specific; it breaks ties when two elements' globs claim one file.
 */
export function staticPrefixLength(glob: string): number {
    const match = /[*?[{]/.exec(glob);
    return match ? match.index : glob.length;
}

/**
 * The part of the repository a glob lives in: its first path segment as a
 * folder (`src/parser/**` gives `src/`), or the glob itself when it has a
 * single segment. Imports into anything outside every root are treated as
 * third-party (packages, Node built-ins, the VS Code API) and pass through.
 */
export function globRoot(glob: string): string {
    const slash = glob.indexOf('/');
    if (slash > 0) {
        const first = glob.slice(0, slash);
        if (!hasGlobSyntax(first)) {
            return `${first}/`;
        }
    }
    return glob;
}
