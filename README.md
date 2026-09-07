# C4X — C4 Architecture Diagrams for VS Code

C4 architecture diagrams as version-controlled text in your repository, edited visually by dragging.

[![VS Code Marketplace Installs](https://img.shields.io/visual-studio-marketplace/i/jpantsjoha.c4x?label=VS%20Code%20Marketplace&color=007ACC)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/jpantsjoha/c4x?label=Open%20VSX&color=a60ee5)](https://open-vsx.org/extension/jpantsjoha/c4x)
[![Version](https://img.shields.io/visual-studio-marketplace/v/jpantsjoha.c4x?label=version)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x)
![CI](https://github.com/jpantsjoha/c4x-vscode-extension/workflows/CI/badge.svg)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
![License](https://img.shields.io/github/license/jpantsjoha/c4x-vscode-extension)

<img src="assets/marketplace/screenshots/visual-editor-markdown-split.png" width="900" alt="C4X source in a Markdown file on the left, the live editable diagram on the right" />

## New in 1.7.0

**More reliable visual editing, safer save recovery, and Gemini model selection that follows what your API key can access.**

- **Arrange and save diagrams:** nested boundary frames resize consistently, manually positioned elements stay put, and discarding a move restores the enclosing frame. Coordinates remain reviewable in your source.
- **Keep the preview working:** fixes cover editor startup and keeping the diagram visible when focus moves from the source editor to the preview.
- **Choose your Gemini models:** text and image pickers list models available to your key. Settings changes apply to the next request; an unavailable model can be replaced once with a notice.
- **Recover more clearly:** failed saves retry rollback, and restoring a draft warns when its original targets no longer exist.
- **A cleaner package:** runtime dependency fixes and clean-install checks on Windows, macOS and Linux accompany this release.

Try it: open a diagram or a fenced `c4x` block in Markdown, choose **Edit C4 Diagram**, move an element, review the staged source diff, then choose **Save Changes**. **Discard** abandons staged edits.

See the [1.7.0 changelog](./CHANGELOG.md#170---2026-09-07) for details and [known limitations](#known-limitations) below.

## Vision

Software architecture diagrams rot because they are detached from the code they describe. When a system evolves, updating an external canvas or proprietary drawing tool imposes enough friction that engineers abandon the task. The diagram on the wiki quietly ceases to represent the running software. C4X makes architecture diagrams version-controlled text files that reside directly inside the repository alongside source code, review cleanly in pull requests, and survive team turnover.

Pure text, however, introduces its own friction. While diagrams-as-code guarantees portability, managing spatial layout through raw code is clumsy and slow. C4X unites plain text with direct visual manipulation. Developers can draft an architecture model from an existing codebase using machine learning, refine element positions by dragging them across a visual canvas, and rely on guarded write-back to record every spatial change directly into the underlying text source.

By integrating C4 modelling natively into the developer's primary workspace without Java, Graphviz or Docker for local rendering, C4X replaces expensive, fragmented drawing software with an efficient development utility. It converts architecture documentation from an irregular administrative burden into an automated, living artefact of everyday software engineering.

## The Problem

Engineering teams struggle with architecture documentation across three distinct roles:

1. **Software architects (Alex):** Existing tools such as Structurizr or PlantUML require slow Java runtimes, Docker containers, or complex syntax. Switching contexts between the code editor and external diagramming applications disrupts flow, and pure text tools offer no visual spatial control.
2. **Technical writers (Jordan):** Architecture diagrams cannot be embedded natively inside Markdown documentation like Mermaid diagrams. Writers must manually export images, re-upload assets, and watch documentation screenshots rot as soon as the code changes.
3. **Engineering managers (Sam):** Teams employ inconsistent, fragmented drawing applications with no common standard. Because proprietary canvas files cannot be diffed in Git pull requests, architectural standards cannot be reviewed or enforced during normal delivery.

C4X keeps diagrams alongside the code so teams can update and review architecture through their existing editor and Git workflow.

## What C4X Does

C4X provides six integrated developer journeys within the code editor.

### 1. Write text and preview immediately
Create `architecture.c4x`, define elements using a concise Mermaid-inspired syntax, and press `Cmd+K V` (or `Ctrl+K V`). The extension parses the source and renders an interactive diagram locally without a network connection.

### 2. Generate models from an existing codebase
Run `C4X: Generate Diagram Here (Gemini)`. Google Gemini inspects the surrounding files and drafts a complete C4 model directly at the cursor. The output is parsed locally before presentation, with up to three automatic self-correction passes if the syntax requires adjustment.

### 3. Arrange visually by dragging
Open the visual editor to position elements intuitively. While automated layout establishes structure, visual arrangement conveys narrative emphasis and grouping. Drag gestures stage coordinates for review. **Save Changes** writes `$x` and `$y` into native C4X source; imported formats use a layout sidecar.

### 4. Edit the model directly on the canvas
Select any element on the canvas to modify its label, technology stack, description, tags, or sprite icons. Renaming an element automatically updates every relationship referencing that identifier across the file. Draw new relationships or reassign existing connections directly between nodes.

### 5. Review before saving
Visual changes are staged in an inspector before touching disk. You inspect the unified diff against your source file, discard individual adjustments if desired, and commit the entire batch as a single atomic undo operation.

### 6. Export and embed
Export diagrams to vector SVG for tools such as Figma, render raster PNG files at 1x, 2x, or 4x resolution without headless browser overhead, or copy SVG directly to the system clipboard. Fenced `c4x` blocks embedded in Markdown files render live within the VS Code Markdown preview.

## Why It Wins

Five concrete attributes distinguish C4X from incumbent solutions:

1. **No separate rendering runtime.** Packaged in a 1.25 MB VSIX, C4X runs locally without requiring Java, Graphviz, Docker, or an external rendering service.
2. **Bidirectional text synchronisation.** Dragging canvas elements updates textual coordinates in the source file. Any visual change that cannot be safely translated into valid DSL code is aborted cleanly rather than corrupting repository text.
3. **Budgeted local performance.** Candidate checks exercise declared parse, render and interaction budgets on repository fixtures. Results depend on diagram shape and the test environment, so release evidence records the fixture rather than treating one timing as universal.
4. **Verified AI generation.** Code-to-diagram generation uses runtime model discovery across Google Gemini endpoints, combining LLM semantic extraction with local deterministic syntax validation and automatic self-correction.
5. **Git co-location and review.** Architecture models reside as plain text within the repository, allowing teams to track architectural evolution through Git history, branch alongside features, and review diagram diffs in pull requests.

## Traction

Measured figures as of 2026-09-04 demonstrate sustained adoption and rigorous engineering standards:

- **Distribution:** 1,577 installs on the VS Code Marketplace, and 538 downloads on Open VSX.
- **Distribution snapshot:** Version 1.6.4 was available across both public registries on that date; the highlights above describe 1.7.0.
- **Automated release verification:** Release checks cover unit tests, browser journeys, extension-host integration, clean VSIX installation, dependency security and live Gemini generation. Browser failures and high/critical dependency findings block CI; the release gate requires a working Gemini key.
- **Package efficiency:** Approximately 1.25 MB total VSIX size, with no separate rendering service required.
- **Broad format support:** Native import support for Structurizr DSL and PlantUML C4 models without manual syntax conversion.
- **Rich assets and accessibility:** 1,083 built-in cloud architecture sprites for AWS, Azure and GCP, alongside six themes that meet WCAG AA contrast.
- **Agent interoperability:** Dedicated Model Context Protocol (MCP) server enabling external AI coding agents to validate and repair C4X diagrams.

## Milestones

### Achieved
- **Visual C4 Editor:** Direct drag-to-edit canvas with guarded text write-back of spatial coordinates (`$x`, `$y`).
- **Atomic staging:** Visual change staging with unified diff previews and complete single-operation undo.
- **Connect mode and dynamic boundaries:** Interactive connection creation and dynamic boundary re-wrapping during drag movements.
- **Runtime model discovery and self-healing:** `C4X: Select Gemini Model` lists what your key can reach; a model that is withdrawn is replaced automatically, once, with a notice. Keys are held in encrypted SecretStorage.
- **Model Context Protocol (MCP) server:** Standalone `c4x-validator` bundle enabling AI agent verification.
- **Broad dialect compatibility:** Native parsing support for Structurizr DSL and PlantUML C4 files.
- **Design system:** Six themes meeting WCAG AA contrast, alongside 1,083 AWS, Azure and GCP icons.

### Next: 1.8.0 and beyond
- **Release 1.8.0 — Authoring the model, not just its layout:** a drag-and-drop element palette, and deletion of elements and relationships with the same guarded write-back that moves already use.
- **Release 1.9.0 — Across files:** drill down from a C1 context to the C2 container file behind it, and organisation-specific icon packs.

### Vision
- **Continuous architecture verification:** Automated CI/CD detection of architectural drift between code implementations and C4X models.
- **Collaborative workspaces:** Branch-aware collaborative canvas sessions synchronised directly through Git.
- **Hosted architecture portal:** Automated static portal generation transforming repository diagrams into interactive documentation.

## Technical Capabilities and Scale

C4X is designed for lightweight efficiency, predictability, and local responsiveness:

| Metric | Target | Achieved | Notes |
|---|---|---|---|
| **Activation time** | < 200 ms | **Not separately established** | The installed smoke proves activation and rendering, but is not an activation benchmark |
| **Packaged size** | ≤ 2.5 MB | **1.25 MB** | The whole VSIX; 11 allowlisted payload files plus 2 generated package-metadata entries |
| **Parse time** | < 50 ms | **Checked by the benchmark gate** | Fixture and environment dependent |
| **Preview render** | < 250 ms | **Checked by the benchmark gate** | Fixture and environment dependent; local render, no network |

Key technical guarantees include:

- **No separate rendering runtime:** No Java virtual machine, Graphviz binary, or Docker container is required.
- **Automated quality gates:** Release review includes unit, browser, extension-host, packaged-installation and live-generation evidence. Coverage percentages apply to the documented unit-test tier. The packaged smoke installs the VSIX into an isolated profile and requires a document-scoped receipt from rendered webview nodes and labels.
- **Cloud icon catalogue:** 1,083 AWS, Azure and GCP sprites with IntelliSense auto-completion.
- **Accessibility standards:** Six themes that meet WCAG AA contrast, with keyboard controls and screen-reader announcements covered by the browser suite.

<img src="assets/marketplace/icons/c4x-icons-example.png" width="900" alt="C4X icon integration example" />

## Known limitations

- Pan and zoom alone are not reliably persisted across reloads. Draft entries whose targets no longer exist produce a warning; draft identity and migration improvements remain pending. Save important changes before closing or switching diagrams.
- Relationship labels can change position after saving. Long descriptions can extend beyond node boxes. Resize-handle positioning and mixed boundary/node edits remain under review.
- Adding elements from a palette and deleting elements or relationships remain planned authoring features.

## Quick Start

### Install

Install through the **VS Code Marketplace** by searching for `C4X` in the Extensions view (`Cmd+Shift+X` or `Ctrl+Shift+X`), or install via the command line:

```bash
code --install-extension jpantsjoha.c4x
```

The extension is also available on **Open VSX** under `jpantsjoha.c4x`.

### Create a Diagram

Create a file named `architecture.c4x`, define a system context model, and press `Cmd+K V` (macOS) or `Ctrl+K V` (Windows and Linux) to open the preview.

```c4x
%%{ c4: system-context }%%
graph TB

Customer[Customer<br/>Person]
Banking[Banking System<br/>Software System]
Email[Email System<br/>Software System<br/>External]

Customer -->|Uses| Banking
Banking -->|Sends notifications| Email
```

### Embed in Markdown

Fenced `c4x` blocks embedded in Markdown files render as interactive diagrams within the VS Code Markdown preview:

````markdown
```c4x
%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    System[My System<br/>Software System]
    User -->|Uses| System
```
````

## DSL Syntax

C4X-DSL uses a Mermaid-compatible text syntax tailored for C4 architecture modelling.

### View Types

Declare the view level at the head of the file:

```text
%%{ c4: system-context }%%      %% C1 System Context
%%{ c4: container }%%           %% C2 Container
%%{ c4: component }%%           %% C3 Component
%%{ c4: deployment }%%          %% C4 Deployment
%%{ c4: dynamic }%%             %% Dynamic sequence flow
```

### Graph Direction

Set the graph orientation using standard directional keywords:

```text
graph TB    %% Top-to-bottom: recommended for structural hierarchy
graph LR    %% Left-to-right: recommended for data pipelines and flows
graph BT    %% Bottom-to-top: recommended for dependency inversion
graph RL    %% Right-to-left: reverse flow
```

### Elements

Define elements using bracket notation or function syntax:

```c4x
%% Bracket syntax
Admin[Administrator<br/>Person]
API[Payment API<br/>Software System<br/>External]

%% Function syntax with sprite icons and technology tags
Container(WebApp, "Web App", "React", $sprite="c4xicons.aws.elastic-beanstalk-application")
ContainerDb(DB, "Database", "PostgreSQL")
Person(User, "End User")
```

Supported element types include `Person`, `Software System`, `Container`, `ContainerDb`, `Component`, `ComponentDb`, and their corresponding `*_Ext` external variants.

### Relationships

Connect elements using directional arrows indicating dependency types:

```c4x
%%{ c4: container }%%
graph TB

Web[Web App<br/>Container]
Api[API<br/>Container]
Queue[Event Bus<br/>Container]

Web -->|Calls| Api                %% Standard dependency
Api ==>|Reads and writes| Queue   %% Synchronous or blocking call
Queue -.->|Notifies| Web          %% Asynchronous or event-driven
```

### Boundaries

Group containers or components within named subgraphs:

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

Full specification: [Syntax Guide](./docs/c4x-syntax.md)

## AI Generation

C4X integrates with Google Gemini to draft architecture models from code, text, or file selections.

### Setup

1. Obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/). Generation sends the selected context to the Gemini API; local parsing, layout and SVG rendering work offline.
2. In VS Code, open the Command Palette (`Cmd+Shift+P` or `Ctrl+Shift+P`) and run `C4X: Set Gemini API Key`.
3. Paste the key. C4X stores the credential in VS Code encrypted SecretStorage. Keys are never written to plain settings files or committed to source control.
4. To replace or clear an existing key, run `C4X: Set Gemini API Key` or `C4X: Clear Gemini API Key`.

### Commands

| Command | Action |
|---|---|
| `C4X: Generate Diagram Here (Gemini)` | Reads code in the active folder and inserts a complete C4 model at the cursor. |
| `C4X: Diagram from Selection` | Generates a visual PNG diagram from highlighted code or prose. |
| `C4X: Select Gemini Model` | Discovers available Gemini models and sets the active generation endpoint. |

The default model is `gemini-3.8-flash`, with automatic failover to `gemini-3.1-pro-preview`. Generated diagrams undergo local parser verification with up to three automated self-correction retries before insertion.

Full guides: [Gemini AI Guide](./docs/GEMINI_GUIDE.md) | [Visual Diagram Guide](./docs/DIAGRAM-WITH-GEMINI-IMAGE.md)

## Export and MCP

### Export Formats

C4X exports diagrams cleanly for presentations, design tools, and documentation:

| Command | Format | Details |
|---|---|---|
| `C4X: Export Diagram as PNG` | PNG | 1x, 2x, or 4x resolution using HTML5 Canvas without Chromium overhead. |
| `C4X: Export SVG` | SVG | Scalable vector graphics suitable for Figma, Illustrator, or Sketch. |
| `C4X: Copy SVG To Clipboard` | SVG | Copies vector XML directly to clipboard for rapid pasting. |

All export outputs preserve the active theme styling.

### MCP Server

The C4X repository bundles a standalone Model Context Protocol (MCP) server for integration with external AI coding assistants. The server requires no local `node_modules` installation, ensuring reliable execution in clean clones:

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

For Codex environments, configure `.codex/config.toml`:

```toml
[mcp_servers.c4x-validator]
command = "node"
cwd = "/absolute/path/to/c4x-vscode-extension"
args = ["mcp/c4x-mcp-server.bundle.cjs"]
startup_timeout_sec = 10
tool_timeout_sec = 10
```

- **Tool:** `validate_c4x` evaluates diagram syntax and returns line and column errors for automated agent correction.
- **Resources:** Exposes `c4x://guidelines`, `c4x://syntax`, and `c4x://examples/*`.
- **Client compatibility:** Works with Claude Desktop, Cursor, Windsurf, Cline, and standard MCP clients.

## Contributing

Contributions are welcomed through [GitHub Issues](https://github.com/jpantsjoha/c4x-vscode-extension/issues) and pull requests. Please consult [CONTRIBUTING.md](./CONTRIBUTING.md) for contribution guidelines.

## More from the Author

Developed by **[Jaroslav Pantsjoha](https://jpantsjoha.com)**.

- **[Pine Script (v5)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.pine-script-v5)**: Syntax highlighting, snippets, and linting for TradingView Pine Script.

## Licence

Distributed under the MIT Licence. See [LICENSE](./LICENSE) for details.

## Acknowledgements

- [C4 Model](https://c4model.com/) created by Simon Brown.
- [Mermaid.js](https://mermaid.js.org/) for DSL syntax inspiration.
- [Dagre](https://github.com/dagrejs/dagre) for directed graph layout computation.

---

**Built with [Gemini](https://blog.google/products/gemini/gemini-3/) for software architects who value simplicity** · [Jaroslav Pantsjoha](https://jpantsjoha.com) · [GitHub Issues](https://github.com/jpantsjoha/c4x-vscode-extension/issues) · [GitHub Repository](https://github.com/jpantsjoha/c4x-vscode-extension)
