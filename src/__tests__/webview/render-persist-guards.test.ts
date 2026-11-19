/**
 * Webview-side render/persistence guards (#167 review, second round).
 *
 * Covers the four runtime-boundary defects from the review:
 *
 *  1. `isRenderMessage` now validates `payload.scope` — an unscoped or
 *     malformed render is rejected, and the rejection path leaves both
 *     `currentScope` and the persisted state untouched.
 *  2. `persistState` never writes an unscoped record over a valid draft.
 *  3. `showSvg` releases `renderInFlight` in a `finally`, so a render that
 *     throws mid-way does not suppress persistence for the rest of the
 *     session; the one settled persist runs only after a successful settle.
 *  4. A wheel-zoom debounce pending when a re-render begins is cancelled, so
 *     the durable camera is the applied one — including after a
 *     degenerate-viewport correction.
 *
 * The behavioral guards (`isRenderScopeValue`, `isDraftStateForCurrentScope`)
 * are exported pure functions; the wiring inside the assembled client script
 * is pinned structurally, matching the established webview test style.
 */

import * as assert from 'assert';
import type { PersistedDraftState } from '../../webview/draftState';
import {
    isDraftStateForCurrentScope,
    isRenderScopeValue,
    PREVIEW_CLIENT_SCRIPT,
} from '../../webview/previewClientScript';

// ── Helpers ──────────────────────────────────────────────────────────────────

const SCOPE_A = 'file:///diagram-a.c4x';

function makeValidState(overrides?: Partial<PersistedDraftState>): PersistedDraftState {
    return {
        schemaVersion: 2,
        scope: SCOPE_A,
        editMode: false,
        selectedNodeId: null,
        stagedEdits: [],
        ...overrides,
    };
}

function showSvgBody(): string {
    const showSvg = PREVIEW_CLIENT_SCRIPT.match(
        /function showSvg\(svg, metrics[\s\S]*?\n {4}\}\n/,
    );
    assert.ok(showSvg, 'showSvg is present in the assembled client script');
    return showSvg[0];
}

function persistStateBody(): string {
    const persist = PREVIEW_CLIENT_SCRIPT.match(
        /function persistState\(\) \{([\s\S]*?)\n {4}\}/,
    );
    assert.ok(persist, 'persistState is present in the assembled client script');
    return persist[1];
}

// ── isRenderScopeValue — the scope field at the runtime boundary ─────────────

