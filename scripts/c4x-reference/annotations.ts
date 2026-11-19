/**
 * The one hand-kept source behind docs/reference/c4x-reference.json (#354).
 *
 * Everything the grammar, the model builder, the style resolver and the lint
 * catalogue can say for themselves is read from them by generate.ts. This file
 * holds only what no code can say: what an argument means, what a statement is
 * for, and the examples. generate.ts fails when this file and the code
 * disagree, in either direction: an element kind, argument, statement, style
 * key, shape or rule that has no entry here, or an entry here for one that no
 * longer exists.
 *
 * Prose here follows the repository's writing standard: short words, active
 * voice, and no claim the generator does not check. Where a sentence states a
 * fact about the renderer, it names the issue that tracks the gap.
 */

export interface ViewTypeNote {
    readonly level: string;
    readonly summary: string;
}

/** Keyed by the view id the `%%{ c4: <id> }%%` line accepts. */
export const VIEW_TYPES: Readonly<Record<string, ViewTypeNote>> = {
    'system-context': {
        level: 'C1',
        summary: 'The system in scope, the people who use it and the systems it depends on.',
    },
    container: {
        level: 'C2',
        summary: 'The applications and data stores inside one system, and how they talk to each other.',
    },
    component: {
        level: 'C3',
        summary: 'The components inside one container.',
    },
    dynamic: {
        level: 'dynamic',
        summary: 'One scenario: the relationships are numbered in source order.',
    },
    deployment: {
        level: 'C4',
        summary: 'Where containers run: nested deployment nodes with container instances inside.',
    },
};

export interface ElementKindNote {
    readonly summary: string;
    /** What the third and fourth quoted arguments should hold for this kind. Must contain `example`. */
    readonly usage: string;
    /** A call that shows the usage. The generator builds it and checks each quoted argument lands where `fields` says. */
    readonly example: string;
    /**
     * The model field each quoted argument lands in, by position, for a call with one
     * quoted text after the label and for a call with two. The generator probes the
     * parser and builder for both forms and fails on any difference.
     */
    readonly fields: {
        readonly one: { readonly 3: string };
        readonly two: { readonly 3: string; readonly 4: string };
    };
}

/** The model field each argument lands in for a call with two quoted texts, the same for every kind. The generator probes every kind and fails when one differs. */
export const ARGUMENT_FIELDS: Readonly<Record<string, string>> = {
    id: 'id',
    label: 'label',
    technology: 'technology',
    description: 'description',
    kv: 'attributes',
};

/** Keyed by the model type the builder produces. */
export const ELEMENT_KINDS: Readonly<Record<string, ElementKindNote>> = {
    Person: {
        summary: 'A human user or actor. Drawn with a person icon.',
        usage: 'Pass the description as the one text after the label: `Person(u, "Customer", "Holds an account")`. With two texts they mean technology, then description.',
        example: 'Person(u, "Customer", "Holds an account")',
        fields: { one: { 3: 'description' }, two: { 3: 'technology', 4: 'description' } },
    },
    SoftwareSystem: {
        summary: 'A software system: the highest level of abstraction. Use the _Ext spelling for a system outside the scope.',
        usage: 'Pass the description as the one text after the label: `System(s, "Core Banking", "Holds accounts")`. With two texts they mean technology, then description.',
        example: 'System(s, "Core Banking", "Holds accounts")',
        fields: { one: { 3: 'description' }, two: { 3: 'technology', 4: 'description' } },
    },
    Container: {
        summary: 'A separately running application or data store inside a software system.',
        usage: 'Pass the technology, then the description: `Container(api, "API", "Java, Spring Boot", "Serves the web app")`.',
        example: 'Container(api, "API", "Java, Spring Boot", "Serves the web app")',
        fields: { one: { 3: 'technology' }, two: { 3: 'technology', 4: 'description' } },
    },
    Component: {
        summary: 'A group of related code inside a container, behind one interface.',
        usage: 'Pass the technology, then the description: `Component(auth, "Auth Controller", "Spring MVC", "Signs users in")`.',
        example: 'Component(auth, "Auth Controller", "Spring MVC", "Signs users in")',
        fields: { one: { 3: 'technology' }, two: { 3: 'technology', 4: 'description' } },
    },
    DeploymentNode: {
        summary: 'A place where containers run: a server, a cloud region, a cluster, a device. Nodes nest.',
        usage: 'Pass the technology, then the description, then a block of children: `Node(k8s, "Cluster", "Kubernetes", "Runs the services") { ... }`.',
        example: 'Node(k8s, "Cluster", "Kubernetes", "Runs the services")',
        fields: { one: { 3: 'technology' }, two: { 3: 'technology', 4: 'description' } },
    },
};

