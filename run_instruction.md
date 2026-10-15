# Run instructions

C4X is a VS Code extension that renders C4 architecture diagrams from text and lets you edit them visually.

## Prerequisites

| Tool | Version | Source of the pin |
|---|---|---|
| Node.js | 20.20.2 (primary), 26.5.0 (compatibility) | `.nvmrc`, `c4xToolchain` in `package.json` |
| pnpm | 10.18.3 | `packageManager` in `package.json` |
| VS Code | 1.128.0 for the test host; the extension needs `^1.80.0` | `c4xToolchain`, `engines.vscode` |
| Python 3 | any recent 3.x, only for `make verify-docs` | `verify-docs` in `Makefile` |
| make | any | `Makefile` |

`pnpm run validate:toolchain` always fails when the pins disagree (`.nvmrc` against `c4xToolchain.node`, `packageManager` against `c4xToolchain.pnpm`), when the running pnpm is not the pinned version, or when `C4X_VSCODE_VERSION` overrides the pinned VS Code version. It only reports the running Node version; it fails on a Node mismatch only when `C4X_EXPECTED_NODE_VERSION` is set (for example `C4X_EXPECTED_NODE_VERSION=20.20.2`). Treat results from an unpinned Node as informational.

## Setup

```bash
git clone https://github.com/jpantsjoha/c4x-vscode-extension.git
cd c4x-vscode-extension
nvm use                       # reads .nvmrc
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
```

`make setup` does the install, a build and a test compile. In a checkout that contains a `.githooks/` directory, it also sets `core.hooksPath` to `.githooks`, so the pre-commit gate (`make pre-commit`) runs on your commits and the pre-push hook runs `make lint-c4x` on the tip of each pushed ref.

## Configuration

No variable is needed to build or run the unit tests.

| Variable | Used for |
|---|---|
| `GEMINI_API_KEY` | Live Gemini generation tests (`make test-live`). Export it as an environment variable in your shell; never write it to a file in the repository. The extension itself stores the key in VS Code SecretStorage. |
| `C4X_REQUIRE_LIVE` | Set to `1` to make `make test-live` fail, not skip, when no key is present. |
| `C4X_VSCODE_VERSION` | VS Code version the extension-host tests download. |
| `C4X_VSCODE_TEST_CACHE` | Directory that caches the downloaded test host. |
| `C4X_LINT_MAX_SEVERITY` | Severity at which `make lint-c4x` fails (default `error`). |

## Build

```bash
make build        # same as: pnpm run build (esbuild bundle)
make package      # builds, then writes c4x-*.vsix in the repo root
```

## Run locally

1. Run `pnpm run watch` so edits rebuild.
2. Press `F5` in VS Code to open the Extension Development Host. `.vscode/launch.json` is gitignored, so create it once. `CONTRIBUTING.md` ("Running the extension") gives a working configuration.
3. In the new window, open `samples/visual-layout/c1-refined-metadata.c4x` and run **C4X: Open Preview** (`Cmd/Ctrl+K V`).

To try the packaged build, run `make package` and install the `.vsix` with **Extensions: Install from VSIX**.

## Test

| Command | What it runs | Needs |
|---|---|---|
| `make test-unit` | Type-check, then the mocha unit suite | nothing |
| `make test` | Extension-host tests in a real VS Code | network on first run (downloads VS Code); on Linux without a display, `xvfb-run -a make test` |
| `make test-e2e` | Playwright browser tests | Playwright browsers |
| `make test-mcp`, `make test-cli` | MCP server and lint CLI functional tests | nothing |
| `make test-vsix-smoke` | Installs the built VSIX into an isolated profile | network on first run |
| `make test-perf` | Performance budgets | nothing |
| `make test-live` | Real Gemini calls; skips without a key unless `C4X_REQUIRE_LIVE=1` | `GEMINI_API_KEY` in the environment, network |
| `make coverage` | Unit tests with an enforced coverage floor | nothing |

## Lint and typecheck

```bash
make typecheck      # tsc -p ./
make lint           # eslint src mcp
make lint-c4x       # C4 notation lint over the published diagrams
make quick-check    # typecheck, lint, unit, MCP, CLI, lint-c4x, toolchain
make check          # quick-check, then docs verification and a build
```

No hosted CI runs on this repository. The pull-request gate is a local `make check` on the head commit, with the result posted on the pull request.

## Deploy

There is nothing for a contributor to deploy. The maintainer publishes releases to the VS Code Marketplace and Open VSX; `CHANGELOG.md` lists them.

## Project layout

- `src/` extension source (parser, model, layout, renderer, webview, AI)
- `mcp/` MCP validator server and its tracked bundle
- `cli/` `c4x-lint` command-line linter
- `test/` extension-host, Playwright, functional and smoke tests (`src/__tests__/` holds the unit tests)
- `samples/`, `examples/` diagrams to open and test against
- `docs/` user guides, syntax and examples; `docs/README.md` is the index, and `CONTRIBUTING.md` is the contributor guide
- `scripts/` build, validation and release helpers
