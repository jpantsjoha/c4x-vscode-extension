/**
 * C4X notation lint — the coherence rules (#215): one positive and one negative
 * fixture per rule, the edges each rule's documentation promises, and the proof
 * that the coherence rules and the `c4Legality` checks (C4X-L006) are disjoint.
 *
 * Fixtures are C4X source run through the real parser and model builder.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { lintModel, type LintFinding, type LintRuleId } from '../../model/lint';
import type { C4Model } from '../../model/C4Model';
import { modelFromC4X } from './lint-fixtures';

const COHERENCE_RULES: readonly LintRuleId[] = ['C4X-L101', 'C4X-L103', 'C4X-L104', 'C4X-L105', 'C4X-L106'];

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

describe('C4X lint coherence rules', () => {
    describe('C4X-L101 component view decomposes exactly one container', () => {
        it('reports every Container_Boundary after the first, on its own line', () => {
            const source = view('component', [
                '    Container_Boundary(api, "API Application") {',
                '        Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '    }',
                '    Container_Boundary(web, "Web Application") {',
                '        Component(home, "Home", "Spring MVC", "Home page")',
                '    }',
                '    Container_Boundary(batch, "Batch") {',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L101');

            assert.deepStrictEqual(targets(findings), ['boundary:web-application-boundary-1', 'boundary:batch-boundary-2']);
            assert.strictEqual(findings[0].range?.start.line, 6);
            assert.strictEqual(
                findings[0].message,
                'This component view decomposes 3 containers ("API Application", "Web Application", "Batch"); '
                    + 'a component view zooms into one container.',
            );
            assert.match(findings[0].hint, /^Keep "API Application" as the container in scope: draw "Web Application" as a Container box/);
        });

        it('passes a view with one Container_Boundary, and boxes for the containers around it', () => {
            const source = view('component', [
                '    Container(spa, "Single-Page App", "Angular", "Browser UI")',
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(api, "API Application") {',
                '            Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '        }',
                '    }',
                '    spa -->|Signs in using| "JSON/HTTPS" signin',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L101'), []);
        });

        it('reports a view that draws components without saying which container they belong to', () => {
            const loose = findingsFor(view('component', '    Component(signin, "Sign-in", "Spring MVC", "Signs in")'), 'C4X-L101');

            assert.deepStrictEqual(targets(loose), ['view:component']);
            assert.ok(!('range' in loose[0]), 'the model keeps no range for a view');
            assert.match(loose[0].hint, /^Wrap the components of the container in scope in Container_Boundary/);
        });

        it('names an untyped subgraph around the components as the likely container', () => {
            const source = view('component', [
                '    subgraph ApiContainer {',
                '        Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L101');

            assert.deepStrictEqual(targets(findings), ['view:component']);
            assert.strictEqual(
                findings[0].hint,
                'If subgraph ApiContainer is the container in scope, declare it as one: Container_Boundary(<alias>, "ApiContainer") { ... }.',
            );
        });

        it('leaves a component view with only external components, or none, to the other rules', () => {
            const external = view('component', '    Component_Ext(sso, "SSO", "Keycloak", "Signs people in")');
            const none = view('component', '    Container(api, "API", "Java", "JSON API")');

            assert.deepStrictEqual(findingsFor(external, 'C4X-L101'), []);
            assert.deepStrictEqual(findingsFor(none, 'C4X-L101'), []);
            assert.deepStrictEqual(targets(findingsFor(none, 'C4X-L105')), ['view:component']);
        });

        it('does not count a Container_Boundary that C4X-L006 reports', () => {
            const source = view('component', [
                '    Enterprise_Boundary(org, "Big Bank") {',
                '        Container_Boundary(misplaced, "Misplaced") {',
                '            Component(a, "A", "Go", "Does A")',
                '        }',
                '    }',
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(api, "API Application") {',
                '            Component(b, "B", "Go", "Does B")',
                '        }',
                '    }',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L006')), ['boundary:misplaced-boundary-1']);
            assert.deepStrictEqual(findingsFor(source, 'C4X-L101'), []);
        });

        it('only runs on component views', () => {
            const source = view('dynamic', '    Component(signin, "Sign-in", "Spring MVC", "Signs in")');
            assert.deepStrictEqual(findingsFor(source, 'C4X-L101'), []);
        });
    });

    describe('C4X-L103 relationship does not reach into another container', () => {
        const twoContainers = (rel: string) => view('component', [
            '    Person(user, "User")',
            '    Container_Boundary(api, "API Application") {',
            '        Component(signin, "Sign-in", "Spring MVC", "Signs in")',
            '        subgraph Security {',
            '            Component(security, "Security", "Spring Bean", "Checks passwords")',
            '        }',
            '    }',
            '    Container_Boundary(mail, "E-mail Service") {',
            '        Component(sender, "Sender", "JavaMail", "Sends e-mail")',
            '    }',
            rel,
        ].join('\n'));

        it('reports a component reaching a component inside a different Container_Boundary, in either direction', () => {
            const forward = findingsFor(twoContainers('    signin -->|Sends e-mail using| sender'), 'C4X-L103');
            const backward = findingsFor(twoContainers('    sender -.->|Reports bounces to| signin'), 'C4X-L103');

            assert.deepStrictEqual(targets(forward), ['relationship:rel-0']);
            assert.strictEqual(forward[0].range?.start.line, 13);
            assert.strictEqual(
                forward[0].message,
                'Relationship signin --> sender reaches from a component of "API Application" into "E-mail Service", '
                    + 'a different container\'s boundary.',
            );
            assert.match(forward[0].hint, /^Point it at the container instead: draw "E-mail Service" as a Container box/);
            assert.deepStrictEqual(targets(backward), ['relationship:rel-0']);
        });

        it('finds a component\'s container through an untyped subgraph inside it', () => {
            const findings = findingsFor(twoContainers('    security -->|Sends lock-outs using| sender'), 'C4X-L103');
            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
        });

        it('passes relationships inside one container, and from a person or box to a component', () => {
            assert.deepStrictEqual(findingsFor(twoContainers('    signin -->|Checks passwords with| security'), 'C4X-L103'), []);
            assert.deepStrictEqual(findingsFor(twoContainers('    user -->|Signs in using| signin'), 'C4X-L103'), []);
        });

        it('judges only Container_Boundaries C4X-L006 accepts', () => {
            const source = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(api, "API Application") {',
                '            Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '        }',
                '        Container_Boundary(mail, "E-mail Service") {',
                '            Component(sender, "Sender", "JavaMail", "Sends e-mail")',
                '        }',
                '    }',
                '    Enterprise_Boundary(org, "Big Bank") {',
                '        Container_Boundary(audit, "Audit") {',
                '            Component(log, "Log", "Go", "Keeps the audit log")',
                '        }',
                '    }',
                '    signin -->|Sends e-mail using| sender',
                '    signin -->|Writes the audit log with| log',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L006')), ['boundary:audit-boundary-4']);
            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L103')), ['relationship:rel-0']);
        });

        it('finds a component\'s container through every level of nesting, innermost first', () => {
            const source = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(api, "API Application") {',
                '            subgraph Security {',
                '                Component(security, "Security", "Spring Bean", "Checks passwords")',
                '            }',
                '        }',
                '        Container_Boundary(mail, "E-mail Service") {',
                '            Component(sender, "Sender", "JavaMail", "Sends e-mail")',
                '        }',
                '    }',
                '    security -->|Sends lock-outs using| sender',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L103');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.match(findings[0].message, /from a component of "API Application" into "E-mail Service"/);
        });

        it('does not judge a component whose container the view does not state', () => {
            const source = view('component', [
                '    Container_Boundary(api, "API Application") {',
                '        Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '    }',
                '    Container_Boundary(mail, "E-mail Service") {',
                '    }',
                '    Component(loose, "Loose", "Go", "Somewhere")',
                '    signin -->|Hands work to| loose',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L103'), []);
        });

        it('recovers no nesting without source ranges, and judges direct membership only', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'component',
                    elements: [
                        { id: 'a', label: 'A', type: 'Component', technology: 'Go', description: 'A' },
                        { id: 'b', label: 'B', type: 'Component', technology: 'Go', description: 'B' },
                        { id: 'c', label: 'C', type: 'Component', technology: 'Go', description: 'C' },
                    ],
                    relationships: [
                        { id: 'ab', from: 'a', to: 'b', label: 'Calls across', relType: 'uses' },
                        { id: 'ac', from: 'a', to: 'c', label: 'Calls a nested one', relType: 'uses' },
                    ],
                    boundaries: [
                        { id: 'one', label: 'One', boundaryType: 'Container_Boundary', elements: ['a'] },
                        { id: 'two', label: 'Two', boundaryType: 'Container_Boundary', elements: ['b'] },
                        { id: 'group', label: 'Group', elements: ['c'] },
                    ],
                }],
            };
            const findings = lintModel(model).filter(finding => finding.ruleId === 'C4X-L103');

            assert.deepStrictEqual(targets(findings), ['relationship:ab']);
        });
    });

    describe('C4X-L104 element names are unique within a boundary', () => {
        it('reports each later element with a name already used in the same boundary, ignoring case and spacing', () => {
            const source = view('container', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(api, "API Application", "Java", "JSON API")',
                '        Container(mobile, "api  application", "Go", "Mobile API")',
                '        Container(third, " API Application ", "Go", "Third API")',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L104');

            assert.deepStrictEqual(targets(findings), ['element:mobile', 'element:third']);
            assert.strictEqual(findings[0].range?.start.line, 5);
            assert.strictEqual(
                findings[0].message,
                'Container "api  application" (mobile) has the same name as Container "API Application" (api) '
                    + 'in boundary "Internet Banking".',
            );
        });

        it('compares across element types at the diagram root, in a subgraph, and inside a deployment node of a dynamic view', () => {
            const root = findingsFor(view('container', [
                '    System_Ext(payments, "Payments", "Card processor")',
                '    Container(payments_api, "Payments", "Go", "Takes card payments")',
            ].join('\n')), 'C4X-L104');
            const subgraph = findingsFor(view('container', [
                '    subgraph Backend {',
                '        Container(a, "Worker", "Go", "Does work")',
                '        Container(b, "Worker", "Go", "Does more work")',
                '    }',
            ].join('\n')), 'C4X-L104');
            const node = findingsFor(view('dynamic', [
                '    Node(server, "Server", "Linux") {',
                '        Node(a, "Worker", "Linux") {',
                '        }',
                '        Node(b, "Worker", "Linux") {',
                '        }',
                '    }',
            ].join('\n')), 'C4X-L104');

            assert.deepStrictEqual(targets(root), ['element:payments_api']);
            assert.match(root[0].message, /at the diagram root\.$/);
            assert.deepStrictEqual(targets(subgraph), ['element:b']);
            assert.match(subgraph[0].message, /in subgraph "Backend"\.$/);
            assert.deepStrictEqual(targets(node), ['element:b']);
            assert.match(node[0].message, /in "Server"\.$/);
        });

        it('leaves elements C4X-L006 reports to it, and does not compare them', () => {
            const nodes = view('container', [
                '    Node(server, "Server", "Linux") {',
                '        Node(a, "Worker", "Linux") {',
                '        }',
                '        Node(b, "Worker", "Linux") {',
                '        }',
                '    }',
            ].join('\n'));
            const components = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Component(a, "Auth", "Spring", "Checks tokens")',
                '        Component(b, "Auth", "Spring", "Checks tokens")',
                '    }',
            ].join('\n'));
            const misplacedFirst = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Component(a, "API", "Spring", "Misplaced")',
                '        Container(b, "API", "Java", "JSON API")',
                '    }',
            ].join('\n'));

            for (const source of [nodes, components]) {
                assert.ok(findingsFor(source, 'C4X-L006').length > 0);
                assert.deepStrictEqual(findingsFor(source, 'C4X-L104'), []);
            }
            assert.deepStrictEqual(targets(findingsFor(misplacedFirst, 'C4X-L006')), ['element:a']);
            assert.deepStrictEqual(findingsFor(misplacedFirst, 'C4X-L104'), []);
        });

        it('passes the same name in two different boundaries', () => {
            const source = view('container', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(bankdb, "Database", "PostgreSQL", "Accounts")',
                '    }',
                '    System_Boundary(crm, "CRM") {',
                '        Container(crmdb, "Database", "MySQL", "Contacts")',
                '    }',
                '    Container(rootdb, "Database", "SQLite", "Cache")',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L104'), []);
        });

        it('does not run on deployment views, where one container is deployed many times under one name', () => {
            const source = view('deployment', [
                '    Node(aws, "AWS", "Cloud") {',
                '        Container(api1, "API", "Java", "JSON API")',
                '        Container(api2, "API", "Java", "JSON API")',
                '    }',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L104'), []);
        });
    });

    describe('C4X-L105 declared view level matches the elements drawn', () => {
        const contextOnly = [
            '    Person(customer, "Customer", "A customer")',
            '    System(bank, "Internet Banking", "Manages accounts")',
            '    customer -->|Views balances using| bank',
        ].join('\n');

        it('reports a container view without a container, naming the level its elements belong to', () => {
            const findings = findingsFor(view('container', contextOnly), 'C4X-L105');

            assert.deepStrictEqual(targets(findings), ['view:container']);
            assert.strictEqual(
                findings[0].message,
                'This view is declared as a container view but draws no container: its most detailed elements belong in a system-context view.',
            );
            assert.strictEqual(
                findings[0].hint,
                'Declare %%{ c4: system-context }%% on the first line, or add the containers this view is meant to show.',
            );
        });

        it('reports a component view without a component, even inside a declared boundary', () => {
            const source = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(api, "API", "Java", "JSON API")',
                '        Container_Boundary(web, "Web") {',
                '        }',
                '    }',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L105');

            assert.deepStrictEqual(targets(findings), ['view:component']);
            assert.match(findings[0].message, /belong in a container view\.$/);
        });

        it('passes views that reach their level, an empty view, and the levels it does not check', () => {
            assert.deepStrictEqual(findingsFor(view('container', `${contextOnly}\n    Container(api, "API", "Java", "JSON API")`), 'C4X-L105'), []);
            assert.deepStrictEqual(findingsFor(view('component', '    Component(a, "A", "Go", "Does A")'), 'C4X-L105'), []);
            assert.deepStrictEqual(findingsFor(view('container', ''), 'C4X-L105'), []);
            for (const type of ['system-context', 'dynamic', 'deployment']) {
                assert.deepStrictEqual(findingsFor(view(type, contextOnly), 'C4X-L105'), [], type);
            }
        });

        it('stays silent where C4X-L006 reports the view, so a too-detailed element is reported once', () => {
            const tooDetailed = view('container', `${contextOnly}\n    Component(auth, "Auth", "Spring", "Checks tokens")`);
            const misplaced = view('container', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Person(clerk, "Clerk")',
                '    }',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(tooDetailed, 'C4X-L006')), ['element:auth']);
            assert.deepStrictEqual(findingsFor(tooDetailed, 'C4X-L105'), []);
            assert.deepStrictEqual(targets(findingsFor(misplaced, 'C4X-L006')), ['element:clerk']);
            assert.deepStrictEqual(findingsFor(misplaced, 'C4X-L105'), []);
        });
    });

    describe('C4X-L106 relationship does not join a part to its whole', () => {
        const scopeDrawnTwice = (rel: string) => view('component', [
            '    System_Boundary(bank, "Internet Banking") {',
            '        Container_Boundary(api, "API Application") {',
            '            Component(signin, "Sign-in", "Spring MVC", "Signs in")',
            '        }',
            '    }',
            '    System(bank, "Internet Banking", "Manages accounts")',
            '    Container(api, "API Application", "Java", "JSON API")',
            '    System_Ext(mainframe, "Mainframe", "Core banking")',
            rel,
        ].join('\n'));

        it('reports a component connected to the system whose boundary contains it, either direction', () => {
            const findings = findingsFor(scopeDrawnTwice('    signin -->|Reads records from| "JDBC" bank'), 'C4X-L106');
            const reversed = findingsFor(scopeDrawnTwice('    bank -->|Calls| "JDBC" signin'), 'C4X-L106');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.strictEqual(
                findings[0].message,
                'Relationship signin --> bank connects Component "Sign-in" (signin) to Software System "Internet Banking" (bank), '
                    + 'whose boundary contains it: a component and the software system it belongs to are two levels of one thing.',
            );
            assert.strictEqual(
                findings[0].hint,
                'Point it at the element outside "Internet Banking" that "Sign-in" actually uses, or remove it; '
                    + 'draw "Internet Banking" once, as the boundary.',
            );
            assert.deepStrictEqual(targets(reversed), ['relationship:rel-0']);
        });

        it('reports a component connected to its own container drawn as a box', () => {
            const findings = findingsFor(scopeDrawnTwice('    signin -->|Runs inside| "in-process" api'), 'C4X-L106');
            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.match(findings[0].message, /to Container "API Application" \(api\), whose boundary contains it/);
        });

        it('reports a deployment node connected to the node that contains it', () => {
            const source = view('deployment', [
                '    Node(aws, "AWS", "Cloud") {',
                '        Node(ecs, "ECS", "Fargate") {',
                '            Node(task, "Task", "Fargate task") {',
                '            }',
                '        }',
                '    }',
                '    task -->|Is scheduled by| aws',
            ].join('\n'));
            const findings = findingsFor(source, 'C4X-L106');

            assert.deepStrictEqual(targets(findings), ['relationship:rel-0']);
            assert.match(findings[0].message, /Deployment Node "Task" \(task\) to Deployment Node "AWS" \(aws\), which contains it: a deployment node and the deployment node/);
            assert.doesNotMatch(findings[0].hint, /as the boundary/);
        });

        it('passes a component connected to a system outside its boundary, and siblings', () => {
            assert.deepStrictEqual(findingsFor(scopeDrawnTwice('    signin -->|Reads records from| "XML/HTTPS" mainframe'), 'C4X-L106'), []);
            const siblings = view('deployment', [
                '    Node(aws, "AWS", "Cloud") {',
                '        Node(a, "A", "VM") {',
                '        }',
                '        Node(b, "B", "VM") {',
                '        }',
                '    }',
                '    a -->|Replicates to| b',
            ].join('\n'));
            assert.deepStrictEqual(findingsFor(siblings, 'C4X-L106'), []);
        });

        it('never matches by name: a box named like the boundary is a different element', () => {
            const source = view('component', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container_Boundary(api, "API Application") {',
                '            Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '        }',
                '    }',
                '    System(ibs, "Internet Banking", "Manages accounts")',
                '    signin -->|Reads records from| "JDBC" ibs',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L106'), []);
        });

        it('reads containment from nested children in a model built without boundaries', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [{
                        id: 'bank', label: 'Bank', type: 'SoftwareSystem',
                        children: [{ id: 'api', label: 'API', type: 'Container', technology: 'Java', description: 'API' }],
                    }],
                    relationships: [{ id: 'r', from: 'api', to: 'bank', label: 'Belongs to', technology: 'none', relType: 'uses' }],
                }],
            };

            assert.deepStrictEqual(targets(lintModel(model).filter(finding => finding.ruleId === 'C4X-L106')), ['relationship:r']);
        });

        it('leaves a relationship to C4X-L006 when it reports the relationship or either end', () => {
            const nodesInContainerView = view('container', [
                '    Node(server, "Server", "Linux") {',
                '        Node(vm, "VM", "Linux") {',
                '        }',
                '    }',
                '    vm -->|Runs on| server',
            ].join('\n'));
            const containerInSystemContext = view('system-context', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(api, "API", "Java", "JSON API")',
                '    }',
                '    System(bank, "Internet Banking", "Manages accounts")',
                '    api -->|Belongs to| bank',
            ].join('\n'));

            for (const source of [nodesInContainerView, containerInSystemContext]) {
                assert.ok(findingsFor(source, 'C4X-L006').length > 0);
                assert.deepStrictEqual(findingsFor(source, 'C4X-L106'), []);
            }
        });

        it('leaves a deployment node wired to its own logical child to C4X-L006', () => {
            const source = view('deployment', [
                '    Node(server, "Server", "Linux") {',
                '        Container(api, "API", "Java", "JSON API")',
                '    }',
                '    api -->|Runs on| "SSH" server',
            ].join('\n'));

            assert.deepStrictEqual(targets(findingsFor(source, 'C4X-L006')), ['relationship:rel-0']);
            assert.deepStrictEqual(findingsFor(source, 'C4X-L106'), []);
        });
    });

    describe('disjoint from the c4Legality checks (C4X-L006)', () => {
        // One minimal model per kind of verdict c4Legality returns: a type the level allows
        // nowhere, a placement an explicit boundary or node rejects, a misplaced typed boundary,
        // and a deployment node wired to a logical element.
        const legalityViolations: Record<string, string> = {
            'component in a system context view': view('system-context', [
                '    System(bank, "Bank", "Accounts")',
                '    Component(signin, "Sign-in", "Spring", "Signs in")',
                '    bank -->|Signs in with| signin',
            ].join('\n')),
            'component in a container view': view('container', [
                '    Person(user, "User")',
                '    Component(signin, "Sign-in", "Spring", "Signs in")',
                '    user -->|Signs in with| "HTTPS" signin',
            ].join('\n')),
            'component in a System_Boundary': view('component', [
                '    System_Boundary(bank, "Bank") {',
                '        Component(signin, "Sign-in", "Spring", "Signs in")',
                '        Component(audit, "Audit", "Spring", "Logs")',
                '    }',
                '    signin -->|Logs to| audit',
            ].join('\n')),
            'component in an Enterprise_Boundary': view('component', [
                '    Enterprise_Boundary(org, "Org") {',
                '        Component(signin, "Sign-in", "Spring", "Signs in")',
                '    }',
            ].join('\n')),
            'container inside a Container_Boundary': view('component', [
                '    Container_Boundary(api, "API") {',
                '        Container(inner, "Inner", "Java", "Nested container")',
                '    }',
            ].join('\n')),
            'Container_Boundary in a container view': view('container', [
                '    Container_Boundary(api, "API") {',
                '    }',
                '    Container(web, "Web", "React", "UI")',
            ].join('\n')),
            'two Container_Boundaries inside Enterprise_Boundaries': view('component', [
                '    Enterprise_Boundary(org, "Org") {',
                '        Container_Boundary(a, "A") {',
                '            Component(ca, "CA", "Go", "Does A")',
                '        }',
                '        Container_Boundary(b, "B") {',
                '            Component(cb, "CB", "Go", "Does B")',
                '        }',
                '    }',
                '    ca -->|Calls| "gRPC" cb',
            ].join('\n')),
            'software system outside every node in a deployment view': view('deployment', [
                '    Node(server, "Server", "Linux") {',
                '        Node(vm, "VM", "Linux") {',
                '        }',
                '    }',
                '    System(bank, "Bank", "Accounts")',
                '    System(twin, "Bank", "Accounts")',
                '    bank -->|Runs on| vm',
            ].join('\n')),
            'two misplaced nodes with one name in a container view': view('container', [
                '    Node(server, "Server", "Linux") {',
                '        Node(a, "Worker", "Linux") {',
                '        }',
                '        Node(b, "Worker", "Linux") {',
                '        }',
                '    }',
                '    a -->|Replicates to| b',
                '    a -->|Runs on| server',
            ].join('\n')),
            'two misplaced components with one name in a System_Boundary': view('component', [
                '    System_Boundary(bank, "Bank") {',
                '        Component(a, "Auth", "Spring", "Checks tokens")',
                '        Component(b, "Auth", "Spring", "Checks tokens")',
                '    }',
                '    a -->|Delegates to| b',
            ].join('\n')),
            'a misplaced container wired to its own system in a system context view': view('system-context', [
                '    System_Boundary(bank, "Internet Banking") {',
                '        Container(api, "API", "Java", "JSON API")',
                '    }',
                '    System(bank, "Internet Banking", "Manages accounts")',
                '    api -->|Belongs to| bank',
            ].join('\n')),
            'deployment node wired to a logical element': view('container', [
                '    Container(api, "API", "Java", "JSON API")',
                '    Node(server, "Server", "Linux") {',
                '    }',
                '    api -->|Runs on| "SSH" server',
            ].join('\n')),
        };

        for (const [name, source] of Object.entries(legalityViolations)) {
            it(`reports "${name}" through C4X-L006 alone`, () => {
                const findings = lint(source);
                assert.ok(findings.some(finding => finding.ruleId === 'C4X-L006'), 'the fixture breaks a nesting rule');
                assert.deepStrictEqual(
                    findings.filter(finding => COHERENCE_RULES.includes(finding.ruleId)).map(finding => finding.ruleId),
                    [],
                );
            });
        }

        it('recovers three levels of boundary nesting, so a deep Container_Boundary is judged where it is', () => {
            const source = view('component', [
                '    Enterprise_Boundary(org, "Big Bank") {',
                '        System_Boundary(bank, "Internet Banking") {',
                '            Container_Boundary(api, "API Application") {',
                '                Component(signin, "Sign-in", "Spring MVC", "Signs in")',
                '            }',
                '        }',
                '    }',
                '    Person(customer, "Customer", "Banks online")',
                '    customer -->|Signs in using| signin',
            ].join('\n'));

            assert.deepStrictEqual(findingsFor(source, 'C4X-L006'), []);
            assert.deepStrictEqual(lint(source).filter(finding => COHERENCE_RULES.includes(finding.ruleId)), []);
        });

        it('every coherence finding in the documented examples is on a view C4X-L006 accepts', () => {
            const doc = fs.readFileSync(path.resolve(__dirname, '../../../docs/C4X-LINT-RULES.md'), 'utf8');
            const sections = doc.split(/^## (?=C4X-L1\d{2}\n)/m).slice(1);
            let reported = 0;
            for (const section of sections) {
                const ruleId = section.slice(0, 8) as LintRuleId;
                if (!COHERENCE_RULES.includes(ruleId)) {
                    continue;
                }
                for (const example of section.matchAll(/^Reported[^\n]*\n\n```c4x\n([\s\S]*?)\n```/gm)) {
                    const findings = lint(example[1]);
                    assert.ok(findings.some(finding => finding.ruleId === ruleId), ruleId);
                    assert.deepStrictEqual(findings.filter(finding => finding.ruleId === 'C4X-L006'), [], `${ruleId} example`);
                    reported++;
                }
            }
            assert.strictEqual(reported, COHERENCE_RULES.length);
        });

        // Exhaustive over single placements: every element and boundary type, in every scope,
        // at every level the nesting rules cover. Where C4X-L006 has a verdict, no coherence
        // rule may have one.
        const types = ['Person', 'Person_Ext', 'System', 'System_Ext', 'Container', 'Container_Ext',
            'Component', 'Component_Ext', 'Node', 'System_Boundary', 'Container_Boundary', 'Enterprise_Boundary'];
        const scopes: Record<string, [string, string]> = {
            'the root': ['', ''],
            'an Enterprise_Boundary': ['    Enterprise_Boundary(scope, "Scope") {', '    }'],
            'a System_Boundary': ['    System_Boundary(scope, "Scope") {', '    }'],
            'a Container_Boundary': ['    Container_Boundary(scope, "Scope") {', '    }'],
            'a deployment Node': ['    Node(scope, "Scope", "Linux") {', '    }'],
        };
        const declare = (type: string): string => {
            if (type.endsWith('_Boundary')) {
                return `        ${type}(probe, "Probe") {\n        }`;
            }
            if (type === 'Node') {
                return '        Node(probe, "Probe", "Linux") {\n        }';
            }
            return `        ${type}(probe, "Probe", "Tech", "Description")`;
        };

        for (const level of ['system-context', 'container', 'component', 'deployment']) {
            it(`never reports one placement twice at the ${level} level`, () => {
                let judged = 0;
                for (const [scopeName, [open, close]] of Object.entries(scopes)) {
                    for (const type of types) {
                        const body = [open, declare(type), close].filter(line => line.length > 0).join('\n');
                        const findings = lint(view(level, body));
                        if (!findings.some(finding => finding.ruleId === 'C4X-L006')) {
                            continue;
                        }
                        judged++;
                        const coherence = findings.filter(finding => COHERENCE_RULES.includes(finding.ruleId));
                        assert.deepStrictEqual(targets(coherence), [], `${type} in ${scopeName}`);
                    }
                }
                assert.ok(judged > 0, 'some placements break a nesting rule at every level');
            });
        }

        it('the coherence rules reach c4Legality only through C4X-L006, never by importing it', () => {
            const source = fs.readFileSync(path.resolve(__dirname, '../../model/lint/coherence.ts'), 'utf8');
            assert.doesNotMatch(source, /from '\.\.\/c4Legality'/);
            assert.match(source, /import \{ checkLegality \} from '\.\/legality';/);
        });
    });

    describe('shipped samples', () => {
        it('reports the coherence findings the sample corpus is known to carry, and no more', () => {
            // Recorded for #215. A change here is a change in what the rules see in real diagrams:
            // fix the sample, or explain the new count in the pull request.
            const counts: Record<string, number> = {};
            const walk = (dir: string): void => {
                for (const entry of fs.readdirSync(dir)) {
                    const full = path.join(dir, entry);
                    const texts = fs.statSync(full).isDirectory() ? (walk(full), [])
                        : entry.endsWith('.c4x') ? [fs.readFileSync(full, 'utf8')]
                            : entry.endsWith('.md') ? [...fs.readFileSync(full, 'utf8').matchAll(/```c4x\n([\s\S]*?)\n```/g)].map(match => match[1])
                                : [];
                    for (const text of texts) {
                        for (const finding of lint(text)) {
                            if (COHERENCE_RULES.includes(finding.ruleId)) {
                                counts[finding.ruleId] = (counts[finding.ruleId] ?? 0) + 1;
                            }
                        }
                    }
                }
            };
            walk(path.resolve(__dirname, '../../../samples'));

            assert.deepStrictEqual(counts, { 'C4X-L101': 8, 'C4X-L104': 2 });
        });
    });
});
