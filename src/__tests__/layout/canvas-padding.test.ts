/**
 * Adaptive canvas padding tests (#111): the final bounding-box calculation
 * adds 30px for diagrams with fewer than 5 elements and 50px otherwise.
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
import { DagreLayoutEngine, resolveCanvasPadding } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element, C4Rel } from '../../model/C4Model';

function makeElement(id: string): C4Element {
    return { id, label: id, type: 'SoftwareSystem' };
}

/** A view of `count` top-level systems chained E0 -> E1 -> ... (TB). */
function makeView(count: number): C4View {
    const elements: C4Element[] = [];
    for (let i = 0; i < count; i++) {
        elements.push(makeElement(`E${i}`));
    }
    const relationships: C4Rel[] = [];
    for (let i = 0; i < count - 1; i++) {
        relationships.push({ id: `r${i}`, from: `E${i}`, to: `E${i + 1}`, label: '', relType: 'uses' });
    }
    return { type: 'system-context', direction: 'TB', elements, relationships };
}

/** Padding applied in layoutSync = result dimension minus the content bbox. */
function appliedPadding(view: C4View): { padX: number; padY: number } {
    const result = new DagreLayoutEngine().layoutSync(view);
    const maxX = Math.max(...result.elements.map(el => el.x + el.width));
    const maxY = Math.max(...result.elements.map(el => el.y + el.height));
    return { padX: result.width - maxX, padY: result.height - maxY };
}

describe('resolveCanvasPadding', () => {
    it('returns 30px for diagrams with fewer than 5 elements', () => {
        assert.strictEqual(resolveCanvasPadding(0), 30);
        assert.strictEqual(resolveCanvasPadding(1), 30);
        assert.strictEqual(resolveCanvasPadding(4), 30);
    });

    it('returns 50px for diagrams with 5 or more elements', () => {
        assert.strictEqual(resolveCanvasPadding(5), 50);
        assert.strictEqual(resolveCanvasPadding(6), 50);
        assert.strictEqual(resolveCanvasPadding(100), 50);
    });
});

describe('DagreLayoutEngine — adaptive canvas padding (#111)', () => {
    it('applies 30px padding to a 3-element diagram', () => {
        assert.deepStrictEqual(appliedPadding(makeView(3)), { padX: 30, padY: 30 });
    });

    it('applies 30px padding at the upper boundary of "small" (4 elements)', () => {
        assert.deepStrictEqual(appliedPadding(makeView(4)), { padX: 30, padY: 30 });
    });

    it('applies 50px padding to a 10-element diagram', () => {
        assert.deepStrictEqual(appliedPadding(makeView(10)), { padX: 50, padY: 50 });
    });

    it('applies 50px padding at the lower boundary of "large" (5 elements)', () => {
        assert.deepStrictEqual(appliedPadding(makeView(5)), { padX: 50, padY: 50 });
    });
});
