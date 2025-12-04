# Activity 02: Extension Manifest Setup

**Status**: 🟢 Complete
**Estimated Time**: 20 minutes
**Prerequisites**: Activity 01 complete (repository initialized)
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to create a valid `package.json` extension manifest that defines the C4X extension's metadata, VS Code API version requirements, activation events, and contributed commands. This file is the entry point for VS Code to recognize and load our extension.

**Why This Matters**: Without a properly configured `package.json`, VS Code won't load the extension, and marketplace publishing will fail.

---

## 📋 Objectives

1. Initialize `package.json` with pnpm
2. Configure VS Code extension-specific fields
3. Define activation events and commands
4. Add required dependencies
5. Validate manifest structure
6. Test extension loads in VS Code

---

## 🔨 Step-by-Step Implementation

### Step 1: Initialize package.json with pnpm

```bash
cd /Users/jp/Library/Mobile\ Documents/com~apple~CloudDocs/Documents/workspaces/c4model-vscode-extension

# Initialize with pnpm
pnpm init
```

**Expected Output**:
```
Wrote to package.json

{
  "name": "c4model-vscode-extension",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC"
}
```

---

### Step 2: Replace package.json with VS Code Extension Manifest

Replace the entire content of `package.json` with:

```json
{
  "name": "c4x",
  "displayName": "C4X - C4 Model Diagrams",
  "description": "Make C4 diagrams as easy as Mermaid in VS Code",
  "version": "0.1.0",
  "publisher": "c4x-contributors",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/USERNAME/c4model-vscode-extension"
  },
  "bugs": {
    "url": "https://github.com/USERNAME/c4model-vscode-extension/issues"
  },
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Programming Languages",
    "Visualization"
  ],
  "keywords": [
    "c4",
    "c4model",
    "architecture",
    "diagrams",
    "visualization",
    "mermaid"
  ],
  "activationEvents": [
    "onCommand:c4x.openPreview",
    "onLanguage:c4x"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "c4x.openPreview",
        "title": "C4X: Open Preview",
        "category": "C4X"
      }
    ],
    "languages": [
      {
        "id": "c4x",
        "aliases": ["C4X", "c4x"],
        "extensions": [".c4x"],
        "configuration": "./language-configuration.json"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "pnpm run build",
    "build": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "@types/node": "^18.0.0",
    "@types/mocha": "^10.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vscode/test-electron": "^2.3.0",
    "esbuild": "^0.19.0",
    "eslint": "^8.0.0",
    "mocha": "^10.2.0",
    "typescript": "^5.0.0",
    "@vscode/vsce": "^2.22.0"
  },
  "dependencies": {}
}
```

**Important**: Replace `USERNAME` with your actual GitHub username in the `repository.url` and `bugs.url` fields.

**Command to create file**:
```bash
cat > package.json << 'MANIFEST'
{
  "name": "c4x",
  "displayName": "C4X - C4 Model Diagrams",
  "description": "Make C4 diagrams as easy as Mermaid in VS Code",
  "version": "0.1.0",
  "publisher": "c4x-contributors",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/USERNAME/c4model-vscode-extension"
  },
  "bugs": {
    "url": "https://github.com/USERNAME/c4model-vscode-extension/issues"
  },
  "engines": {
    "vscode": "^1.80.0"
  },
  "categories": [
    "Programming Languages",
    "Visualization"
  ],
  "keywords": [
    "c4",
    "c4model",
    "architecture",
    "diagrams",
    "visualization",
    "mermaid"
  ],
  "activationEvents": [
    "onCommand:c4x.openPreview",
    "onLanguage:c4x"
  ],
  "main": "./dist/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "c4x.openPreview",
        "title": "C4X: Open Preview",
        "category": "C4X"
      }
    ],
    "languages": [
      {
        "id": "c4x",
        "aliases": ["C4X", "c4x"],
        "extensions": [".c4x"],
        "configuration": "./language-configuration.json"
      }
    ]
  },
  "scripts": {
    "vscode:prepublish": "pnpm run build",
    "build": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "lint": "eslint src --ext ts",
    "test": "node ./out/test/runTest.js",
    "package": "vsce package",
    "publish": "vsce publish"
  },
  "devDependencies": {
    "@types/vscode": "^1.80.0",
    "@types/node": "^18.0.0",
    "@types/mocha": "^10.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "@vscode/test-electron": "^2.3.0",
    "esbuild": "^0.19.0",
    "eslint": "^8.0.0",
    "mocha": "^10.2.0",
    "typescript": "^5.0.0",
    "@vscode/vsce": "^2.22.0"
  },
  "dependencies": {}
}
MANIFEST
```

