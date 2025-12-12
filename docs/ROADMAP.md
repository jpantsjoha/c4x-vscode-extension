# 🗺️ Product Roadmap

> **Core Philosophy**: **"As easy as Mermaid, native to Markdown."**
> The goal is to make C4 architecture diagrams a natural part of technical documentation, not a separate artifact to manage.

## ✅ Completed Milestones

### Phase 1-7: Foundation & Core
- ✅ **Parser**: Robust parsing of C4 syntax (Person, System, Container, etc.).
- ✅ **Markdown Integration**: Seamless embedding via ` ```c4x ` code blocks.
- ✅ **Theming**: Classic, Modern, and Dark mode support.
- ✅ **PlantUML Compat**: Support for legacy C4-PlantUML syntax macros.

### Phase 8: Advanced Visuals & Layout
- ✅ **Cloud Icons**: AWS, Azure, GCP, and Tech Stack icons.
- ✅ **Advanced Layout**: Better padding, nested nodes, and label legibility.
- ✅ **Dynamic Diagrams**: Sequence-like flows.
- ✅ **Gallery**: Visual examples embedded in documentation.

---

## 🚀 Upcoming Phases

### Phase 9: Intelligent Assistance (Completed)
- ✅ **Text-to-Diagram**: "Generate a C4 System Context for a Banking App" (Shipped v1.1.0).
- ✅ **Code-to-Diagram**: Analyze workspace files to suggest structures.
- ✅ **Layout Guidance**: Smart heuristics for diagram size.
- ✅ **Visual Control**: `FORCE LAYOUT` override.

### Phase 10: Polish & Future Proofing (Planned q1 2026)
**Goal**: Maintenance, stability, and refining user experience.
- [ ] **Legacy Test Cleanup**: Clean up old Phase 8 PlantUML tests responsible for CI noise.
- [ ] **Layout Adherence 2.0**: Revisit heuristics for small diagrams. Address vertical-default frustration for simple 3-4 node flows to prevent "super-scaling" issues.
- [ ] **Visual Size Override**: Support `width` and `scale` attributes.

### Phase 11: Intelligent Authoring (Markdown Focused)
**Goal**: Make writing C4X manually even faster.
- [ ] **Smart Snippets**: Context-aware autocompletion for C4 elements.
- [ ] **Live Validation**: Error squiggles for invalid relationships or syntax.
- [ ] **Refactoring Tools**: "Rename System" command that updates all Markdown files.

### 🔮 Future Concepts (Under Consideration)
- **Export Automation**: CI/CD hooks to generate PNGs from Markdown files automatically.
- **Hyperlinking**: Clickable elements in diagrams that jump to code definitions.

---

## 🚫 Deprecated / Out of Scope
- **Standalone Editor GUI**: We are avoiding drag-and-drop GUIs to keep the "Docs-as-Code" philosophy.
- **Standalone .c4x files**: While supported, the primary focus is embedded Markdown blocks.
- **Complex State Management**: Diagrams should be stateless and deterministic based on text.
