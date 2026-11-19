import * as assert from 'assert';

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
    buildNotationRules,
    buildGenerationPrompt,
    buildRecommendationPrompt,
    buildFrameworkDetectionPrompt,
    buildVisualFixPrompt,
    buildVisualDiagramPrompt,
} from '../../ai/PromptBuilder';
import { C4_STANDARD_PROMPT_PALETTE, promptPaletteFromTheme } from '../../ai/promptPalette';
import { PROMPT_EXAMPLES } from '../../ai/promptExamples';
import { runRepairLoop, unknownShapeProblem, cleanResponse, ATTEMPTS_PER_MODEL } from '../../ai/generationLoop';
import { DEFAULT_GUIDELINES } from '../../ai/prompts/defaultGuidelines';
import { C4XParser } from '../../parser/C4XParser';
import { styleShapeNames } from '../../render/elementStyle';
import { ThemeManager, themeManager } from '../../themes/ThemeManager';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { C4_MODEL_EXTERNAL_ACCENTS, C4_MODEL_INTERNAL, C4_MODEL_PERSON } from '../../themes/c4-palette';
import { shapedDataStoreProblems } from '../../ai/shapedStoreCheck';
import { lintC4xSource } from '../../cli/lintSource';
import { countFenceOpeners, fencesOf, listedRelationships, problemsOf, strayRelationships, type Fence } from './c4xGuards';
import * as fs from 'fs';
import * as path from 'path';

const STANDARD_HEX = ['#08427B', '#1168BD', '#999999', '#438DD5', '#85BBF0'];

function visualPrompt(palette?: Parameters<typeof buildVisualDiagramPrompt>[8]): string {
    return buildVisualDiagramPrompt('A web app with an API and a database', 'C2', 'TB', 'C4', 'containers', 'simple', 'balanced', 'standard spacing', palette);
}

