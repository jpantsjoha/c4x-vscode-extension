# 🧠 C4X: Gemini-Powered Architecture Guide

> **Your AI Pair Programmer for C4 Model Diagrams**

The C4X extension integrates Google's **Gemini AI** to understand your code and visualize it. It is not just a drawing tool; it is an intelligent architect that parses your workspace to generate accurate C4 models.

## 🚀 Getting Started

### 1. Requirements
*   **VS Code** (v1.80+)
*   **Google Gemini API Key** (Free or Enterprise)

### 2. Setting up your API Key
You must provide an API key to enable AI features.
1.  Open VS Code Command Palette (`Cmd/Ctrl + Shift + P`).
2.  Type `C4X: Set Gemini API Key`.
3.  Paste your key. It is stored securely in VS Code's **Secret Storage** (not on disk).

> [!WARNING]
> **Data Privacy**:
> *   **Personal/Free Keys**: Google *may* use your input for model training. **Do NOT use with private/sensitive commercial code.**
> *   **Enterprise/Vertex AI Keys**: Data handling adheres to your organization's Google Cloud agreement (typically zero retention). **Recommended for professional use.**

---

## ⚡ Core Features

### 1. Generate Diagram Here (Workspace Mode)
**Best for**: "Visualize the architecture of this folder/file."
*   **Action**: Right-click inside an open Markdown file -> `C4X: Generate Diagram Here (Gemini)`.
*   **Workflow**:
    1.  Click the command.
    2.  **Select Diagram Type**:
        *   `System Context (C1)`: Scans 1 level deep. High-level overview — best from root folders.
        *   `Container (C2)`: Scans 2 levels deep. Find all services/apps — best from src/ or app root.
        *   `Component (C3)`: Scans 3 levels deep. Detailed structure — best from specific module folders.
    3.  The AI analyzes the file's location and neighbor files to generate the diagram.

### 2. Diagram from Selection (Sketch Mode)
**Best for**: "Turn this specific text into a diagram."
*   **Action**: Select text in any editor -> Right Click -> `C4X: Diagram from Selection`.
*   **Use Cases**:
    *   Highlighting a list of requirements or user stories.
    *   Selecting a block of pseudo-code or legacy documentation.
    *   Visualizing a manually written "flow" (`A -> B -> C`).

---

## ⚠️ Caveats & "Gotchas"

### 1. Context Awareness & "Leaf Node" Issue
The AI is not omniscient. It only "sees" relative to where you run it.
*   **The Issue**: If you are in a deep sub-folder (e.g., `src/utils/helpers`) and ask for a **System Context (C1)**, the AI cannot see "up" to your database or external users. It will essentially be "blind" to the system architecture.
    *   *Result*: It might generate a generic/hallucinated system or fail.
*   **The Fix**: Always run high-level diagrams (C1/C2) from the **Root** of your workspace or the main entry point of your application.

### 2. Scanning Depth & Location Strategy
The "Generate Diagram Here" command scans **relative to the file you are editing**. This makes the **location** of your Markdown file critical.

#### How Scanning Works (Updated v1.3.0)
*   **System Context (C1)**: Scans **1 level deep** from current folder.
    *   *Requirement*: Must be run from the **Root** or `docs/` folder.
    *   *Why*: High-level overview — shallow scan prevents implementation noise while capturing major systems.
*   **Container (C2)**: Scans **2 levels deep**.
    *   *Requirement*: Best run from `src/` or App Root.
    *   *Why*: Medium depth discovers services/apps in nested folders (e.g., `src/services/payment/`).
*   **Component (C3)**: Scans **3 levels deep**.
    *   *Requirement*: Run inside the specific module (e.g., `src/auth/README.md`).
    *   *Why*: Deep scan captures all classes, modules, and implementation details.

#### The "Reverse Order" Trap
If you create a Markdown file deep in your project (e.g., `src/services/payment/README.md`) and ask for a **System Context (C1)**:
1.  The AI looks for files *inside* `payment/`.
2.  It cannot see "up" to the Database, UI, or other Services.
3.  **Result**: It generates a "Micro-System" diagram of just the payment service, or fails to find any system boundaries.

> **Rule of Thumb**:
> *   **High-Level Diagrams (C1/C2)** -> Go in **Root** docs.
> *   **Low-Level Diagrams (C3)** -> Go in **Module** docs.

### 3. Depth Constraints
*   **Scanning Limit**: To prevent token overflow...

### 2. Strictly C4 Notation
Gemini is instructed to be a **Strict C4 Architect**.
*   It will **NOT** generate generic flowcharts, UML Class diagrams, or Sequence diagrams.
*   It attempts to map everything to: `Person`, `Software System`, `Container`, or `Component`.
*   *Caveat*: If you ask for a "Flowchart of this function", it will likely refuse or try to force it into a Component diagram.

### 3. Hallucinations
While we use advanced prompting (`GEMINI.md`) to ground the AI, it may occasionally:
*   Invent relationships that don't exist (based on variable names).
*   Misidentify a library as an external system.
*   **Always verify the generated C4 DSL code manually.**

---

## 🎨 Visual Diagram Customization (v1.3.0)

### Overview
C4X supports generating **presentation-ready PNG diagrams** using Gemini's image generation models. You have full control over the visual style, layout, and colors.

