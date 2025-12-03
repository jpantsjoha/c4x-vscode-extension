export type C4ViewType = 'system-context' | 'container' | 'component';

export type RelationshipArrow = '-->' | '-.->' | '==>';

export interface RawElement {
    type: 'element';
    id: string;
    label: string;
    elementType: string;
    tags: string[];
}

export interface RawRelationship {
    type: 'relationship';
    from: string;
    to: string;
    arrow: RelationshipArrow;
    label: string;
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
    label: string;
    elements: RawElement[];
    relationships: RawRelationship[];
}

export interface ParseResult {
    viewType: C4ViewType;
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
