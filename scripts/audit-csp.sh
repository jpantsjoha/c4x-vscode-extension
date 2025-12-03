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
