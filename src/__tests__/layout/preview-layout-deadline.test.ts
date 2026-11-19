/**
 * The preview layout deadline (#454): the 124 KB input of the issue, inside
 * every headless limit, must not hold the extension host past the budget in
 * the Markdown preview (synchronous wait) or the editor preview (async). The
 * worker is the real bundle, built here from src/layout.
 * Set C4X_TEST_NO_LAYOUT_WORKER=1 to run the pre-fix, in-process path (the red run).
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
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../../markdown/c4xPlugin';
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { resolveLayoutSpacing } from '../../layout/DagreLayoutEngine';
import { PREVIEW_LAYOUT_BUDGET_MS, layoutWithDeadline, layoutWithDeadlineSync, needsLayoutWorker, setLayoutWorkerForTests } from '../../layout/layoutDeadline';
import { layoutBounded } from '../../webview/PreviewPanel';
import type { C4View } from '../../model/C4Model';

const ROOT = path.resolve(__dirname, '..', '..', '..');

/** The generator of #454: 1,980 elements, 5,000 relationships, about 124 KB. */
function issueSource(): string {
    const stacks = 60, depth = 32, rels = 5000;
    const lines = ['%%{ c4: deployment }%%', 'graph TB'];
    for (let s = 0; s < stacks; s++) {
        for (let d = 0; d < depth; d++) { lines.push(`${'  '.repeat(d)}Node(n${s}_${d}, "N", "T") {`); }
        lines.push(`${'  '.repeat(depth)}Container(a${s}, "A", "T", "D")`);
        for (let d = depth - 1; d >= 0; d--) { lines.push(`${'  '.repeat(d)}}`); }
    }
    for (let i = 0; i < rels; i++) { lines.push(`a${i % 60} --> n${(i * 13 + 1) % 60}_${i % 32}`); }
    return lines.join('\n');
}

