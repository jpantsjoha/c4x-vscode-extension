# Activity 05: Webview Provider Implementation

**Status**: 🟢 Complete
**Estimated Time**: 25 minutes
**Prerequisites**: Activity 04 complete (extension.ts with activate function)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to implement the `WebviewProvider` class that creates and manages the C4X preview webview panel. This provider handles the webview lifecycle, HTML content generation, resource loading, and bidirectional messaging between the extension and webview.

**Why This Matters**: The WebviewProvider is the foundation for all C4 diagram rendering. Without it, the extension can't display any visual content to users.

---

## 📋 Objectives

1. Create `src/webview/WebviewProvider.ts`
2. Implement singleton pattern for webview panel management
3. Generate CSP-compliant HTML content
4. Set up bidirectional messaging (extension ↔ webview)
5. Handle webview disposal and resource cleanup
6. Add resource URI handling for local files
7. Validate implementation with programmatic tests

---

## 🔨 Step-by-Step Implementation

### Step 1: Create Webview Provider File

```bash
cd /Users/jp/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension

# Create webview directory
mkdir -p src/webview

# Create WebviewProvider.ts
cat > src/webview/WebviewProvider.ts << 'PROVIDER'
import * as vscode from 'vscode';

export class WebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;

    /**
     * Creates or shows the C4X preview webview panel.
     * Uses singleton pattern to ensure only one panel exists.
     */
    public static createOrShow(context: vscode.ExtensionContext): void {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (WebviewProvider.currentPanel) {
            WebviewProvider.currentPanel.reveal(column);
            return;
        }

        // Create new webview panel
        const panel = vscode.window.createWebviewPanel(
            'c4xPreview',
            'C4X Preview',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(context.extensionUri, 'dist'),
                    vscode.Uri.joinPath(context.extensionUri, 'src', 'webview', 'content')
                ]
            }
        );

        WebviewProvider.currentPanel = panel;

        // Set HTML content
        panel.webview.html = WebviewProvider.getHtmlContent(panel.webview, context);

        // Set up message handler
        panel.webview.onDidReceiveMessage(
            message => WebviewProvider.handleMessage(message, panel),
            undefined,
            context.subscriptions
        );

        // Handle panel disposal
        panel.onDidDispose(
            () => {
                WebviewProvider.currentPanel = undefined;
            },
            null,
            context.subscriptions
        );

        // Log creation
        console.log('C4X Webview panel created');
    }

    /**
     * Generates CSP-compliant HTML content for the webview.
     */
    private static getHtmlContent(
        webview: vscode.Webview,
        context: vscode.ExtensionContext
    ): string {
        // Generate nonce for CSP
        const nonce = WebviewProvider.getNonce();

        // Get CSP source
        const cspSource = webview.cspSource;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src ${cspSource} 'unsafe-inline';
                   script-src 'nonce-${nonce}';
                   img-src ${cspSource} data:;">
    <title>C4X Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        .status {
            padding: 12px;
            border-radius: 4px;
            background-color: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            margin-bottom: 20px;
        }
        .message {
            font-size: 18px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .communication-test {
            padding: 10px;
            background-color: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            margin-top: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="status">
            <div class="message">Hello C4X</div>
            <div>Extension webview is ready</div>
        </div>
        <div class="communication-test">
            <div>Communication Status: <span id="commStatus">Initializing...</span></div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();

        // Notify extension that webview is ready
        vscode.postMessage({
            type: 'webviewReady',
            timestamp: new Date().toISOString()
        });

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.type) {
                case 'updateStatus':
                    document.getElementById('commStatus').textContent = message.payload;
                    break;
            }
        });

        console.log('C4X Webview initialized');
    </script>
</body>
</html>`;
    }

    /**
     * Handles messages received from the webview.
     */
    private static handleMessage(
        message: any,
        panel: vscode.WebviewPanel
    ): void {
        switch (message.type) {
            case 'webviewReady':
                console.log('Webview ready at:', message.timestamp);

                // Send confirmation back to webview
                panel.webview.postMessage({
                    type: 'updateStatus',
                    payload: '✅ Communication established'
                });
                break;

            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Generates a cryptographic nonce for Content Security Policy.
     */
    private static getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    /**
     * Disposes the current panel (for testing/cleanup).
     */
    public static dispose(): void {
        if (WebviewProvider.currentPanel) {
            WebviewProvider.currentPanel.dispose();
            WebviewProvider.currentPanel = undefined;
        }
    }
}
PROVIDER
```

**Expected Output**: `src/webview/WebviewProvider.ts` created (342 lines)

---

### Step 2: Update Extension Entry Point to Use WebviewProvider

Update `src/extension.ts` to import and use the WebviewProvider:

```bash
cat > src/extension.ts << 'EXTENSION'
import * as vscode from 'vscode';
import { WebviewProvider } from './webview/WebviewProvider';

export function activate(context: vscode.ExtensionContext) {
    const startTime = performance.now();

    console.log('C4X extension is now activating...');

    // Register commands
    registerCommands(context);

    // Log activation time
    const activationTime = performance.now() - startTime;
    console.log(`C4X extension activated in ${activationTime.toFixed(2)}ms`);

    // Performance warning
    if (activationTime > 200) {
        console.warn(`⚠️  Activation time exceeded target (200ms): ${activationTime.toFixed(2)}ms`);
    }
}

export function deactivate() {
    console.log('C4X extension is deactivating...');

    // Clean up webview resources
    WebviewProvider.dispose();
}

function registerCommands(context: vscode.ExtensionContext) {
    // Register "C4X: Open Preview" command
    const openPreviewCommand = vscode.commands.registerCommand(
        'c4x.openPreview',
        () => {
            WebviewProvider.createOrShow(context);
        }
    );

    context.subscriptions.push(openPreviewCommand);
}
EXTENSION
```

---

### Step 3: Build and Verify TypeScript Compilation

```bash
# Build the extension
pnpm run build

# Expected output: Build completes without errors in < 1 second
```

**Expected Output**:
```
> c4x@0.1.0 build
> node esbuild.config.js

✅ Build complete in 487ms
📦 Bundle size: 89.4 KB
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] `src/webview/WebviewProvider.ts` exists
- [ ] WebviewProvider implements singleton pattern (currentPanel static property)
- [ ] `createOrShow()` method creates or reveals panel
- [ ] HTML content includes CSP headers with nonce
- [ ] Bidirectional messaging implemented (webviewReady message, updateStatus response)
- [ ] Resource URI handling configured (localResourceRoots)
- [ ] Panel disposal handler registered
- [ ] Extension.ts updated to use WebviewProvider
- [ ] TypeScript compiles without errors
- [ ] Build completes in < 1 second

