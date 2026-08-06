import type { SourceRange, SourceId } from '../writeback/SourceRange';

export type C4ViewType = 'system-context' | 'container' | 'component' | 'deployment' | 'dynamic';

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
    children?: RawElement[];
    technology?: string;
    description?: string;
    metadata?: Record<string, string>;
    /** Raw Peggy location — populated by grammar actions, converted to sourceRange by C4XParser. */
    loc?: PegLocation;
    /** Stable source range in original (pre-injection) coordinates. Set by C4XParser. */
    sourceRange?: SourceRange;
    /** Stable identifier for this element's source site. Set by C4XParser. */
    sourceId?: SourceId;
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
