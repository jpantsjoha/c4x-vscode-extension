/** Field-level checks for #242: positional forms, a big-bank-shaped workspace, multi-string tags. */
import * as assert from 'assert';
import { StructurizrLexer } from '../../parser/structurizr/Lexer';
import { StructurizrParser } from '../../parser/structurizr/Parser';
import { ElementNode, WorkspaceNode } from '../../parser/structurizr/ast';

function ast(src: string): WorkspaceNode {
    return new StructurizrParser(new StructurizrLexer(src).tokenize()).parse();
}
function flat(n: ElementNode[] | undefined): ElementNode[] {
    return (n ?? []).flatMap(e => [e, ...flat(e.children)]);
}
function pick(w: WorkspaceNode, name: string): ElementNode {
    const e = flat(w.model?.elements).find(x => x.name === name);
    assert.ok(e, `element ${name}`);
    return e;
}

describe('Structurizr field-level parsing (#242)', () => {
    it('positional forms populate name, description, technology and tags', () => {
        const w = ast(`workspace "W" { model {
            u = person "User" "A customer" "Customer"
            s = softwareSystem "Sys" "Core" "External"
            c = container "API" "Serves" "Node.js" "Web,Edge"
            k = component "Ctl" "Routes" "Express" "Ctrl"
        } }`);
        const f = (n: string) => { const e = pick(w, n); return [e.description, e.technology, e.tags]; };
        assert.deepStrictEqual(f('User'), ['A customer', undefined, ['Customer']]);
        assert.deepStrictEqual(f('Sys'), ['Core', undefined, ['External']]);
        assert.deepStrictEqual(f('API'), ['Serves', 'Node.js', ['Web', 'Edge']]);
        assert.deepStrictEqual(f('Ctl'), ['Routes', 'Express', ['Ctrl']]);
    });

    it('positional relationship fields', () => {
        const w = ast(`workspace "W" { model { u = person "U" s = softwareSystem "S" u -> s "Uses" "HTTPS" "Async,Sync" } }`);
        const r = w.model!.relationships[0];
        assert.strictEqual(r.source, 'u');
        assert.strictEqual(r.destination, 's');
        assert.strictEqual(r.description, 'Uses');
        assert.strictEqual(r.technology, 'HTTPS');
        assert.deepStrictEqual(r.tags, ['Async', 'Sync']);
    });

    it('tags "a" "b" "c" collects every string', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { tags "a" "b" "c" } } }`);
        assert.deepStrictEqual(pick(w, 'S').tags, ['a', 'b', 'c']);
    });

    it('big-bank-shaped workspace keeps field values', () => {
        const w = ast(`workspace "Big Bank" {
    model {
        customer = person "Customer" "A bank customer." "Customer"
        group "Bank" {
            ibs = softwareSystem "Internet Banking" "Online banking." {
                spa = container "SPA" "Banking UI." "Angular" "Web Browser"
                api = container "API" "JSON API." "Spring MVC" {
                    sign = component "Sign In" "Signs in." "REST Controller"
                }
            }
        }
        customer -> ibs "Uses" "HTTPS"
        deploymentEnvironment "Live" { deploymentNode "N" { containerInstance spa } }
    }
    views { systemContext ibs "Ctx" { include * } styles { element "Person" { shape Person } } container ibs "Cont" { include * } }
}`);
        assert.strictEqual(flat(w.model?.elements).length, 5);
        assert.deepStrictEqual([pick(w, 'SPA').description, pick(w, 'SPA').technology, pick(w, 'SPA').tags],
            ['Banking UI.', 'Angular', ['Web Browser']]);
        assert.strictEqual(pick(w, 'Sign In').technology, 'REST Controller');
        assert.strictEqual(w.model!.relationships[0].technology, 'HTTPS');
        assert.strictEqual(w.views?.views.length, 2);
    });

    it('block-form technology keyword is kept on person and softwareSystem, as on main', () => {
        const w = ast(`workspace "W" { model {
            u = person "U" { description "d" technology "Browser" }
            s = softwareSystem "S" { description "x" technology "t" }
        } }`);
        assert.strictEqual(pick(w, 'U').technology, 'Browser');
        assert.strictEqual(pick(w, 'U').description, 'd');
        assert.strictEqual(pick(w, 'S').technology, 't');
        assert.strictEqual(pick(w, 'S').description, 'x');
    });
});
