# C4X User Guide

**Version**: 0.2.0
**Last Updated**: 2025-10-19

Welcome to the C4X User Guide. This document provides a comprehensive overview of all features available in the C4X VS Code extension.

---

## Table of Contents

1. [Features](#-features)
2. [Creating C4X Diagrams](#-creating-c4x-diagrams)
3. [Live Preview](#-live-preview)
4. [C4X-DSL Syntax](#-c4x-dsl-syntax)
5. [Markdown Integration](#-markdown-integration)
6. [Commands](#-commands)
7. [Troubleshooting](#-troubleshooting)

---

## ✨ Features

- **Mermaid-Inspired Syntax**: Write C4 diagrams with a familiar, intuitive syntax.
- **Real-Time Preview**: See your diagrams update as you type, with a refresh time under 250ms.
- **C4X-DSL Support**: Full support for System Context (C1) and Container (C2) diagrams.
- **Offline-First**: No Java, servers, or Docker required. Everything runs locally within VS Code.
- **Fast & Secure**: Renders typical diagrams in under 50ms and adheres to a strict Content Security Policy (CSP).
- **Markdown Integration**: Embed C4X diagrams directly into your Markdown files.

---

## 📝 Creating C4X Diagrams

To create a C4 diagram, you need to create a file with a `.c4x` extension.

1. Open a workspace in VS Code.
2. Create a new file (e.g., `my-diagram.c4x`).
3. Start writing your diagram using the [C4X-DSL syntax](#-c4x-dsl-syntax).

### Example: A Simple System Context Diagram

```c4x
%%{ c4: system-context }%%
graph TB
    Customer[Customer<br/>Person]
    BankingSystem[Internet Banking System<br/>Software System]

    Customer -->|Uses| BankingSystem
```

---

## 🖼️ Live Preview

The live preview panel shows you a real-time rendering of your C4X diagram.

### How to Open the Preview

- **Command**: Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run **C4X: Open Preview**.
- **Keyboard Shortcut**: Press `Ctrl+K V` (or `Cmd+K V` on Mac).

A new panel will open alongside your editor showing the rendered SVG diagram.

### How it Works

The preview panel automatically updates whenever you make a change to the source `.c4x` file and save it. The update process is debounced to prevent excessive re-rendering while you type.

![C4X Preview Panel](https://raw.githubusercontent.com/jpantsjoha/c4x-vscode-extension.gitmain/docs/images/c4x-preview-example.png)

---

## ✍️ C4X-DSL Syntax

C4X-DSL is the primary language for creating diagrams. For a complete reference, please see the [C4X-DSL Syntax Reference](./c4x-syntax.md).

### Key Concepts

- **View Declaration**: `%%{ c4: <type> }%%` (e.g., `system-context`).
- **Graph Direction**: `graph <dir>` (e.g., `TB` for top-to-bottom).
- **Elements**: `ID[Label<br/>Type<br/>Tags]` (e.g., `Admin[Administrator<br/>Person]`).
- **Relationships**: `FromID -->|Label| ToID`.
- **Boundaries**: `subgraph <Label> ... end` for grouping elements in C2 diagrams.

---

## Ⓜ️ Markdown Integration

You can embed C4X diagrams directly within your Markdown files using fenced code blocks.

### How to Use

1. Create or open a Markdown (`.md`) file.
2. Add a `c4x` code block:

    ````markdown
    ```c4x
    %%{ c4: system-context }%%
    graph LR
        User[User<br/>Person]
        System[My System<br/>Software System]
        User --> System
    ```
    ````

3. When you open the built-in Markdown preview in VS Code, the C4X diagram will be rendered in place of the code block.

### How it Works

The C4X extension includes a `MarkdownIt` plugin that detects `c4x` fenced code blocks and replaces them with the rendered SVG diagram during the Markdown rendering process.

---

## 📤 Export Documents

C4X allows you to export your Markdown documents with valid diagrams to standard formats.

### Markdown to HTML
- **Command**: `C4X: Export Markdown to HTML`
- **Action**: Converts the current markdown file to a standalone HTML file with all diagrams rendered as inline SVGs.
- **Use Case**: Offline sharing, static hosting.

### Markdown to PDF (Preview)
- **Command**: `C4X: Export - Preview`
- **Action**: Opens a print-optimized version of your document in the default browser.
- **Workflow**:
  1. Run the command (or right-click file → "C4X: Export - Preview").
  2. Browser opens with a blue banner.
  3. Press `Cmd+P` (Mac) or `Ctrl+P` (Windows/Linux).
  4. Select **"Save as PDF"** as the destination.

---

## ⌨️ Commands

The C4X extension provides the following commands, which can be accessed from the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`):

- **`C4X: Open Preview`**: Opens the live preview panel for the active `.c4x` file.
- **`C4X: Export Markdown to HTML`**: Exports current markdown file to HTML.
- **`C4X: Export - Preview`**: Opens print-optimized preview in browser.
- **`C4X: Export SVG`**: Exports diagram to SVG file.
- **`C4X: Copy SVG to Clipboard`**: Copies SVG source to clipboard.
- **`C4X: Change Theme`**: Switches the visual theme.

---

## 🤕 Troubleshooting

### Preview Panel is Blank or Shows an Error

- **Check Syntax**: Ensure your `.c4x` file has valid syntax. The extension will report parsing errors in the preview panel.
- **Check View Declaration**: Make sure you have a valid view declaration at the top of your file (e.g., `%%{ c4: system-context }%%`).
- **Restart VS Code**: If all else fails, try restarting VS Code to ensure the extension is activated correctly.

### Diagram Layout Looks Strange

- **Check Graph Direction**: Make sure you have specified a `graph` direction (`TB`, `LR`, etc.).
- **Simplify Labels**: Very long labels can sometimes cause layout issues. Try to keep them concise.

### Markdown Preview Doesn't Render the Diagram

- **Check the Fence**: Ensure your code block starts with ` ```c4x `.
- **Trust the Workspace**: In some cases, you may need to trust the workspace for the Markdown preview to allow scripts to run.

---

## Next Steps

- **Examples**: Check out the `examples` directory in the project for more diagram ideas.
- **Contribute**: We welcome contributions! See the [CONTRIBUTING.md](../../CONTRIBUTING.md) file for more information.
