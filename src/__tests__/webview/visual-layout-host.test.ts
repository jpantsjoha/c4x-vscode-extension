import * as assert from 'assert';
import {
    applyMoveMessage,
    MoveElementMessage,
    VisualLayoutSnapshot,
    VISUAL_LAYOUT_PROTOCOL_VERSION,
} from '../../webview/visualLayoutProtocol';
import { formatMoveAnnouncement } from '../../webview/previewClientScript';

function makeSnapshot(overrides?: Partial<VisualLayoutSnapshot>): VisualLayoutSnapshot {
    return {
        revision: 'rev-1',
        nodes: [
            { id: 'customer', label: 'Customer', type: 'Person', x: 100, y: 120, width: 200, height: 120 },
            { id: 'payments', label: 'Payments', type: 'SoftwareSystem', x: 500, y: 120, width: 220, height: 120 },
        ],
        boundaries: [],
        edges: [{ id: 'edge-1', from: 'customer', to: 'payments' }],
        ...overrides,
    };
}

function makeMove(overrides?: Partial<MoveElementMessage>): MoveElementMessage {
    return {
        type: 'visualLayout.moveElement',
        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
        revision: 'rev-1',
        id: 'customer',
        x: 150,
        y: 130,
        input: 'pointer',
        ...overrides,
    };
}

describe('Visual Layout host logic (applyMoveMessage)', () => {
    it('accepts a valid move and returns a new in-memory snapshot', () => {
        const snapshot = makeSnapshot();
        const result = applyMoveMessage(snapshot, makeMove({ x: 200, y: 300 }));
        assert.ok(result.accepted);
        if (result.accepted) {
            assert.strictEqual(result.id, 'customer');
            assert.strictEqual(result.x, 200);
            assert.strictEqual(result.y, 300);
            assert.strictEqual(result.persisted, false);
            const movedNode = result.snapshot.nodes.find(n => n.id === 'customer');
            assert.strictEqual(movedNode?.x, 200);
            assert.strictEqual(movedNode?.y, 300);
        }

        const originalNode = snapshot.nodes.find(n => n.id === 'customer');
        assert.strictEqual(originalNode?.x, 100);
        assert.strictEqual(originalNode?.y, 120);
    });

    it('accepts a keyboard move and reflects the input type', () => {
        const result = applyMoveMessage(makeSnapshot(), makeMove({ input: 'keyboard', x: 110, y: 120 }));
        assert.ok(result.accepted);
        if (result.accepted) {
            assert.strictEqual(result.input, 'keyboard');
        }
    });

    it('rejects a stale revision', () => {
        const result = applyMoveMessage(makeSnapshot(), makeMove({ revision: 'rev-stale' }));
        assert.ok(!result.accepted);
        if (!result.accepted) {
            assert.strictEqual(result.code, 'stale_revision');
            assert.ok(result.reason.toLowerCase().includes('changed'));
        }
    });

    it('rejects when revision is empty string', () => {
        const result = applyMoveMessage(makeSnapshot(), makeMove({ revision: '' } as MoveElementMessage));
        assert.ok(!result.accepted);
    });

    it('rejects a move targeting an element that does not exist in the snapshot', () => {
        const result = applyMoveMessage(makeSnapshot(), makeMove({ id: 'ghost-element' }));
        assert.ok(!result.accepted);
        if (!result.accepted) {
            assert.strictEqual(result.code, 'missing_element');
            assert.ok(result.reason.includes('ghost-element'));
        }
    });

    it('does not mutate snapshot when element is missing', () => {
        const snapshot = makeSnapshot();
        const originalPositions = snapshot.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
        applyMoveMessage(snapshot, makeMove({ id: 'ghost-element', x: 999, y: 999 }));
        const currentPositions = snapshot.nodes.map(n => ({ id: n.id, x: n.x, y: n.y }));
        assert.deepStrictEqual(currentPositions, originalPositions);
    });

    it('does not mutate snapshot on stale revision', () => {
        const snapshot = makeSnapshot();
        const originalX = snapshot.nodes[0].x;
        applyMoveMessage(snapshot, makeMove({ revision: 'rev-old', x: 999, y: 999 }));
        assert.strictEqual(snapshot.nodes[0].x, originalX);
    });

    it('keeps persisted: false on every accepted move (draft-only invariant)', () => {
        const result = applyMoveMessage(makeSnapshot(), makeMove());
        assert.ok(result.accepted);
        if (result.accepted) {
            assert.strictEqual(result.persisted, false);
        }
    });

    it('can apply sequential draft moves only when the caller retains the returned snapshot', () => {
        const first = applyMoveMessage(makeSnapshot(), makeMove({ x: 180, y: 190 }));
        assert.ok(first.accepted);
        if (!first.accepted) {
            return;
        }

        const second = applyMoveMessage(first.snapshot, makeMove({ x: 220, y: 240, input: 'keyboard' }));
        assert.ok(second.accepted);
        if (second.accepted) {
            const movedNode = second.snapshot.nodes.find(node => node.id === 'customer');
            assert.deepStrictEqual(
                movedNode && { x: movedNode.x, y: movedNode.y },
                { x: 220, y: 240 }
            );
        }
    });
});

describe('Visual Layout move announcements', () => {
    it('includes the element name and coordinates and changes for consecutive moves', () => {
        const first = formatMoveAnnouncement('Payments API', 120, 240, 1);
        const second = formatMoveAnnouncement('Payments API', 130, 240, 2);

        assert.ok(first.includes('Payments API'));
        assert.ok(first.includes('120, 240'));
        assert.notStrictEqual(first, second);
    });
});
