/**
 * C4X notation lint — the engine around the rules (#214): the catalogue,
 * settings, ordering, locations, scale, and the shipped samples at the default
 * severities.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import {
    C4_REVIEW_CHECKLIST_URL,
    LINT_RULES,
    LINT_RULE_SETTINGS,
    findingAnchor,
    isLintRuleId,
    lintModel,
    lintRule,
    normalizeLintOptions,
    type LintFinding,
} from '../../model/lint';
import { RULE_CHECKS } from '../../model/lint/rules';
import type { C4Model } from '../../model/C4Model';
import type { SourceRange } from '../../writeback/SourceRange';
import { generateLintModel, modelFromC4X } from './lint-fixtures';

const ROOT = path.resolve(__dirname, '../../..');

const BROKEN_CONTAINER_VIEW = [
    '%%{ c4: container }%%',
    'graph TB',
    '    Container(web, "Web")',
    '    web --> api',
    '    Container(api, "API", "Node.js", "JSON API")',
].join('\n');

function summary(findings: LintFinding[]): string[] {
    return findings.map(finding => `${finding.ruleId}/${finding.severity} ${finding.target.kind}:${finding.target.id}`);
}

function range(line: number, offset: number): SourceRange {
    return { start: { offset, line, column: 1 }, end: { offset: offset + 1, line, column: 2 } };
}

describe('C4X lint engine', () => {
    describe('catalogue', () => {
        it('has stable, unique ids, each with exactly one check', () => {
            const ids = LINT_RULES.map(rule => rule.id);

            assert.deepStrictEqual(ids, [
                'C4X-L001', 'C4X-L002', 'C4X-L003', 'C4X-L004', 'C4X-L005', 'C4X-L006', 'C4X-L008',
                'C4X-L101', 'C4X-L102', 'C4X-L103', 'C4X-L104', 'C4X-L105', 'C4X-L106',
            ]);
            assert.deepStrictEqual(Object.keys(RULE_CHECKS).sort(), [...ids].sort());
            assert.ok(!ids.includes('C4X-L007' as never), 'C4X-L007 is reserved for the view-title rule');
        });

        it('gives every rule a title, rationale, checklist question and a non-error default', () => {
            for (const rule of LINT_RULES) {
                assert.ok(rule.title.length > 0 && rule.rationale.length > 40 && rule.appliesTo.length > 0, rule.id);
                assert.strictEqual(rule.checklist.url, C4_REVIEW_CHECKLIST_URL, rule.id);
                assert.match(rule.checklist.item, /\?/, rule.id);
                assert.notStrictEqual(rule.defaultSeverity, 'error', `${rule.id} must not default to error`);
                assert.ok(rule.levels.length > 0, rule.id);
                for (const id of rule.structurizrEquivalent) {
                    assert.match(id, /^model\.[a-z]+\.[a-z]+$/, `${rule.id} names a Structurizr inspection id`);
                }
            }
        });

        it('looks rules up by id', () => {
            assert.strictEqual(lintRule('C4X-L003')?.title, 'Relationship has a label');
            assert.strictEqual(lintRule('C4X-L999'), undefined);
            assert.strictEqual(isLintRuleId('C4X-L102'), true);
            assert.strictEqual(isLintRuleId('C4X-L007'), false);
        });
    });

    describe('settings', () => {
        const model = () => modelFromC4X(BROKEN_CONTAINER_VIEW);

        it('reports every finding at its default severity when nothing is overridden', () => {
            assert.deepStrictEqual(summary(lintModel(model())), [
                'C4X-L001/info element:web',
                'C4X-L002/info element:web',
                'C4X-L003/info relationship:rel-0',
                'C4X-L004/info relationship:rel-0',
            ]);
        });

        it('honours a severity override and leaves the other rules at their defaults', () => {
            const findings = lintModel(model(), { rules: { 'C4X-L003': 'error', 'C4X-L001': 'warning' } });

            assert.deepStrictEqual(summary(findings), [
                'C4X-L001/warning element:web',
                'C4X-L002/info element:web',
                'C4X-L003/error relationship:rel-0',
                'C4X-L004/info relationship:rel-0',
            ]);
        });

        it('emits nothing for a rule set to off, or to its Structurizr alias ignore', () => {
            const off = lintModel(model(), { rules: { 'C4X-L003': 'off' } });
            const ignore = lintModel(model(), { rules: { 'C4X-L003': 'ignore' } });

            assert.deepStrictEqual(summary(off), ['C4X-L001/info element:web', 'C4X-L002/info element:web', 'C4X-L004/info relationship:rel-0']);
            assert.deepStrictEqual(ignore, off);
        });

        it('emits nothing at all when disabled, whatever the rule overrides say', () => {
            assert.deepStrictEqual(lintModel(model(), { enabled: false, rules: { 'C4X-L003': 'error' } }), []);
        });

        it('ignores an override with an unknown value or for an unknown rule', () => {
            const rules = { 'C4X-L003': 'fatal', 'C4X-L999': 'error' } as unknown as Record<string, 'error'>;
            assert.deepStrictEqual(lintModel(model(), { rules }), lintModel(model()));
        });

        it('normalises raw configuration, dropping anything malformed', () => {
            assert.deepStrictEqual(normalizeLintOptions(undefined, undefined), { enabled: true, rules: {} });
            assert.deepStrictEqual(normalizeLintOptions(false, null), { enabled: false, rules: {} });
            assert.deepStrictEqual(normalizeLintOptions('false', ['C4X-L003']), { enabled: true, rules: {} });
            assert.deepStrictEqual(
                normalizeLintOptions(true, {
                    'C4X-L003': 'error',
                    'C4X-L008': 'ignore',
                    'C4X-L001': 'loud',
                    'C4X-L002': 3,
                    'C4X-L999': 'off',
                    'c4x-l004': 'off',
                }),
                { enabled: true, rules: { 'C4X-L003': 'error', 'C4X-L008': 'off' } },
            );
        });

        it('offers exactly the settings the manifest accepts', () => {
            assert.deepStrictEqual([...LINT_RULE_SETTINGS], ['off', 'ignore', 'info', 'warning', 'error']);
        });
    });

    describe('ordering', () => {
        it('returns the same findings in the same order every time', () => {
            const { source } = generateLintModel(60, 10);
            const first = lintModel(modelFromC4X(source));
            const second = lintModel(modelFromC4X(source));
            const reused = modelFromC4X(source);

            assert.ok(first.length > 100);
            assert.deepStrictEqual(second, first);
            assert.deepStrictEqual(lintModel(reused), lintModel(reused));
        });

        it('orders by source position, then catalogue order for the same target', () => {
            const findings = lintModel(modelFromC4X(BROKEN_CONTAINER_VIEW));
            const offsets = findings.map(finding => finding.range!.start.offset);

            assert.deepStrictEqual(offsets, [...offsets].sort((a, b) => a - b));
            // `web` (line 3) before the arrow (line 4); L001 before L002 on the same element.
            assert.deepStrictEqual(findings.map(finding => finding.range!.start.line), [3, 3, 4, 4]);
        });

        it('falls back to declaration order — elements, relationships, boundaries — without source ranges', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'container',
                    elements: [
                        { id: 'b', label: 'B', type: 'Container', technology: 'Go', description: 'B' },
                        { id: 'a', label: 'A', type: 'Container' },
                    ],
                    relationships: [{ id: 'r', from: 'b', to: 'a', label: '', relType: 'async' }],
                    boundaries: [{ id: 'cb', label: 'CB', boundaryType: 'Container_Boundary', elements: [] }],
                }],
            };

            assert.deepStrictEqual(summary(lintModel(model)), [
                'C4X-L001/info element:a',
                'C4X-L002/info element:a',
                'C4X-L003/info relationship:r',
                'C4X-L004/info relationship:r',
                'C4X-L006/info boundary:cb',
            ]);
            assert.ok(lintModel(model).every(finding => !('range' in finding)), 'no range key when the model has none');
        });

        it('puts a finding about the whole view before the other findings without a range', () => {
            const model: C4Model = {
                workspace: 'test',
                views: [{
                    type: 'component',
                    elements: [{ id: 'a', label: 'A', type: 'Component' }],
                    relationships: [],
                }],
            };

            assert.deepStrictEqual(summary(lintModel(model)), [
                'C4X-L101/info view:component',
                'C4X-L001/info element:a',
                'C4X-L002/info element:a',
                'C4X-L102/info element:a',
            ]);
        });

        it('puts findings with a source range before those without, and one view before the next', () => {
            const withRange: C4Model['views'][number] = {
                type: 'container',
                elements: [
                    { id: 'late', label: 'Late', type: 'Container', technology: 'Go', description: 'x', sourceRange: range(9, 90) },
                    { id: 'bare', label: 'Bare', type: 'Container', technology: 'Go' },
                    { id: 'early', label: 'Early', type: 'Container', technology: 'Go', sourceRange: range(2, 20) },
                ],
                relationships: [
                    { id: 'r1', from: 'late', to: 'bare', label: 'Calls the bare one', technology: 'gRPC', relType: 'uses' },
                    { id: 'r2', from: 'early', to: 'late', label: 'Calls the late one', technology: 'gRPC', relType: 'uses' },
                ],
            };
            const second: C4Model['views'][number] = {
                type: 'component',
                elements: [{ id: 'first', label: 'First', type: 'Component', technology: 'Go', sourceRange: range(1, 0) }],
                relationships: [],
            };
            const findings = lintModel({ workspace: 'test', views: [withRange, second] });

            assert.deepStrictEqual(summary(findings), [
                'C4X-L001/info element:early',
                'C4X-L001/info element:bare',
                'C4X-L001/info element:first',
                'C4X-L102/info element:first',
                // A view-level finding has no range, so it follows the ranged findings of its view.
                'C4X-L101/info view:component',
            ]);
        });
    });

    describe('findingAnchor', () => {
        const model: C4Model = {
            workspace: 'test',
            views: [
                { type: 'container', elements: [], relationships: [] },
                {
                    type: 'container',
                    elements: [
                        {
                            id: 'node', label: 'Node', type: 'DeploymentNode', sourceRange: range(3, 30),
                            children: [{ id: 'child', label: 'Child', type: 'Container', sourceRange: range(4, 40) }],
                        },
                        { id: 'bare', label: 'Bare', type: 'Container' },
                    ],
                    relationships: [
                        { id: 'from-child', from: 'child', to: 'bare', label: '', relType: 'uses' },
                        { id: 'to-child', from: 'bare', to: 'child', label: '', relType: 'uses' },
                        { id: 'bare-only', from: 'bare', to: 'bare', label: '', relType: 'uses' },
                    ],
                },
            ],
        };
        const finding = (kind: 'element' | 'relationship' | 'boundary', id: string, withRange?: SourceRange): LintFinding => ({
            ruleId: 'C4X-L003', severity: 'info', message: '', hint: '', target: { kind, id }, ...(withRange ? { range: withRange } : {}),
        });

        it('prefers the finding\'s own range', () => {
            assert.deepStrictEqual(findingAnchor(finding('relationship', 'from-child', range(7, 70)), model), range(7, 70));
        });

        it('falls back to the declaration of a relationship\'s source element, then its target, found in any view', () => {
            assert.deepStrictEqual(findingAnchor(finding('relationship', 'from-child'), model), range(4, 40));
            assert.deepStrictEqual(findingAnchor(finding('relationship', 'to-child'), model), range(4, 40));
        });

        it('has no location for an element or boundary without a range, or a relationship nobody declared', () => {
            assert.strictEqual(findingAnchor(finding('element', 'bare'), model), undefined);
            assert.strictEqual(findingAnchor(finding('boundary', 'b'), model), undefined);
            assert.strictEqual(findingAnchor(finding('relationship', 'bare-only'), model), undefined);
            assert.strictEqual(findingAnchor(finding('relationship', 'missing'), model), undefined);
        });
    });

    describe('scale', () => {
        it('lints a generated 200-element model completely, with every count predicted', () => {
            const generated = generateLintModel();
            const model = modelFromC4X(generated.source);
            const findings = lintModel(model);
            const counts: Record<string, number> = {};
            for (const finding of findings) {
                counts[finding.ruleId] = (counts[finding.ruleId] ?? 0) + 1;
            }

            assert.strictEqual(generated.elementCount, 200);
            assert.strictEqual(model.views[0].elements.length, 200);
            assert.strictEqual(model.views[0].relationships.length, generated.relationshipCount);
            assert.deepStrictEqual(counts, generated.expected);
        });
    });

    describe('shipped samples', () => {
        it('keeps the shipped samples free of warnings and errors at the default severities', () => {
            // Every default is `info` because the samples break most rules. Raising a default
            // must come with a clean corpus at the new severity, and this is where that shows.
            const sources: Array<{ file: string; text: string }> = [];
            const walk = (dir: string): void => {
                if (!fs.existsSync(dir)) {
                    return;
                }
                for (const entry of fs.readdirSync(dir)) {
                    const full = path.join(dir, entry);
                    if (fs.statSync(full).isDirectory()) {
                        walk(full);
                    } else if (entry.endsWith('.c4x')) {
                        sources.push({ file: full, text: fs.readFileSync(full, 'utf8') });
                    } else if (entry.endsWith('.md')) {
                        for (const match of fs.readFileSync(full, 'utf8').matchAll(/```c4x\n([\s\S]*?)\n```/g)) {
                            sources.push({ file: full, text: match[1] });
                        }
                    }
                }
            };
            ['examples', 'samples'].forEach(dir => walk(path.join(ROOT, dir)));

            assert.ok(sources.length >= 30, `found ${sources.length} C4X sources`);
            for (const { file, text } of sources) {
                const loud = lintModel(modelFromC4X(text)).filter(finding => finding.severity !== 'info');
                assert.deepStrictEqual(summary(loud), [], path.relative(ROOT, file));
            }
        });
    });
});
