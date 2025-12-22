# Frequently Asked Questions (FAQ)

**Version**: 1.2.1
**Last Updated**: 2025-12-20

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

### Q: When will the extension be available on the VS Code Marketplace?

A: We are targeting a v1.0 release for the Marketplace. You can track our progress in the [STATUS.md](../../docs/STATUS.md) file.

---

## AI & Gemini Integration

> **See [GEMINI_FEATURE_GUIDE.md](../GEMINI_FEATURE_GUIDE.md)** for the complete User Guide and Best Practices.

### Q: Does the AI feature cost money?
A: The feature itself is free, but it uses your own Google Gemini API Key. If you use a free tier key (e.g., AI Studio), it is free within limits. If you use Vertex AI or paid tiers, standard Google Cloud charges apply.

### Q: Is my code private when using AI?
A: That depends on your key type:
- **Enterprise / Vertex AI**: If you use a key from a standard Google Cloud Project (Vertex AI), your data is handled according to your organization's implementation of Google Cloud Platform terms (typically **NOT trained on**). We recommend this for professional work.
- **Personal / AI Studio**: If you use a free key from Google AI Studio, Google may use your input for model training. **Do not use personal keys with private/sensitive company code.**

### Q: Where do I get a key?
A:
- **Personal (Free)**: [Google AI Studio](https://aistudio.google.com/app/apikey)
- **Enterprise**: Go to your Google Cloud Console > APIs & Services > Credentials, and create an API Key for your project with Vertex AI API enabled.

### Q: Why do System Context (C1) diagrams read more files?
A: This is part of our **Smart Context Tuning**:
- **System Context (C1)**: Scans **2 levels deep**. We do this to "cast a wide net" and find external system integrations (like Stripe, AWS, Legacy APIs) which are often buried in adapter folders.
- **Container / Component (C2/C3)**: Scans **1 level deep**. This keeps the AI focused on high-level boundaries and prevents it from getting distracted by low-level implementation details, reducing hallucinations.

### Q: How does the AI decide which diagram type to recommend?
A: When you use "Diagram from Selection", Gemini performs a lightweight analysis of your text before showing the menu:
- If it sees **External Systems** or high-level actors, it suggests **System Context (C1)**.
- If it sees **Classes, Code, or Functions**, it suggests **Component (C3)**.
The recommended option appears at the top with a ⭐ star.

### Q: Why does my diagram sometimes generate Horizontally (LR) and sometimes Vertically (TB)?
A: This is our **Smart Layout Engine** (v1.1.3+) optimizing for your screen size:
- **Small Diagrams (≤ 4 Nodes)**: Defaults to **Horizontal (Left-Right)** to save vertical space.
- **Large Diagrams (> 4 Nodes)**: Defaults to **Vertical (Top-Bottom)** to avoid endless horizontal scrolling.
- **Input Matching**: If your selected text looks like a horizontal flow (`A -> B -> C`), the AI tries to match that direction.

### Q: Which AI models does C4X use?
A: C4X uses a tiered model strategy (v1.2.0+):
1. **Primary**: `gemini-3-flash-preview` - Pro-grade reasoning at 3x Flash speed (default).
2. **Fallback**: `gemini-3-pro-preview` - Automatically used if primary fails.
3. **Legacy**: `gemini-2.5-pro` - Available in settings for compatibility.

You can configure this in VS Code settings: `"c4x.ai.model": "gemini-3-flash-preview"`.

### Q: Does the AI validate its own output?
A: Yes! C4X implements **Self-Validation with Auto-Correction**:
1. All generated diagrams are parsed using the C4X syntax validator.
2. If syntax errors are detected, the error message is fed back to the model.
3. The model attempts to self-correct (up to 2 retries per model).
4. If validation fails after retries, it automatically falls back to the secondary model.

This ensures you always receive syntactically valid C4X diagrams.

### Q: What is Visual Diagram Generation (Preview)?
A: This is a new feature (v1.2.0+) that uses `gemini-3-pro-image-preview` to generate **PNG images** of C4 diagrams directly from text descriptions, without writing any DSL code.

**How it differs from C4X-DSL:**

| C4X-DSL (Default) | Visual Generation (Preview) |
|-------------------|----------------------------|
| Outputs SVG via parser | Outputs PNG via AI |
| Deterministic | Slight variations between runs |
| Requires DSL syntax | Natural language input |
| Works offline | Requires API + network |
| Editable code | Non-editable image |

**[📘 Read the Full Visual Diagram Guide](./DIAGRAM-WITH-GEMINI-IMAGE.md)**

### Q: How do I use Visual Diagram Generation?
A:
1. Select text describing your architecture in a markdown file
2. Right-click → "C4X: Preview - Visual Diagram (Gemini)"
3. The AI generates a PNG and embeds it in your markdown

The AI automatically detects the C4 level (C1/C2/C3) from your context.

### Q: Why is my visual diagram Vertical instead of Horizontal?
A: C4X v1.2.8+ uses a **Smart Layout Algorithm**:
- **≤ 4 Entities**: Defaults to **Horizontal (Left-Right)** to emphasize flow.
- **≥ 5 Entities**: Defaults to **Vertical (Top-Bottom)** to manage density.
- **Linear Flows**: If your text describes a sequence (e.g. "A -> B -> C"), it strictly follows that direction.

## Troubleshooting

### Q: My diagram isn't rendering. What should I do?

A: First, check for syntax errors. The preview panel will usually display a specific error message. If you don't see one, please consult the [Troubleshooting Guide](./TROUBLESHOOTING.md) for more detailed steps.
