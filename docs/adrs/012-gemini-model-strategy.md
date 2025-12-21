# ADR 012: Gemini Model Strategy (v1.2.0)

**Date**: 2025-12-19
**Status**: Adopted (Updated)

## Context
The C4X extension integrates Google's Gemini AI to provide intelligent architectural diagram generation. We need to select the most capable models to ensure high-quality C4 DSL output while maintaining reliability.

**Update (2025-12-19)**: Google released Gemini 3 Flash on December 17, 2025, offering pro-grade reasoning at 3x Flash speed with lower cost. This model is ideal for diagram generation workflows.

## Decision
We will configure the `GeminiService` to use the following model priority:

1.  **Primary Model**: `gemini-3-flash-preview` (Default)
    *   **Reasoning**: Pro-grade reasoning at Flash-level speed. 3x faster than previous models with improved multimodal understanding and reliability.
    *   **Cost**: $0.50/1M input tokens, $3/1M output tokens (lower than Pro).
    *   **Note**: As a preview model, it may have rate limits or stability variances, necessitating a strong fallback.

2.  **Fallback Model**: `gemini-3-pro-preview`
    *   **Reasoning**: Stable Pro-tier model with excellent code generation and reasoning capabilities. Used automatically if the primary model fails or encounters syntax validation exhaustion.

## Implementation Standard
- All AI prompts must be compatible with both models.
- The fallback mechanism must be transparent to the user, logged only as a warning/info in the output.
- The `gemini-3-flash-preview` setting will be the hardcoded default in `GeminiService.ts` and VS Code configuration defaults.
- **Self-Correction & Resilience**:
  - The system implements a **3-try self-correction loop**.
  - If `C4XParser` detects a syntax error, the extension automatically re-prompts the AI with the specific error message and the failed code block.
  - **Specific Fixes**: The re-prompt includes targeted advice for common issues (e.g., `subgraph ID {` syntax, missing braces, directive placement).
  - This ensures high reliability even if the model initially produces slightly malformed syntax.

## Consequences
- **Positive**: Users get faster AI generation with state-of-the-art capabilities by default.
- **Positive**: Lower cost per token compared to Pro models.
- **Negative**: "Preview" models may be less stable; reliance on fallback logic is critical.
