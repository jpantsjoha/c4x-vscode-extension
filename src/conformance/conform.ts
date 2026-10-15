/**
 * `c4x conform --from depcruise.json`: interpret a dependency-cruiser result
 * against the component view it was generated from (#219).
 *
 * dependency-cruiser reports file edges with no line numbers. C4X owns the
 * interpretation:
 *   - each `not-in-allowed` violation maps file -> component through the
 *     `$code` globs, then component -> the element's `.c4x` source range. An
 *     undeclared dependency has no relationship line, so it lands on the
 *     source component;
 *   - component-level cycles and declared-but-unused relationships are
 *     computed here from the module graph, because neither dependency-cruiser
 *     nor ArchUnitTS reports them (#217).
 *
 * Pure and VS Code-free, so the #216 headless CLI can reuse it.
 */

import { C4View } from '../model/C4Model';
import { DEFAULT_EXCLUDE } from './dependencyCruiser';
import { ownedRegexes } from './ownership';
import {
    ConformanceElement,
    ConformanceInputError,
    FILE_START,
    SourceSpan,
    codeElements,
    declaredRelationships,
} from './view';

/** The fields of dependency-cruiser's JSON output (`--output-type json`) that C4X reads. */
export interface DepCruiseDependency {
    readonly resolved: string;
    readonly coreModule?: boolean;
    readonly couldNotResolve?: boolean;
    readonly dependencyTypes?: readonly string[];
}

export interface DepCruiseModule {
    readonly source: string;
    readonly dependencies?: readonly DepCruiseDependency[];
}

export interface DepCruiseViolation {
    readonly type?: string;
    readonly from: string;
    readonly to: string;
    readonly rule: { readonly name: string; readonly severity: string };
}

export interface DepCruiseResult {
    readonly modules?: readonly DepCruiseModule[];
    readonly summary: {
        readonly violations: readonly DepCruiseViolation[];
        readonly totalCruised?: number;
    };
}

export type FindingKind =
    | 'undeclared-dependency'
    | 'unmapped-file'
    | 'component-cycle'
    | 'unused-relationship'
    | 'unmapped-element'
    | 'checker-violation'
    | 'incomplete-cruise';

export type FindingSeverity = 'error' | 'warning' | 'info';

export interface FileEdge {
    readonly from: string;
    readonly to: string;
}

export interface ConformanceFinding {
    readonly kind: FindingKind;
    readonly severity: FindingSeverity;
    readonly message: string;
    /** Where the finding belongs in the `.c4x` file. */
    readonly span: SourceSpan;
    readonly elementId?: string;
    readonly components?: readonly string[];
    /** The file edges behind the finding, at most `MAX_EVIDENCE` of them. */
    readonly evidence?: readonly FileEdge[];
    /** Total file edges behind the finding, when `evidence` is truncated. */
    readonly edgeCount?: number;
}

export interface ConformOptions {
    /** Must match the export: `ignored` leaves type-only imports out of cycles and usage. */
    readonly typeOnly?: 'checked' | 'ignored';
    /**
     * How many source files the `$code` globs match on disk, when the caller
     * can count them. A result that covers far fewer is reported as an error:
     * the usual cause is a TypeScript project cruised without `typescript`
     * installed beside dependency-cruiser, which parses almost nothing and passes.
     */
    readonly expectedSourceFiles?: number;
}

/** Below this share of `expectedSourceFiles`, a cruise is treated as incomplete. */
export const MIN_CRUISE_COVERAGE = 0.5;

export interface ConformanceResult {
    readonly findings: readonly ConformanceFinding[];
    readonly errorCount: number;
    readonly warningCount: number;
    readonly infoCount: number;
    /** Component edges observed in the code, `from -> to` with their file-edge counts. */
    readonly observedEdges: ReadonlyArray<{ readonly from: string; readonly to: string; readonly fileEdges: number }>;
    readonly modulesCruised: number;
    /** Cruised modules that some element's `$code` owns. */
    readonly mappedModules: number;
    /** False when the input had no `modules` array, so cycles and usage were not computed. */
    readonly graphAvailable: boolean;
}

