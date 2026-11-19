# C4X: Gemini AI Guide

> Your AI pair programmer for C4 architecture diagrams.

C4X integrates Google Gemini to analyze your code and generate accurate C4 models. This guide covers setup, commands, AI behaviour, visual customization, and troubleshooting. To generate without a Gemini key, using a chat model you already have in VS Code, see [Without a Gemini key: use a VS Code model](#without-a-gemini-key-use-a-vs-code-model).

---

## Setup

### 1. Get an API Key

- **Personal / Free**: Get a key from [Google AI Studio](https://aistudio.google.com/). Data may be used for model training -- do not use with sensitive code.
- **Enterprise**: Create a key in [Google Cloud Console](https://cloud.google.com/) (Vertex AI). Compliant with your GCP data privacy terms.

### 2. Configure the Key

Run `C4X: Set Gemini API Key` from the Command Palette (`Cmd+Shift+P`). The key is stored in VS Code's encrypted **SecretStorage** (not on disk). Legacy plaintext settings keys are auto-migrated.

### 3. Choose a Model

C4X defaults to `gemini-3.8-flash` with automatic failover to `gemini-3.1-pro-preview`.

```json
{
  "c4x.ai.model": "gemini-3.8-flash"
}
```

| Model | Use case |
|-------|----------|
| `gemini-3.8-flash` | **Default**. Newest generally available flash model |
| `gemini-3.7-flash` | Previous generation, still generally available |
| `gemini-3.6-flash` | Previous default, still generally available |
| `gemini-3.1-flash-lite` | Budget option |
| `gemini-3.1-pro-preview` | Best reasoning, used as the automatic failover. A preview model, because no generally available Pro exists in the 3.x line |
| Any valid Gemini model ID | Accepted immediately, no extension update needed |

Defaults are only ever generally available models. Preview models are retired at
short notice, so C4X does not ship one as a default.

### Choosing from what your key can actually use

Run **`C4X: Select AI Model`** (or **`C4X: Select Gemini Image Model`**). It
asks the API which models your key can reach and lists them, newest first, with
preview and retired ones marked. Free-tier and paid keys see different lists,
which is why this beats typing an id into a setting.

### When a model disappears

Google retires models, sometimes at short notice. If the model you are pinned
to can no longer be reached, C4X uses the newest generally available model in
the same tier and tells you it did, once per session per substitution, rather
than failing. The text and image tiers resolve independently, so each announces
its own swap. Resolution happens twice over:
before the call, if your key's model list no longer includes the pinned id, and
during the call, if the API answers "not found" for a model it was still
listing. A rejected key, an exhausted quota or a dropped connection is not a
model fault and does not change your model. Set `c4x.ai.modelStrategy` to
`auto-ga` if you would rather always be on the newest generally available model
without waiting for an extension update; preview and experimental models are
never chosen automatically.

What this cannot do is spot a model Google has deprecated but still lists and
still serves — the model list carries no lifecycle state, so nothing in the API
distinguishes it from its replacement. That case is caught by the extension's
own model registry and its release checks, not by discovery.

**Runtime validation**: C4X validates your model ID at activation and warns if unrecognised. If a model's sunset date is within 30 days, you'll see a migration notification.

**Smart fallback (text generation)**: If your chosen text model fails for any other reason, or its healed replacement also fails, C4X tries `gemini-3.1-pro-preview`, or `gemini-3.8-flash` if you were already on the Pro model.

The image tier has no Pro/Flash failover. After a failed heal, it retries with
the corrective prompt as before.

---

## Without a Gemini key: use a VS Code model

> In 1.9.2 (published 2026-11-19). Opt-in through a setting. Checked 2026-11-15.

C4X can draft a C4 model with a chat model you already have in VS Code, such as one from GitHub Copilot, instead of a Gemini API key. VS Code supplies the model through its Language Model API; C4X never sees a key or a token, and it reads no other tool's credentials. The draft goes through the same parser check as Gemini output before anything is inserted.

Gemini stays the default. Nothing changes until you switch the setting.

### Switch it on

1. Open Settings (user settings) and set **C4X › AI: Provider** (`c4x.ai.provider`) to `vscode-lm`.
2. Optional: run **`C4X: Select AI Model`**. It lists every chat model VS Code offers C4X, with its vendor and a tier guessed from its name, and saves your choice in `c4x.ai.vscodeLm.model`. The list refreshes if your models change while it is open.
3. Run **`C4X: Generate Diagram Here (Gemini)`** or **`C4X: Diagram from Selection`** as usual. The commands keep their names; with `vscode-lm` they use your VS Code model and never ask for a Gemini key.

This route needs VS Code 1.91 or later, the first Stable release with the Language Model API; the rest of C4X supports VS Code 1.90. On an older version, or an editor built on VS Code that does not offer the API, C4X says which version is needed and sends nothing. `c4x.ai.provider` is a user setting: a workspace's `.vscode/settings.json` cannot switch it.

### What happens when you generate

1. You choose the diagram type from the list.
2. C4X builds the request once, then asks you to confirm the model before sending anything. The dialog names the model, its vendor and its guessed tier, lists every workspace input in the request with its size in bytes (the selected text, or each file read from the folder, and any guideline file), lists files it left out and why, and gives the size of the whole request. Choose **Generate**, **Choose Another Model**, or close it to send nothing. The request sent is the one the dialog described: changing a setting while the dialog is open does not change it.
3. The first time, VS Code may ask whether C4X may use the model. That is VS Code's own consent dialog; C4X shows it as VS Code designed it and never works around a refusal.
4. C4X sends one request, checks the answer with its parser, and re-prompts with the parser's error at most twice. A notification shows progress and has a **Cancel** button; cancelling at any point, even as the answer arrives, inserts nothing.
5. The checked diagram is inserted as a fenced `c4x` block after your selection or at the cursor.

### Model choice

- With no model chosen, C4X proposes one from the middle tier, judged only from words such as "mini" or "pro" in the model's name. The guess says nothing about price, so you confirm the actual model every time.
- A model you chose is used while VS Code offers it. If it disappears, generation stops and asks you to choose another. C4X never switches models, or providers, on its own.
- Requests count against your plan with that model's provider, as any other use of the model does.

### What C4X sends, and what it does not

- **From a selection:** the selected text, the instruction and C4X's built-in guidance.
- **From a folder:** the files the folder scan reads, as for Gemini (see [What a folder scan sends](#what-a-folder-scan-sends)).
- **Workspace guidelines:** by default C4X sends its built-in guidance and reads no guideline file. Turn on `c4x.ai.vscodeLm.sendWorkspaceGuidelines` to send your workspace's `docs/C4X-GENERATION-GUIDELINES.md` (or `GEMINI.md`) and `EXAMPLES.md` in place of the built-in guidance; the confirmation lists them with their sizes.

Gemini generation reads the workspace guideline files into its guidance section, as before.

### Messages and what to do

| Message starts with | Cause | Fix |
|---|---|---|
| This editor does not offer the VS Code Language Model API | VS Code older than 1.91, or an editor built on VS Code that does not offer the API | Update to VS Code 1.91 or later, or set `c4x.ai.provider` to `gemini` |
| VS Code offered no chat model to C4X | No model provider installed or signed in | Sign in to GitHub Copilot or another model provider, or use Gemini |
| C4X was not given access to … | You declined VS Code's consent dialog | Run the command again and allow access |
| … refused the request, usually because a quota or rate limit was reached | Your plan's limit | Wait and retry, or choose another model |
| … is no longer available / is not offered by VS Code any more | The model was withdrawn or you signed out | Run `C4X: Select AI Model` |
| … did not produce valid C4X after 3 attempts | Three answers failed the parser | Retry, or choose another model |
| Generation cancelled | You pressed Cancel | Nothing was inserted |

### Not covered

- Visual (PNG) diagrams always use Gemini.
- Assistants outside VS Code (Claude Code, Codex and others) generate through the C4X skill and MCP tools instead; C4X does not start another vendor's command-line tool.
- Which plans let other extensions use which models, and how an organisation turns this route off, are still being checked on real hosts (issue #394).

---

## What a folder scan sends

`C4X: Generate Diagram Here (Gemini)` reads files around the current document: up to 20 files of at most 50 KB each, a few folder levels deep depending on the diagram type, skipping tests, build output and dependencies. Whichever provider you use, two kinds of file are never sent:

- **Guideline documents** named `C4X-GENERATION-GUIDELINES.md`, `GEMINI.md` or `EXAMPLES.md`. Guidance reaches the model only through the guidance section: Gemini reads `docs/C4X-GENERATION-GUIDELINES.md` (or `GEMINI.md`) and `EXAMPLES.md` from the workspace root; the VS Code model route does so only with `c4x.ai.vscodeLm.sendWorkspaceGuidelines` on.
- **Credentials.** Files named like credential stores are not even read: `.env` and `.env.*`, `*.env`, `.npmrc`, `.netrc`, `.pypirc`, `.pgpass`, `.git-credentials`, `id_rsa` and similar SSH keys, `credentials` files, `secrets.json`/`.yaml`/`.toml`, and `*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.ppk`, `*.kdbx`. Any other file is dropped if it contains a private key block or a token in a common provider format (AWS, Google, GitHub, Slack and similar API keys).

Before anything is sent, C4X builds the request once and shows it in a confirmation: every file sent with its size in bytes, the guideline files used, every file left out and why, and the size of the whole request. Only that request is sent; for Gemini, a model replacement or failover resends the same request. Close the dialog to send nothing.

`C4X: Diagram from Selection` shows the same confirmation for its generation request. With Gemini, it first sends the selected text once, before the confirmation, to suggest a diagram type; the VS Code model route skips that step.

---

## Commands

### Generate Diagram Here (Workspace Mode)

**Best for**: "Visualize the architecture of this codebase."

1. Open a Markdown file in your project.
2. Right-click -> `C4X: Generate Diagram Here (Gemini)`.
3. Select the C4 level:

| Level | Scan Depth | Best Location | What it captures |
|-------|-----------|---------------|------------------|
| **C1 System Context** | 1 level | Project root / `docs/` | High-level systems, external dependencies |
| **C2 Container** | 2 levels | `src/` or app root | Services, databases, APIs |
| **C3 Component** | 3 levels | Inside a specific module | Classes, modules, implementation details |

The AI analyses the file's location and neighbouring files to generate valid C4X DSL, then inserts it at your cursor.

**Self-correction**: All generated diagrams are parser-validated. If syntax errors are detected, the AI self-corrects and retries (up to 3 attempts).

### Generate from Selection (Text/Sketch Mode)

**Best for**: "Turn this text into a diagram."

1. Select any text (requirements, ASCII art, notes, user stories).
2. Right-click -> `C4X: Diagram from Selection` (or `Alt+V`).
3. The AI generates a presentation-ready **PNG diagram**.

**Multi-framework detection**: The AI auto-detects the best framework:
- **C4 Model** -- structural architecture (systems, containers, components)
- **Sequence** -- ordered interactions, API call flows
- **Flowchart** -- decision logic, process steps, conditional branches

Override with `[Framework: Sequence]` or `[Framework: Flowchart]` in your selection text.

### Generate from Workspace

**Best for**: "Analyse my entire codebase and create a C4 model."

Run `C4X: Generate Diagram Here (Gemini)` from the Command Palette. The AI scans workspace files (.ts, .java, .py, etc.) and generates a complete C4 model.

---

## C4X DSL: What the AI Generates

The AI generates valid C4X DSL syntax. Understanding the syntax helps you verify and refine output.

### View Types

```text
%%{ c4: system-context }%%      %% C1 -- high-level overview
%%{ c4: container }%%           %% C2 -- building blocks
%%{ c4: component }%%           %% C3 -- internal structure
%%{ c4: deployment }%%          %% C4 -- infrastructure
%%{ c4: dynamic }%%             %% Sequence/interaction flow
```

### Element Types

```text
Person(user, "End User")
Container(api, "API Server", "Node.js")
ContainerDb(db, "Database", "PostgreSQL")
Component(auth, "Auth Module", "JWT")
System_Ext(stripe, "Stripe", "Payment gateway")
```

### Relationship Types

```text
A -->|Uses| B           %% Standard dependency
A ==>|Queries| B        %% Synchronous / blocking
A -.->|Publishes event| B    %% Asynchronous / fire-and-forget
```

### Boundaries

```text
subgraph PaymentSystem {
    Container(api, "Payment API", "Go")
    ContainerDb(db, "Ledger DB", "PostgreSQL")
}
```

### Auto-Layout Direction (v1.4.0)

The layout engine automatically selects the best direction:
- **4 or fewer elements**: Horizontal (`graph LR`)
- **5+ elements**: Vertical (`graph TB`)
- Override per diagram with `graph LR` or `graph TB`

Full syntax reference: [c4x-syntax.md](./c4x-syntax.md)

---

## Visual Diagram Customization

C4X can generate **presentation-ready PNG diagrams** using Gemini image models.

### Image Model

```json
{
  "c4x.ai.imageModel": "gemini-3.1-flash-image"
}
```

| Image model | Notes |
|-------------|-------|
| `gemini-3.1-flash-image` | **Default**. Nano Banana 2, 4K output |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite. Lowest latency and cost |
| `gemini-3-pro-image` | Nano Banana Pro. Highest quality, opt-in |

### Visual Presets

```json
{
  "c4x.ai.visualPreset": "dark"
}
```

| Preset | Description |
|--------|-------------|
| `default` | Clean white background, standard C4 colors |
| `dark` | Dark background, neon accents |
| `light` | Bright white, sharp edges |
| `pastel` | Soft colours, rounded corners |
| `corporate` | Grey-blue palette, sharp edges |

### Layout Preferences

```json
{
  "c4x.ai.layoutPreference": "spacious"
}
```

| Preference | Description |
|------------|-------------|
| `balanced` | Standard spacing (default) |
| `compact` | Tight spacing, fits more elements |
| `spacious` | Generous padding, maximum readability |

### Custom Style Override

For complete control, use `visualGroundingContext` (max 300 characters). This overrides the preset.

```json
{
  "c4x.ai.visualGroundingContext": "Blueprint style, white lines on deep blue #003366"
}
```

### C4 Colour Enforcement

C4X enforces the official C4 Model colour palette:

| Element | Fill | Text |
|---------|------|------|
| Person | `#08427B` | White |
| System | `#1168BD` | White |
| External | `#999999` | White |
| Container | `#438DD5` | White |
| Component | `#85BBF0` | Black |

Green/red/yellow are reserved for status indicators only.

### Visual Self-Remediation (v1.4.0)

If image generation fails (API error, safety filter, model issue), C4X automatically retries with a corrective prompt. C1, C2, and C3 levels produce visually distinct outputs with level-appropriate detail.

---

## Scanning and Context

### Location Matters

The AI only sees files relative to where you run it.

**Rule of thumb**:
- **C1/C2 diagrams** -> Run from **project root** or `docs/`
- **C3 diagrams** -> Run from inside the specific **module** folder

### The "Leaf Node" Trap

If you're in a deep subfolder (e.g., `src/utils/helpers`) and ask for a System Context (C1), the AI cannot see "up" to your database, users, or external systems. It generates a micro-system diagram of just that folder.

**Fix**: Run high-level diagrams from the root.

### Hallucinations

Gemini may occasionally:
- Invent relationships based on variable names
- Misidentify a library as an external system
- Generate plausible-looking but wrong architecture

Always verify generated diagrams against your actual code.

---

## Examples & References

| Guide | Content |
|-------|---------|
| [Example Gallery](./EXAMPLES.md) | Banking, Microservices, AI Agents |
| [All C4 View Levels](./EXAMPLES-VIEWS.md) | C1 through C4 + Dynamic diagrams |
| [Architecture Patterns](./EXAMPLES-PATTERNS.md) | CQRS, Saga, BFF, Hexagonal, IoT, CI/CD, Zero-Trust |
| [Cloud Icons](./EXAMPLES-with-ICONS.md) | AWS, Azure, GCP sprites |
| [Layout Guide](./EXAMPLES-LAYOUT.md) | Direction control, nested layouts |
| [Visual Diagrams](./DIAGRAM-WITH-GEMINI-IMAGE.md) | AI-powered PNG generation |
| [Syntax Reference](./c4x-syntax.md) | Complete DSL specification |
| [Generation Guidelines](./C4X-GENERATION-GUIDELINES.md) | Advanced AI prompting |

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "No API key found" | Run `C4X: Set Gemini API Key` from Command Palette |
| Model not recognised | Check spelling. Any valid Gemini model ID is accepted |
| Diagram has wrong structure | Run from the correct folder (root for C1, module for C3) |
| Visual PNG colours wrong | Check that `visualGroundingContext` is empty if using presets |
| Text unreadable in PNG | Switch to `light` or `dark` preset for higher contrast |
| Generation fails silently | Check the Output panel (`View > Output > C4X`) for error details |
| Layout too crowded | Switch to `spacious` layout preference |
| AI generates flowchart instead of C4 | Add `[Framework: C4]` to your selection text |
