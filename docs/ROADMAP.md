# C4X Product Roadmap

## 1.7.0 — released

Shipped 2026-09-07 to the VS Code Marketplace and Open VSX. It combines runtime Gemini model discovery and healing with visual-editor reliability improvements: authored boundary positions and minimum sizes are preserved, enclosing boundaries update during drag and revert, client and host edge routing stay aligned, direct model-setting changes take effect, and draft entries that cannot be restored are reported.

Every release gate ran on the tagged candidate before publication, covering both Node versions, documentation, dependency security, browser tests, coverage, performance, live generation and packaged rendering on Linux, macOS and Windows. The VSIX smoke installs the package into an isolated profile and requires a fresh receipt from rendered webview nodes and labels.

Known limitations are recorded in the [changelog](../CHANGELOG.md) and the [README](../README.md). Manual walkthroughs of the full installed editing journey remain outstanding.

## 1.8.0 — Supported AI SDK, model checks and editing fixes

Release scope:

- migrate Gemini calls from the deprecated `@google/generative-ai` SDK to `@google/genai`;
- check a model while you write it: C4 notation lint reports missing descriptions, missing technology and unlabelled relationships as editor diagnostics, with a stable id and a per-rule severity setting for every rule;
- check that a view hangs together: coherence rules report a component view that does not decompose exactly one container, relationships that reach into another container, and repeated names;
- run the same lint outside the editor: a command-line check for a local git hook or any CI (annotations by default, SARIF on request), and an MCP tool beside `validate_c4x`;
- map components to source paths, and export a component view as a dependency-cruiser allow-list, so a team's gate fails when the code's dependencies drift from the diagram. No checker is bundled into the extension;
- fix diagram-editing defects found by installed testing and review: the legend covering the toolbar, a plain click recorded as a move, dragging a group, saving relationships added in connect mode, and a boundary declared with a C4 typed form being offered for a move that could not be saved: it is now left fixed, and Save stays all-or-nothing (#271, maintainer decision, 2026-10-10; a typed boundary that can store its layout is not scheduled);
- fix Markdown preview Edit links and source right-click selection so they open the intended document and diagram;
- ship third-party licence notices inside the extension package.

## 1.8.1 — Draft recovery and complete authoring

Planned work includes:

- complete screen-reader announcement and browser HTML print-pagination verification;
- [harden draft identity, schema migration and ambiguous Markdown-fence recovery](https://github.com/jpantsjoha/c4x-vscode-extension/issues/24);
- prevent restored drafts from attaching to a different statement after source changes, with focused restore/replacement regressions;

- [add elements from a C4-aware palette](https://github.com/jpantsjoha/c4x-vscode-extension/issues/22);
- [delete elements and relationships with dependent-relationship review](https://github.com/jpantsjoha/c4x-vscode-extension/issues/23).

Each source-changing gesture must preserve valid source, show a reviewable diff, support keyboard interaction, and pass focused writeback and browser regressions.

## 1.9.0 — More checkers and agent-ready distribution

The architecture check gains a second target: ArchUnit-family PlantUML, alongside the dependency-cruiser allow-list that 1.8.0 ships. No checker is bundled into the extension.

C4X becomes easier for coding agents to use. Its MCP server registers itself in VS Code, and a published agent skill teaches the syntax and the lint rules.

C4 has no formal standard. These checks follow the C4 model's published diagram review checklist; they are not a certification.

## 1.10.0 — Navigate larger models

Planned work includes [cross-file C1/C2 navigation](https://github.com/jpantsjoha/c4x-vscode-extension/issues/25) and [organisation-specific icon packs](https://github.com/jpantsjoha/c4x-vscode-extension/issues/26). Once views can refer to each other across files, coherence rules check that they agree: the container a component view decomposes exists in the container view, and component relationships roll up to container relationships. A semantic diff reports which elements and relationships a pull request adds, removes or changes, as a comment on the pull request. These capabilities remain proposals.

## Reliability follow-ups

Camera-only persistence, relationship-label placement during drag, resize-handle polish, and mixed boundary/node edits remain bounded follow-ups. They do not change the source-authority contract and are not release claims for 1.7.0.

Use the [README](../README.md) for available capabilities and the [documentation index](README.md) for user guides.
