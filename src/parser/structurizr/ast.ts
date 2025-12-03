/**
 * Abstract Syntax Tree (AST) Node Types for Structurizr DSL
 * Defines the structure of parsed Structurizr DSL documents
 */

/**
 * Base interface for all AST nodes
 * Contains location information for error reporting
 */
export interface ASTNode {
    /** Type discriminator for AST node */
    type: string;

    /** Source location where this node appears */
    location: SourceLocation;
}

/**
 * Source location information for error reporting
 */
export interface SourceLocation {
    /** Line number (1-indexed) */
    line: number;

    /** Column number (1-indexed) */
    column: number;
}

/**
 * Root node representing a Structurizr workspace
 */
export interface WorkspaceNode extends ASTNode {
    type: 'workspace';

    /** Workspace name */
    name: string;

    /** Optional description */
    description?: string;

    /** Model block containing elements and relationships */
    model?: ModelNode;

    /** Views block containing view definitions */
    views?: ViewsNode;

    /** Styles block containing visual styling */
    styles?: StylesNode;
}

/**
 * Model block containing elements and relationships
 */
export interface ModelNode extends ASTNode {
    type: 'model';

    /** Top-level elements (people and software systems) */
    elements: ElementNode[];

    /** Relationships between elements */
    relationships: RelationshipNode[];
}

/**
 * Element node (person, softwareSystem, container, or component)
 */
export interface ElementNode extends ASTNode {
    type: 'element';

    /** Element type */
    elementType: 'person' | 'softwareSystem' | 'container' | 'component';

    /** Unique identifier */
    identifier: string;

    /** Display name */
    name: string;

    /** Optional description */
    description?: string;

    /** Technology (for containers and components) */
    technology?: string;

    /** Tags for styling */
    tags?: string[];

    /** URL for documentation */
    url?: string;

    /** Properties (key-value pairs) */
    properties?: Record<string, string>;

    /** Nested child elements (containers in systems, components in containers) */
    children?: ElementNode[];
}

/**
 * Relationship node representing a connection between elements
 */
export interface RelationshipNode extends ASTNode {
    type: 'relationship';

    /** Source element identifier */
    source: string;

    /** Destination element identifier */
    destination: string;

    /** Description of the relationship */
    description?: string;

    /** Technology used (e.g., "HTTPS", "Message Queue") */
    technology?: string;

    /** Tags for styling */
    tags?: string[];

    /** URL for documentation */
    url?: string;

    /** Properties (key-value pairs) */
    properties?: Record<string, string>;
}

/**
 * Views block containing view definitions
 */
export interface ViewsNode extends ASTNode {
    type: 'views';

    /** List of view definitions */
    views: ViewNode[];
}

/**
 * View node representing a diagram view
 */
export interface ViewNode extends ASTNode {
    type: 'view';

    /** View type */
    viewType: 'systemContext' | 'container' | 'component' | 'systemLandscape' | 'deployment' | 'dynamic' | 'filtered';

    /** Scope element identifier (for context, container, component views) */
    scope?: string;

    /** View key (unique identifier) */
    key: string;

    /** View description */
    description?: string;

    /** Element identifiers to include (supports wildcard *) */
    include?: string[];

    /** Element identifiers to exclude */
    exclude?: string[];

    /** Auto-layout direction */
    autoLayout?: AutoLayoutNode;

    /** Title override */
    title?: string;

    /** Properties (key-value pairs) */
    properties?: Record<string, string>;
}

/**
 * Auto-layout configuration for views
 */
export interface AutoLayoutNode extends ASTNode {
    type: 'autoLayout';

    /** Layout direction (tb, bt, lr, rl) */
    direction?: 'tb' | 'bt' | 'lr' | 'rl';

    /** Rank separation */
    rankSeparation?: number;

    /** Node separation */
    nodeSeparation?: number;
}

/**
 * Styles block containing visual styling definitions
 */
export interface StylesNode extends ASTNode {
    type: 'styles';

    /** Element styles */
    elementStyles: ElementStyleNode[];

    /** Relationship styles */
    relationshipStyles: RelationshipStyleNode[];
}

/**
 * Element style definition
 */
export interface ElementStyleNode extends ASTNode {
    type: 'elementStyle';

    /** Tag to match */
    tag: string;

    /** Background color */
    background?: string;

    /** Text color */
    color?: string;

    /** Shape type */
    shape?: ShapeType;

    /** Icon URL */
    icon?: string;

    /** Font size */
    fontSize?: number;

    /** Border style */
    border?: 'solid' | 'dashed' | 'dotted';

    /** Border width */
    width?: number;

    /** Border height */
    height?: number;

    /** Metadata flag */
    metadata?: boolean;

    /** Description flag */
    description?: boolean;

    /** Properties (key-value pairs) */
    properties?: Record<string, string>;
}

/**
 * Relationship style definition
 */
export interface RelationshipStyleNode extends ASTNode {
    type: 'relationshipStyle';

    /** Tag to match */
    tag: string;

    /** Line color */
    color?: string;

    /** Line thickness (pixels) */
    thickness?: number;

    /** Line style */
    style?: 'solid' | 'dashed' | 'dotted';

    /** Font size */
    fontSize?: number;

    /** Line width */
    width?: number;

    /** Routing style */
    routing?: 'direct' | 'orthogonal' | 'curved';

    /** Position of label */
    position?: number;

    /** Properties (key-value pairs) */
    properties?: Record<string, string>;
}

/**
 * Shape types supported by Structurizr
 */
export type ShapeType =
    | 'Box'
    | 'RoundedBox'
    | 'Circle'
    | 'Ellipse'
    | 'Hexagon'
    | 'Cylinder'
    | 'Person'
    | 'Robot'
    | 'Folder'
    | 'WebBrowser'
    | 'MobileDevicePortrait'
    | 'MobileDeviceLandscape'
    | 'Pipe';

/**
 * Parser error for Structurizr DSL
 */
export class StructurizrParserError extends Error {
    constructor(
        message: string,
        public readonly location: SourceLocation
    ) {
        super(`${message} at ${location.line}:${location.column}`);
        this.name = 'StructurizrParserError';
    }
}
