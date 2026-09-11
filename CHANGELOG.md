# Change Log

All notable changes to the "c4x" extension will be documented in this file.

## [1.0.9] - 2025-12-08
### 🚀 New Features
- **PlantUML Support**: Native rendering of standard PlantUML C4 syntax in markdown.
- **PDF Export**: Browser-based print preview for high-fidelity PDF generation (`C4X: Export - Preview`).
- **Marketing Example**: New multi-agent system example added to gallery.

### 📝 Documentation
- Added `EXAMPLES-PLANTUML.md` to showcase PlantUML compatibility.

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