# Using C4x Gemini capability to generate C4 models

## C1: System Context Diagram

```c4x
%%{ c4: container }%%
graph TB
    %% Actors
    Person(user, "Diagram Author", "Creates, views, and exports C4X architecture diagrams")

    %% External Systems
    System_Ext(vscode, "VS Code Platform", "Provides extension API, window dialogs, workspace state, and notifications")
    System_Ext(clipboard, "OS Clipboard", "Operating system clipboard utility")
    System_Ext(fs, "Local File System", "Target destination for saved diagram files")

    %% Main Extension Boundary
    subgraph C4XExtension {
        Container(commands, "Command Handlers", "TypeScript", "Registers VS Code commands for copySvg, exportSvg, exportPng, and changeTheme")
        Container(preview, "Preview Panel", "TypeScript / Webview", "Maintains the active rendered SVG state in the editor")
        Container(themeSystem, "Theme System", "TypeScript", "Manages visual themes like Classic, Modern, Muted, and Auto sync")
        Container(exporters, "Export Services", "TypeScript", "Coordinates HTML, SVG, and PNG generation strategies")
        Container(assets, "Asset Library", "TypeScript", "Provides normalized SVG sprites and cloud vendor icons")
    }

    %% User Interactions
    user -->|Triggers Extension Commands| commands

    %% Internal Orchestration
    commands -->|Retrieves active SVG string| preview
    commands -->|Delegates to specific strategy| exporters
    commands -->|Updates active selection| themeSystem

    exporters -->|Reads current style configurations| themeSystem
    exporters -->|Fetches SVG icon paths| assets

    %% External Integrations
    exporters -->|Writes raw SVG text to| clipboard
    exporters -->|Saves generated files to| fs
    exporters -->|Opens browser print dialog via| vscode
    
    themeSystem -->|Persists configuration to| vscode
```
## C2: Container Diagram

```c4x
%%{ c4: component }%%
graph TB
    Person(User, "VS Code User", "Triggers exports and changes diagram themes")

    System_Ext(VSCodeAPI, "VS Code API", "File system, settings, and workspace environment")
    System_Ext(OSClipboard, "OS Clipboard", "System clipboard for copying diagrams")
    System_Ext(Browser, "Web Browser", "System default browser for PDF printing")

    subgraph C4XExtension {
        Component(CommandHandlers, "Command Handlers", "TypeScript", "Entry points for export, copy, and theme commands")
        Component(PreviewPanel, "Preview Panel", "TypeScript", "Holds the rendered diagram SVG state")
        Component(ThemeManager, "Theme Manager", "TypeScript", "Central registry for classic, modern, and high-contrast themes")
        Component(IconRegistry, "Icon Registry", "TypeScript", "Provides SVG sprites for tech providers (AWS, GCP, Azure)")
        
        subgraph Exporters {
            Component(SvgExporter, "SVG Exporter", "TypeScript", "Generates standalone SVG files with embedded CSS")
            Component(PngExporter, "PNG Exporter", "TypeScript", "Renders SVG to high-resolution PNG via Canvas-based rendering")
            Component(HtmlExporter, "HTML Exporter", "TypeScript", "Converts markdown and diagrams to standalone HTML")
            Component(PrintPreview, "Print Preview", "TypeScript", "Prepares HTML and opens browser print dialog")
            Component(ClipboardExporter, "Clipboard Exporter", "TypeScript", "Copies raw SVG markup to the system clipboard")
        }
    }

    User -->|Executes Commands| CommandHandlers

    CommandHandlers -->|Retrieves Current SVG| PreviewPanel
    CommandHandlers -->|Gets or Sets Theme| ThemeManager
    
    CommandHandlers -->|Invokes| SvgExporter
    CommandHandlers -->|Invokes| PngExporter
    CommandHandlers -->|Invokes| ClipboardExporter

    ThemeManager -->|Reads and Persists Config| VSCodeAPI
    
    SvgExporter -->|Applies Styling Context| ThemeManager
    PngExporter -->|Applies Styling Context| ThemeManager
    
    SvgExporter -->|Saves Output File| VSCodeAPI
    PngExporter -->|Saves Output File| VSCodeAPI
    HtmlExporter -->|Saves Output File| VSCodeAPI
    
    PrintPreview -->|Generates Base Template| HtmlExporter
    PrintPreview -->|Opens URI| Browser
    
    PngExporter -->|Renders SVG to PNG via Canvas| VSCodeAPI
    ClipboardExporter -->|Writes Text| OSClipboard
```
## C3: component Diagram
