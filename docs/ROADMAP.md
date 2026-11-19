# C4X Product Roadmap

## 1.7.0 — released

Shipped 2026-09-07 to the VS Code Marketplace and Open VSX. It combines runtime Gemini model discovery and healing with visual-editor reliability improvements: authored boundary positions and minimum sizes are preserved, enclosing boundaries update during drag and revert, client and host edge routing stay aligned, direct model-setting changes take effect, and draft entries that cannot be restored are reported.

Every release gate ran on the tagged candidate before publication, covering both Node versions, documentation, dependency security, browser tests, coverage, performance, live generation and packaged rendering on Linux, macOS and Windows. The VSIX smoke installs the package into an isolated profile and requires a fresh receipt from rendered webview nodes and labels.

Known limitations are recorded in the [changelog](../CHANGELOG.md) and the [README](../README.md). Manual walkthroughs of the full installed editing journey remain outstanding.

## 1.8.0 — Supported AI SDK, model checks and editing fixes (released 2026-10-16)

Published to the VS Code Marketplace and Open VSX on 2026-10-16 from the tag `v1.8.0` (`a18ee33`). The draft recovery in PR #279 merged after the tag and ships with 1.8.1.

Release scope:

- migrate Gemini calls from the deprecated `@google/generative-ai` SDK to `@google/genai`;
- check a model while you write it: C4 notation lint reports missing descriptions, missing technology and unlabelled relationships as editor diagnostics, with a stable id and a per-rule severity setting for every rule;
- check that a view hangs together: coherence rules report a component view that does not decompose exactly one container, relationships that reach into another container, and repeated names;
- run the same lint outside the editor: a command-line check for a local git hook or any CI (annotations by default, SARIF on request), and an MCP tool beside `validate_c4x`;
- map components to source paths, and export a component view as a dependency-cruiser allow-list, so a team's gate fails when the code's dependencies drift from the diagram. No checker is bundled into the extension;
- fix diagram-editing defects found by installed testing and review: the legend covering the toolbar, a plain click recorded as a move, dragging a group, saving relationships added in connect mode, and a boundary declared with a C4 typed form being offered for a move that could not be saved: it is now left fixed, and Save stays all-or-nothing (#271, maintainer decision, 2026-10-10; a typed boundary that can store its layout is not scheduled);
- fix Markdown preview Edit links and source right-click selection so they open the intended document and diagram;
- ship third-party licence notices inside the extension package.

## 1.8.1 — Stabilise (internal baseline, not published)

1.8.1 fixes and proves what already ships. It adds no authoring. It is tagged `v1.8.1` at `6914d43` (2026-11-15) as an internal baseline and is not published to either registry; so is the `v1.8.2` tag after it. Their changes ship with 1.9.0 and with the 1.8.3 patch, tagged `v1.8.3` on the 1.8.x maintenance branch and awaiting publication; the published version stays 1.8.0 until then. On `main` since 1.8.0:

- [draft recovery](https://github.com/jpantsjoha/c4x-vscode-extension/issues/24): drafts belong to the exact source of their file or Markdown fence, the camera persists across reloads, and a draft that cannot be restored is reported;
- a changed `c4x.theme` setting restyles an open preview, and a theme change or **C4X: Refresh Preview** keeps unsaved edits and applies after you Save or Discard;
- Structurizr files with positional descriptions, technology and tags parse, and a file with a missing closing brace, a `views` block after the workspace's closing brace, no elements or no views reports the line and cause, while other irregular files (an extra closing brace, `views` inside an element) still render best-effort;
- the export save dialog opens beside the source file, and **C4X: Change Theme** saves to user settings when no folder is open;
- Gemini 2.5 retirement dates match Google's, high-severity dependency advisories are cleared, and the installed package is tested on every release gate.

The `c4-model` theme and tag styles already on `main` ship as a preview; `classic` stays the default theme in this release. Screen-reader announcement and browser HTML print-pagination checks remain to be verified.

## 1.9.0 — C4 notation refresh and agent-ready core

First, what is drawn wrongly is fixed for every theme, with the change announced: a description drawn as bracketed technology text, a relationship's technology never drawn, and edges that ignore their routed points. Nested deployment nodes drawn outside their parent (#418) follows. Existing diagrams that do not hit these render as before, and `classic` stays the default theme for this release.

Then a diagram can look like the examples c4model.com publishes today: an outlined theme with its colours, a shape for each kind of container (person, cylinder, bucket, folder, web browser, terminal), icons placed on deployment nodes, and a key generated from the diagram and included in exports. Style import from Structurizr and C4-PlantUML (#325) follows. The C4 model prescribes no notation; this follows its published examples.

The same release makes C4X agent-ready, so people and AI coding agents author C4X through the same syntax, the same checks and the same renderer. An agent can write a diagram, validate it, lint it and render it to check its own work, with no Gemini API key: a render tool beside the existing validate and lint tools in the MCP server, one generated syntax reference, a published agent skill, the server registering itself in VS Code, an installable package, plugins for Claude Code, Codex and Gemini CLI built from the same sources, and generation through the VS Code model picker or the user's own assistant. The extension asks for a Gemini key only when none of those is present. The tools take text and return text; they do not read files, reach the network or run commands, except one fixed, hash-checked icon data file. The evaluation suite that gates agent quality on three assistants is planned (#360).

## 1.10.0 — Agent-ready C4X, the rest

A high-level design skill that writes C1, C2 and C3 in one checked document, a layout quality report that catches a diagram that parses and lints clean but draws badly, structured generation in the extension's own Gemini path, listing and directory documentation, and the relaunch.

## 1.11.0 — More checkers

The architecture check gains a second target: ArchUnit-family PlantUML, alongside the dependency-cruiser allow-list that 1.8.0 ships. No checker is bundled into the extension.

C4 has no formal standard. These checks follow the C4 model's published diagram review checklist; they are not a certification.

## 1.12.0 — Navigate larger models

Planned work includes [cross-file C1/C2 navigation](https://github.com/jpantsjoha/c4x-vscode-extension/issues/25) and [organisation-specific icon packs](https://github.com/jpantsjoha/c4x-vscode-extension/issues/26). Once views can refer to each other across files, coherence rules check that they agree, and a semantic diff reports which elements and relationships a pull request changes; both need the cross-file index this release adds. These capabilities remain proposals.

## Authoring — add, delete, refresh from code (no release assigned)

An [element palette](https://github.com/jpantsjoha/c4x-vscode-extension/issues/22) and [deletion of elements and relationships with dependent-relationship review](https://github.com/jpantsjoha/c4x-vscode-extension/issues/23), together with provenance (which parts of a diagram were generated, edited or written by hand) and a Refresh that updates a generated diagram from code without losing hand edits. Each source-changing gesture must preserve valid source, show a reviewable diff, support keyboard interaction, and pass focused writeback and browser regressions. These are proposals until a release is assigned.

## Reliability follow-ups

Relationship-label placement during drag, resize-handle polish, and mixed boundary/node edits remain bounded follow-ups. They do not change the source-authority contract and are not release claims.

Use the [README](../README.md) for available capabilities and the [documentation index](README.md) for user guides.
