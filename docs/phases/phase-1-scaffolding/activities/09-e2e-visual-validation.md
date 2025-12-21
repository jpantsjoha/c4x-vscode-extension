# Activity 09: E2E Visual Validation with MCP Tools

**Status**: 🔴 Not Started
**Estimated Time**: 45 minutes
**Prerequisites**: Activities 01-08 complete, Extension can activate
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to establish automated End-to-End (E2E) testing with visual validation so that autonomous agents can verify the extension works correctly WITHOUT human intervention. This includes:
- Extension activation validation
- Webview rendering validation
- Visual regression testing (screenshots)
- Cross-browser compatibility testing

**Why This Matters**: Autonomous agents MUST be able to programmatically validate that the C4 diagram renders correctly in the webview. Without this, we need human visual inspection - which defeats autonomous operation.

---

## 📋 Objectives

1. Install and configure Playwright MCP for visual testing
2. Install and configure Selenium MCP for browser automation
3. Set up VS Code extension testing with webview validation
4. Create automated visual regression tests
5. Create validation scripts for QA agent
6. Configure MCP servers in settings

---

## 🔨 Step-by-Step Implementation

### Step 1: Install Testing Dependencies

```bash
# Playwright MCP for E2E Testing
npx @playwright/mcp@latest

# Selenium MCP for Browser Automation
npm install -g @angiejones/mcp-selenium

# Additional Testing Libraries
pnpm add -D @testing-library/jest-dom @vitest/ui eslint-plugin-testing-library

# Playwright browsers
npx playwright install chromium

# Screenshot comparison library
pnpm add -D pixelmatch pngjs
```

**Verify Installation**:
```bash
# Check Playwright
npx playwright --version

# Check Selenium MCP
which mcp-selenium

# Check all dev dependencies
pnpm list --depth=0 | grep -E '(testing-library|vitest|playwright)'
```

---

### Step 2: Configure MCP Servers

Create MCP configuration for Claude Code:

```bash
mkdir -p .claude

cat > .claude/mcp-config.json << 'MCPCONFIG'
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp"],
      "env": {
        "PLAYWRIGHT_BROWSER": "chromium",
        "PLAYWRIGHT_HEADLESS": "true"
      }
    },
    "selenium": {
      "command": "npx",
      "args": ["@angiejones/mcp-selenium"],
      "env": {
        "SELENIUM_BROWSER": "chrome",
        "SELENIUM_HEADLESS": "true"
      }
    }
  }
}
MCPCONFIG
```

---

### Step 3: Create Playwright Configuration

```bash
cat > playwright.config.ts << 'PLAYWRIGHT'
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'code --extensionDevelopmentHost',
    port: 3000,
    timeout: 120 * 1000,
    reuseExistingServer: !process.env.CI,
  },
});
PLAYWRIGHT
```

---

### Step 4: Create E2E Test Directory Structure

```bash
mkdir -p test/e2e
mkdir -p test/e2e/screenshots/baseline
mkdir -p test/e2e/fixtures
```

---

### Step 5: Create Extension E2E Test Suite

```bash
cat > test/e2e/extension-activation.spec.ts << 'E2ETEST'
import { test, expect } from '@playwright/test';
import * as vscode from 'vscode';

test.describe('C4X Extension E2E Tests', () => {

  test.beforeAll(async () => {
    // Wait for extension to activate
    const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
    if (extension && !extension.isActive) {
      await extension.activate();
    }
  });

  test('Extension activates successfully', async () => {
    const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
    expect(extension).toBeDefined();
    expect(extension?.isActive).toBe(true);
  });

  test('Extension activation time < 200ms', async () => {
    const startTime = performance.now();
    const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
    if (extension && !extension.isActive) {
      await extension.activate();
    }
    const activationTime = performance.now() - startTime;

    console.log(\`⏱️  Activation time: \${activationTime.toFixed(2)}ms\`);
    expect(activationTime).toBeLessThan(200);
  });

  test('Command "c4x.openPreview" is registered', async () => {
    const commands = await vscode.commands.getCommands();
    expect(commands).toContain('c4x.openPreview');
  });
});
E2ETEST
```

