import * as assert from 'assert';
// Mock vscode for tests that run outside VS Code context
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

// Set up mock before imports
if (typeof (global as any).vscode === 'undefined') {
  (global as any).vscode = mockVscode;
}

describe('Phase 8: Sprites & Icons System', () => {
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

    it('8.2.1: Should render Person with default sprite', async () => {
        const diagram = `
            %%{ c4: system-context }%%
            Person(user, "User", "Description")
        `;
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });

        // Check for class="element-icon" which indicates new sprite rendering
        assert.ok(svg.includes('class="element-icon"'), 'Should contain element-icon group');
        // Check for specific circle from the person sprite
        assert.ok(svg.includes('circle'), 'Should contain circle element from person sprite');
    });

    it('8.2.2: Should render custom sprite (e.g. database)', async () => {
        const diagram = `
            %%{ c4: container }%%
            Container(db, "DB", "PostgreSQL", "Stores data", $sprite="database")
        `;
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });

        assert.ok(svg.includes('class="element-icon"'), 'Should contain element-icon group');
        // Database sprite has a path, no circle
        assert.ok(svg.includes('<path d="M20,30'), 'Should contain database sprite path');
    });

    it('8.2.3: Should render generic element if sprite not found', async () => {
        // If sprite doesn't exist, it should fallback or render empty icon group?
        // Current implementation: getSprite returns undefined if not found.
        // renderNode checks: const spriteName = node.element.sprite ?? (node.element.type === 'Person' ? 'person' : undefined);
        // if (spriteName) -> renderIconNode.
        // If invalid sprite name, getSprite returns undefined. 
        // Then renderIconNode renders empty <g class="element-icon">
        
        const diagram = `
            %%{ c4: container }%%
            Container(app, "App", "Java", "Desc", $sprite="invalid-sprite-name")
        `;
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });

        // Since spriteName is "invalid-sprite-name" (truthy), it calls renderIconNode.
        // renderIconNode calls getSprite("invalid-sprite-name") -> undefined.
        // Then renders empty iconSvg.
        
        assert.ok(svg.includes('class="element-icon"'), 'Should attempt to render icon');
        
        // Extract the element-icon group content
        const match = svg.match(/<g class="element-icon">([\s\S]*?)<\/g>/);
        const iconContent = match ? match[1] : 'fail';
        assert.strictEqual(iconContent.trim(), '', 'Icon content should be empty');
    });

    it('8.2.4: Should resolve smart/fuzzy sprite names (aliasing)', async () => {
        // "s3" should resolve to "aws-s3" (or aws-amazon-s3 if old, but we optimized it)
        // With fuzzy lookup, even if key is "aws-s3", input "s3" should work.
        const diagram = `
            %%{ c4: container }%%
            Container(bucket, "Bucket", "S3", "Blob", $sprite="s3")
        `;
        const ast = c4xParser.parse(diagram);
        const model = c4ModelBuilder.build(ast, 'test');
        const layout = await dagreLayoutEngine.layout(model.views[0]);
        const svg = svgBuilder.build(layout, { theme: ClassicTheme });

        // Should find the sprite (not empty)
        assert.ok(svg.includes('class="element-icon"'), 'Icon group should exist');
        // If resolved, it should have paths.
        // AWS S3 path contains specific data? 
        // Let's just check it's not empty string content.
        const match = svg.match(/<g class="element-icon">([\s\S]*?)<\/g>/);
        assert.ok(match && match[1].trim().length > 10, 'Icon content should be populated for "s3" alias');
    });
});
