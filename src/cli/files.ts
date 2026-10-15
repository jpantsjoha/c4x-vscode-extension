/**
 * Turn `c4x-lint` arguments into files: plain paths, directories (searched
 * recursively) and glob patterns, so a quoted pattern works the same in every
 * shell and on Windows. Supported glob syntax: `*`, `**`, `?`, `[...]` and
 * `{a,b}`; only `**` as a whole path segment crosses directories, and no
 * wildcard or bracket matches `/`. Directory walks skip `node_modules`,
 * dot-directories and symbolic links; a path named outright is followed.
 *
 * Every path is reported relative to the working directory, never absolute,
 * so no workstation path reaches the output (a file outside it reads `../`).
 */
import * as fs from 'fs';
import * as path from 'path';
import type { SourceKind } from './lintSource';

const SKIPPED_DIRECTORIES = new Set(['node_modules']);

/** The source kind a file name implies, or `undefined` when C4X does not lint it. */
export function sourceKindOf(file: string): SourceKind | undefined {
    const extension = path.extname(file).toLowerCase();
    if (extension === '.c4x') {
        return 'c4x';
    }
    if (extension === '.md' || extension === '.markdown') {
        return 'markdown';
    }
    return undefined;
}

export function hasGlobMagic(pattern: string): boolean {
    return /[*?[{]/.test(pattern);
}

/** Forward slashes, no leading `./`. */
export function toPosix(file: string): string {
    return file.split(path.sep).join('/').replace(/^(?:\.\/)+/, '');
}

function escapeRegExp(value: string): string {
    return value.replace(/[.+^$()|\\/]/g, '\\$&');
}

/** Compile a glob over `/`-separated relative paths to an anchored regular expression. */
export function globToRegExp(pattern: string): RegExp {
    let source = '';
    let braceDepth = 0;
    for (let index = 0; index < pattern.length; index++) {
        const char = pattern.charAt(index);
        if (char === '*') {
            if (pattern.charAt(index + 1) === '*') {
                const atSegmentStart = index === 0 || pattern.charAt(index - 1) === '/';
                index++;
                const next = pattern.charAt(index + 1);
                if (atSegmentStart && next === '/') {
                    index++;
                    source += '(?:[^/]*/)*';
                } else if (atSegmentStart && next === '') {
                    source += '.*';
                } else {
                    // `**` inside a segment (`a**b`, `**.md`) is an ordinary `*`.
                    source += '[^/]*';
                }
            } else {
                source += '[^/]*';
            }
        } else if (char === '?') {
            source += '[^/]';
        } else if (char === '[') {
            const close = pattern.indexOf(']', index + 1);
            if (close === -1) {
                source += '\\[';
            } else {
                const body = pattern.slice(index + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\');
                // A bracket never matches the separator, negated or not.
                source += `(?!/)[${body}]`;
                index = close;
            }
        } else if (char === '{') {
            braceDepth++;
            source += '(?:';
        } else if (char === '}' && braceDepth > 0) {
            braceDepth--;
            source += ')';
        } else if (char === ',' && braceDepth > 0) {
            source += '|';
        } else {
            source += escapeRegExp(char);
        }
    }
    // The pattern is the user's own command-line argument, compiled once.
    // eslint-disable-next-line security/detect-non-literal-regexp
    return new RegExp(`^${source}$`);
}

/**
 * Every file under `directory` (as given, relative to `cwd` or absolute),
 * skipping `node_modules`, dot-directories and symbolic links, which a walk
 * could otherwise follow out of the tree or round in a loop.
 */
function walk(cwd: string, directory: string, into: string[]): void {
    let entries: fs.Dirent[];
    try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- a directory the user named
        entries = fs.readdirSync(path.resolve(cwd, directory), { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const relative = directory === '' || directory === '.' ? entry.name : `${directory}/${entry.name}`;
        if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) {
                walk(cwd, relative, into);
            }
        } else if (entry.isFile()) {
            into.push(relative);
        }
    }
}

/** The longest leading run of path segments with no glob syntax: where a walk must start. */
function globBase(pattern: string): string {
    const segments = pattern.split('/');
    const base: string[] = [];
    for (const segment of segments.slice(0, -1)) {
        if (hasGlobMagic(segment)) {
            break;
        }
        base.push(segment);
    }
    return base.join('/');
}

/**
 * How a file is reported: relative to `cwd`, with `/` separators. A file
 * outside `cwd` gets a `../` path rather than its absolute path.
 */
export function displayPath(file: string, cwd: string): string {
    return toPosix(path.relative(cwd, path.resolve(cwd, file))) || '.';
}

export interface ExpandedInputs {
    /** Lintable files, relative to `cwd` with `/` separators, sorted and unique. */
    readonly files: string[];
    /** Arguments that matched nothing lintable. */
    readonly unmatched: string[];
}

/**
 * Resolve arguments against `cwd`. A file named outright is kept only if it
 * is `.c4x`, `.md` or `.markdown`; a directory or a pattern contributes the
 * lintable files it reaches.
 */
export function expandInputs(inputs: readonly string[], cwd: string): ExpandedInputs {
    const files = new Set<string>();
    const unmatched: string[] = [];
    for (const input of inputs) {
        let matched = 0;
        const keep = (file: string) => {
            files.add(displayPath(file, cwd));
            matched++;
        };
        const normalized = toPosix(input);
        if (hasGlobMagic(normalized)) {
            const matcher = globToRegExp(normalized);
            const candidates: string[] = [];
            walk(cwd, globBase(normalized), candidates);
            for (const candidate of candidates) {
                if (matcher.test(candidate) && sourceKindOf(candidate)) {
                    keep(candidate);
                }
            }
        } else {
            let stat: fs.Stats | undefined;
            try {
                // eslint-disable-next-line security/detect-non-literal-fs-filename -- a path the user named
                stat = fs.statSync(path.resolve(cwd, normalized));
            } catch {
                stat = undefined;
            }
            if (stat?.isDirectory()) {
                const candidates: string[] = [];
                walk(cwd, normalized.replace(/\/+$/, ''), candidates);
                candidates.filter(candidate => sourceKindOf(candidate)).forEach(keep);
            } else if (stat?.isFile() && sourceKindOf(normalized)) {
                keep(normalized);
            }
        }
        if (matched === 0) {
            unmatched.push(input);
        }
    }
    return { files: [...files].sort(), unmatched };
}
