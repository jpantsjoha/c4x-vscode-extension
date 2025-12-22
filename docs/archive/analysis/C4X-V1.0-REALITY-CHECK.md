# C4X v1.0 - Reality Check & Critical Issues
> Snapshot (2025-10-23): Historical analysis of documentation vs implementation. Current repository baseline is M0 scaffolding; for live status and decisions see `docs/STATUS.md` and `docs/ROADMAP.md`.

**Date**: October 23, 2025
**Status**: 🔴 **CRITICAL - Documentation/Implementation Mismatch**

---

## 🚨 Critical Issues Discovered

### Issue #1: `subgraph` (Boundaries) NOT Supported
**Severity**: CRITICAL
**Impact**: All Container (C2) and Component (C3) examples are BROKEN

**What docs/examples claim**:
```c4x
subgraph "E-commerce System"
    WebApp[Web App<br/>Container]
    API[API<br/>Container]
end
```

**Reality**: Parser grammar does NOT have `subgraph`/`boundary` rules!

**Parser only has**:
- `Start`
- `Directive` (`%%{ c4: ... }%%`)
- `GraphKeyword` (`graph`)
- `Direction` (`TB`, `BT`, `LR`, `RL`)
- `Element` (node declarations)
- `Relationship` (edges)

**NO**:
- `Subgraph`
- `Boundary`
- `Container_Boundary`
- `System_Boundary`

**Broken files**:
- ❌ `docs/EXAMPLES.md` - Container example (PARTIALLY FIXED)
- ❌ `docs/examples/ecommerce-container.c4x`
- ❌ `docs/c4x-syntax.md` - Lines 174-202 (Boundaries section)
- ❌ `samples/container/ecommerce-containers.c4x`
- ❌ `samples/container/multi-agent-marketing-containers.c4x`
- ❌ `samples/component/*.c4x` (all 3 files)

---

### Issue #2: `graph TD` NOT Supported
**Severity**: HIGH
**Impact**: Parser error on any file using `TD`

**What docs claim**: `TD` (Top Down) is supported as alias for `TB`

**Reality**: Parser only accepts:
```typescript
Direction = "TB" / "BT" / "LR" / "RL"
```

**Fixed files** (committed ab651a9):
- ✅ `docs/EXAMPLES.md`
- ✅ `docs/c4x-syntax.md`
- ✅ `docs/examples/ecommerce-container.c4x`
- ✅ `samples/container/ecommerce-containers.c4x`
- ✅ `samples/container/multi-agent-marketing-containers.c4x`

---

### Issue #3: SVG Label Rendering Bug
**Severity**: HIGH
**Impact**: Relationship labels render character-by-character (garbled)

**Example**:
```
Expected: "Views products, places orders"
Rendered: ",V,i,e,w,s, ,p,r,o,d,u,c,t,s,"
```

**Location**: `src/render/SvgBuilder.ts:153`
```typescript
${edge.relationship.label ? `<text ...>${edge.relationship.label}</text>` : ''}
```

**Status**: NOT YET INVESTIGATED

---

## ✅ What ACTUALLY Works in v1.0

### C4X-DSL (.c4x) - Reality

**Supported**:
- ✅ System Context (C1) diagrams
- ✅ Element declarations: `Person`, `Software System`, `Container`, `Component`
- ✅ Element syntax: `ID[Label<br/>Type<br/>Tags]`
- ✅ Relationships: `-->` (sync), `-.->` (async), `==>` (strong)
- ✅ Relationship labels: `ID -->|Label| OtherID`
- ✅ Tags: `External`, `Internal`, technology tags
- ✅ Graph directions: `TB`, `BT`, `LR`, `RL`
- ✅ Comments: `%% Comment`
- ✅ View directive: `%%{ c4: system-context }%%`

**NOT Supported** (despite docs claims):
- ❌ `subgraph` / boundaries
- ❌ `TD` graph direction
- ❌ Container (C2) boundaries
- ❌ Component (C3) boundaries
- ❌ Nested elements
- ❌ Element grouping

**Workaround for Container diagrams**:
```c4x
%%{ c4: container }%%
graph TB
    %% Just list all elements without subgraph
    WebApp[Web App<br/>Container<br/>React]
    API[API Server<br/>Container<br/>Node.js]
    DB[Database<br/>Container<br/>PostgreSQL]

    WebApp -->|Calls| API
    API -->|Reads/writes| DB
```

---

## 📊 Test Coverage Reality

