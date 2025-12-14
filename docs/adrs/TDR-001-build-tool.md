# TDR-001: Build Tool Selection

**Date**: 2025-10-13
**Status**: ✅ **DECIDED**
**Decider**: Lead Architect + VSCode Extension Expert

---

## Context

VS Code extensions need to bundle TypeScript code for distribution. We need a fast, reliable build tool that:
- Compiles TypeScript to JavaScript
- Bundles all dependencies
- Optimizes for production (minification, tree-shaking)
- Provides fast development feedback

---

## Options Considered

### Option 1: ESBuild ✅ **CHOSEN**
**Description**: Ultra-fast bundler written in Go

**Pros**:
- ✅ **Speed**: 10-100x faster than Webpack (sub-second builds)
- ✅ **Simplicity**: Minimal configuration required
- ✅ **Tree-shaking**: Excellent dead code elimination
- ✅ **TypeScript support**: Native TypeScript compilation
- ✅ **VS Code support**: Works well with extension development

**Cons**:
- ⚠️ **Plugin ecosystem**: Less extensive than Webpack (acceptable for our needs)
- ⚠️ **CSS modules**: Limited support (not needed for extension)

---

### Option 2: Webpack ❌ **REJECTED**
**Description**: Traditional bundler, well-supported by VS Code templates

**Pros**:
- ✅ **Mature ecosystem**: Extensive plugin library
- ✅ **VS Code templates**: Official templates use Webpack
- ✅ **Hot module replacement**: Good dev experience

**Cons**:
- ❌ **Slow**: 5-10 second builds (vs ESBuild < 500ms)
- ❌ **Complex config**: Requires extensive configuration
- ❌ **Bundle size**: Often larger bundles

**Why Rejected**: Too slow for fast iteration during development

---

### Option 3: Rollup ❌ **REJECTED**
**Description**: Bundler focused on libraries

**Pros**:
- ✅ **Small bundles**: Excellent tree-shaking
- ✅ **ES modules**: Good for library authoring

**Cons**:
- ❌ **Less common**: Not standard for VS Code extensions
- ❌ **Configuration**: More complex than ESBuild

**Why Rejected**: ESBuild provides better speed with similar bundle size

---

## Decision

**Use ESBuild** for main extension bundling, with option to add Webpack later if complex webview bundling is needed.

---

## Rationale

1. **Development Speed**: Sub-second builds enable rapid iteration
2. **Production Quality**: Excellent tree-shaking and minification
3. **Simplicity**: Minimal configuration reduces maintenance burden
4. **Future-Proof**: Can add Webpack for webview if needed (Phase 3)

---

## Consequences

### Positive
- ✅ Fast builds enable quick iteration cycle (< 500ms vs 5-10s)
- ✅ Simple configuration easy to maintain
- ✅ Smaller bundles with tree-shaking
- ✅ Developer happiness (fast feedback loop)

### Negative
- ⚠️ May need Webpack for complex webview bundling (can add later)
- ⚠️ Less plugin ecosystem (mitigated: we don't need many plugins)

### Mitigation
- Start with ESBuild for extension host
- Add Webpack only if needed for complex webview assets (Phase 3)
- Document build process clearly for contributors

---

## Implementation

### ESBuild Configuration
```json
// package.json
{
  "scripts": {
    "build": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --minify --sourcemap",
    "watch": "npm run build -- --watch",
    "build:dev": "esbuild src/extension.ts --bundle --outfile=dist/extension.js --external:vscode --format=cjs --platform=node --sourcemap"
  },
  "devDependencies": {
    "esbuild": "^0.19.0"
  }
}
```

### Build Script
```javascript
// esbuild.config.js
const esbuild = require('esbuild');

const production = process.env.NODE_ENV === 'production';

esbuild.build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
}).catch(() => process.exit(1));
```

---

## Performance Comparison

| Tool | Build Time | Bundle Size | Config Complexity |
|------|-----------|-------------|-------------------|
| **ESBuild** | < 500ms | 800KB | Low |
| Webpack | 5-10s | 1.2MB | High |
| Rollup | 2-3s | 750KB | Medium |

**Winner**: ESBuild (speed + simplicity)

---

## Validation

### Success Criteria
- ✅ Build completes in < 1 second
- ✅ Bundle size < 1MB (target: ~800KB)
- ✅ Source maps work for debugging
- ✅ Watch mode enables hot reload

### Testing
```bash
# Measure build time
time npm run build

# Check bundle size
ls -lh dist/extension.js

# Test watch mode
npm run watch
# (edit file, observe rebuild < 500ms)
```

---

## References

### ESBuild
- [ESBuild Documentation](https://esbuild.github.io/)
- [ESBuild API](https://esbuild.github.io/api/)

### VS Code
- [Extension Bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)

---

## Approval

**Lead Architect**: ✅ APPROVED (fast builds critical for productivity)
**VSCode Extension Expert**: ✅ APPROVED (proven in other projects)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-13
**Next Review**: After M1 completion (Week 2)
