/**
 * Structurizr DSL Parser
 * Recursive descent parser that builds an AST from tokens
 */

import { Token, TokenType } from './tokens';
import { MAX_NESTING_DEPTH, nestingDepthMessage } from '../nestingDepth';
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

interface ElementBody {
    description?: string;
    technology?: string;
    tags?: string[];
    url?: string;
    properties?: Record<string, string>;
    children?: ElementNode[];
}

interface ElementFrame {
    typeToken: Token;
    elementType: 'person' | 'softwareSystem' | 'container' | 'component';
    identifier: string;
    name: string;
    hasTechnologySlot: boolean;
    hasBody: boolean;
    groupDepth: number;
    body: ElementBody;
}

const GROUP_KEYWORDS = new Set(['group', 'enterprise']);

/** Valid Structurizr constructs this parser does not model; skipped, brace-balanced. */
const UNMODELLED = new Set([
    'deploymentEnvironment', 'deploymentNode', 'infrastructureNode', 'containerInstance',
    'softwareSystemInstance', 'healthCheck', 'archetypes', 'perspectives', 'properties',
    'instances', 'configuration', 'name', 'description', 'themes', 'theme', 'branding',
    'terminology', 'users', 'visibility', 'scope',
]);

function splitTags(value: string): string[] {
    return value.split(',').map(t => t.trim()).filter(t => t.length > 0);
}

/**
 * Parser for Structurizr DSL
 * Builds an Abstract Syntax Tree from token stream
 */
export class StructurizrParser {
    private tokens: Token[];
    private current: number = 0;
    /** A `views` block found inside a block that is otherwise skipped (model, element, unmodelled). */
    private collectedViews: ViewsNode[] = [];
    private modelDepth = 0;
    private recovering = false;

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
        let styles: StylesNode | undefined;

        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const token = this.peek();

