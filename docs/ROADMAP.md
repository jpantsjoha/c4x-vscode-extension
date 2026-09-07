# C4X Product Roadmap

## 1.7.0 release candidate

The 1.7.0 candidate combines runtime Gemini model discovery and healing with visual-editor reliability improvements. It preserves authored boundary positions and minimum sizes, updates enclosing boundaries during drag and revert, keeps client and host edge routing aligned, applies direct model-setting changes, and reports draft entries that cannot be restored.

The candidate's eight CI checks are green, covering both Node versions, documentation, dependency security, browser tests and packaged rendering on three operating systems. Separate local receipts cover coverage, performance, live Gemini generation and public-export rehearsal. The VSIX smoke installs the package into an isolated profile and requires a fresh receipt from rendered webview nodes and labels.

The release remains on **HOLD** until the installed C1/C2/C3 and Markdown journeys pass, the P0 harness acceptance gaps are closed, and the proposed Visual Layout decisions have the evidence and approvals their records require. Older audit findings are dated evidence rather than the current backlog.

## 1.8.0 — Complete authoring and draft recovery

Planned work includes:

- add elements from a C4-aware palette;
- delete elements and relationships with dependent-relationship review;
- harden draft identity, schema migration and ambiguous Markdown-fence recovery;
- migrate Gemini calls from the deprecated `@google/generative-ai` SDK to `@google/genai`.

Each source-changing gesture must preserve valid source, show a reviewable diff, support keyboard interaction, and pass focused writeback and browser regressions.

## 1.9.0 — Navigate larger models

Planned work includes cross-file C1/C2 navigation and organisation-specific icon packs. These capabilities remain proposals.

## Reliability follow-ups

Camera-only persistence, relationship-label placement during drag, resize-handle polish, and mixed boundary/node edits remain bounded follow-ups. They do not change the source-authority contract and are not release claims for 1.7.0.

Use the [README](../README.md) for available capabilities and the [documentation index](README.md) for user guides.
