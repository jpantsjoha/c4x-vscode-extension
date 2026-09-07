import * as assert from 'assert';
import { spawnSync } from 'child_process';
import MarkdownIt from 'markdown-it';

describe('Markdown export dependency security', () => {
    it('bounds processing of repeated mailto prefixes in untrusted Markdown', function () {
        this.timeout(6000);
        // A child process makes the deadline enforceable even when a vulnerable
        // synchronous parser blocks its event loop (GHSA-v245-v573-v5vm).
        const result = spawnSync(process.execPath, ['-e', `
            const MarkdownIt = require(${JSON.stringify(require.resolve('markdown-it'))});
            const md = new MarkdownIt({ linkify: true, typographer: true });
            const html = md.render('mailto:'.repeat(80000));
            if (!html.includes('mailto:')) process.exit(2);
        `], { timeout: 3000, encoding: 'utf8' });
        assert.ifError(result.error);
        assert.strictEqual(result.status, 0, result.stderr);
    });

    it('preserves normal autolinks and typographic export formatting', () => {
        const md = new MarkdownIt({ linkify: true, typographer: true });
        const html = md.render('Visit https://example.com or mailto:team@example.com. "Hello"');
        assert.ok(html.includes('href="https://example.com"'));
        assert.ok(html.includes('href="mailto:team@example.com"'));
        assert.ok(html.includes('“Hello”'));
    });
});
