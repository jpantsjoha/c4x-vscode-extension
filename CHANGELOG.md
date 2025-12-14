# Change Log

All notable changes to the "c4x" extension will be documented in this file.

## [1.0.9] - 2025-12-08
## [1.1.6]
### Added
- **Intelligent Icon Integration (AI)**: The Gemini Agent now automatically detects and applies correct technology icons (AWS, Azure, GCP, etc.) using the `$sprite` syntax.
- **Icon Autocomplete**: Added IntelliSense for `sprite="..."` values. Just type `sprite="` to see available icons.
- **Rich Icon Support**: Full support for PlantUML-style `Container(..., $sprite="...")` macro syntax in C4X DSL.

## [1.1.0] - 2025-12-09
### 📐 Advanced Layout Control (Phase 9)
- **Recursive Layout Engine**: Completely rewritten layout engine to support hierarchical, independent sub-layouts.
- **Nested Direction**: Support for `direction LR` inside subgraphs allows mixed-orientation diagrams (e.g. Horizontal Flows inside Vertical Systems).
- **Manual Positioning**: New `$x` and `$y` attributes for pixel-perfect element positioning (e.g., `Component(..., $x="100", $y="200")`).

### 🧠 Gemini AI Architect (Phase 10)
- **Text-to-Diagram**: Generate complete C4 architectures from your source code using Google Gemini.
- **Auto-Detection**: Right-click any folder or markdown file to analyze code and detect technologies (React, AWS, etc.).
- **Smart Syntax**: Outputs valid C4X DSL automatically.

### 🖱️ Visual Interactivity
- **Click-to-Zoom**: Diagrams in Markdown preview now support lightbox zooming for detailed inspection.
- **Visual Size Overrides**: Support for `width`, `height`, and `scale` attributes on code blocks.

### 🚀 New Features
- **PlantUML Support**: Native rendering of standard PlantUML C4 syntax in markdown.
- **PDF Export**: Browser-based print preview for high-fidelity PDF generation (`C4X: Export - Preview`).
- **Marketing Example**: New multi-agent system example added to gallery.

### 📝 Documentation
- Added `EXAMPLES-PLANTUML.md` to showcase PlantUML compatibility.

## [1.1.9] - 2025-12-13
### 🔧 Reliability & Rendering
- **Edge-to-Edge Routing**: Fixed a critical rendering issue where arrows would route "Center-to-Center" in complex diagrams, obscuring arrowheads behind boxes. The renderer now forces optimal edge connections for all diagram types for crystal clear visibility.
- **Strict Syntax**: The parser now enforces strict `$sprite` syntax, preventing "hallucinated" icons and ensuring diagrams always render predictably.
- **Performance**: Optimized asset loading, removing ~800 unused files and reducing VSIX size by 2MB.

### 📝 Documentation & Assets
- **Verified Icon Library**: Updated `EXAMPLES-with-ICONS.md` with fully validated keys for AWS, GCP, and Azure.
- **New GCP Icons**: Added 44+ high-quality Google Cloud icons including `vertexai`, `cloudrun`, and `cloudsql`.
- **Docs Parity**: Synchronized `GEMINI.md` and `GEMINI_GUIDE.md` to match the internal AI logic perfectly.

## [1.1.8] - 2025-12-13
### Fixed
- 🐛 **Visual Rendering**: Fixed missing arrowheaders by namespacing SVG marker IDs (`c4x-arrow-...`) to prevent DOM collisions with other extensions.
- 🔧 **Icon Library**: Added missing `react` icon and fixed aliases for `gcp-vertex-ai`.
- 📝 **Docs**: Fixed parse errors in example files and consolidated documentation.

### Changed
- **AI Reliability Restore**: Reverted default model to `gemini-2.5-pro` (Primary) for stability.
- **Improved Performance**: Removed massive icon payload from AI prompts to reduce token usage and confusion.
- **Smart Fallback**: `gemini-3-pro-preview` is now the backup model.
- 🐛 **AI Syntax Correction**: Updated Gemini prompt to strictly enforce `$sprite` syntax and explicitly forbid improper `="value"` assignments.
- 🔧 **Icon Reliability**: Improved instructions for `c4xicons` namespace usage to prevent hallucinated icon names.

