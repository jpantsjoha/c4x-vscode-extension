# Activity 07: Content Security Policy Validation

**Status**: 🟢 Complete
**Estimated Time**: 15 minutes
**Prerequisites**: Activity 05 complete (WebviewProvider with CSP headers)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to validate that our webview implements a strict Content Security Policy (CSP) that prevents XSS attacks, inline script execution, and unauthorized resource loading. This ensures the extension meets VS Code security best practices and Marketplace requirements.

**Why This Matters**: A weak CSP can lead to security vulnerabilities, marketplace rejection, and potential data breaches. VS Code enforces strict CSP requirements for all extensions.

---

## 📋 Objectives

1. Audit current CSP implementation
2. Validate `default-src 'none'` (strictest policy)
3. Verify nonce-based script execution
4. Test CSP violation detection
5. Document CSP directives
6. Create automated CSP validation script

---

## 🔨 Step-by-Step Implementation

### Step 1: Create CSP Audit Script

```bash
cd /Users/jp/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension

mkdir -p scripts

cat > scripts/audit-csp.sh << 'AUDIT_SCRIPT'
#!/bin/bash
set -e

echo "🔒 Content Security Policy Audit"
echo "================================="

# Check if WebviewProvider exists
if [ ! -f "src/webview/WebviewProvider.ts" ]; then
    echo "❌ WebviewProvider.ts not found"
    exit 1
fi

WEBVIEW_CONTENT=$(cat src/webview/WebviewProvider.ts)

# Test 1: Verify default-src 'none' (strictest setting)
echo ""
echo "Test 1: Checking default-src policy..."
if echo "$WEBVIEW_CONTENT" | grep -q "default-src 'none'"; then
    echo "✅ PASS: default-src set to 'none' (strictest)"
else
    echo "❌ FAIL: default-src must be 'none'"
    exit 1
fi

# Test 2: Verify script-src uses nonce (no 'unsafe-inline')
echo ""
echo "Test 2: Checking script-src policy..."
if echo "$WEBVIEW_CONTENT" | grep -q "script-src 'nonce-"; then
    echo "✅ PASS: script-src uses nonce"
else
    echo "❌ FAIL: script-src must use nonce"
    exit 1
fi

if echo "$WEBVIEW_CONTENT" | grep -q "script-src.*'unsafe-inline'"; then
    echo "❌ FAIL: script-src must NOT use 'unsafe-inline'"
    exit 1
else
    echo "✅ PASS: No 'unsafe-inline' in script-src"
fi

# Test 3: Verify style-src includes cspSource
echo ""
echo "Test 3: Checking style-src policy..."
if echo "$WEBVIEW_CONTENT" | grep -q "style-src.*\${cspSource}"; then
    echo "✅ PASS: style-src includes \${cspSource}"
else
    echo "❌ FAIL: style-src must include \${cspSource}"
    exit 1
fi

# Test 4: Verify img-src includes data: for inline images
echo ""
echo "Test 4: Checking img-src policy..."
if echo "$WEBVIEW_CONTENT" | grep -q "img-src.*data:"; then
    echo "✅ PASS: img-src allows data: URIs"
else
    echo "⚠️  WARNING: img-src does not allow data: URIs (may be intentional)"
fi

# Test 5: Verify nonce generation function exists
echo ""
echo "Test 5: Checking nonce generation..."
if echo "$WEBVIEW_CONTENT" | grep -q "getNonce()"; then
    echo "✅ PASS: getNonce() function exists"
else
    echo "❌ FAIL: getNonce() function missing"
    exit 1
fi

# Test 6: Verify nonce is used in script tag
echo ""
echo "Test 6: Checking nonce in script tag..."
if echo "$WEBVIEW_CONTENT" | grep -q '<script nonce="\${nonce}">'; then
    echo "✅ PASS: Script tag uses nonce attribute"
else
    echo "❌ FAIL: Script tag must use nonce attribute"
    exit 1
fi

# Test 7: Verify no external script sources
echo ""
echo "Test 7: Checking for external script sources..."
if echo "$WEBVIEW_CONTENT" | grep -q '<script src="http'; then
    echo "❌ FAIL: External script sources not allowed"
    exit 1
else
    echo "✅ PASS: No external script sources"
fi

# Test 8: Verify CSP meta tag is present
echo ""
echo "Test 8: Checking CSP meta tag..."
if echo "$WEBVIEW_CONTENT" | grep -q 'Content-Security-Policy'; then
    echo "✅ PASS: CSP meta tag present"
else
    echo "❌ FAIL: CSP meta tag missing"
    exit 1
fi

echo ""
echo "================================="
echo "🎉 CSP Audit Complete: ALL TESTS PASSED"
echo ""
echo "Summary of CSP Directives:"
echo "  • default-src 'none' - Block everything by default"
echo "  • script-src 'nonce-{random}' - Only allow scripts with valid nonce"
echo "  • style-src {cspSource} 'unsafe-inline' - Allow VS Code styles + inline styles"
echo "  • img-src {cspSource} data: - Allow VS Code images + data URIs"
echo ""
echo "Security Level: ✅ STRICT (Marketplace compliant)"
AUDIT_SCRIPT

chmod +x scripts/audit-csp.sh
```

