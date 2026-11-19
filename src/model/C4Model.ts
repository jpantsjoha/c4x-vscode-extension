import { C4ViewType } from '../parser';
import type { SourceRange, SourceId } from '../writeback/SourceRange';
import type { C4ModelWarning } from './modelWarnings';

export type C4ElementType = 'Person' | 'SoftwareSystem' | 'Container' | 'Component' | 'DeploymentNode';

export type RelType = 'uses' | 'async' | 'sync';

export interface C4Element {
    id: string;
    label: string;
    type: C4ElementType;
    tags?: string[];
    technology?: string;
    description?: string;
    sprite?: string;
    /**
     * Workspace-relative globs naming the source code this element owns, from
     * `$code="..."` (C4X) or a `code` property (Structurizr). Present only on
     * Containers and Components that declare a mapping; see `codePaths.ts`.
     */
    codePaths?: string[];
    children?: C4Element[];
    metadata?: Record<string, string>;
    /**
     * The element's own `$shape` value as written (notation decision #320, Decision 3). Kept
     * unvalidated so Save can compare it; the style resolver validates it.
     */
    shape?: string;
    /**
     * Tags the builder injected from a `_Ext` or `Db` macro (`External`,
     * `Database`), as opposed to tags the author wrote. Style resolution puts
     * them in the implied position. Absent when there are none.
     */
    impliedTags?: string[];
    /**
     * Tags the element's macro requires (`External` for `_Ext`, `Database` for
     * `Db`), whether injected or authored. After a Save that drops one from
     * `$tags`, the builder injects it again. Absent for a plain macro.
     */
    macroTags?: string[];
    /**
     * `infrastructure` for an infrastructure node (#326): a DeploymentNode leaf
     * (DNS, load balancer, firewall) whose type line reads `[Infrastructure Node]`
     * and whose icon the c4-model theme centres under its text. No source
     * spelling sets it yet: the C4X `Infrastructure_Node` spelling changes the
     * generated reference, the MCP bundle and the skill references, and lands
     * separately. Absent for every other element.
     */
    nodeKind?: 'infrastructure';
    /** Source range in original file coordinates (native C4X only). */
    sourceRange?: SourceRange;
    /** Stable source identifier (native C4X only). */
    sourceId?: SourceId;
}

/** One `$key="value"` pair of an element style rule, in source order. */
export interface C4StyleProperty {
    readonly key: string;
    readonly value: string;
    readonly sourceRange?: SourceRange;
}

/**
 * A tag-keyed element style rule: `elementStyle <tag> $key="value", ...` in
 * C4X, or an imported equivalent (notation decision #320, Decision 3). Properties are kept as
 * written, in order, including keys the builder reported as unknown, so Save
 * can prove it preserved them; the resolver applies only valid ones.
 */
export interface C4ElementStyleRule {
    readonly tag: string;
    readonly properties: readonly C4StyleProperty[];
    readonly sourceRange?: SourceRange;
}

export type C4DiagnosticSeverity = 'error' | 'warning' | 'info';

/**
 * A located, non-fatal finding from building the model, such as an unknown
 * `elementStyle` key. The diagram still renders; editors and `c4x lint` show it.
 */
export interface C4ModelDiagnostic {
    /** Stable id, e.g. `C4X-L107`. */
    readonly code: string;
    readonly severity: C4DiagnosticSeverity;
    readonly message: string;
    readonly range?: SourceRange;
}

export interface C4Rel {
    id: string;
    from: string;
    to: string;
    label: string;
    technology?: string;
    relType: RelType;
    order?: number; // Sequence order for dynamic diagrams
    /** Source range in original file coordinates (native C4X only). */
    sourceRange?: SourceRange;
    /** Stable source identifier (native C4X only). */
    sourceId?: SourceId;
}

export interface C4Boundary {
    id: string;
    label: string;
    /**
     * The C4X keyword that declared the boundary — `System_Boundary`,
     * `Container_Boundary` or `Enterprise_Boundary`. Absent for an untyped
     * `subgraph`, whose C4 meaning the source does not state.
     */
    boundaryType?: string;
    /**
     * The identifier a typed boundary was declared with — `bank` in
     * `System_Boundary(bank, "Internet Banking")`. Absent for an untyped
     * `subgraph`, which has none. `id` is derived from the label instead.
     */
    alias?: string;
    direction?: string;
    elements: string[]; // IDs of elements within this boundary
    metadata?: Record<string, string>;
    /** Source range in original file coordinates (native C4X only). */
    sourceRange?: SourceRange;
    /** Stable source identifier (native C4X only). */
    sourceId?: SourceId;
}

export interface C4View {
    type: C4ViewType;
    /** User-specified layout direction, if any. Undefined means "auto-detect". */
    direction?: 'TB' | 'BT' | 'LR' | 'RL';
    elements: C4Element[];
    relationships: C4Rel[];
    boundaries?: C4Boundary[];
    /** Tag-keyed element style rules in declaration order; absent when there are none. */
    elementStyles?: C4ElementStyleRule[];
}

export interface C4Model {
    workspace: string;
    views: C4View[];
    /** Non-fatal import notes, e.g. a Structurizr `code` property C4X cannot use as a `$code` mapping. */
    warnings?: C4ModelWarning[];
    /** Located build findings (style keys, values, shapes); absent when there are none. */
    diagnostics?: C4ModelDiagnostic[];
}
