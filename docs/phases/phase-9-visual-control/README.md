# Phase 9: Visual Control & Interactivity

**Goal**: Empower users with precise control over diagram presentation and interactive exploration.

## 🎯 Objectives

### 1. Visual Size Override
**Context**: Diagrams can sometimes be too large or too small for the designated area in a markdown document.
**Feature**: Support attributes in the code block fence to control size.
**Syntax**:
````markdown
```c4x width=50%
...
```
````
````markdown
```c4x scale=0.8
...
```
````

### 2. Click-to-Zoom (Lightbox)
**Context**: Complex diagrams need to be viewed in full screen details.
**Feature**: Clicking a diagram in the markdown preview opens a lightbox/modal with the full-size SVG.

### 3. Layout Guidance
**Context**: Users act unsure about how to control the direction of the diagram.
**Feature**: Clear documentation and validation hints for `graph TB` vs `graph LR`.

### 4. Direction Control (Nested)
**Context**: Complex systems often have horizontal flows inside vertical hierarchies.
**Feature**: Support `direction LR` statements inside `subgraph` blocks.

### 5. Manual Positioning
**Context**: Auto-layout sometimes puts elements in awkward places.
**Feature**: Support explicit positioning hints or coordinate overrides.
