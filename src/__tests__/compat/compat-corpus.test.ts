import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';

/**
 * Compatibility corpus (#365). Every diagram the project publishes (samples, `c4x` and
 * `plantuml` fences the Markdown preview renders, Structurizr and PlantUML files, snippets,
 * fixtures) is stored in baseline-<release>.json with the parse outcome, a model summary and
 * normalised SVG hashes for every 1.8.0 theme, as recorded by that release. Each item's
 * ORIGINAL source is re-parsed and re-rendered with the current code and compared. A
 * difference passes only if allowed-changes.json names the item and facet, cites its
 * explanation and pins the exact approved new value.
 * Regenerate a baseline with scripts/generate-compat-baseline.js (docs/validation/TEST-STRATEGY.md).
 */

import { analyse, discoverCorpus, loadPipeline, normalizeSvg, sha, expandSnippet } from './corpus';
import type { AnalysisRecord, CorpusFormat } from './corpus';
import { acceptedBy, differences, staleEntries, unexplained } from './compare';
import type { AllowedEntry, Difference } from './compare';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const BASELINE_FILE = path.join(__dirname, 'baseline-1.8.0.json');
const ALLOWED_FILE = path.join(__dirname, 'allowed-changes.json');

interface BaselineItem extends AnalysisRecord { id: string; kind: string; format: CorpusFormat; path: string; fence?: number; sourceHash: string; source: string }
interface Baseline { schema: number; label: string; commit: string; themes: string[]; omittedPrivate: number; items: BaselineItem[] }

const baseline: Baseline = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
const allowed: { schema: number; entries: AllowedEntry[] } = JSON.parse(readFileSync(ALLOWED_FILE, 'utf8'));

