# Change Log

All notable changes to the "c4x" extension will be documented in this file.

## [Unreleased]

## [1.9.2] - 2026-11-19

The first release since 1.8.0 to be published. It carries everything in 1.8.1 to 1.9.0, which were tagged and not published (see those sections), and the changes below.

### Fixed

- **Large diagrams no longer freeze the editor.** A view too large to lay out at once is arranged in a background worker with a 2 second limit. The Markdown preview and Markdown export share one 2 second budget for each render, and when it runs out you get a timeout message instead of a frozen window (#454).
- **A deployment node no longer drops content silently.** A `subgraph`, a boundary block or a `direction` statement inside a deployment node now raises the warning `C4X-L116`, and the rest of the diagram still renders (#472).

### Changed

- The run guide covers an isolated VSIX install, offline use versus a key, troubleshooting and cleanup, and tells you to clone the repository you received (#539, #540, #543).
- The README package-size statement matches the measured package, 1.94 MB.

### Maintenance

- One dated exception covers the advisory GHSA-fc5q-39xc-vjpf in `picomatch`, a build-time dependency with no patched version; it expires on 2026-12-18. The package, the MCP server bundle and the npm package do not contain it (#537).
- OVERVIEW.md, DEPENDENCIES.md and the README state of publication were brought up to date (#548).

### Known limitations

- Nested deployment nodes can be drawn outside their parent when a relationship crosses between nodes (#418).
- The folder-generation check for files that may hold credentials can miss an unquoted secret value inside a long multi-line string (#509). Review the file list shown before generation sends it.
- Routed arrows avoid boxes but not each other, so several can share a channel (#486). A routed arrow still attaches to the bounding box of a curved shape instead of its outline (#493). During a drag in the Visual C4 Editor, connected arrows stay straight until Save.
- With Gemini, **Diagram from Selection** sends the selected text once, to suggest a diagram type, before the confirmation; the VS Code model route skips that step (#392).

## [1.9.0] - 2026-11-17

C4 notation refresh and agent-ready core. Work on `main` since 1.8.1.

### Added

- **One generated C4X reference.** `docs/reference/c4x-reference.json`, its Markdown form and a JSON Schema are built from the grammar, the model builder, the style resolver and the lint catalogue, and a drift test in the pull-request gate fails when they disagree. The Component, Node, Person and System signatures, comment syntax, text limit and lint-severity guidance pages now match it (#354, #422).
- **C4 shape set.** `$shape` draws person, cylinder, bucket, folder, web browser, terminal, box and rounded box. Name, `[technology]` and description wrap inside each shape's own text area, and the `c4-model` theme draws a Person as a head over a rounded body unless it has its own `$sprite`. Other themes draw a Person as before. A Person with a description grows taller in `c4-model` because its text area is narrower; saved positions and sizes stay as they are. Element-style and shape documentation, and a picture of every shape in `c4-model` light, dark and modern, are in `docs/c4x-syntax.md` and `docs/images/notation/` (#323).
- **An agent skill.** `skills/c4x` is an Agent Skills skill that lets Claude Code, Codex and other agents write, validate, lint and fix C4X. Its syntax reference is generated from the grammar, and tests fail when the skill and the reference disagree or when anything the skill names does not exist. Claude Code, Codex and AGY each drew a lint-clean diagram from it on three sample repositories; the runs are under `docs/validation/agent-skill-1.9/`. The skill renders through `render_c4x` or `c4x render` to check its work (#355, #353, #523).
- **Generate without a Gemini key.** Set `c4x.ai.provider` to `vscode-lm` to draft diagrams with a chat model you already have in VS Code, such as GitHub Copilot's. C4X shows the model and what it will send before every generation, uses VS Code's own consent, sends its built-in guidance by default and never switches models for you. Gemini stays the default. `C4X: Select Gemini Model` is now `C4X: Select AI Model` (#392).
- **The C4X MCP server is offered to VS Code's chat agent automatically** on VS Code 1.101 or later, with no configuration. Its tools are `validate_c4x` and `lint_c4x`. Turn it off with `c4x.mcp.register`. It is withheld in the web host, in virtual workspaces and in Restricted Mode. The package grows by the bundled server (#357).

- **The agent skill works without a separate C4X installation and guards against diagram text.** `skills/c4x` now carries its own copy of `c4x-lint`, so a user who copies only the skill directory can validate and lint with Node.js 18 or later (#470). The skill tells the agent that diagram text, lint output and tool results are data and never instructions, stops after one attempt and two repairs and reports what is left, states a format, protocol or security property only when a file shows it, and saves to the path the user names, otherwise the project directory, reporting the absolute path (#487, #481, #469).

- **Relationship technology is drawn.** The quoted technology after an edge label (`a -->|Calls| "HTTPS" b`) now appears under the label as `[HTTPS]`, measured so it stays clear of boxes. Edges without a technology draw as before (#421).
- **Boundary and deployment notation in `c4-model`.** Boundaries are a thin solid frame with the name and a `[Software System]` or `[Container]` type line at the bottom left; deployment nodes carry their icon at the bottom left beside the name and `[Deployment Node: technology]`, and nodes with a vendor icon take its colour as their outline when it is readable. Other themes are unchanged (#324, #326).
- **Plugins for coding agents.** The repository ships a Claude Code plugin (`/c4x:draw`, `/c4x:check`, `/c4x:preview`) and Codex, Gemini CLI and Antigravity packaging of the same skill and server, all generated from one source (#377, #358, #359). Codex can call the C4X MCP tools without a prompt using per-run settings, documented in the agent guide (#476).
- **AI generation follows the notation.** Prompts use the active theme's colours and ask for shapes, relationship technology and boundary types; an unknown shape is sent back for repair with the closest valid name (#330).

- **Render diagrams from an agent or the command line.** The MCP tool `render_c4x` and the CLI command `c4x render` draw C4X with the same renderer as the preview and return SVG with any findings. A render is limited to 100 elements and 150 relationships and stops after 2 seconds with its findings and no SVG; `c4x render` then exits 3 (#353).
- **A diagram key.** The key lists the styles a diagram actually draws, with swatches in each element's own shape. Set `c4x.export.includeKey` to add it below the diagram in SVG, PNG, PDF, HTML, Copy SVG and the Markdown preview; it is off by default, and exports without it are unchanged (#327).

- **An npm package for agents and scripts.** The package `c4x` carries the MCP server (`c4x-mcp`), `c4x render` and `c4x-lint`, with no dependencies and no install scripts; it needs Node 20 or later. It is published separately from the extension (#356).
- **Snippets and completions offer the new notation.** Shape names, `$shape`, `$stroke`, `$legend` and the other element-style attributes complete as you type, and the snippets insert valid C4X (#332).

### Changed

- **Folder generation leaves out more files that may hold credentials.** The content check that keeps such files out of what is sent to the AI provider now covers more key formats and errs on the side of leaving a file out (#485).
- **Person and system descriptions render as plain text (#420).** The third argument of `Person`, `System` and their `_Ext` and `Db` variants is the description, and every theme now draws it as plain text under the name. Before, it was drawn as `[description]` in the italic technology style. Existing diagrams change with no source edit. Containers and components keep their `[technology]` line; a person or system written with two text arguments, `System(id, "Name", "Technology", "Description")`, keeps its technology. Editing the description in the Visual C4 Editor saves it back to the same argument.
- **Long element text wraps inside its shape (#340).** A label, `[technology]` or description wider than its box now breaks onto more lines inside the element, and the box grows taller to fit. This applies in every theme, in the preview, in the Visual C4 Editor and in SVG, PNG, HTML and PDF exports. Before, such text ran past the box and over neighbouring elements. Widths do not change, and text that fits is drawn as before. An element shows at most 3 lines of label, 2 of technology and 6 of description; text past that ends in an ellipsis, with the full text on hover. In a diagram with saved positions or frame geometry (for example one arranged in the Visual C4 Editor), and in edit mode, no box grows and the layout stays as before; long text there is shortened. Entering edit mode on a diagram whose boxes grew redraws it at the standard sizes first, and edit mode now stays on when the same diagram redraws. Only Latin, Greek and Cyrillic text wraps; text in other scripts is drawn as before (#459).
- **Exported SVG text matches the preview (#340).** The Export SVG file's stylesheet no longer overrides the drawn text, so element names and boundary labels are bold, technology and descriptions are 12 px (11 px under an icon), edge labels are 12 px and the diagram title is 20 px bold, as in the preview. Before, every text in an exported SVG was drawn at the theme's base size (14 px; 13 px in `muted`, 16 px in `high-contrast`) and regular weight. Every exported SVG changes; PNG, HTML and PDF exports were not affected.
- **Element type line in `c4-model` (#348).** The `c4-model` theme prints each element's C4 type under its name, `[Person]`, `[Software System]`, `[Container: technology]`, `[Component: technology]`, `[Deployment Node: technology]`, in the preview, the editor and exports. The line replaces the bare `[technology]` line. Other themes are unchanged, so the line is visible only in `c4-model` until the default theme changes (#475).
- The build reports the bundle against one 3.5 MB planning target, as information only. The stale 1 MB and 1.5 MB thresholds are gone (#234). The bundle now meets the target, at about 2.8 MB (#464).
- **A smaller package.** The AWS and Azure icons ship once, as one data file the extension, the MCP server and `c4x render` share, checked against a SHA-256 fingerprint built into each; a missing or altered file is reported, not drawn. The VSIX fell from 2.6 MB to 1.8 MB (#534).
- **Folder generation shows what it will send.** Generating from a folder skips guidance documents and files that commonly hold credentials, and shows the files it will send, and those it left out, before it sends them. This applies to Gemini and to the VS Code model route. Gemini users see one new confirmation per generation. `docs/GEMINI_GUIDE.md` lists what is sent (#392).

### Fixed

- **Relationship arrows no longer pass through unrelated elements.** An arrow whose straight line would cross another box is routed around it with horizontal and vertical segments, and the drawn line follows the routed points. The label of a rerouted arrow moves to the middle of its longest segment. Arrows that cross nothing are unchanged. Some existing diagrams change in every theme: 44 of the 234 diagrams in the compatibility corpus draw at least one rerouted arrow (#419).
- The element catalogue no longer lists `DeploymentNode` or `SoftwareSystem_Ext`, which the model builder rejects (#449).

### Security

- The MCP server and `c4x-lint` enforce documented input limits (nesting 32 levels, 2,000 elements, 5,000 relationships, 4,096 characters per text field, 256 entries per attribute list; finding `C4X-LIMIT`), escape control characters in quoted diagram text and answer malformed requests with JSON-RPC errors. Diagram identifiers are escaped in SVG output, and SVG stays well-formed when a label holds a control character. `SECURITY.md` states the contract (#362).

### Maintenance

- The release gate refuses a tag when a requirement recorded for the release is neither Covered in the traceability matrix nor deferred with an issue (`make verify-release-requirements`, part of `make check-full`), and a release checklist covers both published releases and private baselines (#370).
- The npm staging directory is left out of the VSIX (#532), and the skill's render step uses `render_c4x` or `c4x render` (#523).
- A release tag on a maintenance branch (`release/MAJOR.MINOR.x`) passes the release-ref check when its commit is on that branch (#455, #456).
- Generation runs through one provider-neutral repair loop, one attempt plus two repairs per model. No user-visible change (#393).
- Screenshot tests stay strict. The editor-chrome screenshot no longer depends on the native resize grip of a text area, which Chrome Canary draws differently from the stored baseline on macOS, and `playwright.config.ts` no longer carries a tolerance setting Playwright ignored (#477).
- The README package-size statement matches the measured package (#489). The exact-match check will fail again at each size change until #490 is done.
- The dogfood run that wrote C4 views of this repository with an assistant, with no Gemini key, is recorded under `docs/validation/dogfood-2026-11-14/` (#424, #351).

### Known limitations

- Routed arrows avoid boxes but not each other, so several can share a channel (#486). Where a routed arrow bends or is offset, it still attaches to the bounding box of a curved shape instead of its outline (#493). During a drag in the Visual C4 Editor, connected arrows stay straight until Save.
- The agent evaluation suite, which scores Claude Code, Codex and Antigravity on C4X tasks as a release gate, is planned (#360).
- With Gemini, **Diagram from Selection** sends the selected text once, to suggest a diagram type, before the confirmation; the VS Code model route skips that step (#392).

## [1.8.3] - 2026-11-15

Tagged `v1.8.3` at `8f9c2e4` on `release/1.8.x`. Not yet published; the published version is still 1.8.0.

### Fixed

- Folder generation no longer reads credential files, and shows what it will send before sending.

## [1.8.2] - 2026-11-15

Security hardening for diagram rendering and the MCP server. Tagged as a private baseline; not published. Details will be published with v1.9.0.

## [1.8.1] - 2026-11-15

Tagged `v1.8.1` at `6914d43`, not published (private baseline). The published version is still 1.8.0. These entries reach users with 1.9.0.

### Added

- **Preview: the notation items in this section.** The `c4-model` theme, tag styles with `elementStyle`, `$shape`, the dark variant and the style diagnostics `C4X-L107` to `C4X-L115` are a preview. They are on `main` ahead of the C4 notation refresh planned for 1.9.0, `classic` stays the default theme, and diagrams that use none of them render as before. More shapes and a generated key come with 1.9.0 (#319).
- **`c4-model` theme (preview).** A seventh diagram theme follows the examples c4model.com publishes: white boxes with coloured outlines and text, green for people, blue for the systems, containers and components in scope, red for external systems, dark grey dashed relationships and a thin solid boundary. The theme also carries orange, teal and purple accents, with darker text tones for orange and teal so text keeps at least 4.5:1 contrast on white; each external element takes the next accent in declaration order (see below). Select it with `c4x.theme` or **C4X: Change Theme**; the default stays `classic`. More shapes and a generated key follow in later 1.9.0 work (#321, #319).

- **Element styles and shapes (preview).** A top-level `elementStyle <Tag> $key="value", …` statement styles every element carrying that tag, and `$shape="<Name>"` gives one element its own shape. Keys are `$stroke`, `$background`, `$color`, `$shape`, `$sprite`, `$border`, `$strokeWidth` and `$legend`; values are quoted. Styles apply over the theme in a fixed order (theme, then tag styles, then the element's own settings), live in the source and survive visual-editor Save, which refuses to write a change that would drop them. An unknown key, a bad value, a repeated key or a shape C4X cannot draw yet is reported in the editor, in `c4x-lint` and in the MCP `lint_c4x` tool (`C4X-L107` to `C4X-L115`), and the element still renders, as a rectangle where its shape is unknown. Shapes beyond box, rounded box and cylinder arrive in later 1.9.0 work. Existing diagrams that use none of this render as before (#322).
- In the `c4-model` theme (preview), each external system, external container, external component and external deployment node takes the next accent colour (red, orange, teal, purple) in the order it is declared (#322).
- When VS Code uses a dark or high-contrast colour theme, the `c4-model` theme (preview) switches to a dark variant in the preview, with every label at least 6:1 against its background. Exported SVG, PNG, HTML and PDF files and **Copy SVG** keep the light variant, because they are read outside the editor. An open preview redraws when you change VS Code's colour theme, keeping staged edits (#329).

### Changed

- **A refused Save keeps your edits on screen.** Before, a refused Save (for example when the source changed under the draft) discarded the staged edits and reloaded from source, and some refusals left the preview stuck on "Saving…". Now the edits stay staged, Save is available again where it can work, the reason is shown, and **Discard** reloads from source. While the conflict banner shows, the banner's actions apply (#442).
- The `c4x.theme` setting now lists all seven themes, including `c4-standard`, which the extension already offered in **C4X: Change Theme** but the setting did not, and each description says what the theme looks like. `classic` was described as the official C4 colours; c4model.com prescribes no colours. When the setting holds a value C4X does not know, the extension now falls back to `classic`, the setting's default, instead of `c4-standard` (#321).
- Changing the `c4x.theme` setting now restyles an open preview without a reload. It used to apply only through **C4X: Change Theme** or after a reload (#390).
- The model list carries Google's current retirement dates. Gemini 2.5 Pro and 2.5 Flash now read 2026-12-01 instead of 2026-10-16, and 2.5 Flash Image reads 2027-03-15. `gemini-omni-1.2-flash` is listed and `gemini-omni-1.1-flash` is listed with its 2026-12-03 sunset. The defaults do not change (#290, #425).
- When a file changes on disk while you are editing, the editor now says plainly that the staged edits cannot be saved onto the new version and tells you to close and reopen the editor. Rebase offers no way to keep the draft yet; that follow-up is #417. A Save that is refused now keeps your edits (below) (#293, #406).

### Fixed

- **Structurizr files with positional strings now keep their braces in step, and some broken files now report the line.** The parser did not read the positional strings after an element name (`softwareSystem "Name" "Description" "Tags"`), so the braces that followed fell out of step and a `views` block could vanish with no error. It now reads the description, technology and tags in the Structurizr order (`person` and `softwareSystem`: description, tags; `container` and `component`: description, technology, tags), and a `description` or `technology` line in a body sets its own field. A missing closing brace, a `views` block after the workspace's closing brace, a model with no elements and a workspace with no views report the line and the cause instead of drawing nothing. Other irregular files still render best-effort: an extra closing brace at the end, `views` inside an element body and `styles` inside the model are recovered, and a view of an element that is not defined still draws. Surplus positional strings, unknown identifiers and `theme` lines are skipped without an error. A file that rendered before only because the braces miscounted can now report an error. Not yet handled: relationship identifiers, `#` comments and dotted or hyphenated identifiers (#436) (#242, #426).
- **A workspace that would draw nothing shows a message instead of a blank preview.** A Structurizr workspace with no views, or a model with no elements, says which it is and where (#426).
- **Unsaved edits survive a theme change and Refresh Preview.** While the preview holds staged edits, changing `c4x.theme`, switching VS Code between a light and a dark colour theme, or running **C4X: Refresh Preview** no longer discards them. The preview keeps the edits, shows "Theme change or refresh will apply after you save or discard.", and applies the change once you Save or Discard. With no unsaved edits, a source change still re-renders at once; with unsaved edits, a real change to the diagram source raises the conflict banner (#408, #432, #439).
- **Saving the text editor no longer discards unsaved visual edits.** A text save, an autosave, or an edit to a Markdown file outside the diagram's fence used to clear staged edits. The preview now keeps them and catches up after you Save or Discard, and Save still works afterwards when the diagram itself is unchanged. A real change to the diagram source raises the conflict banner (Reload, View diff, Rebase) instead of discarding the draft. Switching the preview to another document still discards it (#439, #442).
- **A Save that stores positions in the layout file checks the source first.** This applies when `layout.persistence` is `sidecar`, and always for Structurizr and PlantUML. The Save now checks that the source is unchanged immediately before it writes, and refuses and writes nothing if it changed. Before, a source change during the Save could go undetected and the Save reported success. A layout file that cannot be read, or is not valid JSON, now refuses the Save, names the file and leaves it untouched; before, it could be overwritten. When one Save changes both the text and the positions and the positions cannot be written, the text edit stands and the message says so (#443, #444).
- **A keyboard move of a multi-selection keeps its shape at the canvas edge.** Moving a selection with the arrow keys into the left or top edge squashed the nodes together and staged the squashed positions. The group now stops at the edge as a unit, as it does when you drag it, and the positions staged are the positions shown (#423, #442).
- **C4X: Refresh Preview reaches Markdown fence editors.** It refreshed only the standalone preview before (#429, #432).
- **C4X: Change Theme works with no folder open.** It tried to save the setting at workspace scope, failed, and left the theme switched but unsaved. It now saves to your user settings when no folder is open, and restores the previous theme with an error message if the write is rejected (#399, #404).
- **The export save dialog opens beside the source.** With a `.c4x` file active, **C4X: Export SVG** suggested a folder that does not exist, and **C4X: Export Diagram as PNG** suggested the workspace root. SVG, PNG and **C4X: Export Markdown to HTML** now share one rule and suggest the folder of the open source file with its base name (#435, #437).
- **The first drag of an unpinned boundary no longer moves its children again on Save.** The editor showed the boundary where you dropped it, but the saved layout measured its position from a different origin, so its contents shifted after Save. The saved frame now matches what the editor showed (#346, #350).
- **The MCP server reports the package version.** It announced `1.4.0` whatever the release; it now reports the version of the package it ships in (#427).

- AI generation prompts no longer tell the model to write a dotted relationship as `..>`, which the parser rejects; they name the three arrows it accepts (`-->`, `-.->` for asynchronous, `==>` for synchronous). The built-in guidance example now parses, and the prompts list every element type C4X accepts instead of seven. A generation that followed the old prompt failed validation and used one of its three attempts on a correction (#387).
- A `Container_Boundary` nested inside a `System_Boundary` is now drawn inside it. The parser had dropped which boundary contained which, so the inner boundary was laid out below its parent. Moving a nested boundary in the visual editor now keeps it inside its parent before Save, keeps boundaries and elements pinned with `$x`/`$y` where they are, and keeps an earlier staged move of an inner boundary when its parent moves. Rebase now refuses a staged boundary edit when two nested boundaries cannot be told apart (#339).

- A Rebase after an external change no longer lets a staged relationship or boundary edit be saved onto a different statement. Relationship and boundary ids are positional, so Rebase now compares what each staged id named before and after the change and, when one moved or cannot be told apart from another, refuses with the reason and asks you to reload the draft (#261).
- Pan, wheel zoom, Fit, Reset and zoom buttons now remember the camera across preview reloads. A restored camera takes precedence over auto-fit; a hidden viewport cannot replace it with zero-sized framing.
- Drafts now belong to the exact source content of their native file or Markdown fence. Changed source, including whitespace, rejects the old scoped draft with a notice. Identical fences disable persistence and explain that changes must be saved before reload. An older draft without a source identity remains unchanged until the user explicitly restores it to the visible diagram or discards it; recovery retains staged connect relationships as well as moves and property edits.

### Security

- Dependencies are updated to clear the high-severity advisories open since 2026-10-09, among them `markdown-it` 14.3.3 inside the extension package. `pnpm audit --audit-level=high` reports none and `make cve-scan` passes; the remaining findings are low or moderate and in development tools (#292, #400).

### Maintenance

- The packaged-extension smoke test now installs the VSIX and checks every contributed command, C1, C2, C3 and Markdown rendering, all seven themes, edit with Save and reopen, Discard, and SVG, PNG and HTML export. It runs on every release gate (#368, #397).
- Unit coverage is held per source directory as well as overall, and the draft-survival tests share one child process so they no longer time out under coverage (#367, #239, #403).
- Tests now cover the real dirty-state guard, Save with generated styles and shapes, the Gemini model dates, the export default path and the Structurizr positional rules (#174, #369, #409, #425, #437, #438, #426).
- A compatibility corpus of 234 published diagrams and an upgrade test for a 1.8.0 workspace run in the gate, and the Save transaction has property-based tests (#365, #366, #288, #384, #385, #300).
- The architecture documents, developer guide and runbooks describe 1.8.0 and `main` (#305, #407). The Markdown lint reaches files at every depth (#236, #405).

### Known limitations

- An element's description is drawn as bracketed italic technology text for Person, System and External elements, and a relationship's technology is parsed and linted but never drawn (#420, #421). Both change in 1.9.0, for every theme, and the release notes will say so.

## [1.8.0] - 2026-10-15

### Added

- **C4 notation lint.** Every `.c4x` file and Markdown `c4x` fence is checked against the C4 diagram review checklist, and what is missing appears in the Problems panel beside syntax errors: containers and components without a description or technology, unlabelled and one-word relationship labels, relationships that cross a process boundary (between two containers or systems, or a component and a container or system) without a protocol, neighbouring software systems not marked external, elements drawn at the wrong C4 level, and elements with no relationship. The level check reuses C4X's table of C4 nesting rules, until now applied only to relationships drawn in the visual editor, so a component in a system context view — which parses cleanly — is now reported. Each finding carries a stable rule id (`C4X-L001` to `C4X-L006`, `C4X-L008`, `C4X-L102`), a fix, and the matching Structurizr inspection name where there is one. Every rule defaults to `info` and nothing blocks the preview; `c4x.lint.enabled` turns lint off, and `c4x.lint.rules` sets any rule to `off` (or Structurizr's `ignore`), `info`, `warning` or `error`. Rules, examples and limitations: [C4X lint rules](docs/C4X-LINT-RULES.md) (#214).
- **C4 coherence lint.** Five more rules check that a view hangs together, not only that it is complete: a component view decomposes exactly one container (`C4X-L101`), a relationship does not reach into a component of a different container (`C4X-L103`), no two elements in one boundary share a name (`C4X-L104`), a container or component view actually draws a container or component (`C4X-L105`), and a relationship does not join an element to the element that contains it (`C4X-L106`). They never repeat a nesting-rule finding (`C4X-L006`): where that rule speaks they stay quiet, and a test holds the two sets disjoint. Every new rule defaults to `info` and is configured through `c4x.lint.rules` like the others. Across `samples/` they report 10 findings: 8 component views with no `Container_Boundary` and 2 repeated names (#215).
- Third-party icon notices (`NOTICE.md`) now ship inside the extension package, alongside the AWS, Azure and Google Cloud artwork inlined into the bundle.
- Licence notices for the open-source packages inlined into the extension bundle (markdown-it, dagre, lodash, the Gemini SDK and their dependencies) now ship inside the extension package as `THIRD_PARTY_NOTICES.txt`. The file is generated on every build from the bundle's module graph, and the build fails if a bundled package has no licence text or a licence outside the permissive allowlist. Earlier packages, 1.7.0 included, shipped without them.
- **C4 notation lint outside VS Code.** `c4x-lint` runs the same rules from a Git hook, a CI job or a terminal: `node c4x-lint.cjs 'docs/**/*.{c4x,md}' --format text|github|json|sarif --max-severity info|warning|error|off`. It lints `.c4x` files and `c4x` fences in Markdown, reads rule severities from an optional `.c4x-lint.json` in the shape of `c4x.lint.rules`, and exits non-zero only for findings at or above `--max-severity` (default `error`); a syntax error or a diagram that cannot be drawn is always an error. The `github` format emits workflow annotations and a job summary; SARIF 2.1.0 is opt-in. It is one dependency-free file, `cli/c4x-lint.cjs`, for Node.js 18 or later; it is not in the extension package. The repository is also a `pre-commit` hook repository (`id: c4x-lint`), and the MCP server gains a `lint_c4x` tool next to `validate_c4x`. Usage, hook recipes and an optional CI example: [C4X lint outside VS Code](docs/C4X-LINT-CLI.md) (#216).
- **Code mapping (`$code`):** a Container or Component can name the source files it owns, as one or more workspace-relative globs: `Component(parser, "Parsers", "Peggy", $code="src/parser/**, src/extension.ts")`. Structurizr DSL reads the same mapping from an element's `properties { "code" "..." }`. Hover shows how many files each glob matches, and completion offers `$code` and workspace paths. Visual editing leaves the attribute byte-for-byte unchanged. Globs are restricted to path-safe characters and at most three wildcards (#218).
- **Architecture conformance:** `C4X: Export Architecture Conformance` turns a component (C3) view into a dependency-cruiser allow-list, `.dependency-cruiser.c4x.json`: one rule per declared relationship, built from the `$code` globs, plus one same-component rule per component, so any undeclared import fails your CI as `not-in-allowed`. Components without `$code` are reported, never dropped. `C4X: Check Architecture Conformance from dependency-cruiser Result` maps the checker's JSON result back onto the `.c4x` lines as diagnostics: an undeclared dependency lands on its source component, and C4X adds what the checker does not report, namely dependency cycles between components and declared relationships that no import uses. When globs overlap, the most specific one owns a file, in both the rules and the mapping, so a file never inherits a second component's permissions. C4X also checks every import in the result against the view itself, and fails a result that cruised none or under half of the mapped source files (typically TypeScript run without `typescript` installed beside the checker). No checker ships in the extension; dependency-cruiser 18 needs Node 22 or later (#219).

### Changed

- Gemini calls go through Google's current SDK, `@google/genai` 2.24, instead of `@google/generative-ai`, which Google deprecated on 30 November 2025 (#181). Generation, image generation, model discovery, the one-heal, one-failover and three-attempt limits, and the error messages for a rejected key, a withdrawn model, an exhausted quota and an unreachable network all behave as before. The client talks only to the Gemini Developer API with your key. Environment variables such as `GOOGLE_GENAI_USE_VERTEXAI` or `GOOGLE_GEMINI_BASE_URL` cannot redirect it, and a stray `GOOGLE_API_KEY` cannot replace it. An API error C4X does not recognise now reads as the API's own code, status and message, for example `503 UNAVAILABLE: The model is overloaded. Please try again later.` The SDK loads on first AI use, not when the extension activates. The package grows from 1.27 MB (`main` at 571bc25, measured 2026-10-03) to 1.47 MB (measured 2026-10-14); the budget is 2.5 MB. Verified against the live Gemini API across all 7 shipped text and image models.

### Security

- Model discovery no longer puts your API key in the request URL, where a proxy or a log can keep it. It is sent in the `x-goog-api-key` header, as generation requests already were.
- The standalone MCP server bundle now embeds fast-uri 3.1.8, closing two high-severity advisories in URI serialisation and host parsing (GHSA-qw65-cvwx-89v3, GHSA-58mr-gqgx-xq4g). The extension package does not contain the MCP bundle, and its code is unchanged. Development tooling now resolves patched smol-toml, markdown-it, hono, ip-address and brace-expansion, and the high/critical dependency gate passes again (measured 2026-10-01); three moderate and one low development-tool findings remain, none in the production dependency graph (#210).
- The high/critical dependency gate (`make cve-scan`) passes again (measured 2026-10-09). The MCP SDK, a build-time dependency compiled into the standalone MCP server bundle, moves to 1.31.0, closing GHSA-6qxp-vccf-f47h (high; its OAuth client could send credentials to an authorization server the MCP server chose). The C4X server uses only the SDK's stdio server, so that client code was never in the bundle; the bundle is regenerated anyway. `proxy-addr` is pinned to 2.0.8 (GHSA-jqcg-44mw-7w3h, critical, IP spoofing through IPv4-mapped IPv6 trust subnets). It is reached only through the SDK's Express transport, which the bundle does not include (the override is scoped, `proxy-addr@<2.0.8`, so a later patched release is not held back). The SDK also gains a default 10 MB cap on its stdio read buffer: a single message larger than that to `validate_c4x` or `lint_c4x` now closes the transport with an error instead of being buffered without limit. One high advisory is accepted as a dated exception: GHSA-vfj7-8cjw-p6xm in `braces` 3.0.3, which has no patched release and is reached only through the Open VSX publishing tool. The exception is recorded beside the `cve-scan` target and dated in `scripts/audit-exceptions.json`; `make cve-scan` fails once 2026-11-07 passes, until it is renewed or removed. The extension package's code and dependencies are unchanged.

### Fixed

- Public exports exclude private author alias maps, with a privacy check that rejects accidental inclusion.

- **Markdown preview Edit links open the visual editor.** Links now identify the preview's source file and fence position using the IDE's URI handler. They no longer rely on blocked command links, an unrelated active editor, or a counter that drifts on repeated renders. Clicking Edit does not toggle diagram zoom. Exported HTML omits editor-only links. The source right-click command selects the fence under the cursor instead of always opening the first diagram.
- Whitespace-only bundle compaction reduces activation overhead while retaining source maps and third-party licence provenance. Installed walkthroughs wait for stable element positions before mouse input, fixing false drag and save failures without relaxing acceptance checks.

- Model discovery no longer sends a removed or replaced API key when credentials change during a SecretStorage read or SDK construction. It checks credentials immediately before dispatch; stale discovery falls back without caching, and a later discovery uses the current key (#232).

- **A `System_Boundary`, `Container_Boundary` or `Enterprise_Boundary` is no longer offered for dragging or resizing in the visual editor.** Edit mode offered to move and resize every boundary, but only a `subgraph` has a place in the grammar for `$x`, `$y`, `$w` and `$h`; a typed boundary dragged and saved was refused with "Boundary "Shop" is not written using supported subgraph syntax", which failed the whole Save and discarded every other staged change. Edit mode now leaves a typed boundary where it is: it cannot be dragged, resized or focused, hovering it in edit mode says why, a drag that starts on it pans the canvas, and its frame still follows its contents. Save stays all-or-nothing. A draft staged before this fix and restored after a reload no longer brings back a move or resize of such a boundary, and says so ("1 staged boundary change could not be restored: "Shop" cannot be moved or resized ..."); everything else in the draft is kept. If one still reaches Save, the Save fails with a message naming the boundary and its form, and the source is unchanged. Boundaries written as `subgraph` are unchanged; to position a boundary by hand, declare it as `subgraph Name $x="…", $y="…" { … }`, which loses its C4 type (the nesting-legality and `Container_Boundary` coherence lint rules no longer see it) (#271).
- **Save no longer fails when you connect from two different elements and change anything else in between.** Staging a relationship from `a`, a move of `c`, then a relationship from `d`, and pressing Save, was refused with "Ambiguous same-offset edits detected": every new relationship is written at the end of the diagram, but only insertions that were next to each other in the edit list were joined, and the move sat between the two. Every new relationship from one Save is now written at the end of the diagram, grouped by the element it starts from, in the order those elements were first changed in the draft (a move counts), wherever the other staged changes fall. When the diagram ends with a bracket-form element that is also being moved, its coordinates are written before the new lines instead of breaking the Save (#268).
- **A move or property edit staged on the same element as a connect-mode relationship is now saved.** Connecting from `a` and then dragging `a`, or renaming it or editing its label, description, technology or tags, wrote the relationship and silently dropped the rest, with no message and the draft cleared as if everything had been saved. Both are now written in one Save, in a plain `.c4x` file and in a `c4x` fence in Markdown. When the same Save renames the source or the target of a new relationship, the new line uses the new id, which a relationship staged beside a rename used to lose with "Relationship references unknown element" (#269).
- **Connect mode can add a relationship to a diagram that already has relationships below the source element.** Connecting `a` to `b` in `Person(a, "A")`, `System(b, "B")`, `System(c, "C")`, `b -->|Calls| c` was rolled back with "Relationship b->c was added or source/target changed unexpectedly", because the new line was written right after `a` and took `rel-0`, renumbering every later relationship. The new relationship is now written as a new top-level statement after the last statement of the diagram, indented like the diagram's first line so a fence inside a Markdown list item stays one block, which leaves every existing relationship numbered as before, whichever boundary the source element is in. The save check now accepts an addition only at the end of the relationship list and counts a new relationship that repeats an existing endpoint pair as an addition. A bracket-form element (`a[A<br/>Person]`) no longer leaves a blank line beside the new relationship (#259).
- **A relationship staged in connect mode is no longer lost when the preview reloads.** The draft saved with the webview (and restored after Developer: Reload Webviews or an extension-host restart) kept an element's moves and edits but not its staged relationships, so a connect-only change vanished and the restored draft counted the source element as a change with nothing left on it. The draft now keeps each staged relationship's target, label, relation type and technology, and checks them on restore against the same limits as a save; a relationship that fails the check is dropped on its own, with a notice, and the rest of the draft is kept. The Connect dialog now refuses a relationship that could never be saved (the same target and label twice from one element, a 65th from one element), and relationships to an element whose id has a hyphen, which the grammar allows, can be saved. The draft format is unchanged apart from one optional field, so no migration is needed and an older reader simply ignores the field (#260).
- **Clicking a node or boundary in the visual editor no longer moves it.** A press now becomes a drag only once the pointer travels 4 screen pixels; before that it is a click, which selects and stages nothing. Selecting `Database` only to rename it used to stage "Moved to …" and write `$x="80", $y="609.0119565375295"`, pinning the node at its auto-layout position. A drag that ends where it started also stages nothing and puts every dragged node back at its exact original position, unrounded auto-layout coordinates included, as does a cancelled drag; a dragged boundary now writes whole-number coordinates, as nodes already did (#251).
- **Dragging any node of a multi-selection moves the whole selection.** Pressing a node that is already selected keeps the selection, so the drag moves every selected node by the same delta. It used to work only from the last Shift+clicked node; dragging any other member moved that node alone and dropped the selection. A click on a member, without dragging, still narrows the selection to that node (#252). The group moves by one rounded delta and stops as a unit at the canvas edge instead of squashing against it, and a drag that ends where it started restores or stages every member together. Touch and pen need 10 screen pixels of travel before a press becomes a drag; a mouse needs 4.
- The diagram legend no longer covers the zoom, Fit and Connect buttons in a narrow preview. With the preview in half of a 1200 px window and Edit mode open, the canvas is about 256 px wide, and the legend sat on top of the canvas toolbar so that −, the zoom percentage, Fit and Connect could not be clicked until the legend was dragged away. The toolbar and the legend now share one row at the bottom of the canvas: side by side when there is room, with the legend above the toolbar when there is not, and the toolbar's buttons wrap onto a second line rather than run past the canvas edge. A legend you drag onto the toolbar now slides under it. Wide previews look as before: toolbar bottom-left, legend bottom-right. Tab order is unchanged: the toolbar buttons, then the legend (#250).
- Setting or clearing the Gemini API key while a generation is running now takes effect at its next request. Image generation, a heal, a self-correction pass and the failover used to keep sending the old key, and kept sending after the key was cleared; the model list fetched for the old key is no longer reused for the new one. A request about to be sent when the key changes uses the new key, or is not sent after a clear; a request already sent is not recalled and completes with the key it left with. A generation running while a new key is being saved is no longer told the key is not configured, and clearing the key during image generation now says the key is missing instead of "The model may not support image generation" (#181).
- If loading the Gemini SDK fails once (a transient file read error, say), the next AI request tries again; the failure used to stick until VS Code was reloaded (#181).
- An error page from a proxy or gateway (HTML instead of a Gemini API error) no longer appears in the generation error as markup. The message keeps the HTTP status, for example `502 Bad Gateway`, and says that a proxy may be in the way. The previous SDK dropped such a page; the new one passed it through whole (#181).
- When the failover model also fails, the error now names the failover and its own cause first, then what failed before it. It used to report only the first model's error, so a withdrawn failover would have read as a problem with the model you configured, and the failover went unmentioned (#187).
- Source writeback no longer offers a `c4x` fence that sits inside an unterminated fence of another marker (a `~~~js` that is never closed) as an editable block. CommonMark makes that text the outer fence's body; the scanner now stops at the unterminated fence instead of resuming inside it, so a false detection disables writeback for the rest of the document rather than writing into code silently. A backtick fence whose info string contains a backtick (```` ```c4x `x` ````) is no longer treated as a fence at all, matching CommonMark and the Markdown preview, which never rendered a diagram there.

### Maintenance

- Reduced extension startup parsing overhead while preserving visual-editor helper names and source maps.
- Added installed-package checks for bundled dependencies, lazy SDK loading and third-party licence notices.
- Refreshed the generated cloud icon catalogue to match the shipped sprites.

### Known limitations

- **Draft identity is deferred to 1.8.1.** Recovery hardening and schema migration are excluded from 1.8.0. Existing restored drafts can still attach to a different statement after source reordering; this release does not claim to fix that risk.

- **Typed boundaries cannot be moved or resized.** `System_Boundary`, `Container_Boundary` and `Enterprise_Boundary` have no place in the grammar for `$x`, `$y`, `$w` and `$h`, so the visual editor does not offer them for dragging (see Fixed above). Only a `subgraph` boundary can be positioned by hand, and it loses its C4 type. Grammar support, so that a typed boundary can store its layout, is #274: not scheduled, and needs a maintainer decision and an architecture decision record because it changes the DSL surface.
- **The `braces` audit exception expires on 2026-11-07.** `make cve-scan` ignores GHSA-vfj7-8cjw-p6xm (high; `braces` 3.0.3, no patched release, reached only through the Open VSX publishing tool) until that date, then fails until the exception is renewed or removed. The extension package does not contain it.
- **Remaining editing limitations:** pan and zoom alone are not persisted across a reload; a relationship label can land in a different place after a save, and a long description can overflow its node box; elements cannot yet be added from a palette, and elements and relationships cannot yet be deleted (planned for 1.8.1, pending an architecture decision). Restored drafts may re-attach to the wrong statement (#261), zoom-to-fit ignores the overlays (#262) and some drag edge cases remain (#263); all three are planned for 1.8.1.

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
