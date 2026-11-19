# C4X reference

Generated from the grammar, the model builder, the style resolver and the lint catalogue by `pnpm run generate:reference`. Do not edit by hand: the drift test in `make check` fails when this file differs from a fresh run. The machine-readable form is `c4x-reference.json`, described by `c4x-reference.schema.json`.

The notes next to the generator, `scripts/c4x-reference/annotations.ts`, hold the meaning of each argument, each statement and each example. The generator stops when those notes and the code disagree.

## Document

- First line: `%%{ c4: <view> }%%`. It names the view, which decides what the diagram may contain and which lint rules run. Default view: `system-context`.
- Direction line: `graph <direction>`, one of `TB`, `BT`, `LR`, `RL`. The layout direction: top to bottom, bottom to top, left to right, right to left. When it is missing, the parser adds `graph TB`.
- Comment: `%%`. A comment. Runs to the end of the line. C4X comments start with `%%`; `//` and `#` are not comments.

## View types

| View | Level | Shows | Lint rules that run |
|---|---|---|---|
| `system-context` | C1 | The system in scope, the people who use it and the systems it depends on. | C4X-L003, C4X-L006, C4X-L008, C4X-L102, C4X-L104, C4X-L106 |
| `container` | C2 | The applications and data stores inside one system, and how they talk to each other. | C4X-L001, C4X-L002, C4X-L003, C4X-L004, C4X-L005, C4X-L006, C4X-L008, C4X-L102, C4X-L104, C4X-L105, C4X-L106 |
| `component` | C3 | The components inside one container. | C4X-L001, C4X-L002, C4X-L003, C4X-L004, C4X-L005, C4X-L006, C4X-L008, C4X-L101, C4X-L102, C4X-L103, C4X-L104, C4X-L105, C4X-L106 |
| `deployment` | C4 | Where containers run: nested deployment nodes with container instances inside. | C4X-L003, C4X-L006, C4X-L008, C4X-L106 |
| `dynamic` | dynamic | One scenario: the relationships are numbered in source order. | C4X-L003, C4X-L008, C4X-L102, C4X-L104, C4X-L106 |

## Statements

- **Comment**: `%% text`. A comment. Runs to the end of the line. C4X comments start with `%%`; `//` and `#` are not comments.
- **Title**: `title Text`. A title line. Parsed and dropped: it does not appear in the drawing.
- **ClassDef**: `classDef name styles`. A Mermaid class definition. Parsed and ignored (C4X-L115). Use `elementStyle`.
- **ClassAssignment**: `class id1, id2 TagName`. Adds a tag to elements by id. The tag then matches `elementStyle` rules.
- **ElementStyle**: `elementStyle TagName $stroke="#RRGGBB", $shape="Cylinder"`. Styles every element that carries a tag. Top level only. Later keys win; tag matching ignores case.
- **Subgraph**: `subgraph Name { ... }`. An untyped visual group. Its children may be elements, relationships and nested groups. Takes the `direction` statement.
- **DeploymentNode**: `Node(id, "Label", "Technology", "Description") { ... }`. A deployment node with children. Nodes nest. Two forms: the call form, and a short form that takes a quoted label and an optional quoted technology.
- **BoundaryBlock**: `System_Boundary(id, "Label") { ... }`. A typed boundary around the elements inside it.
- **ElementCall**: `Type(id, "Label", "Technology", "Description", $key="value")`. An element in call form, the form to prefer: it has room for technology and description. The type is any identifier at parse time; the model builder accepts only the element kinds listed in elementKinds.
- **Element**: `id[Label<br/>Type<br/>Tag]`. An element in bracket form: label, type and tags on separate lines joined by `<br/>`. It has no slot for technology or description, so rule C4X-L001 and C4X-L002 report it.
- **Relationship**: `from -->|Label| "Technology" to`. A directed relationship between two element ids. The label sits between bars, the technology (protocol) in quotes after it.

## Element call

Form: `Type(id, "Label", "Technology", "Description", $key="value")`. The type is any identifier at parse time; the model builder accepts the spellings below.

| # | Argument | Required | Kind | Meaning |
|---|---|---|---|---|
| 1 | `id` | yes | identifier | The element id: letters, digits, `_` and `-`, starting with a letter or `_`. Relationships and `class` statements refer to it. Unique in the diagram. |
| 2 | `label` | yes | quoted string | The name drawn in bold at the top of the box. Quoted. |
| 3 | `technology` | no | quoted string | The third argument when there are two quoted texts after the label, or the only one for a Container, Component or Node. Drawn in square brackets under the label, in italics. For a Person or a software system with one text after the label, that text is the description instead (see elementKinds). |
| 4 | `description` | no | quoted string | The fourth argument, or the only text after the label for a Person or a software system. Drawn as plain text under the label and the technology. |
| 5 | `attributes` | no | attributes | Zero or more `$key="value"` pairs, comma separated, after the quoted arguments. See attributes. |

