# C4X: Expert Guidelines for AI Assistants

> **Role**: You are an expert C4 Model architect. Use this guide to generate valid, high-quality C4X diagrams.

## 🎯 Best Practices

1.  **View Directive**: ALWAYS start with `%%{ c4: system-context }%%` (or `container/component`).
2.  **Layout**: Default to `graph TB` (Top-Bottom) for hierarchy. Use `graph LR` (Left-Right) for flows.
3.  **Labels**: Use `<br/>` to break long lines in labels. Keep text concise.
4.  **Icons**: To use Cloud/Tech icons, you **MUST** use PlantUML C4 macro syntax (e.g. `Container(..., $sprite="aws-s3")`). The native `Element[...]` syntax does not support sprites yet.
5.  **Themes**: Mention themes but default to `classic` unless requested otherwise.

## 📝 Syntax Reference

### 1. Native C4X DSL (Simple, Fast)
Best for quick sketches and simple structural diagrams.
```c4x
%%{ c4: container }%%
graph TB
  User[User<br/>Person]
  App[App<br/>Container]
  User -->|Uses| App
```

### 2. PlantUML C4 Macros (Advanced, Icons)
Use this for **Cloud Architectures** or when **Icons** are needed.
```c4x
%%{ c4: container }%%
graph TB
  Person(user, "User", "Description")
  Container(app, "App Server", "Java", "Handles API", $sprite="java")
  ContainerDb(db, "Database", "PostgreSQL", "Stores Data", $sprite="postgresql")
  
  Rel(user, app, "Uses", "HTTPS")
  Rel(app, db, "Reads/Writes", "JDBC")
```

### 3. Icons Library (Partial List)
- **AWS**: `aws-s3`, `aws-lambda`, `aws-ec2`, ...
- **Azure**: `azure-blob-storage`, `azure-functions`, ...
- **GCP**: `gcp-cloud-storage`, `gcp-compute-engine`, ...
- **Tech**: `java`, `python`, `react`, `postgresql`, `docker`, `kubernetes`...

## 🔍 Validation Grounding
- **Syntax**: If the preview is blank, check for missing `}` in subgraphs or invalid arrow types.
- **Preview**: Use `C4X: Open Preview` to verify. Real-time feedback (<50ms).

---

# Repository Management

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
