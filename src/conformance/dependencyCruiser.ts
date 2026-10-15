/**
 * Export a component view as a dependency-cruiser allow-list (#219).
 *
 * Every declared relationship `a --> b` becomes one `allowed` rule: code in
 * a's `$code` globs may import code in b's. Each mapped element may import
 * itself. Anything else inside the mapped part of the repository is
 * reported by dependency-cruiser as `not-in-allowed`, which is exactly an
 * undeclared dependency. C4X ships no checker; the team's own gate runs it.
 *
 * Pure and VS Code-free, so the #216 headless CLI can reuse it.
 */

import { C4View } from '../model/C4Model';
import { globRoot, globsToRegex } from './globRegex';
import { ownedRegexes } from './ownership';
import { DEFAULT_TEST_EXCLUDE, codePathProblem } from '../model/codePaths';
import { ConformanceElement, ConformanceInputError, SourceSpan, codeElements, declaredRelationships, elementSpans } from './view';

/** The dependency-cruiser version this export was proven against (spike #217, dogfood #219). */
export const DEPENDENCY_CRUISER_VERSION = '18.4.0';

/**
 * TypeScript installed beside the checker. dependency-cruiser parses `.ts`
 * only when it can load `typescript` from its own install; without it a
 * TypeScript project cruises almost no modules and passes. Exact, like the
 * checker: the 5.x line the repository's lockfile resolves.
 */
export const TYPESCRIPT_VERSION = '5.9.3';

/** File name the export command writes, at the workspace root. */
export const CONFORMANCE_CONFIG_FILE = '.dependency-cruiser.c4x.json';

/** Test files and mocks: excluded by default, as in the #217 spike. */
export const DEFAULT_EXCLUDE = DEFAULT_TEST_EXCLUDE;

export interface DepCruisePathCondition {
    path?: string;
    pathNot?: string;
    dependencyTypes?: string[];
}

export interface DepCruiseAllowedRule {
    comment: string;
    from: DepCruisePathCondition;
    to: DepCruisePathCondition;
}

/** The subset of dependency-cruiser's configuration schema this export writes. */
export interface DepCruiseConfig {
    allowedSeverity: 'error';
    allowed: DepCruiseAllowedRule[];
    options: {
        tsPreCompilationDeps: boolean;
        doNotFollow: { path: string };
        exclude?: { path: string };
    };
}

export interface ConformanceExportOptions {
    /**
     * `checked` (default): `import type` counts as a dependency, because a
     * type in the wrong module is a placement problem (#217 row 3).
     * `ignored`: type-only imports always pass.
     */
    readonly typeOnly?: 'checked' | 'ignored';
    /** Regular expression for modules the checker skips; `''` excludes nothing. */
    readonly exclude?: string;
    /**
     * Globs naming the part of the repository under architectural control.
     * Defaults to the roots of the `$code` globs, e.g. `src/`.
     */
    readonly scope?: readonly string[];
}

/** A Component or Container whose dependencies the export cannot constrain. */
export interface UnmappedElement {
    readonly id: string;
    readonly label: string;
    readonly type: string;
    readonly span: SourceSpan;
}

/** A declared relationship that produced no rule, and why. */
export interface SkippedRelationship {
    readonly from: string;
    readonly to: string;
    readonly span: SourceSpan;
    readonly reason: string;
}

export interface ConformanceExport {
    readonly config: DepCruiseConfig;
    /** Elements that produced rules, with the regular expression standing for each. */
    readonly mapped: ReadonlyArray<ConformanceElement & { readonly pathRegex: string }>;
    readonly unmapped: readonly UnmappedElement[];
    readonly skippedRelationships: readonly SkippedRelationship[];
    /** Number of `allowed` rules generated from declared relationships. */
    readonly relationshipRules: number;
    /** The scope roots, also the directories to cruise. */
    readonly scope: readonly string[];
    /** A command that runs the checker as a CI gate with this config. */
    readonly suggestedCommand: string;
}

/**
 * Build the allow-list. Throws `ConformanceInputError` (via callers) only for
 * structural problems; elements without `$code` are reported, not dropped.
 */
