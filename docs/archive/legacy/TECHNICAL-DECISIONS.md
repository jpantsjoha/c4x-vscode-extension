> Deprecated: Superseded by ADRs under `docs/adrs/`. See `docs/adrs/README.md` for the decision index.

# 🔧 C4X Extension — Technical Decision Records (TDRs)

**Purpose**: Document key technical decisions made during planning and development.

**Format**: Each decision includes context, options considered, decision made, rationale, and consequences.

---

## TDR-001: Build Tool Selection

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
VS Code extensions need to bundle TypeScript code for distribution. We need a fast, reliable build tool.

### Options Considered
1. **ESBuild** — Ultra-fast bundler, minimal config
2. **Webpack** — Traditional, well-supported by VS Code templates
3. **Rollup** — Good for libraries, less common for extensions

### Decision
**Use ESBuild** for main extension, with optional Webpack for complex webview needs.

### Rationale
- ✅ **Speed**: 10-100x faster than Webpack (sub-second builds)
- ✅ **Simplicity**: Minimal configuration
- ✅ **Tree-shaking**: Excellent dead code elimination
- ✅ **VS Code support**: Works well with extension development
- ⚠️ **Trade-off**: Less plugin ecosystem than Webpack (acceptable for our needs)

### Consequences
- **Positive**: Fast builds, quick iteration cycle
- **Negative**: May need Webpack for complex webview bundling (can add later)
- **Mitigation**: Start with ESBuild, add Webpack only if needed for webview assets

### Implementation
```json
// package.json
{
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=out/extension.js --external:vscode --format=cjs --platform=node",
    "watch": "npm run build -- --watch"
  },
  "devDependencies": {
    "esbuild": "^0.19.0"
  }
}
```

---

## TDR-002: Parser Generator Selection

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
We need to parse three DSLs: C4X-DSL (new), Structurizr DSL, and C4-PlantUML. Different approaches:

### Options Considered
1. **PEG.js** — Parser Expression Grammar generator
2. **nearley** — Earley parser with better error handling
3. **Hand-rolled** — Recursive descent parser
4. **Chevrotain** — Embedded DSL parser library

### Decision
- **C4X-DSL**: **PEG.js** (clean grammar, fast generation)
- **Structurizr DSL**: **Hand-rolled** (complex, need flexibility)
- **PlantUML C4**: **Regex + State Machine** (best-effort, subset only)

### Rationale
- **PEG.js for C4X-DSL**:
  - ✅ We control the syntax, can optimize for PEG
  - ✅ Fast parsing, good error messages
  - ✅ Small bundle size (~15KB)

