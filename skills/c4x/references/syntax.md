# C4X syntax reference for the c4x skill

Generated from `docs/reference/c4x-reference.json` by `pnpm run generate:skill`. Do not edit by hand.

## Document

- First line: `%%{ c4: <view> }%%`. It names the view, which decides what the diagram may contain and which lint rules run. Default: `system-context`.
- Direction: `graph <direction>`, one of `TB`, `BT`, `LR`, `RL`. The layout direction: top to bottom, bottom to top, left to right, right to left. When it is missing, the parser adds `graph TB`.
- Comments: `%%`. A comment. Runs to the end of the line. C4X comments start with `%%`; `//` and `#` are not comments.

## Views

| View | Level | Shows |
|---|---|---|
| `system-context` | C1 | The system in scope, the people who use it and the systems it depends on. |
| `container` | C2 | The applications and data stores inside one system, and how they talk to each other. |
| `component` | C3 | The components inside one container. |
| `deployment` | C4 | Where containers run: nested deployment nodes with container instances inside. |
| `dynamic` | dynamic | One scenario: the relationships are numbered in source order. |

## Elements

Call form: `Type(id, "Label", "Technology", "Description", $key="value")`.

### Person

A human user or actor. Drawn with a person icon.

Example: `Person(u, "Customer", "Holds an account")`

Spellings: `Person`, `Person_Ext`.

### SoftwareSystem

A software system: the highest level of abstraction. Use the _Ext spelling for a system outside the scope.

Example: `System(s, "Core Banking", "Holds accounts")`

Spellings: `SoftwareSystem`, `System`, `System_Ext`, `SystemDb`, `SystemDb_Ext`.

### Container

A separately running application or data store inside a software system.

Example: `Container(api, "API", "Java, Spring Boot", "Serves the web app")`

Spellings: `Container`, `Container_Ext`, `ContainerDb`, `ContainerDb_Ext`.

### Component

A group of related code inside a container, behind one interface.

Example: `Component(auth, "Auth Controller", "Spring MVC", "Signs users in")`

Spellings: `Component`, `Component_Ext`, `ComponentDb`, `ComponentDb_Ext`.

### DeploymentNode

A place where containers run: a server, a cloud region, a cluster, a device. Nodes nest.

Example: `Node(k8s, "Cluster", "Kubernetes", "Runs the services")`

Spellings: `Node`.

## Where each element may sit

- `component`
  - Container_Boundary: `Component`, `Component_Ext`
  - Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`
  - Node: nothing
  - System_Boundary: `Container`, `Container_Ext`, `Container_Boundary`
  - root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`, `Enterprise_Boundary`
- `container`
  - Container_Boundary: nothing
  - Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`
  - Node: nothing
  - System_Boundary: `Container`, `Container_Ext`
  - root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `System_Boundary`, `Enterprise_Boundary`
- `deployment`
  - Container_Boundary: nothing
  - Enterprise_Boundary: nothing
  - Node: `Node`, `Container`, `Container_Ext`
  - System_Boundary: nothing
  - root: `Node`
- `system-context`
  - Container_Boundary: nothing
  - Enterprise_Boundary: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`
  - Node: nothing
  - System_Boundary: nothing
  - root: `Person`, `Person_Ext`, `SoftwareSystem`, `System_Ext`, `Enterprise_Boundary`

## Relationships

Form: `from -->|Label| "Technology" to`.

| Arrow | Use |
|---|---|
| `-->` | A solid arrow. The default for a call or a dependency. |
| `-.->` | A dashed arrow. Use it for asynchronous or optional communication. |
| `==>` | A thick arrow. Use it to stress the main path. |

