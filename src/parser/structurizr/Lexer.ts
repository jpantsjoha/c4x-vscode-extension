/**
 * Structurizr DSL Lexer
 * Tokenizes Structurizr DSL source code into lexical tokens
 */

import { Token, TokenType, KEYWORDS, StructurizrLexerError } from './tokens';

/**
 * Lexer for Structurizr DSL
 * Performs lexical analysis to convert source code into tokens
 */
export class StructurizrLexer {
    private source: string;
    private position: number = 0;
    private line: number = 1;
    private column: number = 1;

    constructor(source: string) {
        this.source = source;
    }

    /**
     * Tokenize the entire source code
     * @returns Array of tokens
     */
    public tokenize(): Token[] {
        const tokens: Token[] = [];

        while (!this.isAtEnd()) {
            this.skipWhitespaceExceptNewlines();

            if (this.isAtEnd()) { break; }

            const token = this.nextToken();
            if (token) {
                tokens.push(token);
            }
        }

        tokens.push(this.makeToken(TokenType.EOF, ''));
        return tokens;
    }

    /**
     * Get the next token from the source
     */
    private nextToken(): Token | null {
        const char = this.peek();

        // Handle newlines (significant in DSL for statement separation)
        if (char === '\n') {
            const token = this.makeToken(TokenType.NEWLINE, '\\n');
            this.advance(); // Consume \n
            this.line++;
            this.column = 1;
            return token;
        }

        // Handle comments (// and /* */)
        if (char === '/' && this.peekNext() === '/') {
            return this.scanLineComment();
        }

        if (char === '/' && this.peekNext() === '*') {
            return this.scanBlockComment();
        }

        // Handle strings (quoted with ")
        if (char === '"') {
            return this.scanString();
        }

        // Handle operators and punctuation
        if (char === '-' && this.peekNext() === '>') {
            return this.scanArrow();
        }

        if (char === '{') {
            return this.scanSingle(TokenType.BRACE_OPEN, '{');
        }

        if (char === '}') {
            return this.scanSingle(TokenType.BRACE_CLOSE, '}');
        }

        if (char === '[') {
            return this.scanSingle(TokenType.BRACKET_OPEN, '[');
        }

        if (char === ']') {
            return this.scanSingle(TokenType.BRACKET_CLOSE, ']');
        }

        if (char === '(') {
            return this.scanSingle(TokenType.PAREN_OPEN, '(');
        }

        if (char === ')') {
            return this.scanSingle(TokenType.PAREN_CLOSE, ')');
        }

        if (char === '*') {
            return this.scanSingle(TokenType.WILDCARD, '*');
        }

        if (char === ',') {
            return this.scanSingle(TokenType.COMMA, ',');
        }

        if (char === '=') {
            return this.scanSingle(TokenType.EQUALS, '=');
        }

        // Handle color hex (#RRGGBB)
        if (char === '#') {
            return this.scanColorHex();
        }

        // Handle URLs (http:// or https://)
        if (char === 'h' && this.matchWord('http')) {
            return this.scanUrl();
        }

        // Handle identifiers and keywords
        if (this.isAlpha(char)) {
            return this.scanIdentifierOrKeyword();
        }

        // Handle numbers
        if (this.isDigit(char)) {
            return this.scanNumber();
        }



        // Unknown character - skip or error
        throw new StructurizrLexerError(
            `Unexpected character: '${char}'`,
            this.line,
            this.column
        );
    }

    /**
     * Scan a line comment (// ...)
     */
    private scanLineComment(): Token {
        const startColumn = this.column;
        this.advance(); // Skip /
        this.advance(); // Skip /

        const start = this.position;

        while (!this.isAtEnd() && this.peek() !== '\n') {
            this.advance();
        }

        const value = this.source.substring(start, this.position);
        return this.makeToken(TokenType.COMMENT, value, startColumn);
    }

    /**
     * Scan a block comment (slash-star ... star-slash)
     */
    private scanBlockComment(): Token {
        const startColumn = this.column;
        const startLine = this.line;

        this.advance(); // Skip /
        this.advance(); // Skip *

        const start = this.position;

        while (!this.isAtEnd()) {
            if (this.peek() === '*' && this.peekNext() === '/') {
                const value = this.source.substring(start, this.position);
                this.advance(); // Skip *
                this.advance(); // Skip /
                return this.makeToken(TokenType.COMMENT, value, startColumn);
            }

            if (this.peek() === '\n') {
                this.line++;
                this.column = 0;
            }

            this.advance();
        }

        throw new StructurizrLexerError(
            'Unterminated block comment',
            startLine,
            startColumn
        );
    }

