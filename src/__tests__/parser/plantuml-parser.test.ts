import * as assert from 'assert';
import { parsePlantUML } from '../../parser/plantuml/PlantUMLParser';
import { PlantUMLAdapter, parsePlantUMLtoC4Model } from '../../parser/plantuml/PlantUMLAdapter';
import { PlantUMLDocument, ElementMacro, RelationshipMacro, BoundaryMacro } from '../../parser/plantuml/macros';

describe('PlantUMLParser', () => {

    // =========================================================================
    // Element macro parsing
    // =========================================================================

    describe('element macros', () => {
        it('parses Person macro', () => {
            const doc = parsePlantUML('Person(user, "End User", "A customer")');
            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.type, 'element');
            assert.strictEqual(macro.macroType, 'Person');
            assert.strictEqual(macro.alias, 'user');
            assert.strictEqual(macro.label, 'End User');
            assert.strictEqual(macro.description, 'A customer');
        });

        it('parses Person_Ext macro', () => {
            const doc = parsePlantUML('Person_Ext(admin, "Administrator")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Person_Ext');
            assert.strictEqual(macro.alias, 'admin');
        });

        it('parses System macro', () => {
            const doc = parsePlantUML('System(banking, "Internet Banking System", "Main system")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'System');
            assert.strictEqual(macro.alias, 'banking');
            assert.strictEqual(macro.label, 'Internet Banking System');
        });

        it('parses System_Ext macro', () => {
            const doc = parsePlantUML('System_Ext(email, "Email System", "Sends emails")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'System_Ext');
        });

        it('parses SystemDb macro', () => {
            const doc = parsePlantUML('SystemDb(db, "Database", "Stores data")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'SystemDb');
        });

        it('parses Container macro with technology', () => {
            const doc = parsePlantUML('Container(webapp, "Web Application", "Java, Spring Boot", "Serves the UI")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Container');
            assert.strictEqual(macro.alias, 'webapp');
            assert.strictEqual(macro.label, 'Web Application');
            // For Container/Component: params are (alias, label, technology, description)
            assert.strictEqual(macro.technology, 'Java, Spring Boot');
            assert.strictEqual(macro.description, 'Serves the UI');
        });

        it('parses ContainerDb macro', () => {
            const doc = parsePlantUML('ContainerDb(db, "Database", "PostgreSQL", "Stores data")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'ContainerDb');
        });

        it('parses Component macro', () => {
            const doc = parsePlantUML('Component(controller, "Controller", "Spring MVC", "Handles requests")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Component');
            assert.strictEqual(macro.technology, 'Spring MVC');
        });

        it('parses ComponentDb macro', () => {
            const doc = parsePlantUML('ComponentDb(repo, "Repository", "JPA", "Data access")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'ComponentDb');
        });

        it('parses element with minimal parameters (alias and label only)', () => {
            const doc = parsePlantUML('Person(user, "User")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.alias, 'user');
            assert.strictEqual(macro.label, 'User');
            assert.strictEqual(macro.description, undefined);
        });

        it('handles parameters with embedded commas inside quotes', () => {
            const doc = parsePlantUML('Container(webapp, "Web App", "React, TypeScript", "Frontend app")');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.technology, 'React, TypeScript');
        });
    });

    // =========================================================================
    // Relationship macro parsing
    // =========================================================================

    describe('relationship macros', () => {
        it('parses Rel macro', () => {
            const doc = parsePlantUML('Rel(user, system, "Uses", "HTTPS")');
            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.type, 'relationship');
            assert.strictEqual(macro.macroType, 'Rel');
            assert.strictEqual(macro.from, 'user');
            assert.strictEqual(macro.to, 'system');
            assert.strictEqual(macro.label, 'Uses');
            assert.strictEqual(macro.technology, 'HTTPS');
        });

        it('parses Rel_D macro (directional)', () => {
            const doc = parsePlantUML('Rel_D(web, api, "Calls")');
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'Rel_D');
        });

        it('parses Rel_Back macro', () => {
            const doc = parsePlantUML('Rel_Back(api, db, "Reads from")');
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'Rel_Back');
            assert.strictEqual(macro.from, 'api');
            assert.strictEqual(macro.to, 'db');
        });

        it('parses Rel_Neighbor macro', () => {
            const doc = parsePlantUML('Rel_Neighbor(a, b, "Adjacent")');
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'Rel_Neighbor');
        });

        it('parses BiRel macro', () => {
            const doc = parsePlantUML('BiRel(a, b, "Communicates")');
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'BiRel');
        });

        it('parses relationship with minimal parameters', () => {
            const doc = parsePlantUML('Rel(a, b)');
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.from, 'a');
            assert.strictEqual(macro.to, 'b');
            assert.strictEqual(macro.label, undefined);
        });
    });

    // =========================================================================
    // Boundary macro parsing
    // =========================================================================

    describe('boundary macros', () => {
        it('parses System_Boundary with children', () => {
            const source = `System_Boundary(sys, "Banking System") {
    Container(web, "Web App")
    Container(api, "API")
}`;
            const doc = parsePlantUML(source);
            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(macro.type, 'boundary');
            assert.strictEqual(macro.macroType, 'System_Boundary');
            assert.strictEqual(macro.alias, 'sys');
            assert.strictEqual(macro.label, 'Banking System');
            assert.strictEqual(macro.children.length, 2);
        });

        it('parses Container_Boundary', () => {
            const source = `Container_Boundary(app, "Application") {
    Component(ctrl, "Controller")
}`;
            const doc = parsePlantUML(source);
            const macro = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(macro.macroType, 'Container_Boundary');
            assert.strictEqual(macro.children.length, 1);
        });

        it('parses Boundary (generic) macro', () => {
            const source = `Boundary(zone, "DMZ") {
    System(fw, "Firewall")
}`;
            const doc = parsePlantUML(source);
            const macro = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(macro.macroType, 'Boundary');
        });

        it('parses nested boundaries', () => {
            const source = `System_Boundary(outer, "Outer") {
    Container_Boundary(inner, "Inner") {
        Component(comp, "Component")
    }
}`;
            const doc = parsePlantUML(source);
            const outer = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(outer.children.length, 1);
            const inner = outer.children[0] as BoundaryMacro;
            assert.strictEqual(inner.type, 'boundary');
            assert.strictEqual(inner.children.length, 1);
        });

        it('parses relationships inside boundaries', () => {
            const source = `System_Boundary(sys, "System") {
    Container(web, "Web App")
    Container(api, "API")
    Rel(web, api, "Calls")
}`;
            const doc = parsePlantUML(source);
            const boundary = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(boundary.children.length, 3);
            const relChildren = boundary.children.filter(c => c.type === 'relationship');
            assert.strictEqual(relChildren.length, 1);
        });
    });

    // =========================================================================
    // Line filtering (comments, directives, empty lines)
    // =========================================================================

    describe('line filtering', () => {
        it('skips empty lines', () => {
            const source = `
Person(user, "User")

System(sys, "System")
`;
            const doc = parsePlantUML(source);
            assert.strictEqual(doc.macros.length, 2);
        });

        it('skips comment lines (starting with single quote)', () => {
            const source = `' This is a comment
Person(user, "User")
' Another comment
System(sys, "System")`;
            const doc = parsePlantUML(source);
            assert.strictEqual(doc.macros.length, 2);
        });

        it('skips PlantUML directives (@startuml, @enduml)', () => {
            const source = `@startuml
Person(user, "User")
@enduml`;
            const doc = parsePlantUML(source);
            assert.strictEqual(doc.macros.length, 1);
        });

        it('skips !include directives', () => {
            const source = `!include <C4/C4_Context>
Person(user, "User")`;
            const doc = parsePlantUML(source);
            assert.strictEqual(doc.macros.length, 1);
        });

        it('ignores lines that are not recognized macros', () => {
            const source = `Person(user, "User")
title My Architecture
System(sys, "System")`;
            const doc = parsePlantUML(source);
            // 'title' line is not a recognized macro, so it should be skipped
            assert.strictEqual(doc.macros.length, 2);
        });
    });

    // =========================================================================
    // Parameter parsing edge cases
    // =========================================================================

    describe('parameter parsing edge cases', () => {
        it('handles parameters with extra whitespace', () => {
            const doc = parsePlantUML('Person( user , "End User" , "Description" )');
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.alias, 'user');
            assert.strictEqual(macro.label, 'End User');
        });

        it('returns empty macros array for completely empty input', () => {
            const doc = parsePlantUML('');
            assert.strictEqual(doc.macros.length, 0);
        });

        it('returns empty macros array for input with only comments', () => {
            const doc = parsePlantUML("' just a comment\n' another comment");
            assert.strictEqual(doc.macros.length, 0);
        });
    });

    // =========================================================================
    // Full document parsing
    // =========================================================================

    describe('full PlantUML document', () => {
        it('parses a complete C4 Context diagram', () => {
            const source = `@startuml
!include <C4/C4_Context>

Person(customer, "Customer", "A bank customer")
System(banking, "Internet Banking", "Online banking system")
System_Ext(email, "Email System", "Sends emails")

Rel(customer, banking, "Uses", "HTTPS")
Rel(banking, email, "Sends emails", "SMTP")
@enduml`;
            const doc = parsePlantUML(source);
            const elements = doc.macros.filter(m => m.type === 'element');
            const rels = doc.macros.filter(m => m.type === 'relationship');
            assert.strictEqual(elements.length, 3);
            assert.strictEqual(rels.length, 2);
        });

        it('parses a Container diagram with boundaries', () => {
            const source = `@startuml
!include <C4/C4_Container>

Person(customer, "Customer")

System_Boundary(banking, "Internet Banking") {
    Container(web, "Web Application", "Java")
    Container(api, "API Application", "Java")
    ContainerDb(db, "Database", "PostgreSQL")
    Rel(web, api, "Calls")
    Rel(api, db, "Reads from")
}

Rel(customer, web, "Uses")
@enduml`;
            const doc = parsePlantUML(source);
            const topLevelMacros = doc.macros;
            // Should have: 1 Person, 1 Boundary (with 3 containers + 2 rels inside), 1 Rel
            assert.ok(topLevelMacros.length >= 3);
        });
    });
});

