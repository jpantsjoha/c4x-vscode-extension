import type { C4Element, C4Model, C4View } from '../C4Model';
import type { SourceRange } from '../../writeback/SourceRange';
import { LINT_RULES, isLintRuleId } from './catalogue';
import { RULE_CHECKS, type LintContext } from './rules';
import {
    LINT_RULE_SETTINGS,
    type LintFinding,
    type LintOptions,
    type LintRuleId,
    type LintRuleSetting,
    type LintSeverity,
} from './types';

interface OrderedFinding {
    readonly finding: LintFinding;
    readonly viewIndex: number;
    readonly offset: number;
    readonly ordinal: number;
    readonly ruleIndex: number;
}

function flattenElements(elements: readonly C4Element[], into: C4Element[] = []): C4Element[] {
    for (const element of elements) {
        into.push(element);
        if (element.children) {
            flattenElements(element.children, into);
        }
    }
    return into;
}

function createContext(view: C4View): LintContext {
    const elements = flattenElements(view.elements);
    const elementsById = new Map<string, C4Element>();
    for (const element of elements) {
        if (!elementsById.has(element.id)) {
            elementsById.set(element.id, element);
        }
    }
    return { view, elements, elementsById };
}

function isRuleSetting(value: unknown): value is LintRuleSetting {
    return typeof value === 'string' && (LINT_RULE_SETTINGS as readonly string[]).includes(value);
}

/** `ignore` is Structurizr's spelling of `off`; everything else is already canonical. */
function canonicalSetting(setting: LintRuleSetting): LintSeverity | 'off' {
    return setting === 'ignore' ? 'off' : setting;
}

/** The setting each rule runs at for these options. */
function resolveSettings(rules: LintOptions['rules']): ReadonlyMap<LintRuleId, LintSeverity | 'off'> {
    const settings = new Map<LintRuleId, LintSeverity | 'off'>();
    for (const rule of LINT_RULES) {
        const override = rules?.[rule.id];
        settings.set(rule.id, isRuleSetting(override) ? canonicalSetting(override) : rule.defaultSeverity);
    }
    return settings;
}

/**
 * Check a model against the C4X notation rule catalogue.
 *
 * Pure and VS Code-free: it reads the model, never the file system or settings,
 * and never throws for a well-formed model. A rule runs only on the view types
 * it lists; `options.enabled === false` returns nothing, and a rule set to
 * `off` (or its alias `ignore`) in `options.rules` is skipped.
 *
 * Findings are in a fixed order — view, then source position (targets without
 * a source range after those with one), then declaration order, then catalogue
 * order — so the same model always yields the same list.
 *
 * The rules are specified against models built from native C4X by
 * `C4ModelBuilder`. Models converted from Structurizr DSL or PlantUML carry the
 * system or container in scope as an ordinary element, which the scope rules
 * would misread; they are not linted in this increment.
 */
export function lintModel(model: C4Model, options: LintOptions = {}): LintFinding[] {
    if (options.enabled === false) {
        return [];
    }
    const settings = resolveSettings(options.rules);
    const ordered: OrderedFinding[] = [];

    model.views.forEach((view, viewIndex) => {
        const context = createContext(view);
        // A view-level finding has no source range; it comes first among the findings without one.
        const ordinals = new Map<string, number>([[`view:${view.type}`, -1]]);
        context.elements.forEach((element, index) => ordinals.set(`element:${element.id}`, index));
        view.relationships.forEach((rel, index) => ordinals.set(`relationship:${rel.id}`, context.elements.length + index));
        (view.boundaries ?? []).forEach((boundary, index) =>
            ordinals.set(`boundary:${boundary.id}`, context.elements.length + view.relationships.length + index));

        LINT_RULES.forEach((rule, ruleIndex) => {
            const setting = settings.get(rule.id);
            if (setting === undefined || setting === 'off' || !rule.levels.includes(view.type)) {
                return;
            }
            for (const raw of RULE_CHECKS[rule.id](context)) {
                ordered.push({
                    finding: { ruleId: rule.id, severity: setting, ...raw },
                    viewIndex,
                    offset: raw.range?.start.offset ?? Number.POSITIVE_INFINITY,
                    // Every rule targets this view, or an element, relationship or boundary of it.
                    ordinal: ordinals.get(`${raw.target.kind}:${raw.target.id}`)!,
                    ruleIndex,
                });
            }
        });
    });

    ordered.sort((a, b) =>
        a.viewIndex - b.viewIndex
        || compareNumbers(a.offset, b.offset)
        || compareNumbers(a.ordinal, b.ordinal)
        || a.ruleIndex - b.ruleIndex);
    return ordered.map(entry => entry.finding);
}

/** Numeric comparison that treats two infinities as equal instead of producing NaN. */
function compareNumbers(a: number, b: number): number {
    return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Where to report a finding when the editor needs a location: the target's own
 * range, else — for a relationship — the declaration of its source element,
 * then of its target element. Elements, boundaries and views have no fallback. `undefined` means the model has no location for
 * it at all, and the caller should fall back to the start of the file or fence.
 */
export function findingAnchor(finding: LintFinding, model: C4Model): SourceRange | undefined {
    if (finding.range) {
        return finding.range;
    }
    if (finding.target.kind !== 'relationship') {
        return undefined;
    }
    for (const view of model.views) {
        const rel = view.relationships.find(candidate => candidate.id === finding.target.id);
        if (!rel) {
            continue;
        }
        const elements = flattenElements(view.elements);
        const declaration = (id: string) => elements.find(element => element.id === id)?.sourceRange;
        return declaration(rel.from) ?? declaration(rel.to);
    }
    return undefined;
}

/**
 * Turn raw configuration values into lint options. Settings arrive as whatever
 * the user typed, so anything malformed is dropped rather than trusted: a
 * non-boolean `enabled` means enabled, and only known rule ids with a known
 * setting survive from `rules`, with `ignore` rewritten to `off`.
 */
export function normalizeLintOptions(enabled: unknown, rules: unknown): LintOptions {
    const accepted: Array<[LintRuleId, LintRuleSetting]> = [];
    if (typeof rules === 'object' && rules !== null && !Array.isArray(rules)) {
        for (const [id, value] of Object.entries(rules as Record<string, unknown>)) {
            if (isLintRuleId(id) && isRuleSetting(value)) {
                accepted.push([id, canonicalSetting(value)]);
            }
        }
    }
    return { enabled: enabled !== false, rules: Object.fromEntries(accepted) };
}
