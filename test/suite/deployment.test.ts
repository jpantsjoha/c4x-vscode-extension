import * as assert from 'assert';

// Mock vscode
const mockVscode = {
  workspace: {
    getConfiguration: () => ({
      get: (key: string) => {
        if (key === 'theme') return process.env.C4X_FORCE_THEME || 'classic';
        return undefined;
      }
    })
  }
};
if (typeof (global as any).vscode === 'undefined') {
  (global as any).vscode = mockVscode;
}

describe('Phase 8.3: Deployment Diagrams', () => {
    let c4xParser: any;
    let c4ModelBuilder: any;
    let dagreLayoutEngine: any;
    let svgBuilder: any;
    let ClassicTheme: any;

    before(async function() {
        this.timeout(10000);
        const parserModule = await import('../../src/parser/C4XParser');
        c4xParser = parserModule.c4xParser;

        const builderModule = await import('../../src/model/C4ModelBuilder');
        c4ModelBuilder = builderModule.c4ModelBuilder;

        const layoutModule = await import('../../src/layout/DagreLayoutEngine');
        dagreLayoutEngine = layoutModule.dagreLayoutEngine;

        const renderModule = await import('../../src/render/SvgBuilder');
        svgBuilder = renderModule.svgBuilder;

        const themeModule = await import('../../src/themes/ClassicTheme');
        ClassicTheme = themeModule.ClassicTheme;
    });

    it('8.3.4: Should render 3-level nested Deployment Diagram', async () => {
        const diagram = `
            %%{ c4: deployment }%%
            Node(aws, "AWS Cloud", "Cloud Provider") {
                Node(region, "US-East-1", "Region") {
                    Node(k8s, "EKS Cluster", "K8s") {
                        Container(api, "API Service", "Spring Boot")
                        Container(db, "Database", "PostgreSQL")
                    }
                }
            }
        `;
        
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        
        // Verify Model Structure (Tree)
        assert.strictEqual(model.views[0].elements.length, 1, 'Should have 1 top-level node');
        const aws = model.views[0].elements[0];
        assert.strictEqual(aws.id, 'aws');
        assert.strictEqual(aws.children?.length, 1, 'AWS should have 1 child');
        const region = aws.children![0];
        assert.strictEqual(region.id, 'region');
        assert.strictEqual(region.children?.length, 1, 'Region should have 1 child');
        const k8s = region.children![0];
        assert.strictEqual(k8s.id, 'k8s');
        assert.strictEqual(k8s.children?.length, 2, 'K8s should have 2 children');

        // Verify Layout (Flattened)
        const layout = dagreLayoutEngine.layoutSync(model.views[0]);
        // Should contain: aws, region, k8s, api, db (5 elements)
        assert.strictEqual(layout.elements.length, 5, 'Layout should contain all 5 elements');
        
        // Check nesting geometry
        const posMap = new Map<string, any>(layout.elements.map((e: any) => [e.id, e]));
        const pAws = posMap.get('aws');
        const pRegion = posMap.get('region');
        const pK8s = posMap.get('k8s');
        const pApi = posMap.get('api');

        // Check nesting geometry
        assert.ok(pAws, 'AWS node found');
        assert.ok(pRegion, 'Region node found');
        assert.ok(pK8s, 'K8s node found');
        assert.ok(pApi, 'API node found');

        // Region should be inside AWS
        assert.ok(pAws.width > pRegion.width, 'AWS should be wider than Region');
        assert.ok(pAws.height > pRegion.height, 'AWS should be taller than Region');
        
        // K8s should be inside Region
        assert.ok(pRegion.width > pK8s.width, 'Region should be wider than K8s');
        
        // API should be inside K8s
        assert.ok(pK8s.width > pApi.width, 'K8s should be wider than API Container');

        // Verify SVG Rendering
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });
        
        // Check for DeploymentNode styling (stroke color)
        // Classic DeploymentNode stroke is #666666
        assert.ok(svg.includes('stroke="#666666"'), 'SVG should contain DeploymentNode stroke color');
        
        // Check elements are rendered
        assert.ok(svg.includes('AWS Cloud'), 'Should render AWS label');
        assert.ok(svg.includes('US-East-1'), 'Should render Region label');
        assert.ok(svg.includes('EKS Cluster'), 'Should render K8s label');
        assert.ok(svg.includes('API Service'), 'Should render Container label');
    });
});
