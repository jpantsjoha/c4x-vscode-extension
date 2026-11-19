/**
 * One engine (#353, #352): for every snapshot fixture, in every
 * fixed theme, the extension's render, `checkC4xSource`, the committed MCP
 * bundle's `render_c4x` and the committed `c4x render` bundle produce SVG
 * that is equal after the snapshot normalisation.
 *
 * The extension side is computed here from the TypeScript sources on the same
 * tree, as the preview computes it (src/webview/PreviewPanel.ts, view mode:
 * parse, build, `dagreLayoutEngine.layout(view, { theme, growText: true })`,
 * `svgBuilder.build(layout, { theme, view })`, with the settings at their
 * defaults). It is not compared with frozen goldens, so a renderer change
 * keeps this green once the bundles are rebuilt, and turns it red while a
 * committed bundle is stale. The bundles also carry a hash of the sources
 * they were built from, checked here, and each must be built from the same
 * engine modules as the extension.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as esbuild from 'esbuild';
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { svgBuilder } from '../../render/SvgBuilder';
import { normalizeLintOptions } from '../../model/lint';
import { RENDER_THEMES, checkC4xSource } from '../../cli/renderSource';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FIXTURES = path.join(__dirname, '..', 'snapshots', 'fixtures');
const MCP_BUNDLE = path.join(ROOT, 'mcp', 'c4x-mcp-server.bundle.cjs');
const RENDER_BUNDLE = path.join(ROOT, 'cli', 'c4x.cjs');
/** Themes `c4x render` is also driven through, one process per fixture each. */
const CLI_THEMES = ['classic', 'c4-model'];

// eslint-disable-next-line @typescript-eslint/no-require-imports, security/detect-non-literal-require -- the repository's own build helpers
const { headlessVscodePlugin } = require(path.join(ROOT, 'scripts', 'headless-vscode-plugin.js')) as { headlessVscodePlugin(): esbuild.Plugin };
// eslint-disable-next-line @typescript-eslint/no-require-imports, security/detect-non-literal-require
const { bundleEngineHash, engineHash, firstPartyInputs } = require(path.join(ROOT, 'scripts', 'engine-hash.js')) as {
    bundleEngineHash(text: string): string | undefined;
    engineHash(inputs: string[], root: string): string;
    firstPartyInputs(metafile: esbuild.Metafile, root: string): string[];
};

/**
 * Environment for the bundle processes: Node copies NODE_V8_COVERAGE into
 * every child unless the child's env names it, and the bundles are generated
 * code, not the unit tier's subject, so their coverage goes to a scratch folder.
 */
const BUNDLE_COVERAGE_DIR = path.join(os.tmpdir(), `c4x-bundle-coverage-${process.pid}`);
const BUNDLE_ENV: NodeJS.ProcessEnv = { ...process.env, ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: BUNDLE_COVERAGE_DIR } : {}) };
after(() => fs.rmSync(BUNDLE_COVERAGE_DIR, { recursive: true, force: true }));

/** Attributes whose values are geometry: only their numbers are rounded. */
const GEOMETRY_ATTRIBUTES = /\b(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|dx|dy|width|height|d|points|transform|viewBox|stroke-width|font-size)="([^"]*)"/g;

/**
 * The snapshot tests' rounding (two decimals, extra digits cut), applied only
 * to numbers inside geometry attributes, plus their whitespace rules. Text,
 * ids and every other attribute compare exactly, so a label that differs in
 * its third decimal still differs (negative control below).
 */
function normalizeSvg(svg: string): string {
    return svg
        .replace(GEOMETRY_ATTRIBUTES, (_all, name: string, value: string) => `${name}="${value.replace(/(\d+\.\d{2})\d+/g, '$1')}"`)
        .replace(/[ \t]+$/gm, '')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function fixtureFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { return fixtureFiles(full); }
        return entry.name.endsWith('.c4x') ? [full] : [];
    }).sort();
}

/** The preview's view-mode render (PreviewPanel.ts), on the TypeScript sources. */
async function extensionRender(source: string, themeName: string): Promise<string> {
    const theme = RENDER_THEMES.get(themeName)!;
    const model = c4ModelBuilder.build(c4xParser.parse(source), 'workspace');
    const view = model.views[0];
    const layout = await dagreLayoutEngine.layout(view, { theme, growText: true });
    return svgBuilder.build(layout, { theme, view });
}