Every element kind shares this signature.

## Element kinds

The model builder reads the type name without regard to case. The grammar accepts any identifier as a type, so a name outside this list parses and then fails with C4X-MODEL.

### Person

A human user or actor. Drawn with a person icon.

Use: Pass the description as the one text after the label: `Person(u, "Customer", "Holds an account")`. With two texts they mean technology, then description.

Probed from the parser and builder: with one text after the label it lands in `description`; with two, the third argument lands in `technology` and the fourth in `description`.

| Spelling | External | Database | Call form |
|---|---|---|---|
| `Person` | no | no | yes |
| `Person_Ext` | yes | no | yes |

Implied style tags: `Element`, `Person`; `External` for an external spelling. `$code` is an error.

### SoftwareSystem

A software system: the highest level of abstraction. Use the _Ext spelling for a system outside the scope.

Use: Pass the description as the one text after the label: `System(s, "Core Banking", "Holds accounts")`. With two texts they mean technology, then description.

Probed from the parser and builder: with one text after the label it lands in `description`; with two, the third argument lands in `technology` and the fourth in `description`.

| Spelling | External | Database | Call form |
|---|---|---|---|
| `software system` | no | no | bracket form only |
| `SoftwareSystem` | no | no | yes |
| `System` | no | no | yes |
| `System_Ext` | yes | no | yes |
| `SystemDb` | no | yes | yes |
| `SystemDb_Ext` | yes | yes | yes |

Implied style tags: `Element`, `Software System`; `External` for an external spelling; `Database` for a database spelling. `$code` is an error.

### Container

A separately running application or data store inside a software system.

Use: Pass the technology, then the description: `Container(api, "API", "Java, Spring Boot", "Serves the web app")`.

Probed from the parser and builder: with one text after the label it lands in `technology`; with two, the third argument lands in `technology` and the fourth in `description`.

| Spelling | External | Database | Call form |
|---|---|---|---|
| `Container` | no | no | yes |
| `Container_Ext` | yes | no | yes |
| `ContainerDb` | no | yes | yes |
| `ContainerDb_Ext` | yes | yes | yes |

Implied style tags: `Element`, `Container`; `External` for an external spelling; `Database` for a database spelling. `$code` is allowed.

### Component

A group of related code inside a container, behind one interface.

Use: Pass the technology, then the description: `Component(auth, "Auth Controller", "Spring MVC", "Signs users in")`.

Probed from the parser and builder: with one text after the label it lands in `technology`; with two, the third argument lands in `technology` and the fourth in `description`.

| Spelling | External | Database | Call form |
|---|---|---|---|
| `Component` | no | no | yes |
| `Component_Ext` | yes | no | yes |
| `ComponentDb` | no | yes | yes |
| `ComponentDb_Ext` | yes | yes | yes |

Implied style tags: `Element`, `Component`; `External` for an external spelling; `Database` for a database spelling. `$code` is allowed.

### DeploymentNode

A place where containers run: a server, a cloud region, a cluster, a device. Nodes nest.

Use: Pass the technology, then the description, then a block of children: `Node(k8s, "Cluster", "Kubernetes", "Runs the services") { ... }`.

Probed from the parser and builder: with one text after the label it lands in `technology`; with two, the third argument lands in `technology` and the fourth in `description`.

| Spelling | External | Database | Call form |
|---|---|---|---|
| `Node` | no | no | yes |

Implied style tags: `Element`, `Deployment Node`. `$code` is an error.

## Placement

For each view and each place an element can sit (`root`, or inside a boundary or node), the element spellings the legality table accepts there. The dynamic view is not checked.

### system-context

