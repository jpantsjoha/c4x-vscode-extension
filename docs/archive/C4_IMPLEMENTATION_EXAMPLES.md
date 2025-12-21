# C4-PlantUML Implementation - Code Examples & References

## Element Structure Examples

### How C4-PlantUML Builds Elements

**Source Code Reference:** C4.puml lines 1205-1236

```plaintext
Input: Person(customer, "Banking Customer", "Uses the system")
Output Structure:

== Banking Customer
//12pt//

Uses the system
```

**With Technology/Sprite:**
```plaintext
Input: Container(web, "Web App", "Java Spring", "Serves UI", $sprite="java")
Output Structure:

[java icon here]

== Web App
//Java Spring//

Serves UI
```

### Core Functions

#### $getElementBase($label, $techn, $descr, $sprite)

**Location:** C4.puml, lines 1205-1225

```
Function Purpose: Build the content of an element
Input Parameters:
  $label  - Element title (e.g., "Banking System")
  $techn  - Technology/protocol (e.g., "Java Spring MVC")
  $descr  - Optional description
  $sprite - Optional icon name (e.g., "java")

Output:
  Formatted string with:
  - Sprite at top (if provided)
  - Bold label using == prefix
  - Technology in brackets with size 12 font
  - Description after blank line separator
```

**Example Expansion:**
```plaintext
$getElementBase("Web App", "Java", "Serves UI", "java")
  returns:
  "[java sprite]\n== Web App\n//[Java]//\n\nServes UI"
```

#### $getElementLine($shape, $type, $alias, $label, $techn, $descr, $sprite, $tags, $link)

**Location:** C4.puml, lines 1227-1236

```
Function Purpose: Create complete PlantUML element definition
Input Parameters:
  $shape  - UML shape: rectangle, database, queue
  $type   - Element type: system, container, component
  $alias  - Variable name for reference (e.g., "web_app")
  $label  - Human-readable title
  $techn  - Technology/protocol information
  $descr  - Optional description
  $sprite - Icon name
  $tags   - Custom styling tags (e.g., "backend+java")
  $link   - Hyperlink destination

Output:
  rectangle "== Web App\n//Java//\n\nServes UI" <<system+backend+java>> as web_app [https://...]
```

---

## Color Palette Implementation

### Color Definition Pattern (C4.puml, lines 1-100)

```plaintext
Global Colors (lines 46-66):
!$ELEMENT_FONT_COLOR ?= "#FFFFFF"
!$ARROW_COLOR ?= "#666666"
!$ARROW_FONT_COLOR ?= $ARROW_COLOR
!$BOUNDARY_COLOR ?= "#444444"
!$BOUNDARY_BG_COLOR ?= "transparent"

Context Level (C4_Context.puml, lines 13-51):
!$PERSON_BG_COLOR ?= "#08427B"
!$PERSON_FONT_COLOR ?= $ELEMENT_FONT_COLOR
!$PERSON_BORDER_COLOR ?= "#073B6F"

!$SYSTEM_BG_COLOR ?= "#1168BD"
!$SYSTEM_FONT_COLOR ?= $ELEMENT_FONT_COLOR
!$SYSTEM_BORDER_COLOR ?= "#3C7FC0"

Container Level (C4_Container.puml, lines 13-26):
!$CONTAINER_BG_COLOR ?= "#438DD5"
!$CONTAINER_FONT_COLOR ?= $ELEMENT_FONT_COLOR
!$CONTAINER_BORDER_COLOR ?= "#3C7FC0"

Component Level (C4_Component.puml, lines 14-23):
!$COMPONENT_BG_COLOR ?= "#85BBF0"
!$COMPONENT_FONT_COLOR ?= "#000000"
!$COMPONENT_BORDER_COLOR ?= "#78A8D8"
```

### Color Application via SkinParam

**Location:** C4.puml, lines 174-198

```plaintext
skinparam rectangle {
    StereotypeFontSize 12
}

skinparam rectangle<<person>> {
    BackgroundColor #08427B
    FontColor #FFFFFF
    BorderColor #073B6F
}

skinparam rectangle<<system>> {
    BackgroundColor #1168BD
    FontColor #FFFFFF
    BorderColor #3C7FC0
}
```