/** Evidence listed per finding; the rest is counted. */
export const MAX_EVIDENCE = 5;

/**
 * Maps file paths to the element that owns them, using exactly the regexes
 * the export writes (ownership.ts): the most specific glob wins, ties go to
 * the element declared first.
 */
export class FileComponentIndex {
    private readonly owners: ReadonlyArray<{ readonly id: string; readonly regex: RegExp }>;
    private readonly cache = new Map<string, string | undefined>();

    constructor(elements: readonly ConformanceElement[]) {
        this.owners = ownedRegexes(elements).map(({ element, ownedRegex }) => ({
            id: element.id,
            // The source is the author's own view. Every glob passed codePathProblem, which
            // caps it at MAX_WILDCARDS wildcards (about 10 ms worst case on a 200-character
            // path), and the regex has star height 1 with no quantified group.
            // eslint-disable-next-line security/detect-non-literal-regexp
            regex: new RegExp(ownedRegex),
        }));
    }

    /** The id of the element owning `file`, or undefined when no `$code` matches it. */
    public componentOf(file: string): string | undefined {
        const normalized = file.replace(/\\/g, '/').replace(/^\.\//, '');
        if (this.cache.has(normalized)) {
            return this.cache.get(normalized);
        }
        const owner = this.owners.find(candidate => candidate.regex.test(normalized))?.id;
        this.cache.set(normalized, owner);
        return owner;
    }
}

/** Parse and shape-check dependency-cruiser JSON text. */
export function parseDepCruiseResult(text: string): DepCruiseResult {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch (error) {
        throw new ConformanceInputError(`The dependency-cruiser result is not JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    const summary = (parsed as { summary?: { violations?: unknown } } | null)?.summary;
    if (!summary || !Array.isArray(summary.violations)) {
        throw new ConformanceInputError(
            'The file is not a dependency-cruiser JSON result (no summary.violations). Run dependency-cruiser with --output-type json.',
        );
    }
    return parsed as DepCruiseResult;
}

export function conformFromDependencyCruiser(
    view: C4View,
    result: DepCruiseResult,
    options: ConformOptions = {},
): ConformanceResult {
    const elements = codeElements(view);
    const byId = new Map(elements.map(element => [element.id, element]));
    const order = new Map(elements.map((element, index) => [element.id, index]));
    const index = new FileComponentIndex(elements);
    const findings: ConformanceFinding[] = [];

    // 1. Violations: undeclared component dependencies, grouped per component pair.
    const undeclared = new Map<string, { from: string; to: string | undefined; toFile?: string; edges: FileEdge[] }>();
    const unmappedFiles = new Map<string, FileEdge[]>();
    for (const violation of result.summary.violations) {
        const edge = { from: violation.from, to: violation.to };
        if (violation.rule.name !== 'not-in-allowed') {
            const owner = index.componentOf(violation.from);
            findings.push({
                kind: 'checker-violation',
                severity: violation.rule.severity === 'error' ? 'error' : violation.rule.severity === 'warn' ? 'warning' : 'info',
                message: `dependency-cruiser rule "${violation.rule.name}": ${violation.from} -> ${violation.to}`,
                span: owner ? (byId.get(owner)?.span ?? FILE_START) : FILE_START,
                elementId: owner,
                evidence: [edge],
            });
            continue;
        }
        const from = index.componentOf(violation.from);
        if (!from) {
            const edges = unmappedFiles.get(violation.from) ?? [];
            edges.push(edge);
            unmappedFiles.set(violation.from, edges);
            continue;
        }
        const to = index.componentOf(violation.to);
        const key = to ? `${from}\u0000${to}` : `${from}\u0000file:${violation.to}`;
        const group = undeclared.get(key) ?? { from, to, toFile: to ? undefined : violation.to, edges: [] };
        group.edges.push(edge);
        undeclared.set(key, group);
    }

    for (const group of undeclared.values()) {
        const source = byId.get(group.from) as ConformanceElement;
        const target = group.to ? byId.get(group.to) : undefined;
        const count = group.edges.length;
        const files = `${count} import${count === 1 ? '' : 's'}`;
        findings.push({
            kind: 'undeclared-dependency',
            severity: 'error',
            message: target
                ? `${source.id} depends on ${target.id} (${files}), but the view declares no ${source.id} --> ${target.id} relationship. Declare it, or remove the import.`
                : `${source.id} imports ${group.toFile}, which no element's $code maps. Map that file to a component, or remove the import.`,
            span: source.span,
            elementId: source.id,
            components: target ? [source.id, target.id] : [source.id],
            evidence: group.edges.slice(0, MAX_EVIDENCE),
            edgeCount: count,
        });
    }

