import * as assert from 'assert';

// Mock vscode before importing PromptBuilder (it imports vscode at module level).
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import {
    buildFixPrompt,
    buildGenerationPrompt,
    buildVisualDiagramPrompt,
} from '../../ai/PromptBuilder';
import { DEFAULT_GUIDELINES } from '../../ai/prompts/defaultGuidelines';
import { C4XParser } from '../../parser/C4XParser';
import { C4_ACCEPTED_ELEMENT_TYPES, C4_ELEMENT_TYPES } from '../../model/c4Legality';

/** Arrow forms the grammar accepts, with the relationship kind the model builder gives each. */
const GRAMMAR_ARROWS = ['-->', '-.->', '==>'];

/**
 * Catalogue spellings the prompts leave out on purpose. They are names of the
 * rendered model: authors write `System`, `System_Ext` and `Node`.
 */
const SOURCE_SPELLING_ONLY = new Set(['SoftwareSystem', 'SoftwareSystem_Ext', 'DeploymentNode']);

const BOUNDARY_TYPES = new Set(['System_Boundary', 'Container_Boundary', 'Enterprise_Boundary']);

const parser = new C4XParser();

function assertParses(source: string, origin: string): void {
    try {
        parser.parse(source);
    } catch (e) {
        assert.fail(`${origin} does not parse with the C4X grammar:\n${source}\n-> ${(e as Error).message}`);
    }
}

async function generationPrompts(): Promise<Record<string, string>> {
    const files = [{ path: 'src/a.ts', content: 'export const a = 1;' }];
    return {
        'generation prompt': await buildGenerationPrompt(files, 'draw it'),
        'generation prompt (forced layout)': await buildGenerationPrompt(files, 'draw it', { direction: 'LR' }),
        'fix prompt': buildFixPrompt('A --> B', 'boom'),
        'built-in guidelines': DEFAULT_GUIDELINES,
    };
}

/** Text of a prompt with wrong examples and "do not use" clauses removed. */
function positiveText(text: string): string {
    return text
        .split('\n')
        .filter(line => !/❌/.test(line))
        .map(line => line.replace(/\b(?:Do NOT|NEVER)\b.*$/, ''))
        .join('\n');
}

function inlineCode(text: string): string[] {
    const spans: string[] = [];
    for (const m of text.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
        spans.push(m[1]);
    }
    return spans;
}

function fencedBlocks(text: string): string[] {
    return [...text.matchAll(/```c4x\n([\s\S]*?)```/g)].map(m => m[1]);
}

