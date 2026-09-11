# C4X Extension - Marketplace Assets Specifications

> Status (2025-12-01): Assets updated for v1.0 release. Reflects new visual style (white fill, colored borders).

**Purpose**: Specifications for VS Code Marketplace listing assets
**Target**: v1.0.0 Launch (Released)
**Status**: Ready for asset update

---

## 📋 Asset Checklist

- [x] **Extension Icon** (512x512 PNG) - `assets/marketplace/icon.png`
- [ ] **Screenshot 1**: C4X syntax and live preview - Required
- [ ] **Screenshot 2**: PlantUML C4 support - Required
- [ ] **Screenshot 3**: Theme system showcase - Recommended
- [ ] **Screenshot 4**: Export functionality - Recommended
- [ ] **Screenshot 5**: Multi-DSL support comparison - Optional
- [ ] **Demo GIF** (30s max) - Optional but recommended
- [ ] **README.md** polish for marketplace - Required

---

## 🎨 Extension Icon Specifications

### Design Concept

**Theme**: C4 Model + Code/Diagram hybrid
**Style**: Modern, minimal, professional
**Colors**: C4 Model official colors + VS Code brand colors

### Icon Colors (Official C4 Model Palette)

```
Primary Blue (Software System):  #1168BD
Container Blue:                   #438DD5
Component Blue:                   #85BBF0
Person Blue:                      #08427B
Text/Foreground:                  #FFFFFF
Accent (if needed):               #2D3748 (dark gray)
```

---

## 📸 Screenshot 1: C4X Syntax and Live Preview (REQUIRED)

**Purpose**: Show core C4X-DSL syntax and instant preview
**Layout**: Split view (code left, preview right)

### Left Panel: C4X Code Editor

**File**: `banking-system.c4x`

```c4x
%%{ c4: system-context }%%
graph TB

Customer[Customer<br/>Person]
Banking[Banking System<br/>Software System]
Email[Email System<br/>Software System<br/>External]

Customer -->|Uses| Banking
Banking -->|Sends notifications| Email
```

**Highlights**:
- Syntax highlighting visible (keywords, strings, identifiers)
- Clean, readable code
- Mermaid-like syntax clearly visible

### Right Panel: Live Preview

**Shows**:
- Rendered C4 diagram with Classic theme
- 3 boxes (Customer, Banking System, Email System)
- 2 arrows with labels
- Performance metric: "Rendered in 12ms" (bottom right corner)

### UI Elements to Show

- ✅ File tab: `banking-system.c4x`
- ✅ Command palette hint: "C4X: Open Preview" (Ctrl+K V)
- ✅ Status bar: "C4X" indicator (bottom left)
- ⚠️ Hide: Minimap, breadcrumbs, unnecessary panels

### Caption

```
"C4X: Write C4 diagrams with Mermaid-like syntax. Instant preview with sub-50ms rendering."
```

---

## 📸 Screenshot 2: PlantUML C4 Support (REQUIRED)

**Purpose**: Show PlantUML C4 file support (differentiate from competitors)
**Layout**: Split view (code left, preview right)

### Left Panel: PlantUML C4 Code Editor

**File**: `banking-plantuml.puml`

```plantuml
@startuml
!include C4_Context.puml

Person(customer, "Customer")
System(banking, "Banking System", "Core platform")
System_Ext(email, "Email System")

Rel(customer, banking, "Uses")
Rel(banking, email, "Sends notifications")

@enduml
```

**Highlights**:
- PlantUML C4 macros clearly visible
- No Java/Graphviz required
- Renders instantly in VS Code

### Right Panel: Live Preview

**Shows**:
- Same diagram as Screenshot 1 (demonstrates compatibility)
- PlantUML macros mapped to C4X rendering
- Performance metric: "Parsed in 6.5ms, Rendered in 12ms"

### UI Elements to Show

- ✅ File tab: `banking-plantuml.puml`
- ✅ Notification: "PlantUML C4 detected - No Java required!"
- ✅ Status bar: "PlantUML C4" indicator

### Caption

```
"PlantUML C4 support: Preview .puml files without Java. 6.5ms parse time, 100% test coverage."
```

---

## 📸 Screenshot 3: Theme System Showcase (RECOMMENDED)

**Purpose**: Show visual customization options
**Layout**: 2x2 grid or horizontal strip showing different themes

### Themes to Show

