import * as assert from 'assert';
import { svgBuilder } from '../../src/render/SvgBuilder';
import { LayoutResult } from '../../src/layout/DagreLayoutEngine';

describe('SvgBuilder', () => {
    const layout: LayoutResult = {
        width: 400,
        height: 300,
        elements: [
            {
                id: 'A',
                x: 20,
                y: 20,
                width: 220,
                height: 120,
                element: {
                    id: 'A',
                    label: 'A',
                    type: 'Person',
                    tags: ['External'],
                },
            },
        ],
        relationships: [
            {
                id: 'rel-0',
                points: [
                    { x: 50, y: 50 },
                    { x: 50, y: 100 },
                ],
                relationship: {
                    id: 'rel-0',
                    from: 'A',
                    to: 'A',
                    label: 'uses',
                    relType: 'uses',
                },
            },
        ],
    };

    it('generates svg with markers and content', () => {
        const svg = svgBuilder.build(layout);
        assert.ok(svg.includes('<svg'));
        assert.ok(svg.includes('marker-end'));
        assert.ok(svg.includes('A'));
    });
});
