# Using C4x Gemini capability to generate C4 models

## C1: System Context Diagram

```c4x
%%{ c4: system-context }%%
graph TB
  Person(Architect, "Software Architect", "Designs and documents software architecture using C4X DSL.")
  System(C4XSystem, "C4X VS Code Extension", "Parses DSL, applies themes, calculates layouts (Dagre/ELK), and renders SVG diagrams.")
  System_Ext(VSCode, "Visual Studio Code", "IDE that hosts the extension, manages document events, and displays the webview preview.")
  System_Ext(GeminiAPI, "Google Gemini API", "External AI service used for recommending diagram types and generating visual architecture content.")

  Architect -->|Writes DSL and triggers commands| C4XSystem
  C4XSystem -->|Integrates webview and diagnostics| VSCode
  C4XSystem -->|Requests AI-assisted generation| GeminiAPI
  VSCode -->|Notifies of text changes and saves| C4XSystem
```

## C2: Component Diagram

```c4x
%%{ c4: container }%%
graph TB
  Person(User, "Software Architect", "Uses the VS Code extension to design and visualize C4 diagrams.")
  System_Ext(VSCode, "VS Code", "The IDE environment hosting the C4X extension and providing the Markdown preview.")

  subgraph C4XExtension {
    Container(ExtensionCore, "Extension Core", "TypeScript", "Handles command registration, lifecycle management, and VS Code API integration.")
    Container(LayoutEngines, "Layout Engines", "Dagre / ELK", "Processes the C4 model into coordinates using Dagre or ELK algorithms.")
    Container(RenderingEngine, "SVG Builder", "TypeScript / SVG", "Generates SVG markup from positioned elements using selected themes.")
    Container(ThemeManager, "Theme Manager", "TypeScript", "Manages visual styles like Classic, Modern, and High Contrast.")
    Container(Exporters, "Export Modules", "TypeScript / Playwright", "Converts SVG diagrams into HTML, PDF, PNG, and Standalone SVG formats.")
    Container(SpriteLibrary, "Sprite Library", "TypeScript", "Provides a collection of normalized SVG paths for AWS, Azure, GCP, and C4 icons.")
  }

  System_Ext(FS, "File System", "Local storage for exported diagram files and extension configuration.")

  User -->|Uses| VSCode
  VSCode -->|Invokes Commands| ExtensionCore
  ExtensionCore -->|Requests Layout| LayoutEngines
  LayoutEngines -->|Returns Coordinates| ExtensionCore
  ExtensionCore -->|Requests Render| RenderingEngine
  ExtensionCore -->|Retrieves Theme| ThemeManager
  ThemeManager -->|Provides Styling| RenderingEngine
  RenderingEngine -->|Fetches Icons| SpriteLibrary
  RenderingEngine -->|Provides SVG| Exporters
  Exporters -->|Writes| FS
```

## C3: Container Diagram
