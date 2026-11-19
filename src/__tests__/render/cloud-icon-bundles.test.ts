/**
 * The AWS and Azure icons ship once, as data/cloud-icons.json, and every bundle that draws them
 * reads that file next to its own directory and checks it against the SHA-256 it was built with (#534).
 *
 *   1. Parity: for a diagram with an AWS and an Azure icon, the preview's render path (the
 *      TypeScript sources), `checkC4xSource`, the MCP bundle's `render_c4x` and `c4x render` draw the
 *      same SVG, and the SVG carries both icons.
 *   2. Fault fixtures: each bundle, copied into a package-shaped directory with a missing or altered
 *      data file, refuses with the integrity or missing-file diagnostic and draws no SVG.
 *   3. The data file is read for a cloud icon and for nothing else: a diagram with no AWS or Azure
 *      icon draws from the same broken layout.
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
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { svgBuilder } from '../../render/SvgBuilder';
import { normalizeLintOptions } from '../../model/lint';
import { RENDER_THEMES, checkC4xSource } from '../../cli/renderSource';
import { SPRITES } from '../../assets/icons';

const ROOT = path.resolve(__dirname, '..', '..', '..');
/**
 * Environment for the bundle processes: Node copies NODE_V8_COVERAGE into every child unless the child's env
 * names it, and the bundles are generated code, not the unit tier's subject, so their coverage goes to a scratch folder.
 */
const BUNDLE_COVERAGE_DIR = path.join(os.tmpdir(), `c4x-icon-bundle-coverage-${process.pid}`);
const BUNDLE_ENV: NodeJS.ProcessEnv = { ...process.env, ...(process.env.NODE_V8_COVERAGE ? { NODE_V8_COVERAGE: BUNDLE_COVERAGE_DIR } : {}) };
after(() => fs.rmSync(BUNDLE_COVERAGE_DIR, { recursive: true, force: true }));
const MCP_BUNDLE = path.join(ROOT, 'mcp', 'c4x-mcp-server.bundle.cjs');
const RENDER_BUNDLE = path.join(ROOT, 'cli', 'c4x.cjs');
const DATA = path.join(ROOT, 'data', 'cloud-icons.json');
const AWS_ICON = 'aws-simple-storage-service-s3-standard';
const AZURE_ICON = 'azure-sql-database';

const ICON_DIAGRAM = [
    'graph TB',
    'Person(user, "Analyst", "Reads reports")',
    `System(files, "File store", "Holds uploads", $sprite="${AWS_ICON}")`,
    `System(db, "Orders", "Holds orders", $sprite="${AZURE_ICON}")`,
    'user -->|Uploads| files',
    'files -->|Loads| db',
    '',
].join('\n');
const LOCAL_DIAGRAM = 'graph TB\nPerson(u, "User", "A person")\nSystem(s, "App", "A system", $sprite="database")\nu -->|Uses| s\n';

const bodyOf = (id: string): string => (SPRITES[id] as { body: string }).body;

/** The preview's view-mode render (PreviewPanel.ts), on the TypeScript sources. */
async function previewRender(source: string, themeName: string): Promise<string> {
    const theme = RENDER_THEMES.get(themeName)!;
    const view = c4ModelBuilder.build(c4xParser.parse(source), 'workspace').views[0];
    const layout = await dagreLayoutEngine.layout(view, { theme, growText: true });
    return svgBuilder.build(layout, { theme, view });
}

interface Reply { id: number; result?: { isError?: boolean; content: Array<{ type: string; text?: string; resource?: { text: string } }> } }

