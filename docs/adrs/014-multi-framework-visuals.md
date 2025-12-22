# ADR 014: Multi-Framework Visual Strategy

**Status**: Accepted
**Date**: 2025-12-21
**Author**: Antigravity (Agent)

## Context
The C4X extension was originally designed to support only the **C4 Model** (Systems, Containers, Components). However, real-world architecture often requires describing **Behavior** (Sequences) and **Processes** (Flowcharts) alongside structure.

Currently, the AI visual generation feature (`gemini-3-pro-image-preview`) is capable of generating any diagram type, but our "Strict C4" DSL (`c4x`) cannot represent flowcharts or generic sequences natively. This limits the AI's utility if we constrain it purely to C4.

## Decision
We will adopt a **Multi-Framework Visual Strategy**:

1.  **Core Framework (Editable)**: **C4 Model** remains the primary, editable framework. Diagrams generated as C4X DSL are fully supported by the extension's language features (syntax highlighting, manual layout).
2.  **Visual-Only Frameworks (PNG)**: We will support specific non-C4 frameworks (**Sequence**, **Flowchart**) for *Visual Generation ONLY*.
    - These diagrams are generated as **PNG images**.
    - They are **NOT** backed by C4X DSL code.
    - They are **NOT** editable via the extension's diagram editor.
    - Updates require regenerating the image from the source text.

## Consequences

### Positive
- **User Utility**: Users can visualize complex logic (loops, decisions) that C4 cannot represent.
- **Flexibility**: The tool becomes a general-purpose "AI Architect Assistant" rather than just a "C4 Tool".
- **Safety**: By keeping non-C4 diagrams as PNGs, we avoid polluting the C4X DSL with invalid syntax (e.g., `Decision()`, `Loop()`).

### Negative
- **"Dead-End" Artifacts**: Users cannot tweak a specific line in a Flowchart PNG. They must edit the prompt/text and regenerate.
- **Inconsistency**: The extension offers deep editing for C4 but only "black-box" generation for Flowcharts.

## Mitigation
- We clearly label these as **"Visual-Only (PNG)"** in documentation.
- We provide **Text-First** editing workflows (edit text -> regenerate).
- We maintain strict **Reference Images** for each framework to ensure high-quality, consistent visual grounding.