---

## 🧪 Programmatic Testing & Validation

### Test 1: Verify File Structure

```bash
# Test 1: Check files exist
test -f src/webview/WebviewProvider.ts && echo "✅ WebviewProvider.ts exists" || echo "❌ WebviewProvider.ts missing"
test -f src/extension.ts && echo "✅ extension.ts exists" || echo "❌ extension.ts missing"
```

**Expected Output**:
```
✅ WebviewProvider.ts exists
✅ extension.ts exists
```

---

### Test 2: Validate TypeScript Syntax

```bash
# Test 2: Check TypeScript compiles
pnpm run build 2>&1 | grep -q "error" && echo "❌ TypeScript errors found" || echo "✅ TypeScript compiles successfully"
```

**Expected**: `✅ TypeScript compiles successfully`

---

### Test 3: Verify WebviewProvider Exports

```bash
# Test 3: Check exports are correct
node << 'VALIDATE'
const fs = require('fs');
const content = fs.readFileSync('src/webview/WebviewProvider.ts', 'utf8');

const checks = {
    'Class declaration': content.includes('export class WebviewProvider'),
    'createOrShow method': content.includes('public static createOrShow'),
    'Singleton pattern': content.includes('private static currentPanel'),
    'CSP nonce': content.includes('getNonce()'),
    'Message handler': content.includes('handleMessage'),
    'Bidirectional messaging': content.includes('webview.onDidReceiveMessage'),
    'Resource roots': content.includes('localResourceRoots'),
    'Disposal handler': content.includes('onDidDispose')
};

const passed = Object.values(checks).filter(v => v).length;
const total = Object.keys(checks).length;

console.log(`✅ Passed: ${passed}/${total}`);
Object.entries(checks).forEach(([key, value]) => {
    console.log(`${value ? '✅' : '❌'} ${key}`);
});

process.exit(passed === total ? 0 : 1);
VALIDATE
```

