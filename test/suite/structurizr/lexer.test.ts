/**
 * Structurizr DSL Lexer Tests
 * Tests for tokenization of Structurizr DSL syntax
 */

import * as assert from 'assert';
import { StructurizrLexer, TokenType, StructurizrLexerError } from '../../../src/parser/structurizr';

describe('Structurizr Lexer', () => {
    describe('Keywords', () => {
        it('should tokenize top-level keywords', () => {
            const lexer = new StructurizrLexer('workspace model views styles');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.WORKSPACE);
            assert.strictEqual(tokens[1].type, TokenType.MODEL);
            assert.strictEqual(tokens[2].type, TokenType.VIEWS);
            assert.strictEqual(tokens[3].type, TokenType.STYLES);
        });

        it('should tokenize element keywords', () => {
            const lexer = new StructurizrLexer('person softwareSystem container component');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.PERSON);
            assert.strictEqual(tokens[1].type, TokenType.SOFTWARE_SYSTEM);
            assert.strictEqual(tokens[2].type, TokenType.CONTAINER);
            assert.strictEqual(tokens[3].type, TokenType.COMPONENT);
        });

        it('should tokenize view keywords', () => {
            const lexer = new StructurizrLexer('systemContext containerView componentView');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.SYSTEM_CONTEXT);
            assert.strictEqual(tokens[1].type, TokenType.CONTAINER_VIEW);
            assert.strictEqual(tokens[2].type, TokenType.COMPONENT_VIEW);
        });

        it('should tokenize view directives', () => {
            const lexer = new StructurizrLexer('include exclude autoLayout');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.INCLUDE);
            assert.strictEqual(tokens[1].type, TokenType.EXCLUDE);
            assert.strictEqual(tokens[2].type, TokenType.AUTOLAYOUT);
        });

        it('should tokenize style keywords', () => {
            const lexer = new StructurizrLexer('element relationship background color shape');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.ELEMENT);
            assert.strictEqual(tokens[1].type, TokenType.RELATIONSHIP);
            assert.strictEqual(tokens[2].type, TokenType.BACKGROUND);
            assert.strictEqual(tokens[3].type, TokenType.COLOR);
            assert.strictEqual(tokens[4].type, TokenType.SHAPE);
        });
    });

    describe('Literals', () => {
        it('should tokenize strings', () => {
            const lexer = new StructurizrLexer('"Hello World"');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, 'Hello World');
        });

        it('should handle escaped quotes in strings', () => {
            const lexer = new StructurizrLexer('"Hello \\"World\\""');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, 'Hello "World"');
        });

        it('should handle escape sequences', () => {
            const lexer = new StructurizrLexer('"Line1\\nLine2\\tTabbed"');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, 'Line1\nLine2\tTabbed');
        });

        it('should handle multiline strings', () => {
            const source = `"This is a
multiline
string"`;
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.ok(tokens[0].value.includes('\n'));
        });

        it('should tokenize identifiers', () => {
            const lexer = new StructurizrLexer('user system database');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.IDENTIFIER);
            assert.strictEqual(tokens[0].value, 'user');
            assert.strictEqual(tokens[1].type, TokenType.IDENTIFIER);
            assert.strictEqual(tokens[1].value, 'system');
        });

        it('should tokenize numbers', () => {
            const lexer = new StructurizrLexer('42 3.14');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.NUMBER);
            assert.strictEqual(tokens[0].value, '42');
            assert.strictEqual(tokens[1].type, TokenType.NUMBER);
            assert.strictEqual(tokens[1].value, '3.14');
        });

        it('should tokenize booleans', () => {
            const lexer = new StructurizrLexer('true false');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.BOOLEAN);
            assert.strictEqual(tokens[1].type, TokenType.BOOLEAN);
        });

        it('should tokenize URLs', () => {
            const lexer = new StructurizrLexer('https://example.com http://docs.structurizr.com');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.URL);
            assert.strictEqual(tokens[0].value, 'https://example.com');
            assert.strictEqual(tokens[1].type, TokenType.URL);
            assert.strictEqual(tokens[1].value, 'http://docs.structurizr.com');
        });

        it('should tokenize color hex values', () => {
            const lexer = new StructurizrLexer('#FF0000 #ABC');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.COLOR_HEX);
            assert.strictEqual(tokens[0].value, '#FF0000');
            assert.strictEqual(tokens[1].type, TokenType.COLOR_HEX);
            assert.strictEqual(tokens[1].value, '#ABC');
        });
    });

    describe('Operators and Punctuation', () => {
        it('should tokenize arrow operator', () => {
            const lexer = new StructurizrLexer('->');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.ARROW);
            assert.strictEqual(tokens[0].value, '->');
        });

        it('should tokenize braces', () => {
            const lexer = new StructurizrLexer('{ }');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.BRACE_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.BRACE_CLOSE);
        });

        it('should tokenize brackets', () => {
            const lexer = new StructurizrLexer('[ ]');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.BRACKET_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.BRACKET_CLOSE);
        });

        it('should tokenize parentheses', () => {
            const lexer = new StructurizrLexer('( )');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.PAREN_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.PAREN_CLOSE);
        });

        it('should tokenize wildcard', () => {
            const lexer = new StructurizrLexer('*');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.WILDCARD);
        });

        it('should tokenize comma', () => {
            const lexer = new StructurizrLexer(',');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.COMMA);
        });

        it('should tokenize equals', () => {
            const lexer = new StructurizrLexer('=');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.EQUALS);
        });
    });

    describe('Comments', () => {
        it('should tokenize line comments', () => {
            const lexer = new StructurizrLexer('// This is a comment');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
            assert.strictEqual(tokens[0].value, ' This is a comment');
        });

        it('should tokenize block comments', () => {
            const lexer = new StructurizrLexer('/* This is a block comment */');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
            assert.strictEqual(tokens[0].value, ' This is a block comment ');
        });

        it('should handle multiline block comments', () => {
            const source = `/* This is
a multiline
comment */`;
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
            assert.ok(tokens[0].value.includes('\n'));
        });
    });

    describe('Newlines and Whitespace', () => {
        it('should tokenize newlines', () => {
            const lexer = new StructurizrLexer('workspace\nmodel');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.WORKSPACE);
            assert.strictEqual(tokens[1].type, TokenType.NEWLINE);
            assert.strictEqual(tokens[2].type, TokenType.MODEL);
        });

        it('should skip spaces and tabs', () => {
            const lexer = new StructurizrLexer('workspace   \t  model');
            const tokens = lexer.tokenize();

            // Spaces and tabs should be skipped
            assert.strictEqual(tokens[0].type, TokenType.WORKSPACE);
            assert.strictEqual(tokens[1].type, TokenType.MODEL);
        });
    });

    describe('Line and Column Tracking', () => {
        it('should track line numbers', () => {
            const source = 'workspace\nmodel\nviews';
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].line, 1); // workspace
            assert.strictEqual(tokens[2].line, 2); // model
            assert.strictEqual(tokens[4].line, 3); // views
        });

        it('should track column numbers', () => {
            const source = 'workspace model';
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].column, 1); // workspace
            assert.strictEqual(tokens[1].column, 11); // model (after 'workspace ')
        });
    });

    describe('Error Cases', () => {
        it('should throw error for unterminated string', () => {
            const lexer = new StructurizrLexer('"unterminated');

            assert.throws(
                () => lexer.tokenize(),
                StructurizrLexerError
            );
        });

        it('should throw error for unterminated block comment', () => {
            const lexer = new StructurizrLexer('/* unterminated comment');

            assert.throws(
                () => lexer.tokenize(),
                StructurizrLexerError
            );
        });

        it('should throw error for invalid color hex', () => {
            const lexer = new StructurizrLexer('#1'); // Invalid: too short

            assert.throws(
                () => lexer.tokenize(),
                StructurizrLexerError
            );
        });

        it('should throw error for unexpected character', () => {
            const lexer = new StructurizrLexer('@invalid');

            assert.throws(
                () => lexer.tokenize(),
                StructurizrLexerError
            );
        });
    });

    describe('Complex Examples', () => {
        it('should tokenize simple workspace', () => {
            const source = `workspace "My Workspace" {
                model {
                    user = person "User"
                }
            }`;
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            const types = tokens.map(t => t.type);
            assert.ok(types.includes(TokenType.WORKSPACE));
            assert.ok(types.includes(TokenType.MODEL));
            assert.ok(types.includes(TokenType.PERSON));
            assert.ok(types.includes(TokenType.STRING));
            assert.ok(types.includes(TokenType.IDENTIFIER));
        });

        it('should tokenize relationship', () => {
            const source = 'user -> system "Uses"';
            const lexer = new StructurizrLexer(source);
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[0].type, TokenType.IDENTIFIER);
            assert.strictEqual(tokens[0].value, 'user');
            assert.strictEqual(tokens[1].type, TokenType.ARROW);
            assert.strictEqual(tokens[2].type, TokenType.IDENTIFIER);
            assert.strictEqual(tokens[2].value, 'system');
            assert.strictEqual(tokens[3].type, TokenType.STRING);
            assert.strictEqual(tokens[3].value, 'Uses');
        });
    });

    describe('EOF Token', () => {
        it('should always end with EOF token', () => {
            const lexer = new StructurizrLexer('workspace');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens[tokens.length - 1].type, TokenType.EOF);
        });

        it('should have EOF token for empty source', () => {
            const lexer = new StructurizrLexer('');
            const tokens = lexer.tokenize();

            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0].type, TokenType.EOF);
        });
    });
});