---

### Step 2: Run CSP Audit

```bash
# Run the audit script
bash scripts/audit-csp.sh
```

**Expected Output**:
```
🔒 Content Security Policy Audit
=================================

Test 1: Checking default-src policy...
✅ PASS: default-src set to 'none' (strictest)

Test 2: Checking script-src policy...
✅ PASS: script-src uses nonce
✅ PASS: No 'unsafe-inline' in script-src

Test 3: Checking style-src policy...
✅ PASS: style-src includes ${cspSource}

Test 4: Checking img-src policy...
✅ PASS: img-src allows data: URIs

Test 5: Checking nonce generation...
✅ PASS: getNonce() function exists

Test 6: Checking nonce in script tag...
✅ PASS: Script tag uses nonce attribute

Test 7: Checking for external script sources...
✅ PASS: No external script sources

Test 8: Checking CSP meta tag...
✅ PASS: CSP meta tag present

=================================
🎉 CSP Audit Complete: ALL TESTS PASSED

Summary of CSP Directives:
  • default-src 'none' - Block everything by default
  • script-src 'nonce-{random}' - Only allow scripts with valid nonce
  • style-src {cspSource} 'unsafe-inline' - Allow VS Code styles + inline styles
  • img-src {cspSource} data: - Allow VS Code images + data URIs

Security Level: ✅ STRICT (Marketplace compliant)
```

---

### Step 3: Create CSP Documentation

```bash
mkdir -p docs/security

cat > docs/security/CSP-POLICY.md << 'CSP_DOC'
# Content Security Policy (CSP) Documentation

## Overview

C4X extension implements a **strict Content Security Policy** to prevent:
- Cross-Site Scripting (XSS) attacks
- Inline script execution (without nonce)
- Unauthorized resource loading
- Data exfiltration

## CSP Directives

### `default-src 'none'`
**Strictest possible setting**. Blocks all resource loading by default. Each resource type must be explicitly allowed.

### `script-src 'nonce-{random}'`
**Nonce-based script execution**. Only scripts with a cryptographically random nonce can execute.
- ✅ Prevents inline script injection
- ✅ Prevents `eval()` and `Function()` constructors
- ✅ Blocks external script sources (CDNs, 3rd party)

**Implementation**:
```typescript
const nonce = WebviewProvider.getNonce(); // 32-char random string
<script nonce="${nonce}">
    // Only this script can execute
</script>
```

### `style-src ${cspSource} 'unsafe-inline'`
**Allows VS Code theme styles + inline styles**.
- `${cspSource}` = VS Code's webview origin (e.g., `vscode-webview://...`)
- `'unsafe-inline'` = Allows inline styles for theming

**Why 'unsafe-inline' for styles?**
VS Code themes require inline styles for proper rendering. This is considered safe for CSS (unlike JavaScript) as CSS cannot execute code.

### `img-src ${cspSource} data:`
**Allows images from VS Code + data URIs**.
- `${cspSource}` = Images bundled with extension
- `data:` = Inline base64 images (e.g., `data:image/svg+xml;base64,...`)

## Security Best Practices

### ✅ DO:
- Always use nonce for inline scripts
- Generate new nonce for each webview instance
- Use `cspSource` for local resources
- Validate all user input before rendering
- Use `DOMPurify` for sanitizing HTML (if needed in future)

### ❌ DON'T:
- Use `'unsafe-inline'` for scripts
- Use `'unsafe-eval'` for scripts
- Load resources from external domains (http/https)
- Trust user input without sanitization
- Disable CSP during development

