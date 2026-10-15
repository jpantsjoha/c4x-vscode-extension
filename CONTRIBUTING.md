# Contributing to C4X

Thank you for considering a contribution. This page covers how to get the project running,
how to prove a change, and what a good pull request looks like.

---

## Code of Conduct

Treat others with respect and professionalism. Report unacceptable behaviour by opening a
GitHub issue.

---

## How can I contribute?

### Reporting bugs

- Search the [issues](https://github.com/jpantsjoha/c4x-vscode-extension/issues) first.
- If nothing matches, [open a new one](https://github.com/jpantsjoha/c4x-vscode-extension/issues/new)
  with a clear title, the version of C4X and VS Code you are on, and the smallest C4X source
  that reproduces the problem. A failing example is worth more than a description of one.

### Suggesting enhancements

Open an issue describing the outcome you want and why the current behaviour falls short.
Implementation ideas are welcome but optional.

---

## Development setup

```bash
git clone https://github.com/<your-username>/c4x-vscode-extension.git
cd c4x-vscode-extension

nvm use                                    # Node 20.20.2
corepack enable
corepack prepare pnpm@10.18.3 --activate

make setup                                 # install, build, compile tests
```

### Running the extension

Start the watcher, then press `F5` to launch the Extension Development Host:

```bash
pnpm run watch
```

`.vscode/launch.json` is gitignored, so create one the first time with a single
`extensionHost` configuration passing
`--extensionDevelopmentPath=${workspaceFolder}`. Open a diagram from `samples/` or
`examples/` in the new window and run **C4X: Open Preview**.

---

## Running the checks

Run the gate that matches the size of your change; each one includes the ones above it.

```bash
make quick-check     # typecheck, lint, unit tests, MCP and toolchain checks — the fast loop
make check           # quick-check + documentation + build — what a pull request must pass
```

Individual tiers, when you want to iterate on one:

```bash
make test-unit          # unit tests, no VS Code
make test               # Extension Host suite in a real VS Code instance
make test-e2e           # Playwright browser suite against the real preview client
make test-perf          # performance budgets
make test-vsix-smoke    # package the VSIX, install it into a clean profile, activate it
make verify-docs        # Markdown lint plus every c4x example in the docs
```

Each tier proves something the others cannot. A green unit suite says nothing about whether
the packaged extension activates; a green development-host session says nothing about the
VSIX. Run the tier that matches your claim.

### Changes to layout, geometry or rendering

Rendering changes need visual evidence, not just passing assertions:

```bash
make test-e2e                       # browser interaction and visual baselines
pnpm run test:snapshot              # renderer snapshot and geometric checks
pnpm run test:snapshot:update       # only after reviewing why a baseline moved
```

Never refresh a snapshot to make a suite green. Explain in the pull request what changed in
the geometry and why the new baseline is correct.

### Writing tests

- Every new feature gets tests.
- Every bug fix gets a test that fails before the fix and passes after it.
- Unit suites live under `src/__tests__/`, Extension Host suites under `test/suite/`, and
  browser specs under `test/playwright/`.

---

## Submitting a pull request

1. Branch from `main`: `git checkout -b feat/short-description`.
2. Make the change, with tests.
3. Run `make check` and paste the result into the pull request.
4. Commit using [Conventional Commits](https://www.conventionalcommits.org/):
   `git commit -m "feat(parser): support X"`.
5. Push and open a pull request describing what changed, what proves it, and any deliberate
   limitation you are leaving behind.

Keep pull requests small and reviewable. A change that touches the parser, the renderer and
the documentation at once is three pull requests.

---

## Style

ESLint enforces the code style:

```bash
pnpm run lint
```

Beyond the linter: descriptive names, no regular-expression rewriting of source where a
parser range will do, and comments that explain why rather than what.

Markdown is linted too, by `make verify-docs`. Every `c4x` example in the documentation is
parsed, so a broken example fails the build.

---

## Questions?

Open an issue and we will help.
