# C4X reference

One reference for people and assistants, generated from the code that defines C4X.

| File | What it is |
|---|---|
| [c4x-reference.md](c4x-reference.md) | The reference as a page: element calls and their arguments, placement, relationships, styles, text limits, lint rules, examples and the grammar. |
| [c4x-reference.json](c4x-reference.json) | The same content as data, for tools. It carries a `schemaVersion`. |
| [c4x-reference.schema.json](c4x-reference.schema.json) | The JSON Schema for the data file. |

Do not edit these three files. Run `pnpm run generate:reference` (or `make reference`) after a change to the grammar, the model builder, the style resolver, the lint catalogue or `scripts/c4x-reference/annotations.ts`. `make check` runs `make verify-reference` and the unit tests, and both fail when a file differs from a fresh run.