/**
 * What each positional or keyed argument means. The keys are the labels the
 * grammar gives in rule ElementCall and ElementCallArgs (`kv` is shown as
 * `attributes`).
 */
export const ARGUMENTS: Readonly<Record<string, string>> = {
    id: 'The element id: letters, digits, `_` and `-`, starting with a letter or `_`. Relationships and `class` statements refer to it. Unique in the diagram.',
    label: 'The name drawn in bold at the top of the box. Quoted.',
    technology: 'The third argument when there are two quoted texts after the label, or the only one for a Container, Component or Node. Drawn in square brackets under the label, in italics. For a Person or a software system with one text after the label, that text is the description instead (see elementKinds).',
    description: 'The fourth argument, or the only text after the label for a Person or a software system. Drawn as plain text under the label and the technology.',
    kv: 'Zero or more `$key="value"` pairs, comma separated, after the quoted arguments. See attributes.',
};

/** Keyed by attribute name, the keys the grammar's action code lists as known. */
export const ATTRIBUTES: Readonly<Record<string, string>> = {
    tags: 'Comma separated tag names: `$tags="Queue, Internal"`. Tags select `elementStyle` rules and appear in the legend.',
    sprite: 'The id of a bundled icon, such as `database`. Drawn as the element icon. See docs/ICONS.md.',
    code: 'Source paths or globs this element stands for, comma separated: `$code="src/api/**, src/main.ts"`. Only on Container and Component. Give it once per element.',
    shape: 'One of the style shapes. Overrides any shape a tag style or the theme sets. Give it once per element.',
};

/** Any other `$key` on an element call is kept as metadata and does not style the element. */
export const OTHER_ATTRIBUTES = 'Any other `$key="value"` is kept as element metadata. It draws nothing, and does not style the element: colours come from tags and `elementStyle`.';

export interface StatementNote {
    readonly summary: string;
    readonly form: string;
}

/**
 * Keyed by the rule name of each alternative of the grammar's Statement rule.
 * `Element` and `Relationship` are the bracket element and the arrow.
 */
export const STATEMENTS: Readonly<Record<string, StatementNote>> = {
    Comment: {
        summary: 'A comment. Runs to the end of the line. C4X comments start with `%%`; `//` and `#` are not comments.',
        form: '%% text',
    },
    Title: {
        summary: 'A title line. Parsed and dropped: it does not appear in the drawing.',
        form: 'title Text',
    },
    ClassDef: {
        summary: 'A Mermaid class definition. Parsed and ignored (C4X-L115). Use `elementStyle`.',
        form: 'classDef name styles',
    },
    ClassAssignment: {
        summary: 'Adds a tag to elements by id. The tag then matches `elementStyle` rules.',
        form: 'class id1, id2 TagName',
    },
    ElementStyle: {
        summary: 'Styles every element that carries a tag. Top level only. Later keys win; tag matching ignores case.',
        form: 'elementStyle TagName $stroke="#RRGGBB", $shape="Cylinder"',
    },
    Subgraph: {
        summary: 'An untyped visual group. Its children may be elements, relationships and nested groups. Takes the `direction` statement.',
        form: 'subgraph Name { ... }',
    },
    DeploymentNode: {
        summary: 'A deployment node with children. Nodes nest. Two forms: the call form, and a short form that takes a quoted label and an optional quoted technology.',
        form: 'Node(id, "Label", "Technology", "Description") { ... }',
    },
    BoundaryBlock: {
        summary: 'A typed boundary around the elements inside it.',
        form: 'System_Boundary(id, "Label") { ... }',
    },
    ElementCall: {
        summary: 'An element in call form, the form to prefer: it has room for technology and description. The type is any identifier at parse time; the model builder accepts only the element kinds listed in elementKinds.',
        form: 'Type(id, "Label", "Technology", "Description", $key="value")',
    },
    Element: {
        summary: 'An element in bracket form: label, type and tags on separate lines joined by `<br/>`. It has no slot for technology or description, so rule C4X-L001 and C4X-L002 report it.',
        form: 'id[Label<br/>Type<br/>Tag]',
    },
    Relationship: {
        summary: 'A directed relationship between two element ids. The label sits between bars, the technology (protocol) in quotes after it.',
        form: 'from -->|Label| "Technology" to',
    },
};

