# Change Log

All notable changes to the "c4x" extension will be documented in this file.

## [1.4.0] - 2026-05-03 — "Stability & Trust"

### New Features
- **Export Diagram as PNG**: Choose 1x, 2x, or 4x resolution. Canvas-based rendering — no Chromium dependency.
- **Export SVG / Copy SVG / Change Theme**: These commands are now fully functional (previously stubs).
- **Auto-layout direction**: 4 or fewer elements default to horizontal (LR); 5+ default to vertical (TB). Overridable per diagram.
- **Runtime model validation**: Warns on unrecognized Gemini model IDs at activation.
- **Sunset alerting**: Warns 30 days before a model's sunset date with migration guidance.
- **Visual self-remediation**: Failed image generation automatically retries with a corrective prompt.
- **C4 level-specific visual guidelines**: C1/C2/C3 produce visually distinct outputs with level-appropriate detail.
- **C4 Standard theme**: New default theme using filled-box convention (Structurizr/C4-PlantUML).
- **SVG renderer correctness**: Technology and description fields now render correctly. Database elements use cylinder shape. Boundary labels follow C4 top-left convention.

### Bug Fixes
- **Fixed Markdown preview glitch** — DiagnosticsManager was interfering with VS Code's internal virtual documents, causing preview corruption.
- Fixed `initialize()` not awaited in retry path, causing intermittent failures.
- Removed unused `acquireVsCodeApi()` call that could conflict with other extensions.
- CSP hardened: replaced `unsafe-inline` with nonce-based style policy.
- Per-document debounce in DiagnosticsManager (was single shared timer).

### Quality
- **398 unit tests** (parser 94%, model 98% coverage) with visual snapshot regression tests.
- **GeminiService decomposed** from 767 to 293 LOC — extracted PromptBuilder, FallbackStrategy, SyntaxValidator.
- **Default model changed** to `gemini-3-flash-preview` (free tier) with `gemini-3.1-pro-preview` failover.
- **SvgBuilder decomposed** from 671 to 194 LOC — extracted ElementRenderer, BoundaryRenderer, EdgeRouter, LabelRenderer.
- Layout improvements: Dagre centering, smooth bezier arrow curves, label backgrounds, larger arrowheads.
- Dependency cleanup: removed Playwright and elkjs from production bundle.
- ESLint 8 migrated to ESLint 9 flat config. API key migrated to SecretStorage.

### Documentation
- **24 new architecture pattern examples**: CQRS, event sourcing, saga, BFF, hexagonal, IoT, CI/CD, zero-trust, and more.
- **All C4 view levels documented**: C1 through C4 + Dynamic diagrams with relationship type reference.
- README streamlined from 628 to 255 lines. FAQ updated with model selection guidance.

## [1.3.0] - 2026-03-02

### 🧠 Gemini 3.1 Pro Migration (Breaking)
- **Default Model**: Changed to `gemini-3.1-pro-preview` (best reasoning, 1M context, ARC-AGI-2: 77.1%).
- **Removed**: `gemini-3-pro-preview` (sunset March 9, 2026) and `gemini-3.1-flash-preview` (invalid model ID).
- **Smart Fallback**: If user's model fails, automatically tries `gemini-3.1-pro-preview` or `gemini-3-flash-preview`.

### 🎛️ User-Configurable Model Selection
- **Free-text model input**: The `c4x.ai.model` setting now accepts any Gemini model ID — no more restrictive dropdown.
- **Future-proof**: New Google models can be used immediately without waiting for an extension update.

### 🖼️ Nano Banana 2 Image Model (New)
- **Default Image Model**: Visual PNG diagram generation now uses `gemini-3.1-flash-image-preview` (Nano Banana 2).
- **4K Support**: New model supports 4K upscaling, better text rendering, and subject consistency.
- **User-Configurable**: New `c4x.ai.imageModel` setting allows specifying any Gemini image model.
- **Cost Effective**: Nano Banana 2 delivers Pro-level quality at Flash speeds ($67 per 1k images vs Pro pricing).

