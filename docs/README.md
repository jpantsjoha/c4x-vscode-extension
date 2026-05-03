# C4X Extension -- Documentation Index

**Project**: C4X VS Code Extension -- Make C4 diagrams as easy as Mermaid
**Current Version**: v1.3.0
**Last Updated**: 2026-05-03

---

## Documentation Structure

```
docs/
├── README.md                         # This file -- documentation index
├── DECISIONS-SUMMARY.md              # All architectural decisions at a glance
├── ROADMAP.md                        # Product roadmap (shipped / committed / candidate)
├── TECHNICAL-DEBT.md                 # Known technical debt
│
├── adrs/                             # Architecture & Technical Decision Records
│   ├── TDR-001 ... TDR-016          # Technical decisions (build, parser, layout, etc.)
│   ├── 005, 011-017                  # Architecture decisions (security, AI, models)
│   └── README.md                     # ADR format guidelines
│
├── architecture/                     # System design
│   ├── high-level-design.md          # Extension Host + Webview pattern
│   └── tech-stack.md                 # Technology choices
│
├── c4model/                          # Official C4 model reference (from c4model.com)
│
├── User-facing docs:
│   ├── QUICK-START.md                # Getting started guide
│   ├── USER-GUIDE.md                 # Full user guide
│   ├── FAQ.md                        # Frequently asked questions
│   ├── TROUBLESHOOTING.md            # Common issues and fixes
│   ├── GEMINI_GUIDE.md               # Gemini AI integration guide
│   ├── DIAGRAM-WITH-GEMINI-IMAGE.md  # Visual PNG generation guide
│   ├── c4x-syntax.md                 # C4X DSL syntax reference
│   ├── ICONS.md                      # Icon/sprite reference
│   ├── EXAMPLES*.md                  # Syntax examples (layout, ordering, PlantUML, icons)
│   ├── C4X-ELEMENT-TYPES.md          # Valid element types
│   └── C4X-GENERATION-GUIDELINES.md  # AI generation guidelines
│
├── maintenance/                      # Internal sync & publishing procedures
│   ├── PUBLIC-REPO-SYNC.md           # Private-to-public sync procedure
│   └── PUBLIC-SYNC-PLAN.md           # Sync plan details
│
├── marketplace/                      # VS Code Marketplace assets & strategy
│
├── prompts/                          # Externalized AI prompt files
│
├── validation/                       # Visual validation gallery
│   └── GALLERY.md
│
├── Tools/                            # Development tooling docs
│   ├── e2e-mcp.md                    # MCP end-to-end testing
│   └── VSCODE-SMOKE-TEST.md          # VS Code smoke test procedure
│
└── archive/                          # Historical documentation (read-only)
    ├── PHASE-HISTORY.md              # Summary of all 12 development phases
    ├── phases/                       # Full phase 0-11 build logs
    ├── analysis/                     # Pre-v1.0 styling analysis
    ├── examples/                     # Legacy example files
    ├── legacy/                       # Original planning docs
    └── root-legacy/                  # Archived root-level files
```

---

## Quick Navigation

### For New Contributors

1. [Root README](../README.md) -- project overview, features, installation
2. [Decisions Summary](./DECISIONS-SUMMARY.md) -- all architectural choices at a glance
3. [Architecture](./architecture/README.md) -- Extension Host + Webview pattern
4. [ADRs](./adrs/README.md) -- detailed decision rationale

### For Developers

1. [Architecture](./architecture/high-level-design.md) -- system design
2. [Tech Stack](./architecture/tech-stack.md) -- technology choices
3. [ADRs](./adrs/) -- all TDR and ADR records
4. [AI Prompts](./prompts/) -- externalized Gemini prompts

### For Users

1. [Quick Start](./QUICK-START.md) -- get diagramming in 2 minutes
2. [User Guide](./USER-GUIDE.md) -- comprehensive feature walkthrough
3. [C4X Syntax](./c4x-syntax.md) -- DSL reference
4. [Gemini Guide](./GEMINI_GUIDE.md) -- AI-powered diagram generation
5. [FAQ](./FAQ.md) and [Troubleshooting](./TROUBLESHOOTING.md)

### For Project Planning

1. [ROADMAP.md](./ROADMAP.md) -- shipped, committed, and candidate features
2. [CHANGELOG.md](../CHANGELOG.md) -- user-facing release notes

---

## Archive

Historical documentation from the 12-phase development cycle (Oct 2025 -- Mar 2026)
has been archived to `docs/archive/`. See [PHASE-HISTORY.md](./archive/PHASE-HISTORY.md)
for a summary.

Archived root-level files (ABOUT.md, RELEASE.md, GEMINI_CONTEXT.md, publish-vsce.md,
testing.md, LINKEDIN-ANNOUNCEMENT.md) are in `docs/archive/root-legacy/`.

---

**Last Audit**: 2026-05-03 (documentation cleanup and restructuring)
