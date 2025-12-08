# Frequently Asked Questions (FAQ)

**Version**: 0.2.0
**Last Updated**: 2025-10-19

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

## Syntax

### Q: Can I use my existing Mermaid diagrams with C4X?

A: Not directly, but the migration is very simple. C4X uses a Mermaid-inspired syntax, but requires C4-specific types for elements. For example, where in Mermaid you might have `A[User]`, in C4X you would write `User[User<br/>Person]`. See the [C4X-DSL Syntax Reference](./c4x-syntax.md) for more details.

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

## Troubleshooting

### Q: My diagram isn't rendering. What should I do?

A: First, check for syntax errors. The preview panel will usually display a specific error message. If you don't see one, please consult the [Troubleshooting Guide](./TROUBLESHOOTING.md) for more detailed steps.
