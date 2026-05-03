# Using C4x Gemini capability to generate C4 models

## C1: System Context Diagram

```c4x
%%{ c4: container }%%
graph TB
    %% Actors
    Person(user, "Diagram Author", "Creates, views, and exports C4X architecture diagrams")

    %% External Systems
    System_Ext(vscode, "VS Code Platform", "Provides extension API, window dialogs, workspace state, and notifications")
    System_Ext(chromium, "Playwright / Chromium", "Headless browser engine used for precise PNG rendering")
    System_Ext(clipboard, "OS Clipboard", "Operating system clipboard utility")
    System_Ext(fs, "Local File System", "Target destination for saved diagram files")

    %% Main Extension Boundary
    subgraph C4XExtension {
        Container(commands, "Command Handlers", "TypeScript", "Registers VS Code commands for copySvg, exportSvg, exportPng, and changeTheme")
        Container(preview, "Preview Panel", "TypeScript / Webview", "Maintains the active rendered SVG state in the editor")
        Container(themeSystem, "Theme System", "TypeScript", "Manages visual themes like Classic, Modern, Muted, and Auto sync")
        Container(exporters, "Export Services", "TypeScript", "Coordinates PDF, HTML, SVG, and PNG generation strategies")
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
    exporters -->|Renders HTML layout to PNG via| chromium
    exporters -->|Opens browser print dialog via| vscode
    
    themeSystem -->|Persists configuration to| vscode
```
## C2: Container Diagram

```c4x
%%{ c4: component }%%
graph TB
    Person(User, "VS Code User", "Triggers exports and changes diagram themes")

    System_Ext(VSCodeAPI, "VS Code API", "File system, settings, and workspace environment")
    System_Ext(Playwright, "Playwright Chromium", "Headless browser used for rendering PNGs")
    System_Ext(OSClipboard, "OS Clipboard", "System clipboard for copying diagrams")
    System_Ext(Browser, "Web Browser", "System default browser for PDF printing")

    subgraph C4XExtension {
        Component(CommandHandlers, "Command Handlers", "TypeScript", "Entry points for export, copy, and theme commands")
        Component(PreviewPanel, "Preview Panel", "TypeScript", "Holds the rendered diagram SVG state")
        Component(ThemeManager, "Theme Manager", "TypeScript", "Central registry for classic, modern, and high-contrast themes")
        Component(IconRegistry, "Icon Registry", "TypeScript", "Provides SVG sprites for tech providers (AWS, GCP, Azure)")
        
        subgraph Exporters {
            Component(SvgExporter, "SVG Exporter", "TypeScript", "Generates standalone SVG files with embedded CSS")
            Component(PngExporter, "PNG Exporter", "TypeScript", "Renders SVG to high-resolution PNG")
            Component(HtmlExporter, "HTML Exporter", "TypeScript", "Converts markdown and diagrams to standalone HTML")
            Component(PdfExporter, "PDF Exporter", "TypeScript", "Prepares HTML and opens browser print dialog")
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
    
    PdfExporter -->|Generates Base Template| HtmlExporter
    PdfExporter -->|Opens URI| Browser
    
    PngExporter -->|Screenshots Rendered SVG| Playwright
    ClipboardExporter -->|Writes Text| OSClipboard
```
## C3: component Diagram
```c4x
%%{ c4: container }%%
graph TB
  Person(architect, "Software Architect", "Designs and documents software architecture using C4X")

  subgraph HostEnvironment {
    System(c4x, "C4X VS Code Extension", "Parses, renders, AI-generates, and exports C4 model diagrams")
  }

  System_Ext(gemini, "Google Gemini API", "Generative AI (Gemini 3.1) for creating C4X DSL and visual diagrams from code context")
  System_Ext(fs, "Local File System", "Stores workspace source code, markdown files, and exported diagrams")
  System_Ext(chromium, "Playwright (Chromium)", "Headless browser engine used for rendering high-resolution PNGs")
  System_Ext(clipboard, "System Clipboard", "Receives copied standalone SVG markup for external pasting")
  System_Ext(browser, "System Browser", "Opens generated print-optimized HTML for PDF exports")

  architect -->|Writes C4X DSL, invokes AI & exports| c4x
  c4x -->|Sends file context & prompts| gemini
  c4x -->|Reads code & writes export files| fs
  c4x -->|Passes HTML/SVG for screenshotting| chromium
  c4x -->|Copies standalone SVG| clipboard
  c4x -->|Opens print preview| browser
```
