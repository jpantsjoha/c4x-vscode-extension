import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// The npm package `c4x` (#356): scripts/npm-package.js stages and audits it. Each test below is cited
// by a line of the threat model's "npm package c4x" checklist.

interface PackageModule {
    // eslint-disable-next-line @typescript-eslint/naming-convention -- mirrors the module's exported constants
    PACKAGE_FILES: string[];
    // eslint-disable-next-line @typescript-eslint/naming-convention
    SOURCES: Record<string, string>;
    stage(out: string, root?: string): Record<string, unknown>;
    auditManifest(manifest: Record<string, unknown>): string[];
    auditPackage(dir: string): string[];
    npmInvocation(platform?: string, execPath?: string, pathModule?: unknown): { command: string; args: string[] };
    binScript(installedDir: string, name: string, pathModule?: unknown, readFile?: (file: string) => string): string;
    packedFiles(dir: string): string[];
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pkg: PackageModule = require('../../../scripts/npm-package');
const ROOT = path.resolve(__dirname, '..', '..', '..');

function scratch(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-npm-test-'));
}

describe('npm package c4x (#356)', function () {
    this.timeout(60000);
    let staged: string;
    let template: Record<string, unknown>;

    before(() => {
        staged = path.join(scratch(), 'c4x');
        pkg.stage(staged);
        template = JSON.parse(fs.readFileSync(path.join(ROOT, 'npm', 'package.json'), 'utf8'));
    });
    after(() => fs.rmSync(path.dirname(staged), { recursive: true, force: true }));

    describe('the manifest', () => {
        it('is not the extension manifest: its own name, bin entries, no scripts, no dependencies', () => {
            assert.strictEqual(template.name, 'c4x');
            assert.strictEqual(template.main, undefined, 'no extension entry point');
            assert.strictEqual(template.publisher, undefined, 'no VS Code publisher');
            assert.deepStrictEqual(template.bin, { c4x: 'cli/c4x.cjs', 'c4x-lint': 'cli/c4x-lint.cjs', 'c4x-mcp': 'mcp/c4x-mcp-server.bundle.cjs' });
            assert.strictEqual(template.scripts, undefined);
            assert.strictEqual(template.engines && (template.engines as Record<string, string>).vscode, undefined);
        });

        it('carries no install, preinstall or postinstall script, no native build, no optional dependency (threat model: install scripts)', () => {
            const staged_ = JSON.parse(fs.readFileSync(path.join(staged, 'package.json'), 'utf8'));
            assert.deepStrictEqual(pkg.auditManifest(staged_), []);
            for (const field of ['scripts', 'dependencies', 'optionalDependencies', 'peerDependencies', 'bundledDependencies', 'gypfile']) {
                assert.strictEqual(staged_[field], undefined, `${field} must be absent`);
            }
        });

        it('takes its version from the extension, so one release number names both', () => {
            const extension = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
            assert.strictEqual(JSON.parse(fs.readFileSync(path.join(staged, 'package.json'), 'utf8')).version, extension.version);
            assert.strictEqual(template.version, undefined, 'the committed template carries no version of its own');
        });

        for (const [label, mutate, expected] of [
            ['a postinstall script', (m: Record<string, unknown>) => { m.scripts = { postinstall: 'node x.js' }; }, /postinstall/],
            ['an install script', (m: Record<string, unknown>) => { m.scripts = { install: 'node-gyp rebuild' }; }, /scripts present/],
            ['a runtime dependency', (m: Record<string, unknown>) => { m.dependencies = { left: '1.0.0' }; }, /dependencies is not empty/],
            ['an optional dependency', (m: Record<string, unknown>) => { m.optionalDependencies = { fsevents: '2.3.3' }; }, /optionalDependencies is not empty/],
            ['a native build', (m: Record<string, unknown>) => { m.gypfile = true; }, /gypfile/],
            ['a missing files allowlist', (m: Record<string, unknown>) => { delete m.files; }, /no files allowlist/],
            ['a widened files allowlist', (m: Record<string, unknown>) => { m.files = [...(m.files as string[]), 'src']; }, /files allowlist is/],
            ['a bin outside the allowlist', (m: Record<string, unknown>) => { m.bin = { ...(m.bin as object), evil: 'scripts/evil.js' }; }, /outside the allowlist/],
        ] as const) {
            it(`the audit rejects ${label}`, () => {
                const manifest = JSON.parse(fs.readFileSync(path.join(staged, 'package.json'), 'utf8'));
                mutate(manifest);
                assert.match(pkg.auditManifest(manifest).join('\n'), expected);
            });
        }
    });

    describe('the tarball file list (npm pack --dry-run --json)', () => {
        it('lists exactly the allowlist: the bundles, their notices, the licence, the README and the manifest', () => {
            assert.deepStrictEqual(pkg.packedFiles(staged), [...pkg.PACKAGE_FILES].sort());
            assert.deepStrictEqual(pkg.auditPackage(staged), []);
        });

        it('stages the committed bundles and notices byte for byte', () => {
            for (const [target, source] of Object.entries(pkg.SOURCES)) {
                assert.ok(fs.readFileSync(path.join(staged, target)).equals(fs.readFileSync(path.join(ROOT, source))), `${target} differs from ${source}`);
            }
        });

        it('fails when a stray file is added to the allowlist', () => {
            const copy = path.join(scratch(), 'c4x');
            try {
                pkg.stage(copy);
                fs.writeFileSync(path.join(copy, 'stray.txt'), 'not for the registry\n');
                const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'package.json'), 'utf8'));
                manifest.files.push('stray.txt');
                fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify(manifest));
                const problems = pkg.auditPackage(copy).join('\n');
                assert.match(problems, /outside the allowlist: stray\.txt/);
            } finally {
                fs.rmSync(path.dirname(copy), { recursive: true, force: true });
            }
        });

