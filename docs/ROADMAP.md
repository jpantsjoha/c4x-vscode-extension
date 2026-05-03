# C4X Product Roadmap

> **Vision**: *C4X makes architecture diagrams as easy as Mermaid, native to Markdown, and intelligently AI-augmented through Gemini.*
>
> **Philosophy**: Docs-as-code. Stateless. Deterministic. Embedded in the developer's existing flow. AI assists; the developer authors.
>
> **Last revised**: 2026-05-03 (post-SWOT roadmap reset)
>
> **Strategic lens**: Features are prioritised by: unique AI differentiation, developer adoption, and enterprise readiness.

---

## How to read this roadmap

- **Shipped** = in a released version on the marketplace
- **Committed** = scoped, owner-assigned, in the next named version
- **Candidate** = directionally agreed but not yet scoped or scheduled
- **Deferred** = previously planned, explicitly deprioritised with rationale
- **Out of scope** = explicit non-goals -- recorded so we stop revisiting them

See the [CHANGELOG](../CHANGELOG.md) for detailed release notes.

---

## Shipped

### Foundation & Core (2025)
- C4 syntax parser (Person, System, Container, Component, Deployment partial)
- Markdown integration via ` ```c4x ` code blocks
- Theming (Classic / Modern / Muted / High Contrast / Auto)
- C4-PlantUML legacy macro compatibility
- Cloud icons (AWS, Azure, GCP, generic tech) -- 1500+ sprites with IntelliSense
- Advanced layout (padding, nested nodes, label legibility, smart direction)
- Sequence-style dynamic diagrams
- Embedded gallery and visual examples

### v1.1.0 -- Intelligent Assistance (2025-12)
- Text-to-diagram via Gemini ("Generate a C4 System Context for X")
- Code-to-diagram (workspace-aware file scanning)
- Layout heuristics and `FORCE LAYOUT` override directive
- Self-correction: parser-validated retry loop (up to 3 attempts)

### v1.2.x -- Visual Generation (2025-12 to 2026-02)
- PNG generation from text selections via Gemini image models
- Multi-framework auto-detection (C4 / Sequence / Flowchart)
- Visual grounding: multimodal prompts with reference PNG images
- MCP C4X Validator server (`validate_c4x` tool + `c4x://guidelines` resources)
- Visual customization: 5 presets, 3 layout preferences, custom grounding context

### v1.3.0 -- Gemini 3.1 Migration (2026-03-02)
- Gemini 3.1 Pro Preview as primary; Nano Banana 2 default for images
- User-configurable `c4x.ai.model` and `c4x.ai.imageModel` (free-text, future-proof)
- Smart fallback chain with sunset-safe defaults
- 113 validated example diagrams

### v1.4.0 -- Stability & Trust (2026-05-03)
- **PNG export**: Canvas-based at 1x/2x/4x resolution (no Chromium dependency)
- **Export SVG / Copy SVG / Change Theme**: fully functional (were stubs)
- **Auto-layout direction**: LR for <=4 elements, TB for 5+
- **Runtime model validation (G3)**: warns on unrecognised model IDs at activation
- **Sunset alerting (G4)**: 30-day-prior toast with migration guidance
- **Visual self-remediation**: failed image generation retries with corrective prompt
- **C4 level-specific visual guidelines**: C1/C2/C3 produce visually distinct outputs
- **GeminiService decomposition**: 767 to 293 LOC (PromptBuilder, FallbackStrategy, SyntaxValidator, models.ts)
- **398 unit tests** (parser 94%, model 98% coverage); visual snapshot regression tests
- **Default model changed**: `gemini-3-flash-preview` (free tier) with `gemini-3.1-pro-preview` failover
- **Critical bug fix**: Markdown preview glitch (DiagnosticsManager vs virtual documents)
- **24 architecture pattern examples**: CQRS, saga, BFF, hexagonal, IoT, CI/CD, and more
- **Dependency cleanup**: Removed Playwright/elkjs from production bundle

---

## Committed -- v1.4.1 "Polish & Sync" (target: May 2026, ~2 weeks)

**Theme**: Land v1.4.0 on the marketplace. Fix anything that blocks a confident demo.

### Public release gate
- **Publish to VS Code Marketplace**
- **Pre-publish validation**: verify marketplace listing and VSIX integrity
- **Verify marketplace listing**: screenshots, description, and version match v1.4.0

### Demo-blocking fixes
- **Fix "PDF Export" command label**: rename `exportPdf` to "C4X: Print Preview" or implement real PDF generation. The current "Export - Preview" label misleads users
- **Remove PlantUML from feature claims**: README currently lists "PlantUML Support" under v1.1.0 but it is disabled (DEBT-009). Either re-enable or remove the claim
- **Deployment View honesty**: remove "Deployment Diagrams" from roadmap claims until DeploymentNode parsing has tests and a working sample

### Documentation
- **Update documentation** with current model registry, v1.4.0 features
- **Sync README version references** to v1.4.0 state (some sections still reference v1.3.0 features as "new")

