/**
 * Issue #242, review round 1: unassigned positional declarations, brace-balanced
 * skipping, errors for unplaceable tokens, nested styles, and a realistic
 * big-bank-shaped workspace.
 */
import * as assert from 'assert';
import { parseStructurizrDSL } from '../../parser/structurizr/index';
import { StructurizrLexer } from '../../parser/structurizr/Lexer';
import { StructurizrParser } from '../../parser/structurizr/Parser';
import { ElementNode, StructurizrParserError, WorkspaceNode } from '../../parser/structurizr/ast';

function ast(source: string): WorkspaceNode {
    return new StructurizrParser(new StructurizrLexer(source).tokenize()).parse();
}
function flat(nodes: ElementNode[] | undefined): ElementNode[] {
    return (nodes ?? []).flatMap(n => [n, ...flat(n.children)]);
}
function throwsAt(src: string, line: number): void {
    assert.throws(() => parseStructurizrDSL(src), (e: unknown) =>
        e instanceof StructurizrParserError && e.location?.line === line);
}

describe('Structurizr unassigned positional declarations (#242 round 1)', () => {
    const cases: Array<[string, string, string | undefined, string | undefined, string[] | undefined]> = [
        ['person "User" "A customer" "Customer"', 'User', 'A customer', undefined, ['Customer']],
        ['softwareSystem "Sys" "Core" "External"', 'Sys', 'Core', undefined, ['External']],
        ['softwareSystem "S" { container "API" "Serves" "Node.js" "Web,Edge" }', 'API', 'Serves', 'Node.js', ['Web', 'Edge']],
        ['softwareSystem "S" { container "C" { component "Ctl" "Routes" "Express" "Ctrl" } }', 'Ctl', 'Routes', 'Express', ['Ctrl']],
    ];
    for (const [decl, name, description, technology, tags] of cases) {
        it(`${decl.slice(0, 40)}`, () => {
            const w = ast(`workspace "W" { model { ${decl} } }`);
            const el = flat(w.model?.elements).find(e => e.name === name);
            assert.ok(el, `element named ${name}`);
            assert.strictEqual(el.description, description);
            assert.strictEqual(el.technology, technology);
            assert.deepStrictEqual(el.tags, tags);
        });
    }
});

describe('Structurizr lost sections and unplaceable tokens (#242 round 1)', () => {
    it('views block inside a softwareSystem body is recovered, not lost', () => {
        const m = parseStructurizrDSL(`workspace "W" {\n model {\n  s = softwareSystem "S" {\n   views { systemContext s "C" { include * } }\n  }\n }\n}`);
        assert.strictEqual(m.views.length, 1);
    });
    it('a missing closing brace reports a line and column', () => {
        assert.throws(() => parseStructurizrDSL(`workspace "W" {\n model {\n  s = softwareSystem "S"\n views { systemContext s "C" { include * } }\n}`),
            (e: unknown) => e instanceof StructurizrParserError && e.location?.line === 5 && e.location?.column === 2);
    });
    it('an extra closing brace reports a line and column', () => {
        assert.throws(() => parseStructurizrDSL(`workspace "W" {\n model {\n  s = softwareSystem "S"\n }\n }\n views { systemContext s "C" { include * } }\n}`),
            (e: unknown) => e instanceof StructurizrParserError && e.location?.line === 6 && e.location?.column === 2);
    });
    it('garbage tokens after an element are ignored, as on main, and the model still renders', () => {
        const m = parseStructurizrDSL(`workspace "W" {\n model {\n  s = softwareSystem "S" garbage "ignored"\n }\n views { systemContext s "C" { include * } }\n}`);
        assert.strictEqual(m.views.length, 1);
    });
    it('an unknown identifier in an element body is ignored, as on main', () => {
        const m = parseStructurizrDSL(`workspace "W" {\n model {\n  s = softwareSystem "S" {\n   bogus\n  }\n }\n views { systemContext s "C" { include * } }\n}`);
        assert.strictEqual(m.views.length, 1);
    });
    it('missing closing braces at end of input are an error', () => {
        throwsAt(`workspace "W" {\n model {\n  deploymentEnvironment "Live" {\n   deploymentNode "n" {\n }\n}`, 6);
    });
});

