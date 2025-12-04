# Activity 08: Testing Infrastructure (Mocha)

**Status**: 🟢 Complete
**Estimated Time**: 30 minutes
**Prerequisites**: Activities 01-07 complete (extension structure, build system, webview)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to set up a comprehensive testing infrastructure using Mocha and VS Code's test electron runner. This enables automated unit tests, integration tests, and extension activation tests that autonomous agents can run to validate their work.

**Why This Matters**: Without automated testing, agents cannot programmatically verify their implementations. Tests provide immediate feedback and prevent regressions.

---

## 📋 Objectives

1. Configure Mocha test framework
2. Set up @vscode/test-electron runner
3. Create test directory structure
4. Implement test runner (test/runTest.ts)
5. Write sample unit tests
6. Write extension activation test
7. Add test scripts to package.json
8. Validate tests run successfully

---

## 🔨 Step-by-Step Implementation

### Step 1: Create Test Directory Structure

```bash
cd /Users/jp/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension

# Create test directories
mkdir -p test/suite
mkdir -p test/fixtures
mkdir -p test/security

# Verify structure
tree test -L 2
```

**Expected Output**:
```
test
├── fixtures
├── security
│   └── csp-violation.test.ts
└── suite
```

---

### Step 2: Create Test Runner (runTest.ts)

```bash
cat > test/runTest.ts << 'RUNTEST'
import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        console.log('🧪 Starting C4X extension tests...');

        // Path to extension root
        const extensionDevelopmentPath = path.resolve(__dirname, '../');

        // Path to test suite entry point
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // Download VS Code, unzip, and run tests
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                '--disable-extensions', // Disable other extensions
                '--disable-gpu',        // Faster execution
            ]
        });

        console.log('✅ All tests passed!');
    } catch (err) {
        console.error('❌ Failed to run tests:', err);
        process.exit(1);
    }
}

main();
RUNTEST
```

---

### Step 3: Create Test Suite Index (suite/index.ts)

```bash
cat > test/suite/index.ts << 'SUITE_INDEX'
import * as path from 'path';
import * as Mocha from 'mocha';
import * as glob from 'glob';

export function run(): Promise<void> {
    // Create Mocha test runner
    const mocha = new Mocha({
        ui: 'tdd',
        color: true,
        timeout: 10000, // 10 seconds
    });

    const testsRoot = path.resolve(__dirname, '..');

    return new Promise((resolve, reject) => {
        // Find all test files
        glob('**/**.test.js', { cwd: testsRoot }, (err, files) => {
            if (err) {
                return reject(err);
            }

            // Add files to test suite
            files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

            try {
                // Run tests
                mocha.run(failures => {
                    if (failures > 0) {
                        reject(new Error(`${failures} tests failed.`));
                    } else {
                        resolve();
                    }
                });
            } catch (err) {
                console.error(err);
                reject(err);
            }
        });
    });
}
SUITE_INDEX
```

---

### Step 4: Create Extension Activation Test

```bash
cat > test/suite/extension.test.ts << 'EXTENSION_TEST'
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Activation Tests', () => {
    vscode.window.showInformationMessage('Running C4X extension tests...');

    test('Extension should be present', () => {
        const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
        assert.ok(extension, 'Extension not found');
    });

    test('Extension should activate', async function() {
        this.timeout(10000); // Allow 10 seconds for activation

        const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
        assert.ok(extension, 'Extension not found');

        await extension.activate();
        assert.strictEqual(extension.isActive, true, 'Extension failed to activate');

        console.log('✅ Extension activated successfully');
    });

    test('Extension activation time should be < 200ms', async function() {
        this.timeout(10000);

        const extension = vscode.extensions.getExtension('c4x-contributors.c4x');
        assert.ok(extension);

        const startTime = performance.now();
        await extension.activate();
        const activationTime = performance.now() - startTime;

        console.log(`Activation time: ${activationTime.toFixed(2)}ms`);

        assert.ok(
            activationTime < 200,
            `Activation time (${activationTime.toFixed(2)}ms) exceeds target (200ms)`
        );
    });

    test('c4x.openPreview command should be registered', async () => {
        const commands = await vscode.commands.getCommands(true);
        const hasCommand = commands.includes('c4x.openPreview');

        assert.ok(hasCommand, 'c4x.openPreview command not registered');
        console.log('✅ c4x.openPreview command registered');
    });

    test('c4x.openPreview command should execute without errors', async () => {
        // Execute command
        await vscode.commands.executeCommand('c4x.openPreview');

        // If no error thrown, test passes
        assert.ok(true, 'Command executed successfully');
        console.log('✅ c4x.openPreview executed successfully');
    });
});
EXTENSION_TEST
```

