import * as assert from 'assert';

import * as vscodeMock from '../__mocks__/vscode';

// Hand the provider this file's mock while it loads. Other test files install their own
// `vscode` stand-ins, and whichever resolved first would win, so do not rely on resolution.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalLoad = Module._load;
// A copy: another test adds and deletes members of the shared mock (SnippetString), after this file has loaded.
const providerVscode = { ...vscodeMock };
Module._load = function (request: string, ...args: unknown[]) {
    return request === 'vscode' ? providerVscode : originalLoad.call(this, request, ...args);
};
// Another test may have loaded the provider (through extension.ts) against its own stand-in.
delete require.cache[require.resolve('../../completion/C4XCompletionItemProvider')];
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { C4XCompletionItemProvider } = require('../../completion/C4XCompletionItemProvider') as typeof import('../../completion/C4XCompletionItemProvider');
Module._load = originalLoad;
import { lintC4xSource } from '../../cli/lintSource';
import { normalizeLintOptions } from '../../model/lint';
import { attributeNameContext } from '../../completion/codeAttribute';
import {
    borderValueContext,
    shapeEntries,
    shapeHelp,
    shapeValueContext,
    styleKeyContext,
    styleKeyEntries,
} from '../../completion/styleAttributes';
import { drawnShapeNames, styleKeyNames, styleShapeNames } from '../../render/elementStyle';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Expand a VS Code snippet body with each tab stop taking its default: `${n:text}` gives text
 * (nested placeholders too), `${n|a,b|}` gives the first choice, `$n` and `${n}` give nothing,
 * a variable (`$NAME`, `${NAME}`, `${NAME:default}`) gives its default or nothing, and `\$`, `\}`
 * and `\\` give the character itself.
 */
function expandSnippet(body: string): string {
    let i = 0;
    const parse = (stopAtBrace: boolean): string => {
        let out = '';
        while (i < body.length) {
            const ch = body[i];
            if (ch === '\\' && /[$}\\]/.test(body[i + 1] ?? '')) { out += body[i + 1]; i += 2; continue; }
            if (stopAtBrace && ch === '}') { return out; }
            if (ch !== '$') { out += ch; i++; continue; }
            const rest = body.slice(i + 1);
            let m: RegExpExecArray | null;
            if ((m = /^\d+/.exec(rest))) { i += 1 + m[0].length; continue; }
            if ((m = /^[A-Za-z_]\w*/.exec(rest))) { i += 1 + m[0].length; continue; }
            if ((m = /^\{(\d+)\|([^|]*)\|\}/.exec(rest))) { out += m[2].split(',')[0]; i += 1 + m[0].length; continue; }
            if ((m = /^\{(\d+|[A-Za-z_]\w*)(:)?/.exec(rest))) {
                i += 1 + m[0].length;
                const inner = m[2] ? parse(true) : '';
                if (body[i] === '}') { i++; }
                if (/^\d/.test(m[1])) { out += inner; } else { out += inner; }
                continue;
            }
            out += ch; i++;
        }
        return out;
    };
    return parse(false);
}

/** A one-line document, the cursor at the end of the line (#332). */
function documentOf(text: string, languageId = 'c4x'): never {
    return {
        languageId,
        lineAt: () => ({ text }),
    } as never;
}

async function complete(text: string): Promise<vscodeMock.CompletionItem[]> {
    const provider = new C4XCompletionItemProvider();
    const position = new vscodeMock.Position(0, text.length);
    const result = await provider.provideCompletionItems(documentOf(text), position as never, {} as never, {} as never);
    return (Array.isArray(result) ? result : (result as { items: unknown[] }).items) as vscodeMock.CompletionItem[];
}