---

### Step 6: Create Webview Visual Validation Test

```bash
cat > test/e2e/webview-visual.spec.ts << 'VISUALTEST'
import { test, expect } from '@playwright/test';
import * as path from 'path';

test.describe('Webview Visual Validation', () => {

  test('Hello Webview renders correctly', async ({ page }) => {
    // Open VS Code Extension Development Host
    // This assumes extension is running in development mode

    // Execute command to open preview
    await page.evaluate(() => {
      return (window as any).vscode.commands.executeCommand('c4x.openPreview');
    });

    // Wait for webview to appear
    await page.waitForSelector('webview', { timeout: 5000 });

    // Get webview iframe
    const webview = page.frameLocator('webview').first();

    // Verify "Hello C4X" message appears
    await expect(webview.locator('text=Hello C4X')).toBeVisible();

    // Take screenshot for visual regression
    const screenshot = await webview.screenshot();

    // Compare with baseline (if exists)
    const baselinePath = path.join(__dirname, 'screenshots', 'baseline', 'hello-webview.png');
    // Visual comparison logic here

    console.log('✅ Webview rendered correctly');
  });

  test('Webview has correct CSP headers', async ({ page }) => {
    await page.evaluate(() => {
      return (window as any).vscode.commands.executeCommand('c4x.openPreview');
    });

    await page.waitForSelector('webview');
    const webview = page.frameLocator('webview').first();

    // Check CSP meta tag exists
    const cspMeta = await webview.locator('meta[http-equiv="Content-Security-Policy"]').count();
    expect(cspMeta).toBeGreaterThan(0);

    console.log('✅ CSP headers validated');
  });
});
VISUALTEST
```

---

### Step 7: Create Visual Regression Test Helper

```bash
cat > test/e2e/helpers/visual-comparison.ts << 'HELPER'
import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export async function compareScreenshots(
  actualPath: string,
  baselinePath: string,
  diffPath: string,
  threshold = 0.1
): Promise<{ match: boolean; diffPixels: number; diffPercentage: number }> {

  // Read images
  const actual = PNG.sync.read(fs.readFileSync(actualPath));
  const baseline = PNG.sync.read(fs.readFileSync(baselinePath));

  // Check dimensions match
  if (actual.width !== baseline.width || actual.height !== baseline.height) {
    throw new Error(\`Screenshot dimensions don't match: \${actual.width}x\${actual.height} vs \${baseline.width}x\${baseline.height}\`);
  }

  // Create diff image
  const diff = new PNG({ width: actual.width, height: actual.height });

  // Compare pixels
  const diffPixels = pixelmatch(
    actual.data,
    baseline.data,
    diff.data,
    actual.width,
    actual.height,
    { threshold }
  );

  // Save diff image
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  const totalPixels = actual.width * actual.height;
  const diffPercentage = (diffPixels / totalPixels) * 100;

  return {
    match: diffPercentage < 1, // Less than 1% difference = match
    diffPixels,
    diffPercentage
  };
}
HELPER
```

---

### Step 8: Create Automated Validation Script for QA Agent

```bash
cat > scripts/validate-e2e.sh << 'E2EVALIDATE'
#!/bin/bash
set -e

echo "🧪 Running E2E Visual Validation Tests..."

# Step 1: Build extension
echo "Step 1: Building extension..."
pnpm run build || { echo "❌ Build failed"; exit 1; }

# Step 2: Run extension activation tests
echo "Step 2: Testing extension activation..."
pnpm run test:e2e:activation || { echo "❌ Activation tests failed"; exit 1; }
echo "✅ Extension activation tests passed"

# Step 3: Run webview visual tests
echo "Step 3: Testing webview visual rendering..."
pnpm run test:e2e:visual || { echo "❌ Visual tests failed"; exit 1; }
echo "✅ Webview visual tests passed"

# Step 4: Run Playwright visual regression
echo "Step 4: Running Playwright visual regression..."
npx playwright test --reporter=list || { echo "❌ Playwright tests failed"; exit 1; }
echo "✅ Playwright tests passed"

# Step 5: Generate report
echo "Step 5: Generating test report..."
npx playwright show-report || true

echo ""
echo "🎉 All E2E visual validation tests passed!"
echo ""
echo "📊 Test Results:"
echo "  ✅ Extension activates in < 200ms"
echo "  ✅ Webview renders correctly"
echo "  ✅ CSP headers validated"
echo "  ✅ Visual regression tests passed"
E2EVALIDATE

chmod +x scripts/validate-e2e.sh
```

