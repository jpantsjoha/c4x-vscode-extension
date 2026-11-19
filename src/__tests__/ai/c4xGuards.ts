// Guards for the C4X examples that prompts and documents show (#330).
//
// No regular expression decides what is C4X. The C4X grammar's own rules do:
// the grammar is compiled here with `Arrow` and `Relationship` as start rules,
// so an arrow token is whatever `Arrow` accepts and a statement is whatever
// `Relationship` accepts, including trailing-hyphen identifiers. Markdown is
// read with markdown-it, a dependency of the extension, which follows
// CommonMark for ``` and ~~~ fences of any length.

import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import * as peggy from 'peggy';
import { lintC4xSource } from '../../cli/lintSource';

interface StartRuleParser { parse(input: string, options?: { startRule?: string; maxNestingDepth?: number }): unknown }

const grammar = fs.readFileSync(path.join(__dirname, '..', '..', 'parser', 'c4x.pegjs'), 'utf8');
const parser = peggy.generate(grammar, { allowedStartRules: ['Arrow', 'Relationship'] }) as unknown as StartRuleParser;

function accepts(rule: 'Arrow' | 'Relationship', text: string): unknown {
    try { return parser.parse(text, { startRule: rule, maxNestingDepth: 100 }); } catch { return undefined; }
}

/** Offsets of every arrow token in a line, as the grammar's `Arrow` rule sees them. */
export function arrowTokens(line: string): Array<{ index: number; text: string }> {
    const found: Array<{ index: number; text: string }> = [];
    for (let i = 0; i < line.length; i++) {
        for (let j = i + 1; j <= Math.min(line.length, i + 4); j++) {
            if (accepts('Arrow', line.slice(i, j)) !== undefined) { found.push({ index: i, text: line.slice(i, j) }); break; }
        }
    }
    return found;
}

interface RelationshipNode { from: string; arrow: string; label: string; to: string; technology?: string }

/** The canonical key of one relationship statement, or undefined when the grammar rejects it. */
export function relationshipKey(statement: string): string | undefined {
    const node = accepts('Relationship', statement.trim()) as RelationshipNode | undefined;
    return node ? [node.from, node.arrow, node.label, node.technology ?? '', node.to].join('\u0001') : undefined;
}

/** Relationship keys of every line of an example that the grammar reads as one. */
export function listedRelationships(texts: readonly string[]): Set<string> {
    const keys = new Set<string>();
    for (const text of texts) {
        for (const line of text.split('\n')) {
            const key = relationshipKey(line);
            if (key) { keys.add(key); }
        }
    }
    return keys;
}

const md = new MarkdownIt();

export interface Fence { info: string; content: string; line: number; markup: string }

/** Every fenced block of a Markdown text, per CommonMark. */
export function fencesOf(text: string): Fence[] {
    const out: Fence[] = [];
    const walk = (tokens: ReturnType<MarkdownIt['parse']>) => {
        for (const token of tokens) {
            if (token.type === 'fence') {
                out.push({ info: token.info.trim(), content: token.content, line: (token.map?.[0] ?? 0) + 1, markup: token.markup });
            }
        }
    };
    walk(md.parse(text, {}));
    return out;
}

/**
 * An independent second pass over the raw lines: how many fences open. A fence
 * opens on a line of at most three spaces then three or more of one fence
 * character (a backtick fence's info string holds no backtick), and closes on a
 * line of at least as many of the same character and nothing else.
 */
export function countFenceOpeners(text: string): number {
    let count = 0;
    let open: { char: string; length: number } | undefined;
    for (const line of text.split('\n')) {
        const indent = line.length - line.trimStart().length;
        if (indent > 3 && !open) { continue; }
        const body = line.trimStart();
        const char = body[0];
        if (char !== '`' && char !== '~') { continue; }
        let length = 0;
        while (body[length] === char) { length++; }
        if (length < 3) { continue; }
        const rest = body.slice(length);
        if (open) {
            if (char === open.char && length >= open.length && rest.trim() === '') { open = undefined; }
            continue;
        }
        if (char === '`' && rest.includes('`')) { continue; }
        open = { char, length };
        count++;
    }
    return count;
}

/** Problems (parse failure, error or warning finding) of a C4X source; empty means clean. */
export function problemsOf(source: string): string[] {
    return lintC4xSource(source, {}).filter(f => f.severity !== 'info').map(f => `${f.ruleId} ${f.severity}: ${f.message}`);
}

const HEAD = '%%{ c4: container }%%\ngraph TB\n';

/**
 * Relationship statements in a prompt that the list does not hold, or that do
 * not parse alone, or that do not parse in a minimal diagram declaring their
 * endpoints. Prose outside code is held to the same rule.
 */
export function strayRelationships(output: string, listed: ReadonlySet<string>): string[] {
    const stray: string[] = [];
    const check = (statement: string, where: string) => {
        const tokens = arrowTokens(statement);
        if (tokens.length === 0) { return; }
        if (accepts('Arrow', statement.trim()) !== undefined) { return; } // the arrow syntax itself, as in "`-->` (standard)"
        const key = relationshipKey(statement);
        if (key === undefined) { stray.push(`${where}: does not parse as one relationship: ${statement.trim()}`); return; }
        if (!listed.has(key)) { stray.push(`${where}: not in the example list: ${statement.trim()}`); return; }
        const node = accepts('Relationship', statement.trim()) as RelationshipNode;
        const decls = [...new Set([node.from, node.to])].map(id => `Container(${id}, "${id}", "Go", "Does a thing")\n`).join('');
        const problems = problemsOf(HEAD + decls + statement.trim() + '\n');
        if (problems.length > 0) { stray.push(`${where}: ${problems.join('; ')}: ${statement.trim()}`); }
    };
    const visit = (tokens: ReturnType<MarkdownIt['parse']>) => {
        for (const token of tokens) {
            if (token.type === 'fence' || token.type === 'code_block') {
                token.content.split('\n').forEach(line => check(line, 'code block'));
            } else if (token.type === 'inline' && token.children) {
                for (const child of token.children) {
                    if (child.type === 'code_inline') { check(child.content, 'code span'); }
                    else if (child.type === 'text') {
                        if (arrowTokens(child.content).length > 0) { stray.push(`prose: ${child.content.trim()}`); }
                    }
                }
            }
        }
    };
    visit(md.parse(output, {}));
    return stray;
}
