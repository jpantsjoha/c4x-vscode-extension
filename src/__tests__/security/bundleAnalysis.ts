/**
 * A syntax-tree tripwire over a JavaScript bundle (#362).
 *
 * Used by bundle-contract.test.ts on the committed MCP and CLI bundles to
 * catch an accidental change, not deliberate evasion. It parses the bundle
 * with the TypeScript compiler (a devDependency) and looks for a fixed set of
 * common spellings of dynamic loading and evaluation: a require that is not a
 * direct call with an allowed literal, a declaration of a reserved global
 * name, plain aliases of require, process or the Function constructor,
 * `.constructor` written as a member read outside a comparison or `.name`, a
 * few native-binding member names, globals read by name for a loader, dynamic
 * import() and eval. Other spellings of the same access pass it: destructuring
 * `constructor`, Reflect.get, property-descriptor reads, a key computed at run
 * time, a sloppy-mode `this`, a string passed to setTimeout. The test file
 * records such cases as known-undetected.
 */
import * as ts from 'typescript';

export interface BundleFacts {
    /** Every specifier named by a direct `require("…")` call, sorted, unique. */
    readonly requires: string[];
    /** `new Function(…)` / `Function(…)` calls. */
    readonly functionConstructors: number;
    /** Allowed aliases of the Function constructor that were found (by their allowlisted snippet). */
    readonly functionAliases: string[];
    /** Allowed `.constructor` reads outside a comparison or `.name` that were found (by snippet). */
    readonly constructorReads: string[];
    /** Everything that could load or run code the allowlist does not name. */
    readonly violations: string[];
}

/** Member names that reach native bindings or a second module loader, on any object. */
const DANGEROUS_MEMBERS = new Set(['binding', '_linkedBinding', 'dlopen', 'mainModule', 'getBuiltinModule', '_load', 'createRequire', 'runInThisContext', 'runInNewContext', 'compileFunction']);
/** Names that must never be read off a global object: they reach a loader, an evaluator or the process. */
const GLOBAL_MEMBERS = new Set(['require', 'process', 'eval', 'Function', 'module']);
/** Names a bundle must not declare: a local of one of these names would hide the global from this walk. */
const RESERVED_NAMES = new Set(['require', 'process', 'eval', 'Function', 'module', 'globalThis', 'global', 'exports']);
/** Global objects through which `require` could be reached by name. */
const GLOBAL_OBJECTS = new Set(['globalThis', 'global', 'window', 'self']);

function stringValue(node: ts.Node | undefined): string | undefined {
    if (node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))) {
        return node.text;
    }
    return undefined;
}

/** True when `node` is the `name` part of `a.name`, a property key, or a label: not a variable reference. */
function isNonReference(node: ts.Identifier): boolean {
    const parent = node.parent;
    return (ts.isPropertyAccessExpression(parent) && parent.name === node)
        || (ts.isPropertyAssignment(parent) && parent.name === node)
        || (ts.isMethodDeclaration(parent) && parent.name === node)
        || (ts.isPropertyDeclaration(parent) && parent.name === node)
        || ((ts.isGetAccessorDeclaration(parent) || ts.isSetAccessorDeclaration(parent)) && parent.name === node)
        || (ts.isLabeledStatement(parent) && parent.label === node)
        || ((ts.isBreakStatement(parent) || ts.isContinueStatement(parent)) && parent.label === node);
}

/** Every binding identifier a node declares, destructuring patterns included. */
function boundNames(name: ts.BindingName): ts.Identifier[] {
    if (ts.isIdentifier(name)) { return [name]; }
    return name.elements.flatMap(element => (ts.isOmittedExpression(element) ? [] : boundNames(element.name)));
}

/**
 * @param allowedFunctionAliases statements, quoted exactly, in which a bundled
 *   dependency takes `Function` into a variable (zod's code generator). Any
 *   other reference to `Function` outside a direct call fails.
 */
