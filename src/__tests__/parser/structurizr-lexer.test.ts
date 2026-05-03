import * as assert from 'assert';
import { StructurizrLexer } from '../../parser/structurizr/Lexer';
import { TokenType, StructurizrLexerError, isKeyword, getKeywordType } from '../../parser/structurizr/tokens';

describe('StructurizrLexer', () => {

    function tokenize(source: string) {
        const lexer = new StructurizrLexer(source);
        return lexer.tokenize();
    }

    // =========================================================================
    // Basic token recognition
    // =========================================================================

    describe('basic token recognition', () => {
        it('returns EOF for empty input', () => {
            const tokens = tokenize('');
            assert.strictEqual(tokens.length, 1);
            assert.strictEqual(tokens[0].type, TokenType.EOF);
        });

        it('tokenizes opening and closing braces', () => {
            const tokens = tokenize('{}');
            assert.strictEqual(tokens[0].type, TokenType.BRACE_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.BRACE_CLOSE);
        });

        it('tokenizes brackets', () => {
            const tokens = tokenize('[]');
            assert.strictEqual(tokens[0].type, TokenType.BRACKET_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.BRACKET_CLOSE);
        });

        it('tokenizes parentheses', () => {
            const tokens = tokenize('()');
            assert.strictEqual(tokens[0].type, TokenType.PAREN_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.PAREN_CLOSE);
        });

        it('tokenizes arrow operator', () => {
            const tokens = tokenize('->');
            assert.strictEqual(tokens[0].type, TokenType.ARROW);
            assert.strictEqual(tokens[0].value, '->');
        });

        it('tokenizes wildcard', () => {
            const tokens = tokenize('*');
            assert.strictEqual(tokens[0].type, TokenType.WILDCARD);
        });

        it('tokenizes comma', () => {
            const tokens = tokenize(',');
            assert.strictEqual(tokens[0].type, TokenType.COMMA);
        });

        it('tokenizes equals sign', () => {
            const tokens = tokenize('=');
            assert.strictEqual(tokens[0].type, TokenType.EQUALS);
        });

        it('tokenizes newlines as tokens', () => {
            const tokens = tokenize('{\n}');
            assert.strictEqual(tokens[0].type, TokenType.BRACE_OPEN);
            assert.strictEqual(tokens[1].type, TokenType.NEWLINE);
            assert.strictEqual(tokens[2].type, TokenType.BRACE_CLOSE);
        });
    });

    // =========================================================================
    // String literals
    // =========================================================================

    describe('string literals', () => {
        it('tokenizes a simple quoted string', () => {
            const tokens = tokenize('"hello world"');
            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, 'hello world');
        });

        it('tokenizes a string with escaped quotes', () => {
            const tokens = tokenize('"say \\"hello\\""');
            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, 'say "hello"');
        });

        it('tokenizes a string with escaped newline', () => {
            const tokens = tokenize('"line1\\nline2"');
            assert.strictEqual(tokens[0].value, 'line1\nline2');
        });

        it('tokenizes a string with escaped tab', () => {
            const tokens = tokenize('"col1\\tcol2"');
            assert.strictEqual(tokens[0].value, 'col1\tcol2');
        });

        it('tokenizes a string with escaped backslash', () => {
            const tokens = tokenize('"path\\\\file"');
            assert.strictEqual(tokens[0].value, 'path\\file');
        });

        it('throws on unterminated string', () => {
            assert.throws(() => tokenize('"unterminated'), StructurizrLexerError);
        });

        it('tokenizes empty string', () => {
            const tokens = tokenize('""');
            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.strictEqual(tokens[0].value, '');
        });

        it('handles multiline strings', () => {
            const tokens = tokenize('"line1\nline2"');
            assert.strictEqual(tokens[0].type, TokenType.STRING);
            assert.ok(tokens[0].value.includes('\n'));
        });
    });

    // =========================================================================
    // Keywords
    // =========================================================================

    describe('keyword recognition', () => {
        it('recognizes workspace keyword', () => {
            const tokens = tokenize('workspace');
            assert.strictEqual(tokens[0].type, TokenType.WORKSPACE);
        });

        it('recognizes model keyword', () => {
            const tokens = tokenize('model');
            assert.strictEqual(tokens[0].type, TokenType.MODEL);
        });

        it('recognizes views keyword', () => {
            const tokens = tokenize('views');
            assert.strictEqual(tokens[0].type, TokenType.VIEWS);
        });

        it('recognizes styles keyword', () => {
            const tokens = tokenize('styles');
            assert.strictEqual(tokens[0].type, TokenType.STYLES);
        });

        it('recognizes person keyword', () => {
            const tokens = tokenize('person');
            assert.strictEqual(tokens[0].type, TokenType.PERSON);
        });

        it('recognizes softwareSystem keyword', () => {
            const tokens = tokenize('softwareSystem');
            assert.strictEqual(tokens[0].type, TokenType.SOFTWARE_SYSTEM);
        });

        it('recognizes container keyword', () => {
            const tokens = tokenize('container');
            assert.strictEqual(tokens[0].type, TokenType.CONTAINER);
        });

        it('recognizes component keyword', () => {
            const tokens = tokenize('component');
            assert.strictEqual(tokens[0].type, TokenType.COMPONENT);
        });

        it('recognizes systemContext keyword', () => {
            const tokens = tokenize('systemContext');
            assert.strictEqual(tokens[0].type, TokenType.SYSTEM_CONTEXT);
        });

        it('recognizes autoLayout keyword', () => {
            const tokens = tokenize('autoLayout');
            assert.strictEqual(tokens[0].type, TokenType.AUTOLAYOUT);
        });

        it('recognizes include keyword', () => {
            const tokens = tokenize('include');
            assert.strictEqual(tokens[0].type, TokenType.INCLUDE);
        });

        it('recognizes exclude keyword', () => {
            const tokens = tokenize('exclude');
            assert.strictEqual(tokens[0].type, TokenType.EXCLUDE);
        });

        it('recognizes element keyword (for styles)', () => {
            const tokens = tokenize('element');
            assert.strictEqual(tokens[0].type, TokenType.ELEMENT);
        });

        it('recognizes relationship keyword (for styles)', () => {
            const tokens = tokenize('relationship');
            assert.strictEqual(tokens[0].type, TokenType.RELATIONSHIP);
        });

        it('recognizes shape keywords', () => {
            // Shape keywords are recognized as their respective keyword value, not as identifiers.
            // The token type values match the shape name (e.g., TokenType.SHAPE_BOX = 'Box').
            const shapesToTypes: [string, TokenType][] = [
                ['Box', TokenType.SHAPE_BOX],
                ['RoundedBox', TokenType.SHAPE_ROUNDED_BOX],
                ['Circle', TokenType.SHAPE_CIRCLE],
                ['Ellipse', TokenType.SHAPE_ELLIPSE],
                ['Hexagon', TokenType.SHAPE_HEXAGON],
                ['Cylinder', TokenType.SHAPE_CYLINDER],
                ['Person', TokenType.SHAPE_PERSON],
                ['Robot', TokenType.SHAPE_ROBOT],
                ['Folder', TokenType.SHAPE_FOLDER],
                ['WebBrowser', TokenType.SHAPE_WEB_BROWSER],
                ['MobileDevicePortrait', TokenType.SHAPE_MOBILE_DEVICE_PORTRAIT],
                ['MobileDeviceLandscape', TokenType.SHAPE_MOBILE_DEVICE_LANDSCAPE],
                ['Pipe', TokenType.SHAPE_PIPE],
            ];
            for (const [shape, expectedType] of shapesToTypes) {
                const tokens = tokenize(shape);
                assert.strictEqual(
                    tokens[0].type,
                    expectedType,
                    `Shape "${shape}" expected type ${expectedType}, got ${tokens[0].type}`
                );
            }
        });

        it('recognizes boolean values', () => {
            const tokensTrue = tokenize('true');
            assert.strictEqual(tokensTrue[0].type, TokenType.BOOLEAN);
            assert.strictEqual(tokensTrue[0].value, 'true');

            const tokensFalse = tokenize('false');
            assert.strictEqual(tokensFalse[0].type, TokenType.BOOLEAN);
            assert.strictEqual(tokensFalse[0].value, 'false');
        });

        it('treats unknown words as identifiers', () => {
            const tokens = tokenize('myVariable');
            assert.strictEqual(tokens[0].type, TokenType.IDENTIFIER);
            assert.strictEqual(tokens[0].value, 'myVariable');
        });
    });

    // =========================================================================
    // Numbers
    // =========================================================================

    describe('numbers', () => {
        it('tokenizes integer numbers', () => {
            const tokens = tokenize('42');
            assert.strictEqual(tokens[0].type, TokenType.NUMBER);
            assert.strictEqual(tokens[0].value, '42');
        });

        it('tokenizes decimal numbers', () => {
            const tokens = tokenize('3.14');
            assert.strictEqual(tokens[0].type, TokenType.NUMBER);
            assert.strictEqual(tokens[0].value, '3.14');
        });

        it('tokenizes zero', () => {
            const tokens = tokenize('0');
            assert.strictEqual(tokens[0].type, TokenType.NUMBER);
            assert.strictEqual(tokens[0].value, '0');
        });
    });

    // =========================================================================
    // Color hex values
    // =========================================================================

    describe('color hex values', () => {
        it('tokenizes 6-digit hex color', () => {
            const tokens = tokenize('#FF9900');
            assert.strictEqual(tokens[0].type, TokenType.COLOR_HEX);
            assert.strictEqual(tokens[0].value, '#FF9900');
        });

        it('tokenizes 3-digit hex color', () => {
            const tokens = tokenize('#F90');
            assert.strictEqual(tokens[0].type, TokenType.COLOR_HEX);
            assert.strictEqual(tokens[0].value, '#F90');
        });

        it('throws on invalid hex color length', () => {
            assert.throws(() => tokenize('#FF99'), StructurizrLexerError);
        });
    });

    // =========================================================================
    // Comments
    // =========================================================================

    describe('comments', () => {
        it('tokenizes line comment (//)', () => {
            const tokens = tokenize('// this is a comment');
            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
            assert.ok(tokens[0].value.includes('this is a comment'));
        });

        it('tokenizes block comment (/* */)', () => {
            const tokens = tokenize('/* block comment */');
            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
            assert.ok(tokens[0].value.includes('block comment'));
        });

        it('throws on unterminated block comment', () => {
            assert.throws(() => tokenize('/* unclosed'), StructurizrLexerError);
        });

        it('handles multiline block comments', () => {
            const tokens = tokenize('/* line1\nline2\nline3 */');
            assert.strictEqual(tokens[0].type, TokenType.COMMENT);
        });
    });

    // =========================================================================
    // Position tracking
    // =========================================================================

    describe('position tracking', () => {
        it('tracks line number correctly', () => {
            const tokens = tokenize('workspace\n"name"');
            assert.strictEqual(tokens[0].line, 1); // workspace
            // NEWLINE is emitted, then string is on line 2
            assert.strictEqual(tokens[2].line, 2); // "name"
        });

        it('tracks column number correctly', () => {
            const tokens = tokenize('workspace');
            assert.strictEqual(tokens[0].column, 1);
        });
    });

    // =========================================================================
    // Whitespace handling
    // =========================================================================

    describe('whitespace handling', () => {
        it('skips spaces and tabs between tokens', () => {
            const tokens = tokenize('workspace   \t  "name"');
            assert.strictEqual(tokens[0].type, TokenType.WORKSPACE);
            assert.strictEqual(tokens[1].type, TokenType.STRING);
        });

        it('preserves newlines as tokens', () => {
            const tokens = tokenize('a\nb');
            const newlineTokens = tokens.filter(t => t.type === TokenType.NEWLINE);
            assert.strictEqual(newlineTokens.length, 1);
        });
    });

    // =========================================================================
    // Full DSL tokenization
    // =========================================================================

    describe('full DSL tokenization', () => {
        it('tokenizes a minimal workspace definition', () => {
            const source = `workspace "My System" {
    model {
        user = person "User"
    }
}`;
            const tokens = tokenize(source);
            const meaningful = tokens.filter(t =>
                t.type !== TokenType.NEWLINE &&
                t.type !== TokenType.EOF &&
                t.type !== TokenType.COMMENT
            );
            assert.ok(meaningful.length > 0);
            assert.strictEqual(meaningful[0].type, TokenType.WORKSPACE);
            assert.strictEqual(meaningful[1].type, TokenType.STRING);
            assert.strictEqual(meaningful[1].value, 'My System');
            assert.strictEqual(meaningful[2].type, TokenType.BRACE_OPEN);
        });

        it('tokenizes a relationship line', () => {
            const tokens = tokenize('user -> system "Uses"');
            const meaningful = tokens.filter(t => t.type !== TokenType.EOF);
            assert.strictEqual(meaningful[0].type, TokenType.IDENTIFIER);
            assert.strictEqual(meaningful[0].value, 'user');
            assert.strictEqual(meaningful[1].type, TokenType.ARROW);
            assert.strictEqual(meaningful[2].type, TokenType.IDENTIFIER);
            assert.strictEqual(meaningful[2].value, 'system');
            assert.strictEqual(meaningful[3].type, TokenType.STRING);
            assert.strictEqual(meaningful[3].value, 'Uses');
        });
    });

    // =========================================================================
    // Error handling
    // =========================================================================

    describe('error handling', () => {
        it('throws StructurizrLexerError for unexpected characters', () => {
            assert.throws(() => tokenize('`'), StructurizrLexerError);
        });

        it('StructurizrLexerError includes line and column', () => {
            try {
                tokenize('\n`');
                assert.fail('Expected StructurizrLexerError');
            } catch (error) {
                assert.ok(error instanceof StructurizrLexerError);
                assert.strictEqual(error.line, 2);
                assert.strictEqual(error.column, 1);
            }
        });
    });

    // =========================================================================
    // Token helper functions
    // =========================================================================

    describe('token helper functions', () => {
        it('isKeyword returns true for known keywords', () => {
            assert.strictEqual(isKeyword('workspace'), true);
            assert.strictEqual(isKeyword('model'), true);
            assert.strictEqual(isKeyword('person'), true);
        });

        it('isKeyword returns false for unknown words', () => {
            assert.strictEqual(isKeyword('foobar'), false);
            assert.strictEqual(isKeyword('myService'), false);
        });

        it('getKeywordType returns correct token type for keywords', () => {
            assert.strictEqual(getKeywordType('workspace'), TokenType.WORKSPACE);
            assert.strictEqual(getKeywordType('person'), TokenType.PERSON);
        });

        it('getKeywordType returns null for non-keywords', () => {
            assert.strictEqual(getKeywordType('foobar'), null);
        });
    });
});
