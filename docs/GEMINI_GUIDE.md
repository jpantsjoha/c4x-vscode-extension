# 🧠 Intelligent Architecture with Gemini

The C4X extension now integrates Google's **Gemini AI** to act as your pair programmer for software architecture. It doesn't just draw boxes; it understands your code, best practices, and the C4 model philosophy.

## 🚀 Key Features

### 1. Generate from Code
Select any file in your workspace (Python, TypeScript, Java, Go, etc.) and ask C4X to visualize it.
- **Command**: `C4X: Generate Diagram from File`
- **Context**: The AI reads the file and its imports (up to 2 levels deep) to understand the system dependencies.
- **Output**: A fully compliant C4 Container or Component diagram.

### 2. Generate from Selection (Sketch-to-Code)
Highlight any text—a rough list of services, a sequence of arrows, or even a user story—and turn it into a diagram.
- **Usage**: Select text -> Right Click -> `C4X: Generate Diagram from Selection`.
- **Heuristics**:
    - **Horizontal Flows**: Text like `User -> App -> DB` is detected as a **Left-Right** flow.
    - **Vertical Hierarchies**: Lists or structural descriptions are detected as **Top-Bottom** hierarchies.
- **Constraint**: The AI now enforces your layout choice strictly.

### 3. Self-Correction
The generated C4 DSL is parsed and validated automatically. If the AI makes a syntax error (e.g., using HTML in labels), the extension catches it, feeds the error back to the AI, and requests a fix—all transparently to you.

---

## 🛠Configuration

To enable these features, you generally don't need to do anything if you are using the default setup. However, for power users:

1.  **API Key**:
    - Manage via `C4X: Set Gemini API Key` command.
    - Stored securely in VS Code Secrets (Zero-Knowledge).
2.  **Model Selection**:
    - Defaults to `gemini-3-preview` or `gemini-2.0-flash`.
    - Automatically falls back to `gemini-2.5-pro` if the primary model is unavailable.

---

## 💡 Best Practices for AI Diagrams

### 1. Be Specific in Instructions
When prompted, give the AI a role or specific focus:
- *"Show me the security boundaries."*
- *"Visualize the database interactions only."*
- *"Create a System Context diagram for a non-technical stakeholder."*

### 2. Guide the Layout
If you want a specific look, hint at it in your selection or instruction:
- **Left-Right**: Use arrow notation in your selection (`A -> B -> C`).
- **Top-Bottom**: Organize your selection as a bulleted list.

### 3. Iterative Refinement
The AI generates editable C4 DSL code. Treat the output as a **draft**. You can manually tweet the relations, add `UpdateLayoutConfig`, or run the prompt again with different instructions.

---

## ❓ FAQ

**Q: Does it send my code to Google?**
A: Yes, the specific files or text you select are sent to the Gemini API for processing. **Data is not used to train models** (assuming standard API terms). We strip sensitive patterns (like other API keys) where possible, but always review what you are sending.

**Q: Why did it choose a Vertical layout?**
A: For diagrams with >4 nodes, we default to Vertical to prevent the diagram from becoming too wide and unreadable. For simple flows (≤4 nodes), we prefer Horizontal. You can override this by explicitly describing a horizontal flow in your selection.