describe('Compatibility corpus (#365)', function () {
    this.timeout(60000);

    const pipeline = loadPipeline(ROOT);
    const current = new Map<string, string>(discoverCorpus(ROOT).map(i => [i.id, sha(i.source, 16)]));
    const all: Difference[] = [];

    before(() => {
        for (const item of baseline.items) {
            all.push(...differences(item, analyse(pipeline, item.source, item.format), baseline.themes));
        }
    });

    it('baseline is well formed and stored sources match their hashes', () => {
        assert.strictEqual(baseline.schema, 2);
        assert.ok(baseline.items.length >= 150, `corpus shrank to ${baseline.items.length} items`);
        assert.deepStrictEqual(baseline.themes, ['classic', 'modern', 'muted', 'high-contrast', 'c4-standard', 'auto-light', 'auto-dark']);
        for (const format of ['c4x', 'plantuml', 'structurizr'] as const) {
            assert.ok(baseline.items.some(i => i.format === format), `no ${format} items in the baseline`);
        }
        for (const item of baseline.items) {
            assert.strictEqual(sha(item.source, 16), item.sourceHash, `stored source of ${item.id} does not match its hash`);
        }
        assert.strictEqual(new Set(baseline.items.map(i => i.id)).size, baseline.items.length, 'duplicate item ids');
    });

    it('every allowlist entry is explained and pins its approved value', () => {
        for (const entry of allowed.entries) {
            assert.ok(/#\d+/.test(entry.reference), `allowlist entry for ${entry.item} has no issue or PR reference`);
            assert.ok(entry.kind.length > 0, `allowlist entry for ${entry.item} names no kind`);
            assert.ok(entry.after && Object.keys(entry.after).length > 0, `allowlist entry for ${entry.item} pins no approved value`);
        }
    });

    for (const item of baseline.items) {
        it(`${item.id} parses and renders as in ${baseline.label}`, () => {
            const bad = unexplained(all.filter(d => d.item === item.id), allowed.entries);
            assert.strictEqual(
                bad.length, 0,
                `${item.id} differs from the ${baseline.label} baseline (the source text is the stored ${baseline.label} text; `
                + `${current.get(item.id) === item.sourceHash ? 'the file or fence is unchanged' : 'the file or fence has since changed'}):\n`
                + bad.map(d => `  [${d.facet}] ${d.detail}`).join('\n')
                + '\nIf intentional, add an entry to src/__tests__/compat/allowed-changes.json naming the change record '
                + 'and pinning the new value; an entry that exists but pins a different value does not accept this one.');
        });
    }

    it('every allowlist entry still accepts a difference (no stale entries)', () => {
        assert.deepStrictEqual(staleEntries(all, allowed.entries).map(e => `${e.item} ${e.facet}`), []);
    });

    it('reports corpus drift since the baseline (informational)', () => {
        const baselineIds = new Set(baseline.items.map(i => i.id));
        const changed = baseline.items.filter(i => current.has(i.id) && current.get(i.id) !== i.sourceHash).length;
        const removed = baseline.items.filter(i => !current.has(i.id)).length;
        const added = [...current.keys()].filter(id => !baselineIds.has(id)).length;
        const byFormat: Record<string, number> = {};
        for (const i of baseline.items) { byFormat[i.format] = (byFormat[i.format] ?? 0) + 1; }
        console.log(`      corpus: ${baseline.items.length} baseline items ${JSON.stringify(byFormat)}, ${changed} source changed since ${baseline.label}, `
            + `${removed} removed, ${added} added; ${all.length} differences, ${all.length - unexplained(all, allowed.entries).length} allowed`);
    });
});

describe('Compatibility corpus machinery (#365)', () => {
    const themes = ['classic'];
    const item = { id: 'x', parse: 'ok', views: [{ summary: 'S', svg: { classic: 'aaaa' } }] };
    const accepted: AllowedEntry = {
        item: 'x', facet: 'svg', kind: 'k', reference: '#1',
        after: { svg: { classic: ['bbbb'] } },
    };

    it('accepts an allowlisted difference only when it equals the pinned value', () => {
        const same = differences(item, { parse: 'ok', views: [{ summary: 'S', svg: { classic: 'bbbb' } }] }, themes);
        assert.strictEqual(unexplained(same, [accepted]).length, 0);
    });

    it('rejects an allowlisted item whose render later becomes an error (reviewer negative control)', () => {
        const crashed = differences(item, { parse: 'ok', views: [{ summary: 'corrupted', svg: { classic: 'error: renderer crashed' } }] }, themes);
        const entries: AllowedEntry[] = [accepted, { ...accepted, facet: 'model', after: { summaries: ['S2'] } }];
        assert.strictEqual(unexplained(crashed, entries).length, 2);
        assert.ok(crashed.every(d => !acceptedBy(d, entries)));
    });

    it('rejects an arbitrary parse outcome for an allowlisted parse change', () => {
        const entry: AllowedEntry = { item: 'x', facet: 'parse', kind: 'k', reference: '#1', after: { parse: 'error: expected', summaries: [], svg: { classic: [] } } };
        const arbitrary = differences(item, { parse: 'error: something else entirely', views: [] }, themes);
        assert.strictEqual(unexplained(arbitrary, [entry]).length, 1);
        const exact = differences(item, { parse: 'error: expected', views: [] }, themes);
        assert.strictEqual(unexplained(exact, [entry]).length, 0);
    });

    it('flags an entry whose pinned value no longer matches as stale', () => {
        const moved = differences(item, { parse: 'ok', views: [{ summary: 'S', svg: { classic: 'cccc' } }] }, themes);
        assert.deepStrictEqual(staleEntries(moved, [accepted]).length, 1);
    });

    it('normalises float noise in geometry but compares text and colours exactly', () => {
        const a = '<rect x="12.300000001" width="10.126" fill="#112233"/><text>v1.234</text>';
        assert.strictEqual(normalizeSvg(a), '<rect x="12.30" width="10.12" fill="#112233"/><text>v1.234</text>');
        assert.notStrictEqual(normalizeSvg('<text>v1.234</text>'), normalizeSvg('<text>v1.239</text>'));
        assert.notStrictEqual(normalizeSvg('<rect fill="#112233"/>'), normalizeSvg('<rect fill="#112234"/>'));
        assert.notStrictEqual(normalizeSvg('<text>[10.128.0.0/20]</text>'), normalizeSvg('<text>[10.128.9.9/20]</text>'));
    });

    it('expands snippet placeholders to their defaults', () => {
        assert.strictEqual(expandSnippet(['A[${1:User}]', '    ${0}x ${2|a,b|}']), 'A[User]\n    x a');
    });
});
