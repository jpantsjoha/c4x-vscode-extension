/**
 * The C4X lint catalogue is restated in the settings schema and in the rule
 * documentation. Each restatement is held to the catalogue here, so a rule
 * cannot be added, renamed or re-levelled in one place and not the others, and
 * every documented example does what the page says it does.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { LINT_RULES, LINT_RULE_SETTINGS, lintModel, type LintFinding } from '../../model/lint';
import { modelFromC4X } from './lint-fixtures';

const ROOT = path.resolve(__dirname, '../../..');

function summary(findings: LintFinding[]): string[] {
    return findings.map(finding => `${finding.ruleId}/${finding.severity} ${finding.target.kind}:${finding.target.id}`);
}

describe('C4X lint catalogue restatements', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const settings = manifest.contributes.configuration.properties;

    it('declares c4x.lint.enabled as an on-by-default boolean', () => {
        assert.strictEqual(settings['c4x.lint.enabled'].type, 'boolean');
        assert.strictEqual(settings['c4x.lint.enabled'].default, true);
    });

    it('declares one c4x.lint.rules property per rule, with the accepted values and the default', () => {
        const rules = settings['c4x.lint.rules'];
        assert.strictEqual(rules.type, 'object');
        assert.deepStrictEqual(rules.default, {});
        assert.strictEqual(rules.additionalProperties, false);
        assert.deepStrictEqual(Object.keys(rules.properties), LINT_RULES.map(rule => rule.id));
        for (const rule of LINT_RULES) {
            const property = rules.properties[rule.id];
            assert.deepStrictEqual(property.enum, [...LINT_RULE_SETTINGS], rule.id);
            assert.strictEqual(property.enumDescriptions.length, LINT_RULE_SETTINGS.length, rule.id);
            assert.strictEqual(property.description, `${rule.title}. Default: ${rule.defaultSeverity}.`, rule.id);
        }
    });

    it('documents every rule, its levels, default severity and Structurizr equivalent in docs/C4X-LINT-RULES.md', () => {
        const doc = fs.readFileSync(path.join(ROOT, 'docs/C4X-LINT-RULES.md'), 'utf8');
        const levelNames = new Map<string, string>([
            ['system-context', 'C1'], ['container', 'C2'], ['component', 'C3'], ['dynamic', 'dynamic'], ['deployment', 'deployment'],
        ]);
        for (const rule of LINT_RULES) {
            const row = doc.split('\n').find(line => line.startsWith(`| [${rule.id}](#`));
            assert.ok(row, `${rule.id} has a row in the rule table`);
            const cells = row.split('|').map(cell => cell.trim());
            assert.strictEqual(cells[2], rule.title, `${rule.id} title`);
            assert.strictEqual(cells[3], rule.levels.map(level => levelNames.get(level)).join(', '), `${rule.id} levels`);
            assert.strictEqual(cells[4], rule.defaultSeverity, `${rule.id} default severity`);
            const equivalent = rule.structurizrEquivalent.length > 0
                ? rule.structurizrEquivalent.map(id => `\`${id}\``).join(', ')
                : '—';
            assert.strictEqual(cells[5], equivalent, `${rule.id} Structurizr equivalent`);
            assert.ok(doc.includes(`## ${rule.id}\n`), `${rule.id} has its own section`);
        }
    });

    it('shows, for every rule, an example it reports and a fully clean fix', () => {
        const doc = fs.readFileSync(path.join(ROOT, 'docs/C4X-LINT-RULES.md'), 'utf8');
        const sections = doc.split(/^## (?=C4X-L\d{3}\n)/m).slice(1);
        assert.deepStrictEqual(sections.map(section => section.slice(0, 8)), LINT_RULES.map(rule => rule.id));

        for (const section of sections) {
            const ruleId = section.slice(0, 8);
            const examples = [...section.matchAll(/^(Reported|Clean)[^\n]*\n\n```c4x\n([\s\S]*?)\n```/gm)];
            const reported = examples.filter(example => example[1] === 'Reported');
            const clean = examples.filter(example => example[1] === 'Clean');
            assert.ok(reported.length > 0 && clean.length > 0, `${ruleId} shows both a reported and a clean example`);

            for (const example of reported) {
                const ruleIds = lintModel(modelFromC4X(example[2])).map(finding => finding.ruleId);
                assert.ok(ruleIds.includes(ruleId as never), `${ruleId}'s reported example reports it (got ${ruleIds.join(', ')})`);
            }
            for (const example of clean) {
                assert.deepStrictEqual(summary(lintModel(modelFromC4X(example[2]))), [], `${ruleId}'s clean example`);
            }
        }
    });
});
