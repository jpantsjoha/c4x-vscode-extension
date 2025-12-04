# TDR-004: Testing Framework Selection

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

Need unit, integration, and E2E tests. VS Code extensions have specific testing requirements (must run in Extension Host environment).

---

## Options Considered

### Option 1: Mocha + @vscode/test-electron ✅ **CHOSEN**

**Pros**:
- ✅ **Official support**: Maintained by VS Code team
- ✅ **Extension API testing**: Runs in real Extension Host
- ✅ **Documentation**: Best-in-class for VS Code extensions
- ✅ **Coverage**: Integrates with nyc/c8

**Cons**:
- ⚠️ Slower than Jest (acceptable for quality)

---

### Option 2: Jest ❌ **REJECTED**

**Cons**:
- ❌ Poor VS Code integration (requires extensive mocking)
- ❌ Doesn't run in Extension Host (may miss real issues)

---

## Decision

**Mocha + @vscode/test-electron** (official VS Code test runner)

---

## Implementation

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

```typescript
// test/suite/parser.test.ts
import * as assert from 'assert';
import { C4XParser } from '../../src/parser/C4XParser';

suite('C4XParser Test Suite', () => {
  test('Parse Person element', () => {
    const content = `
      %%{ c4: system-context }%%
      graph TB
        Customer[Customer<br/>Person]
    `;
    const model = new C4XParser().parse(content);
    assert.strictEqual(model.views[0].elements.length, 1);
    assert.strictEqual(model.views[0].elements[0].type, 'Person');
  });
});
```

---

## Coverage Target

> 80% code coverage for v1.0

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