describe('preview layout deadline (#454)', function () {
    this.timeout(40000);
    let workerFile: string;

    before(async () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const esbuild = require('esbuild');
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { headlessVscodePlugin } = require('../../../scripts/headless-vscode-plugin');
        workerFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-layout-worker-')), 'layoutWorker.js');
        await esbuild.build({
            entryPoints: [path.join(ROOT, 'src', 'layout', 'layoutWorkerMain.ts')],
            bundle: true, format: 'cjs', platform: 'node', outfile: workerFile, logLevel: 'silent',
            plugins: [headlessVscodePlugin()],
        });
        if (!process.env.C4X_TEST_NO_LAYOUT_WORKER) {
            setLayoutWorkerForTests({ script: workerFile });
        }
    });
    after(() => setLayoutWorkerForTests(undefined));

    it('the Markdown preview returns within the budget with a message that says how to split', () => {
        const source = issueSource();
        assert.ok(source.length > 100000, `input is ${source.length} bytes`);
        const md = new MarkdownIt();
        c4xPlugin(md);
        const started = Date.now();
        const html = md.render('```c4x\n' + source + '\n```\n');
        const elapsed = Date.now() - started;
        assert.ok(elapsed < PREVIEW_LAYOUT_BUDGET_MS + 1500, `render took ${elapsed} ms`);
        assert.match(html, /Split it into several views/);
    });

    it('the editor preview path (layoutBounded) keeps the host thread responsive and ends at the budget', async () => {
        const view = c4ModelBuilder.build(c4xParser.parse(issueSource()), 'preview').views[0];
        let last = Date.now();
        let worstGap = 0;
        let ticks = 0;
        const ticker = setInterval(() => { const now = Date.now(); worstGap = Math.max(worstGap, now - last); last = now; ticks++; }, 10);
        const started = Date.now();
        let failure: Error | undefined;
        try {
            await layoutBounded(view, {});
        } catch (error) {
            failure = error as Error;
        }
        const elapsed = Date.now() - started;
        worstGap = Math.max(worstGap, Date.now() - last);
        clearInterval(ticker);
        assert.match(failure?.message ?? '', /Split it into several views/);
        assert.ok(elapsed < PREVIEW_LAYOUT_BUDGET_MS + 1000, `stopped after ${elapsed} ms`);
        assert.ok(ticks >= 50, `only ${ticks} host ticks observed`);
        assert.ok(worstGap < 500, `host thread was blocked for ${worstGap} ms`);
    });

    it('three slow Markdown fences block the host at most one budget in total', () => {
        const fence = '```c4x\n' + issueSource() + '\n```\n';
        const md = new MarkdownIt();
        c4xPlugin(md);
        const started = Date.now();
        const html = md.render(fence + fence + fence);
        const elapsed = Date.now() - started;
        assert.strictEqual((html.match(/Split it into several views/g) ?? []).length, 3);
        // Parsing three 247 KB fences is outside the wait; the waits total one budget.
        assert.ok(elapsed < PREVIEW_LAYOUT_BUDGET_MS + 2500, `render took ${elapsed} ms`);
    });

    it('a superseded render stops its worker at once and reports no result', async () => {
        const view = c4ModelBuilder.build(c4xParser.parse(issueSource()), 'preview').views[0];
        const abort = new AbortController();
        const started = Date.now();
        setTimeout(() => abort.abort(), 150);
        const result = await layoutBounded(view, {}, abort.signal);
        assert.strictEqual(result, undefined);
        assert.ok(Date.now() - started < 1000, `cancel took ${Date.now() - started} ms`);
        // The newer render, started after, still completes normally.
        const lines = ['graph TB'];
        for (let i = 0; i < 200; i++) { lines.push(`System(s${i}, "S${i}", "D")`); }
        const newer = c4ModelBuilder.build(c4xParser.parse(lines.join('\n')), 'preview').views[0];
        const done = await layoutBounded(newer, {}, new AbortController().signal);
        assert.strictEqual(done?.layout.elements.length, 200);
    });

    it('counts boundaries and depth toward the worker threshold', () => {
        const empty = { type: 'container', elements: [], relationships: [] } as unknown as C4View;
        const boundaries = Array.from({ length: 200 }, (_, i) => ({ id: `b${i}`, label: 'B', elements: [] }));
        assert.strictEqual(needsLayoutWorker({ ...empty, boundaries } as unknown as C4View), true);
        let deep: unknown[] = [];
        for (let i = 0; i < 9; i++) { deep = [{ id: `e${i}`, children: deep }]; }
        assert.strictEqual(needsLayoutWorker({ ...empty, elements: deep } as unknown as C4View), true);
        assert.strictEqual(needsLayoutWorker({ ...empty, elements: [{ id: 'a' }] } as unknown as C4View), false);
    });

    it('measures nesting through boundary membership: nine parsed nested boundaries use the worker', () => {
        const open = (n: number) => Array.from({ length: n }, (_, i) => `${'  '.repeat(i)}System_Boundary(b${i}, "B${i}") {`);
        const close = (n: number) => Array.from({ length: n }, (_, i) => `${'  '.repeat(n - 1 - i)}}`);
        const source = (n: number) => ['graph TB', ...open(n), `${'  '.repeat(n)}System(s, "S", "D")`, ...close(n)].join('\n');
        const parsed = (n: number) => c4ModelBuilder.build(c4xParser.parse(source(n)), 'preview').views[0];
        assert.strictEqual(needsLayoutWorker(parsed(9)), true);
        assert.strictEqual(needsLayoutWorker(parsed(3)), false);
    });

    it('a worker that exits early is a failure with its reason, not a slow diagram', async () => {
        const view = c4ModelBuilder.build(c4xParser.parse('graph TB\nSystem(a, "A", "D")\n'), 'preview').views[0];
        const started = Date.now();
        const crashed = await layoutWithDeadline(view, {}, { eval: true, script: 'process.exit(3);' }, 5000);
        assert.strictEqual(crashed.status, 'failed');
        assert.ok(Date.now() - started < 2000);
        if (crashed.status === 'failed') { assert.doesNotMatch(crashed.message, /Split it/); assert.match(crashed.message, /exit code 3/); }
        const exitScript = "const { workerData } = require('worker_threads'); process.on('exit', () => { Atomics.store(workerData.flag, 0, 2); Atomics.notify(workerData.flag, 0); }); process.exit(1);";
        const syncStarted = Date.now();
        const syncCrashed = layoutWithDeadlineSync(view, {}, { eval: true, script: exitScript }, 5000);
        assert.strictEqual(syncCrashed.status, 'failed');
        assert.ok(Date.now() - syncStarted < 2000);
        const slow = layoutWithDeadlineSync(view, {}, { eval: true, script: 'for (;;) {}' }, 300);
        assert.strictEqual(slow.status, 'timed-out');
    });

    it('a mid-size diagram lays out through the worker', async () => {
        const lines = ['graph TB'];
        for (let i = 0; i < 200; i++) { lines.push(`System(s${i}, "S${i}", "D")`); }
        for (let i = 1; i < 200; i++) { lines.push(`s${i - 1} --> s${i}`); }
        const view = c4ModelBuilder.build(c4xParser.parse(lines.join('\n')), 'preview').views[0];
        const outcome = await layoutWithDeadline(view, { spacing: resolveLayoutSpacing() }, { script: workerFile });
        assert.strictEqual(outcome.status, 'ok');
        if (outcome.status === 'ok') {
            assert.strictEqual(outcome.layout.elements.length, 200);
        }
    });
});