C4X-L004 asks for a technology on a relationship that crosses a process boundary: between two different containers or software systems, or between a component and a container or software system. Relationships that touch a person, and relationships between two components, are not checked. The technology is stored in the model and drawn under the relationship label as `[technology]` in italics (#421).

## Boundaries

- `System_Boundary(id, "Label") { ... }`: The software system in scope, with its containers inside. Used in container and component views.
- `Container_Boundary(id, "Label") { ... }`: The container in scope, with its components inside. Used in component views. A component view decomposes exactly one (C4X-L101).
- `Enterprise_Boundary(id, "Label") { ... }`: A company, department or other grouping of people and software systems. Used in system context and container views.

## Attributes

- `$code`: Source paths or globs this element stands for, comma separated: `$code="src/api/**, src/main.ts"`. Only on Container and Component. Give it once per element.
- `$shape`: One of the style shapes. Overrides any shape a tag style or the theme sets. Give it once per element.
- `$sprite`: The id of a bundled icon, such as `database`. Drawn as the element icon. See docs/ICONS.md.
- `$tags`: Comma separated tag names: `$tags="Queue, Internal"`. Tags select `elementStyle` rules and appear in the legend.
- Other keys: Any other `$key="value"` is kept as element metadata. It draws nothing, and does not style the element: colours come from tags and `elementStyle`.

## Styles

Style elements by tag with `elementStyle TagName $key="value", ...` at the top level. Every value is quoted.

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

Names are case sensitive. A valid shape the renderer does not draw yet is drawn as the theme rectangle (C4X-L111).

Shapes drawn today: `Box`, `RoundedBox`, `Cylinder`, `Bucket`, `Person`, `Folder`, `WebBrowser`, `Terminal`. Valid but drawn as the theme rectangle: `Circle`, `Ellipse`, `Hexagon`, `Diamond`, `Pipe`, `Robot`, `Window`, `Shell`, `MobileDevicePortrait`, `MobileDeviceLandscape`, `Component`.

Style diagnostics:

- C4X-L107 (error): An `elementStyle` key outside the allowed keys. The key is ignored.
- C4X-L108 (error): A key repeated in one `elementStyle`, or `$shape` given twice on one element. The last value is used.
- C4X-L109 (warning): A value the key does not accept. The key is ignored.
- C4X-L110 (warning): A shape name outside the shape list. The element is drawn as the theme rectangle.
- C4X-L111 (info): A valid shape the renderer does not draw yet. The element is drawn as the theme rectangle.
- C4X-L112 (warning): Two `elementStyle` statements for one tag, in any case. They merge and later keys win.
- C4X-L113 (error): `$colour` is not an alias of `$color`. The key is ignored.
- C4X-L114 (info): An element attribute that looks like a style key. It is kept as metadata and styles nothing.
- C4X-L115 (info): A Mermaid `classDef`, which C4X parses and ignores.
- C4X-L116 (warning): A subgraph, boundary or `direction` inside a deployment Node, which is not drawn there.

## Text limits

Element text is not wrapped (#340). Safe for any kind: at most **23** characters in a label, **28** in a technology and **30** in a description.

| Kind | Label | Technology | Description |
|---|---|---|---|
| Person | 23 | 28 | 30 |
| SoftwareSystem | 30 | 34 | 36 |
| Container | 28 | 31 | 33 |
| Component | 26 | 28 | 30 |
| DeploymentNode | 35 | 39 | 41 |

## Lint

Default severity of every rule: `info`.

- Every rule defaults to `info`. `c4x-lint` lists info findings but exits 0 at its default `--max-severity error`, and `--quiet` hides them. To see them as failures use `--max-severity info`.
- Syntax errors (`C4X-SYNTAX`), model errors (`C4X-MODEL`) and input-limit errors (`C4X-LIMIT`) are always errors.
- Raise or switch off a rule with `c4x.lint.rules` in settings, or the same table in `.c4x-lint.json`.

| Id | Applies to | Levels |
|---|---|---|
| C4X-L001 | Container and Component elements, including database and external variants | container, component |
| C4X-L002 | Container and Component elements, including database and external variants | container, component |
| C4X-L003 | Every relationship | system-context, container, component, dynamic, deployment |
| C4X-L004 | Relationships whose endpoints run in different processes: between two different containers or software systems, or between a component and a container or software system. Relationships with a person at either end, and between two components, are not checked | container, component |
| C4X-L005 | Software System elements in a view that decomposes a system: a container view with at least one internal container, or a component view with at least one internal component | container, component |
| C4X-L006 | Every element and typed boundary, and every relationship. Inside a System_Boundary, Container_Boundary, Enterprise_Boundary or deployment Node every placement is checked; at the diagram root or inside an untyped subgraph, only types the view level allows nowhere. A deployment view may also hold software system instances in nodes and people at the root | system-context, container, component, deployment |
| C4X-L008 | Every labelled relationship | system-context, container, component, dynamic, deployment |
| C4X-L101 | Component views. Counts the Container_Boundaries C4X-L006 accepts: more than one is reported on each boundary after the first; none at all, while the view draws an internal component that C4X-L006 accepts, is reported on the view | component |
| C4X-L102 | Every element except deployment nodes. An element counts as connected when it, or an element nested inside it, is either end of a relationship | system-context, container, component, dynamic |
| C4X-L103 | Relationships between two components that sit inside two different Container_Boundaries. Relationships from a person, system or container box to a component are not checked | component |
| C4X-L104 | Every element, compared with the others declared directly in the same boundary or subgraph, in the same deployment node (dynamic views, which C4X-L006 does not check), or at the diagram root. Names are compared ignoring case and spacing. Elements C4X-L006 reports are left to it | system-context, container, component, dynamic |
| C4X-L105 | Container views with no container and component views with no component. Empty views, and views in which C4X-L006 reports anything, are not checked | container, component |
| C4X-L106 | Relationships whose one end contains the other: an element nested in the other, or declared inside a typed boundary whose alias is the id of the other end. A relationship C4X-L006 reports, or whose end it reports, is left to it | system-context, container, component, dynamic, deployment |

What each finding says and how to fix it:

- C4X-L001: Container "API" (api) has no description. Fix: Describe its responsibility in the fourth argument: Container(api, "API", "Go", "Description").
- C4X-L002: Container "API" (api) declares no technology. Fix: Name it in the third argument: Container(api, "API", "Technology", "Serves requests").
- C4X-L003: Relationship u --> s has no label. Fix: Label it with the intent, read in the direction of the arrow: u -->|<intent>| s.
- C4X-L004: Relationship api --> db crosses a process boundary (Container to Container) but declares no technology. Fix: Name the protocol in quotes after the label: api -->|Reads and writes orders in| "<protocol>" db.
- C4X-L005: Software System "Mail Service" (mail) is outside the system this container view decomposes, but is not marked external. Fix: Declare it as System_Ext(mail, "Mail Service", ...), or add External as a tag in the bracket form.
- C4X-L006: "API" (api): Container cannot be placed in the diagram root in a C1 logical view. Fix: Allowed here in this view: Person, Person_Ext, System, System_Ext, Enterprise_Boundary. Container belongs in container (C2) or component (C3) or deployment views: move it to one, or change its type. If this view is not a system context view, declare its level on the first line, e.g. %%{ c4: container }%%.
- C4X-L008: Relationship u --> s is labelled with the single word "Uses". Fix: Replace it with a phrase that says what the relationship is for, read in the direction of the arrow (for example "Reads orders from" rather than "Uses").
- C4X-L101: This component view decomposes 2 containers ("A", "B"); a component view zooms into one container. Fix: Keep "A" as the container in scope: draw "B" as a Container box, or give it a component view of its own.
- C4X-L102: Software System "Orphan" (t) has no relationship in this view. Fix: Connect it to what it uses or what uses it, or remove it from this view.
- C4X-L103: Relationship x --> y reaches from a component of "A" into "B", a different container's boundary. Fix: Point it at the container instead: draw "B" as a Container box outside the container in scope and connect to that. Its components belong in its own component view.
- C4X-L104: Software System "Shop" (b) has the same name as Software System "Shop" (a) at the diagram root. Fix: Give each element a name that tells it apart, or, if both boxes are the same thing, draw it once and point both relationships at it.
- C4X-L105: This view is declared as a container view but draws no container: its most detailed elements belong in a system-context view. Fix: Declare %%{ c4: system-context }%% on the first line, or add the containers this view is meant to show.
- C4X-L106: Relationship region --> cluster connects Deployment Node "Cluster" (cluster) to Deployment Node "Cloud Region" (region), which contains it: a deployment node and the deployment node it belongs to are two levels of one thing. Fix: Point it at the element outside "Cloud Region" that "Cluster" actually uses, or remove it.

- C4X-SYNTAX (error): The source does not parse. Always an error.
- C4X-MODEL (error): The source parses but cannot be built into a model: an unknown element type, a repeated id, a relationship that names an unknown id, or `$code` on a kind other than Container and Component. Always an error.
- C4X-LIMIT (error): The source parses but exceeds an input limit (see Input limits in the C4X reference): too many elements or relationships, a text field longer than 4,096 characters, or more than 256 entries in one attribute list, tag list or elementStyle. Always an error.

## Rules for writing C4X

- Declare the view on the first line: `%%{ c4: <view> }%%`. `graph TB` is optional and defaults to `TB`.
- Prefer the call form `Type(id, "Label", "Technology", "Description")` to the bracket form.
- Write comments with `%%`. Nothing else is a comment.
- Use an arrow label of two or more words that reads in the direction of the arrow (C4X-L003, C4X-L008).
- Name the protocol on every relationship between processes (C4X-L004), after the label, in quotes.
- Keep each label, technology and description inside the textLimits for its element kind until #340 is fixed.
- Put each element in the scope its view allows (placement).
- Style with tags and `elementStyle`, never with `classDef`.

## Known limitations

- #340: Element text is one unwrapped line and the box does not grow. A line wider than its box overflows it. textLimits holds the measured limit for each kind. Keep labels, technologies and descriptions inside it until the issue is fixed.

## Examples

Each example parses and lints with no finding at `info`.

### system-context

People and neighbouring systems around one system.

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

### container

Containers inside a system boundary, with protocols on the relationships that cross a process.

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

### component

Components inside one container, with a neighbouring container outside it.

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

### dynamic

One scenario. Relationships are numbered in source order.

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

### deployment

Containers placed on nested deployment nodes.

```c4x
%%{ c4: deployment }%%
graph TB
    Node(region, "Cloud Region", "Europe", "Hosts the service") {
        Node(cluster, "Cluster", "Kubernetes", "Runs the pods") {
            Container(api, "API", "Java, Spring Boot", "Serves the web app")
        }
    }
```

### styles

Tags select element styles. A shape and an outline style on one tag, an icon on another.

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