// =========================================================================
// PlantUML Adapter tests
// =========================================================================

describe('PlantUMLAdapter', () => {
    const adapter = new PlantUMLAdapter();

    describe('element conversion', () => {
        it('converts Person macro to C4Element with type Person', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'Person',
                    alias: 'user', label: 'User',
                    description: 'A user', line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.strictEqual(model.views[0].elements[0].type, 'Person');
            assert.strictEqual(model.views[0].elements[0].id, 'user');
            assert.strictEqual(model.views[0].elements[0].label, 'User');
            assert.strictEqual(model.views[0].elements[0].description, 'A user');
        });

        it('converts System macro to SoftwareSystem type', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'System',
                    alias: 'sys', label: 'System',
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.strictEqual(model.views[0].elements[0].type, 'SoftwareSystem');
        });

        it('converts Container macro to Container type with technology', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'Container',
                    alias: 'web', label: 'Web App',
                    technology: 'Java', line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            const element = model.views[0].elements[0];
            assert.strictEqual(element.type, 'Container');
            assert.strictEqual(element.technology, 'Java');
        });

        it('converts Component macro to Component type', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'Component',
                    alias: 'ctrl', label: 'Controller',
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.strictEqual(model.views[0].elements[0].type, 'Component');
        });

        it('adds External tag for _Ext macros', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'System_Ext',
                    alias: 'ext', label: 'External',
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.ok(model.views[0].elements[0].tags?.includes('External'));
        });

        it('adds Database tag for Db macros', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'element', macroType: 'ContainerDb',
                    alias: 'db', label: 'DB',
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.ok(model.views[0].elements[0].tags?.includes('Database'));
        });
    });

    describe('relationship conversion', () => {
        it('converts Rel macro to C4Rel', () => {
            const doc: PlantUMLDocument = {
                macros: [
                    { type: 'element', macroType: 'Person', alias: 'a', label: 'A', line: 1, column: 1 },
                    { type: 'element', macroType: 'System', alias: 'b', label: 'B', line: 2, column: 1 },
                    {
                        type: 'relationship', macroType: 'Rel',
                        from: 'a', to: 'b', label: 'Uses', technology: 'HTTPS',
                        line: 3, column: 1,
                    },
                ],
            };
            const model = adapter.convert(doc);
            const rel = model.views[0].relationships[0];
            assert.strictEqual(rel.from, 'a');
            assert.strictEqual(rel.to, 'b');
            assert.strictEqual(rel.label, 'Uses');
            assert.strictEqual(rel.technology, 'HTTPS');
            assert.strictEqual(rel.relType, 'uses');
        });
    });

    describe('boundary flattening', () => {
        it('flattens boundary children into top-level elements', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'boundary', macroType: 'System_Boundary',
                    alias: 'sys', label: 'System',
                    children: [
                        { type: 'element', macroType: 'Container', alias: 'web', label: 'Web', line: 2, column: 1 },
                        { type: 'element', macroType: 'Container', alias: 'api', label: 'API', line: 3, column: 1 },
                    ],
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.strictEqual(model.views[0].elements.length, 2);
        });

        it('adds boundary tag to children elements', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'boundary', macroType: 'System_Boundary',
                    alias: 'sys', label: 'System',
                    children: [
                        { type: 'element', macroType: 'Container', alias: 'web', label: 'Web', line: 2, column: 1 },
                    ],
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.ok(model.views[0].elements[0].tags?.includes('boundary:sys'));
        });

        it('extracts relationships from boundaries', () => {
            const doc: PlantUMLDocument = {
                macros: [{
                    type: 'boundary', macroType: 'System_Boundary',
                    alias: 'sys', label: 'System',
                    children: [
                        { type: 'element', macroType: 'Container', alias: 'web', label: 'Web', line: 2, column: 1 },
                        { type: 'element', macroType: 'Container', alias: 'api', label: 'API', line: 3, column: 1 },
                        {
                            type: 'relationship', macroType: 'Rel',
                            from: 'web', to: 'api', label: 'Calls',
                            line: 4, column: 1,
                        },
                    ],
                    line: 1, column: 1,
                }],
            };
            const model = adapter.convert(doc);
            assert.strictEqual(model.views[0].relationships.length, 1);
        });
    });

    describe('full pipeline (parsePlantUMLtoC4Model)', () => {
        it('converts a complete PlantUML C4 source to C4Model', () => {
            const source = `@startuml
Person(user, "User")
System(banking, "Banking System")
Rel(user, banking, "Uses")
@enduml`;
            const model = parsePlantUMLtoC4Model(source);
            assert.strictEqual(model.workspace, 'PlantUML C4 Diagram');
            assert.strictEqual(model.views.length, 1);
            assert.strictEqual(model.views[0].elements.length, 2);
            assert.strictEqual(model.views[0].relationships.length, 1);
        });
    });
});
