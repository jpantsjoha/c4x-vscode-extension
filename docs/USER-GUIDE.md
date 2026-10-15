# C4X User Guide

> **Version line**: public v1.6.4 and the 1.7.0 candidate
> **Updated**: 2026-09-07

C4X renders source-controlled C4 diagrams directly in VS Code without Java, Docker, or a rendering server. Public v1.6.x includes the source-authoritative Visual C4 Editor; the 1.7.0 candidate adds model discovery and editor reliability work.

## Supported source files

| Source | Extension | Current preview behaviour |
|---|---|---|
| Native C4X | `.c4x` | Parse, model, automatic layout, SVG preview and C4X export commands |
| Structurizr DSL | `.dsl` | Supported subset adapted into the common C4 model |
| PlantUML C4 | `.puml` | Supported C4 macros adapted into the common C4 model |
| Markdown | `.md` | `c4x` fenced blocks render through the Markdown extension path |

Compatibility varies for foreign DSL features. Keep source in version control and review generated output.

## Create a native C4X diagram

Create `banking.c4x`:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Banking Customer", "Uses online banking")
    System(banking, "Internet Banking", "Provides account services")
    System_Ext(email, "E-mail System", "Sends notifications")

    customer -->|Uses| banking
    banking -->|Sends notifications through| email
```

See the [syntax reference](c4x-syntax.md) and [examples index](EXAMPLES.md) for C1, C2, C3, dynamic, boundary, icon, layout, and pattern examples.

## Open and refresh the preview

With a `.c4x`, `.dsl`, or `.puml` document active, use any of these entry points:

- run **C4X: Open Preview** from the Command Palette;
- use the editor context/title menu;
- press `Ctrl+K V` on Windows/Linux or `Cmd+K V` on macOS.

The preview follows the active supported document and schedules a render when the watched document changes or is saved. Run **C4X: Refresh Preview** to request a refresh explicitly.

Parse and render errors are shown inside the preview. If no supported document is active, open one and run the command again.

## Markdown diagrams

Use a fenced `c4x` block:

````markdown
```c4x
%%{ c4: system-context }%%
graph LR
    Person(user, "User", "Uses the application")
    System(app, "Application", "Provides the service")
    user -->|Uses| app
