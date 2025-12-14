# TDR-008: Performance Measurement Strategy

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

Need to measure performance and track over time:
- Activation time (< 200ms target)
- Preview render time (< 250ms target)
- Memory usage (< 50MB target)

---

## Decision

**VS Code Performance API + CI budget checks**

---

## Implementation

```typescript
// src/extension.ts
export function activate(context: vscode.ExtensionContext) {
  performance.mark('activate-start');
  
  // ... activation logic ...
  
  performance.mark('activate-end');
  performance.measure('activation', 'activate-start', 'activate-end');
  
  const measure = performance.getEntriesByName('activation')[0];
  console.log(`Activation time: ${measure.duration}ms`);
  
  if (measure.duration > 200) {
    console.warn(`⚠️  Activation exceeded target: ${measure.duration}ms (target: < 200ms)`);
  }
}
```

```typescript
// src/performance/Profiler.ts
export class Profiler {
  static async measurePreview(fn: () => Promise<void>): Promise<number> {
    const start = performance.now();
    await fn();
    const duration = performance.now() - start;
    
    if (duration > 250) {
      console.warn(`⚠️  Preview exceeded target: ${duration}ms (target: < 250ms)`);
    }
    
    return duration;
  }
}
```

---

## Performance Targets

| Metric | Target | CI Fail Threshold |
|--------|--------|-------------------|
| Activation | < 200ms | 300ms |
| Preview Render | < 250ms | 500ms |
| Memory Baseline | < 50MB | 100MB |

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