describe('generation follows the notation (#330)', () => {
    describe('image prompt palette', () => {
        it('asks for the c4-model colours when the c4-model theme is active', () => {
            const original = themeManager.getExportTheme;
            themeManager.getExportTheme = () => C4ModelTheme;
            try {
                const prompt = visualPrompt();
                assert.ok(prompt.includes(C4_MODEL_PERSON), 'person green');
                assert.ok(prompt.includes(C4_MODEL_INTERNAL), 'internal blue outline');
                for (const accent of C4_MODEL_EXTERNAL_ACCENTS) {
                    assert.ok(prompt.includes(accent.stroke), `accent ${accent.stroke}`);
                }
                for (const hex of ['#08427B', '#438DD5', '#999999', '#85BBF0']) {
                    assert.ok(!prompt.includes(hex), `${hex} is a c4-standard colour`);
                }
            } finally {
                themeManager.getExportTheme = original;
            }
        });

        it('keeps the c4-standard colours when that theme is active', () => {
            const original = themeManager.getExportTheme;
            themeManager.getExportTheme = () => C4StandardTheme;
            try {
                const prompt = visualPrompt();
                for (const hex of STANDARD_HEX) { assert.ok(prompt.includes(hex), hex); }
                assert.ok(prompt.includes('FORBIDDEN COLORS**: DO NOT use green, red, yellow, orange, or purple'));
            } finally {
                themeManager.getExportTheme = original;
            }
        });

        it('an explicit palette overrides the active theme', () => {
            const prompt = visualPrompt(promptPaletteFromTheme(C4ModelTheme));
            assert.ok(prompt.includes(C4_MODEL_PERSON));
            assert.ok(!prompt.includes('DO NOT use green'), 'green is the c4-model person colour');
            assert.ok(visualPrompt(C4_STANDARD_PROMPT_PALETTE).includes('#08427B'));
        });

        it('describes the c4-model person as an outline and the standard one as an icon', () => {
            assert.ok(visualPrompt(promptPaletteFromTheme(C4ModelTheme)).includes('Person outline'));
            assert.ok(visualPrompt(C4_STANDARD_PROMPT_PALETTE).includes('Stick figure icon'));
        });
    });

    describe('shapes and notation in the prompts', () => {
        it('lists every shape in the shape set, and the notation, in the DSL rules', () => {
            const rules = buildNotationRules();
            for (const shape of styleShapeNames()) { assert.ok(rules.includes(shape), shape); }
            assert.ok(rules.includes('$shape="Cylinder"'));
            assert.ok(rules.includes('-->|Reads orders from| "JDBC" db'));
            assert.ok(rules.includes('Container_Boundary'));
        });

        it('the notation examples parse', () => {
            const parser = new C4XParser();
            const source = '%%{ c4: container }%%\ngraph TB\n' +
                'Container(spa, "Web App", "React", "Shows the UI", $shape="WebBrowser")\n' +
                'Container(api, "API", "Spring Boot", "Serves orders")\n' +
                'ContainerDb(db, "Orders", "PostgreSQL", "Stores orders", $shape="Cylinder")\n' +
                'spa -->|Calls| "HTTPS" api\n' +
                'api -->|Reads orders from| "JDBC" db';
            assert.doesNotThrow(() => parser.parse(source));
        });

        it('the built-in guidelines and the fix prompt carry the notation', () => {
            assert.ok(DEFAULT_GUIDELINES.includes('$shape="Cylinder"'));
            assert.ok(DEFAULT_GUIDELINES.includes('"JDBC"'));
            assert.ok(buildFixPrompt('x', 'err').includes(styleShapeNames().join(', ')));
        });

        it('the guidelines document names every drawn shape and the technology syntax', () => {
            const doc = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'C4X-GENERATION-GUIDELINES.md'), 'utf8');
            for (const shape of ['Cylinder', 'Bucket', 'Folder', 'WebBrowser', 'Terminal', 'Pipe']) { assert.ok(doc.includes('`' + shape + '`'), shape); }
            assert.ok(doc.includes('a -->|Label| "Technology" b'));
            assert.ok(doc.includes('C4X-L110'));
        });
    });

    describe('validator accepts and suggests', () => {
        const withShape = (shape: string) => '%%{ c4: container }%%\ngraph TB\n' +
            `Container(a, "A", "Go", "Does a thing", $shape="${shape}")`;

        it('accepts every shape in the shape set at once', async () => {
            for (const shape of styleShapeNames()) {
                const text = withShape(shape);
                const result = await runRepairLoop(async () => '```c4x\n' + text + '\n```', 'M', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser());
                assert.strictEqual(result, text, shape);
                assert.strictEqual(unknownShapeProblem(new C4XParser().parse(text)), undefined, shape);
            }
        });

        it('sends an unknown shape back with the closest valid name', async () => {
            const prompts: string[] = [];
            const replies = [withShape('Cylindre'), withShape('Cylinder')];
            let call = 0;
            const result = await runRepairLoop(async prompt => { prompts.push(prompt); return replies[call++]; }, 'M', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser());
            assert.strictEqual(result, withShape('Cylinder'));
            assert.strictEqual(prompts.length, 2);
            assert.ok(prompts[1].includes('Did you mean \\"Cylinder\\"?') || prompts[1].includes('Did you mean "Cylinder"?'), prompts[1]);
        });

        it('ignores a shape named in a comment: no repair call', async () => {
            const text = '%%{ c4: container }%%\ngraph TB\n%% Do not use $shape="Cylindre"\nContainer(a, "A", "Go", "Does a thing")';
            let calls = 0;
            const result = await runRepairLoop(async () => { calls++; return text; }, 'M', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser());
            assert.strictEqual(result, text);
            assert.strictEqual(calls, 1);
        });

        it('catches an unquoted unknown shape (grammar-valid) and repairs it', async () => {
            const bad = '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $shape=Cylindre)';
            const replies = [bad, withShape('Cylinder')];
            const prompts: string[] = [];
            let call = 0;
            const result = await runRepairLoop(async prompt => { prompts.push(prompt); return replies[call++]; }, 'M', 'P', 1, ATTEMPTS_PER_MODEL, new C4XParser());
            assert.strictEqual(result, withShape('Cylinder'));
            assert.ok(prompts[1].includes('Cylinder'), prompts[1]);
        });

        it('returns an unknown shape on the last attempt: it is a lint warning, not a failure', async () => {
            const result = await runRepairLoop(async () => withShape('Cylindre'), 'M', 'P', ATTEMPTS_PER_MODEL, ATTEMPTS_PER_MODEL, new C4XParser());
            assert.strictEqual(result, withShape('Cylindre'));
        });
    });

    describe('live-gate check (the live tier runs it on a model answer)', () => {
        const base = '%%{ c4: container }%%\ngraph TB\n' +
            'Person(u, "Shopper", "Buys goods")\n' +
            'Container(api, "Order API", "Java", "Takes orders")\n' +
            'ContainerDb(db, "Orders", "PostgreSQL", "Stores orders"%SHAPE%)\n' +
            'u -->|Orders through| "HTTPS" api\n' +
            'api -->|Reads and writes orders in| "JDBC" db';

        it('passes a container view with a shaped data store', () => {
            assert.deepStrictEqual(shapedDataStoreProblems(base.replace('%SHAPE%', ', $shape="Cylinder"')), []);
        });

        it('fails a view with no shaped data store', () => {
            assert.match(shapedDataStoreProblems(base.replace('%SHAPE%', ''))[0], /no element carries a data store \$shape/);
        });

        it('fails a view with an unknown shape or a source that does not parse', () => {
            assert.ok(shapedDataStoreProblems(base.replace('%SHAPE%', ', $shape="Cylindre"')).some(p => p.includes('C4X-L110')));
            assert.match(shapedDataStoreProblems('graph TB\nPerson(u "x')[0], /does not parse/);
        });
    });
});