---

### Step 3: Create Language Configuration File

Create `language-configuration.json` for C4X syntax:

```bash
cat > language-configuration.json << 'EOF'
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "(", "close": ")" },
    { "open": "'", "close": "'", "notIn": ["string", "comment"] },
    { "open": "\"", "close": "\"", "notIn": ["string"] }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["'", "'"],
    ["\"", "\""]
  ]
}
EOF
```

---

### Step 4: Install Dependencies

```bash
# Install all devDependencies
pnpm install

# Verify installation
pnpm list --depth=0
```

**Expected Output**:
```
Legend: production dependency, optional only, dev only

c4x@0.1.0 /path/to/c4model-vscode-extension

devDependencies:
@types/mocha 10.0.0
@types/node 18.0.0
@types/vscode 1.80.0
@typescript-eslint/eslint-plugin 6.0.0
@typescript-eslint/parser 6.0.0
@vscode/test-electron 2.3.0
@vscode/vsce 2.22.0
esbuild 0.19.0
eslint 8.0.0
mocha 10.2.0
typescript 5.0.0
```

---

## ✅ Acceptance Criteria

**Before marking this activity complete, verify ALL of the following**:

- [ ] `package.json` exists in project root
- [ ] All required fields present: name, displayName, description, version, engines.vscode
- [ ] `publisher` field set (can be placeholder for now)
- [ ] `activationEvents` includes both `onCommand:c4x.openPreview` and `onLanguage:c4x`
- [ ] `main` field points to `./dist/extension.js`
- [ ] `contributes.commands` includes "C4X: Open Preview" command
- [ ] `contributes.languages` defines c4x language with `.c4x` extension
- [ ] `language-configuration.json` exists
- [ ] All devDependencies installed (check `node_modules/` exists)
- [ ] Valid JSON (no syntax errors)
- [ ] Repository URL updated with actual GitHub username

---

## 🧪 Programmatic Testing & Validation

### Test 1: Validate JSON Syntax

```bash
# Test 1: Check JSON is valid
cat package.json | jq '.' > /dev/null && echo "✅ Valid JSON" || echo "❌ Invalid JSON"
```

**Expected**: `✅ Valid JSON`

---

### Test 2: Verify Required Fields

```bash
# Test 2: Validate required VS Code extension fields
node << 'VALIDATE'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const required = {
  'name': pkg.name === 'c4x',
  'displayName': pkg.displayName === 'C4X - C4 Model Diagrams',
  'version': pkg.version === '0.1.0',
  'engines.vscode': pkg.engines?.vscode === '^1.80.0',
  'main': pkg.main === './dist/extension.js',
  'activationEvents': pkg.activationEvents?.includes('onCommand:c4x.openPreview'),
  'commands': pkg.contributes?.commands?.[0]?.command === 'c4x.openPreview',
  'languages': pkg.contributes?.languages?.[0]?.id === 'c4x'
};

const passed = Object.entries(required).filter(([k, v]) => v).length;
const total = Object.keys(required).length;

console.log(`✅ Passed: ${passed}/${total}`);
Object.entries(required).forEach(([key, value]) => {
  console.log(`${value ? '✅' : '❌'} ${key}`);
});

process.exit(passed === total ? 0 : 1);
VALIDATE
```

**Expected Output**:
```
✅ Passed: 8/8
✅ name
✅ displayName
✅ version
✅ engines.vscode
✅ main
✅ activationEvents
✅ commands
✅ languages
```

---

### Test 3: Verify Dependencies Installed

```bash
# Test 3: Check critical dependencies
test -d node_modules/@types/vscode && echo "✅ @types/vscode installed" || echo "❌ @types/vscode missing"
test -d node_modules/esbuild && echo "✅ esbuild installed" || echo "❌ esbuild missing"
test -d node_modules/typescript && echo "✅ typescript installed" || echo "❌ typescript missing"
test -d node_modules/@vscode/test-electron && echo "✅ @vscode/test-electron installed" || echo "❌ @vscode/test-electron missing"
```

**Expected Output**:
```
✅ @types/vscode installed
✅ esbuild installed
✅ typescript installed
✅ @vscode/test-electron installed
```

---

### Test 4: Validate Language Configuration

```bash
# Test 4: Validate language-configuration.json
test -f language-configuration.json && cat language-configuration.json | jq '.' > /dev/null && echo "✅ language-configuration.json valid" || echo "❌ language-configuration.json invalid"
```