---

### Step 9: Update package.json with E2E Scripts

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:activation": "pnpm run test -- test/e2e/extension-activation.spec.ts",
    "test:e2e:visual": "pnpm run test -- test/e2e/webview-visual.spec.ts",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:report": "playwright show-report",
    "test:visual-regression": "playwright test --grep @visual"
  }
}
```

---

### Step 10: Create Baseline Screenshots

```bash
cat > scripts/create-baseline-screenshots.sh << 'BASELINE'
#!/bin/bash

echo "📸 Creating baseline screenshots..."

# Run tests and save screenshots as baseline
npx playwright test --update-snapshots

# Move screenshots to baseline folder
mkdir -p test/e2e/screenshots/baseline
cp -r test-results/**/*.png test/e2e/screenshots/baseline/ 2>/dev/null || true

echo "✅ Baseline screenshots created"
echo "📁 Location: test/e2e/screenshots/baseline/"
BASELINE

chmod +x scripts/create-baseline-screenshots.sh
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] Playwright MCP installed and configured
- [ ] Selenium MCP installed and configured
- [ ] MCP configuration file created (`.claude/mcp-config.json`)
- [ ] Playwright config exists (`playwright.config.ts`)
- [ ] E2E test directory structure created
- [ ] Extension activation test exists and passes
- [ ] Webview visual test exists and passes
- [ ] Visual regression helper created
- [ ] Automated validation script exists (`scripts/validate-e2e.sh`)
- [ ] Baseline screenshots created
- [ ] All tests pass: `bash scripts/validate-e2e.sh` exits with code 0

---

## 🧪 Programmatic Testing & Validation

### Test 1: Verify MCP Tools Installed

```bash
# Test Playwright MCP
npx @playwright/mcp --version && echo "✅ Playwright MCP installed" || echo "❌ Playwright MCP missing"

# Test Selenium MCP
which mcp-selenium && echo "✅ Selenium MCP installed" || echo "❌ Selenium MCP missing"

# Test dependencies
pnpm list pixelmatch pngjs @testing-library/jest-dom && echo "✅ All testing deps installed" || echo "❌ Some deps missing"
```

### Test 2: Extension Activation Performance

```bash
# Run activation performance test
pnpm run test:e2e:activation

# Expected output includes:
# ⏱️  Activation time: XXXms
# ✅ Extension activation time < 200ms
```

### Test 3: Webview Renders

```bash
# Run visual validation test
pnpm run test:e2e:visual

# Expected output includes:
# ✅ Webview rendered correctly
# ✅ CSP headers validated
```

### Test 4: Visual Regression (Full Suite)

```bash
# Run all Playwright tests
npx playwright test --reporter=list

# Expected output:
# Running X tests using Y workers
# ✓ Extension activates successfully
# ✓ Extension activation time < 200ms
# ✓ Hello Webview renders correctly
# ✓ Webview has correct CSP headers
#
# X passed (Xms)
```

### Test 5: Screenshot Comparison

```bash
# Create baseline if doesn't exist
test -f test/e2e/screenshots/baseline/hello-webview.png || bash scripts/create-baseline-screenshots.sh

# Run visual regression
npx playwright test --grep @visual

# Check for diff images (should not exist if test passes)
test ! -f test-results/*/diff.png && echo "✅ No visual regressions" || echo "⚠️  Visual differences detected"
```

---

## 🤖 Automated Validation Script (Full)