/** Keyed by rule name of the boundary types, then by the other grouping statements. */
export const BOUNDARY_NOTES: Readonly<Record<string, string>> = {
    System_Boundary: 'The software system in scope, with its containers inside. Used in container and component views.',
    Container_Boundary: 'The container in scope, with its components inside. Used in component views. A component view decomposes exactly one (C4X-L101).',
    Enterprise_Boundary: 'A company, department or other grouping of people and software systems. Used in system context and container views.',
};

/** Keyed by arrow. The relationship type each builds is read from the builder. */
export const ARROWS: Readonly<Record<string, string>> = {
    '-->': 'A solid arrow. The default for a call or a dependency.',
    '-.->': 'A dashed arrow. Use it for asynchronous or optional communication.',
    '==>': 'A thick arrow. Use it to stress the main path.',
};

export interface StyleKeyNote {
    readonly summary: string;
    /** What the key accepts, in words. */
    readonly accepts: string;
    /** A value the key accepts. The generator checks it. */
    readonly example: string;
    /** A value the key rejects. The generator checks it. */
    readonly invalidExample: string;
}

/** Keyed by style key. The keys themselves come from the style resolver. */
export const STYLE_KEYS: Readonly<Record<string, StyleKeyNote>> = {
    stroke: {
        summary: 'Outline colour.',
        accepts: 'A hex colour, `#RGB` or `#RRGGBB`, quoted.',
        example: '#BF101D',
        invalidExample: 'red',
    },
    background: {
        summary: 'Fill colour.',
        accepts: 'A hex colour, `#RGB` or `#RRGGBB`, quoted.',
        example: '#FFF3E0',
        invalidExample: 'orange',
    },
    color: {
        summary: 'Text colour. Spell it `color`: `$colour` is an error (C4X-L113).',
        accepts: 'A hex colour, `#RGB` or `#RRGGBB`, quoted.',
        example: '#111111',
        invalidExample: 'black',
    },
    shape: {
        summary: 'Outline shape. See shapes for the names and which ones the renderer draws today.',
        accepts: 'One of the shape names, exactly as spelled, case sensitive.',
        example: 'Cylinder',
        invalidExample: 'cylinder',
    },
    sprite: {
        summary: 'Icon drawn on the element.',
        accepts: 'The id of a bundled icon (docs/ICONS.md).',
        example: 'database',
        invalidExample: 'no-such-icon',
    },
    border: {
        summary: 'Outline style.',
        accepts: '`solid`, `dashed` or `dotted`.',
        example: 'dashed',
        invalidExample: 'double',
    },
    strokeWidth: {
        summary: 'Outline width in pixels.',
        accepts: 'A whole number from 1 to 10, quoted: `$strokeWidth="3"`.',
        example: '3',
        invalidExample: '11',
    },
    legend: {
        summary: 'The text for this style in the legend.',
        accepts: 'Non-empty text of at most 120 characters, quoted.',
        example: 'Message queue',
        invalidExample: '',
    },
};

/** Keyed by diagnostic code. `trigger` is a source that must raise it; the generator checks that it does. */
export const STYLE_DIAGNOSTICS: Readonly<Record<string, { readonly summary: string; readonly trigger: string }>> = {
    'C4X-L107': {
        summary: 'An `elementStyle` key outside the allowed keys. The key is ignored.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $tags="T")\nelementStyle T $outline="#000000"',
    },
    'C4X-L108': {
        summary: 'A key repeated in one `elementStyle`, or `$shape` given twice on one element. The last value is used.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $tags="T")\nelementStyle T $stroke="#000000", $stroke="#111111"',
    },
    'C4X-L109': {
        summary: 'A value the key does not accept. The key is ignored.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $tags="T")\nelementStyle T $stroke="red"',
    },
    'C4X-L110': {
        summary: 'A shape name outside the shape list. The element is drawn as the theme rectangle.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $shape="Cylindre")',
    },
    'C4X-L111': {
        summary: 'A valid shape the renderer does not draw yet. The element is drawn as the theme rectangle.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $shape="Hexagon")',
    },
    'C4X-L112': {
        summary: 'Two `elementStyle` statements for one tag, in any case. They merge and later keys win.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $tags="T")\nelementStyle T $stroke="#000000"\nelementStyle t $color="#111111"',
    },
    'C4X-L113': {
        summary: '`$colour` is not an alias of `$color`. The key is ignored.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $tags="T")\nelementStyle T $colour="#000000"',
    },
    'C4X-L114': {
        summary: 'An element attribute that looks like a style key. It is kept as metadata and styles nothing.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing", $stroke="#000000")',
    },
    'C4X-L115': {
        summary: 'A Mermaid `classDef`, which C4X parses and ignores.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing")\nclassDef big fill:#fff',
    },
    'C4X-L116': {
        summary: 'A subgraph, boundary or `direction` inside a deployment Node, which is not drawn there.',
        trigger: '%%{ c4: deployment }%%\ngraph TB\nNode(n, "Host") {\n  subgraph g {\n    Container(a, "A", "Go", "Does a thing")\n  }\n}',
    },
};

