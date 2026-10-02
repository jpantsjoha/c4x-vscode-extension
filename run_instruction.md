# Run instructions

C4X is a VS Code extension that renders C4 architecture diagrams from text and lets you edit them visually.

## Prerequisites

| Tool | Version | Source of the pin |
|---|---|---|
| Node.js | 20.20.2 (primary), 26.5.0 (compatibility) | `.nvmrc`, `c4xToolchain` in `package.json` |
| pnpm | 10.18.3 | `packageManager` in `package.json` |
| VS Code | the extension needs `^1.80.0` | `engines.vscode` in `package.json` |
| make | any | `Makefile` |

`pnpm run validate:toolchain` reports a Node version outside the pins.

## Setup

```bash
git clone https://github.com/jpantsjoha/c4x-vscode-extension.git
cd c4x-vscode-extension
nvm use                       # reads .nvmrc
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
```

`make setup` does the install, a build and a test compile.

## Configuration

No variable is needed to build or run the unit tests.

| Variable | Used for |
|---|---|
| `GEMINI_API_KEY` | Live Gemini generation tests (`make test-live`). The extension itself stores the key in VS Code SecretStorage. |
| `C4X_REQUIRE_LIVE` | Set to `1` to make `make test-live` fail, not skip, when no key is present. |
| `C4X_VSCODE_VERSION` | VS Code version the extension-host tests download. |
| `C4X_VSCODE_TEST_CACHE` | Directory that caches the downloaded test host. |

## Build

```bash
make build        # same as: pnpm run build (esbuild bundle)
make package      # builds, then writes c4x-*.vsix in the repo root
```

The build prints a bundle-size warning above 1.5 MB. It still exits 0.

## Run locally

1. Run `pnpm run watch` so edits rebuild.
2. Open the folder in VS Code and press `F5` to open the Extension Development Host. The repository ships no launch configuration; create `.vscode/launch.json` with an `extensionHost` entry whose `args` is `--extensionDevelopmentPath=${workspaceFolder}`.
3. In the new window, open a `.c4x` file from `samples/` or `examples/` and run **C4X: Open Preview** (`Cmd/Ctrl+K V`).

To try the packaged build, run `make package` and install the `.vsix` with **Extensions: Install from VSIX**.

## Test

| Command | What it runs | Needs |
|---|---|---|
| `make test-unit` | Type-check, then the mocha unit suite | nothing |
| `make test` | Extension-host tests in a real VS Code | network on first run (downloads VS Code) |
| `make test-e2e` | Playwright browser tests | Playwright browsers |
| `make test-mcp` | MCP server functional test | nothing |
| `make test-vsix-smoke` | Installs the built VSIX into an isolated profile | network on first run |
| `make test-perf` | Performance benchmarks | nothing |
| `make test-live` | Real Gemini calls | `GEMINI_API_KEY`, network |
| `make coverage` | Unit tests with a coverage check | nothing |

## Lint and typecheck

```bash
make typecheck      # tsc -p ./
make lint           # eslint src mcp
make quick-check    # typecheck, lint, unit, MCP verify and test, toolchain pins
make check          # quick-check, then docs verification and a build
```

## Project layout

- `src/` extension source (parser, model, layout, render, webview, AI); unit tests in `src/__tests__/`
- `mcp/` MCP validator server and its bundle
- `test/` extension-host, Playwright, functional and smoke tests
- `samples/`, `examples/` diagrams to open and test against
- `docs/` user guides and examples
- `scripts/` build and validation helpers
- `.github/workflows/` CI

## Verified

Verified 2026-10-02 at 9093ef3 on macOS with Node 26.0.0 and pnpm 10.18.3 (Node 26.0.0 is not one of the pins): install ✓, build ✓, `make test-unit` 1465 passed, `make typecheck` ✓, `make lint` 0 errors (174 warnings). Not run: `make test`, `test-e2e`, `test-vsix-smoke`, `test-perf` (they download VS Code or browsers), `test-live` (needs `GEMINI_API_KEY`).