- root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `Enterprise_Boundary`
- Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`
- System_Boundary: nothing
- Container_Boundary: nothing
- Node: nothing

### container

- root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`, `Enterprise_Boundary`
- Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`
- System_Boundary: `Container`, `Container_Ext`
- Container_Boundary: nothing
- Node: nothing

### component

- root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`, `Enterprise_Boundary`
- Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`
- System_Boundary: `Container`, `Container_Ext`, `Container_Boundary`
- Container_Boundary: `Component`, `Component_Ext`
- Node: nothing

### deployment

- root: `Node`
- Enterprise_Boundary: nothing
- System_Boundary: nothing
- Container_Boundary: nothing
- Node: `Node`, `Container`, `Container_Ext`

## Attributes

- `$code`: Source paths or globs this element stands for, comma separated: `$code="src/api/**, src/main.ts"`. Only on Container and Component. Give it once per element.
- `$shape`: One of the style shapes. Overrides any shape a tag style or the theme sets. Give it once per element.
- `$sprite`: The id of a bundled icon, such as `database`. Drawn as the element icon. See docs/ICONS.md.
- `$tags`: Comma separated tag names: `$tags="Queue, Internal"`. Tags select `elementStyle` rules and appear in the legend.
- Other keys: Any other `$key="value"` is kept as element metadata. It draws nothing, and does not style the element: colours come from tags and `elementStyle`.

## Relationships

Form: `from -->|Label| "Technology" to`. The label sits between `|` bars. The technology is quoted. Parts, in order: `from` (required), `arrow` (required), `label` (optional), `technology` (optional), `to` (required).

| Arrow | Model type | Use |
|---|---|---|
| `-->` | uses | A solid arrow. The default for a call or a dependency. |
| `-.->` | async | A dashed arrow. Use it for asynchronous or optional communication. |
| `==>` | sync | A thick arrow. Use it to stress the main path. |

C4X-L004 asks for a technology on a relationship that crosses a process boundary: between two different containers or software systems, or between a component and a container or software system. Relationships that touch a person, and relationships between two components, are not checked. The technology is stored in the model and drawn under the relationship label as `[technology]` in italics (#421).

## Boundaries

- `System_Boundary(id, "Label") { ... }`: The software system in scope, with its containers inside. Used in container and component views.
- `Container_Boundary(id, "Label") { ... }`: The container in scope, with its components inside. Used in component views. A component view decomposes exactly one (C4X-L101).
- `Enterprise_Boundary(id, "Label") { ... }`: A company, department or other grouping of people and software systems. Used in system context and container views.

## Styles

Style elements by tag with `elementStyle TagName $key="value", ...`, at the top level. Every value is quoted.

| Key | Accepts | Example |
|---|---|---|
| `$stroke` | A hex colour, `#RGB` or `#RRGGBB`, quoted. Outline colour. | `#BF101D` |
| `$background` | A hex colour, `#RGB` or `#RRGGBB`, quoted. Fill colour. | `#FFF3E0` |
| `$color` | A hex colour, `#RGB` or `#RRGGBB`, quoted. Text colour. Spell it `color`: `$colour` is an error (C4X-L113). | `#111111` |
| `$shape` | One of the shape names, exactly as spelled, case sensitive. Outline shape. See shapes for the names and which ones the renderer draws today. | `Cylinder` |
| `$sprite` | The id of a bundled icon (docs/ICONS.md). Icon drawn on the element. | `database` |
| `$border` | `solid`, `dashed` or `dotted`. Outline style. | `dashed` |
| `$strokeWidth` | A whole number from 1 to 10, quoted: `$strokeWidth="3"`. Outline width in pixels. | `3` |
| `$legend` | Non-empty text of at most 120 characters, quoted. The text for this style in the legend. | `Message queue` |

Case insensitive. An element carries its implied tags (see elementKinds), then its own tags in order. Rules apply in tag order; later keys win.

### Shapes

Names are case sensitive. A valid shape the renderer does not draw yet is drawn as the theme rectangle (C4X-L111).

| Shape | Drawn today |
|---|---|
| `Box` | yes |
| `RoundedBox` | yes |
| `Circle` | no |
| `Ellipse` | no |
| `Hexagon` | no |
| `Diamond` | no |
| `Cylinder` | yes |
| `Bucket` | yes |
| `Pipe` | no |
| `Person` | yes |
| `Robot` | no |
| `Folder` | yes |
| `WebBrowser` | yes |
| `Window` | no |
| `Terminal` | yes |
| `Shell` | no |
| `MobileDevicePortrait` | no |
| `MobileDeviceLandscape` | no |
| `Component` | no |

### Style diagnostics

| Id | Severity | Meaning |
|---|---|---|
| C4X-L107 | error | An `elementStyle` key outside the allowed keys. The key is ignored. |
| C4X-L108 | error | A key repeated in one `elementStyle`, or `$shape` given twice on one element. The last value is used. |
| C4X-L109 | warning | A value the key does not accept. The key is ignored. |
| C4X-L110 | warning | A shape name outside the shape list. The element is drawn as the theme rectangle. |
| C4X-L111 | info | A valid shape the renderer does not draw yet. The element is drawn as the theme rectangle. |
| C4X-L112 | warning | Two `elementStyle` statements for one tag, in any case. They merge and later keys win. |
| C4X-L113 | error | `$colour` is not an alias of `$color`. The key is ignored. |
| C4X-L114 | info | An element attribute that looks like a style key. It is kept as metadata and styles nothing. |
| C4X-L115 | info | A Mermaid `classDef`, which C4X parses and ignores. |
| C4X-L116 | warning | A subgraph, boundary or `direction` inside a deployment Node, which is not drawn there. |

