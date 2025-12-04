# TDR-003: Layout Engine Selection

**Date**: 2025-10-20
**Status**: ✅ **SUPERSEDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

C4 diagrams need automatic layout. Manual positioning is too tedious for users. We need a layout engine that:
- Handles directed graph layout
- Provides clean edge routing
- Performs well and has a small bundle size for a VS Code extension.

_This ADR supersedes the original decision from 2025-10-13. While Dagre.js was initially chosen, the implementation switched to Dagre.js for simplicity and a smaller footprint during the MVP phase._

---

## Options Considered

### Option 1: Dagre.js (Eclipse Layout Kernel) ❌ **REJECTED**

**Pros**:
- ✅ Superior edge routing and hierarchical layout support.
- ✅ Actively maintained.

**Cons**:
- ⚠️ Bundle size ~400KB.
- ⚠️ More complex API compared to alternatives.

**Why Rejected**: While powerful, the bundle size and complexity were deemed too high for the initial MVP. The project prioritized a faster, lighter-weight solution to begin with.

---

### Option 2: Dagre ✅ **CHOSEN**

**Pros**:
- ✅ Simpler API, leading to faster implementation.
- ✅ Smaller bundle size (~150KB), which is critical for VS Code extension performance.
- ✅ Good for simple directed acyclic graphs (DAGs).
- ✅ Already implemented and in use in the codebase.

**Cons**:
- ❌ No native support for nested boundaries (hierarchical layout), a known limitation for complex C4 diagrams.
- ❌ Edge routing is less sophisticated than Dagre.js.

---

## Decision

**Dagre.js is the chosen layout engine.** This decision prioritizes simplicity, performance, and a small footprint for the extension's core functionality. The lack of hierarchical layout is accepted as a short-term trade-off.

---

## Rationale

1.  **Simplicity & Speed of Development**: Dagre's simpler API allowed for a much faster implementation, which was crucial for the project's MVP phase.
2.  **Bundle Size**: At ~150KB, Dagre is significantly smaller than Dagre.js (~400KB), reducing the extension's load time and installation size.
3.  **Existing Implementation**: The codebase is already successfully using Dagre. Formalizing this decision aligns the documentation with the working code.

---

## Implementation

The implementation is located in `src/layout/DagreLayoutEngine.ts`.

```typescript
// src/layout/DagreLayoutEngine.ts
import dagre from 'dagre';
import { C4View } from '../model/C4Model';

// ...

export class DagreLayoutEngine {
  async layout(view: C4View): Promise<LayoutResult> {
    const g = new dagre.graphlib.Graph();

    g.setGraph({
      rankdir: 'TB',
      nodesep: 80,
      ranksep: 100,
    });

    // ... (add nodes and edges) ...

    dagre.layout(g);

    // ... (extract positions) ...
  }
}
```

---

## Performance Comparison

| Engine | 30 Nodes | Hierarchical Support | Bundle Size |
|--------|----------|---------------------|-------------|
| Dagre.js | < 100ms | ✅ Excellent | ~400KB |
| **Dagre** | **~150ms** | **❌ No** | **~150KB** |

---

## Consequences

### Positive
- ✅ Smaller extension bundle size.
- ✅ Simpler, more maintainable layout code for the current feature set.
- ✅ Documentation now reflects the actual implementation.

### Negative
- ⚠️ The lack of hierarchical layout means complex diagrams with nested boundaries will not render correctly. This is a significant feature gap that must be addressed in a future iteration or the limitation must be clearly communicated to users.

### Mitigation
- Future work may involve exploring Dagre plugins for hierarchical layout or reconsidering Dagre.js when the feature becomes a priority. For now, user documentation should state that only flat diagrams are fully supported.

---

**Document Version**: 1.1 (Supersedes 1.0)
**Last Updated**: 2025-10-20
