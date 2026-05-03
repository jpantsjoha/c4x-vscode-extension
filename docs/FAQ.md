# Frequently Asked Questions (FAQ)

**Version**: 1.3.0
**Last Updated**: 2026-05-02

This document answers common questions about the C4X extension.

---

## General

### Q: What is C4X?

A: C4X is a VS Code extension that makes creating C4 Model diagrams as easy as using Mermaid. It provides a simple, text-based DSL (Domain-Specific Language) called C4X-DSL, a real-time preview, and offline-first functionality.

### Q: Why not just use Mermaid?

A: While Mermaid is fantastic for many diagram types, it doesn't have native support for the specific semantics of the C4 Model (like Person, Software System, Container, Component, and boundaries). C4X provides a Mermaid-inspired syntax but is purpose-built for C4, resulting in a more streamlined experience and better layout for C4 diagrams.

### Q: Is C4X free?

A: Yes, C4X is free and open-source, licensed under the MIT License.

---

## Technical

### Q: Does C4X require Java, Docker, or an internet connection?

A: No. C4X is designed to be completely offline-first. It bundles all necessary components (parser, layout engine) and runs entirely within VS Code. You do not need to install Java, Docker, or have an active internet connection to use it.

### Q: What layout engine does C4X use?

A: C4X uses [Dagre.js (Eclipse Layout Kernel)](https://www.eclipse.org/elk/), a powerful, production-grade layout engine that excels at hierarchical diagram layout, which is perfect for C4 diagrams.

### Q: How does the Markdown integration work?

A: The extension includes a `MarkdownIt` plugin that is automatically used by VS Code's built-in Markdown previewer. It finds code blocks fenced with `c4x` and replaces them with the rendered SVG diagram on the fly.

---

## Layout & Positioning

### Q: Why does the layout change when I reorder my code?

A: C4X uses **Dagre** (a directed graph layout engine) which is deterministic but sensitive to input order. Specifically, the order in which you define **relationships** determines the left-to-right ordering of sibling nodes.

-   **Defined First** -> Appears Left
-   **Defined Later** -> Appears Right

You can use this behavior to fine-tune your diagrams without absolute positioning. See [Examples: Ordering & Layout Control](./EXAMPLES-ORDERING.md) for visual demonstrations.

### Q: Can I manually position elements?

A: **Yes (v1.1+)!** You can use the `$x` and `$y` attributes to enforce specific coordinates, overrides the automatic layout engine.
- Example: `Component(Name, "Label", "Tech", $x="100", $y="200")`

### Q: Can I have horizontal flows inside a vertical diagram?

A: **Yes (v1.1+)!** You can use `direction LR` (or `TB`, `RL`, `BT`) inside any `subgraph` to control its internal layout direction independently of the main diagram. See the [Layout Guide](./EXAMPLES-LAYOUT.md) for details.

---

## Syntax

### Q: Can I use my existing Mermaid diagrams with C4X?

A: Not directly, but the migration is very simple. C4X uses a Mermaid-inspired syntax, but requires C4-specific types for elements. For example, where in Mermaid you might have `A[User]`, in C4X you would write `User[User<br/>Person]`. See the [C4X-DSL Syntax Reference](./c4x-syntax.md) for more details.

### Q: How do I use Cloud Icons (AWS/Azure/GCP)?

A: **Yes (v1.1.6+)!** C4X supports PlantUML-style sprites natively.
To use an icon, you MUST use the **Function/Macro Syntax** instead of the Bracket syntax:
- **Correct**: `Container(S3, "My Bucket", "AWS S3", $sprite="aws-s3-bucket")`
- **Incorrect**: `S3[My Bucket<br/>Container...]` (Sprites are not supported in brackets)

**Pro Tip:** Type `sprite="` inside any C4X block to trigger **Autocomplete** and see the full list of available 100+ icons!

### Q: What C4 levels are supported?

A: As of v0.2.0, C4X has full support for:

- **Level 1: System Context** diagrams (`system-context`)
- **Level 2: Container** diagrams (`container`)

Support for **Level 3: Component** diagrams is planned for a future release.

### Q: How do I create boundaries (like a System Boundary)?

A: You can create boundaries in Container (C2) diagrams using the `subgraph` keyword, which is inspired by Mermaid's syntax.

```text
subgraph MySystem {
    WebApp[Web App<br/>Container]
    Database[Database<br/>Container]
}
```

---

## Future

### Q: Will C4X support other DSLs like Structurizr or PlantUML?

A: Yes. Support for importing diagrams from Structurizr DSL and C4-PlantUML is on our roadmap. The goal is to provide a unified preview and editing experience for multiple C4 diagram dialects.

### Q: Where can I find the extension on the VS Code Marketplace?

A: C4X is available on the [VS Code Marketplace](https://marketplace.visualstudio.com/). Search for "C4X" in VS Code's Extensions panel or install it directly from the Marketplace.

---

## AI & Gemini Integration

> **See [GEMINI.md](../GEMINI.md)** for the complete AI Model Configuration guide and DSL reference.

### Q: How do I change the AI model?

A: Open **Settings** (Ctrl/Cmd + ,), search for `c4x.ai.model`, and enter any Gemini model ID your API key supports. This is a free-text field -- you can type any valid model ID.

```json
{
  "c4x.ai.model": "gemini-3.1-pro-preview"
}
```

The default is `gemini-3.1-pro-preview`.

### Q: Which models are supported?

A: C4X works with any Gemini model your API key supports. Here are the recommended options:

| Model | Status | Best For |
|-------|--------|----------|
| `gemini-3.1-pro-preview` | **Default** | Best reasoning, 1M context ($2/$12 per 1M tokens) |
| `gemini-3-flash-preview` | Supported | Fast responses, free tier available (rate-limited) |
| `gemini-2.5-pro` | Sunset 2026-06-17 | Legacy -- migrate before sunset |
| `gemini-2.5-flash` | Sunset 2026-06-17 | Legacy -- migrate before sunset |

**Removed models** (no longer available):
- `gemini-3-pro-preview` -- sunset 2026-03-09

See [Google AI Models](https://ai.google.dev/gemini-api/docs/models) for all available model IDs.

### Q: What happens if my model is sunset?

A: C4X has **smart fallback** built in. If your configured model fails for any reason (sunset, quota, network error), C4X automatically tries backup models:

1. Your configured model (with up to 3 self-correction retries)
2. `gemini-3.1-pro-preview` (if your model was different)
3. `gemini-3-flash-preview` (if you were already on `gemini-3.1-pro-preview`)

This happens transparently -- you will see a brief "Trying fallback..." message. If all models fail, you will get a clear error with guidance.

To avoid fallback delays, update your model setting before a sunset date.

### Q: How do I change the image generation model?

A: Open **Settings**, search for `c4x.ai.imageModel`, and enter an image-capable Gemini model ID.

```json
{
  "c4x.ai.imageModel": "gemini-3.1-flash-image-preview"
}
```

**Available image models:**

| Model | Notes |
|-------|-------|
| `gemini-3.1-flash-image-preview` | **Default** -- Nano Banana 2 (fast, 4K output) |
| `gemini-3-pro-image-preview` | Nano Banana Pro (highest quality, opt-in) |

### Q: Do I need a paid Gemini API key?

A: No. The `gemini-3-flash-preview` model is available on the free tier, though it is rate-limited. For heavier usage or access to `gemini-3.1-pro-preview`, a paid key removes rate limits and provides better throughput.

- **Free key**: Go to [Google AI Studio](https://aistudio.google.com/apikey) and create one in seconds.
- **Enterprise key**: Use your Google Cloud Console > APIs & Services > Credentials, with the Generative Language API enabled.

### Q: Does the AI feature cost money?
A: The C4X extension itself is free. AI features use your own Google Gemini API key. Free-tier keys (from AI Studio) work within rate limits. Paid keys (Vertex AI or paid AI Studio tiers) incur standard Google Cloud charges. `gemini-3.1-pro-preview` costs approximately $2 per 1M input tokens and $12 per 1M output tokens.

### Q: Is my code private when using AI?
A: That depends on your key type:
- **Enterprise / Vertex AI**: Your data is handled according to your organization's Google Cloud Platform terms (typically **not** used for model training). Recommended for professional work.
- **Personal / AI Studio**: Google may use your input for model training depending on current terms. **Do not use personal keys with private/sensitive company code.**

### Q: My diagram generation is failing. What should I check?

A: Work through these steps:

1. **Check your API key**: Open Settings, search for `c4x.ai.apiKey`, and verify it is set correctly. You can test your key at [Google AI Studio](https://aistudio.google.com/).
2. **Check your model**: Ensure `c4x.ai.model` is set to a valid, non-sunset model. Try `gemini-3.1-pro-preview` (the default).
3. **Check your network**: AI features require an internet connection. Verify you can reach `generativelanguage.googleapis.com`.
4. **Check rate limits**: Free-tier keys have request limits. If you see 429 errors, wait a minute or upgrade your key.
5. **Check the Output panel**: Open VS Code's Output panel (View > Output) and select "C4X" from the dropdown for detailed error messages.

### Q: Can I use Claude or OpenAI models?
A: Not currently. C4X uses the Google Generative AI SDK, which only supports Gemini models. Multi-provider support is on the roadmap. For now, any valid Gemini model ID will work.

### Q: Why do different diagram levels scan different depths?
A: This is part of **Smart Context Tuning** (v1.3.0):
- **System Context (C1)**: Scans **1 level deep**. High-level overview -- shallow scan prevents implementation noise.
- **Container (C2)**: Scans **2 levels deep**. Medium depth to discover services, apps, and databases.
- **Component (C3)**: Scans **3 levels deep**. Detailed structure requires deep scan for classes, modules, and dependencies.

Higher abstraction = shallower scan, lower abstraction = deeper scan.

### Q: How does the AI decide which diagram type to recommend?
A: When you use "Diagram from Selection", Gemini analyzes your text before showing the menu:
- **External Systems** or high-level actors -> suggests **System Context (C1)**.
- **Classes, Code, or Functions** -> suggests **Component (C3)**.

The recommended option appears at the top with a star.

### Q: Why does my diagram sometimes generate Horizontally (LR) and sometimes Vertically (TB)?
A: The **Smart Layout Engine** (v1.1.3+) optimizes for readability:
- **Small Diagrams (4 nodes or fewer)**: Defaults to **Horizontal (Left-Right)** to save vertical space.
- **Large Diagrams (5+ nodes)**: Defaults to **Vertical (Top-Bottom)** to avoid horizontal scrolling.
- **Input Matching**: If your text looks like a horizontal flow (`A -> B -> C`), the AI matches that direction.

### Q: Does the AI validate its own output?
A: Yes. C4X implements **Self-Validation with Auto-Correction**:
1. Generated diagrams are parsed using the C4X syntax validator.
2. If syntax errors are detected, the error message is fed back to the model.
3. The model attempts to self-correct (up to 3 retries).
4. If validation still fails, a clear error message guides you to check model settings.

### Q: What is Visual Diagram Generation?
A: This feature (v1.2.0+, updated v1.3.0) uses Gemini image models to generate **PNG images** of C4 diagrams directly from text descriptions, without writing any DSL code.

The default image model is `gemini-3.1-flash-image-preview` (Nano Banana 2). You can switch to `gemini-3-pro-image-preview` (Nano Banana Pro) for higher quality output via the `c4x.ai.imageModel` setting.

**How it differs from C4X-DSL:**

| C4X-DSL (Default) | Visual Generation |
|-------------------|-------------------|
| Outputs SVG via parser | Outputs PNG via AI |
| Deterministic | Slight variations between runs |
| Requires DSL syntax | Natural language input |
| Works offline | Requires API + network |
| Editable code | Non-editable image |

See the [Visual Diagram Guide](./DIAGRAM-WITH-GEMINI-IMAGE.md) for details.

### Q: How do I use Visual Diagram Generation?
A:
1. Select text describing your architecture in a markdown file.
2. Right-click and choose "C4X: Preview - Visual Diagram (Gemini)".
3. The AI generates a PNG and embeds it in your markdown.

The AI automatically detects the C4 level (C1/C2/C3) from your context.

### Q: Why is my visual diagram Vertical instead of Horizontal?
A: C4X v1.2.8+ uses a **Smart Layout Algorithm**:
- **4 entities or fewer**: Defaults to **Horizontal (Left-Right)** to emphasize flow.
- **5+ entities**: Defaults to **Vertical (Top-Bottom)** to manage density.
- **Linear Flows**: If your text describes a sequence (e.g. "A -> B -> C"), it follows that direction.

## Troubleshooting

### Q: My diagram isn't rendering. What should I do?

A: First, check for syntax errors. The preview panel will usually display a specific error message. If you don't see one, please consult the [Troubleshooting Guide](./TROUBLESHOOTING.md) for more detailed steps.
