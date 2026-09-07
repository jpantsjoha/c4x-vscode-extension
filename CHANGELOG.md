# Change Log

All notable changes to the "c4x" extension will be documented in this file.

## [1.7.0] - 2026-09-07

This release improves visual editing and save recovery, adds Gemini model selection and discovery, and hardens the installed extension package.

### Added

- **Text and image model pickers:** `C4X: Select Gemini Model` and `C4X: Select Gemini Image Model` list models your API key can access, marking preview, retired and specialist models.
- **Runtime model discovery:** model lists are cached for a day. `c4x.ai.modelStrategy` supports a pinned model or automatic selection of generally available models in its tier. An unavailable model can be replaced once with a notice; authentication, quota and network failures do not trigger model healing.

### Fixed

- The visual editor's assembled script parses correctly, fixing a failure that prevented the panel from opening.
- Focusing the preview retains its source-document binding rather than clearing the diagram when no text editor is active.
- Nested boundaries resize child-first, preserve authored origins and minimum sizes, and use consistent rules during dragging and saving.
- Relationship-label layout no longer displaces manually positioned elements.
- Removing or discarding a staged node move rewraps its enclosing boundary.
- Failed-save rollback retries up to three times. Draft restoration reports missing targets, including when nothing can be restored.
- Changing the text model directly in Settings takes effect on the next request.
- Specialist models are excluded from automatic selection while remaining available for deliberate selection.

### Changed

- The configured text-model default is `gemini-3.8-flash`; model discovery and explicit settings determine subsequent selection.
- Documentation now distinguishes supported workflows, measured validation and known limitations. Layout examples provide more space around nodes and relationship labels.
- Clean packaged-installation checks verify activation, commands and rendered preview nodes on Windows, macOS and Linux. Browser failures and high/critical dependency findings block CI.

### Security

- Updated shipped Markdown/linkification and bundled MCP URI dependencies. The candidate dependency audit reports no high or critical findings.
- Removed development-only files from the VSIX and tightened the package allowlist.

### Known limitations

- Pan/zoom-only persistence and draft identity/migration remain incomplete; the separate draft-persistence rewrite is excluded.
- Relationship labels can change position after save, and long descriptions can overflow node boxes. Resize-handle placement and mixed boundary/node edits remain under review.
- Element-palette creation and deletion of elements or relationships remain planned features.
- Model discovery reflects API availability, not lifecycle guarantees: a deprecated model can still be listed and served.

## [1.6.4] - 2026-08-07 — "Where the key goes"

### Added

- **`C4X: Set Gemini API Key` and `C4X: Clear Gemini API Key`.** Adding a key had no entry point of its own. The only way in was to run an AI command, let it fail, and click "Enter Key" in the error toast, so replacing an expired key meant deliberately provoking an error and removing one was impossible. The `c4x.ai.apiKey` setting is deprecated, which VS Code greys out, so the settings page appeared to offer nothing. Both commands are now in the Command Palette, and the deprecated setting names them.

### Changed

- **A real generation example in the README.** The AI section showed nothing; the older screenshots had gone unreferenced entirely. It now shows a C4 component model generated from a source folder and arranged in the visual editor, which is the loop the extension actually offers.

### Fixed

- **A key change takes effect immediately.** The Gemini client is cached, and each command owned a separate instance, so storing a key was not the same as using it: the old client kept running until the window reloaded, and clearing a key left generation working. Setting or clearing now rebuilds every client.
- **Documentation named a command that did not exist.** `docs/GEMINI_GUIDE.md` had been telling users to run `C4X: Set Gemini API Key` for some time. Six invented command names were corrected across the README, FAQ and guides, three of them in the README that serves as the Marketplace listing.

## [1.6.3] - 2026-08-07 — "Model currency"

### Fixed

