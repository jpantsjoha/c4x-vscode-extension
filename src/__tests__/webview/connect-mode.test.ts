/**
 * Connect mode client helpers (#66).
 *
 * The pure half of the two-click "add relationship" gesture: which nodes are
 * eligible at each phase, how a pick advances the state machine, what gets
 * staged, and what the user is told. The DOM half is covered by
 * test/playwright/connect-mode.spec.ts.
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
import {
    PREVIEW_CLIENT_SCRIPT,
    ConnectModeState,
    eligibleConnectTargets,
    connectModePrompt,
    advanceConnectMode,
    computeStageAddRelationship,
    formatAddRelationshipSummary,
} from '../../webview/previewClientScript';
import { isVisualLayoutMessage, VISUAL_LAYOUT_PROTOCOL_VERSION } from '../../webview/visualLayoutProtocol';

const NODES = [
    { id: 'web', type: 'Container' },
    { id: 'api', type: 'Container' },
    { id: 'person', type: 'Person' },
    { id: 'host', type: 'DeploymentNode' },
];

describe('connect mode: eligibleConnectTargets (#66)', () => {
    it('offers nothing while idle', () => {
        assert.deepStrictEqual(eligibleConnectTargets({ phase: 'idle' }, NODES), []);
    });

    it('offers every node while awaiting a source', () => {
        assert.deepStrictEqual(
            eligibleConnectTargets({ phase: 'awaitingSource' }, NODES),
            ['web', 'api', 'person', 'host'],
        );
    });

    it('excludes the chosen source itself', () => {
        const eligible = eligibleConnectTargets({ phase: 'awaitingTarget', sourceId: 'web' }, NODES);
        assert.ok(!eligible.includes('web'), 'a self-relationship must not be offered');
    });

    it('excludes deployment nodes when the source is logical', () => {
        const eligible = eligibleConnectTargets({ phase: 'awaitingTarget', sourceId: 'web' }, NODES);
        assert.deepStrictEqual(eligible, ['api', 'person']);
    });

    it('excludes logical elements when the source is a deployment node', () => {
        const eligible = eligibleConnectTargets({ phase: 'awaitingTarget', sourceId: 'host' }, NODES);
        assert.deepStrictEqual(eligible, []);
    });

    it('returns nothing when the source has vanished from the canvas', () => {
        const eligible = eligibleConnectTargets({ phase: 'awaitingTarget', sourceId: 'gone' }, NODES);
        assert.deepStrictEqual(eligible, []);
    });
});

describe('connect mode: advanceConnectMode (#66)', () => {
    it('moves from awaiting-source to awaiting-target on a valid pick', () => {
        const result = advanceConnectMode({ phase: 'awaitingSource' }, 'web', NODES);
        assert.deepStrictEqual(result.state, { phase: 'awaitingTarget', sourceId: 'web' });
        assert.strictEqual(result.rejected, undefined);
        assert.strictEqual(result.completed, undefined);
    });

    it('rejects a source that is not on the canvas', () => {
        const result = advanceConnectMode({ phase: 'awaitingSource' }, 'ghost', NODES);
        assert.deepStrictEqual(result.state, { phase: 'awaitingSource' });
        assert.match(String(result.rejected), /not on the canvas/);
    });

    it('completes on a legal target and returns to idle', () => {
        const result = advanceConnectMode({ phase: 'awaitingTarget', sourceId: 'web' }, 'api', NODES);
        assert.deepStrictEqual(result.state, { phase: 'idle' });
        assert.deepStrictEqual(result.completed, { sourceId: 'web', targetId: 'api' });
    });

    it('rejects picking the source again, and stays armed', () => {
        const state: ConnectModeState = { phase: 'awaitingTarget', sourceId: 'web' };
        const result = advanceConnectMode(state, 'web', NODES);
        assert.deepStrictEqual(result.state, state, 'a refusal must not drop the gesture');
        assert.match(String(result.rejected), /two different elements/);
    });

    it('rejects an illegal cross-layer target with the C4 reason, and stays armed', () => {
        const state: ConnectModeState = { phase: 'awaitingTarget', sourceId: 'web' };
        const result = advanceConnectMode(state, 'host', NODES);
        assert.deepStrictEqual(result.state, state);
        assert.match(String(result.rejected), /Deployment Nodes cannot be connected directly/);
        assert.strictEqual(result.completed, undefined);
    });

    it('is inert while idle', () => {
        const result = advanceConnectMode({ phase: 'idle' }, 'web', NODES);
        assert.deepStrictEqual(result.state, { phase: 'idle' });
        assert.strictEqual(result.completed, undefined);
    });
});

describe('connect mode: prompts (#66)', () => {
    it('prompts for a source, then a target, and says how to cancel', () => {
        assert.match(connectModePrompt({ phase: 'awaitingSource' }), /source element/);
        assert.match(connectModePrompt({ phase: 'awaitingSource' }), /Escape/);
        assert.match(connectModePrompt({ phase: 'awaitingTarget', sourceId: 'web' }), /target element/);
    });

    it('says nothing while idle', () => {
        assert.strictEqual(connectModePrompt({ phase: 'idle' }), '');
    });

    it('summarises a staged add in the arrow form used by the changes list', () => {
        assert.strictEqual(
            formatAddRelationshipSummary('web', 'api', 'Calls'),
            'Added relationship web → api: Calls',
        );
    });
});

describe('connect mode: computeStageAddRelationship (#66)', () => {
    it('stages an add keyed by the source element', () => {
        const staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, {});
        assert.deepStrictEqual(staged, {
            web: { addRelationship: [{ targetId: 'api', label: 'Calls', relType: 'uses' }] },
        });
    });

    it('includes technology only when non-empty', () => {
        const withTech = computeStageAddRelationship('web', 'api', 'Calls', 'uses', 'HTTP', {});
        assert.strictEqual((withTech.web.addRelationship as { technology?: string }[])[0].technology, 'HTTP');
        const blank = computeStageAddRelationship('web', 'api', 'Calls', 'uses', '', {});
        assert.strictEqual((blank.web.addRelationship as { technology?: string }[])[0].technology, undefined);
    });

    it('appends a second relationship from the same source to one staged edit', () => {
        // Staged edits are keyed by element id and the protocol rejects
        // duplicate ids, so two arrows out of one element must share an entry.
        let staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, {});
        staged = computeStageAddRelationship('web', 'person', 'Notifies', 'async', null, staged);
        assert.strictEqual(Object.keys(staged).length, 1);
        assert.strictEqual((staged.web.addRelationship as unknown[]).length, 2);
    });

    it('keeps relationships from different sources in separate staged edits', () => {
        let staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, {});
        staged = computeStageAddRelationship('api', 'person', 'Notifies', 'uses', null, staged);
        assert.deepStrictEqual(Object.keys(staged).sort(), ['api', 'web']);
    });

    it('preserves unrelated staged edits and does not mutate the input', () => {
        const before = { api: { label: 'Renamed' } };
        const staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, before);
        assert.deepStrictEqual(before, { api: { label: 'Renamed' } }, 'input must not be mutated');
        assert.deepStrictEqual(staged.api, { label: 'Renamed' });
    });

    it('coexists with a property edit on the same element', () => {
        const staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, { web: { label: 'Web App' } });
        assert.strictEqual(staged.web.label, 'Web App');
        assert.strictEqual((staged.web.addRelationship as unknown[]).length, 1);
    });
});

describe('connect mode: staged adds satisfy the wire protocol (#66)', () => {
    const wrap = (edits: Record<string, Record<string, unknown>>) => ({
        type: 'visualLayout.applySemanticEdits',
        protocolVersion: VISUAL_LAYOUT_PROTOCOL_VERSION,
        revision: '7',
        edits: Object.keys(edits).map(id => ({ id, ...edits[id] })),
    });

    it('accepts what the client stages', () => {
        let staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', 'HTTP', {});
        staged = computeStageAddRelationship('web', 'person', 'Notifies', 'async', null, staged);
        assert.strictEqual(isVisualLayoutMessage(wrap(staged)), true);
    });

    it('rejects a pipe character in a staged label', () => {
        const staged = computeStageAddRelationship('web', 'api', 'a|b', 'uses', null, {});
        assert.strictEqual(isVisualLayoutMessage(wrap(staged)), false);
    });

    it('rejects an empty add list', () => {
        assert.strictEqual(isVisualLayoutMessage(wrap({ web: { addRelationship: [] } })), false);
    });

    it('rejects two identical source→target→label adds in one transaction', () => {
        let staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, {});
        staged = computeStageAddRelationship('web', 'api', 'Calls', 'uses', null, staged);
        assert.strictEqual(isVisualLayoutMessage(wrap(staged)), false);
    });
});

describe('connect mode: client wiring pins (#66)', () => {
    // Static pins — the helpers above are only reachable in the webview if
    // they are actually embedded and bound to the canvas.
    it('embeds every connect-mode helper into the client script', () => {
        for (const helper of [
            'eligibleConnectTargets',
            'connectModePrompt',
            'advanceConnectMode',
            'computeStageAddRelationship',
            'formatAddRelationshipSummary',
        ]) {
            assert.ok(
                PREVIEW_CLIENT_SCRIPT.includes('function ' + helper),
                `${helper} must be embedded in the webview client script`,
            );
        }
    });

    it('binds connect mode to the toolbar, canvas and dialog', () => {
        for (const pin of [
            "getElementById('connect-mode')",
            "getElementById('connect-dialog')",
            "getElementById('connect-confirm')",
            "getElementById('connect-cancel')",
            'pickConnectNode',
            'cancelConnectMode',
            'paintConnectEligibility',
        ]) {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes(pin), `client script must contain ${pin}`);
        }
    });

    it('routes both pointer and keyboard picks through the same guard', () => {
        const pickCalls = PREVIEW_CLIENT_SCRIPT.split('pickConnectNode(nodeEl)').length - 1;
        assert.ok(pickCalls >= 2, 'connect mode must be operable by pointer and by keyboard');
    });
});

describe('connect mode: Cmd/Ctrl+click accelerator (#66 UAT)', () => {
    it('arms connect mode and picks the source on a modified click', () => {
        // The accelerator is a client-side wiring pin: the handler must call
        // startConnectMode() then pickConnectNode() for a meta/ctrl click, so
        // one modified click sets the source and the next completes the pair.
        const handler = PREVIEW_CLIENT_SCRIPT.slice(
            PREVIEW_CLIENT_SCRIPT.indexOf('function onPointerDown('),
            PREVIEW_CLIENT_SCRIPT.indexOf('function onPointerMove('),
        );
        assert.ok(handler.includes('event.metaKey || event.ctrlKey'), 'must accept Cmd on macOS and Ctrl elsewhere');
        assert.ok(handler.includes('startConnectMode()'), 'a modified click must arm connect mode');
        assert.ok(handler.includes('pickConnectNode(nodeEl)'), 'a modified click must pick the node');
    });

    it('does not collide with Shift multi-select', () => {
        const handler = PREVIEW_CLIENT_SCRIPT.slice(
            PREVIEW_CLIENT_SCRIPT.indexOf('function onPointerDown('),
            PREVIEW_CLIENT_SCRIPT.indexOf('function onPointerMove('),
        );
        const metaAt = handler.indexOf('event.metaKey || event.ctrlKey');
        const shiftAt = handler.indexOf('event.shiftKey');
        assert.ok(metaAt >= 0 && shiftAt >= 0);
        assert.ok(metaAt < shiftAt, 'the modified-click branch must return before the Shift branch runs');
    });

    it('advertises the accelerator in the armed prompt', () => {
        assert.match(connectModePrompt({ phase: 'awaitingSource' }), /Cmd\/Ctrl\+click/);
    });
});

describe('drag coordinate frame (UAT: node accelerates away and the diagram zooms out)', () => {
    // expandCanvasForNode() mutates the viewBox and the svg element's size
    // while the pointer is still down. Re-reading getScreenCTM() on each move
    // then measures the delta against a frame that has already shifted, and
    // because a bigger delta triggers a bigger expansion the error compounds.
    it('captures an inverse CTM at pointerdown and reuses it for every move', () => {
        assert.ok(
            PREVIEW_CLIENT_SCRIPT.includes('function captureDragFrame(svg)'),
            'the drag frame must be captured once, at pointerdown',
        );
        const frozenMoves = PREVIEW_CLIENT_SCRIPT.split('svgPoint(event, dragState.svg, dragState.ctmInverse)').length - 1;
        assert.strictEqual(frozenMoves, 2, 'both the node drag and the boundary drag must use the frozen frame');
    });

    it('never re-reads the live CTM during a drag', () => {
        assert.ok(
            !PREVIEW_CLIENT_SCRIPT.includes('svgPoint(event, dragState.svg)'),
            'a bare svgPoint() in a move handler reintroduces the runaway drag',
        );
    });
});
