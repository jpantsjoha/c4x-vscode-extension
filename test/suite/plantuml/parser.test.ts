/**
 * PlantUML Parser Tests
 */

import * as assert from 'assert';
import { parsePlantUML } from '../../../src/parser/plantuml/PlantUMLParser';
import { ElementMacro, RelationshipMacro, BoundaryMacro } from '../../../src/parser/plantuml/macros';

describe('PlantUML Parser', () => {
    describe('Element Parsing', () => {
        it('should parse Person macro', () => {
            const source = 'Person(user, "Customer", "A user of the system")';
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.type, 'element');
            assert.strictEqual(macro.macroType, 'Person');
            assert.strictEqual(macro.alias, 'user');
            assert.strictEqual(macro.label, 'Customer');
            assert.strictEqual(macro.description, 'A user of the system');
        });

        it('should parse Person_Ext macro', () => {
            const source = 'Person_Ext(admin, "Administrator")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Person_Ext');
            assert.strictEqual(macro.alias, 'admin');
            assert.strictEqual(macro.label, 'Administrator');
        });

        it('should parse System macro', () => {
            const source = 'System(banking, "Banking System", "Handles transactions")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'System');
            assert.strictEqual(macro.alias, 'banking');
            assert.strictEqual(macro.label, 'Banking System');
            assert.strictEqual(macro.description, 'Handles transactions');
        });

        it('should parse Container macro with technology', () => {
            const source = 'Container(web, "Web App", "React", "Frontend application")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Container');
            assert.strictEqual(macro.alias, 'web');
            assert.strictEqual(macro.label, 'Web App');
            assert.strictEqual(macro.technology, 'React');
            assert.strictEqual(macro.description, 'Frontend application');
        });

        it('should parse ContainerDb macro', () => {
            const source = 'ContainerDb(db, "Database", "PostgreSQL", "Stores data")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'ContainerDb');
            assert.strictEqual(macro.alias, 'db');
        });

        it('should parse Component macro', () => {
            const source = 'Component(api, "API Controller", "Spring", "REST API")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'Component');
            assert.strictEqual(macro.technology, 'Spring');
        });

        it('should handle commas inside quoted strings', () => {
            const source = 'Container(web, "Web, Mobile App", "React, TypeScript", "Description")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.label, 'Web, Mobile App');
            assert.strictEqual(macro.technology, 'React, TypeScript');
        });
    });

    describe('Relationship Parsing', () => {
        it('should parse Rel macro', () => {
            const source = 'Rel(user, web, "Uses", "HTTPS")';
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.type, 'relationship');
            assert.strictEqual(macro.macroType, 'Rel');
            assert.strictEqual(macro.from, 'user');
            assert.strictEqual(macro.to, 'web');
            assert.strictEqual(macro.label, 'Uses');
            assert.strictEqual(macro.technology, 'HTTPS');
        });

        it('should parse Rel_Back macro', () => {
            const source = 'Rel_Back(api, web, "Returns data")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'Rel_Back');
        });

        it('should parse directional Rel macros', () => {
            const tests = ['Rel_D', 'Rel_U', 'Rel_L', 'Rel_R'];

            tests.forEach(relType => {
                const source = `${relType}(from, to, "Label")`;
                const doc = parsePlantUML(source);
                const macro = doc.macros[0] as RelationshipMacro;
                assert.strictEqual(macro.macroType, relType);
            });
        });

        it('should parse relationship without technology', () => {
            const source = 'Rel(user, web, "Uses")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.label, 'Uses');
            assert.strictEqual(macro.technology, undefined);
        });
    });

    describe('Boundary Parsing', () => {
        it('should parse System_Boundary with children', () => {
            const source = `
System_Boundary(sys, "Banking System") {
    Container(web, "Web App", "React", "Frontend")
    Container(api, "API", "Node.js", "Backend")
    Rel(web, api, "Calls")
}`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
            const macro = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(macro.type, 'boundary');
            assert.strictEqual(macro.macroType, 'System_Boundary');
            assert.strictEqual(macro.alias, 'sys');
            assert.strictEqual(macro.label, 'Banking System');
            assert.strictEqual(macro.children.length, 3);
        });

        it('should parse nested elements in boundary', () => {
            const source = `
System_Boundary(sys, "System") {
    Container(web, "Web", "React", "App")
}`;
            const doc = parsePlantUML(source);

            const boundary = doc.macros[0] as BoundaryMacro;
            const child = boundary.children[0] as ElementMacro;
            assert.strictEqual(child.type, 'element');
            assert.strictEqual(child.alias, 'web');
        });

        it('should parse Container_Boundary', () => {
            const source = `
Container_Boundary(cont, "Container Boundary") {
    Component(comp, "Component", "Java", "Business logic")
}`;
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(macro.macroType, 'Container_Boundary');
        });
    });

    describe('Directive Skipping', () => {
        it('should skip @startuml and @enduml', () => {
            const source = `
@startuml
Person(user, "User")
@enduml`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
        });

        it('should skip !include directives', () => {
            const source = `
!include C4_Container.puml
Person(user, "User")`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
        });

        it('should skip comments', () => {
            const source = `
' This is a comment
Person(user, "User")
' Another comment`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
        });

        it('should skip empty lines', () => {
            const source = `

Person(user, "User")

System(sys, "System")

`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 2);
        });
    });

    describe('Complex Examples', () => {
        it('should parse complete banking system', () => {
            const source = `
@startuml
!include C4_Container.puml

Person(customer, "Customer")
System_Boundary(banking, "Banking System") {
    Container(web, "Web App", "React", "Frontend")
    Container(api, "API", "Node.js", "Backend")
    ContainerDb(db, "Database", "PostgreSQL", "Storage")
}
System_Ext(email, "Email System")

Rel(customer, web, "Uses")
Rel(web, api, "Calls")
Rel(api, db, "Reads/writes")
Rel(api, email, "Sends emails")
@enduml`;
            const doc = parsePlantUML(source);

            // Should have: customer, boundary (with 3 children), email, 4 relationships
            assert.strictEqual(doc.macros.length, 7);
        });
    });

    describe('Error Handling', () => {
        it('should skip invalid macro syntax', () => {
            const source = `
Person(user, "User")
InvalidMacro(foo, "Bar")
System(sys, "System")`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 2);
        });

        it('should handle missing parameters gracefully', () => {
            const source = 'Person(user)'; // Missing label
            const doc = parsePlantUML(source);

            // Should warn and skip
            assert.strictEqual(doc.macros.length, 0);
        });
    });

    describe('Extended Element Macros', () => {
        it('should parse System_Ext macro', () => {
            const source = 'System_Ext(email, "Email System", "External email")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'System_Ext');
            assert.strictEqual(macro.alias, 'email');
            assert.strictEqual(macro.label, 'Email System');
        });

        it('should parse SystemDb_Ext macro', () => {
            const source = 'SystemDb_Ext(extDb, "External Database")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'SystemDb_Ext');
        });

        it('should parse ComponentDb macro', () => {
            const source = 'ComponentDb(cache, "Cache", "Redis", "In-memory storage")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.macroType, 'ComponentDb');
            assert.strictEqual(macro.technology, 'Redis');
        });
    });

    describe('Nested Boundaries', () => {
        it('should parse nested boundaries', () => {
            const source = `
System_Boundary(sys, "System") {
    Container_Boundary(cont, "Container") {
        Component(comp, "Component", "Java", "Logic")
    }
}`;
            const doc = parsePlantUML(source);

            const systemBoundary = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(systemBoundary.macroType, 'System_Boundary');
            assert.strictEqual(systemBoundary.children.length, 1);

            const containerBoundary = systemBoundary.children[0] as unknown as BoundaryMacro;
            assert.strictEqual(containerBoundary.type, 'boundary');
            assert.strictEqual(containerBoundary.macroType, 'Container_Boundary');
            assert.strictEqual(containerBoundary.children.length, 1);
        });

        it('should parse deeply nested boundaries', () => {
            const source = `
System_Boundary(sys, "System") {
    Container_Boundary(cont1, "Container 1") {
        Component(comp1, "Component 1", "Java")
        Component(comp2, "Component 2", "Java")
    }
    Container_Boundary(cont2, "Container 2") {
        Component(comp3, "Component 3", "Node.js")
    }
}`;
            const doc = parsePlantUML(source);

            const systemBoundary = doc.macros[0] as BoundaryMacro;
            assert.strictEqual(systemBoundary.children.length, 2);
        });
    });

    describe('Special Characters', () => {
        it('should handle special characters in labels', () => {
            const source = 'Person(user, "User & Admin", "User with special chars: @#$%")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.strictEqual(macro.label, 'User & Admin');
            assert.ok(macro.description?.includes('@#$%'));
        });

        it('should handle quotes in labels', () => {
            const source = 'Container(web, "Web \\"Application\\"", "React")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.ok(macro.label.includes('Application'));
        });

        it('should handle newlines in descriptions', () => {
            const source = `Person(user, "User", "Line 1
Line 2
Line 3")`;
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as ElementMacro;
            assert.ok(macro.description?.includes('Line 1'));
            assert.ok(macro.description?.includes('Line 2'));
        });
    });

    describe('Relationship Variants', () => {
        it('should parse BiRel (bidirectional relationship)', () => {
            const source = 'BiRel(a, b, "Syncs data", "REST")';
            const doc = parsePlantUML(source);

            const macro = doc.macros[0] as RelationshipMacro;
            assert.strictEqual(macro.macroType, 'BiRel');
            assert.strictEqual(macro.from, 'a');
            assert.strictEqual(macro.to, 'b');
        });

        it('should parse all BiRel directional variants', () => {
            const tests = ['BiRel_D', 'BiRel_U', 'BiRel_L', 'BiRel_R'];

            tests.forEach(relType => {
                const source = `${relType}(from, to, "Label")`;
                const doc = parsePlantUML(source);
                const macro = doc.macros[0] as RelationshipMacro;
                assert.strictEqual(macro.macroType, relType);
            });
        });
    });

    describe('PlantUML Directives', () => {
        it('should skip LAYOUT_WITH_LEGEND directive', () => {
            const source = `
LAYOUT_WITH_LEGEND()
Person(user, "User")`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
        });

        it('should skip multiple directive types', () => {
            const source = `
@startuml
!include C4_Context.puml
!define DEVICONS https://raw.githubusercontent.com/tupadr3/plantuml-icon-font-sprites/master/devicons
SHOW_FLOATING_LEGEND()
Person(user, "User")
@enduml`;
            const doc = parsePlantUML(source);

            assert.strictEqual(doc.macros.length, 1);
        });
    });
});
