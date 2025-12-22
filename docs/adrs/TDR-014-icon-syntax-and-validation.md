# TDR-014: Icon Syntax, Namespacing & Validation Strategy

## Status
Accepted

## Context
As the C4X extension evolves to support rich visualizations (Phase 19), we introduced extensive support for technology icons (AWS, Azure, GCP, DevIcons). We encountered three main challenges:
1.  **Syntax Ambiguity**: Users and AI models were unsure how to define icons (e.g., `sprite="name"`, `$$sprite`, `icon="name"`).
2.  **Visual Conflicts**: Generic arrow marker IDs (like `arrow-uses`) collided with other extensions in the shared VS Code webview DOM, causing missing arrowheads.
3.  **Validation**: Users experienced "silent failures" where typos in syntax caused parsing errors or invisible icons without feedback.

## Decision

### 1. Standardized Icon Syntax (`$sprite`)
We standardized on the **PlantUML-compatible functional syntax**:
`Container(..., $sprite="icon-name")`

*   **Why `$sprite`?**:
    *   It aligns with standard PlantUML C4 macros, reducing friction for users migrating content.
    *   The `$` prefix clearly distinguishes it as a special property rather than a label or description.
    *   It enables simplified parsing logic (regex or token-based) to extract key-value pairs.

### 2. Namespace Strategy for DOM Elements
We implemented a strict namespacing strategy for all SVG `defs` (definitions) to ensure isolation within the VS Code webview.

*   **Problem**: Other extensions (e.g., Markdown Mermaid, generic graph renderers) also inject SVGs with IDs like `#arrow-head`. The browser/webview resolves the first one found, often leading to invisible or mismatched markers in C4X diagrams.
*   **Solution**: All C4X markers are prefixed with `c4x-`.
    *   `id="c4x-arrow-uses"`
    *   `id="c4x-arrow-async"`
    *   `id="c4x-arrow-sync"`

### 3. Validation Layer
We established a multi-tier validation strategy:
*   **Tier 1: Syntax Validation (Implemented)**
    *   The `C4XParser` and external scripts now explicitly flag incorrect syntax patterns like `sprite="name"` (missing `$`) or `="name"` (missing key).
    *   Error messages guide the user to the correct format: "Invalid Sprite: Found 'sprite='. Use '$sprite='."
*   **Tier 2: Semantic Validation (Planned)**
    *   Future work will validate the *content* of the string against the known `SPRITES` registry.
    *   If a user types `$sprite="unknown-icon"`, the linter will warn: "Icon 'unknown-icon' not found."

## Consequences
*   **Positive**:
    *   Consistent, documented syntax reduces AI hallucinations.
    *   Visual rendering is robust against other extensions.
    *   Users get immediate feedback on common syntax typos.
*   **Negative**:
    *   Slightly more verbose syntax (`$sprite=`) compared to just a positional argument.
    *   Requires strict adherence to the prefix; `sprite=` is now a hard error.

## References
*   [C4-PlantUML Sprite Syntax](https://github.com/plantuml-stdlib/C4-PlantUML)
*   [VS Code Webview Best Practices](https://code.visualstudio.com/api/extension-guides/webview)