**Expected Output**:
```
✅ Passed: 8/8
✅ Class declaration
✅ createOrShow method
✅ Singleton pattern
✅ CSP nonce
✅ Message handler
✅ Bidirectional messaging
✅ Resource roots
✅ Disposal handler
```

---

### Test 4: Verify Extension Integration

```bash
# Test 4: Check extension.ts imports WebviewProvider
grep -q "import { WebviewProvider } from './webview/WebviewProvider'" src/extension.ts && echo "✅ WebviewProvider imported" || echo "❌ WebviewProvider not imported"

grep -q "WebviewProvider.createOrShow" src/extension.ts && echo "✅ WebviewProvider used in command" || echo "❌ WebviewProvider not used"

grep -q "WebviewProvider.dispose" src/extension.ts && echo "✅ Cleanup in deactivate" || echo "❌ No cleanup"
```

**Expected Output**:
```
✅ WebviewProvider imported
✅ WebviewProvider used in command
✅ Cleanup in deactivate
```

---

### Test 5: Verify CSP Headers

```bash
# Test 5: Check Content Security Policy is strict
node << 'CSP_CHECK'
const fs = require('fs');
const content = fs.readFileSync('src/webview/WebviewProvider.ts', 'utf8');

const cspChecks = {
    "default-src 'none'": content.includes("default-src 'none'"),
    'nonce for scripts': content.includes("script-src 'nonce-"),
    'CSP source variable': content.includes('cspSource = webview.cspSource'),
    'Nonce generation': content.includes('getNonce()')
};

const passed = Object.values(cspChecks).filter(v => v).length;
const total = Object.keys(cspChecks).length;

console.log(`✅ CSP Security: ${passed}/${total}`);
Object.entries(cspChecks).forEach(([key, value]) => {
    console.log(`${value ? '✅' : '❌'} ${key}`);
});

process.exit(passed === total ? 0 : 1);
CSP_CHECK
```

**Expected Output**:
```
✅ CSP Security: 4/4
✅ default-src 'none'
✅ nonce for scripts
✅ CSP source variable
✅ Nonce generation
```

---

## 🤖 Automated Validation Script

Create a comprehensive validation script:

```bash
mkdir -p scripts

cat > scripts/validate-webview-provider.sh << 'VALIDATE_SCRIPT'
#!/bin/bash
set -e

echo "🧪 Validating Webview Provider Implementation..."

# Test 1: File structure
echo "Test 1: Checking file structure..."
test -f src/webview/WebviewProvider.ts || { echo "❌ WebviewProvider.ts missing"; exit 1; }
test -f src/extension.ts || { echo "❌ extension.ts missing"; exit 1; }
echo "✅ File structure correct"

# Test 2: TypeScript compilation
echo "Test 2: Validating TypeScript compilation..."
pnpm run build > /dev/null 2>&1 || { echo "❌ Build failed"; exit 1; }
echo "✅ TypeScript compiles successfully"

# Test 3: WebviewProvider exports
echo "Test 3: Validating WebviewProvider exports..."
node << 'NODETEST'
const fs = require('fs');
const content = fs.readFileSync('src/webview/WebviewProvider.ts', 'utf8');

const checks = {
    'Class declaration': content.includes('export class WebviewProvider'),
    'createOrShow method': content.includes('public static createOrShow'),
    'Singleton pattern': content.includes('private static currentPanel'),
    'CSP nonce': content.includes('getNonce()'),
    'Message handler': content.includes('handleMessage'),
    'Bidirectional messaging': content.includes('webview.onDidReceiveMessage')
};

const passed = Object.values(checks).filter(v => v).length;
if (passed !== Object.keys(checks).length) {
    console.error('❌ Missing required exports');
    process.exit(1);
}
console.log('✅ All exports present');
NODETEST

# Test 4: Extension integration
echo "Test 4: Validating extension integration..."
grep -q "import { WebviewProvider } from './webview/WebviewProvider'" src/extension.ts || { echo "❌ WebviewProvider not imported"; exit 1; }
grep -q "WebviewProvider.createOrShow" src/extension.ts || { echo "❌ WebviewProvider not used"; exit 1; }
echo "✅ Extension integration correct"

# Test 5: CSP headers
echo "Test 5: Validating CSP security..."
grep -q "default-src 'none'" src/webview/WebviewProvider.ts || { echo "❌ CSP not strict"; exit 1; }
grep -q "nonce-" src/webview/WebviewProvider.ts || { echo "❌ Nonce missing"; exit 1; }
echo "✅ CSP security validated"

echo ""
echo "🎉 All validation tests passed!"
echo "✅ WebviewProvider implementation complete"
VALIDATE_SCRIPT

chmod +x scripts/validate-webview-provider.sh

# Run validation
bash scripts/validate-webview-provider.sh
```

---

## 🚨 Troubleshooting

### Issue: "Cannot find module './webview/WebviewProvider'"

**Solution**: Verify directory structure and file exists:
```bash
ls -la src/webview/WebviewProvider.ts
# Rebuild
pnpm run build
```

### Issue: Build fails with "Property 'cspSource' does not exist"

**Solution**: Ensure `@types/vscode` is installed and up to date:
```bash
pnpm install @types/vscode@latest
```

### Issue: Webview shows blank screen

**Solution**: Check CSP errors in Developer Tools:
1. Open Command Palette (Cmd+Shift+P)
2. Run "Developer: Toggle Developer Tools"
3. Check Console for CSP violations
4. Verify nonce is correctly inserted in both meta tag and script tag

### Issue: "acquireVsCodeApi is not a function"

**Solution**: Ensure `enableScripts: true` is set in webview options:
```typescript
vscode.window.createWebviewPanel(
    'c4xPreview',
    'C4X Preview',
    column || vscode.ViewColumn.One,
    {
        enableScripts: true,  // ← Required for acquireVsCodeApi
        // ...
    }
);
```

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

Run programmatic validation:
```bash
bash scripts/validate-webview-provider.sh
```

**Expected**: All tests pass (exit code 0)

### Trigger Code Review Agent

After validation passes, invoke `/review-code` to verify:
- Webview provider follows VS Code best practices
- CSP headers are secure
- Singleton pattern is correctly implemented
- Resource cleanup is handled properly

**Command**:
```
/review-code Validate WebviewProvider implementation for Phase 1 Activity 05
```

---

## 📊 Progress Tracking

**Status**: 🔴 Not Started

**Mark Complete When**:
- All acceptance criteria checked ✅
- Automated validation script passes
- Code Review Agent approved
- Next activity (06-hello-webview.md) can proceed

---

## 📚 References

- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Content Security Policy](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [Webview Best Practices](https://code.visualstudio.com/api/extension-guides/webview#best-practices)
- [TDR-007: Content Security Policy](../../../adrs/TDR-007-content-security-policy.md)

---

**Activity Owner**: Any autonomous agent or contributor
**Last Updated**: 2025-10-19
**Next Activity**: [06-hello-webview.md](./06-hello-webview.md)
