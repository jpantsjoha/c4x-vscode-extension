/**
 * Issue #242: positional description / technology / tags after the element
 * name, per the Structurizr DSL language reference:
 *   person         <name> [description] [tags]
 *   softwareSystem <name> [description] [tags]
 *   container      <name> [description] [technology] [tags]
 *   component      <name> [description] [technology] [tags]
 */
import * as assert from 'assert';
import { parseStructurizrDSL } from '../../parser/structurizr/index';
import { StructurizrParserError } from '../../parser/structurizr/ast';
import { StructurizrLexer } from '../../parser/structurizr/Lexer';
import { StructurizrParser } from '../../parser/structurizr/Parser';
import { ElementNode, WorkspaceNode } from '../../parser/structurizr/ast';

function ast(source: string): WorkspaceNode {
    return new StructurizrParser(new StructurizrLexer(source).tokenize()).parse();
}

function find(nodes: ElementNode[] | undefined, id: string): ElementNode {
    for (const n of nodes ?? []) {
        if (n.identifier === id) { return n; }
        const inner = n.children ? findOrUndef(n.children, id) : undefined;
        if (inner) { return inner; }
    }
    throw new Error(`no element ${id}`);
}
function findOrUndef(nodes: ElementNode[], id: string): ElementNode | undefined {
    try { return find(nodes, id); } catch { return undefined; }
}

const views = `
    views {
        containerView s "Containers" {
            include *
        }
    }`;

