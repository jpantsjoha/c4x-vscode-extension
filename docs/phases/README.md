# C4X Extension - Development Phases

**Project**: C4X VS Code Extension - Make C4 diagrams as easy as Mermaid
**Last Updated**: 2025-10-19

---

## 📚 Phase Overview

This folder contains the development phases for the C4X extension, organized into 7 phases from planning to production release.

```
phases/
├── README.md (this file)               # Phase overview and structure
├── phase-0-planning/                   # Phase 0: Planning (COMPLETE)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
├── phase-1-scaffolding/                # M0: Scaffolding (Week 1)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
├── phase-2-c4x-dsl-mvp/                # M1: C4X-DSL MVP (Week 2)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
├── phase-3-markdown-integration/       # M2: Markdown Integration (Week 3)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
├── phase-4-structurizr-dsl/            # M3: Structurizr DSL (Week 4)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
├── phase-5-plantuml-c4/                # M4: PlantUML C4 (Week 5)
│   ├── README.md                       # Phase directive
│   └── activities/                     # Individual tasks/epics
└── phase-6-polish-qa/                  # M5: Polish & QA (Week 6)
    ├── README.md                       # Phase directive
    └── activities/                     # Individual tasks/epics
```

---

## 🎯 Phase Structure

Each phase follows this structure:

### Phase README.md
**Purpose**: High-level directive for the phase

**Contents**:
- Phase goals and objectives
- Deliverables
- Success criteria
- Timeline and dependencies
- User stories
- Reference to activities

### activities/ Folder
**Purpose**: Detailed task breakdowns and epics

**Contents**:
- Individual markdown files for each task/epic
- Implementation details
- Acceptance criteria
- Code examples
- Testing requirements

---

## 📅 Phase Timeline

```
October 2025        November 2025           December 2025
|-------|-------|-------|-------|-------|-------|
 P0 ✅   M0      M1      M2      M3      M4      M5
Oct13-19 Oct21-25 Oct28-  Nov4-10 Nov11-17 Nov18-24 Nov25-
                  Nov3                              Dec1
```

**Critical Path**: M0 → M1 → M2 → M5
**Parallel Work**: M3 and M4 can run in parallel (both are parsers)

---

## 🚀 Phase Summaries

### Phase 0: Planning ✅ **COMPLETE**
**Status**: ✅ 100% Complete
**Duration**: October 13-19, 2025 (1 week)

**Goal**: Establish project vision, architecture, and execution plan

**Key Deliverables**:
- ✅ Comprehensive documentation (120KB, 10+ files)
- ✅ Autonomous agent team (5 agents)
- ✅ Technical decisions (11 TDRs)
- ✅ 6-week execution plan (M0-M5)

**See**: [phase-0-planning/README.md](./phase-0-planning/README.md)

---

### Phase 1: v0.1.0 - M0 Scaffolding 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of October 21-25, 2025 (5 days)

**Goal**: Establish project foundation and development infrastructure

**Key Deliverables**:
- [ ] Git repository initialized
- [ ] Extension skeleton (Hello Webview)
- [ ] Testing infrastructure (Mocha + @vscode/test-electron)
- [ ] CI/CD pipeline (GitHub Actions)

**Success Criteria**:
- ✅ Extension activates in < 200ms
- ✅ CI pipeline passes on push
- ✅ "Hello Webview" demo works

**See**: [phase-1-scaffolding/README.md](./phase-1-scaffolding/README.md)

---

### Phase 2: v0.2.0 - M1 C4X-DSL MVP 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of October 28 - November 3, 2025 (7 days)

**Goal**: Implement core C4X-DSL parser, layout, and preview

**Key Deliverables**:
- [ ] PEG.js parser for Mermaid-inspired C4X syntax
- [ ] Intermediate Representation (IR) for C4 Model
- [ ] Dagre.js layout engine integration
- [ ] SVG renderer (basic, no themes yet)
- [ ] Webview preview panel

**Success Criteria**:
- ✅ Can parse C1 diagram (Person, System, Rel)
- ✅ Preview renders in < 250ms (30-node diagram)
- ✅ Live updates work (< 500ms latency)

**User Story**:
> "As an architect, I can write a C4 System Context diagram in `.c4x` file, press `Ctrl+K V`, and see instant preview."

**See**: [phase-2-c4x-dsl-mvp/README.md](./phase-2-c4x-dsl-mvp/README.md)

---

### Phase 3: v0.3.0 - M2 Markdown Integration 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of November 4-10, 2025 (7 days)

**Goal**: Integrate C4X into Markdown, add themes and export

**Key Deliverables**:
- [ ] MarkdownIt plugin for ` ```c4x ` fenced blocks
- [ ] Inline SVG rendering in Markdown preview
- [ ] Themes (Classic, Modern, Muted, High-Contrast, Auto)
- [ ] Export SVG/PNG commands

**Success Criteria**:
- ✅ ` ```c4x ` blocks render in Markdown preview
- ✅ Themes switch instantly (< 100ms)
- ✅ SVG export preserves quality

**User Story**:
> "As a technical writer, I can embed C4 diagrams in README.md using ` ```c4x ` fenced blocks, just like Mermaid."

**See**: [phase-3-markdown-integration/README.md](./phase-3-markdown-integration/README.md)

---

### Phase 4: v0.4.0 - M3 Structurizr DSL 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of November 11-17, 2025 (7 days)

**Goal**: Support Structurizr DSL (subset) for enterprise adoption

