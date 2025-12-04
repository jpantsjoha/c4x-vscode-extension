# TDR-005: State Management in Webview

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

Webview needs to manage state: zoom level, pan position, current theme, selected diagram.

---

## Options Considered

### Option 1: VS Code State API + Plain JavaScript ✅ **CHOSEN**

**Pros**:
- ✅ **Native support**: VS Code provides `getState()` / `setState()`
- ✅ **Simplicity**: No external dependencies
- ✅ **Persistence**: State survives webview hide/show
- ✅ **Zero bundle cost**

**Cons**:
- ⚠️ Manual state updates (need to call `setState()` explicitly)

---

### Option 2: Zustand ❌ **REJECTED**

**Why Rejected**: Adds ~1KB dependency for simple state needs

---

## Decision

**VS Code state API + plain JavaScript**

---

## Implementation

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
  
  getTheme(): string {
    return this.vscode.getState()?.theme ?? 'classic';
  }
  
  setTheme(theme: string) {
    const state = this.vscode.getState() || {};
    this.vscode.setState({ ...state, theme });
  }
}
```

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
