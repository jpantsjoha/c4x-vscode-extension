# TDR-006: Bundle Size Target

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

Extension bundle size affects:
- Installation time
- Activation time
- Marketplace perception

---

## Decision

**Target < 1MB, alert if > 1.5MB**

---

## Rationale

- ✅ **Realistic**: Dagre.js (~400KB) + parsers (~50KB) + extension code (~200KB) = ~650KB baseline
- ✅ **Acceptable**: Most VS Code extensions are 500KB-2MB
- ✅ **Competitive**: Smaller than most diagram extensions

---

## Bundle Size Breakdown

| Component | Size | % of Total |
|-----------|------|------------|
| Dagre.js | ~400KB | 50% |
| PEG.js Parser | ~30KB | 4% |
| Extension Code | ~200KB | 25% |
| Dependencies | ~100KB | 12% |
| Other | ~70KB | 9% |
| **Total** | **~800KB** | **100%** |

---

## Monitoring

```yaml
# .github/workflows/ci.yml
- name: Check bundle size
  run: |
    SIZE=$(stat -f%z dist/extension.js)
    echo "Bundle size: $SIZE bytes"
    if [ $SIZE -gt 1572864 ]; then
      echo "❌ Bundle too large: $SIZE bytes (max 1.5MB)"
      exit 1
    fi
    if [ $SIZE -gt 1048576 ]; then
      echo "⚠️  Bundle size warning: $SIZE bytes (target < 1MB)"
    fi
```

---

## Mitigation Strategies

- Lazy-load Dagre.js (only when first preview opened)
- Tree-shaking (remove unused code)
- Minification (reduce code size)
- Code-split webview assets

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