        it('fails when the files allowlist is dropped and a stray file would ship', () => {
            const copy = path.join(scratch(), 'c4x');
            try {
                pkg.stage(copy);
                fs.writeFileSync(path.join(copy, '.env'), 'SECRET=1\n');
                const manifest = JSON.parse(fs.readFileSync(path.join(copy, 'package.json'), 'utf8'));
                delete manifest.files;
                fs.writeFileSync(path.join(copy, 'package.json'), JSON.stringify(manifest));
                const problems = pkg.auditPackage(copy).join('\n');
                assert.match(problems, /no files allowlist/);
                assert.match(problems, /outside the allowlist: .*\.env/);
            } finally {
                fs.rmSync(path.dirname(copy), { recursive: true, force: true });
            }
        });
    });

    describe('running the installed package on Windows (#356 review)', () => {
        const winPath = path.win32;
        const execPath = 'C:\\Program Files\\nodejs\\node.exe';

        it('runs npm through this Node and npm-cli.js on win32, and as `npm` elsewhere', () => {
            assert.deepStrictEqual(pkg.npmInvocation('win32', execPath, winPath), {
                command: execPath,
                args: ['C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js'],
            });
            assert.deepStrictEqual(pkg.npmInvocation('darwin'), { command: 'npm', args: [] });
            assert.deepStrictEqual(pkg.npmInvocation('linux'), { command: 'npm', args: [] });
        });

        it('resolves a bin to the script named in the installed package.json, never a .bin shim', () => {
            const manifest = JSON.stringify({ bin: { c4x: 'cli/c4x.cjs', 'c4x-mcp': 'mcp/c4x-mcp-server.bundle.cjs' } });
            const installed = 'C:\\proj\\node_modules\\c4x';
            const reads: string[] = [];
            const read = (file: string): string => { reads.push(file); return manifest; };
            assert.strictEqual(pkg.binScript(installed, 'c4x', winPath, read), 'C:\\proj\\node_modules\\c4x\\cli\\c4x.cjs');
            assert.strictEqual(pkg.binScript(installed, 'c4x-mcp', winPath, read), 'C:\\proj\\node_modules\\c4x\\mcp\\c4x-mcp-server.bundle.cjs');
            assert.deepStrictEqual([...new Set(reads)], ['C:\\proj\\node_modules\\c4x\\package.json']);
            assert.ok(!pkg.binScript(installed, 'c4x', winPath, read).includes('.bin'));
            assert.throws(() => pkg.binScript(installed, 'nope', winPath, read), /no bin entry nope/);
        });
    });

    describe('the README', () => {
        const readme = fs.readFileSync(path.join(ROOT, 'npm', 'README.md'), 'utf8');
        it('gives a configuration snippet for Claude Code, Codex, Gemini CLI and VS Code, none using npx', () => {
            for (const host of ['### Claude Code', '### Codex', '### Gemini CLI', '### VS Code']) assert.ok(readme.includes(host), host);
            assert.ok(readme.includes('claude mcp add c4x -- c4x-mcp'));
            assert.ok(readme.includes('[mcp_servers.c4x]'));
            assert.ok(readme.includes('"mcpServers"'));
            assert.ok(readme.includes('"servers"'));
            assert.doesNotMatch(readme, /\bnpx\b/);
        });
    });
});

describe('the extension package leaves the npm staging directory out', () => {
    it('.vscodeignore excludes the directory scripts/npm-package.js stages into', () => {
        const repo = path.resolve(__dirname, '..', '..', '..');
        const ignore = fs.readFileSync(path.join(repo, '.vscodeignore'), 'utf8').split('\n').map((l) => l.trim());
        const script = fs.readFileSync(path.join(repo, 'scripts', 'npm-package.js'), 'utf8');
        const line = script.split('\n').find((l) => l.startsWith('const DEFAULT_OUT = path.join(ROOT,'));
        assert.ok(line, 'DEFAULT_OUT not found in scripts/npm-package.js');
        const parts = [...line.matchAll(/'([^']+)'/g)].map((x) => x[1]);
        const stageRoot = parts.slice(0, -1).join('/');
        assert.ok(ignore.includes(`${stageRoot}/**`), `.vscodeignore must exclude ${stageRoot}/** (make verify-npm leaves the staged package there)`);
    });
});