export function analyseBundle(
    source: string,
    allowedRequires: readonly string[],
    allowedFunctionAliases: ReadonlyArray<string | RegExp> = [],
    allowedConstructorReads: ReadonlyArray<string | RegExp> = [],
): BundleFacts {
    const file = ts.createSourceFile('bundle.cjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const requires = new Set<string>();
    const violations: string[] = [];
    let functionConstructors = 0;
    const functionAliases: string[] = [];
    const constructorReads: string[] = [];
    // A quoted statement matches by inclusion; a pattern (for minified dependency
    // code, whose identifiers change from build to build) by RegExp test.
    const matches = (allowed: string | RegExp, text: string) => typeof allowed === 'string' ? text.includes(allowed) : allowed.test(text);
    const label = (allowed: string | RegExp) => typeof allowed === 'string' ? allowed : String(allowed);
    const enclosingStatement = (node: ts.Node): ts.Node => {
        let current: ts.Node = node;
        while (current.parent && !ts.isSourceFile(current.parent) && !ts.isBlock(current.parent)) { current = current.parent; }
        return current;
    };
    // No local exemption: a declaration of a reserved name anywhere is itself a
    // violation (below), so a shadowing parameter cannot switch a check off elsewhere.
    const where = (node: ts.Node) => {
        const { line, character } = file.getLineAndCharacterOfPosition(node.getStart(file));
        return `${line + 1}:${character + 1} ${node.getText(file).slice(0, 80)}`;
    };

    /** A Function constructor whose body is a literal naming a loader or the process is never ajv's. */
    const checkFunctionArguments = (node: ts.CallExpression | ts.NewExpression) => {
        for (const argument of node.arguments ?? []) {
            const text = stringValue(argument);
            if (text !== undefined && /\b(?:require|process|module|import|eval|global|globalThis)\b/.test(text)) {
                violations.push(`Function constructor body names a loader or the process at ${where(node)}`);
            }
        }
    };

    const visit = (node: ts.Node): void => {
        const declared = (ts.isVariableDeclaration(node) || ts.isParameter(node) || ts.isBindingElement(node)) ? boundNames(node.name)
            : ((ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isClassDeclaration(node) || ts.isClassExpression(node)) && node.name) ? [node.name]
            : (ts.isCatchClause(node) && node.variableDeclaration) ? [] : [];
        for (const identifier of declared) {
            if (RESERVED_NAMES.has(identifier.text)) {
                violations.push(`declaration of "${identifier.text}" shadows a global at ${where(identifier)}`);
            }
        }
        if (ts.isPropertyAccessExpression(node) && node.name.text === 'constructor') {
            const parent = node.parent;
            const comparison = ts.isBinaryExpression(parent) && [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
                ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(parent.operatorToken.kind);
            const nameRead = ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === 'name';
            if (!comparison && !nameRead) {
                const statement = enclosingStatement(node);
                const allowed = allowedConstructorReads.find(snippet => matches(snippet, statement.getText(file)));
                if (allowed) {
                    constructorReads.push(label(allowed));
                } else {
                    violations.push(`.constructor read outside a comparison or .name at ${where(parent)}`);
                }
            }
        }
        if (ts.isElementAccessExpression(node) && stringValue(node.argumentExpression) === 'constructor') {
            violations.push(`member ["constructor"] at ${where(node)}`);
        }
        if (ts.isCallExpression(node)) {
            if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
                violations.push(`dynamic import() at ${where(node)}`);
            } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
                const specifier = node.arguments.length === 1 ? stringValue(node.arguments[0]) : undefined;
                if (specifier === undefined) {
                    violations.push(`require() without a string literal at ${where(node)}`);
                } else {
                    requires.add(specifier);
                    if (!allowedRequires.includes(specifier)) {
                        violations.push(`require("${specifier}") is not allowed at ${where(node)}`);
                    }
                }
                node.arguments.forEach(visit);
                return;
            } else if (ts.isIdentifier(node.expression) && node.expression.text === 'eval') {
                violations.push(`eval() at ${where(node)}`);
            } else if (ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
                functionConstructors++;
                checkFunctionArguments(node);
            }
        }
        if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') {
            functionConstructors++;
            checkFunctionArguments(node);
        }
        if (ts.isIdentifier(node) && !isNonReference(node)) {
            const parent = node.parent;
            const isDirectCallee = ts.isCallExpression(parent) && parent.expression === node;
            // `typeof require` only reads the type: dagre's and graphlib's
            // environment probes (#353). It cannot call or alias the loader.
            if (node.text === 'require' && !isDirectCallee && !ts.isTypeOfExpression(parent)) {
                violations.push(`require referenced outside a direct call at ${where(parent)}`);
            }
            if (node.text === 'eval' && !isDirectCallee) {
                violations.push(`eval referenced at ${where(parent)}`);
            }
            if (node.text === 'Function') {
                const constructs = (ts.isCallExpression(parent) || ts.isNewExpression(parent)) && parent.expression === node;
                if (!constructs) {
                    const statement = node.parent.parent ?? node.parent;
                    const start = statement.getStart(file);
                    const allowed = allowedFunctionAliases.find(snippet => matches(snippet, source.slice(start, start + (typeof snippet === 'string' ? snippet.length : 80) + 400)));
                    if (allowed) {
                        functionAliases.push(label(allowed));
                    } else {
                        violations.push(`Function constructor referenced outside a direct call at ${where(parent)}`);
                    }
                }
            }
            if (node.text === 'process') {
                // process may only be read through a static member name, or tested with typeof.
                const staticMember = ts.isPropertyAccessExpression(parent) && parent.expression === node;
                const typeOf = ts.isTypeOfExpression(parent);
                if (!staticMember && !typeOf) {
                    violations.push(`process used other than through a static member at ${where(parent)}`);
                }
            }
            if (node.text === 'module') {
                const allowed = ts.isPropertyAccessExpression(parent) && parent.expression === node && parent.name.text === 'exports';
                if (!allowed) {
                    violations.push(`module object used at ${where(parent)}`);
                }
            }
        }
        if (ts.isPropertyAccessExpression(node)) {
            const name = node.name.text;
            if (DANGEROUS_MEMBERS.has(name)) {
                violations.push(`member .${name} at ${where(node)}`);
            }
            if (GLOBAL_MEMBERS.has(name) && ts.isIdentifier(node.expression) && GLOBAL_OBJECTS.has(node.expression.text)) {
                violations.push(`${name} through ${node.expression.text} at ${where(node)}`);
            }
        }
        if (ts.isElementAccessExpression(node)) {
            const key = stringValue(node.argumentExpression);
            if (key !== undefined && (DANGEROUS_MEMBERS.has(key) || GLOBAL_MEMBERS.has(key))) {
                violations.push(`member ["${key}"] at ${where(node)}`);
            }
            if (key === undefined && ts.isIdentifier(node.expression) && (node.expression.text === 'process' || GLOBAL_OBJECTS.has(node.expression.text))) {
                violations.push(`computed member of ${node.expression.text} at ${where(node)}`);
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(file);
    return { requires: [...requires].sort(), functionConstructors, functionAliases: functionAliases.sort(), constructorReads: constructorReads.sort(), violations };
}
