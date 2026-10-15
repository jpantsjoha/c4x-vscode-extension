import * as assert from 'assert';
import {
    COARSE_DRAG_THRESHOLD_PX,
    DRAG_THRESHOLD_PX,
    PREVIEW_CLIENT_SCRIPT,
    dragThresholdFor,
    hasPassedDragThreshold,
    isZeroDeltaMove,
    pointerDownKeepsSelection,
    settlePointerMove,
    sharedDragDelta,
} from '../../webview/previewClientScript';

/**
 * Click-versus-drag on the visual editor canvas (#251, #252).
 *
 * The pointer handler used to treat every press as a finished drag: selection
 * was replaced at pointer-down (dropping a multi-selection before the group
 * drag could read it, #252) and a move was staged at pointer-up whether or
 * not the pointer had moved (#251). These pure helpers carry the decisions the
 * handler now makes, and are embedded verbatim into the webview script.
 */
describe('pointer gesture: drag threshold (#251)', () => {
    it('uses a small, positive screen-pixel threshold', () => {
        assert.ok(DRAG_THRESHOLD_PX > 0 && DRAG_THRESHOLD_PX <= 8, `got ${DRAG_THRESHOLD_PX}`);
    });

    it('a press with no pointer movement is not a drag', () => {
        assert.strictEqual(hasPassedDragThreshold(100, 200, 100, 200, DRAG_THRESHOLD_PX), false);
    });

    it('jitter below the threshold is not a drag', () => {
        assert.strictEqual(hasPassedDragThreshold(100, 200, 102, 201, 4), false);
        assert.strictEqual(hasPassedDragThreshold(100, 200, 97, 198, 4), false);
    });

    it('movement at or beyond the threshold in any direction is a drag', () => {
        assert.strictEqual(hasPassedDragThreshold(100, 200, 104, 200, 4), true);
        assert.strictEqual(hasPassedDragThreshold(100, 200, 100, 196, 4), true);
        assert.strictEqual(hasPassedDragThreshold(100, 200, 103, 203, 4), true);
    });

    it('rejects non-finite input rather than starting a drag', () => {
        assert.strictEqual(hasPassedDragThreshold(Number.NaN, 0, 50, 50, 4), false);
        assert.strictEqual(hasPassedDragThreshold(0, 0, Number.POSITIVE_INFINITY, 0, 4), false);
    });
});

describe('pointer gesture: zero-delta moves never stage (#251)', () => {
    it('the same position is a zero-delta move', () => {
        assert.strictEqual(isZeroDeltaMove({ x: 80, y: 120 }, { x: 80, y: 120 }), true);
    });

    it('an auto-layout float start compared with its rounded canvas position is zero-delta', () => {
        // The UAT wrote $y="609.0119565375295" for a node that was only clicked.
        assert.strictEqual(isZeroDeltaMove({ x: 80, y: 609.0119565375295 }, { x: 80, y: 609 }), true);
    });

    it('any whole-unit change on either axis is a real move', () => {
        assert.strictEqual(isZeroDeltaMove({ x: 80, y: 120 }, { x: 81, y: 120 }), false);
        assert.strictEqual(isZeroDeltaMove({ x: 80, y: 120 }, { x: 80, y: 119 }), false);
    });
});

describe('pointer gesture: settling a finished drag (#251)', () => {
    it('a zero-delta drag restores the exact, unrounded gesture start and stages nothing', () => {
        // moveNode rounds every frame, so the pointer returning home leaves the
        // node at 609, not at its auto-layout 609.0119565375295.
        const start = { x: 80.4, y: 609.0119565375295 };
        const settled = settlePointerMove(start, { x: 80, y: 609 });
        assert.deepStrictEqual(settled, { stage: false, x: 80.4, y: 609.0119565375295 });
    });

    it('a real move keeps the rounded end position and stages it', () => {
        const settled = settlePointerMove({ x: 80.4, y: 609.0119565375295 }, { x: 140, y: 649 });
        assert.deepStrictEqual(settled, { stage: true, x: 140, y: 649 });
    });

    it('a one-unit move on one axis is staged', () => {
        assert.strictEqual(settlePointerMove({ x: 10, y: 10 }, { x: 10, y: 11 }).stage, true);
    });
});

describe('pointer gesture: pressing a selected node keeps a multi-selection (#252)', () => {
    it('keeps the set when the pressed node is one of several selected nodes', () => {
        assert.strictEqual(pointerDownKeepsSelection(['web', 'identity'], 'web'), true);
        assert.strictEqual(pointerDownKeepsSelection(['web', 'identity'], 'identity'), true);
    });

    it('replaces the selection when the pressed node is not selected', () => {
        assert.strictEqual(pointerDownKeepsSelection(['web', 'identity'], 'api'), false);
    });

    it('replaces the selection when nothing or only one node is selected', () => {
        assert.strictEqual(pointerDownKeepsSelection([], 'web'), false);
        assert.strictEqual(pointerDownKeepsSelection(['web'], 'web'), false);
    });
});

describe('pointer gesture helpers are embedded in the webview script', () => {
    for (const name of ['hasPassedDragThreshold', 'dragThresholdFor', 'sharedDragDelta', 'isZeroDeltaMove', 'pointerDownKeepsSelection', 'settlePointerMove']) {
        it(`embeds ${name}`, () => {
            assert.ok(
                PREVIEW_CLIENT_SCRIPT.includes(`function ${name}(`),
                `${name} must be embedded so the browser runs the tested code`,
            );
        });
    }

    it('declares the drag threshold constant for the browser', () => {
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes(`const DRAG_THRESHOLD_PX = ${DRAG_THRESHOLD_PX};`));
    });
});

describe('pointer gesture: touch threshold and shared group delta (#254)', () => {
    it('uses the larger threshold for touch and pen, and the small one for a mouse', () => {
        assert.strictEqual(COARSE_DRAG_THRESHOLD_PX, 10);
        assert.strictEqual(dragThresholdFor('touch', DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX), 10);
        assert.strictEqual(dragThresholdFor('pen', DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX), 10);
        assert.strictEqual(dragThresholdFor('mouse', DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX), 4);
        assert.strictEqual(dragThresholdFor(undefined, DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX), 4);
    });

    it('a 6 px touch wobble is a tap, a 6 px mouse move is a drag', () => {
        const touch = dragThresholdFor('touch', DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX);
        const mouse = dragThresholdFor('mouse', DRAG_THRESHOLD_PX, COARSE_DRAG_THRESHOLD_PX);
        assert.strictEqual(hasPassedDragThreshold(0, 0, 6, 0, touch), false);
        assert.strictEqual(hasPassedDragThreshold(0, 0, 6, 0, mouse), true);
    });

    it('rounds the delta once and applies it to every member', () => {
        const d = sharedDragDelta([{ x: 100.37, y: 61.5 }, { x: 500.42, y: 60.6 }], 39.6, 29.4);
        assert.deepStrictEqual(d, { dx: 40, dy: 29 });
    });

    it('clamps the delta so the group stops when its nearest member reaches 0', () => {
        assert.deepStrictEqual(sharedDragDelta([{ x: 20, y: 300 }, { x: 300, y: 300 }], -60, 5), { dx: -20, dy: 5 });
        assert.deepStrictEqual(sharedDragDelta([{ x: 20.4, y: 10 }], -60, -60), { dx: -20, dy: -10 });
    });

    it('never yields -0 or a non-finite delta', () => {
        const d = sharedDragDelta([{ x: 0, y: 0 }], -0.2, NaN);
        assert.ok(Object.is(d.dx, 0) && Object.is(d.dy, 0));
    });
});
