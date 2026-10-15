/**
 * `c4x-lint` (#216): arguments, exit codes, file discovery, configuration and
 * the four output formats, run in-process against a scratch directory. The
 * bundled `cli/c4x-lint.cjs` is exercised end to end by `make lint-c4x` and
 * `pnpm run test:cli`.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EXIT_FINDINGS, EXIT_OK, EXIT_USAGE, runLint, type CliIo } from '../../cli/c4xLint';
import { expandInputs, globToRegExp } from '../../cli/files';
import { LINT_RULES } from '../../model/lint';
import { SARIF_VERSION, type SarifLog } from '../../cli/sarif';
import { RULE_CHECKS } from '../../model/lint/rules';

const CLEAN = [
    '%%{ c4: system-context }%%',
    'graph TB',
    '    customer[Customer<br/>Person]',
    '    banking[Internet Banking<br/>Software System]',
    '    customer -->|Views balances using| banking',
    '',
].join('\n');

/** C4X-L004 (info) on line 5. */
const NO_PROTOCOL = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(api, "API Application", "Java and Spring Boot", "Serves the API")',
    '    Container(db, "Database", "PostgreSQL", "Stores accounts")',
    '    api -->|Reads accounts from| db',
    '',
].join('\n');

const BROKEN = 'graph TB\nNotARealElement[]\n';

/** Parses, but cannot be drawn: the same id twice. */
const DUPLICATE_ID = 'graph TB\n    a[A<br/>Person]\n    a[Again<br/>Person]\n';

interface Run {
    readonly code: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly appended: Map<string, string>;
}

let root: string;

function write(relative: string, content: string): void {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
}

function run(argv: string[], env: Record<string, string> = {}): Run {
    let stdout = '';
    let stderr = '';
    const appended = new Map<string, string>();
    const io: CliIo = {
        cwd: root,
        env,
        stdout: text => { stdout += text; },
        stderr: text => { stderr += text; },
        appendFile: (file, text) => appended.set(file, (appended.get(file) ?? '') + text),
    };
    return { code: runLint(argv, io), stdout, stderr, appended };
}

