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

describe('Phase 8.4: Dynamic Diagrams', () => {
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

    it('8.4.1: Should assign sequence numbers to relationships', async () => {
        const diagram = `
            %%{ c4: dynamic }%%
            Person(user, "User")
            System(app, "App")
            System(db, "Database")
            
            user -->|Login| app
            app -->|Select *| db
            db -.->|Result| app
        `;
        
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        
        const rels = model.views[0].relationships;
        assert.strictEqual(rels.length, 3);
        assert.strictEqual(rels[0].order, 1, 'First rel should be 1');
        assert.strictEqual(rels[1].order, 2, 'Second rel should be 2');
        assert.strictEqual(rels[2].order, 3, 'Third rel should be 3');
    });

    it('8.4.2: Should render sequence numbers in SVG', async () => {
        const diagram = `
            %%{ c4: dynamic }%%
            Person(a, "A")
            Person(b, "B")
            a --> b
        `;
        
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });
        
        // Should contain "1:" label (auto-numbered, empty label)
        assert.ok(svg.includes('>1: </text>'), 'SVG should contain sequence number 1:');
    });
    
    it('8.4.2: Should render sequence numbers with labels in SVG', async () => {
        const diagram = `
            %%{ c4: dynamic }%%
            Person(a, "A")
            Person(b, "B")
            a -->|Calls| b
        `;
        
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });
        
        assert.ok(svg.includes('>1: Calls</text>'), 'SVG should contain "1: Calls"');
    });
});