export function exportDependencyCruiserAllowList(
    view: C4View,
    options: ConformanceExportOptions = {},
): ConformanceExport {
    const elements = codeElements(view);
    const spans = elementSpans(view);
    // Each element's regex matches only the files it owns, so overlapping globs
    // never grant a file a second element's permissions (see ownership.ts).
    const mapped = ownedRegexes(elements).map(({ element, ownedRegex }) => ({ ...element, pathRegex: ownedRegex }));
    const unmapped: UnmappedElement[] = elements
        .filter(element => !element.codePaths || element.codePaths.length === 0)
        .map(({ id, label, type, span }) => ({ id, label, type, span }));
    const regexById = new Map(mapped.map(element => [element.id, element.pathRegex]));
    const typeById = new Map(elements.map(element => [element.id, element.type]));

    for (const glob of options.scope ?? []) {
        const problem = codePathProblem(glob);
        if (problem) {
            throw new ConformanceInputError(`Scope entry "${glob}" ${problem}`);
        }
    }
    const scopeGlobs = options.scope && options.scope.length > 0
        ? [...options.scope]
        : uniqueInOrder(mapped.flatMap(element => (element.codePaths ?? []).map(globRoot)));
    const scopeRegex = scopeGlobs.length > 0 ? globsToRegex(scopeGlobs) : undefined;

    const allowed: DepCruiseAllowedRule[] = [];
    if (scopeRegex) {
        allowed.push(
            {
                comment: `c4x: imports of anything outside ${scopeGlobs.join(', ')} (packages, Node built-ins, host APIs) are not constrained`,
                from: {},
                to: { pathNot: scopeRegex },
            },
            {
                comment: `c4x: code outside ${scopeGlobs.join(', ')} is not constrained`,
                from: { pathNot: scopeRegex },
                to: {},
            },
        );
    }
    if (options.typeOnly === 'ignored') {
        allowed.push({
            comment: 'c4x: type-only imports are not checked (typeOnly: ignored)',
            from: {},
            to: { dependencyTypes: ['type-only'] },
        });
    }
    for (const element of mapped) {
        allowed.push({
            comment: `c4x: same component ${element.id} (${element.label}) may import itself`,
            from: { path: element.pathRegex },
            to: { path: element.pathRegex },
        });
    }

    const skippedRelationships: SkippedRelationship[] = [];
    let relationshipRules = 0;
    const seenPairs = new Set<string>();
    for (const rel of declaredRelationships(view)) {
        const reason = skipReason(rel.from, rel.to, regexById, typeById, spans);
        if (reason) {
            skippedRelationships.push({ from: rel.from, to: rel.to, span: rel.span, reason });
            continue;
        }
        const pair = `${rel.from}\u0000${rel.to}`;
        if (seenPairs.has(pair)) {
            continue; // a second arrow between the same pair grants nothing new
        }
        seenPairs.add(pair);
        relationshipRules++;
        allowed.push({
            comment: `c4x: ${rel.from} -> ${rel.to}${rel.label ? ` (${rel.label})` : ''}, line ${rel.span.line}`,
            from: { path: regexById.get(rel.from) as string },
            to: { path: regexById.get(rel.to) as string },
        });
    }

    const exclude = options.exclude ?? DEFAULT_EXCLUDE;
    const config: DepCruiseConfig = {
        allowedSeverity: 'error',
        allowed,
        options: {
            tsPreCompilationDeps: true,
            doNotFollow: { path: 'node_modules' },
            ...(exclude ? { exclude: { path: exclude } } : {}),
        },
    };

    const cruiseTargets = scopeGlobs.map(glob => shellQuote(glob.replace(/\/$/, ''))).join(' ') || '.';
    return {
        config,
        mapped,
        unmapped,
        skippedRelationships,
        relationshipRules,
        scope: scopeGlobs,
        suggestedCommand: `npx --yes -p dependency-cruiser@${DEPENDENCY_CRUISER_VERSION} -p typescript@${TYPESCRIPT_VERSION} ` +
            `depcruise ${cruiseTargets} --config ${CONFORMANCE_CONFIG_FILE} --output-type err`,
    };
}

/** The exported configuration as written to disk: stable key order, two-space indent, final newline. */
export function serializeConfig(config: DepCruiseConfig): string {
    return `${JSON.stringify(config, null, 2)}\n`;
}

function skipReason(
    from: string,
    to: string,
    regexById: ReadonlyMap<string, string>,
    typeById: ReadonlyMap<string, string>,
    spans: ReadonlyMap<string, SourceSpan>,
): string | undefined {
    if (from === to) {
        return 'a relationship from an element to itself grants nothing beyond the same-component rule';
    }
    for (const end of [from, to]) {
        if (!typeById.has(end)) {
            return spans.has(end)
                ? `${end} is not a Container or Component, so it has no code to check`
                : `${end} is not in this view`;
        }
        if (!regexById.has(end)) {
            return `${end} has no $code mapping`;
        }
    }
    return undefined;
}

/**
 * POSIX single-quoting. `$code` validation already rejects quotes and shell
 * metacharacters; quoting is the second layer, because the command is copied
 * to the clipboard for a terminal.
 */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

function uniqueInOrder(values: readonly string[]): string[] {
    return [...new Set(values)];
}
