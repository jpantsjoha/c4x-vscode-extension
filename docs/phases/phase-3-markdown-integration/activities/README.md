# Phase 3 Activities Index

This directory contains detailed implementation guides for all Phase 3 (M2 - Markdown Integration) activities. Each activity file provides complete context for autonomous execution by subagents.

---

## 📁 Activity Files Structure

Each activity file includes:
- **Overview**: What is being built and why
- **Prerequisites**: Required dependencies and knowledge
- **Acceptance Criteria**: Specific, testable requirements
- **Implementation Steps**: Detailed code examples and instructions
- **Testing**: Unit test examples and integration test scenarios
- **Success Metrics**: Performance and quality targets
- **Common Issues**: Troubleshooting guide
- **Next Steps**: What to do after completion

---

## 🗂️ Activity Catalog

### Category 1: Markdown Integration (5-6 hours)

#### [01-markdownit-plugin.md](./01-markdownit-plugin.md) ✅ DETAILED
**Time**: 3 hours | **Priority**: Critical Path
- Research VS Code Markdown Extension API
- Install MarkdownIt dependencies
- Create C4X plugin to intercept ` ```c4x ` fenced blocks
- Register plugin with VS Code
- Write comprehensive tests

**Key Deliverables**:
- `src/markdown/c4xPlugin.ts`
- `test/suite/markdown.test.ts`

---

#### 02-fenced-block-detection.md
**Time**: 30 minutes | **Priority**: High
- Implement fence token detection logic
- Handle multiple ` ```c4x ` blocks in one file
- Test edge cases (empty blocks, nested blocks)

**Key Deliverables**:
- Enhanced fence detection in c4xPlugin.ts

---

#### 03-inline-svg.md
**Time**: 45 minutes | **Priority**: High
- Implement inline SVG rendering in Markdown preview
- Add CSS styling for diagrams
- Handle error display inline
- Test Markdown preview integration

**Key Deliverables**:
- `src/markdown/c4x.css`
- Inline SVG rendering logic

---

### Category 2: Theme System (4-5 hours)

#### [04-theme-interface.md](./04-theme-interface.md) ✅ DETAILED
**Time**: 30 minutes | **Priority**: Critical Path
- Define `C4Theme` interface
- Define element and relationship color interfaces
- Create theme utility functions
- Implement ThemeManager singleton

**Key Deliverables**:
- `src/themes/Theme.ts`
- `src/themes/ThemeUtils.ts`
- `src/themes/ThemeManager.ts`

---

#### 05-classic-theme.md
**Time**: 30 minutes | **Priority**: Critical
- Implement C4 Model official color palette
- Match Simon Brown's C4 specification
- Export Classic theme

**Key Deliverables**:
- `src/themes/ClassicTheme.ts`

