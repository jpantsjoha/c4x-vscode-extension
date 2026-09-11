/**
 * Layout spacing preset tests (#111, audit P1-4): the `c4x.layout.spacing`
 * setting selects compact/balanced/spacious dagre separations, and groups
 * with <= 3 children are tightened by 25% so small diagrams use less canvas.
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
import * as vscodeMock from '../__mocks__/vscode';
import { DagreLayoutEngine, resolveLayoutSpacing } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element, C4Rel } from '../../model/C4Model';

// =========================================================================
// Helpers
// =========================================================================

function makeElement(id: string): C4Element {
    return { id, label: id, type: 'SoftwareSystem' };
}

/**
 * A view of `count` top-level software systems. With `chain`, E0 -> E1 -> …
 * edges put each element in its own rank; without it all elements share a
 * single rank. Direction is pinned to TB so auto-detection cannot interfere.
 */
function makeView(count: number, chain: boolean): C4View {
    const elements: C4Element[] = [];
    for (let i = 0; i < count; i++) {
        elements.push(makeElement(`E${i}`));
    }
    const relationships: C4Rel[] = [];
    if (chain) {
        for (let i = 0; i < count - 1; i++) {
            relationships.push({ id: `r${i}`, from: `E${i}`, to: `E${i + 1}`, label: '', relType: 'uses' });
        }
    }
    return { type: 'system-context', direction: 'TB', elements, relationships };
}

function patchSpacingSetting(value: string | undefined): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vscodeMock.workspace.getConfiguration = (_section?: string): any => ({
        get: (_key: string) => value,
    });
}

const originalGetConfiguration = vscodeMock.workspace.getConfiguration;

/** Horizontal gaps between consecutive same-rank elements (sorted by x). */
function sameRankGaps(view: C4View): number[] {
    const result = new DagreLayoutEngine().layoutSync(view);
    const sorted = [...result.elements].sort((a, b) => a.x - b.x);
    return sorted.slice(1).map((el, i) => Math.round(el.x - (sorted[i].x + sorted[i].width)));
}

/** Vertical gaps between consecutive ranks of the E0 -> E1 -> … chain. */
function rankGaps(view: C4View): number[] {
    const result = new DagreLayoutEngine().layoutSync(view);
    const byId = new Map(result.elements.map(el => [el.id, el]));
    const gaps: number[] = [];
    for (let i = 0; i < view.elements.length - 1; i++) {
        const upper = byId.get(`E${i}`);
        const lower = byId.get(`E${i + 1}`);
        assert.ok(upper && lower, 'chain elements must be laid out');
        gaps.push(Math.round(lower.y - (upper.y + upper.height)));
    }
    return gaps;
}