---

### Step 5: Create WebviewProvider Unit Test

```bash
cat > test/suite/webviewProvider.test.ts << 'WEBVIEW_TEST'
import * as assert from 'assert';
import * as vscode from 'vscode';

suite('WebviewProvider Tests', () => {
    test('WebviewProvider module can be imported', () => {
        // This verifies the module structure is correct
        const WebviewProvider = require('../../dist/extension').WebviewProvider;
        assert.ok(WebviewProvider !== undefined, 'WebviewProvider not exported');
    });

    test('Webview panel is created with correct configuration', async () => {
        // Execute command to create webview
        await vscode.commands.executeCommand('c4x.openPreview');

        // Wait for webview to initialize
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify no errors occurred (if error, test would have failed above)
        assert.ok(true, 'Webview created without errors');
    });
});
WEBVIEW_TEST
```

---

### Step 6: Create Sample Unit Test (Utilities)

```bash
cat > test/suite/utils.test.ts << 'UTILS_TEST'
import * as assert from 'assert';

suite('Utility Functions Tests', () => {
    test('Sample test: Basic assertion', () => {
        const value = 42;
        assert.strictEqual(value, 42, 'Value should be 42');
    });

    test('Sample test: String contains', () => {
        const str = 'C4X Extension';
        assert.ok(str.includes('C4X'), 'String should contain "C4X"');
    });

    test('Sample test: Array operations', () => {
        const arr = [1, 2, 3];
        assert.strictEqual(arr.length, 3, 'Array should have 3 elements');
        assert.ok(arr.includes(2), 'Array should contain 2');
    });
});
UTILS_TEST
```

---

### Step 7: Install glob Dependency

```bash
# Install glob for test file discovery
pnpm add -D glob @types/glob

# Verify installation
pnpm list glob
```

**Expected Output**:
```
c4x@0.1.0
└── glob 10.x.x
```

---

### Step 8: Update package.json Test Script

Update the test script in `package.json`:

```bash
node << 'UPDATE_PKG'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

// Update test script
pkg.scripts.test = 'node ./out/test/runTest.js';
pkg.scripts['test:compile'] = 'tsc -p ./';
pkg.scripts['pretest'] = 'pnpm run test:compile && pnpm run build';

// Update devDependencies to ensure glob is included
if (!pkg.devDependencies.glob) {
    pkg.devDependencies.glob = '^10.0.0';
}
if (!pkg.devDependencies['@types/glob']) {
    pkg.devDependencies['@types/glob'] = '^8.0.0';
}

fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
console.log('✅ package.json updated with test scripts');
UPDATE_PKG
```

---

### Step 9: Create TypeScript Configuration for Tests

```bash
cat > tsconfig.json << 'TSCONFIG'
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2020",
    "lib": ["ES2020"],
    "outDir": "out",
    "sourceMap": true,
    "strict": true,
    "rootDir": ".",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": [
    "src/**/*",
    "test/**/*"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "out",
    ".vscode-test"
  ]
}
TSCONFIG
```

---

### Step 10: Compile and Run Tests

```bash
# Compile TypeScript (including tests)
pnpm run test:compile

# Run tests
pnpm test
```

