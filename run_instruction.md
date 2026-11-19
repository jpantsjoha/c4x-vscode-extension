# Run instructions

C4X is a VS Code extension that renders C4 architecture diagrams from text and lets you edit them visually.

## Prerequisites

| Tool | Version | Source of the pin |
|---|---|---|
| Node.js | 20.20.2 (primary), 26.5.0 (compatibility) | `.nvmrc`, `c4xToolchain` in `package.json` |
| pnpm | 10.18.3 | `packageManager` in `package.json` |
| VS Code | 1.128.0 for the test host; the extension needs `^1.90.0` | `c4xToolchain`, `engines.vscode` |
| Python 3 | any recent 3.x, only for `make verify-docs` | `verify-docs` in `Makefile` |
| make | any | `Makefile` |

`pnpm run validate:toolchain` always fails when the pins disagree (`.nvmrc` against `c4xToolchain.node`, `packageManager` against `c4xToolchain.pnpm`), when the running pnpm is not the pinned version, or when `C4X_VSCODE_VERSION` overrides the pinned VS Code version. It only reports the running Node version; it fails on a Node mismatch only when `C4X_EXPECTED_NODE_VERSION` is set (for example `C4X_EXPECTED_NODE_VERSION=20.20.2`). Treat results from an unpinned Node as informational.

## Setup

```bash
git clone <path-or-URL-of-this-repository> c4x
cd c4x
nvm use                       # reads .nvmrc
corepack enable
corepack prepare pnpm@10.18.3 --activate
pnpm install --frozen-lockfile
```

Clone this repository, the one you received, into a folder named `c4x`. If you received it as an export archive, unpack the archive and clone the bare repository inside it, for example `git clone repositories/<owner>/<repository>.git c4x`.

`make doctor` first reports every required and optional tool, and names each gate that skips or fails without one. `make help` lists every target by group.

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

1. Run `make dev` (same as `pnpm run watch`) so edits rebuild.
2. Press `F5` in VS Code to open the Extension Development Host. `.vscode/launch.json` is gitignored, so create it once. `CONTRIBUTING.md` ("Running the extension") gives a working configuration.
3. In the new window, open `samples/visual-layout/c1-refined-metadata.c4x` and run **C4X: Open Preview** (`Cmd/Ctrl+K V`).

`make demo` builds and opens `samples/visual-layout/c1-refined-metadata.c4x` in an Extension Development Host when the `code` command is on your `PATH`.

To try the packaged build, run `make package` (it writes `c4x-1.9.2.vsix`) and install it with **Extensions: Install from VSIX**. To install without touching your own VS Code profile, use the CLI with throwaway directories:

```bash
T=$(mktemp -d)
code --user-data-dir $T/u --extensions-dir $T/e --install-extension c4x-1.9.2.vsix
code --user-data-dir $T/u --extensions-dir $T/e --list-extensions --show-versions   # expect jpantsjoha.c4x@1.9.2
code --user-data-dir $T/u --extensions-dir $T/e samples/visual-layout/c1-refined-metadata.c4x   # opens it in that profile
```

Close the VS Code window that opened, then clean up:

```bash
rm -rf $T
```

On macOS the `code` command is not on `PATH` until you run **Shell Command: Install 'code' command in PATH** from the VS Code command palette. Or prefix it: `export PATH="/Applications/Visual Studio Code.app/Contents/Resources/app/bin:$PATH"`.

To export a diagram without opening VS Code, use the bundled CLI: `node cli/c4x.cjs render --theme c4-model samples/visual-layout/c1-refined-metadata.c4x -o out.svg`. Expect `c4x render: drawn in the c4-model theme` and an SVG file. Inside VS Code, the export commands are in the command palette under `C4X:`.

## What needs a key

Everything above works with no Gemini key: build, preview, editing, export, linting, the MCP server and all tests except `make test-live`. "No key" is not "no network": installing dependencies, the VS Code test host and the Playwright browsers download on first use, so a fully offline run needs them cached first. These need your own Gemini API key (stored by the extension in VS Code SecretStorage): **C4X: Generate Diagram Here (Gemini)**, **Diagram from Selection**, and **Preview - Visual Diagram (PNG)**, which needs Gemini credentials even when `c4x.ai.provider` is `vscode-lm`. Set `c4x.ai.provider` to `vscode-lm` to use a chat model already in VS Code for text generation only.

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

Expected results on a clean pass (18 Nov 2026, macOS, Node 20.20.2): `make test-unit` reports 4709 passing, 1 pending, in about 3.5 minutes; `make test` ends with the launch checks passing and exit code 0.

## Container

There is no Dockerfile. C4X is a VS Code extension, and its main journey (the live preview and the visual editor) needs a desktop VS Code. For a headless machine or a container, these run without a desktop:

- `make check`: typecheck, lint, unit tests, MCP and CLI tests, documentation checks and the build.
- `xvfb-run -a make test` on Linux: the extension-host tests in a real VS Code under a virtual display.
- `node cli/c4x.cjs render <file>.c4x -o <file>.svg` and `node cli/c4x-lint.cjs <path>`: render and lint diagrams from a shell or CI, with no install step (both files are committed).

## Troubleshooting

| Symptom | Fix |
|---|---|
| `pnpm: command not found` or wrong pnpm version | Run `corepack enable`, then `corepack prepare pnpm@10.18.3 --activate`. |
| `pnpm install` prints "Ignored build scripts" | Expected. The build does not need them. |
| `code: command not found` | See the PATH note under "Run locally". |
| `make test` stalls at "Resolving version" | It downloads VS Code 1.128.0 on first run and needs network. Set `C4X_VSCODE_TEST_CACHE` to reuse a download. |
| `make test-unit` is slow | It takes 3 to 4 minutes on a busy machine. Wait for the summary line. |
| `c4x render` prints one `C4X-L008` info finding on the sample | Expected; the sample uses the word "Uses" on purpose. The SVG is still written. |
| `make: command not found` | Install the Xcode command line tools (`xcode-select --install`) or your platform's `make`. |

## What you are looking at

The preview shows the diagram drawn from the `.c4x` source beside it; dragging an element stages a layout change, and **Save Changes** writes it back to the source. The Problems panel lists parse errors and C4 notation lint findings. `c4x render` prints one line saying which theme drew the diagram and writes an SVG; its findings (such as `C4X-L008`) go to the terminal. `make test-unit` ends with a summary line of passing and pending tests.

## Stop and clean up

Close the Extension Development Host window and stop `make dev` with `Ctrl+C`. Delete `c4x-*.vsix`, `dist/`, `out/` and `.vscode-test/` to return to a clean tree, or delete the clone.

## Lint and typecheck

```bash
make typecheck      # tsc -p ./
make lint           # eslint src mcp
make lint-c4x       # C4 notation lint over the published diagrams
make quick-check    # typecheck, lint, unit, MCP, CLI, lint-c4x, toolchain
make check          # quick-check, then docs verification and a build
make validate       # alias for make check
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
