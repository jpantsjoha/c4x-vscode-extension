import * as assert from 'assert';
import type { AnalysisRecord } from './corpus';

export type Facet = 'parse' | 'model' | 'svg';

/** What an item looks like after an accepted change; pinned exactly in the allowlist. */
export interface After {
    parse?: string;
    summaries?: string[];
    svg?: Record<string, string[]>;
}

export interface AllowedEntry { item: string; facet: Facet; kind: string; reference: string; after: After }
export interface Difference { item: string; facet: Facet; detail: string; after: After }

interface Comparable extends AnalysisRecord { id: string }

function summaries(record: AnalysisRecord): string[] {
    return record.views.map(v => v.summary);
}

function svgByTheme(record: AnalysisRecord, themes: string[]): Record<string, string[]> {
    const out: Record<string, string[]> = {};
    for (const theme of themes) { out[theme] = record.views.map(v => v.svg[theme]); }
    return out;
}

function same(a: unknown, b: unknown): boolean {
    try { assert.deepStrictEqual(a, b); return true; } catch { return false; }
}

/** Facet-level differences between a baseline record and the current analysis of the same source. */
export function differences(item: Comparable, now: AnalysisRecord, themes: string[]): Difference[] {
    if (now.parse !== item.parse) {
        return [{
            item: item.id, facet: 'parse', detail: `parse: ${item.parse} -> ${now.parse}`,
            after: { parse: now.parse, summaries: summaries(now), svg: svgByTheme(now, themes) },
        }];
    }
    const found: Difference[] = [];
    if (!same(summaries(now), summaries(item))) {
        found.push({
            item: item.id, facet: 'model',
            detail: `model:\n    was ${JSON.stringify(summaries(item))}\n    now ${JSON.stringify(summaries(now))}`,
            after: { summaries: summaries(now) },
        });
    }
    const was = svgByTheme(item, themes);
    const is = svgByTheme(now, themes);
    if (!same(is, was)) {
        const changed = themes.filter(t => !same(is[t], was[t])).map(t => `${t}: ${was[t]} -> ${is[t]}`);
        found.push({ item: item.id, facet: 'svg', detail: `svg: ${changed.join('; ')}`, after: { svg: is } });
    }
    return found;
}

/** An entry accepts a difference only if it names the item and facet AND pins the exact new value. */
export function acceptedBy(diff: Difference, entries: AllowedEntry[]): AllowedEntry | undefined {
    return entries.find(e => e.item === diff.item && e.facet === diff.facet && same(e.after, diff.after));
}

export function unexplained(all: Difference[], entries: AllowedEntry[]): Difference[] {
    return all.filter(d => !acceptedBy(d, entries));
}

/** Entries that accept nothing: the difference they explained is gone, or its value moved. */
export function staleEntries(all: Difference[], entries: AllowedEntry[]): AllowedEntry[] {
    return entries.filter(e => !all.some(d => acceptedBy(d, [e])));
}