    for (const [file, edges] of unmappedFiles) {
        findings.push({
            kind: 'unmapped-file',
            severity: 'error',
            message: `${file} is inside the checked scope but no element's $code maps it (${edges.length} import${edges.length === 1 ? '' : 's'} rejected). Add it to a component's $code.`,
            span: FILE_START,
            evidence: edges.slice(0, MAX_EVIDENCE),
            edgeCount: edges.length,
        });
    }

    // 2. The observed component graph, from every module edge.
    const observed = new Map<string, { from: string; to: string; edges: FileEdge[] }>();
    const graphAvailable = Array.isArray(result.modules);
    for (const module of result.modules ?? []) {
        const from = index.componentOf(module.source);
        if (!from) {
            continue;
        }
        for (const dependency of module.dependencies ?? []) {
            if (dependency.coreModule || dependency.couldNotResolve) {
                continue;
            }
            const types = dependency.dependencyTypes ?? [];
            // Same semantics as the exported `dependencyTypes: ['type-only']` pass-through rule.
            if (options.typeOnly === 'ignored' && types.includes('type-only')) {
                continue;
            }
            const to = index.componentOf(dependency.resolved);
            if (!to || to === from) {
                continue;
            }
            const key = `${from}\u0000${to}`;
            const entry = observed.get(key) ?? { from, to, edges: [] };
            entry.edges.push({ from: module.source, to: dependency.resolved });
            observed.set(key, entry);
        }
    }

    // 2b. Coverage: did the checker actually see the mapped code?
    const mappedModules = new Set<string>();
    const modulesPerElement = new Map<string, number>();
    for (const module of result.modules ?? []) {
        const owner = index.componentOf(module.source);
        if (owner) {
            mappedModules.add(module.source);
            modulesPerElement.set(owner, (modulesPerElement.get(owner) ?? 0) + 1);
        }
    }
    const expected = options.expectedSourceFiles;
    const hint = 'Run dependency-cruiser from the workspace root, on the folders the $code globs name, ' +
        'with typescript installed beside it (npx -p dependency-cruiser@... -p typescript@...) for a TypeScript project.';
    const anyMapped = elements.some(element => element.codePaths && element.codePaths.length > 0);
    const cruisedNothing = graphAvailable && anyMapped && mappedModules.size === 0;
    const cruisedTooLittle = graphAvailable && expected !== undefined && expected > 0 && mappedModules.size < expected * MIN_CRUISE_COVERAGE;
    // When the cruise missed most of the code, "no import behind this relationship"
    // says nothing about the code, so those warnings would only bury the real error.
    const coverageFailed = cruisedNothing || cruisedTooLittle;
    if (cruisedNothing) {
        findings.push({
            kind: 'incomplete-cruise',
            severity: 'error',
            message: `The dependency-cruiser result contains no module that any $code maps, so nothing was checked. ${hint}`,
            span: FILE_START,
        });
    } else if (cruisedTooLittle) {
        findings.push({
            kind: 'incomplete-cruise',
            severity: 'error',
            message: `The dependency-cruiser result covers ${mappedModules.size} of the ${expected} source files the $code globs match, so most code was not checked. ${hint}`,
            span: FILE_START,
        });
    } else if (graphAvailable) {
        for (const element of elements) {
            if (element.codePaths && element.codePaths.length > 0 && !modulesPerElement.has(element.id)) {
                findings.push({
                    kind: 'incomplete-cruise',
                    severity: 'warning',
                    message: `No file of ${element.id} appears in the dependency-cruiser result, so its imports were not checked. Check its $code globs and the folders cruised.`,
                    span: element.span,
                    elementId: element.id,
                });
            }
        }
    }

