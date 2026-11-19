# Use the c4x skill with a coding agent

The `skills/c4x/` directory is an Agent Skills skill. It lets an assistant you already use write C4X diagrams that a parser has checked, without you explaining the notation.

## Install

The plugin installs the skill and the C4X MCP server in one step:

| Assistant | Install |
|---|---|
| Claude Code | `claude plugin marketplace add jpantsjoha/c4x-vscode-extension`, then `claude plugin install c4x@c4x`. Adds `/c4x:draw`, `/c4x:check` and `/c4x:preview` |
| Codex | `codex plugin marketplace add jpantsjoha/c4x-vscode-extension`, then `codex plugin add c4x@c4x` |
| Gemini CLI | `gemini extensions install https://github.com/jpantsjoha/c4x-vscode-extension` (the CLI copies the whole repository) |
| Antigravity CLI | Clone the repository, then `agy plugin install ./c4x-vscode-extension/plugins/c4x`; it converts the Claude Code plugin, turning the three commands into skills |

Without a plugin, copy `skills/c4x/` into your agent's skills directory, for example `.claude/skills/c4x/` for Claude Code, or the folder your agent reads `SKILL.md` files from. Keep the whole directory: `SKILL.md` links to `references/syntax.md` and `scripts/validate.sh`.

### The /c4x commands (Claude Code)

- `/c4x:draw [what] [path]` writes a diagram from the code, validates and lints it, and saves it.
- `/c4x:check <file>` validates and lints a `.c4x` file or each `c4x` fence in a Markdown file and explains every finding.
- `/c4x:preview <file>` checks the diagram, then renders an SVG when the server offers a render tool. The current server has none, so the command says so and points you to **C4X: Open Preview** in VS Code.

For checking, give the agent one of:

- the C4X MCP server (see the [README](../README.md#mcp-server)), which offers `validate_c4x` and `lint_c4x`; or
- nothing more: the skill carries its own linter (`scripts/c4x-lint.cjs`), so `scripts/validate.sh` works with no MCP and nothing on PATH. It needs only `node`. To use another linter, set `C4X_LINT` to the path of a `c4x-lint.cjs` or put a `c4x-lint` command on PATH; the bundled copy is tried first ([CLI details](C4X-LINT-CLI.md)).

## Use

Ask in plain words: "Draw a container diagram of this repository." The skill makes the agent:

1. choose one C4 level for the question you asked;
2. read the code and write the diagram from what exists;
3. run `validate_c4x`, then `lint_c4x`, and fix each finding;
4. render it with the C4X extension (`C4X: Open Preview` or `C4X: Export SVG`);
5. look at the picture and shorten any text that overflows.

The agent saves the diagram to the path you name, else to the project directory, and states the absolute path it wrote. AGY in print mode (`agy -p`) does not start in the directory you launched it from, and `--sandbox` did not confine its write, so name the directory in the prompt: "Draw a container diagram of this repository and save it in /absolute/path/to/project."

The skill renders through the MCP tool `render_c4x`, the `c4x render` command, or the VS Code extension, in that order of preference; limits, outcomes and exit codes are in [C4X-RENDER.md](C4X-RENDER.md).

## Tested with

Claude Code, Codex and AGY each wrote a clean container diagram from one prompt. Install paths, commands and findings: the maintainer record `docs/validation/agent-skill-1.9/README.md` (not in the public repository).

## Non-interactive MCP wiring

Checked 2026-11-15 with Codex 0.166.0 and AGY 1.5.9. Evidence and transcripts: `docs/validation/agent-skill-1.9/mcp-wiring/` (not in the public repository).

**Codex (`codex exec`).** Register the server and approve its tools for this run only, with `-c` overrides. Without the approval key every MCP call fails with "MCP tool call requires approval, but approval policy is never".

```
codex exec -C <project> --sandbox workspace-write --skip-git-repo-check --ephemeral --json \
  -c mcp_servers.c4x.command="<node>" \
  -c 'mcp_servers.c4x.args=["<repo>/mcp/c4x-mcp-server.bundle.cjs"]' \
  -c mcp_servers.c4x.default_tools_approval_mode="approve" \
  "<prompt>"
```

`default_tools_approval_mode` is a per-server key (`approve` runs the server's tools without a prompt). The overrides do not modify `config.toml`; `--ephemeral` stops Codex saving the session to disk (an MCP call still ran with it on 2026-11-15). Add `--ignore-user-config` to leave the user's own configuration out of the run. The same keys work under `[mcp_servers.c4x]` in a `config.toml` if you prefer a file. Result on the shop-api fixture: `validate_c4x` returned VALID and `lint_c4x` returned CLEAN, both through MCP, and the diagram is in the evidence folder.

**AGY.** None of the routes tested leaves the user's configuration alone: `--settings` rejects `mcpServers`; `agy mcp add` writes the global `~/.gemini/config/mcp_config.json` (it ran only against a temporary `HOME`, where no login exists); `ANTIGRAVITY_APP_DATA_DIR` does not move the MCP configuration (the server list is identical with and without it). AGY's built-in guide also names a plugin route, `plugins/<plugin_name>/mcp_config.json`, active when the plugin is enabled; it was not tested here and needs a C4X plugin package for AGY (#359). If you accept a global change, run `agy mcp add c4x <node> <repo>/mcp/c4x-mcp-server.bundle.cjs` yourself. Otherwise the skill falls back to `c4x-lint` through `skills/c4x/scripts/validate.sh`, which passed in the nine #355 runs. The evidence is generated by `scripts/evidence/agy-mcp-route.sh`.

## What keeps it correct

The plugin manifests for every host, the plugin's copy of the skill and its copy of the MCP server are generated from one source (`scripts/plugin-source.json` and the version in `package.json`) by `pnpm run generate:plugin`; a test fails when any of them is stale.

`skills/c4x/references/syntax.md` is generated from `docs/reference/c4x-reference.json` (`pnpm run generate:skill`), as is `scripts/c4x-lint.cjs`, a copy of `cli/c4x-lint.cjs`. A unit test fails when either drifts, when any example in the skill stops parsing or linting clean, or when the skill names a tool, command or option that does not exist.

## Limits

- Lint rules default to `info`. A command line check must pass `--max-severity info` to fail on them; `validate.sh` does.
- A label of more than 23 characters, a technology of more than 28 or a description of more than 30 can overflow its box (#340).
