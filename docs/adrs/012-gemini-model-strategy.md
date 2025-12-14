# ADR 012: Gemini Model Strategy (v1.1.5)

**Date**: 2025-12-12
**Status**: Adopted

## Context
The C4X extension integrates Google's Gemini AI to provide intelligent architectural diagram generation. We need to select the most capable models to ensure high-quality C4 DSL output while maintaining reliability.

## Decision
We will configure the `GeminiService` to use the following model priority:

1.  **Primary Model**: `gemini-3-pro-preview` (Default)
    *   **Reasoning**: Offers cutting-edge reasoning capabilities suited for complex architectural analysis and DSL generation.
    *   **Note**: As a preview model, it may have rate limits or stability variances, necessitating a strong fallback.

2.  **Fallback Model**: `gemini-2.5-pro`
    *   **Reasoning**: A stable, production-ready model with excellent code generation capabilities. Used automatically if the primary model fails or encounters syntax validation exhaustion.

## Implementation Standard
- All AI prompts must be compatible with both models.
- The fallback mechanism must be transparent to the user, logged only as a warning/info in the output.
- The `gemini-3-pro-preview` setting will be the hardcoded default in `GeminiService.ts` and VS Code configuration defaults.

## Consequences
- **Positive**: Users get access to the latest AI capabilities by default.
- **Negative**: "Preview" models may be less stable; reliance on fallback logic is critical.
