# Structurizr DSL Compatibility

This document describes the compatibility between the C4Model VSCode extension's Structurizr DSL parser and the official Structurizr DSL specification.

## Compatibility Status

**Target Coverage**: 80% of common Structurizr DSL features
**Current Status**: MVP - Phase 4 Complete
**Version**: v0.4.0

## Supported Features ✅

### Top-Level Structure
- ✅ `workspace` keyword with name and description
- ✅ `model { }` block for elements and relationships
- ✅ `views { }` block for view definitions
- ✅ `styles { }` block for visual styling

### Elements
- ✅ `person` - External users/actors
- ✅ `softwareSystem` - Software systems
- ✅ `container` - Containers within software systems
- ✅ `component` - Components within containers
- ✅ Element identifiers and names
- ✅ Element descriptions
- ✅ Element technology (for containers and components)
- ✅ Nested elements (containers in systems, components in containers)

### Relationships
- ✅ Basic relationship syntax: `source -> destination "description"`
- ✅ Relationship with technology: `source -> destination "description" "technology"`
- ✅ Multiple relationships between elements

### Views
- ✅ `systemContext` - System context views
- ✅ `container` - Container views
- ✅ `component` - Component views
- ✅ View keys and descriptions
- ✅ `include *` - Include all elements (wildcard)
- ✅ `include element1 element2` - Include specific elements
- ✅ `exclude element1` - Exclude specific elements

### Styles
- ✅ `element "tag" { }` - Element styles by tag
- ✅ `relationship "tag" { }` - Relationship styles by tag
- ✅ `background` - Background color
- ✅ `color` / `colour` - Text color (both spellings supported)
- ✅ `shape` - Element shape
- ✅ `thickness` - Relationship line thickness
- ✅ `style` - Relationship line style (Solid, Dashed, Dotted)

### Comments
- ✅ Line comments: `// comment`
- ✅ Block comments: `/* comment */`
- ✅ Multiline block comments

### Data Types
- ✅ Strings with quotes: `"text"`
- ✅ Escape sequences: `\"`, `\n`, `\t`, `\\`
- ✅ Multiline strings
- ✅ Color hex values: `#RRGGBB`, `#RGB`
- ✅ Numbers: `42`, `3.14`
- ✅ Booleans: `true`, `false`
- ✅ URLs: `https://...`, `http://...`

## Unsupported Features ⏳

### Elements (Not Yet Implemented)
- ⏳ `group` - Element grouping
- ⏳ `deploymentNode` - Deployment infrastructure
- ⏳ `infrastructureNode` - Infrastructure elements
- ⏳ `softwareSystemInstance` - Deployment instances
- ⏳ `containerInstance` - Container instances
- ⏳ `element.property` - Custom properties
- ⏳ `element.tags` - Multiple tags per element
- ⏳ `element.url` - External documentation links

### Relationships (Not Yet Implemented)
- ⏳ Bi-directional relationships
- ⏳ Relationship tags
- ⏳ Relationship properties
- ⏳ Relationship URLs

### Views (Not Yet Implemented)
- ⏳ `systemLandscape` - System landscape views
- ⏳ `deployment` - Deployment views
- ⏳ `dynamic` - Dynamic views
- ⏳ `filtered` - Filtered views
- ⏳ `autoLayout` - Automatic layout directives
- ⏳ View properties and perspectives

### Styles (Advanced)
- ⏳ `icon` - Custom element icons
- ⏳ `fontSize` - Font size customization
- ⏳ `border` - Border styles
- ⏳ `width` / `height` - Element dimensions
- ⏳ `metadata` - Show/hide metadata
- ⏳ `description` - Show/hide descriptions
- ⏳ `routing` - Relationship routing styles
- ⏳ `position` - Label positioning

### Configuration
- ⏳ `!docs` - Documentation references
- ⏳ `!adrs` - Architecture Decision Records
- ⏳ `!identifiers` - Element identifier format
- ⏳ `!impliedRelationships` - Automatic relationships
- ⏳ `workspace extends` - Workspace extension

