import type { C4ViewType } from '../../parser/types';
import type { SourceRange } from '../../writeback/SourceRange';

/**
 * Severity a lint finding is reported at. The names are the ones users type in
 * `c4x.lint.rules`; the VS Code layer maps them onto `DiagnosticSeverity`.
 */
export type LintSeverity = 'info' | 'warning' | 'error';

/**
 * A per-rule setting: a severity override, or `off` to suppress the rule.
 * `ignore` is Structurizr's word for `off` and means exactly the same.
 */
export type LintRuleSetting = LintSeverity | 'off' | 'ignore';

/** Every value `c4x.lint.rules` accepts, in the order the settings schema lists them. */
export const LINT_RULE_SETTINGS: readonly LintRuleSetting[] = ['off', 'ignore', 'info', 'warning', 'error'];

/**
 * Stable rule identifiers. An id is never reused for a different check.
 * `C4X-L007` is reserved for a view-title rule. `C4X-L1xx` are the coherence
 * rules (#215): they check that a view is consistent with itself, where the
 * `C4X-L0xx` rules check that it is complete and legal.
 */
export type LintRuleId =
    | 'C4X-L001'
    | 'C4X-L002'
    | 'C4X-L003'
    | 'C4X-L004'
    | 'C4X-L005'
    | 'C4X-L006'
    | 'C4X-L008'
    | 'C4X-L101'
    | 'C4X-L102'
    | 'C4X-L103'
    | 'C4X-L104'
    | 'C4X-L105'
    | 'C4X-L106';

/** A reference to the review-checklist question a rule makes executable. */
export interface ChecklistReference {
    /** The question, quoted from the checklist. */
    readonly item: string;
    /** Where the checklist is published. */
    readonly url: string;
}

/** One entry of the rule catalogue: data only, no behaviour. */
export interface LintRuleDefinition {
    readonly id: LintRuleId;
    /** Short imperative title, as shown in documentation. */
    readonly title: string;
    /** Severity used when `c4x.lint.rules` does not override the rule. Never `error`. */
    readonly defaultSeverity: LintSeverity;
    /** View types the rule runs on. A view of any other type is never checked. */
    readonly levels: readonly C4ViewType[];
    /** What the rule inspects, in words. */
    readonly appliesTo: string;
    /** Why a reader of the diagram is better off when the rule holds. */
    readonly rationale: string;
    readonly checklist: ChecklistReference;
    /**
     * The Structurizr workspace inspection that checks the same thing, so a
     * Structurizr user recognises the rule. Empty when Structurizr has none.
     */
    readonly structurizrEquivalent: readonly string[];
}

/**
 * What a finding points at. `id` is the model id of the element, relationship
 * or boundary. A `view` finding is about the view as a whole — its declared
 * level, or its scope — and its `id` is the view type; the model keeps no source
 * range for a view, so the editor reports it on the first line of the diagram,
 * which is where the level is declared.
 */
export interface LintTarget {
    readonly kind: 'element' | 'relationship' | 'boundary' | 'view';
    readonly id: string;
}

/** One rule violation. */
export interface LintFinding {
    readonly ruleId: LintRuleId;
    readonly severity: LintSeverity;
    /** What is wrong, naming the element or relationship. */
    readonly message: string;
    /** How to fix it, in C4X source terms. */
    readonly hint: string;
    readonly target: LintTarget;
    /** The target's own source range, when the model carries one (native C4X only). */
    readonly range?: SourceRange;
}

/**
 * Options for one lint run. Everything is optional: an empty object runs every
 * rule at its default severity.
 */
export interface LintOptions {
    /** `false` suppresses every rule. Defaults to `true`. */
    readonly enabled?: boolean;
    /** Per-rule overrides keyed by rule id. Unknown ids and values are ignored. */
    readonly rules?: Readonly<Record<string, LintRuleSetting>>;
}