            if (token.type === TokenType.MODEL) {
                model = this.parseModel();
            } else if (token.type === TokenType.VIEWS) {
                this.acceptViews(this.parseViews(), false);
            } else if (token.type === TokenType.STYLES) {
                styles = this.parseStyles();
            } else {
                // Directives, `configuration { }`, `name`, ... : valid but unmodelled.
                this.skipStatement();
            }
        }

        this.expect(TokenType.BRACE_CLOSE);
        // The workspace closed early (an unbalanced brace): a section that
        // follows would be dropped without a trace. A lone stray `}` is
        // tolerated, as before, because styles nested in views end that way.
        const views: ViewsNode | undefined = this.collectedViews.length === 0 ? undefined : {
            type: 'views',
            views: this.collectedViews.flatMap(v => v.views),
            location: this.collectedViews[0].location,
        };
        for (let i = this.current; i < this.tokens.length; i++) {
            const stray = this.tokens[i];
            if ((stray.type === TokenType.VIEWS && (!views || views.views.length === 0)) ||
                (stray.type === TokenType.MODEL && (!model || model.elements.length === 0))) {
                throw new StructurizrParserError(
                    `Unexpected "${stray.value}" after the workspace closing brace; check for an unbalanced brace`,
                    { line: stray.line, column: stray.column }
                );
            }
        }

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

        this.modelDepth++;
        try {
            this.parseModelItems(elements, relationships);
        } finally {
            this.modelDepth--;
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
     * Parse the statements of a `model` or `group` block up to (not including)
     * the closing brace. Valid constructs the parser does not model (deployment,
     * archetypes, directives) are skipped brace-balanced; anything else is an error.
     */
    private parseModelItems(elements: ElementNode[], relationships: RelationshipNode[]): void {
        let groupDepth = 0; // group/enterprise blocks are tracked here, not by recursion
        while (!this.isAtEnd()) {
            if (this.check(TokenType.BRACE_CLOSE)) {
                if (groupDepth === 0) { break; }
                this.advance();
                groupDepth--;
                continue;
            }
            const token = this.peek();
            const next = this.peekAhead(1);

            if (this.isElementType(token.type)) {
                elements.push(this.parseElement());
            } else if ((token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING) &&
                next?.type === TokenType.EQUALS) {
                const id = this.advance().value;
                this.advance(); // =
                if (this.isElementType(this.peek().type)) {
                    elements.push(this.parseElement(id));
                } else if (this.isUnmodelled(this.peek())) {
                    this.skipStatement();
                } else {
                    throw new StructurizrParserError(
                        `Expected element type after assignment, got ${this.peek().type}`,
                        { line: token.line, column: token.column }
                    );
                }
            } else if ((token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING) &&
                next?.type === TokenType.ARROW) {
                relationships.push(this.parseRelationship());
            } else if (token.type === TokenType.IDENTIFIER && GROUP_KEYWORDS.has(token.value) &&
                (next?.type === TokenType.BRACE_OPEN || next?.type === TokenType.STRING)) {
                this.advance();
                if (this.check(TokenType.STRING)) { this.advance(); }
                this.expect(TokenType.BRACE_OPEN);
                groupDepth++;
            } else if (this.isUnmodelled(token)) {
                this.skipStatement();
            } else {
                this.skipUnplaced(token); // valid-but-unmodelled or unknown: ignored, as before
            }
        }
        if (groupDepth > 0) { this.expect(TokenType.BRACE_CLOSE); } // unterminated group: located error
    }

    private isSectionKeyword(type: TokenType): boolean {
        return type === TokenType.VIEWS || type === TokenType.STYLES ||
            type === TokenType.MODEL || type === TokenType.WORKSPACE;
    }

    /** A valid construct this parser does not model: skipped, never an error. */
    private isUnmodelled(token: Token): boolean {
        return token.type === TokenType.IDENTIFIER &&
            (token.value.startsWith('!') || UNMODELLED.has(token.value));
    }

    /**
     * Ignore a token the model/element parsers do not place. Origin/main skipped
     * these and still rendered. A misplaced `views { }` block is parsed rather
     * than skipped, so the diagram is kept.
     */
    private skipUnplaced(_token: Token): void {
        if (this.recoverViews()) { return; }
        this.skipStatement();
    }

    /** Parse a `views { ... }` block met where the grammar does not expect one. */
    private recoverViews(): boolean {
        // One level of recovery only: a views block inside a recovered views block
        // is skipped flat, so nesting depth cannot grow the call stack.
        if (!this.recovering && this.check(TokenType.VIEWS) && this.peekAhead(1)?.type === TokenType.BRACE_OPEN) {
            this.recovering = true;
            try {
                this.acceptViews(this.parseViews(), this.modelDepth > 0);
            } finally {
                this.recovering = false;
            }
            return true;
        }
        return false;
    }

    /**
     * A workspace has one `views` block, but origin/main kept whichever block its
     * miscounted braces happened to leave last, and some inputs have several (a
     * misplaced copy inside `!ref`, a model body, ...). Collect every block's
     * views in source order so the result is a superset of what main rendered.
     */
    private acceptViews(parsed: ViewsNode, _fallback: boolean): void {
        this.collectedViews.push(parsed);
    }

    /** True when the token begins a statement the parser models. */
    private startsKnownStatement(t: Token): boolean {
        return this.isElementType(t.type) || this.isViewType(t.type) ||
            this.isSectionKeyword(t.type) || t.type === TokenType.INCLUDE ||
            t.type === TokenType.EXCLUDE || t.type === TokenType.AUTOLAYOUT;
    }

    /**
     * Skip one statement: its keyword, its same-line arguments, and an attached
     * `{ ... }` block (balanced, however deeply nested). Arguments end at the
     * end of the line or at the next recognised statement keyword, so
     * `theme "x" systemContext s { }` on one line keeps the view, and a
     * `->`/`=` statement is never swallowed.
     */
    private skipStatement(): void {
        if (this.check(TokenType.BRACE_OPEN)) { this.skipBlock(); return; }
        const first = this.advance();
        while (!this.isAtEnd() && this.peek().line === first.line &&
            !this.check(TokenType.BRACE_OPEN) && !this.check(TokenType.BRACE_CLOSE) &&
            !this.startsKnownStatement(this.peek()) && !this.startsAssignmentOrRelationship()) {
            this.advance();
        }
        if (this.check(TokenType.BRACE_OPEN)) { this.skipBlock(); }
    }

    private startsAssignmentOrRelationship(): boolean {
        const t = this.peek().type;
        const n = this.peekAhead(1)?.type;
        return (t === TokenType.IDENTIFIER || t === TokenType.STRING) &&
            (n === TokenType.EQUALS || n === TokenType.ARROW);
    }

    /** Skip a balanced `{ ... }` block; an unterminated one is an error. */
    private skipBlock(): void {
        const open = this.expect(TokenType.BRACE_OPEN);
        let depth = 1;
        while (depth > 0) {
            if (this.isAtEnd()) {
                throw new StructurizrParserError(
                    'Unterminated block: missing closing brace',
                    { line: open.line, column: open.column }
                );
            }
            if (this.recoverViews()) { continue; }
            const t = this.advance();
            if (t.type === TokenType.BRACE_OPEN) { depth++; }
            else if (t.type === TokenType.BRACE_CLOSE) { depth--; }
        }
    }

    /**
     * Parse element (person, softwareSystem, container, component)
     */
    private parseElement(explicitIdentifier?: string): ElementNode {
        // Iterative, with an explicit stack: nesting depth is bounded by the heap,
        // not by the call stack.
        const stack: ElementFrame[] = [this.openElement(explicitIdentifier)];
        for (;;) {
            const frame = stack[stack.length - 1];
            const child = this.stepElementBody(frame);
            if (child) {
                // The same nesting bound as C4X (#362): the parse is iterative, but the
                // adapter, layout and renderer that follow recurse once per level.
                if (stack.length >= MAX_NESTING_DEPTH) {
                    const at = this.peek();
                    throw new StructurizrParserError(nestingDepthMessage(), { line: at.line, column: at.column });
                }
                stack.push(this.openElement(child.id));
                continue;
            }
            const node = this.closeElement(frame);
            stack.pop();
            if (stack.length === 0) { return node; }
            (stack[stack.length - 1].body.children ??= []).push(node);
        }
    }

    private openElement(explicitIdentifier?: string): ElementFrame {
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
            if (this.check(TokenType.STRING)) {
                // Structurizr form `person "Name" ...`: the string is the name; the
                // strings after it are positional, so none is taken as a second name.
                identifier = this.advance().value;
                name = identifier;
            } else {
                // Legacy `person ident "Name"` form.
                identifier = this.expect(TokenType.IDENTIFIER).value;
                name = identifier;
                if (this.check(TokenType.STRING)) {
                    name = this.advance().value;
                }
            }
        }

        let technology: string | undefined;
        let tags: string[] | undefined;

        // Positional arguments after the name, per the Structurizr DSL:
        //   person         <name> [description] [tags]
        //   softwareSystem <name> [description] [tags]
        //   container      <name> [description] [technology] [tags]
        //   component      <name> [description] [technology] [tags]
        const hasTechnologySlot = elementType === 'container' || elementType === 'component';
        const positional: string[] = [];
        const maxPositional = hasTechnologySlot ? 3 : 2;
        while (positional.length < maxPositional && this.check(TokenType.STRING) &&
            !this.startsStatement()) {
            positional.push(this.advance().value);
        }
        // Surplus strings are ignored (origin/main ignored them too).
        while (this.check(TokenType.STRING) && !this.startsStatement()) { this.advance(); }
        const [posDescription, ...posRest] = positional;
        const description = posDescription || undefined;
        if (hasTechnologySlot) {
            technology = posRest[0] || undefined;
            if (posRest[1]) { tags = splitTags(posRest[1]); }
        } else if (posRest[0]) {
            tags = splitTags(posRest[0]);
        }

        // Optional body with properties and nested elements
        let hasBody = false;
        if (this.check(TokenType.BRACE_OPEN)) {
            this.advance();
            hasBody = true;
        }

        return {
            typeToken, elementType, identifier, name, hasTechnologySlot, hasBody, groupDepth: 0,
            body: { description, technology, tags },
        };
    }

    private closeElement(f: ElementFrame): ElementNode {
        return {
            type: 'element',
            elementType: f.elementType,
            identifier: f.identifier,
            name: f.name,
            description: f.body.description,
            technology: f.body.technology,
            tags: f.body.tags,
            url: f.body.url,
            properties: f.body.properties,
            children: f.body.children,
            location: { line: f.typeToken.line, column: f.typeToken.column },
        };
    }

    /**
     * True when the current STRING begins the next statement (it is an
     * identifier of a relationship or assignment), not a positional argument.
     */
    private startsStatement(): boolean {
        const next = this.peekAhead(1)?.type;
        return next === TokenType.ARROW || next === TokenType.EQUALS;
    }


    /**
     * Parse an element body (or a `group` inside one) up to the closing brace.
     * Valid constructs not modelled here are skipped brace-balanced; a token
     * that cannot be placed raises StructurizrParserError.
     */
    private stepElementBody(f: ElementFrame): { id?: string } | undefined {
        if (!f.hasBody) { return undefined; }
        const ctx = f.body;
        while (!this.isAtEnd()) {
            if (this.check(TokenType.BRACE_CLOSE)) {
                if (f.groupDepth === 0) { break; }
                this.advance();
                f.groupDepth--;
                continue;
            }
            const inGroup = f.groupDepth > 0;
            const token = this.peek();
            const next = this.peekAhead(1);

            if ((token.type === TokenType.IDENTIFIER || token.type === TokenType.STRING) &&
                next?.type === TokenType.EQUALS) {
                const id = this.advance().value;
                this.advance(); // =
                if (this.isElementType(this.peek().type)) {
                    return { id };
                } else if (this.isUnmodelled(this.peek())) {
                    this.skipStatement();
                } else {
                    throw new StructurizrParserError(
                        `Expected element type after assignment, got ${this.peek().type}`,
                        { line: token.line, column: token.column }
                    );
                }
            } else if (this.isElementType(token.type)) {
                return {};
            } else if (token.type === TokenType.IDENTIFIER && GROUP_KEYWORDS.has(token.value) &&
                (next?.type === TokenType.BRACE_OPEN || next?.type === TokenType.STRING)) {
                this.advance();
                if (this.check(TokenType.STRING)) { this.advance(); }
                this.expect(TokenType.BRACE_OPEN);
                f.groupDepth++;
            } else if (token.type === TokenType.IDENTIFIER &&
                (token.value === 'description' || token.value === 'technology') &&
                next?.type === TokenType.STRING) {
                // Explicit keywords win over any positional value already read.
                this.advance();
                const value = this.advance().value;
                if (token.value === 'description') { ctx.description = value; } else { ctx.technology = value; }
            } else if (token.type === TokenType.STRING && !inGroup && !ctx.description) {
                ctx.description = this.advance().value;
            } else if (token.type === TokenType.STRING && !inGroup && ctx.description && !ctx.technology) {
                ctx.technology = this.advance().value;
            } else if (token.type === TokenType.TAG ||
                (token.type === TokenType.IDENTIFIER && token.value === 'tags')) {
                const kw = this.advance();
                if (this.check(TokenType.STRING)) {
                    ctx.tags = this.advance().value.split(',').map(t => t.trim());
                    while (this.check(TokenType.STRING) && this.peek().line === kw.line) {
                        ctx.tags.push(...this.advance().value.split(',').map(t => t.trim()));
                    }
                }
            } else if (token.type === TokenType.URL ||
                (token.type === TokenType.IDENTIFIER && token.value === 'url')) {
                if (token.type === TokenType.IDENTIFIER) { this.advance(); }
                if (this.check(TokenType.URL) || this.check(TokenType.STRING)) {
                    ctx.url = this.advance().value;
                }
            } else if (token.type === TokenType.IDENTIFIER && token.value === 'properties' &&
                next?.type === TokenType.BRACE_OPEN) {
                this.advance();
                ctx.properties = { ...(ctx.properties ?? {}), ...this.parsePropertiesBlock() };
            } else if (token.type === TokenType.IDENTIFIER && next?.type === TokenType.ARROW) {
                this.parseRelationship(); // handled at model level
            } else {
                this.skipUnplaced(token); // `-> x`, perspectives, directives, unknown: ignored, as before
            }
        }
        if (f.groupDepth > 0) { this.expect(TokenType.BRACE_CLOSE); } // unterminated group: located error
        this.expect(TokenType.BRACE_CLOSE);
        return undefined;
    }

    /**
     * Parse a `properties { name value ... }` block. Names and values are
     * strings or bare words, one pair per line; newlines are not tokens here,
     * so pairs are read two tokens at a time until the closing brace.
     */
    private parsePropertiesBlock(): Record<string, string> {
        const properties: Record<string, string> = {};
        this.expect(TokenType.BRACE_OPEN);
        while (!this.check(TokenType.BRACE_CLOSE) && !this.isAtEnd()) {
            const key = this.advance();
            if (this.check(TokenType.BRACE_CLOSE) || this.isAtEnd()) {
                throw new StructurizrParserError(
                    `Property "${key.value}" has no value`,
                    { line: key.line, column: key.column }
                );
            }
            const value = this.advance();
            properties[key.value] = value.value;
        }
        this.expect(TokenType.BRACE_CLOSE);
        return properties;
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

        // Positional: <description> [technology] [tags]
        if (this.check(TokenType.STRING) && !this.startsStatement()) {
            description = this.advance().value;
        }
        if (this.check(TokenType.STRING) && !this.startsStatement()) {
            technology = this.advance().value;
        }
        if (this.check(TokenType.STRING) && !this.startsStatement()) {
            tags = splitTags(this.advance().value);
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
                } else if (token.type === TokenType.BRACE_OPEN) {
                    this.skipBlock();
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
            } else if (token.type === TokenType.STYLES) {
                this.parseStyles(); // styles nested in views: consumed whole, not modelled here
            } else {
                // dynamic / deployment / filtered views, themes, branding, ...
                this.skipStatement();
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
                } else if (this.check(TokenType.BRACE_OPEN)) {
                    this.skipBlock(); // animation { ... }, ...
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
