import * as assert from 'assert';
import {
    AddElementMessage,
    DeleteElementMessage,
    DeleteRelationshipMessage,
    isVisualLayoutMessage,
    isSemanticAuthoringMessage,
    SemanticAddRelationshipMessage,
    SetPresentationOptionMessage,
    UpdateElementMessage,
    UpdateRelationshipMessage,
    VISUAL_LAYOUT_PROTOCOL_VERSION,
} from '../../webview/visualLayoutProtocol';

describe('Visual Layout protocol', () => {
    const validMessage = {
        type: 'visualLayout.moveElement',
        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
        revision: '12',
        id: 'payments-api',
        x: 120.5,
        y: 320,
        input: 'pointer',
    } as const;

    it('accepts a valid move message', () => {
        assert.strictEqual(isVisualLayoutMessage(validMessage), true);
    });

    it('accepts keyboard moves', () => {
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, input: 'keyboard' }), true);
    });

    it('accepts bounded staged editor fields and rejects unsafe identifier or tag payloads', () => {
        const staged = {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            edits: [{
                id: 'payments-api',
                label: 'Payments API',
                technology: 'TypeScript',
                tags: ['internal', 'payments'],
                sprite: 'database',
                newId: 'paymentsApi',
            }],
        } as const;
        assert.strictEqual(isVisualLayoutMessage(staged), true);
        assert.strictEqual(isVisualLayoutMessage({
            ...staged,
            edits: [{ ...staged.edits[0], newId: '1payments' }],
        }), false);
        assert.strictEqual(isVisualLayoutMessage({
            ...staged,
            edits: [{ ...staged.edits[0], tags: ['not valid'] }],
        }), false);
        assert.strictEqual(isVisualLayoutMessage({
            ...staged,
            edits: [staged.edits[0], { ...staged.edits[0], label: 'Duplicate target' }],
        }), false);
    });

    it('accepts a bounded add-element semantic operation', () => {
        const message: AddElementMessage = {
            type: 'visualLayout.addElement',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            element: {
                id: 'payments-api',
                type: 'Container',
                label: 'Payments API',
                description: 'Processes payments.',
                technology: 'TypeScript',
                tags: ['internal', 'payments'],
                parentId: 'payments-system',
            },
            position: { x: 120.5, y: 320 },
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts an update-element semantic operation', () => {
        const message: UpdateElementMessage = {
            type: 'visualLayout.updateElement',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            id: 'payments-api',
            changes: {
                label: 'Payment API',
                description: null,
                tags: ['internal'],
            },
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts a delete-element semantic operation', () => {
        const message: DeleteElementMessage = {
            type: 'visualLayout.deleteElement',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            id: 'payments-api',
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts bounded relationship edge edits with label, technology, relType, and endpoints', () => {
        const staged = {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            edits: [{
                id: 'rel-0',
                edgeId: 'rel-0',
                label: 'Calls',
                technology: 'HTTP',
                relType: 'sync',
                from: 'web-app',
                to: 'payments-api',
            }],
        } as const;
        assert.strictEqual(isVisualLayoutMessage(staged), true);
    });

    it('rejects relationship edge edits without any supported property', () => {
        const staged = {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            edits: [{ id: 'rel-0', edgeId: 'rel-0' }],
        } as const;
        assert.strictEqual(isVisualLayoutMessage(staged), false);
    });

    it('rejects relType and endpoint changes outside of edge edits', () => {
        const elementEdit = {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            edits: [{ id: 'payments-api', relType: 'sync' }],
        } as const;
        assert.strictEqual(isVisualLayoutMessage(elementEdit), false);

        const endpointEdit = {
            type: 'visualLayout.applySemanticEdits',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            edits: [{ id: 'payments-api', from: 'web-app' }],
        } as const;
        assert.strictEqual(isVisualLayoutMessage(endpointEdit), false);
    });

    it('accepts a bounded add-relationship semantic operation', () => {
        const message: SemanticAddRelationshipMessage = {
            type: 'visualLayout.addRelationship',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            relationship: {
                id: 'web-to-payments',
                from: 'web-app',
                to: 'payments-api',
                label: 'Processes payments',
                relType: 'sync',
                technology: 'HTTPS',
            },
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts an update-relationship semantic operation', () => {
        const message: UpdateRelationshipMessage = {
            type: 'visualLayout.updateRelationship',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            id: 'web-to-payments',
            changes: {
                label: 'Submits payment',
                technology: null,
                relType: 'async',
            },
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts a delete-relationship semantic operation', () => {
        const message: DeleteRelationshipMessage = {
            type: 'visualLayout.deleteRelationship',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            id: 'web-to-payments',
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('accepts a bounded presentation-option semantic operation', () => {
        const message: SetPresentationOptionMessage = {
            type: 'visualLayout.setPresentationOption',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            option: 'legend.visible',
            value: true,
        };

        assert.strictEqual(isSemanticAuthoringMessage(message), true);
    });

    it('rejects malformed semantic operations and arbitrary payload fields', () => {
        const validAddElement: AddElementMessage = {
            type: 'visualLayout.addElement',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            element: {
                id: 'payments-api',
                type: 'Container',
                label: 'Payments API',
            },
            position: { x: 120, y: 320 },
        };

        assert.strictEqual(isSemanticAuthoringMessage({
            ...validAddElement,
            element: { ...validAddElement.element, type: 'Unknown' },
        }), false);
        assert.strictEqual(isSemanticAuthoringMessage({
            ...validAddElement,
            position: { x: 120 },
        }), false);
        assert.strictEqual(isSemanticAuthoringMessage({
            type: 'visualLayout.updateElement',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            id: 'payments-api',
            changes: {},
        }), false);
        assert.strictEqual(isSemanticAuthoringMessage({
            type: 'visualLayout.setPresentationOption',
            protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
            revision: '12',
            option: 'legend.visible',
            value: { visible: true },
        }), false);
        assert.strictEqual(isSemanticAuthoringMessage({
            ...validAddElement,
            source: 'graph TB',
        }), false);
    });

    it('rejects unknown message types and protocol versions', () => {
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, type: 'visualLayout.deleteElement' }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, protocolVersion: 2 }), false);
    });

    it('rejects empty or oversized identifiers', () => {
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, id: '' }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, id: '   ' }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, id: 'x'.repeat(257) }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, revision: '   ' }), false);
    });

    it('rejects non-finite or unreasonable coordinates', () => {
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, x: Number.NaN }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, y: Number.POSITIVE_INFINITY }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, x: -1 }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, x: 1_000_001 }), false);
        assert.strictEqual(isVisualLayoutMessage({ ...validMessage, x: '120' }), false);
    });

    it('rejects malformed and incomplete payloads', () => {
        assert.strictEqual(isVisualLayoutMessage(null), false);
        assert.strictEqual(isVisualLayoutMessage([]), false);
        assert.strictEqual(isVisualLayoutMessage({ type: validMessage.type }), false);
    });
});