- **Hand-rolled for Structurizr**:
  - ✅ Structurizr syntax is complex, need incremental parsing
  - ✅ Better error recovery (don't fail on unsupported features)
  - ✅ More control over AST

- **Regex for PlantUML**:
  - ✅ PlantUML is too complex for full parser
  - ✅ Subset approach: match known macros, ignore rest
  - ✅ Best-effort is acceptable (compatibility matrix)

### Consequences
- **Positive**: Right tool for each job, flexibility
- **Negative**: More code to maintain (3 parser implementations)
- **Mitigation**: Share IR (Intermediate Representation), only parsers differ

---

## TDR-003: Layout Engine Selection

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
C4 diagrams need automatic layout. Manual positioning is too tedious.

### Options Considered
1. **Dagre.js** (Eclipse Layout Kernel)
2. **Dagre** (Classic DAG layout)
3. **Cytoscape.js** (Graph visualization library, heavy)
4. **Manual layout** (user-defined coordinates)

### Decision
**Dagre.js as primary, Dagre as fallback**.

### Rationale
- **Dagre.js**:
  - ✅ Superior edge routing (cleaner diagrams)
  - ✅ Hierarchical layout (for boundaries/groups)
  - ✅ Actively maintained
  - ⚠️ Bundle size ~200KB (acceptable)
  - ⚠️ Learning curve (mitigation: use defaults)

- **Dagre as fallback**:
  - ✅ Simpler, smaller (~50KB)
  - ✅ Good for simple graphs
  - ⚠️ No hierarchical support (flat layout only)

### Consequences
- **Positive**: Best-in-class layout quality
- **Negative**: Larger bundle size
- **Mitigation**: Lazy-load Dagre.js only when needed; provide manual layout hints for power users

---

## TDR-004: Testing Framework Selection

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
Need unit, integration, and E2E tests. VS Code extensions have specific testing requirements.

### Options Considered
1. **Mocha + VS Code Test Runner** (VS Code official)
2. **Jest** (Popular, fast)
3. **Vitest** (Modern, Vite-based)

### Decision
**Mocha + @vscode/test-electron** (official VS Code test runner).

### Rationale
- ✅ **Official support**: VS Code team maintains it
- ✅ **Extension API testing**: Runs in real Extension Host
- ✅ **Documentation**: Best-in-class for VS Code extensions
- ⚠️ **Speed**: Slower than Jest (acceptable for quality)

### Consequences
- **Positive**: Reliable, well-documented, catches real Extension API issues
- **Negative**: Slower test execution vs Jest
- **Mitigation**: Use fast unit tests for parsers (90% of tests), E2E for integration (10%)

### Implementation
```json
// package.json
{
  "scripts": {
    "test": "node ./out/test/runTest.js",
    "pretest": "npm run build"
  },
  "devDependencies": {
    "@vscode/test-electron": "^2.3.0",
    "mocha": "^10.2.0"
  }
}
```

---

## TDR-005: State Management in Webview

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
Webview needs to manage state: zoom level, pan position, theme, current diagram.

### Options Considered
1. **Plain JavaScript state** (object + listeners)
2. **Zustand** (lightweight state management, ~1KB)
3. **Redux** (overkill for this project)
4. **VS Code state API** (`getState()` / `setState()`)

### Decision
**VS Code state API + plain JavaScript**.

### Rationale
- ✅ **Native support**: VS Code provides `getState()` / `setState()` for webview persistence
- ✅ **Simplicity**: No external dependencies
- ✅ **Persistence**: State survives webview hide/show
- ⚠️ **Limited**: No reactive updates (acceptable, we control rendering)

### Consequences
- **Positive**: Zero dependencies, native persistence
- **Negative**: Manual state updates (need to call `setState()` explicitly)
- **Mitigation**: Encapsulate state in a simple class, provide getters/setters

### Implementation
```typescript
// webview/state.ts
class DiagramState {
  private vscode = acquireVsCodeApi();

  getZoom(): number {
    return this.vscode.getState()?.zoom ?? 1.0;
  }

  setZoom(zoom: number) {
    const state = this.vscode.getState() || {};
    this.vscode.setState({ ...state, zoom });
  }
}
```

---

## TDR-006: Bundle Size Target

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
Extension bundle size affects activation time and marketplace perception.

### Options Considered
1. **No limit** (download whatever, users have bandwidth)
2. **< 1MB** (reasonable for most extensions)
3. **< 500KB** (tight, limits dependencies)

### Decision
**Target < 1MB, alert if > 1.5MB**.

### Rationale
- ✅ **Realistic**: Dagre.js (~200KB) + parsers (~50KB) + extension code (~100KB) = ~350KB baseline
- ✅ **Acceptable**: Most VS Code extensions are 500KB-2MB
- ⚠️ **Monitor**: Use `bundlesize` tool to track growth

### Consequences
- **Positive**: Fast install, good user experience
- **Negative**: May need to lazy-load features
- **Mitigation**: Code-split Dagre.js, load on first diagram render

### Implementation
```json
// .github/workflows/ci.yml
- name: Check bundle size
  run: |
    SIZE=$(stat -f%z extension/out/extension.js)
    if [ $SIZE -gt 1572864 ]; then
      echo "Bundle too large: $SIZE bytes (max 1.5MB)"
      exit 1
    fi
```

---

## TDR-007: Security Audit Tools

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: VSCode Extension Expert

### Context
Need to audit dependencies for security vulnerabilities before marketplace publish.

### Options Considered
1. **npm audit** (built-in, free)
2. **Snyk** (comprehensive, free tier available)
3. **GitHub Dependabot** (automatic PRs)

### Decision
**Use all three** (defense in depth).

### Rationale
- ✅ **npm audit**: Quick check, catches known CVEs
- ✅ **Snyk**: Deeper analysis, license compliance
- ✅ **Dependabot**: Automated updates, proactive

### Consequences
- **Positive**: Multiple layers of protection
- **Negative**: May get false positives (need to triage)
- **Mitigation**: Review alerts weekly, ignore non-applicable warnings

### Implementation
```yaml
# .github/workflows/security.yml
name: Security Audit
on: [push, pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm audit --audit-level=moderate
      - uses: snyk/actions/node@master
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

---

## TDR-008: Performance Measurement Strategy

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Lead Architect + VSCode Extension Expert

### Context
Need to measure performance (activation < 200ms, preview < 250ms) and track over time.

### Options Considered
1. **Manual timing** (`console.time()` / `console.timeEnd()`)
2. **VS Code Performance API** (`performance.mark()` / `performance.measure()`)
3. **Custom harness** (k6, Lighthouse)

### Decision
**VS Code Performance API + CI budget checks**.

### Rationale
- ✅ **Native support**: VS Code provides `performance` API
- ✅ **Accurate**: High-resolution timestamps
- ✅ **CI integration**: Fail build if perf regression

### Consequences
- **Positive**: Catch regressions early
- **Negative**: Adds complexity to CI
- **Mitigation**: Start simple (just activation time), expand to preview later

### Implementation
```typescript
// extension.ts
export function activate(context: vscode.ExtensionContext) {
  performance.mark('activate-start');
  // ... activation logic ...
  performance.mark('activate-end');
  performance.measure('activation', 'activate-start', 'activate-end');
  const measure = performance.getEntriesByName('activation')[0];
  console.log(`Activation time: ${measure.duration}ms`);
}
```

---

## TDR-009: License Selection

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Product Owner

### Context
Need to choose open-source license for marketplace publication.

### Options Considered
1. **MIT** (permissive, simple)
2. **Apache 2.0** (permissive, patent grant)
3. **GPL v3** (copyleft, restrictive)

### Decision
**MIT License**.

### Rationale
- ✅ **Simplicity**: Short, easy to understand
- ✅ **Permissive**: Allows commercial use, modification
- ✅ **Popular**: Most VS Code extensions use MIT
- ✅ **No patent concerns**: Simple attribution only

### Consequences
- **Positive**: Maximum adoption, no licensing friction
- **Negative**: Others can fork without contributing back (acceptable)

---

## TDR-010: Contribution Guidelines

**Date**: 2025-10-13
**Status**: ✅ Decided
**Decider**: Product Owner

### Context
If project is open-sourced, need guidelines for external contributors.

### Decision
**Standard GitHub contribution flow** with code of conduct.

### Guidelines
1. **Fork & PR**: Contributors fork repo, submit PR
2. **Code review**: VSCode Expert agent reviews (or maintainer)
3. **Tests required**: All PRs must include tests
4. **Sign commits**: Use `--signoff` for DCO
5. **Code of Conduct**: Contributor Covenant 2.1

### Implementation
Create `CONTRIBUTING.md` in M0 with:
- How to set up dev environment
- How to run tests
- PR template
- Code style guide (Prettier, ESLint)

---

## Summary of Decisions

| TDR | Decision | Status |
|-----|----------|--------|
| TDR-001 | Build Tool | ✅ ESBuild (primary) |
| TDR-002 | Parser Generator | ✅ PEG.js (C4X), Hand-rolled (Structurizr), Regex (PlantUML) |
| TDR-003 | Layout Engine | ✅ Dagre.js (primary), Dagre (fallback) |
| TDR-004 | Testing Framework | ✅ Mocha + @vscode/test-electron |
| TDR-005 | State Management | ✅ VS Code state API + plain JS |
| TDR-006 | Bundle Size | ✅ Target < 1MB, alert > 1.5MB |
| TDR-007 | Security Audit | ✅ npm audit + Snyk + Dependabot |
| TDR-008 | Performance Measurement | ✅ VS Code Performance API + CI checks |
| TDR-009 | License | ✅ MIT License |
| TDR-010 | Contribution Guidelines | ✅ Standard GitHub flow + DCO |

---

## Next TDRs (To Be Decided During Development)

- **TDR-011**: Theming implementation (CSS variables vs inline styles)
- **TDR-012**: Icon library selection (Lucide vs Feather vs custom)
- **TDR-013**: Export PNG strategy (sharp vs canvas API vs puppeteer)
- **TDR-014**: Telemetry approach (opt-in? what to track?)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Next Review**: After M1 completion (Week 2)
