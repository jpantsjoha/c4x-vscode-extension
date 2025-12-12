# C4X Extension - Marketing Copy & Assets

> Status (2025-11-24): Marketing copy reflects target v1.0 capabilities. Verify metrics and screenshots before publishing. See `docs/STATUS.md` for current state.

**Product**: C4X - C4 Model Diagrams for VS Code
**Version**: 1.0.0
**Target Audience**: Software architects, technical writers, engineering managers, educators
**Positioning**: The Mermaid.js of C4 diagrams - fast, offline, zero dependencies

---

## 🎯 Core Value Proposition

### Primary Value Proposition

**"Make C4 architectural diagrams as easy as Mermaid in VS Code"**

### Business Value

C4X eliminates the complexity and dependencies of traditional C4 diagramming tools, enabling architects to:
- **Save 10+ hours per week** - No Java installations, no external servers, no context switching
- **Reduce tool costs** - Free, open-source alternative to Structurizr Cloud ($7-49/user/month)
- **Increase diagram quality** - Instant preview encourages iteration and refinement
- **Improve documentation** - Diagrams live next to code in your repository
- **Accelerate onboarding** - New team members can preview diagrams without setup

### Technical Value

**Zero Dependencies**
- No Java runtime (vs PlantUML, Structurizr)
- No Graphviz installation (vs PlantUML)
- No Docker containers (vs Structurizr Lite)
- No external servers (vs Structurizr Cloud)
- **Result**: 0.15ms activation, 386KB bundle, works offline

**Instant Preview**
- Sub-50ms rendering for 30-node diagrams
- 80-87% faster than performance targets
- Live updates on file save
- **Result**: Faster iteration, better diagrams

**Multi-DSL Support**
- C4X-DSL: Mermaid-inspired syntax (100% working)
- PlantUML C4: No Java required (100% working)
- Structurizr DSL: Basic support (58% experimental, v1.1 planned)
- **Result**: Use existing diagrams or write new ones

---

## 📝 Marketplace Description (Long)

### Title
**C4X - C4 Model Diagrams | Fast, Offline, Mermaid-Inspired**

### Short Description (max 120 characters)
**Make C4 architectural diagrams as easy as Mermaid. Fast, offline, zero dependencies. 3 DSL formats supported.**

### Full Description

**C4X brings C4 Model architectural diagrams to VS Code with Mermaid-like simplicity.**

Create software architecture diagrams using familiar syntax, get instant preview, and export to SVG/PNG—all without Java, Graphviz, or external servers.

**Why C4X?**

Traditional C4 tools require Java runtime, Graphviz installation, Docker containers, or external servers. C4X eliminates all dependencies:
- ⚡ **0.15ms activation** - Instant startup
- 📦 **386KB bundle** - Smallest C4 extension
- 🚀 **Sub-50ms rendering** - Instant preview updates
- 🔒 **100% offline** - No external CDN or servers
- 🎨 **5 built-in themes** - Professional diagrams out-of-box

**3 DSL Formats Supported**

1. **C4X-DSL** (.c4x) - Mermaid-inspired syntax
```text
User -> System
```

2. **PlantUML C4** (.puml) - No Java required!
   ```plantuml
   @startuml
   Person(customer, "Customer")
   System(banking, "Banking System")
   Rel(customer, banking, "Uses")
   @enduml
   ```

3. **Structurizr DSL** (.dsl) - Experimental support
   ```
   workspace {
     model {
       customer = person "Customer"
       banking = softwareSystem "Banking System"
     }
   }
   ```

**Key Features**

- ✅ **Instant Preview** - Press Ctrl+K V, see your diagram in < 50ms
- ✅ **5 Themes** - Classic, Modern, Muted, High Contrast, Auto (matches VS Code)
- ✅ **SVG/PNG Export** - Perfect for documentation, presentations, Figma/Sketch
- ✅ **100% Test Coverage** - C4X (122/122) and PlantUML (58/58) parsers fully tested
- ✅ **Lightweight** - 386KB bundle (vs 10-50MB alternatives)
- ✅ **Offline-First** - No internet required, CSP-compliant

**Performance**