    // 2c. Every observed component edge must be declared, whether or not the
    // checker flagged it: a stale or hand-edited allow-list must not pass silently.
    const declaredPairs = new Set(declaredRelationships(view).map(rel => `${rel.from}\u0000${rel.to}`));
    for (const [key, edge] of observed) {
        if (declaredPairs.has(key) || undeclared.has(key)) {
            continue;
        }
        const count = edge.edges.length;
        findings.push({
            kind: 'undeclared-dependency',
            severity: 'error',
            message: `${edge.from} depends on ${edge.to} (${count} import${count === 1 ? '' : 's'}), but the view declares no ${edge.from} --> ${edge.to} relationship. ` +
                'dependency-cruiser did not report it, so its allow-list is out of date with this view: re-export it.',
            span: (byId.get(edge.from) as ConformanceElement).span,
            elementId: edge.from,
            components: [edge.from, edge.to],
            evidence: edge.edges.slice(0, MAX_EVIDENCE),
            edgeCount: count,
        });
    }

    if (graphAvailable) {
        // 3. Component-level cycles (strongly connected components of size > 1).
        const adjacency = new Map<string, string[]>();
        for (const { from, to } of observed.values()) {
            adjacency.set(from, [...(adjacency.get(from) ?? []), to]);
        }
        for (const members of stronglyConnectedComponents([...byId.keys()], adjacency)) {
            if (members.length < 2) {
                continue;
            }
            const sorted = [...members].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
            const path = shortestCycle(sorted[0], new Set(members), adjacency);
            const first = byId.get(sorted[0]) as ConformanceElement;
            findings.push({
                kind: 'component-cycle',
                severity: 'warning',
                message: `${members.length} components form a dependency cycle in the code: ${sorted.join(', ')}. Shortest cycle through ${first.id}: ${path.join(' -> ')}.`,
                span: first.span,
                elementId: first.id,
                components: sorted,
                evidence: path.slice(0, -1).map((from, i) => observed.get(`${from}\u0000${path[i + 1]}`)?.edges[0])
                    .filter((edge): edge is FileEdge => edge !== undefined),
            });
        }

        // 4. Declared relationships with no import behind them (meaningless on a failed cruise).
        const seen = new Set<string>();
        for (const rel of coverageFailed ? [] : declaredRelationships(view)) {
            const from = byId.get(rel.from);
            const to = byId.get(rel.to);
            const key = `${rel.from}\u0000${rel.to}`;
            if (!from?.codePaths || !to?.codePaths || rel.from === rel.to || seen.has(key)) {
                continue;
            }
            seen.add(key);
            if (!observed.has(key)) {
                findings.push({
                    kind: 'unused-relationship',
                    severity: 'warning',
                    message: `The view declares ${rel.from} --> ${rel.to}, but no file of ${rel.from} imports a file of ${rel.to}. Remove the relationship, or confirm it is a runtime-only dependency.`,
                    span: rel.span,
                    components: [rel.from, rel.to],
                });
            }
        }
    }

    // 5. Elements whose dependencies nothing checks.
    for (const element of elements) {
        if (!element.codePaths || element.codePaths.length === 0) {
            findings.push({
                kind: 'unmapped-element',
                severity: 'info',
                message: `${element.id} (${element.type}) has no $code mapping, so its dependencies are not checked.`,
                span: element.span,
                elementId: element.id,
            });
        }
    }

