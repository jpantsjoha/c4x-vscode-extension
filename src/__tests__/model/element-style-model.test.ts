/**
 * Element style source surface (#322, notation decision #320, Decision 3): the `elementStyle`
 * statement, the `$shape` element attribute, and the model builder's
 * diagnostics for them.
 */
import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder, c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Model, C4ModelDiagnostic } from '../../model/C4Model';
import { STYLE_DIAGNOSTIC_CODES as CODES, editDistance, suggest } from '../../model/styleDiagnostics';
import { lintC4xSource } from '../../cli/lintSource';
import { C4XParseError } from '../../parser/types';

const parser = new C4XParser();
const HEADER = '%%{ c4: container }%%\ngraph TB\n';

function build(body: string, builder: C4ModelBuilder = c4ModelBuilder): C4Model {
    return builder.build(parser.parse(HEADER + body), 'element-style-test');
}

function codes(model: C4Model): string[] {
    return (model.diagnostics ?? []).map(d => `${d.code}/${d.severity}`);
}

function only(model: C4Model, code: string): C4ModelDiagnostic[] {
    return (model.diagnostics ?? []).filter(d => d.code === code);
}

describe('elementStyle statement and $shape attribute (#322)', () => {
    describe('grammar', () => {
        it('parses elementStyle with an ordered pair list and source ranges', () => {
            const parsed = parser.parse(HEADER + 'elementStyle Mainframe $stroke="#BF101D", $strokeWidth="2", $legend="Mainframe"\n');
            assert.strictEqual(parsed.elementStyles?.length, 1);
            const style = parsed.elementStyles![0];
            assert.strictEqual(style.tag, 'Mainframe');
            assert.deepStrictEqual(style.properties.map(p => [p.key, p.value]), [
                ['stroke', '#BF101D'], ['strokeWidth', '2'], ['legend', 'Mainframe'],
            ]);
            // Ranges are in original-file coordinates (line 3 after the two header lines).
            assert.strictEqual(style.sourceRange?.start.line, 3);
            assert.strictEqual(style.properties[1].sourceRange?.start.line, 3);
            assert.strictEqual(style.properties[1].sourceRange?.start.column, 43);
            assert.strictEqual(style.loc, undefined);
        });

        it('accepts a quoted tag with spaces and a bare identifier value', () => {
            const parsed = parser.parse(HEADER + 'elementStyle "Software System" $shape=RoundedBox\n');
            assert.strictEqual(parsed.elementStyles![0].tag, 'Software System');
            assert.deepStrictEqual(parsed.elementStyles![0].properties.map(p => p.value), ['RoundedBox']);
        });

        it('keeps a repeated key in the statement: both pairs, in order', () => {
            const parsed = parser.parse(HEADER + 'elementStyle A $stroke="#111", $stroke="#222"\n');
            assert.deepStrictEqual(parsed.elementStyles![0].properties.map(p => p.value), ['#111', '#222']);
        });

        it('makes $shape a known key on call-form, bracket and Node elements, out of metadata', () => {
            const parsed = parser.parse(HEADER
                + 'Container(a, "A", "T", "D", $shape="Folder", $owner="ops")\n'
                + 'b[B<br/>Container] $shape="Box"\n'
                + 'Node(n, "N", $shape="Cylinder") {\n}\n');
            const [a, b, n] = parsed.elements;
            assert.strictEqual(a.shape, 'Folder');
            assert.deepStrictEqual(a.metadata, { owner: 'ops' });
            assert.strictEqual(b.shape, 'Box');
            assert.strictEqual(b.metadata, undefined);
            assert.strictEqual(n.shape, 'Cylinder');
            assert.deepStrictEqual(n.metadata, {});
            assert.ok(a.shapeRange && a.shapeRange.start.column === 29, JSON.stringify(a.shapeRange));
        });

        it('regression: $duplicateKeys stays metadata and a repeated $shape is still seen (Symbol, not a string key)', () => {
            const source = 'Container(a, "A", $duplicateKeys="keep", $shape="Folder", $shape="Box")\n';
            const raw = parser.parse(HEADER + source).elements[0];
            assert.deepStrictEqual(raw.metadata, { duplicateKeys: 'keep' });
            assert.strictEqual(raw.shape, 'Box');
            assert.deepStrictEqual(raw.duplicateKeys?.map(d => d.key), ['shape']);

            const model = build(source);
            const element = model.views[0].elements[0];
            assert.deepStrictEqual(element.metadata, { duplicateKeys: 'keep' });
            assert.strictEqual(element.shape, 'Box');
            const repeats = only(model, CODES.duplicateKey);
            assert.strictEqual(repeats.length, 1);
            assert.strictEqual(repeats[0].severity, 'error');
            assert.strictEqual(repeats[0].range?.start.column, 59, 'reported on the repeated $shape pair');
        });

        it('keeps the last value of any other repeated attribute, with no diagnostic', () => {
            const model = build('Container(a, "A", $x="1", $x="2")\n');
            assert.deepStrictEqual(model.views[0].elements[0].metadata, { x: '2' });
            assert.deepStrictEqual(codes(model), []);
        });

        it('still parses an element whose id is elementStyle', () => {
            const parsed = parser.parse(HEADER + 'elementStyle[Label<br/>Container]\nb[B<br/>Container]\nelementStyle --> b\n');
            assert.deepStrictEqual(parsed.elements.map(e => e.id), ['elementStyle', 'b']);
            assert.deepStrictEqual(parsed.relationships.map(r => `${r.from}->${r.to}`), ['elementStyle->b']);
            assert.strictEqual(parsed.elementStyles, undefined);
        });

        it('is top level only: inside a boundary it is a parse error', () => {
            assert.throws(
                () => parser.parse(HEADER + 'System_Boundary(s, "S") {\n  elementStyle A $stroke="#111"\n}\n'),
                C4XParseError,
            );
        });

        it('suggests the quoted form for an unquoted number or colour', () => {
            assert.throws(() => parser.parse(HEADER + 'elementStyle A $strokeWidth=2\n'),
                (error: Error) => /Unquoted value for \$strokeWidth: write \$strokeWidth="2"/.test(error.message));
            assert.throws(() => parser.parse(HEADER + 'Container(a, "A", $stroke=#BF101D)\n'),
                (error: Error) => /write \$stroke="#BF101D"/.test(error.message));
        });

        it('leaves every existing fixture and sample parsing exactly as before: no style fields appear', () => {
            const roots = ['src/__tests__/snapshots/fixtures', 'src/__tests__/snapshots/fixtures/ibs', 'samples']
                .map(dir => path.resolve(__dirname, '../../..', dir))
                .filter(dir => fs.existsSync(dir));
            let checked = 0;
            for (const dir of roots) {
                // element-styles.c4x (#322) and shapes.c4x (#323) exercise $shape on purpose.
                for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.c4x') && f !== 'element-styles.c4x' && f !== 'shapes.c4x')) {
                    let parsed;
                    try {
                        parsed = parser.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
                    } catch {
                        continue; // a sample that does not parse is out of scope here
                    }
                    checked++;
                    assert.strictEqual(parsed.elementStyles, undefined, file);
                    const walk = (elements: typeof parsed.elements): void => {
                        for (const element of elements) {
                            assert.ok(!('shape' in element) && !('duplicateKeys' in element) && !('shapeRange' in element), `${file}: ${element.id}`);
                            if (element.children) { walk(element.children); }
                        }
                    };
                    walk(parsed.elements);
                }
            }
            assert.ok(checked >= 10, `checked ${checked} files`);
        });
    });

    describe('model', () => {
        it('carries elementStyles on the view and shape on the element, only when present', () => {
            const plain = build('Container(a, "A")\n');
            assert.strictEqual(plain.views[0].elementStyles, undefined);
            assert.ok(!('shape' in plain.views[0].elements[0]));
            assert.strictEqual(plain.diagnostics, undefined);

            const styled = build('elementStyle Queue $shape="Box"\nContainer(a, "A", $tags="Queue", $shape="Cylinder")\n');
            assert.deepStrictEqual(styled.views[0].elementStyles?.map(r => [r.tag, r.properties.map(p => `${p.key}=${p.value}`)]),
                [['Queue', ['shape=Box']]]);
            assert.strictEqual(styled.views[0].elements[0].shape, 'Cylinder');
            assert.strictEqual(styled.diagnostics, undefined);
        });

        it('reads a bracket element $shape tag line the way $code is read', () => {
            const model = build('a[A<br/>Container<br/>$shape=Folder]\n');
            const element = model.views[0].elements[0];
            assert.strictEqual(element.shape, 'Folder');
            assert.strictEqual(element.metadata, undefined);
            // Folder is drawn since #323: no diagnostic.
            assert.deepStrictEqual(codes(model), []);
        });

        it('reports a tag-line $shape repeated by the attribute and uses the attribute (later in source)', () => {
            const model = build('a[A<br/>Container<br/>$shape=Folder] $shape="Box"\n');
            assert.strictEqual(model.views[0].elements[0].shape, 'Box');
            assert.deepStrictEqual(codes(model), [`${CODES.duplicateKey}/error`]);
        });
    });

    describe('diagnostics', () => {
        it('reports an unknown key as an error on that key; valid keys still apply', () => {
            const model = build('elementStyle Mainframe $stroke="#BF101D", $fil="#fff"\nSystem(m, "M", $tags="Mainframe")\n');
            const [unknown] = only(model, CODES.unknownKey);
            assert.strictEqual(unknown.severity, 'error');
            assert.match(unknown.message, /Unknown style key \$fil/);
            assert.strictEqual(unknown.range?.start.column, 43);
            assert.deepStrictEqual(model.views[0].elementStyles![0].properties.map(p => p.key), ['stroke', 'fil'],
                'kept as written, so Save can prove it preserved them');
        });

        it('reports $colour with the $color spelling', () => {
            const [colour] = only(build('elementStyle A $colour="#fff"\n'), CODES.colourSpelling);
            assert.strictEqual(colour.severity, 'error');
            assert.match(colour.message, /write \$color/);
        });

        it('reports a key repeated in one statement on the second occurrence', () => {
            const [repeat] = only(build('elementStyle A $stroke="#111", $stroke="#222"\n'), CODES.duplicateKey);
            assert.strictEqual(repeat.severity, 'error');
            assert.strictEqual(repeat.range?.start.column, 32);
        });

        it('reports bad values as warnings, one per key', () => {
            const model = build('elementStyle A $border="wavy", $strokeWidth="12", $strokeWidth="two", $stroke="blue", $legend=""\n');
            assert.deepStrictEqual(only(model, CODES.badValue).map(d => d.severity), ['warning', 'warning', 'warning', 'warning', 'warning']);
        });

        it('checks a tag-style sprite against the bundled id list by default, or a supplied predicate', () => {
            const source = 'elementStyle A $sprite="nosuchicon"\n';
            assert.strictEqual(only(build(source), CODES.badValue).length, 1);
            assert.strictEqual(only(build('elementStyle A $sprite="react"\n'), CODES.badValue).length, 0);
            const withIcons = new C4ModelBuilder({ isKnownSprite: id => id === 'react' });
            assert.strictEqual(only(build(source, withIcons), CODES.badValue).length, 1);
            assert.strictEqual(only(build('elementStyle A $sprite="react"\n', withIcons), CODES.badValue).length, 0);
        });

        it('reports an unknown shape as a warning with a suggestion, and an undrawn shape as information naming its issue', () => {
            const unknown = only(build('Container(a, "A", $shape="Blob")\n'), CODES.unknownShape)[0];
            assert.strictEqual(unknown.severity, 'warning');
            assert.match(unknown.message, /Unknown shape "Blob"/);
            assert.match(only(build('Container(a, "A", $shape="cylinder")\n'), CODES.unknownShape)[0].message, /Did you mean "Cylinder"\?/);

            const hexagon = only(build('Container(a, "A", $shape="Hexagon")\n'), CODES.undrawnShape)[0];
            assert.strictEqual(hexagon.severity, 'info');
            assert.match(hexagon.message, /#334/);
            assert.match(only(build('elementStyle A $shape="Robot"\n'), CODES.undrawnShape)[0].message, /#334/);
            // The eight shapes #323 draws raise no diagnostic.
            for (const drawn of ['Box', 'RoundedBox', 'Cylinder', 'Person', 'Bucket', 'Folder', 'WebBrowser', 'Terminal']) {
                assert.deepStrictEqual(codes(build(`Container(a, "A", $shape="${drawn}")\n`)), [], drawn);
            }
        });

        it('parses and lints clean every one of the 19 shape names (only the undrawn-shape information)', () => {
            const names = ['Box', 'RoundedBox', 'Circle', 'Ellipse', 'Hexagon', 'Diamond', 'Cylinder', 'Bucket', 'Pipe', 'Person',
                'Robot', 'Folder', 'WebBrowser', 'Window', 'Terminal', 'Shell', 'MobileDevicePortrait', 'MobileDeviceLandscape', 'Component'];
            for (const name of names) {
                const model = build(`elementStyle T${name} $shape="${name}"\n`);
                assert.ok(codes(model).every(code => code === `${CODES.undrawnShape}/info`), `${name}: ${codes(model)}`);
            }
        });

        it('reports a second statement for the same tag in any case', () => {
            const [duplicate] = only(build('elementStyle Database $stroke="#111"\nelementStyle database $color="#222"\n'), CODES.duplicateTag);
            assert.strictEqual(duplicate.severity, 'warning');
            assert.strictEqual(duplicate.range?.start.line, 4);
        });

        it('reports an element metadata key that looks like a style key, and nothing for layout keys', () => {
            const model = build('Container(a, "A", $shap="Box", $x="10", $y="20", $locked="true")\n');
            const typos = only(model, CODES.likelyStyleTypo);
            assert.strictEqual(typos.length, 1);
            assert.match(typos[0].message, /\$shap .*\$shape/);
        });

        it('points a classDef at elementStyle', () => {
            const [classDef] = only(build('classDef legacy fill:#999\n'), CODES.classDefNoEffect);
            assert.strictEqual(classDef.severity, 'info');
            assert.strictEqual(classDef.range?.start.line, 3);
            assert.match(classDef.message, /elementStyle legacy/);
        });

        it('never stops the model building: every diagnosed element still exists', () => {
            const model = build('elementStyle A $nope="1", $border="wavy"\nContainer(a, "A", $tags="A", $shape="Blob", $shape="Folder")\n');
            assert.strictEqual(model.views[0].elements.length, 1);
            assert.ok((model.diagnostics ?? []).length >= 3);
        });

        it('suggestion helpers: edit distance and nearest candidate', () => {
            assert.strictEqual(editDistance('shap', 'shape'), 1);
            assert.strictEqual(editDistance('', 'abc'), 3);
            assert.strictEqual(suggest('strok', ['stroke', 'color']), 'stroke');
            assert.strictEqual(suggest('zzzzzz', ['stroke']), undefined);
        });
    });

    describe('headless lint surfaces the diagnostics', () => {
        it('reports them from c4x-lint/lint_c4x with their ids and source positions, even with lint disabled', () => {
            const source = HEADER + 'elementStyle A $nope="1"\n';
            const findings = lintC4xSource(source, {}).filter(f => f.ruleId === CODES.unknownKey);
            assert.strictEqual(findings.length, 1);
            assert.strictEqual(findings[0].severity, 'error');
            assert.strictEqual(findings[0].line, 3);
            assert.strictEqual(findings[0].column, 16);
            assert.deepStrictEqual(lintC4xSource(source, { enabled: false }).map(f => f.ruleId), [CODES.unknownKey]);
        });

        it('offsets them by the fence position in Markdown', () => {
            const findings = lintC4xSource(HEADER + 'elementStyle A $nope="1"\n', {}, 10).filter(f => f.ruleId === CODES.unknownKey);
            assert.strictEqual(findings[0].line, 13);
        });
    });
});