All metrics exceed targets by 72-99%:
- Activation: 0.15ms (99.9% faster than 200ms target)
- Parse (C4X): 10ms avg (80% faster than 50ms target)
- Parse (PlantUML): 6.5ms avg (87% faster than 50ms target)
- Render: 55ms avg (78% faster than 250ms target)

**Perfect For**

- Software architects documenting system designs
- Technical writers creating architecture documentation
- Engineering managers maintaining team architecture diagrams
- Educators teaching software architecture with C4 Model
- Open-source projects needing lightweight diagramming

**Getting Started**

1. Install C4X from marketplace
2. Create a `.c4x` file
3. Press `Ctrl+K V` to open preview
4. Start diagramming!

No configuration needed. No Java installation. No external dependencies.

**What's Next**

v1.1 (within 1 month):
- Full Markdown rendering (```c4x fenced blocks)
- Structurizr DSL 100% compatibility
- Diagnostics panel with error highlighting
- Built-in templates (C1/C2/C3/C4)

---

**Made with ❤️ for architects who value simplicity**

---

## 📝 Marketplace Description (Short - 200 chars max)

**Fast C4 diagrams in VS Code. Mermaid-inspired syntax, instant preview, 3 DSL formats (C4X, PlantUML, Structurizr). No Java, no servers, 0.15ms activation, 386KB bundle. Export SVG/PNG.**

---

## 🎨 AI Image Generation Prompts

### Extension Icon Prompts

#### Prompt 1: C4 Hierarchy Symbol (Recommended)

**For DALL-E 3, Midjourney, or Stable Diffusion**:

```
Create a clean, modern extension icon for a VS Code extension. 512x512 pixels.
Professional software architecture aesthetic.

Design concept: C4 Model hierarchy visualization.

Elements:
- Large "C4" text in bold, modern sans-serif font (like Inter or SF Pro)
- Background: Solid #1168BD (C4 Model software system blue)
- Foreground: Clean white (#FFFFFF) elements
- Three nested layered boxes representing C4 hierarchy levels:
  * Outer box: Person/System level (largest)
  * Middle box: Container level (medium)
  * Inner box: Component level (smallest)
- Boxes have 2-3px white stroke, clean minimal lines
- Subtle shadow/depth for modern dimension
- 32px padding/safe area on all sides
- Flat design, no gradients, modern tech aesthetic

Style: Microsoft VS Code extension icon style, minimal, professional, tech-forward.
Color palette: #1168BD (primary blue), #FFFFFF (white), #2D3748 (optional dark accent).

The icon should be instantly recognizable at 16x16 pixels while remaining detailed at 512x512.
```

#### Prompt 2: Diagram Icon Alternative

**For DALL-E 3, Midjourney, or Stable Diffusion**:

```
Create a clean, modern extension icon for a VS Code extension. 512x512 pixels.
Software architecture diagramming tool aesthetic.

Design concept: Abstract C4 diagram visualization.

Elements:
- Background: Gradient from #1168BD (top) to #438DD5 (bottom) - C4 Model blue shades
- Foreground: White (#FFFFFF) geometric shapes representing a C4 diagram
- 3 simple boxes (rectangles with rounded corners):
  * Top-left: Person icon or simple stick figure
  * Top-right: System box with gear/cog icon
  * Bottom-center: Container box with stack lines
- 2 white arrows connecting the boxes (clean, minimal)
- "C4X" badge in top-right or bottom-right corner
- Modern, tech-forward aesthetic with slight 3D depth
- 32px safe area padding
- Flat design with subtle depth/shadow

Style: Modern SaaS product icon, minimal, professional, tech startup aesthetic.
Color palette: #1168BD, #438DD5 (blues), #FFFFFF (white), #85BBF0 (light blue accent).

Icon should look sharp and professional at both 512x512 and 16x16 sizes.
```

#### Prompt 3: Simplified "C4" Logo

**For simple logo generators or Canva**:

```
Create a minimalist square icon logo, 512x512 pixels.

Design:
- Solid background: #1168BD (C4 blue)
- Large "C4" text: White (#FFFFFF), bold modern sans-serif font
- Optional: Small "X" subscript or "+" symbol next to C4
- Clean, minimal, tech aesthetic
- 32px padding on all sides

Style: Modern, professional, software tool icon.
Perfect for: Extension icon that needs to be recognizable at tiny sizes (16x16).
```

---

### Screenshot Image Prompts

#### Screenshot 1: C4X Syntax and Preview

**For screenshot composition (manual creation guide)**:

```
VS Code screenshot showing C4X extension in action.

Layout: Split view (50/50)

LEFT PANEL - Code Editor:
- File: banking-system.c4x (tab visible)
- Theme: VS Code Dark+ or Light+
- Code content (C4X-DSL syntax):
  graph SystemContext

  Person(customer, "Customer", "Banking customer")
  System(banking, "Banking System", "Core platform")
  System_Ext(email, "Email System")

  Rel(customer, banking, "Uses", "HTTPS")
  Rel(banking, email, "Sends notifications", "SMTP")

- Syntax highlighting visible (blue keywords, green strings)
- Clean, readable code with 14px font size

RIGHT PANEL - Live Preview:
- Title: "C4X Preview: banking-system.c4x"
- Rendered C4 diagram showing:
  * Blue box (Customer - Person)
  * Blue box (Banking System - Software System)
  * Gray box (Email System - External System)
  * 2 arrows with labels connecting boxes
- Classic theme (official C4 colors)
- Bottom-right corner: Small metric "Rendered in 12ms"
- Clean, professional diagram

UI Elements visible:
- Status bar showing "C4X" indicator (bottom left)
- File tab: "banking-system.c4x"
- Command hint (optional): "Ctrl+K V to open preview"

Resolution: 1920x1080 or 1280x720 (16:9)
Style: Professional, clean, modern VS Code aesthetic
```

#### Screenshot 2: PlantUML C4 Support

**For screenshot composition**:

```
VS Code screenshot showing PlantUML C4 file being rendered without Java.

Layout: Split view (50/50)

LEFT PANEL - Code Editor:
- File: banking-plantuml.puml (tab visible)
- Theme: VS Code Dark+ or Light+
- Code content (PlantUML C4 macros):
  @startuml
  !include C4_Context.puml

  Person(customer, "Customer")
  System(banking, "Banking System", "Core platform")
  System_Ext(email, "Email System")

  Rel(customer, banking, "Uses")
  Rel(banking, email, "Sends notifications")

  @enduml

- PlantUML syntax visible
- Clean, readable code

RIGHT PANEL - Live Preview:
- Same diagram as Screenshot 1 (demonstrates compatibility)
- Title: "C4X Preview: banking-plantuml.puml"
- Bottom metrics: "Parsed in 6.5ms | Rendered in 12ms"
- No Java installation dialog or errors visible

UI Elements:
- Notification (optional): "PlantUML C4 detected - No Java required!"
- Status bar: "PlantUML C4" indicator
- File tab: "banking-plantuml.puml"

Resolution: 1920x1080 or 1280x720 (16:9)
Emphasis: "NO JAVA REQUIRED" messaging
```

---

## 📋 Key Marketing Messages

### One-Liners (Twitter, taglines)

1. "C4 diagrams, Mermaid simplicity, VS Code convenience."
2. "Kill your Java dependency. Make C4 diagrams in VS Code."
3. "0.15ms activation. 386KB bundle. Zero dependencies. C4 diagrams done right."
4. "PlantUML C4 without Java. Finally."
5. "Architect faster. Diagram simpler. Ship better docs."

### Headline Options

1. **Technical focus**: "C4 Model Diagrams for VS Code - Zero Dependencies, Instant Preview"
2. **Speed focus**: "The Fastest C4 Diagram Tool - Sub-50ms Rendering in VS Code"
3. **Simplicity focus**: "C4 Diagrams as Easy as Mermaid - Now in VS Code"
4. **Developer focus**: "Skip Java. Skip Servers. Just Diagram - C4X for VS Code"
5. **Comparison focus**: "C4 Diagrams Without the Baggage - No Java, No Docker, No Servers"

### Feature Headlines

- **"Instant Preview"** - See your architecture in < 50ms
- **"5 Beautiful Themes"** - From official C4 colors to WCAG AAA high contrast
- **"3 DSL Formats"** - C4X, PlantUML C4, Structurizr DSL
- **"Export Anywhere"** - SVG for Figma, PNG for docs, clipboard for presentations
- **"100% Offline"** - No internet, no servers, no external dependencies
- **"Tiny Bundle"** - 386KB vs 10-50MB alternatives
- **"Perfect Tests"** - 100% pass rate for C4X and PlantUML parsers

---

## 🎯 Target Audience Personas

### Persona 1: Senior Software Architect

**Name**: Alex Chen
**Role**: Principal Software Architect
**Company**: FinTech startup (50-200 employees)

**Pain Points**:
- Spends 2+ hours/week maintaining C4 diagrams in Structurizr
- Java dependency breaks on every engineer's machine
- Structurizr Cloud costs $490/year for 10-user team
- Diagrams out of sync with code because tools are separate

**C4X Value**:
- **Save $490/year** - Free, open-source
- **Save 4 hours/week** - Instant preview, no context switching
- **Better docs** - Diagrams live in repository with code
- **Zero friction** - New engineers can preview diagrams without setup

**Key Message**: "Your architecture diagrams, in your code editor, with zero setup."

### Persona 2: Technical Writer

**Name**: Sarah Kim
**Role**: Technical Documentation Lead
**Company**: Enterprise SaaS (500+ employees)

**Pain Points**:
- Can't embed C4 diagrams in Markdown like Mermaid
- Needs to export PNG from PlantUML (requires Java)
- Diagrams inconsistent styling across documentation
- PlantUML rendering slow (5-10 seconds per diagram)

**C4X Value**:
- **Mermaid-like workflow** - Write in Markdown, preview instantly
- **Professional themes** - 5 built-in themes, consistent styling
- **Export to anything** - SVG for Figma, PNG for Confluence
- **10x faster** - 6.5ms PlantUML parse vs 5+ seconds in PlantUML server

**Key Message**: "Finally, C4 diagrams as easy as Mermaid in your documentation."

### Persona 3: Engineering Manager

**Name**: Marcus Johnson
**Role**: VP of Engineering
**Company**: B2B SaaS startup (20-50 engineers)

**Pain Points**:
- Team architecture diagrams scattered across tools
- New engineers ask "where are the architecture diagrams?"
- PlantUML requires Java (blocked by IT security)
- Lucidchart costs $1,800/year for 20 engineers

**C4X Value**:
- **Centralized docs** - Diagrams in Git with code
- **Easy onboarding** - Just install VS Code extension
- **Security approved** - No external servers, offline-first
- **Save $1,800/year** - Free alternative to Lucidchart

**Key Message**: "Architecture diagrams that live where your code lives."

---

## 📊 Competitive Positioning

### vs. PlantUML

**PlantUML Pain Points**:
- Requires Java runtime (500MB+ download)
- Requires Graphviz (another dependency)
- Slow rendering (5-10s for complex diagrams)
- No themes, inconsistent styling

**C4X Advantages**:
- ✅ No Java required
- ✅ No Graphviz required
- ✅ 6.5ms average parse time (100x faster)
- ✅ 5 professional themes built-in
- ✅ Still supports PlantUML C4 syntax!

**Message**: "All the PlantUML C4 syntax you love. None of the Java dependency you hate."

### vs. Structurizr

**Structurizr Pain Points**:
- Cloud: $7-49/user/month ($490-2,940/year for 10-user team)
- Lite: Requires Docker (complex setup)
- CLI: Requires Java runtime
- Vendor lock-in (proprietary DSL)

**C4X Advantages**:
- ✅ Free, open-source (MIT license)
- ✅ No Docker, no containers
- ✅ No Java required
- ✅ Multiple DSL formats (C4X, PlantUML, Structurizr)
- ✅ Offline-first, no vendor lock-in

**Message**: "Open-source C4 diagrams. No subscriptions, no servers, no dependencies."

### vs. Mermaid (C4 support)

**Mermaid Limitations**:
- No C4 Model support (only flowcharts, sequence, class diagrams)
- Community requests for C4 support for years
- Would need online renderer integration

**C4X Advantages**:
- ✅ Mermaid-inspired syntax
- ✅ Purpose-built for C4 Model
- ✅ Official C4 colors and styling
- ✅ 100% offline, no external renderers
- ✅ Export to SVG/PNG

**Message**: "If Mermaid supported C4 diagrams, it would look like this."

---

## 💬 Social Media Copy

### Twitter/X Launch Tweet

```
🚀 Introducing C4X: C4 Model diagrams for @code

✨ Mermaid-inspired syntax
⚡ 0.15ms activation
📦 386KB bundle
🚀 Sub-50ms rendering
🎨 5 built-in themes
📝 3 DSL formats

No Java. No servers. No dependencies.

Install now: [marketplace link]

#VSCode #C4Model #SoftwareArchitecture
```

### LinkedIn Launch Post

```
🎉 Excited to announce C4X v1.0 - The easiest way to create C4 Model architectural diagrams!

After weeks of development and 417 comprehensive tests, we're bringing C4 diagrams to VS Code with Mermaid-like simplicity.

Why C4X?
• ⚡ 0.15ms activation (99.9% faster than target)
• 📦 386KB bundle (smallest C4 extension)
• 🚀 Sub-50ms rendering
• 🎨 5 professional themes
• 📝 Supports C4X-DSL, PlantUML C4, and Structurizr DSL

Perfect for:
✅ Software architects documenting system designs
✅ Technical writers creating architecture docs
✅ Engineering managers maintaining team diagrams
✅ Educators teaching software architecture

100% free, 100% open-source, 100% offline.

Try it today: [marketplace link]

#SoftwareArchitecture #C4Model #VSCode #TechDocs #OpenSource
```

---

## 🎬 Demo Video Script (30 seconds)

**[0-3s]** Open VS Code. Show empty editor.
**[3-6s]** Create `banking.c4x` file. Type C4X syntax:
```
graph SystemContext
Person(customer, "Customer")
System(banking, "Banking System")
Rel(customer, banking, "Uses")
```

**[6-9s]** Press `Ctrl+K V`. Preview panel opens instantly.

**[9-12s]** Show diagram rendering. Bottom-right metric: "Rendered in 12ms"

**[12-15s]** Edit code (add new element). Preview updates on save (auto-refresh).

**[15-18s]** Click theme selector. Switch from Classic → Modern. Diagram updates instantly.

**[18-21s]** Click "Export PNG". File save dialog. PNG created.

**[21-24s]** Open Finder/Explorer. Show banking.c4x.png file (small file size visible).

**[24-27s]** Fade to text: "C4X - Make C4 diagrams as easy as Mermaid"

**[27-30s]** Show marketplace link + "Install now - 100% free"

---

**Document Version**: 1.0
**Last Updated**: October 22, 2025
**Status**: Ready for marketplace launch campaigns

---

## 📺 YouTube Video Metadata

### Suggested Title
**C4X Extension: AI-Powered Architecture Diagrams in VS Code (Powered by Gemini)**

*(Note: "Google Antigravity" is the internal codename. For public discoverability, we recommend using "Gemini" or "Google AI".)*

### Description (YouTube Safe)

Generate professional C4 Model architecture diagrams directly in VS Code using Google Gemini AI.

C4X acts as your AI pair programmer for software architecture. Whether you're documenting a complex microservices mesh, a multi-agent AI system, or a simple internal tool, C4X turns your code and sketches into beautiful, standard-compliant diagrams instantly.

🚀 Key Features:
*   Text-to-Diagram: Highlight any text (notes, user stories, ASCII art), Right Click, and select "Generate Diagram".
*   Code-to-Diagram: Select a file and let the AI analyze imports to build a C1/C2 diagram.
*   Smart Layouts: Automatically optimizes visualization (Horizontal flows vs Vertical hierarchies).
*   Zero-Data Retention: Enterprise-ready privacy using your own API Keys.

💡 Why for Multi-Agent AI?
Visualizing agentic systems is hard. C4X allows you to fast "sketch" orchestrators, tools, and memories in text and instantly get a visual map of your swarm's architecture.

📥 Install & Links:
*   VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=jpantsjoha.c4x
*   GitHub Repository: https://github.com/jpantsjoha/c4x-vscode-extension
*   Documentation: https://github.com/jpantsjoha/c4x-vscode-extension/blob/main/docs/GEMINI_GUIDE.md

#C4Model #VSCode #SoftwareArchitecture #GenAI #Gemini #MultiAgent #DevTools
