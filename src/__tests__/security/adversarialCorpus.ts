/**
 * Adversarial sources of about 1 MiB for each parser C4X runs (#362): C4X
 * (MCP, CLI, editor), PlantUML and Structurizr (editor, Markdown preview and
 * export). parser-timing.test.ts runs each one in a child process with a hard
 * watchdog, so a regression to super-linear work fails the suite instead of
 * hanging it.
 */
import { MAX_NESTING_DEPTH } from '../../parser/nestingDepth';

export const CORPUS_BYTES = 1024 * 1024;

function pad(unit: string, prefix = '', suffix = ''): string {
    const room = CORPUS_BYTES - prefix.length - suffix.length;
    return prefix + unit.repeat(Math.max(0, Math.floor(room / unit.length))) + suffix;
}

function nestedC4x(depth: number): string {
    return Array.from({ length: depth }, (_, i) => `Node(n${i}, "N", "T") {`).join('\n') + '\nContainer(app, "A", "T", "D")\n' + '}\n'.repeat(depth);
}

export type Format = 'c4x' | 'plantuml' | 'structurizr' | 'markdown';

export function handWrittenCorpus(format: Format): ReadonlyArray<readonly [string, string]> {
    if (format === 'markdown') {
        return [];
    }
    if (format === 'c4x') {
        return [
            ['one very long line of junk', pad('x', 'graph TB\n')],
            ['one label of 1 MiB', `graph TB\nSystem(a, "${'x'.repeat(CORPUS_BYTES - 40)}")`],
            ['unterminated quote', pad('\\"', 'graph TB\nSystem(a, "')],
            ['repeated argument separators', pad(', "x"', 'graph TB\nSystem(a')],
            ['attribute spam', pad(', $tags="t"', 'graph TB\nSystem(a, "x"', ')')],
            ['comment spam', pad('%%', 'graph TB\n')],
            ['unclosed brackets', pad('a[', 'graph TB\n')],
            ['line breaks in a bracket body', pad('<br/>', 'graph TB\na[')],
            ['pipes', pad('|', 'graph TB\na --> |')],
            ['dashes', pad('-', 'graph TB\na ')],
            ['relationship chain to unknown ids', pad('a --> b\n', 'graph TB\n')],
            ['elementStyle spam', pad('elementStyle t $background="#ffffff"\n', 'graph TB\n')],
            ['many shallow boundaries', pad('System_Boundary(b, "B") {\nContainer(c, "C")\n}\n', '%%{ c4: container }%%\ngraph TB\n')],
            ['nesting at the limit, repeated', pad(nestedC4x(MAX_NESTING_DEPTH) + '\n', '%%{ c4: deployment }%%\ngraph TB\n')],
            ['open braces only', pad('subgraph s {\n', 'graph TB\n')],
            ['quote in a bracket label, then deep nesting', pad('subgraph s {\n', 'graph TB\na["<br/>Container]\n')],
        ];
    }
    if (format === 'plantuml') {
        return [
            ['parenthesis inside a quoted argument, then many lines', pad('x\n', '@startuml\nSystem(a, "A", "(")\n', '@enduml')],
            ['unclosed parenthesis, then many lines', pad('x\n', '@startuml\nSystem(a, "A", "d"\n', '@enduml')],
            ['unterminated quote, then many lines', pad('x\n', '@startuml\nSystem(a, "A\n', '@enduml')],
            ['one macro with a huge argument list', pad(', "y"', '@startuml\nSystem(a, "x"', ')\n@enduml')],
            ['many elements', pad('System(s, "S", "d")\n', '@startuml\n', '@enduml')],
            ['many relationships', pad('Rel(a, b, "uses")\n', '@startuml\nSystem(a, "A", "d")\nSystem(b, "B", "d")\n', '@enduml')],
            ['open boundaries, never closed', pad('System_Boundary(b, "B") {\n', '@startuml\n', '@enduml')],
            ['brace spam inside one boundary', pad('{}\n', '@startuml\nSystem_Boundary(b, "B") {\n', '}\n@enduml')],
            ['nesting at the limit, repeated', pad(Array.from({ length: MAX_NESTING_DEPTH }, (_, i) => `Boundary(b${i}, "B") {`).join('\n') + '\nSystem(s, "S", "d")\n' + '}\n'.repeat(MAX_NESTING_DEPTH), '@startuml\n', '@enduml')],
            ['backslash spam in a quoted argument', pad('\\\\', '@startuml\nSystem(a, "', '")\n@enduml')],
            ['one very long line of junk', pad('x', '@startuml\n', '\n@enduml')],
        ];
    }
    const workspace = (model: string) => `workspace "W" {\n  model {\n${model}\n  }\n  views {\n    systemLandscape {\n      include *\n    }\n  }\n}`;
    const shell = workspace('');
    const fill = (unit: string) => workspace(unit.repeat(Math.max(0, Math.floor((CORPUS_BYTES - shell.length) / unit.length))));
    return [
        ['many software systems', fill('s = softwareSystem "S" "d"\n')],
        ['many relationships', fill('a -> b "uses"\n')],
        ['one string of 1 MiB', workspace(`a = softwareSystem "${'x'.repeat(CORPUS_BYTES - shell.length - 40)}"`)],
        ['unterminated string', `workspace "W" {\n  model {\n    a = softwareSystem "${'x'.repeat(CORPUS_BYTES - 60)}`],
        ['open braces only', pad('{\n', 'workspace "W" {\n  model {\n')],
        ['nesting at the limit, repeated', fill(Array.from({ length: MAX_NESTING_DEPTH }, (_, i) => `s${i} = softwareSystem "S" {`).join('\n') + '\n' + '}\n'.repeat(MAX_NESTING_DEPTH))],
        ['comment spam', pad('// c\n', 'workspace "W" {\n', '}')],
        ['token spam', pad('-> ', 'workspace "W" {\n  model {\n')],
        ['one very long line of junk', pad('x', '')],
    ];
}

