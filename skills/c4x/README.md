# c4x skill

An Agent Skills skill for writing, checking, rendering and fixing C4X diagrams. The agent reads [SKILL.md](SKILL.md). Guide: [C4X agent skill](https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/C4X-AGENT-SKILL.md) (an absolute link, so it also works in the plugin copies under `plugins/c4x/skills/` and in each host's installed copy).

- `references/`: the syntax reference, generated from `docs/reference/c4x-reference.json`.
- `scripts/validate.sh`: checks a file without MCP, using the bundled `scripts/c4x-lint.cjs` (needs only `node`; no MCP, nothing on PATH).
- `scripts/c4x-lint.cjs`: a copy of `cli/c4x-lint.cjs`, refreshed by `pnpm run generate:skill`; a unit test fails when the two differ.