function mcpRender(bundle: string, code: string, theme?: string): { text: string; svg?: string; isError: boolean } {
    const input = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'icons', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'render_c4x', arguments: { code, ...(theme ? { theme } : {}) } } },
    ].map(message => JSON.stringify(message)).join('\n') + '\n';
    const run = spawnSync(process.execPath, [bundle], { input, encoding: 'utf8', cwd: os.tmpdir(), env: BUNDLE_ENV, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    assert.ifError(run.error);
    const reply = run.stdout.trim().split('\n').map(line => JSON.parse(line) as Reply).find(message => message.id === 2)!;
    const [summary, svg] = reply.result!.content;
    return { text: summary.text!, svg: svg?.resource?.text, isError: reply.result!.isError === true };
}

function cliRender(bundle: string, source: string, scratch: string, theme = 'classic'): { status: number | null; stdout: string; stderr: string } {
    const input = path.join(scratch, 'diagram.c4x');
    fs.writeFileSync(input, source);
    const run = spawnSync(process.execPath, [bundle, 'render', '--theme', theme, input], { encoding: 'utf8', cwd: os.tmpdir(), env: BUNDLE_ENV, timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
    assert.ifError(run.error);
    return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** A package-shaped copy: <root>/<dir>/<bundle> and, unless `data` is undefined, <root>/data/cloud-icons.json. */
function packageLayout(scratch: string, name: string, bundle: string, dir: string, data: Buffer | undefined): string {
    const root = fs.mkdtempSync(path.join(scratch, `${name}-`));
    fs.mkdirSync(path.join(root, dir));
    fs.copyFileSync(bundle, path.join(root, dir, path.basename(bundle)));
    if (data) {
        fs.mkdirSync(path.join(root, 'data'));
        fs.writeFileSync(path.join(root, 'data', 'cloud-icons.json'), data);
    }
    return path.join(root, dir, path.basename(bundle));
}

describe('Cloud icon data in the bundles (#534)', function () {
    this.timeout(300000);

    let scratch: string;
    before(() => { scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-icon-bundles-'))); });
    after(() => fs.rmSync(scratch, { recursive: true, force: true }));

    describe('preview and render_c4x draw the same SVG for an AWS and an Azure icon', () => {
        const lint = normalizeLintOptions(true, undefined);
        for (const theme of ['classic', 'c4-model']) {
            it(`${theme}: the preview path, checkC4xSource, the MCP bundle and c4x render are equal, and the SVG carries both icons`, async () => {
                const preview = await previewRender(ICON_DIAGRAM, theme);
                for (const id of [AWS_ICON, AZURE_ICON]) {
                    assert.ok(preview.includes(bodyOf(id).slice(0, 80)), `the preview SVG lacks the ${id} sprite`);
                }
                const outcome = checkC4xSource(ICON_DIAGRAM, { theme, lint });
                assert.strictEqual(outcome.status, 'rendered', JSON.stringify(outcome.findings.slice(0, 2)));
                assert.strictEqual(outcome.svg, preview, 'checkC4xSource differs from the preview path');

                const viaMcp = mcpRender(MCP_BUNDLE, ICON_DIAGRAM, theme);
                assert.ok(!viaMcp.isError && /^Render OK\./.test(viaMcp.text), viaMcp.text);
                assert.strictEqual(viaMcp.svg, outcome.svg, 'render_c4x differs from the preview path');
                {
                    const viaCli = cliRender(RENDER_BUNDLE, ICON_DIAGRAM, scratch, theme);
                    assert.strictEqual(viaCli.status, 0, viaCli.stderr);
                    assert.strictEqual(viaCli.stdout.trimEnd(), outcome.svg!.trimEnd(), 'c4x render differs from the preview path');
                }
            });
        }
    });

    for (const [name, bundle, dir] of [['render_c4x (MCP bundle)', MCP_BUNDLE, 'mcp'], ['c4x render', RENDER_BUNDLE, 'cli']] as const) {
        const draw = (executable: string, source: string) => name.startsWith('render_c4x')
            ? (() => { const r = mcpRender(executable, source); return { drawn: !r.isError && r.svg !== undefined, text: r.text }; })()
            : (() => { const r = cliRender(executable, source, scratch); return { drawn: r.status === 0, text: r.stderr }; })();

        describe(`${name} from a package-shaped layout`, () => {
            it('draws both icons when ../data/cloud-icons.json is the file it was built with', () => {
                const result = draw(packageLayout(scratch, 'good', bundle, dir, fs.readFileSync(DATA)), ICON_DIAGRAM);
                assert.ok(result.drawn, result.text);
            });

            it('refuses with the integrity diagnostic, and no SVG, when one byte of the file changed', () => {
                const tampered = fs.readFileSync(DATA);
                tampered[tampered.indexOf('M')] ^= 0x01;
                const result = draw(packageLayout(scratch, 'tampered', bundle, dir, tampered), ICON_DIAGRAM);
                assert.ok(!result.drawn, 'a tampered icon file drew a diagram');
                assert.match(result.text, /C4X-RENDER .*C4X icon data failed its integrity check: .*data[\\/]cloud-icons\.json has SHA-256 [0-9a-f]{64}, this build expects [0-9a-f]{64}\. Reinstall the package/);
            });

            it('refuses with the missing-file diagnostic, and no SVG, when the file is absent', () => {
                const result = draw(packageLayout(scratch, 'missing', bundle, dir, undefined), ICON_DIAGRAM);
                assert.ok(!result.drawn, 'a missing icon file drew a diagram');
                assert.match(result.text, /C4X-RENDER .*C4X icon data is missing: expected .*data[\\/]cloud-icons\.json\. Reinstall the package/);
            });

            it('never reads the working directory or the repository for the file: a copy beside the cwd does not rescue a missing one', () => {
                const executable = packageLayout(scratch, 'cwd', bundle, dir, undefined);
                const cwd = fs.mkdtempSync(path.join(scratch, 'cwd-'));
                fs.mkdirSync(path.join(cwd, 'data'));
                fs.copyFileSync(DATA, path.join(cwd, 'data', 'cloud-icons.json'));
                const source = path.join(cwd, 'd.c4x');
                fs.writeFileSync(source, ICON_DIAGRAM);
                const run = name.startsWith('render_c4x')
                    ? undefined
                    : spawnSync(process.execPath, [executable, 'render', source], { encoding: 'utf8', cwd, env: BUNDLE_ENV, timeout: 60000 });
                if (run) { assert.notStrictEqual(run.status, 0); assert.match(run.stderr, /C4X icon data is missing/); }
                else { assert.match(mcpRender(executable, ICON_DIAGRAM).text, /C4X icon data is missing/); }
            });

            it('draws a diagram with no AWS or Azure icon even with a broken file: the data is read for a cloud icon only', () => {
                const result = draw(packageLayout(scratch, 'local-only', bundle, dir, undefined), LOCAL_DIAGRAM);
                assert.ok(result.drawn, result.text);
            });
        });
    }
});