**From test run** (349/417 passing = 83.7%):

✅ **100% Pass Rate**:
- C4X Parser: 122/122 (100%)
- PlantUML Parser: 58/58 (100%)
- Extension: 4/4 (100%)
- Theme System: 56/56 (100%)

⚠️ **Failing**:
- Structurizr: 57/99 (58%)
- Markdown: 19/28 (68%)

**Note**: No tests for `subgraph` because it's NOT IMPLEMENTED!

---

## 🛠️ Required Fixes

### Immediate (v1.0 Launch Blockers)

1. **Remove ALL subgraph examples** (1h)
   - Fix `docs/EXAMPLES.md` ✅ DONE
   - Fix `docs/examples/ecommerce-container.c4x`
   - Fix `docs/c4x-syntax.md` (remove Boundaries section)
   - Fix ALL `samples/container/*.c4x`
   - Fix ALL `samples/component/*.c4x`

2. **Fix SVG label rendering bug** (2h)
   - Investigate why labels render character-by-character
   - Fix `src/render/SvgBuilder.ts`
   - Test with all examples

3. **Update documentation to reflect reality** (2h)
   - `AGENT.md` - remove subgraph examples
   - `README.md` - check for subgraph usage
   - `docs/c4x-syntax.md` - honest capabilities
   - Add "Roadmap" section for unsupported features

4. **Create validation tests** (1h)
   - Test EVERY example file parses successfully
   - Automated test that parses all `samples/*.c4x`
   - Visual regression tests (screenshots)

**Total**: 6 hours to fix critical issues

---

### v1.1 Features (Post-Launch)

**Add boundary support** (8-12h):
- Update `c4x.pegjs` grammar to support `subgraph`
- Update renderer to draw boundary boxes
- Re-enable all boundary examples
- 100% test coverage

**Features**:
```c4x
subgraph "System Name"
    Container1[...]
    Container2[...]
end
```

---

## 📝 Documentation Debt

### Files with False Claims

1. **docs/c4x-syntax.md**:
   - Lines 174-202: Boundaries section (NOT SUPPORTED)
   - Line 69: `TD` in directions table (NOT SUPPORTED)
   - Line 232: Example uses `subgraph` (BROKEN)

2. **AGENT.md**:
   - Multiple subgraph examples (BROKEN)
   - Claims boundaries work (FALSE)

3. **README.md**:
   - Needs verification for subgraph usage

4. **samples/ folder**:
   - 6 files use subgraph (ALL BROKEN)

---

## 🎯 Honest v1.0 Capabilities

**What to tell users**:

> **C4X v1.0 supports System Context (C1) diagrams with a simple, Mermaid-inspired syntax.**
>
> **Supported**:
> - Elements: Person, Software System, Container, Component
> - Relationships with labels
> - 4 graph directions (TB, BT, LR, RL)
> - Tags and technology annotations
> - 5 built-in themes
> - SVG/PNG export
>
> **Not Yet Supported** (coming in v1.1):
> - Boundaries (subgraph/System_Boundary)
> - Nested elements
> - Container grouping
>
> **Workaround**: List all containers flat, use comments to indicate grouping.

---

## 🚦 Quality Score Revision

**Previous claim**: 75/100 (B-)

**Honest assessment**:
- **Functionality**: 60/100 (C-) - Core features work, boundaries missing
- **Documentation**: 40/100 (F) - Major doc/reality mismatch
- **Testing**: 85/100 (B+) - Good coverage of what EXISTS
- **Overall**: **55/100 (D+)** - NOT ready for v1.0 as documented

**Recommendation**:
1. Fix critical issues (6h)
2. Update docs to reflect reality (2h)
3. THEN launch as v1.0 (honest capabilities)
4. Add boundaries in v1.1 (2-3 weeks)

---

## ✅ Action Plan

### Today (Urgent - 4h)
1. ✅ Document reality (this file)
2. ⏳ Remove ALL subgraph examples (1h)
3. ⏳ Fix SVG label bug (2h)
4. ⏳ Test every example (1h)

### Tomorrow (4h)
1. Update all documentation (2h)
2. Create honest README (1h)
3. Rebuild VSIX (30min)
4. Re-test full extension (30min)

### Launch Decision
- **IF fixes complete**: Launch v1.0 with honest docs
- **IF not**: Delay launch, add to v1.1 scope

---

**Status**: 🔴 **DO NOT LAUNCH** until fixes applied

**Next**: Remove subgraph from all files + fix SVG labels
