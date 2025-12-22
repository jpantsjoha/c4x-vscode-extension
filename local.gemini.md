# Gemini Agent Context

## Project: C4X VS Code Extension

**Role**: Lead Architect & Implementation Engineer

## 🔄 Publishing Workflow (Private -> Public)

This project maintains a **Split Repository** architecture to separate development history from the public open-source release.

### Repositories

* **Source (Private)**: Current Directory
* **Target (Public)**: `../c4x-vscode-extension` (Sibling directory)

### Process

When asked to "publish" or "sync" the code:

1. **Validate**: Ensure `scripts/publish-to-public.sh` is up to date with any new files.
2. **Execute**: Run `./scripts/publish-to-public.sh <path-to-public-repo>`.
3. **Instructions**: Remind the user to commit and push the changes from the *public* repository folder.

### Privacy & Security Context
*   **Private Repo (`c4model-vscode-extension`)**: Contains all source code, full commit history, internal docs (`docs/archive`, internal notes), and release scripts. **This is the Source of Truth.**
*   **Public Repo (`c4x-vscode-extension`)**: Contains ONLY the `src/`, `docs/` (curated), and public assets. History is flattened/squashed per release. **NO internal notes or private keys here.**

### ⚠️ Caveats
*   **NEVER** commit secrets to either repo.
*   **ALWAYS** work in the Private repo first, then sync.
*   **CHECK** `scripts/publish-to-public.sh` before syncing if new file types are added.

See `docs/maintenance/PUBLIC-REPO-SYNC.md` for full details.

## 🛠️ Developer Workflow & Troubleshooting

### 💡 Pro Tip: Core System Changes
If you modify core system components (e.g., **Parser Grammar (`.pegjs`)**, **Model Builder**, or **Extension Activation** logic):

1. **Rebuild**: Run `npm run build` or `npm run package`.
2. **Reload Required**: You **MUST** reload the VS Code window (`Cmd+Shift+P` > `Developer: Reload Window`) to unload the old cached extension code.
   * *Why?* The Extension Host caches imported modules. Simply rebuilding won't update the running instance until the host process restarts.
   * *Symptom of missing reload*: "Unknown element" errors or weird behavior persisting despite correct code/tests.

### 📦 Timestamped Builds (Dev Testing)

To ensure we're always testing the **exact latest build**, use datetime-stamped filenames:

```bash
# Build with timestamp
npm run package && \
  VSIX="c4x-$(node -p "require('./package.json').version")-$(date +%Y%m%d-%H%M).vsix" && \
  mv c4x-*.vsix "$VSIX" && \
  echo "✅ Built: $VSIX"

# Quick install
code --install-extension "$VSIX" --force
```

**Example Output**: `c4x-1.1.9-20251213-2148.vsix`

This eliminates confusion about which build is currently installed.

## 🧠 AI Model Strategy (v1.2.0)

**Primary**: `gemini-3-flash-preview` (Pro-grade reasoning at Flash speed)
**Fallback**: `gemini-3-pro-preview` (Production Stability)

> **SDK Reference**: [Google GenAI JS SDK Release Docs](https://googleapis.github.io/js-genai/release_docs/index.html)

### Decision Record
See [ADR 012: Gemini Model Strategy](./docs/adrs/012-gemini-model-strategy.md) for full rationale.

**Implementation Note**:
`GeminiService.ts` implements a silent fallback mechanism. If `gemini-3-flash-preview` fails (API error or validation exhaustion), it auto-switches to `gemini-3-pro-preview`. This ensures reliability while offering state-of-the-art capabilities.