/** The three diagnostics the linter adds for a source that cannot be checked. Keyed by id; `trigger` must raise it. */
export const OTHER_DIAGNOSTICS: Readonly<Record<string, { readonly summary: string; readonly trigger: string }>> = {
    'C4X-SYNTAX': {
        summary: 'The source does not parse. Always an error.',
        trigger: '%%{ c4: container }%%\ngraph TB\nContainer(a, "A", "Go", "Does a thing"',
    },
    'C4X-MODEL': {
        summary: 'The source parses but cannot be built into a model: an unknown element type, a repeated id, a relationship that names an unknown id, or `$code` on a kind other than Container and Component. Always an error.',
        trigger: '%%{ c4: container }%%\ngraph TB\nGoal(a, "A")',
    },
    'C4X-LIMIT': {
        summary: 'The source parses but exceeds an input limit (see Input limits in the C4X reference): too many elements or relationships, a text field longer than 4,096 characters, or more than 256 entries in one attribute list, tag list or elementStyle. Always an error.',
        trigger: `%%{ c4: container }%%\ngraph TB\nContainer(a, "${'A'.repeat(4097)}", "Go", "Does a thing")`,
    },
};

/** Method note for textLimits. */
export const TEXT_LIMIT_METHOD =
    'Estimate: a line is characters x font size x 0.6 pixels wide, the rule the renderer itself uses to place relationship labels. The box width and font sizes are read from a real layout and render of one element of each kind. Real text in a proportional font is usually narrower, so treat the limit as safe, not exact. The #351 dogfood run found overflow at about 33 characters in a 220 px box.';

/** Keyed by lint rule id. `trigger` is a source that must raise that rule in a view of its level; the generator checks it. */
export const LINT_TRIGGERS: Readonly<Record<string, string>> = {
    'C4X-L001': '%%{ c4: container }%%\ngraph TB\nContainer(api, "API", "Go")',
    'C4X-L002': '%%{ c4: container }%%\ngraph TB\nContainer(api, "API", "", "Serves requests")',
    'C4X-L003': '%%{ c4: system-context }%%\ngraph TB\nPerson(u, "User")\nSystem(s, "Shop")\nu --> s',
    'C4X-L004': '%%{ c4: container }%%\ngraph TB\nContainer(api, "API", "Go", "Serves requests")\nContainer(db, "Database", "PostgreSQL", "Stores orders")\napi -->|Reads and writes orders in| db',
    'C4X-L005': '%%{ c4: container }%%\ngraph TB\nSystem_Boundary(shop, "Shop") {\n    Container(api, "API", "Go", "Serves requests")\n}\nSystem(mail, "Mail Service")\napi -->|Sends receipts through| "SMTP" mail',
    'C4X-L006': '%%{ c4: system-context }%%\ngraph TB\nPerson(u, "User")\nContainer(api, "API", "Go", "Serves requests")\nu -->|Calls the| api',
    'C4X-L008': '%%{ c4: system-context }%%\ngraph TB\nPerson(u, "User")\nSystem(s, "Shop")\nu -->|Uses| s',
    'C4X-L101': '%%{ c4: component }%%\ngraph TB\nContainer_Boundary(a, "A") {\n    Component(x, "X", "Go", "Does x")\n}\nContainer_Boundary(b, "B") {\n    Component(y, "Y", "Go", "Does y")\n}\nx -->|Calls the| y',
    'C4X-L102': '%%{ c4: system-context }%%\ngraph TB\nPerson(u, "User")\nSystem(s, "Shop")\nSystem(t, "Orphan")\nu -->|Buys goods from| s',
    'C4X-L103': '%%{ c4: component }%%\ngraph TB\nContainer_Boundary(a, "A") {\n    Component(x, "X", "Go", "Does x")\n}\nContainer_Boundary(b, "B") {\n    Component(y, "Y", "Go", "Does y")\n}\nx -->|Reaches into the| y',
    'C4X-L104': '%%{ c4: system-context }%%\ngraph TB\nPerson(u, "User")\nSystem(a, "Shop")\nSystem(b, "Shop")\nu -->|Buys goods from| a\nu -->|Also buys goods from| b',
    'C4X-L105': '%%{ c4: container }%%\ngraph TB\nPerson(u, "User")\nSystem(s, "Shop")\nu -->|Buys goods from| s',
    'C4X-L106': '%%{ c4: deployment }%%\ngraph TB\nNode(region, "Cloud Region", "Europe", "Hosts the service") {\n    Node(cluster, "Cluster", "Kubernetes", "Runs the pods") {\n    }\n}\nregion -->|Contains the| cluster',
};

