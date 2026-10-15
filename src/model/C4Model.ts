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
    /** Source range in original file coordinates (native C4X only). */
    sourceRange?: SourceRange;
    /** Stable source identifier (native C4X only). */
    sourceId?: SourceId;
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
}

export interface C4Model {
    workspace: string;
    views: C4View[];
    /** Non-fatal import notes, e.g. a Structurizr `code` property C4X cannot use as a `$code` mapping. */
    warnings?: C4ModelWarning[];
}
