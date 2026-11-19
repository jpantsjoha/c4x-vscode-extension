/**
 * Save validation ladder for element styles (#322, notation decision #320, Decision 3): a Save
 * that would drop or change an `elementStyle` statement or a `$shape` value
 * rolls back like any other structural mismatch.
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
import { assertStructuralEquivalence } from '../../writeback/WritebackTransaction';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Model } from '../../model/C4Model';

const parser = new C4XParser();
const model = (source: string): C4Model => c4ModelBuilder.build(parser.parse('graph TB\n' + source), 'ladder');

const BASE = 'elementStyle legacy $stroke="#BF101D", $legend="Legacy"\nSystem(a, "A", $tags="legacy", $shape="Box")\nSystem(b, "B")\n';

describe('Save validation ladder: element styles (#322)', () => {
    it('accepts a Save that keeps every style declaration and shape, even when they move', () => {
        const moved = '%% a comment above shifts every range\n' + BASE.replace('System(a, "A",', 'System(a, "A", $x="10", $y="20",');
        assert.doesNotThrow(() => assertStructuralEquivalence(model(BASE), model(moved), 'a'));
    });

    const changes: ReadonlyArray<[string, string]> = [
        ['dropped statement', BASE.replace(/^elementStyle.*\n/, '')],
        ['changed value', BASE.replace('#BF101D', '#000000')],
        ['dropped key', BASE.replace(', $legend="Legacy"', '')],
        ['reordered keys', BASE.replace('$stroke="#BF101D", $legend="Legacy"', '$legend="Legacy", $stroke="#BF101D"')],
        ['renamed tag', BASE.replace('elementStyle legacy', 'elementStyle Legacy')],
        ['added statement', BASE + 'elementStyle extra $color="#111"\n'],
    ];
    for (const [name, updated] of changes) {
        it(`rolls back a Save with a ${name} in elementStyle`, () => {
            assert.throws(() => assertStructuralEquivalence(model(BASE), model(updated), 'a'), /elementStyle/);
        });
    }

    it('rolls back a Save that drops or changes a $shape, on a target or not', () => {
        assert.throws(() => assertStructuralEquivalence(model(BASE), model(BASE.replace(', $shape="Box"', '')), 'a'), /\$shape/);
        assert.throws(() => assertStructuralEquivalence(model(BASE), model(BASE.replace('$shape="Box"', '$shape="Cylinder"')), 'b'), /\$shape/);
    });
});
