# C4X lint outside VS Code

`c4x-lint` runs the [C4X lint rules](C4X-LINT-RULES.md) without VS Code: in a Git hook before you commit or push, in a CI job if your team runs one, or in an AI agent's loop through the MCP server. It checks the same rules, at the same severities, as the Problems panel.

## Get it

`c4x-lint` is one self-contained file, `cli/c4x-lint.cjs`, in the C4X repository. It needs Node.js 18 or later and nothing else: no `npm install`, no third-party packages, no network access. It is not inside the VS Code extension package, and it is not published to npm yet.

Copy it into your repository and commit it, so every clone and every hook runs the version your team reviewed:

```sh
mkdir -p tools
curl -fsSL -o tools/c4x-lint.cjs \
  https://raw.githubusercontent.com/jpantsjoha/c4x-vscode-extension/<release-tag>/cli/c4x-lint.cjs
node tools/c4x-lint.cjs --help
```

Replace `<release-tag>` with a C4X release tag that contains `cli/`. Pinning a tag, rather than `main`, means the file changes only when you choose to update it.

## Run it

```sh
node tools/c4x-lint.cjs 'docs/**/*.{c4x,md}'
```

Arguments are files, directories or glob patterns. Quote a pattern, so every shell — and Windows — passes it to `c4x-lint` unchanged. A directory is searched recursively. `node_modules`, directories whose name starts with `.`, and symbolic links are skipped during a search; a path you name outright is always read, following a link. Every argument must match at least one `.c4x` or Markdown file, or the run stops with exit code 2 before linting anything, so a renamed or mistyped path cannot quietly shrink what is checked.

Files are reported relative to the directory `c4x-lint` runs in, in every format. A file outside it is reported as a relative `../…` path; on Windows, a file on another drive has no relative path and is reported by its absolute path, with `/` separators. That is deliberate: a bare file name could match two different files, and the relative path still opens from where you ran the command. Control characters in a file name are printed as escapes such as `\n`, so a file name cannot forge an extra finding or annotation. A UTF-8 byte order mark at the start of a file is ignored.

| Option | Values | Default |
|---|---|---|
| `--format` | `text`, `github`, `json`, `sarif` | `text` |
| `--max-severity` | `info`, `warning`, `error`, `off` | `error` |
| `--config` | path to a configuration file | `.c4x-lint.json`, if it exists |
| `--quiet` | report only the findings that fail the run; the summary still counts every finding | off |
| `-h`, `--help` | print the usage | |
| `--version` | print the `c4x-lint` version | |

### What is linted

- `.c4x` files, as a whole.
- Every `c4x` fence in Markdown (`.md`, `.markdown`), at its real line in the file. Fences are found by the same scanner the editor uses. It shares that scanner's known limit: an unclosed fence inside a list item ends the scan for the rest of the document, so a `c4x` fence after it is not checked.
- Nothing else. Structurizr DSL and PlantUML files are not linted, as in the editor.

Three kinds of finding exist only outside the editor, because there is no preview to report them:

