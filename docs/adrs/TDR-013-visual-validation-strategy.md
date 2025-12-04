# TDR-013: Visual Validation Strategy

## Context
Visual regression testing for diagramming tools is notoriously difficult. Standard unit tests check code logic, but they don't guarantee that the final image "looks right" to a human. We encountered significant issues where unit tests passed, but the rendered arrows were misaligned (e.g., originating from the side of a box instead of the bottom) or the style was visually incorrect.

We needed a way to:
1.  Rigorously verify that arrow routing logic produces "clean" lines (straight, orthogonal).
2.  Ensure that visual changes (colors, shapes) are deliberate and tracked.
3.  Shorten the feedback loop for visual bugs.

## Decision
We have adopted a **Generated Gallery + Geometric Analysis** strategy for visual validation.

### 1. Validation Gallery
We maintain a central gallery file (`docs/validation/GALLERY.md`) containing diverse C4 diagram scenarios:
- **Happy Paths**: Simple Vertical, Horizontal stacks.
- **Stress Tests**: Fan-in, Fan-out, Cycles, Nested Boundaries.
- **Edge Cases**: Complex multi-hop routing.

### 2. Automated Validation Script
We implemented a script (`scripts/validate-gallery.ts`) that runs as part of the development workflow. This script:
1.  **Parses & Renders**: Compiles the gallery examples into actual SVGs using the current codebase.
2.  **Geometric Analysis**: Instead of just comparing pixels (which is brittle), it parses the generated SVG paths (`d="M x,y L x,y"`) and asserts geometric properties.
    *   *Example Assertion*: "For a vertical stack where Box A is above Box B, the arrow MUST originate from the Bottom-Center of A (within a small tolerance)."
3.  **Report Generation**: It generates a visual HTML report (`docs/validation/report.html`) embedding the actual SVGs alongside pass/fail status.

### 3. Workflow Integration
- **Local Development**: Developers run `npx ts-node scripts/validate-gallery.ts` to verify layout changes immediately.
- **Documentation**: The generated report serves as "living documentation" of the renderer's capabilities.

## Consequences
### Positive
- **Confidence**: We can refactor the layout engine with high confidence that we haven't broken the "straightness" of arrows.
- **Visibility**: The HTML report provides an immediate, visual way to inspect the output of 7+ scenarios at once.
- **Robustness**: Geometric assertions are more robust than pixel-snapshotting (which breaks with minor anti-aliasing changes) but stricter than simple "does it run" tests.

### Negative
- **Maintenance**: The validation logic (geometric assertions) needs to be updated if we fundamentally change the layout strategy (e.g., switching to orthogonal edge routing vs. direct lines).

## Status
Accepted and Implemented in v0.1.2.
