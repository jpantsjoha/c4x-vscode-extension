# Phase 10: Future Proofing & Technical Debt Paydown

**Objective**: Solidify the foundation of C4X by paying down technical debt, ensuring 100% CI reliability, and preparing the architecture for v1.2/v2.0 features.

## 🎯 Goals

1.  **Test Suite Hygiene**: Achieve a "Zero Noise" test run. Every failure must be a real regression.
2.  **Architecture Robustness**: Move synchronous blocking operations (Markdown parsing) to async patterns.
3.  **Visual Consistency**: Refine "Smart Layout" heuristics for smaller diagrams.
4.  **Feature Parity**: Restore and stabilize PlantUML support.

## 📋 execution Plan

### 1. Test Suite Hygiene (DEBT-011)
*   **Current State**: ~48 failing tests in `npm test` (Legacy PlantUML/Phase 8 exports).
*   **Action**:
    *   Audit all 48 failures.
    *   **Fix**: Trivial path/config errors.
    *   **Delete**: Obsolete tests for features replaced by new engines.
    *   **Quarantine**: Move flaky external-dependency tests to a separate job.
*   **Definition of Done**: `npm test` runs 100% green locally and in CI.

### 2. Markdown Async Integration (DEBT-001)
*   **Current State**: The MarkdownIt plugin renders synchronously. Large diagrams (>100 nodes) could freeze the UI frame.
*   **Action**:
    *   Refactor `c4xPlugin.ts` to use `process.nextTick` or Worker threads if possible (constrained by VS Code extension host).
    *   Implement a "Loading..." placeholder state in the preview.
*   **Definition of Done**: Large mock diagrams render without blocking the editor typing.

### 3. Layout Adherence 2.0 (DEBT-010)
*   **Current State**: Gemini sometimes over-optimizes small layouts, or `Dagre` layout spreads "wide" graphs too thin.
*   **Action**:
    *   **Heuristic Tuning**: If node_count < 5, enforce `TB` unless explicitly `LR`.
    *   **"Loose Mode"**: Add setting `c4x.layout.strictMode: false` to allow non-C4 nodes (e.g., "Notes" or standard Markdown blocks) to pass through.

### 4. Parser Robustness
*   **Current State**: PlantUML parser is disabled/unverified. Structurizr parser has grammar quirks.
*   **Action**:
    *   Re-run PlantUML validation suite.
    *   Fix `Structurizr` string identifier parsing rules in `c4x.pegjs`.

## 📅 Roadmap

| Step | Task | Estimate |
|------|------|----------|
| 1 | Test Audit & Cleanup | 1 Day |
| 2 | Async Markdown Refactor | 1 Day |
| 3 | Layout Heuristics | 0.5 Day |
| 4 | Parser Fixes | 1 Day |

---
**Branch**: `phase/10-future-proofing`