/**
 * One grammar repetition: a prefix, a unit repeated (or generated per index)
 * until the source is just under the size cap, and a suffix.
 */
interface Repetition {
    readonly name: string;
    readonly prefix: string;
    readonly unit: string | ((index: number) => string);
    readonly suffix?: string;
}

/** Fill to just under the cap; a generated unit is appended until the next one would not fit. */
function fill(repetition: Repetition, header: string): string {
    const prefix = header + repetition.prefix;
    const suffix = repetition.suffix ?? '';
    if (typeof repetition.unit === 'string') {
        return pad(repetition.unit, prefix, suffix);
    }
    const parts: string[] = [prefix];
    let size = prefix.length + suffix.length;
    for (let index = 0; ; index++) {
        const next = repetition.unit(index);
        if (size + next.length > CORPUS_BYTES) { break; }
        parts.push(next);
        size += next.length;
    }
    parts.push(suffix);
    return parts.join('');
}

const BIG = CORPUS_BYTES - 200;

/** Every repetition the C4X grammar has, plus long tokens and filler runs. */
const C4X_REPETITIONS: readonly Repetition[] = [
    { name: 'attributes on one element (repeated key)', prefix: 'System(a, "A", "d"', unit: ', $note="x"', suffix: ')' },
    { name: 'attributes on one element (distinct keys)', prefix: 'System(a, "A", "d"', unit: i => `, $k${i}="x"`, suffix: ')' },
    { name: 'tags in one value', prefix: 'System(a, "A", "d", $tags="', unit: 't,', suffix: '")' },
    { name: 'positional arguments', prefix: 'System(a', unit: ', "x"', suffix: ')' },
    { name: 'call-form elements', prefix: '', unit: i => `System(s${i}, "S", "d")\n` },
    { name: 'bracket-form elements', prefix: '', unit: i => `s${i}[S<br/>Software System]\n` },
    { name: 'relationships between two elements', prefix: 'System(a, "A", "d")\nSystem(b, "B", "d")\n', unit: 'a -->|uses| "HTTPS" b\n' },
    { name: 'relationship chain to unknown ids', prefix: '', unit: i => `a${i} --> a${i + 1}\n` },
    { name: 'sibling boundaries', prefix: '', unit: i => `System_Boundary(b${i}, "B") {\nContainer(c${i}, "C")\n}\n` },
    { name: 'sibling subgraphs', prefix: '', unit: i => `subgraph g${i} {\nx${i}[X<br/>Container]\n}\n` },
    { name: 'nesting at the limit, repeated', prefix: '', unit: i => Array.from({ length: MAX_NESTING_DEPTH }, (_, d) => `subgraph g${i}_${d} {`).join('\n') + '\n' + '}\n'.repeat(MAX_NESTING_DEPTH) },
    { name: 'elementStyle pairs on one line', prefix: 'elementStyle t $background="#ffffff"', unit: ', $legend="x"' },
    { name: 'elementStyle lines', prefix: '', unit: i => `elementStyle t${i} $background="#ffffff"\n` },
    { name: 'classDef lines', prefix: '', unit: i => `classDef c${i} fill:#fff\n` },
    { name: 'line breaks in one bracket body', prefix: 'a[x', unit: '<br/>y', suffix: ']' },
    { name: 'long identifier', prefix: `System(${'a'.repeat(BIG)}`, unit: ' ', suffix: ', "A")' },
    { name: 'long quoted label', prefix: `System(a, "${'x'.repeat(BIG)}`, unit: ' ', suffix: '")' },
    { name: 'long bracket label', prefix: `a[${'x'.repeat(BIG)}`, unit: ' ', suffix: '<br/>Container]' },
    { name: 'long relationship label', prefix: `System(a, "A", "d")\nSystem(b, "B", "d")\na -->|${'x'.repeat(BIG - 60)}`, unit: ' ', suffix: '| b' },
    { name: 'long relationship technology', prefix: `System(a, "A", "d")\nSystem(b, "B", "d")\na -->|uses| "${'x'.repeat(BIG - 60)}`, unit: ' ', suffix: '" b' },
    { name: 'comment run', prefix: '', unit: '%% comment\n' },
    { name: 'blank lines', prefix: '', unit: '\n', suffix: 'System(a, "A", "d")' },
    { name: 'CRLF blank lines', prefix: '', unit: '\r\n', suffix: 'System(a, "A", "d")' },
    { name: 'whitespace run on one line', prefix: 'System(a,', unit: ' ', suffix: '"A", "d")' },
    { name: 'direction statements in a subgraph', prefix: 'subgraph g {\n', unit: 'direction LR\n', suffix: '}' },
];

