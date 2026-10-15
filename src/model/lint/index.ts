/**
 * C4X notation lint: a pure, VS Code-free rule engine over `C4Model`.
 *
 * `lintModel` checks a model against a rule catalogue with stable ids:
 * completeness (descriptions, technology, labelled relationships, external
 * marking, connected elements), level legality, and the coherence of a view
 * with itself (one container in scope, no reaching into another container, no
 * duplicate names, a declared level its elements reach, no part wired to its
 * whole). The nesting rules stay in `../c4Legality`; C4X-L006 only reports
 * their verdicts, and the coherence rules stay silent where it speaks.
 */
export { C4_REVIEW_CHECKLIST_URL, LINT_RULES, isLintRuleId, lintRule } from './catalogue';
export { findingAnchor, lintModel, normalizeLintOptions } from './lintModel';
export { crossesProcessBoundary } from './rules';
export { LINT_RULE_SETTINGS } from './types';
export type {
    ChecklistReference,
    LintFinding,
    LintOptions,
    LintRuleDefinition,
    LintRuleId,
    LintRuleSetting,
    LintSeverity,
    LintTarget,
} from './types';
