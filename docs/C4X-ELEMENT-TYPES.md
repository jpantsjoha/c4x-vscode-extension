# C4X Valid Element Types

This document lists all valid C4 element types accepted by the C4X parser.

## Valid Element Types

The C4X extension strictly enforces the C4 Model element type taxonomy. The following element types are supported:

### Person

Represents a human user or actor in the system.

```text
Person(id, "Label", "Description")
Person_Ext(id, "Label", "Description")  // External person
```

**Aliases**: `person`, `person_ext`

**Example**:

```c4x
%%{ c4: system-context }%%
graph TB
  Person(user, "Customer", "End user of the system")
  Person_Ext(support, "Support Team", "External support staff")
```

### Software System

Represents a software system - the highest level of abstraction.

```text
System(id, "Label", "Description")
System_Ext(id, "Label", "Description")   // External system
SystemDb(id, "Label", "Description")     // System with database icon
SystemDb_Ext(id, "Label", "Description") // External system with database
```

**Aliases**: `system`, `system_ext`, `systemdb`, `systemdb_ext`, `software system`, `softwaresystem`

**Example**:

```c4x
%%{ c4: system-context }%%
graph TB
  System(app, "Mobile App", "Primary user interface")
  System_Ext(payment, "Payment Gateway", "External payment processor")
```

### Container

Represents an application or data store within a system.

```text
Container(id, "Label", "Technology", "Description")
Container_Ext(id, "Label", "Technology", "Description")   // External container
ContainerDb(id, "Label", "Technology", "Description")     // Container with database icon
ContainerDb_Ext(id, "Label", "Technology", "Description") // External container with database
```

**Aliases**: `container`, `container_ext`, `containerdb`, `containerdb_ext`

**Example**:

```c4x
%%{ c4: container }%%
graph TB
  Container(api, "REST API", "Node.js", "Handles business logic")
  ContainerDb(db, "Database", "PostgreSQL", "Stores user data")
```

### Component

Represents a code-level component within a container.

```text
Component(id, "Label", "Technology", "Description")
Component_Ext(id, "Label", "Technology", "Description")   // External component
ComponentDb(id, "Label", "Technology", "Description")     // Component with database icon
ComponentDb_Ext(id, "Label", "Technology", "Description") // External component with database
```

**Aliases**: `component`, `component_ext`, `componentdb`, `componentdb_ext`

**Example**:

```c4x
%%{ c4: component }%%
graph TB
  Component(ctrl, "UserController", "TypeScript", "Handles user requests")
  Component(svc, "UserService", "TypeScript", "Business logic layer")
```

### Deployment Node

Represents infrastructure nodes in deployment diagrams.

```text
Node(id, "Label", "Technology", "Description")
```

**Aliases**: `node`

## Invalid Element Types

The following are **NOT** valid C4 element types and will cause parse errors:

- ❌ `Developer` - Use `Person` instead
- ❌ `User` - Use `Person` instead (or as an ID, not a type)
- ❌ `Database` - Use `ContainerDb` or `SystemDb` instead
- ❌ `Service` - Use `Container` instead
- ❌ `API` - Use `Container` or `System` instead
- ❌ `Module` - Use `Component` instead
- ❌ `Class` - Use `Component` instead
- ❌ Any other custom types

## Validation

### Real-time IDE Validation

The C4X extension provides real-time syntax validation in VS Code:

1. **DiagnosticsManager**: Validates C4X code blocks in markdown files as you type
2. **Error Highlighting**: Invalid element types are highlighted with red squiggles
3. **Error Messages**: Hover over errors to see "Unsupported element type" messages

### Pre-commit Validation

The validation script runs automatically during pre-commit:

```bash
pnpm run validate:docs
```

This script:

1. Scans all markdown files for `c4x` code blocks
2. Parses each block using the PEG.js grammar
3. **Validates element types** by building the C4 model
4. Reports any syntax or element type errors

### Manual Validation

To manually validate all examples:

```bash
make verify-docs
```

## Common Mistakes

### 1. Using descriptive names as types

**Wrong**: Using `Developer` as an element type

```text
Developer(john, "John Doe", "Software engineer")
```

**Correct**: Use `Person` instead

```c4x
%%{ c4: system-context }%%
graph TB
  Person(john, "John Doe", "Software engineer")
```

### 2. Confusing element ID with element type

The syntax is: `Type(id, "label", ...)`

**Wrong**: Using the type name as the ID and referencing the type in relationships

```text
Person(Person, "User", "Uses the system")
Person -->|uses| System  // This references the type, not an ID!
```

**Correct**: Use a unique ID and reference it in relationships

```c4x
%%{ c4: system-context }%%
graph TB
  Person(user, "User", "Uses the system")
  System(app, "Application", "The main system")

  user -->|uses| app
```

### 3. Case sensitivity

Element types are case-insensitive but normalized:

```c4x
%%{ c4: system-context }%%
graph TB
  Person(id1, "User 1")
  person(id2, "User 2")
  PERSON(id3, "User 3")
```

All three are treated as `Person` type.

## Reference

Element type mapping is defined in `src/model/C4ModelBuilder.ts`:

```typescript
const ELEMENT_TYPE_MAP: Record<string, C4ElementType> = {
    'person': 'Person',
    'person_ext': 'Person',
    'software system': 'SoftwareSystem',
    'softwaresystem': 'SoftwareSystem',
    'system': 'SoftwareSystem',
    'system_ext': 'SoftwareSystem',
    // ... etc
};
```

For the complete list, see: `src/model/C4ModelBuilder.ts` (lines 5-23)
