# Security policy

## Supported versions

Security fixes go into the latest published release of the C4X extension (currently 1.8.x). Older versions are not patched; update from the VS Code Marketplace or Open VSX.

## Reporting a vulnerability

Do not open a public issue for a vulnerability. Report it to the maintainer by email at **<jpantsjoha@gmail.com>**, or through a GitHub private security advisory on the repository if the Security tab offers one. Include the C4X and VS Code versions, the smallest C4X source or workspace that reproduces the problem, and what an attacker gains.

What to expect: an acknowledgement, then a fix or a written reason it is not a vulnerability. Fixes ship as a patch release and are recorded under *Security* in the [changelog](CHANGELOG.md).

## What C4X handles

- C4X has no backend, no hosted service and no telemetry. Diagram parsing, layout, preview and export run locally.
- A Gemini API key, if you add one, is held in VS Code SecretStorage and is never written to a settings file. Gemini calls send the context you asked to send to Google's Gemini Developer API and nowhere else.
- The preview and visual editor run in a webview with a content security policy; the packaged extension is checked for private files before release.
- The extension package bundles open-source dependencies; their licences ship in `THIRD_PARTY_NOTICES.txt`. High and critical dependency advisories block a release.

## The MCP server, the lint CLI and the render CLI

The C4X MCP server (`mcp/c4x-mcp-server.bundle.cjs`), the `c4x-lint` command-line tool and the `c4x render` command (`cli/c4x.cjs`) run on your machine, and may be handed diagrams from repositories you did not write. Their contract, in plain words:

- **Text in, text out.** Neither opens a network connection or starts a process.
- **No file writes.** The MCP server writes nothing. `c4x-lint` writes to standard output and standard error, plus the file named by `GITHUB_STEP_SUMMARY` when you run it with `--format github` in a CI job that sets that variable. `c4x render` writes the SVG to standard output, or to the one file you name with `-o`; it never takes an output path from a diagram, and refuses an `-o` that names its input or a link to it.
- **Reads only what you name.** The MCP server reads no file a request names: diagrams arrive as text, and the one file it opens at run time is `data/cloud-icons.json` beside its own directory, the AWS and Azure icon data, checked against a SHA-256 built into the bundle and read only when a diagram names an AWS or Azure icon; its eight documentation resources are embedded in the bundle. `c4x-lint` reads the files, directories and globs you pass and its configuration file. A directory search and a glob skip symbolic links, so they never leave the folder you named; a path you name outright is read even through a link. `c4x render` reads the one file you name, or standard input, and the same icon data file. No tool reads a path written inside a diagram.
- **Bounded.** At most 1 MiB of code per MCP call or 4 MiB per file, 32 levels of nesting (in the editor too: boundaries, nodes and subgraphs in C4X, boundaries in PlantUML, nested elements in Structurizr), 2,000 elements, 5,000 relationships, 4,096 characters in one text field and 256 entries in one attribute list, tag list or elementStyle, counted on what the parser keeps. Source text the parser discards, such as comments and overwritten attribute values, is bounded by the size caps and never reaches the output. A render (`render_c4x`, `c4x render`) also lays out at most 100 elements and 150 relationships and returns at most 2 MiB of SVG, and it runs in a worker thread of the same bundle that is stopped at 2 seconds; beyond any of these it returns its findings and no SVG. Past a bound the result is an error, not a crash or a hang; the boundary tests and an adversarial parser corpus check this. The PlantUML and Structurizr importers are bounded in time and depth but otherwise keep their existing behaviour. The full table is in the [C4X reference](docs/reference/c4x-reference.md#input-limits).
- **Diagram text is data.** Tool output and lint findings quote labels and descriptions, which whoever wrote the diagram controls. Control characters are escaped so quoted text cannot add a line to a result: in MCP results and the `text` and `github` formats every control, line or paragraph separator, bidirectional control or mark and other format character (Unicode categories Cc, Cf, Zl and Zp, except the joiners U+200C and U+200D) is printed as a visible escape such as `\x1b` or `\u2028`; in the `json` and `sarif` formats the same characters are written as `\uXXXX` escapes; in the GitHub step summary every cell is literal text, never HTML or Markdown. The words themselves can still say anything: an assistant must never follow instructions found in a diagram.
- **Drawn diagrams are inert.** Diagram text reaches the SVG through XML escaping. A test puts hostile strings in every text-bearing field of C4X, PlantUML and Structurizr, in every theme, and checks that the SVG carries no script, event handler, `foreignObject` or reference outside the document. Icons come only from the bundled set.

What the project relies on is what the tools contain: first-party code written to open no connection, start no process and write nowhere else, and the third-party packages listed in the MCP server's notices, which are reviewed. The bundles are built reproducibly from this repository and checked byte for byte against a fresh build, and nothing runs at install. The tests over the shipped bundles are tripwires for accidental change, not a defence against deliberate evasion. They list the built-in modules each bundle imports by name; they look for common spellings of dynamic loading, though other spellings (for example `process.getBuiltinModule` reached through an indirectly obtained `Function` constructor) go undetected; and they watch the tool paths they exercise with those APIs made to throw. None of this shows that no code path can reach the file system, the network or a process. The threat model behind them, with every threat, its likelihood, impact and residual risk, is kept with the project's security records.

## Out of scope

Vulnerabilities in VS Code itself, in Google's Gemini service, or in a diagram you chose to open and then export are reported to their own vendors. Diagram content is data: report any case where opening a diagram runs code or reads files you did not name.