- **Image generation used a retired model.** The default `c4x.ai.imageModel` was `gemini-3.1-flash-image-preview`, which Google retired on 2026-07-17. It now defaults to `gemini-3.1-flash-image` (Nano Banana 2), and the Pro option to `gemini-3-pro-image`, both generally available.
- **The text model is a version behind.** The default moves from `gemini-3.5-flash` to `gemini-3.6-flash`, the newest generally available flash model.
- **Documentation contradicted the extension.** `docs/FAQ.md` told users the default was `gemini-3.1-pro-preview` and `docs/GEMINI_GUIDE.md` said `gemini-3-flash-preview`. Neither had been true for some time.

### Added

- **`gemini-3.1-flash-lite-image`** (Nano Banana 2 Lite) as a documented option for the lowest latency and cost.
- **Retired models stay in the registry**, so anyone pinned to one is warned and told what replaced it, rather than seeing an unexplained failure.

### Added

### Also fixed

- **Generating a diagram can no longer delete your text.** "Generate Diagram Here" inserted its snippet with no target position, which in VS Code means *replace the current selection*. Running it with any text selected destroyed that text. It now always inserts at an explicit position, and generation only ever adds to a document.
- **Generation errors now name the actual cause.** Every failure previously read "AI generation failed with «model». Check your model selection", including failures that had nothing to do with the model. An expired API key sent users to change a setting that was already correct. The message now distinguishes a rejected key, a retired or ungranted model, an exhausted quota and an unreachable network, and passes anything unrecognised through in the API's own words instead of guessing.

### Added

- **A live generation gate** (`make test-live`). It calls the Gemini API for real against every model id the extension ships, parses the returned C4X with the extension's own parser, and checks the image models return actual image bytes. Every other gate mocks the model, which is exactly how a retired image model reached users. It skips without a key, so CI stays green, and runs as part of `make check-full`.

### Changed

- **Defaults are now generally available models only.** Preview models are retired at short notice, so C4X will not ship one in a default position. The failover model remains `gemini-3.1-pro-preview` because no generally available Pro model exists in the Gemini 3.x line; it is labelled as preview wherever it appears.

## [1.6.2] - 2026-08-06 — "Editor polish"

Laying a diagram out by hand now works the way you expect it to.

- **An element goes where you drop it**, however far you drag it. It no longer slides away from the cursor, and the rest of the diagram stays put.
- **A diagram opens centred and ready to edit**, instead of landing out of sight so that your first move is to drag it back.
- **The whole diagram stays in view when you start editing**, unless you have chosen your own zoom, which is then left alone.
- **Edit, Save and Discard sit together at the top left**, in the order you use them.
- **Diagram stats moved out of the toolbar** into a table beside the inspector, leaving the top of the window for the controls you actually press.

## [1.6.1] - 2026-08-05 — "Editor authoring"

### Editor authoring fast-follow

This update adds connection and relationship editing to the visual editor.

- **Connect mode: add a relationship**: **Cmd/Ctrl+click two elements**, or use the **Connect** button on the canvas toolbar, to arm a two-click gesture — pick a source element, pick a target, then name the relationship. Eligible endpoints are outlined as you go and ineligible ones dim out, filtered by the same C4 legality rules the writeback service enforces, so a Deployment Node can never be wired directly to a logical element. The dialog collects a label (required), technology (optional) and direction (uses / async / sync). Escape cancels at any point. The whole gesture is keyboard-operable, and the result stages like every other change, with its own ✕ to un-stage before saving.
- **Relationship property editing beyond the label**: the edge inspector now edits technology and relationship type, and re-assigns either endpoint to a different element.
- **Boundary frame reposition and resize**: drag or resize a boundary frame; `$x`/`$y`/`$w`/`$h` persist to source.
- **Editor initial zoom matches the Markdown preview scale**: an editor opened from a Markdown fence now opens at `c4x.markdown.previewScale` instead of jumping to 100%.
- **Canvas grows when a node is dragged out of bounds**: dragging a node past the edge expands the canvas instead of clipping it.
- **Bidirectional relationships no longer overlap**: an A→B and B→A pair is offset into separate lanes rather than drawn on top of itself.
- **Fixed "Waiting for render…" hang after nested re-wrap**: a negative layout origin produced by re-wrapping a nested container left the preview stuck on its placeholder.

