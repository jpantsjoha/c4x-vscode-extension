# C4X Extension Implementation Alignment Checklist

Based on C4-PlantUML analysis, here's what our C4X extension should implement for visual standards compliance:

## Core Visual Elements

### Element Structure (CRITICAL)
- [x] Label/Title field (bold, primary identifier)
- [x] Technology/Type field (smaller font, bracketed)
- [x] Description field (optional, visual separation)
- [x] Icon/Sprite support (optional positioning)
- **PlantUML Format:** `== Label \n //[Technology]// \n\n Description`

### Color Palette (CRITICAL)

#### Context Level
- Person: `#08427B` bg, `#FFFFFF` font, `#073B6F` border
- System: `#1168BD` bg, `#FFFFFF` font, `#3C7FC0` border
- External System: `#999999` bg, `#FFFFFF` font, `#8A8A8A` border
- External Person: `#686868` bg, `#FFFFFF` font, `#8A8A8A` border

#### Container Level
- Container: `#438DD5` bg, `#FFFFFF` font, `#3C7FC0` border
- External Container: `#B3B3B3` bg, `#FFFFFF` font, `#A6A6A6` border

#### Component Level
- Component: `#85BBF0` bg, `#000000` font, `#78A8D8` border
- External Component: `#CCCCCC` bg, `#000000` font, `#BFBFBF` border

#### Global Colors
- Arrow: `#666666`
- Boundary: `#444444` text, transparent bg
- Legend Title: `#000000`
- Legend Text: `#FFFFFF`

### Box Styling (IMPORTANT)
- [ ] Sharp corners (RoundCorner=0, DiagonalCorner=0) - DEFAULT
- [ ] Rounded boxes (RoundCorner=25, DiagonalCorner=0) - NEW_C4_STYLE
- [ ] Octagonal (RoundCorner=0, DiagonalCorner=18)
- **Font Sizes:**
  - Label: Default (14pt)
  - Stereotype: 12pt
  - Technology: 12pt
  - Arrow: 12pt
  - Default wrap width: 200px

### Relationship Types (IMPORTANT)
- [x] `Rel()` - Standard forward `-->`
- [x] `BiRel()` - Bidirectional `<<-->>`
- [x] `Rel_Back()` - Backward `<<--`
- [x] `Rel_Neighbor()` - Neighbor `->`
- [x] Directional variants: `_D()`, `_U()`, `_L()`, `_R()`
- [x] Bidirectional variants: `BiRel_*`
- **Label Support:**
  - Description + Technology/Protocol
  - Auto line-break at 35 chars (tech), 32 chars (descr)

### Boundary Types (IMPORTANT)
- [x] Enterprise Boundary
- [x] System Boundary
- [x] Container Boundary
- [x] Visual Style: Dashed border, transparent bg
- [x] Nesting support (boundaries within boundaries)

## Diagram Type Support

### System Context (C4_Context.puml equivalent)
- [x] Person element
- [x] System element
- [x] System_Boundary
- [x] Enterprise_Boundary
- [x] External variants (Person_Ext, System_Ext)

### Container (C4_Container.puml equivalent)
- [x] All Context elements
- [x] Container element
- [x] Container_Boundary
- [x] ContainerDb, ContainerQueue variants
- [x] External variants

### Component (C4_Component.puml equivalent)
- [x] All Container elements
- [x] Component element
- [x] ComponentDb, ComponentQueue variants
- [x] External variants

### Dynamic/Sequence (C4_Dynamic.puml, C4_Sequence.puml equivalent)
- [ ] Numbered interactions
- [ ] Index() function support
- [ ] Sequence styling
- [ ] Participant support

## Advanced Features

### Tag System (IMPORTANT)
- [x] Custom `+tag` notation: `Element(..., $tags="tag1+tag2")`
- [x] Tag-specific styling
- [x] Tag-dependent sprite assignment
- [x] Tag-dependent technology assignment
- [x] Legend entries for custom tags

### Theming Support (NICE-TO-HAVE)
- [ ] 7+ color themes (blue, brown, green, sandstone, superhero, united, violet)
- [ ] Language localization (12 languages)
- [ ] Custom theme creation
- [ ] Theme inheritance