---

## Styling Implementation

### UpdateElementStyle() Function

**Location:** C4.puml, lines 1067+

**Purpose:** Configure visual appearance of element type

```plaintext
UpdateElementStyle("person", "#08427B", "#FFFFFF", "#073B6F", 
                   $shape=$DEFAULT_SHAPE, $legendText="person")

This Macro:
1. Sets background color to #08427B
2. Sets font color to #FFFFFF  
3. Sets border color to #073B6F
4. Applies shape (sharp corners by default)
5. Adds legend entry "person"

Result: All <<person>> stereotypes rendered with these colors
```

### Shape Configuration

**Location:** C4.puml, lines 141-148

```plaintext
!global $SHARP_CORNER = "sharpCorner"
!global $ROUNDED_BOX = "roundedBox"
!global $EIGHT_SIDED = "eightSided"

!if (NEW_C4_STYLE == 1)
  !$DEFAULT_SHAPE ?= $ROUNDED_BOX
!else
  !$DEFAULT_SHAPE ?= $SHARP_CORNER
!endif
```

**Shape Application (via $elementTagSkinparams):**

```plaintext
RoundCorner=0, DiagonalCorner=0        → Sharp corners
RoundCorner=25, DiagonalCorner=0       → Rounded box
RoundCorner=0, DiagonalCorner=18       → Octagonal
```

---

## Relationship Implementation

### Relationship Types

**Location:** C4.puml, lines 1773-1851

```plaintext
!unquoted procedure Rel($from, $to, $label, $techn="", $descr="", ...)
  $getRel("-->>", $from, $to, $label, $techn, $descr, $sprite, $tags, $link)
!endprocedure

!unquoted procedure BiRel($from, $to, $label, $techn="", ...)
  $getRel("<<-->>", $from, $to, $label, $techn, $descr, ...)
!endprocedure

!unquoted procedure Rel_Back($from, $to, $label, $techn="", ...)
  $getRel("<<--", $from, $to, $label, $techn, $descr, ...)
!endprocedure

!unquoted procedure Rel_Neighbor($from, $to, $label, $techn="", ...)
  $getRel("->>", $from, $to, $label, $techn, $descr, ...)
!endprocedure
```

**Arrow Pattern Notation:**
- `-->>` = standard forward arrow
- `<<-->>` = bidirectional arrows
- `<<--` = backward arrow
- `->>` = neighbor arrow (no double dash)

### Directional Modifiers

```plaintext
Rel_D() / Rel_Down()  → $down("-", "->>")  → downward layout
Rel_U() / Rel_Up()    → $up("-", "->>")    → upward layout
Rel_L() / Rel_Left()  → $left("-", "->>")  → leftward layout
Rel_R() / Rel_Right() → $right("-", "->>") → rightward layout
```

### Relationship Label Rendering

**From getRel() function:**

```plaintext
Rel(user, system, "Uses", "HTTPS")
  Renders as:
  user --> system : Uses\nHTTPS

Rel(system, db, "Reads/Writes", "async, JDBC", "Via ORM layer")
  Renders as:
  system --> db : Reads/Writes\nasync, JDBC\nVia ORM layer

Auto line-breaking at:
- 35 chars for technology (\n inserted)
- 32 chars for description (\n inserted)
```

---

## Boundary Implementation

### Boundary Structure

**Location:** C4.puml, lines 1656-1662

```plaintext
!unquoted procedure Boundary($alias, $label, $type="", $tags="", $link="", $descr="")
  !$boundaryTags = $addBoundaryPostfix($tags)
  !$type=$toElementArg($type, $boundaryTags, "ElementTagTechn", "boundary")
  !$sprite=$toElementArg("", $boundaryTags, "ElementTagSprite", "boundary")
  rectangle "$getBoundary($label, $type, $descr, $sprite)" 
    $toStereos("boundary", $boundaryTags) as $alias $getLink($link)
!endprocedure
```

### Boundary Visual Styling

**Location:** C4.puml, lines 1664-1665

