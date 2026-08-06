# C4X User Guide

> **Version line**: v1.4.x
> **Updated**: 2026-07-16

C4X renders source-controlled C4 diagrams directly in VS Code without Java, Docker, or a rendering server. The public v1.4.x experience is source-first; the private v1.6 integration branch carries the UAT Visual C4 Editor.

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

## Gemini-assisted commands

Gemini features are optional and require their documented configuration. They are separate from deterministic local parsing and preview:

- **C4X: Generate Diagram Here (Gemini)**;
- **C4X: Diagram from Selection**;
- **C4X: Preview - Visual Diagram (PNG)**.

Review AI-generated source or images before committing them. See the [Gemini guide](GEMINI_GUIDE.md).

## Visual Layout Mode status

The Visual C4 Editor is merged to private `main` and distributed in `1.6.0-uat.N` prerelease builds pending UAT sign-off. It is not in the public v1.4.x Marketplace feature set. The build provides source-controlled drag, keyboard movement, staged native property editing with inline validation, safe identifier rename, relationship label editing, lock toggling, reset, native C4X writeback, and deterministic sidecar persistence for foreign formats.

Follow [How to edit a C4 diagram visually](how-to/edit-a-c4-diagram-visually.md) for entering edit mode, pointer and keyboard movement, zoom/pan, persistence selection, reset, and recovery. Changes are staged and applied together with **Save Changes**; **Discard** abandons the draft. Source or an explicit versioned sidecar remains authoritative.

See the [capability matrix and Known Limitations](features/visual-c4-editor.md) for the verified boundary and the planned semantic-editor journey. Native `.c4x` preview supports a staged property inspector and safe identifier rename; Markdown C4X fences expose the same staged editor through a CodeLens, the editor context menu, and the Markdown Preview toolbar (B18). Source-diff review (#83) and session-level conflict recovery (#71) are implemented. Direct node creation and relationship add/delete/connect are not implemented in the current mode.

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
