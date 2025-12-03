/**
 * Structurizr DSL Parser
 * Recursive descent parser that builds an AST from tokens
 */

import { Token, TokenType } from './tokens';
import {
    WorkspaceNode,
    ModelNode,
    ElementNode,
    RelationshipNode,
    ViewsNode,
    ViewNode,
    StylesNode,
    ElementStyleNode,
    RelationshipStyleNode,
    AutoLayoutNode,
    StructurizrParserError,
    ShapeType,
} from './ast';

/**
 * Parser for Structurizr DSL
 * Builds an Abstract Syntax Tree from token stream
 */
export class StructurizrParser {
    private tokens: Token[];
    private current: number = 0;

    constructor(tokens: Token[]) {
        // Filter out comments and newlines for easier parsing
        this.tokens = tokens.filter(
            t => t.type !== TokenType.COMMENT && t.type !== TokenType.NEWLINE
        );
    }

    /**
     * Parse the token stream into a workspace AST
     */
    public parse(): WorkspaceNode {
        return this.parseWorkspace();
    }

    /**
     * Parse workspace block
     */
    private parseWorkspace(): WorkspaceNode {
        const startToken = this.expect(TokenType.WORKSPACE);
        const name = this.expect(TokenType.STRING).value;

        let description: string | undefined;

        // Optional description before opening brace
        if (this.check(TokenType.STRING)) {
            description = this.advance().value;
        }

        this.expect(TokenType.BRACE_OPEN);

        let model: ModelNode | undefined;
        let views: ViewsNode | undefined;
        let styles: StylesNode | undefined;

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (token.type === TokenType.MODEL) {
                model = this.parseModel();
            } else if (token.type === TokenType.VIEWS) {
                views = this.parseViews();
            } else if (token.type === TokenType.STYLES) {
                styles = this.parseStyles();
            } else {
                // Skip unknown tokens
                this.advance();
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'workspace',
            name,
            description,
            model,
            views,
            styles,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse model block
     */
    private parseModel(): ModelNode {
        const startToken = this.expect(TokenType.MODEL);
        this.expect(TokenType.BRACE_OPEN);

        const elements: ElementNode[] = [];
        const relationships: RelationshipNode[] = [];

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (this.isElementType(token.type)) {
                elements.push(this.parseElement());
            } else if (token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING) {
                // Check for assignment: identifier = type ...
                if (this.peekAhead(1)?.type === TokenType.EQUALS) {
                    const id = this.advance().value; // Consume identifier
                    this.advance(); // Consume =

                    // Now expect element type
                    if (this.isElementType(this.peek().type)) {
                        elements.push(this.parseElement(id));
                    } else {
                        // Invalid assignment
                        throw new StructurizrParserError(
                            `Expected element type after assignment, got ${this.peek().type}`,
                            { line: token.line, column: token.column }
                        );
                    }
                }
                // Check for relationship: identifier -> identifier
                else if (this.peekAhead(1)?.type === TokenType.ARROW) {
                    relationships.push(this.parseRelationship());
                } else {
                    // Unknown identifier, skip
                    this.advance();
                }
            } else {
                // Skip unknown tokens
                this.advance();
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'model',
            elements,
            relationships,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse element (person, softwareSystem, container, component)
     */
    private parseElement(explicitIdentifier?: string): ElementNode {
        const typeToken = this.advance();
        const elementType = this.getElementType(typeToken.type);

        let identifier: string;
        let name: string;

        if (explicitIdentifier) {
            identifier = explicitIdentifier;
            // If explicit ID provided (via assignment), next token is name (optional)
            if (this.check(TokenType.STRING)) {
                name = this.advance().value;
            } else {
                name = identifier;
            }
        } else {
            // Identifier
            if (this.check(TokenType.STRING)) {
                identifier = this.advance().value;
            } else {
                identifier = this.expect(TokenType.IDENTIFIER).value;
            }

            // Optional name (string)
            name = identifier;
            if (this.check(TokenType.STRING)) {
                name = this.advance().value;
            }
        }

        let description: string | undefined;
        let technology: string | undefined;
        let tags: string[] | undefined;
        let url: string | undefined;
        let properties: Record<string, string> | undefined;
        let children: ElementNode[] | undefined;

        // Optional body with properties and nested elements
        if (this.check(TokenType.BRACE_OPEN)) {
            this.advance();

            while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
                const token = this.peek();

                // Nested elements with assignment: identifier = type ...
                if ((token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING) &&
                    this.peekAhead(1)?.type === TokenType.EQUALS) {
                    const id = this.advance().value;
                    this.advance(); // Consume =

                    if (this.isElementType(this.peek().type)) {
                        if (!children) { children = []; }
                        children.push(this.parseElement(id));
                    } else {
                        // Invalid assignment or unknown token, backtrack/skip?
                        // For now, let's assume valid assignment if we see =
                        // But if type is not element type, it might be property?
                        // Properties are usually key value. key = value?
                        // Structurizr DSL properties are `key value`.
                        // So `id = type` is likely element assignment.
                        throw new StructurizrParserError(
                            `Expected element type after assignment, got ${this.peek().type}`,
                            { line: token.line, column: token.column }
                        );
                    }
                }
                // Nested elements (direct)
                else if (this.isElementType(token.type)) {
                    if (!children) { children = []; }
                    children.push(this.parseElement());
                }
                // Description (first string)
                else if (token.type === TokenType.STRING && !description) {
                    description = this.advance().value;
                }
                // Technology (second string or after description)
                else if (token.type === TokenType.STRING && description && !technology) {
                    technology = this.advance().value;
                }
                // Tags
                else if (token.type === TokenType.TAG ||
                    (token.type === TokenType.IDENTIFIER && token.value === 'tags')) {
                    this.advance(); // Skip 'tags' keyword if present
                    if (this.check(TokenType.STRING)) {
                        tags = this.advance().value.split(',').map(t => t.trim());
                    }
                }
                // URL
                else if (token.type === TokenType.URL ||
                    (token.type === TokenType.IDENTIFIER && token.value === 'url')) {
                    if (token.type === TokenType.IDENTIFIER) {
                        this.advance(); // Skip 'url' keyword
                    }
                    if (this.check(TokenType.URL) || this.check(TokenType.STRING)) {
                        url = this.advance().value;
                    }
                }
                // Relationships inside elements
                else if (token.type === TokenType.IDENTIFIER &&
                    this.peekAhead(1)?.type === TokenType.ARROW) {
                    // Skip relationships for now (handled at model level)
                    this.parseRelationship();
                }
                else {
                    this.advance(); // Skip unknown
                }
            }

            this.expect(TokenType.BRACE_CLOSE);
        }

        return {
            type: 'element',
            elementType,
            identifier,
            name,
            description,
            technology,
            tags,
            url,
            properties,
            children,
            location: { line: typeToken.line, column: typeToken.column },
        };
    }

    /**
     * Parse relationship (identifier -> identifier "description")
     */
    private parseRelationship(): RelationshipNode {
        let sourceToken = this.peek();
        let source: string;

        if (this.check(TokenType.STRING)) {
            sourceToken = this.advance();
            source = sourceToken.value;
        } else {
            sourceToken = this.expect(TokenType.IDENTIFIER);
            source = sourceToken.value;
        }

        this.expect(TokenType.ARROW);

        let destination: string;
        if (this.check(TokenType.STRING)) {
            destination = this.advance().value;
        } else {
            destination = this.expect(TokenType.IDENTIFIER).value;
        }

        let description: string | undefined;
        let technology: string | undefined;
        let tags: string[] | undefined;
        let url: string | undefined;

        // Optional description
        if (this.check(TokenType.STRING)) {
            description = this.advance().value;
        }

        // Optional technology (second string)
        if (this.check(TokenType.STRING)) {
            technology = this.advance().value;
        }

        // Optional body with properties
        if (this.check(TokenType.BRACE_OPEN)) {
            this.advance();

            while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
                const token = this.peek();

                if (token.type === TokenType.TAG ||
                    (token.type === TokenType.IDENTIFIER && token.value === 'tags')) {
                    this.advance();
                    if (this.check(TokenType.STRING)) {
                        tags = this.advance().value.split(',').map(t => t.trim());
                    }
                } else if (token.type === TokenType.URL ||
                    (token.type === TokenType.IDENTIFIER && token.value === 'url')) {
                    if (token.type === TokenType.IDENTIFIER) {
                        this.advance();
                    }
                    if (this.check(TokenType.URL) || this.check(TokenType.STRING)) {
                        url = this.advance().value;
                    }
                } else {
                    this.advance(); // Skip unknown
                }
            }

            this.expect(TokenType.BRACE_CLOSE);
        }

        return {
            type: 'relationship',
            source,
            destination,
            description,
            technology,
            tags,
            url,
            location: { line: sourceToken.line, column: sourceToken.column },
        };
    }

    /**
     * Parse views block
     */
    private parseViews(): ViewsNode {
        const startToken = this.expect(TokenType.VIEWS);
        this.expect(TokenType.BRACE_OPEN);

        const views: ViewNode[] = [];

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (this.isViewType(token.type)) {
                views.push(this.parseView());
            } else {
                this.advance(); // Skip unknown
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'views',
            views,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse view (systemContext, container, component)
     */
    private parseView(): ViewNode {
        const typeToken = this.advance();
        const viewType = this.getViewType(typeToken.type);

        // Scope element (for systemContext, container, component views)
        let scope: string | undefined;
        if (this.check(TokenType.IDENTIFIER)) {
            scope = this.advance().value;
        }

        // Key
        const key = this.check(TokenType.STRING) ? this.advance().value : (scope || 'default');

        let description: string | undefined;
        let include: string[] | undefined;
        let exclude: string[] | undefined;
        let autoLayout: AutoLayoutNode | undefined;
        let title: string | undefined;

        // Optional body
        if (this.check(TokenType.BRACE_OPEN)) {
            this.advance();

            while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
                const token = this.peek();

                if (token.type === TokenType.INCLUDE) {
                    this.advance(); // Skip 'include'
                    include = this.parseElementList();
                } else if (token.type === TokenType.EXCLUDE) {
                    this.advance(); // Skip 'exclude'
                    exclude = this.parseElementList();
                } else if (token.type === TokenType.AUTOLAYOUT) {
                    autoLayout = this.parseAutoLayout();
                } else if (token.type === TokenType.IDENTIFIER && token.value === 'title') {
                    this.advance(); // Skip 'title'
                    if (this.check(TokenType.STRING)) {
                        title = this.advance().value;
                    }
                } else if (token.type === TokenType.IDENTIFIER && token.value === 'description') {
                    this.advance(); // Skip 'description'
                    if (this.check(TokenType.STRING)) {
                        description = this.advance().value;
                    }
                } else {
                    this.advance(); // Skip unknown
                }
            }

            this.expect(TokenType.BRACE_CLOSE);
        }

        return {
            type: 'view',
            viewType,
            scope,
            key,
            description,
            include,
            exclude,
            autoLayout,
            title,
            location: { line: typeToken.line, column: typeToken.column },
        };
    }

    /**
     * Parse element list for include/exclude (supports * wildcard)
     */
    private parseElementList(): string[] {
        const elements: string[] = [];

        // Wildcard
        if (this.check(TokenType.WILDCARD)) {
            this.advance();
            elements.push('*');
        }
        // Identifiers
        else {
            while (this.check(TokenType.IDENTIFIER)) {
                elements.push(this.advance().value);
            }
        }

        return elements;
    }

    /**
     * Parse autoLayout directive
     */
    private parseAutoLayout(): AutoLayoutNode {
        const startToken = this.expect(TokenType.AUTOLAYOUT);

        let direction: 'tb' | 'bt' | 'lr' | 'rl' | undefined;
        let rankSeparation: number | undefined;
        let nodeSeparation: number | undefined;

        // Optional direction
        if (this.check(TokenType.IDENTIFIER)) {
            const dir = this.advance().value;
            if (['tb', 'bt', 'lr', 'rl'].includes(dir)) {
                direction = dir as 'tb' | 'bt' | 'lr' | 'rl';
            }
        }

        // Optional body with parameters
        if (this.check(TokenType.BRACE_OPEN)) {
            this.advance();

            while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
                if (this.check(TokenType.IDENTIFIER)) {
                    const key = this.advance().value;
                    if (this.check(TokenType.NUMBER)) {
                        const value = parseInt(this.advance().value, 10);
                        if (key === 'rankSeparation') {
                            rankSeparation = value;
                        } else if (key === 'nodeSeparation') {
                            nodeSeparation = value;
                        }
                    }
                } else {
                    this.advance();
                }
            }

            this.expect(TokenType.BRACE_CLOSE);
        }

        return {
            type: 'autoLayout',
            direction,
            rankSeparation,
            nodeSeparation,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse styles block
     */
    private parseStyles(): StylesNode {
        const startToken = this.expect(TokenType.STYLES);
        this.expect(TokenType.BRACE_OPEN);

        const elementStyles: ElementStyleNode[] = [];
        const relationshipStyles: RelationshipStyleNode[] = [];

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (token.type === TokenType.ELEMENT) {
                elementStyles.push(this.parseElementStyle());
            } else if (token.type === TokenType.RELATIONSHIP) {
                relationshipStyles.push(this.parseRelationshipStyle());
            } else {
                this.advance(); // Skip unknown
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'styles',
            elementStyles,
            relationshipStyles,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse element style
     */
    private parseElementStyle(): ElementStyleNode {
        const startToken = this.expect(TokenType.ELEMENT);
        const tag = this.expect(TokenType.STRING).value;

        let background: string | undefined;
        let color: string | undefined;
        let shape: string | undefined;
        let icon: string | undefined;
        let fontSize: number | undefined;

        this.expect(TokenType.BRACE_OPEN);

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (token.type === TokenType.BACKGROUND) {
                this.advance();
                if (this.check(TokenType.COLOR_HEX) || this.check(TokenType.STRING)) {
                    background = this.advance().value;
                }
            } else if (token.type === TokenType.COLOR || token.type === TokenType.COLOUR) {
                this.advance();
                if (this.check(TokenType.COLOR_HEX) || this.check(TokenType.STRING)) {
                    color = this.advance().value;
                }
            } else if (token.type === TokenType.SHAPE) {
                this.advance();
                const nextToken = this.peek();
                if (nextToken && (nextToken.type === TokenType.IDENTIFIER || this.isShapeToken(nextToken.type))) {
                    shape = this.advance().value;
                }
            } else if (token.type === TokenType.IDENTIFIER && token.value === 'icon') {
                this.advance();
                if (this.check(TokenType.URL) || this.check(TokenType.STRING)) {
                    icon = this.advance().value;
                }
            } else if (token.type === TokenType.IDENTIFIER && token.value === 'fontSize') {
                this.advance();
                if (this.check(TokenType.NUMBER)) {
                    fontSize = parseInt(this.advance().value, 10);
                }
            } else {
                this.advance(); // Skip unknown
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'elementStyle',
            tag,
            background,
            color,
            shape: shape as ShapeType | undefined,
            icon,
            fontSize,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    /**
     * Parse relationship style
     */
    private parseRelationshipStyle(): RelationshipStyleNode {
        const startToken = this.expect(TokenType.RELATIONSHIP);
        const tag = this.expect(TokenType.STRING).value;

        let color: string | undefined;
        let thickness: number | undefined;
        let style: 'solid' | 'dashed' | 'dotted' | undefined;
        let fontSize: number | undefined;

        this.expect(TokenType.BRACE_OPEN);

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (token.type === TokenType.COLOR || token.type === TokenType.COLOUR) {
                this.advance();
                if (this.check(TokenType.COLOR_HEX) || this.check(TokenType.STRING)) {
                    color = this.advance().value;
                }
            } else if (token.type === TokenType.THICKNESS) {
                this.advance();
                if (this.check(TokenType.NUMBER)) {
                    thickness = parseInt(this.advance().value, 10);
                }
            } else if (token.type === TokenType.STYLE) {
                this.advance();
                if (this.check(TokenType.IDENTIFIER)) {
                    const styleValue = this.advance().value.toLowerCase();
                    if (['solid', 'dashed', 'dotted'].includes(styleValue)) {
                        style = styleValue as 'solid' | 'dashed' | 'dotted';
                    }
                }
            } else if (token.type === TokenType.IDENTIFIER && token.value === 'fontSize') {
                this.advance();
                if (this.check(TokenType.NUMBER)) {
                    fontSize = parseInt(this.advance().value, 10);
                }
            } else {
                this.advance(); // Skip unknown
            }
        }

        this.expect(TokenType.BRACE_CLOSE);

        return {
            type: 'relationshipStyle',
            tag,
            color,
            thickness,
            style,
            fontSize,
            location: { line: startToken.line, column: startToken.column },
        };
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Get current token without consuming
     */
    private peek(): Token {
        return this.tokens[this.current];
    }

    /**
     * Peek ahead N tokens
     */
    private peekAhead(n: number): Token | undefined {
        return this.tokens[this.current + n];
    }

    /**
     * Consume current token and return it
     */
    private advance(): Token {
        if (!this.isAtEnd()) { this.current++; }
        return this.previous();
    }

    /**
     * Get previous token
     */
    private previous(): Token {
        return this.tokens[this.current - 1];
    }

    /**
     * Check if current token matches type
     */
    private check(type: TokenType): boolean {
        if (this.isAtEnd()) { return false; }
        return this.peek().type === type;
    }

    /**
     * Expect current token to be of type, consume it
     */
    private expect(type: TokenType): Token {
        if (this.check(type)) { return this.advance(); }

        const token = this.peek();
        throw new StructurizrParserError(
            `Expected ${type}, got ${token.type}`,
            { line: token.line, column: token.column }
        );
    }

    /**
     * Check if at end of tokens
     */
    private isAtEnd(): boolean {
        return this.current >= this.tokens.length || this.peek().type === TokenType.EOF;
    }

    /**
     * Check if token type is an element type
     */
    private isElementType(type: TokenType): boolean {
        return [
            TokenType.PERSON,
            TokenType.SOFTWARE_SYSTEM,
            TokenType.CONTAINER,
            TokenType.COMPONENT,
        ].includes(type);
    }

    /**
     * Check if token type is a view type
     */
    private isViewType(type: TokenType): boolean {
        return [
            TokenType.SYSTEM_CONTEXT,
            TokenType.CONTAINER_VIEW,
            TokenType.COMPONENT_VIEW,
            TokenType.CONTAINER, // 'container' can be a view
            TokenType.COMPONENT, // 'component' can be a view
        ].includes(type);
    }

    private isShapeToken(type: TokenType): boolean {
        return [
            TokenType.SHAPE_BOX,
            TokenType.SHAPE_ROUNDED_BOX,
            TokenType.SHAPE_CIRCLE,
            TokenType.SHAPE_ELLIPSE,
            TokenType.SHAPE_HEXAGON,
            TokenType.SHAPE_CYLINDER,
            TokenType.SHAPE_PERSON,
            TokenType.SHAPE_ROBOT,
            TokenType.SHAPE_FOLDER,
            TokenType.SHAPE_WEB_BROWSER,
            TokenType.SHAPE_MOBILE_DEVICE_PORTRAIT,
            TokenType.SHAPE_MOBILE_DEVICE_LANDSCAPE,
            TokenType.SHAPE_PIPE,
        ].includes(type);
    }

    /**
     * Map token type to element type string
     */
    private getElementType(tokenType: TokenType): 'person' | 'softwareSystem' | 'container' | 'component' {
        switch (tokenType) {
            case TokenType.PERSON: return 'person';
            case TokenType.SOFTWARE_SYSTEM: return 'softwareSystem';
            case TokenType.CONTAINER: return 'container';
            case TokenType.COMPONENT: return 'component';
            default: throw new Error(`Invalid element type: ${tokenType}`);
        }
    }

    /**
     * Map token type to view type string
     */
    private getViewType(tokenType: TokenType): 'systemContext' | 'container' | 'component' {
        switch (tokenType) {
            case TokenType.SYSTEM_CONTEXT: return 'systemContext';
            case TokenType.CONTAINER_VIEW: return 'container';
            case TokenType.COMPONENT_VIEW: return 'component';
            case TokenType.CONTAINER: return 'container';
            case TokenType.COMPONENT: return 'component';
            default: return 'systemContext';
        }
    }
}
