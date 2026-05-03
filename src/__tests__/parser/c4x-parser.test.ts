import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4XParseError } from '../../parser/types';

describe('C4XParser', () => {
    let parser: C4XParser;

    beforeEach(() => {
        parser = new C4XParser();
    });

    // =========================================================================
    // Basic parsing — graph directive and view type detection
    // =========================================================================

    describe('graph directive injection', () => {
        it('injects "graph TB" when no graph directive is present', () => {
            const input = 'Customer[Customer<br/>Person]';
            const result = parser.parse(input);
            assert.ok(result);
            assert.strictEqual(result.elements.length, 1);
            assert.strictEqual(result.elements[0].id, 'Customer');
        });

        it('does not inject graph directive when already present', () => {
            const input = 'graph LR\n    Customer[Customer<br/>Person]';
            const result = parser.parse(input);
            assert.ok(result);
            assert.strictEqual(result.elements.length, 1);
        });

        it('supports all four graph directions: TB, BT, LR, RL', () => {
            for (const dir of ['TB', 'BT', 'LR', 'RL']) {
                const input = `graph ${dir}\n    Customer[Customer<br/>Person]`;
                const result = parser.parse(input);
                assert.ok(result, `Failed to parse with direction ${dir}`);
                assert.strictEqual(result.elements.length, 1);
            }
        });

        it('injects graph directive after a %%{ directive }%% block', () => {
            const input = '%%{ c4: container }%%\nContainer(WebApp, "Web App", "Spring Boot")';
            const result = parser.parse(input);
            assert.ok(result);
            assert.strictEqual(result.viewType, 'container');
        });
    });

    // =========================================================================
    // View type detection from directives
    // =========================================================================

    describe('view type detection', () => {
        it('detects system-context view type from directive', () => {
            const input = '%%{ c4: system-context }%%\ngraph TB\n    User[User<br/>Person]';
            const result = parser.parse(input);
            assert.strictEqual(result.viewType, 'system-context');
        });

        it('detects container view type from directive', () => {
            const input = '%%{ c4: container }%%\ngraph TB\n    Container(App, "App", "Java")';
            const result = parser.parse(input);
            assert.strictEqual(result.viewType, 'container');
        });

        it('detects component view type from directive', () => {
            const input = '%%{ c4: component }%%\ngraph TB\n    Component(Ctrl, "Controller", "Spring MVC")';
            const result = parser.parse(input);
            assert.strictEqual(result.viewType, 'component');
        });

        it('defaults to system-context when no directive is present', () => {
            const input = 'graph TB\n    User[User<br/>Person]';
            const result = parser.parse(input);
            assert.strictEqual(result.viewType, 'system-context');
        });
    });

    // =========================================================================
    // Element parsing — bracket syntax: ID[Label<br/>Type<br/>Tags]
    // =========================================================================

    describe('bracket element syntax', () => {
        it('parses a simple element with label and type', () => {
            const input = 'graph TB\n    Customer[Customer<br/>Person]';
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 1);
            assert.strictEqual(result.elements[0].id, 'Customer');
            assert.strictEqual(result.elements[0].label, 'Customer');
            assert.strictEqual(result.elements[0].elementType, 'Person');
        });

        it('parses element with tags', () => {
            const input = 'graph TB\n    Banking[Internet Banking System<br/>Software System<br/>External]';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.strictEqual(element.id, 'Banking');
            assert.strictEqual(element.label, 'Internet Banking System');
            assert.strictEqual(element.elementType, 'Software System');
            assert.ok(element.tags.includes('External'));
        });

        it('parses element with multiple tags', () => {
            const input = 'graph TB\n    API[API Gateway<br/>Software System<br/>External<br/>Critical<br/>API]';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.deepStrictEqual(element.tags, ['External', 'Critical', 'API']);
        });

        it('parses multiple elements', () => {
            const input = `graph TB
    Customer[Customer<br/>Person]
    Banking[Banking System<br/>Software System]
    Email[Email System<br/>Software System<br/>External]`;
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 3);
            assert.strictEqual(result.elements[0].id, 'Customer');
            assert.strictEqual(result.elements[1].id, 'Banking');
            assert.strictEqual(result.elements[2].id, 'Email');
        });

        it('throws on element body with fewer than 2 lines (missing type)', () => {
            const input = 'graph TB\nCustomer[Customer]';
            assert.throws(() => parser.parse(input), C4XParseError);
        });
    });

    // =========================================================================
    // Element parsing — ElementCall syntax: Type(id, "Label", ...)
    // =========================================================================

    describe('ElementCall syntax', () => {
        it('parses Person element call', () => {
            const input = '%%{ c4: system-context }%%\ngraph TB\nPerson(User, "End User")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 1);
            assert.strictEqual(result.elements[0].id, 'User');
            assert.strictEqual(result.elements[0].label, 'End User');
            assert.strictEqual(result.elements[0].elementType, 'Person');
        });

        it('parses Container element call with technology', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(WebApp, "Web Application", "Spring Boot")';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.strictEqual(element.id, 'WebApp');
            assert.strictEqual(element.label, 'Web Application');
            assert.strictEqual(element.technology, 'Spring Boot');
        });

        it('parses Container element call with technology and description', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(API, "API Gateway", "Node.js", "REST API")';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.strictEqual(element.id, 'API');
            assert.strictEqual(element.technology, 'Node.js');
            assert.strictEqual(element.description, 'REST API');
        });

        it('parses element call with KV args ($sprite)', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(S3, "My Bucket", "AWS S3", $sprite="postgresql")';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.strictEqual(element.sprite, 'postgresql');
        });

        it('parses element call with $tags KV arg', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(DB, "Database", "PostgreSQL", $tags="Critical,Core")';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.ok(element.tags.includes('Critical'));
            assert.ok(element.tags.includes('Core'));
        });
    });

    // =========================================================================
    // Sprite normalization
    // =========================================================================

    describe('sprite normalization', () => {
        it('normalizes c4xicons.aws.X to aws-X', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(S3, "S3 Bucket", "AWS S3", $sprite="c4xicons.aws.s3-bucket")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'aws-s3-bucket');
        });

        it('normalizes c4xicons.azure.X to azure-X', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(VM, "VM", "Azure", $sprite="c4xicons.azure.vm")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'azure-vm');
        });

        it('normalizes c4xicons.gcp.X to gcp-X', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(GCS, "GCS", "GCP", $sprite="c4xicons.gcp.storage")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'gcp-storage');
        });

        it('normalizes c4xicons.std.X to X (strips std prefix)', () => {
            const input = '%%{ c4: system-context }%%\ngraph TB\nPerson(User, "User", $sprite="c4xicons.std.person")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'person');
        });

        it('leaves standard sprite names unchanged', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(DB, "DB", "SQL", $sprite="postgresql")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'postgresql');
        });

        it('handles unquoted dotted identifier for sprite', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(S3, "S3", "AWS", $sprite=c4xicons.aws.s3-bucket)';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, 'aws-s3-bucket');
        });

        it('leaves undefined sprites alone', () => {
            const input = '%%{ c4: container }%%\ngraph TB\nContainer(App, "App", "Java")';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].sprite, undefined);
        });
    });

    // =========================================================================
    // Relationship parsing
    // =========================================================================

    describe('relationships', () => {
        it('parses a basic --> relationship with label', () => {
            const input = `graph TB
    Customer[Customer<br/>Person]
    System[System<br/>Software System]
    Customer -->|Uses| System`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships.length, 1);
            assert.strictEqual(result.relationships[0].from, 'Customer');
            assert.strictEqual(result.relationships[0].to, 'System');
            assert.strictEqual(result.relationships[0].label, 'Uses');
            assert.strictEqual(result.relationships[0].arrow, '-->');
        });

        it('parses -.-> async relationship', () => {
            const input = `graph TB
    A[Service A<br/>Software System]
    B[Service B<br/>Software System]
    A -.->|Publishes events| B`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships[0].arrow, '-.->');
        });

        it('parses ==> sync relationship', () => {
            const input = `graph TB
    A[Service A<br/>Software System]
    B[Service B<br/>Software System]
    A ==>|Calls synchronously| B`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships[0].arrow, '==>');
        });

        it('parses relationship without a label', () => {
            const input = `graph TB
    A[Service A<br/>Software System]
    B[Service B<br/>Software System]
    A --> B`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships[0].label, '');
        });

        it('parses multiple relationships', () => {
            const input = `graph TB
    User[User<br/>Person]
    Web[Web App<br/>Software System]
    API[API<br/>Software System]
    User -->|Uses| Web
    Web -->|Calls| API`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships.length, 2);
        });
    });

    // =========================================================================
    // ClassDef and class assignment
    // =========================================================================

    describe('classDef and class assignments', () => {
        it('parses classDef statements', () => {
            const input = `graph TB
classDef external fill:#999999,stroke:#333
    Customer[Customer<br/>Person]
    External[External API<br/>Software System]
    Customer -->|Calls| External`;
            const result = parser.parse(input);
            assert.ok(result.classDefinitions);
            assert.strictEqual(result.classDefinitions!.length, 1);
            assert.strictEqual(result.classDefinitions![0].name, 'external');
            assert.ok(result.classDefinitions![0].styles?.includes('fill:#999999'));
        });

        it('applies class assignments as tags on elements', () => {
            const input = `%%{ c4: system-context }%%
graph TB
classDef highlight fill:#FF9900
class Customer highlight
    Customer[Customer<br/>Person]
    System[System<br/>Software System]
    Customer -->|Uses| System`;
            const result = parser.parse(input);
            const customer = result.elements.find(e => e.id === 'Customer');
            assert.ok(customer, 'Customer element not found');
            assert.ok(customer!.tags.includes('highlight'));
        });

        it('supports multi-target class assignments', () => {
            const input = `graph TB
classDef internal fill:#0C4A6E
class Customer,BackOffice internal
    Customer[Customer<br/>Person]
    BackOffice[Back Office<br/>Person]
    System[Core System<br/>Software System]
    Customer --> System
    BackOffice --> System`;
            const result = parser.parse(input);
            for (const id of ['Customer', 'BackOffice']) {
                const element = result.elements.find(e => e.id === id);
                assert.ok(element, `Element ${id} not found`);
                assert.ok(element!.tags.includes('internal'), `Element ${id} missing 'internal' tag`);
            }
        });
    });

    // =========================================================================
    // Subgraph / Boundary parsing
    // =========================================================================

    describe('boundaries and subgraphs', () => {
        it('parses subgraph as boundary', () => {
            const input = `graph TB
    subgraph Backend {
        API[API Server<br/>Software System]
        DB[Database<br/>Software System]
        API -->|Reads from| DB
    }`;
            const result = parser.parse(input);
            assert.ok(result.boundaries);
            assert.strictEqual(result.boundaries!.length, 1);
            assert.strictEqual(result.boundaries![0].label, 'Backend');
        });

        it('parses BoundaryBlock (System_Boundary)', () => {
            const input = `%%{ c4: container }%%
graph TB
    System_Boundary(banking, "Internet Banking System") {
        Container(WebApp, "Web Application", "Java")
        Container(API, "API Application", "Java")
    }`;
            const result = parser.parse(input);
            assert.ok(result.boundaries);
            assert.strictEqual(result.boundaries!.length, 1);
            assert.strictEqual(result.boundaries![0].label, 'Internet Banking System');
        });

        it('extracts elements from boundaries into the global elements list', () => {
            const input = `%%{ c4: container }%%
graph TB
    System_Boundary(banking, "Banking") {
        Container(WebApp, "Web App", "Java")
    }`;
            const result = parser.parse(input);
            // Elements inside boundaries should be in the top-level elements array
            const webApp = result.elements.find(e => e.id === 'WebApp');
            assert.ok(webApp, 'WebApp element should be accessible at top level');
        });

        it('extracts relationships from boundaries into the global relationships list', () => {
            const input = `%%{ c4: container }%%
graph TB
    System_Boundary(sys, "System") {
        Container(WebApp, "Web App", "Java")
        Container(API, "API", "Node.js")
        WebApp -->|Calls| API
    }`;
            const result = parser.parse(input);
            assert.ok(result.relationships.length >= 1, 'Relationship inside boundary should be accessible');
            const rel = result.relationships.find(r => r.from === 'WebApp' && r.to === 'API');
            assert.ok(rel, 'WebApp --> API relationship should exist');
        });
    });

    // =========================================================================
    // DeploymentNode parsing
    // =========================================================================

    describe('deployment nodes', () => {
        it('parses a deployment node with children', () => {
            const input = `%%{ c4: deployment }%%
graph TB
    Node(Server, "Production Server", "Ubuntu") {
        Container(WebApp, "Web App", "Java")
    }`;
            const result = parser.parse(input);
            const server = result.elements.find(e => e.id === 'Server');
            assert.ok(server, 'Server deployment node should exist');
            assert.strictEqual(server!.elementType, 'node');
            assert.ok(server!.children, 'Server should have children');
            assert.strictEqual(server!.children!.length, 1);
            assert.strictEqual(server!.children![0].id, 'WebApp');
        });
    });

    // =========================================================================
    // Comment and title handling
    // =========================================================================

    describe('comments and titles', () => {
        it('ignores %% comments', () => {
            const input = `graph TB
    %% This is a comment
    User[User<br/>Person]`;
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 1);
        });

        it('ignores title statements', () => {
            const input = `graph TB
    title My Architecture Diagram
    User[User<br/>Person]`;
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 1);
        });
    });

    // =========================================================================
    // Error handling
    // =========================================================================

    describe('error handling', () => {
        it('throws C4XParseError for invalid syntax', () => {
            const input = 'graph TB\nCustomer[Customer]\n';
            assert.throws(() => parser.parse(input), C4XParseError);
        });

        it('error has location information', () => {
            const input = 'graph TB\nCustomer[Customer]\n';
            try {
                parser.parse(input);
                assert.fail('Expected C4XParseError');
            } catch (error: unknown) {
                assert.ok(error instanceof C4XParseError);
                const parseError = error as C4XParseError;
                assert.ok(typeof parseError.location.line === 'number');
                assert.ok(typeof parseError.location.column === 'number');
            }
        });

        it('throws C4XParseError for invalid relationship arrow', () => {
            const input = 'graph TB\nCustomer[Customer<br/>Person]\nCustomer => System';
            assert.throws(() => parser.parse(input), (err: unknown) => err instanceof C4XParseError || err instanceof Error);
        });

        it('C4XParseError has correct name property', () => {
            try {
                parser.parse('graph TB\nX[X]\n');
                assert.fail('Expected error');
            } catch (error: unknown) {
                assert.ok(error instanceof C4XParseError);
                assert.strictEqual((error as C4XParseError).name, 'C4XParseError');
            }
        });
    });

    // =========================================================================
    // Edge cases
    // =========================================================================

    describe('edge cases', () => {
        it('parses elements with hyphens in identifiers', () => {
            const input = 'graph TB\n    my-service[My Service<br/>Software System]';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].id, 'my-service');
        });

        it('parses elements with underscores in identifiers', () => {
            const input = 'graph TB\n    my_service[My Service<br/>Software System]';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].id, 'my_service');
        });

        it('handles extra whitespace around elements gracefully', () => {
            const input = `graph TB

    Customer[Customer<br/>Person]

    System[System<br/>Software System]

    Customer -->|Uses| System`;
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 2);
            assert.strictEqual(result.relationships.length, 1);
        });

        it('preserves spaces in element labels', () => {
            const input = 'graph TB\n    Banking[Internet Banking System<br/>Software System]';
            const result = parser.parse(input);
            assert.strictEqual(result.elements[0].label, 'Internet Banking System');
        });

        it('preserves spaces in relationship labels', () => {
            const input = `graph TB
    A[Service A<br/>Software System]
    B[Service B<br/>Software System]
    A -->|Sends email notifications| B`;
            const result = parser.parse(input);
            assert.strictEqual(result.relationships[0].label, 'Sends email notifications');
        });

        it('handles a diagram with many elements (stress test)', () => {
            const elementLines = [];
            for (let i = 0; i < 50; i++) {
                elementLines.push(`    Svc${i}[Service ${i}<br/>Software System]`);
            }
            const relLines = [];
            for (let i = 0; i < 49; i++) {
                relLines.push(`    Svc${i} -->|Calls| Svc${i + 1}`);
            }
            const input = `graph TB\n${elementLines.join('\n')}\n${relLines.join('\n')}`;
            const result = parser.parse(input);
            assert.strictEqual(result.elements.length, 50);
            assert.strictEqual(result.relationships.length, 49);
        });
    });

    // =========================================================================
    // ParseResult structure validation
    // =========================================================================

    describe('ParseResult structure', () => {
        it('has all required fields in the result', () => {
            const input = `%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    System[Banking System<br/>Software System]
    User -->|Uses| System`;
            const result = parser.parse(input);
            assert.ok('viewType' in result);
            assert.ok('elements' in result);
            assert.ok('relationships' in result);
            assert.ok(Array.isArray(result.elements));
            assert.ok(Array.isArray(result.relationships));
        });

        it('elements have required fields (type, id, label, elementType, tags)', () => {
            const input = 'graph TB\n    User[User<br/>Person]';
            const result = parser.parse(input);
            const element = result.elements[0];
            assert.strictEqual(element.type, 'element');
            assert.ok(typeof element.id === 'string');
            assert.ok(typeof element.label === 'string');
            assert.ok(typeof element.elementType === 'string');
            assert.ok(Array.isArray(element.tags));
        });

        it('relationships have required fields (type, from, to, arrow, label)', () => {
            const input = `graph TB
    A[A<br/>Person]
    B[B<br/>Software System]
    A -->|Uses| B`;
            const result = parser.parse(input);
            const rel = result.relationships[0];
            assert.strictEqual(rel.type, 'relationship');
            assert.ok(typeof rel.from === 'string');
            assert.ok(typeof rel.to === 'string');
            assert.ok(typeof rel.arrow === 'string');
            assert.ok(typeof rel.label === 'string');
        });
    });
});