### Legend System (IMPORTANT)
- [x] Automatic generation
- [x] Element type indicators with color swatches
- [x] Custom tag information
- [x] Detail levels: none, small, normal
- [x] Legend positioning

### Sprite/Icon Support (NICE-TO-HAVE)
- [x] PlantUML sprite integration
- [x] Icon placement at element top
- [x] Custom sprite references
- [x] Sprite in legend

### Link Support (NICE-TO-HAVE)
- [x] Hyperlinks on elements
- [x] Hyperlinks on relationships
- [x] SVG export compatibility

## Properties & Metadata

### Element Properties Table (ADVANCED)
- [ ] SetPropertyHeader(col1, col2, col3, col4)
- [ ] AddProperty() function
- [ ] Multi-column property display
- [ ] Integration with element display

## Style Customization

### UpdateElementStyle() Function
- [x] Custom element type definition
- [x] Color overrides (bg, font, border)
- [x] Shadow/3D effect
- [x] Shape selection
- [x] Sprite assignment
- [x] Technology default
- [x] Legend text
- [x] Border style
- [x] Border thickness

### NEW_C4_STYLE Support
- [ ] Flag: `!NEW_C4_STYLE = 1` support
- [ ] Color swapping (bg/font)
- [ ] Modern appearance opt-in
- [ ] Backward compatibility maintained

## Quality Checklist

### Compliance
- [x] Follows official C4 model standards
- [x] Maintains visual hierarchy
- [x] Consistent color language
- [x] Proper boundary semantics
- [x] Relationship direction clarity

### Usability
- [x] Intuitive procedure names
- [x] Consistent parameter order
- [x] Sensible defaults
- [x] Easy extension mechanism
- [x] Clear documentation with examples

### Performance
- [x] Lazy rendering (sprites only if provided)
- [x] Efficient string handling
- [x] Minimal variable overhead
- [x] PlantUML compatibility optimized

### Accessibility
- [x] High contrast colors
- [x] Shape variants for color-blind
- [x] Multi-language support
- [x] Scalable shapes/fonts
- [x] SVG/PNG export support

## Recommendations for C4X Extension

### Phase 1: Core Implementation
1. Implement standard C4 color palette
2. Create element type definitions (Person, System, Container, Component)
3. Implement boundary types with dashed styling
4. Support 4 relationship types (Rel, BiRel, Rel_Back, Rel_Neighbor)
5. Generate automatic legend

### Phase 2: Enhanced Features
1. Add directional relationship variants (_D,_U, _L,_R)
2. Implement tag system with custom styling
3. Add sprite/icon support
4. Implement theme system
5. Add property tables/metadata

### Phase 3: Advanced Features
1. Support NEW_C4_STYLE
2. Add 12-language localization
3. Implement sketch mode
4. Advanced layout options
5. Deployment diagram support

### Key Files to Reference
- **C4.puml** (67KB): Core library architecture - observe:
  - Element structure functions (lines 1205-1236)
  - SkinParam configuration (lines 160-263)
  - Tag system implementation
  - Styling procedures

- **C4_Context.puml** (21.6KB): Context-level implementation
- **C4_Container.puml** (5.7KB): Container-level implementation
- **C4_Component.puml** (4.5KB): Component-level implementation

### Test Cases to Verify
1. Simple System Context diagram (Person, System, Relationships)
2. Container diagram with System_Boundary
3. Component diagram with nesting
4. Relationship with technology/description
5. Custom tags with styling
6. Legend generation and positioning
7. External vs internal element coloring
8. All three shape variants (sharp, rounded, octagonal)
9. Theme application
10. SVG export validation

## Visual Comparison Points

### Against C4-PlantUML Standard
- Color values must match exactly
- Font sizes should follow specification
- Boundary style: dashed lines, transparent bg
- Element ordering in legend
- Tag notation syntax ("+")
- Stereotype notation ("<<>>")
- Special shapes (database, queue, person)

### Expected Output Examples
```
System Context:
  [Person box] --[uses]--> [System box] --[external]--> [External System box]
  [Enterprise Boundary]
    [System Boundary]
      [Container box]

Container:
  [Person] --[uses]--> [System Boundary]
    [Web Container] [API Container]
    [Database Container]

Component:
  [System Boundary]
    [Container Boundary]
      [Component] [Component] [Component]
```
