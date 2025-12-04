# C4X Sample Diagrams

> **Comprehensive C4 Model examples** for System Context, Container, and Component diagrams across all supported DSL formats.

## 📚 Quick Start

1. **Open any sample file** in VS Code (`.c4x`, `.puml`, or `.dsl`)
2. **Press `Ctrl+K V`** (or `Cmd+K V` on Mac) to open preview
3. **See instant rendering** - No Java, no external tools required!

## 🗂️ Sample Categories

### Level 1: System Context Diagrams

Shows the big picture - your system and its interactions with users and external systems.

| Sample | DSL Format | Description | File |
|--------|-----------|-------------|------|
| **Banking System** | C4X-DSL | Classic banking system with customers, staff, and external systems | [`system-context/banking-system.c4x`](./system-context/banking-system.c4x) |
| **Banking System** | PlantUML | Same banking system using PlantUML C4 syntax | [`system-context/banking-system.puml`](./system-context/banking-system.puml) |
| **E-commerce Platform** | C4X-DSL | Online store with payment, email, and shipping integrations | [`system-context/ecommerce-system.c4x`](./system-context/ecommerce-system.c4x) |
| **E-commerce Platform** | PlantUML | E-commerce with detailed external system descriptions | [`system-context/ecommerce-system.puml`](./system-context/ecommerce-system.puml) |
| **Microservices Platform** | C4X-DSL | Modern cloud-native platform with CDN, Auth, and APM | [`system-context/microservices-system.c4x`](./system-context/microservices-system.c4x) |
| **Multi-Agent Marketing** | C4X-DSL | AI-powered marketing system with LLM and agent orchestration | [`system-context/multi-agent-marketing.c4x`](./system-context/multi-agent-marketing.c4x) |
| **Text Scaling Showcase** | C4X-DSL | Demonstrates auto-scaling text with varying label lengths | [`system-context/text-scaling-showcase.c4x`](./system-context/text-scaling-showcase.c4x) |

### Level 2: Container Diagrams

Shows the high-level technology architecture - applications, databases, microservices.

| Sample | DSL Format | Description | File |
|--------|-----------|-------------|------|
| **Banking Containers** | PlantUML | Web app, SPA, mobile app, API, and database containers | [`container/banking-containers.puml`](./container/banking-containers.puml) |
| **E-commerce Containers** | C4X-DSL | Microservices architecture with API gateway and databases | [`container/ecommerce-containers.c4x`](./container/ecommerce-containers.c4x) |
| **Microservices Containers** | PlantUML | Complete microservices stack with gRPC, REST, and messaging | [`container/microservices-containers.puml`](./container/microservices-containers.puml) |
| **Multi-Agent Marketing** | C4X-DSL | Agent containers with orchestrator, specialized agents, and vector DB | [`container/multi-agent-marketing-containers.c4x`](./container/multi-agent-marketing-containers.c4x) |

### Level 3: Component Diagrams

Shows the internal structure of a container - components, dependencies, and interactions.

| Sample | DSL Format | Description | File |
|--------|-----------|-------------|------|
| **API Gateway Components** | C4X-DSL | Auth, routing, circuit breaker, rate limiting, and observability | [`component/api-gateway-components.c4x`](./component/api-gateway-components.c4x) |
| **API Gateway Components** | PlantUML | Detailed API gateway with middleware and service discovery | [`component/api-gateway-components.puml`](./component/api-gateway-components.puml) |
| **Agent Orchestrator** | C4X-DSL | AI agent orchestration with task planning and workflow engine | [`component/agent-orchestrator-components.c4x`](./component/agent-orchestrator-components.c4x) |

---

## 🎯 Use Cases and Examples

### For Traditional Web Applications

**Start here**: [`system-context/banking-system.c4x`](./system-context/banking-system.c4x)
**Then explore**: [`container/banking-containers.puml`](./container/banking-containers.puml)

Classic 3-tier architecture with web frontend, API, and database.

### For E-commerce and Online Stores

**Start here**: [`system-context/ecommerce-system.c4x`](./system-context/ecommerce-system.c4x)
**Then explore**: [`container/ecommerce-containers.c4x`](./container/ecommerce-containers.c4x)

Shows integration with payment gateways, email services, and shipping providers.

### For Microservices Architectures

**Start here**: [`system-context/microservices-system.c4x`](./system-context/microservices-system.c4x)
**Then explore**: [`container/microservices-containers.puml`](./container/microservices-containers.puml)
**Deep dive**: [`component/api-gateway-components.puml`](./component/api-gateway-components.puml)

Modern cloud-native architecture with API gateway, service mesh, and observability.

### For AI/Agent Systems

**Start here**: [`system-context/multi-agent-marketing.c4x`](./system-context/multi-agent-marketing.c4x)
**Then explore**: [`container/multi-agent-marketing-containers.c4x`](./container/multi-agent-marketing-containers.c4x)
**Deep dive**: [`component/agent-orchestrator-components.c4x`](./component/agent-orchestrator-components.c4x)

AI-powered system with LLM integration, agent orchestration, and vector databases.

---

## ✨ New in v1.0: Static Box Sizing & Auto-Scaling Text

All sample diagrams now showcase the new **static box sizing** feature that maintains consistent C4 Model standard dimensions:

### 📏 Box Size Standards

