
import * as assert from 'assert';
import MarkdownIt from 'markdown-it';
import { c4xPlugin } from '../../src/markdown/c4xPlugin';

describe('Phase 8: Export & Markdown Capabilities', () => {
    let md: MarkdownIt;

    beforeEach(() => {
        md = new MarkdownIt();
        md.use(c4xPlugin);
    });

    describe('Markdown Plugin: PlantUML Support', () => {
        it('should render plantuml fenced blocks as C4X diagrams', () => {
            const markdown = `
\`\`\`plantuml
@startuml
Person(user, "User", "A user")
@enduml
\`\`\`
`;
            const html = md.render(markdown);

            // Should be intercepted by c4xPlugin and rendered as diagram
            assert.ok(html.includes('class="c4x-diagram"'), 'PlantUML block should be rendered as c4x-diagram');
            assert.ok(html.includes('<svg'), 'Should contain generated SVG');
            assert.ok(html.includes('User'), 'Should contain diagram label');
        });

        it('should still render c4x fenced blocks', () => {
            const markdown = `
\`\`\`c4x
%%{ c4: system-context }%%
graph TB
p[Person<br/>Person]
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('<svg'));
        });

        it('should ignore other languages', () => {
            const markdown = `
\`\`\`javascript
console.log('hello');
\`\`\`
`;
            const html = md.render(markdown);

            assert.ok(!html.includes('class="c4x-diagram"'));
            assert.ok(html.includes('console.log'));
        });
    });

    describe('Export Logic', () => {
        // We can't easily test HtmlExporter/PdfExporter full flow because of UI dependencies (showSaveDialog)
        // But we can verify the plugin logic they rely purely on is working.

        it('should verify markdown-it instance setup for exports', () => {
            // Emulate how Exporters setup markdown-it
            const exportMd = new MarkdownIt({ html: true, linkify: true, typographer: true });
            c4xPlugin(exportMd);

            const markdown = '```plantuml\nPerson(a, "A")\n```';
            const html = exportMd.render(markdown);

            assert.ok(html.includes('class="c4x-diagram"'), 'Export markdown instance should handle PlantUML');
        });
    });
});
