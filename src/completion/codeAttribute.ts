/**
 * Line-level helpers for the `$code="..."` attribute, shared by completion
 * and hover. Pure and VS Code-free so they can be unit tested directly.
 */

import { splitCodePaths } from '../model/codePaths';

/** A `$code="..."` attribute found on one line. */
export interface CodeAttributeSpan {
    /** Offset of the `$`. */
    readonly start: number;
    /** Offset one past the closing quote. */
    readonly end: number;
    /** Offset of the first character inside the quotes. */
    readonly valueStart: number;
    /** Offset of the closing quote. */
    readonly valueEnd: number;
    readonly raw: string;
    readonly globs: string[];
}

const CODE_ATTRIBUTE_RE = /\$code\s*=\s*"([^"\n]*)"/g;

/** Every complete `$code="..."` attribute on a line, outside other quoted strings. */
export function findCodeAttributes(lineText: string): CodeAttributeSpan[] {
    const spans: CodeAttributeSpan[] = [];
    CODE_ATTRIBUTE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = CODE_ATTRIBUTE_RE.exec(lineText)) !== null) {
        if (isInsideQuotes(lineText, match.index)) {
            continue;
        }
        const end = match.index + match[0].length;
        spans.push({
            start: match.index,
            end,
            valueStart: end - 1 - match[1].length,
            valueEnd: end - 1,
            raw: match[1],
            globs: splitCodePaths(match[1]),
        });
    }
    return spans;
}

/** The `$code` attribute under `character`, if any. */
export function codeAttributeAt(lineText: string, character: number): CodeAttributeSpan | undefined {
    return findCodeAttributes(lineText).find(span => character >= span.start && character <= span.end);
}

/** Completion context inside an unterminated `$code="...` value. */
export interface CodeValueContext {
    /** The glob entry being typed: text after the last top-level comma, left-trimmed. */
    readonly entry: string;
    /** Directory part of `entry`, including its trailing slash ('' at the root). */
    readonly directory: string;
    /** Name fragment after the last slash; completion replaces it. */
    readonly fragment: string;
}

/**
 * When the cursor sits inside a `$code="` value, return what is being typed.
 * Returns undefined when completion should not offer paths here.
 */
export function codeValueContext(linePrefix: string): CodeValueContext | undefined {
    const match = /\$code\s*=\s*"([^"]*)$/.exec(linePrefix);
    if (!match || isInsideQuotes(linePrefix, match.index)) {
        return undefined;
    }
    const value = match[1];
    let depth = 0;
    let entryStart = 0;
    for (let i = 0; i < value.length; i++) {
        const char = value.charAt(i);
        if (char === '{' || char === '[') { depth++; }
        if ((char === '}' || char === ']') && depth > 0) { depth--; }
        if (char === ',' && depth === 0) { entryStart = i + 1; }
    }
    const entry = value.slice(entryStart).replace(/^\s+/, '');
    if (/[*?{}[\]]/.test(entry)) {
        // Already a pattern: path completion would only get in the way.
        return undefined;
    }
    if (entry.startsWith('/') || entry.split('/').some(segment => segment === '..')) {
        // $code never leaves the workspace; do not list what lies outside it.
        return undefined;
    }
    const slash = entry.lastIndexOf('/');
    return {
        entry,
        directory: slash === -1 ? '' : entry.slice(0, slash + 1),
        fragment: slash === -1 ? entry : entry.slice(slash + 1),
    };
}

/**
 * True when the cursor follows a `$` (optionally with part of a name) in
 * attribute position, so offering `$code="..."` makes sense.
 */
export function attributeNameContext(linePrefix: string): { readonly typed: string } | undefined {
    const match = /\$([A-Za-z]*)$/.exec(linePrefix);
    if (!match || isInsideQuotes(linePrefix, match.index)) {
        return undefined;
    }
    // Only where an attribute can go: inside an element call `Type(id, ...`,
    // or after a bracket element `id[...] `. Never in prose that mentions `$`.
    // Blank out quoted text first, so a label such as "Parser (v2)" cannot end the call early.
    const before = linePrefix.slice(0, match.index).replace(/"[^"]*"/g, '""');
    const inCall = /^\s*[A-Za-z_][\w-]*\s*\([^)]*,\s*$/.test(before);
    const bracket = /^\s*[A-Za-z_][\w-]*\s*\[[^\]]*\]/.exec(before);
    const rest = bracket ? before.slice(bracket[0].length) : '';
    const afterBracket = bracket !== null && (rest.trim() === '' || /,\s*$/.test(rest));
    if (!inCall && !afterBracket) {
        return undefined;
    }
    if (!'code'.startsWith(match[1])) {
        return undefined;
    }
    return { typed: match[0] };
}

/**
 * True when `line` (0-based) of a Markdown document sits inside a ` ```c4x `
 * or `~~~c4x` fence, so `$code` help stays out of ordinary prose and code.
 */
export function isInsideC4xFence(lineAt: (line: number) => string, line: number): boolean {
    let open: { readonly marker: string; readonly c4x: boolean } | undefined;
    for (let i = 0; i < line; i++) {
        const fence = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/.exec(lineAt(i));
        if (!fence) {
            continue;
        }
        if (!open) {
            open = { marker: fence[1], c4x: fence[2].toLowerCase() === 'c4x' };
        } else if (fence[1].charAt(0) === open.marker.charAt(0) && fence[1].length >= open.marker.length && fence[2] === '') {
            open = undefined;
        }
    }
    return open?.c4x ?? false;
}

/** Names never offered by path completion. */
export const HIDDEN_ENTRY_NAMES: ReadonlySet<string> = new Set(['node_modules', 'out', 'dist', 'coverage']);

export function isOfferedEntry(name: string): boolean {
    return !name.startsWith('.') && !HIDDEN_ENTRY_NAMES.has(name);
}

function isInsideQuotes(text: string, offset: number): boolean {
    let inQuote = false;
    for (let i = 0; i < offset; i++) {
        if (text.charAt(i) === '"') {
            inQuote = !inQuote;
        }
    }
    return inQuote;
}
