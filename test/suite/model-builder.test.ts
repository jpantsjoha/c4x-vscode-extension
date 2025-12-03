import * as assert from 'assert';
import { c4ModelBuilder } from '../../src/model/C4ModelBuilder';
import { ParseResult } from '../../src/parser';

describe('C4ModelBuilder', () => {
    const baseParseResult: ParseResult = {
        viewType: 'system-context',
        elements: [
            { type: 'element', id: 'Customer', label: 'Customer', elementType: 'Person', tags: [] },
            { type: 'element', id: 'System', label: 'System', elementType: 'Software System', tags: [] },
        ],
        relationships: [
            { type: 'relationship', from: 'Customer', to: 'System', arrow: '-->', label: 'Uses' },
        ],
    };

    it('builds a model with normalized element types', () => {
        const model = c4ModelBuilder.build(baseParseResult, 'Workspace');
        assert.strictEqual(model.views.length, 1);
        const view = model.views[0];
        assert.strictEqual(view.elements[0].type, 'Person');
        assert.strictEqual(view.elements[1].type, 'SoftwareSystem');
        assert.strictEqual(view.relationships[0].relType, 'uses');
    });

    it('throws on duplicate element identifiers', () => {
        const duplicateResult: ParseResult = {
            ...baseParseResult,
            elements: [
                { type: 'element', id: 'A', label: 'A', elementType: 'Person', tags: [] },
                { type: 'element', id: 'A', label: 'Duplicate', elementType: 'Person', tags: [] },
            ],
        };

        assert.throws(() => c4ModelBuilder.build(duplicateResult, 'Workspace'));
    });

    it('throws when relationship references unknown element', () => {
        const invalidRelationship: ParseResult = {
            ...baseParseResult,
            relationships: [
                { type: 'relationship', from: 'Unknown', to: 'System', arrow: '-->', label: 'Uses' },
            ],
        };

        assert.throws(() => c4ModelBuilder.build(invalidRelationship, 'Workspace'));
    });
});
