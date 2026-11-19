# C4X Documentation Index

Version 1.9.2 is published (VS Code Marketplace and Open VSX, 2026-11-19): the C4 notation refresh, the c4x agent skill and assistant plugins, `render_c4x`, generation with a VS Code chat model and an npm package; it carries 1.8.1 to 1.9.0. See the [release notes](releases/README.md), the [changelog](../CHANGELOG.md) and the [README](../README.md) for current capabilities and known limitations. Pages carry a version and date stamp; where one is older than 1.9.2, check it against the changelog.

## Start here

1. [Quick Start](QUICK-START.md)
2. [User Guide](USER-GUIDE.md)
3. [C4X syntax reference](c4x-syntax.md) — and the [generated C4X reference](reference/c4x-reference.md), one page and one JSON file (`docs/reference/c4x-reference.json`) built from the grammar and the lint catalogue, for people and assistants
4. [C4X lint rules](C4X-LINT-RULES.md) — what the Problems panel checks, and how to tune it; [outside VS Code](C4X-LINT-CLI.md), the same rules in a hook, CI or an agent
5. [Examples](EXAMPLES.md)
6. [FAQ](FAQ.md) and [Troubleshooting](TROUBLESHOOTING.md)

## Guides and examples

- [Install the C4X tools from npm](C4X-NPM.md): the `c4x` package (MCP server, `c4x render`, `c4x-lint`)
- [Render C4X outside VS Code](C4X-RENDER.md)
- [Gemini guide](GEMINI_GUIDE.md)
- [Generate with a VS Code model, no API key](GEMINI_GUIDE.md#without-a-gemini-key-use-a-vs-code-model)
- [Visual image generation](DIAGRAM-WITH-GEMINI-IMAGE.md)
- [Icons and sprites](ICONS.md)
- [Layout and direction examples](EXAMPLES-LAYOUT.md)
- [Ordering examples](EXAMPLES-ORDERING.md)
- [Architecture patterns](EXAMPLES-PATTERNS.md)
- [C4 view levels](EXAMPLES-VIEWS.md)
- [PlantUML C4 examples](EXAMPLES-PLANTUML.md)
- [Cloud icon examples](EXAMPLES-with-ICONS.md)
- [Product roadmap](ROADMAP.md)
- [Release notes](releases/README.md)
- [C4X element types](C4X-ELEMENT-TYPES.md)
- [Gemini generation guidelines](C4X-GENERATION-GUIDELINES.md)
- [Marketplace and product references](marketplace/README.md)

## Visual editing

Open a diagram, choose **Edit C4 Diagram**, select an element and edit or move it. Inspect the staged source diff, then choose **Save Changes** or **Discard**. Existing capabilities include element metadata and identifier editing, relationship creation and editing, boundary layout, and native/sidecar persistence. Palette creation and deletion remain planned.

Save important changes before closing or switching diagrams. Camera-only persistence and draft identity/migration are still being improved; the README records the current limitations.
