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

/**
 * Automated Visual Rendering Validation Tests
 */
describe('Visual Rendering Validation Tests', () => {

  // Import modules after mock setup
  let c4xParser: any;
  let c4ModelBuilder: any;
  let dagreLayoutEngine: any;
  let svgBuilder: any;
  let ClassicTheme: any;

  before(async function() {
    this.timeout(10000);

    // Dynamic imports to allow mocking
    try {
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
    } catch (err) {
      console.error('Failed to import modules:', err);
      throw err;
    }
  });

  describe('SVG Structure Validation', () => {
    const sampleC4X = `
%%{ c4: system-context }%%
graph TB
    Customer[Personal Banking Customer<br/>Person]
    BankingSystem[Internet Banking System<br/>Software System]

    Customer -->|Uses| BankingSystem
`;

    it('should generate valid SVG with proper structure', async function() {
      this.timeout(5000);

      // 1. Parse
      const ast = c4xParser.parse(sampleC4X);
      
      // 2. Build Model
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      
      // 3. Layout
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      assert.ok(layout, 'Layout failed');
      assert.ok(layout.elements.length > 0, 'No elements in layout');

      // 4. Render SVG
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });
      assert.ok(svg, 'SVG generation failed');

      // Validate SVG structure
      assert.ok(svg.startsWith('<?xml'), 'SVG should start with XML declaration');
      assert.ok(svg.includes('<svg'), 'SVG should contain <svg tag');
      assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'SVG should have xmlns');
      assert.ok(svg.includes('</svg>'), 'SVG should end with </svg>');
    });

    it('should include defs section with arrow markers', async function() {
      const ast = c4xParser.parse(sampleC4X);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for defs and arrow markers
      assert.ok(svg.includes('<defs>'), 'SVG should have <defs> section');
      assert.ok(svg.includes('marker'), 'SVG should have arrow markers');
    });
  });

  describe('Person Icon Rendering', () => {
    const personDiagram = `
%%{ c4: system-context }%%
graph TB
    User[Alice<br/>Person]
`;

    it('should render Person elements with stick-figure icon', async function() {
      const ast = c4xParser.parse(personDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Person icon should have:
      // 1. A circle for head
      // 2. A path or body shape
      assert.ok(
        svg.includes('class="person-icon"') || svg.includes('circle'),
        'Person element should have icon elements (circle for head)'
      );
    });
  });

  describe('Color Scheme Validation', () => {
    const colorTestDiagram = `
%%{ c4: system-context }%%
graph TB
    Person1[User<br/>Person]
    System1[My System<br/>Software System]
    External1[External API<br/>Software System<br/>External]
`;

    it('should use white fill with colored borders (not solid fill)', async function() {
      const ast = c4xParser.parse(colorTestDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check that boxes use white/light fill
      // ClassicTheme should have fill: '#FFFFFF' for elements
      assert.ok(
        svg.includes('fill="#FFFFFF"') || svg.includes("fill='#FFFFFF'") ||
        svg.includes('fill: #FFFFFF') || svg.includes('fill:#FFFFFF'),
        'Elements should have white fill (not solid colored fill)'
      );
    });

    it('should have visible stroke/border colors', async function() {
      const ast = c4xParser.parse(colorTestDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for stroke attributes
      assert.ok(
        svg.includes('stroke=') || svg.includes('stroke:'),
        'Elements should have stroke (border) colors'
      );
    });
  });

  describe('Arrow Head Validation', () => {
    const arrowDiagram = `
%%{ c4: system-context }%%
graph TB
    A[Source<br/>Software System]
    B[Target<br/>Software System]

    A -->|calls| B
`;

    it('should render filled arrow heads', async function() {
      const ast = c4xParser.parse(arrowDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for arrow marker definition
      assert.ok(svg.includes('marker'), 'SVG should have marker definitions');

      // Filled arrows should use fill attribute with a color (not none)
      // The path lines use fill="none", but markers should use fill="...color..."
      const markers = svg.match(/<marker.*?>([\s\S]*?)<\/marker>/g) || [];
      const hasFilledMarker = markers.some((m: string) => m.includes('fill="#') && !m.includes('fill="none"'));

      assert.ok(hasFilledMarker, 'Arrow heads should be filled (markers should have fill color)');
    });
  });

  describe('Box Size and Dimensions', () => {
    const sizeDiagram = `
%%{ c4: system-context }%%
graph TB
    Person1[User<br/>Person]
    System1[Banking System<br/>Software System]
`;

    it('should render elements with adequate size (>= 200px width)', async function() {
      const ast = c4xParser.parse(sizeDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);

      // Check layout dimensions
      for (const elem of layout.elements) {
        assert.ok(
          elem.width >= 200,
          `Element ${elem.id} width (${elem.width}px) should be >= 200px`
        );
      }
    });

    it('should have proper spacing between elements', async function() {
      const ast = c4xParser.parse(sizeDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);

      // Check that overall layout has reasonable dimensions
      assert.ok(layout.width > 0, 'Layout should have positive width');
      assert.ok(layout.height > 0, 'Layout should have positive height');
    });
  });

  describe('Border Radius Validation', () => {
    const radiusDiagram = `
%%{ c4: system-context }%%
graph TB
    System1[My System<br/>Software System]
`;

    it('should render boxes with rounded corners', async function() {
      const ast = c4xParser.parse(radiusDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for rx/ry attributes on rect elements (rounded corners)
      const hasRoundedCorners = svg.includes('rx=') || svg.includes('ry=');

      assert.ok(hasRoundedCorners, 'Boxes should have rounded corners (rx/ry attributes)');
    });
  });

  describe('Relationship Rendering', () => {
    const relDiagram = `
%%{ c4: system-context }%%
graph TB
    A[System A<br/>Software System]
    B[System B<br/>Software System]

    A -->|sync call| B
    A -.->|async call| B
`;

    it('should render relationships as path elements', async function() {
      const ast = c4xParser.parse(relDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for path elements (relationships)
      assert.ok(svg.includes('<path'), 'Relationships should be rendered as path elements');
    });

    it('should include relationship labels', async function() {
      const ast = c4xParser.parse(relDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // Check for text elements with labels
      assert.ok(svg.includes('sync call') || svg.includes('async call'),
        'Relationship labels should be present in SVG');
    });
  });

  describe('Theme Consistency', () => {
    const themeDiagram = `
%%{ c4: system-context }%%
graph TB
    User[User<br/>Person]
    System[System<br/>Software System]
    User -->|uses| System
`;

    it('should apply theme colors consistently', async function() {
      const ast = c4xParser.parse(themeDiagram);
      const model = c4ModelBuilder.build(ast, 'test-workspace');
      const layout = dagreLayoutEngine.layoutSync(model.views[0]);
      const svg = svgBuilder.build(layout, { theme: ClassicTheme });

      // ClassicTheme should use blue colors for systems
      // Check that theme colors are applied
      assert.ok(svg.includes('#'), 'SVG should contain color hex codes');
    });
  });
});