/** Every repetition the PlantUML parser handles, plus long tokens and filler runs. */
const PLANTUML_REPETITIONS: readonly Repetition[] = [
    { name: 'element macros', prefix: '@startuml\n', unit: i => `System(s${i}, "S", "d")\n`, suffix: '@enduml' },
    { name: 'container macros with all arguments', prefix: '@startuml\n', unit: i => `Container(c${i}, "C", "T", "D", "tag", "sprite", "link")\n`, suffix: '@enduml' },
    { name: 'relationship macros', prefix: '@startuml\nSystem(a, "A", "d")\nSystem(b, "B", "d")\n', unit: 'Rel(a, b, "uses", "HTTPS")\n', suffix: '@enduml' },
    { name: 'sibling boundaries', prefix: '@startuml\n', unit: i => `System_Boundary(b${i}, "B") {\nSystem(s${i}, "S", "d")\n}\n`, suffix: '@enduml' },
    { name: 'nesting at the limit, repeated', prefix: '@startuml\n', unit: i => Array.from({ length: MAX_NESTING_DEPTH }, (_, d) => `Boundary(b${i}_${d}, "B") {`).join('\n') + '\n' + '}\n'.repeat(MAX_NESTING_DEPTH), suffix: '@enduml' },
    { name: 'arguments in one macro', prefix: '@startuml\nSystem(a, "x"', unit: ', "y"', suffix: ')\n@enduml' },
    { name: 'one element spanning the whole file', prefix: '@startuml\nSystem(a, "A", "', unit: 'line of description\n', suffix: '")\nSystem(b, "B", "d")\n@enduml' },
    { name: 'long alias', prefix: `@startuml\nSystem(${'a'.repeat(BIG)}`, unit: ' ', suffix: ', "A", "d")\n@enduml' },
    { name: 'long quoted string', prefix: `@startuml\nSystem(a, "${'x'.repeat(BIG)}`, unit: ' ', suffix: '", "d")\n@enduml' },
    { name: 'escaped quotes in one string', prefix: '@startuml\nSystem(a, "', unit: '\\"', suffix: '", "d")\n@enduml' },
    { name: 'parentheses inside one quoted string', prefix: '@startuml\nSystem(a, "', unit: '((', suffix: '", "d")\n@enduml' },
    { name: 'comment run', prefix: '@startuml\n', unit: "' comment\n", suffix: '@enduml' },
    { name: 'blank lines', prefix: '@startuml\n', unit: '\n', suffix: 'System(a, "A", "d")\n@enduml' },
    { name: 'directive lines', prefix: '@startuml\n', unit: '!include <C4/C4_Container>\n', suffix: '@enduml' },
    { name: 'braces inside one boundary', prefix: '@startuml\nSystem_Boundary(b, "B") {\n', unit: '{ }\n', suffix: '}\n@enduml' },
    { name: 'balanced parentheses on non-macro lines', prefix: '@startuml\n', unit: 'title (draft)\n', suffix: '@enduml' },
];