export interface ExampleNote {
    readonly id: string;
    readonly title: string;
    readonly summary: string;
    /** What the example shows, so a reader can find it. */
    readonly covers: readonly string[];
    readonly source: string;
}

/**
 * Every example parses, builds and lints with no finding at all at `info`.
 * The generator and the unit tests both check that.
 */
export const EXAMPLES: readonly ExampleNote[] = [
    {
        id: 'system-context',
        title: 'System context',
        summary: 'People and neighbouring systems around one system.',
        covers: ['view declaration', 'Person', 'System', 'System_Ext', 'relationship label', 'comment'],
        source: [
            '%%{ c4: system-context }%%',
            'graph TB',
            '    %% People first, then systems, then relationships.',
            '    Person(customer, "Customer", "Holds an account")',
            '    System(bank, "Banking System", "Holds accounts and payments")',
            '    System_Ext(mail, "Mail System", "Sends statements")',
            '    customer -->|Views balances and pays bills in| bank',
            '    bank -->|Sends statements through| mail',
        ].join('\n'),
    },
    {
        id: 'container',
        title: 'Container',
        summary: 'Containers inside a system boundary, with protocols on the relationships that cross a process.',
        covers: ['System_Boundary', 'Container', 'ContainerDb', 'technology', 'relationship technology', 'direction'],
        source: [
            '%%{ c4: container }%%',
            'graph LR',
            '    Person(customer, "Customer", "Holds an account")',
            '    System_Boundary(bank, "Banking System") {',
            '        Container(web, "Web App", "TypeScript, React", "Shows balances")',
            '        Container(api, "API", "Java, Spring Boot", "Serves the web app")',
            '        ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")',
            '    }',
            '    customer -->|Views balances using| web',
            '    web -->|Calls the API of| "JSON/HTTPS" api',
            '    api -->|Reads and writes accounts in| "JDBC" db',
        ].join('\n'),
    },
    {
        id: 'component',
        title: 'Component',
        summary: 'Components inside one container, with a neighbouring container outside it.',
        covers: ['Container_Boundary', 'Component', 'Component_Ext', 'ContainerDb', '$code'],
        source: [
            '%%{ c4: component }%%',
            'graph TB',
            '    Container_Boundary(api, "API") {',
            '        Component(rest, "Account Controller", "Spring MVC", "Handles requests", $code="src/api/**")',
            '        Component(repo, "Account Repository", "Spring Data", "Reads accounts", $code="src/data/**")',
            '    }',
            '    ContainerDb(db, "Database", "PostgreSQL", "Stores accounts")',
            '    rest -->|Loads accounts through| repo',
            '    repo -->|Reads accounts from| "JDBC" db',
        ].join('\n'),
    },
    {
        id: 'dynamic',
        title: 'Dynamic',
        summary: 'One scenario. Relationships are numbered in source order.',
        covers: ['dynamic view', 'ordering', 'dashed arrow'],
        source: [
            '%%{ c4: dynamic }%%',
            'graph TB',
            '    Person(customer, "Customer", "Holds an account")',
            '    Container(web, "Web App", "TypeScript, React", "Shows balances")',
            '    Container(api, "API", "Java, Spring Boot", "Serves the web app")',
            '    customer -->|Opens the balance page of| web',
            '    web -->|Requests balances from| "JSON/HTTPS" api',
            '    api -.->|Returns balances to| "JSON/HTTPS" web',
        ].join('\n'),
    },
    {
        id: 'deployment',
        title: 'Deployment',
        summary: 'Containers placed on nested deployment nodes.',
        covers: ['Node', 'nesting', 'Container inside Node'],
        source: [
            '%%{ c4: deployment }%%',
            'graph TB',
            '    Node(region, "Cloud Region", "Europe", "Hosts the service") {',
            '        Node(cluster, "Cluster", "Kubernetes", "Runs the pods") {',
            '            Container(api, "API", "Java, Spring Boot", "Serves the web app")',
            '        }',
            '    }',
        ].join('\n'),
    },
    {
        id: 'styles',
        title: 'Tags and element styles',
        summary: 'Tags select element styles. A shape and an outline style on one tag, an icon on another.',
        covers: ['$tags', 'elementStyle', '$shape', '$stroke', '$border', '$strokeWidth', '$legend', '$sprite', 'class'],
        source: [
            '%%{ c4: container }%%',
            'graph TB',
            '    System_Boundary(shop, "Shop") {',
            '        Container(api, "API", "Go", "Serves orders", $tags="Core")',
            '        Container(queue, "Order Queue", "RabbitMQ", "Buffers orders", $tags="Queue")',
            '        ContainerDb(files, "File Store", "S3", "Holds receipts", $sprite="database")',
            '    }',
            '    class api Critical',
            '    api -->|Publishes orders to| "AMQP" queue',
            '    api -->|Stores receipts in| "HTTPS" files',
            '    elementStyle Queue $shape="RoundedBox", $stroke="#BF101D", $border="dashed", $strokeWidth="3", $legend="Message queue"',
            '    elementStyle Critical $background="#FFF3E0", $color="#111111"',
        ].join('\n'),
    },
];

