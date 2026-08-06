# C4X Visual Layout Samples

Welcome to the C4X Visual Layout gallery. This folder contains sample diagrams and sidecar configuration files demonstrating **Visual Layout Mode (v1.6.0)** features in action.

---

## 📂 Samples Included

### 1. C1 Native Metadata Round-Trip
* **File**: [c1-refined-metadata.c4x](./c1-refined-metadata.c4x)
* **What it demonstrates**: Inline C4X coordinate writeback. Movable elements (`customer` and `email`) are saved with `$x` and `$y` metadata in C4X function call format. The `banking` system is marked as `$locked="true"` to prevent automatic layout engines from moving it.

### 2. C2 Nested Boundaries & Overlap Checks
* **File**: [c2-nested-locked.c4x](./c2-nested-locked.c4x)
* **What it demonstrates**: Boundaries (like the `BankingSystem` subgraph) auto-expand dynamically to wrap child elements properly when coordinates are edited. Dragging elements around updates boundaries in real-time.

### 3. C3 Relationship Routing & Overlap Checks
* **File**: [c3-relationship-routing.c4x](./c3-relationship-routing.c4x)
* **What it demonstrates**: Spacing and routing logic. Unlocked elements are nudged apart to prevent overlapping text and bounding boxes. Path connectors adjust bezier coordinates cleanly.

### 4. Structurizr DSL & Sidecar Persistence
* **Files**: [banking-system.dsl](./banking-system.dsl) and [.c4x-layout.json](./.c4x-layout.json)
* **What it demonstrates**: Support for external diagrams. Since Structurizr DSL does not natively support `$x` coordinate metadata, dragging nodes writes their position to the `.c4x-layout.json` sidecar. This keeps original source files clean and compliant.

---

## 🎮 Try it Out

1. **Activate Visual Layout Mode**:
   * Open any of the `.c4x` or `.dsl` files.
   * Open the diagram preview panel.
   * Click **"Edit layout"** in the preview toolbar.
2. **Move Elements**:
   * Select a node using mouse click (solid focus outline).
   * Drag it to a new location.
   * Shift+Arrow keys or standard Arrow keys move elements coarsely (25 units) or finely (10 units) for keyboard-only editing.
3. **Save and Reset**:
   * Note how changes are instantly serialized to the document source code (natively) or the `.c4x-layout.json` file (sidecar).
   * Open the Command Palette (`Ctrl/Cmd+Shift+P`) and type `C4X: Reset Visual Layout` to restore coordinates back to automatic Dagre-layout.