describe('AI prompt syntax matches the grammar', () => {
    it('never teaches the dotted arrow the grammar rejects', async () => {
        for (const [name, text] of Object.entries(await generationPrompts())) {
            assert.ok(!text.includes('..>'), `${name} contains "..>"`);
        }
        const visual = buildVisualDiagramPrompt('x', 'C2', 'TB', 'C4', 'r', 'g', 'balanced', 'h');
        assert.ok(!visual.includes('..>'), 'visual prompt contains "..>"');
    });

    it('rejects ..> in the grammar, so the instruction above is load-bearing', () => {
        assert.throws(() => parser.parse('graph TB\nA ..> B'));
    });

    it('names only arrow forms the grammar accepts, and names all three', async () => {
        const named = new Set<string>();
        for (const [name, text] of Object.entries(await generationPrompts())) {
            for (const span of inlineCode(positiveText(text))) {
                for (const m of span.matchAll(/-\.->|-->|==>|\.\.>|->/g)) {
                    if (m[0] === '->') { continue; } // forbidden form, only ever named as "do not use"
                    named.add(m[0]);
                    assert.ok(GRAMMAR_ARROWS.includes(m[0]), `${name} names arrow "${m[0]}" the grammar rejects`);
                }
            }
        }
        for (const arrow of GRAMMAR_ARROWS) {
            assert.ok(named.has(arrow), `no prompt names the accepted arrow ${arrow}`);
            assertParses(`graph TB\nA ${arrow} B`, `arrow ${arrow}`);
        }
    });

    it('describes each arrow with the meaning the model builder gives it', async () => {
        const rules = await buildGenerationPrompt([], 'x');
        const arrowRule = rules.split('\n').find(l => /^\d\. \*\*Arrows\*\*/.test(l)) ?? '';
        assert.match(arrowRule, /-->`[^`]*\(standard\)/);
        assert.match(arrowRule, /-\.->`[^`]*\(async/);
        assert.match(arrowRule, /==>`[^`]*\(sync/);
    });

    it('parses every relationship example in the prompts', async () => {
        let count = 0;
        for (const [name, text] of Object.entries(await generationPrompts())) {
            for (const span of inlineCode(positiveText(text))) {
                // A chain such as `A --> B --> C` is several relationships.
                const parts = span.split(/\s*(?=\b[A-Za-z_]\w*\s*(?:-->|-\.->|==>))/).filter(Boolean);
                const rels = parts.length > 1
                    ? parts.slice(0, -1).map((p, i) => `${p.trim()} ${parts[i + 1].split(/\s/)[0]}`)
                    : [span];
                for (const rel of rels) {
                    if (!/(?:-->|-\.->|==>)/.test(rel) || /\(|\{/.test(rel)) { continue; }
                    const endpointsOk = /^\w+\s*(?:-->|-\.->|==>)(?:\|[^|]*\|)?\s*\w+$/.test(rel.trim());
                    if (!endpointsOk) { continue; }
                    assertParses(`graph TB\n${rel.trim()}`, `${name}: ${rel}`);
                    count++;
                }
            }
        }
        assert.ok(count >= 3, `expected at least 3 relationship examples, found ${count}`);
    });

    it('parses every fenced c4x example in the prompts', async () => {
        let count = 0;
        for (const [name, text] of Object.entries(await generationPrompts())) {
            for (const block of fencedBlocks(text)) {
                assertParses(block, `${name} example`);
                count++;
            }
        }
        assert.ok(count >= 1, 'expected at least one fenced c4x example');
    });

    describe('element type list', () => {
        function whitelistLines(text: string): string {
            const start = text.indexOf('ELEMENT TYPE WHITELIST');
            assert.ok(start >= 0, 'generation prompt has an element type whitelist');
            const end = text.indexOf('NEVER invent', start);
            return text.slice(start, end);
        }

        function namedTypes(block: string): Set<string> {
            const found = new Set<string>();
            for (const m of block.matchAll(/`([A-Z][A-Za-z_]*)\(/g)) { found.add(m[1]); }
            return found;
        }

        it('equals the catalogue, less the documented source-spelling exceptions', async () => {
            const prompt = await buildGenerationPrompt([], 'x');
            const named = namedTypes(whitelistLines(prompt));
            const expected = new Set(C4_ACCEPTED_ELEMENT_TYPES.filter(t => !SOURCE_SPELLING_ONLY.has(t)));
            assert.deepStrictEqual([...named].sort(), [...expected].sort());
        });

        it('covers every palette type the editor offers', async () => {
            const named = namedTypes(whitelistLines(await buildGenerationPrompt([], 'x')));
            for (const type of C4_ELEMENT_TYPES) {
                if (SOURCE_SPELLING_ONLY.has(type)) { continue; }
                assert.ok(named.has(type), `palette type ${type} missing from the prompt`);
            }
        });

        it('lists the same types in the fix prompt', async () => {
            const fix = buildFixPrompt('x', 'y');
            const line = fix.split('\n').find(l => l.includes('Element Type Whitelist')) ?? '';
            const named = new Set([...line.matchAll(/`([A-Z][A-Za-z_]*)`/g)].map(m => m[1]));
            for (const type of C4_ACCEPTED_ELEMENT_TYPES) {
                if (SOURCE_SPELLING_ONLY.has(type)) { continue; }
                assert.ok(named.has(type), `fix prompt omits ${type}`);
            }
        });

        it('parses an example of every listed type with the real grammar', () => {
            for (const type of C4_ACCEPTED_ELEMENT_TYPES) {
                if (SOURCE_SPELLING_ONLY.has(type)) { continue; }
                const example = BOUNDARY_TYPES.has(type)
                    ? `${type}(b, "B") {\n  Container(c, "C", "Node.js", "d")\n}`
                    : `${type}(x, "X", "d")`;
                assertParses(`graph TB\n${example}`, `type ${type}`);
            }
        });

        it('does not let the built-in guidelines invent a type', () => {
            const known = new Set<string>(C4_ACCEPTED_ELEMENT_TYPES);
            for (const m of DEFAULT_GUIDELINES.matchAll(/^\s*([A-Z][A-Za-z_]*)\(\w+,/gm)) {
                assert.ok(known.has(m[1]), `guidelines use unknown type ${m[1]}`);
            }
        });
    });
});
