# TDR-015: Externalized AI System Prompt Strategy

## Status
Accepted

## Context
As the C4X extension integrates Generative AI (Gemini), the quality of the generated diagrams depends entirely on the "System Prompt" given to the model.
Hardcoding this prompt into the TypeScript source (`GeminiService.ts`) makes it difficult to:
1.  **Iterate**: Changing the prompt requires a full extension rebuild and release.
2.  **Test**: We cannot easily use the prompt in external tools like `geminicli` or AI Studio to verify behavior.
3.  **Customize**: Users/Teams may have specific architectural styles they want the AI to adopt, which a hardcoded prompt prevents.

## Decision
We have decided to externalize the System Prompt into a standalone Markdown file: **`GEMINI.md`**.

### 1. `GEMINI.md` is the Source of Truth
*   The file `GEMINI.md` located in the extension's root directory defines the persona, rules, syntax, and examples for the AI.
*   **During Runtime**: The extension attempts to read this file from the Workspace Root first, then falls back to the Extension's built-in version.
*   **Parity**: The hardcoded string in `GeminiService.ts` is strictly a **fallback** mechanism (in case file reading fails) and must be kept in sync with `GEMINI.md`.

### 2. User Customization
*   Users can override the AI's behavior by placing a `GEMINI.md` file in their own workspace root.
*   This allows teams to enforce specific C4 tagging rules, naming conventions, or style guides without waiting for an extension update.

### 3. Testing
*   Developers can copy the content of `GEMINI.md` directly into AI Studio or specific testing tools to validate prompt logic (e.g., "Graceful Degradation" of icons) before committing changes.

## Consequences
*   **Positive**:
    *   Faster iteration on prompt engineering.
    *   Empowers users to customize the "AI Architect".
    *   Enables external testing workflows.
*   **Negative**:
    *   Requires discipline to keep the hardcoded fallback in `GeminiService.ts` synchronized with `GEMINI.md` for the default experience.

## References
*   [GeminiService.ts](../../src/ai/GeminiService.ts) (Implementation)
*   [GEMINI.md](../../GEMINI.md) (The Prompt)