interface RpcResponse { id: number; result?: { isError?: boolean; content: Array<{ type: string; text?: string; resource?: { mimeType: string; text: string } }> } }

/** One MCP session over stdio: initialize, then every call; returns responses by id. */
function mcpSession(bundle: string, calls: ReadonlyArray<{ id: number; name: string; arguments: Record<string, unknown> }>): Map<number, RpcResponse> {
    const lines = [
        { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'equality', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        ...calls.map(call => ({ jsonrpc: '2.0', id: call.id, method: 'tools/call', params: { name: call.name, arguments: call.arguments } })),
    ].map(message => JSON.stringify(message)).join('\n') + '\n';
    const result = spawnSync(process.execPath, [bundle], { input: lines, encoding: 'utf8', cwd: os.tmpdir(), env: BUNDLE_ENV, timeout: 120000, maxBuffer: 256 * 1024 * 1024 });
    assert.ifError(result.error);
    const responses = result.stdout.trim().split('\n').map(line => JSON.parse(line) as RpcResponse);
    return new Map(responses.map(response => [response.id, response]));
}

/** The first-party inputs of a bundle entry, built in memory with the bundle's own resolution. */
async function bundleInputs(entry: string): Promise<{ inputs: string[]; metafile: esbuild.Metafile }> {
    const result = await esbuild.build({
        entryPoints: [path.join(ROOT, entry)], bundle: true, platform: 'node', format: 'cjs', target: 'node18',
        write: false, metafile: true, logLevel: 'silent', absWorkingDir: ROOT, loader: { '.md': 'text' },
        plugins: [headlessVscodePlugin()],
    });
    return { inputs: firstPartyInputs(result.metafile, ROOT), metafile: result.metafile };
}

describe('Render equality: extension, render_c4x and c4x render (#353)', function () {
    this.timeout(300000);

    const files = fixtureFiles(FIXTURES);
    const themes = [...RENDER_THEMES.keys()];
    const lint = normalizeLintOptions(true, undefined);
    const expected = new Map<string, string>();
    const key = (file: string, theme: string) => `${path.relative(FIXTURES, file)} @ ${theme}`;

    before(async () => {
        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            for (const theme of themes) {
                expected.set(key(file, theme), normalizeSvg(await extensionRender(source, theme)));
            }
        }
    });

    it('covers every snapshot fixture, the seven Internet Banking System fixtures included', () => {
        assert.ok(files.length >= 17, `${files.length} fixtures`);
        assert.strictEqual(files.filter(file => file.includes(`${path.sep}ibs${path.sep}`)).length, 7);
    });

    it('the normalisation rounds geometry only: a label that differs in its third decimal still differs (negative control)', () => {
        const draw = (label: string) => checkC4xSource(`graph TB\nSystem(a, "${label}", "d")\n`, { lint }).svg!;
        const first = normalizeSvg(draw('Value 1.234'));
        assert.notStrictEqual(first, normalizeSvg(draw('Value 1.239')), 'two labels compared equal after normalisation');
        assert.ok(first.includes('Value 1.234'), 'text is kept exactly');
        assert.strictEqual(normalizeSvg('<rect x="1.23456" data-v="1.23456"/>'), '<rect x="1.23" data-v="1.23456"/>');
        assert.strictEqual(normalizeSvg('<path d="M 1.23456 2.34567 L 3.5 4"/>'), '<path d="M 1.23 2.34 L 3.5 4"/>');
    });

    it('checkC4xSource draws what the extension draws', () => {
        for (const file of files) {
            const source = fs.readFileSync(file, 'utf8');
            for (const theme of themes) {
                const outcome = checkC4xSource(source, { theme, lint });
                assert.strictEqual(outcome.status, 'rendered', `${key(file, theme)}: ${outcome.message ?? JSON.stringify(outcome.findings.slice(0, 2))}`);
                assert.strictEqual(normalizeSvg(outcome.svg!), expected.get(key(file, theme)), key(file, theme));
            }
        }
    });

    it('the committed MCP bundle (render_c4x) draws what the extension draws', () => {
        const calls = files.flatMap((file, f) => themes.map((theme, t) => ({
            id: 1 + f * themes.length + t, name: 'render_c4x', arguments: { code: fs.readFileSync(file, 'utf8'), theme },
        })));
        const responses = mcpSession(MCP_BUNDLE, calls);
        files.forEach((file, f) => themes.forEach((theme, t) => {
            const response = responses.get(1 + f * themes.length + t);
            const label = key(file, theme);
            assert.ok(response?.result && !response.result.isError, `${label}: ${JSON.stringify(response).slice(0, 300)}`);
            const [summary, svg] = response.result.content;
            assert.match(summary.text!, /^Render OK\./, label);
            assert.strictEqual(svg.type, 'resource', label);
            assert.strictEqual(svg.resource!.mimeType, 'image/svg+xml', label);
            assert.strictEqual(normalizeSvg(svg.resource!.text), expected.get(label),
                `${label}: the MCP bundle differs from the extension; if the renderer changed, run "pnpm run build:mcp" and commit the bundles`);
        }));
    });

    it('the committed c4x render bundle draws what the extension draws', () => {
        for (const file of files) {
            for (const theme of CLI_THEMES) {
                const run = spawnSync(process.execPath, [RENDER_BUNDLE, 'render', '--theme', theme, file], { encoding: 'utf8', cwd: os.tmpdir(), env: BUNDLE_ENV, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
                const label = key(file, theme);
                assert.strictEqual(run.status, 0, `${label}: ${run.stderr}`);
                assert.strictEqual(normalizeSvg(run.stdout), expected.get(label),
                    `${label}: cli/c4x.cjs differs from the extension; if the renderer changed, run "pnpm run build:mcp" and commit the bundles`);
            }
        }
    });

    it('each render bundle carries the hash of the sources it was built from (stale-bundle check)', async () => {
        for (const [bundle, entry] of [[MCP_BUNDLE, 'mcp/c4x-mcp-server.ts'], [RENDER_BUNDLE, 'src/cli/c4xMain.ts']] as const) {
            const embedded = bundleEngineHash(fs.readFileSync(bundle, 'utf8'));
            assert.ok(embedded, `${path.relative(ROOT, bundle)} carries no c4x-engine-sha256 banner`);
            const { inputs } = await bundleInputs(entry);
            assert.strictEqual(embedded, engineHash(inputs, ROOT),
                `${path.relative(ROOT, bundle)} was built from different sources than this tree; run "pnpm run build:mcp" and commit the bundles`);
        }
    });

    it('the render bundles are built from the extension\'s engine modules, and no other copy of them', async () => {
        const extension = await esbuild.build({
            entryPoints: [path.join(ROOT, 'src', 'extension.ts')], bundle: true, platform: 'node', format: 'cjs',
            write: false, metafile: true, logLevel: 'silent', absWorkingDir: ROOT, external: ['vscode'],
        });
        const extensionInputs = new Set(firstPartyInputs(extension.metafile, ROOT));
        const ENGINE = /^src\/(parser|model|layout|render|themes|assets)\//;
        const CORE = [
            'src/parser/C4XParser.ts', 'src/parser/c4x.generated.js', 'src/model/C4ModelBuilder.ts', 'src/model/lint/lintModel.ts',
            'src/layout/DagreLayoutEngine.ts', 'src/render/SvgBuilder.ts', 'src/render/ElementRenderer.ts', 'src/render/EdgeRouter.ts',
            'src/render/textLayout.ts', 'src/assets/icons.ts', 'src/assets/cloudIcons.ts', 'src/assets/gcp-icons.ts',
            'src/themes/ClassicTheme.ts', 'src/themes/C4ModelTheme.ts',
        ];
        for (const entry of ['mcp/c4x-mcp-server.ts', 'src/cli/c4xMain.ts']) {
            const { inputs } = await bundleInputs(entry);
            for (const core of CORE) {
                assert.ok(inputs.includes(core), `${entry} does not bundle ${core}`);
                assert.ok(extensionInputs.has(core), `the extension does not bundle ${core}`);
            }
            const engine = inputs.filter(input => ENGINE.test(input));
            const elsewhere = engine.filter(input => !extensionInputs.has(input));
            // The one engine-side file only the headless bundles use is the stand-in for vscode, which lives in src/cli.
            assert.deepStrictEqual(elsewhere, [], `${entry} bundles engine files the extension does not: a second copy?`);
            assert.ok(inputs.includes('src/cli/headlessVscode.ts'), `${entry}: vscode resolves to the headless stand-in`);
        }
    });
});