describe('#332 completion offers the C4 notation', () => {
    describe('shape names after $shape="', () => {
        it('offers all 19 Structurizr shape names, drawn ones first', async () => {
            const items = await complete('Container(db, "Orders", "Postgres", $shape="');
            const labels = items.map(item => item.label);
            assert.strictEqual(labels.length, 19);
            assert.deepStrictEqual([...labels].sort(), [...styleShapeNames()].sort());
            assert.deepStrictEqual(labels.slice(0, drawnShapeNames().length).sort(), [...drawnShapeNames()].sort());
        });

        it('offers every shape name in an elementStyle line too', async () => {
            const items = await complete('    elementStyle Queue $shape="');
            assert.strictEqual(items.length, 19);
        });

        it('replaces the part already typed', async () => {
            const text = 'Container(db, "Orders", "Postgres", $shape="Cyl';
            const items = await complete(text);
            const cylinder = items.find(item => item.label === 'Cylinder');
            assert.ok(cylinder);
            assert.strictEqual(cylinder.range?.start.character, text.length - 3);
            assert.strictEqual(cylinder.range?.end.character, text.length);
        });

        it('says which shapes draw the theme rectangle', async () => {
            const items = await complete('Container(db, "Orders", "Postgres", $shape="');
            assert.match(String(items.find(item => item.label === 'Cylinder')?.detail), /database/);
            assert.match(String(items.find(item => item.label === 'Hexagon')?.detail), /theme rectangle/);
        });

        it('describes each drawn shape and has no help for one the renderer does not draw', () => {
            for (const name of drawnShapeNames()) {
                assert.ok(shapeHelp(name).length > 0, name);
            }
            assert.strictEqual(shapeHelp('Hexagon'), '');
        });

        it('offers no shape name inside another quoted string or after a closed value', async () => {
            assert.strictEqual(shapeValueContext('Container(db, "costs $shape=\\"'), undefined);
            assert.strictEqual(shapeValueContext('Container(db, "Orders", $shape="Cylinder"'), undefined);
            assert.deepStrictEqual(await complete('Container(db, "Orders", $shape="Cylinder", "'), []);
        });

        it('the parser builds an element for every offered shape name', () => {
            const names = shapeEntries().map(entry => entry.name);
            const lines = names.map((name, index) => `    Container(c${index}, "${name}", "Tech", $shape="${name}")`);
            const source = ['%%{ c4: container }%%', 'graph TB', ...lines].join('\n') + '\n';
            const view = new C4ModelBuilder().build(new C4XParser().parse(source), 'test').views[0];
            assert.strictEqual(view.elements.length, names.length);
        });
    });

    describe('attribute names after $', () => {
        it('offers $code, $shape, $sprite and $tags in element position', async () => {
            const items = await complete('Container(db, "Orders", "Postgres", $');
            assert.deepStrictEqual(items.map(item => item.label), ['$code', '$shape', '$sprite', '$tags']);
        });

        it('narrows to the names that start with what was typed', async () => {
            assert.deepStrictEqual((await complete('Container(db, "Orders", "Postgres", $sh')).map(i => i.label), ['$shape']);
            assert.deepStrictEqual((await complete('Container(db, "Orders", "Postgres", $s')).map(i => i.label), ['$shape', '$sprite']);
            assert.deepStrictEqual(await complete('Container(db, "Orders", "Postgres", $z'), []);
        });

        it('the $shape snippet inserts a quoted value with the drawn shapes as choices', async () => {
            const item = (await complete('Container(db, "Orders", "Postgres", $sh'))[0];
            const text = (item.insertText as { value: string }).value;
            assert.ok(text.startsWith('\\$shape="${1|'), text);
            for (const name of drawnShapeNames()) {
                assert.ok(text.includes(name), `${name} in ${text}`);
            }
            assert.deepStrictEqual(item.command, { title: 'Suggest values', command: 'editor.action.triggerSuggest' });
        });

        it('accepts a partial $shape name by prefix (the old $code-only rule rejected it)', () => {
            assert.deepStrictEqual(attributeNameContext('Component(a, "A", $sp'), { typed: '$sp' });
            assert.strictEqual(attributeNameContext('Component(a, "A", $zz'), undefined);
        });
    });

    describe('elementStyle keys', () => {
        it('offers the eight style keys after the tag and after a comma', async () => {
            const keys = styleKeyNames().map(key => '$' + key);
            assert.strictEqual(keys.length, 8);
            assert.deepStrictEqual((await complete('elementStyle Queue $')).map(i => i.label), keys);
            assert.deepStrictEqual((await complete('elementStyle "Software System" $stroke="#BF101D", $')).map(i => i.label), keys);
            assert.deepStrictEqual((await complete('    elementStyle Queue $shape="Cylinder", $border="dashed", $str')).map(i => i.label), ['$stroke', '$strokeWidth']);
        });

        it('does not offer style keys outside an elementStyle line', () => {
            assert.strictEqual(styleKeyContext('Container(a, "A", $'), undefined);
            assert.strictEqual(styleKeyContext('The elementStyle licence costs $'), undefined);
            assert.strictEqual(styleKeyContext('elementStyle Queue $stroke="#fff" $'), undefined, 'keys are comma separated');
        });

        it('offers dashed, dotted and solid after $border="', async () => {
            assert.deepStrictEqual((await complete('elementStyle Queue $border="')).map(i => i.label), ['solid', 'dashed', 'dotted']);
            assert.deepStrictEqual(borderValueContext('elementStyle Queue $border="da'), { typed: 'da' });
        });

        it('every style key has help and a quoted-value snippet', () => {
            const entries = styleKeyEntries();
            assert.strictEqual(entries.length, 8);
            for (const entry of entries) {
                assert.ok(entry.detail.length > 0, entry.name);
                assert.ok(entry.snippet.startsWith(entry.name + '="'), `${entry.name}: ${entry.snippet}`);
            }
        });
    });

    it('leaves Markdown prose alone and offers the notation inside a c4x fence', async () => {
        const provider = new C4XCompletionItemProvider();
        const lines = ['A paragraph about $', '```c4x', 'Container(a, "A", "T", $', '```'];
        const document = { languageId: 'markdown', lineAt: (at: number | { line: number }) => ({ text: lines[typeof at === 'number' ? at : at.line] }) } as never;
        const prose = await provider.provideCompletionItems(document, new vscodeMock.Position(0, lines[0].length) as never, {} as never, {} as never);
        assert.deepStrictEqual(prose, []);
        const fenced = await provider.provideCompletionItems(document, new vscodeMock.Position(2, lines[2].length) as never, {} as never, {} as never);
        assert.deepStrictEqual((fenced as vscodeMock.CompletionItem[]).map(i => i.label), ['$code', '$shape', '$sprite', '$tags']);
    });
});