## Text limits

Status: current behaviour; element text is not wrapped (#340).

Estimate: a line is characters x font size x 0.6 pixels wide, the rule the renderer itself uses to place relationship labels. The box width and font sizes are read from a real layout and render of one element of each kind. Real text in a proportional font is usually narrower, so treat the limit as safe, not exact. The #351 dogfood run found overflow at about 33 characters in a 220 px box.

| Kind | Box width | Label | Technology (brackets taken off) | Description |
|---|---|---|---|---|
| Person | 200 px | 23 (14 px) | 28 (11 px) | 30 (11 px) |
| SoftwareSystem | 260 px | 30 (14 px) | 34 (12 px) | 36 (12 px) |
| Container | 240 px | 28 (14 px) | 31 (12 px) | 33 (12 px) |
| Component | 220 px | 26 (14 px) | 28 (12 px) | 30 (12 px) |
| DeploymentNode | 300 px | 35 (14 px) | 39 (12 px) | 41 (12 px) |

Safe for any kind: at most 23 characters in a label, 28 in a technology and 30 in a description.

## Input limits

The bounds the parser, the MCP tools and `c4x-lint` enforce (src/cli/limits.ts), on what the parser keeps in its result. Source text the parser discards (comments, overwritten attribute values, a subgraph inside a deployment node) is bounded by the input-size caps; see the threat model. Beyond a bound the result is an error, not a crash or a hang; the boundary tests and the adversarial parser corpus check this.

| Limit | Value | Applies to | Meaning |
|---|---|---|---|
| mcpSourceBytes | 1,048,576 bytes | validate_c4x, lint_c4x, render_c4x, c4x render | Largest `code` argument (or file, for c4x render), in UTF-8 bytes. A larger one is an input error. |
| cliFileBytes | 4,194,304 bytes | c4x-lint | Largest file read. A larger file is reported and not linted; the run exits 2. |
| nestingDepth | 32 levels | C4X, PlantUML and Structurizr parsers (every entry point, the editor included) | Boundaries, nodes, subgraphs or nested elements open at once. Deeper nesting is a located syntax error. |
| elements | 2,000 elements | validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render | Elements and boundaries in one diagram, at every level. More is a C4X-LIMIT error. |
| relationships | 5,000 relationships | validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render | Relationships in one diagram. More is a C4X-LIMIT error. |
| textLength | 4,096 characters | validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render | One label, description, technology, tag or attribute value. Longer is a C4X-LIMIT error. |
| entries | 256 entries | validate_c4x, lint_c4x, c4x-lint, render_c4x, c4x render | $key="value" pairs as written on one element, node or subgraph (each repeat counts); tags on one element; pairs in one elementStyle. More is a C4X-LIMIT error. |
| outputLineLength | 2,000 characters | validate_c4x, lint_c4x, render_c4x | One line of tool output; a longer line is cut. |
| findingLines | 200 lines | lint_c4x, render_c4x | Findings listed in one result; the heading counts them all. |
| toolOutputBytes | 524,288 bytes | validate_c4x, lint_c4x, render_c4x | Text in one tool result, after the other caps (the SVG of render_c4x is a separate item, bounded by renderSvgBytes). |
| renderElements | 100 elements | render_c4x, c4x render | Elements and boundaries one render lays out, at every level. More returns the findings and a "render too large" result, no SVG. |
| renderRelationships | 150 relationships | render_c4x, c4x render | Relationships one render routes. More returns the findings and a "render too large" result, no SVG. |
| renderSvgBytes | 2,097,152 bytes | render_c4x, c4x render | Largest SVG returned. A larger render returns the findings and a "render too large" result, never a partial SVG. |
| renderTimeMs | 2,000 milliseconds | render_c4x, c4x render | Hard deadline for one render, enforced: a render still running then is stopped and returns its findings and no SVG (c4x render exits 3). |

## Lint rules

Default severity of every rule: `info`.

- Every rule defaults to `info`. `c4x-lint` lists info findings but exits 0 at its default `--max-severity error`, and `--quiet` hides them. To see them as failures use `--max-severity info`.
- Syntax errors (`C4X-SYNTAX`), model errors (`C4X-MODEL`) and input-limit errors (`C4X-LIMIT`) are always errors.
- Raise or switch off a rule with `c4x.lint.rules` in settings, or the same table in `.c4x-lint.json`.

| Id | Rule | Runs on | Default |
|---|---|---|---|
| C4X-L001 | Container and component have a description | container, component | info |
| C4X-L002 | Container and component declare a technology | container, component | info |
| C4X-L003 | Relationship has a label | system-context, container, component, dynamic, deployment | info |
| C4X-L004 | Relationship across a process boundary declares a technology | container, component | info |
| C4X-L005 | Software system outside the scope is marked external | container, component | info |
| C4X-L006 | Element and relationship are legal at the view level | system-context, container, component, deployment | info |
| C4X-L008 | Relationship label says more than one word | system-context, container, component, dynamic, deployment | info |
| C4X-L101 | Component view decomposes exactly one container | component | info |
| C4X-L102 | Element is connected to the rest of the view | system-context, container, component, dynamic | info |
| C4X-L103 | Relationship does not reach into another container | component | info |
| C4X-L104 | Element names are unique within a boundary | system-context, container, component, dynamic | info |
| C4X-L105 | Declared view level matches the elements drawn | container, component | info |
| C4X-L106 | Relationship does not join a part to its whole | system-context, container, component, dynamic, deployment | info |

### C4X-L001

Container and component have a description. Applies to: Container and Component elements, including database and external variants.

A short description gives an at-a-glance view of the element's responsibility. Without it a reader has a name and a box, and has to guess what the element does.

Message on the source below: Container "API" (api) has no description.

```text
%%{ c4: container }%%
graph TB
Container(api, "API", "Go")
```

### C4X-L002

Container and component declare a technology. Applies to: Container and Component elements, including database and external variants.

Container and component diagrams exist to show the major technology choices. An element without a technology leaves out the thing the diagram is for.

Message on the source below: Container "API" (api) declares no technology.

```text
%%{ c4: container }%%
graph TB
Container(api, "API", "", "Serves requests")
```

### C4X-L003

Relationship has a label. Applies to: Every relationship.

An unlabelled arrow says that two elements are related but not how or why. The label carries the intent, and should read in the direction of the arrow.

Message on the source below: Relationship u --> s has no label.

```text
%%{ c4: system-context }%%
graph TB
Person(u, "User")
System(s, "Shop")
u --> s
```

### C4X-L004

Relationship across a process boundary declares a technology. Applies to: Relationships whose endpoints run in different processes: between two different containers or software systems, or between a component and a container or software system. Relationships with a person at either end, and between two components, are not checked.

A relationship between containers is inter-process communication. Naming the protocol (JSON/HTTPS, JDBC, AMQP) tells the reader how the processes talk, which is what the container and component levels are meant to show.

Message on the source below: Relationship api --> db crosses a process boundary (Container to Container) but declares no technology.

```text
%%{ c4: container }%%
graph TB
Container(api, "API", "Go", "Serves requests")
Container(db, "Database", "PostgreSQL", "Stores orders")
api -->|Reads and writes orders in| db
```

### C4X-L005

Software system outside the scope is marked external. Applies to: Software System elements in a view that decomposes a system: a container view with at least one internal container, or a component view with at least one internal component.

A container or component view zooms into one software system, drawn as the boundary around its parts. Any software system drawn as a box is therefore a neighbour, outside the scope. Marking it external draws it in the external style, so the reader can see where the scope ends.

Message on the source below: Software System "Mail Service" (mail) is outside the system this container view decomposes, but is not marked external.

```text
%%{ c4: container }%%
graph TB
System_Boundary(shop, "Shop") {
    Container(api, "API", "Go", "Serves requests")
}
System(mail, "Mail Service")
api -->|Sends receipts through| "SMTP" mail
```

### C4X-L006

Element and relationship are legal at the view level. Applies to: Every element and typed boundary, and every relationship. Inside a System_Boundary, Container_Boundary, Enterprise_Boundary or deployment Node every placement is checked; at the diagram root or inside an untyped subgraph, only types the view level allows nowhere. A deployment view may also hold software system instances in nodes and people at the root.

Each C4 level shows one level of abstraction. A component in a system context view, or a container drawn inside another container, mixes levels and leaves the reader unsure what kind of thing each box is. The verdicts come from C4X's one table of C4 nesting rules, shared with the visual editor.

Message on the source below: "API" (api): Container cannot be placed in the diagram root in a C1 logical view.

```text
%%{ c4: system-context }%%
graph TB
Person(u, "User")
Container(api, "API", "Go", "Serves requests")
u -->|Calls the| api
```

### C4X-L008

Relationship label says more than one word. Applies to: Every labelled relationship.

A one-word label such as "Uses" says that a relationship exists, which the arrow already said. A phrase such as "Reads account balances from" says what it is for.

Message on the source below: Relationship u --> s is labelled with the single word "Uses".

```text
%%{ c4: system-context }%%
graph TB
Person(u, "User")
System(s, "Shop")
u -->|Uses| s
```

### C4X-L101

Component view decomposes exactly one container. Applies to: Component views. Counts the Container_Boundaries C4X-L006 accepts: more than one is reported on each boundary after the first; none at all, while the view draws an internal component that C4X-L006 accepts, is reported on the view.

A component diagram zooms into one container and shows the components inside it. With two containers decomposed, or none named, the reader cannot tell which container the diagram is about or which container each component belongs to.

Message on the source below: This component view decomposes 2 containers ("A", "B"); a component view zooms into one container.

```text
%%{ c4: component }%%
graph TB
Container_Boundary(a, "A") {
    Component(x, "X", "Go", "Does x")
}
Container_Boundary(b, "B") {
    Component(y, "Y", "Go", "Does y")
}
x -->|Calls the| y
```

### C4X-L102

Element is connected to the rest of the view. Applies to: Every element except deployment nodes. An element counts as connected when it, or an element nested inside it, is either end of a relationship.

The supporting elements of a C4 view are the people and systems connected to the elements in scope. A box with no relationship shows neither what it depends on nor what depends on it, and is usually left over from an earlier version of the diagram.

Message on the source below: Software System "Orphan" (t) has no relationship in this view.

```text
%%{ c4: system-context }%%
graph TB
Person(u, "User")
System(s, "Shop")
System(t, "Orphan")
u -->|Buys goods from| s
```

### C4X-L103

Relationship does not reach into another container. Applies to: Relationships between two components that sit inside two different Container_Boundaries. Relationships from a person, system or container box to a component are not checked.

Outside the container in scope, a component view shows other containers as boxes, not their insides. A relationship from a component of one container to a component of another mixes two decompositions in one diagram; it should target the other container.

Message on the source below: Relationship x --> y reaches from a component of "A" into "B", a different container's boundary.

```text
%%{ c4: component }%%
graph TB
Container_Boundary(a, "A") {
    Component(x, "X", "Go", "Does x")
}
Container_Boundary(b, "B") {
    Component(y, "Y", "Go", "Does y")
}
x -->|Reaches into the| y
```

### C4X-L104

Element names are unique within a boundary. Applies to: Every element, compared with the others declared directly in the same boundary or subgraph, in the same deployment node (dynamic views, which C4X-L006 does not check), or at the diagram root. Names are compared ignoring case and spacing. Elements C4X-L006 reports are left to it.

Two boxes with one name in the same boundary are either the same thing drawn twice or two things the reader cannot tell apart. Either way the reader cannot say which box a sentence about that name refers to.

Message on the source below: Software System "Shop" (b) has the same name as Software System "Shop" (a) at the diagram root.

```text
%%{ c4: system-context }%%
graph TB
Person(u, "User")
System(a, "Shop")
System(b, "Shop")
u -->|Buys goods from| a
u -->|Also buys goods from| b
```

### C4X-L105

Declared view level matches the elements drawn. Applies to: Container views with no container and component views with no component. Empty views, and views in which C4X-L006 reports anything, are not checked.

The view declaration tells the reader which level of zoom they are looking at. A container view that shows only people and software systems is a system context diagram, and labelling it otherwise sends the reader looking for detail that is not there.

Message on the source below: This view is declared as a container view but draws no container: its most detailed elements belong in a system-context view.

```text
%%{ c4: container }%%
graph TB
Person(u, "User")
System(s, "Shop")
u -->|Buys goods from| s
```

### C4X-L106

Relationship does not join a part to its whole. Applies to: Relationships whose one end contains the other: an element nested in the other, or declared inside a typed boundary whose alias is the id of the other end. A relationship C4X-L006 reports, or whose end it reports, is left to it.

A component and the software system it belongs to are two levels of abstraction of the same thing. An arrow between them says the system depends on part of itself, which tells the reader nothing and hides the real dependency on something outside.

Message on the source below: Relationship region --> cluster connects Deployment Node "Cluster" (cluster) to Deployment Node "Cloud Region" (region), which contains it: a deployment node and the deployment node it belongs to are two levels of one thing.

```text
%%{ c4: deployment }%%
graph TB
Node(region, "Cloud Region", "Europe", "Hosts the service") {
    Node(cluster, "Cluster", "Kubernetes", "Runs the pods") {
    }
}
region -->|Contains the| cluster
```

### Other diagnostics

- C4X-SYNTAX (error): The source does not parse. Always an error.
- C4X-MODEL (error): The source parses but cannot be built into a model: an unknown element type, a repeated id, a relationship that names an unknown id, or `$code` on a kind other than Container and Component. Always an error.
- C4X-LIMIT (error): The source parses but exceeds an input limit (see Input limits in the C4X reference): too many elements or relationships, a text field longer than 4,096 characters, or more than 256 entries in one attribute list, tag list or elementStyle. Always an error.

## Known limitations

- #340: Element text is one unwrapped line and the box does not grow. A line wider than its box overflows it. textLimits holds the measured limit for each kind. Keep labels, technologies and descriptions inside it until the issue is fixed.

## Rules for writing C4X

- Declare the view on the first line: `%%{ c4: <view> }%%`. `graph TB` is optional and defaults to `TB`.
- Prefer the call form `Type(id, "Label", "Technology", "Description")` to the bracket form.
- Write comments with `%%`. Nothing else is a comment.
- Use an arrow label of two or more words that reads in the direction of the arrow (C4X-L003, C4X-L008).
- Name the protocol on every relationship between processes (C4X-L004), after the label, in quotes.
- Keep each label, technology and description inside the textLimits for its element kind until #340 is fixed.
- Put each element in the scope its view allows (placement).
- Style with tags and `elementStyle`, never with `classDef`.

## Examples

Each example parses, builds and lints with no finding at `info`.

### System context

People and neighbouring systems around one system. Shows: view declaration, Person, System, System_Ext, relationship label, comment.

```c4x
%%{ c4: system-context }%%
graph TB
    %% People first, then systems, then relationships.
    Person(customer, "Customer", "Holds an account")
    System(bank, "Banking System", "Holds accounts and payments")
    System_Ext(mail, "Mail System", "Sends statements")
    customer -->|Views balances and pays bills in| bank
    bank -->|Sends statements through| mail
```

### Container

Containers inside a system boundary, with protocols on the relationships that cross a process. Shows: System_Boundary, Container, ContainerDb, technology, relationship technology, direction.

```c4x
%%{ c4: container }%%
graph LR
    Person(customer, "Customer", "Holds an account")
    System_Boundary(bank, "Banking System") {
        Container(web, "Web App", "TypeScript, React", "Shows balances")
        Container(api, "API", "Java, Spring Boot", "Serves the web app")
        ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")
    }
    customer -->|Views balances using| web
    web -->|Calls the API of| "JSON/HTTPS" api
    api -->|Reads and writes accounts in| "JDBC" db
```

### Component

Components inside one container, with a neighbouring container outside it. Shows: Container_Boundary, Component, Component_Ext, ContainerDb, $code.

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(api, "API") {
        Component(rest, "Account Controller", "Spring MVC", "Handles requests", $code="src/api/**")
        Component(repo, "Account Repository", "Spring Data", "Reads accounts", $code="src/data/**")
    }
    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")
    rest -->|Loads accounts through| repo
    repo -->|Reads accounts from| "JDBC" db
```

### Dynamic

One scenario. Relationships are numbered in source order. Shows: dynamic view, ordering, dashed arrow.

```c4x
%%{ c4: dynamic }%%
graph TB
    Person(customer, "Customer", "Holds an account")
    Container(web, "Web App", "TypeScript, React", "Shows balances")
    Container(api, "API", "Java, Spring Boot", "Serves the web app")
    customer -->|Opens the balance page of| web
    web -->|Requests balances from| "JSON/HTTPS" api
    api -.->|Returns balances to| "JSON/HTTPS" web
```

### Deployment

Containers placed on nested deployment nodes. Shows: Node, nesting, Container inside Node.

```c4x
%%{ c4: deployment }%%
graph TB
    Node(region, "Cloud Region", "Europe", "Hosts the service") {
        Node(cluster, "Cluster", "Kubernetes", "Runs the pods") {
            Container(api, "API", "Java, Spring Boot", "Serves the web app")
        }
    }
```

### Tags and element styles

Tags select element styles. A shape and an outline style on one tag, an icon on another. Shows: $tags, elementStyle, $shape, $stroke, $border, $strokeWidth, $legend, $sprite, class.

```c4x
%%{ c4: container }%%
graph TB
    System_Boundary(shop, "Shop") {
        Container(api, "API", "Go", "Serves orders", $tags="Core")
        Container(queue, "Order Queue", "RabbitMQ", "Buffers orders", $tags="Queue")
        ContainerDb(files, "File Store", "S3", "Holds receipts", $sprite="database")
    }
    class api Critical
    api -->|Publishes orders to| "AMQP" queue
    api -->|Stores receipts in| "HTTPS" files
    elementStyle Queue $shape="RoundedBox", $stroke="#BF101D", $border="dashed", $strokeWidth="3", $legend="Message queue"
    elementStyle Critical $background="#FFF3E0", $color="#111111"
```

## Grammar

Every rule of `src/parser/c4x.pegjs`, with actions removed. The drift test fails when a rule changes without regeneration.

```text
Start = _ directive:Directive? _ GraphKeyword _ direction:Direction _ statements:StatementList _
Directive = "%%{" _ "c4:" _ view:Identifier _ "}%%"
GraphKeyword = "graph"
Direction = "TB" / "BT" / "LR" / "RL"
StatementList = head:Statement tail:(_ Statement)* / _
Statement = Comment / Title / ClassDef / ClassAssignment / ElementStyle / Subgraph / DeploymentNode / BoundaryBlock / ElementCall / Element / Relationship
Title = "title" _ [^\n]*
BoundaryBlock = NestEnter node:BoundaryBlockBody NestLeave / NestUndo
BoundaryBlockBody = type:BoundaryType _ "(" _ id:Identifier _ "," _ label:QuotedString _ ")" _ NestOpen _ elements:SubgraphElementList _ "}"
BoundaryType = "System_Boundary" / "Container_Boundary" / "Enterprise_Boundary"
ClassDef = "classDef" __ name:Identifier _ body:ClassDefBody?
ClassAssignment = "class" __ targets:IdentifierList __ className:Identifier
ElementStyle = "elementStyle" __ tag:(QuotedString / Identifier) _ head:StylePair tail:(_ "," _ StylePair)*
StylePair = pair:KVPair
IdentifierList = head:Identifier tail:(_ "," _ Identifier)*
ClassDefBody = chars:(!"\n" .)+
Comment = "%%" (!"\n" .)* _
Subgraph = NestEnter node:SubgraphBody NestLeave / NestUndo
SubgraphBody = "subgraph" _ label:Identifier _ kv:KVArgs? _ NestOpen _ elements:SubgraphElementList _ "}" _
SubgraphElementList = head:SubgraphStatement tail:(_ SubgraphStatement)* / _
SubgraphStatement = Comment / DeploymentNode / BoundaryBlock / Subgraph / ElementCall / Element / Relationship / DirectionStatement
DirectionStatement = "direction" _ dir:Direction
DeploymentNode = NestEnter node:DeploymentNodeBody NestLeave / NestUndo
DeploymentNodeBody = "Node" _ props:NodeProps _ NestOpen _ elements:SubgraphElementList _ "}"
NodeProps = "(" _ id:Identifier _ "," _ label:QuotedString _ args:ElementCallArgs _ ")" / label:QuotedString _ technology:QuotedString? _ kv:KVArgs?
ElementCall = type:Identifier _ "(" _ id:Identifier _ "," _ label:QuotedString _ args:ElementCallArgs _ ")"
ElementCallArgs = technology:(_ "," _ QuotedString)? description:(_ "," _ QuotedString)? kv:(_ "," _ KVArgs)?
KVArgs = head:KVPair tail:(_ "," _ KVPair)*
KVPair = "$" key:Identifier _ "=" _ value:Value
Value = QuotedString / DottedIdentifier
DottedIdentifier = head:Identifier tail:("." Identifier)*
QuotedString = "\"" chars:(!"\"" .)* "\""
Element = id:Identifier _ "[" _ body:ElementBody _ "]" _ kv:KVArgs?
ElementBody = head:ElementLine tail:(Break ElementLine)*
ElementLine = chars:(!("\n" / "[" / "]" / "<br/>") .)+
Relationship = from:Identifier _ arrow:Arrow _ label:RelationshipLabel? _ technology:RelationshipTechnology? _ to:Identifier
RelationshipLabel = "|" chars:(!"|" .)* "|"
RelationshipTechnology = "\"" chars:(!"\"" .)* "\""
NestEnter = &{…}
NestLeave = &{…}
NestUndo = &{…} .
NestOpen = "{" &{…}
Arrow = "-->" / "-.->" / "==>"
Identifier = $([a-zA-Z_] [a-zA-Z0-9_-]*)
Break = _ "<br/>" _
_ = (Whitespace / Newline)*
__ = (Whitespace / Newline)+
Whitespace = [ \t\r]+
Newline = "\n"
```
