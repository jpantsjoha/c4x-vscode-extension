# C4X — Diagrams for humans

**Diagrams for humans.** C4 architecture diagrams for VS Code, kept as version-controlled text in your repository and edited visually by dragging.

> **C4X: diagrams for humans.** AI can generate a system in an afternoon. People still have to understand it, approve it and be accountable for it. C4X turns complex and agentic systems into C4 diagrams your team can read, review and sign off, from context to containers to components. Drafted with AI, owned by the people.

**AI features:**

- **Gemini generation** — draft a C4 model from the surrounding code with your own Gemini key, or with a chat model already in VS Code such as GitHub Copilot's.
- **Assistant skills for Claude Code, Codex, Gemini CLI and Antigravity** — the c4x skill and plugins let a coding assistant write C4X ([install](#install-for-an-ai-coding-assistant)).
- **The MCP validator** — the C4X MCP server checks, lints and renders a diagram (`validate_c4x`, `lint_c4x`, `render_c4x`).
- **Lint, export and offline preview** — C4 notation checks in the Problems panel, SVG and PNG export, and a preview that renders on your machine with no network call.

Built on the C4 model by Simon Brown ([c4model.com](https://c4model.com/)). C4X is independent and not affiliated.

**Who it is for:** two audiences. People — software architects, technical writers and engineering managers who want C4 diagrams reviewed in the pull request that changes the code — use the VS Code extension. AI coding assistants use the c4x skill, its syntax-validation scripts and the C4X MCP server, packaged as a plugin ([install for an assistant](#install-for-an-ai-coding-assistant)).
**State:** C4X is on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x) and [Open VSX](https://open-vsx.org/extension/jpantsjoha/c4x); the published version is 1.9.2, released on 2026-11-19. Versions 1.8.1 to 1.9.0 were tagged and not published; 1.9.2 carries their changes, which are in the [changelog](./CHANGELOG.md).

Product summary: [OVERVIEW.md](./OVERVIEW.md). Build, run and test: see [run_instruction.md](./run_instruction.md). Dependencies: [DEPENDENCIES.md](./DEPENDENCIES.md).

[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/jpantsjoha.c4x?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/jpantsjoha/c4x?label=Open%20VSX&color=a60ee5)](https://open-vsx.org/extension/jpantsjoha/c4x)
[![Version](https://img.shields.io/visual-studio-marketplace/v/jpantsjoha.c4x?label=version)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
![License](https://img.shields.io/github/license/jpantsjoha/c4x-vscode-extension)

```bash
code --install-extension jpantsjoha.c4x
```

## Why diagrams for humans

- **People stay accountable.** AI can draft a system faster than a team can read it. Someone still has to understand the design, approve it and answer for it.
- **AI drafts, people approve.** Gemini or your coding assistant writes the first draft, and the C4X parser checks it: in-editor generation is checked before it reaches your file, and an assistant checks its work with `validate_c4x`. Visual changes are staged as a diff for you to review, and the diagram goes through the pull request like any other change.
- **The C4 levels help a team agree.** Context, containers and components give each audience the level of detail it needs, so the team can align on one picture before it builds.
- **The goal is value delivered.** A diagram earns its place when it helps a team ship the right system, not when it looks finished.

## What's new in 1.9.2

With version 1.9.2 you can:

- **Draw diagrams that look like the examples on c4model.com.** Select the `c4-model` theme and a person has a head, a database (`ContainerDb`) is a cylinder, a boundary is a thin frame with its type, and every element prints its type under its name (`[Container: PostgreSQL]`). Other outlines, such as a browser window for a web app, come from `$shape` or a tag style; the theme sets none for them. `classic` stays the default theme.
- **Name a shape and the technology of a relationship.** `$shape="Cylinder"` (or `Bucket`, `Folder`, `WebBrowser`, `Terminal`, `Person`, `RoundedBox`, `Box`) sets an element's outline; `a -->|Calls| "HTTPS" b` draws `[HTTPS]` under the label. Style every element of a tag at once with `elementStyle`. The editor completes shape names and the new attributes, and ships a snippet for each shape.
- **Add a key.** The key lists the styles the diagram draws. It is an overlay in the preview, and `c4x.export.includeKey` adds it below the diagram in SVG, PNG, PDF and HTML exports.
- **Let an AI assistant write, check and draw C4X.** The VS Code chat agent finds the C4X MCP server with no setup (`validate_c4x`, `lint_c4x`, `render_c4x`); `c4x render` draws SVG from a shell or CI; the c4x skill and plugins carry the same tools to Claude Code, Codex, Gemini CLI and Antigravity. Generated diagrams follow the new notation.
- **Generate without a Gemini key.** Set `c4x.ai.provider` to `vscode-lm` to use a chat model already in VS Code, such as GitHub Copilot's.

<img src="assets/marketplace/images/c4-model-container.png" width="620" alt="A web shop container view in the c4-model theme: a person above a Web Shop boundary holding a browser, a terminal, a cylinder and a bucket, and an external payment provider below, each relationship labelled with its technology" />

<img src="assets/marketplace/images/c4-model-deployment.png" width="420" alt="A deployment view in the c4-model theme: Amazon Web Services, US-East-1, an autoscaling group and Amazon EC2 nested inside each other, each node with its name, type line and icon" />

Shapes, tag styles and the key are in the [user guide](docs/USER-GUIDE.md#draw-in-the-c4-notation-190), [element types](docs/C4X-ELEMENT-TYPES.md#shapes) and the [syntax reference](docs/c4x-syntax.md#element-styles-elementstyle-shape). Every change is in the [changelog](./CHANGELOG.md).

## Install for an AI coding assistant

The assistant writes the diagram, the C4X parser checks it, and the extension draws it. Each host gets the same skill and the same MCP server (`validate_c4x`, `lint_c4x`, `render_c4x`); both need Node.js 18 or later.

| Assistant | Install |
|---|---|
| Claude Code | `claude plugin marketplace add jpantsjoha/c4x-vscode-extension`, then `claude plugin install c4x@c4x`. In a session: `/plugin install c4x --marketplace jpantsjoha/c4x-vscode-extension`. Adds `/c4x:draw`, `/c4x:check` and `/c4x:preview` |
| Codex | `codex plugin marketplace add jpantsjoha/c4x-vscode-extension`, then `codex plugin add c4x@c4x` |
| Gemini CLI | `gemini extensions install https://github.com/jpantsjoha/c4x-vscode-extension` |
| Antigravity CLI | Clone this repository, then `agy plugin install ./c4x-vscode-extension/plugins/c4x` |
| Any Agent Skills host | Copy `skills/c4x/` into the assistant's skills directory ([guide](docs/C4X-AGENT-SKILL.md)) |

`render_c4x` draws the diagram as SVG for the assistant to inspect. The live, editable preview needs the VS Code extension: `/c4x:preview` checks the diagram and tells you to open it with **C4X: Open Preview**.

<img src="assets/marketplace/screenshots/visual-editor-markdown-split.png" width="900" alt="C4X source in a Markdown file on the left, the live editable diagram on the right" />

## Recent releases

1.9.2 (above) is the current release. Versions 1.8.1 to 1.9.0 were tagged and not published; 1.9.2 carries their changes.

**1.9.0** (tagged 2026-11-17) refreshes the C4 notation (shapes, the `c4-model` theme, boundaries and a key) and adds the c4x agent skill, assistant plugins, `render_c4x`, generation with a VS Code chat model and an npm package for scripts and agents.

**1.8.2 and 1.8.3** (tagged 2026-11-15) harden diagram rendering and the MCP server, and stop folder generation reading credential files.

**1.8.1** (tagged 2026-11-15) is a stabilisation release. Unsaved visual edits are no longer lost on a theme change, a text save, a Markdown edit outside the diagram or a refused Save. Structurizr files with positional descriptions and tags render, and a workspace with a missing closing brace, no views or no elements reports the line and the cause instead of showing a blank preview. Export save dialogs open beside the source file. A preview of the `c4-model` theme follows the examples on c4model.com; `classic` stays the default.

In **1.8.0** (published 2026-10-16) C4X added C4 notation checks, component-to-code mapping and architecture conformance checks. Visual editing gains safer relationship saves, multi-selection dragging and clearer staged changes. Gemini uses the current Google SDK with live-tested model discovery and failover.

From a Markdown preview, click **Edit C4 diagram** beneath the diagram to open its visual editor; confirm **Open** if the IDE asks to open the extension link. In source view, click the CodeLens above a `c4x` fence, or right-click inside the fence and choose **Edit C4 diagram in visual editor**. In the visual panel, select **Edit C4 Diagram**, select an element, change its properties, review the diff, then choose **Save Changes**. **Discard** cancels staged edits. Save an untitled Markdown file before using preview links.

1.8.0 also fixed preview links that silently did nothing and made sure each link opens its own file and diagram after preview refreshes. See the [release notes](docs/releases/README.md) for changes and known limitations.

## Traction

Registry install figures read on 2026-09-09; commit counts read on 2026-09-09; test counts from the 1.8.0 release gate on 2026-10-15. These are dated figures. The latest unit-test count is 4,709 passing (`make test-unit`, 2026-11-18); see [OVERVIEW.md §6](./OVERVIEW.md#6-quality-evidence).

- **1,588 installs** on the VS Code Marketplace and **7,053 downloads** on Open VSX.
- **Version 1.9.2 published 2026-11-19** on both registries (1.8.0 on 2026-10-16, 1.7.0 on 2026-09-07). The first Marketplace release was 2025-12-04. Install and download counts above were read on 2026-09-09; the badges at the top show current figures.
- **469 commits since 2025-10-19:** 467 from one human author and two from a test-fixture identity, across 82 merged pull requests, 101 merge commits and 10 release tags.
- **Six test tiers:** at the 1.8.0 release gate (`af02c79`, `make check-full`): 2,105 unit tests, 507 extension-host tests, 168 browser tests, a packaged-VSIX smoke test (run on macOS at that gate; Windows and Linux are run by hand), a live Gemini generation gate, and an MCP functional check. The release gate holds the unit tier to a line and branch coverage floor.
- **Built in:** 1,098 cloud sprites (430 AWS, 624 Azure, 44 Google Cloud), seven themes (text contrast of at least 4.5:1, WCAG AA, tested in light and dark for all but one: the filled `c4-standard` theme keeps the Structurizr palette and is the named exception, with white text at 2.85:1 on its grey and 3.49:1 on its container blue), Structurizr DSL and PlantUML C4 import, and a Model Context Protocol server in the repository.

## The problem

Architecture diagrams rot because they live outside the repository. Three roles feel it differently.

**Alex, a software architect.** The container diagram belongs in the pull request that changes the containers. Structurizr wants a Java runtime, PlantUML wants Graphviz or a server, and both sit outside the editor. So Alex draws the diagram once, at design time, and never again.

**Jordan, a technical writer.** Mermaid renders inside Markdown; C4 does not. Jordan exports a PNG, uploads it, links it, and watches it go stale the week the code changes.

**Sam, an engineering manager.** Every team picks a different drawing tool, and a proprietary canvas file produces no diff. Architecture never reaches code review, so Sam cannot enforce a standard the team never sees.

## The solution

**Alex** writes `architecture.c4x` beside the code and presses `Cmd+K V`. Dragging a box stages a coordinate change, the inspector shows the exact source diff, and **Save Changes** writes `$x` and `$y` back into the file. The diagram travels in the commit that changed the code.

**Jordan** puts a fenced `c4x` block inside the Markdown file. The VS Code preview renders it live. There is no image to export, host or refresh.

**Sam** reads architecture the way the team reads code. A moved container is two changed numbers in a text diff, on a branch, in a pull request.

## What it does

**1. Write text, see the diagram.** Create `architecture.c4x`, write a few lines of Mermaid-like syntax, press `Cmd+K V` (or `Ctrl+K V`). C4X parses the source and renders locally. No network call, no rendering service.

**2. Generate a model from code.** Run `C4X: Generate Diagram Here (Gemini)`. Gemini reads the surrounding files and drafts a C4 model at the cursor. C4X parses the output before it reaches the document and re-prompts up to twice if the syntax is wrong. No Gemini key? Set `c4x.ai.provider` to `vscode-lm` to use a chat model you already have in VS Code, such as GitHub Copilot's ([guide](./docs/GEMINI_GUIDE.md#without-a-gemini-key-use-a-vs-code-model)).

**3. Arrange by dragging.** Automatic layout gives you structure; you supply the emphasis. Drag gestures stage coordinates for review. Native `.c4x` files take `$x` and `$y` inline; imported formats use a layout sidecar so the original file is never rewritten.

**4. Edit the model on the canvas.** Change an element's label, technology, description, tags or sprite. Renaming an element rewrites every relationship that references it. Draw new relationships, or move an existing one to a different endpoint.

**5. Review before saving.** Every visual change is staged before it touches disk. Read the unified diff against your source, drop individual changes, then save the batch as one undo step.

**6. Export and embed.** SVG for Figma or Illustrator, PNG at 1x, 2x or 4x without a headless browser, or SVG straight to the clipboard. Fenced `c4x` blocks render live in the VS Code Markdown preview.

**7. Check the notation.** C4X checks each diagram against the C4 review checklist and lists what is missing in the Problems panel: a container with no technology, an unlabelled arrow, a component drawn in a system context view. Every finding carries a stable rule id and a fix, never blocks the preview, and has a severity you can change per rule. Rules and settings: [C4X lint rules](./docs/C4X-LINT-RULES.md).

**8. Draw the C4 notation (1.9.2).** The `c4-model` theme follows the c4model.com examples: eight shapes through `$shape`, a type line under every name, boundary frames with their type, deployment nodes with their icon, the technology under each relationship label, and a key of the styles drawn. [Examples and a picture of every shape](docs/C4X-ELEMENT-TYPES.md#shapes).

**9. Work with AI assistants (1.9.2).** The C4X MCP server (`validate_c4x`, `lint_c4x`, `render_c4x`) is offered to VS Code's chat agent with no setup, `c4x render` draws SVG outside VS Code, and the c4x skill and plugins serve Claude Code, Codex, Gemini CLI and Antigravity. [Render outside VS Code](docs/C4X-RENDER.md).

## Capabilities and state

| Capability | State |
|---|---|
| Text to live diagram (`.c4x` files, Markdown `c4x` fences), local rendering | Live |
| Structurizr DSL and PlantUML C4 import | Live |
| Visual editing: drag, resize, edit properties, draw and re-point relationships, staged diff review | Live |
| Gemini diagram generation with parser-checked output and model discovery | Live (needs your own API key) |
| Export: SVG, PNG at 1x/2x/4x, SVG to clipboard | Live |
| C4 notation and coherence lint (Problems panel, `c4x-lint` CLI, MCP `lint_c4x`) | Live |
| Component-to-code mapping (`$code`) and dependency-cruiser conformance export | Live |
| Move or resize a typed boundary (`System_Boundary`, `Container_Boundary`, `Enterprise_Boundary`) | Partial: fixed in place; use `subgraph` to move or resize |
| Pan and zoom remembered across reloads; restore of drafts after a reload | Live (1.8.1) |
| Add elements from a palette; delete elements and relationships | Planned, no release assigned |
| `c4-model` theme: shapes (`$shape`), type lines, boundary and deployment notation, relationship technology | Live (1.9.2) |
| Tag styles (`elementStyle`), diagram key (`c4x.export.includeKey`) | Live (1.9.2) |
| Completion and snippets for `$shape`, the other attributes and `elementStyle` keys | Live (1.9.2) |
| MCP `render_c4x`, `c4x render`, the c4x skill and plugins for AI assistants | Live (1.9.2) |
| Gemini-free generation with a VS Code chat model (`c4x.ai.provider`) | Live (1.9.2) |
| ArchUnit export | Planned (1.11.0) |
| Cross-file C1 to C2 navigation, organisation icon packs | Planned (1.12.0) |

## Design choices

- **No second runtime.** The package is about 1.94 MB and needs no Java, no Graphviz, no Docker and no rendering server. Preview and export run locally.
- **Write-back that fails closed.** A visual change that cannot be turned into valid source is abandoned rather than written. Each completed action is one `WorkspaceEdit` and one undo step, reparsed and validated before it is acknowledged.
- **Generation a parser has checked.** Gemini drafts the model; the C4X parser decides whether it is admissible. Failures are corrected by re-prompting with the parser's own error, at most twice, before anything is inserted.
- **Your key, your bill.** Gemini calls use your own API key, held in VS Code SecretStorage. C4X has no backend, no hosted service and no telemetry, so nothing about your code leaves the machine except the context you asked to send.
- **Diagrams in the diff.** Models are plain text in the repository. They branch with the feature, review in the pull request, and survive the people who wrote them.

## Earlier: 1.7.0

- **Model pickers.** `C4X: Select AI Model` and `C4X: Select Gemini Image Model` list the models your key can reach, marking preview, retired and specialist ones. Lists are cached for a day. With `c4x.ai.provider` set to `vscode-lm`, `C4X: Select AI Model` lists the chat models VS Code offers instead.
- **Steadier arranging.** Nested boundaries resize child-first and keep authored origins and minimum sizes. Relationship-label layout no longer shifts elements you placed by hand. Discarding a move rewraps the frame around it.
- **The preview stays put.** The visual editor opens reliably, and focusing the preview keeps its binding to the source document instead of clearing the diagram.
- **Clearer recovery.** A failed save retries its rollback up to three times, and restoring a draft says which targets are missing.
- **Clean installs, checked on three systems.** Clean-install checks run on Windows, macOS and Linux. Development files are out of the VSIX, and browser failures or high- and critical-severity dependency findings block a release.

Full detail: [1.7.0 changelog](./CHANGELOG.md#170---2026-09-07). The 1.8.1 changes are in the [changelog](./CHANGELOG.md); the 1.8.0 changes are in the [release notes](docs/releases/README.md) and the [changelog](./CHANGELOG.md#180---2026-10-15).

## Roadmap

1.8.1 stabilised what already shipped, and 1.9.0 delivered the C4 notation refresh and the path for AI coding assistants to write, validate and render C4X; 1.9.2 publishes both. The sequence after it, none of it dated:

- **1.10.0 — agent-ready C4X, the rest.** A high-level-design skill, a layout quality report and structured generation.
- **1.11.0 and 1.12.0 — checkers and larger models.** ArchUnit-family export, then cross-file C1 to C2 navigation and organisation icon packs.
- **Authoring, no release assigned.** Add elements from a C4-aware palette, delete elements and relationships with dependent-relationship review, and refresh a diagram from code.
- **Beyond the sequenced roadmap.** Unsequenced aspirations, not commitments: detect drift between code and model in CI, share branch-aware editing sessions through Git, and generate a static architecture portal from the repository.

Detail and delivery rules: [product roadmap](./docs/ROADMAP.md).

## Quick start

Install from the Extensions view (`Cmd+Shift+X` or `Ctrl+Shift+X`) by searching for `C4X`, or from the command line:

```bash
code --install-extension jpantsjoha.c4x
```

The same extension is on Open VSX as `jpantsjoha.c4x`.

Create `architecture.c4x`, paste this, and press `Cmd+K V` (macOS) or `Ctrl+K V` (Windows and Linux):

```c4x
%%{ c4: system-context }%%
graph TB

Customer[Customer<br/>Person]
Banking[Banking System<br/>Software System]
Email[Email System<br/>Software System<br/>External]

Customer -->|Uses| Banking
Banking -->|Sends notifications| Email
```

The same block inside a fenced `c4x` code block renders live in the Markdown preview.

The first line declares the view: `system-context`, `container`, `component`, `deployment` or `dynamic`. The second sets direction: `graph TB`, `LR`, `BT` or `RL`. Elements take bracket or function form, arrows carry the relationship, and a `subgraph` draws a boundary:

```c4x
%%{ c4: container }%%
graph TB
    User[User<br/>Person]

    subgraph BankingSystem {
        WebApp[Web App<br/>Container]
        Database[DB<br/>Container]
    }

    User -->|Uses| WebApp
    WebApp ==>|Reads and writes| Database
```

`-->` is a dependency, `==>` a synchronous call and `-.->` an asynchronous one. Function syntax adds descriptions, technology and sprite icons:

```c4x
Container(WebApp, "Web App", "React", $sprite="c4xicons.aws.elastic-beanstalk-application")
ContainerDb(DB, "Database", "PostgreSQL")
Person(User, "End User", "Pays bills online")
```

A person or system takes a description as its third argument and shows it as plain text under the name; a container or component takes a technology first and shows it as `[Technology]`.

Long Latin, Greek and Cyrillic text wraps inside the element (other scripts, emoji and symbols are drawn on one line as before): a label, technology or description wider than its box breaks onto more lines and, in diagrams without saved positions, the box grows taller (label up to 3 lines, technology 2, description 6, then `…`). Text that fits stays on one line. Details: [long text](./docs/c4x-syntax.md#long-text-wraps-inside-the-element).

In bracket form C4X understands the type labels `Person`, `Software System`, `Container`, `ContainerDb`, `Component` and `ComponentDb`. In function form the equivalents are `Person`, `System`, `SystemDb`, `Container`, `ContainerDb`, `Component` and `ComponentDb`, each with an `*_Ext` external variant. Give an element an outline with `$shape="Cylinder"` (also `Bucket`, `Folder`, `WebBrowser`, `Terminal`, `Person`, `RoundedBox`, `Box`) and name a relationship's technology with `a -->|Calls| "HTTPS" b`; type `$` or `$shape="` and the editor completes the names. Full grammar: [syntax guide](./docs/c4x-syntax.md). Worked models: [examples](./docs/EXAMPLES.md).

To generate diagrams from code, get a key from [Google AI Studio](https://aistudio.google.com/), run `C4X: Set Gemini API Key`, and paste it. C4X stores it in VS Code SecretStorage; it is never written to a settings file. `C4X: Clear Gemini API Key` removes it.

The default model is `gemini-3.8-flash`, with a single failover to `gemini-3.1-pro-preview` when the first model fails. `C4X: Select AI Model` lists what your key can reach. To generate without a key, with a model you already have in VS Code, set `c4x.ai.provider` to `vscode-lm`. Guides: [Gemini generation](./docs/GEMINI_GUIDE.md), [VS Code models](./docs/GEMINI_GUIDE.md#without-a-gemini-key-use-a-vs-code-model) and [visual diagrams](./docs/DIAGRAM-WITH-GEMINI-IMAGE.md).

Editing and export commands live under the same prefix: `C4X: Open Preview`, `C4X: Export SVG`, `C4X: Export Diagram as PNG`, `C4X: Copy SVG To Clipboard` and `C4X: Diagram from Selection`.

## MCP server

### In VS Code (1.9.2 and later, VS Code 1.101 or later)

Install the extension and the C4X server appears in VS Code's MCP server list with no configuration. VS Code shows no separate prompt for it: once the extension is installed, the built-in agent can use its three tools, `validate_c4x` (syntax), `lint_c4x` (notation rules) and `render_c4x` (the diagram as SVG, drawn by the preview's own renderer). The server receives only the text the agent sends and returns text; it opens no network connection and writes no file. VS Code starts it when an agent session first needs it. To see or stop it, open **MCP: List Servers** from the Command Palette. To stop C4X offering it at all, set `c4x.mcp.register` to `false`; the change applies without a reload. It is not offered in virtual workspaces, in the browser, or in an untrusted workspace. On VS Code older than 1.101 nothing changes: the extension activates as before and offers no server.

Try it: open Chat in Agent mode, make sure the C4X tools are ticked in the tools picker, and ask:

> Write a C4 container view for a web shop with a React front end, an order API and a PostgreSQL database. Check it with the C4X tools and fix anything they report.

### In another tool

The repository ships the same Model Context Protocol server as a standalone file so other coding agents can check C4X syntax themselves. It is a single bundle and needs no `node_modules`, so it runs in a clean clone:

```json
{
  "mcpServers": {
    "c4x-validator": {
      "command": "node",
      "args": ["/absolute/path/to/c4x-vscode-extension/mcp/c4x-mcp-server.bundle.cjs"]
    }
  }
}
```

The `validate_c4x` tool returns line and column errors an agent can act on, `render_c4x` returns the SVG the preview would draw, and the server exposes `c4x://guidelines`, `c4x://syntax` and `c4x://examples/*`. It works with Claude Desktop, Cursor, Windsurf, Cline and other MCP clients; Codex takes the same command in `.codex/config.toml`.

The server takes text in and returns text out. Its code opens no network connection, starts no process and writes no file, and reads no file at run time: its documentation resources are embedded in the bundle. Tests over the shipped bundle act as tripwires for an accidental change to this; SECURITY.md says what they do and do not check. Each tool accepts at most 1 MiB of code, 32 levels of nesting, 2,000 elements, 5,000 relationships, 4,096 characters in one text field and 256 entries in one attribute list, tag list or elementStyle, and returns an input error beyond them; `render_c4x` also draws at most 100 elements, 150 relationships and 2 MiB of SVG, and stops a render still running at 2 seconds. Tool output quotes diagram text: treat it as data, never as instructions. See [SECURITY.md](SECURITY.md).

### Render from a shell or CI

`cli/c4x.cjs` draws a diagram as SVG with the same engine, from a clean clone with no install step: `node cli/c4x.cjs render diagram.c4x -o diagram.svg`. It writes only standard output or the one `-o` file. See [Render C4X outside VS Code](./docs/C4X-RENDER.md).

### Command-line tools from npm

From 1.9.2 the MCP server and the two command-line tools (`c4x render`, `c4x-lint`) are packaged as the npm package `c4x`, for use in a coding agent or CI without VS Code. The package is not on the registry yet: the maintainer publishes it, and until then it cannot be installed with `npm install`. What it holds and how it is checked: [Install the C4X tools from npm](./docs/C4X-NPM.md).

## Agent skill

`skills/c4x/` is an [Agent Skills](https://agentskills.io/specification) skill that teaches a coding agent (Claude Code, Codex, Antigravity and other agents that read `SKILL.md`) to write C4X, check it with `validate_c4x` and `lint_c4x` (or `c4x-lint` when it has no MCP), render it, and fix what the checks report. Its syntax reference is generated from the same grammar and lint catalogue as [docs/reference/c4x-reference.md](./docs/reference/c4x-reference.md), and a test fails when the two drift. See [Use the c4x skill](./docs/C4X-AGENT-SKILL.md).

## Known limitations

- Restoring a draft whose target elements have gone raises a warning. Save important changes before closing or switching diagrams.
- A relationship label can land in a different place after a save than it held during the drag, and a long description overflows its node box. Resize-handle placement and mixed boundary and node edits remain under review.
- Only a boundary written as `subgraph` can be positioned or resized by hand, because only `subgraph` takes `$x`, `$y`, `$w` and `$h`. A boundary written as `System_Boundary`, `Container_Boundary` or `Enterprise_Boundary` has nowhere in the syntax to keep a position. Since 1.8.0 the editor leaves such a boundary fixed instead of offering a drag it cannot save. Rewriting a boundary as a `subgraph` makes it movable and drops its C4 type, so the C4 lint rules for boundaries no longer apply to it.
- C4X cannot yet add an element from a palette, or delete an element or a relationship. Both are planned, with no release assigned.

## For developers

C4X builds on Node 20.20.2 (`.nvmrc`) with pnpm 10.18.3; [run_instruction.md](./run_instruction.md) lists every prerequisite and pin.

```bash
pnpm install --frozen-lockfile   # install dependencies
make quick-check   # typecheck, lint, unit tests, harness and MCP checks
make check         # the above, plus documentation verification and a build
```

To run the extension, build it, then press `F5` in VS Code to launch the Extension Development Host. `F5` needs a `.vscode/launch.json`, which is not tracked; the [Quick Start](./docs/QUICK-START.md#step-2-launch-the-extension-installed-from-source-only) gives the file to create.

Read [CONTRIBUTING.md](./CONTRIBUTING.md) for the branch, test and review rules. Issues and pull requests go to [GitHub](https://github.com/jpantsjoha/c4x-vscode-extension/issues). Everyone taking part follows the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Documentation

Each section has its own README that lists its documents.

- [User guides, syntax and examples](./docs/README.md)
- [Product roadmap](./docs/ROADMAP.md)
- [Marketplace and product references](./docs/marketplace/README.md)
- [Changelog](./CHANGELOG.md) and [release notes](./docs/releases/README.md)
- [Run instructions](./run_instruction.md), [CONTRIBUTING.md](./CONTRIBUTING.md) and the [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)
- [Licence](./LICENSE) and [third-party notices](./NOTICE.md)

## Icons

<img src="assets/marketplace/icons/c4x-icons-example.png" width="900" alt="C4X icon integration example" />

The bundled AWS, Azure and Google Cloud sprites belong to their vendors, not to this project. [NOTICE.md](./NOTICE.md) records the attribution and sources; [docs/ICONS.md](./docs/ICONS.md) lists the catalogue.

## Licence

MIT. See [LICENSE](./LICENSE).

- [C4 model](https://c4model.com/) by Simon Brown.
- [Mermaid.js](https://mermaid.js.org/) for syntax inspiration.
- [Dagre](https://github.com/dagrejs/dagre) for graph layout.

---

Built by [Jaroslav Pantsjoha](https://jpantsjoha.com) · [GitHub repository](https://github.com/jpantsjoha/c4x-vscode-extension) · [Issues](https://github.com/jpantsjoha/c4x-vscode-extension/issues)
