# C4 Visual Design Reference

This document defines the visual styling standards for AI-generated C4 diagrams using `gemini-3-pro-image-preview`.

## Color Palette (Official C4 Model)

| Element Type | Fill Color | Border Color | Text Color |
|--------------|------------|--------------|------------|
| **Person** | #08427B (Dark Blue) | #073B6F | White |
| **Software System** | #1168BD (Blue) | #0E5CA8 | White |
| **Software System (External)** | #999999 (Grey) | #8A8A8A | White |
| **Container** | #438DD5 (Light Blue) | #3B7FC4 | White |
| **Container (Database)** | #438DD5 | #3B7FC4 | White |
| **Component** | #85BBF0 (Lighter Blue) | #78ACE0 | #1E1E1E |
| **Boundary/System Boundary** | Transparent | #CCCCCC (Dashed) | #666666 |

## Shape Standards

### Person (Actor)
- Stick figure icon above rounded rectangle
- Height: ~80px for icon, ~60px for label box
- Label centered below icon

### Software System / Container
- Rounded rectangle (border-radius: 10px)
- Min width: 200px
- Padding: 20px
- Multi-line labels supported

### Database Container
- Cylinder shape OR rounded rectangle with "Database" tag
- Same color as container

### Boundary (System Boundary / Enterprise Boundary)
- **Fill**: **TRANSPARENT** (No fill). Never use colors for boundaries.
- **Border**: Dashed line (stroke-dasharray: 5,5).
- **Label**: Top-left corner.
- **Purpose**: Grouping only. Must not obscure contents.

## Arrow Styles

| Relationship Type | Line Style | Arrow Head |
|-------------------|------------|------------|
| **Uses / Calls** | Solid line | Filled triangle |
| **Async / Publishes** | Dashed line | Filled triangle |
| **Strong / Critical** | Thick solid | Bold filled triangle |

- Arrow labels centered on line
- Font: Sans-serif, 12px
- Background: White halo for readability

## Smart Layout Algorithm
The AI uses a count-based heuristic to determine the optimal layout direction:

### 1. Small Diagrams (≤ 4 Nodes) -> Horizontal (Left-Right)
- **Flow**: Left-to-Right.
- **User Position**: **LEFT** edge.
- **Goal**: Emphasize linear process flow.
```
[User] --> [Frontend] --> [API] --> [Database]
```

### 2. Large Diagrams (≥ 5 Nodes) -> Vertical (Top-Bottom)
- **Flow**: Top-to-Bottom.
- **User Position**: **TOP** center.
- **Goal**: Manage density and hierarchy.
```
        [Person]
            |
    [Software System]
         /    \
  [Container] [Container]
```

### 3. Sequential Override
If the input text describes a strict linear sequence (e.g. `A -> B -> C -> D`), the layout MUST follow that sequence's direction (typically Left-Right) regardless of node count.

## Legend Requirements

Each diagram MUST include a legend box in the bottom-right corner showing:
- Element types used with color key
- Relationship types with line style examples
- Diagram title and scope

## Typography

| Element | Font | Size | Weight |
|---------|------|------|--------|
| Element Label | Sans-serif | 14px | Bold |
| Element Description | Sans-serif | 11px | Normal |
| Relationship Label | Sans-serif | 12px | Normal |
| Legend Text | Sans-serif | 10px | Normal |
| Diagram Title | Sans-serif | 18px | Bold |

## Example Prompts

### System Context (C1)
```
Generate a C4 System Context diagram showing:
- A "Customer" person who uses the "Online Banking System"
- The banking system connects to an external "Email System" for notifications
- The banking system integrates with "Mainframe Banking System" (external)

Use the official C4 Model color scheme. Include a legend.
```

### Container (C2)
```
Generate a C4 Container diagram for "Online Banking System" showing:
- Single Page Application (React) - accessed by Customer
- Mobile App (Flutter) - also accessed by Customer
- API Gateway (Spring Boot) - called by both apps
- User Database (PostgreSQL) - stores account data
- Redis Cache - session management

Group all containers within a "Banking System" boundary.
Use official C4 colors. Include legend.
```
