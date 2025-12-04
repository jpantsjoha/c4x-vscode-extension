# Gemini Agent Context & Operational Guide

## 🔄 Public Repository Synchronization

The project maintains a split repository structure:
1.  **Private Source**: `c4model-vscode-extension` (Development, full history, private docs).
2.  **Public Mirror**: `c4x-vscode-extension` (Clean history, release artifacts, public docs).

### Sync Script (`scripts/publish-to-public.sh`)
- **Mechanism**: Uses `rsync` with an allowlist (`--include`) to copy only specific files/folders.
- **Transformation**: Automatically replaces private repo URLs (`c4model-vscode-extension`) with public ones (`c4x-vscode-extension`) in `README.md` using Perl regex.
- **Artifacts**: Copies the latest `.vsix` file and generated marketplace assets.

### Release Workflow (Automated)
1.  **Bump Version**: Update `package.json` and `CHANGELOG.md` in Private Repo.
2.  **Sync Source**: Run `./scripts/publish-to-public.sh ../c4x-vscode-extension`.
    *   *Note*: Do NOT build the VSIX manually. Let CI do it.
3.  **Commit Public**: Commit and push changes in the public repo.
4.  **Tag Release**: Create and push a git tag in the public repo.
    ```bash
    git tag v1.0.2
    git push origin v1.0.2
    ```
5.  **CI/CD**: GitHub Actions will automatically build, test, and publish to Marketplace.

### ⚠️ Caveats & Known Issues
1.  **Secrets**: The public repo must have `VSCE_PAT` configured in Settings > Secrets > Actions.
2.  **README Links**: `README.md` in the private repo should point to `docs/architecture/` relative paths.
3.  **CI/CD**: Tests on Linux require `xvfb-run`. `actions/upload-artifact` must be v4.
4.  **Marketplace Assets**: Images in `assets/marketplace/images` are auto-generated.