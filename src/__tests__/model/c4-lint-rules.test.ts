/**
 * C4X notation lint — one positive and one negative fixture per rule (#214),
 * plus the edges each rule's documentation promises.
 *
 * Fixtures are C4X source run through the real parser and model builder, so a
 * finding's range is the range the editor will underline.
 */
import * as assert from 'assert';
import { LINT_RULES, crossesProcessBoundary, lintModel, type LintFinding, type LintRuleId } from '../../model/lint';
import type { C4Element, C4Model } from '../../model/C4Model';
import { modelFromC4X } from './lint-fixtures';

function lint(source: string): LintFinding[] {
    return lintModel(modelFromC4X(source));
}

function findingsFor(source: string, ruleId: LintRuleId): LintFinding[] {
    return lint(source).filter(finding => finding.ruleId === ruleId);
}

function targets(findings: LintFinding[]): string[] {
    return findings.map(finding => `${finding.target.kind}:${finding.target.id}`);
}

function view(type: string, body: string): string {
    return `%%{ c4: ${type} }%%\ngraph TB\n${body}`;
}

describe('C4X lint rules', () => {
    describe('C4X-L001 container and component have a description', () => {
        it('reports a container with no description, on the line that declares it', () => {
            const findings = findingsFor(view('container', '    Container(api, "API", "Node.js")'), 'C4X-L001');

            assert.deepStrictEqual(targets(findings), ['element:api']);
            assert.strictEqual(findings[0].range?.start.line, 3);
            assert.match(findings[0].message, /Container "API" \(api\) has no description/);
            assert.match(findings[0].hint, /Container\(api, "API", "Node\.js", "Description"\)/);
        });

        it('passes a container and a component that describe themselves', () => {
            const source = view('component', [
                '    Container(api, "API", "Node.js", "Serves the JSON API")',
                '    Component(auth, "Auth", "Express middleware", "Checks tokens")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L001'), []);
        });

        it('keeps the suggested source parseable when a bracket-form label contains a double quote', () => {
            const findings = findingsFor(view('container', '    Web[The "new" Web App<br/>Container]'), 'C4X-L001');

            assert.match(findings[0].hint, /Container\(Web, "The 'new' Web App", "Technology", "Description"\)\.$/);
            assert.match(findingsFor(view('container', '    Web[The "new" Web App<br/>Container]'), 'C4X-L002')[0].hint,
                /Container\(Web, "The 'new' Web App", "Technology"\)\./);
        });

        it('treats a whitespace-only description as missing', () => {
            const findings = findingsFor(view('container', '    Container(api, "API", "Node.js", "   ")'), 'C4X-L001');
            assert.deepStrictEqual(targets(findings), ['element:api']);
        });

        it('checks components, database variants and bracket-form containers, which have no description slot', () => {
            const source = view('component', [
                '    Component(auth, "Auth", "Express middleware")',
                '    ContainerDb(db, "Database", "PostgreSQL")',
                '    Web[Web App<br/>Container<br/>React]',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L001');

            assert.deepStrictEqual(targets(findings), ['element:auth', 'element:db', 'element:Web']);
            assert.match(findings[1].hint, /^Describe its responsibility in the fourth argument: ContainerDb\(db,/);
            assert.match(findings[2].hint, /Container\(Web, "Web App", "Technology", "Description"\)/);
        });

        it('leaves people and software systems alone: their third argument is stored as technology', () => {
            const source = view('container', [
                '    Person(user, "User", "Platform user")',
                '    System_Ext(mail, "Mail", "Sends e-mail")',
                '    Container(api, "API", "Node.js", "Serves the JSON API")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L001'), []);
        });
    });

    describe('C4X-L002 container and component declare a technology', () => {
        it('reports a container with no technology', () => {
            const findings = findingsFor(view('container', '    Container(api, "API")'), 'C4X-L002');

            assert.deepStrictEqual(targets(findings), ['element:api']);
            assert.match(findings[0].message, /Container "API" \(api\) declares no technology/);
            assert.strictEqual(findings[0].hint, 'Name it in the third argument: Container(api, "API", "Technology").');
        });

        it('passes a container and a component that name their technology', () => {
            const source = view('component', [
                '    Container(api, "API", "Node.js")',
                '    Component(auth, "Auth", "Express middleware")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L002'), []);
        });

        it('keeps an existing description in the hint and treats an empty technology as missing', () => {
            const findings = findingsFor(view('container', '    Container(api, "API", "", "Serves the JSON API")'), 'C4X-L002');

            assert.deepStrictEqual(targets(findings), ['element:api']);
            assert.match(findings[0].hint, /Container\(api, "API", "Technology", "Serves the JSON API"\)\.$/);
        });

        it('explains that a bracket-form tag is not drawn as the technology', () => {
            const findings = findingsFor(view('container', '    Web[Web App<br/>Container<br/>React]'), 'C4X-L002');

            assert.deepStrictEqual(targets(findings), ['element:Web']);
            assert.match(findings[0].hint, /A tag such as "React" is not drawn as the element's technology\./);
        });

        it('does not mistake a derived tag for a technology tag', () => {
            const findings = findingsFor(view('container', '    Container_Ext(partner, "Partner API")'), 'C4X-L002');

            assert.deepStrictEqual(targets(findings), ['element:partner']);
            assert.doesNotMatch(findings[0].hint, /A tag such as/);
            assert.match(findings[0].hint, /Container_Ext\(partner, "Partner API", "Technology"\)/);
        });

        it('leaves people and software systems alone', () => {
            const source = view('container', [
                '    Person(user, "User")',
                '    System_Ext(mail, "Mail")',
                '    Container(api, "API", "Node.js")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L002'), []);
        });
    });

    describe('C4X-L003 relationship has a label', () => {
        const elements = [
            '    Container(web, "Web", "React", "Browser UI")',
            '    Container(api, "API", "Node.js", "JSON API")',
        ].join('\n');

        it('reports an unlabelled arrow on the line that draws it', () => {
            const findings = findingsFor(view('container', `${elements}\n    web -.-> api`), 'C4X-L003');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.strictEqual(findings[0].range?.start.line, 5);
            assert.strictEqual(findings[0].message, 'Relationship web -.-> api has no label.');
            assert.match(findings[0].hint, /web -\.->\|<intent>\| api\.$/);
        });

        it('passes a labelled arrow', () => {
            const source = view('container', `${elements}\n    web -->|Makes API calls to| "JSON/HTTPS" api`);
            assert.deepStrictEqual(findingsFor(source, 'C4X-L003'), []);
        });

        it('treats a blank label as missing, whatever the arrow', () => {
            const findings = findingsFor(view('container', `${elements}\n    web ==>|   | "HTTPS" api`), 'C4X-L003');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.match(findings[0].message, /web ==> api/);
        });
    });

    describe('C4X-L004 relationship across a process boundary declares a technology', () => {
        it('reports a container-to-container relationship without a protocol', () => {
            const source = view('container', [
                '    Container(web, "Web", "React", "Browser UI")',
                '    Container(api, "API", "Node.js", "JSON API")',
                '    web -->|Makes API calls to| api',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L004');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.match(findings[0].message, /crosses a process boundary \(Container to Container\)/);
            assert.match(findings[0].hint, /web -->\|Makes API calls to\| "<protocol>" api\.$/);
        });

        it('passes the same relationship once it names the protocol', () => {
            const source = view('container', [
                '    Container(web, "Web", "React", "Browser UI")',
                '    Container(api, "API", "Node.js", "JSON API")',
                '    web -->|Makes API calls to| "JSON/HTTPS" api',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L004'), []);
        });

        it('checks components talking to containers and systems, but not to each other', () => {
            const source = view('component', [
                '    Container(spa, "SPA", "Angular", "Browser UI")',
                '    Container_Boundary(api, "API Application") {',
                '        Component(signin, "Sign-in Controller", "Spring MVC", "Signs users in")',
                '        Component(security, "Security Component", "Spring Bean", "Checks passwords")',
                '    }',
                '    ContainerDb(db, "Database", "Oracle", "Stores credentials")',
                '    System_Ext(mainframe, "Mainframe", "Core banking")',
                '    spa -->|Signs in using| signin',
                '    signin -->|Uses| security',
                '    security -->|Reads from| db',
                '    security -->|Checks with| mainframe',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L004');

            assert.deepStrictEqual(
                findings.map(finding => finding.message.replace(/ but declares.*/, '')),
                [
                    'Relationship spa --> signin crosses a process boundary (Container to Component)',
                    'Relationship security --> db crosses a process boundary (Component to Container)',
                    'Relationship security --> mainframe crosses a process boundary (Component to Software System)',
                ],
            );
        });

        it('leaves relationships with a person alone, and uses <intent> when the label is missing too', () => {
            const source = view('container', [
                '    Person(user, "User")',
                '    Container(web, "Web", "React", "Browser UI")',
                '    Container(api, "API", "Node.js", "JSON API")',
                '    user -->|Uses| web',
                '    web --> user',
                '    web --> api',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L004');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-2']);
            assert.match(findings[0].hint, /web -->\|<intent>\| "<protocol>" api\.$/);
        });

        it('classifies process boundaries conservatively', () => {
            const element = (id: string, type: C4Element['type']): C4Element => ({ id, label: id, type });
            const cases: Array<[C4Element, C4Element, boolean]> = [
                [element('a', 'Container'), element('b', 'Container'), true],
                [element('a', 'Container'), element('s', 'SoftwareSystem'), true],
                [element('s', 'SoftwareSystem'), element('t', 'SoftwareSystem'), true],
                [element('c', 'Component'), element('a', 'Container'), true],
                [element('c', 'Component'), element('s', 'SoftwareSystem'), true],
                [element('c', 'Component'), element('d', 'Component'), false],
                [element('p', 'Person'), element('a', 'Container'), false],
                [element('a', 'Container'), element('p', 'Person'), false],
                [element('n', 'DeploymentNode'), element('a', 'Container'), false],
                [element('a', 'Container'), element('a', 'Container'), false],
            ];
            for (const [from, to, expected] of cases) {
                assert.strictEqual(crossesProcessBoundary(from, to), expected, `${from.type} ${from.id} -> ${to.type} ${to.id}`);
            }
        });

        it('skips a relationship whose endpoint is not in the view', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [{ id: 'web', label: 'Web', type: 'Container', technology: 'React', description: 'UI' }],
                    relationships: [{ id: 'rel-0', from: 'web', to: 'ghost', label: 'Calls', relType: 'uses' }],
                }],
            };

            assert.deepStrictEqual(lintModel(model).filter(finding => finding.ruleId === 'C4X-L004'), []);
        });
    });

    describe('C4X-L005 software system outside the scope is marked external', () => {
        it('reports a plain software system beside the containers of a container view', () => {
            const source = view('container', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(api, "API", "Java", "JSON API")',
                '    }',
                '    System(mainframe, "Mainframe Banking System", "Core banking")',
                '    SystemDb(ledger, "Ledger", "Stores postings")',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L005');

            assert.deepStrictEqual(targets(findings), ['element:mainframe', 'element:ledger']);
            assert.match(findings[0].message, /is outside the system this container view decomposes, but is not marked external/);
            assert.match(findings[0].hint, /^Declare it as System_Ext\(mainframe, "Mainframe Banking System", \.\.\.\)/);
            assert.match(findings[1].hint, /^Declare it as SystemDb_Ext\(ledger,/);
        });

        it('passes software systems marked external by type, bracket tag or $tags', () => {
            const source = view('container', [
                '    Container(api, "API", "Java", "JSON API")',
                '    System_Ext(mainframe, "Mainframe", "Core banking")',
                '    Mail[E-mail System<br/>Software System<br/>External]',
                '    System(crm, "CRM", "Customer records", $tags="External")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L005'), []);
        });

        it('reports a plain software system in a component view that decomposes a container', () => {
            const source = view('component', [
                '    Component(signin, "Sign-in Controller", "Spring MVC", "Signs users in")',
                '    System(mainframe, "Mainframe", "Core banking")',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L005')), ['element:mainframe']);
            assert.match(findingsFor(source, 'C4X-L005')[0].message, /this component view decomposes/);
        });

        it('stays silent when the view does not evidently decompose a system', () => {
            const onlySystems = view('container', '    System(a, "A")\n    System(b, "B")');
            const onlyExternalContainers = view('container', '    Container_Ext(x, "X", "Go", "Partner")\n    System(a, "A")');
            const containersInAComponentView = view('component', '    Container(x, "X", "Go", "Does X")\n    System(a, "A")');

            assert.deepStrictEqual(findingsFor(onlySystems, 'C4X-L005'), []);
            assert.deepStrictEqual(findingsFor(onlyExternalContainers, 'C4X-L005'), []);
            assert.deepStrictEqual(findingsFor(containersInAComponentView, 'C4X-L005'), []);
        });

        it('never flags people, and treats a system drawn around children as the scope itself', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [
                        { id: 'user', label: 'User', type: 'Person' },
                        {
                            id: 'bank', label: 'Bank', type: 'SoftwareSystem',
                            children: [{ id: 'api', label: 'API', type: 'Container', technology: 'Java', description: 'API' }],
                        },
                    ],
                    relationships: [],
                }],
            };

            assert.deepStrictEqual(lintModel(model).filter(finding => finding.ruleId === 'C4X-L005'), []);
        });
    });

    describe('C4X-L006 element and relationship are legal at the view level', () => {
        // The probe the MCP validator passes as "Syntax is VALID": a C1 view with a
        // component at the root, a system nothing connects to, and two unlabelled arrows.
        const probe = view('system-context', [
            '    Person(customer, "Customer", "A customer of the bank")',
            '    System(banking, "Internet Banking System", "Lets customers manage accounts")',
            '    Component(signin, "Sign-in Controller", "Spring MVC", "Signs customers in")',
            '    System(ledger, "Ledger", "Left over from an earlier draft")',
            '    customer --> banking',
            '    banking --> signin',
        ].join('\n'));

        it('reports the validator-clean probe: one level violation, two unlabelled arrows, one disconnected system', () => {
            const findings = lint(probe);

            assert.deepStrictEqual(
                findings.map(finding => `${finding.ruleId} ${finding.target.kind}:${finding.target.id}`),
                [
                    'C4X-L006 element:signin',
                    'C4X-L102 element:ledger',
                    'C4X-L003 relationship:rel-0',
                    'C4X-L003 relationship:rel-1',
                ],
            );
            const legality = findings[0];
            assert.strictEqual(
                legality.message,
                '"Sign-in Controller" (signin): Component cannot be placed in the diagram root in a C1 logical view.',
            );
            assert.strictEqual(
                legality.hint,
                'Allowed here in this view: Person, Person_Ext, System, System_Ext, Enterprise_Boundary. '
                    + 'Component belongs in component (C3) views: move it to one, or change its type. '
                    + 'If this view is not a system context view, declare its level on the first line, '
                    + 'e.g. %%{ c4: component }%%.',
            );
            assert.strictEqual(legality.range?.start.line, 5);
        });

        it('passes a system context view made of people and software systems', () => {
            const source = view('system-context', [
                '    Person(customer, "Customer")',
                '    Enterprise_Boundary(bank, "Big Bank") {',
                '        System(banking, "Internet Banking System")',
                '    }',
                '    System_Ext(mail, "E-mail System")',
                '    customer -->|Views balances using| banking',
                '    banking -->|Sends e-mail using| mail',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L006'), []);
        });

        it('treats a missing enclosing boundary at the root as implicit, not illegal', () => {
            const c2 = view('container', '    Container(api, "API", "Java", "JSON API")\n    System_Boundary(bank, "Bank") {\n    }');
            const c3 = view('component', [
                '    Container(spa, "SPA", "Angular", "Browser UI")',
                '    Container_Boundary(api, "API Application") {',
                '        Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '    }',
                '    Component(loose, "Loose", "Spring Bean", "Also in the API")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(c2, 'C4X-L006'), []);
            assert.deepStrictEqual(findingsFor(c3, 'C4X-L006'), []);
        });

        it('judges every placement inside an explicit boundary or node', () => {
            const source = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Person(clerk, "Clerk")',
                '        Component(loose, "Loose", "Spring Bean", "Skips its container")',
                '        Container_Boundary(api, "API Application") {',
                '            Container(inner, "Inner", "Java", "A container inside a container")',
                '        }',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L006');

            assert.deepStrictEqual(
                findings.map(finding => finding.message),
                [
                    '"Clerk" (clerk): Person cannot be placed in a System Boundary in a C3 logical view.',
                    '"Loose" (loose): Component cannot be placed in a System Boundary in a C3 logical view.',
                    '"Inner" (inner): Container cannot be placed in a Container Boundary in a C3 logical view.',
                ],
            );
            assert.match(findings[1].hint, /^Allowed here in this view: Container, Container_Ext, Container_Boundary\. Move it into a boundary/);
        });

        it('says so when a boundary may hold nothing at this level', () => {
            const source = view('container', [
                '    Container_Boundary(api, "API Application") {',
                '        Component(auth, "Auth", "Spring Bean", "Checks tokens")',
                '    }',
            ].join('\n'));
            const member = findingsFor(source, 'C4X-L006').find(finding => finding.target.id === 'auth');

            assert.strictEqual(member?.message, '"Auth" (auth): Component cannot be placed in a Container Boundary in a C2 logical view.');
            assert.strictEqual(
                member?.hint,
                'Nothing may be placed here in this view. Component belongs in component (C3) views: move it to one, or change its type.',
            );
        });

        it('judges typed boundaries by where they sit, found from their source ranges', () => {
            const source = view('component', [
                '    Enterprise_Boundary(org, "Big Bank") {',
                '        Container_Boundary(api, "API Application") {',
                '            Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '        }',
                '    }',
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(web, "Web Application") {',
                '            Component(home, "Home", "Spring MVC", "Home page")',
                '        }',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L006');

            assert.deepStrictEqual(targets(findings), ['boundary:api-application-boundary-1']);
            assert.strictEqual(
                findings[0].message,
                'Boundary "API Application": Container Boundary cannot be placed in an Enterprise Boundary in a C3 logical view.',
            );
            assert.strictEqual(findings[0].range?.start.line, 4);
        });

        it('reports a boundary the level has no place for, and a deployment node in a logical view', () => {
            const source = view('system-context', [
                '    System_Boundary(bank, "Internet Banking") {',
                '    }',
                '    Node(server, "Server", "Linux") {',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L006');

            assert.deepStrictEqual(targets(findings), ['boundary:internet-banking-boundary-0', 'element:server']);
            assert.match(findings[0].hint, /System_Boundary belongs in container \(C2\) or component \(C3\) views/);
            assert.match(findings[1].hint, /Node belongs in deployment views/);
        });

        it('judges members of an untyped subgraph only on whether the level allows their type at all', () => {
            const source = view('container', [
                '    subgraph Backend {',
                '        Container(api, "API", "Java", "JSON API")',
                '        Component(auth, "Auth", "Spring Bean", "Checks tokens")',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L006');

            assert.deepStrictEqual(targets(findings), ['element:auth']);
            assert.strictEqual(findings[0].message, '"Auth" (auth): Component cannot be placed anywhere in a container (C2) view.');
            assert.strictEqual(findings[0].hint, 'Component belongs in component (C3) views: move it to one, or change its type.');
        });

        it('passes a valid deployment view: nodes holding containers and system instances, people at the root', () => {
            const source = view('deployment', [
                '    Node(aws, "AWS", "Cloud") {',
                '        Node(ecs, "ECS", "Fargate") {',
                '            Container(api, "API", "Java", "JSON API")',
                '        }',
                '        Node(vm, "Partner VM", "Linux") {',
                '            System_Ext(partner, "Partner Gateway", "Third-party system instance")',
                '            System(billing, "Billing", "Our billing system instance")',
                '        }',
                '    }',
                '    Person(dev, "Developer")',
                '    Container(loose, "Loose", "Go", "Not deployed anywhere")',
                '    dev -->|Deploys| api',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L006'), []);
        });

        it('still reports what a deployment view has no place for', () => {
            const source = view('deployment', [
                '    System(loose, "Loose System", "Not deployed to a node")',
                '    Node(server, "Server", "Linux") {',
                '        Person(operator, "Operator")',
                '        Component(auth, "Auth", "Spring Bean", "Checks tokens")',
                '    }',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L006')), ['element:loose', 'element:operator', 'element:auth']);
            assert.doesNotMatch(findingsFor(source, 'C4X-L006')[0].hint, /declare its level/);
        });

        it('suggests the missing view declaration when a view without one reads as system context', () => {
            const source = 'graph TB\n    Container(api, "API", "Java", "JSON API")\n    Container(db, "DB", "PostgreSQL", "Stores data")';
            const findings = findingsFor(source, 'C4X-L006');

            assert.deepStrictEqual(targets(findings), ['element:api', 'element:db']);
            assert.match(findings[0].hint, /declare its level on the first line, e\.g\. %%\{ c4: container \}%%\.$/);
        });

        it('reports a relationship between a deployment node and a logical element', () => {
            const source = view('container', [
                '    Container(api, "API", "Java", "JSON API")',
                '    Node(server, "Server", "Linux") {',
                '    }',
                '    api -->|Runs on| "SSH" server',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L006').filter(finding => finding.target.kind === 'relationship');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.strictEqual(
                findings[0].message,
                'Relationship api --> server: Deployment Nodes cannot be connected directly to logical-view elements.',
            );
        });

        it('recovers no boundary nesting without source ranges, and still reports level violations', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [{ id: 'api', label: 'API', type: 'Container', technology: 'Java', description: 'API' }],
                    relationships: [{ id: 'rel-0', from: 'api', to: 'ghost', label: 'Calls', relType: 'uses' }],
                    boundaries: [
                        { id: 'bank', label: 'Bank', boundaryType: 'System_Boundary', elements: ['api'] },
                        { id: 'inner', label: 'Inner', boundaryType: 'Container_Boundary', elements: [] },
                        { id: 'group', label: 'Group', elements: [] },
                    ],
                }],
            };
            const findings = lintModel(model).filter(finding => finding.ruleId === 'C4X-L006');

            assert.deepStrictEqual(targets(findings), ['boundary:inner']);
            assert.strictEqual(findings[0].message, 'Boundary "Inner": Container_Boundary cannot be placed anywhere in a container (C2) view.');
        });

        it('does not run on dynamic views, which the nesting rules do not cover', () => {
            const source = view('dynamic', '    Component(auth, "Auth", "Spring Bean", "Checks tokens")\n    Node(n, "N", "Linux") {\n    }');
            assert.deepStrictEqual(findingsFor(source, 'C4X-L006'), []);
        });
    });

    describe('C4X-L008 relationship label says more than one word', () => {
        const elements = [
            '    Container(web, "Web", "React", "Browser UI")',
            '    Container(api, "API", "Node.js", "JSON API")',
        ].join('\n');

        it('reports a one-word label', () => {
            const findings = findingsFor(view('container', `${elements}\n    web -->| Uses | "HTTPS" api`), 'C4X-L008');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.strictEqual(findings[0].message, 'Relationship web --> api is labelled with the single word "Uses".');
        });

        it('does not count a label in a script written without spaces as one word', () => {
            const source = view('container', [
                elements,
                '    web -->|注文を送信する| "HTTPS" api',
                '    api -->|ส่งคำสั่งซื้อ| "HTTPS" web',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L008'), []);
        });

        it('passes a phrase, and leaves an unlabelled arrow to C4X-L003', () => {
            const phrase = view('container', `${elements}\n    web -->|Makes API calls to| "HTTPS" api`);
            const unlabelled = view('container', `${elements}\n    web --> "HTTPS" api`);

            assert.deepStrictEqual(findingsFor(phrase, 'C4X-L008'), []);
            assert.deepStrictEqual(findingsFor(unlabelled, 'C4X-L008'), []);
            assert.deepStrictEqual(targets(findingsFor(unlabelled, 'C4X-L003')), ['relationship:rel-0']);
        });
    });

    describe('C4X-L102 element is connected to the rest of the view', () => {
        it('reports an element no relationship touches', () => {
            const source = view('container', [
                '    Container(web, "Web", "React", "Browser UI")',
                '    Container(api, "API", "Node.js", "JSON API")',
                '    Container(batch, "Batch", "Go", "Nightly job")',
                '    web -->|Makes API calls to| "HTTPS" api',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L102');

            assert.deepStrictEqual(targets(findings), ['element:batch']);
            assert.strictEqual(findings[0].message, 'Container "Batch" (batch) has no relationship in this view.');
        });

        it('passes a view where every element is an endpoint, either end', () => {
            const source = view('container', [
                '    Person(user, "User")',
                '    Container(web, "Web", "React", "Browser UI")',
                '    user -->|Browses| web',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L102'), []);
        });

        it('never reports deployment nodes, and counts a nested child\'s relationship as its parent\'s', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [
                        { id: 'server', label: 'Server', type: 'DeploymentNode' },
                        {
                            id: 'bank', label: 'Bank', type: 'SoftwareSystem', tags: ['External'],
                            children: [{ id: 'api', label: 'API', type: 'Container', technology: 'Java', description: 'API' }],
                        },
                        { id: 'user', label: 'User', type: 'Person' },
                    ],
                    relationships: [{ id: 'rel-0', from: 'user', to: 'api', label: 'Calls the API', relType: 'uses' }],
                }],
            };

            assert.deepStrictEqual(lintModel(model).filter(finding => finding.ruleId === 'C4X-L102'), []);
        });
    });

    describe('levels', () => {
        // Between them, these two break every rule at every level where the rule runs. One
        // fixture cannot: C4X-L105 is silent on a view C4X-L006 reports for its level, by design.
        const everythingBroken = [
            '    Person(user, "User")',
            '    Container(web, "Web")',
            '    Container(api, "API")',
            '    Component(auth, "Auth")',
            '    System(other, "Other")',
            '    System(lonely, "Lonely")',
            '    System(twin, "lonely")',
            '    Container_Boundary(left, "Left") {',
            '        Component(l1, "L1")',
            '    }',
            '    Container_Boundary(right, "Right") {',
            '        Component(r1, "R1")',
            '    }',
            '    Node(server, "Server", "Linux") {',
            '        Node(vm, "VM", "Linux") {',
            '        }',
            '    }',
            '    web --> api',
            '    api -->|Calls| other',
            '    user -->|Uses| web',
            '    l1 -->|Calls across| r1',
            '    vm -->|Runs on| server',
        ].join('\n');
        // Also a part wired to its whole that C4X-L006 accepts at C1 to C3: an enterprise
        // drawn both as its boundary and as a box (C4X-L106 defers to L006 elsewhere).
        const levelOnly = [
            '    Person(user, "User", "A customer")',
            '    System(bank, "Bank", "Holds accounts")',
            '    user -->|Views balances using| bank',
            '    Enterprise_Boundary(org, "Big Bank") {',
            '        Person(staff, "Staff", "Works at the bank")',
            '    }',
            '    System(org, "Big Bank", "The enterprise as a box")',
            '    staff -->|Is employed by| org',
        ].join('\n');

        for (const type of ['system-context', 'container', 'component', 'dynamic', 'deployment'] as const) {
            it(`runs exactly the rules whose catalogue entry lists ${type}`, () => {
                const fired = new Set([everythingBroken, levelOnly].flatMap(body => lint(view(type, body)).map(finding => finding.ruleId)));
                const expected = LINT_RULES.filter(rule => rule.levels.includes(type)).map(rule => rule.id);

                assert.deepStrictEqual([...fired].sort(), [...expected].sort());
            });
        }

        it('runs no rule on a view type C4X does not recognise', () => {
            assert.deepStrictEqual(lint(view('system-landscape', everythingBroken)), []);
        });

        it('lints a file without a view directive as a system context view', () => {
            const withoutDirective = lint(`graph TB\n${everythingBroken}`).map(finding => finding.ruleId);
            const asSystemContext = lint(view('system-context', everythingBroken)).map(finding => finding.ruleId);

            assert.deepStrictEqual(withoutDirective, asSystemContext);
        });
    });
});
