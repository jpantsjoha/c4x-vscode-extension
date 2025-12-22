# 12. Gemini Selection Logic & Model Fallback

Date: 2025-12-11
Status: Accepted

## Context

As the C4X extension evolves into an "AI Architect" tool, users require more granular control over what context is sent to the AI. Generating diagrams from the entire folder structure is powerful but often overwhelming or irrelevant for specific tasks. Users often want to visualize a specific snippet, function, or architectural proposal described in text.

Additionally, the availability of cutting-edge models (like `gemini-3-preview`) can be intermittent, while older models (`gemini-2.5-pro`) are more stable. To provide a "Gold Standard" verification experience, the AI must also strictly adhere to C4 layout rules, which relies heavily on the quality and persistence of the System Prompt.

## Decision

We have decided to implement the following architectural enhancements:

1.  **Context-Aware Generation ("Visualise from Selection")**:
    -   We implemented a `generateFromSelection` command.
    -   This creates a **Virtual File Context** containing only the selected text, labeled as `Selected_Context_from_[Filename]`.
    -   This allows precise, targeted diagram generation without noisy folder context.

2.  **Robust Model Fallback Strategy**:
    -   **Primary**: Default to `gemini-3-preview` for state-of-the-art reasoning.
    -   **Fallback**: If the primary model fails (404, 500, or API error), the system automatically retries with `gemini-2.5-pro`.
    -   This is handled transparently within `GeminiService.ts`.

    -   This ensures that critical layout rules (Execution Order, Subgraph Containment, Vertical Chaining) are *always* present in the System Prompt.

3.  **Smart Context Tuning (Depth vs. Level)**:
    -   We tuned the RAG retrieval depth based on the abstraction level to balance "Discovery" vs. "Focus".
    -   **System Context (C1)**: **Depth 2** (`*/*/*`). *Reasoning*: Integration points (StripeClient, Adapters) are rarely at the root; we need a "wide net" to discover external systems.
    -   **Container (C2)**: **Depth 1** (`*/*`). *Reasoning*: Containers usually map to top-level folders. Reading deeper files introduces irrelevant implementation details that cause hallucinations.
    -   **Component (C3)**: **Depth 1 (Local)**. *Reasoning*: Components are implementation details within a boundary; broad context is distracting.

4.  **Intelligent Diagram Recommendations**:
    -   **Problem**: Users found the static list of diagram types (C1, C2, C3) confusing or requiring too much cognitive load to choose.
    -   **Solution**: We added a "Pre-Flight" analysis step where Gemini analyzes the selected text *before* showing the menu.
    -   **Logic**:
        -   Start of text describes "external systems" -> Suggest **C1**.
        -   Text contains `class`, `function` -> Suggest **C3**.
        -   The menu is dynamically reordered to show the recommended option at the top with a ⭐ icon.

5.  **Smart Layout Heuristics (Orientation Tuning)**:
    -   **Problem**: Diagrams often generated as Vertical stacks even for simple linear flows (e.g., `A -> B -> C`), wasting screen space.
    -   **Solution**: We tuned the System Prompt to adhere to "Smart Visuals":
        -   **Respect Input**: Match the visual orientation (LR vs TB) if the user provides ASCII art.
        -   **4-Node Rule**: If the diagram has ≤ 4 nodes, PREFER `graph LR` (Horizontal). This optimizes screen real estate.
        -   **Large Diagrams**: If > 4 nodes, PREFER `graph TB` (Vertical) to prevent horizontal scrolling.

## Consequences

### Positive
-   **UX**: Users can now right-click text to visualize it, enabling "Exploratory Coding".
-   **Reliability**: Extension keeps working even if the Preview model is down or the user messes up their workspace configuration.
-   **Consistency**: Generated diagrams will consistently follow C4 standards thanks to the embedded prompt.

### Negative
-   **Maintenance**: If C4X standards change, we must update both `GEMINI.md` (user documentation) and `GeminiService.ts` (compiled code).
-   **Latency**: Fallback mechanism adds latency if the primary model fails (1 failed request + 1 success request).

## Implementation Details

-   **Command**: `c4x.ai.generateFromSelection` registered in `package.json` menu.
-   **Service**: `GeminiService.ts` updated with `DEFAULT_GUIDELINES` constant.
-   **Testing**: Integration tests added to verify Fallback logic and Sanitization.
