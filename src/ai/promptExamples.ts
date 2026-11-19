// Every C4X example the generation prompts show, in one list (#330).
//
// The prompt builders interpolate `text` from here, and the tests run each
// entry's `source` (a complete diagram) through the parser and the linter, so
// an example in a prompt cannot drift from the grammar. A guard test fails
// when a prompt contains a relationship line that is not in this list.
//
//   valid    parses; no error or warning finding
//   invalid  shown as what NOT to write; must fail the parser or the linter
//   cleaned  shown as what NOT to write; parses, but the generation loop's
//            `cleanResponse` rewrites it

export type PromptExampleStatus = 'valid' | 'invalid' | 'cleaned';

export interface PromptExample {
    readonly id: string;
    /** The snippet as the prompt shows it. */
    readonly text: string;
    /** A complete C4X source that holds the snippet. */
    readonly source: string;
    readonly status: PromptExampleStatus;
}

const HEAD = '%%{ c4: container }%%\ngraph TB\n';
const USER_APP = 'Person(User, "User", "End user")\nContainer(App, "App", "Go", "Serves requests")\n';
const WEB_CHAIN = 'Person(User, "User", "End user")\nContainer(Web, "Web", "React", "Shows the UI")\nContainer(API, "API", "Go", "Serves requests")\nContainer(DB, "DB", "PostgreSQL", "Stores data")\n';

function example(id: string, text: string, source: string, status: PromptExampleStatus): PromptExample {
    return { id, text, source, status };
}

const BUILT_IN_PATTERN = `%%{ c4: container }%%
graph TB
  %% 1. External actors FIRST (top of diagram)
  Person(user, "User", "End user")
  System_Ext(external, "External System", "Third party")

  %% 2. Main system boundary
  subgraph MainSystem {
    %% Entry point
    Container(gateway, "API Gateway", "Kong", "Router")

    %% Core services (in execution order)
    Container(auth, "Auth Service", "Node.js", "Authentication")
    Container(business, "Business Logic", "Java", "Processing")

    %% Data layer LAST
    ContainerDb(db, "Database", "PostgreSQL", "Storage")
  }

  %% 3. External storage/systems (bottom)
  System_Ext(storage, "File System", "S3")

  %% 4. Relationships follow execution flow
  user -->|Opens the site through| gateway
  gateway -->|Authenticates users with| "gRPC" auth
  gateway -->|Sends orders to| "gRPC" business
  business -->|Reads and writes orders in| "JDBC" db
  business -->|Stores files in| "HTTPS" storage
  gateway -->|Checks partners with| "HTTPS" external`;

export const PROMPT_EXAMPLES: readonly PromptExample[] = [
    example('built-in-pattern', BUILT_IN_PATTERN, BUILT_IN_PATTERN, 'valid'),
    example('subgraph-named', 'subgraph MySystem {', HEAD + 'Person(user, "User", "End user")\nsubgraph MySystem {\n  Container(api, "API", "Go", "Serves requests")\n}\nuser -->|Calls the| api', 'valid'),
    example('label-plain', 'User -->|Clicks Button| App', HEAD + USER_APP + 'User -->|Clicks Button| App', 'valid'),
    example('label-html', 'User -->|Clicks<br>Button| App', HEAD + USER_APP + 'User -->|Clicks<br>Button| App', 'cleaned'),
    example('chain-user-web', 'User --> Web', HEAD + WEB_CHAIN + 'User --> Web', 'valid'),
    example('chain-web-api', 'Web --> API', HEAD + WEB_CHAIN + 'Web --> API', 'valid'),
    example('chain-api-db', 'API --> DB', HEAD + WEB_CHAIN + 'API --> DB', 'valid'),
    example('subgraph-valid', 'subgraph ID {', HEAD + 'Person(user, "User", "End user")\nsubgraph ID {\n  Container(api, "API", "Go", "Serves requests")\n}\nuser -->|Calls the| api', 'valid'),
    example('subgraph-quoted', 'subgraph "My System"', HEAD + 'subgraph "My System" {\n  Container(api, "API", "Go", "Serves requests")\n}', 'invalid'),
    example('node-label', 'Web[Web App<br/>Container<br/>React]', HEAD + 'Person(User, "User", "End user")\nWeb[Web App<br/>Container<br/>React]\nUser -->|Opens the| Web', 'valid'),
    example('shape-db', 'ContainerDb(db, "Orders", "PostgreSQL", "Stores orders", $shape="Cylinder")', HEAD + 'ContainerDb(db, "Orders", "PostgreSQL", "Stores orders", $shape="Cylinder")\nContainer(api, "API", "Java", "Serves orders")\napi -->|Reads orders from| "JDBC" db', 'valid'),
    example('shape-browser', 'Container(spa, "Web App", "React", "Shows the UI", $shape="WebBrowser")', HEAD + 'Container(spa, "Web App", "React", "Shows the UI", $shape="WebBrowser")\nContainer(api, "API", "Java", "Serves orders")\nspa -->|Calls the| "HTTPS" api', 'valid'),
    example('rel-technology', 'api -->|Reads orders from| "JDBC" db', HEAD + 'Container(api, "API", "Java", "Serves orders")\nContainerDb(db, "Orders", "PostgreSQL", "Stores orders", $shape="Cylinder")\napi -->|Reads orders from| "JDBC" db', 'valid'),
    example('rel-technology-generic', 'a -->|Calls the| "HTTPS" b', HEAD + 'Container(a, "A", "Go", "Calls b")\nContainer(b, "B", "Go", "Serves a")\na -->|Calls the| "HTTPS" b', 'valid'),
];

/** The snippet of a listed example, for a prompt to interpolate. */
export function exampleText(id: string): string {
    const found = PROMPT_EXAMPLES.find(e => e.id === id);
    if (!found) { throw new Error(`No prompt example "${id}"`); }
    return found.text;
}
