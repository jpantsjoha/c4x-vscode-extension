# C4X Documentation Index

> **Version line**: v1.4.x public release; the v1.6 Visual C4 Editor is on its private integration branch for UAT.
> **Status reconciled**: 2026-07-16

C4X provides deterministic C4 diagrams in VS Code from native C4X, Structurizr DSL, and supported PlantUML C4 sources. The private v1.6 integration branch includes the source-controlled Visual C4 Editor for user acceptance testing; the public Marketplace line remains v1.4.x until release preparation is complete.

## Start here

1. [Quick Start](QUICK-START.md)
2. [User Guide](USER-GUIDE.md)
3. [C4X syntax reference](c4x-syntax.md)
4. [Examples](EXAMPLES.md)
5. [FAQ](FAQ.md) and [Troubleshooting](TROUBLESHOOTING.md)

## User guides and examples

- [Visual editing capability matrix and Known Limitations](features/visual-c4-editor.md)
- [How to edit a C4 diagram visually](how-to/edit-a-c4-diagram-visually.md)
- [Visual C4 Editor Wiki](https://github.com/jpantsjoha/c4x-vscode-extension/wiki/Visual-C4-Editor) — in-repo source: [`../wiki/Visual-C4-Editor.md`](../wiki/Visual-C4-Editor.md)
- [Gemini guide](GEMINI_GUIDE.md)
- [Visual image generation](DIAGRAM-WITH-GEMINI-IMAGE.md)
- [Icons and sprites](ICONS.md)
- [Layout and direction examples](EXAMPLES-LAYOUT.md)
- [Ordering examples](EXAMPLES-ORDERING.md)
- [Architecture patterns](EXAMPLES-PATTERNS.md)
- [C4 view levels](EXAMPLES-VIEWS.md)
- [PlantUML C4 examples](EXAMPLES-PLANTUML.md)
- [Cloud icon examples](EXAMPLES-with-ICONS.md)

## Product and delivery state

- [Product roadmap](ROADMAP.md)
- [Current status](../STATUS.md)
- [Improvement and delivery plan](../IMPROVEMENT-PLAN.md)
- [Changelog](../CHANGELOG.md)
- [Technical debt](TECHNICAL-DEBT.md)

## Architecture and decisions

- [High-level design](architecture/high-level-design.md)
- [Visual Layout low-level design](architecture/visual-layout-interaction-low-level-design.md)
- [Architecture index](architecture/README.md)
- [ADR index](adrs/README.md)
- [ADR-018: Source-Controlled Visual Layout Mode](adrs/018-source-controlled-visual-layout-mode.md) (formal decision acceptance remains open)
- [TDR-013: Layered visual validation](adrs/TDR-013-visual-validation-strategy.md)

## Engineering runbooks

- [Runbook index](runbooks/README.md)
- [Milestone validation and merge](runbooks/milestone-validation-and-merge.md)
- [Clean packaged-VSIX smoke](runbooks/clean-vsix-smoke.md)
- [Pinned toolchain reproduction](runbooks/toolchain-reproducibility.md)
- [Visual Layout Mode and safe source writeback](runbooks/visual-layout-mode.md)

## Visual Layout status

The current standalone preview on `main` supports open, refresh, source-safe drag and keyboard movement, staged Save/Discard, native `.c4x` field editing (label, technology, description, tags, and sprite), safe identifier rename, relationship label editing, reset, and deterministic sidecar persistence for `.c4x`, `.dsl`, and `.puml` documents. This integrated capability is ready for UAT, but it must not be described as Marketplace-released while the public version remains v1.4.x. Markdown Preview C4X fences expose the same staged editor via CodeLens, context menu, and the preview toolbar (B18); direct node creation and relationship add/delete/connect are not implemented.

Use the [visual editing how-to](how-to/edit-a-c4-diagram-visually.md) for the current workflow and the [capability matrix](features/visual-c4-editor.md) for the verified/planned boundary. The [Visual Layout runbook](runbooks/visual-layout-mode.md) retains engineering and UAT detail. The roadmap and epic #29 retain the release and follow-on scope decisions.

The internal [Visual Layout launch plan](marketplace/VISUAL-LAYOUT-LAUNCH-PLAN.md) defines evidence, sample, screenshot, demo, release-note, and copy requirements without claiming current availability.
