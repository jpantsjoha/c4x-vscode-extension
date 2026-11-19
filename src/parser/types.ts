import type { SourceRange, SourceId } from '../writeback/SourceRange';

/** Every view a `%%{ c4: <view> }%%` line can declare. The type below is derived from this list, so the list cannot fall behind it. */
export const C4_VIEW_TYPES = ['system-context', 'container', 'component', 'deployment', 'dynamic'] as const;

export type C4ViewType = typeof C4_VIEW_TYPES[number];

export type RelationshipArrow = '-->' | '-.->' | '==>';

/** Raw position shape emitted by Peggy's location() helper — internal to the parser layer. */
export interface PegPosition {
    offset: number;
    line: number;
    column: number;
}

/** Raw location shape emitted by Peggy's location() helper — internal to the parser layer. */
export interface PegLocation {
    start: PegPosition;
    end: PegPosition;
}

export interface RawElement {
    type: 'element';
    id: string;
    label: string;
    elementType: string;
    tags: string[];
    sprite?: string;
    /** Raw `$code` attribute value, unsplit. C4ModelBuilder turns it into `codePaths`. */
    code?: string;
    children?: RawElement[];
    technology?: string;
    description?: string;
    metadata?: Record<string, string>;
    /** Raw `$shape` attribute value (last one written), unvalidated (notation decision #320). */
    shape?: string;
    /** Raw Peggy location of the last `$shape` pair; converted to `shapeRange` by C4XParser. */
    shapeLoc?: PegLocation;
    /** Source range of the last `$shape` pair, in original coordinates. Set by C4XParser. */
    shapeRange?: SourceRange;
    /**
     * Attribute keys written more than once on this element, with the range of
     * each repeat (notation decision #320, Decision 3). Only `$shape` repeats are reported.
     */
    duplicateKeys?: RawDuplicateKey[];
    /** Constructs inside a deployment Node body that the parser discards (#472). */
    droppedConstructs?: RawDroppedConstruct[];
    /** Raw Peggy location — populated by grammar actions, converted to sourceRange by C4XParser. */
    loc?: PegLocation;
    /** Stable source range in original (pre-injection) coordinates. Set by C4XParser. */
    sourceRange?: SourceRange;
    /** Stable identifier for this element's source site. Set by C4XParser. */
    sourceId?: SourceId;
}

/** A construct written inside a deployment `Node` body that is not drawn there (#472). */
export interface RawDroppedConstruct {
    /** `subgraph`, a `*_Boundary` keyword, or `direction`. */
    kind: string;
    loc?: PegLocation;
    sourceRange?: SourceRange;
}

/** A repeated attribute key on an element. */
export interface RawDuplicateKey {
    key: string;
    loc?: PegLocation;
    sourceRange?: SourceRange;
}

/** One `$key="value"` pair of an `elementStyle` statement, in source order. */
export interface RawStylePair {
    key: string;
    value: string;
    loc?: PegLocation;
    sourceRange?: SourceRange;
}

/** `elementStyle <Tag> $key="value", ...` (notation decision #320, Decision 3). */
export interface RawElementStyle {
    type: 'elementStyle';
    tag: string;
    properties: RawStylePair[];
    loc?: PegLocation;
    sourceRange?: SourceRange;
}

export interface RawRelationship {
    type: 'relationship';
    from: string;
    to: string;
    arrow: RelationshipArrow;
    label: string;
    /** Optional technology/protocol quoted after the label segment (e.g. `a -->|Uses| "HTTP" b`). */
    technology?: string;
    /** Raw Peggy location — populated by grammar actions, converted to sourceRange by C4XParser. */
    loc?: PegLocation;
    /** Stable source range in original (pre-injection) coordinates. Set by C4XParser. */
    sourceRange?: SourceRange;
    /** Stable identifier for this relationship's source site. Set by C4XParser. */
    sourceId?: SourceId;
}

export interface RawComment {
    type: 'comment';
}

export interface RawClassDefinition {
    type: 'classDef';
    name: string;
    styles?: string;
    /** Raw Peggy location; converted to sourceRange by C4XParser. */
    loc?: PegLocation;
    sourceRange?: SourceRange;
}

export interface RawClassAssignment {
    type: 'class';
    targets: string[];
    className: string;
}

export type RawStatement =
    | RawElement
    | RawRelationship
    | RawComment
    | RawClassDefinition
    | RawClassAssignment;

export interface RawBoundary {
    type: 'boundary';
    id?: string;
    label: string;
    boundaryType?: string;
    direction?: string;
    elements: RawElement[];
    /**
     * Boundaries declared directly inside this one (#339): `index` points into
     * `ParseResult.boundaries`; `afterElements` is how many of this boundary's
     * `elements` precede it in source, so membership keeps source order.
     */
    childBoundaries?: Array<{ index: number; afterElements: number }>;
    relationships: RawRelationship[];
    metadata?: Record<string, string>;
    /** Raw Peggy location — populated by grammar actions, converted to sourceRange by C4XParser. */
    loc?: PegLocation;
    /** Stable source range in original (pre-injection) coordinates. Set by C4XParser. */
    sourceRange?: SourceRange;
    /** Stable identifier for this boundary's source site. Set by C4XParser. */
    sourceId?: SourceId;
}

export interface ParseResult {
    viewType: C4ViewType;
    direction: 'TB' | 'BT' | 'LR' | 'RL';
    /** True when the user wrote an explicit `graph TB|LR|…` directive */
    hasExplicitDirection: boolean;
    elements: RawElement[];
    relationships: RawRelationship[];
    boundaries?: RawBoundary[];
    classDefinitions?: RawClassDefinition[];
    /** Top-level `elementStyle` statements in source order; absent when there are none. */
    elementStyles?: RawElementStyle[];
}

export interface ParseErrorLocation {
    line: number;
    column: number;
}

export class C4XParseError extends Error {
    public readonly location: ParseErrorLocation;

    constructor(message: string, location: ParseErrorLocation) {
        super(message);
        this.name = 'C4XParseError';
        this.location = location;
    }
}
