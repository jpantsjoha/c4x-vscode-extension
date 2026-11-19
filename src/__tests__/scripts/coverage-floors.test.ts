/**
 * The coverage-floor gate fails when it should (#480, R181-10).
 *
 * Runs scripts/check-coverage-floors.js against planted json-summary files
 * and the real scripts/coverage-floors.json: a summary that meets every floor
 * passes, and a directory under its floor, a measured directory with no floor
 * and a floor with no measured directory each exit 1 with the matching message.
 */
import * as assert from 'assert';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const root = path.resolve(__dirname, '..', '..', '..');
const script = path.join(root, 'scripts', 'check-coverage-floors.js');
const config = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'coverage-floors.json'), 'utf8')) as {
    floors: Record<string, Record<string, number>>;
    exempt: Array<{ path: string }>;
};
const METRICS = ['lines', 'statements', 'functions', 'branches'];

type Cell = { total: number; covered: number; skipped: number; pct: number };
type Summary = Record<string, Record<string, Cell>>;

function cell(percent: number): Cell {
    return { total: 1000, covered: Math.round(percent * 10), skipped: 0, pct: percent };
}

/** One file per floor directory sitting exactly on its floors, plus every exempt path. */
function passingSummary(): Summary {
    const summary: Summary = {};
    for (const [directory, floor] of Object.entries(config.floors)) {
        summary[path.join(root, 'src', directory, 'planted.ts')] = Object.fromEntries(
            METRICS.map(metric => [metric, cell(floor[metric] ?? 100)]));
    }
    for (const entry of config.exempt) {
        summary[path.join(root, entry.path)] = Object.fromEntries(METRICS.map(metric => [metric, cell(0)]));
    }
    return summary;
}

describe('Coverage floor gate (#480, R181-10)', () => {
    let dir: string;
    before(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'c4x-floors-')); });
    after(() => { fs.rmSync(dir, { recursive: true, force: true }); });

    function run(summary: Summary): { status: number | null; stderr: string } {
        const file = path.join(dir, 'coverage-summary.json');
        fs.writeFileSync(file, JSON.stringify(summary));
        const result = spawnSync(process.execPath, [script, '--summary', file], { encoding: 'utf8' });
        return { status: result.status, stderr: result.stderr };
    }

    it('passes a summary that sits on every floor (the planted drops below start from this)', () => {
        const result = run(passingSummary());
        assert.strictEqual(result.status, 0, result.stderr);
    });

    it('exits 1 for a directory one point under its floor', () => {
        const [directory, floor] = Object.entries(config.floors).find(([, f]) => (f.lines ?? 0) > 1) as [string, Record<string, number>];
        const summary = passingSummary();
        const file = path.join(root, 'src', directory, 'planted.ts');
        summary[file].lines = cell(floor.lines - 1);
        const result = run(summary);
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, new RegExp(`${directory}: lines [\\d.]+% is below the floor of ${floor.lines}%`));
    });

    it('exits 1 for a measured directory that has no floor', () => {
        const summary = passingSummary();
        summary[path.join(root, 'src', 'unfloored-planted-directory', 'planted.ts')] =
            Object.fromEntries(METRICS.map(metric => [metric, cell(100)]));
        const result = run(summary);
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, /unfloored-planted-directory: measured but has no floor/);
    });

    it('exits 1 for a floor whose directory is not in the summary', () => {
        const [directory] = Object.keys(config.floors);
        const summary = passingSummary();
        delete summary[path.join(root, 'src', directory, 'planted.ts')];
        const result = run(summary);
        assert.strictEqual(result.status, 1);
        assert.match(result.stderr, new RegExp(`${directory}: has a floor but is not in the summary`));
    });
});
