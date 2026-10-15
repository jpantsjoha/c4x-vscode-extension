/**
 * #219: architecture conformance export (dependency-cruiser allow-list) and
 * `conform` (checker result -> .c4x lines). Pure core, no VS Code.
 *
 * The recorded results under test/fixtures/conformance/recorded are real
 * dependency-cruiser 18.4.0 output (Node 22), trimmed to the fields conform
 * reads: the shop fixture as committed, the shop fixture with one forbidden
 * store -> api import injected, and the overlapping-globs fixture.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { C4View } from '../../model/C4Model';
import {
    ConformanceInputError,
    DEFAULT_EXCLUDE,
    DepCruiseResult,
    FileComponentIndex,
    TYPESCRIPT_VERSION,
    codeElements,
    conformFromDependencyCruiser,
    countMappedSourceFiles,
    listFilesNoSymlinks,
    realRelativePaths,
    exportDependencyCruiserAllowList,
    formatConformanceResult,
    formatExportReport,
    globToRegexBody,
    globsToRegex,
    loadComponentView,
    parseDepCruiseResult,
    serializeConfig,
    shellQuote,
    stronglyConnectedComponents,
} from '../../conformance';
import { ownedRegexes } from '../../conformance/ownership';

const REPO = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(REPO, 'test', 'fixtures', 'conformance');
const SHOP_VIEW = path.join(FIXTURES, 'shop', 'shop.c3.c4x');

function shopView(): C4View {
    return loadComponentView(fs.readFileSync(SHOP_VIEW, 'utf8'));
}

function recorded(name: string): DepCruiseResult {
    return parseDepCruiseResult(fs.readFileSync(path.join(FIXTURES, 'recorded', name), 'utf8'));
}

function lineOf(text: string, needle: string): number {
    return text.split('\n').findIndex(line => line.includes(needle)) + 1;
}

function view(body: string): C4View {
    return loadComponentView(`%%{ c4: component }%%\ngraph TB\n${body}\n`);
}

describe('#219 glob to dependency-cruiser regex', () => {
    const cases: Array<[string, string[], string[]]> = [
        ['src/parser/**', ['src/parser/a.ts', 'src/parser/deep/b.ts'], ['src/parsers/a.ts', 'src/parser.ts', 'lib/src/parser/a.ts']],
        ['src/extension.ts', ['src/extension.ts'], ['src/extension.tsx', 'src/extensionXts', 'src/extension.ts.bak']],
        ['src/parser', ['src/parser', 'src/parser/a.ts'], ['src/parser.ts', 'src/parserx/a.ts']],
        ['src/parser/', ['src/parser/a.ts'], ['src/parser.ts']],
        ['src/*.ts', ['src/a.ts'], ['src/a/b.ts', 'src/a.js']],
        ['src/**/*.ts', ['src/a.ts', 'src/a/b/c.ts'], ['src/a.js', 'lib/a.ts']],
        ['**/index.ts', ['index.ts', 'src/a/index.ts'], ['src/a/index.tsx', 'src/myindex.ts']],
        ['src/{parser,model}/**', ['src/parser/a.ts', 'src/model/b.ts'], ['src/layout/a.ts']],
        ['src/a?.ts', ['src/ab.ts'], ['src/a.ts', 'src/a/.ts']],
        ['src/[ab].ts', ['src/a.ts', 'src/b.ts'], ['src/c.ts']],
        ['src/[!ab].ts', ['src/c.ts'], ['src/a.ts', 'src//.ts']],
        ['packages/*/src/**', ['packages/core/src/x.ts'], ['packages/core/test/x.ts', 'packages/a/b/src/x.ts']],
        ['src/a+b (1)/x.ts', ['src/a+b (1)/x.ts'], ['src/aab (1)/x.ts']],
    ];

    for (const [glob, matches, rejects] of cases) {
        it(`${glob}`, () => {
            const regex = new RegExp(`^${globToRegexBody(glob)}$`);
            for (const file of matches) {
                assert.ok(regex.test(file), `${glob} should match ${file} (${regex})`);
            }
            for (const file of rejects) {
                assert.ok(!regex.test(file), `${glob} should not match ${file} (${regex})`);
            }
        });
    }

    it('never quantifies a group, so dependency-cruiser\'s safe-regex check accepts it', () => {
        for (const [glob] of cases) {
            const regex = globsToRegex([glob, 'lib/**']);
            assert.ok(!/\)[*+?{]/.test(regex), `${glob} produced a quantified group: ${regex}`);
        }
    });

    it('combines several globs into one anchored alternation', () => {
        assert.strictEqual(globsToRegex(['src/a/**', 'src/b.ts']), '^(?:src/a(?:$|/.*)|src/b\\.ts(?:$|/.*))$');
        assert.strictEqual(globsToRegex(['src/a/**']), '^src/a(?:$|/.*)$');
    });
});

