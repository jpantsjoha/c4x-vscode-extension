# Activity 03: Build System Configuration

**Status**: 🟢 Complete
**Estimated Time**: 30 minutes
**Prerequisites**: Activities 01-02 complete
**Agent Assignable**: ✅ Yes (Fully Autonomous)

---

## 🎯 Problem Statement

We need to configure ESBuild as our build system to compile TypeScript to JavaScript, bundle dependencies, and prepare the extension for distribution. The build must be fast (< 1 second), produce small bundles (< 1MB target), and support both development (with sourcemaps) and production modes.

**Why This Matters**: Fast build times enable rapid iteration. Proper bundling reduces extension size and load time.

---

## 📋 Objectives

1. Create ESBuild configuration file
2. Configure TypeScript compiler (`tsconfig.json`)
3. Configure ESLint for code quality
4. Add build scripts to package.json
5. Test build process
6. Validate bundle size

---

## 🔨 Step-by-Step Implementation

### Step 1: Create TypeScript Configuration

```bash
cat > tsconfig.json << 'TSCONFIG'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./out",
    "rootDir": "./src",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "out", "**/*.spec.ts"]
}
TSCONFIG
```

### Step 2: Create ESBuild Configuration

```bash
cat > esbuild.config.js << 'ESBUILD'
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'info',
    plugins: [],
    treeShaking: true,
    metafile: true,
  });

  if (watch) {
    await ctx.watch();
    console.log('👀 Watching for changes...');
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    console.log('✅ Build complete');
    
    // Output bundle size
    const fs = require('fs');
    const stats = fs.statSync('dist/extension.js');
    const sizeInKB = (stats.size / 1024).toFixed(2);
    console.log(`📦 Bundle size: ${sizeInKB} KB`);
    
    // Warn if bundle too large
    if (stats.size > 1048576) { // 1MB
      console.warn(`⚠️  Bundle size exceeds 1MB target`);
    }
  }
}

main().catch((e) => {
  console.error('Build failed:', e);
  process.exit(1);
});
ESBUILD
```

### Step 3: Create ESLint Configuration

```bash
cat > .eslintrc.json << 'ESLINT'
{
  "root": true,
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaVersion": 2022,
    "sourceType": "module"
  },
  "plugins": ["@typescript-eslint"],
  "extends": [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  "rules": {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { "argsIgnorePattern": "^_" }
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "off"
  },
  "ignorePatterns": ["out", "dist", "**/*.d.ts", "node_modules"]
}
ESLINT
```

### Step 4: Create .eslintignore

```bash
cat > .eslintignore << 'IGNORE'
out/
dist/
node_modules/
*.d.ts
coverage/
.vscode-test/
IGNORE
```

### Step 5: Update package.json Scripts (Already Done in Activity 02)

Verify these scripts exist in package.json:
```json
{
  "scripts": {
    "vscode:prepublish": "pnpm run build",
    "build": "node esbuild.config.js --production",
    "build:dev": "node esbuild.config.js",
    "watch": "node esbuild.config.js --watch",
    "lint": "eslint src --ext ts",
    "lint:fix": "eslint src --ext ts --fix"
  }
}
```

### Step 6: Create Stub Extension Entry Point

```bash
mkdir -p src

cat > src/extension.ts << 'STUB'
import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('C4X extension is now active');

    const disposable = vscode.commands.registerCommand('c4x.openPreview', () => {
        vscode.window.showInformationMessage('C4X: Hello World!');
    });

    context.subscriptions.push(disposable);
}

export function deactivate() {
    console.log('C4X extension is now deactivated');
}
STUB
```

---

## ✅ Acceptance Criteria

- [ ] `tsconfig.json` exists with strict mode enabled
- [ ] `esbuild.config.js` exists with production and watch modes
- [ ] `.eslintrc.json` exists with TypeScript parser
- [ ] `.eslintignore` exists
- [ ] `src/extension.ts` stub exists
- [ ] Build succeeds: `pnpm run build` exits with code 0
- [ ] Bundle created: `dist/extension.js` exists
- [ ] Bundle size < 100KB (for stub)
- [ ] Lint passes: `pnpm run lint` exits with code 0
- [ ] Watch mode works: `pnpm run watch` starts successfully

---

## 🧪 Programmatic Testing & Validation

