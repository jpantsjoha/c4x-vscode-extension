# C4X lint rules

C4X checks every diagram you open against a small catalogue of C4 notation rules and lists what is missing in the VS Code **Problems** panel: a container with no technology, an arrow with no label, a component drawn in a system context view. Each finding names its rule, says what is wrong and how to fix it, and sits on the line that declares the element or relationship.

Lint is advice. It never blocks the preview, never changes your file, and a syntax error always takes precedence: a diagram that does not parse is not linted.

C4 has no formal standard. The closest executable reference is the [C4 diagram review checklist](https://c4model.com/diagrams/checklist), and every rule below names the checklist question it answers. A clean lint means the diagram passed these checks, not that it is certified.

## What is checked

Native C4X is checked: `.c4x` files and fenced `c4x` blocks in Markdown. Structurizr DSL and PlantUML files are not linted yet.

A rule runs only on the views it lists. The view comes from the first line of the diagram:

| Declaration | Level |
|---|---|
| `%%{ c4: system-context }%%`, or no declaration | C1 |
| `%%{ c4: container }%%` | C2 |
| `%%{ c4: component }%%` | C3 |
| `%%{ c4: dynamic }%%` | dynamic |
| `%%{ c4: deployment }%%` | deployment |

## Rules

| Rule | Title | Levels | Default | Structurizr equivalent |
|---|---|---|---|---|
| [C4X-L001](#c4x-l001) | Container and component have a description | C2, C3 | info | `model.container.description`, `model.component.description` |
| [C4X-L002](#c4x-l002) | Container and component declare a technology | C2, C3 | info | `model.container.technology`, `model.component.technology` |
| [C4X-L003](#c4x-l003) | Relationship has a label | C1, C2, C3, dynamic, deployment | info | `model.relationship.description` |
| [C4X-L004](#c4x-l004) | Relationship across a process boundary declares a technology | C2, C3 | info | `model.relationship.technology` |
| [C4X-L005](#c4x-l005) | Software system outside the scope is marked external | C2, C3 | info | — |
| [C4X-L006](#c4x-l006) | Element and relationship are legal at the view level | C1, C2, C3, deployment | info | — |
| [C4X-L008](#c4x-l008) | Relationship label says more than one word | C1, C2, C3, dynamic, deployment | info | — |
| [C4X-L101](#c4x-l101) | Component view decomposes exactly one container | C3 | info | — |
| [C4X-L102](#c4x-l102) | Element is connected to the rest of the view | C1, C2, C3, dynamic | info | `model.element.disconnected` |
| [C4X-L103](#c4x-l103) | Relationship does not reach into another container | C3 | info | — |
| [C4X-L104](#c4x-l104) | Element names are unique within a boundary | C1, C2, C3, dynamic | info | — |
| [C4X-L105](#c4x-l105) | Declared view level matches the elements drawn | C2, C3 | info | — |
| [C4X-L106](#c4x-l106) | Relationship does not join a part to its whole | C1, C2, C3, dynamic, deployment | info | — |

Rule ids are permanent. A retired rule keeps its id, so a setting you write today never silently switches off a different check later. `C4X-L007` is reserved for a view-title rule, which waits until C4X draws the `title` line; today the parser discards it.

The Structurizr column names the [workspace inspection](https://docs.structurizr.com/workspaces/inspections) that checks the same thing, for readers who know Structurizr.

The `C4X-L0xx` rules check that a view is complete and legal. The `C4X-L1xx` rules check that it is *coherent*: that it says what it is about and hangs together. None of the coherence rules has a Structurizr inspection, because Structurizr refuses the same mistakes while it builds the model instead: a component view is created for exactly one container, names are unique within their parent, and "Relationships cannot be added between parents and children". C4X lets you draw them, and lint tells you.

The coherence rules never repeat C4X-L006. Where a view breaks a nesting rule, C4X-L006 reports it and the coherence rules stay quiet about that part of the view, so one mistake gives one finding.

## Settings

Every rule is on, at severity `info`, until you say otherwise. Set severities per rule in `settings.json`, for a user or a workspace:

```json
{
  "c4x.lint.rules": {
    "C4X-L003": "warning",
    "C4X-L006": "error",
    "C4X-L008": "off"
  }
}
```

| Setting | Values | Default |
|---|---|---|
| `c4x.lint.enabled` | `true`, `false` | `true` |
| `c4x.lint.rules` | rule id to `off`, `ignore`, `info`, `warning` or `error` | `{}` (every rule at its default) |

`ignore` is Structurizr's word for `off` and means the same thing. A value C4X does not recognise is ignored and the rule keeps its default. Changing either setting re-checks every open diagram straight away.

Every default is `info`, because the diagrams shipped in `samples/` still break several of these rules, and a first release that fills the Problems panel with warnings teaches people to stop reading it. Raise the rules your team cares about to `warning`.

## C4X-L001

**Container and component have a description.** Checklist: *Do you understand what every element does?*

Runs on C2 and C3 views, for every Container and Component, including the database and external variants. A description gives an at-a-glance view of the element's responsibility; without one a reader has a name and a box.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    Container(api, "API Application", "Java and Spring Boot")
```

Clean:

```c4x
%%{ c4: container }%%
graph TB
    Person(customer, "Customer")
    Container(api, "API Application", "Java and Spring Boot", "Provides banking functionality as a JSON API")
    customer -->|Views balances using| "JSON/HTTPS" api
```

The bracket form (`Api[API Application<br/>Container]`) has no place for a description, so a bracket-form container is always reported. Use the function form, `Container(id, "Label", "Technology", "Description")`.

People and software systems are not checked. In C4X's function form their third argument is stored as the technology, so the rule could not tell a described person from an undescribed one.

## C4X-L002

**Container and component declare a technology.** Checklist: *Where applicable, do you understand the technology choices associated with every element?*

Runs on C2 and C3 views, for every Container and Component. Container and component diagrams exist to show the major technology choices.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    ContainerDb(db, "Database")
```

Clean:

```c4x
%%{ c4: container }%%
graph TB
    Container(api, "API Application", "Java", "JSON API")
    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts and transactions")
    api -->|Reads from and writes to| "JDBC" db
```

A tag in the bracket form, such as `React` in `Web[Web App<br/>Container<br/>React]`, is not drawn on the diagram as the element's technology, so it does not satisfy this rule. The finding's hint says so.

## C4X-L003

**Relationship has a label.** Checklist: *Does every arrow have a label describing the intent of that relationship?*

Runs on every view. An unlabelled arrow says two elements are related but not how or why.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    Container(web, "Web Application", "React", "Browser UI")
    Container(api, "API Application", "Java", "JSON API")
    web --> api
```

Clean:

```c4x
%%{ c4: container }%%
graph TB
    Container(web, "Web Application", "React", "Browser UI")
    Container(api, "API Application", "Java", "JSON API")
    web -->|Makes API calls to| "JSON/HTTPS" api
```

## C4X-L004

**Relationship across a process boundary declares a technology.** Checklist: *Where applicable, do you understand the technology choices associated with every relationship? (e.g. protocols for inter-process communication)*

Runs on C2 and C3 views. A container is a separately running process or data store, so a relationship crosses a process boundary when it joins:

- two different containers, or two different software systems, or a container and a software system;
- a component and a container or software system. In C4X the container a component lives in is drawn as a boundary, never as a box, so a container box is always a different process.

Not checked, because the model cannot prove a process boundary there: relationships between two components (C4X does not record which container a component belongs to, so they are assumed to share one), relationships with a person at either end, and relationships from an element to itself.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    Container(api, "API Application", "Java", "JSON API")
    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")
    api -->|Reads from and writes to| db
```

Clean — the protocol goes in quotes after the label:

```c4x
%%{ c4: container }%%
graph TB
    Container(api, "API Application", "Java", "JSON API")
    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")
    api -->|Reads from and writes to| "JDBC" db
```

A label that is itself the protocol, such as `-->|JSON/HTTPS|`, is still reported: the protocol belongs in the technology slot and the label should say what the call is for.

## C4X-L005

**Software system outside the scope is marked external.** Checklist: *Do you understand what the diagram scope is?*

Runs on C2 and C3 views that decompose a system: a container view with at least one internal container, or a component view with at least one internal component. Such a view zooms into one software system, drawn as the boundary around its parts, so any software system drawn as a box is a neighbour outside the scope. Marking it external draws it in the external style, which is how the reader sees where the scope ends.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container(api, "API Application", "Java", "JSON API")
    }
    System(mainframe, "Mainframe Banking System", "Stores core banking data")
    api -->|Gets account data from| "XML/HTTPS" mainframe
```

Clean — `System_Ext`, `SystemDb_Ext`, or the `External` tag in the bracket form:

```c4x
%%{ c4: container }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container(api, "API Application", "Java", "JSON API")
    }
    System_Ext(mainframe, "Mainframe Banking System", "Stores core banking data")
    api -->|Gets account data from| "XML/HTTPS" mainframe
```

"External" here means outside the system the diagram is about, not outside your organisation: an internal mainframe the bank owns is still outside the scope of the Internet Banking System's container diagram. People are never reported, and containers outside a system boundary are not checked yet.

## C4X-L006

**Element and relationship are legal at the view level.** Checklist: *Do you understand the type of every element? (i.e. the level of abstraction; e.g. software system, container, etc)*

Runs on C1, C2, C3 and deployment views. The verdicts come from C4X's one table of C4 nesting rules, shared with the visual editor:

| View | At the root | In a System_Boundary | In a Container_Boundary | In a deployment Node |
|---|---|---|---|---|
| C1 | Person, System, Enterprise_Boundary | — | — | — |
| C2 | Person, System, System_Boundary, Enterprise_Boundary | Container | — | — |
| C3 | Person, System, System_Boundary, Enterprise_Boundary | Container, Container_Boundary | Component | — |
| deployment | Node | — | — | Node, Container |

External and database variants follow their base type, and an Enterprise_Boundary holds what the root holds, apart from itself. A deployment node is never connected directly to a logical element.

Lint is more permissive than this table in a deployment view, where C4 allows two things the visual editor's palette does not offer: a software system instance inside a deployment `Node`, and a person at the root, shown using what is deployed. Neither is reported.

C4X lets you leave the enclosing boundary undrawn, as C4 does. So at the diagram root, and inside an untyped `subgraph`, only an element the view level has no place for at all is reported: a component in a C1 view, a deployment node in a C2 view, a software system outside every node in a deployment view. A container at the root of a C2 view is fine. Inside an explicit `System_Boundary`, `Container_Boundary`, `Enterprise_Boundary` or `Node`, every placement is checked, because you stated the parent.

A diagram without a `%%{ c4: … }%%` first line is read as a system context view. When an element is reported only because of that, the hint says which declaration to add, for example `%%{ c4: container }%%`.

Reported — a component in a system context view:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer", "A customer of the bank")
    System(banking, "Internet Banking System", "Lets customers manage accounts")
    Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
    customer -->|Views balances using| banking
    banking -->|Signs customers in with| signin
```

Clean — the component moves to a component view of the container it belongs to:

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
    }
    Container(spa, "Single-Page App", "Angular", "Browser UI")
    spa -->|Signs customers in using| "JSON/HTTPS" signin
```

## C4X-L008

**Relationship label says more than one word.** Checklist: *Does every arrow have a label describing the intent of that relationship?*

Runs on every view. The C4 notation guidance asks for labels "as specific as possible", avoiding single words like "Uses": the arrow already says a relationship exists, and the label should say what it is for.

Reported:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer")
    System(banking, "Internet Banking System")
    customer -->|Uses| banking
```

Clean:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer")
    System(banking, "Internet Banking System")
    customer -->|Views account balances and makes payments using| banking
```

## C4X-L101

**Component view decomposes exactly one container.** Checklist: *Do you understand what the diagram scope is?*

Runs on C3 views. A component diagram zooms into one container and shows the components inside it, so the view should name that container with one `Container_Boundary`. With two, the reader cannot tell which container the diagram is about: every `Container_Boundary` after the first is reported, and the others belong in component views of their own, or as `Container` boxes in this one. With none, while the view draws components, the view itself is reported on its first line, because nothing says which container the components belong to. An untyped `subgraph` around the components does not say it either; if it is meant as the container, declare it as a `Container_Boundary`.

A `Container_Boundary` or component that C4X-L006 reports (inside an `Enterprise_Boundary`, say) is not counted, and a C3 view with no component at all is C4X-L105's.

Reported — two containers decomposed in one view:

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
    }
    Container_Boundary(web, "Web Application") {
        Component(home, "Home Controller", "Spring MVC", "Serves the home page")
    }
    home -->|Signs customers in using| "JSON/HTTPS" signin
```

Clean — the API Application is in scope, and the web application is a box beside it:

```c4x
%%{ c4: component }%%
graph TB
    Container(web, "Web Application", "Spring MVC", "Serves the home page")
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
    }
    web -->|Signs customers in using| "JSON/HTTPS" signin
```

## C4X-L102

**Element is connected to the rest of the view.** Checklist: *Do you understand what the diagram scope is?*

Runs on C1, C2, C3 and dynamic views. The supporting elements of a C4 view are the people and systems connected to what is in scope; a box with no relationship shows neither what it depends on nor what depends on it, and is usually left over from an earlier version of the diagram. An element counts as connected when it, or an element nested inside it, is either end of a relationship. Deployment nodes are never reported.

Reported:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer")
    System(banking, "Internet Banking System")
    System_Ext(ledger, "Ledger")
    customer -->|Views balances using| banking
```

Clean:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer")
    System(banking, "Internet Banking System")
    System_Ext(ledger, "Ledger")
    customer -->|Views balances using| banking
    banking -->|Posts transactions to| ledger
```

## C4X-L103

**Relationship does not reach into another container.** Checklist: *Do you understand what the diagram scope is?*

Runs on C3 views. Outside the container in scope, a component view shows other containers as boxes, not their insides. A relationship from a component of one container to a component inside a *different* `Container_Boundary` mixes two decompositions in one diagram, and is reported: point it at the other container instead. A relationship from a person, a software system or a container box to a component is how a component view shows who uses the container, and is never reported. Neither is a component whose container the view does not state, at the root or in an untyped `subgraph`.

C4X-L101 reports the second `Container_Boundary` itself; this rule reports each relationship that crosses into it.

Reported:

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
        Component(security, "Security Component", "Spring Bean", "Checks passwords")
    }
    Container_Boundary(mail, "E-mail Service") {
        Component(sender, "Mail Sender", "JavaMail", "Sends e-mail")
    }
    signin -->|Checks passwords with| security
    security -->|Sends lock-out e-mails using| sender
```

Clean — the relationship targets the e-mail service as a container:

```c4x
%%{ c4: component }%%
graph TB
    Container_Boundary(api, "API Application") {
        Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
        Component(security, "Security Component", "Spring Bean", "Checks passwords")
    }
    Container(mail, "E-mail Service", "Go", "Sends e-mail")
    signin -->|Checks passwords with| security
    security -->|Sends lock-out e-mails using| "SMTP" mail
```

## C4X-L104

**Element names are unique within a boundary.** Checklist: *Does every element have a name?*

Runs on C1, C2, C3 and dynamic views. Two boxes with one name in the same place are either the same thing drawn twice or two things the reader cannot tell apart. An element is compared with the others declared directly in the same `System_Boundary`, `Container_Boundary`, `Enterprise_Boundary` or `subgraph`, or at the diagram root; in a dynamic view, which C4X-L006 does not check, the children of one deployment node are compared too. Names are compared ignoring case and spacing. The first element keeps the name and each later one is reported. The same name in two different boundaries is fine: two systems may each have a "Database". An element C4X-L006 reports is misplaced, and is left to that rule rather than compared. Deployment views are not checked, because one container is often deployed several times under one name.

Reported:

```c4x
%%{ c4: container }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container(api, "API Application", "Java", "Serves the JSON API")
        Container(mobile, "API Application", "Go", "Serves the mobile app")
    }
    mobile -->|Reads accounts through| "JSON/HTTPS" api
```

Clean:

```c4x
%%{ c4: container }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container(api, "API Application", "Java", "Serves the JSON API")
        Container(mobile, "Mobile Backend", "Go", "Serves the mobile app")
    }
    mobile -->|Reads accounts through| "JSON/HTTPS" api
```

## C4X-L105

**Declared view level matches the elements drawn.** Checklist: *Do you understand what the diagram type is?*

Runs on C2 and C3 views. The declaration on the first line tells the reader which level of zoom they are looking at. A container view that draws no container, or a component view that draws no component, shows a less detailed level than it claims, and is reported on its first line with the level its elements do belong to.

Only that direction is checked here. A view that draws something *more* detailed than its level allows, such as a component in a container view, breaks a nesting rule, and C4X-L006 reports it. This rule stays quiet about any view C4X-L006 reports, because a misplaced element is as likely to be the missing container as a sign of the wrong level, and the nesting finding is the one to fix first. Empty views are not checked. The diagram `title` line would be the other half of this check, but C4X does not keep it yet (see C4X-L007).

Reported — a container view of people and systems:

```c4x
%%{ c4: container }%%
graph TB
    Person(customer, "Customer", "A customer of the bank")
    System(banking, "Internet Banking System", "Lets customers manage accounts")
    customer -->|Views account balances using| banking
```

Clean — declared as what it is:

```c4x
%%{ c4: system-context }%%
graph TB
    Person(customer, "Customer", "A customer of the bank")
    System(banking, "Internet Banking System", "Lets customers manage accounts")
    customer -->|Views account balances using| banking
```

## C4X-L106

**Relationship does not join a part to its whole.** Checklist: *Do you understand the type of every element? (i.e. the level of abstraction; e.g. software system, container, etc)*

Runs on every view. A component and the software system it belongs to are two levels of abstraction of the same thing; an arrow between them says the system depends on part of itself, and hides what it really depends on. A relationship is reported when one end contains the other: a deployment node connected to the node it runs in, or an element declared inside a typed boundary whose alias is the other end's id, which is the system or container in scope drawn both as its boundary and as a box. Containment is read from ids and nesting, never from names. A relationship C4X-L006 reports, such as a deployment node connected to a logical element, or one whose end C4X-L006 reports as misplaced, is left to that rule.

Reported — the system in scope drawn a second time, as a box, and connected to its own component:

```c4x
%%{ c4: component }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container_Boundary(api, "API Application") {
            Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
        }
    }
    System(bank, "Internet Banking System", "Lets customers manage accounts")
    signin -->|Reads customer records from| "JDBC" bank
```

Clean — the relationship targets what the component really uses:

```c4x
%%{ c4: component }%%
graph TB
    System_Boundary(bank, "Internet Banking System") {
        Container_Boundary(api, "API Application") {
            Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")
        }
    }
    System_Ext(mainframe, "Mainframe Banking System", "Stores core banking data")
    signin -->|Reads customer records from| "XML/HTTPS" mainframe
```

## Known limitations

- Structurizr DSL and PlantUML files get no lint findings. Their imported models draw the system or container in scope as an ordinary element, which the scope rules would misread.
- The coherence rules see one view at a time. Whether a C3 view's container exists in the C2 view, or its relationships roll up, needs the cross-file workspace index (Track C of the quality epic).
- C4X-L106 finds a part connected to its whole only when the model states the containment by id. A box that merely has the same *name* as the boundary around the other end is not judged, because names are not identity.
- There is no comment that suppresses one finding in the source. Turn a rule off, or change its severity, in `c4x.lint.rules`.
- The Problems panel shows findings for the documents you have open, not for the whole workspace.

Sources: the [C4 diagram review checklist](https://c4model.com/diagrams/checklist), the [C4 notation guidance](https://c4model.com/diagrams/notation), and the [Structurizr inspections reference](https://docs.structurizr.com/workspaces/inspections), all read on 2026-09-29.

## Outside VS Code

The same rules run from the command line, a Git hook, CI or an AI agent through `c4x-lint` and the MCP `lint_c4x` tool. See [C4X lint outside VS Code](C4X-LINT-CLI.md).