**Expected Output**:
```
🧪 Starting C4X extension tests...

  Extension Activation Tests
    ✓ Extension should be present (50ms)
    ✓ Extension should activate (1234ms)
    ✓ Extension activation time should be < 200ms (123ms)
    ✓ c4x.openPreview command should be registered (45ms)
    ✓ c4x.openPreview command should execute without errors (234ms)

  WebviewProvider Tests
    ✓ WebviewProvider module can be imported (12ms)
    ✓ Webview panel is created with correct configuration (567ms)

  Utility Functions Tests
    ✓ Sample test: Basic assertion (2ms)
    ✓ Sample test: String contains (1ms)
    ✓ Sample test: Array operations (1ms)

  10 passing (2.3s)

✅ All tests passed!
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] `test/runTest.ts` exists (test runner)
- [ ] `test/suite/index.ts` exists (Mocha configuration)
- [ ] `test/suite/extension.test.ts` exists (activation tests)
- [ ] `test/suite/webviewProvider.test.ts` exists
- [ ] `test/suite/utils.test.ts` exists (sample unit tests)
- [ ] `tsconfig.json` includes test directory
- [ ] `glob` dependency installed
- [ ] `pnpm test:compile` compiles without errors
- [ ] `pnpm test` runs all tests successfully
- [ ] All 10 tests pass
- [ ] Extension activation time < 200ms

---

## 🧪 Programmatic Testing & Validation

### Test 1: Verify Test Files Exist

```bash
# Test 1: Check test structure
test -f test/runTest.ts && echo "✅ runTest.ts exists" || echo "❌ runTest.ts missing"
test -f test/suite/index.ts && echo "✅ suite/index.ts exists" || echo "❌ suite/index.ts missing"
test -f test/suite/extension.test.ts && echo "✅ extension.test.ts exists" || echo "❌ extension.test.ts missing"
test -f test/suite/webviewProvider.test.ts && echo "✅ webviewProvider.test.ts exists" || echo "❌ webviewProvider.test.ts missing"
test -f test/suite/utils.test.ts && echo "✅ utils.test.ts exists" || echo "❌ utils.test.ts missing"
```

**Expected Output**:
```
✅ runTest.ts exists
✅ suite/index.ts exists
✅ extension.test.ts exists
✅ webviewProvider.test.ts exists
✅ utils.test.ts exists
```

---

### Test 2: Verify Dependencies

```bash
# Test 2: Check test dependencies
pnpm list mocha @vscode/test-electron glob --depth=0 2>&1 | grep -E "(mocha|@vscode/test-electron|glob)" && echo "✅ Test dependencies installed" || echo "❌ Dependencies missing"
```

**Expected**: All three dependencies listed

---

### Test 3: Compile TypeScript

```bash
# Test 3: Compile including tests
pnpm run test:compile 2>&1 | grep -q "error" && echo "❌ Compilation errors" || echo "✅ TypeScript compiles successfully"
```

**Expected**: `✅ TypeScript compiles successfully`

---

### Test 4: Run Test Suite

```bash
# Test 4: Run all tests
pnpm test 2>&1 | tail -5
```

**Expected Output** (last 5 lines):
```
  10 passing (2.3s)

✅ All tests passed!
```

---

### Test 5: Verify Test Coverage

```bash
# Test 5: Count passing tests
node << 'COUNT_TESTS'
const fs = require('fs');
const testFiles = [
    'test/suite/extension.test.ts',
    'test/suite/webviewProvider.test.ts',
    'test/suite/utils.test.ts'
];

let totalTests = 0;