### Fixes from installed-VSIX UAT

Found by installing the packaged extension and using it, not by the test suite — which was green throughout.

- **Dragging a node no longer accelerates away from the cursor**: growing the canvas when an element is dragged out of bounds changes the SVG's transform mid-gesture. The drag was re-reading that transform on every frame, so the delta was measured against a coordinate frame that had already moved — and because a bigger delta grows the canvas further, the error compounded. The drag now pins to the frame captured when the pointer went down.
- **A saved boundary frame keeps its position and keeps its children**: two separate faults. Children carrying their own `$x`/`$y` were shifted a second time by the frame's own movement, even though an authored coordinate is absolute. And the frame was sized from the span of its children rather than from its own corner, so once its position was pinned the frame came out too small and elements hung out of the right and bottom edges after saving.
- **Elements no longer overlap on densely connected diagrams**: layout balances pushing elements apart against keeping them clear of relationship labels. On a busy dynamic view — the OAuth sample has twelve relationships between four elements — the two goals fight and the balancing gives up, which could leave two boxes drawn on top of each other. Pushing elements apart now gets the final say; label spacing stays best-effort.
- **Save and Discard moved to the top bar** beside *Exit edit mode*. At the foot of the sidebar the two decisions that end an editing session could scroll out of view.
- **The status line moved into the sidebar**, where it has room to be read. In the header it was clipped mid-sentence to `Web App moved to 299, …`.
- **Connect mode reads correctly on the canvas**: the element picked as the source was drawn in the theme's focus blue on top of a blue element and was effectively invisible; a locked element showed its locked dashes instead of showing that it was a valid endpoint.

### Correctness and accessibility fixes

- **Stale-range guard now detects content change**: `isRangeConsistentWithSource` only verified that a range's offsets still agreed with their cached line/column values — geometry, not identity. A same-length rewrite (`Person(a, "A")` becoming `Person(x, "X")`) passed the check, after which the anchored planner could edit the wrong statement. Element-anchored planners now re-derive the declared identifier; relationship-anchored planners, whose `rel-N` ids appear nowhere in the source, compare against the exact text captured with the range.
- **Multi-view documents no longer reject a new relationship**: the structural-equivalence check applied the global relationship-add count to every view and demanded each add appear in all of them. A relationship lands only in the views containing both endpoints, so connect mode failed on any document with more than one view.
- **Every theme's label text now meets WCAG AA contrast**: all six themes set element `text` equal to `stroke`, and a colour tuned for a 2px border is not readable as glyphs. Five of six themes shipped label text below the 4.5:1 minimum — including `classic`, the default, where the Component token measured 2.03:1. Text colours are darkened; `fill` and `stroke` keep their official C4 and VS Code palette values, so diagrams look unchanged apart from legible labels.

### Packaging

