# TDR-016: Lazy Sprite Auto-Correction

## Status
Accepted

## Context
The Gemini AI frequently generates invalid sprite syntax in C4X DSL output:
- **Invalid**: `Container(Web, "Web App", "React", ="react")`
- **Valid**: `Container(Web, "Web App", "React", $sprite="react")`

Despite explicit instructions in the system prompt (`GEMINI.md`) forbidding this pattern, the AI stubbornly reverts to it. Relying on the AI to self-correct via the retry loop proved unreliable.

## Decision
Implement **automatic post-processing correction** in `GeminiService.cleanResponse()` to fix this syntax without AI cooperation.

### Implementation
```typescript
// Auto-correct lazy sprite syntax
const originalClean = clean;
clean = clean.replace(/,\s*="([^"]+)"/g, ', $sprite="$1"');
if (clean !== originalClean) {
    console.warn('[GeminiService] Detected lazy sprite syntax. Auto-corrected.');
}
```

### Bug Discovered: JavaScript Global Regex `.test()` Trap
The initial implementation used:
```typescript
const pattern = /,\s*="([^"]+)"/g;
if (pattern.test(clean)) {          // ❌ Advances lastIndex
    clean = clean.replace(pattern);  // ❌ Starts from wrong position!
}
```

**Problem**: When using `.test()` on a global regex (`/g` flag), JavaScript advances the internal `lastIndex` pointer. The subsequent `.replace()` starts from that position and **misses** the first match.

**Fix**: Remove `.test()` and use `.replace()` directly, comparing before/after to detect changes.

## Consequences

### Positive
- Diagrams always render correctly regardless of AI quirks
- No API call wasted on retry attempts
- Deterministic behavior (regex-based, not AI-dependent)

### Negative
- Masks AI behavior issues (we won't know if the prompt needs improvement)
- Must maintain the regex if syntax evolves

## Testing
A dedicated test script validates the auto-fix logic:
```bash
node scripts/test-lazy-sprite.js
```

## References
- [GeminiService.ts](../../src/ai/GeminiService.ts) - `cleanResponse()` method
- [test-lazy-sprite.js](../../scripts/test-lazy-sprite.js) - Unit test for regex
- [GEMINI.md](../../GEMINI.md) - AI system prompt (still instructs correct syntax)
