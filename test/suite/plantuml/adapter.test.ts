/**
 * PlantUML Adapter Tests
 */

import * as assert from 'assert';
import { parsePlantUMLtoC4Model } from '../../../src/parser/plantuml';

describe('PlantUML Adapter', () => {
    describe('Element Type Mapping', () => {
        it('should map Person to Person element type', () => {
            const source = 'Person(user, "Customer")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.strictEqual(element.type, 'Person');
            assert.strictEqual(element.id, 'user');
            assert.strictEqual(element.label, 'Customer');
        });

        it('should map System to SoftwareSystem element type', () => {
            const source = 'System(banking, "Banking System")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.strictEqual(element.type, 'SoftwareSystem');
        });

        it('should map Container to Container element type', () => {
            const source = 'Container(web, "Web App", "React")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.strictEqual(element.type, 'Container');
            assert.strictEqual(element.technology, 'React');
        });

        it('should map Component to Component element type', () => {
            const source = 'Component(api, "API", "Spring")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.strictEqual(element.type, 'Component');
        });
    });

    describe('Tag Handling', () => {
        it('should add External tag for _Ext variants', () => {
            const source = 'Person_Ext(admin, "Admin")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.ok(element.tags?.includes('External'));
        });

        it('should add Database tag for Db variants', () => {
            const source = 'ContainerDb(db, "Database", "PostgreSQL")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.ok(element.tags?.includes('Database'));
        });

        it('should add both External and Database tags for SystemDb_Ext', () => {
            const source = 'SystemDb_Ext(extDb, "External DB")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.ok(element.tags?.includes('External'));
            assert.ok(element.tags?.includes('Database'));
        });
    });

    describe('Relationship Conversion', () => {
        it('should convert Rel to C4Rel', () => {
            const source = `
Person(user, "User")
System(sys, "System")
Rel(user, sys, "Uses", "HTTPS")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const rel = c4Model.views[0].relationships[0];
            assert.strictEqual(rel.from, 'user');
            assert.strictEqual(rel.to, 'sys');
            assert.strictEqual(rel.label, 'Uses');
            assert.strictEqual(rel.technology, 'HTTPS');
            assert.strictEqual(rel.relType, 'uses');
        });

        it('should map all Rel variants to uses relType', () => {
            const source = `
Person(a, "A")
Person(b, "B")
Person(c, "C")
Rel_Back(a, b, "Back")
Rel_D(b, c, "Down")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            c4Model.views[0].relationships.forEach(rel => {
                assert.strictEqual(rel.relType, 'uses');
            });
        });
    });

    describe('Boundary Flattening', () => {
        it('should flatten boundary and add boundary tags', () => {
            const source = `
System_Boundary(banking, "Banking System") {
    Container(web, "Web App", "React")
    Container(api, "API", "Node.js")
}`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const elements = c4Model.views[0].elements;
            assert.strictEqual(elements.length, 2);

            elements.forEach(el => {
                assert.ok(el.tags?.includes('boundary:banking'));
            });
        });

        it('should include relationships inside boundaries', () => {
            const source = `
System_Boundary(sys, "System") {
    Container(web, "Web", "React")
    Container(api, "API", "Node.js")
    Rel(web, api, "Calls")
}`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const rels = c4Model.views[0].relationships;
            assert.strictEqual(rels.length, 1);
            assert.strictEqual(rels[0].from, 'web');
            assert.strictEqual(rels[0].to, 'api');
        });

        it('should not duplicate elements inside boundaries', () => {
            const source = `
Person(user, "User")
System_Boundary(sys, "System") {
    Container(web, "Web", "React")
}
System(external, "External")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            // Should have: user, web (from boundary), external = 3 elements
            const elements = c4Model.views[0].elements;
            assert.strictEqual(elements.length, 3);

            // Check web has boundary tag
            const web = elements.find(e => e.id === 'web');
            assert.ok(web?.tags?.includes('boundary:sys'));
        });
    });

    describe('C4Model Structure', () => {
        it('should create default system-context view', () => {
            const source = 'Person(user, "User")';
            const c4Model = parsePlantUMLtoC4Model(source);

            assert.strictEqual(c4Model.workspace, 'PlantUML C4 Diagram');
            assert.strictEqual(c4Model.views.length, 1);
            assert.strictEqual(c4Model.views[0].type, 'system-context');
        });

        it('should include all elements in view', () => {
            const source = `
Person(user, "User")
System(sys1, "System 1")
System(sys2, "System 2")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            assert.strictEqual(c4Model.views[0].elements.length, 3);
        });

        it('should include all relationships in view', () => {
            const source = `
Person(user, "User")
System(sys1, "System 1")
System(sys2, "System 2")
Rel(user, sys1, "Uses")
Rel(sys1, sys2, "Calls")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            assert.strictEqual(c4Model.views[0].relationships.length, 2);
        });
    });

    describe('Complete Examples', () => {
        it('should convert banking system correctly', () => {
            const source = `
@startuml
Person(customer, "Customer", "A customer")
Person_Ext(admin, "Admin", "Back office staff")

System(mainframe, "Mainframe", "Core banking")
System_Ext(email, "Email", "Exchange")

Container(web, "Web App", "Java Spring", "Delivers content")
Container(spa, "SPA", "Angular", "Banking functionality")
ContainerDb(db, "Database", "Oracle", "Stores data")

Rel(customer, spa, "Uses", "HTTPS")
Rel(spa, web, "Delivered by")
Rel(web, db, "Reads/writes", "JDBC")
Rel(web, mainframe, "Uses", "XML/HTTPS")
Rel(web, email, "Sends", "SMTP")
@enduml`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];

            // Check element counts
            const persons = view.elements.filter(e => e.type === 'Person');
            const systems = view.elements.filter(e => e.type === 'SoftwareSystem');
            const containers = view.elements.filter(e => e.type === 'Container');

            assert.strictEqual(persons.length, 2);
            assert.strictEqual(systems.length, 2);
            assert.strictEqual(containers.length, 3);

            // Check tags
            const external = view.elements.filter(e => e.tags?.includes('External'));
            const database = view.elements.filter(e => e.tags?.includes('Database'));

            assert.strictEqual(external.length, 2); // admin, email
            assert.strictEqual(database.length, 1); // db

            // Check relationships
            assert.strictEqual(view.relationships.length, 5);
        });

        it('should handle complex boundary scenario', () => {
            const source = `
Person(customer, "Customer")

System_Boundary(banking, "Banking System") {
    Container(web, "Web", "React", "Frontend")
    Container(api, "API", "Node.js", "Backend")
    ContainerDb(db, "DB", "Postgres", "Storage")

    Rel(web, api, "Calls")
    Rel(api, db, "Reads/writes")
}

System_Ext(email, "Email")

Rel(customer, web, "Uses")
Rel(api, email, "Sends")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];

            // Elements: customer, web, api, db, email = 5
            assert.strictEqual(view.elements.length, 5);

            // Relationships: web->api, api->db, customer->web, api->email = 4
            assert.strictEqual(view.relationships.length, 4);

            // Check boundary tags
            const boundaryElements = view.elements.filter(e =>
                e.tags?.includes('boundary:banking')
            );
            assert.strictEqual(boundaryElements.length, 3); // web, api, db
        });
    });

    describe('Nested Boundary Flattening', () => {
        it('should flatten nested boundaries with distinct tags', () => {
            const source = `
System_Boundary(sys, "System") {
    Container_Boundary(cont, "Container") {
        Component(comp, "Component", "Java", "Business logic")
    }
}`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];
            assert.strictEqual(view.elements.length, 1); // Only comp

            const comp = view.elements[0];
            assert.ok(comp.tags?.includes('boundary:cont'));
        });

        it('should handle multiple nested boundaries', () => {
            const source = `
System_Boundary(sys, "System") {
    Container_Boundary(cont1, "Container 1") {
        Component(comp1, "Comp 1", "Java")
        Component(comp2, "Comp 2", "Java")
    }
    Container_Boundary(cont2, "Container 2") {
        Component(comp3, "Comp 3", "Node.js")
    }
}`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];
            assert.strictEqual(view.elements.length, 3); // comp1, comp2, comp3

            const comp1 = view.elements.find(e => e.id === 'comp1');
            const comp3 = view.elements.find(e => e.id === 'comp3');

            assert.ok(comp1?.tags?.includes('boundary:cont1'));
            assert.ok(comp3?.tags?.includes('boundary:cont2'));
        });

        it('should preserve relationships across nested boundaries', () => {
            const source = `
System_Boundary(sys, "System") {
    Container_Boundary(cont1, "Container 1") {
        Component(comp1, "Comp 1", "Java")
    }
    Container_Boundary(cont2, "Container 2") {
        Component(comp2, "Comp 2", "Node.js")
    }
    Rel(comp1, comp2, "Calls")
}`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];
            assert.strictEqual(view.relationships.length, 1);

            const rel = view.relationships[0];
            assert.strictEqual(rel.from, 'comp1');
            assert.strictEqual(rel.to, 'comp2');
        });
    });

    describe('Extended Macro Variants', () => {
        it('should handle SystemDb_Ext with all tags', () => {
            const source = 'SystemDb_Ext(extDb, "External DB", "Cloud DB")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.ok(element.tags?.includes('External'));
            assert.ok(element.tags?.includes('Database'));
            assert.strictEqual(element.type, 'SoftwareSystem');
        });

        it('should handle ComponentDb', () => {
            const source = 'ComponentDb(cache, "Cache", "Redis", "In-memory")';
            const c4Model = parsePlantUMLtoC4Model(source);

            const element = c4Model.views[0].elements[0];
            assert.ok(element.tags?.includes('Database'));
            assert.strictEqual(element.type, 'Component');
            assert.strictEqual(element.technology, 'Redis');
        });
    });

    describe('BiDirectional Relationships', () => {
        it('should convert BiRel to uses relationship', () => {
            const source = `
Person(a, "A")
Person(b, "B")
BiRel(a, b, "Syncs", "REST")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const rel = c4Model.views[0].relationships[0];
            assert.strictEqual(rel.from, 'a');
            assert.strictEqual(rel.to, 'b');
            assert.strictEqual(rel.relType, 'uses');
            assert.strictEqual(rel.technology, 'REST');
        });

        it('should map BiRel directional variants to uses', () => {
            const source = `
Person(a, "A")
Person(b, "B")
Person(c, "C")
BiRel_D(a, b, "Down")
BiRel_U(b, c, "Up")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            c4Model.views[0].relationships.forEach(rel => {
                assert.strictEqual(rel.relType, 'uses');
            });
        });
    });

    describe('Cross-Boundary Relationships', () => {
        it('should handle relationships between different boundaries', () => {
            const source = `
System_Boundary(sys1, "System 1") {
    Container(web1, "Web 1", "React")
}
System_Boundary(sys2, "System 2") {
    Container(api2, "API 2", "Node.js")
}
Rel(web1, api2, "Calls", "HTTPS")`;
            const c4Model = parsePlantUMLtoC4Model(source);

            const view = c4Model.views[0];

            // Should have 2 elements
            assert.strictEqual(view.elements.length, 2);

            // Should have 1 relationship crossing boundaries
            assert.strictEqual(view.relationships.length, 1);
            const rel = view.relationships[0];
            assert.strictEqual(rel.from, 'web1');
            assert.strictEqual(rel.to, 'api2');

            // Check boundary tags are preserved
            const web1 = view.elements.find(e => e.id === 'web1');
            const api2 = view.elements.find(e => e.id === 'api2');
            assert.ok(web1?.tags?.includes('boundary:sys1'));
            assert.ok(api2?.tags?.includes('boundary:sys2'));
        });
    });
});
