import * as assert from 'assert';
import { dagreLayoutEngine } from '../../src/layout/DagreLayoutEngine';
import { C4View } from '../../src/model/C4Model';

describe('DagreLayoutEngine (deterministic layout)', () => {
    const view: C4View = {
        type: 'system-context',
        elements: [
            { id: 'A', label: 'A', type: 'Person' },
            { id: 'B', label: 'B', type: 'SoftwareSystem' },
            { id: 'C', label: 'C', type: 'Container' },
        ],
        relationships: [
            { id: 'rel-0', from: 'A', to: 'B', label: 'uses', relType: 'uses' },
            { id: 'rel-1', from: 'B', to: 'C', label: 'uses', relType: 'uses' },
        ],
    };

    it('produces consistent positions for nodes and edges', async () => {
        const layout = await dagreLayoutEngine.layout(view);
        assert.strictEqual(layout.elements.length, 3);
        const nodeA = layout.elements.find(node => node.id === 'A');
        const nodeB = layout.elements.find(node => node.id === 'B');
        const nodeC = layout.elements.find(node => node.id === 'C');
        assert.ok(nodeA && nodeB && nodeC);
        assert.ok(nodeA.y <= nodeB.y);
        assert.ok(nodeB.y <= nodeC.y);
        assert.strictEqual(layout.relationships.length, 2);
    });
});
