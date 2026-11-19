# c4x

C4X for assistants and CI. This package carries the same engine as the [C4X VS Code extension](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x): the parser, the lint rules and the renderer, as three self-contained files.

| Command | What it does |
|---|---|
| `c4x-mcp` | MCP server over stdio. Tools: `validate_c4x` (syntax), `lint_c4x` (notation rules), `render_c4x` (the diagram as SVG). |
| `c4x render [file.c4x]` | Draws a diagram as SVG. Reads the named file or standard input; writes standard output or the one `--output` file. |
| `c4x-lint <paths>` | Lints `.c4x` files and C4X fences in Markdown. Exit code 1 when a finding reaches `--max-severity`. |

The package has no runtime dependencies and no install scripts. It needs Node 20 or later (Node 18 reached end of life in April 2025). The server receives only the text an assistant sends and returns text; it opens no network connection and writes no file. `c4x render` writes a file only when you pass `--output`.

## Install

```sh
npm install -g c4x
```

This puts `c4x`, `c4x-lint` and `c4x-mcp` on your `PATH`. Check it:

```sh
printf 'graph TB\nPerson(user, "User", "A person")\nSystem(app, "App", "A system")\nuser -->|Uses| app\n' | c4x render > diagram.svg
```

## Register the MCP server

Each snippet starts the installed `c4x-mcp` command. None of them fetches a package at run time.

### Claude Code

```sh
claude mcp add c4x -- c4x-mcp
```

### Codex

Add to `~/.codex/config.toml`:

```toml
[mcp_servers.c4x]
command = "c4x-mcp"
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "c4x": { "command": "c4x-mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json` (the C4X extension registers the same server by itself; use this only without the extension):

```json
{
  "servers": {
    "c4x": { "type": "stdio", "command": "c4x-mcp" }
  }
}
```

## Verify a download

`npm pack c4x` fetches the tarball; `npm view c4x dist.integrity` shows the registry's checksum for it. Each bundle lists the third-party code it embeds in the `THIRD_PARTY_NOTICES.txt` beside it.

## Licence

MIT. Source and issues: <https://github.com/jpantsjoha/c4x-vscode-extension>.
