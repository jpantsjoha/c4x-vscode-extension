/**
 * Structurizr Adapter Tests
 * Tests for converting Structurizr AST to C4Model IR
 */

import * as assert from 'assert';
import {
    StructurizrLexer,
    StructurizrParser,
    StructurizrAdapter,
} from '../../../src/parser/structurizr';
import { C4Model, C4Element, C4Rel } from '../../../src/model/C4Model';

describe('Structurizr Adapter', () => {
    describe('Element Type Mapping', () => {
        it('should map person to Person', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                }
                views {
                    systemContext user "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const element = model.views[0].elements[0];
            assert.strictEqual(element.type, 'Person');
        });

        it('should map softwareSystem to SoftwareSystem', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System"
                }
                views {
                    systemContext sys "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const element = model.views[0].elements[0];
            assert.strictEqual(element.type, 'SoftwareSystem');
        });

        it('should map container to Container', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web App"
                }
                views {
                    systemContext web "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const element = model.views[0].elements[0];
            assert.strictEqual(element.type, 'Container');
        });

        it('should map component to Component', () => {
            const source = `workspace "Test" {
                model {
                    comp = component "Component"
                }
                views {
                    systemContext comp "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const element = model.views[0].elements[0];
            assert.strictEqual(element.type, 'Component');
        });
    });

    describe('View Type Mapping', () => {
        it('should map systemContext to system-context', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System"
                }
                views {
                    systemContext sys "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            assert.strictEqual(model.views[0].type, 'system-context');
        });

        it('should map container to container', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System"
                }
                views {
                    container sys "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            assert.strictEqual(model.views[0].type, 'container');
        });

        it('should map component to component', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web"
                }
                views {
                    component web "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            assert.strictEqual(model.views[0].type, 'component');
        });
    });

    describe('Element Conversion', () => {
        it('should convert element with all properties', () => {
            const source = `workspace "Test" {
                model {
                    db = container "Database" {
                        "Stores application data"
                        "PostgreSQL"
                    }
                }
                views {
                    systemContext db "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const element = model.views[0].elements[0];
            assert.strictEqual(element.id, 'db');
            assert.strictEqual(element.label, 'Database');
            assert.strictEqual(element.type, 'Container');
            assert.strictEqual(element.description, 'Stores application data');
            assert.strictEqual(element.technology, 'PostgreSQL');
        });
    });

    describe('Nested Element Flattening', () => {
        it('should flatten containers in software system', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System" {
                        web = container "Web"
                        api = container "API"
                        db = container "Database"
                    }
                }
                views {
                    container sys "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Container view should show system + its containers
            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 4); // sys + web + api + db
        });

        it('should flatten components in container', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web App" {
                        ctrl = component "Controller"
                        svc = component "Service"
                    }
                }
                views {
                    component web "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 3); // web + ctrl + svc
        });
    });

    describe('Include/Exclude Filters', () => {
        it('should apply wildcard include (show all)', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys1 = softwareSystem "System 1"
                    sys2 = softwareSystem "System 2"
                }
                views {
                    systemContext sys1 "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Wildcard should include all elements
            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 3);
        });

        it('should apply specific include filter', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys1 = softwareSystem "System 1"
                    sys2 = softwareSystem "System 2"
                }
                views {
                    systemContext sys1 "diagram" { include user sys1 }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Should only include user and sys1
            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 2);

            const ids = elements.map(e => e.id);
            assert.ok(ids.includes('user'));
            assert.ok(ids.includes('sys1'));
            assert.ok(!ids.includes('sys2'));
        });

        it('should apply exclude filter', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys1 = softwareSystem "System 1"
                    sys2 = softwareSystem "System 2"
                }
                views {
                    systemContext sys1 "diagram" {
                        include *
                        exclude sys2
                    }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Should exclude sys2
            const elements = model.views[0].elements;
            const ids = elements.map(e => e.id);
            assert.ok(!ids.includes('sys2'));
        });

        it('should include nested children when parent is included', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System" {
                        web = container "Web"
                        api = container "API"
                    }
                }
                views {
                    container sys "diagram" { include sys }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Including sys should also include its children
            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 3); // sys + web + api
        });
    });

    describe('Relationship Conversion', () => {
        it('should convert simple relationship', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys = softwareSystem "System"
                    user -> sys "Uses"
                }
                views {
                    systemContext sys "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const rels = model.views[0].relationships;
            assert.strictEqual(rels.length, 1);
            assert.strictEqual(rels[0].from, 'user');
            assert.strictEqual(rels[0].to, 'sys');
            assert.strictEqual(rels[0].label, 'Uses');
            assert.strictEqual(rels[0].relType, 'uses');
        });

        it('should convert relationship with technology', () => {
            const source = `workspace "Test" {
                model {
                    web = container "Web"
                    db = container "Database"
                    web -> db "Reads from" "JDBC"
                }
                views {
                    systemContext web "diagram" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            const rel = model.views[0].relationships[0];
            assert.strictEqual(rel.technology, 'JDBC');
        });

        it('should filter relationships based on visible elements', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys1 = softwareSystem "System 1"
                    sys2 = softwareSystem "System 2"

                    user -> sys1 "Uses"
                    sys1 -> sys2 "Calls"
                }
                views {
                    systemContext sys1 "diagram" { include user sys1 }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Should only include user -> sys1, not sys1 -> sys2
            const rels = model.views[0].relationships;
            assert.strictEqual(rels.length, 1);
            assert.strictEqual(rels[0].from, 'user');
            assert.strictEqual(rels[0].to, 'sys1');
        });
    });

    describe('Scope Filtering', () => {
        it('should apply system context scope filter', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    ecommerce = softwareSystem "E-Commerce"
                    payment = softwareSystem "Payment"
                }
                views {
                    systemContext ecommerce "context" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // System context should show the system and external dependencies
            const elements = model.views[0].elements;
            const ids = elements.map(e => e.id);

            assert.ok(ids.includes('ecommerce')); // The scoped system
            assert.ok(ids.includes('user')); // External person
            assert.ok(ids.includes('payment')); // External system
        });

        it('should apply container scope filter', () => {
            const source = `workspace "Test" {
                model {
                    sys = softwareSystem "System" {
                        web = container "Web"
                        api = container "API"
                    }
                    external = softwareSystem "External"
                }
                views {
                    container sys "containers" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Container view should show system + its containers
            const elements = model.views[0].elements;
            assert.strictEqual(elements.length, 3); // sys + web + api
        });
    });

    describe('Multiple Views', () => {
        it('should convert multiple views', () => {
            const source = `workspace "Test" {
                model {
                    user = person "User"
                    sys = softwareSystem "System" {
                        web = container "Web"
                    }
                }
                views {
                    systemContext sys "context" { include * }
                    container sys "containers" { include * }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            assert.strictEqual(model.views.length, 2);
            assert.strictEqual(model.views[0].type, 'system-context');
            assert.strictEqual(model.views[1].type, 'container');
        });
    });

    describe('Complete Example', () => {
        it('should convert complete e-commerce example', () => {
            const source = `workspace "E-Commerce" {
                model {
                    customer = person "Customer"

                    ecommerce = softwareSystem "E-Commerce System" {
                        web = container "Web Application"
                        api = container "API"
                        db = container "Database"
                    }

                    payment = softwareSystem "Payment Gateway"

                    customer -> web "Browses products"
                    web -> api "Makes API calls"
                    api -> db "Reads from and writes to"
                    api -> payment "Processes payments via"
                }

                views {
                    systemContext ecommerce "SystemContext" {
                        include *
                    }

                    container ecommerce "Containers" {
                        include *
                    }
                }
            }`;

            const lexer = new StructurizrLexer(source);
            const parser = new StructurizrParser(lexer.tokenize());
            const ast = parser.parse();
            const adapter = new StructurizrAdapter();
            const model = adapter.convert(ast);

            // Verify model structure
            assert.strictEqual(model.workspace, 'E-Commerce');
            assert.strictEqual(model.views.length, 2);

            // Verify system context view
            const contextView = model.views[0];
            assert.strictEqual(contextView.type, 'system-context');

            // Verify container view
            const containerView = model.views[1];
            assert.strictEqual(containerView.type, 'container');
            assert.strictEqual(containerView.elements.length, 4); // ecommerce + web + api + db
        });
    });
});
