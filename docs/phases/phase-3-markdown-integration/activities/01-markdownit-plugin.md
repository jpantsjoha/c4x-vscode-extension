# Activity 1: MarkdownIt Plugin Setup

**Task Reference**: PHASE-3-TASK-BREAKDOWN.md → Category 1, Tasks 1.1-1.3
**Estimated Time**: 3 hours
**Priority**: Critical Path
**Status**: 🔴 NOT STARTED

---

## 📋 Overview

Create a MarkdownIt plugin that intercepts ` ```c4x ` fenced code blocks in VS Code's Markdown preview and renders them as inline C4 diagrams using our existing parser, layout, and rendering pipeline.

**Goal**: Enable users to write ` ```c4x ` blocks in `.md` files and see C4 diagrams render inline, just like Mermaid.

---

## 🎯 Prerequisites

**Code Dependencies**:
- [ ] Phase 2 complete (parser, layout, renderer working)
- [ ] All Phase 2 tests passing
- [ ] VS Code extension activated successfully

**Knowledge Requirements**:
- Understanding of VS Code Markdown extension API
- Understanding of MarkdownIt plugin system
- Familiarity with C4X parser/layout/render pipeline

**Reading**:
- [VS Code Markdown Extension Guide](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [MarkdownIt Plugin Docs](https://github.com/markdown-it/markdown-it)
- Phase 2 README - Parser/Layout/Render sections

---

## ✅ Acceptance Criteria

### Functional Requirements
- [ ] ` ```c4x ` blocks detected in Markdown files
- [ ] C4X syntax parsed correctly within blocks
- [ ] Diagrams render as inline SVG in Markdown preview
- [ ] Parse errors displayed inline with clear error messages
- [ ] Multiple ` ```c4x ` blocks in one file all render
- [ ] Other code blocks (```js, ```python) unaffected

### Performance Requirements
- [ ] First render < 300ms (including parse + layout + render)
- [ ] Plugin registration < 50ms
- [ ] No blocking of Markdown preview loading

### Quality Requirements
- [ ] 15+ unit tests (valid blocks, invalid blocks, edge cases)
- [ ] No errors in VS Code Developer Tools console
- [ ] Plugin works in both light and dark VS Code themes

---

## 🔨 Implementation Steps

### Step 1: Research and Setup (Task 1.1 - 45 minutes)

**Research VS Code Markdown Extension API**:

1. Read VS Code documentation on Markdown extensions
2. Understand how `extendMarkdownIt` works
3. Understand MarkdownIt plugin registration
4. Review example extensions (e.g., Mermaid extension)

**Key Concepts to Understand**:
- `markdown.markdownItPlugins` contribution point
- `extendMarkdownIt(md: MarkdownIt)` export from activate()
- MarkdownIt token system
- Fence renderer rules

**Deliverable**: Notes document with API surface and examples

---

### Step 2: Install Dependencies (Task 1.2 - 15 minutes)

**Install MarkdownIt**:
```bash
cd /path/to/c4model-vscode-extension
pnpm add markdown-it @types/markdown-it
```

**Verify Installation**:
```typescript
// Test import in any .ts file
import * as MarkdownIt from 'markdown-it';

const md = new MarkdownIt();
console.log('MarkdownIt loaded successfully');
```

**Update tsconfig.json** (if needed):
```json
{
  "compilerOptions": {
    "types": ["node", "vscode", "mocha", "markdown-it"]
  }
}
```

**Deliverable**: Dependencies installed, TypeScript compiles

---

### Step 3: Create Plugin File (Task 1.3 - 2 hours)

**File**: `src/markdown/c4xPlugin.ts`

**Plugin Structure**:
```typescript
import * as MarkdownIt from 'markdown-it';
import { c4xParser } from '../parser';
import { c4ModelBuilder } from '../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../layout/DagreLayoutEngine';
import { svgBuilder } from '../render/SvgBuilder';
import { getCurrentTheme } from '../themes/ThemeManager';

export function c4xPlugin(md: MarkdownIt): void {
  // Save original fence renderer
  const defaultFence = md.renderer.rules.fence?.bind(md.renderer.rules)
    || ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

  // Override fence renderer
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0]; // Get language from ```c4x

    // Only handle c4x blocks
    if (lang !== 'c4x') {
      return defaultFence(tokens, idx, options, env, self);
    }

    // Render C4X block
    return renderC4XBlock(token.content);
  };
}

