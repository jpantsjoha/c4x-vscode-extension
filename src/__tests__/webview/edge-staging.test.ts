import * as assert from 'assert';
import {
    computeStageEdgeTechnology,
    computeStageEdgeRelType,
    computeStageEdgeEndpoint,
    isRelationshipEndpointLegal,
} from '../../webview/previewClientScript';

describe('computeStageEdgeTechnology', () => {
    it('stages a technology value', () => {
        const updated = computeStageEdgeTechnology('edge-1', 'HTTP', undefined, {});
        assert.strictEqual(updated['edge-1'].technology, 'HTTP');
        assert.strictEqual(updated['edge-1'].edgeId, 'edge-1');
    });

    it('stages an explicit clear when the input is empty', () => {
        const updated = computeStageEdgeTechnology('edge-1', '', 'HTTP', {});
        assert.strictEqual(updated['edge-1'].technology, null);
    });

    it('removes the whole edge edit entry when restored to the original value', () => {
        const staged = { 'edge-1': { edgeId: 'edge-1', technology: 'GraphQL' } };
        const updated = computeStageEdgeTechnology('edge-1', 'HTTP', 'HTTP', staged);
        assert.strictEqual('edge-1' in updated, false);
    });
});

describe('computeStageEdgeRelType', () => {
    it('stages a relType change', () => {
        const updated = computeStageEdgeRelType('edge-1', 'async', 'uses', {});
        assert.strictEqual(updated['edge-1'].relType, 'async');
    });

    it('removes the whole edge edit entry when restored to the original value', () => {
        const staged = { 'edge-1': { edgeId: 'edge-1', relType: 'sync' } };
        const updated = computeStageEdgeRelType('edge-1', 'uses', 'uses', staged);
        assert.strictEqual('edge-1' in updated, false);
    });
});

describe('computeStageEdgeEndpoint', () => {
    it('stages a source endpoint re-assignment', () => {
        const updated = computeStageEdgeEndpoint('edge-1', 'from', 'new-source', 'old-source', {});
        assert.strictEqual(updated['edge-1'].from, 'new-source');
    });

    it('stages a target endpoint re-assignment', () => {
        const updated = computeStageEdgeEndpoint('edge-1', 'to', 'new-target', 'old-target', {});
        assert.strictEqual(updated['edge-1'].to, 'new-target');
    });

    it('removes the whole edge edit entry when restored to the original value', () => {
        const staged = { 'edge-1': { edgeId: 'edge-1', from: 'new-source' } };
        const updated = computeStageEdgeEndpoint('edge-1', 'from', 'old-source', 'old-source', staged);
        assert.strictEqual('edge-1' in updated, false);
    });
});

describe('isRelationshipEndpointLegal', () => {
    it('allows logical-to-logical connections', () => {
        assert.strictEqual(isRelationshipEndpointLegal('Container', 'Container'), true);
        assert.strictEqual(isRelationshipEndpointLegal('Person', 'SoftwareSystem'), true);
    });

    it('allows deployment-to-deployment connections', () => {
        assert.strictEqual(isRelationshipEndpointLegal('DeploymentNode', 'DeploymentNode'), true);
        assert.strictEqual(isRelationshipEndpointLegal('Node', 'Node'), true);
    });

    it('rejects mixed logical and deployment endpoints', () => {
        assert.strictEqual(isRelationshipEndpointLegal('Container', 'DeploymentNode'), false);
        assert.strictEqual(isRelationshipEndpointLegal('DeploymentNode', 'Container'), false);
    });
});