**Reference**: [C4 Model Notation](https://c4model.com/#Notation)

---

#### 06-modern-theme.md
**Time**: 30 minutes | **Priority**: High
- Implement vibrant color palette
- Add rounded corners (12px radius)
- Enable drop shadows
- Test modern aesthetic

**Key Deliverables**:
- `src/themes/ModernTheme.ts`

---

#### 07-muted-theme.md
**Time**: 30 minutes | **Priority**: High
- Implement grayscale palette
- Minimal styling (thin borders, small radius)
- Professional/corporate appearance

**Key Deliverables**:
- `src/themes/MutedTheme.ts`

---

#### 08-high-contrast-theme.md
**Time**: 45 minutes | **Priority**: Medium
- Implement WCAG AAA compliant colors
- Contrast ratios > 7:1
- Larger fonts, thicker borders
- Test with accessibility tools

**Key Deliverables**:
- `src/themes/HighContrastTheme.ts`

**Reference**: [WCAG AAA Guidelines](https://www.w3.org/WAI/WCAG2AAA-Conformance)

---

#### 09-auto-theme.md
**Time**: 1 hour | **Priority**: Medium
- Detect VS Code color theme kind (light/dark)
- Implement dark variant
- Implement light variant
- React to VS Code theme changes

**Key Deliverables**:
- `src/themes/AutoTheme.ts`

---

#### 10-theme-switcher.md
**Time**: 1 hour | **Priority**: High
- Implement "C4X: Change Theme" command
- Create quick pick UI with theme list
- Apply theme changes instantly (< 100ms)
- Persist theme preference to settings
- Trigger preview refresh on theme change

**Key Deliverables**:
- `src/commands/changeTheme.ts`
- Theme switcher command

---

### Category 3: Export Functionality (5-6 hours)

#### [11-export-svg.md](./11-export-svg.md) ✅ DETAILED
**Time**: 1.5 hours | **Priority**: Critical
- Implement SVG export command
- Add XML declaration and xmlns attributes
- Embed fonts in <defs>
- Add metadata
- Prompt for save location
- Test in browsers and vector editors

**Key Deliverables**:
- `src/export/SvgExporter.ts`
- `src/commands/exportSvg.ts`

**Performance Target**: < 200ms export time

---

#### [12-export-png.md](./12-export-png.md) ✅ DETAILED
**Time**: 2.5 hours | **Priority**: High
- Install and configure Playwright
- Implement headless browser PNG rendering
- Support multiple resolutions (1x, 2x, 4x)
- Show progress indicator
- Test high-quality output

**Key Deliverables**:
- `src/export/PngExporter.ts`
- `src/commands/exportPng.ts`
- `playwright.config.ts`

**Performance Target**: < 2 seconds export time

---

#### 13-copy-clipboard.md
**Time**: 45 minutes | **Priority**: Medium
- Implement clipboard export
- Copy SVG markup to system clipboard
- Make SVG standalone (add xmlns)
- Test paste into Figma, Confluence, browsers

**Key Deliverables**:
- `src/export/ClipboardExporter.ts`
- `src/commands/copySvg.ts`

---

## 🎯 Quick Reference

### Critical Path (Must Complete First)
1. **01-markdownit-plugin.md** - Enables Markdown integration
2. **04-theme-interface.md** - Enables theme system
3. **11-export-svg.md** - Enables export functionality

### High Priority (Complete Early)
4. **05-classic-theme.md** - Default theme
5. **10-theme-switcher.md** - Theme UI
6. **12-export-png.md** - High-quality export

### Medium Priority (Polish)
7. **06-modern-theme.md** - Additional theme
8. **07-muted-theme.md** - Additional theme
9. **08-high-contrast-theme.md** - Accessibility theme
10. **09-auto-theme.md** - Auto theme switching
11. **13-copy-clipboard.md** - Clipboard workflow

---

## 📊 Completion Checklist

### Markdown Integration ✅
- [ ] 01 - MarkdownIt Plugin
- [ ] 02 - Fenced Block Detection
- [ ] 03 - Inline SVG Rendering

### Theme System ✅
- [ ] 04 - Theme Interface
- [ ] 05 - Classic Theme
- [ ] 06 - Modern Theme
- [ ] 07 - Muted Theme
- [ ] 08 - High-Contrast Theme
- [ ] 09 - Auto Theme
- [ ] 10 - Theme Switcher Command

### Export Functionality ✅
- [ ] 11 - Export SVG
- [ ] 12 - Export PNG (Playwright)
- [ ] 13 - Copy to Clipboard

---

## 🔄 Recommended Execution Order

### Week 1: Markdown + Themes (Days 1-4)
**Day 1** (5-6 hours):
- Activity 01: MarkdownIt Plugin (3 hrs)
- Activity 04: Theme Interface (30 min)
- Activity 05: Classic Theme (30 min)

**Day 2** (3-4 hours):
- Activity 02: Fenced Block Detection (30 min)
- Activity 03: Inline SVG (45 min)
- Activity 06: Modern Theme (30 min)
- Activity 07: Muted Theme (30 min)

**Day 3** (2-3 hours):
- Activity 08: High-Contrast Theme (45 min)
- Activity 09: Auto Theme (1 hr)

**Day 4** (1-2 hours):
- Activity 10: Theme Switcher Command (1 hr)

### Week 2: Export (Days 5-6)
**Day 5** (4-5 hours):
- Activity 11: Export SVG (1.5 hrs)
- Activity 12: Export PNG (2.5 hrs)

**Day 6** (1 hour):
- Activity 13: Copy Clipboard (45 min)

---

## 📚 Cross-References

### Phase 2 Dependencies
All Phase 3 activities depend on Phase 2 deliverables:
- Parser: `src/parser/C4XParser.ts`
- Model: `src/model/C4ModelBuilder.ts`
- Layout: `src/layout/DagreLayoutEngine.ts`
- Renderer: `src/render/SvgBuilder.ts`
- Preview: `src/webview/PreviewPanel.ts`

### External Documentation
- [VS Code Markdown API](https://code.visualstudio.com/api/extension-guides/markdown-extension)
- [MarkdownIt Plugin Guide](https://github.com/markdown-it/markdown-it)
- [Playwright Documentation](https://playwright.dev/)
- [C4 Model Notation](https://c4model.com/#Notation)
- [WCAG AAA Guidelines](https://www.w3.org/WAI/WCAG2AAA-Conformance)

---

## 🤖 For Autonomous Agents

Each activity file is designed for autonomous execution. Agents should:

1. **Read Prerequisites**: Verify all dependencies met
2. **Review Acceptance Criteria**: Understand what "done" looks like
3. **Follow Implementation Steps**: Execute code examples
4. **Run Tests**: Verify functionality
5. **Check Success Metrics**: Confirm performance targets met
6. **Document Issues**: Note any blockers or deviations

**Parallel Execution**: Activities within different categories can be executed in parallel (e.g., one agent on themes, another on export).

**Sequential Dependencies**: Activities 01→02→03 must be sequential (fenced blocks depend on plugin). Themes can all be parallel. Export can be parallel after SVG exporter is done.

---

## 📝 Status Tracking

Track completion using the main task breakdown:
- **PHASE-3-TASK-BREAKDOWN.md** - Overall progress
- **README.md** (this file) - Activity index and checklist
- Individual activity files - Detailed implementation status

---

**Document Owner**: Documentation Agent (DOCA)
**Last Updated**: October 19, 2025
**Phase**: 3 (M2 - Markdown Integration)