### Quick Start
1. **Select text** describing your architecture (or use existing C4X code).
2. **Right-click** → `C4X: Preview - Visual Diagram (PNG)`.
3. The AI generates a PNG image and inserts it into your markdown.

### Visual Presets
Control the overall aesthetic with built-in presets:

```json
{
  "c4x.ai.visualPreset": "dark"
}
```

| Preset | Description | Best For |
|--------|-------------|----------|
| `default` | Clean white background, standard C4 colors | Professional documentation, technical specs |
| `dark` | Dark background (#1a1a1a), neon accents | Presentations, slide decks, dark-theme environments |
| `light` | Bright white, high contrast, sharp edges | Print-ready documents, formal reports |
| `pastel` | Soft pastel palette, rounded corners | Creative presentations, gentle aesthetic |
| `corporate` | Grey-blue palette, sharp edges | Business presentations, executive summaries |

### Layout Preferences
Control diagram spacing and density:

```json
{
  "c4x.ai.layoutPreference": "spacious"
}
```

| Preference | Description | Use Case |
|------------|-------------|----------|
| `balanced` | Standard spacing, medium arrow length | Most diagrams (default) |
| `compact` | Tight spacing, short arrows | Fitting many elements on screen, complex systems |
| `spacious` | Generous padding, long arrows | Presentations, readability focus, simple systems |

### Custom Style Override
For complete control, use `visualGroundingContext` (max 300 characters):

```json
{
  "c4x.ai.visualGroundingContext": "Cyberpunk aesthetic with neon purple and cyan accents, transparent background, glowing edges on all boxes"
}
```

**Examples**:
- `"Hand-drawn sketch style, black pen on white paper, rough edges"`
- `"Minimalist monochrome, thin lines, sans-serif labels, lots of white space"`
- `"Blueprint style, white lines on deep blue background (#003366), technical drawing aesthetic"`

> **Note**: Custom grounding context **overrides** the visual preset. Leave it empty to use the preset.

### C4 Color Palette Enforcement
C4X strictly enforces the official C4 Model color palette to ensure consistency across all generated diagrams:

**Official Colors** (EXACT, MANDATORY):
- **Person**: `#08427B` (Dark Blue) with White Text
- **Software System**: `#1168BD` (Blue) with White Text
- **External System**: `#999999` (Grey) with White Text
- **Container**: `#438DD5` (Light Blue) with White Text
- **Component**: `#85BBF0` (Lighter Blue) with Black Text

**Forbidden Colors** (for structural elements):
- ❌ Green, Red, Yellow, Orange — Reserved for **status indicators only**
- ✅ Status Colors:
  - Green = Active/Success/Running
  - Red = Error/Critical/Down
  - Yellow = Warning/Degraded

### Configuration Example
Complete visual customization setup:

```json
{
  "c4x.ai.imageModel": "gemini-3.1-flash-image-preview",  // Nano Banana 2
  "c4x.ai.visualPreset": "corporate",                     // Grey-blue aesthetic
  "c4x.ai.layoutPreference": "spacious",                  // Generous spacing
  "c4x.ai.visualGroundingContext": ""                     // Empty = use preset
}
```

### Best Practices
1. **Use Presets First**: Try built-in presets before writing custom grounding.
2. **Be Specific**: Custom grounding works best with concrete details ("neon purple #A855F7") not vague terms ("cool colors").
3. **Respect C4 Colors**: Don't override structural element colors — maintain C4 Model standards.
4. **Layout Matters**: Choose `compact` for complex systems (10+ elements), `spacious` for presentations (5-8 elements).
5. **Iterate**: If output doesn't match expectations, refine your grounding context and regenerate.

### Troubleshooting
- **Colors Don't Match**: Ensure you're not using forbidden colors (green/red/yellow) for structural elements.
- **Layout Too Crowded**: Switch to `spacious` layout preference.
- **Style Ignored**: Check that `visualGroundingContext` is empty if you want to use presets.
- **Text Unreadable**: Use high-contrast presets (`light` or `dark`) for better legibility.

---

## 🤖 Advanced: Using the System Prompt
We have open-sourced our **Expert System Prompt** so you can use it in your own workflows (e.g., Gemini Advanced, ChatGPT, Claude, Antigravity).

### Why use it?
If you want to generate diagrams manually in a chat interface, pasting our system prompt ensures the AI:
*   Uses valid **C4X DSL** syntax.
*   **Applies Icons Correctly**: Uses `$sprite="c4xicons..."` instead of hallucinated syntaxes.
*   Follows layout rules (Vertical vs Horizontal).
*   Theming and styling correctly.

### How to use it:
1.  Locate `GEMINI.md` in the extension root (or [view on GitHub](https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/GEMINI.md)).
2.  Copy the entire content.
3.  Paste it into your AI chat as the **System Instruction** or first message.
4.  Paste your code or requirements.
5.  Copy the output code block back into a `.md` file in VS Code.

> [!TIP]
> This is perfect for complex refactoring discussions where you want to "visualize" the before/after state before writing code.

---

## 📚 Examples & References
*   [**Example Gallery**](docs/EXAMPLES.md): See what C4X can do.
*   [**Layout Guide**](docs/EXAMPLES-LAYOUT.md): Learn how to control direction (`TB`, `LR`).
*   [**Syntax Guide**](docs/c4x-syntax.md): Full DSL reference.