| Element Type | Dimensions | Example Sample |
|--------------|------------|----------------|
| **Person** | 160×120px | [`banking-system.c4x`](./system-context/banking-system.c4x) - Different user roles, same size |
| **Software System** | 200×140px | [`ecommerce-system.c4x`](./system-context/ecommerce-system.c4x) - Various system names, consistent boxes |
| **Container** | 180×130px | [`ecommerce-containers.c4x`](./container/ecommerce-containers.c4x) - Tech stacks auto-scale |
| **Component** | 160×110px | [`api-gateway-components.c4x`](./component/api-gateway-components.c4x) - Complex component names fit |

### 🔤 Text Auto-Scaling Demonstrations

**📋 Best Examples for Testing**:

- **[`text-scaling-showcase.c4x`](./system-context/text-scaling-showcase.c4x)** - Extreme test cases with very long names
- **[`multi-agent-marketing.c4x`](./system-context/multi-agent-marketing.c4x)** - AI system names of varying complexity
- **[`ecommerce-containers.c4x`](./container/ecommerce-containers.c4x)** - Technology stack labels that auto-scale

**🎯 Features Demonstrated**:

- Text scales down automatically when labels are too long
- Minimum 70% readability threshold maintained
- Multi-line relationship labels handled gracefully
- Consistent box sizes across all element types
- Professional appearance matching c4model.com standards

---

## 🤖 For AI Agents

**See**: [`AGENT.md`](../AGENT.md) - Comprehensive guide for AI agents generating C4 diagrams

### Quick Reference for Agents

**When user requests**:

- "Show system overview" → Use System Context examples
- "Show architecture" → Use Container examples
- "Show component structure" → Use Component examples

**DSL Format Selection**:

- New diagram → C4X-DSL (`.c4x`) - Fastest, simplest
- Existing PlantUML → PlantUML C4 (`.puml`) - 100% compatible, no Java
- User prefers Structurizr → `.dsl` - Experimental (58% support)

**Prompting Pattern**:

```
"I'll create a [Level] diagram similar to samples/[category]/[example-file].
This shows [what it demonstrates].
Open it in VS Code and press Ctrl+K V to preview."
```

---

## 📖 DSL Syntax Guides

### C4X-DSL Syntax

**Full reference**: [`docs/c4x-syntax.md`](../docs/c4x-syntax.md)

### Elements

```text
ElementID[Label<br/>Type<br/>Tags]
```

**Element types**: `Person`, `Software System`, `Container`, `Component`
**Tags**: `External`, `Internal`, technology tags

### PlantUML C4 Syntax

**Macros**:

- `Person(id, "Label", "Description")`
- `System(id, "Label", "Description")`
- `Container(id, "Label", "Tech", "Description")`
- `Component(id, "Label", "Tech", "Description")`

**Relationships**:

- `Rel(from, to, "Label", "Technology")`
- `Rel_Back(to, from, "Label")`
- `Rel_Neighbor(from, to, "Label")`

**Boundaries**:

- `System_Boundary(id, "Label") { ... }`
- `Container_Boundary(id, "Label") { ... }`

---

## 🎨 Themes

All diagrams support 5 built-in themes:

- **Classic** - Official C4 Model colors (Simon Brown specification)
- **Modern** - Vibrant colors with rounded corners
- **Muted** - Grayscale minimalist (professional docs)
- **High Contrast** - WCAG AAA compliant (accessibility)
- **Auto** - Adapts to VS Code light/dark theme

**Change theme**: Command Palette → `C4X: Change Theme`

---

## 📤 Export Options

All samples can be exported to:

- **SVG** - Vector format for editing (Figma, Sketch, Adobe Illustrator)
- **PNG** - Raster format for documentation and presentations

**Export commands**:

- `C4X: Export SVG`
- `C4X: Export PNG`
- `C4X: Copy SVG to Clipboard`

---

## 🚀 Performance

All samples render in **< 50ms** for typical diagrams:

| Metric | Performance |
|--------|-------------|
| C4X Parse | ~10ms |
| PlantUML Parse | ~6.5ms |
| Full Render | ~55ms |
| Preview Update | Real-time |

**Tested with**: 30-node diagrams (typical real-world size)

---

## 📋 Sample File Naming Convention

```
samples/
├── system-context/         # Level 1 - System Context
│   ├── {domain}-system.c4x
│   └── {domain}-system.puml
├── container/              # Level 2 - Container
│   ├── {domain}-containers.c4x
│   └── {domain}-containers.puml
└── component/              # Level 3 - Component
    ├── {container}-components.c4x
    └── {container}-components.puml
```

---

## 🤝 Contributing Samples

Want to add more examples? We'd love to see:

- Industry-specific examples (healthcare, finance, logistics)
- Cloud provider patterns (AWS, Azure, GCP)
- Modern architectures (event-driven, CQRS, serverless)
- Deployment patterns (blue-green, canary, rolling)

See [`CONTRIBUTING.md`](../CONTRIBUTING.md) for guidelines.

---

## 📚 Additional Resources

- **Extension README**: [`README.md`](../README.md) - Features and installation
- **Agent Guide**: [`AGENT.md`](../AGENT.md) - For AI-powered diagram generation
- **C4X Syntax**: [`docs/c4x-syntax.md`](../docs/c4x-syntax.md) - Complete syntax reference
- **PlantUML Compatibility**: [`docs/PLANTUML-C4-COMPATIBILITY.md`](../docs/PLANTUML-C4-COMPATIBILITY.md)
- **C4 Model Official**: [c4model.com](https://c4model.com/)

---

**Made with ❤️ for architects** | [Report Issues](https://github.com/jpantsjoha/c4model-vscode-extension/issues) | [Star on GitHub](https://github.com/jpantsjoha/c4model-vscode-extension)