describe('DagreLayoutEngine — spacing presets (#111)', () => {
    afterEach(() => {
        vscodeMock.workspace.getConfiguration = originalGetConfiguration;
    });

    // =========================================================================
    // resolveLayoutSpacing — preset resolution from the setting
    // =========================================================================

    describe('resolveLayoutSpacing', () => {
        it('defaults to balanced 60/80 when the setting is absent', () => {
            patchSpacingSetting(undefined);
            assert.deepStrictEqual(resolveLayoutSpacing(), { nodesep: 60, ranksep: 80 });
        });

        it('resolves compact to 40/60', () => {
            patchSpacingSetting('compact');
            assert.deepStrictEqual(resolveLayoutSpacing(), { nodesep: 40, ranksep: 60 });
        });

        it('resolves balanced to the historical 60/80', () => {
            patchSpacingSetting('balanced');
            assert.deepStrictEqual(resolveLayoutSpacing(), { nodesep: 60, ranksep: 80 });
        });

        it('resolves spacious to 90/120', () => {
            patchSpacingSetting('spacious');
            assert.deepStrictEqual(resolveLayoutSpacing(), { nodesep: 90, ranksep: 120 });
        });

        it('falls back to balanced for an unrecognised value', () => {
            patchSpacingSetting('ultrawide');
            assert.deepStrictEqual(resolveLayoutSpacing(), { nodesep: 60, ranksep: 80 });
        });
    });

    // =========================================================================
    // Preset separations in layoutSync — groups with > 3 children (untightened)
    // =========================================================================

    describe('preset separations (groups with more than 3 children)', () => {
        it('applies nodesep 60 / ranksep 80 when the setting is absent (default)', () => {
            assert.deepStrictEqual(sameRankGaps(makeView(5, false)), [60, 60, 60, 60]);
            assert.deepStrictEqual(rankGaps(makeView(5, true)), [80, 80, 80, 80]);
        });

        it('tightens to nodesep 40 / ranksep 60 under compact', () => {
            patchSpacingSetting('compact');
            assert.deepStrictEqual(sameRankGaps(makeView(5, false)), [40, 40, 40, 40]);
            assert.deepStrictEqual(rankGaps(makeView(5, true)), [60, 60, 60, 60]);
        });

        it('widens to nodesep 90 / ranksep 120 under spacious', () => {
            patchSpacingSetting('spacious');
            assert.deepStrictEqual(sameRankGaps(makeView(5, false)), [90, 90, 90, 90]);
            assert.deepStrictEqual(rankGaps(makeView(5, true)), [120, 120, 120, 120]);
        });

        it('produces identical geometry whether balanced is explicit or absent', () => {
            const engine = new DagreLayoutEngine();
            patchSpacingSetting(undefined);
            const byDefault = engine.layoutSync(makeView(5, true));
            patchSpacingSetting('balanced');
            const explicit = engine.layoutSync(makeView(5, true));
            assert.deepStrictEqual(explicit, byDefault);
        });
    });

    // =========================================================================
    // Adaptive tightening — groups with <= 3 children use 75% separations
    // =========================================================================

    describe('adaptive tightening for small groups (<= 3 children)', () => {
        it('scales balanced separations by 0.75 (45/60) for a 3-element group', () => {
            assert.deepStrictEqual(sameRankGaps(makeView(3, false)), [45, 45]);
            assert.deepStrictEqual(rankGaps(makeView(3, true)), [60, 60]);
        });

        it('does not tighten groups with 4 children', () => {
            assert.deepStrictEqual(rankGaps(makeView(4, true)), [80, 80, 80]);
        });

        it('tightens compact separations to 30/45 for small groups', () => {
            patchSpacingSetting('compact');
            assert.deepStrictEqual(sameRankGaps(makeView(3, false)), [30, 30]);
            assert.deepStrictEqual(rankGaps(makeView(3, true)), [45, 45]);
        });

        it('applies per group: a small boundary inside a large root is tightened, the root is not', () => {
            const view: C4View = {
                type: 'system-context',
                direction: 'TB',
                elements: [makeElement('E0'), makeElement('E1'), makeElement('E2'), makeElement('E3'),
                    makeElement('B0'), makeElement('B1')],
                relationships: [],
                boundaries: [{ id: 'b', label: 'Boundary', elements: ['B0', 'B1'] }],
            };
            const result = new DagreLayoutEngine().layoutSync(view);
            const byId = new Map(result.elements.map(el => [el.id, el]));

            // Boundary children (2 <= 3): tightened to 60 * 0.75 = 45.
            const b0 = byId.get('B0');
            const b1 = byId.get('B1');
            assert.ok(b0 && b1, 'boundary children must be laid out');
            const [innerFirst, innerSecond] = [b0, b1].sort((a, b) => a.x - b.x);
            assert.strictEqual(Math.round(innerSecond.x - (innerFirst.x + innerFirst.width)), 45);

            // Root (5 children: boundary + 4 leaves): full balanced nodesep 60.
            const rootBoxes = [...result.elements.filter(el => el.id.startsWith('E')), ...result.boundaries ?? []]
                .sort((a, b) => a.x - b.x);
            const rootGaps = rootBoxes.slice(1).map((box, i) =>
                Math.round(box.x - (rootBoxes[i].x + rootBoxes[i].width)));
            assert.deepStrictEqual(rootGaps, [60, 60, 60, 60]);
        });
    });
});