export interface LimitNote {
    readonly id: string;
    readonly issue: string;
    readonly text: string;
}

/** Defects and gaps the guidance has to work around. Each names its issue. */
export const KNOWN_LIMITATIONS: readonly LimitNote[] = [
    {
        id: 'text-overflow',
        issue: '#340',
        text: 'Element text is one unwrapped line and the box does not grow. A line wider than its box overflows it. textLimits holds the measured limit for each kind. Keep labels, technologies and descriptions inside it until the issue is fixed.',
    },
];

/** Facts about running the linter that no catalogue holds. The generator checks the severity claim. */
export const LINT_CLI_NOTES: readonly string[] = [
    'Every rule defaults to `info`. `c4x-lint` lists info findings but exits 0 at its default `--max-severity error`, and `--quiet` hides them. To see them as failures use `--max-severity info`.',
    'Syntax errors (`C4X-SYNTAX`), model errors (`C4X-MODEL`) and input-limit errors (`C4X-LIMIT`) are always errors.',
    'Raise or switch off a rule with `c4x.lint.rules` in settings, or the same table in `.c4x-lint.json`.',
];

/** What the C4X-L004 rule checks, in one place, next to what the renderer does with the result. */
export const RELATIONSHIP_TECHNOLOGY_NOTE =
    'C4X-L004 asks for a technology on a relationship that crosses a process boundary: between two different containers or software systems, or between a component and a container or software system. Relationships that touch a person, and relationships between two components, are not checked. The technology is stored in the model and drawn under the relationship label as `[technology]` in italics (#421).';

/** Short rules for writing C4X that follow from the entries above. Each names the entry it comes from. */
export const AUTHORING_RULES: readonly string[] = [
    'Declare the view on the first line: `%%{ c4: <view> }%%`. `graph TB` is optional and defaults to `TB`.',
    'Prefer the call form `Type(id, "Label", "Technology", "Description")` to the bracket form.',
    'Write comments with `%%`. Nothing else is a comment.',
    'Use an arrow label of two or more words that reads in the direction of the arrow (C4X-L003, C4X-L008).',
    'Name the protocol on every relationship between processes (C4X-L004), after the label, in quotes.',
    'Keep each label, technology and description inside the textLimits for its element kind until #340 is fixed.',
    'Put each element in the scope its view allows (placement).',
    'Style with tags and `elementStyle`, never with `classDef`.',
];