```plaintext
UpdateBoundaryStyle("", 
  $bgColor=$BOUNDARY_BG_COLOR,       → transparent
  $fontColor=$BOUNDARY_COLOR,        → #444444
  $borderColor=$BOUNDARY_COLOR,      → #444444
  $borderStyle=DashedLine(),         → dashed
  $legendText="$BOUNDARY_LEGEND_TEXT"
)
```

**PlantUML SkinParams (lines 267-278):**

```plaintext
skinparam rectangle<<boundary>> {
    StereotypeFontSize 6  (50% of default 12)
    StereotypeFontColor transparent
    BorderStyle dashed
}

skinparam package {
    StereotypeFontSize 6
    StereotypeFontColor transparent
    BackgroundColor transparent
}
```

### Boundary Hierarchy

```plaintext
C4_Context.puml:
  Enterprise_Boundary() → uses boundary +enterprise tag
  System_Boundary()     → uses boundary +system tag

C4_Container.puml:
  Container_Boundary()  → uses boundary +container tag

Usage:
  Enterprise_Boundary(c1, "Org Boundary") {
    System_Boundary(c2, "System Scope") {
      Container(web, "Web App")
    }
  }
```

---

## Tag System Implementation

### Tag Definition

**Location:** C4_Context.puml, lines 66-77

```plaintext
!unquoted procedure AddPersonTag($tagStereo, $bgColor="", $fontColor="", 
                                  $borderColor="", $shadowing="", $shape="", 
                                  $sprite="", $legendText="", ...)
  $addElementTagInclReuse("person", $tagStereo, $bgColor, $fontColor, 
                         $borderColor, $shadowing, $shape, $sprite, ...)
!endprocedure
```

### Tag Application

```plaintext
Person(user, "User", "External user", $tags="mobile+web")
  Creates stereotypes: <<mobile>> <<web>> <<person>>
  
Custom styling:
  AddPersonTag("mobile", "#FF5733", "#FFFFFF", "")
  AddPersonTag("web", "#33FF57", "#FFFFFF", "")
  
Result: User element appears with custom colors
        Legend shows both mobile and web tags
```

### Tag-Dependent Properties

```plaintext
Person(user, "User", $tags="admin", $sprite="", $type="")
  
If tag "admin" has:
  ElementTagSprite = "admin_icon"
  ElementTagTechn = "System Admin"
  
Result: User shows:
  [admin_icon]
  == User
  //System Admin//
```

---

## Legend System

### Automatic Legend Generation

**Location:** C4_Context.puml, lines 55-71

```plaintext
SetDefaultLegendEntries("person\nsystem\nexternal_person\nexternal_system...")

LAYOUT_WITH_LEGEND():
  hide stereotype
  legend right
    |<color:$LEGEND_TITLE_COLOR>**Legend**</color> |
    |<$PERSON_BG_COLOR> person |
    |<$SYSTEM_BG_COLOR> system|
    |<$EXTERNAL_PERSON_BG_COLOR> external person |
    |<$EXTERNAL_SYSTEM_BG_COLOR> external system |
  endlegend
```

### Legend Detail Levels

```plaintext
$LEGEND_DETAILS_NONE = "none"      → Minimal legend
$LEGEND_DETAILS_SMALL = "small"    → 10pt font
$LEGEND_DETAILS_NORMAL = "normal"  → 14pt font

Usage:
  SHOW_LEGEND($LEGEND_DETAILS_NORMAL)
```

---

## Example Diagram: System Context

**Reference:** samples/C4_Context Diagram Sample - bigbankplc.puml

```plaintext
@startuml
!include https://.../C4_Context.puml

LAYOUT_WITH_LEGEND()

title System Context diagram for Internet Banking System

Person(customer, "Personal Banking Customer", "A customer of the bank...")
System(banking_system, "Internet Banking System", "Allows customers to view...")

System_Ext(mail_system, "E-mail system", "The internal Microsoft Exchange...")
System_Ext(mainframe, "Mainframe Banking System", "Stores all core banking...")

Rel(customer, banking_system, "Uses")
Rel_Back(customer, mail_system, "Sends e-mails to")
Rel_Neighbor(banking_system, mail_system, "Sends e-mails", "SMTP")
Rel(banking_system, mainframe, "Uses")

@enduml
```