describe('isRenderScopeValue — render payload scope validation (#167 review)', () => {
    it('accepts a non-empty bounded string', () => {
        assert.strictEqual(isRenderScopeValue(SCOPE_A), true);
        assert.strictEqual(isRenderScopeValue('file:///doc.md#c4x-fence:abc123:def456'), true);
    });

    it('rejects a missing scope', () => {
        assert.strictEqual(isRenderScopeValue(undefined), false);
        assert.strictEqual(isRenderScopeValue(null), false);
    });

    it('rejects a scope of the wrong type', () => {
        assert.strictEqual(isRenderScopeValue(42), false);
        assert.strictEqual(isRenderScopeValue({ uri: 'file:///x.c4x' }), false);
        assert.strictEqual(isRenderScopeValue(['file:///x.c4x']), false);
    });

    it('rejects an empty or whitespace-only scope', () => {
        assert.strictEqual(isRenderScopeValue(''), false);
        assert.strictEqual(isRenderScopeValue('   '), false);
    });

    it('rejects an unbounded scope', () => {
        assert.strictEqual(isRenderScopeValue('x'.repeat(2049)), false);
    });

    it('is wired into isRenderMessage in the assembled client script', () => {
        const guard = PREVIEW_CLIENT_SCRIPT.match(
            /function isRenderMessage\(message\) \{([\s\S]*?)\n {4}\}/,
        );
        assert.ok(guard, 'isRenderMessage is present in the assembled client script');
        assert.match(guard[1], /isRenderScopeValue\(message\.payload\.scope\)/);
    });

    it('a rejected render leaves currentScope and persisted state untouched', () => {
        // The only assignment of currentScope in the whole client script sits
        // inside the isRenderMessage branch; the invalid-render fallback shows
        // an error and returns without touching scope or vscode.setState.
        const handler = PREVIEW_CLIENT_SCRIPT.match(
            /window\.addEventListener\('message'[\s\S]*$/,
        );
        assert.ok(handler, 'the message handler is present in the assembled client script');
        const branch = handler[0].match(/if \(isRenderMessage\(message\)\) \{([\s\S]*?)\n {6}\}/);
        assert.ok(branch, 'the accepted-render branch is present');
        assert.match(branch[1], /currentScope = message\.payload\.scope;/);
        const fallback = handler[0].match(/if \(message && message\.type === 'render'\) \{([\s\S]*?)\n {6}\}/);
        assert.ok(fallback, 'the rejected-render fallback branch is present');
        assert.match(fallback[1], /showError\(/);
        assert.ok(!fallback[1].includes('currentScope'), 'the fallback must not touch currentScope');
        assert.ok(!fallback[1].includes('setState'), 'the fallback must not touch persisted state');
    });
});

// ── persistState — never write an unscoped record ────────────────────────────

describe('persistState — scope guard (#167 review)', () => {
    it('refuses to persist without a valid current scope', () => {
        const body = persistStateBody();
        const renderGuard = body.indexOf('if (renderInFlight) {');
        const scopeGuard = body.indexOf('if (!isRenderScopeValue(currentScope)) {');
        const write = body.indexOf('vscode.setState({');
        assert.ok(renderGuard !== -1 && scopeGuard !== -1 && write !== -1,
            'persistState keeps both guards and the write');
        assert.ok(scopeGuard > renderGuard && scopeGuard < write,
            'the scope guard sits between the render guard and the write');
    });
});

// ── showSvg — renderInFlight released in a finally ───────────────────────────

describe('render persist suspension — finally release (#167 review)', () => {
    it('wraps the render body so the flag is always released', () => {
        const body = showSvgBody();
        const suspendAt = body.indexOf('renderInFlight = true;');
        const tryAt = body.indexOf('try {');
        const finallyAt = body.indexOf('} finally {');
        const releaseAt = body.lastIndexOf('renderInFlight = false;');
        assert.ok(suspendAt !== -1 && tryAt !== -1 && finallyAt !== -1 && releaseAt !== -1,
            'showSvg wraps the render in try/finally');
        assert.ok(suspendAt < tryAt && tryAt < finallyAt && finallyAt < releaseAt,
            'the release lives in the finally, after the render body');
    });

    it('persists only after the render has actually settled successfully', () => {
        const body = showSvgBody();
        const settledFlagAt = body.indexOf('renderSettled = true;');
        const finallyAt = body.indexOf('} finally {');
        const finalPersistAt = body.lastIndexOf('persistState();');
        // #340: a render that keeps a restored draft back for the edit layout also skips it.
        const gatedPersist = /if \(renderSettled && !restoreDeferred\) \{\s*persistState\(\);\s*\}/.test(body);
        assert.ok(settledFlagAt !== -1 && settledFlagAt < finallyAt,
            'the settled flag is set at the end of the try body');
        assert.ok(gatedPersist, 'the settled persist is gated on renderSettled');
        assert.ok(finalPersistAt > finallyAt, 'the settled persist runs after the finally');
    });

    it('a throw before settle skips the persist but still releases the flag', () => {
        // Structural reading of the control flow: every statement between
        // `try {` and `renderSettled = true;` can throw; the finally still
        // runs, and the persist is skipped because the flag was never set.
        const body = showSvgBody();
        const tryAt = body.indexOf('try {');
        const settledFlagAt = body.indexOf('renderSettled = true;');
        const slice = body.slice(tryAt, settledFlagAt);
        assert.ok(slice.includes('stagedEdits = {};'), 'staging is cleared inside the try');
        assert.ok(slice.indexOf('persistState();') === -1,
            'no persist runs inside the render body');
    });
});

// ── showSvg — pending wheel debounce cancelled at render start ───────────────

describe('camera debounce cancellation at render start (#167 review)', () => {
    it('cancels a pending debounce before the render re-derives the camera', () => {
        const body = showSvgBody();
        const suspendAt = body.indexOf('renderInFlight = true;');
        const cancelAt = body.indexOf('cancelPendingCameraPersist();');
        const clearAt = body.indexOf('stagedEdits = {};');
        const finalPersistAt = body.lastIndexOf('persistState();');
        assert.ok(cancelAt !== -1, 'showSvg cancels the pending camera debounce');
        assert.ok(suspendAt < cancelAt && cancelAt < clearAt,
            'the cancellation runs at render start, before staging is cleared');
        assert.ok(cancelAt < finalPersistAt,
            'the only camera write left standing is the settled persist');
    });

    it('the cancel helper actually clears the timer', () => {
        const helper = PREVIEW_CLIENT_SCRIPT.match(
            /function cancelPendingCameraPersist\(\) \{([\s\S]*?)\n {4}\}/,
        );
        assert.ok(helper, 'cancelPendingCameraPersist is present in the assembled client script');
        assert.match(helper[1], /clearTimeout\(cameraPersistTimer\)/);
        assert.match(helper[1], /cameraPersistTimer = null;/);
    });

    it('a degenerate-viewport correction persists the camera it applied', () => {
        // When the viewport only gains a size after the render, the observer
        // re-applies the opening framing — which REPLACES the camera the
        // settled persist wrote. That corrected camera must become durable.
        const observer = PREVIEW_CLIENT_SCRIPT.match(
            /viewportResizeObserver = new ResizeObserver\(function\(\) \{([\s\S]*?)\n {6}\}\);/,
        );
        assert.ok(observer, 'the viewport resize observer is present in the assembled client script');
        const reApplyAt = observer[1].indexOf('applyOpeningCamera();');
        const persistAt = observer[1].indexOf('persistState();');
        assert.ok(reApplyAt !== -1 && persistAt !== -1 && persistAt > reApplyAt,
            'the corrected framing is persisted, so durable camera equals applied camera');
    });
});

// ── isDraftStateForCurrentScope — ambiguous fence identity ──────────────────

describe('isDraftStateForCurrentScope — ambiguous fence scope (#167 review)', () => {
    const AMBIGUOUS = 'file:///doc.md#c4x-fence-ambiguous:aaaa:bbbb';

    it('rejects a draft even when the ambiguous scope matches exactly', () => {
        const draft = makeValidState({ scope: AMBIGUOUS });
        assert.strictEqual(isDraftStateForCurrentScope(draft, AMBIGUOUS), false,
            'an ambiguous binding must discard the draft, not pick one of the twins');
    });

    it('still accepts a stable matching scope', () => {
        const stable = 'file:///doc.md#c4x-fence:aaaa:bbbb';
        assert.strictEqual(isDraftStateForCurrentScope(makeValidState({ scope: stable }), stable), true);
        assert.strictEqual(isDraftStateForCurrentScope(makeValidState(), SCOPE_A), true);
    });

    it('still rejects a missing current scope', () => {
        assert.strictEqual(isDraftStateForCurrentScope(makeValidState(), undefined), false);
    });
});
