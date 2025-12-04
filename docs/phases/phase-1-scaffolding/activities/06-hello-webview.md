# Activity 06: Hello Webview Demo

**Status**: 🟢 Complete (implemented inline in Activity 05)
**Estimated Time**: 30 minutes
**Prerequisites**: Activities 01-05 complete (WebviewProvider implemented)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to create a functional "Hello World" webview that demonstrates:
1. Extension can create and manage webviews
2. Webview HTML/CSS renders correctly
3. Webview-to-extension communication works
4. Content Security Policy (CSP) is enforced

This is the **foundation for all future C4 diagram rendering**.

**Why This Matters**: If we can't render a simple "Hello C4X" message in a webview, we can't render complex SVG diagrams. This validates our entire webview architecture.

---

## 📋 Objectives

1. Create webview HTML template with CSP
2. Create webview CSS styling
3. Implement bidirectional messaging (extension ↔ webview)
4. Wire up "C4X: Open Preview" command
5. Test webview renders correctly
6. Programmatically validate with Playwright MCP

---

## 🔨 Step-by-Step Implementation

### Step 1: Create Webview HTML Content

```bash
mkdir -p src/webview/content

cat > src/webview/content/index.html << 'HTML'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" 
          content="default-src 'none'; 
                   style-src {{cspSource}} 'unsafe-inline'; 
                   script-src 'nonce-{{nonce}}'; 
                   img-src {{cspSource}} data:;">
    <title>C4X Preview</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
        }

        .container {
            text-align: center;
            max-width: 600px;
        }

        h1 {
            color: var(--vscode-textLink-foreground);
            font-size: 2.5em;
            margin-bottom: 20px;
        }

        .logo {
            font-size: 4em;
            margin-bottom: 20px;
        }

        .message {
            font-size: 1.2em;
            line-height: 1.6;
            margin-bottom: 30px;
            color: var(--vscode-descriptionForeground);
        }

        .status {
            padding: 10px 20px;
            border-radius: 5px;
            background-color: var(--vscode-inputOption-activeBackground);
            color: var(--vscode-inputOption-activeForeground);
            display: inline-block;
            margin-top: 20px;
        }

        .button {
            padding: 10px 20px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 1em;
            margin: 10px 5px;
        }

        .button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        #preview-area {
            margin-top: 30px;
            padding: 20px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 5px;
            min-height: 200px;
            background-color: var(--vscode-editor-background);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">🎨</div>
        <h1>Hello C4X!</h1>
        <p class="message">
            C4X Extension is active and ready to render C4 Model diagrams.<br/>
            This webview will display your architecture diagrams with beautiful SVG rendering.
        </p>
        <div class="status" id="status">
            ✅ Extension Loaded Successfully
        </div>

        <div>
            <button class="button" id="test-button">Test Communication</button>
            <button class="button" id="load-sample">Load Sample Diagram</button>
        </div>

        <div id="preview-area">
            <p style="color: var(--vscode-descriptionForeground);">
                Preview area ready for C4 diagrams...
            </p>
        </div>
    </div>

    <script nonce="{{nonce}}">
        // Acquire VS Code API
        const vscode = acquireVsCodeApi();

        // Test Communication Button
        document.getElementById('test-button').addEventListener('click', () => {
            vscode.postMessage({
                type: 'test',
                payload: 'Hello from webview!'
            });
        });

        // Load Sample Button
        document.getElementById('load-sample').addEventListener('click', () => {
            vscode.postMessage({
                type: 'loadSample',
                payload: 'system-context'
            });
        });

        // Listen for messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'updateStatus':
                    document.getElementById('status').textContent = message.payload;
                    break;
                case 'renderDiagram':
                    document.getElementById('preview-area').innerHTML = message.payload;
                    break;
                case 'error':
                    document.getElementById('preview-area').innerHTML = 
                        `<p style="color: var(--vscode-errorForeground);">❌ Error: ${message.payload}</p>`;
                    break;
            }
        });

        // Notify extension that webview is ready
        vscode.postMessage({ type: 'webviewReady' });
    </script>
</body>
</html>
HTML
```

---

### Step 2: Update WebviewProvider to Load HTML

Update `src/webview/WebviewProvider.ts`:

```typescript
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (WebviewProvider.currentPanel) {
            WebviewProvider.currentPanel.reveal(column);
            return;
        }

        // Create new panel
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

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'webviewReady':
                        console.log('Webview ready');
                        panel.webview.postMessage({
                            type: 'updateStatus',
                            payload: '✅ Communication established'
                        });
                        break;
                    case 'test':
                        console.log('Test message from webview:', message.payload);
                        vscode.window.showInformationMessage(`Webview says: ${message.payload}`);
                        break;
                    case 'loadSample':
                        // In future activities, this will load actual diagrams
                        panel.webview.postMessage({
                            type: 'renderDiagram',
                            payload: '<h2>📊 Sample C4 Diagram</h2><p>Coming in Phase 2 (M1: Parser)...</p>'
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Clean up when panel is closed
        panel.onDidDispose(
            () => {
                WebviewProvider.currentPanel = undefined;
            },
            null,
            context.subscriptions
        );
    }

    private static getHtmlContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        // Read HTML template
        const htmlPath = vscode.Uri.joinPath(
            context.extensionUri,
            'src',
            'webview',
            'content',
            'index.html'
        );

        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        // Generate nonce for CSP
        const nonce = this.getNonce();

        // Get webview CSP source
        const cspSource = webview.cspSource;

        // Replace placeholders
        html = html.replace(/{{nonce}}/g, nonce);
        html = html.replace(/{{cspSource}}/g, cspSource);

        return html;
    }

    private static getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
```

---

### Step 3: Update Extension Entry Point

Update `src/extension.ts` to use WebviewProvider:

```typescript
import * as vscode from 'vscode';
import { WebviewProvider } from './webview/WebviewProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('C4X extension is now active');

    // Register command
    const disposable = vscode.commands.registerCommand('c4x.openPreview', () => {
        WebviewProvider.show(context);
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    console.log('C4X extension is now deactivated');
}
```

---

### Step 4: Create WebviewProvider.ts (if not exists)

```bash
mkdir -p src/webview

cat > src/webview/WebviewProvider.ts << 'PROVIDER'
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class WebviewProvider {
    private static currentPanel: vscode.WebviewPanel | undefined;

    public static show(context: vscode.ExtensionContext) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If panel already exists, reveal it
        if (WebviewProvider.currentPanel) {
            WebviewProvider.currentPanel.reveal(column);
            return;
        }

        // Create new panel
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

        // Handle messages from webview
        panel.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'webviewReady':
                        console.log('Webview ready');
                        panel.webview.postMessage({
                            type: 'updateStatus',
                            payload: '✅ Communication established'
                        });
                        break;
                    case 'test':
                        console.log('Test message from webview:', message.payload);
                        vscode.window.showInformationMessage(\`Webview says: \${message.payload}\`);
                        break;
                    case 'loadSample':
                        panel.webview.postMessage({
                            type: 'renderDiagram',
                            payload: '<h2>📊 Sample C4 Diagram</h2><p>Coming in Phase 2 (M1: Parser)...</p>'
                        });
                        break;
                }
            },
            undefined,
            context.subscriptions
        );

        // Clean up when panel is closed
        panel.onDidDispose(
            () => {
                WebviewProvider.currentPanel = undefined;
            },
            null,
            context.subscriptions
        );
    }

    private static getHtmlContent(webview: vscode.Webview, context: vscode.ExtensionContext): string {
        const htmlPath = vscode.Uri.joinPath(
            context.extensionUri,
            'src',
            'webview',
            'content',
            'index.html'
        );

        let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

        const nonce = this.getNonce();
        const cspSource = webview.cspSource;

        html = html.replace(/{{nonce}}/g, nonce);
        html = html.replace(/{{cspSource}}/g, cspSource);

        return html;
    }

    private static getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
}
PROVIDER
```

---

## ✅ Acceptance Criteria

- [ ] `src/webview/content/index.html` exists with CSP meta tag
- [ ] `src/webview/WebviewProvider.ts` exists with webview logic
- [ ] `src/extension.ts` registers `c4x.openPreview` command
- [ ] Extension builds successfully
- [ ] Extension activates without errors
- [ ] Command "C4X: Open Preview" appears in Command Palette
- [ ] Running command opens webview with "Hello C4X!" message
- [ ] Webview uses VS Code theme colors
- [ ] CSP headers present (no inline script warnings)
- [ ] Bidirectional messaging works (buttons trigger extension responses)
- [ ] Webview can be closed and reopened

---

## 🧪 Programmatic Testing & Validation

### Test 1: Build and Activate

```bash
# Build extension
pnpm run build

# Check build succeeded
test -f dist/extension.js && echo "✅ Extension built" || { echo "❌ Build failed"; exit 1; }
```

### Test 2: Extension Activation (Programmatic)

```bash
cat > test/validate-webview.js << 'WEBVIEWTEST'
const vscode = require('vscode');

async function testWebview() {
    // Activate extension
    const ext = vscode.extensions.getExtension('c4x-contributors.c4x');
    if (!ext.isActive) {
        await ext.activate();
    }

    // Execute command
    await vscode.commands.executeCommand('c4x.openPreview');

    // Wait for webview
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('✅ Webview opened successfully');
    return true;
}

testWebview().catch(err => {
    console.error('❌ Webview test failed:', err);
    process.exit(1);
});
WEBVIEWTEST
```