async function renderC4XBlock(source: string): Promise<string> {
  try {
    // 1. Parse C4X syntax
    const parseResult = c4xParser.parse(source);

    // 2. Build C4 Model IR
    const model = c4ModelBuilder.build(parseResult, 'markdown-block');

    // 3. Layout (use first view)
    const view = model.views[0];
    const layout = await dagreLayoutEngine.layout(view);

    // 4. Render SVG with current theme
    const theme = getCurrentTheme();
    const svg = svgBuilder.build(layout, { theme });

    // 5. Wrap in container div for styling
    return `
      <div class="c4x-diagram" data-lang="c4x">
        ${svg}
      </div>
    `;

  } catch (error) {
    // Show error inline
    const errorMessage = error instanceof Error ? error.message : String(error);
    return `
      <div class="c4x-error">
        <div class="c4x-error-title">
          <strong>⚠️ C4X Parse Error</strong>
        </div>
        <div class="c4x-error-message">
          <pre>${escapeHtml(errorMessage)}</pre>
        </div>
      </div>
    `;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

**Register Plugin in Extension**:

**File**: `src/extension.ts`

```typescript
import * as vscode from 'vscode';
import * as MarkdownIt from 'markdown-it';
import { c4xPlugin } from './markdown/c4xPlugin';

export function activate(context: vscode.ExtensionContext) {
  // ... existing activation code

  // Return Markdown extension API
  return {
    extendMarkdownIt(md: MarkdownIt) {
      return md.use(c4xPlugin);
    }
  };
}
```

**Declare in package.json**:

**File**: `package.json`

```json
{
  "contributes": {
    "markdown.markdownItPlugins": true
  }
}
```

**Deliverable**: Plugin file created, registered, compiles successfully

---

## 🧪 Testing

### Unit Tests (Task 1.6 - 1 hour)

**File**: `test/suite/markdown.test.ts`

**Test Cases**:

1. **Valid C4X Block Renders**:
```typescript
test('renders valid c4x block', async () => {
  const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
    A[Person<br/>Person]
    B[System<br/>Software System]
    A -->|Uses| B
\`\`\`
  `;

  const html = await renderMarkdown(markdown);
  assert.ok(html.includes('<svg'));
  assert.ok(html.includes('c4x-diagram'));
});
```

2. **Invalid C4X Shows Error**:
```typescript
test('shows error for invalid c4x', async () => {
  const markdown = `
\`\`\`c4x
graph TB
    InvalidSyntax[
\`\`\`
  `;

  const html = await renderMarkdown(markdown);
  assert.ok(html.includes('c4x-error'));
  assert.ok(html.includes('Parse Error'));
});
```

3. **Multiple Blocks Render**:
```typescript
test('renders multiple c4x blocks', async () => {
  const markdown = `
# First Diagram
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
    A[Person<br/>Person]
\`\`\`

# Second Diagram
\`\`\`c4x
%%{ c4: container }%%
graph TB
    B[Container<br/>Container]
\`\`\`
  `;

  const html = await renderMarkdown(markdown);
  const diagramCount = (html.match(/c4x-diagram/g) || []).length;
  assert.strictEqual(diagramCount, 2);
});
```

4. **Other Code Blocks Unaffected**:
```typescript
test('does not affect other code blocks', async () => {
  const markdown = `
\`\`\`javascript
console.log('Hello');
\`\`\`

\`\`\`python
print('World')
\`\`\`
  `;

  const html = await renderMarkdown(markdown);
  assert.ok(html.includes('javascript'));
  assert.ok(html.includes('python'));
  assert.ok(!html.includes('c4x-diagram'));
});
```

**Test Helper**:
```typescript
async function renderMarkdown(markdown: string): Promise<string> {
  const md = new MarkdownIt();
  md.use(c4xPlugin);
  return md.render(markdown);
}
```

---

## 📊 Success Metrics

**Performance**:
- [ ] Plugin registration: < 50ms
- [ ] First diagram render: < 300ms
- [ ] Subsequent renders: < 200ms

**Quality**:
- [ ] All 15+ tests passing
- [ ] No console errors in VS Code
- [ ] Works in light and dark themes

**Functionality**:
- [ ] ` ```c4x ` blocks render correctly
- [ ] Errors displayed inline
- [ ] Multiple blocks supported
- [ ] Other code blocks unaffected

---

## 🔗 Related Files

**New Files Created**:
- `src/markdown/c4xPlugin.ts` - Main plugin implementation
- `src/markdown/c4x.css` - Styling for diagrams in Markdown
- `test/suite/markdown.test.ts` - Unit tests

**Modified Files**:
- `src/extension.ts` - Export `extendMarkdownIt`
- `package.json` - Add `markdown.markdownItPlugins` contribution

**Dependencies**:
- `src/parser/C4XParser.ts` - Parse C4X syntax
- `src/model/C4ModelBuilder.ts` - Build IR
- `src/layout/DagreLayoutEngine.ts` - Layout diagrams
- `src/render/SvgBuilder.ts` - Render SVG

---

## 🚧 Common Issues & Solutions

### Issue 1: Plugin Not Loading
**Symptom**: ` ```c4x ` blocks show as regular code blocks
**Solution**:
- Verify `markdown.markdownItPlugins: true` in package.json
- Verify `extendMarkdownIt` exported from activate()
- Reload VS Code window (Cmd+R / Ctrl+R)

### Issue 2: Async Rendering Not Working
**Symptom**: SVG not showing, blank diagram
**Solution**:
- MarkdownIt plugins must be synchronous
- Use `await` inside renderC4XBlock, but return synchronously
- Consider caching layout results for performance

### Issue 3: CSS Not Applied
**Symptom**: Diagrams render but not styled
**Solution**:
- Inject CSS into Markdown preview webview
- Use `vscode.Uri.joinPath` for CSS file path
- Add CSP rules if needed

---

## 📝 Next Steps

After completing this activity:
1. **Visual Verification**: Open a `.md` file with ` ```c4x ` block, verify rendering
2. **CSS Styling**: Proceed to Task 1.5 (add CSS for diagrams)
3. **Theme Integration**: Once themes are implemented (Category 2), test theme switching in Markdown
4. **Documentation**: Update README with Markdown examples

---

**Activity Owner**: Documentation Agent (DOCA)
**Status**: 🔴 NOT STARTED
**Last Updated**: October 19, 2025
