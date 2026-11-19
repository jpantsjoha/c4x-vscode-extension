/**
 * resolveElementStyle (#322, notation decision #320, Decisions 1, 2 and 4): layer order,
 * tag order, case-insensitive matching, external accents, and the shape rule
 * that keeps every existing golden byte-identical.
 */
import * as assert from 'assert';
import {
    computeAccentSlots,
    orderedStyleTags,
    parseStyleValue,
    resolveElementStyle,
    shapeDrawingIssue,
    styleShapeNames,
    type ElementStyleContext,
    type StyleableElement,
} from '../../render/elementStyle';
import type { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { computeLegendSwatchColors } from '../../webview/legendCatalog';

const THEMES: ReadonlyArray<C4Theme> = [ClassicTheme, C4StandardTheme, ModernTheme, MutedTheme, HighContrastTheme, C4ModelTheme];
const TYPES = ['Person', 'SoftwareSystem', 'Container', 'Component', 'DeploymentNode'];

/** The colour rule ElementRenderer used before #322, restated independently. */
function legacyColors(element: StyleableElement, theme: C4Theme): { fill: string; stroke: string; text: string } {
    const ext = (element.tags ?? []).some(tag => tag.toLowerCase() === 'external');
    const c = theme.colors;
    const pick = (internal: typeof c.person, external: typeof c.person | undefined) => ext ? (external ?? c.externalSystem) : internal;
    switch (element.type) {
        case 'Person': return pick(c.person, c.externalPerson);
        case 'Container': return pick(c.container, c.externalContainer);
        case 'Component': return pick(c.component, c.externalComponent);
        case 'DeploymentNode': return { fill: (ext ? c.externalSystem : c.softwareSystem).fill, stroke: c.deploymentNode.stroke, text: c.deploymentNode.text };
        default: return ext ? c.externalSystem : c.softwareSystem;
    }
}

function rules(...lines: Array<[string, Array<[string, string]>]>): ElementStyleContext['rules'] {
    return lines.map(([tag, pairs]) => ({ tag, properties: pairs.map(([key, value]) => ({ key, value })) }));
}

const parser = new C4XParser();
function renderSvg(source: string, theme: C4Theme): string {
    const model = c4ModelBuilder.build(parser.parse(source), 'resolver-test');
    const view = model.views[0];
    return new SvgBuilder().build(new DagreLayoutEngine().layoutSync(view), { theme, view });
}
function nodeMarkup(svg: string, id: string): string {
    const start = svg.indexOf(`data-id="${id}"`);
    assert.ok(start >= 0, `node ${id} rendered`);
    return svg.slice(start, svg.indexOf('</g>', start));
}

describe('resolveElementStyle (#322)', () => {
    describe('theme layer: no styles reproduce today exactly', () => {
        for (const theme of THEMES) {
            it(`${theme.name}: every type, internal and external, resolves to the pre-#322 colours and drawing`, () => {
                for (const type of TYPES) {
                    for (const tags of [undefined, ['External'], ['Database'], ['external', 'database']]) {
                        const element = { id: 'x', type, tags };
                        // No accent slot: the theme triple alone.
                        const style = resolveElementStyle(element, theme);
                        const legacy = legacyColors(element, theme);
                        assert.deepStrictEqual([style.fill, style.stroke, style.color], [legacy.fill, legacy.stroke, legacy.text], `${type} ${tags}`);
                        assert.strictEqual(style.border, 'solid');
                        assert.strictEqual(style.strokeWidth, undefined);
                        const isDb = (tags ?? []).some(t => t.toLowerCase() === 'database');
                        if (type === 'Person' && theme.name === 'c4-model' && !isDb) {
                            // c4-model's default `Person -> Person` draws the person outline (#323).
                            // A Person also tagged Database takes the later tag's Cylinder, which
                            // (as a theme default) keeps today's icon node.
                            assert.deepStrictEqual([style.iconLayout, style.icon, style.outline], [false, 'person', 'person'], 'c4-model person outline');
                        } else if (type === 'Person') {
                            assert.deepStrictEqual([style.iconLayout, style.icon, style.outline], [true, 'person', 'rect'], 'person icon node wins over the cylinder');
                        } else {
                            assert.deepStrictEqual([style.iconLayout, style.outline], [false, isDb ? 'cylinder' : 'rect'], `${type} ${tags}`);
                        }
                    }
                }
            });
        }

        it('a sprite keeps the icon node over the theme default Database cylinder', () => {
            const style = resolveElementStyle({ type: 'Container', tags: ['Database'], sprite: 'postgresql' }, ClassicTheme);
            assert.deepStrictEqual([style.iconLayout, style.icon, style.outline, style.shapeSource], [true, 'postgresql', 'rect', 'theme']);
        });

        it('a theme with explicit defaultTagStyles replaces the built-in Database rule', () => {
            const theme = { ...ClassicTheme, defaultTagStyles: [] };
            assert.strictEqual(resolveElementStyle({ type: 'Container', tags: ['Database'] }, theme).outline, 'rect');
        });
    });

    describe('tag styles', () => {
        it('DoD: two external systems with different tags resolve and render in different colours', () => {
            const context = { rules: rules(['Mainframe', [['stroke', '#BF101D']]], ['Email', [['stroke', '#ED8609']]]) };
            const a = resolveElementStyle({ type: 'SoftwareSystem', tags: ['Mainframe', 'External'] }, ClassicTheme, context);
            const b = resolveElementStyle({ type: 'SoftwareSystem', tags: ['Email', 'External'] }, ClassicTheme, context);
            assert.notStrictEqual(a.stroke, b.stroke);

            const svg = renderSvg('graph TB\nelementStyle Mainframe $stroke="#BF101D"\nelementStyle Email $stroke="#ED8609"\n'
                + 'System_Ext(m, "Mainframe", $tags="Mainframe")\nSystem_Ext(e, "E-mail", $tags="Email")\n', ClassicTheme);
            assert.match(nodeMarkup(svg, 'm'), /stroke="#BF101D"/);
            assert.match(nodeMarkup(svg, 'e'), /stroke="#ED8609"/);
        });

        it('applies implied tags first, then explicit tags in order; later wins per field', () => {
            // Database injected by a Db macro: implied position, ahead of the authored tags.
            const element = { type: 'Container', tags: ['b', 'a', 'Database'], impliedTags: ['Database'] };
            assert.deepStrictEqual(orderedStyleTags(element), ['Element', 'Container', 'Database', 'b', 'a']);
            const style = resolveElementStyle(element, ClassicTheme, {
                rules: rules(
                    ['a', [['stroke', '#00000A']]],
                    ['b', [['stroke', '#00000B'], ['color', '#00000B']]],
                    ['Container', [['stroke', '#0000CC'], ['background', '#0000CC']]],
                    ['Element', [['background', '#EEEEEE'], ['border', 'dotted']]],
                ),
            });
            // Element < Container < Database < b < a, field by field.
            assert.strictEqual(style.stroke, '#00000A');
            assert.strictEqual(style.color, '#00000B');
            assert.strictEqual(style.fill, '#0000CC');
            assert.strictEqual(style.border, 'dotted');
            // Database contributed first, through the theme default (Database -> Cylinder).
            assert.deepStrictEqual(style.contributingTags, ['Database', 'Element', 'Container', 'b', 'a']);
        });

        it('matches tags case-insensitively and merges same-tag rules, later key wins', () => {
            const style = resolveElementStyle({ type: 'Container', tags: ['Database'] }, ClassicTheme, {
                rules: rules(['database', [['stroke', '#111111'], ['color', '#111111']]], ['DATABASE', [['stroke', '#222222']]]),
            });
            assert.deepStrictEqual([style.stroke, style.color], ['#222222', '#111111']);
            assert.deepStrictEqual(style.contributingTags, ['Database'], 'spelled as the element spells it');
        });

        it('applies class-assigned tags after the element\'s own $tags', () => {
            const model = c4ModelBuilder.build(parser.parse('graph TB\nContainer(a, "A", $tags="own")\nclass a assigned\n'), 't');
            const element = model.views[0].elements[0];
            const style = resolveElementStyle(element, ClassicTheme, {
                rules: rules(['assigned', [['stroke', '#0000AA']]], ['own', [['stroke', '#0000BB']]]),
            });
            assert.strictEqual(style.stroke, '#0000AA');
        });

        it('ignores an invalid value: the field falls back to the earlier layer', () => {
            const style = resolveElementStyle({ type: 'Container', tags: ['t'] }, ClassicTheme, {
                rules: rules(['Container', [['stroke', '#123456'], ['strokeWidth', '4']]], ['t', [['stroke', 'blue'], ['strokeWidth', '11'], ['nope', 'x']]]),
            });
            assert.deepStrictEqual([style.stroke, style.strokeWidth], ['#123456', 4]);
        });

        it('checks tag-style sprites with the host icon list when given', () => {
            const context = { rules: rules(['t', [['sprite', 'missing']]]) };
            assert.strictEqual(resolveElementStyle({ type: 'Container', tags: ['t'] }, ClassicTheme, context).icon, 'missing');
            assert.strictEqual(resolveElementStyle({ type: 'Container', tags: ['t'] }, ClassicTheme, context, { isKnownSprite: () => false }).icon, undefined);
        });

        it('is safe for prototype-named tags and ids', () => {
            const element = { id: 'constructor', type: 'SoftwareSystem', tags: ['__proto__', 'constructor', 'External'] };
            const style = resolveElementStyle(element, C4ModelTheme, {
                rules: rules(['__proto__', [['stroke', '#ABCDEF']]]),
                accentSlots: computeAccentSlots([]),
            });
            assert.strictEqual(style.stroke, '#ABCDEF');
        });
    });

    describe('external accents', () => {
        const external = (id: string, tags: string[] = []): StyleableElement => ({ id, type: 'SoftwareSystem', tags: [...tags, 'External'] });

        it('assigns accents in declaration order, depth first, cycling; deployment nodes included', () => {
            const slots = computeAccentSlots([
                { id: 'in', type: 'SoftwareSystem' },
                { id: 'e1', type: 'SoftwareSystem', tags: ['External'] },
                { id: 'node', type: 'DeploymentNode', tags: ['External'], children: [{ id: 'e2', type: 'Container', tags: ['external'] }] },
                { id: 'e3', type: 'Person', tags: ['External'] },
            ] as never);
            assert.deepStrictEqual({ ...slots }, { e1: 0, node: 1, e2: 2, e3: 3 });
            const accents = C4ModelTheme.externalAccents;
            const fifth = resolveElementStyle(external('x'), C4ModelTheme, { accentSlots: { x: accents.length } });
            assert.strictEqual(fifth.stroke, accents[0].stroke, 'cycles');
        });

        it('gives up to four externals four different colours in c4-model; themes without accents keep externalSystem', () => {
            const elements = ['a', 'b', 'c', 'd'].map(id => external(id));
            const context = { accentSlots: computeAccentSlots(elements) };
            const strokes = elements.map(e => resolveElementStyle(e, C4ModelTheme, context).stroke);
            assert.strictEqual(new Set(strokes).size, 4);
            assert.deepStrictEqual(elements.map(e => resolveElementStyle(e, ClassicTheme, context).stroke),
                elements.map(() => ClassicTheme.colors.externalSystem.stroke));
        });

        it('fills stroke and text at the theme layer, each overridable on its own; a styled external keeps its slot', () => {
            const accents = C4ModelTheme.externalAccents;
            const elements = [external('a', ['onlyColor']), external('b', ['onlyStroke']), external('c', ['both']), external('d')];
            const context = {
                accentSlots: computeAccentSlots(elements),
                rules: rules(['onlyColor', [['color', '#000001']]], ['onlyStroke', [['stroke', '#000002']]], ['both', [['stroke', '#000003'], ['color', '#000003']]]),
            };
            const [a, b, c, d] = elements.map(e => resolveElementStyle(e, C4ModelTheme, context));
            assert.deepStrictEqual([a.stroke, a.color], [accents[0].stroke, '#000001']);
            assert.deepStrictEqual([b.stroke, b.color], ['#000002', accents[1].text ?? accents[1].stroke]);
            assert.deepStrictEqual([c.stroke, c.color], ['#000003', '#000003']);
            assert.strictEqual(d.stroke, accents[3].stroke, 'the fourth external still takes the fourth accent');
        });
    });

    describe('shape and icon', () => {
        it('an explicit shape replaces the icon-node layout; a theme default shape never does', () => {
            const person = { type: 'Person' };
            assert.strictEqual(resolveElementStyle(person, ClassicTheme, { rules: rules(['Person', [['shape', 'Box']]]) }).outline, 'box');
            const box = resolveElementStyle({ ...person, shape: 'Box' }, ClassicTheme);
            assert.deepStrictEqual([box.outline, box.iconLayout, box.icon], ['box', true, 'person'], 'icon placed inside the drawn shape');
            const cylinder = resolveElementStyle({ type: 'Container', sprite: 'react', shape: 'Cylinder' }, ClassicTheme);
            assert.deepStrictEqual([cylinder.outline, cylinder.iconLayout, cylinder.shapeSource], ['cylinder', true, 'explicit']);
        });

        it('the element $shape overrides a tag style shape', () => {
            const style = resolveElementStyle({ type: 'Container', tags: ['Queue'], shape: 'RoundedBox' }, ClassicTheme, { rules: rules(['Queue', [['shape', 'Box']]]) });
            assert.deepStrictEqual([style.shape, style.outline], ['RoundedBox', 'roundedBox']);
        });

        it('a valid shape not drawn yet and an unknown one both render as the theme rectangle', () => {
            const hexagon = resolveElementStyle({ type: 'Container', tags: ['Database'], shape: 'Hexagon' }, ClassicTheme);
            assert.deepStrictEqual([hexagon.outline, hexagon.undrawnShape, hexagon.iconLayout], ['rect', 'Hexagon', false]);
            const blob = resolveElementStyle({ type: 'Container', tags: ['Database'], shape: 'Blob' }, ClassicTheme);
            assert.deepStrictEqual([blob.outline, blob.shape, blob.unknownShape, blob.shapeSource], ['rect', undefined, 'Blob', 'explicit']);
        });

        it('vocabulary: 19 case-sensitive names, each assigned to #323 or #334', () => {
            assert.strictEqual(new Set(styleShapeNames()).size, 19);
            assert.strictEqual(parseStyleValue('shape', 'box'), undefined);
            assert.strictEqual(styleShapeNames().filter(name => shapeDrawingIssue(name) === '#323').length, 8);
            assert.strictEqual(styleShapeNames().filter(name => shapeDrawingIssue(name) === '#334').length, 11);
        });
    });

    describe('renderer and legend consume the resolved style', () => {
        it('draws border, stroke width, fill and text colour from styles', () => {
            const svg = renderSvg('graph TB\nelementStyle t $border="dashed", $strokeWidth="4", $background="#FAFAFA", $color="#101010"\n'
                + 'Container(a, "A", $tags="t")\nContainer(b, "B", $shape="Box")\n', ClassicTheme);
            const a = nodeMarkup(svg, 'a');
            assert.match(a, /fill="#FAFAFA"[^>]*stroke-width="4" stroke-dasharray="8,4"/);
            assert.match(a, /<text data-field="label"[^>]*fill="#101010"/);
            assert.match(nodeMarkup(svg, 'b'), /rx="0" ry="0"/);
        });

        it('legend swatch colours are resolved fills: theme fills by default, implied-tag rules when present', () => {
            const plain = computeLegendSwatchColors({}, ClassicTheme);
            assert.deepStrictEqual(plain, {
                person: ClassicTheme.colors.person.fill,
                softwareSystem: ClassicTheme.colors.softwareSystem.fill,
                container: ClassicTheme.colors.container.fill,
                component: ClassicTheme.colors.component.fill,
                deploymentNode: ClassicTheme.colors.deploymentNode.fill,
                external: ClassicTheme.colors.externalSystem.fill,
            });
            const styled = computeLegendSwatchColors({ elementStyles: rules(['container', [['background', '#ABCDEF']]]) as never }, ClassicTheme);
            assert.strictEqual(styled.container, '#ABCDEF');
        });
    });
});
