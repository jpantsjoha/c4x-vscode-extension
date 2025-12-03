/**
 * Token Types for Structurizr DSL Lexer
 * Defines all lexical tokens recognized by the Structurizr DSL parser
 */

/**
 * Token types enum representing all Structurizr DSL keywords, operators, and literals
 */
export enum TokenType {
    // Top-level keywords
    WORKSPACE = 'workspace',
    MODEL = 'model',
    VIEWS = 'views',
    STYLES = 'styles',

    // Element keywords
    PERSON = 'person',
    SOFTWARE_SYSTEM = 'softwareSystem',
    CONTAINER = 'container',
    COMPONENT = 'component',

    // View keywords
    SYSTEM_CONTEXT = 'systemContext',
    CONTAINER_VIEW = 'containerView',
    COMPONENT_VIEW = 'componentView',

    // View directives
    INCLUDE = 'include',
    EXCLUDE = 'exclude',
    AUTOLAYOUT = 'autoLayout',

    // Style keywords
    ELEMENT = 'element',
    RELATIONSHIP = 'relationship',
    BACKGROUND = 'background',
    COLOR = 'color',
    COLOUR = 'colour', // UK spelling
    SHAPE = 'shape',
    THICKNESS = 'thickness',
    STYLE = 'style',

    // Shape types
    SHAPE_BOX = 'Box',
    SHAPE_ROUNDED_BOX = 'RoundedBox',
    SHAPE_CIRCLE = 'Circle',
    SHAPE_ELLIPSE = 'Ellipse',
    SHAPE_HEXAGON = 'Hexagon',
    SHAPE_CYLINDER = 'Cylinder',
    SHAPE_PERSON = 'Person',
    SHAPE_ROBOT = 'Robot',
    SHAPE_FOLDER = 'Folder',
    SHAPE_WEB_BROWSER = 'WebBrowser',
    SHAPE_MOBILE_DEVICE_PORTRAIT = 'MobileDevicePortrait',
    SHAPE_MOBILE_DEVICE_LANDSCAPE = 'MobileDeviceLandscape',
    SHAPE_PIPE = 'Pipe',

    // Relationship line styles
    LINE_SOLID = 'Solid',
    LINE_DASHED = 'Dashed',
    LINE_DOTTED = 'Dotted',

    // Operators
    ARROW = '->',
    EQUALS = '=',
    BRACE_OPEN = '{',
    BRACE_CLOSE = '}',
    BRACKET_OPEN = '[',
    BRACKET_CLOSE = ']',
    PAREN_OPEN = '(',
    PAREN_CLOSE = ')',

    // Literals
    STRING = 'string',
    IDENTIFIER = 'identifier',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    URL = 'url',
    COLOR_HEX = 'color_hex', // #RRGGBB format

    // Special
    WILDCARD = '*',
    COMMA = ',',
    NEWLINE = 'newline',
    COMMENT = 'comment',
    EOF = 'eof',

    // Tags (special identifier with tags property)
    TAG = 'tag',
}

/**
 * Token interface representing a lexical token with position information
 */
export interface Token {
    /** Type of the token */
    type: TokenType;

    /** Literal value of the token */
    value: string;

    /** Line number where the token appears (1-indexed) */
    line: number;

    /** Column number where the token starts (1-indexed) */
    column: number;
}

/**
 * Lexer error thrown when invalid syntax is encountered
 */
export class StructurizrLexerError extends Error {
    constructor(
        message: string,
        public readonly line: number,
        public readonly column: number
    ) {
        super(`${message} at ${line}:${column}`);
        this.name = 'StructurizrLexerError';
    }
}

/**
 * Map of Structurizr DSL keywords to their token types
 * Used for keyword recognition during lexical analysis
 */
export const KEYWORDS: Record<string, TokenType> = {
    // Top-level
    'workspace': TokenType.WORKSPACE,
    'model': TokenType.MODEL,
    'views': TokenType.VIEWS,
    'styles': TokenType.STYLES,

    // Elements
    'person': TokenType.PERSON,
    'softwareSystem': TokenType.SOFTWARE_SYSTEM,
    'container': TokenType.CONTAINER,
    'component': TokenType.COMPONENT,

    // Views
    'systemContext': TokenType.SYSTEM_CONTEXT,
    'containerView': TokenType.CONTAINER_VIEW,
    'componentView': TokenType.COMPONENT_VIEW,

    // View directives
    'include': TokenType.INCLUDE,
    'exclude': TokenType.EXCLUDE,
    'autoLayout': TokenType.AUTOLAYOUT,

    // Styles
    'element': TokenType.ELEMENT,
    'relationship': TokenType.RELATIONSHIP,
    'background': TokenType.BACKGROUND,
    'color': TokenType.COLOR,
    'colour': TokenType.COLOUR,
    'shape': TokenType.SHAPE,
    'thickness': TokenType.THICKNESS,
    'style': TokenType.STYLE,

    // Shape types
    'Box': TokenType.SHAPE_BOX,
    'RoundedBox': TokenType.SHAPE_ROUNDED_BOX,
    'Circle': TokenType.SHAPE_CIRCLE,
    'Ellipse': TokenType.SHAPE_ELLIPSE,
    'Hexagon': TokenType.SHAPE_HEXAGON,
    'Cylinder': TokenType.SHAPE_CYLINDER,
    'Person': TokenType.SHAPE_PERSON,
    'Robot': TokenType.SHAPE_ROBOT,
    'Folder': TokenType.SHAPE_FOLDER,
    'WebBrowser': TokenType.SHAPE_WEB_BROWSER,
    'MobileDevicePortrait': TokenType.SHAPE_MOBILE_DEVICE_PORTRAIT,
    'MobileDeviceLandscape': TokenType.SHAPE_MOBILE_DEVICE_LANDSCAPE,
    'Pipe': TokenType.SHAPE_PIPE,

    // Line styles
    'Solid': TokenType.LINE_SOLID,
    'Dashed': TokenType.LINE_DASHED,
    'Dotted': TokenType.LINE_DOTTED,

    // Booleans
    'true': TokenType.BOOLEAN,
    'false': TokenType.BOOLEAN,
};

/**
 * Helper function to check if a string is a valid Structurizr keyword
 */
export function isKeyword(value: string): boolean {
    return value in KEYWORDS;
}

/**
 * Helper function to get the token type for a keyword
 * Returns null if the value is not a keyword
 */
export function getKeywordType(value: string): TokenType | null {
    return KEYWORDS[value] || null;
}
