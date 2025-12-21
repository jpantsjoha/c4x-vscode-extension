# Activity 04: Extension Entry Point

**Status**: 🟢 Complete
**Estimated Time**: 15 minutes
**Prerequisites**: Activities 01-03 complete (build system configured)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to create the extension entry point (`src/extension.ts`) that defines the activation and deactivation lifecycle hooks. This is the main file that VS Code loads when activating the extension.

**Why This Matters**: Without a proper entry point, VS Code cannot activate the extension. This file controls when and how the extension starts.

---

## 📋 Objectives

1. Create `src/extension.ts` with activate/deactivate functions
2. Register the `c4x.openPreview` command
3. Add performance tracking for activation time
4. Implement proper cleanup on deactivation
5. Test extension activates successfully

---

## 🔨 Step-by-Step Implementation

### Step 1: Create Extension Entry Point

```bash
mkdir -p src

cat > src/extension.ts << 'TYPESCRIPT'
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const startTime = performance.now();
    
    console.log('C4X extension is now activating...');

    // Register commands
    registerCommands(context);

    const activationTime = performance.now() - startTime;
    console.log(\`C4X extension activated in \${activationTime.toFixed(2)}ms\`);

    // Warn if activation is slow
    if (activationTime > 200) {
        console.warn(\`⚠️  Activation time exceeded target: \${activationTime.toFixed(2)}ms (target: < 200ms)\`);
    }
}

export function deactivate() {
    console.log('C4X extension is now deactivating...');
    
    // Cleanup resources here
    // (In future activities, we'll clean up webviews, parsers, etc.)
}

function registerCommands(context: vscode.ExtensionContext) {
    // Register C4X: Open Preview command
    const openPreviewCommand = vscode.commands.registerCommand(
        'c4x.openPreview',
        async () => {
            // For now, just show a message
            // In Activity 05, we'll implement the WebviewProvider
            vscode.window.showInformationMessage('C4X: Preview will open here!');
        }
    );

    context.subscriptions.push(openPreviewCommand);
}
TYPESCRIPT
```

---

## ✅ Acceptance Criteria

- [ ] `src/extension.ts` exists with activate/deactivate exports
- [ ] `activate()` function registers `c4x.openPreview` command
- [ ] Performance tracking measures activation time
- [ ] Console logs show activation status
- [ ] `deactivate()` function exists (even if empty for now)
- [ ] Extension builds without errors
- [ ] Command appears in Command Palette

---

## 🧪 Programmatic Testing & Validation

### Test 1: TypeScript Compilation

```bash
# Compile TypeScript (check for errors)
npx tsc --noEmit

# Expected: No errors
```

### Test 2: Build Success

```bash
# Build extension
pnpm run build

# Check build succeeded
test -f dist/extension.js && echo "✅ Extension built" || echo "❌ Build failed"
```

### Test 3: Validate Exports

```bash
# Check exports exist in built file
cat dist/extension.js | grep -q "activate" && echo "✅ activate exported" || echo "❌ activate missing"
cat dist/extension.js | grep -q "deactivate" && echo "✅ deactivate exported" || echo "❌ deactivate missing"
```

### Test 4: Validate Command Registration

```bash
# Check command is registered
cat src/extension.ts | grep -q "c4x.openPreview" && echo "✅ Command registered" || echo "❌ Command missing"
```

---

## 🤖 Automated Validation Script

```bash
cat > scripts/validate-extension-entry.sh << 'VALIDATE'
#!/bin/bash
set -e

echo "🧪 Validating Extension Entry Point..."

# Test 1: File exists
echo "Test 1: Checking file exists..."
test -f src/extension.ts || { echo "❌ src/extension.ts missing"; exit 1; }
echo "✅ File exists"

# Test 2: TypeScript check
echo "Test 2: TypeScript compilation..."
npx tsc --noEmit || { echo "❌ TypeScript errors"; exit 1; }
echo "✅ TypeScript passed"

# Test 3: Build
echo "Test 3: Building extension..."
pnpm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build succeeded"

# Test 4: Check exports
echo "Test 4: Validating exports..."
grep -q "export function activate" src/extension.ts || { echo "❌ activate not exported"; exit 1; }
grep -q "export function deactivate" src/extension.ts || { echo "❌ deactivate not exported"; exit 1; }
echo "✅ Exports validated"

# Test 5: Check command registration
echo "Test 5: Validating command registration..."
grep -q "c4x.openPreview" src/extension.ts || { echo "❌ Command not registered"; exit 1; }
echo "✅ Command registered"

echo ""
echo "🎉 Extension entry point validation passed!"
VALIDATE

chmod +x scripts/validate-extension-entry.sh
bash scripts/validate-extension-entry.sh
```

---

## 🚨 Troubleshooting

### Issue: Cannot find module 'vscode'

**Solution**: Ensure @types/vscode is installed:
```bash
pnpm add -D @types/vscode
```

### Issue: TypeScript errors about performance.now()

**Solution**: Update tsconfig.json to include DOM lib:
```json
{
  "compilerOptions": {
    "lib": ["ES2022", "DOM"]
  }
}
```

### Issue: Extension doesn't activate

**Solution**: Check package.json has correct activation events:
```json
{
  "activationEvents": [
    "onCommand:c4x.openPreview"
  ]
}
```

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

```bash
bash scripts/validate-extension-entry.sh
```

### Trigger Code Review Agent

```
/review-code Review extension entry point for Phase 1 Activity 04. Check activation performance tracking, command registration, and proper TypeScript types.
```

---

## 📊 Progress Tracking

**Mark Complete When**:
- All acceptance criteria checked ✅
- Automated validation passes
- Extension builds successfully
- Code Review Agent approved

---

**Next Activity**: [05-webview-provider.md](./05-webview-provider.md)