### 🔧 Context Scanning Depth Fix (Breaking)
- **Corrected Logic**: Depth now properly increases with diagram detail level (was inverted).
  - **C1 (System Context)**: 1 level (was 2) — Broad, shallow scan for high-level systems
  - **C2 (Container)**: 2 levels (was 1) — Medium depth to find all services/apps
  - **C3 (Component)**: 3 levels (was 1) — Deep scan for detailed class structure
- **Rationale**: Higher abstraction = shallower scan; lower abstraction = deeper scan
- **Impact**: "Generate Diagram Here" now captures appropriate context for each C4 level

### 🎨 Visual Customization (New)
- **Visual Presets**: 5 built-in style presets for PNG diagrams: `default`, `dark`, `light`, `pastel`, `corporate`.
- **Layout Preferences**: Control diagram spacing with `balanced` (default), `compact`, or `spacious` options.
- **Custom Style Override**: New `c4x.ai.visualGroundingContext` setting (max 300 chars) for complete visual control.
- **Enhanced Color Enforcement**: Stricter prompts enforce official C4 Model color palette with "EXACT COLORS MANDATORY" rules.
- **Forbidden Colors**: AI now explicitly avoids green/red/yellow for structural elements (reserved for status indicators only).
- **Layout Algorithm Hints**: Different spacing rules for compact (tight), balanced (standard), and spacious (generous) layouts.
- **Better Documentation**: Comprehensive visual customization guide added to README with preset tables and examples.

## [1.2.12] - 2026-02-23

### 🧠 AI Model Upgrade
- **Gemini 3.1**: Default model upgraded to `gemini-3.1-flash-preview` with `gemini-3.1-pro-preview` fallback for improved reasoning and generation quality.

### 🛡️ C4X MCP Validator (New)
- **MCP Server**: New `mcp/c4x-mcp-server.ts` exposes a `validate_c4x` tool for AI agent pre-validation of C4X syntax.
- **AI Grounding**: Enables AI agents to validate C4X notation before applying it, creating a self-correction feedback loop.
- **Configuration**: Register via `.mcp.json` for Gemini Code Assist, Claude, and other MCP-compatible tools.

### 🎯 Improved C4 Diagram Quality
- **Element Whitelist**: Syntax correction fallback now enforces the strict C4 element type whitelist (`Person`, `System`, `Container`, etc.).
- **Anti Fan-Out**: Visual generation prompts enforce vertical chaining and single-entry-point patterns for cleaner layouts.
- **Hierarchy Rules**: Stricter `subgraph Id {` enforcement in all AI prompts.

### 🎨 Visual Grounding Override (New Setting)
- **`c4x.ai.visualGroundingContext`**: New user setting (up to 300 characters) to override the default visual style prompt for PNG diagram generation.
- **Default**: Falls back to `"Elegant, simple C4 model diagram against white background, logically organised and well spaced"`.
- **Use Cases**: Customize colour schemes, backgrounds, styling, or add domain-specific context.

### 🔒 Sync Script Safety
- **Hardened `publish-to-public.sh`**: Rewrote with strict allowlisting, excluding private dev tooling, ADRs, phase docs, agent configs, and build artifacts.
- **Post-Sync Safety Check**: Script now auto-verifies no private files leaked and aborts if detected.

## [1.2.11] - 2025-12-21

### 🧠 Smart Diagram Framework Detection
- **NEW**: Visual diagram generation now auto-detects the best framework:
  - **C4 Model** (default) — For structural architecture (systems, containers, components)
  - **Sequence/Collaboration** — For ordered interactions, API call flows, loops
  - **Flowchart** — For decision logic, process steps, conditional branches
- **User Hints**: Override detection with `[Framework: Sequence]` or `[Framework: Flowchart]` in your selection text.
- **Framework-Specific Prompts**: Each framework uses tailored visual guidelines and reference images.

### 🛡️ Improved C4X Syntax Validation
- **Element Type Whitelist**: AI now strictly enforces valid C4 element types.
- **Blocked Invalid Types**: Prevents generation of fabricated types like `Goal()`, `Reason()`, `Decision()`, `Process()`, `Action()`.
- **Structure vs Behavior**: Prompts now clarify that C4 is for STRUCTURE, and process/flow diagrams should use Sequence or Flowchart frameworks.

## [1.2.10] - 2025-12-21