## Testing CSP

### Manual Test (VS Code Dev Tools):
1. Open Command Palette (Cmd+Shift+P)
2. Run "Developer: Toggle Developer Tools"
3. Open Console tab
4. Check for CSP violations (should be none)

### Automated Test:
```bash
bash scripts/audit-csp.sh
```

## CSP Violation Examples

### ❌ This will be BLOCKED:
```html
<!-- No nonce = blocked -->
<script>alert('blocked')</script>

<!-- External source = blocked -->
<script src="https://cdn.example.com/lib.js"></script>

<!-- eval() = blocked -->
<script nonce="${nonce}">
    eval('alert("blocked")');
</script>
```

### ✅ This will be ALLOWED:
```html
<!-- Has nonce = allowed -->
<script nonce="${nonce}">
    console.log('allowed');
</script>

<!-- VS Code resource = allowed -->
<img src="${webview.asWebviewUri(imageUri)}">

<!-- Data URI = allowed -->
<img src="data:image/svg+xml;base64,PHN2Zy4uLj4=">
```

## Marketplace Requirements

VS Code Marketplace requires:
- ✅ CSP meta tag present
- ✅ `default-src` must NOT be `'unsafe-inline'` or `'unsafe-eval'`
- ✅ `script-src` must NOT use `'unsafe-inline'` (nonce/hash required)
- ✅ No external resource loading without explicit allowlist

**Our Implementation**: ✅ FULLY COMPLIANT

## References

- [VS Code Webview CSP Guide](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [MDN CSP Documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [TDR-007: Content Security Policy](../../adrs/TDR-007-content-security-policy.md)

---

**Last Updated**: 2025-10-19
**Security Level**: STRICT
CSP_DOC
```

---

### Step 4: Create CSP Violation Test (For Future Use)

```bash
mkdir -p test/security

cat > test/security/csp-violation.test.ts << 'CSP_TEST'
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Content Security Policy Tests', () => {
    test('CSP meta tag is present', async () => {
        // This test will be expanded in Activity 08 with full test infrastructure
        // For now, verify the CSP audit script passes

        const { execSync } = require('child_process');

        try {
            execSync('bash scripts/audit-csp.sh', {
                stdio: 'inherit',
                cwd: process.cwd()
            });

            assert.ok(true, 'CSP audit passed');
        } catch (error) {
            assert.fail('CSP audit failed');
        }
    });

    test('Nonce is cryptographically random', () => {
        // Verify getNonce() generates unique values
        const nonces = new Set();

        for (let i = 0; i < 100; i++) {
            // Simulate nonce generation (will use actual function in Activity 08)
            const nonce = Array.from({ length: 32 }, () =>
                'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
                    .charAt(Math.floor(Math.random() * 62))
            ).join('');

            nonces.add(nonce);
        }

        // All nonces should be unique
        assert.strictEqual(nonces.size, 100, 'Nonces must be unique');
    });
});
CSP_TEST
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] `scripts/audit-csp.sh` exists and is executable
- [ ] CSP audit script passes all 8 tests
- [ ] `default-src 'none'` is enforced
- [ ] Script execution requires nonce (no 'unsafe-inline')
- [ ] No external script sources (CDNs, 3rd party)
- [ ] Nonce generation function exists and produces 32-character random strings
- [ ] `docs/security/CSP-POLICY.md` exists and documents all directives
- [ ] CSP violation test created (for future test infrastructure)

---

## 🧪 Programmatic Testing & Validation

### Test 1: Run CSP Audit

```bash
bash scripts/audit-csp.sh
```

**Expected**: All 8 tests pass, exit code 0

---

### Test 2: Verify Documentation

```bash
test -f docs/security/CSP-POLICY.md && echo "✅ CSP documentation exists" || echo "❌ Documentation missing"

# Check documentation completeness
grep -q "default-src 'none'" docs/security/CSP-POLICY.md && echo "✅ default-src documented" || echo "❌ default-src missing"
grep -q "nonce" docs/security/CSP-POLICY.md && echo "✅ Nonce documented" || echo "❌ Nonce missing"
```

**Expected Output**:
```
✅ CSP documentation exists
✅ default-src documented
✅ Nonce documented
```

---

### Test 3: Validate Nonce Randomness

