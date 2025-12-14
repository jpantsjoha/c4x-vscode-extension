# Quick Start Guide

**Time to Complete**: 5 minutes
**Last Updated**: 2025-11-24

Welcome to C4X! This guide will get you creating your first C4 diagram in VS Code in just a few minutes.

---

## Step 1: Installation

> Note: Installing from source while marketplace listing is prepared.

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
    # install pnpm if needed, and fix npm cache ownership on macOS
    brew install pnpm || true
    sudo chown -R "$USER:staff" ~/.npm || true
    pnpm install
    make build
    ```

---

## Step 2: Launch the Extension

1. Open the `c4x-vscode-extension` folder in VS Code.
2. Press `F5` (or run the debug task “Run C4X Extension”) to open an **Extension Development Host** window with C4X enabled.

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

## Step 6: Next Steps (Save and Preview)

1. Save the file.
2. If the preview panel is not already open, press `Ctrl+K V` (or `Cmd+K V` on Mac) to see your diagram.
3. Make changes to your `.c4x` file and watch the preview update automatically!

---

## Congratulations

You're set up with the C4X extension baseline.

### Next Steps

- Follow progress in [ROADMAP.md](./ROADMAP.md) and the E2E gates.
- See [USER-GUIDE.md](./USER-GUIDE.md) for feature overview (marked for current vs planned).
