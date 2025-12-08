import * as assert from 'assert';
import { C4ModelBuilder } from '../../src/model/C4ModelBuilder';
import { C4XParser } from '../../src/parser/C4XParser';

describe('Phase 8: Advanced Visuals - Grammar & Model Expansion', () => {

    it('8.1.1: Should parse nested Node syntax correctly', () => {
        const c4xSource = `
            %%{ c4: deployment }%%
            Node(awsRegion, "AWS Production", "AWS Region") {
                Node(k8sCluster, "Kubernetes Cluster", "EKS") {
                    Container(apiService, "API Service", "Node.js")
                    Container(database, "Database", "PostgreSQL")
                }
            }
        `;
        const parser = new C4XParser();
        const ast = parser.parse(c4xSource);
        
        assert.ok(ast, 'AST should be parsed');
        assert.strictEqual(ast.viewType, 'deployment');
        assert.strictEqual(ast.elements.length, 1, 'Should have 1 top-level element (awsRegion)');
        
        const rootNode = ast.elements[0];
        assert.strictEqual(rootNode.id, 'awsRegion');
        assert.strictEqual(rootNode.elementType, 'node');
        assert.strictEqual(rootNode.technology, 'AWS Region');
        assert.ok(rootNode.children && rootNode.children.length > 0, 'Root node should have children');
        
        const k8sNode = rootNode.children[0];
        assert.strictEqual(k8sNode.id, 'k8sCluster');
        assert.strictEqual(k8sNode.elementType, 'node');
        assert.ok(k8sNode.children && k8sNode.children.length === 2, 'K8s node should have 2 children');
        
        const apiService = k8sNode.children[0];
        assert.strictEqual(apiService.id, 'apiService');
        assert.strictEqual(apiService.elementType, 'Container'); // Correct case from grammar? Grammar uses Identifier 'Container'
    });

    it('8.1.1: Should parse element with $sprite and $tags attributes', () => {
        const c4xSource = `
            %%{ c4: system-context }%%
            Person(user, "Customer", "Uses the app", $sprite="user", $tags="external,gold-tier")
            System(paymentGateway, "Payment Gateway", "Handles transactions", $sprite="stripe", $tags="external,secure")
        `;
        const parser = new C4XParser();
        const ast = parser.parse(c4xSource);
        
        assert.ok(ast, 'AST should be parsed');
        assert.strictEqual(ast.elements.length, 2);
        
        const user = ast.elements[0];
        assert.strictEqual(user.id, 'user');
        assert.strictEqual(user.sprite, 'user');
        assert.ok(user.tags.includes('external'));
        assert.ok(user.tags.includes('gold-tier'));
        
        const gateway = ast.elements[1];
        assert.strictEqual(gateway.id, 'paymentGateway');
        assert.strictEqual(gateway.sprite, 'stripe');
        assert.ok(gateway.tags.includes('secure'));
    });
    
    it('8.1.1: Should parse Node block syntax (no ID)', () => {
        const c4xSource = `
            %%{ c4: deployment }%%
            Node "AWS Cloud" "Cloud Provider" $tags="cloud" {
                Node "US East" "Region" {
                   Container(app, "App")
                }
            }
        `;
        const parser = new C4XParser();
        const ast = parser.parse(c4xSource);
        
        assert.ok(ast);
        const root = ast.elements[0];
        // ID generated from label
        assert.strictEqual(root.id, 'AWSCloud');
        assert.strictEqual(root.label, 'AWS Cloud');
        assert.strictEqual(root.technology, 'Cloud Provider');
        assert.ok(root.tags.includes('cloud'));
        
        assert.ok(root.children && root.children.length === 1);
        const region = root.children[0];
        assert.strictEqual(region.id, 'USEast');
    });

});