### Optimized
- **User Positioning**: Strictly enforces "User at Top-Left" rule to prevent the Person node from floating to the bottom of diagrams.
- **Visual Spacing**: Increased instruction for padding and spacing to prevent relationship label overlaps and ensure readability.

## [1.2.9] - 2025-12-21

### Optimized
- **Layout Consistency**: Synchronized layout logic between DSL and Visual generation.
- **Loop Support**: Increased horizontal layout threshold to 6 nodes and explicitly favored LR for "Loops" and "Sequences".

## [1.2.8] - 2025-12-21

### Optimized
- **Smart Layout Algorithm**: AI now counts entities to decide layout:
  - **<= 4 Nodes**: Horizontal (Left-Right) with User on Left.
  - **>= 5 Nodes**: Vertical (Top-Bottom) with User on Top.
  - **Sequence Detection**: Strictly mimics linear flows if detected in input text (e.g. ASCII diagrams).

## [1.2.7] - 2025-12-21

### Improved
- **Transparent Boundaries**: Prompt now explicitly forbids filling containment boundaries (Subgraphs) with color. It enforces "Dashed Stroke + Transparent Fill" for clarity.

## [1.2.6] - 2025-12-21

### Fixed
- **Background Generation**: Fixed "TextEditor#edit not possible on closed editors" error by using `WorkspaceEdit`. Now you can switch tabs while the visual diagram generates in the background.

## [1.2.5] - 2025-12-21

### Optimized
- **Layout Patterns**: Injected expert heuristics for C4 layout (Hierarchy First, Flow Direction) derived from `EXAMPLES-LAYOUT.md` to guide the visual model.
- **Robustness**: Improved reference image loading stability.

## [1.2.4] - 2025-12-21

### Improved
- **Double Visual Grounding**: Now injects BOTH the reference diagram AND the visual key into the AI prompt for maximum style adherence.
- **Strict Guidelines**: Hardcoded "Expert Visual Architect" rules into the prompt to prevent common layout mistakes (e.g., node sizing inconsistency).

## [1.2.3] - 2025-12-21

### Enhanced
- **Visual Diagram Quality**: Now uses **Multimodal Grounding** (sending reference images to matching C1/C2 styles) to strictly enforce C4 layout, consistent node sizing, and arrow styles.
- **Icon Consistency**: Stricter prompting for standard stick-figure Persons and cylinder Databases.
- **Layout**: Enforces Uniform width/height for same-type nodes based on visual reference.

## [1.2.2] - 2025-12-21

### Fixed
- **Parser Resilience**: Enhanced AI self-correction to automatically fix "Expected E found" parser errors (increased retries to 3).
- **Subgraph Syntax**: Improved AI prompting to strictly enforce correct `subgraph ID {` syntax.
- **Documentation**: Clarified brace requirements in `GEMINI.md`.

## [1.2.1] - 2025-12-20
### 🧠 AI Model Upgrade
- **Primary Model**: Upgraded to `gemini-3-flash-preview` (Gemini 3 Flash) - Pro-grade reasoning at 3x Flash speed.
- **Fallback Model**: `gemini-3-pro-preview` for reliability when primary is unavailable.
- **Self-Validation**: AI-generated diagrams are automatically validated using the C4X parser with auto-correction and retry logic.
- **Model Selection**: VS Code settings now support choosing between `gemini-3-flash-preview`, `gemini-3-pro-preview`, and `gemini-2.5-pro`.

### 🎨 Visual Diagram Generation (Preview)
- **NEW**: Generate presentation-ready C4 diagrams as PNG images using `gemini-3-pro-image-preview`.
- **Smart Detection**: AI automatically detects C4 level (C1/C2/C3) from your text context.
- **Rich Visuals**: Output follows official C4 Model color scheme and styling.
- **[📘 Read the Visual Diagram Guide](./docs/DIAGRAM-WITH-GEMINI-IMAGE.md)**

### 📚 Documentation
- Added AI model configuration and visual generation sections to README and FAQ.

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
- **Marketing Example**: New multi-agent system example added to gallery.

### 📝 Documentation
- Added `EXAMPLES-PLANTUML.md` to showcase PlantUML compatibility.

## [1.0.9] - 2025-12-08
### Fixed
- Minor bug fixes and performance improvements.

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