describe('#332 snippets offer every shape', () => {
    const snippets = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../snippets/c4x.json'), 'utf8')) as {
        [name: string]: { prefix: string; body: string[]; description: string };
    };

    it('has one snippet per drawn shape, each with the shape name in its body', () => {
        for (const shape of drawnShapeNames()) {
            const hit = Object.values(snippets).find(snippet => snippet.body.join('\n').includes(`$shape="${shape}"`));
            assert.ok(hit, `no snippet draws $shape="${shape}"`);
        }
    });

    it('has an elementStyle snippet and a boundary snippet', () => {
        const all = Object.values(snippets).map(snippet => snippet.body.join('\n'));
        assert.ok(all.some(body => body.startsWith('elementStyle ')), 'elementStyle');
        assert.ok(all.some(body => body.includes('System_Boundary(')), 'System_Boundary');
        assert.ok(all.some(body => /-->\|[^|]*\| "[^"]*"/.test(body)), 'relationship with a technology');
    });

    it('every snippet, expanded as VS Code expands it, parses and lints with no error or warning', () => {
        for (const [name, snippet] of Object.entries(snippets)) {
            const text = expandSnippet(snippet.body.join('\n'));
            assert.ok(text.includes('$') === /\\\$/.test(snippet.body.join('\n')), `${name}: every literal $ is escaped, and only those survive: ${text}`);
            const stubs = ['from', 'to', 'From', 'To'].map(id => `    Container(${id}, "${id}", "Tech")`).join('\n');
            const source = /^%%\{ c4:/.test(text)
                ? text
                : `%%{ c4: container }%%\ngraph TB\n${stubs}\n${text.split('\n').map(line => '    ' + line).join('\n')}\n`;
            const findings = lintC4xSource(source, normalizeLintOptions(true, {}));
            const bad = findings.filter(finding => finding.severity === 'error' || finding.severity === 'warning');
            assert.deepStrictEqual(bad, [], `${name}:\n${text}`);
        }
    });

    it('the expander drops an unescaped $name as VS Code does (the failure this test guards against)', () => {
        assert.strictEqual(expandSnippet('C(a, $shape="Cylinder")'), 'C(a, ="Cylinder")');
        assert.strictEqual(expandSnippet('C(a, \\$shape="${1|Cylinder,Bucket|}")'), 'C(a, $shape="Cylinder")');
        assert.strictEqual(expandSnippet('${1:x} ${2:y${3:z}} $0 ${TM_FILENAME}'), 'x yz  ');
    });
});