describe('#219 dependency-cruiser allow-list export', () => {
    it('matches the golden export for the shop fixture', () => {
        const exported = exportDependencyCruiserAllowList(shopView());
        const golden = fs.readFileSync(path.join(FIXTURES, 'expected.dependency-cruiser.c4x.json'), 'utf8');
        assert.strictEqual(serializeConfig(exported.config), golden);
    });

    it('emits one rule per declared relationship and one same-component rule per mapped element', () => {
        const exported = exportDependencyCruiserAllowList(shopView());
        const comments = exported.config.allowed.map(rule => rule.comment);
        assert.strictEqual(exported.relationshipRules, 3);
        assert.deepStrictEqual(comments.filter(c => c.includes('same component')).length, 4);
        assert.ok(comments.some(c => c.startsWith('c4x: api -> orders (places orders through), line 16')));
        assert.strictEqual(exported.config.allowedSeverity, 'error');
        assert.strictEqual(exported.config.options.tsPreCompilationDeps, true);
        assert.deepStrictEqual(exported.scope, ['src/']);
        assert.strictEqual(
            exported.suggestedCommand,
            `npx --yes -p dependency-cruiser@18.4.0 -p typescript@${TYPESCRIPT_VERSION} depcruise 'src' --config .dependency-cruiser.c4x.json --output-type err`,
        );
    });

    it('reports components without $code and the relationships it could not turn into rules', () => {
        const text = fs.readFileSync(SHOP_VIEW, 'utf8');
        const exported = exportDependencyCruiserAllowList(shopView());
        assert.deepStrictEqual(exported.unmapped.map(e => [e.id, e.span.line]), [['audit', lineOf(text, 'Component(audit,')]]);
        assert.deepStrictEqual(
            exported.skippedRelationships.map(r => [r.from, r.to, r.span.line]),
            [['customer', 'api', lineOf(text, 'customer -->')], ['api', 'audit', lineOf(text, 'api -->|records')]],
        );
        assert.match(exported.skippedRelationships[0].reason, /not a Container or Component/);
        assert.match(exported.skippedRelationships[1].reason, /audit has no \$code/);
        const report = formatExportReport(exported, 'shop.c3.c4x');
        assert.match(report, /shop\.c3\.c4x:12:9: note: audit \(Component\) has no \$code/);
        assert.match(report, /api --> audit produced no rule/);
    });

    it('deduplicates repeated arrows and skips self-relationships', () => {
        const exported = exportDependencyCruiserAllowList(view([
            'Component(a, "A", $code="src/a/**")',
            'Component(b, "B", $code="src/b/**")',
            'a -->|one| b',
            'a -.->|two| b',
            'a --> a',
        ].join('\n')));
        assert.strictEqual(exported.relationshipRules, 1);
        assert.match(exported.skippedRelationships[0].reason, /to itself/);
    });

    it('can ignore type-only imports, override the scope and drop the exclude', () => {
        const exported = exportDependencyCruiserAllowList(view('Component(a, "A", $code="lib/a/**")'), {
            typeOnly: 'ignored', scope: ['lib/', 'tools/'], exclude: '',
        });
        assert.ok(exported.config.allowed.some(rule => rule.to.dependencyTypes?.includes('type-only')));
        assert.strictEqual(exported.config.allowed[0].to.pathNot, '^(?:lib/.*|tools/.*)$');
        assert.strictEqual(exported.config.options.exclude, undefined);
        assert.match(exported.suggestedCommand, / 'lib' 'tools' --config /);
    });

    it('pins the TypeScript that the lockfile installs beside the checker', () => {
        const installed = JSON.parse(fs.readFileSync(path.join(REPO, 'node_modules', 'typescript', 'package.json'), 'utf8')) as { version: string };
        assert.strictEqual(TYPESCRIPT_VERSION, installed.version);
    });

    it('single-quotes cruise targets and rejects scope entries carrying shell syntax', () => {
        assert.strictEqual(shellQuote("it's"), `'it'\\''s'`);
        assert.throws(
            () => exportDependencyCruiserAllowList(view('Component(a, "A", $code="src/a/**")'), { scope: ['$(touch${IFS}/tmp/pwned)/'] }),
            (error: unknown) => error instanceof ConformanceInputError && /contains "\$"/.test(error.message),
        );
        assert.throws(() => view('Component(a, "A", $code="$(touch${IFS}/tmp/pwned)/x/**")'), /contains "\$"/);
    });

    it('gives a file under overlapping globs only its owner\'s permissions', () => {
        const overlap = loadComponentView(fs.readFileSync(path.join(FIXTURES, 'overlap', 'overlap.c3.c4x'), 'utf8'));
        const exported = exportDependencyCruiserAllowList(overlap);
        const regex = new Map(exported.mapped.map(element => [element.id, new RegExp(element.pathRegex)]));
        assert.ok(regex.get('orders')?.test('src/orders/service.js'));
        assert.ok(!regex.get('orders')?.test('src/orders/pricing.js'), 'pricing.js belongs to pricing, not orders');
        assert.ok(regex.get('pricing')?.test('src/orders/pricing.js'));
        for (const element of exported.mapped) {
            assert.ok(!/\)[*+?{]/.test(element.pathRegex), `${element.id}: quantified group in ${element.pathRegex}`);
        }
    });

    it('breaks equal-specificity ties in favour of the element declared first, on both sides', () => {
        const tie = view('Component(first, "First", $code="src/x/*.ts")\nComponent(second, "Second", $code="src/x/**")');
        const [first, second] = ownedRegexes(codeElements(tie)).map(owned => new RegExp(owned.ownedRegex));
        assert.ok(first.test('src/x/a.ts') && !second.test('src/x/a.ts'));
        assert.ok(second.test('src/x/a.js') && second.test('src/x/deep/a.ts'));
        assert.strictEqual(new FileComponentIndex(codeElements(tie)).componentOf('src/x/a.ts'), 'first');
    });

    it('keeps plain regexes when globs cannot overlap', () => {
        const owned = ownedRegexes(codeElements(view('Component(a, "A", $code="src/a/**")\nComponent(b, "B", $code="src/b/**")')));
        assert.deepStrictEqual(owned.map(o => o.ownedRegex), ['^src/a(?:$|/.*)$', '^src/b(?:$|/.*)$']);
    });

    it('excludes tests and mocks by default', () => {
        const exclude = new RegExp(DEFAULT_EXCLUDE);
        for (const file of ['src/__tests__/a.ts', 'src/a.test.ts', 'src/a.spec.mjs', 'src/__mocks__/vscode.ts']) {
            assert.ok(exclude.test(file), file);
        }
        assert.ok(!exclude.test('src/testing/a.ts'));
    });

    it('exports nothing but reports everything when no element has $code', () => {
        const exported = exportDependencyCruiserAllowList(view('Component(a, "A")\nComponent(b, "B")\na --> b'));
        assert.strictEqual(exported.mapped.length, 0);
        assert.strictEqual(exported.unmapped.length, 2);
        assert.strictEqual(exported.skippedRelationships.length, 1);
        assert.deepStrictEqual(exported.scope, []);
    });

    it('refuses views that are not component views', () => {
        assert.throws(
            () => loadComponentView('%%{ c4: container }%%\ngraph TB\nContainer(a, "A", $code="src/**")'),
            (error: unknown) => error instanceof ConformanceInputError && /component \(C3\) view/.test(error.message),
        );
    });
});

