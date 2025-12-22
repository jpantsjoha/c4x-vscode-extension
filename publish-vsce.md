# Automated VS Code Marketplace Publication

This document details the automated process for publishing the C4X extension to the Visual Studio Code Marketplace using GitHub Actions.

## Prerequisites

1.  **Publisher Account**: You must have a registered publisher account on the VS Code Marketplace (currently `jpantsjoha`).
2.  **Azure DevOps Personal Access Token (PAT)**: This token (`VSCE_PAT`) grants GitHub Actions permission to publish on your behalf.

## Steps to Set Up Automated Publishing

### 1. Generate Azure DevOps Personal Access Token (PAT)

This PAT acts as your password for programmatic publishing to the Marketplace.

1.  **Go to Azure DevOps**: Navigate to [https://dev.azure.com/](https://dev.azure.com/).
2.  **Log In**: Sign in with the Microsoft account associated with your VS Code Marketplace publisher (`jpantsjoha`).
3.  **Access PATs**: In the top-right corner, click your user icon, then select "Personal access tokens".
4.  **Create New Token**:
    *   Click "New Token".
    *   **Name**: Give it a descriptive name (e.g., `vscode-marketplace-c4x`).
    *   **Organization**: Select "All accessible organizations".
    *   **Expiration**: Set an appropriate expiration (e.g., 1 year).
    *   **Scopes**:
        *   Select "Custom defined".
        *   Under "Marketplace", choose "Acquire" and "Manage" permissions.
    *   Click "Create".
5.  **Save Token**: **Copy the generated token immediately.** It will not be shown again. This is your `VSCE_PAT`.

### 2. Configure `VSCE_PAT` as a GitHub Secret

For security, the PAT must be stored as a GitHub Actions secret in your repository, not directly in your workflow file.

1.  **Go to your Public Repository**: Navigate to `https://github.com/jpantsjoha/c4x-vscode-extension`.
2.  **Access Secrets**: Go to `Settings` > `Secrets and variables` > `Actions`.
3.  **Add New Repository Secret**:
    *   Click "New repository secret".
    *   **Name**: `VSCE_PAT` (This exact name is used in the GitHub Action workflow).
    *   **Secret**: Paste the PAT you generated in the previous step.
4.  Click "Add secret".

### 3. Trigger Automated Publication

The CI workflow (`.github/workflows/ci.yml`) is configured to automatically publish the extension when a **version tag** is pushed to the `main` branch.

**To publish a new version (e.g., `v1.0.2`):**

1.  **Prepare Release in Private Repo**:
    *   Ensure `package.json` has the correct new version (e.g., `1.0.2`).
    *   Update `CHANGELOG.md` with the new version details.
    *   Run `make package` to create the VSIX locally (optional, but good for local verification).
2.  **Sync Private Repo to Public Mirror**:
    ```bash
    ./scripts/publish-to-public.sh "../c4x-vscode-extension"
    ```
    *This will sync all code, documentation, and `package.json` updates to your public repository.*
3.  **Commit and Push to Public Repo `main` branch**:
    ```bash
    cd "../c4x-vscode-extension"
    git add .
    git commit -m "release: prepare v1.0.2" # Or similar descriptive message
    git push origin main
    ```
4.  **Create and Push Version Tag**: This step triggers the automated publication.
    ```bash
    git tag v1.0.2 # Use the version from package.json
    git push origin v1.0.2
    ```

### 4. Verify Publication

*   **GitHub Actions**: Check the "Actions" tab in your public repository. You should see a workflow run triggered by the `v1.0.2` tag, with a `deploy` job.
*   **VS Code Marketplace**: After the workflow completes successfully, your new extension version (`c4x@1.0.2`) should appear on the Marketplace page: `https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x`.

---

## Local Testing of Publishing (Optional)

You can test the `vsce publish` command locally to ensure your PAT is valid and your local setup works.

1.  **Build VSIX Locally**:
    ```bash
    make package
    ```
2.  **Log In with VSCE**:
    ```bash
    vsce login jpantsjoha
    # Enter your VSCE_PAT when prompted. This stores it securely in your system's keychain.
    ```
3.  **Publish Locally**:
    ```bash
    vsce publish --packagePath c4x-1.0.2.vsix # Use the correct VSIX filename
    ```
    *Note: This will actually publish to the Marketplace. Use with caution or consider a dry-run feature if vsce supports it (which it doesn't directly for full publish, but you can always unpublish/republish if needed).*