| Rule | Severity | Meaning |
|---|---|---|
| `C4X-SYNTAX` | always `error` | The diagram does not parse. Nothing else in it is checked. Nesting deeper than 32 levels is a syntax error, in the editor too. |
| `C4X-MODEL` | always `error` | The diagram parses but cannot be drawn: a duplicate element id, or a relationship to an element that does not exist. It is reported on the first line of the diagram. |
| `C4X-LIMIT` | always `error` | The diagram parses but exceeds an input limit (see [Limits](#limits)). It is reported at the first element, relationship, text field or list past the limit. Nothing else in the diagram is checked. |

None can be configured. A diagram that does not render is never clean.

### Limits

`c4x-lint` and the MCP tools refuse input past these bounds with an error, not a crash or a hang. The counts and lengths apply to what the parser keeps; text it discards (comments, the earlier value of a repeated attribute, a subgraph inside a deployment node) is bounded by the file-size cap. The same values are in the generated [C4X reference](reference/c4x-reference.md#input-limits). The largest diagram in this repository is about 9 KB, nests 4 levels and has 24 top-level elements, so real diagrams sit far inside them.

| Limit | Value | What happens past it |
|---|---|---|
| File size (`c4x-lint`) | 4 MiB per file | The file is reported and not linted; the run exits 2. |
| Code size (MCP tools) | 1 MiB per call | An input error. |
| Nesting | 32 levels of boundaries, nodes and subgraphs, counted by the grammar (braces inside labels do not count) | `C4X-SYNTAX`, at the brace that opens level 33. |
| Elements | 2,000 elements and boundaries per diagram, at every level | `C4X-LIMIT`. |
| Relationships | 5,000 per diagram | `C4X-LIMIT`. |
| Text | 4,096 characters in one label, description, technology, tag, attribute name or attribute value | `C4X-LIMIT`. |
| Entries | 256 `$key="value"` pairs as written on one element, node or subgraph (each repeat of a key counts); 256 tags on one element; 256 pairs in one `elementStyle` | `C4X-LIMIT`. |
| MCP output | 200 finding lines, 2,000 characters per line, 512 KiB per result | Lines are cut; the heading still counts every finding. |

`c4x-lint` reads only the files, directories and globs you name and its configuration file. It is built to read no path written inside a diagram, open no network connection, start no process, and write only to standard output and standard error, plus the file named by `GITHUB_STEP_SUMMARY` when you run `--format github` in a CI job that sets it. The tests check the modules the bundle imports and watch the paths they exercise; they are tripwires, not a proof (see [SECURITY.md](../SECURITY.md)). Control characters, line and paragraph separators, bidirectional controls and marks and other format characters (Unicode categories Cc, Cf, Zl and Zp, except the joiners U+200C and U+200D) in a file name or a diagram label are printed as escapes (`\n`, `\x9b`, `\u2028`, `\u202e`) in the `text` and `github` formats; in `json` and `sarif` they are written as JSON `\uXXXX` escapes, which decode to the original text. In the `GITHUB_STEP_SUMMARY` table every finding and file name is literal text: punctuation is written as character references, so a label cannot become HTML, a link or Markdown formatting.

### Exit codes

| Code | Meaning |
|---|---|
| `0` | No finding at or above `--max-severity`. |
| `1` | At least one finding at or above `--max-severity`. |
| `2` | Usage or input error: an unknown option, a configuration file that cannot be read, an argument that matches no file, or a file that cannot be read. Also a fault inside `c4x-lint` itself, so a broken checker never passes a diagram. |

`--max-severity` is the gate. At the default, `error`, only syntax errors, model errors and rules you raised to `error` fail the run. Every rule defaults to `info`, so a first run lists findings and still exits 0. Run with `--max-severity info` to make every finding fail the run (exit 1); without it, `--quiet` prints no `info` finding at all, because none of them fails the run. Use `--max-severity info` whenever you need to see or act on what the rules report, as an assistant checking its own output does. `--max-severity warning` fails on warnings too; `--max-severity off` never fails on findings. Verified against the CLI: a file with two `info` findings exits 0 at the default, and exits 1 with both findings printed under `--max-severity info --quiet`.

## Configure the rules

The configuration file has the same shape as the editor settings `c4x.lint.enabled` and `c4x.lint.rules`, so one rule table can be copied between them:

```json
{
  "enabled": true,
  "rules": {
    "C4X-L003": "warning",
    "C4X-L006": "error",
    "C4X-L008": "off"
  }
}
```

Save it as `.c4x-lint.json` where you run `c4x-lint`, or pass `--config <file>`. A rule takes `off`, `ignore`, `info`, `warning` or `error`. An unknown key, rule id or value is reported on standard error and ignored, so a typo cannot silently change a different rule. `"enabled": false` switches the notation rules off; syntax and model errors are still reported.

## Output formats

**`text`** prints `file:line:column: severity rule message fix` per finding, then a summary. Editors and terminals turn the location into a link.

**`github`** prints one workflow command per finding — `::error`, `::warning` or `::notice` for `info` — with the file, line and column:

```text
::notice file=docs/architecture.md,line=8,col=5,endColumn=36,title=C4X-L004::Relationship api --> db crosses a process boundary ...
```

GitHub Actions shows each one as an annotation on the line. Any other CI system, and a local shell, prints them as ordinary lines, so the format is safe anywhere. When `GITHUB_STEP_SUMMARY` is set, a table of the findings is also appended to the job summary.

**`json`** prints the summary counts and every finding with its file, line, column, end position, severity, rule id, message and fix.

**`sarif`** prints a [SARIF 2.1.0](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) log, for code-scanning tools. It is opt-in: on GitHub, uploading SARIF from a private repository needs GitHub Code Security, so the `github` format is the one that works for every repository. Paths in the log are relative to where `c4x-lint` ran; no absolute path from your machine is written.

In the `json` and `sarif` formats the summary goes to standard error, so standard output stays machine-readable.

## Run it from a Git hook

A Git hook runs on your machine before the commit or push leaves it. That is the earliest point a broken diagram can be stopped, and it needs no CI.

### Before each commit

`.git/hooks/pre-commit`, or the same file in your `core.hooksPath` directory; make it executable with `chmod +x`:

```sh
#!/bin/sh
# Lint the C4X files and Markdown staged in this commit.
files=$(git diff --cached --name-only --diff-filter=ACMR -- '*.c4x' '*.md' '*.markdown')
[ -z "$files" ] && exit 0
printf '%s\n' "$files" | tr '\n' '\0' | xargs -0 node tools/c4x-lint.cjs --max-severity warning
```

It lints each staged file as it is in your working tree. If you stage only part of a file, the unstaged part is linted too; the `pre-commit` framework below avoids that by stashing unstaged changes first.

### Before each push

`.git/hooks/pre-push`:

```bash
#!/usr/bin/env bash
# Lint the tip of each pushed ref as it was committed, not the working tree.
# Git passes "<local ref> <local sha> <remote ref> <remote sha>" per ref on stdin.
set -o pipefail   # a failed `git archive` must fail the hook, not hand tar an empty stream
status=0
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$local_sha" in *[!0]*) ;; *) continue ;; esac   # skip branch deletions
  tree=$(mktemp -d)
  git archive "$local_sha" tools docs | tar -x -C "$tree" || status=1
  (cd "$tree" && node tools/c4x-lint.cjs 'docs/**/*.{c4x,md}' --max-severity warning --quiet) || status=1
  rm -rf "$tree"
done
# No lines at all: everything was already up to date, so there is nothing to lint.
exit $status
```

For each pushed ref it exports the tip commit's `tools/` and `docs/` to a scratch directory and lints that, with the copy of `c4x-lint` the commit itself carries, so uncommitted edits in your working tree can neither hide a problem nor cause one. A push that only deletes branches, and a push with nothing new (git then sends an empty list), lints nothing and passes. Change `tools docs` and the pattern to match your layout. Exit code 2 also blocks the push, so a pattern that matches no file fails loudly rather than passing.

The recipe uses bash for `set -o pipefail`. In a plain POSIX `sh` without it, write the archive to a file first (`git archive -o "$tree/x.tar" "$local_sha" tools docs && tar -xf "$tree/x.tar" -C "$tree"`), so a failed export cannot pass as an empty tree.

If another tool owns your pre-push hook and calls this one, it must pass its standard input through, using `exec` or by piping what it read. Git writes the ref list only once. A hook that receives an empty list cannot tell "nothing to push" from "the list was swallowed", and it must treat it as nothing to push, or every repeat `git push` would fail. So a wrapper that drains standard input silently turns this check off.

Either hook can be skipped with `git commit --no-verify` or `git push --no-verify`. A hook is a fast local gate for the person who installed it, not an enforcement point for a team.

### With the pre-commit framework

If your team uses [pre-commit](https://pre-commit.com), the C4X repository is a hook repository. Add it to `.pre-commit-config.yaml`:

```yaml
repos:
  - repo: https://github.com/jpantsjoha/c4x-vscode-extension
    rev: <release-tag>
    hooks:
      - id: c4x-lint
        args: [--max-severity, warning]
```

The hook receives the staged `.c4x`, `.md` and `.markdown` files. Or, with the file vendored as above, as a local hook that needs no clone of the C4X repository:

```yaml
repos:
  - repo: local
    hooks:
      - id: c4x-lint
        name: C4X notation lint
        entry: node tools/c4x-lint.cjs --max-severity warning
        language: system
        files: '\.(c4x|md|markdown)$'
```

## Optional: run it in CI

If your team runs CI, run the same command there. This section is an example for your repository's own pipeline; C4X itself runs no hosted CI.

GitHub Actions, with the annotations on the pull request's changed lines:

```yaml
# .github/workflows/c4x-lint.yml
name: C4X lint
on: pull_request
permissions:
  contents: read
jobs:
  c4x-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: node tools/c4x-lint.cjs 'docs/**/*.{c4x,md}' --format github --max-severity warning
```

To send findings to GitHub code scanning instead, write SARIF and upload it with `github/codeql-action/upload-sarif`; the job then needs `security-events: write`, and a private repository needs GitHub Code Security.

```yaml
      - run: node tools/c4x-lint.cjs 'docs/**/*.{c4x,md}' --format sarif --max-severity off > c4x-lint.sarif
      - uses: github/codeql-action/upload-sarif@v4
        with:
          sarif_file: c4x-lint.sarif
```

Any other CI system: run the `text` or `json` format and let the exit code fail the job.

## From an AI agent: the MCP `lint_c4x` tool

The C4X MCP server (`mcp/c4x-mcp-server.bundle.cjs`) offers `lint_c4x` next to `validate_c4x`. It takes `code`, the C4X source, and optionally `rules`, the same table as the configuration file. It answers `Lint CLEAN. No findings.`, or `Lint FINDINGS.` with the counts, followed by one `line:column severity rule message fix` line per finding, at most 200, and a last line saying how many more there are. An entry in `rules` that is ignored, because the rule id or severity is unknown, is reported on a `Note:` line. Findings are advice, so the tool reports an error only when the code does not parse or exceeds a [limit](#limits); an agent can call `validate_c4x`, then `lint_c4x`, before it hands a diagram back.

Findings quote diagram text, which whoever wrote the diagram controls. Control characters in quoted text are escaped, so a label cannot add a line to the result, and an agent should treat the quoted text as data, never as instructions. A malformed or unknown request gets a JSON-RPC error and the server keeps running.

## Limitations

- There is no comment that suppresses one finding in the source. Turn the rule off or change its severity in the configuration.
- A model error is reported on the first line of the diagram, not on the element that caused it; the message names the element.
- The `c4x` fence scanner shares the editor's limit on unclosed fences inside list items.
- `C4X-SYNTAX`, `C4X-MODEL` and `C4X-LIMIT` cannot be switched off, even with `"enabled": false`.
- The editor reads `c4x.lint.*` from VS Code settings and `c4x-lint` reads its own configuration file. Keep the two rule tables the same by copying one into the other.
