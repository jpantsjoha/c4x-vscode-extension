/**
 * The VS Code side of C4X notation lint (#214): findings become Problems-panel
 * diagnostics with the rule id as the code, the mapped severity, and a range in
 * document coordinates — including inside a Markdown fence.
 */
import * as assert from 'assert';

// Mock vscode before importing modules that depend on it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { DiagnosticSeverity, setConfigurationValueForTests } from '../__mocks__/vscode';
import { LINT_DIAGNOSTIC_SOURCE, lintDiagnostics, readLintOptions } from '../../diagnostics/lintDiagnostics';
import { C4XParser } from '../../parser/C4XParser';
import type { ParseResult } from '../../parser/types';

const parser = new C4XParser();

const SOURCE = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(web, "Web", "React", "Browser UI")',
    '    Container(api, "API", "Node.js", "JSON API")',
    '    web --> api',
].join('\n');

interface MockRange {
    start: { line: number; character: number };
    end: { line: number; character: number };
}

function span(range: unknown): string {
    const { start, end } = range as MockRange;
    return `${start.line}:${start.character}-${end.line}:${end.character}`;
}

describe('lint diagnostics', () => {
    afterEach(() => {
        setConfigurationValueForTests('lint.enabled', undefined);
        setConfigurationValueForTests('lint.rules', undefined);
    });

    it('turns findings into diagnostics with the rule id, the lint source and the finding\'s range', () => {
        const diagnostics = lintDiagnostics(parser.parse(SOURCE), {}, 0);

        assert.deepStrictEqual(diagnostics.map(diagnostic => diagnostic.code), ['C4X-L003', 'C4X-L004']);
        for (const diagnostic of diagnostics) {
            assert.strictEqual(diagnostic.source, LINT_DIAGNOSTIC_SOURCE);
            assert.strictEqual(diagnostic.severity, DiagnosticSeverity.Information);
            assert.strictEqual(span(diagnostic.range), '4:4-4:15');
        }
        assert.strictEqual(
            diagnostics[0].message,
            'Relationship web --> api has no label. Label it with the intent, read in the direction of the arrow: web -->|<intent>| api.',
        );
    });

    it('shifts every range by the line a Markdown fence starts on', () => {
        const diagnostics = lintDiagnostics(parser.parse(SOURCE), {}, 12);
        assert.deepStrictEqual(diagnostics.map(diagnostic => span(diagnostic.range)), ['16:4-16:15', '16:4-16:15']);
    });

    it('maps each severity onto VS Code\'s', () => {
        const diagnostics = lintDiagnostics(parser.parse(SOURCE), { rules: { 'C4X-L003': 'error', 'C4X-L004': 'warning' } }, 0);
        assert.deepStrictEqual(diagnostics.map(diagnostic => diagnostic.severity), [DiagnosticSeverity.Error, DiagnosticSeverity.Warning]);
    });

    it('underlines only the first line of a multi-line target such as a boundary block', () => {
        const source = [
            '%%{ c4: container }%%',
            'graph TB',
            '    Container_Boundary(api, "API Application") {',
            '        Component(auth, "Auth", "Spring Bean", "Checks tokens")',
            '    }',
        ].join('\n');
        const boundary = lintDiagnostics(parser.parse(source), {}, 0).find(diagnostic => diagnostic.code === 'C4X-L006');

        assert.ok(boundary);
        assert.strictEqual(span(boundary.range), `2:4-2:${Number.MAX_VALUE}`);
    });

    it('anchors a finding without a range on the declaring line, or on the first line of the source', () => {
        const parsed: ParseResult = {
            viewType: 'container',
            direction: 'TB',
            hasExplicitDirection: true,
            elements: [
                {
                    type: 'element', id: 'web', label: 'Web', elementType: 'Container', tags: [], technology: 'React', description: 'UI',
                    sourceRange: { start: { offset: 30, line: 3, column: 5 }, end: { offset: 60, line: 3, column: 35 } },
                },
                { type: 'element', id: 'api', label: 'API', elementType: 'Container', tags: [] },
            ],
            relationships: [{ type: 'relationship', from: 'web', to: 'api', arrow: '-->', label: 'Calls the API', technology: 'HTTPS' }],
        };
        const diagnostics = lintDiagnostics(parsed, { rules: { 'C4X-L003': 'info', 'C4X-L008': 'info' } }, 10);
        const anchored = lintDiagnostics(
            { ...parsed, relationships: [{ ...parsed.relationships[0], label: '' }] },
            { rules: { 'C4X-L001': 'off', 'C4X-L002': 'off', 'C4X-L004': 'off' } },
            10,
        );

        // api has no range and nothing to fall back to: the first line of the source.
        assert.deepStrictEqual(diagnostics.map(diagnostic => `${diagnostic.code} ${span(diagnostic.range)}`), [
            `C4X-L001 10:0-10:${Number.MAX_VALUE}`,
            `C4X-L002 10:0-10:${Number.MAX_VALUE}`,
        ]);
        // The unlabelled relationship has no range of its own: the line that declares `web`.
        assert.deepStrictEqual(anchored.map(diagnostic => `${diagnostic.code} ${span(diagnostic.range)}`), [
            `C4X-L003 12:0-12:${Number.MAX_VALUE}`,
        ]);
    });

    it('puts a finding about the whole view on the first line, where its level is declared (#215)', () => {
        const source = [
            '%%{ c4: container }%%',
            'graph TB',
            '    Person(customer, "Customer", "A customer")',
            '    System(bank, "Internet Banking", "Manages accounts")',
            '    customer -->|Views balances using| bank',
        ].join('\n');
        const diagnostics = lintDiagnostics(parser.parse(source), {}, 7);

        assert.deepStrictEqual(diagnostics.map(diagnostic => `${diagnostic.code} ${span(diagnostic.range)}`), [
            `C4X-L105 7:0-7:${Number.MAX_VALUE}`,
        ]);
    });

    it('emits nothing, rather than throwing, when turning a finding into a diagnostic fails', () => {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const mock = require('../__mocks__/vscode') as Record<'Diagnostic', unknown>;
        const original = mock.Diagnostic;
        mock.Diagnostic = class {
            constructor() {
                throw new Error('mapping failed');
            }
        };
        try {
            assert.deepStrictEqual(lintDiagnostics(parser.parse(SOURCE), {}, 0), []);
        } finally {
            mock.Diagnostic = original;
        }
        assert.strictEqual(lintDiagnostics(parser.parse(SOURCE), {}, 0).length, 2);
    });

    it('emits nothing when lint is disabled', () => {
        assert.deepStrictEqual(lintDiagnostics(parser.parse(SOURCE), { enabled: false }, 0), []);
    });

    it('emits nothing, rather than throwing, for a source the model builder rejects', () => {
        const parsed = parser.parse('%%{ c4: container }%%\ngraph TB\n    Container(web, "Web")\n    web --> ghost');
        assert.deepStrictEqual(lintDiagnostics(parsed, {}, 0), []);
    });

    it('reads c4x.lint.enabled and c4x.lint.rules, dropping malformed values', () => {
        assert.deepStrictEqual(readLintOptions(), { enabled: true, rules: {} });

        setConfigurationValueForTests('lint.enabled', false);
        setConfigurationValueForTests('lint.rules', { 'C4X-L003': 'ignore', 'C4X-L004': 'loud' });

        assert.deepStrictEqual(readLintOptions(), { enabled: false, rules: { 'C4X-L003': 'off' } });
    });
});
