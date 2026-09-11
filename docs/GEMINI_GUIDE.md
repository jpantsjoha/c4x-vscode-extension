# C4X: Gemini AI Guide

> Your AI pair programmer for C4 architecture diagrams.

C4X integrates Google Gemini to analyze your code and generate accurate C4 models. This guide covers setup, commands, AI behaviour, visual customization, and troubleshooting.

---

## Setup

### 1. Get an API Key

- **Personal / Free**: Get a key from [Google AI Studio](https://aistudio.google.com/). Data may be used for model training -- do not use with sensitive code.
- **Enterprise**: Create a key in [Google Cloud Console](https://cloud.google.com/) (Vertex AI). Compliant with your GCP data privacy terms.

### 2. Configure the Key

Run `C4X: Set Gemini API Key` from the Command Palette (`Cmd+Shift+P`). The key is stored in VS Code's encrypted **SecretStorage** (not on disk). Legacy plaintext settings keys are auto-migrated.

### 3. Choose a Model

C4X defaults to `gemini-3.6-flash` with automatic failover to `gemini-3.1-pro-preview`.

```json
{
  "c4x.ai.model": "gemini-3.6-flash"
}
```

| Model | Use case |
|-------|----------|
| `gemini-3.6-flash` | **Default**. Newest generally available flash model |
| `gemini-3.5-flash` | Previous default, still generally available |
| `gemini-3.1-flash-lite` | Budget option |
| `gemini-3.1-pro-preview` | Best reasoning, used as the automatic failover. A preview model, because no generally available Pro exists in the 3.x line |
| Any valid Gemini model ID | Accepted immediately, no extension update needed |

Defaults are only ever generally available models. Preview models are retired at
short notice, so C4X does not ship one as a default.

**Runtime validation**: C4X validates your model ID at activation and warns if unrecognised. If a model's sunset date is within 30 days, you'll see a migration notification.

**Smart fallback**: If your chosen model fails, C4X tries `gemini-3.1-pro-preview`, or `gemini-3.6-flash` if you were already on the Pro model.

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
