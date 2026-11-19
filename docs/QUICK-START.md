# Quick Start Guide

**Time to Complete**: 5 minutes
**Version**: 1.8.0
**Last Updated**: 2026-11-13

Welcome to C4X! This guide will get you creating your first C4 diagram in VS Code in just a few minutes.

---

## Step 1: Installation

### Option A: VS Code Marketplace (Recommended)

1. Open VS Code.
2. Go to the Extensions view (`Ctrl+Shift+X` / `Cmd+Shift+X`).
3. Search for **"C4X"**.
4. Click **Install**.

### Option B: Install from Source

Prerequisites: Node.js 20.20.2 (`.nvmrc`), pnpm 10.18.3 and `make`. [run_instruction.md](../run_instruction.md) lists every pin.

1. **Clone the repository**:

    ```bash
    git clone https://github.com/jpantsjoha/c4x-vscode-extension.git
    ```

2. **Navigate to the directory**:

    ```bash
    cd c4x-vscode-extension
    ```

3. **Install and build**:

    ```bash
    nvm use                        # reads .nvmrc
    corepack enable
    corepack prepare pnpm@10.18.3 --activate
    pnpm install --frozen-lockfile
    make build
    ```

---

## Step 2: Launch the Extension (installed from source only)

If you installed from the Marketplace in Option A, skip to Step 3 and use your own folder.

1. Open the `c4x-vscode-extension` folder in VS Code.
2. Create `.vscode/launch.json` once. It is not tracked in Git, so a fresh clone has none and `F5` has nothing to run:

    ```json
    {
      "version": "0.2.0",
      "configurations": [
        {
          "name": "Run C4X Extension",
          "type": "extensionHost",
          "request": "launch",
          "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
          "outFiles": ["${workspaceFolder}/dist/**/*.js"]
        }
      ]
    }
    ```

3. Build (`make build`; or leave `pnpm run watch` running so edits rebuild), then press `F5` and choose **Run C4X Extension**. VS Code opens an **Extension Development Host** window with C4X enabled.

---

## Step 3: Create Your First C4X File

1. In the Extension Development Host window, create a new file named `my-first-diagram.c4x`.
2. The `.c4x` extension is important, as it tells VS Code to activate the C4X language features.

---

## Step 4: Write a System Context Diagram

Copy and paste the following code into your `my-first-diagram.c4x` file.

```c4x
%%{ c4: system-context }%%
graph TB
    %% Elements: ID[Label<br/>Type] 
    Customer[Customer<br/>Person]
    Admin[Administrator<br/>Person]
    BankingSystem[Internet Banking System<br/>Software System]
    EmailSystem[Email System<br/>Software System<br/>External]

    %% Relationships: From -->|Label| To
    Customer -->|Uses| BankingSystem
    Admin -->|Manages| BankingSystem
    BankingSystem -->|Sends emails using| EmailSystem
```

### What You Just Wrote

- `%%{ c4: system-context }%%`: Declares this as a C4 **System Context** diagram.
- `graph TB`: Sets the layout direction to **Top-to-Bottom**.
- `Customer[...]`: Defines a **Person** element with the label "Customer".
- `Admin[...]`: Defines an **Administrator** Person element.
- `BankingSystem[...]`: Defines a **Software System** element.
- `EmailSystem[...]`: Defines an **External Software System**.
- `-->`: Defines **relationships** between the elements.

---

## Step 5: Next Steps (Save and Preview)

1. Save the file.
2. If the preview panel is not already open, press `Ctrl+K V` (or `Cmd+K V` on Mac) to see your diagram.
3. Make changes to your `.c4x` file and watch the preview update automatically!

---

## Congratulations

You're set up with the C4X extension baseline.

### Next Steps

- Follow progress in [ROADMAP.md](./ROADMAP.md) and the [changelog](../CHANGELOG.md).
- Run the checks before you push: `make quick-check`, then `make check` (see [CONTRIBUTING.md](../CONTRIBUTING.md)).
- See [USER-GUIDE.md](./USER-GUIDE.md) for feature overview (marked for current vs planned).