**Key Deliverables**:
- [ ] Structurizr DSL parser (hand-rolled)
- [ ] Map Structurizr elements → C4X IR
- [ ] Compatibility matrix documentation

**Success Criteria**:
- ✅ Can parse basic Structurizr DSL files
- ✅ 80% coverage of common Structurizr features
- ✅ Unsupported features show warnings (not errors)

**User Story**:
> "As an enterprise architect, I can open my existing Structurizr `.dsl` files in VS Code and see instant preview."

**See**: [phase-4-structurizr-dsl/README.md](./phase-4-structurizr-dsl/README.md)

---

### Phase 5: v0.5.0 - M4 PlantUML C4 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of November 18-24, 2025 (7 days)

**Goal**: Support PlantUML C4 (subset) for PlantUML users

**Key Deliverables**:
- [ ] PlantUML C4 parser (regex + state machine)
- [ ] Support C4-PlantUML macros (Person, System, Container, Rel)
- [ ] Compatibility matrix documentation

**Success Criteria**:
- ✅ Can parse C4-PlantUML macros
- ✅ 70% coverage of PlantUML C4 features
- ✅ Best-effort parsing (ignore unsupported macros)

**User Story**:
> "As a PlantUML user, I can preview my C4-PlantUML `.puml` files in VS Code without Java."

**See**: [phase-5-plantuml-c4/README.md](./phase-5-plantuml-c4/README.md)

---

### Phase 6: v1.0.0 - M5 Polish & Publish 🔴 **NOT STARTED**
**Status**: 🔴 0%
**Target**: Week of November 25 - December 1, 2025 (7 days)

**Goal**: Production-ready extension, publish to VS Code Marketplace

**Key Deliverables**:
- [ ] Diagnostics panel (parse errors with line/column)
- [ ] Built-in templates (C1, C2, C3 boilerplate)
- [ ] Performance optimization
- [ ] Security audit (npm audit + Snyk)
- [ ] Marketplace assets (icon, screenshots, demo GIF)

**Success Criteria**:
- ✅ All tests passing (> 80% coverage)
- ✅ Zero critical bugs
- ✅ Performance targets met
- ✅ Extension published on Marketplace

**See**: [phase-6-polish-qa/README.md](./phase-6-polish-qa/README.md)

---

## 🎯 Success Metrics (All Phases)

### Technical Metrics
- ✅ Activation time: < 200ms
- ✅ Preview render: < 250ms (30 nodes)
- ✅ Memory baseline: < 50MB
- ✅ Bundle size: < 1MB
- ✅ Test coverage: > 80%

### Business Metrics
- 📈 100+ alpha installs (week 1)
- 📈 1,000+ installs (3 months)
- 📈 4.5+ star rating
- 📈 Zero critical bugs at launch

### User Satisfaction
- 📈 "Very satisfied" users: > 70%
- 📈 Net Promoter Score (NPS): > 50
- 📈 Learning curve: < 10 minutes (Mermaid users)

---

## 📊 Dependency Map

```
Phase 0 (Planning)
    ↓
Phase 1 (M0 Scaffolding)
    ↓
Phase 2 (M1 C4X-DSL MVP)
    ↓
Phase 3 (M2 Markdown)
    ↓
    ├─→ Phase 4 (M3 Structurizr) ──┐
    └─→ Phase 5 (M4 PlantUML)   ──┤
                                   ↓
                        Phase 6 (M5 Polish & Publish)
```

**Critical Path**: P0 → M0 → M1 → M2 → M5
**Parallel Work**: M3 and M4 can run in parallel (both are dialect parsers)

---

## 🔄 Phase Workflow

### Start of Phase
1. **Review phase directive** (phase-X/README.md)
2. **Review activities** (phase-X/activities/*.md)
3. **Set up environment** (if needed)
4. **Create GitHub milestone** (e.g., "M0 Scaffolding")
5. **Kick off with agent sync**

### During Phase
1. **Work through activities** one by one
2. **Track progress** in GitHub issues
3. **Update STATUS.md** weekly
4. **Run quality checks** (tests, linting, performance)
5. **Document decisions** (create ADRs if needed)

### End of Phase
1. **Validate success criteria** (all checkboxes ✅)
2. **Run milestone validation** (`/validate-milestone`)
3. **Update STATUS.md** (mark phase complete)
4. **Update ROADMAP.md** (adjust if needed)
5. **Review technical debt** (add to TECHNICAL-DEBT.md)
6. **Tag release** (e.g., `v0.1.0`)
7. **Agent sync** (retrospective + next phase planning)

---

## 📞 Questions or Suggestions?

### Product Owner
**Agent**: POCA (Product Owner Agent)
**Commands**: `/validate-milestone`, `/plan-feature`
**See**: [../.claude/agents/product-owner.md](../../.claude/agents/product-owner.md)

### Code Review
**Agent**: Code Review Agent (VSCode Extension Expert)
**Commands**: `/review-code`, `/check-performance`
**See**: [../.claude/agents/code-reviewer.md](../../.claude/agents/code-reviewer.md)

### Quality Assurance
**Agent**: QA Validator Agent
**See**: [../.claude/agents/qa-validator.md](../../.claude/agents/qa-validator.md)

### Documentation
**Agent**: Documentation Agent (DOCA)
**See**: [../.claude/agents/documentation.md](../../.claude/agents/documentation.md)

---

**Maintained By**: Product Owner Agent (POCA)
**Review Schedule**: End of each phase
**Last Review**: 2025-10-19 (Phase 0 complete)
