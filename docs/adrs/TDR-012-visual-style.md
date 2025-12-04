# TDR-012: Visual Style and Layout Strategy

## Context
The initial visual implementation of the C4 model extension used a custom color palette and a flexible arrow routing strategy. Feedback and self-assessment indicated that the visuals felt "outdated" compared to modern tools and the official [c4model.com](https://c4model.com) examples. Specifically:
- Colors were generic and did not match the official C4 notation.
- Elements lacked depth (flat design).
- Arrow routing was inconsistent, connecting to arbitrary points along edges, leading to a "messy" look.
- Text containment was a concern.

## Decision
We have decided to strictly adopt the official C4 model visual guidelines and a "clean" routing strategy for the v1.0 release (refined in v0.1.2).

### 1. Official Color Palette & Styling
We will use the specific style from the official C4 model documentation (2024 refresh):
- **Style**: White-filled boxes with colored borders (instead of solid filled boxes).
- **Colors**:
    - **Person**: White fill, `#438DD5` border (Blue).
    - **Software System**: White fill, `#1168BD` border (Dark Blue).
    - **Container**: White fill, `#438DD5` border (Light Blue).
    - **Component**: White fill, `#85BBF0` border (Pale Blue).
    - **External Elements**: White fill, `#999999` border (Grey).

### 2. Visual Depth (Shadows)
To modernize the look, we will implement drop shadows for all node elements.
- **Implementation**: SVG filters (`<filter id="drop-shadow">`) defined in `SvgBuilder.ts`.
- **Configuration**: Controlled via `theme.styles.shadowEnabled` property.

### 3. Layout and Routing (Refined)
To address the "messy arrows" issue, we enforce a strict **Centralized Edge Snapping** strategy with **Directional Flow Bias**.
- **Logic**: Arrows must connect to the **geometric center** of the nearest edge (Top, Bottom, Left, Right) of the target box.
- **Refinement (v0.1.2)**: The routing logic was updated to **prioritize** opposing edges (e.g., Bottom -> Top) when they match the logical flow (e.g., Source is above Target). Previous logic penalized this, causing "diagonal" arrows from the side.
- **Rationale**: This produces significantly cleaner, more orthogonal-looking diagrams that are easier to read and follow the natural reading order.

### 4. Typography & Iconography
- **Font**: `Helvetica, Arial, sans-serif` (Universal, clean, professional).
- **Icons**: "Person" elements now include a standard stick-figure SVG icon for immediate recognition.
- **Arrows**: Relationships now use **filled** (solid), smaller (8x6) arrowheads instead of large hollow ones, reducing visual clutter in complex diagrams.

## Consequences
### Positive
- **Professionalism**: The output looks like a serious architecture tool, matching industry standards.
- **Readability**: Centralized routing and filled arrows reduce visual noise.
- **Consistency**: Diagrams look uniform regardless of complexity.

### Negative
- **Flexibility**: Users cannot manually drag arrow connection points (auto-layout only).
- **Complexity**: SVG filter implementation adds slight complexity to the rendering pipeline.

## Status
Accepted and Implemented in v1.0 (Refined in v0.1.2).