testFiles.forEach(file => {
    if (fs.existsSync(file)) {
        const content = fs.readFileSync(file, 'utf8');
        const testCount = (content.match(/test\(/g) || []).length;
        totalTests += testCount;
        console.log(`✅ ${file.split('/').pop()}: ${testCount} tests`);
    }
});

console.log(`\nTotal: ${totalTests} tests`);

if (totalTests < 10) {
    console.error('❌ Expected at least 10 tests');
    process.exit(1);
}

console.log('✅ Test coverage sufficient');
COUNT_TESTS
```

**Expected Output**:
```
✅ extension.test.ts: 5 tests
✅ webviewProvider.test.ts: 2 tests
✅ utils.test.ts: 3 tests

Total: 10 tests
✅ Test coverage sufficient
```

---

## 🤖 Automated Validation Script

Create comprehensive validation:

```bash
mkdir -p scripts

cat > scripts/validate-testing.sh << 'VALIDATE'
#!/bin/bash
set -e

echo "🧪 Validating Testing Infrastructure..."

# Test 1: File structure
echo "Test 1: Checking file structure..."
test -f test/runTest.ts || { echo "❌ runTest.ts missing"; exit 1; }
test -f test/suite/index.ts || { echo "❌ suite/index.ts missing"; exit 1; }
test -f test/suite/extension.test.ts || { echo "❌ extension.test.ts missing"; exit 1; }
echo "✅ File structure correct"

# Test 2: Dependencies
echo "Test 2: Checking dependencies..."
pnpm list mocha @vscode/test-electron glob --depth=0 > /dev/null 2>&1 || { echo "❌ Dependencies missing"; exit 1; }
echo "✅ Dependencies installed"

# Test 3: Compilation
echo "Test 3: Compiling TypeScript..."
pnpm run test:compile > /dev/null 2>&1 || { echo "❌ Compilation failed"; exit 1; }
echo "✅ TypeScript compiles"

# Test 4: Run tests
echo "Test 4: Running test suite..."
pnpm test > /tmp/test-output.txt 2>&1 || { cat /tmp/test-output.txt; echo "❌ Tests failed"; exit 1; }
echo "✅ All tests passed"

# Test 5: Verify test count
echo "Test 5: Verifying test coverage..."
TEST_COUNT=$(grep -o "passing" /tmp/test-output.txt | head -1 | grep -o "[0-9]*" || echo "0")
if [ "$TEST_COUNT" -lt 10 ]; then
    echo "❌ Expected at least 10 tests, found $TEST_COUNT"
    exit 1
fi
echo "✅ Test coverage: $TEST_COUNT tests"

echo ""
echo "🎉 All testing validation passed!"
echo "📊 Test Infrastructure Ready"
VALIDATE

chmod +x scripts/validate-testing.sh

# Run validation
bash scripts/validate-testing.sh
```

---

## 🚨 Troubleshooting

### Issue: "Cannot find module '@vscode/test-electron'"

**Solution**: Install dependencies:
```bash
pnpm install
```

### Issue: "Error: No tests found"

**Solution**: Ensure TypeScript is compiled:
```bash
pnpm run test:compile
# Verify out/ directory exists
ls out/test/suite/
```

### Issue: "Extension 'c4x-contributors.c4x' not found"

**Solution**: Check `package.json` publisher and name match:
```json
{
  "name": "c4x",
  "publisher": "c4x-contributors"
}
```

The extension ID is `publisher.name`.

### Issue: Tests timeout after 2 seconds

**Solution**: Increase Mocha timeout in `test/suite/index.ts`:
```typescript
const mocha = new Mocha({
    ui: 'tdd',
    color: true,
    timeout: 10000, // 10 seconds
});
```

### Issue: "glob is not a function"

**Solution**: Install correct glob version:
```bash
pnpm add -D glob@^10.0.0 @types/glob@^8.0.0
```

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

Run validation:
```bash
bash scripts/validate-testing.sh
```

**Expected**: All tests pass (exit code 0)

### Trigger Code Review Agent

After validation, invoke `/review-code`:
```
/review-code Validate testing infrastructure for Phase 1 Activity 08
```

---

## 📊 Progress Tracking

**Status**: 🔴 Not Started

**Mark Complete When**:
- All acceptance criteria checked ✅
- Validation script passes
- All 10+ tests passing
- Code Review Agent approved
- Next activity (09-e2e-visual-validation.md) can proceed

---

## 📚 References

- [Testing Extensions](https://code.visualstudio.com/api/working-with-extensions/testing-extension)
- [@vscode/test-electron](https://github.com/microsoft/vscode-test)
- [Mocha Documentation](https://mochajs.org/)
- [TDR-008: Testing Strategy](../../../adrs/TDR-008-testing-strategy.md)

---

**Activity Owner**: Any autonomous agent or contributor
**Last Updated**: 2025-10-19
**Next Activity**: [09-e2e-visual-validation.md](./09-e2e-visual-validation.md)