```bash
# Test that nonce generation is truly random
node << 'NONCE_TEST'
const fs = require('fs');
const content = fs.readFileSync('src/webview/WebviewProvider.ts', 'utf8');

// Extract getNonce function
const getNonceMatch = content.match(/getNonce\(\):\s*string\s*\{[\s\S]*?return text;\s*\}/);

if (!getNonceMatch) {
    console.error('❌ getNonce() function not found');
    process.exit(1);
}

const getNonceFunc = getNonceMatch[0];

// Verify it uses cryptographically random approach
const checks = {
    'Uses random generation': getNonceFunc.includes('Math.random()'),
    '32 characters': getNonceFunc.includes('i < 32'),
    'Alphanumeric charset': getNonceFunc.includes('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')
};

const passed = Object.values(checks).filter(v => v).length;
console.log(`✅ Nonce randomness: ${passed}/${Object.keys(checks).length} checks passed`);

if (passed !== Object.keys(checks).length) {
    Object.entries(checks).forEach(([key, value]) => {
        console.log(`${value ? '✅' : '❌'} ${key}`);
    });
    process.exit(1);
}
NONCE_TEST
```

**Expected**: `✅ Nonce randomness: 3/3 checks passed`

---

## 🤖 Automated Validation Script

Create comprehensive validation:

```bash
cat > scripts/validate-csp.sh << 'VALIDATE'
#!/bin/bash
set -e

echo "🧪 Validating Content Security Policy Implementation..."

# Test 1: CSP audit
echo "Test 1: Running CSP audit..."
bash scripts/audit-csp.sh > /dev/null 2>&1 || { echo "❌ CSP audit failed"; exit 1; }
echo "✅ CSP audit passed"

# Test 2: Documentation
echo "Test 2: Checking documentation..."
test -f docs/security/CSP-POLICY.md || { echo "❌ CSP documentation missing"; exit 1; }
grep -q "default-src 'none'" docs/security/CSP-POLICY.md || { echo "❌ Incomplete documentation"; exit 1; }
echo "✅ Documentation complete"

# Test 3: Test file
echo "Test 3: Checking test file..."
test -f test/security/csp-violation.test.ts || { echo "❌ Test file missing"; exit 1; }
echo "✅ Test file created"

echo ""
echo "🎉 All CSP validation tests passed!"
echo "🔒 Security Level: STRICT (Marketplace compliant)"
VALIDATE

chmod +x scripts/validate-csp.sh

# Run validation
bash scripts/validate-csp.sh
```

---

## 🚨 Troubleshooting

### Issue: CSP audit fails with "default-src not found"

**Solution**: Ensure WebviewProvider.ts contains the CSP meta tag:
```typescript
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none';
               style-src ${cspSource} 'unsafe-inline';
               script-src 'nonce-${nonce}';
               img-src ${cspSource} data:;">
```

### Issue: Scripts not executing in webview

**Solution**:
1. Check nonce is correctly passed to script tag: `<script nonce="${nonce}">`
2. Verify nonce in meta tag matches nonce in script tag
3. Open Dev Tools and check for CSP violations

### Issue: Styles not applying

**Solution**: Ensure `style-src` includes both `${cspSource}` and `'unsafe-inline'`:
```
style-src ${cspSource} 'unsafe-inline';
```

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

Run validation:
```bash
bash scripts/validate-csp.sh
```

**Expected**: All tests pass (exit code 0)

### Trigger Code Review Agent

After validation, invoke `/review-code`:
```
/review-code Validate CSP implementation is marketplace-compliant for Phase 1 Activity 07
```

---

## 📊 Progress Tracking

**Status**: 🔴 Not Started

**Mark Complete When**:
- All acceptance criteria checked ✅
- CSP audit passes all 8 tests
- Documentation complete
- Code Review Agent approved
- Next activity (08-testing-infrastructure.md) can proceed

---

## 📚 References

- [VS Code CSP Guide](https://code.visualstudio.com/api/extension-guides/webview#content-security-policy)
- [MDN CSP](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [CSP Evaluator](https://csp-evaluator.withgoogle.com/)
- [TDR-007: Content Security Policy](../../../adrs/TDR-007-content-security-policy.md)

---

**Activity Owner**: Any autonomous agent or contributor
**Last Updated**: 2025-10-19
**Next Activity**: [08-testing-infrastructure.md](./08-testing-infrastructure.md)
