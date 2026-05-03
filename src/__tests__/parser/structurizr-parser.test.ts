import * as assert from 'assert';
import { StructurizrLexer } from '../../parser/structurizr/Lexer';
import { StructurizrParser } from '../../parser/structurizr/Parser';
import { StructurizrParserError, WorkspaceNode } from '../../parser/structurizr/ast';
import { TokenType } from '../../parser/structurizr/tokens';

/**
 * Helper: lex + parse in one step (returns AST)
 */
function parse(source: string): WorkspaceNode {
    const lexer = new StructurizrLexer(source);
    const tokens = lexer.tokenize();
    const parser = new StructurizrParser(tokens);
    return parser.parse();
}

describe('StructurizrParser', () => {

    // =========================================================================
    // Workspace parsing
    // =========================================================================

    describe('workspace', () => {
        it('parses a minimal workspace with name', () => {
            const ast = parse('workspace "My System" {\n}');
            assert.strictEqual(ast.type, 'workspace');
            assert.strictEqual(ast.name, 'My System');
        });

        it('parses workspace with name and description', () => {
            const ast = parse('workspace "My System" "A description" {\n}');
            assert.strictEqual(ast.name, 'My System');
            assert.strictEqual(ast.description, 'A description');
        });

        it('has location information', () => {
            const ast = parse('workspace "Test" {\n}');
            assert.ok(ast.location);
            assert.strictEqual(ast.location.line, 1);
        });
    });

    // =========================================================================
    // Model block parsing
    // =========================================================================

    describe('model', () => {
        it('parses an empty model block', () => {
            const ast = parse(`workspace "Test" {
    model {
    }
}`);
            assert.ok(ast.model);
            assert.strictEqual(ast.model!.elements.length, 0);
            assert.strictEqual(ast.model!.relationships.length, 0);
        });

        it('parses person element without assignment', () => {
            const ast = parse(`workspace "Test" {
    model {
        person "User"
    }
}`);
            assert.ok(ast.model);
            assert.strictEqual(ast.model!.elements.length, 1);
            assert.strictEqual(ast.model!.elements[0].elementType, 'person');
            assert.strictEqual(ast.model!.elements[0].name, 'User');
        });

        it('parses person element with assignment (id = person "Name")', () => {
            const ast = parse(`workspace "Test" {
    model {
        user = person "User"
    }
}`);
            assert.ok(ast.model);
            const element = ast.model!.elements[0];
            assert.strictEqual(element.identifier, 'user');
            assert.strictEqual(element.name, 'User');
            assert.strictEqual(element.elementType, 'person');
        });

        it('parses softwareSystem element', () => {
            const ast = parse(`workspace "Test" {
    model {
        system = softwareSystem "Banking System"
    }
}`);
            const element = ast.model!.elements[0];
            assert.strictEqual(element.elementType, 'softwareSystem');
            assert.strictEqual(element.name, 'Banking System');
        });

        it('parses element with body (description and technology)', () => {
            const ast = parse(`workspace "Test" {
    model {
        web = container "Web App" {
            "The main web application"
            "React"
        }
    }
}`);
            const element = ast.model!.elements[0];
            assert.strictEqual(element.name, 'Web App');
            assert.strictEqual(element.description, 'The main web application');
            assert.strictEqual(element.technology, 'React');
        });

        it('parses nested elements (softwareSystem with containers)', () => {
            const ast = parse(`workspace "Test" {
    model {
        system = softwareSystem "System" {
            web = container "Web App"
            api = container "API"
        }
    }
}`);
            const system = ast.model!.elements[0];
            assert.ok(system.children, 'System should have children');
            assert.strictEqual(system.children!.length, 2);
            assert.strictEqual(system.children![0].identifier, 'web');
            assert.strictEqual(system.children![1].identifier, 'api');
        });

        it('parses relationships in model', () => {
            const ast = parse(`workspace "Test" {
    model {
        user = person "User"
        system = softwareSystem "System"
        user -> system "Uses"
    }
}`);
            assert.ok(ast.model);
            assert.strictEqual(ast.model!.relationships.length, 1);
            const rel = ast.model!.relationships[0];
            assert.strictEqual(rel.source, 'user');
            assert.strictEqual(rel.destination, 'system');
            assert.strictEqual(rel.description, 'Uses');
        });

        it('parses relationship with technology', () => {
            const ast = parse(`workspace "Test" {
    model {
        user = person "User"
        system = softwareSystem "System"
        user -> system "Uses" "HTTPS"
    }
}`);
            const rel = ast.model!.relationships[0];
            assert.strictEqual(rel.description, 'Uses');
            assert.strictEqual(rel.technology, 'HTTPS');
        });

        it('parses multiple elements and relationships', () => {
            const ast = parse(`workspace "Test" {
    model {
        user = person "User"
        web = softwareSystem "Web App"
        api = softwareSystem "API Server"
        db = softwareSystem "Database"
        user -> web "Uses"
        web -> api "Calls"
        api -> db "Reads from"
    }
}`);
            assert.strictEqual(ast.model!.elements.length, 4);
            assert.strictEqual(ast.model!.relationships.length, 3);
        });
    });

    // =========================================================================
    // Views block parsing
    // =========================================================================

    describe('views', () => {
        it('parses an empty views block', () => {
            const ast = parse(`workspace "Test" {
    model {
    }
    views {
    }
}`);
            assert.ok(ast.views);
            assert.strictEqual(ast.views!.views.length, 0);
        });

        it('parses systemContext view', () => {
            const ast = parse(`workspace "Test" {
    model {
        sys = softwareSystem "System"
    }
    views {
        systemContext sys "Context" {
            include *
        }
    }
}`);
            assert.ok(ast.views);
            assert.strictEqual(ast.views!.views.length, 1);
            const view = ast.views!.views[0];
            assert.strictEqual(view.viewType, 'systemContext');
            assert.strictEqual(view.scope, 'sys');
            assert.deepStrictEqual(view.include, ['*']);
        });

        it('parses containerView', () => {
            const ast = parse(`workspace "Test" {
    model {
        sys = softwareSystem "System"
    }
    views {
        containerView sys "ContainerView" {
            include *
        }
    }
}`);
            const view = ast.views!.views[0];
            assert.strictEqual(view.viewType, 'container');
        });

        it('parses view with autoLayout', () => {
            const ast = parse(`workspace "Test" {
    model {
        sys = softwareSystem "System"
    }
    views {
        systemContext sys "Context" {
            include *
            autoLayout lr
        }
    }
}`);
            const view = ast.views!.views[0];
            assert.ok(view.autoLayout);
            assert.strictEqual(view.autoLayout!.direction, 'lr');
        });

        it('parses view with exclude', () => {
            const ast = parse(`workspace "Test" {
    model {
        sys = softwareSystem "System"
    }
    views {
        systemContext sys "Context" {
            include *
            exclude db
        }
    }
}`);
            const view = ast.views!.views[0];
            assert.deepStrictEqual(view.exclude, ['db']);
        });
    });

    // =========================================================================
    // Styles block parsing
    // =========================================================================

    describe('styles', () => {
        it('parses element styles', () => {
            const ast = parse(`workspace "Test" {
    model {
    }
    views {
        styles {
            element "Person" {
                background #08427B
                color #ffffff
                shape Person
            }
        }
    }
}`);
            assert.ok(ast.views);
            // Styles are inside views in Structurizr, but our parser puts them at workspace level or views level
            // Check the actual structure
        });

        it('parses relationship styles', () => {
            const ast = parse(`workspace "Test" {
    model {
    }
    styles {
        relationship "Relationship" {
            color #707070
            thickness 2
        }
    }
}`);
            assert.ok(ast.styles);
            assert.strictEqual(ast.styles!.relationshipStyles.length, 1);
            const relStyle = ast.styles!.relationshipStyles[0];
            assert.strictEqual(relStyle.tag, 'Relationship');
            assert.strictEqual(relStyle.color, '#707070');
            assert.strictEqual(relStyle.thickness, 2);
        });
    });

    // =========================================================================
    // Error handling
    // =========================================================================

    describe('error handling', () => {
        it('throws StructurizrParserError when workspace keyword is missing', () => {
            assert.throws(() => parse('model {\n}'), StructurizrParserError);
        });

        it('throws StructurizrParserError when workspace name is missing', () => {
            assert.throws(() => parse('workspace {\n}'), StructurizrParserError);
        });

        it('error includes location information', () => {
            try {
                parse('workspace {\n}');
                assert.fail('Expected StructurizrParserError');
            } catch (error) {
                assert.ok(error instanceof StructurizrParserError);
                assert.ok(error.location);
                assert.ok(typeof error.location.line === 'number');
            }
        });
    });

    // =========================================================================
    // Full pipeline test
    // =========================================================================

    describe('full pipeline (parseStructurizrDSL)', () => {
        it('converts a complete workspace to C4Model', () => {
            const { parseStructurizrDSL } = require('../../parser/structurizr/index');
            const source = `workspace "Banking System" {
    model {
        user = person "Customer"
        system = softwareSystem "Internet Banking" {
            web = container "Web Application"
            api = container "API Application"
        }
        user -> web "Uses"
        web -> api "Calls"
    }
    views {
        systemContext system "SystemContext" {
            include *
            autoLayout tb
        }
    }
}`;
            const model = parseStructurizrDSL(source);
            assert.strictEqual(model.workspace, 'Banking System');
            assert.ok(model.views.length > 0);

            const view = model.views[0];
            assert.strictEqual(view.type, 'system-context');
            assert.ok(view.elements.length > 0);
        });
    });
});