### Scripting
- ⏳ `!script` - External scripts
- ⏳ `!include` - File includes
- ⏳ `!constant` - Constants/variables

## Migration Guide

### From Structurizr Cloud/Lite

If you're migrating from Structurizr Cloud or Structurizr Lite, most basic diagrams will work with minimal changes:

**Fully Compatible** ✅
```dsl
workspace "My Workspace" {
    model {
        user = person "User"
        system = softwareSystem "My System" {
            web = container "Web App"
            api = container "API"
            db = container "Database"
        }

        user -> web "Uses"
        web -> api "Calls"
        api -> db "Reads/Writes"
    }

    views {
        systemContext system "SystemContext" {
            include *
        }

        container system "Containers" {
            include *
        }
    }

    styles {
        element "Person" {
            background #08427B
            color #FFFFFF
            shape Person
        }
    }
}
```

**Requires Adaptation** ⚠️
- Remove `!docs`, `!adrs`, `!identifiers` directives
- Remove `deployment` views (use `container` views instead)
- Remove `group` blocks (flatten to direct elements)
- Remove custom properties (not yet supported)
- Simplify `autoLayout` directives (basic support only)

### Example Transformation

**Before (Full Structurizr)**:
```dsl
workspace {
    !identifiers hierarchical
    !docs docs

    model {
        group "External" {
            user = person "User"
        }

        system = softwareSystem "System" {
            url "https://example.com"
            properties {
                "Owner" "Platform Team"
            }
        }
    }
}
```

**After (C4Model Extension)**:
```dsl
workspace "My Workspace" {
    model {
        user = person "User"

        system = softwareSystem "System"
    }

    views {
        systemContext system "diagram" {
            include *
        }
    }
}
```

## Roadmap

### Phase 4 (Current) - MVP ✅
- Basic workspace, model, views, styles
- Core element types (person, softwareSystem, container, component)
- Simple relationships
- Include/exclude filters
- Basic styling

### Phase 5 (Future)
- PlantUML C4 compatibility
- Additional view types (deployment, dynamic)
- Element grouping
- Custom properties and tags
- Advanced styling options

### Phase 6 (Future)
- Full Structurizr DSL compatibility
- Workspace extension
- File includes
- Documentation integration
- Advanced layout control

## Known Limitations

1. **No Server Integration**: This extension parses and renders Structurizr DSL locally. It does not integrate with Structurizr Cloud or Lite servers.

2. **View Type Limitations**: Only system context, container, and component views are supported. Deployment and dynamic views are not yet implemented.

3. **Styling Limitations**: Advanced styling options (icons, dimensions, routing) are not yet supported.

4. **No Scripting**: Script execution and file includes are not supported.

5. **No Validation**: Element references are not validated during parsing (may result in runtime errors if references are invalid).

## Testing Coverage

- **Lexer**: 62 test cases
- **Parser**: 45 test cases
- **Adapter**: 32 test cases
- **Integration**: 18 test cases
- **Total**: 157 test cases

## Performance

- **Lexing**: < 100ms for typical workspaces
- **Parsing**: < 100ms for typical workspaces
- **Full Render**: < 300ms (lex + parse + layout + render)

Tested with workspaces containing:
- Up to 50 elements
- Up to 100 relationships
- Up to 10 views

## Feedback and Contributions

If you encounter compatibility issues or need support for additional Structurizr DSL features, please:

1. Check this compatibility matrix
2. Review the [EXAMPLES.md](./EXAMPLES.md) for usage patterns
3. Open an issue on GitHub with a minimal reproduction example

## References

- [Official Structurizr DSL Language Reference](https://github.com/structurizr/dsl/blob/master/docs/language-reference.md)
- [Structurizr](https://structurizr.com/)
- [C4 Model](https://c4model.com/)