- **VSIX cut from 3.64 MB to 1.17 MB (68% smaller, #46)**: the package was shipping a 741 KB source map and ~2.6 MB of marketplace listing imagery. `vsce` rewrites every relative README link to a `raw/HEAD` GitHub URL, so those images are fetched from GitHub and were never read out of the package. Only the declared extension icon now ships. This brings the VSIX under the 2.5 MB package target.
- **Guard against minifying the extension bundle**: the webview client script is assembled at runtime from `fn.toString()`, and the hand-written half calls those helpers by name from a template literal the bundler cannot rewrite. Minifying renames the declarations and the editor dies on `ReferenceError` the moment it opens — `keepNames` does not help, because it fixes the `.name` property rather than the emitted source. The build now fails loudly instead of shipping a broken editor.

### Visual Layout Mode

- **Interactive Canvas & Accessibility**: Pointer drag-and-drop enables node coordinate updates. Dynamic canvas panning and mouse wheel zooming with a toolbar panel (Zoom In, Zoom Out, Reset 100%) are integrated. Keyboard movement, selection, focus outlines, and live status announcements are included in the UAT baseline.
- **Layout Overlap Nudging & Container Growth**: Added post-layout nudging post-processing to eliminate node-node and node-label overlaps. Implemented boundary auto-expansion to wrap shifted elements and locked node immobility during automatic layout runs.
- **Safe Source Writeback & Sidecar Persistence**: Completed moves persist as inline C4X layout metadata or route to a deterministic `.c4x-layout.json` sidecar. Native updates are revision-checked, reparsed, structurally validated, and rolled back when post-edit validation fails.
- **Gemini 3.5 Upgrade**: Uplifted defaults to `gemini-3.5-flash` with active sunset warning checks and fallback failovers.

### Visual C4 Editor UAT increment

- **Native `.c4x` property editing and safe identifier rename**: The staged inspector now updates label, technology, description, tags, and sprite with bounded validation. The Rename dialog rewrites the declaration and every supported C4X relationship endpoint in one atomic `WorkspaceEdit` / undo unit, rejecting invalid or colliding identifiers.
- **Browser acceptance coverage**: Added a deterministic 14-scenario Visual C4 Editor suite, including inspector editing, rename impact, combined staged changes, discard, keyboard flow, rejection announcements, and a visual baseline. Source transaction/undo behaviour remains covered in Tier A writeback tests.
- **UAT documentation reconciliation**: The feature matrix, how-to, docs index, and Wiki source now describe the actual native `.c4x` surface. Markdown C4X fences still render but do not currently open the editor. The Wiki source awaits one-time GitHub Wiki initialisation before publishing.

### Visual C4 Editor refinement increment

Merged to `main`, pending UAT sign-off.

- **Un-stage individual staged changes**: Every entry in the Staged Changes list now carries an accessible ✕ button (keyboard-focusable, polite live-region announcement) that removes only that element's staged edits. Removing a position edit reverts the canvas translation; removing a property edit restores the inspector from the original snapshot. Save disables when the list empties.
- **Source-diff panel**: A collapsible **Source diff** section in the editor sidebar shows a unified line diff between the original C4X block and the draft-materialised source with all staged edits applied, updating live as edits are staged. Backed by a dependency-free LCS line diff and a shared draft materialiser also used by the Save path.
- **Close-while-dirty protection and draft survival**: Closing a dirty editor panel raises a warning with a Reopen Preview option. Staged edits persist as webview state, so a draft survives webview reload (announced as "Draft restored — N staged changes") and a panel serializer restores the editor after extension-host restart.
- **External-change conflict banner with recovery actions**: When the anchored source block changes while the editor is dirty, an assertive conflict banner replaces the silent re-render and Save is disabled. Three recovery actions are offered: **Reload source and discard draft**, **View diff** (opens the source-diff panel against the draft), and **Rebase draft** (re-anchors to the new source while keeping the draft, failing with a descriptive message when the block can no longer be located). The Save-time revision race still fails closed as a redundant guard.
- **Locked checkbox in the Properties Inspector**: Toggles `$locked true/false` as a staged metadata edit with live dashed-outline feedback on the canvas; persists on Save in native mode and is preserved by the sidecar.
- **Live inline validation in the Properties Inspector**: Label, technology, tags, sprite, and identifier fields validate as you type with inline field-level error messages, `aria-invalid` styling, and an assertive announcement on first error. Save is gated until every field error is cleared. Bounds now come from a shared validator module used by both the webview and the native mutation planner.
- **Zoom-to-fit and multi-select group move**: A **Fit** toolbar button zooms and pans the canvas to fit all nodes. Shift+click builds a multi-selection; pointer drag or Arrow keys move every selected element by the same delta, one staged entry per element.
- **Theme sweep across the new editor chrome**: Error banners, toolbar shadow, and dialog backdrop now resolve to `--vscode-*` theme tokens (inheriting light/dark/high-contrast), and every new interactive control has a `:focus-visible` outline, enforced by a static audit test.
- **Edges-on-top rendering option (UAT)**: New `c4x.edgesOnTop` setting (default `true`) renders relationship arrows above diagram nodes so connectors stay visible over large containers and deployment nodes. Set to `false` for the legacy paint order (edges behind nodes).

### Editing reliability

- **Markdown fence save path repaired (root cause of the UAT 'Save does nothing' reports)**: the fence writeback boundary computed absolute positions against the fence body instead of the full Markdown document, throwing `RangeError` on every save; the panel's virtual document also returned a frozen pre-edit body, breaking post-save validation. Both fixed, with a regression test wired exactly like the panel.
- **Panel restore binding**: restored editor panels rebind to their document after window reload (persisted binding: kind, URI, Markdown block ordinal) instead of returning as unbound zombies showing "No active diagram document selected".
- **Save observability**: Save shows immediate "Saving…" feedback; an 8-second watchdog surfaces any silent host with a pointer to the new **C4X output channel**, which logs every writeback decision and transaction duration. The message dispatch can no longer throw silently.
- **Layout truthfulness**: manually positioned (`$x`/`$y`) elements are never nudged after save; nested deployment groups re-wrap around moved children; ancestor-descendant containment is exempt from overlap prevention. Nested arrangements (AWS > VPC > DB) now survive save exactly as placed.
- **Relationship inspection and label editing**: click or Tab+Enter a relationship arrow in edit mode to inspect it (From/To/Label/Type); Escape restores the element inspector. The edge inspector label field supports staged set, replace and clear operations.
- **`c4x.legend.show` setting**: hide the diagram legend and reclaim its 130px canvas reservation.
- **Tighter canvas**: diagram bounding-box padding reduced from 100px to 50px.
- **Render performance**: the sidecar layout file is no longer read on every render for native-persistence documents; repeated Markdown fence scans during save are cached per document version.
- **Hygiene**: removed the unused ELK layout engine and `elkjs` dependency (dead code, already excluded from the bundle).
- **UAT versioning**: builds identify as `1.6.0-uat.N` prerelease; plain `1.6.0` stays reserved for the Marketplace publish.

### Editor experience

- **Live edge repaint during drag**: relationship arrows now repaint continuously while a node is dragged instead of snapping into place on drop, keeping connectors attached to the moved element. Pinned by a Playwright E2E spec (`test/playwright/edge-repaint.spec.ts`).
- **Live canvas text preview**: typing in an inspector label, technology, or description field updates the rendered node text immediately as a staged preview, before Save; un-staging the entry or Discard restores the original text.
- **Exit-edit-mode confirmation**: toggling edit mode off with unsaved staged changes now asks for confirmation instead of silently dropping the draft; the banner hides on external re-render so it cannot go stale, and the Discard path announces its outcome in the status text.
- **Auto-fit on open and adaptive canvas padding**: the preview zooms and pans to fit the whole diagram when it is first opened — configurable via `c4x.canvas.autoFitOnOpen` (default `true`) — and canvas padding adapts to diagram size. Ships alongside the `c4x.layout.spacing` presets (`compact`/`balanced`/`spacious`) with automatic tightening for small groups.
- **Draggable, contextual legend overlay**: the static SVG legend is replaced by a floating overlay listing only the element types present in the current diagram. Reposition it by pointer drag or keyboard (Tab to the legend, Arrow keys, Shift for a larger step) with a live-region announcement on each drop; the position is session-only and never persisted. `c4x.legend.show` still hides it entirely.
- **Responsive Markdown diagram scaling**: C4X diagrams embedded in Markdown preview now scale to fit the preview column instead of overflowing at intrinsic size.
- **`c4x.markdown.previewScale` setting**: scales diagrams embedded in Markdown preview (default `0.5`, range `0.2`–`1.0`). A per-block `width=` attribute can shrink a diagram further but cannot exceed the scaled cap; HTML/PDF export and print keep the intrinsic size.
- **VSIX packaging exclusions**: `.vscodeignore` now excludes non-runtime content (`assets/cloud/**`, `wiki/**`, `audit/**`), shrinking the packaged VSIX from 5.29 MB (575 files) to 3.61 MB (26 files) — the 6.91 MB figure quoted in the issue was the earlier UAT.4 artifact, since pruned. Further package-size improvements follow in later updates.

### Documentation

- **Living visual-editing documentation**: Added an evidence-backed capability matrix, current native `.c4x` UAT how-to, and explicit Known Limitations. The docs distinguish verified UAT functionality from planned Markdown entry, relationship authoring, and release work.

### Bug Fixes
- **Standalone preview restored**: `C4X: Open Preview` and `C4X: Refresh Preview` are registered again, with editor menus and the documented `Ctrl/Cmd+K V` shortcut for `.c4x`, `.dsl`, and `.puml` sources. Export commands now offer to open the preview when no rendered SVG is available.
- **C4X syntax highlighting restored**: fixed an invalid TextMate grammar escape that prevented VS Code from loading the C4X grammar.
- **MCP validator startup reliability**: `c4x-validator` now runs from a tracked self-contained bundle instead of ignored TypeScript output and runtime `node_modules`, preventing startup timeouts in iCloud-backed workspaces and clean clones.
- MCP resources now resolve from the server installation rather than the client's working directory, and validation input is type-checked and capped at 1 MiB.
- MCP bundle/parser freshness and isolated protocol checks now run in CI on Node.js 20 and 26; generated third-party notices accompany the bundle.
- The local unit-test runner now supports Node.js 26 by upgrading to Mocha 11.

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
- **Documentation**: Clarified brace requirements in AI prompts.

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
- **Docs Parity**: Synchronized AI prompt guidelines with documentation.

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
### 🧠 Intelligent Assistance
- **Generative Layout Control**: AI now enforces `graph LR` vs `TB` based on your input flow or explicit instruction.
- **Smart Recommendations**: Automatically analyzes text selection to suggest "System Context" (C1) or "Container" (C2) diagrams.
- **Self-Correction**: Robust error handling that fixes AI syntax mistakes automatically.
- **Fallback Models**: Seamlessly switches to `gemini-2.5-pro` if primary models are busy.

### 📚 Documentation
- **New Guide**: Added comprehensive `docs/GEMINI_GUIDE.md` for AI workflows.
- **Marketplace Assets**: Updated README with video demos and screenshot examples.

## [1.1.0] - 2025-12-09
### 📐 Advanced Layout Control
- **Recursive Layout Engine**: Completely rewritten layout engine to support hierarchical, independent sub-layouts.
- **Nested Direction**: Support for `direction LR` inside subgraphs allows mixed-orientation diagrams (e.g. Horizontal Flows inside Vertical Systems).
- **Manual Positioning**: New `$x` and `$y` attributes for pixel-perfect element positioning (e.g., `Component(..., $x="100", $y="200")`).

### 🧠 Gemini AI Architect
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
- **No External Servers Required**: No Java, no Graphviz, no Docker needed. Everything is bundled in the extension.

### 🛠️ Improvements
- **Performance**: Extension activation time optimized to ~0.15ms.
- **Validation**: Real-time syntax checking for `.c4x` files and markdown blocks.
- **Visuals**: Standardized element sizes and auto-scaling text for better readability.
- **Stability**: Comprehensive test suite ensuring parser and renderer reliability.

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