    /**
     * Scan a quoted string
     */
    private scanString(): Token {
        const start = this.position;
        const startColumn = this.column;

        this.advance(); // Skip opening quote

        while (!this.isAtEnd() && this.peek() !== '"') {
            if (this.peek() === '\\') {
                this.advance(); // Skip escape character
                if (!this.isAtEnd()) {
                    this.advance(); // Skip escaped character
                }
            } else if (this.peek() === '\n') {
                // Multiline strings allowed
                this.line++;
                this.column = 0;
                this.advance();
            } else {
                this.advance();
            }
        }

        if (this.isAtEnd()) {
            throw new StructurizrLexerError(
                'Unterminated string',
                this.line,
                startColumn
            );
        }

        this.advance(); // Skip closing quote

        // Extract string value (without quotes)
        const value = this.source.substring(start + 1, this.position - 1);

        // Unescape escape sequences
        const unescaped = value
            .replace(/\\"/g, '"')
            .replace(/\\n/g, '\n')
            .replace(/\\t/g, '\t')
            .replace(/\\\\/g, '\\');

        return this.makeToken(TokenType.STRING, unescaped, startColumn);
    }

    /**
     * Scan an arrow operator (->)
     */
    private scanArrow(): Token {
        const startColumn = this.column;
        this.advance(); // Skip -
        this.advance(); // Skip >
        return this.makeToken(TokenType.ARROW, '->', startColumn);
    }

    /**
     * Scan a single-character token
     */
    private scanSingle(type: TokenType, char: string): Token {
        const startColumn = this.column;
        this.advance();
        return this.makeToken(type, char, startColumn);
    }

    /**
     * Scan a color hex value (#RRGGBB or #RGB)
     */
    private scanColorHex(): Token {
        const start = this.position;
        const startColumn = this.column;

        this.advance(); // Skip #

        while (!this.isAtEnd() && this.isHexDigit(this.peek())) {
            this.advance();
        }

        const value = this.source.substring(start, this.position);

        // Validate hex color format (#RGB or #RRGGBB)
        if (value.length !== 4 && value.length !== 7) {
            throw new StructurizrLexerError(
                `Invalid color hex format: ${value}`,
                this.line,
                startColumn
            );
        }

        return this.makeToken(TokenType.COLOR_HEX, value, startColumn);
    }

    /**
     * Scan an identifier or keyword
     */
    private scanIdentifierOrKeyword(): Token {
        const start = this.position;
        const startColumn = this.column;

        while (!this.isAtEnd() && this.isAlphaNumeric(this.peek())) {
            this.advance();
        }

        const value = this.source.substring(start, this.position);
        const type = KEYWORDS[value] || TokenType.IDENTIFIER;

        return this.makeToken(type, value, startColumn);
    }

    /**
     * Scan a number (integer or decimal)
     */
    private scanNumber(): Token {
        const start = this.position;
        const startColumn = this.column;

        while (!this.isAtEnd() && this.isDigit(this.peek())) {
            this.advance();
        }

        // Handle decimal numbers
        if (this.peek() === '.' && this.isDigit(this.peekNext())) {
            this.advance(); // Skip .

            while (!this.isAtEnd() && this.isDigit(this.peek())) {
                this.advance();
            }
        }

        const value = this.source.substring(start, this.position);
        return this.makeToken(TokenType.NUMBER, value, startColumn);
    }

    /**
     * Scan a URL (http:// or https://)
     */
    private scanUrl(): Token {
        const start = this.position;
        const startColumn = this.column;

        // Scan until whitespace or special character
        while (!this.isAtEnd() && !this.isWhitespace(this.peek()) && !this.isSpecialChar(this.peek())) {
            this.advance();
        }

        const value = this.source.substring(start, this.position);
        return this.makeToken(TokenType.URL, value, startColumn);
    }

    /**
     * Create a token at the current position
     */
    private makeToken(type: TokenType, value: string, column?: number): Token {
        return {
            type,
            value,
            line: this.line,
            column: column ?? this.column,
        };
    }

    // ============================================================================
    // Helper Methods
    // ============================================================================

    /**
     * Get current character without consuming
     */
    private peek(): string {
        return this.source[this.position];
    }

    /**
     * Get next character without consuming
     */
    private peekNext(): string {
        return this.source[this.position + 1];
    }

    /**
     * Consume current character and return it
     */
    private advance(): string {
        this.column++;
        return this.source[this.position++];
    }

    /**
     * Check if at end of source
     */
    private isAtEnd(): boolean {
        return this.position >= this.source.length;
    }

    /**
     * Skip whitespace except newlines (newlines are significant in DSL)
     */
    private skipWhitespaceExceptNewlines(): void {
        while (!this.isAtEnd()) {
            const char = this.peek();

            if (char === ' ' || char === '\t' || char === '\r') {
                this.advance();
            } else {
                break;
            }
        }
    }

    /**
     * Check if character is alphabetic or underscore
     */
    private isAlpha(char: string): boolean {
        return /[a-zA-Z_!]/.test(char);
    }

    /**
     * Check if character is a digit
     */
    private isDigit(char: string): boolean {
        return /[0-9]/.test(char);
    }

    /**
     * Check if character is hexadecimal digit
     */
    private isHexDigit(char: string): boolean {
        return /[0-9a-fA-F]/.test(char);
    }

    /**
     * Check if character is alphanumeric or underscore
     */
    private isAlphaNumeric(char: string): boolean {
        return this.isAlpha(char) || this.isDigit(char);
    }

    /**
     * Check if character is whitespace
     */
    private isWhitespace(char: string): boolean {
        return char === ' ' || char === '\t' || char === '\r' || char === '\n';
    }

    /**
     * Check if character is a special punctuation character
     */
    private isSpecialChar(char: string): boolean {
        return '{}[](),->=*'.includes(char);
    }

    /**
     * Check if the lexer matches a specific word at current position
     */
    private matchWord(word: string): boolean {
        for (let i = 0; i < word.length; i++) {
            if (this.position + i >= this.source.length) {
                return false;
            }
            if (this.source[this.position + i] !== word[i]) {
                return false;
            }
        }
        return true;
    }
}