**Expected**: `✅ language-configuration.json valid`

---

### Test 5: vsce Package Validation (Dry Run)

```bash
# Test 5: Validate extension can be packaged (dry run)
# This will check manifest validity without creating .vsix
npx vsce ls 2>&1 | grep -q "WARNING" && echo "⚠️  Warnings found" || echo "✅ No packaging warnings"
```

**Expected**: `✅ No packaging warnings` (or review warnings if any)

---

## 🤖 Automated Validation Script

Create a validation script that QA agent can run:

```bash
cat > scripts/validate-manifest.sh << 'VALIDATE_SCRIPT'
#!/bin/bash
set -e

echo "🧪 Validating Extension Manifest..."

# Test 1: JSON validity
echo "Test 1: Validating JSON syntax..."
cat package.json | jq '.' > /dev/null && echo "✅ Valid JSON" || { echo "❌ Invalid JSON"; exit 1; }

# Test 2: Required fields
echo "Test 2: Validating required fields..."
node << 'NODETEST'
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

const required = {
  'name': pkg.name === 'c4x',
  'displayName': pkg.displayName === 'C4X - C4 Model Diagrams',
  'version': pkg.version === '0.1.0',
  'engines.vscode': pkg.engines?.vscode === '^1.80.0',
  'main': pkg.main === './dist/extension.js',
  'activationEvents': pkg.activationEvents?.includes('onCommand:c4x.openPreview'),
  'commands': pkg.contributes?.commands?.[0]?.command === 'c4x.openPreview',
  'languages': pkg.contributes?.languages?.[0]?.id === 'c4x'
};

const passed = Object.entries(required).filter(([k, v]) => v).length;
const total = Object.keys(required).length;

console.log(`✅ Passed: ${passed}/${total}`);
if (passed !== total) {
  Object.entries(required).forEach(([key, value]) => {
    if (!value) console.error(`❌ ${key}`);
  });
  process.exit(1);
}
NODETEST

# Test 3: Dependencies
echo "Test 3: Validating dependencies..."
test -d node_modules/@types/vscode || { echo "❌ @types/vscode missing"; exit 1; }
test -d node_modules/esbuild || { echo "❌ esbuild missing"; exit 1; }
test -d node_modules/typescript || { echo "❌ typescript missing"; exit 1; }
echo "✅ All required dependencies installed"

# Test 4: Language config
echo "Test 4: Validating language-configuration.json..."
test -f language-configuration.json || { echo "❌ language-configuration.json missing"; exit 1; }
cat language-configuration.json | jq '.' > /dev/null || { echo "❌ language-configuration.json invalid JSON"; exit 1; }
echo "✅ language-configuration.json valid"

echo ""
echo "🎉 All validation tests passed!"
VALIDATE_SCRIPT

chmod +x scripts/validate-manifest.sh

# Run validation
mkdir -p scripts
bash scripts/validate-manifest.sh
```

---

## 🚨 Troubleshooting

### Issue: `jq: command not found`

**Solution**:
```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### Issue: `pnpm: command not found`

**Solution**:
```bash
npm install -g pnpm
```

### Issue: Dependencies fail to install

**Solution**:
```bash
# Clear cache and retry
pnpm store prune
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### Issue: vsce validation fails with "publisher is required"

**Solution**: The `publisher` field is required for packaging but can be a placeholder during development. We'll update it before marketplace publishing in Phase 6.

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

Run programmatic validation:
```bash
bash scripts/validate-manifest.sh
```

**Expected**: All tests pass (exit code 0)

### Trigger Code Review Agent

After validation passes, invoke `/review-code` to verify:
- Manifest follows VS Code best practices
- Categories and keywords are appropriate
- Activation events are optimal

**Command**:
```
/review-code Validate extension manifest configuration for Phase 1 Activity 02
```

---

## 📊 Progress Tracking

**Status**: 🔴 Not Started

**Mark Complete When**:
- All acceptance criteria checked ✅
- Automated validation script passes
- Code Review Agent approved
- Next activity (03-build-system.md) can proceed

---

## 📚 References

- [Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)
- [Activation Events](https://code.visualstudio.com/api/references/activation-events)
- [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
- [TDR-001: Build Tool (ESBuild)](../../../adrs/TDR-001-build-tool.md)

---

**Activity Owner**: Any autonomous agent or contributor
**Last Updated**: 2025-10-19
**Next Activity**: [03-build-system.md](./03-build-system.md)
