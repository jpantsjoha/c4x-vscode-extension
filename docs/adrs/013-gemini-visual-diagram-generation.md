# ADR 013: Visual C4 Diagram Generation via Gemini Image Model

**Date**: 2025-12-20
**Status**: Proposed

## Context

The C4X extension currently generates C4 diagrams using the C4X-DSL parser and SVG renderer. While this provides consistent, deterministic output, users have expressed interest in a more visually rich, presentation-ready output that matches the official C4 Model styling.

Google released `gemini-3-pro-image-preview` on December 17, 2025, which is a multimodal model capable of **generating images from text prompts**. This opens the possibility of creating visual C4 diagrams directly from text descriptions without going through the DSL parser.

### Model Capabilities

| Property | Value |
|----------|-------|
| **Model ID** | `gemini-3-pro-image-preview` |
| **Input** | Image + Text |
| **Output** | Image + Text |
| **Image Generation** | ✅ Supported |
| **Input Token Limit** | 65,536 |
| **Output Token Limit** | 32,768 |
| **Thinking** | ✅ Supported |

## Decision

We will add a new menu option **"C4X: Preview - Visual Diagram (Gemini)"** that:

1. Takes the selected text or document context
2. Sends it to `gemini-3-pro-image-preview` with a comprehensive visual design reference
3. Receives a PNG image as output
4. Saves the PNG to the same folder as the markdown file
5. Optionally embeds the image reference into the markdown

### Visual Design Reference

To ensure consistency with the C4 Model specification, we will include reference images in the prompt that demonstrate:

- **Color Coding**: Person (blue), Software System (dark blue), Container (light blue), External (grey)
- **Shape Standards**: Rounded rectangles for systems, stick-figure icons for Person
- **Line Styles**: Solid arrows for sync, dashed for async
- **Legend/Key**: Each diagram type should include a legend explaining the notation
- **Layout**: Top-to-bottom for hierarchy, left-to-right for flows

### Smart Level Detection

The AI will analyze the selected context to determine the appropriate C4 level:

| Signal | Detected Level |
|--------|----------------|
| "users", "external systems", "actors" | **C1 - System Context** |
| "services", "databases", "containers", "APIs" | **C2 - Container** |
| "classes", "modules", "functions", "controllers" | **C3 - Component** |
| "nodes", "pods", "regions", "infrastructure" | **C4 - Deployment** |

## Implementation

### Phase 1: Proof of Concept
- [x] Add new command `c4x.ai.generateVisualDiagram`
- [x] Create visual design system prompt with reference images
- [x] Implement PNG output handling
- [x] Auto-embed image in markdown

### Phase 2: Refined Strategy (v1.2.4+)
- [x] **Dual Grounding**: Inject BOTH the reference diagram (`[Level].png`) and the visual key (`[Level]-key.png`) to ensure model mimics both layout and coloring/legend.
- [x] **Strict Guidelines**: Hardcode "Expert Visual Architect" rules into the prompt (e.g. "Uniform Node Sizing", "Ortholinear Arrows").
- [x] **Layout Patterns**: Inject proven layout heuristics (e.g. "Vertical Stack", "Avoid Fan-Out") derived from `GEMINI.md` and `EXAMPLES-LAYOUT.md`.
- [ ] A/B test prompt variations for consistency

## Consequences

### Positive
- **Presentation Ready**: Output is immediately usable in presentations and documents
- **Rich Visuals**: Higher fidelity than SVG renderer for complex diagrams
- **No DSL Knowledge Required**: Users can describe architecture in natural language

### Negative
- **Non-Deterministic**: Same input may produce slightly different outputs
- **API Dependency**: Requires network and API key
- **Cost**: Image generation may have higher token costs
- **Not Editable**: Unlike DSL-based diagrams, PNG output cannot be iteratively edited

## References

- [Google AI Models Documentation](https://ai.google.dev/gemini-api/docs/models#gemini-3-pro-image-preview)
- [C4 Model Specification](https://c4model.com/)
- Reference Images: `examples/SystemContext.png`, `examples/Containers.png`, `examples/Deployment-*.png`
