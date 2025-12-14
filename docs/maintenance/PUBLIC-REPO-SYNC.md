# Public Repository Sync Workflow

**Objective**: Sync the clean, production-ready "Core Codebase" from this private development repository to the public open-source mirror.

## 📂 Repository Locations

*   **Private (Source)**: `/Users/jp/Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension`
*   **Public (Target)**: `/Users/jp/Library/Mobile Documents/com~apple~CloudDocs/Documents/workspaces/c4x-vscode-extension`
*   **Public URL**: [https://github.com/jpantsjoha/c4x-vscode-extension](https://github.com/jpantsjoha/c4x-vscode-extension)

## 🛠️ The Sync Script

The sync is handled by `scripts/publish-to-public.sh`. This script uses `rsync` to:
1.  Copy allowed files (src, assets, docs, config) to the target.
2.  Delete files in the target that are no longer in the source (strict mirroring).
3.  Exclude private history, internal scripts, and temporary files.

## 🚀 How to Publish a Release

### 1. Prepare the Private Repo
Ensure your current branch (`main` or `release/x.y.z`) is clean and tests are passing.

```bash
make test
```

### 2. Run the Sync Script
Execute the script pointing to the public repository path:

```bash
./scripts/publish-to-public.sh "../c4x-vscode-extension"
```

*(Note: Adjust the relative path `../c4x-vscode-extension` if your workspace structure differs)*

### 3. Verify and Push Public Repo
Navigate to the public repo and push the changes.

```bash
cd "../c4x-vscode-extension"
git status
git add .
git commit -m "chore: Release vX.Y.Z"
git push origin main
```

## ⚠️ Important Rules

*   **NEVER** work directly in the public repo. It is a read-only mirror for the world.
*   **ALWAYS** make changes in the private repo first.
*   **CHECK** `scripts/publish-to-public.sh` if you add new top-level folders that need to be public.
