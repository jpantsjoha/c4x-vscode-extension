/**
 * #218: the optional `$code` mapping on Container and Component elements.
 */

import * as assert from 'assert';
import { C4XParser } from '../../parser/C4XParser';
import { C4XParseError } from '../../parser/types';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { C4Element } from '../../model/C4Model';
import { codePathProblem, parseCodePaths, splitCodePaths, toSearchGlob } from '../../model/codePaths';
import { parseStructurizrDSL } from '../../parser/structurizr';
import { takeUnseenWarnings } from '../../model/modelWarnings';
import {
    attributeNameContext,
    codeAttributeAt,
    codeValueContext,
    findCodeAttributes,
    isInsideC4xFence,
    isOfferedEntry,
} from '../../completion/codeAttribute';

const parser = new C4XParser();
const builder = new C4ModelBuilder();

function elements(source: string): C4Element[] {
    return builder.build(parser.parse(source), 'test').views[0].elements;
}

function element(source: string, id: string): C4Element {
    const found = elements(source).find(candidate => candidate.id === id);
    assert.ok(found, `missing element ${id}`);
    return found;
}

describe('#218 code paths: splitting and validation', () => {
    it('splits on top-level commas and trims', () => {
        assert.deepStrictEqual(splitCodePaths(' src/parser/** ,src/extension.ts, '), ['src/parser/**', 'src/extension.ts']);
    });

    it('keeps commas inside braces and brackets with their glob', () => {
        assert.deepStrictEqual(splitCodePaths('src/{parser,model}/**, lib/[a,b].ts'), ['src/{parser,model}/**', 'lib/[a,b].ts']);
    });

    it('accepts relative globs and single files', () => {
        for (const glob of ['src/**', 'src/extension.ts', 'packages/*/src/**', 'src/{a,b}/**', 'src/a?.ts', 'src']) {
            assert.strictEqual(codePathProblem(glob), undefined, glob);
        }
    });

    it('rejects paths that are absolute, escape the workspace or are malformed', () => {
        assert.match(codePathProblem('/src/**') ?? '', /absolute/);
        assert.match(codePathProblem('C:/src') ?? '', /absolute/);
        assert.match(codePathProblem('src\\parser') ?? '', /backslash/);
        assert.match(codePathProblem('../other/**') ?? '', /\.\./);
        assert.match(codePathProblem('!src/**') ?? '', /negation/);
        assert.match(codePathProblem('src/{a,b/**') ?? '', /unbalanced/);
        assert.match(codePathProblem('src/a}/**') ?? '', /unbalanced/);
    });

    it('widens a bare path to the file or the folder below it for file search', () => {
        assert.strictEqual(toSearchGlob('src/parser'), '{src/parser,src/parser/**}');
        assert.strictEqual(toSearchGlob('src/parser/'), 'src/parser/**');
        assert.strictEqual(toSearchGlob('src/*.ts'), 'src/*.ts');
    });

    it('rejects shell and regex syntax outside the safe character set', () => {
        for (const glob of ['$(touch${IFS}/tmp/pwned)/x/**', 'src/`id`/**', 'src/a;rm/**', "src/it's/**", 'src/a|b', 'src/%x', 'src/a&b']) {
            assert.match(codePathProblem(glob) ?? '', /contains "/, glob);
        }
        for (const glob of ['src/a b/**', 'app/(marketing)/**', 'src/@scope/x+y~z/**', 'src/#gen/**']) {
            assert.strictEqual(codePathProblem(glob), undefined, glob);
        }
    });

    it('rejects a leading "./" and globs that do not compile', () => {
        assert.match(codePathProblem('./src/**') ?? '', /starts with "\.\/"/);
        assert.match(codePathProblem('src/[z-a]') ?? '', /is not a valid glob/);
        assert.throws(() => parseCodePaths('src/[z-a]'), /not a valid glob/);
    });

    it('caps wildcards per glob at three, the measured backtracking budget', () => {
        assert.strictEqual(codePathProblem('packages/*/src/**/*.ts'), undefined);
        assert.match(codePathProblem('src/*a*a*a*b') ?? '', /4 wildcards; use at most 3/);
        assert.match(codePathProblem('src/*a*a*a*a*a*a*a*a*b') ?? '', /9 wildcards/);
    });

    it('parseCodePaths requires at least one entry and names the bad one', () => {
        assert.throws(() => parseCodePaths(' , '), /lists no paths/);
        assert.throws(() => parseCodePaths('src/**, ../x'), /"\.\.\/x"/);
    });
});

describe('#218 $code in the C4X grammar and model', () => {
    const header = '%%{ c4: component }%%\ngraph TB\n';

    it('maps a single glob on a Component', () => {
        const parsed = element(`${header}Component(parser, "Parser", "Peggy", "AST", $code="src/parser/**")`, 'parser');
        assert.deepStrictEqual(parsed.codePaths, ['src/parser/**']);
        assert.strictEqual(parsed.metadata, undefined, '$code must not leak into generic metadata');
    });

    it('maps multiple globs, including a brace glob and a single file', () => {
        const parsed = element(`${header}Component(entry, "Entry", $code="src/{commands,markdown}/**, src/extension.ts")`, 'entry');
        assert.deepStrictEqual(parsed.codePaths, ['src/{commands,markdown}/**', 'src/extension.ts']);
    });

    it('maps $code on Containers and their Db/Ext variants', () => {
        const source = `${header}Container(api, "API", $code="services/api/**")\nContainerDb(db, "DB", $code="migrations/**")\nComponent_Ext(x, "X", $code="vendor/**")`;
        assert.deepStrictEqual(elements(source).map(e => e.codePaths), [['services/api/**'], ['migrations/**'], ['vendor/**']]);
    });

    it('keeps $code alongside $tags, $sprite and layout metadata in any order', () => {
        const parsed = element(`${header}Component(p, "P", $x="10", $code="src/p/**", $tags="core", $sprite=person, $y="5")`, 'p');
        assert.deepStrictEqual(parsed.codePaths, ['src/p/**']);
        assert.deepStrictEqual(parsed.tags, ['core']);
        assert.strictEqual(parsed.sprite, 'person');
        assert.deepStrictEqual(parsed.metadata, { x: '10', y: '5' });
    });

    it('accepts $code on bracket elements, after the bracket or as a tag line', () => {
        assert.deepStrictEqual(element(`${header}p[Parser<br/>Component] $code="src/parser/**"`, 'p').codePaths, ['src/parser/**']);
        assert.deepStrictEqual(element(`${header}p[Parser<br/>Component<br/>$code=src/parser]`, 'p').codePaths, ['src/parser']);
    });

    it('accepts $code inside boundaries', () => {
        const source = `${header}Container_Boundary(host, "Host") {\n  Component(a, "A", $code="src/a/**")\n}`;
        assert.deepStrictEqual(element(source, 'a').codePaths, ['src/a/**']);
    });

    it('rejects a duplicate $code key and $code on a subgraph', () => {
        assert.throws(() => parser.parse(`${header}Component(a, "A", $code="src/a/**", $code="src/b/**")`), /Duplicate \$code attribute/);
        assert.throws(() => parser.parse(`${header}subgraph Host $code="src/**" {\n  Component(a, "A")\n}`), /not on a subgraph/);
    });

    it('splits a tag-line attribute at the first "=" only', () => {
        const parsed = element(`${header}p[Parser<br/>Component<br/>$note=a=b]`, 'p');
        assert.deepStrictEqual(parsed.metadata, { note: 'a=b' });
    });

    it('leaves elements without $code unmapped', () => {
        assert.strictEqual(element(`${header}Component(a, "A")`, 'a').codePaths, undefined);
    });

    it('rejects $code on a Person, a Software System and a Node, at the element line', () => {
        for (const [declaration, type] of [
            ['Person(u, "User", $code="src/**")', 'Person'],
            ['System(s, "S", $code="src/**")', 'SoftwareSystem'],
            ['Node(n, "Node", $code="src/**") {\n}', 'DeploymentNode'],
        ]) {
            assert.throws(
                () => elements(`${header}\n${declaration}`),
                (error: unknown) => error instanceof C4XParseError &&
                    error.message.includes(`is a ${type}`) &&
                    error.location.line === 4,
                declaration,
            );
        }
    });

    it('rejects an empty or invalid $code with the element named', () => {
        assert.throws(() => elements(`${header}Component(a, "A", $code="")`), /Element "a": \$code lists no paths/);
        assert.throws(() => elements(`${header}Component(a, "A", $code="/abs/**")`), /Element "a": \$code entry "\/abs\/\*\*" is absolute/);
    });

    it('fails to parse an unquoted glob or an unterminated value', () => {
        assert.throws(() => parser.parse(`${header}Component(a, "A", $code=src/a/**)`), C4XParseError);
        assert.throws(() => parser.parse(`${header}Component(a, "A", $code="src/a/**)`), C4XParseError);
    });
});

describe('#218 Structurizr properties { "code" ... }', () => {
    const dsl = (properties: string) => `workspace "W" {
    model {
        s = softwareSystem "S" {
            api = container "API" {
                parser = component "Parser" {
                    description "Parses"
                    ${properties}
                }
            }
        }
    }
    views {
        componentView api "Components" {
            include *
        }
    }
}`;

    it('maps the code property onto codePaths without disturbing the description', () => {
        const model = parseStructurizrDSL(dsl('properties {\n "code" "src/parser/**, src/extension.ts"\n owner "team-a"\n }'));
        const parsed = model.views[0].elements.find(e => e.id === 'parser');
        assert.deepStrictEqual(parsed?.codePaths, ['src/parser/**', 'src/extension.ts']);
        assert.strictEqual(parsed?.description, 'Parses');
    });

    it('accepts a bare code key', () => {
        const model = parseStructurizrDSL(dsl('properties {\n code "src/parser/**"\n }'));
        assert.deepStrictEqual(model.views[0].elements.find(e => e.id === 'parser')?.codePaths, ['src/parser/**']);
    });

    it('leaves elements without a code property unmapped', () => {
        const model = parseStructurizrDSL(dsl('properties {\n owner "team-a"\n }'));
        assert.strictEqual(model.views[0].elements.find(e => e.id === 'parser')?.codePaths, undefined);
    });

    it('warns about, and ignores, a code property on a person or software system', () => {
        const workspace = (element: string) => `workspace "W" {
    model {
        ${element}
        x = softwareSystem "X"
    }
    views {
        systemContext x "Context" {
            include *
        }
    }
}`;
        for (const [element, kind] of [
            ['u = person "User" {\n properties {\n code "src/**"\n }\n }', 'person'],
            ['s = softwareSystem "Billing" {\n properties {\n "code" "SYS:001"\n }\n }', 'softwareSystem'],
        ]) {
            const model = parseStructurizrDSL(workspace(element));
            assert.strictEqual(model.warnings?.length, 1, element);
            assert.match(model.warnings[0].message, new RegExp(`only on containers and components, not on a ${kind}; it is ignored`));
            assert.ok(model.views.every(view => view.elements.every(e => e.codePaths === undefined)));
        }
    });

    it('warns about, and ignores, a code property on a container that is not a path mapping', () => {
        for (const value of ['SYS:001', '../x']) {
            const model = parseStructurizrDSL(dsl(`properties {\n "code" "${value}"\n }`));
            assert.strictEqual(model.warnings?.length, 1, value);
            assert.match(model.warnings[0].message, /Element "parser" \(\d+:\d+\): the code property is not a source-path mapping and is ignored/);
            assert.strictEqual(model.views[0].elements.find(e => e.id === 'parser')?.codePaths, undefined);
        }
    });

    it('keys a warning by element and value, so editing lines above it does not raise it again', () => {
        const before = parseStructurizrDSL(dsl('properties {\n "code" "SYS:001"\n }'));
        const shifted = parseStructurizrDSL(`// a comment\n// added above\n${dsl('properties {\n "code" "SYS:001"\n }')}`);
        const [first] = before.warnings ?? [];
        const [moved] = shifted.warnings ?? [];
        assert.ok(first && moved);
        assert.notStrictEqual(moved.message, first.message, 'the displayed location follows the edit');
        assert.strictEqual(moved.key, first.key, 'the identity does not');

        const seen = new Set<string>();
        assert.deepStrictEqual(takeUnseenWarnings(before.warnings, seen).map(w => w.message), [first.message]);
        assert.deepStrictEqual(takeUnseenWarnings(shifted.warnings, seen), [], 'no second toast after the edit');
        const changed = parseStructurizrDSL(dsl('properties {\n "code" "SYS:002"\n }'));
        assert.strictEqual(takeUnseenWarnings(changed.warnings, seen).length, 1, 'a different value is a new problem');
        assert.deepStrictEqual(takeUnseenWarnings(undefined, seen), []);
    });

    it('a valid mapping produces no warning; a property with no value is still a parse error', () => {
        assert.strictEqual(parseStructurizrDSL(dsl('properties {\n code "src/parser/**"\n }')).warnings, undefined);
        assert.throws(() => parseStructurizrDSL(dsl('properties {\n code\n }')), /has no value/);
    });
});

describe('#218 $code editor helpers', () => {
    const line = 'Component(p, "P with $code=\\"no\\"", $code="src/p/**, src/q.ts", $sprite=x)';

    it('finds the attribute and ignores look-alikes inside quoted text', () => {
        const spans = findCodeAttributes('Component(p, "label $code=\\"x\\"", $code="src/p/**")');
        assert.strictEqual(spans.length, 1);
        assert.deepStrictEqual(spans[0].globs, ['src/p/**']);
        const at = codeAttributeAt(line, line.indexOf('src/q.ts'));
        assert.deepStrictEqual(at?.globs, ['src/p/**', 'src/q.ts']);
        assert.strictEqual(line.slice(at!.start, at!.end), '$code="src/p/**, src/q.ts"');
        assert.strictEqual(codeAttributeAt(line, line.indexOf('$sprite')), undefined);
    });

    it('reports the entry, directory and fragment being typed', () => {
        assert.deepStrictEqual(codeValueContext('Component(a, "A", $code="'), { entry: '', directory: '', fragment: '' });
        assert.deepStrictEqual(codeValueContext('Component(a, "A", $code="src/pa'), { entry: 'src/pa', directory: 'src/', fragment: 'pa' });
        assert.deepStrictEqual(codeValueContext('X(a, "A", $code="src/{a,b}/**, lib/x'), { entry: 'lib/x', directory: 'lib/', fragment: 'x' });
        assert.strictEqual(codeValueContext('X(a, "A", $code="src/**'), undefined, 'patterns get no path completion');
        assert.strictEqual(codeValueContext('X(a, "A", $code="src/a")'), undefined, 'closed value');
        assert.strictEqual(codeValueContext('X(a, "label $code="'), undefined, 'inside a label');
    });

    it('offers the attribute name after $ in element context only', () => {
        assert.deepStrictEqual(attributeNameContext('Component(a, "A", $'), { typed: '$' });
        assert.deepStrictEqual(attributeNameContext('    Component(a, "A", "Tech", $tags="x", $co'), { typed: '$co' });
        assert.deepStrictEqual(attributeNameContext('p[Parser<br/>Component] $'), { typed: '$' });
        assert.deepStrictEqual(attributeNameContext('Component(p, "Parser (v2)", "Peggy", $'), { typed: '$' }, 'a ) inside a label');
        assert.deepStrictEqual(attributeNameContext('p[Parser<br/>Component] $x="1", $'), { typed: '$' });
        assert.strictEqual(attributeNameContext('Component(a, "A", $sp'), undefined);
        assert.strictEqual(attributeNameContext('Component(a, "costs $'), undefined);
        assert.strictEqual(attributeNameContext('The licence costs $'), undefined, 'prose');
        assert.strictEqual(attributeNameContext('Export the variable with $'), undefined, 'prose');
        assert.strictEqual(attributeNameContext('a --> b $'), undefined, 'relationship');
    });

    it('knows whether a Markdown line sits inside a c4x fence', () => {
        const lines = ['Prose $', '```c4x', 'Component(a, "A", $', '```', 'More $', '~~~ts', 'x', '~~~', '````c4x', '```', 'inner', '````'];
        const at = (line: number) => lines[line];
        assert.strictEqual(isInsideC4xFence(at, 0), false);
        assert.strictEqual(isInsideC4xFence(at, 2), true);
        assert.strictEqual(isInsideC4xFence(at, 4), false);
        assert.strictEqual(isInsideC4xFence(at, 6), false, 'a ts fence');
        assert.strictEqual(isInsideC4xFence(at, 10), true, 'a shorter fence does not close a longer one');
    });

    it('never completes paths outside the workspace', () => {
        assert.strictEqual(codeValueContext('Component(a, "A", $code="../'), undefined);
        assert.strictEqual(codeValueContext('Component(a, "A", $code="src/../'), undefined);
        assert.strictEqual(codeValueContext('Component(a, "A", $code="/etc/'), undefined);
    });

    it('hides dot-entries and build output from path completion', () => {
        assert.strictEqual(isOfferedEntry('src'), true);
        for (const hidden of ['.git', 'node_modules', 'out', 'dist', 'coverage']) {
            assert.strictEqual(isOfferedEntry(hidden), false, hidden);
        }
    });
});
