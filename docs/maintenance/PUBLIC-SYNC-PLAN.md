# Public Repository Sync Plan & Review

**Objective**: Ensure the public repository (`c4x-vscode-extension`) contains **only** the files necessary for building, testing, and publishing the extension, plus essential documentation. Private history, internal notes, and experimental code must be excluded.

**Target Repo**: `../c4x-vscode-extension`
**Source Repo**: `.` (Private Development)

---

## 1. File Allowlist (Files to Sync)

These files are required for the extension to function, build, and be published.

### **Root Configuration**
- [x] `package.json` (Manifest, dependencies, scripts)
- [x] `tsconfig.json` (TypeScript config)
- [x] `esbuild.config.js` (Build script)
- [x] `.eslintrc.json` (Linting)
- [x] `language-configuration.json` (Syntax definitions)
- [x] `.vscodeignore` (Files to exclude from VSIX package)
- [x] `.gitignore` (Standard git ignore)
- [x] `Makefile` (Build automation - **MISSING in current script**, needed for build consistency)
- [x] `playwright.config.ts` (E2E testing config - **MISSING in current script**)

### **Source Code**
- [x] `src/` (Complete source code)
- [x] `assets/` (Icons, styles)
- [x] `snippets/` (Code snippets)
- [x] `syntaxes/` (Grammar definitions)

### **Documentation**
- [x] `README.md` (Marketplace landing page)
- [x] `LICENSE` (MIT)
- [x] `CHANGELOG.md` (Version history)
- [x] `CONTRIBUTING.md` (Public contribution guide)
- [x] `docs/ABOUT.md` (Author bio)
- [x] `docs/c4x-syntax.md` (Syntax reference)
- [x] `docs/USER-GUIDE.md` (User manual)
- [x] `GEMINI_CONTEXT.md` (AI attribution)

### **Examples & Tests**
- [x] `samples/` (Clean examples for users)
- [x] `test/` (Unit and integration tests - **MISSING in current script, currently specific files only**)
- [x] `scripts/` (Build/Validation scripts - **MISSING full folder**)

---

## 2. File Blocklist (Explicitly Excluded)

These files must **NEVER** be synced to public.

- [ ] `docs/archive/` (Legacy docs, analysis, raw notes)
- [ ] `docs/phases/` (Internal development phases)
- [ ] `docs/marketplace/` (Marketing drafts, raw assets not in `assets/`)
- [ ] `.claude/` (Private AI agent configurations)
- [ ] `local.gemini.md` (Private AI context)
- [ ] `claude.md` (Private AI context)
- [ ] `.git/` (Private history)
- [ ] `node_modules/` (Dependencies)
- [ ] `out/`, `dist/` (Build artifacts)
- [ ] `.env`, `*.log` (Secrets/Logs)

---

## 3. Proposed Changes to `publish-to-public.sh`

To ensure the public repo is buildable and testable, we need to add:

1.  **`Makefile`**: Critical for standardizing the build/test commands (`make test`, `make package`).
2.  **`playwright.config.ts`**: Required for running the E2E tests if they are included.
3.  **`test/`**: The full test suite should be included so open-source contributors (and CI) can run tests. The current script only includes `scripts/test.js` (which doesn't exist in the listing).
4.  **`scripts/`**: We should likely include the validation scripts (`validate-manifest.sh`, `validate-gallery.ts`) as they are useful for contributors.

### Updated Rsync Command Plan

```bash
rsync -avm --delete \
    --include='src/***' \
    --include='assets/***' \
    --include='snippets/***' \
    --include='syntaxes/***' \
    --include='samples/***' \
    --include='test/***' \
    --include='scripts/***' \
    --include='docs/images/***' \
    --include='docs/c4x-syntax.md' \
    --include='docs/USER-GUIDE.md' \
    --include='docs/ABOUT.md' \
    --include='package.json' \
    --include='tsconfig.json' \
    --include='esbuild.config.js' \
    --include='playwright.config.ts' \
    --include='Makefile' \
    --include='.eslintrc.json' \
    --include='language-configuration.json' \
    --include='README.md' \
    --include='LICENSE' \
    --include='CHANGELOG.md' \
    --include='CONTRIBUTING.md' \
    --include='.gitignore' \
    --include='.vscodeignore' \
    --include='.vscode/extensions.json' \
    --include='.vscode/launch.json' \
    --include='.vscode/tasks.json' \
    --exclude='scripts/publish-to-public.sh' \
    --exclude='*' \
    "$SOURCE_DIR/" "$DEST_DIR/"
```

*Note: I excluded `scripts/publish-to-public.sh` itself from the public repo, as it's an internal release tool.*

---

## 4. Verification Steps (Pre-Push)

Before pushing the public repo:

1.  **Run Sync**: Execute the updated script targeting `../c4x-vscode-extension`.
2.  **Install & Build (Public)**: `cd ../c4x-vscode-extension && npm install && npm run build`.
3.  **Run Tests (Public)**: `npm test`.
4.  **Package (Public)**: `vsce package` (Verifies ignore files and manifest).
5.  **Manual Inspection**: Check `git status` in public repo for any unexpected files (e.g., internal docs).

If all steps pass, the repo is safe to push.