    findings.sort((a, b) => a.span.line - b.span.line || a.span.column - b.span.column || severityRank(a.severity) - severityRank(b.severity));
    return {
        findings,
        errorCount: findings.filter(f => f.severity === 'error').length,
        warningCount: findings.filter(f => f.severity === 'warning').length,
        infoCount: findings.filter(f => f.severity === 'info').length,
        observedEdges: [...observed.values()]
            .map(({ from, to, edges }) => ({ from, to, fileEdges: edges.length }))
            .sort((a, b) => (order.get(a.from) ?? 0) - (order.get(b.from) ?? 0) || (order.get(a.to) ?? 0) - (order.get(b.to) ?? 0)),
        modulesCruised: result.summary.totalCruised ?? result.modules?.length ?? 0,
        mappedModules: mappedModules.size,
        graphAvailable,
    };
}

function severityRank(severity: FindingSeverity): number {
    return severity === 'error' ? 0 : severity === 'warning' ? 1 : 2;
}

/** Tarjan's algorithm, iterative-safe for the small graphs a C3 view yields. */
export function stronglyConnectedComponents(nodes: readonly string[], adjacency: ReadonlyMap<string, readonly string[]>): string[][] {
    let counter = 0;
    const indexOf = new Map<string, number>();
    const lowLink = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const result: string[][] = [];

    const visit = (node: string): void => {
        indexOf.set(node, counter);
        lowLink.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
        for (const next of adjacency.get(node) ?? []) {
            if (!indexOf.has(next)) {
                visit(next);
                lowLink.set(node, Math.min(lowLink.get(node) as number, lowLink.get(next) as number));
            } else if (onStack.has(next)) {
                lowLink.set(node, Math.min(lowLink.get(node) as number, indexOf.get(next) as number));
            }
        }
        if (lowLink.get(node) === indexOf.get(node)) {
            const component: string[] = [];
            let member: string;
            do {
                member = stack.pop() as string;
                onStack.delete(member);
                component.push(member);
            } while (member !== node);
            result.push(component);
        }
    };

    for (const node of nodes) {
        if (!indexOf.has(node)) {
            visit(node);
        }
    }
    return result;
}

/** Shortest cycle from `start` back to itself, staying inside `members`. */
function shortestCycle(start: string, members: ReadonlySet<string>, adjacency: ReadonlyMap<string, readonly string[]>): string[] {
    const previous = new Map<string, string>();
    const queue: string[] = [start];
    const visited = new Set<string>();
    while (queue.length > 0) {
        const node = queue.shift() as string;
        for (const next of adjacency.get(node) ?? []) {
            if (!members.has(next)) {
                continue;
            }
            if (next === start) {
                const path = [node];
                let cursor = node;
                while (cursor !== start) {
                    cursor = previous.get(cursor) as string;
                    path.unshift(cursor);
                }
                return [...path, start];
            }
            if (!visited.has(next)) {
                visited.add(next);
                previous.set(next, node);
                queue.push(next);
            }
        }
    }
    return [start, start];
}

/** Files dependency-cruiser parses (JavaScript and TypeScript families); declaration files are not modules. */
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|vue|svelte)$/;

/**
 * How many of `files` (workspace-relative paths found on disk) are source
 * files an element owns and the export does not exclude: the
 * `expectedSourceFiles` to pass to `conformFromDependencyCruiser`.
 */
export function countMappedSourceFiles(view: C4View, files: readonly string[], exclude: string = DEFAULT_EXCLUDE): number {
    const index = new FileComponentIndex(codeElements(view));
    // The default is a constant; a caller-supplied pattern is the caller's own configuration.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const excluded = exclude ? new RegExp(exclude) : undefined;
    const unique = new Set(files.map(file => file.replace(/\\/g, '/').replace(/^\.\//, '')));
    return [...unique].filter(file =>
        SOURCE_FILE.test(file) && !file.endsWith('.d.ts') && !excluded?.test(file) && index.componentOf(file) !== undefined,
    ).length;
}
