# Change Log

All notable changes to the "C4X" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

## [1.0.2] - 2025-12-04
- Added automated release pipeline via GitHub Actions.
- Optimized package size.

## [1.0.3] - 2025-12-04
- Fixed README documentation images on Marketplace.

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