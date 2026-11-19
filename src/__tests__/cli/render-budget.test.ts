/**
 * Engine speed at the render caps (#353). The 2,000 ms budget is a hard
 * deadline enforced by the render worker (render-deadline.test.ts,
 * render-deadline-bundles.test.ts); this file is a tripwire for the engine
 * itself, without the worker: the shapes that make layout work hardest draw
 * well inside the deadline at the caps, so ordinary diagrams are not stopped,
 * and each Internet
 * Banking System fixture within the 250 ms of #352. The unit tier runs under
 * coverage instrumentation, on whatever Node the Git hook finds and beside
 * other work, so it takes the faster of two runs and allows twice the budget:
 * a tripwire for a bound raised or a layout made several times slower. The
 * bench (`make test-perf`) holds the stated budget itself, at medians of
 * three runs.
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
import * as path from 'path';
import { normalizeLintOptions } from '../../model/lint';
import { MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS, RENDER_TIME_BUDGET_MS, checkC4xSource, type RenderOutcome } from '../../cli/renderSource';
import { RENDER_SHAPES, adversarialSource } from './renderCorpus';

const lint = normalizeLintOptions(true, undefined);
const IBS_BUDGET_MS = 250;
/** Head room for instrumentation and a shared machine; `make test-perf` checks the budget itself. */
const UNIT_TIER_ALLOWANCE = 2;

function timed(source: string, theme?: string): { outcome: RenderOutcome; ms: number } {
    let best = Infinity;
    let outcome!: RenderOutcome;
    for (let run = 0; run < 2; run++) {
        const started = performance.now();
        outcome = checkC4xSource(source, { lint, theme });
        best = Math.min(best, performance.now() - started);
    }
    return { outcome, ms: best };
}

describe('render time budget (#353)', function () {
    this.timeout(120000);

    for (const shape of RENDER_SHAPES) {
        it(`${shape}: ${MAX_RENDER_ELEMENTS} elements and ${MAX_RENDER_RELATIONSHIPS} relationships draw within the ${RENDER_TIME_BUDGET_MS} ms budget (unit tier: x${UNIT_TIER_ALLOWANCE})`, () => {
            const { outcome, ms } = timed(adversarialSource(shape, MAX_RENDER_ELEMENTS, MAX_RENDER_RELATIONSHIPS));
            // At the bounds the SVG can pass 2 MiB (long text): refused after layout, still timed.
            assert.ok(outcome.status === 'rendered' || (outcome.status === 'too-large' && outcome.svgBytes !== undefined), `${shape}: ${outcome.status} ${outcome.message ?? ''}`);
            assert.ok(ms < RENDER_TIME_BUDGET_MS * UNIT_TIER_ALLOWANCE, `${shape}: ${ms.toFixed(0)} ms`);
        });
    }

    it('the review\'s costly diagram (a chain of 150 with 151 shortcuts, 3.6-4.0 s to lay out) is refused before layout', () => {
        const started = performance.now();
        const outcome = checkC4xSource(adversarialSource('chain-shortcuts', 150, 300), { lint });
        const ms = performance.now() - started;
        assert.strictEqual(outcome.status, 'too-large');
        assert.strictEqual(outcome.svg, undefined);
        assert.ok(ms < 500, `refusing took ${ms.toFixed(0)} ms`);
    });

    it(`each Internet Banking System fixture renders within ${IBS_BUDGET_MS} ms in two themes`, () => {
        const dir = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs');
        for (const file of fs.readdirSync(dir).filter(name => name.endsWith('.c4x'))) {
            for (const theme of ['classic', 'c4-model']) {
                const { outcome, ms } = timed(fs.readFileSync(path.join(dir, file), 'utf8'), theme);
                assert.strictEqual(outcome.status, 'rendered', file);
                assert.ok(ms < IBS_BUDGET_MS, `${file} (${theme}): ${ms.toFixed(1)} ms`);
            }
        }
    });
});
