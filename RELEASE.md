# Release Process

This document outlines the steps to release a new version of the C4X extension.

## Prerequisites

1.  **GitHub CLI (`gh`)** installed and authenticated.
2.  **Node.js** and **pnpm** installed.
3.  **vsce** installed (`npm install -g @vscode/vsce`) and logged in (`vsce login jpantsjoha`).
4.  **Public Repository** cloned as a sibling directory: `../c4x-vscode-extension`.

## Steps

### 1. Prepare Release

1.  **Update Version**: Bump version in `package.json`.
2.  **Update Changelog**: Add new version entry in `CHANGELOG.md`.
3.  **Clean Build**: Run `make clean && make setup`.
4.  **Verify**: Run `make pre-commit` (lint, verify-docs, build, test).

```bash
npm version patch  # or minor/major
```

### 2. Package Extension

Create the VSIX package. This ensures the build artifacts are fresh.

```bash
make package
```

### 3. Sync to Public Mirror

Run the sync script to update the public repository with the new code, docs, and VSIX.

```bash
./scripts/publish-to-public.sh "../c4x-vscode-extension"
```

*Note: The script automatically updates `README.md` links to point to the public repository.*

### 4. Publish to Public GitHub

Commit and push the changes in the public repository.

```bash
cd "../c4x-vscode-extension"
git add .
git commit -m "release: vX.Y.Z"
git push origin main
```

### 5. Publish to Marketplace

Upload the VSIX to the VS Code Marketplace.

```bash
# From the root of the private (or public) repo
vsce publish
```

### 6. Create GitHub Release

Create a tag and release on the public GitHub repository.

```bash
gh release create vX.Y.Z c4x-X.Y.Z.vsix --repo jpantsjoha/c4x-vscode-extension --notes-file CHANGELOG.md
```

---

**Validation**: After publishing, verify the extension page on [Marketplace](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x).
