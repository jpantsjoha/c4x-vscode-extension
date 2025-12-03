/**
 * Structurizr DSL Parser Tests
 * Tests for AST building from token stream
 */

import * as assert from 'assert';
import {
    StructurizrLexer,
    StructurizrParser,
    StructurizrParserError,
    WorkspaceNode,
    ElementNode,
    RelationshipNode,
    ViewNode,
} from '../../../src/parser/structurizr';

describe('Structurizr Parser', () => {
    describe('Workspace Parsing', () => {
        it('should parse simple workspace', () => {
            const source = 'workspace "My Workspace" { }';
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            assert.strictEqual(ast.type, 'workspace');
            assert.strictEqual(ast.name, 'My Workspace');
        });

        it('should parse workspace with description', () => {
            const source = 'workspace "My Workspace" "This is my workspace" { }';
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            assert.strictEqual(ast.name, 'My Workspace');
            assert.strictEqual(ast.description, 'This is my workspace');
        });

        it('should parse workspace with model', () => {
            const source = `workspace "Test" {
                model {
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            assert.ok(ast.model);
            assert.strictEqual(ast.model.type, 'model');
        });

        it('should parse workspace with views', () => {
            const source = `workspace "Test" {
                views {
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            assert.ok(ast.views);
            assert.strictEqual(ast.views.type, 'views');
        });

        it('should parse workspace with styles', () => {
            const source = `workspace "Test" {
                styles {
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            assert.ok(ast.styles);
            assert.strictEqual(ast.styles.type, 'styles');
        });
    });

    describe('Element Parsing', () => {
        it('should parse person', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const elements = ast.model!.elements;
            assert.strictEqual(elements.length, 1);
            assert.strictEqual(elements[0].elementType, 'person');
            assert.strictEqual(elements[0].identifier, 'user');
            assert.strictEqual(elements[0].name, 'User');
        });

        it('should parse software system', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "My System"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const elements = ast.model!.elements;
            assert.strictEqual(elements.length, 1);
            assert.strictEqual(elements[0].elementType, 'softwareSystem');
            assert.strictEqual(elements[0].identifier, 'sys');
            assert.strictEqual(elements[0].name, 'My System');
        });

        it('should parse element with description', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User" {
                        "A user of the system"
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const element = ast.model!.elements[0];
            assert.strictEqual(element.description, 'A user of the system');
        });

        it('should parse element with description and technology', () => {
            const source = `workspace "Test" {
                model {
                    db = container "Database" {
                        "Stores data"
                        "PostgreSQL"
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const element = ast.model!.elements[0];
            assert.strictEqual(element.description, 'Stores data');
            assert.strictEqual(element.technology, 'PostgreSQL');
        });

        it('should parse nested elements (containers in system)', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "My System" {
                        web = container "Web App"
                        db = container "Database"
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const system = ast.model!.elements[0];
            assert.ok(system.children);
            assert.strictEqual(system.children!.length, 2);
            assert.strictEqual(system.children![0].identifier, 'web');
            assert.strictEqual(system.children![1].identifier, 'db');
        });

        it('should parse components in container', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web App" {
                        ctrl = component "Controller"
                        svc = component "Service"
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const container = ast.model!.elements[0];
            assert.ok(container.children);
            assert.strictEqual(container.children!.length, 2);
            assert.strictEqual(container.children![0].elementType, 'component');
        });
    });

    describe('Relationship Parsing', () => {
        it('should parse simple relationship', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys = softwareSystem "System"
                    user -> sys "Uses"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const rels = ast.model!.relationships;
            assert.strictEqual(rels.length, 1);
            assert.strictEqual(rels[0].source, 'user');
            assert.strictEqual(rels[0].destination, 'sys');
            assert.strictEqual(rels[0].description, 'Uses');
        });

        it('should parse relationship with technology', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web"
                    db = container "Database"
                    web -> db "Reads from" "JDBC"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const rel = ast.model!.relationships[0];
            assert.strictEqual(rel.description, 'Reads from');
            assert.strictEqual(rel.technology, 'JDBC');
        });

        it('should parse multiple relationships', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    web = container "Web"
                    api = container "API"

                    user -> web "Uses"
                    web -> api "Calls"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const rels = ast.model!.relationships;
            assert.strictEqual(rels.length, 2);
        });
    });

    describe('View Parsing', () => {
        it('should parse system context view', () => {
            const source = `workspace "Test" {
                views {
                    systemContext sys "diagram" {
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const views = ast.views!.views;
            assert.strictEqual(views.length, 1);
            assert.strictEqual(views[0].viewType, 'systemContext');
            assert.strictEqual(views[0].scope, 'sys');
            assert.strictEqual(views[0].key, 'diagram');
        });

        it('should parse container view', () => {
            const source = `workspace "Test" {
                views {
                    container sys "containers" {
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const view = ast.views!.views[0];
            assert.strictEqual(view.viewType, 'container');
            assert.strictEqual(view.scope, 'sys');
        });

        it('should parse component view', () => {
            const source = `workspace "Test" {
                views {
                    component web "components" {
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const view = ast.views!.views[0];
            assert.strictEqual(view.viewType, 'component');
            assert.strictEqual(view.scope, 'web');
        });

        it('should parse view with include directive', () => {
            const source = `workspace "Test" {
                views {
                    systemContext sys "diagram" {
                        include user web api
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const view = ast.views!.views[0];
            assert.ok(view.include);
            assert.strictEqual(view.include!.length, 3);
            assert.strictEqual(view.include![0], 'user');
            assert.strictEqual(view.include![1], 'web');
            assert.strictEqual(view.include![2], 'api');
        });

        it('should parse view with wildcard include', () => {
            const source = `workspace "Test" {
                views {
                    systemContext sys "diagram" {
                        include *
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const view = ast.views!.views[0];
            assert.ok(view.include);
            assert.strictEqual(view.include!.length, 1);
            assert.strictEqual(view.include![0], '*');
        });

        it('should parse view with exclude directive', () => {
            const source = `workspace "Test" {
                views {
                    systemContext sys "diagram" {
                        exclude cache
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const view = ast.views!.views[0];
            assert.ok(view.exclude);
            assert.strictEqual(view.exclude!.length, 1);
            assert.strictEqual(view.exclude![0], 'cache');
        });

        it('should parse multiple views', () => {
            const source = `workspace "Test" {
                views {
                    systemContext sys "context" { }
                    container sys "containers" { }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const views = ast.views!.views;
            assert.strictEqual(views.length, 2);
        });
    });

    describe('Style Parsing', () => {
        it('should parse element style', () => {
            const source = `workspace "Test" {
                styles {
                    element "Person" {
                        background #08427B
                        color #FFFFFF
                        shape Person
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const elementStyles = ast.styles!.elementStyles;
            assert.strictEqual(elementStyles.length, 1);
            assert.strictEqual(elementStyles[0].tag, 'Person');
            assert.strictEqual(elementStyles[0].background, '#08427B');
            assert.strictEqual(elementStyles[0].color, '#FFFFFF');
            assert.strictEqual(elementStyles[0].shape, 'Person');
        });

        it('should parse relationship style', () => {
            const source = `workspace "Test" {
                styles {
                    relationship "Async" {
                        color #FF6600
                        thickness 2
                        style Dashed
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const relStyles = ast.styles!.relationshipStyles;
            assert.strictEqual(relStyles.length, 1);
            assert.strictEqual(relStyles[0].tag, 'Async');
            assert.strictEqual(relStyles[0].color, '#FF6600');
        });

        it('should handle color vs colour spelling', () => {
            const source = `workspace "Test" {
                styles {
                    element "Test" {
                        colour #FFFFFF
                    }
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            const style = ast.styles!.elementStyles[0];
            assert.strictEqual(style.color, '#FFFFFF');
        });
    });

    describe('Complete Examples', () => {
        it('should parse complete workspace example', () => {
            const source = `workspace "E-Commerce System" {
                model {
                    customer = person "Customer"

                    ecommerce = softwareSystem "E-Commerce System" {
                        web = container "Web Application"
                        api = container "API"
                        db = container "Database"
                    }

                    customer -> web "Browses products"
                    web -> api "Makes API calls"
                    api -> db "Reads from and writes to"
                }

                views {
                    systemContext ecommerce "SystemContext" {
                        include *
                    }

                    container ecommerce "Containers" {
                        include *
                    }
                }

                styles {
                    element "Person" {
                        background #08427B
                        color #FFFFFF
                        shape Person
                    }

                    element "Container" {
                        background #438DD5
                        color #FFFFFF
                    }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();

            // Verify structure
            assert.strictEqual(ast.name, 'E-Commerce System');
            assert.ok(ast.model);
            assert.ok(ast.views);
            assert.ok(ast.styles);

            // Verify model
            assert.strictEqual(ast.model.elements.length, 2);
            assert.strictEqual(ast.model.relationships.length, 3);

            // Verify nested elements
            const ecommerce = ast.model.elements[1];
            assert.ok(ecommerce.children);
            assert.strictEqual(ecommerce.children!.length, 3);

            // Verify views
            assert.strictEqual(ast.views.views.length, 2);

            // Verify styles
            assert.strictEqual(ast.styles.elementStyles.length, 2);
        });
    });

    describe('Error Cases', () => {
        it('should throw error for missing workspace keyword', () => {
            const source = '"My Workspace" { }';
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());

            assert.throws(
                () => parser.parse(),
                StructurizrParserError
            );
        });

        it('should throw error for missing opening brace', () => {
            const source = 'workspace "Test"';
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());

            assert.throws(
                () => parser.parse(),
                StructurizrParserError
            );
        });

        it('should throw error for missing workspace name', () => {
            const source = 'workspace { }';
            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());

            assert.throws(
                () => parser.parse(),
                StructurizrParserError
            );
        });
    });
});