### Test 1: Build Success

```bash
# Clean and build
rm -rf dist
pnpm run build

# Check exit code
if [ $? -eq 0 ]; then
  echo "✅ Build succeeded"
else
  echo "❌ Build failed"
  exit 1
fi

# Check output exists
if [ -f dist/extension.js ]; then
  echo "✅ Bundle created"
else
  echo "❌ Bundle missing"
  exit 1
fi
```

### Test 2: Bundle Size Validation

```bash
# Check bundle size
SIZE=$(stat -f%z dist/extension.js 2>/dev/null || stat -c%s dist/extension.js 2>/dev/null)
SIZE_KB=$((SIZE / 1024))

echo "📦 Bundle size: ${SIZE_KB} KB"

# For stub, should be < 100KB
if [ $SIZE_KB -lt 100 ]; then
  echo "✅ Bundle size acceptable"
else
  echo "⚠️  Bundle larger than expected (should be < 100KB for stub)"
fi
```

### Test 3: TypeScript Compilation

```bash
# Run TypeScript compiler check (no emit)
npx tsc --noEmit

if [ $? -eq 0 ]; then
  echo "✅ TypeScript check passed"
else
  echo "❌ TypeScript errors found"
  exit 1
fi
```

### Test 4: ESLint Validation

```bash
# Run ESLint
pnpm run lint

if [ $? -eq 0 ]; then
  echo "✅ ESLint passed"
else
  echo "❌ ESLint errors found"
  exit 1
fi
```

### Test 5: Watch Mode (Quick Test)

```bash
# Test watch mode starts (don't wait)
timeout 5s pnpm run watch &
WATCH_PID=$!
sleep 2

if ps -p $WATCH_PID > /dev/null; then
  echo "✅ Watch mode started"
  kill $WATCH_PID
else
  echo "❌ Watch mode failed to start"
  exit 1
fi
```

---

## 🤖 Automated Validation Script

```bash
mkdir -p scripts

cat > scripts/validate-build.sh << 'VALIDATE'
#!/bin/bash
set -e

echo "🧪 Validating Build System..."

# Test 1: Clean build
echo "Test 1: Clean build..."
rm -rf dist
pnpm run build || { echo "❌ Build failed"; exit 1; }
echo "✅ Build succeeded"

# Test 2: Bundle exists
echo "Test 2: Bundle exists..."
test -f dist/extension.js || { echo "❌ Bundle missing"; exit 1; }
echo "✅ Bundle created"

# Test 3: Bundle size
echo "Test 3: Bundle size..."
SIZE=$(stat -f%z dist/extension.js 2>/dev/null || stat -c%s dist/extension.js)
SIZE_KB=$((SIZE / 1024))
echo "📦 Bundle size: ${SIZE_KB} KB"

# Test 4: TypeScript check
echo "Test 4: TypeScript check..."
npx tsc --noEmit || { echo "❌ TypeScript errors"; exit 1; }
echo "✅ TypeScript passed"

# Test 5: ESLint check
echo "Test 5: ESLint check..."
pnpm run lint || { echo "❌ ESLint errors"; exit 1; }
echo "✅ ESLint passed"

echo ""
echo "🎉 All build system validation tests passed!"
VALIDATE

chmod +x scripts/validate-build.sh

# Run validation
bash scripts/validate-build.sh
```

---

## 🚨 Troubleshooting

### Issue: `esbuild: command not found`

**Solution**:
```bash
pnpm install
```

### Issue: Build fails with "Cannot find module 'vscode'"

**Solution**: This is expected - `vscode` is external. Ensure it's in the `external` array in esbuild.config.js.

### Issue: TypeScript errors in src/extension.ts

**Solution**:
```bash
# Check if @types/vscode is installed
pnpm list @types/vscode

# If missing, install
pnpm add -D @types/vscode
```

---

## 🤖 Agent Handoff Points

### Trigger QA Agent

```bash
# Run automated validation
bash scripts/validate-build.sh
```

### Trigger Code Review Agent

```
/review-code Validate build system configuration for Phase 1 Activity 03
```

---

## 📊 Progress Tracking

**Mark Complete When**:
- All acceptance criteria checked ✅
- Automated validation script passes
- Code Review Agent approved

---

**Next Activity**: [04-extension-entry.md](./04-extension-entry.md)
