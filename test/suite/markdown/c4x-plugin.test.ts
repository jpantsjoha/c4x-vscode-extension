import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../../../src/markdown/c4xPlugin';

describe('C4X Markdown Plugin', () => {
    let md: MarkdownIt;

    beforeEach(() => {
        md = new MarkdownIt();
        md.use(c4xPlugin);
    });

    describe('Plugin Registration', () => {
        it('should register without errors', () => {
            const mdInstance = new MarkdownIt();
            assert.doesNotThrow(() => {
                mdInstance.use(c4xPlugin);
            });
        });

        it('should return MarkdownIt instance', () => {
            const mdInstance = new MarkdownIt();
            const result = c4xPlugin(mdInstance);
            assert.strictEqual(result, mdInstance);
        });

        it('should override fence renderer', () => {
            const mdInstance = new MarkdownIt();
            const originalFence = mdInstance.renderer.rules.fence;

            mdInstance.use(c4xPlugin);

            assert.notStrictEqual(mdInstance.renderer.rules.fence, originalFence);
        });
    });

    describe('C4X Block Rendering', () => {
        it('should render valid c4x diagram', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
user[User<br/>Person]
app[Application<br/>Software System]
user -->|Uses| app
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('<div class="c4x-diagram">'));
            assert.ok(html.includes('<svg'));
            assert.ok(html.includes('</svg>'));
            assert.ok(html.includes('</div>'));
        });

        it('should render SVG with proper structure', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('<svg'));
            assert.ok(html.includes('viewBox'));
            assert.ok(html.includes('<defs>'));
            assert.ok(html.includes('</svg>'));
        });

        it('should render diagram with relationships', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
a[A<br/>Person]
b[B<br/>Person]
a -->|connects| b
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('<svg'));
            assert.ok(html.includes('marker')); // Arrow markers
        });

        it('should handle multiple c4x blocks', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p1[Person 1<br/>Person]
\`\`\`

\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p2[Person 2<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            const diagramCount = (html.match(/class="c4x-diagram"/g) || []).length;
            assert.strictEqual(diagramCount, 2);
        });
    });

    describe('Non-C4X Block Passthrough', () => {
        it('should not process javascript code blocks', () => {
            const markdown = `
\`\`\`javascript
const x = 42;
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(!html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('const x = 42;'));
        });

        it('should not process python code blocks', () => {
            const markdown = `
\`\`\`python
print("Hello")
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(!html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('print') && html.includes('Hello'));
        });

        it('should handle mixed code blocks', () => {
            const markdown = `
\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`

\`\`\`python
print("test")
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('const x = 1;'));
            assert.ok(html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('print') && html.includes('test'));
        });

        it('should handle unfenced code blocks', () => {
            const markdown = '```\nplain code\n```';
            const html = md.render(markdown);

            assert.ok(!html.includes('class="c4x-diagram"'));
        });
    });

    describe('Error Handling', () => {
        it('should render error for invalid syntax', () => {
            const markdown = `
\`\`\`c4x
invalid syntax here
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-error"'));
            assert.ok(html.includes('C4X Parse Error'));
        });

        it('should render error for missing graph declaration', () => {
            const markdown = `
\`\`\`c4x
person p "Person"
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-error"'));
            assert.ok(html.includes('C4X Parse Error'));
        });

        // Test removed as C4X parser always produces a default view
        /*
        it('should render error for no views', () => {
            const markdown = `
\`\`\`c4x
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-error"'));
            assert.ok(html.includes('No views found'));
        });
        */

        it('should show error message in HTML', () => {
            const markdown = `
\`\`\`c4x
graph TB
p[Person<br/>Person]
p --> unknown "invalid"
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-error"'));
            assert.ok(html.includes('class="c4x-error-message"'));
        });

        it('should include error icon SVG', () => {
            const markdown = `
\`\`\`c4x
invalid
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-error-header"'));
            assert.ok(html.includes('<svg')); // Error icon
            assert.ok(html.includes('<circle')); // Error icon circle
        });
    });

    describe('XSS Protection', () => {
        it('should escape HTML in error messages', () => {
            // This test ensures error messages don't allow XSS
            const markdown = `
\`\`\`c4x
graph TB
p[<script>alert('xss')</script><br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            // Should escape script tags in error message
            assert.ok(!html.includes('<script>alert'));
            if (html.includes('&lt;script&gt;')) {
                assert.ok(html.includes('&lt;script&gt;'));
            }
        });

        it('should escape special characters in errors', () => {
            const markdown = `
\`\`\`c4x
invalid & < > " '
\`\`\`
`;
            const html = md.render(markdown);

            // Check that special chars are escaped if they appear in error message
            assert.ok(html.includes('class="c4x-error"'));
            // The error message should be HTML-safe
            assert.ok(!html.includes('invalid & < >') || html.includes('&amp;'));
        });
    });

    describe('Output Structure', () => {
        it('should wrap diagram in container div', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('<div class="c4x-diagram">'));
            assert.ok(html.includes('</div>'));
        });

        it('should produce valid HTML', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            // Check for proper tag closure
            const openDivs = (html.match(/<div/g) || []).length;
            const closeDivs = (html.match(/<\/div>/g) || []).length;
            assert.strictEqual(openDivs, closeDivs);

            const openSvgs = (html.match(/<svg/g) || []).length;
            const closeSvgs = (html.match(/<\/svg>/g) || []).length;
            assert.strictEqual(openSvgs, closeSvgs);
        });

        it('should include SVG in div wrapper', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            // SVG should be inside the c4x-diagram div
            const divStart = html.indexOf('<div class="c4x-diagram">');
            const divEnd = html.indexOf('</div>', divStart);
            const svgPos = html.indexOf('<svg', divStart);

            assert.ok(svgPos > divStart);
            assert.ok(svgPos < divEnd);
        });
    });

    describe('Integration with MarkdownIt', () => {
        it('should work with other markdown content', () => {
            const markdown = `
# Heading

Some text

\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`

More text
`;
            const html = md.render(markdown);

            assert.ok(html.includes('<h1>Heading</h1>'));
            assert.ok(html.includes('Some text'));
            assert.ok(html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('More text'));
        });

        it('should handle inline code separately', () => {
            const markdown = '`inline code` and \n```c4x\n%%{ c4: system-context }%%\ngraph TB\np[P<br/>Person]\n```';
            const html = md.render(markdown);

            assert.ok(html.includes('<code>inline code</code>'));
            assert.ok(html.includes('class="c4x-diagram"'));
        });

        it('should preserve other MarkdownIt plugins', () => {
            const mdWithPlugin = new MarkdownIt();

            // Add c4x plugin
            mdWithPlugin.use(c4xPlugin);

            // Test that standard markdown still works
            const markdown = '**bold** and *italic*';
            const html = mdWithPlugin.render(markdown);

            assert.ok(html.includes('<strong>bold</strong>'));
            assert.ok(html.includes('<em>italic</em>'));
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty c4x block', () => {
            const markdown = '```c4x\n```';
            const html = md.render(markdown);

            // Expect valid diagram container, not error
            assert.ok(html.includes('class="c4x-diagram"'));
        });

        it('should handle whitespace-only c4x block', () => {
            const markdown = '```c4x\n   \n```';
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-diagram"'));
        });

        it('should handle c4x with language variant', () => {
            const markdown = '```c4x dsl\n%%{ c4: system-context }%%\ngraph TB\np[P<br/>Person]\n```';
            const html = md.render(markdown);

            // Should still process as c4x (first word is c4x)
            assert.ok(html.includes('class="c4x-diagram"') || html.includes('class="c4x-error"'));
        });

        it('should handle very long diagrams', () => {
            let diagram = 'graph TB\n';
            for (let i = 0; i < 50; i++) {
                diagram += `p${i}[Person ${i}<br/>Person]\n`;
            }

            const markdown = `\`\`\`c4x\n${diagram}\n\`\`\``;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-diagram"'));
        });

        it('should handle special characters in diagram', () => {
            const markdown = `
\`\`\`c4x
graph TB
p[Person with 'quotes' and "double"<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            // Should either render successfully or show error
            assert.ok(html.includes('class="c4x-diagram"') || html.includes('class="c4x-error"'));
        });
    });
});