/** Every repetition the Structurizr parser handles, plus long tokens and filler runs. */
const STRUCTURIZR_REPETITIONS: readonly Repetition[] = [
    { name: 'software systems', prefix: 'workspace "W" {\nmodel {\n', unit: i => `s${i} = softwareSystem "S" "d"\n`, suffix: '}\n}' },
    { name: 'containers in one system', prefix: 'workspace "W" {\nmodel {\ns = softwareSystem "S" {\n', unit: i => `c${i} = container "C" "d" "T"\n`, suffix: '}\n}\n}' },
    { name: 'relationships', prefix: 'workspace "W" {\nmodel {\na = softwareSystem "A"\nb = softwareSystem "B"\n', unit: 'a -> b "uses" "HTTPS"\n', suffix: '}\n}' },
    { name: 'nesting at the limit, repeated', prefix: 'workspace "W" {\nmodel {\n', unit: i => Array.from({ length: MAX_NESTING_DEPTH }, (_, d) => `s${i}_${d} = softwareSystem "S" {`).join('\n') + '\n' + '}\n'.repeat(MAX_NESTING_DEPTH), suffix: '}\n}' },
    { name: 'groups', prefix: 'workspace "W" {\nmodel {\n', unit: i => `group "g${i}" {\ns${i} = softwareSystem "S"\n}\n`, suffix: '}\n}' },
    { name: 'properties entries', prefix: 'workspace "W" {\nmodel {\ns = softwareSystem "S" {\nproperties {\n', unit: i => `"k${i}" "v"\n`, suffix: '}\n}\n}\n}' },
    { name: 'tags on one element', prefix: 'workspace "W" {\nmodel {\ns = softwareSystem "S" {\ntags', unit: ' "t"', suffix: '\n}\n}\n}' },
    { name: 'view include lines', prefix: 'workspace "W" {\nmodel {\ns = softwareSystem "S"\n}\nviews {\nsystemContext s {\n', unit: 'include s\n', suffix: '}\n}\n}' },
    { name: 'long string', prefix: `workspace "W" {\nmodel {\ns = softwareSystem "${'x'.repeat(BIG)}`, unit: ' ', suffix: '"\n}\n}' },
    { name: 'long identifier', prefix: `workspace "W" {\nmodel {\n${'s'.repeat(BIG)}`, unit: ' ', suffix: ' = softwareSystem "S"\n}\n}' },
    { name: 'line comment run', prefix: 'workspace "W" {\n', unit: '// comment\n', suffix: '}' },
    { name: 'hash comment run', prefix: 'workspace "W" {\n', unit: '# comment\n', suffix: '}' },
    { name: 'block comment run', prefix: 'workspace "W" {\n', unit: '/* comment */\n', suffix: '}' },
    { name: 'unterminated block comment', prefix: 'workspace "W" {\n/*', unit: 'x', suffix: '' },
    { name: 'blank lines', prefix: 'workspace "W" {\n', unit: '\n', suffix: '}' },
    { name: 'brace run', prefix: 'workspace "W" {\nmodel {\n', unit: '{\n', suffix: '' },
];

/** The generated grid: every repetition, and for C4X both with and without the header lines. */
/** Markdown files as c4x-lint reads them: the fence scanner, then one lint per fence. */
const MARKDOWN_REPETITIONS: readonly Repetition[] = [
    { name: 'many small fences', prefix: '# Doc\n', unit: '```c4x\ngraph TB\nSystem(a, "A", "d")\n```\n' },
    { name: 'fences separated by prose', prefix: '# Doc\n', unit: 'Some text.\n\n```c4x\nSystem(a, "A", "d")\n```\n\n' },
    { name: 'unclosed fence openers', prefix: '', unit: '```c4x\n' },
    { name: 'fence openers in list items', prefix: '', unit: '- ```c4x\n' },
    { name: 'one fence holding the whole file', prefix: '```c4x\ngraph TB\n', unit: i => `s${i}[S<br/>Software System]\n`, suffix: '```\n' },
    { name: 'blank lines', prefix: '', unit: '\n' },
    { name: 'backtick run', prefix: '', unit: '`' },
];

export function generatedCorpus(format: Format): ReadonlyArray<readonly [string, string]> {
    if (format === 'markdown') {
        return MARKDOWN_REPETITIONS.map(repetition => [repetition.name, fill(repetition, '')] as const);
    }
    if (format === 'c4x') {
        return C4X_REPETITIONS.flatMap(repetition => [
            [`${repetition.name} (with header)`, fill(repetition, '%%{ c4: container }%%\ngraph TB\n')] as const,
            // Without `graph TB` the parser injects one and maps every position back:
            // the path where 40,000 attributes once took over 6.5 s.
            [`${repetition.name} (no header)`, fill(repetition, '')] as const,
        ]);
    }
    const repetitions = format === 'plantuml' ? PLANTUML_REPETITIONS : STRUCTURIZR_REPETITIONS;
    return repetitions.map(repetition => [repetition.name, fill(repetition, '')] as const);
}

/** Everything parser-timing.test.ts runs for one parser. */
export function corpus(format: Format): ReadonlyArray<readonly [string, string]> {
    return [...handWrittenCorpus(format), ...generatedCorpus(format)];
}