### Quality
- **DEBT-011 completion**: remaining legacy test noise triage (2 re-enabled, 3 deleted, 1 quarantined in v1.4.0; finish the rest)
- **Integration test for fallback strategy**: at minimum, a mock-API test that exercises the primary -> fallback -> error path end-to-end

---

## Committed -- v1.5.0 "Copilot Chat & Import Bridge" (target: Q3 2026)

**Theme**: Make C4X discoverable to every VS Code user through Copilot Chat integration, and lower the adoption barrier with Mermaid import.

> This version pivots from the previous "Diagram Authoring" theme. The SWOT analysis shows that C4X's biggest opportunity (O1) is Copilot Chat integration, and the biggest adoption barrier is that users already have diagrams in Mermaid. v1.5 addresses both.

### Copilot Chat participant (`@c4x`) -- HIGH PRIORITY
- Register as a VS Code Chat Participant with the `@c4x` handle
- Support intents: `@c4x describe this repo`, `@c4x generate a C2 for <system>`, `@c4x explain this diagram`
- Delegate generation to the existing Gemini pipeline (PromptBuilder + FallbackStrategy + SyntaxValidator)
- Render diagrams inline in the Chat panel using the existing SVG renderer
- **GDE demo value**: "Ask Copilot about your architecture and get a rendered C4 diagram in the chat"

### Mermaid import bridge -- HIGH PRIORITY
- New command: `C4X: Import from Mermaid`
- Uses Gemini to translate Mermaid `graph` and `flowchart` syntax into valid C4X DSL
- Validates the output through the existing parser + self-correction loop
- **GDE demo value**: "Bring your existing Mermaid diagrams into the C4 model world"
- **Adoption value**: Lowers barrier for teams with existing Mermaid documentation

### Structurizr DSL import
- New command: `C4X: Import from Structurizr DSL`
- Parse `.dsl` files and convert to C4X syntax (Gemini-assisted for complex cases)
- DEBT-008: Grammar overhaul for string identifiers (parser enhancement, not just AI translation)

### Layout engine upgrade
- **ELK evaluation spike** (TDR-003 escalation): evaluate elkjs as a Dagre replacement for hierarchical nested boundaries
- If ELK proves viable: swap layout engine behind the existing API surface
- If not: document the ceiling and add manual override escape hatches

### Quality
- **Custom local sprites**: `$sprite="./my-icon.png"` path resolution
- **Live validation**: error squiggles for invalid relationships and syntax (semantic, not just lexical)
- **Reference images for Flowchart & Sequence**: close the visual-consistency gap

---

## Committed -- v2.0.0 "Enterprise & Intelligence" (target: Q1 2027)

**Theme**: Cross the chasm from individual-developer tool to team/enterprise tool. Add architecture intelligence that goes beyond diagram generation.

> The v2.0 scope is narrowed compared to the previous roadmap. Multi-provider AI is **deferred** (see Deferred section). The focus is Vertex AI enterprise integration and architecture analysis -- the two features that only a GDE with Gemini access can credibly build and demo.

### Vertex AI enterprise integration -- FLAGSHIP
- **Settings**: `c4x.ai.vertexProject`, `c4x.ai.vertexLocation`, `c4x.ai.vertexEndpoint`
- **Auth**: service account JSON, ADC (Application Default Credentials), and Workload Identity Federation
- **Compliance**: zero-data-retention guarantees, regional model pinning
- **Billing**: usage attribution through existing GCP billing
- **GDE demo value**: "Architecture intelligence that stays in your VPC"

### Architecture analysis & critique mode -- FLAGSHIP
- **Read-and-critique**: Gemini reads an existing C4X diagram and suggests improvements
- **Bottleneck detection**: "Your API gateway is a single point of failure"
- **Pattern matching**: "Consider separating read and write databases (CQRS)"
- **Convention checking**: validate diagrams against team-defined ADRs/conventions
- **GDE demo value**: "AI that reviews your architecture, not just generates it"

### Context caching for cost reduction
- Use Gemini's context caching API for repeat-generation scenarios
- Cache workspace file context between generation requests
- Show cost reduction metrics in the output channel

### Batch API for multi-diagram generation
- "Generate all C4 levels (C1 + C2 + C3) for this system" as a single command
- Uses Gemini batch API to reduce latency and cost

### Agent syntax
- First-class C4X support for `AI_Agent`, `Memory`, `Tool` element types
- Extends the C4 vocabulary for the AI-native architecture era

### Telemetry & analytics (opt-in)
- Anonymous usage metrics: feature usage, error rates, model selection distribution
- Cost forecasting: estimated Gemini API spend based on usage patterns

---

## Deferred (with rationale)

