import * as assert from 'assert';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { C4View, C4Element } from '../../model/C4Model';

describe('DagreLayoutEngine — auto-direction', () => {
    let engine: DagreLayoutEngine;

    beforeEach(() => {
        engine = new DagreLayoutEngine();
    });

    // =========================================================================
    // Helpers
    // =========================================================================

    function makeElement(id: string): C4Element {
        return { id, label: id, type: 'SoftwareSystem' };
    }

    function makeView(elementCount: number, overrides: Partial<C4View> = {}): C4View {
        const elements: C4Element[] = [];
        for (let i = 0; i < elementCount; i++) {
            elements.push(makeElement(`Elem${i}`));
        }
        return {
            type: 'system-context',
            elements,
            relationships: [],
            ...overrides,
        };
    }

    // =========================================================================
    // autoDetectDirection — unit tests for the decision logic
    // =========================================================================

    describe('autoDetectDirection', () => {
        it('returns LR for 1 element', () => {
            const view = makeView(1);
            assert.strictEqual(engine.autoDetectDirection(view), 'LR');
        });

        it('returns LR for 3 elements', () => {
            const view = makeView(3);
            assert.strictEqual(engine.autoDetectDirection(view), 'LR');
        });

        it('returns LR for 4 elements (boundary case)', () => {
            const view = makeView(4);
            assert.strictEqual(engine.autoDetectDirection(view), 'LR');
        });

        it('returns TB for 5 elements (boundary case)', () => {
            const view = makeView(5);
            assert.strictEqual(engine.autoDetectDirection(view), 'TB');
        });

        it('returns TB for 10 elements', () => {
            const view = makeView(10);
            assert.strictEqual(engine.autoDetectDirection(view), 'TB');
        });

        it('returns LR for 0 elements (edge case)', () => {
            const view = makeView(0);
            assert.strictEqual(engine.autoDetectDirection(view), 'LR');
        });
    });

    // =========================================================================
    // Explicit direction overrides auto-detection
    // =========================================================================

    describe('explicit direction overrides auto-detection', () => {
        it('graph LR with 10 elements -> LR (override wins)', () => {
            const view = makeView(10, { direction: 'LR' });
            assert.strictEqual(engine.autoDetectDirection(view), 'LR');
        });

        it('graph TB with 3 elements -> TB (override wins)', () => {
            const view = makeView(3, { direction: 'TB' });
            assert.strictEqual(engine.autoDetectDirection(view), 'TB');
        });

        it('graph BT with 2 elements -> BT (override wins)', () => {
            const view = makeView(2, { direction: 'BT' });
            assert.strictEqual(engine.autoDetectDirection(view), 'BT');
        });

        it('graph RL with 7 elements -> RL (override wins)', () => {
            const view = makeView(7, { direction: 'RL' });
            assert.strictEqual(engine.autoDetectDirection(view), 'RL');
        });
    });

    // =========================================================================
    // Integration: layoutSync uses autoDetectDirection
    // =========================================================================

    describe('layoutSync integration', () => {
        it('lays out 3 elements without error (auto LR)', () => {
            const view = makeView(3);
            const result = engine.layoutSync(view);
            assert.strictEqual(result.elements.length, 3);
        });

        it('lays out 6 elements without error (auto TB)', () => {
            const view = makeView(6);
            const result = engine.layoutSync(view);
            assert.strictEqual(result.elements.length, 6);
        });

        it('lays out 1 element without error', () => {
            const view = makeView(1);
            const result = engine.layoutSync(view);
            assert.strictEqual(result.elements.length, 1);
        });
    });
});
