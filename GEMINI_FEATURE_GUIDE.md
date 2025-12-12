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
        *   `System Context (C1)`: Scans 2 levels deep. Best for root folders.
        *   `Container (C2)`: Scans 1 level deep. Best for app roots.
        *   `Component (C3)`: Scans current folder. Best for specific modules.
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

#### How Scanning Works
*   **System Context (C1)**: Scans **2 levels deep** from current folder.
    *   *Requirement*: Must be run from the **Root** or `docs/` folder.
    *   *Why*: It needs to see "wide" to find external inputs/outputs.
*   **Container (C2)**: Scans **1 level deep**.
    *   *Requirement*: Best run from `src/` or App Root.
*   **Component (C3)**: Scans **Current Folder Only**.
    *   *Requirement*: Run inside the specific module (e.g., `src/auth/README.md`).

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

## 🤖 Advanced: Using the System Prompt
We have open-sourced our **Expert System Prompt** so you can use it in your own workflows (e.g., Gemini Advanced, ChatGPT, Claude, Antigravity).

### Why use it?
If you want to generate diagrams manually in a chat interface, pasting our system prompt ensures the AI:
*   Uses valid **C4X DSL** syntax.
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
