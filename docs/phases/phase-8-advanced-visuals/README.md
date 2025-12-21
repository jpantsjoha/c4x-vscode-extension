# Phase 8: Advanced Visuals (v1.2)

**Goal**: Expand the visual vocabulary to support complex, real-world enterprise architectures.
**Focus**: Deployment, Dynamics, and Customization.

## 🔴 Critical Review & Tech Debt Analysis

1.  **Parser Limitations (The "Flat" Trap)**
    *   **Current State:** Our PEG.js grammar handles `subgraph` (Boundaries), but the internal model largely treats elements as flat lists with `parentId` references.
    *   **Phase 8 Risk:** Deployment diagrams are **deeply recursive** (Region -> Zone -> Cluster -> Node -> Pod -> Container). The current "flat list" approach will make rendering nested SVG coordinates and event handling painful.
    *   **Correction:** We need to formalize a **Tree Structure** in the `C4Model` interface for Deployment Views, rather than just relying on Dagre's `parent` string property.

2.  **Layout Engine (Dagre Dependencies)**
    *   **Current State:** We rely heavily on `dagre`. Dagre is excellent for flowcharts but "finicky" with deep nesting (clusters inside clusters).
    *   **Phase 8 Risk:** Deployment diagrams often break `dagre`'s cluster sizing, leading to overlapping boxes or massive whitespace.
    *   **Correction:** We will need to implement a **Two-Pass Layout** strategy for Deployment diagrams: Layout the *contents* of nodes first, freeze their dimensions, and then layout the *nodes* themselves.

3.  **Visual "Hardcoding"**
    *   **Current State:** `SvgBuilder` has many hardcoded assumptions about element shapes (mostly rectangles).
    *   **Phase 8 Risk:** Deployment Nodes often look like 3D boxes or have specific icons. Dynamic diagrams require numbered edges.
    *   **Correction:** We need a **Renderer Strategy Pattern**. `ElementRenderer` should be an interface with implementations for `PersonRenderer`, `ContainerRenderer`, and new `DeploymentNodeRenderer`.

4.  **Test Coverage Gaps**
    *   **Current State:** High coverage for parsing, good for rendering.
    *   **Phase 8 Risk:** Visual regression testing is manual (looking at the preview). With complex nesting, manual checking fails.
    *   **Correction:** We must lean heavily on the **E2E Visual Validation** (snapshotting SVGs) for every layer of nesting we add.

---

## 🗺️ Phase 8 Execution Plan: Advanced Visuals

We will execute this in **4 Strict Sprints**. We do not move to the next until the documentation and tests for the current are green.

### 🏁 Sprint 8.1: Grammar & Model Expansion (The Foundation)
**Goal:** Extend the DSL to understand "Nodes", "Sprites", and "Dynamic" contexts without breaking v1.0.

- [x] **Task 8.1.1**: Grammar Update (`c4x.pegjs`)
    - [x] Add `Node "Label" "Type" { ... }` syntax support (recursive block parsing).
    - [x] Add Key-Value argument support for elements: `Container(..., $tags="a,b", $sprite="aws")`.
    - [x] Add `Dynamic` view block syntax.
- [x] **Task 8.1.2**: Model Update (`model.ts`)
    - [x] Add `DeploymentNode` interface (extends `C4Container` but with `children` array).
    - [x] Add `sprite` and `tags` properties to base `C4Element`.
- [x] **Task 8.1.3**: Validation
    - [x] **Unit Tests**: `parser.test.ts` must pass with deep nested Node structures.
    - [x] **Docs**: Update `docs/c4x-syntax.md` with the new (yet unrendered) syntax.

### 🎨 Sprint 8.2: Icons & Sprites System
**Goal:** Break the "box monotony" by allowing standard and custom icons.

- [x] **Task 8.2.1**: Asset Management
    - [x] Create `assets/sprites/` folder. (Implemented as `src/assets/icons.ts` for efficiency)
    - [x] Curate a minimal set of open-source tech icons (AWS, Azure, Docker, Database, User).