describe('prompt colours never contradict (#330 review)', () => {
    const themes = ThemeManager.getAllThemes().flatMap(t => t.dark ? [t, t.dark] : [t]);

    for (const theme of themes) {
        for (const framework of ['C4', 'Sequence', 'Flowchart'] as const) {
            for (const level of framework === 'C4' ? ['C1', 'C2', 'C3'] : ['C2']) {
                it(`${theme.name} (${theme.colors.background}) ${framework} ${level}`, () => {
                    const palette = promptPaletteFromTheme(theme);
                    const prompt = buildVisualDiagramPrompt('A web app', level, 'TB', framework, 'r', 'g', 'balanced', 'h', palette);
                    // The background is the palette's, said everywhere it is said.
                    assert.ok(prompt.includes(`${palette.background} background`), 'background named');
                    if (palette.background.toUpperCase() !== '#FFFFFF') {
                        assert.ok(!/white \(#FFFFFF\) background|Clean white/i.test(prompt), 'no white background demanded');
                        assert.ok(!/\bwhite background\b/i.test(prompt), 'no white background demanded');
                    }
                    // Every fill the palette uses is allowed, so no sentence may forbid the colour of a fill it asks for.
                    const forbidden = [...prompt.matchAll(/DO NOT use ([^.]*?) for/g)].map(m => m[1]);
                    for (const list of forbidden) {
                        if (palette.themeName === 'c4-standard') {
                            assert.ok(/green|yellow|orange|purple/.test(list), list);
                        } else {
                            assert.ok(/outside this palette/.test(list), `a named-colour ban under ${theme.name}: ${list}`);
                        }
                    }
                    assert.ok(!/DO NOT use (green|yellow|red|orange)/.test(prompt) || palette.themeName === 'c4-standard', 'named-colour ban only for c4-standard');
                });
            }
        }
    }
});

/** Info findings allowed per rule id, recorded here on purpose. */
const ALLOWED_INFO = new Set(['C4X-L003', 'C4X-L004', 'C4X-L005', 'C4X-L006', 'C4X-L008', 'C4X-L102']); // older pattern sketches in the guidelines document
function unlistedInfo(source: string, allowed: ReadonlySet<string>): string[] {
    return lintC4xSource(source, {}).filter(f => f.severity === 'info' && !allowed.has(f.ruleId)).map(f => f.ruleId);
}

/** What a Markdown document's fences are, by info string; the count guard and the checks share it. */
function classify(text: string): { total: number; checked: Fence[]; wrong: Fence[]; cleaned: Fence[]; other: Fence[]; unknown: Fence[] } {
    const fences = fencesOf(text);
    const pick = (info: string) => fences.filter(f => f.info === info);
    const known = new Set(['c4x', 'wrong-c4x', 'cleaned-c4x', 'text']);
    return { total: fences.length, checked: pick('c4x'), wrong: pick('wrong-c4x'), cleaned: pick('cleaned-c4x'), other: pick('text'), unknown: fences.filter(f => !known.has(f.info)) };
}

describe('every C4X example the guidance shows parses and lints (#330 review 4)', () => {
    const docPath = path.join(__dirname, '..', '..', '..', 'docs', 'C4X-GENERATION-GUIDELINES.md');
    const docText = fs.readFileSync(docPath, 'utf8');
    const doc = classify(docText);

    it('the fence scanner follows CommonMark: nested, ~~~ and longer fences', () => {
        const sample = [
            '````c4x', '```', 'inner', '```', '````', '',
            '~~~c4x', 'a', '~~~', '',
            '~~~~text', '~~~', 'still inside', '~~~~', '',
            '   ```text', 'indented opener', '   ```',
        ].join('\n');
        const fences = fencesOf(sample);
        assert.deepStrictEqual(fences.map(f => f.info), ['c4x', 'c4x', 'text', 'text']);
        assert.strictEqual(fences[0].content, '```\ninner\n```\n');
        assert.strictEqual(fences[2].content, '~~~\nstill inside\n');
        assert.strictEqual(countFenceOpeners(sample), 4);
    });

    it('every fence in the guidelines document names its kind', () => {
        assert.deepStrictEqual(doc.unknown.map(f => `line ${f.line}: "${f.info}"`), []);
    });

    it('guard: the fence count by tokenizer equals an independent count of openers, and the kinds add up', () => {
        assert.strictEqual(doc.total, countFenceOpeners(docText));
        assert.strictEqual(doc.checked.length, doc.total - doc.wrong.length - doc.cleaned.length - doc.other.length);
        assert.ok(doc.checked.length >= 10 && doc.wrong.length >= 3 && doc.cleaned.length >= 1);
    });

    it('guard bites: a ~~~c4x fence with an invalid chain is found, counted and fails', () => {
        const probe = '# Doc\n\n~~~c4x\n%%{ c4: container }%%\ngraph TB\nPerson(User, "U", "x")\nContainer(Web, "W", "Go", "x")\nContainer(API, "A", "Go", "x")\nUser --> Web --> API\n~~~\n';
        const found = classify(probe);
        assert.strictEqual(found.total, countFenceOpeners(probe));
        assert.strictEqual(found.checked.length, 1);
        assert.ok(problemsOf(found.checked[0].content).length > 0);
    });

    it('every unmarked block parses with no error or warning', () => {
        for (const fence of doc.checked) {
            assert.deepStrictEqual(problemsOf(fence.content), [], `line ${fence.line}\n${fence.content}`);
            const notation = fence.content.includes('$shape') || fence.content.includes('"HTTPS"') || fence.content.includes('"JDBC"');
            assert.deepStrictEqual(unlistedInfo(fence.content, notation ? new Set() : ALLOWED_INFO), [], `line ${fence.line}`);
        }
    });

    it('every block marked wrong fails; every cleaned block is rewritten', () => {
        for (const fence of doc.wrong) {
            assert.ok(problemsOf(fence.content).length > 0, `line ${fence.line} is marked wrong but is clean\n${fence.content}`);
        }
        for (const fence of doc.cleaned) {
            assert.deepStrictEqual(problemsOf(fence.content), [], `line ${fence.line}`);
            assert.notStrictEqual(cleanResponse(fence.content), fence.content.trim(), `line ${fence.line}`);
        }
    });

    describe('prompt examples (the one exported list)', () => {
        it('every entry matches its status', () => {
            assert.ok(PROMPT_EXAMPLES.length >= 12);
            for (const e of PROMPT_EXAMPLES) {
                if (e.status === 'invalid') {
                    assert.ok(problemsOf(e.source).length > 0, `${e.id} is marked invalid but is clean`);
                    continue;
                }
                assert.deepStrictEqual(problemsOf(e.source), [], e.id);
                assert.deepStrictEqual(unlistedInfo(e.source, e.id.startsWith('chain') ? ALLOWED_INFO : e.id === 'node-label' ? new Set(['C4X-L001', 'C4X-L002']) : e.status === 'cleaned' ? new Set(['C4X-L008']) : new Set()), [], e.id);
                if (e.status === 'cleaned') { assert.notStrictEqual(cleanResponse(e.source), e.source.trim(), e.id); }
                assert.ok(e.source.includes(e.text), `${e.id}: source does not hold its text`);
            }
        });

        const listed = listedRelationships(PROMPT_EXAMPLES.map(e => e.text));

        const outputs = async (): Promise<Record<string, string>> => {
            const out: Record<string, string> = {
                generation: await buildGenerationPrompt([], 'x', { guidance: 'built-in' }),
                notation: buildNotationRules(),
                fix: buildFixPrompt('x', 'e'),
                builtIn: DEFAULT_GUIDELINES,
                recommend: buildRecommendationPrompt('A web app'),
                detect: buildFrameworkDetectionPrompt('A web app'),
                visualFix: buildVisualFixPrompt('p', 'e'),
            };
            for (const framework of ['C4', 'Sequence', 'Flowchart'] as const) {
                for (const level of ['C1', 'C2', 'C3']) {
                    out[`visual-${framework}-${level}`] = buildVisualDiagramPrompt('A web app', level, 'TB', framework, 'r', 'g', 'balanced', 'h', C4_STANDARD_PROMPT_PALETTE);
                }
            }
            return out;
        };

        it('guard: every relationship a builder shows is a listed one, parses alone and in a minimal diagram', async () => {
            assert.ok(listed.size >= 8, `${listed.size} listed relationships`);
            for (const [name, text] of Object.entries(await outputs())) {
                assert.deepStrictEqual(strayRelationships(text, listed), [], name);
            }
        });

        it('guard probes (reviewer): each leak is reported', () => {
            const probes = [
                'Chain them: `User --> Web --> API --> DB`',            // chain through a substring match
                'Use `Cache- --> Store` for the cache',                  // trailing hyphen identifier, grammar-valid
                '`User --> Web` and then User --> Web in prose',         // mixed line: listed span, bare prose arrow
                '```\nUser --> Web --> API\n```',                        // chain in a fence
                '~~~\nCache- --> Store\n~~~',                            // ~~~ fence
            ];
            for (const probe of probes) { assert.ok(strayRelationships(probe, listed).length > 0, probe); }
            assert.deepStrictEqual(strayRelationships('Use `User --> Web`, and `-->` for a solid arrow.', listed), []);
        });
    });
});
