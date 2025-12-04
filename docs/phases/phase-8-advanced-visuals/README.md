# Phase 8: Advanced Visuals (v1.2)

**Goal**: Expand the visual vocabulary to support complex, real-world enterprise architectures.
**Focus**: Deployment, Dynamics, and Customization.

## 🎯 Objectives

### 1. Deployment Diagrams (C4 Level 4)
**Context**: Users need to show *where* containers run (AWS, Azure, On-prem).
**Features**:
- `Node` element (e.g., "Database Server", "Kubernetes Cluster").
- Nested nodes (Pod inside Cluster inside Region).
- Mapping containers to nodes.

### 2. Dynamic Diagrams
**Context**: Static structure doesn't show *runtime behavior* (A calls B, then B calls C).
**Features**:
- Sequence-like numbering (`1:`, `2:`, `3:`).
- Highlighting active path.
- Conditional flows.

### 3. Custom Icons & Sprites
**Context**: "Box and line" is boring. Users want AWS icons, database logos, etc.
**Implementation**:
- Built-in sprite library (AWS, Azure, GCP, Tech stack).
- Syntax: `Container(db, "DB", "PostgreSQL", $sprite="postgresql")`.
- Allow custom SVG URLs (with CSP consideration).

## 📝 Definition of Done
- [ ] Deployment diagrams render with nested infrastructure nodes.
- [ ] Dynamic diagrams visualize numbered flows correctly.
- [ ] Standard icon set (AWS/Azure/Dev) included and renderable.
- [ ] Custom styling overrides (color, shape) functioning.

## 📅 Timeline
- **Start**: Q2 2026
- **Duration**: 4 weeks
