# C4X Product Roadmap

## 1.7.0 — Released

C4X 1.7.0 was published to the VS Code Marketplace and [public GitHub](https://github.com/jpantsjoha/c4x-vscode-extension/releases/tag/v1.7.0) on 2026-09-07. It combines runtime Gemini model discovery and healing with visual-editor reliability improvements, including boundary geometry, model-setting changes and draft-recovery feedback.

The released package passed automated checks, including installed rendering on Windows, macOS and Linux. Broader manual editing, recovery and export journeys remain follow-up validation; publication does not imply that every known limitation is resolved. Open VSX publication remains pending. See the [release notes](../CHANGELOG.md) for shipped behavior and known limitations.

## 1.8.0 — Complete authoring and draft recovery

Planned work includes:

- [add elements from a C4-aware palette](https://github.com/jpantsjoha/c4x-vscode-extension/issues/22);
- [delete elements and relationships with dependent-relationship review](https://github.com/jpantsjoha/c4x-vscode-extension/issues/23);
- [harden draft identity, schema migration and ambiguous Markdown-fence recovery](https://github.com/jpantsjoha/c4x-vscode-extension/issues/24);
- migrate Gemini calls from the deprecated `@google/generative-ai` SDK to `@google/genai`.

Each source-changing gesture must preserve valid source, show a reviewable diff, support keyboard interaction, and pass focused writeback and browser regressions.

## 1.9.0 — Navigate larger models

Proposals include [cross-file C1/C2 navigation](https://github.com/jpantsjoha/c4x-vscode-extension/issues/25) and [organisation-specific icon packs](https://github.com/jpantsjoha/c4x-vscode-extension/issues/26). Scope and delivery dates are not committed.

## Reliability follow-ups

Camera-only persistence, relationship-label placement during drag, resize-handle polish, and mixed boundary/node edits remain bounded follow-ups. They do not change the source-authority contract and are not release claims for 1.7.0.

Use the [README](../README.md) for available capabilities and the [documentation index](README.md) for user guides.
