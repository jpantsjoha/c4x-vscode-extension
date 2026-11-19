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
import { StructurizrParserError, WorkspaceNode, ElementNode } from './ast';
import { C4Model } from '../../model/C4Model';

/**
 * Parse Structurizr DSL source code to C4Model IR
 * Complete pipeline in one function call
 */
export function parseStructurizrDSL(source: string): C4Model {
    try {
        return parseUnguarded(source);
    } catch (err) {
        if (err instanceof RangeError) {
            // Pathological nesting exhausted the call stack: report it, never crash.
            throw new StructurizrParserError(
                'Input is nested too deeply to parse',
                { line: 1, column: 1 }
            );
        }
        throw err;
    }
}

function parseUnguarded(source: string): C4Model {
    // Step 1: Lexical analysis
    const lexer = new StructurizrLexer(source);
    const tokens = lexer.tokenize();

    // Step 2: Parse tokens to AST
    const parser = new StructurizrParser(tokens);
    const ast = parser.parse();

    // Step 3: Convert AST to C4Model IR
    const adapter = new StructurizrAdapter();
    const model = adapter.convert(ast);

    // Step 4: never hand back a diagram that is silently empty.
    assertRenderable(ast, model);

    return model;
}

function collectIdentifiers(nodes: ElementNode[] | undefined, out: Set<string>): Set<string> {
    for (const n of nodes ?? []) {
        out.add(n.identifier);
        collectIdentifiers(n.children, out);
    }
    return out;
}

/**
 * A workspace that renders nothing is reported with its cause, located, instead
 * of producing an empty diagram. Views that show at least one element are kept
 * even when some of their references are undefined.
 */
function assertRenderable(ast: WorkspaceNode, model: C4Model): void {
    const fail = (message: string, loc: { line: number; column: number }): never => {
        throw new StructurizrParserError(message, loc);
    };
    if (model.views.length === 0) {
        if (!ast.views || ast.views.views.length === 0) {
            fail('No views found: the workspace has no supported view (systemContext, containerView or componentView) in a views block',
                ast.views?.location ?? ast.location);
        }
        fail('No views found: the workspace has no model block, so its views have nothing to show', ast.views!.location);
    }
    if (model.views.every(v => v.elements.length === 0)) {
        const ids = collectIdentifiers(ast.model?.elements, new Set<string>());
        const first = ast.views!.views[0];
        if (ids.size === 0) {
            fail('The model defines no elements (person, softwareSystem, container or component), so every view is empty',
                ast.model?.location ?? first.location);
        }
        if (first.scope && !ids.has(first.scope)) {
            fail(`View "${first.key}" refers to "${first.scope}", which is not defined in the model`, first.location);
        }
        fail(`View "${first.key}" shows no elements: its include/exclude rules match nothing`, first.location);
    }
}