## [1.1.6] - 2025-12-12
### Added
- 🧠 **Gemini 3 Pro Preview**: Defaulted AI model to `gemini-3-pro-preview` for state-of-the-art reasoning.
- 🎨 **Smart C4X Icons**: New `c4xicons` namespace syntax (e.g., `sprite="c4xicons.aws.s3-bucket"`) for cleaner code.
- 🧩 **Enhanced Autocomplete**: Intelligent suggestions for namespaces and icon names.
- 🛡️ **Robust Fallback**: Automatic fallback to `gemini-2.5-pro` if the preview model is unstable.

## [1.1.5] - 2025-12-12
### 🧠 Intelligent Assistance (Phase 9)
- **Generative Layout Control**: AI now enforces `graph LR` vs `TB` based on your input flow or explicit instruction.
- **Smart Recommendations**: Automatically analyzes text selection to suggest "System Context" (C1) or "Container" (C2) diagrams.
- **Self-Correction**: Robust error handling that fixes AI syntax mistakes automatically.
- **Fallback Models**: Seamlessly switches to `gemini-2.5-pro` if primary models are busy.

### 📚 Documentation
- **New Guide**: Added comprehensive `docs/GEMINI_GUIDE.md` for AI workflows.
- **Marketplace Assets**: Updated README with video demos and screenshot examples.

## [1.0.8] - 2025-12-06

### 🧹 Refocus & Cleanup
- **Markdown-First Strategy**: Removed standalone `.c4x` file preview and context menus to focus entirely on seamless Markdown integration.
- **Removed**: Standalone Preview Panel command (`c4x.openPreview`).
- **Cleaned**: Removed sample clutter from the package.

### 🎨 Visual Improvements
- **Label Legibility**: Added smart "halo" background to relationship labels so arrows don't cross through text.
- **Layout Padding**: Increased padding for Boundaries and Deployment Nodes to prevent overlapping labels.

### 🐛 Fixed
- **Parser**: Fixed support for `System_Ext`, `System_Boundary`, and `title` keywords.
- **Stability**: Fixed parsing errors for standard PlantUML C4 macros.

## [1.0.6] - 2025-12-05
- **Feat**: Added 'Open Preview' context menu for .c4x files

## [1.0.4] - 2025-12-04
- Updated extension icon for better transparency support.

## [1.0.3] - 2025-12-04
- Fixed README documentation images on Marketplace.

## [1.0.2] - 2025-12-04
- Added automated release pipeline via GitHub Actions.
- Optimized package size.

## [1.0.0] - 2025-12-03

### 🚀 v1.0 Stable Release

C4X is now production-ready! This release focuses on a robust, offline-first experience for creating C4 diagrams using our custom mermaid-inspired DSL.

### ✨ Key Features
- **C4X-DSL**: A simple, concise syntax for defining C4 models (Person, System, Container, Component).
- **Markdown Integration**: Render ` ```c4x ` fenced code blocks directly in VS Code's Markdown preview.
- **Instant Preview**: Real-time visualization (< 50ms render time) as you type.
- **5 Professional Themes**: Classic, Modern, Muted, High Contrast, and Auto (System theme).
- **Export**: Save diagrams as SVG or PNG, or copy SVG directly to clipboard.
- **Zero Dependencies**: No Java, no Graphviz, no Docker required. Everything is bundled in the extension.

### 🛠️ Improvements
- **Performance**: Extension activation time optimized to ~0.15ms.
- **Validation**: Real-time syntax checking for `.c4x` files and markdown blocks.
- **Visuals**: Standardized element sizes and auto-scaling text for better readability.
- **Stability**: Comprehensive test suite (440+ tests) ensuring parser and renderer reliability.

### ⚠️ Changes
- **Deferred**: Support for Structurizr DSL and PlantUML C4 has been deferred to v1.2 to ensuring visual parity and validation before release.

---

## [0.3.0] - 2025-11-10
- Added Markdown integration.
- Added Theme system.
- Added Export functionality.

## [0.2.0] - 2025-11-03
- Added C4X-DSL parser and basic renderer.
- Added Live Preview panel.

## [0.1.0] - 2025-10-25
- Initial scaffolding and project setup.