/**
 * Bounded work for every parser C4X runs (#362; threat-model row RES-5).
 *
 * Each parser's adversarial corpus (./adversarialCorpus, about 1 MiB per
 * source) runs in a child process under a hard watchdog: a regression to
 * super-linear work fails here instead of hanging the suite. Each source must
 * finish within the per-source budget, measured inside the child.
 */
import * as assert from 'assert';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parsePlantUMLtoC4Model } from '../../parser/plantuml';
import type { Format } from './adversarialCorpus';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BUDGET_MS = 2000;
const WATCHDOG_MS = 120000;

const CHILD = `
const { corpus } = require(${JSON.stringify(path.join(__dirname, 'adversarialCorpus'))});
const { lintC4xSource, lintFileText } = require(${JSON.stringify(path.join(ROOT, 'src', 'cli', 'lintSource'))});
const { normalizeLintOptions } = require(${JSON.stringify(path.join(ROOT, 'src', 'model', 'lint'))});
const { parsePlantUMLtoC4Model } = require(${JSON.stringify(path.join(ROOT, 'src', 'parser', 'plantuml'))});
const { parseStructurizrDSL } = require(${JSON.stringify(path.join(ROOT, 'src', 'parser', 'structurizr'))});
console.warn = () => undefined;
const run = {
    c4x: source => lintC4xSource(source, normalizeLintOptions(true, {})),
    plantuml: source => parsePlantUMLtoC4Model(source),
    structurizr: source => parseStructurizrDSL(source),
    markdown: source => lintFileText(source, 'markdown', normalizeLintOptions(true, {})),
};
const format = process.argv[2];
for (const [name, source] of corpus(format)) {
    const started = process.hrtime.bigint();
    let outcome = 'ok';
    try { run[format](source); } catch (error) { outcome = error && error.name ? error.name : 'error'; }
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    process.stdout.write(JSON.stringify({ name, bytes: source.length, ms, outcome }) + '\\n');
}
`;

describe('Security: bounded parser work on adversarial input (#362)', function () {
    this.timeout(WATCHDOG_MS + 10000);
    let scratch: string;
    before(() => {
        scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-timing-'));
        fs.writeFileSync(path.join(scratch, 'child.js'), CHILD);
    });
    after(() => fs.rmSync(scratch, { recursive: true, force: true }));

    for (const format of ['c4x', 'plantuml', 'structurizr', 'markdown'] as Format[]) {
        it(`${format}: every source finishes within ${BUDGET_MS} ms, under a ${WATCHDOG_MS / 1000} s watchdog`, () => {
            const result = spawnSync(process.execPath, ['-r', path.join(ROOT, 'scripts', 'register-unit-ts.js'), path.join(scratch, 'child.js'), format], {
                cwd: ROOT, encoding: 'utf8', timeout: WATCHDOG_MS, maxBuffer: 16 * 1024 * 1024,
                // Coverage off in the child: precise coverage slows the parsers several-fold and the budget is about them.
                env: { ...process.env, NODE_V8_COVERAGE: '' },
            });
            assert.ifError(result.error);
            assert.strictEqual(result.status, 0, result.stderr.slice(0, 2000));
            const rows = result.stdout.trim().split('\n').map(line => JSON.parse(line) as { name: string; bytes: number; ms: number; outcome: string });
            assert.ok(rows.length >= 7, `only ${rows.length} sources ran`);
            for (const row of rows) {
                assert.ok(row.bytes <= 1024 * 1024 && row.bytes > 900 * 1024, `${row.name}: ${row.bytes} bytes`);
                assert.ok(row.ms < BUDGET_MS, `${format} "${row.name}" took ${row.ms.toFixed(0)} ms (outcome ${row.outcome})`);
                assert.notStrictEqual(row.outcome, 'RangeError', `${row.name}: stack overflow`);
            }
        });
    }

    describe('PlantUML continuation keeps origin/main\'s rule, in linear time', () => {
        it('a real multi-line macro still joins', () => {
            const joined = parsePlantUMLtoC4Model('@startuml\nSystem(a,\n  "A (x)",\n  "d")\n@enduml');
            assert.strictEqual(joined.views[0].elements[0].label, 'A (x)');
        });

        for (const span of [199, 200, 201, 1000]) {
            it(`an element spanning ${span} lines is parsed whole, and the elements after it are intact`, () => {
                const source = `@startuml\nSystem(a, "A", "\n${'detail\n'.repeat(span - 2)}")\nSystem(b, "B", "d")\nRel(a, b, "uses")\nSystem(c, "C", "d")\n@enduml`;
                const view = parsePlantUMLtoC4Model(source).views[0];
                assert.deepStrictEqual(view.elements.map(e => e.id), ['a', 'b', 'c']);
                assert.strictEqual((view.elements[0].description ?? '').split('detail').length - 1, span - 2, 'every continuation line kept');
                assert.strictEqual(view.relationships.length, 1);
            });
        }
        // Every other PlantUML behaviour is pinned to origin/main by plantuml-differential.test.ts.
    });
});
