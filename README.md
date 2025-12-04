# C4X - C4 Model Diagrams for VS Code
> **Status (2025-12-01)**: ✅ **v1.0 STABLE** - Visual styling now matches official C4 Model standards (hollow arrows, correct colors, person icons).

![CI](https://github.com/jpantsjoha/c4model-vscode-extension/workflows/CI/badge.svg)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
![License](https://img.shields.io/github/license/jpantsjoha/c4model-vscode-extension)

> **Make C4 architectural diagrams as easy as Mermaid in VS Code** - Jaroslav

Fast, offline, Mermaid-inspired C4 diagrams with real-time preview and support for multiple DSL formats.

## ✨ Features

- ⚡ **Instant preview** - Sub-50ms rendering for 30-node diagrams
- 🔍 **Real-time Validation** - Syntax highlighting and error reporting as you type
- 📝 **Markdown Integration** - Render ` ```c4x ` blocks directly in your README files
- 🎨 **5 built-in themes** - Classic, Modern, Muted, High Contrast, Auto
- 📝 **3 DSL formats** - C4X, PlantUML C4, Structurizr DSL
- 🚀 **Zero dependencies** - No Java, no Graphviz, no external servers
- 📦 **Tiny bundle** - 386KB (63% under 1MB target)
- 🔒 **Secure** - CSP-compliant, no external CDN dependencies
- 📤 **Export** - SVG/PNG with theme preservation
- ⚡ **Lightning fast activation** - 0.15ms startup (99.9% faster than 200ms target)

### Additional References

- Updated visual guide is now showcased in the c4model.com and in the `./examples` folder.
- Relevant updates for Archimate are available for review [here](https://www.archimatetool.com/blog/2020/04/18/c4-model-architecture-viewpoint-and-archi-4-7/) (albeit outdated graphics).

## 🚀 Quick Start

### Installation

**From VS Code Marketplace** (Recommended):

1. Open VS Code
2. Press `Ctrl+Shift+X` (or `Cmd+Shift+X` on Mac)
3. Search for "C4X"
4. Click "Install"

**From Command Line**:

```bash
code --install-extension c4x-contributors.c4x
```

### Usage

1. **Create a C4X file**: `banking-system.c4x`
2. **Write your diagram**:
   ```c4x
   %%{ c4: system-context }%%
   graph TB

   Customer[Customer<br/>Person]
   Banking[Banking System<br/>Software System]
   Email[Email System<br/>Software System<br/>External]

   Customer -->|Uses| Banking
   Banking -->|Sends notifications| Email
   ```
3. **Open preview**: Press `Ctrl+K V` (or `Cmd+K V` on Mac)
4. **See instant results**: Your diagram renders in < 50ms!

That's it! No Java, no servers, no configuration needed.

### Markdown Integration

You can embed C4X diagrams directly in your markdown files (e.g., `README.md`, `ARCHITECTURE.md`).

````text
# My Architecture

Here is the system context:

```c4x
%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    System[My System<br/>Software System]
    User -->|Uses| System
```
````

The extension will automatically render this code block as a visual SVG diagram in the VS Code Markdown Preview.

### Example: System Context Diagram

```c4x
%%{ c4: system-context }%%
graph TB
    Customer[Customer<br/>Person]
    Banking[Internet Banking System<br/>Software System]
    Email[Email System<br/>Software System<br/>External]

    Customer -->|Uses| Banking
    Banking -->|Sends emails using| Email
```

## 📖 C4X-DSL Syntax Guide

### Elements

```text
ElementID[Label<br/>Type<br/>Tags]
```

**Supported Types**:
- `Person` - Users of the system
- `Software System` - High-level software systems
- `Container` - Applications, services, databases
- `Component` - Code-level components

**Example**:
```c4x
Admin[Administrator<br/>Person]
API[Payment API<br/>Software System]
DB[User Database<br/>Container<br/>Internal]
```

### Relationships

```text
%% Uses (Dashed)
FromID -->|Label| ToID
%% Async (Dashed)
FromID -.->|Label| ToID
%% Sync / Strong (Solid)
FromID ==>|Label| ToID
```

**Example**:
```c4x
User[User<br/>Person]
Dashboard[Reporting Dashboard<br/>Container]
API[Reporting API<br/>Container]
Database[Reporting Database<br/>Container]

User -->|Views reports| Dashboard
Dashboard -.->|Fetches data| API
API ==>|Queries| Database
```

### Boundaries / Subgraphs

Group elements into systems or containers using subgraphs.

```text
subgraph BoundaryId {
    Element1[Label<br/>Type]
    Element2[Label<br/>Type]
}
```

**Example**:
```c4x
graph TB
    User[User<br/>Person]

    subgraph BankingSystem {
        WebApp[Web App<br/>Container]
        Database[DB<br/>Container]
    }

    User -->|Uses| WebApp
    WebApp ==>|Reads/Writes| Database
```

### View Types

```text
%% C1 - System Context
%%{ c4: system-context }%%
%% C2 - Container (coming soon)
%%{ c4: container }%%
%% C3 - Component (coming soon)
%%{ c4: component }%%
```

### Complete Example

```c4x
%%{ c4: system-context }%%
graph TB
    %% Actors
    Customer[Customer<br/>Person]
    Admin[Administrator<br/>Person]

    %% Systems
    WebApp[E-commerce Website<br/>Software System]
    PaymentGateway[Payment Gateway<br/>Software System<br/>External]
    EmailService[Email Service<br/>Software System<br/>External]

    %% Relationships
    Customer -->|Browses products, makes purchases| WebApp
    Admin -->|Manages products and orders| WebApp
    WebApp -->|Processes payments using| PaymentGateway
    WebApp -.->|Sends order confirmations via| EmailService
```

## 📖 Structurizr DSL Support

C4X now supports native Structurizr DSL syntax! Create `.dsl` files and get instant preview without Java or Graphviz.

**⚠️ Status**: Experimental (58% feature coverage) - Basic features work, advanced features may not be supported yet.

### Example: E-Commerce Platform

```dsl
workspace "E-Commerce Platform" {
    model {
        customer = person "Customer"
        admin = person "Administrator"

        ecommerce = softwareSystem "E-Commerce System" {
            web = container "Web Application"
            api = container "API Gateway"
            db = container "Database"
        }

        payment = softwareSystem "Payment Gateway"

        customer -> web "Browses products"
        admin -> web "Manages products"
        web -> api "Makes API calls"
        api -> db "Reads/writes data"
        api -> payment "Processes payments"
    }

    views {
        systemContext ecommerce "SystemContext" {
            include *
        }

        container ecommerce "Containers" {
            include *
        }
    }
}
```

### Supported Features

- ✅ System Context, Container, and Component views
- ✅ Person, Software System, Container, Component elements
- ✅ Nested elements (containers in systems)
- ✅ Relationships with descriptions and technology
- ✅ Include/exclude filters with wildcard (*) support
- ✅ Basic styling (element and relationship styles)
- ⏳ Advanced features (deployment views, groups) - Coming soon

For full compatibility details, see [docs/STRUCTURIZR-COMPATIBILITY.md](./docs/STRUCTURIZR-COMPATIBILITY.md)

### Example Files

Check out the complete examples in `docs/examples/`:
- [ecommerce.dsl](./docs/examples/ecommerce.dsl) - Full e-commerce platform example

## 📖 PlantUML C4 Support

C4X now supports PlantUML C4 syntax! Create `.puml` files using the official PlantUML C4 macros and get instant preview without Java or Graphviz.

### Example: Banking System

```plantuml
@startuml
!include https://raw.githubusercontent.com/plantuml-stdlib/C4-PlantUML/master/C4_Container.puml

' Actors
Person(customer, "Customer", "A customer of the banking system")
Person_Ext(backOfficeStaff, "Back Office Staff", "Administration users")

' External Systems
System_Ext(email, "E-mail System", "Microsoft Exchange")
System(mainframe, "Mainframe Banking System", "Core banking")

' Banking System Boundary
System_Boundary(internetBanking, "Internet Banking System") {
    Container(webApp, "Web Application", "Java Spring", "Delivers content")
    Container(spa, "Single-Page Application", "Angular", "Banking functionality")
    Container(mobileApp, "Mobile App", "Xamarin", "Mobile banking")
    Container(api, "API Application", "Java", "Banking API")
    ContainerDb(database, "Database", "Oracle", "Stores data")

    Rel(webApp, spa, "Delivers to browser")
    Rel(spa, api, "Makes API calls", "JSON/HTTPS")
    Rel(mobileApp, api, "Makes API calls", "JSON/HTTPS")
    Rel(api, database, "Reads/writes", "JDBC")
}

' External Relationships
Rel(customer, webApp, "Visits", "HTTPS")
Rel(customer, spa, "Uses")
Rel(customer, mobileApp, "Uses")
Rel(api, mainframe, "Calls", "XML/HTTPS")
Rel(api, email, "Sends emails", "SMTP")

@enduml
```

### Supported Features

- ✅ Element macros: Person, System, Container, Component (+ _Ext variants)
- ✅ Database variants: SystemDb, ContainerDb, ComponentDb
- ✅ Relationship macros: Rel, Rel_Back, Rel_Neighbor, Rel_D/U/L/R
- ✅ Boundary macros: System_Boundary, Container_Boundary
- ✅ Nested elements within boundaries
- ✅ Technology and description parameters
- ✅ External system tagging
- ✅ Comments and directives (skipped gracefully)

### Example Files

Check out the complete examples in `docs/examples/`:
- [banking-plantuml.puml](./docs/examples/banking-plantuml.puml) - Complete banking system example

## 🎨 Themes

Choose from 5 built-in themes to match your documentation style:

| Theme | Description | Use Case |
|-------|-------------|----------|
| **Classic** | Official C4 Model colors (Simon Brown spec) | Standard C4 documentation |
| **Modern** | Vibrant colors with rounded corners | Presentations, modern docs |
| **Muted** | Grayscale minimalist | Professional reports, B&W printing |
| **High Contrast** | WCAG AAA compliant (7:1 ratio) | Accessibility, readability |
| **Auto** | Adapts to VS Code light/dark theme | Match your editor theme |

**Change Theme**:
- Command Palette: `C4X: Change Theme`
- Settings: `"c4x.theme": "modern"`

## 📤 Export Diagrams

Export your diagrams to SVG or PNG with theme preservation:

**Export Commands**:
- `C4X: Export SVG` - Vector format for editing (Figma, Sketch, Adobe Illustrator)
- `C4X: Export PNG` - Raster format for documentation and presentations
- `C4X: Copy SVG to Clipboard` - Quick paste into other applications

**Features**:
- ✅ Theme preservation (exported diagrams match your selected theme)
- ✅ High-quality rendering (no pixelation in SVG)
- ✅ Design tool compatibility (Figma, Sketch tested)
- ✅ Small file sizes (~20-50KB for typical diagrams)

## 📋 Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| `C4X: Open Preview` | `Ctrl+K V` (Mac: `Cmd+K V`) | Open live preview panel |
| `C4X: Export SVG` | - | Export diagram to SVG file |
| `C4X: Export PNG` | - | Export diagram to PNG file |
| `C4X: Copy SVG to Clipboard` | - | Copy SVG to clipboard |
| `C4X: Change Theme` | - | Switch between 5 built-in themes |

## ⚡ Performance

Exceeds all targets by 72-99%:

| Metric | Target | Achieved | Status |
|--------|--------|----------|--------|
| **Activation Time** | < 200ms | **0.15ms** | ✅ 99.9% faster |
| **Bundle Size** | < 1MB | **386KB** | ✅ 63% under target |
| **C4X Parse** | < 50ms | **10ms avg** | ✅ 80% faster |
| **PlantUML Parse** | < 50ms | **6.5ms avg** | ✅ 87% faster |
| **Preview Render** | < 250ms | **55ms avg** | ✅ 78% faster |
| **Full Pipeline** | < 300ms | **55ms avg** | ✅ 82% faster |

**Tested with**: 30-node diagrams (typical real-world size)

## 🛠️ Configuration

### Settings

Configure C4X in your VS Code settings (`Ctrl+,` or `Cmd+,`):

```json
{
  // Choose your preferred theme
  "c4x.theme": "classic",
  // Options: "classic", "modern", "muted", "high-contrast", "auto"
}
```

### File Associations

C4X automatically recognizes these file extensions:
- `.c4x` - C4X-DSL (Mermaid-inspired syntax)
- `.puml` - PlantUML C4 diagrams
- `.dsl` - Structurizr DSL files (experimental)

## 🏗️ Project Status

**Phase 1 (M0 - Scaffolding)**: ✅ Complete (v0.1.0)
**Phase 2 (M1 - C4X-DSL MVP)**: ✅ Complete (v0.2.0)
**Phase 3 (M2 - Themes & Export)**: ✅ Complete (v0.3.0) - *Markdown rendering coming in v1.1*
**Phase 4 (M3 - Structurizr DSL)**: ⚠️ Experimental (v0.4.0) - *58% test coverage, basic features work*
**Phase 5 (M4 - PlantUML C4)**: ✅ Complete (v0.5.0)

### Supported DSL Formats

| Format | Status | Support Level | Test Coverage |
|--------|--------|---------------|---------------|
| **C4X-DSL** (.c4x) | ✅ Production | 100% | 122/122 (100%) |
| **PlantUML C4** (.puml) | ✅ Production | ~75% | 58/58 (100%) |
| **Structurizr DSL** (.dsl) | ⚠️ Experimental | ~58% | 57/99 (58%) |

**v1.0 Focus**: C4X and PlantUML C4 are production-ready with 100% test pass rates.
**v1.1 Plan**: Full Markdown rendering (```c4x blocks) and Structurizr DSL fixes.

See [docs/STATUS.md](./docs/STATUS.md) for detailed roadmap.

## 🗺️ Roadmap

### v1.0.0 (October 2025) ✅ Ready to Ship

- ✅ C4X-DSL with Mermaid-inspired syntax (100% working)
- ✅ PlantUML C4 support - No Java required! (100% working)
- ✅ 5 built-in themes with instant switching
- ✅ SVG/PNG export with theme preservation
- ✅ Sub-50ms rendering for 30-node diagrams
- ⚠️ Structurizr DSL (experimental - 58% support)

### v1.1.0 (Within 1 Month Post-Launch) 🚧 Planned

- 🔨 **Markdown rendering** - Render ```c4x fenced code blocks inline (6-8h)
- 🔨 **Structurizr DSL fixes** - 100% compatibility, grammar overhaul (8-12h)
- 🔨 **Diagnostics panel** - Error highlighting and quick fixes (4.5h)
- 🔨 **Built-in templates** - C1/C2/C3/C4 boilerplate generators (3.5h)

**Total v1.1 effort**: 22-28 hours (focus on Markdown + Structurizr first)

## 📚 Documentation

- [Architecture](./ARCHITECTURE.md) - Technical architecture and design decisions
- [Contributing](./CONTRIBUTING.md) - Contribution guidelines
- [Technical Decisions](./docs/adrs/) - Architecture Decision Records (11 TDRs)
- [Phase Documentation](./docs/phases/) - Development phase reports
- [Performance Report](./docs/PERFORMANCE-REPORT.md) - Detailed benchmarks
- [PlantUML Compatibility](./docs/PLANTUML-C4-COMPATIBILITY.md) - 500+ line compatibility matrix

## 🤝 Contributing

Contributions welcome! We'd love your help to make C4X even better.

**Ways to contribute**:
- 🐛 Report bugs or suggest features via [GitHub Issues](https://github.com/jpantsjoha/c4model-vscode-extension/issues)
- 📝 Improve documentation or examples
- 🎨 Design new themes or icons
- 🧪 Write tests for edge cases
- ⚡ Performance optimizations

See [CONTRIBUTING.md](./CONTRIBUTING.md) for detailed guidelines.

## 👤 More from the Author

Check out my other VS Code extension:

*   **[Pine Script™ (v5)](https://marketplace.visualstudio.com/items?itemName=jpantsjoha.pine-script-v5)** - Syntax highlighting, snippets, and linting for TradingView's Pine Script.
    *   [GitHub Repository](https://github.com/jpantsjoha/pinescript-vscode-extension)

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

## 🙏 Acknowledgments

- [C4 Model](https://c4model.com/) by Simon Brown - The architectural modeling standard
- [Mermaid.js](https://mermaid.js.org/) - Inspiration for C4X-DSL syntax
- [Dagre.js](https://github.com/dagrejs/dagre) - Hierarchical graph layout engine
- [PlantUML C4](https://github.com/plantuml-stdlib/C4-PlantUML) - PlantUML C4 macros
- [Structurizr](https://structurizr.com/) - DSL for software architecture models

Read more about the [Story Behind C4X](./docs/ABOUT.md).

---

**Made with ❤️ for architects who value simplicity** | [Report Issues](https://github.com/jpantsjoha/c4model-vscode-extension/issues) | [Star on GitHub](https://github.com/jpantsjoha/c4model-vscode-extension)