describe('#219 conform: dependency-cruiser result -> .c4x lines', () => {
    const text = fs.readFileSync(SHOP_VIEW, 'utf8');

    it('the clean fixture conforms; the planned-but-unbuilt relationship and the unmapped component are reported', () => {
        const result = conformFromDependencyCruiser(shopView(), recorded('depcruise-clean.json'));
        assert.strictEqual(result.errorCount, 0);
        assert.deepStrictEqual(result.findings.map(f => [f.kind, f.span.line]), [
            ['unmapped-element', lineOf(text, 'Component(audit,')],
            ['unused-relationship', lineOf(text, 'orders -->|notifies via|')],
        ]);
        assert.deepStrictEqual(result.observedEdges, [
            { from: 'api', to: 'orders', fileEdges: 1 },
            { from: 'orders', to: 'store', fileEdges: 1 },
        ]);
    });

    it('an injected forbidden import lands on the source component, and its cycle is reported', () => {
        const result = conformFromDependencyCruiser(shopView(), recorded('depcruise-injected.json'));
        assert.strictEqual(result.errorCount, 1);
        const undeclared = result.findings.find(f => f.kind === 'undeclared-dependency');
        assert.ok(undeclared);
        assert.strictEqual(undeclared.span.line, lineOf(text, 'Component(store,'));
        assert.strictEqual(undeclared.span.column, 9);
        assert.deepStrictEqual(undeclared.components, ['store', 'api']);
        assert.deepStrictEqual(undeclared.evidence, [{ from: 'src/store/repository.js', to: 'src/api/server.js' }]);

        const cycle = result.findings.find(f => f.kind === 'component-cycle');
        assert.ok(cycle);
        assert.deepStrictEqual(cycle.components, ['api', 'orders', 'store']);
        assert.strictEqual(cycle.span.line, lineOf(text, 'Component(api,'));
        assert.match(cycle.message, /api -> orders -> store -> api/);
        assert.strictEqual(cycle.evidence?.length, 3);
    });

    it('overlapping globs: recorded checker result fails on both undeclared pairs', () => {
        const overlapText = fs.readFileSync(path.join(FIXTURES, 'overlap', 'overlap.c3.c4x'), 'utf8');
        const overlap = loadComponentView(overlapText);
        const result = conformFromDependencyCruiser(overlap, recorded('depcruise-overlap.json'));
        const undeclared = result.findings.filter(f => f.kind === 'undeclared-dependency');
        assert.deepStrictEqual(undeclared.map(f => [f.components?.join('->'), f.span.line]), [
            ['api->pricing', lineOf(overlapText, 'Component(api,')],
            ['pricing->store', lineOf(overlapText, 'Component(pricing,')],
        ]);
        assert.strictEqual(result.errorCount, 2);
    });

    it('flags an observed undeclared component edge even when the checker reported nothing', () => {
        const overlap = loadComponentView(fs.readFileSync(path.join(FIXTURES, 'overlap', 'overlap.c3.c4x'), 'utf8'));
        const recordedResult = recorded('depcruise-overlap.json');
        // A stale allow-list (the pre-fix export) let both edges through: same graph, no violations.
        const stale: DepCruiseResult = { modules: recordedResult.modules, summary: { violations: [], totalCruised: 4 } };
        const result = conformFromDependencyCruiser(overlap, stale);
        const undeclared = result.findings.filter(f => f.kind === 'undeclared-dependency');
        assert.deepStrictEqual(undeclared.map(f => f.components?.join('->')), ['api->pricing', 'pricing->store']);
        assert.ok(undeclared.every(f => /did not report it/.test(f.message)));
    });

    it('fails loudly when the cruise saw no mapped module, or far fewer than exist', () => {
        const nothing = conformFromDependencyCruiser(shopView(), { modules: [{ source: 'http', dependencies: [] }], summary: { violations: [] } });
        assert.strictEqual(nothing.errorCount, 1);
        assert.match(nothing.findings.find(f => f.kind === 'incomplete-cruise')?.message ?? '', /no module that any \$code maps.*typescript/);

        const few = conformFromDependencyCruiser(shopView(), recorded('depcruise-clean.json'), { expectedSourceFiles: 40 });
        assert.match(few.findings.find(f => f.kind === 'incomplete-cruise' && f.severity === 'error')?.message ?? '', /covers 6 of the 40 source files/);

        const enough = conformFromDependencyCruiser(shopView(), recorded('depcruise-clean.json'), { expectedSourceFiles: 6 });
        assert.strictEqual(enough.errorCount, 0);
        assert.strictEqual(enough.mappedModules, 6);
    });

    it('warns about a mapped element none of whose files were cruised', () => {
        const result = conformFromDependencyCruiser(view('Component(a, "A", $code="src/a/**")\nComponent(b, "B", $code="src/b/**")'), {
            modules: [{ source: 'src/a/x.ts', dependencies: [] }], summary: { violations: [] },
        });
        assert.deepStrictEqual(result.findings.map(f => `${f.kind}:${f.severity}:${f.elementId}`), ['incomplete-cruise:warning:b']);
    });

    it('does not report unused relationships when the cruise failed coverage', () => {
        const result = conformFromDependencyCruiser(shopView(), recorded('depcruise-clean.json'), { expectedSourceFiles: 40 });
        assert.ok(result.findings.some(f => f.kind === 'incomplete-cruise' && f.severity === 'error'));
        assert.ok(!result.findings.some(f => f.kind === 'unused-relationship'));
    });

    describe('symbolic links do not inflate the on-disk count', () => {
        let root: string;
        before(function () {
            root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-symlink-'));
            fs.mkdirSync(path.join(root, 'src', 'api'), { recursive: true });
            fs.writeFileSync(path.join(root, 'src', 'api', 'server.js'), 'module.exports = 1;\n');
            fs.writeFileSync(path.join(root, 'src', 'mailer.js'), 'module.exports = 2;\n');
            try {
                fs.symlinkSync('.', path.join(root, 'src', 'loop'), 'dir'); // src/loop -> src
            } catch {
                this.skip(); // the platform refused to create a symlink
            }
        });
        after(() => fs.rmSync(root, { recursive: true, force: true }));

        it('the walker skips the src/loop -> . link instead of following it', () => {
            assert.deepStrictEqual(listFilesNoSymlinks(root, 'src').sort(), ['src/api/server.js', 'src/mailer.js']);
            assert.deepStrictEqual(listFilesNoSymlinks(root, 'src/loop'), []);
        });

        it('paths found through the link collapse onto their real paths, as dependency-cruiser reports them', () => {
            const found = [
                path.join(root, 'src', 'api', 'server.js'),
                path.join(root, 'src', 'loop', 'api', 'server.js'),
                path.join(root, 'src', 'loop', 'loop', 'mailer.js'),
                path.join(root, 'src', 'missing.js'),
            ];
            const realpath = (absolute: string) => {
                try {
                    return fs.realpathSync(absolute);
                } catch {
                    return undefined;
                }
            };
            const relative = realRelativePaths(found, root, realpath).sort();
            assert.deepStrictEqual(relative, ['src/api/server.js', 'src/mailer.js']);
            assert.strictEqual(countMappedSourceFiles(shopView(), relative), 2);
        });

        it('drops paths whose real location is outside the workspace', () => {
            assert.deepStrictEqual(realRelativePaths(['/elsewhere/x.js'], root, absolute => absolute), []);
            assert.deepStrictEqual(realRelativePaths([path.dirname(root)], root, absolute => absolute), []);
        });

        it('keeps a folder whose name merely starts with ".."', () => {
            const identity = (absolute: string) => absolute;
            assert.deepStrictEqual(realRelativePaths([path.join(root, '..cache', 'x.ts')], root, identity), ['..cache/x.ts']);
        });
    });

    it('counts the mapped, checkable source files found on disk', () => {
        const count = countMappedSourceFiles(shopView(), [
            'src/api/server.js', './src/orders/service.js', 'src/orders/service.js', 'src/orders/service.test.js',
            'src/orders/types.d.ts', 'src/orders/README.md', 'src/unmapped/x.js', 'src/mailer.js',
        ]);
        assert.strictEqual(count, 3);
    });

    it('formats findings for terminals and as GitHub workflow annotations', () => {
        const result = conformFromDependencyCruiser(shopView(), recorded('depcruise-injected.json'));
        const textOut = formatConformanceResult(result, 'test/fixtures/conformance/shop/shop.c3.c4x');
        assert.match(textOut, /shop\.c3\.c4x:10:9: error \[undeclared-dependency\] store depends on api \(1 import\)/);
        assert.match(textOut, /does not conform — 1 error\(s\), 2 warning\(s\), 1 note\(s\)/);
        const github = formatConformanceResult(result, 'docs/a,b:c.c4x', 'github');
        assert.match(github, /^::error file=docs\/a%2Cb%3Ac\.c4x,line=10,col=9,endLine=10,endColumn=\d+,title=C4X undeclared-dependency::store depends on api/m);
        assert.match(github, /^::warning file=.*title=C4X component-cycle::/m);
        assert.match(github, /^::notice file=.*title=C4X unmapped-element::/m);
        assert.ok(!github.split('\n').some(line => line.startsWith('::') && line.includes('\n')));
    });

    const synthetic = view([
        'Component(a, "A", $code="src/a/**")',
        'Component(b, "B", $code="src/b/**, src/b-special.ts")',
        'Component(special, "Special", $code="src/a/special/**")',
        'a --> b',
    ].join('\n'));

    it('maps a file to the element with the most specific glob', () => {
        const index = new FileComponentIndex(codeElements(synthetic));
        assert.strictEqual(index.componentOf('src/a/x.ts'), 'a');
        assert.strictEqual(index.componentOf('src/a/special/x.ts'), 'special');
        assert.strictEqual(index.componentOf('./src/b-special.ts'), 'b');
        assert.strictEqual(index.componentOf('src\\b\\y.ts'), 'b');
        assert.strictEqual(index.componentOf('src/c/z.ts'), undefined);
    });

    it('reports a violation from a file no element maps, and one into such a file', () => {
        const result = conformFromDependencyCruiser(synthetic, {
            summary: {
                violations: [
                    { from: 'src/new/x.ts', to: 'src/a/y.ts', rule: { name: 'not-in-allowed', severity: 'error' } },
                    { from: 'src/a/y.ts', to: 'src/new/x.ts', rule: { name: 'not-in-allowed', severity: 'error' } },
                    { from: 'src/a/y.ts', to: 'src/a/z.ts', rule: { name: 'no-circular', severity: 'warn' } },
                ],
            },
        });
        const kinds = result.findings.map(f => `${f.kind}:${f.severity}:${f.span.line}`);
        assert.deepStrictEqual(kinds.sort(), [
            'checker-violation:warning:3',
            'undeclared-dependency:error:3',
            'unmapped-file:error:1',
        ]);
        assert.match(result.findings.find(f => f.kind === 'undeclared-dependency')?.message ?? '', /imports src\/new\/x\.ts, which no element's \$code maps/);
        assert.strictEqual(result.graphAvailable, false, 'no modules array: cycles and usage are not computed');
        assert.match(formatConformanceResult(result, 'v.c4x'), /no module graph/);
    });

    it('groups many file edges of one undeclared pair into one finding with bounded evidence', () => {
        const violations = Array.from({ length: 8 }, (_, i) => ({
            from: `src/b/f${i}.ts`, to: 'src/a/x.ts', rule: { name: 'not-in-allowed', severity: 'error' },
        }));
        const result = conformFromDependencyCruiser(synthetic, { summary: { violations } });
        assert.strictEqual(result.errorCount, 1);
        assert.strictEqual(result.findings[0].evidence?.length, 5);
        assert.strictEqual(result.findings[0].edgeCount, 8);
        assert.match(formatConformanceResult(result, 'v.c4x'), /\.\.\. and 3 more/);
    });

    it('leaves type-only edges out of cycles and usage only when asked to', () => {
        const modules = [
            { source: 'src/a/x.ts', dependencies: [{ resolved: 'src/b/y.ts', dependencyTypes: ['local', 'import'] }] },
            { source: 'src/b/y.ts', dependencies: [{ resolved: 'src/a/x.ts', dependencyTypes: ['local', 'import', 'type-only'] }] },
        ];
        const checked = conformFromDependencyCruiser(synthetic, { modules, summary: { violations: [] } });
        assert.ok(checked.findings.some(f => f.kind === 'component-cycle'));
        const ignored = conformFromDependencyCruiser(synthetic, { modules, summary: { violations: [] } }, { typeOnly: 'ignored' });
        assert.ok(!ignored.findings.some(f => f.kind === 'component-cycle'));
    });

    it('ignores Node built-ins, unresolved imports and edges within one component', () => {
        const modules = [{
            source: 'src/a/x.ts',
            dependencies: [
                { resolved: 'fs', coreModule: true, dependencyTypes: ['core'] },
                { resolved: 'src/b/missing.ts', couldNotResolve: true },
                { resolved: 'src/a/z.ts', dependencyTypes: ['local'] },
            ],
        }];
        const result = conformFromDependencyCruiser(synthetic, { modules, summary: { violations: [] } });
        assert.deepStrictEqual(result.observedEdges, []);
        assert.ok(result.findings.some(f => f.kind === 'unused-relationship'), 'a --> b has no import behind it');
    });

    it('rejects input that is not a dependency-cruiser JSON result', () => {
        assert.throws(() => parseDepCruiseResult('not json'), /not JSON/);
        assert.throws(() => parseDepCruiseResult('{"modules": []}'), /--output-type json/);
    });

    it('finds strongly connected components', () => {
        const sccs = stronglyConnectedComponents(['a', 'b', 'c', 'd'], new Map([
            ['a', ['b']], ['b', ['c']], ['c', ['a', 'd']],
        ]));
        assert.deepStrictEqual(sccs.map(s => [...s].sort()).sort(), [['a', 'b', 'c'], ['d']]);
    });
});
