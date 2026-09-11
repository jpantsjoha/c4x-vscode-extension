# C4X Extension - Technical Debt Tracker

**Project**: C4X VS Code Extension
**Last Updated**: 2025-12-01
**Overall Quality**: ✅ **EXCELLENT**

---

## ✅ RESOLVED: Critical Issues (v1.0)

| Issue | Resolution | Status |
|-------|------------|--------|
| **Visual Quality** | Implemented white-fill/colored-border style, fixed arrows | ✅ FIXED |
| **Arrow Routing** | Removed opposing-edge penalty, implemented geometric bias | ✅ FIXED |
| **Validation** | Added automated visual validation gallery | ✅ FIXED |
| **Syntax Errors** | Added real-time diagnostics (DiagnosticsManager) | ✅ FIXED |

---

## ⚠️ Current Technical Debt

### Medium Priority (Defer to v1.1 / v1.2)

#### [DEBT-001] Markdown Integration Deferred

- **Context**: MarkdownIt plugin is synchronous, layout is async.
- **Plan**: Implement async rendering wrapper in v1.1.
- **Impact**: Users must use `.c4x` files for now (documented).

#### [DEBT-008] Structurizr Parser Experimental

- **Context**: Grammar issues with string identifiers.
- **Plan**: Overhaul parser grammar in v1.2.
- **Impact**: Complex Structurizr files may fail (documented).

#### [DEBT-009] PlantUML Support Disabled

- **Context**: Parser logic is complete (100% tests), but visual verification requires external tools not currently available.
- **Plan**: Re-enable and verify visual parity in v1.2.
- **Impact**: Users cannot open `.puml` files in v1.0.

#### [DEBT-010] AI Model Determinism

- **Context**: The "Smart Layout" and "Entity Detection" relies on LLM heuristics. While `FORCE LAYOUT` improved consistency, edge cases (like abstract "Visual" nodes) may still be filtered out by strict C4 rules.
- **Plan**: Monitor feedback. Consider a "Loose Mode" in v1.2 if strictness frustrates users.
- **Impact**: Rare dropping of non-standard nodes.

#### [DEBT-011] Legacy Test Suite Noise

- **Context**: `npm test` runs all suites, but 48 legacy tests (PlantUML/Phase 8) are currently failing/skipped, creating noise during CI.
- **Plan**: Segregate test suites or fix Phase 8 in next sprint.
- **Impact**: Harder to spot *new* regressions amidst old noise.

---

## 🔮 Future Debt (Anticipated)

- **Performance**: As diagram complexity grows (100+ nodes), Dagre layout may need optimization or replacement with ELK.
- **Web Assembly**: Moving parsers to WASM for web-based VS Code (future proofing).

---

**Status**: Healthy. No blocking debt for current release.