describe('c4x-lint CLI (#216)', () => {
    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-lint-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    describe('exit codes', () => {
        it('exits 0 for a clean file', () => {
            write('clean.c4x', CLEAN);
            const result = run(['clean.c4x']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.strictEqual(result.stdout, '1 file checked: 0 errors, 0 warnings, 0 info\n');
        });

        it('exits 0 for info findings at the default --max-severity error', () => {
            write('info.c4x', NO_PROTOCOL);
            const result = run(['info.c4x']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.match(result.stdout, /^info\.c4x:5:5: info C4X-L004 /);
        });

        it('exits 0 for warning-only findings by default, and 1 once --max-severity reaches them', () => {
            write('warn.c4x', NO_PROTOCOL);
            write('.c4x-lint.json', JSON.stringify({ rules: { 'C4X-L004': 'warning' } }));
            assert.strictEqual(run(['warn.c4x']).code, EXIT_OK);
            assert.strictEqual(run(['warn.c4x', '--max-severity', 'warning']).code, EXIT_FINDINGS);
            assert.strictEqual(run(['warn.c4x', '--max-severity=info']).code, EXIT_FINDINGS);
        });

        it('exits 1 for an error finding and for a syntax error', () => {
            write('raised.c4x', NO_PROTOCOL);
            write('strict.json', JSON.stringify({ rules: { 'C4X-L004': 'error' } }));
            assert.strictEqual(run(['raised.c4x', '--config', 'strict.json']).code, EXIT_FINDINGS);

            write('broken.c4x', BROKEN);
            const broken = run(['broken.c4x']);
            assert.strictEqual(broken.code, EXIT_FINDINGS);
            assert.match(broken.stdout, /^broken\.c4x:2:\d+: error C4X-SYNTAX C4X syntax error: /);
        });

        it('lets --max-severity override the threshold both ways', () => {
            write('info.c4x', NO_PROTOCOL);
            write('broken.c4x', BROKEN);
            assert.strictEqual(run(['info.c4x', '--max-severity', 'info']).code, EXIT_FINDINGS);
            assert.strictEqual(run(['broken.c4x', '--max-severity', 'off']).code, EXIT_OK);
        });

        it('exits 2 for usage errors, with the usage text', () => {
            write('clean.c4x', CLEAN);
            for (const argv of [[], ['clean.c4x', '--format', 'xml'], ['clean.c4x', '--max-severity', 'fatal'], ['clean.c4x', '--bogus'], ['clean.c4x', '--config']]) {
                const result = run(argv);
                assert.strictEqual(result.code, EXIT_USAGE, argv.join(' '));
                assert.match(result.stderr, /Usage: c4x-lint/);
            }
        });

        it('exits 2 when nothing matches, naming the pattern', () => {
            const result = run(['docs/**/*.c4x']);
            assert.strictEqual(result.code, EXIT_USAGE);
            assert.match(result.stderr, /no \.c4x or Markdown files match "docs\/\*\*\/\*\.c4x"/);
        });

        it('exits 2 for an unreadable or malformed configuration file', () => {
            write('clean.c4x', CLEAN);
            assert.match(run(['clean.c4x', '--config', 'missing.json']).stderr, /missing\.json: cannot be read/);
            write('.c4x-lint.json', '{ not json');
            const malformed = run(['clean.c4x']);
            assert.strictEqual(malformed.code, EXIT_USAGE);
            assert.match(malformed.stderr, /\.c4x-lint\.json: not valid JSON/);
            write('.c4x-lint.json', '[]');
            assert.match(run(['clean.c4x']).stderr, /must be a JSON object/);
        });

        it('exits 2, naming the file, when a rule itself fails, instead of passing the diagram', () => {
            write('info.c4x', NO_PROTOCOL);
            const checks = RULE_CHECKS as Record<string, unknown>;
            const original = checks['C4X-L004'];
            checks['C4X-L004'] = () => { throw new Error('rule exploded'); };
            try {
                const result = run(['info.c4x']);
                assert.strictEqual(result.code, EXIT_USAGE);
                assert.match(result.stderr, /info\.c4x: C4X lint failed internally: rule exploded/);
            } finally {
                checks['C4X-L004'] = original;
            }
        });

        it('prints its version and exits 0', () => {
            const result = run(['--version']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.match(result.stdout, /^\d+\.\d+\.\d+\n$/);
        });

        it('prints help and exits 0', () => {
            const result = run(['--help']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.match(result.stdout, /--max-severity <info\|warning\|error\|off>/);
        });
    });

    describe('configuration', () => {
        it('warns about unknown keys, rule ids and values instead of guessing', () => {
            write('info.c4x', NO_PROTOCOL);
            write('.c4x-lint.json', JSON.stringify({ rule: {}, rules: { 'C4X-L999': 'error', 'C4X-L004': 'fatal' } }));
            const result = run(['info.c4x']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.match(result.stderr, /unknown key "rule" ignored/);
            assert.match(result.stderr, /unknown rule "C4X-L999" ignored/);
            assert.match(result.stderr, /C4X-L004 must be one of off, ignore, info, warning, error; using its default/);
            assert.match(result.stdout, /info C4X-L004/);
        });

        it('turns notation rules off with enabled: false but still fails a syntax error', () => {
            write('info.c4x', NO_PROTOCOL);
            write('broken.c4x', BROKEN);
            write('.c4x-lint.json', JSON.stringify({ enabled: false }));
            const result = run(['info.c4x', 'broken.c4x', '--max-severity', 'info']);
            assert.strictEqual(result.code, EXIT_FINDINGS);
            assert.doesNotMatch(result.stdout, /C4X-L004/);
            assert.match(result.stdout, /C4X-SYNTAX/);
        });

        it('still fails a model error with enabled: false', () => {
            write('dup.c4x', DUPLICATE_ID);
            write('.c4x-lint.json', JSON.stringify({ enabled: false }));
            const result = run(['dup.c4x']);
            assert.strictEqual(result.code, EXIT_FINDINGS);
            assert.match(result.stdout, /^dup\.c4x:1:1: error C4X-MODEL C4X model error: Duplicate element identifier "a"/);
        });
    });

    describe('input handling', () => {
        it('ignores a UTF-8 byte order mark, in a .c4x file and in Markdown', () => {
            write('bom.c4x', `\uFEFF${NO_PROTOCOL}`);
            write('bom.md', `\uFEFF# Doc\n\n\`\`\`c4x\n${NO_PROTOCOL}\`\`\`\n`);
            write('bom-clean.c4x', `\uFEFF${CLEAN}`);
            const result = run(['bom.c4x', 'bom.md', 'bom-clean.c4x', '--max-severity', 'warning']);
            assert.strictEqual(result.code, EXIT_OK, result.stdout);
            assert.match(result.stdout, /^bom\.c4x:5:5: info C4X-L004 /m);
            assert.match(result.stdout, /^bom\.md:8:5: info C4X-L004 /m);
            assert.doesNotMatch(result.stdout, /C4X-SYNTAX/);
        });

        it('exits 2 when any argument matches nothing, even if others match, and lints nothing', () => {
            write('clean.c4x', CLEAN);
            for (const missing of ['renamed.c4x', 'gone/**/*.c4x', 'clean.txt']) {
                const result = run(['clean.c4x', missing]);
                assert.strictEqual(result.code, EXIT_USAGE, missing);
                assert.ok(result.stderr.includes(`no .c4x or Markdown files match "${missing}"`), result.stderr);
                assert.strictEqual(result.stdout, '', 'nothing is reported when the input list is wrong');
            }
        });

        it('reports every path relative to the working directory, never absolute', () => {
            write('docs/a.c4x', NO_PROTOCOL);
            const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-lint-outside-'));
            try {
                fs.writeFileSync(path.join(outside, 'far.c4x'), NO_PROTOCOL);
                const inputs = [path.join(root, 'docs', 'a.c4x'), `${root}/docs/**/*.c4x`, path.join(root, 'docs'), path.join(outside, 'far.c4x')];
                assert.deepStrictEqual(expandInputs(inputs, root).files, [
                    `../${path.basename(outside)}/far.c4x`,
                    'docs/a.c4x',
                ]);
                for (const format of ['text', 'github', 'json', 'sarif']) {
                    const result = run([...inputs, '--format', format]);
                    assert.ok(!result.stdout.includes(root), `${format}: no absolute path of the working directory`);
                    assert.ok(!result.stdout.includes(outside), `${format}: no absolute path outside it`);
                }
                const log = JSON.parse(run([...inputs, '--format', 'sarif']).stdout) as SarifLog;
                const uris = log.runs[0].results.map(result => result.locations[0].physicalLocation.artifactLocation.uri);
                assert.ok(uris.every(uri => !uri.startsWith('/')), uris.join(' '));
            } finally {
                fs.rmSync(outside, { recursive: true, force: true });
            }
        });

        it('escapes control characters in file names wherever it prints them', function () {
            if (process.platform === 'win32') {
                this.skip();
            }
            write('evil\nname.c4x', NO_PROTOCOL);
            write('evil\u001b[2Jx.c4x', BROKEN);
            const text = run(['.', '--max-severity', 'off']);
            const lines = text.stdout.trimEnd().split('\n');
            assert.deepStrictEqual(lines.map(line => line.split(':')[0]), ['evil\\nname.c4x', 'evil\\x1b[2Jx.c4x', '2 files checked']);
            assert.ok(!text.stdout.includes('\u001b'), 'no raw escape character reaches the terminal');

            const github = run(['.', '--format', 'github', '--max-severity', 'off']);
            const commands = github.stdout.split('\n').filter(line => line.startsWith('::'));
            assert.strictEqual(commands.length, 2, 'a newline in a name cannot forge an annotation');
            assert.match(commands[0], /file=evil\\nname\.c4x,/);

            const missing = run(['no\nsuch.c4x']);
            assert.match(missing.stderr, /match "no\\nsuch\.c4x"/);
            assert.ok(!missing.stderr.split('\n')[0].endsWith('no'), 'the name stays on one line');
        });
    });

    describe('file discovery', () => {
        beforeEach(() => {
            write('docs/a.c4x', CLEAN);
            write('docs/nested/b.md', `# B\n\n\`\`\`c4x\n${NO_PROTOCOL}\`\`\`\n`);
            write('docs/nested/notes.txt', 'not lintable');
            write('docs/node_modules/c.c4x', BROKEN);
            write('docs/.hidden/d.c4x', BROKEN);
            write('README.markdown', 'No fences here.\n');
        });

        it('expands globs, directories and files, sorted and without duplicates', () => {
            assert.deepStrictEqual(expandInputs(['docs/**/*.{c4x,md}', 'docs', 'README.markdown'], root), {
                files: ['README.markdown', 'docs/a.c4x', 'docs/nested/b.md'],
                unmatched: [],
            });
            assert.deepStrictEqual(expandInputs(['docs/*.c4x'], root).files, ['docs/a.c4x']);
            assert.deepStrictEqual(expandInputs(['**/b.md'], root).files, ['docs/nested/b.md']);
            assert.deepStrictEqual(expandInputs(['./docs/a.c4x'], root).files, ['docs/a.c4x']);
        });

        it('reports arguments that reach no lintable file', () => {
            assert.deepStrictEqual(expandInputs(['docs/nested/notes.txt', 'nope', 'docs/*.md'], root), {
                files: [],
                unmatched: ['docs/nested/notes.txt', 'nope', 'docs/*.md'],
            });
        });

        it('compiles glob syntax to anchored expressions', () => {
            assert.ok(globToRegExp('**/*.c4x').test('a/b/c.c4x'));
            assert.ok(globToRegExp('**/*.c4x').test('c.c4x'));
            assert.ok(!globToRegExp('*.c4x').test('a/c.c4x'));
            assert.ok(globToRegExp('doc?/[ab].md').test('docs/a.md'));
            assert.ok(!globToRegExp('doc?/[!ab].md').test('docs/a.md'));
            assert.ok(globToRegExp('x.{md,c4x}').test('x.c4x'));
            assert.ok(!globToRegExp('x.md').test('xamd'));
            assert.ok(globToRegExp('docs/**').test('docs/a/b.md'));
            // A bracket, negated or not, never matches the separator.
            assert.ok(!globToRegExp('a[!x]b.md').test('a/b.md'));
            assert.ok(!globToRegExp('a[/]b.md').test('a/b.md'));
            // `**` inside a segment is an ordinary `*`, not a directory crossing.
            assert.ok(globToRegExp('docs/**.md').test('docs/a.md'));
            assert.ok(!globToRegExp('docs/**.md').test('docs/sub/a.md'));
            assert.ok(!globToRegExp('a**b.md').test('a/x/b.md'));
        });

        it('lints the Markdown fence and skips node_modules and dot-directories', () => {
            const result = run(['docs']);
            assert.strictEqual(result.code, EXIT_OK);
            assert.match(result.stdout, /^docs\/nested\/b\.md:8:5: info C4X-L004 /m);
            assert.match(result.stdout, /2 files checked: 0 errors, 0 warnings, 1 info/);
        });
    });

    describe('formats', () => {
        beforeEach(() => {
            write('arch, v1/info.c4x', NO_PROTOCOL);
            write('broken.c4x', BROKEN);
        });

        it('--quiet reports only the findings that fail the run, and still counts them all', () => {
            const result = run(['arch, v1/info.c4x', 'broken.c4x', '--quiet']);
            assert.doesNotMatch(result.stdout, /C4X-L004/);
            assert.match(result.stdout, /C4X-SYNTAX/);
            assert.match(result.stdout, /2 files checked: 1 error, 0 warnings, 1 info\n$/);
            assert.deepStrictEqual(JSON.parse(run(['arch, v1/info.c4x', 'broken.c4x', '--quiet', '--format', 'json']).stdout).summary,
                { info: 1, warning: 0, error: 1 });
        });

        it('github: one workflow command per finding, with escaped properties', () => {
            const result = run(['arch, v1/info.c4x', 'broken.c4x', '--format', 'github']);
            const lines = result.stdout.trimEnd().split('\n');
            assert.match(lines[0], /^::notice file=arch%2C v1\/info\.c4x,line=5,col=5,endColumn=\d+,title=C4X-L004::Relationship api --> db /);
            assert.match(lines[1], /^::error file=broken\.c4x,line=2,col=\d+,title=C4X-SYNTAX::C4X syntax error: /);
            assert.ok(lines[1].split('::')[2].length > 0);
            assert.strictEqual(lines[2], '2 files checked: 1 error, 0 warnings, 1 info');
            assert.strictEqual(result.appended.size, 0, 'no step summary without GITHUB_STEP_SUMMARY');
        });

        it('github: writes a Markdown step summary when GITHUB_STEP_SUMMARY is set', () => {
            const result = run(['arch, v1/info.c4x', 'broken.c4x', '--format', 'github'], { GITHUB_STEP_SUMMARY: '/summary.md' });
            const summary = result.appended.get('/summary.md') ?? '';
            assert.match(summary, /^## C4X lint\n\n2 files checked: 1 error, 0 warnings, 1 info\n/);
            const rows = summary.split('\n').filter(line => line.startsWith('| ') && !line.startsWith('| Severity'));
            assert.deepStrictEqual(rows.map(row => row.split(' | ')[0]), ['| error', '| info']);
        });

        it('json: the summary and every finding with its file', () => {
            const result = run(['arch, v1/info.c4x', 'broken.c4x', '--format', 'json']);
            const parsed = JSON.parse(result.stdout);
            assert.strictEqual(parsed.files, 2);
            assert.deepStrictEqual(parsed.summary, { info: 1, warning: 0, error: 1 });
            assert.deepStrictEqual(parsed.findings.map((f: { file: string; ruleId: string }) => [f.file, f.ruleId]), [
                ['arch, v1/info.c4x', 'C4X-L004'],
                ['broken.c4x', 'C4X-SYNTAX'],
            ]);
            assert.match(result.stderr, /2 files checked/);
            assert.strictEqual(result.code, EXIT_FINDINGS);
        });

        it('sarif: a structurally valid SARIF 2.1.0 log', () => {
            const result = run(['arch, v1/info.c4x', 'broken.c4x', '--format', 'sarif']);
            assertValidSarif(JSON.parse(result.stdout));
        });

        it('sarif: rules, levels and locations map from the findings', () => {
            const log = JSON.parse(run(['arch, v1/info.c4x', 'broken.c4x', '--format', 'sarif']).stdout) as SarifLog;
            const [runLog] = log.runs;
            assert.deepStrictEqual(
                runLog.tool.driver.rules.map(rule => rule.id),
                [...LINT_RULES.map(rule => rule.id), 'C4X-SYNTAX', 'C4X-MODEL'],
            );
            assert.deepStrictEqual(runLog.results.map(r => [r.ruleId, r.level]), [['C4X-L004', 'note'], ['C4X-SYNTAX', 'error']]);
            const location = runLog.results[0].locations[0].physicalLocation;
            assert.strictEqual(location.artifactLocation.uri, 'arch%2C%20v1/info.c4x');
            assert.strictEqual(location.artifactLocation.uriBaseId, '%SRCROOT%');
            assert.strictEqual(location.region.startLine, 5);
            assert.ok(!JSON.stringify(log).includes(root), 'no absolute workstation path in the log');
        });

        it('sarif: a clean run is still a valid log, with no results', () => {
            write('clean.c4x', CLEAN);
            const log = JSON.parse(run(['clean.c4x', '--format', 'sarif']).stdout);
            assertValidSarif(log);
            assert.deepStrictEqual(log.runs[0].results, []);
        });
    });
});

/**
 * The structural constraints of the SARIF 2.1.0 schema that this output can
 * break: required properties, enumerations, 1-based regions, rule indices that
 * point at the rule they name, and relative URI references.
 * https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html
 */
function assertValidSarif(log: unknown): void {
    const isObject = (value: unknown): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value);
    const isPositiveInteger = (value: unknown) => Number.isInteger(value) && (value as number) >= 1;

    assert.ok(isObject(log), 'log is an object');
    assert.strictEqual(log.version, SARIF_VERSION);
    assert.strictEqual(typeof log.$schema, 'string');
    assert.ok(Array.isArray(log.runs) && log.runs.length === 1, 'exactly one run');
    const sarifRun = log.runs[0] as Record<string, unknown>;
    assert.ok(isObject(sarifRun.tool) && isObject(sarifRun.tool.driver), 'run.tool.driver');
    const driver = sarifRun.tool.driver as Record<string, unknown>;
    assert.strictEqual(typeof driver.name, 'string');
    assert.match(String(driver.semanticVersion), /^\d+\.\d+\.\d+$/);
    assert.ok(Array.isArray(driver.rules));
    const rules = driver.rules as Array<Record<string, unknown>>;
    const ids = rules.map(rule => rule.id);
    assert.strictEqual(new Set(ids).size, ids.length, 'rule ids are unique');
    for (const rule of rules) {
        assert.strictEqual(typeof rule.id, 'string');
        assert.ok(isObject(rule.shortDescription) && typeof rule.shortDescription.text === 'string');
        assert.match(String(rule.helpUri), /^https:\/\//);
        assert.ok(isObject(rule.defaultConfiguration));
        assert.ok(['none', 'note', 'warning', 'error'].includes(String(rule.defaultConfiguration.level)));
    }
    assert.strictEqual(sarifRun.columnKind, 'utf16CodeUnits');
    assert.ok(Array.isArray(sarifRun.results));
    for (const result of sarifRun.results as Array<Record<string, unknown>>) {
        assert.ok(isObject(result.message) && typeof result.message.text === 'string' && result.message.text.length > 0);
        assert.ok(['none', 'note', 'warning', 'error'].includes(String(result.level)));
        assert.ok(Number.isInteger(result.ruleIndex));
        assert.strictEqual(rules[result.ruleIndex as number].id, result.ruleId, 'ruleIndex points at ruleId');
        assert.ok(Array.isArray(result.locations) && result.locations.length === 1);
        const physical = (result.locations[0] as Record<string, Record<string, Record<string, unknown>>>).physicalLocation;
        const uri = String(physical.artifactLocation.uri);
        assert.ok(!/^[a-z]+:|^\/|\\/i.test(uri), `relative URI reference: ${uri}`);
        assert.doesNotThrow(() => decodeURIComponent(uri));
        assert.ok(!/[ ,]/.test(uri), 'reserved characters are percent-encoded');
        const region = physical.region;
        for (const key of ['startLine', 'startColumn', 'endLine', 'endColumn']) {
            assert.ok(isPositiveInteger(region[key]), `region.${key} is a positive integer`);
        }
        assert.ok((region.endLine as number) >= (region.startLine as number));
        if (region.endLine === region.startLine) {
            assert.ok((region.endColumn as number) > (region.startColumn as number), 'a single-line region is not empty');
        }
    }
}