describe('Structurizr positional element arguments (#242)', () => {
    it('container: name description technology, with body (issue repro)', () => {
        const model = parseStructurizrDSL(`workspace "W" {
    model {
        s = softwareSystem "S" {
            api = container "API" "Serves" "Node.js" {
            }
        }
    }${views}
}`);
        assert.strictEqual(model.views.length, 1);
        const api = model.views[0].elements.find(e => e.id === 'api');
        assert.ok(api);
        assert.strictEqual(api.description, 'Serves');
        assert.strictEqual(api.technology, 'Node.js');
    });

    it('container: positional strings without a body', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { api = container "API" "Serves" "Node.js" } } ${views} }`);
        const api = find(w.model?.elements, 'api');
        assert.strictEqual(api.name, 'API');
        assert.strictEqual(api.description, 'Serves');
        assert.strictEqual(api.technology, 'Node.js');
        assert.strictEqual(w.views?.views.length, 1);
    });

    it('container: description, technology and tags', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { db = container "DB" "Stores" "Postgres" "Database,Storage" } } ${views} }`);
        const db = find(w.model?.elements, 'db');
        assert.strictEqual(db.technology, 'Postgres');
        assert.deepStrictEqual(db.tags, ['Database', 'Storage']);
        assert.strictEqual(w.views?.views.length, 1);
    });

    it('component: description and technology', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { c = container "C" { k = component "K" "Does it" "Spring" { } } } } ${views} }`);
        const k = find(w.model?.elements, 'k');
        assert.strictEqual(k.description, 'Does it');
        assert.strictEqual(k.technology, 'Spring');
        assert.strictEqual(w.views?.views.length, 1);
    });

    it('softwareSystem: description, then tags in the second slot (no technology)', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" "Core" "External,Legacy" } ${views} }`);
        const s = find(w.model?.elements, 's');
        assert.strictEqual(s.description, 'Core');
        assert.strictEqual(s.technology, undefined);
        assert.deepStrictEqual(s.tags, ['External', 'Legacy']);
        assert.strictEqual(w.views?.views.length, 1);
    });

    it('person: description and tags', () => {
        const w = ast(`workspace "W" { model { u = person "User" "A customer" "Customer" s = softwareSystem "S" } ${views} }`);
        const u = find(w.model?.elements, 'u');
        assert.strictEqual(u.description, 'A customer');
        assert.deepStrictEqual(u.tags, ['Customer']);
        assert.ok(find(w.model?.elements, 's'));
        assert.strictEqual(w.views?.views.length, 1);
    });

    it('person: name only still parses', () => {
        const w = ast(`workspace "W" { model { u = person "User" } }`);
        assert.strictEqual(find(w.model?.elements, 'u').description, undefined);
    });

    it('an empty positional description keeps the technology slot', () => {
        const w = ast(`workspace "W" { model { s = softwareSystem "S" { c = container "C" "" "Go" } } }`);
        const c = find(w.model?.elements, 'c');
        assert.strictEqual(c.description, undefined);
        assert.strictEqual(c.technology, 'Go');
    });

    it('a positional element followed by a string-identified relationship is not over-read', () => {
        const w = ast(`workspace "W" { model { a = softwareSystem "A" "d" b = softwareSystem "B" "e" a -> b "uses" } }`);
        assert.strictEqual(w.model?.elements.length, 2);
        assert.strictEqual(w.model?.relationships.length, 1);
    });

    describe('mixed positional and block form', () => {
        it('positional description with body technology keyword', () => {
            const w = ast(`workspace "W" { model { s = softwareSystem "S" { api = container "API" "Serves" { technology "Node.js" } } } }`);
            const api = find(w.model?.elements, 'api');
            assert.strictEqual(api.description, 'Serves');
            assert.strictEqual(api.technology, 'Node.js');
        });

        it('body description keyword overrides positional description', () => {
            const w = ast(`workspace "W" { model { s = softwareSystem "S" { api = container "API" "Old" "Node.js" { description "New" } } } }`);
            const api = find(w.model?.elements, 'api');
            assert.strictEqual(api.description, 'New');
            assert.strictEqual(api.technology, 'Node.js');
        });

        it('positional values with nested children and a following views block', () => {
            const SRC = `workspace "W" {
    model {
        s = softwareSystem "S" "Sys" {
            api = container "API" "Serves" "Node.js" {
                ctl = component "Ctl" "Routes" "Express"
            }
        }
    }${views}
}`;
            const model = parseStructurizrDSL(SRC);
            assert.strictEqual(model.views.length, 1);
            const ctl = find(ast(SRC).model?.elements, 'ctl');
            assert.strictEqual(ctl.description, 'Routes');
            assert.strictEqual(ctl.technology, 'Express');
        });
    });

    describe('errors instead of silent empty results', () => {
        it('surplus positional strings are ignored and the first slots are kept', () => {
            const w = ast(`workspace "W" { model { s = softwareSystem "S" { api = container "API" "a" "b" "c" "d" { } } } ${views} }`);
            const api = find(w.model?.elements, 'api');
            assert.strictEqual(api.description, 'a');
            assert.strictEqual(api.technology, 'b');
            assert.deepStrictEqual(api.tags, ['c']);
            assert.strictEqual(w.views?.views.length, 1);
        });

        it('views before a model whose element has surplus strings and a body still render', () => {
            const m = parseStructurizrDSL(`workspace "W" { views { systemContext s "C" { include * } } model { s = softwareSystem "S" "a" "b" "c" { } } }`);
            assert.strictEqual(m.views.length, 1);
        });

        it('a views block swallowed by a misplaced brace is an error, not zero views', () => {
            const src = `workspace "W" {\n model {\n  s = softwareSystem "S" {\n  }\n views {\n  systemContext s "C" {\n   include *\n  }\n }\n}`;
            assert.throws(() => parseStructurizrDSL(src), (e: unknown) =>
                e instanceof StructurizrParserError && typeof e.location?.line === 'number');
        });

        it('content after the workspace closing brace is an error', () => {
            const src = `workspace "W" {\n model {\n }\n}\nviews {\n}`;
            assert.throws(() => parseStructurizrDSL(src), (e: unknown) =>
                e instanceof StructurizrParserError && e.location?.line === 5);
        });
    });
});
