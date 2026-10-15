/**
 * Headless lint core (#216): the findings the CLI and the MCP `lint_c4x` tool
 * report, with file-relative locations for `.c4x` files and Markdown fences.
 */
import * as assert from 'assert';
import {
    MODEL_RULE_ID,
    SYNTAX_RULE_ID,
    atOrAbove,
    lintC4xSource,
    lintFileText,
} from '../../cli/lintSource';
import { normalizeLintOptions } from '../../model/lint';
import { RULE_CHECKS } from '../../model/lint/rules';

const DEFAULTS = normalizeLintOptions(true, {});

/** One finding (C4X-L004, info) on line 5: a container-to-container arrow with no protocol. */
const NO_PROTOCOL = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(api, "API Application", "Java and Spring Boot", "Serves the API")',
    '    Container(db, "Database", "PostgreSQL", "Stores accounts")',
    '    api -->|Reads accounts from| db',
].join('\n');

const CLEAN = [
    '%%{ c4: system-context }%%',
    'graph TB',
    '    customer[Customer<br/>Person]',
    '    banking[Internet Banking<br/>Software System]',
    '    customer -->|Views balances using| banking',
].join('\n');

describe('Headless lint core (#216)', () => {
    describe('lintC4xSource', () => {
        it('reports nothing for a clean diagram and for a blank source', () => {
            assert.deepStrictEqual(lintC4xSource(CLEAN, DEFAULTS), []);
            assert.deepStrictEqual(lintC4xSource('  \n\n', DEFAULTS), []);
        });

        it('reports a rule finding with a 1-based location and an exclusive end column', () => {
            const [finding, ...rest] = lintC4xSource(NO_PROTOCOL, DEFAULTS);
            assert.strictEqual(rest.length, 0);
            assert.strictEqual(finding.ruleId, 'C4X-L004');
            assert.strictEqual(finding.severity, 'info');
            assert.strictEqual(finding.line, 5);
            assert.strictEqual(finding.column, 5);
            assert.strictEqual(finding.endLine, 5);
            assert.ok(finding.endColumn > finding.column);
            assert.ok(finding.hint.length > 0);
        });

        it('applies severity overrides and switches rules off', () => {
            const raised = lintC4xSource(NO_PROTOCOL, normalizeLintOptions(true, { 'C4X-L004': 'error' }));
            assert.deepStrictEqual(raised.map(f => f.severity), ['error']);
            assert.deepStrictEqual(lintC4xSource(NO_PROTOCOL, normalizeLintOptions(true, { 'C4X-L004': 'ignore' })), []);
            assert.deepStrictEqual(lintC4xSource(NO_PROTOCOL, normalizeLintOptions(false, {})), []);
        });

        it('reports a syntax error as C4X-SYNTAX at error, even with lint disabled', () => {
            const source = 'graph TB\nNotARealElement[]\n';
            for (const options of [DEFAULTS, normalizeLintOptions(false, {})]) {
                const [finding, ...rest] = lintC4xSource(source, options);
                assert.strictEqual(rest.length, 0);
                assert.strictEqual(finding.ruleId, SYNTAX_RULE_ID);
                assert.strictEqual(finding.severity, 'error');
                assert.strictEqual(finding.line, 2);
                assert.match(finding.message, /^C4X syntax error: /);
            }
        });

        it('reports a source the model builder rejects as C4X-MODEL at the start of the source', () => {
            const source = 'graph TB\n    a[A<br/>Person]\n    a -->|Uses for things| ghost\n';
            const [finding, ...rest] = lintC4xSource(source, DEFAULTS, 10);
            assert.strictEqual(rest.length, 0);
            assert.strictEqual(finding.ruleId, MODEL_RULE_ID);
            assert.strictEqual(finding.severity, 'error');
            assert.strictEqual(finding.line, 11);
            assert.match(finding.message, /ghost/);
        });

        it('puts a whole-view finding with no source range on the first line of its source (#215 adds kind "view")', () => {
            const checks = RULE_CHECKS as Record<string, unknown>;
            const original = checks['C4X-L003'];
            // A target kind this engine does not know yet, as #215 introduces: no range, no anchor.
            checks['C4X-L003'] = () => [{ message: 'The view says nothing.', hint: 'Add more.', target: { kind: 'view', id: 'view-0' } }];
            try {
                const findings = lintC4xSource(CLEAN, DEFAULTS, 9).filter(f => f.ruleId === 'C4X-L003');
                assert.deepStrictEqual(findings.map(f => [f.line, f.column, f.endLine, f.endColumn]), [[10, 1, 10, 1]]);
            } finally {
                checks['C4X-L003'] = original;
            }
        });

        it('shifts every line by the offset of the source in its file', () => {
            const [finding] = lintC4xSource(NO_PROTOCOL, DEFAULTS, 7);
            assert.strictEqual(finding.line, 12);
            assert.strictEqual(finding.endLine, 12);
        });
    });

    describe('lintFileText', () => {
        it('lints a .c4x file as a whole', () => {
            assert.deepStrictEqual(
                lintFileText(NO_PROTOCOL, 'c4x', DEFAULTS).map(f => [f.ruleId, f.line]),
                [['C4X-L004', 5]],
            );
        });

        it('lints every c4x fence in Markdown at its line in the file, and nothing else', () => {
            const markdown = [
                '# Architecture',                // 1
                '',                              // 2
                '```c4x',                        // 3
                NO_PROTOCOL,                     // 4-8: finding on line 8
                '```',                           // 9
                '',                              // 10
                '```js',                         // 11
                'graph TB oops not c4x',         // 12
                '```',                           // 13
                '',                              // 14
                '~~~c4x',                        // 15
                'graph TB',                      // 16
                'NotARealElement[]',             // 17: syntax error
                '~~~',                           // 18
            ].join('\n');
            const findings = lintFileText(markdown, 'markdown', DEFAULTS);
            assert.deepStrictEqual(findings.map(f => [f.ruleId, f.line]), [['C4X-L004', 8], [SYNTAX_RULE_ID, 17]]);
        });

        it('stops at an unterminated fence, as the editor writeback scanner does', () => {
            const markdown = ['```text', 'never closed', '', '```c4x', 'graph TB', 'NotARealElement[]', '```'].join('\n');
            // CommonMark: the unclosed text fence swallows the rest of the document.
            assert.deepStrictEqual(lintFileText(markdown, 'markdown', DEFAULTS), []);
        });

        it('handles CRLF line endings in Markdown', () => {
            const markdown = ['Intro', '', '```c4x', NO_PROTOCOL, '```', ''].join('\r\n');
            assert.deepStrictEqual(lintFileText(markdown, 'markdown', DEFAULTS).map(f => f.line), [8]);
        });
    });

    it('orders severities info < warning < error', () => {
        assert.ok(atOrAbove('error', 'warning'));
        assert.ok(atOrAbove('warning', 'warning'));
        assert.ok(!atOrAbove('info', 'warning'));
        assert.ok(atOrAbove('info', 'info'));
    });
});
