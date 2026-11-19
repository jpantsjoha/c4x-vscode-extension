/**
 * The render deadline (#353, review round 3): renderWithDeadline checks
 * first, draws in a worker thread and stops it at the deadline. Here the
 * worker runs the TypeScript sources (an evaluated worker that loads them
 * through ts-node), or stand-ins that never answer or fail, so the deadline
 * is tested without depending on how fast this machine lays out a diagram.
 * The shipped bundles are timed end to end in render-equality.test.ts.
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
import * as path from 'path';
import { normalizeLintOptions } from '../../model/lint';
import { RENDER_TIME_BUDGET_MS } from '../../cli/limits';
import { RENDER_RULE_ID, checkC4xSource } from '../../cli/renderSource';
import { CANCELLED_MESSAGE, liveRenderWorkers, renderWithDeadline, renderWithDeadlineAsync, runRenderWorkerIfWorker, tooLongMessage, type WorkerSpec } from '../../cli/renderWorker';

const lint = normalizeLintOptions(true, undefined);
const VALID = 'graph TB\nSystem(a, "A", "Does things")\nPerson(u, "User", "Uses it")\nu -->|Uses| a\n';
/** Draws, with one lint finding (C4X-L102: an element with no relationship). */
const UNCONNECTED = 'graph TB\nSystem(a, "A", "Does things")\n';
const ROOT = path.resolve(__dirname, '..', '..', '..');

/** A worker that loads the TypeScript sources, with `vscode` resolved to the unit mock, and runs the real job. */
const SOURCE_WORKER: WorkerSpec = {
    eval: true,
    script: `
        const Module = require('module');
        const resolve = Module._resolveFilename;
        Module._resolveFilename = function (request, ...args) {
            return request === 'vscode' ? ${JSON.stringify(path.join(ROOT, 'src', '__tests__', '__mocks__', 'vscode.ts'))} : resolve.call(this, request, ...args);
        };
        require(${JSON.stringify(path.join(ROOT, 'scripts', 'register-unit-ts.js'))});
        require(${JSON.stringify(path.join(ROOT, 'src', 'cli', 'renderWorker.ts'))}).runRenderWorkerIfWorker();
    `,
};
/** A worker that starts and never answers: a layout that does not end. */
const SILENT_WORKER: WorkerSpec = { eval: true, script: 'setInterval(() => undefined, 1000);' };
/** A worker that spins without yielding, as a synchronous layout does. */
const SPINNING_WORKER: WorkerSpec = { eval: true, script: 'for (;;) { /* never returns */ }' };
/** A worker whose engine failed: it answers with an error. */
const FAILING_WORKER: WorkerSpec = {
    eval: true,
    script: `
        const { workerData } = require('worker_threads');
        workerData.port.postMessage({ error: 'C4X lint failed internally: boom' });
        Atomics.store(workerData.flag, 0, 1);
        Atomics.notify(workerData.flag, 0);
    `,
};

function timed<T>(run: () => T): { value: T; ms: number } {
    const started = Date.now();
    const value = run();
    return { value, ms: Date.now() - started };
}