### Multi-provider AI (Claude, OpenAI alongside Gemini)
**Previously**: v2.0.0.
**Deferred to**: v2.x or community contribution.
**Rationale**: C4X's unique value is deep Gemini integration, not provider breadth. Adding Claude/OpenAI would dilute the GDE story, require a provider-pluggable abstraction layer (significant refactoring), and compete with tools that already do "AI + diagrams" with OpenAI (e.g., ChatGPT plugins). The Gemini-exclusive positioning is a strength, not a weakness.

### PlantUML rendering re-enable (DEBT-009)
**Previously**: v1.5.0.
**Deferred to**: v2.x or community contribution.
**Rationale**: PlantUML rendering was disabled due to visual verification complexity. The adoption value is low -- users with PlantUML diagrams can use the existing PlantUML extensions. The Mermaid import bridge (v1.5) addresses the more common migration path.

### Deployment View completion
**Previously**: v1.5.0.
**Deferred to**: v2.x.
**Rationale**: DeploymentNode parsing is partial and untested. Completing it requires parser grammar work, visual generation prompts, reference images, and test coverage. The effort is high relative to user demand. Revisit when Kubernetes/Terraform diagram generation becomes a stated user need.

### Refactoring tools ("Rename System")
**Previously**: v1.5.0.
**Deferred to**: v2.x.
**Rationale**: Workspace-wide refactoring is a significant feature that requires a Language Server Protocol (LSP) implementation. The effort is disproportionate to the current user base. Focus v1.5 engineering time on Copilot Chat integration.

### AI determinism / "Loose Mode" toggle (DEBT-010)
**Previously**: v1.5 (monitor).
**Deferred to**: demand-driven.
**Rationale**: No user pain signals have been reported. The self-correction loop already handles most non-determinism. Monitor; do not build.

### A11y & compliance agent
**Previously**: v2.0.0.
**Deferred to**: pre-EU launch (when there is a concrete compliance deadline).
**Rationale**: WCAG 2.1 AA and GDPR/CCPA review are important but not blocking for current adoption. Sequence when an EU enterprise customer or a compliance audit creates urgency.

---

## Out of scope (explicit non-goals)

- **Standalone editor GUI** -- drag-and-drop conflicts with docs-as-code; would fragment the syntax-as-source-of-truth contract
- **Standalone `.c4x` files as primary surface** -- supported, but the Markdown-embedded path is the headline UX
- **Stateful diagrams** -- every diagram is a deterministic function of its source text; no hidden state, no migrations
- **Localisation** -- defer until a non-English market becomes a stated business goal
- **Provider-agnostic AI abstraction** -- C4X is a Gemini product. See Deferred section for rationale

---

## Risk register (long-running)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| GitHub Copilot adds native diagram generation | MEDIUM | HIGH | Ship `@c4x` Chat Participant in v1.5 before Copilot does it generically. C4 model discipline is the moat |
| Gemini model sunset blindsides users | MEDIUM | HIGH | Sunset alerting shipped in v1.4; free-text model IDs for easy migration |
| Mermaid.js adds AI generation | LOW-MEDIUM | HIGH | Mermaid import bridge (v1.5) makes C4X the "upgrade path." C4-specific validation is the differentiator |
| Google builds architecture diagramming into Cloud Console + Gemini | LOW | MEDIUM | C4X is docs-as-code, not a GUI. Different audience. Position as "the developer's choice" |
| Model churn fatigue erodes user trust | MEDIUM | MEDIUM | FallbackStrategy + sunset alerts + free-text IDs already mitigate. Add automated model-availability check in v1.5 |
| Dagre layout limit blocks complex enterprise diagrams | MEDIUM | HIGH | v1.5: ELK evaluation spike (TDR-003 escalation) |
| Low marketplace install count limits discovery | MEDIUM | MEDIUM | GDE talk circuit, MCP server as standalone npm, SEO keywords, "Diagram of the Week" social |
| Test coverage gap masks regressions | LOW (today) | MEDIUM | 398 unit tests shipped; integration test stubs need filling in v1.4.1 |

---

## Key design decisions

- **Dagre over ELK** -- Dagre selected for simplicity; ELK evaluation deferred to v1.5 spike
- **Mermaid-inspired syntax** -- Accept friction for shorter learning curve vs custom DSL
- **Gemini-exclusive AI** -- Deep integration over provider breadth; C4 model discipline is the moat
- **SWOT-2026-05 roadmap reset** -- Copilot Chat and Mermaid import elevated to v1.5; multi-provider AI deferred; Vertex AI and architecture critique are v2.0 flagships

---

## Milestone summary

| Version | Theme | Target | Key deliverables |
|---|---|---|---|
| **v1.4.1** | Polish & Publish | May 2026 | Marketplace publishing, README honesty, legacy test triage |
| **v1.5.0** | Copilot Chat & Import Bridge | Q3 2026 | `@c4x` Chat Participant, Mermaid import, Structurizr DSL import, ELK spike |
| **v2.0.0** | Enterprise & Intelligence | Q1 2027 | Vertex AI integration, architecture critique mode, context caching, batch API, agent syntax |