```
````

Open VS Code's built-in Markdown preview. The extension replaces supported C4X fences with rendered SVG.

## Export and presentation commands

| Command | Purpose |
|---|---|
| **C4X: Export Markdown to HTML** | Export the active Markdown document with rendered diagrams |
| **C4X: Export - Preview** | Open a print-oriented document for browser PDF printing |
| **C4X: Export Diagram as PNG** | Export the current native C4X diagram as PNG |
| **C4X: Export SVG** | Save the current SVG |
| **C4X: Copy SVG To Clipboard** | Copy SVG source |
| **C4X: Change Theme** | Select a supported diagram theme |
| **C4X: Reset Visual Layout** | Remove native layout metadata or the selected sidecar overrides |

If an SVG-based export command has no current rendered diagram, it can offer to open the preview first.

## Architecture conformance

A component (C3) view says which components may depend on which. C4X can turn it into rules that
your own CI runs, so the build fails when the code grows a dependency the diagram does not
declare. C4X does not bundle a checker: it writes the rules, and it explains the checker's
result on the `.c4x` lines.

1. **Map components to code.** Add `$code="..."` to each Component or Container, with
   workspace-relative globs (see [Code Mapping](c4x-syntax.md#code-mapping-code)):

   ```c4x
   %%{ c4: component }%%
   graph TB
       Component(api, "HTTP API", "Node.js", "Routes requests", $code="src/api/**")
       Component(orders, "Orders", "Node.js", "Order rules", $code="src/orders/**")
       Component(store, "Store", "Node.js", "Persistence", $code="src/store/**")
       api -->|places orders through| orders
       orders -->|persists with| store
   ```

2. **Export the rules.** With the `.c4x` file active, run
   **C4X: Export Architecture Conformance**. It writes `.dependency-cruiser.c4x.json` at the
   workspace root: a [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
   allow-list with one rule per declared relationship (`a --> b` means code in `a` may import
   code in `b`), one rule per component allowing imports within itself, and a pass-through for
   imports outside the mapped folders (packages, Node built-ins). Components without `$code`,
   and relationships that touch them or a Person or Software System, produce no rule; the
   **C4X Conformance** output channel lists every one of them.

3. **Run the checker in CI**, from the workspace root, on Node 22 or later. For CI, install the
   checker and TypeScript as exact-pinned development dependencies, so your lockfile fixes what
   runs and a registry change cannot alter your gate:

   ```bash
   npm install --save-dev --save-exact dependency-cruiser@18.4.0 typescript@5.9.3
   npx depcruise src --config .dependency-cruiser.c4x.json --output-type err
   ```

   dependency-cruiser parses TypeScript only when `typescript` is installed beside it. Without it,
   a TypeScript project is cruised as almost no modules and passes, which is why both are pinned.
   To try it once without installing anything, the export's **Copy Run Command** gives the
   equivalent one-off form, which downloads both at those versions:

   ```bash
   npx --yes -p dependency-cruiser@18.4.0 -p typescript@5.9.3 depcruise 'src' --config .dependency-cruiser.c4x.json --output-type err
   ```

   Use `--output-type err` (or read `summary.error` from JSON) as the gate: the `json` reporter
   exits 0 whatever it finds. Any import the view does not declare fails as `not-in-allowed`.
   Test files (`__tests__/`, `*.test.*`, `*.spec.*`) are excluded, and `import type` counts as a
   dependency.

4. **See the result on the diagram.** Save the checker's JSON result
   (`--output-type json > depcruise.json`) and run
   **C4X: Check Architecture Conformance from dependency-cruiser Result** with the `.c4x` file
   active. Findings appear in the Problems panel on the `.c4x` lines:

   | Finding | Severity | Where |
   |---|---|---|
   | Undeclared dependency (`not-in-allowed`, or an import between components that no relationship declares) | Error | The source component's line, listing the imports |
   | A file in the checked folders that no `$code` maps | Error | Line 1 |
   | The result covers no mapped module, or under half of the mapped source files on disk | Error | Line 1 |
   | A component none of whose files were cruised | Warning | The element's line |
   | Components that form a dependency cycle in the code | Warning | The first component of the cycle |
   | A declared relationship no import uses | Warning | The relationship's line |
   | A Component or Container without `$code` | Information | The element's line |

   The checker reports neither cycles between components nor relationships the code never uses;
   C4X computes both from the module graph in the JSON result. It also checks every import in
   that graph against the view itself, so a stale `.dependency-cruiser.c4x.json` cannot let an
   undeclared dependency through, and it compares the modules cruised with the files your
   `$code` globs match, so a run that silently parsed nothing fails. The findings describe the text
   they were computed from, so editing the file clears them.

## Gemini-assisted commands

Gemini features are optional and require their documented configuration. They are separate from deterministic local parsing and preview:

- **C4X: Generate Diagram Here (Gemini)**;
- **C4X: Diagram from Selection**;
- **C4X: Preview - Visual Diagram (PNG)**.

Review AI-generated source or images before committing them. See the [Gemini guide](GEMINI_GUIDE.md).

## Visual Layout Mode status

The Visual C4 Editor is available in public v1.6.x releases. It provides source-controlled drag, keyboard movement, staged native property editing with inline validation, safe identifier rename, relationship creation and editing, boundary editing, lock toggling, reset, native C4X writeback, and deterministic sidecar persistence for foreign formats.

Follow [How to edit a C4 diagram visually](how-to/edit-a-c4-diagram-visually.md) for entering edit mode, pointer and keyboard movement, zoom/pan, persistence selection, reset, and recovery. Changes are staged and applied together with **Save Changes**; **Discard** abandons the draft. Source or an explicit versioned sidecar remains authoritative.

See the [capability matrix and Known Limitations](features/visual-c4-editor.md) for the verified boundary and the planned semantic-editor journey. Native `.c4x` preview supports a staged property inspector and safe identifier rename; Markdown C4X fences expose the same staged editor through a CodeLens, the editor context menu, and the Markdown Preview toolbar (B18). Boundaries declared with `System_Boundary`, `Container_Boundary` or `Enterprise_Boundary` cannot be dragged or resized, because that syntax has no place for a position or size; their frame follows their contents, and hovering one in edit mode says so. A boundary written as `subgraph` can be moved and resized, but it loses its C4 type: the nesting-legality and `Container_Boundary` lint checks no longer apply to it. Source-diff review (#83) and session-level conflict recovery (#71) are implemented. Direct node creation and relationship add/delete/connect are not implemented in the current mode.

## Troubleshooting

### Preview does not open

- Confirm the active file is `.c4x`, `.dsl`, or `.puml`.
- Run **C4X: Open Preview** from the Command Palette.
- Check the Problems and Extension Host output for activation errors.

### Preview reports a parse error

- Check the view directive and `graph` declaration for native C4X.
- Reduce the file to the smallest failing example.
- Compare it with the [syntax reference](c4x-syntax.md).

### Layout is unclear

- Choose an explicit `TB`, `BT`, `LR`, or `RL` graph direction.
- Shorten very long labels.
- Split diagrams that mix multiple abstraction levels.
- Use the [layout examples](EXAMPLES-LAYOUT.md).

### Markdown preview does not render

- Use a `c4x` fenced code block exactly.
- Confirm the C4X extension is active.
- Reload the Markdown preview after correcting syntax.

For additional cases, see [Troubleshooting](TROUBLESHOOTING.md) and the [FAQ](FAQ.md).