- [x] **Task 8.2.2**: Renderer Implementation
    - [x] Update `SvgBuilder` to read the `sprite` property.
    - [x] Implement `<image>` injection into the SVG generation logic. (Used SVG paths instead for better styling/coloring)
    - [x] Ensure layout engine accounts for icon size + text padding.
- [x] **Task 8.2.3**: Validation
    - [x] **Visual Test**: Verify an icon sits correctly inside a Person/Container without overlapping text.

### 🏗️ Sprint 8.3: Deployment Diagrams (The Hierarchy)
**Goal:** Visualize infrastructure. This is the hardest part of Phase 8.

- [x] **Task 8.3.1**: Layout Engine Upgrade
    - [x] Implement the "Recursive Cluster" logic in `DagreLayout`.
    - [x] Ensure margins/padding for `Node` elements are larger than simple Containers.
- [x] **Task 8.3.2**: Visual Styling
    - [x] Implement the "3D Box" look (optional, but standard for C4 Deployment) or a distinct border style for Nodes.
- [x] **Task 8.3.3**: Parser Integration
    - [x] Wire up the `Node { ... }` DSL to the new Layout logic.
- [x] **Task 8.3.4**: Validation
    - [x] **Complex Case**: Render a diagram with 3 levels of nesting (Cloud -> Region -> Kubernetes -> Pod).

### 🔄 Sprint 8.4: Dynamic Diagrams (The Flow)
**Goal:** Visualize runtime interactions.

- [x] **Task 8.4.1**: Sequence Logic
    - [x] Implement an auto-numbering system for relationships inside a `Dynamic` view.
    - [x] (e.g., The first relationship defined gets `1:`, the second `2:`).
- [x] **Task 8.4.2**: Edge Rendering
    - [x] Modify `SvgBuilder` to render these numbers prominently on the edges.
    - [x] (Stretch Goal) Highlight the "active path" if selected. (Deferred to v1.3/Interactive)
- [x] **Task 8.4.3**: Validation
    - [x] **Scenario**: Verify a circular flow (A->B->C->A) renders with correct `1`, `2`, `3` sequence labels.

### 📄 Sprint 8.5: Document Export (MD→HTML→PDF)
**Goal**: Enable professional export of markdown documents with embedded C4X diagrams.

- [x] **Task 8.5.1**: HTML Export
    - [x] Implement `HtmlExporter` class with markdown-it integration.
    - [x] Add `@media print` CSS rules for proper diagram rendering.
    - [x] Test standalone HTML rendering in browsers.
- [ ] **Task 8.5.2**: PDF Export (Browser-based)
    - [ ] Implement `PdfExporter` using system print dialog.
    - [ ] Add configuration for page size and margins.
    - [ ] Test on macOS, Windows, Linux.
- [x] **Task 8.5.3**: Context Menu Integration
    - [x] Add "Export HTML" to markdown file context menu.
    - [ ] Add "Export PDF" menu item.
    - [ ] Update user guide documentation.
- [ ] **Task 8.5.4**: (Stretch) Puppeteer PDF
    - [ ] Evaluate bundle size impact (~300KB).
    - [ ] Implement automated PDF generation.
    - [ ] Add configuration option for PDF engine selection.

---

## ✅ Definition of Done for Phase 8

- [ ] **Zero Regressions**: v1.0 diagrams (System Context, Container) render *exactly* as they did before.
- [ ] **Documentation**: `docs/USER-GUIDE.md` has a new chapter "Advanced Diagrams".
- [ ] **Example Gallery**: `EXAMPLES.md` includes a full "AWS Deployment" example.
- [ ] **Tests**: At least 50 new test cases covering the new syntax and rendering logic.
- [x] **Export Feature**: Users can export markdown with embedded diagrams to HTML.
- [ ] **PDF Support**: Users can generate PDFs with properly rendered diagrams (browser-based or Puppeteer).