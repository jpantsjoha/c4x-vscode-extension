# VS Code Smoke Test Checklist

**Purpose**: Validate the extension in a *real* VS Code session (outside `@vscode/test-electron`) prior to marketplace submission.

## Prerequisites
1. Install VS Code Stable (≥ 1.80) locally.
2. Run `pnpm install && pnpm run build` in the repo.
3. Package the extension (optional but recommended): `pnpm vsce package`.

## Test Workspace Setup
Use the fixtures that mirror real-world flows:
- `samples/system-context/banking-system.c4x`
- `samples/container/ecommerce-container.c4x`
- `samples/component/multi-agent.c4x`
- `examples/banking-plantuml.puml`

## Execution Steps
1. Launch VS Code pointing at the repo: `code .`
2. Press `F5` (or `Run → Start Debugging`) to start the Extension Development Host.
3. In the Dev Host:
   - Open each sample file listed above.
   - Run `C4X: Open Preview` (Ctrl/Cmd + K, V) for `.c4x` files.
   - Run `C4X: Open Preview` for `banking-plantuml.puml`.
4. Verify:
   - Diagrams render with Classic theme colors.
   - Theme changes via `C4X: Change Theme` reflect immediately.
   - `classDef` hints (banking sample) apply tags (external/internal badges show).
   - Export commands:
     - `C4X: Export SVG` → confirm file saved without errors.
     - `C4X: Export PNG` → confirm Playwright screenshot saved.
5. Console/Problems panel: ensure no uncaught errors or warnings.

## Acceptance Criteria
- Preview works for C1, C2, C3 samples and PlantUML banking example.
- Theme switching, exports, and commands succeed without manual tweaks.
- No unexpected prompts or missing dependency errors.

> Record the run date + VS Code version in `TEST-STATUS-REPORT.md` once complete.