describe('render deadline (#353)', function () {
    this.timeout(60000);

    it('the deadline is the stated budget', () => {
        assert.strictEqual(RENDER_TIME_BUDGET_MS, 2000);
        assert.match(tooLongMessage(RENDER_TIME_BUDGET_MS), /^Render took too long: stopped after 2000 ms/);
    });

    it('draws in a worker what checkC4xSource draws in the process', () => {
        const { value, ms } = timed(() => renderWithDeadline(VALID, { lint, theme: 'c4-model' }, 30000, SOURCE_WORKER));
        assert.strictEqual(value.status, 'rendered', value.message);
        assert.strictEqual(value.svg, checkC4xSource(VALID, { lint, theme: 'c4-model' }).svg);
        assert.ok(ms < 30000);
    });

    for (const [label, worker] of [['never answers', SILENT_WORKER], ['spins without yielding', SPINNING_WORKER]] as const) {
        it(`a worker that ${label} is stopped at the deadline: findings and a too-long result, no SVG`, () => {
            const deadline = 400;
            const { value, ms } = timed(() => renderWithDeadline(UNCONNECTED, { lint }, deadline, worker));
            assert.strictEqual(value.status, 'timed-out');
            assert.strictEqual(value.svg, undefined);
            assert.ok(ms >= deadline - 20 && ms < deadline + 300, `returned after ${ms} ms for a ${deadline} ms deadline`);
            const render = value.findings.find(finding => finding.ruleId === RENDER_RULE_ID);
            assert.match(render?.message ?? '', /Render took too long: stopped after 400 ms/);
            assert.ok(value.findings.some(finding => finding.ruleId === 'C4X-L102'), 'the lint findings found before the worker are kept');
        });
    }

    it('checks before the worker: a refused source never starts one and returns at once', () => {
        const nowhere: WorkerSpec = { script: path.join(ROOT, 'no-such-worker.js') };
        for (const [source, status] of [['graph TB\nNot[valid\n', 'invalid'], ['', 'empty'], [`graph TB\n${Array.from({ length: 101 }, (_, i) => `System(s${i}, "S", "d")`).join('\n')}`, 'too-large']] as const) {
            const { value, ms } = timed(() => renderWithDeadline(source, { lint }, 5000, nowhere));
            assert.strictEqual(value.status, status);
            assert.ok(ms < 1000, `${status}: ${ms} ms, so a worker was waited for`);
        }
        assert.strictEqual(renderWithDeadline(VALID, { lint, theme: 'auto' }, 5000, nowhere).status, 'bad-options');
    });

    it('an engine failure in the worker is thrown, as checkC4xSource throws it', () => {
        assert.throws(() => renderWithDeadline(VALID, { lint }, 5000, FAILING_WORKER), /C4X lint failed internally: boom/);
    });

    it('a worker that cannot start ends at the deadline, never hangs', () => {
        const { value, ms } = timed(() => renderWithDeadline(VALID, { lint }, 300, { script: path.join(ROOT, 'no-such-worker.js') }));
        assert.strictEqual(value.status, 'timed-out');
        assert.ok(ms < 1000, `${ms} ms`);
    });

    it('a deadline already spent by the checks returns too-long without a worker', () => {
        assert.strictEqual(renderWithDeadline(VALID, { lint }, 0, SILENT_WORKER).status, 'timed-out');
    });

    it('outside a render worker the worker entry does nothing', () => {
        assert.strictEqual(runRenderWorkerIfWorker(), false);
    });

    describe('without blocking the caller (the MCP server)', () => {
        it('draws in a worker what checkC4xSource draws', async () => {
            const outcome = await renderWithDeadlineAsync(VALID, { lint, theme: 'c4-model' }, 30000, SOURCE_WORKER);
            assert.strictEqual(outcome.status, 'rendered', outcome.message);
            assert.strictEqual(outcome.svg, checkC4xSource(VALID, { lint, theme: 'c4-model' }).svg);
            assert.strictEqual(liveRenderWorkers(), 0);
        });

        it('keeps the event loop free while a render runs: a 50 ms timer fires on time', async () => {
            const started = Date.now();
            let firedAfter = -1;
            setTimeout(() => { firedAfter = Date.now() - started; }, 50);
            const outcome = await renderWithDeadlineAsync(UNCONNECTED, { lint }, 600, SPINNING_WORKER);
            assert.strictEqual(outcome.status, 'timed-out');
            assert.ok(firedAfter >= 0 && firedAfter < 250, `the timer fired after ${firedAfter} ms`);
        });

        it('repeated timeouts terminate every worker: none is left running', async () => {
            for (const worker of [SPINNING_WORKER, SILENT_WORKER, SPINNING_WORKER]) {
                const { value: pending, ms } = timed(() => renderWithDeadlineAsync(UNCONNECTED, { lint }, 300, worker));
                assert.ok(ms < 200, 'the call returned a promise at once');
                const started = Date.now();
                const outcome = await pending;
                const waited = Date.now() - started;
                assert.strictEqual(outcome.status, 'timed-out');
                assert.strictEqual(outcome.svg, undefined);
                assert.match(outcome.findings.find(finding => finding.ruleId === RENDER_RULE_ID)?.message ?? '', /Render took too long: stopped after 300 ms/);
                assert.ok(outcome.findings.some(finding => finding.ruleId === 'C4X-L102'), 'lint findings kept');
                assert.ok(waited < 300 + 500, `settled after ${waited} ms`);
                assert.strictEqual(liveRenderWorkers(), 0, 'a worker outlived its timeout');
            }
        });

        it('a cancellation stops the render at once and terminates the worker', async () => {
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 100);
            const started = Date.now();
            const outcome = await renderWithDeadlineAsync(UNCONNECTED, { lint }, 10000, SPINNING_WORKER, controller.signal);
            const ms = Date.now() - started;
            assert.strictEqual(outcome.status, 'timed-out');
            assert.strictEqual(outcome.message, CANCELLED_MESSAGE);
            assert.ok(ms < 1000, `cancelled after ${ms} ms`);
            assert.strictEqual(liveRenderWorkers(), 0);
            const already = new AbortController();
            already.abort();
            assert.strictEqual((await renderWithDeadlineAsync(UNCONNECTED, { lint }, 10000, SPINNING_WORKER, already.signal)).message, CANCELLED_MESSAGE);
        });

        it('a worker that cannot start, or exits without answering, is a render failure at once; an engine failure is thrown', async () => {
            for (const worker of [{ script: path.join(ROOT, 'no-such-worker.js') }, { eval: true, script: 'process.exit(0);' }] as WorkerSpec[]) {
                const started = Date.now();
                const outcome = await renderWithDeadlineAsync(UNCONNECTED, { lint }, 5000, worker);
                assert.strictEqual(outcome.status, 'invalid');
                assert.match(outcome.message ?? '', /Render failed: the render worker stopped before it answered/);
                assert.ok(Date.now() - started < 2000);
            }
            await assert.rejects(renderWithDeadlineAsync(VALID, { lint }, 5000, FAILING_WORKER), /C4X lint failed internally: boom/);
            assert.strictEqual(liveRenderWorkers(), 0);
        });

        it('checks before the worker, and a deadline spent by the checks starts none', async () => {
            const nowhere: WorkerSpec = { script: path.join(ROOT, 'no-such-worker.js') };
            assert.strictEqual((await renderWithDeadlineAsync('graph TB\nNot[valid\n', { lint }, 5000, nowhere)).status, 'invalid');
            assert.strictEqual((await renderWithDeadlineAsync(VALID, { lint }, 0, SILENT_WORKER)).status, 'timed-out');
            assert.strictEqual(liveRenderWorkers(), 0);
        });
    });
});