describe('Structurizr styles nested in views (#242 round 1)', () => {
    const styles = `styles { element "Person" { background #08427b shape Person } }`;
    const ctx = (key: string) => `systemContext s "${key}" { include * }`;
    const wrap = (views: string) =>
        `workspace "W" { model { s = softwareSystem "S" } views { ${views} } }`;

    it('keeps views before and after nested styles', () => {
        const m = parseStructurizrDSL(wrap(`${ctx('C1')} ${styles} ${ctx('C2')}`));
        assert.strictEqual(m.views.length, 2);
    });
    it('keeps views when styles come first', () => {
        const m = parseStructurizrDSL(wrap(`${styles} ${ctx('C1')}`));
        assert.strictEqual(m.views.length, 1);
    });
    it('skips other view kinds without ending the views block', () => {
        const m = parseStructurizrDSL(wrap(
            `${ctx('C1')} deployment s "Live" "LiveDeployment" { include * animation { s } autoLayout } ${ctx('C2')}`));
        assert.strictEqual(m.views.length, 2);
    });
});

describe('Structurizr valid blocks the parser does not model (#242 round 1)', () => {
    const tail = `views { systemContext s "C" { include * } }`;
    it('group before views', () => {
        const w = ast(`workspace "W" { model { group "G" { a = person "A" s = softwareSystem "S" } } ${tail} }`);
        assert.strictEqual(flat(w.model?.elements).length, 2);
        assert.strictEqual(w.views?.views.length, 1);
    });
    it('perspectives inside an element body', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { perspectives { "Security" "Fine" } } } ${tail} }`);
        assert.strictEqual(w.views?.views.length, 1);
    });
    it('nested deployment blocks and directives', () => {
        const w = ast(`workspace "W" {\n !identifiers hierarchical\n model {\n s = softwareSystem "S"\n deploymentEnvironment "Live" {\n n = deploymentNode "N" {\n deploymentNode "M" { containerInstance s }\n }\n }\n }\n ${tail} }`);
        assert.strictEqual(w.views?.views.length, 1);
    });
});

describe('Structurizr big-bank-shaped workspace (#242 round 1)', () => {
    const src = `workspace "Big Bank plc" "Example." {
    !identifiers flat
    model {
        customer = person "Personal Banking Customer" "A customer of the bank." "Customer"
        group "Big Bank plc" {
            mainframe = softwareSystem "Mainframe Banking System" "Core data." "Existing System"
            email = softwareSystem "E-mail System" "Exchange." "Existing System"
            ibs = softwareSystem "Internet Banking System" "Lets customers bank online." {
                spa = container "Single-Page Application" "Banking UI." "JavaScript and Angular" "Web Browser"
                api = container "API Application" "JSON/HTTPS API." "Java and Spring MVC" {
                    sign = component "Sign In Controller" "Allows sign in." "Spring MVC Rest Controller"
                    perspectives {
                        "Security" "HTTPS only."
                    }
                }
                db = container "Database" "Stores data." "Oracle" "Database"
            }
        }
        customer -> ibs "Views balances using"
        ibs -> mainframe "Gets account information from"
        deploymentEnvironment "Live" {
            deploymentNode "Customer's computer" "" "Windows" {
                deploymentNode "Web Browser" "" "Chrome" {
                    spaInstance = containerInstance spa
                }
            }
        }
    }
    views {
        systemContext ibs "SystemContext" {
            include *
            autoLayout
        }
        container ibs "Containers" {
            include *
            autoLayout
        }
        component api "Components" {
            include *
        }
        styles {
            element "Person" {
                background #08427b
                shape Person
            }
            element "Database" {
                shape Cylinder
            }
        }
        deployment ibs "Live" "LiveDeployment" {
            include *
        }
    }
}`;
    it('returns every modelled element and view', () => {
        const w = ast(src);
        assert.strictEqual(flat(w.model?.elements).length, 8);
        const model = parseStructurizrDSL(src);
        assert.ok(model.views.length >= 2);
        assert.strictEqual(w.views?.views.length, 3);
    });
});
