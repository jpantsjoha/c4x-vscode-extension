# Install the C4X tools from npm: the `c4x` package

From 1.9.0 the MCP server and the two command-line tools ship as one npm package, `c4x`, for people who use C4X in a coding agent or CI without VS Code.

| Command | What it does | Details |
|---|---|---|
| `c4x-mcp` | MCP server over stdio: `validate_c4x`, `lint_c4x`, `render_c4x` | [README, MCP server](../README.md#mcp-server) |
| `c4x render` | Draws a diagram as SVG | [Render C4X outside VS Code](./C4X-RENDER.md) |
| `c4x-lint` | Lints `.c4x` files and C4X fences in Markdown | [C4X-LINT-CLI.md](./C4X-LINT-CLI.md) |

```sh
npm install -g c4x
```

The package holds three self-contained bundles, their third-party notices, the licence and a README, and nothing else. It has no runtime dependencies and no install scripts, and it needs Node 20 or later (Node 18 reached end of life in April 2025). The package README (`npm/README.md` in the repository) has the registration snippet for Claude Code, Codex, Gemini CLI and VS Code.

## How the package is checked

- `make verify-npm` stages the package in `dist/npm/c4x`, runs `npm pack --dry-run --json` and fails when the file list differs from the allowlist in `scripts/npm-package.js`, or when the manifest gains a script, a dependency, an optional dependency or a `files` entry outside the allowlist.
- `make test-npm` packs the tarball, installs it into a temporary project from the tarball path (the registry is never contacted), starts `c4x-mcp` over stdio and asks for `tools/list`, runs `c4x render` on a sample, and runs the bundle contract test (`src/__tests__/security/bundle-contract.test.ts`) against the installed files.
- Both run in `make check`. The package requirements (no install scripts, no dependencies, a file allowlist, the bundle contract on the tarball) each name the test that enforces them.

The package is published by the maintainer; no workflow publishes it.