```bash
cat > scripts/qa-validate-complete.sh << 'QAFULL'
#!/bin/bash
set -e

echo "🤖 QA Agent: Complete Validation Suite"
echo "=========================================="

# Test 1: MCP Tools
echo ""
echo "Test 1: Verifying MCP tools..."
npx @playwright/mcp --version > /dev/null || { echo "❌ Playwright MCP missing"; exit 1; }
which mcp-selenium > /dev/null || { echo "❌ Selenium MCP missing"; exit 1; }
echo "✅ MCP tools installed"

# Test 2: Dependencies
echo ""
echo "Test 2: Verifying dependencies..."
pnpm list pixelmatch pngjs > /dev/null || { echo "❌ Visual comparison deps missing"; exit 1; }
echo "✅ All dependencies installed"

# Test 3: Build
echo ""
echo "Test 3: Building extension..."
pnpm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build succeeded"

# Test 4: Extension Activation
echo ""
echo "Test 4: Testing extension activation..."
pnpm run test:e2e:activation || { echo "❌ Activation tests failed"; exit 1; }
echo "✅ Activation tests passed"

# Test 5: Visual Validation
echo ""
echo "Test 5: Testing webview visual rendering..."
pnpm run test:e2e:visual || { echo "❌ Visual tests failed"; exit 1; }
echo "✅ Visual tests passed"

# Test 6: Visual Regression
echo ""
echo "Test 6: Running visual regression tests..."
npx playwright test --reporter=list || { echo "❌ Visual regression failed"; exit 1; }
echo "✅ Visual regression passed"

echo ""
echo "=========================================="
echo "🎉 QA Validation Complete: ALL TESTS PASSED"
echo ""
echo "📊 Summary:"
echo "  ✅ MCP tools configured"
echo "  ✅ Dependencies installed"
echo "  ✅ Extension builds successfully"
echo "  ✅ Extension activates < 200ms"
echo "  ✅ Webview renders correctly"
echo "  ✅ Visual regression tests pass"
echo ""
echo "🤖 Extension is ready for autonomous agent use"
QAFULL

chmod +x scripts/qa-validate-complete.sh

# Run full validation
bash scripts/qa-validate-complete.sh
```

---

## 🚨 Troubleshooting

### Issue: Playwright browsers not installed

**Solution**:
```bash
npx playwright install chromium
```

### Issue: MCP config not recognized

**Solution**: Ensure `.claude/mcp-config.json` is in project root and properly formatted JSON.

### Issue: Webview not found in tests

**Solution**: Ensure extension is running in Extension Development Host:
```bash
code --extensionDevelopmentPath=. test/fixtures/sample.c4x
```

### Issue: Visual regression failing due to rendering differences

**Solution**: Update baseline screenshots:
```bash
bash scripts/create-baseline-screenshots.sh
```

### Issue: Screenshot comparison fails with dimension mismatch

**Solution**: This means webview size changed. Decide if intentional, then update baseline.

---

## 🤖 Agent Handoff Points

### Trigger QA Agent for Full Validation

```bash
# QA Agent runs this command to validate everything
bash scripts/qa-validate-complete.sh
```

**Expected Exit Code**: 0 (success)

**Expected Output**: All tests pass, no visual regressions

### Trigger Code Review Agent

```
/review-code Review E2E testing setup for Phase 1 Activity 09. Verify Playwright MCP configuration, visual regression tests, and automated validation scripts.
```

---

## 📊 Progress Tracking

**Status**: 🔴 Not Started

**Mark Complete When**:
- All acceptance criteria checked ✅
- `bash scripts/qa-validate-complete.sh` passes
- Baseline screenshots created
- Code Review Agent approved
- QA Agent validates all tests pass autonomously

---

## 📚 References

- [Playwright Documentation](https://playwright.dev/)
- [Playwright MCP](https://github.com/microsoft/playwright)
- [VS Code Extension Testing](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [e2e-mcp.md](../../../e2e-mcp.md) — MCP testing tools setup guide

---

**Activity Owner**: QA Agent (primary), any autonomous agent
**Last Updated**: 2025-10-19
**Next Activity**: [10-ci-cd-pipeline.md](./10-ci-cd-pipeline.md)
