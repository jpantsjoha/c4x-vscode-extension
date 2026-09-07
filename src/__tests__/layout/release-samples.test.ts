import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';

describe('Release examples remain readable at authored positions', () => {
    for (const name of ['c1-refined-metadata', 'c2-nested-locked', 'c3-relationship-routing']) {
        it(`${name} leaves room between nodes for relationship labels`, () => {
            const source = readFileSync(path.resolve(__dirname, '../../../samples/visual-layout', `${name}.c4x`), 'utf8');
            const model = c4ModelBuilder.build(c4xParser.parse(source), name);
            const layout = dagreLayoutEngine.layoutSync(model.views[0]);
            for (let i = 0; i < layout.elements.length; i++) {
                for (let j = i + 1; j < layout.elements.length; j++) {
                    const a = layout.elements[i];
                    const b = layout.elements[j];
                    const xGap = Math.max(b.x - a.x - a.width, a.x - b.x - b.width);
                    const yGap = Math.max(b.y - a.y - a.height, a.y - b.y - b.height);
                    assert.ok(xGap >= 80 || yGap >= 80, `${a.id}/${b.id}: gaps ${xGap}, ${yGap}`);
                }
            }
        });
    }
});
