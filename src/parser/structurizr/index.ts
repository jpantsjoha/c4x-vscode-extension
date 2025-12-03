/**
 * Structurizr DSL Parser Exports
 * Complete pipeline: Source → Lexer → Tokens → Parser → AST → Adapter → C4Model
 */

export * from './tokens';
export * from './Lexer';
export * from './ast';
export * from './Parser';
export * from './StructurizrAdapter';

import { StructurizrLexer } from './Lexer';
import { StructurizrParser } from './Parser';
import { StructurizrAdapter } from './StructurizrAdapter';
import { C4Model } from '../../model/C4Model';

/**
 * Parse Structurizr DSL source code to C4Model IR
 * Complete pipeline in one function call
 */
export function parseStructurizrDSL(source: string): C4Model {
    // Step 1: Lexical analysis
    const lexer = new StructurizrLexer(source);
    const tokens = lexer.tokenize();

    // Step 2: Parse tokens to AST
    const parser = new StructurizrParser(tokens);
    const ast = parser.parse();

    // Step 3: Convert AST to C4Model IR
    const adapter = new StructurizrAdapter();
    const model = adapter.convert(ast);

    return model;
}