**Rendering Details:**

```plaintext
Person box (customer):
  Color: #08427B background, #FFFFFF text
  Content: == Personal Banking Customer
           A customer of the bank...

System box (banking_system):
  Color: #1168BD background, #FFFFFF text
  Content: == Internet Banking System
           Allows customers to view...

System_Ext box (mail_system):
  Color: #999999 background, #FFFFFF text
  Content: == E-mail system
           The internal Microsoft Exchange...

Relationships:
  customer --> banking_system : Uses
  customer <-- mail_system : Sends e-mails to
  banking_system ->> mail_system : Sends e-mails SMTP (neighbor)
  banking_system --> mainframe : Uses

Legend shows: Person, System, External Person, External System
```

---

## Example Diagram: Container

**Reference:** samples/C4_Container Diagram Sample - bigbankplc.puml

```plaintext
@startuml
!include https://.../C4_Container.puml

LAYOUT_WITH_LEGEND()

title Container diagram for Internet Banking System

Person(customer, "Customer", "...")

System_Boundary(c1, "Internet Banking") {
    Container(web_app, "Web Application", "Java, Spring MVC", "...")
    Container(spa, "Single-Page App", "JavaScript, Angular", "...")
    Container(mobile_app, "Mobile App", "C#, Xamarin", "...")
    ContainerDb(database, "Database", "SQL Database", "...")
    Container(backend_api, "API Application", "Java, Docker", "...")
}

System_Ext(email_system, "E-Mail System", "...")
System_Ext(banking_system, "Mainframe Banking System", "...")

Rel(customer, web_app, "Uses", "HTTPS")
Rel(customer, spa, "Uses", "HTTPS")
Rel_Neighbor(web_app, spa, "Delivers")
Rel(spa, backend_api, "Uses", "async, JSON/HTTPS")
Rel_Back_Neighbor(database, backend_api, "Reads from and writes to", "sync, JDBC")

@enduml
```

**Rendering Details:**

```plaintext
System_Boundary renders as:
  Dashed rectangle with label "Internet Banking"
  Transparent background
  Contains nested containers

Container boxes:
  Color: #438DD5 background, #FFFFFF text
  Content: == Container Name
           Technology, Type
           Optional description

ContainerDb:
  Same colors as Container
  Rendered as database shape (cylinder) instead of rectangle

Relationships include technology info:
  Rel_Neighbor: single arrow, horizontal bias
  Rel_Back_Neighbor: backward arrow, horizontal bias
```

---

## File Structure Reference

**Absolute Paths in C4-PlantUML:**

```
/Users/jp/workspaces/C4-PlantUML/
├── C4.puml                           (67KB - Base library)
│   ├── Colors & Skinparams (100+ lines)
│   ├── Element functions (1200+ lines)
│   ├── Relationship procedures (80 lines)
│   └── Styling/legend/utilities (600+ lines)
│
├── C4_Context.puml                   (21.6KB)
│   ├── Person/System colors
│   ├── Enterprise/System boundaries
│   └── Person/System procedures
│
├── C4_Container.puml                 (5.7KB)
│   ├── Container colors
│   ├── Container procedures
│   └── Container_Boundary
│
├── C4_Component.puml                 (4.5KB)
│   ├── Component colors
│   ├── Component procedures
│   └── External variants
│
├── C4_Dynamic.puml                   (10KB)
├── C4_Deployment.puml                (6.5KB)
├── C4_Sequence.puml                  (15.8KB)
│
├── themes/                           (13 theme files)
│   ├── puml-theme-C4_*.puml         (7 color themes)
│   └── puml-theme-C4Language_*.puml (12 language files)
│
├── samples/                          (20+ example files)
│   ├── C4_Context Diagram Sample...
│   ├── C4_Container Diagram Sample...
│   ├── C4_Component Diagram Sample...
│   └── ...more examples
│
├── README.md                         (85.7KB)
├── Themes.md                         (53.5KB)
└── LayoutOptions.md                  (58.7KB)
```