### Test 3: Visual Validation with Playwright MCP

```bash
# This will be run by Activity 09's E2E tests
npx playwright test test/e2e/webview-visual.spec.ts

# Expected output:
# ✅ Hello Webview renders correctly
# ✅ Webview has correct CSP headers
```

### Test 4: CSP Headers Validation

```bash
cat > scripts/validate-csp.sh << 'CSPCHECK'
#!/bin/bash

echo "🔒 Validating Content Security Policy..."

# Check HTML has CSP meta tag
if grep -q 'Content-Security-Policy' src/webview/content/index.html; then
    echo "✅ CSP meta tag found"
else
    echo "❌ CSP meta tag missing"
    exit 1
fi

# Check CSP includes nonce
if grep -q 'nonce-{{nonce}}' src/webview/content/index.html; then
    echo "✅ Nonce placeholder found"
else
    echo "❌ Nonce placeholder missing"
    exit 1
fi

# Check no inline scripts (except with nonce)
if grep -q '<script>' src/webview/content/index.html | grep -v 'nonce='; then
    echo "⚠️  Warning: Found script tags without nonce"
fi

echo "✅ CSP validation passed"
CSPCHECK

chmod +x scripts/validate-csp.sh
bash scripts/validate-csp.sh
```

---

## 🤖 Automated Validation Script

```bash
cat > scripts/validate-webview.sh << 'VALIDATE'
#!/bin/bash
set -e

echo "🧪 Validating Hello Webview Demo..."

# Test 1: Build
echo "Test 1: Building extension..."
pnpm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build succeeded"

# Test 2: Check files exist
echo "Test 2: Checking files..."
test -f src/webview/content/index.html || { echo "❌ index.html missing"; exit 1; }
test -f src/webview/WebviewProvider.ts || { echo "❌ WebviewProvider.ts missing"; exit 1; }
echo "✅ All files present"

# Test 3: CSP validation
echo "Test 3: Validating CSP..."
bash scripts/validate-csp.sh || { echo "❌ CSP validation failed"; exit 1; }
echo "✅ CSP validated"

# Test 4: Check for inline scripts (security)
echo "Test 4: Security check..."
INLINE_SCRIPTS=$(grep -c '<script>' src/webview/content/index.html || echo "0")
NONCE_SCRIPTS=$(grep -c 'nonce=' src/webview/content/index.html || echo "0")

if [ "$INLINE_SCRIPTS" -eq "$NONCE_SCRIPTS" ]; then
    echo "✅ All scripts use nonce"
else
    echo "❌ Found inline scripts without nonce"
    exit 1
fi

echo ""
echo "🎉 Hello Webview validation passed!"
echo ""
echo "📋 Next Steps:"
echo "  1. Launch Extension Development Host (F5)"
echo "  2. Run command: C4X: Open Preview"
echo "  3. Verify 'Hello C4X!' appears"
echo "  4. Test buttons work"
echo "  5. Run Activity 09 E2E tests for programmatic validation"
VALIDATE

chmod +x scripts/validate-webview.sh
bash scripts/validate-webview.sh
```

---

## 🚨 Troubleshooting

### Issue: Webview shows blank screen

**Solution**: Check Developer Tools (Help → Toggle Developer Tools)
- Look for CSP violations
- Check if nonce replacement worked
- Verify HTML file loaded correctly

### Issue: CSP violations in console

**Solution**: Ensure all `<script>` tags have `nonce="{{nonce}}"` attribute

### Issue: Cannot read property 'fsPath' of undefined

**Solution**: Check `localResourceRoots` in WebviewPanel options includes correct paths

### Issue: Webview doesn't update after code changes

**Solution**: Restart Extension Development Host (Ctrl+Shift+F5)

---

## 🤖 Agent Handoff Points

### Trigger QA Agent for Validation

```bash
# QA Agent runs full validation
bash scripts/validate-webview.sh

# Then runs E2E visual tests (from Activity 09)
bash scripts/validate-e2e.sh
```

### Trigger Code Review Agent

```
/review-code Review Hello Webview implementation for Phase 1 Activity 06. Check CSP compliance, webview architecture, and messaging implementation.
```

---

## 📊 Progress Tracking

**Mark Complete When**:
- All acceptance criteria checked ✅
- `bash scripts/validate-webview.sh` passes
- Manual test in Extension Development Host succeeds
- E2E visual tests pass (Activity 09)
- Code Review Agent approved

---

## 📚 References

- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Content Security Policy](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [VS Code Theming](https://code.visualstudio.com/api/references/theme-color)

---

**Activity Owner**: Any autonomous agent
**Last Updated**: 2025-10-19
**Next Activity**: [07-content-security-policy.md](./07-content-security-policy.md)
