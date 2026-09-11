// @skip-reason: DEBT-011 — FallbackStrategy model elevation test quarantined
//
// After the WS-5 refactoring, generateWithFallback() was extracted from GeminiService
// to FallbackStrategy.ts as a standalone function. The fallback logic now reads the
// primary model name from vscode.workspace.getConfiguration('c4x.ai') rather than
// from the injected model instance. This means mocking the model on GeminiService
// and asserting which models were requested no longer tests the actual fallback path.
//
// To properly test this:
// 1. Use vscode.workspace.getConfiguration() to set c4x.ai.model to a failing model
// 2. Or test FallbackStrategy.generateWithFallback() directly with proper mocks
// 3. Or create a dedicated unit test for FallbackStrategy with a mock vscode module
//
// Previous test locations:
// - test/integration/GeminiCorrection.test.ts: 'Should fallback to gemini-3.1-pro-preview if user model fails'
// - test/integration/GeminiService.test.ts: 'Should fallback to gemini-3.1-pro-preview if user model fails'
//
// Both were removed as part of DEBT-011 triage. This file documents what needs to be
// rebuilt when the fallback strategy gets dedicated unit tests (tracked as future work).

import * as assert from 'assert';

describe.skip('FallbackStrategy — Model Elevation (QUARANTINED)', function () {
    // @skip-reason: DEBT-011 — Requires refactored test approach to mock vscode.workspace.getConfiguration
    // See quarantine notes above for migration plan.

    it('Should elevate from user model to DEFAULT_MODEL on failure', async () => {
        // TODO: Test that when user's configured model fails,
        // generateWithFallback tries DEFAULT_MODEL next.
        assert.ok(false, 'Not implemented — see quarantine notes');
    });

    it('Should fall to FLASH_MODEL when already on DEFAULT_MODEL', async () => {
        // TODO: Test that when DEFAULT_MODEL is the primary and it fails,
        // generateWithFallback tries FLASH_MODEL.
        assert.ok(false, 'Not implemented — see quarantine notes');
    });

    it('Should throw clear error when all models fail', async () => {
        // TODO: Test the final error message includes model name and guidance URL.
        assert.ok(false, 'Not implemented — see quarantine notes');
    });
});