**Grid Layout** (2x2):
```
[Classic Theme]        [Modern Theme]
(Official C4 colors)   (Vibrant, rounded)

[Muted Theme]          [High Contrast]
(Grayscale, minimal)   (WCAG AAA, 7:1)
```

**Each Panel Shows**:
- Same C4 diagram rendered with different theme
- Theme name visible in UI
- Visual differences clear (colors, borders, fonts)

### UI Elements to Show

- ✅ Theme picker: "C4X: Change Theme" command palette
- ✅ Settings UI: Theme dropdown with 5 options
- ✅ Live theme switching (show before/after)

### Caption

```
"5 built-in themes: Classic (official C4), Modern, Muted, High Contrast (WCAG AAA), and Auto (matches VS Code)."
```

---

## 📸 Screenshot 4: Export Functionality (RECOMMENDED)

**Purpose**: Show export to SVG/PNG with theme preservation
**Layout**: Side-by-side or before/after

### Left Panel: VS Code Preview

**Shows**:
- C4 diagram in preview panel with Modern theme
- Export menu visible: "Export SVG", "Export PNG", "Copy SVG"
- Theme: Modern (vibrant colors, rounded corners)

### Right Panel: Exported Result

**Shows**:
- Exported PNG/SVG file in Finder/File Explorer
- File properties visible (386KB size)
- Theme preserved in export
- Optional: Exported file open in design tool (Figma, Sketch)

### UI Elements to Show

- ✅ Command palette: "C4X: Export PNG" selected
- ✅ File save dialog (optional)
- ✅ Success notification: "Diagram exported to banking-system.png"

### Caption

```
"Export to SVG or PNG with theme preservation. Perfect for documentation, presentations, and design tools."
```

---

## 📸 Screenshot 5: Multi-DSL Support Comparison (OPTIONAL)

**Purpose**: Show all 3 supported DSL formats side-by-side
**Layout**: 3-column layout

### Columns

**Column 1: C4X-DSL** (.c4x)
```c4x
graph TB
Person[Customer<br/>Person]
Banking[Banking<br/>Software System]
Person -->|Uses| Banking
```
Label: "C4X: Mermaid-like syntax"

**Column 2: PlantUML C4** (.puml)
```plantuml
@startuml
Person(customer, "Customer")
System(banking, "Banking")
Rel(customer, banking, "Uses")
@enduml
```
Label: "PlantUML C4: No Java required"

**Column 3: Structurizr DSL** (.dsl) ⚠️ Experimental
```dsl
workspace {
  model {
    customer = person "Customer"
    banking = softwareSystem "Banking"
    customer -> banking "Uses"
  }
}
```
Label: "Structurizr DSL: Experimental (58% support)"

### Bottom: Unified Rendering

**Shows**:
- All 3 formats render to the same C4 diagram
- Demonstrates format interoperability

### Caption

```
"3 DSL formats, 1 extension: C4X (.c4x), PlantUML C4 (.puml), and Structurizr DSL (.dsl). Choose your preferred syntax."
```

---

## 🎬 Demo GIF Specifications (OPTIONAL)

### Purpose

Show live editing and instant preview update workflow

### Duration

**Max**: 30 seconds
**Recommended**: 15-20 seconds

### Sequence

1. **0-3s**: Open `banking-system.c4x` file (empty)
2. **3-6s**: Type C4X syntax (Person, System, Rel)
3. **6-9s**: Open preview panel (Ctrl+K V)
4. **9-12s**: Preview renders instantly (show "Rendered in 12ms")
5. **12-15s**: Edit code (add new element)
6. **15-18s**: Preview updates instantly on save
7. **18-20s**: Change theme (Classic → Modern)
8. **20-23s**: Export to PNG (show success notification)
9. **23-25s**: Final frame: "C4X - Make C4 diagrams as easy as Mermaid"

### Technical Requirements

```
Format: GIF (animated) or MP4 (video)
Resolution: 1920x1080px or 1280x720px (16:9)
Frame rate: 15-30 fps
Max file size: 5MB (GIF) or 10MB (MP4)
Loop: Yes (infinite loop for GIF)
Recording tool: LICEcap, ScreenToGif, or macOS Screenshot (GIF)
```

### Caption

```
"Live editing, instant preview, sub-50ms rendering. Write C4 diagrams with Mermaid-like simplicity."
```

---

**Document Version**: 1.1
**Status**: Ready for asset creation
**Next Steps**: Create assets, polish README, validate marketplace listing