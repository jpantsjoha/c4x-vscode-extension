/**
 * Review findings on #322 (PR #345), one block per finding. Each case failed
 * before its fix.
 */
import * as assert from 'assert';
import { resolveElementStyle, computeAccentSlots, spriteIdMatches, type StyleableElement } from '../../render/elementStyle';
import { elementStyleClientInputs, isValidElementStyleInputs } from '../../webview/elementStyleClient';
import { BUNDLED_SPRITE_IDS } from '../../assets/spriteIds';
import { SPRITES, getSprite } from '../../assets/icons';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Model } from '../../model/C4Model';
import { STYLE_DIAGNOSTIC_CODES as CODES } from '../../model/styleDiagnostics';
import { lintC4xSource } from '../../cli/lintSource';
import { PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';

const parser = new C4XParser();
const build = (body: string): C4Model => c4ModelBuilder.build(parser.parse('%%{ c4: container }%%\ngraph TB\n' + body), 'review');
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('#322 review fixes', () => {
    describe('1. a valid model always yields a valid client payload', () => {
        it('accepts a long unknown $shape, many rules and many properties', () => {
            const longShape = 'A'.repeat(65);
            const rules = Array.from({ length: 1001 }, (_, i) => `elementStyle t${i} $stroke="#111111"`).join('\n');
            const manyKeys = Array.from({ length: 65 }, (_, i) => `$k${i}="v"`).join(', ');
            const model = build(`${rules}\nelementStyle many ${manyKeys}\nContainer(a, "A", $shape="${longShape}")\n`);
            assert.ok((model.diagnostics ?? []).some(d => d.code === CODES.unknownShape), 'still diagnosed');
            assert.ok(isValidElementStyleInputs(json(elementStyleClientInputs(model.views[0], ClassicTheme))));
        });

        it('accepts more than 10000 elements in the declaration order', () => {
            const inputs = json(elementStyleClientInputs({ elements: [] }, ClassicTheme));
            assert.ok(isValidElementStyleInputs({ ...inputs, order: Array.from({ length: 10001 }, (_, i) => `e${i}`) }));
        });
    });

    describe('2. authored External/Database tags keep their source position', () => {
        const rules = 'elementStyle External $stroke="#111111"\nelementStyle Custom $stroke="#222222"\n';

        it('an authored External after Custom wins; an injected External sits in the implied position', () => {
            const model = build(rules + 'System(a, "A", $tags="Custom,External")\nSystem_Ext(b, "B", $tags="Custom")\n');
            const view = model.views[0];
            const [a, b] = view.elements;
            assert.strictEqual(a.impliedTags, undefined, 'authored, not injected');
            assert.deepStrictEqual(b.impliedTags, ['External']);
            const context = { rules: view.elementStyles, accentSlots: computeAccentSlots(view.elements) };
            assert.strictEqual(resolveElementStyle(a, ClassicTheme, context).stroke, '#111111');
            assert.strictEqual(resolveElementStyle(b, ClassicTheme, context).stroke, '#222222');
        });

        it('records the macro-required tags even when the author wrote them (delta review)', () => {
            const model = build('System_Ext(x, "X", $tags="External")\nSystemDb(d, "D", $tags="Database")\nSystem(p, "P")\n');
            const [x, d, p] = model.views[0].elements;
            assert.deepStrictEqual([x.impliedTags, x.macroTags], [undefined, ['External']]);
            assert.deepStrictEqual([d.impliedTags, d.macroTags], [undefined, ['Database']]);
            assert.strictEqual(p.macroTags, undefined);
            const inputs = elementStyleClientInputs(model.views[0], ClassicTheme);
            assert.deepStrictEqual([inputs.macro.x, inputs.macro.d], [['External'], ['Database']]);
        });

        it('carries the injected tags to the client payload', () => {
            const model = build(rules + 'SystemDb_Ext(d, "D", $tags="Custom")\n');
            const inputs = elementStyleClientInputs(model.views[0], ClassicTheme);
            assert.deepStrictEqual(inputs.implied.d, ['External', 'Database']);
            assert.ok(isValidElementStyleInputs(json(inputs)));
        });
    });

    describe('3. sprite ids are validated the same way everywhere', () => {
        it('the compact id list matches the bundled icons', () => {
            assert.deepStrictEqual([...BUNDLED_SPRITE_IDS].sort(), Object.keys(SPRITES).sort(),
                'regenerate with: npx ts-node --transpile-only scripts/generate-sprite-ids.ts');
        });

        it('spriteIdMatches agrees with getSprite on exact, vendor-prefix, suffix and missing ids', () => {
            for (const id of ['react', 'REACT', 's3', 'person', 'nosuchicon', 'aws-s3', 'lambda', 'zzz-unknown']) {
                assert.strictEqual(spriteIdMatches(id, BUNDLED_SPRITE_IDS), getSprite(id) !== undefined, id);
            }
            assert.strictEqual(spriteIdMatches('constructor', BUNDLED_SPRITE_IDS), false);
        });

        it('headless lint (c4x-lint, lint_c4x) reports an unknown elementStyle sprite', () => {
            const source = '%%{ c4: container }%%\ngraph TB\nelementStyle A $sprite="nosuchicon"\n';
            assert.deepStrictEqual(lintC4xSource(source, {}).filter(f => f.ruleId === CODES.badValue).length, 1);
            assert.deepStrictEqual(lintC4xSource(source.replace('nosuchicon', 'react'), {}).filter(f => f.ruleId === CODES.badValue).length, 0);
        });

        it('the client resolves tag sprites with the same id list', () => {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes('const BUNDLED_SPRITE_IDS = '));
            assert.ok(/isKnownSprite: function\(id\) \{ return spriteIdMatches\(id, BUNDLED_SPRITE_IDS\); \}/.test(PREVIEW_CLIENT_SCRIPT));
        });
    });

    describe('4. an unknown element $shape draws the theme rectangle', () => {
        it('ContainerDb with $shape="Blob" is a rectangle, not the default cylinder; a tag-style Blob too', () => {
            const element: StyleableElement = { type: 'Container', tags: ['Database'], shape: 'Blob' };
            const style = resolveElementStyle(element, ClassicTheme);
            assert.deepStrictEqual([style.outline, style.unknownShape, style.shapeSource], ['rect', 'Blob', 'explicit']);
            const tagged = resolveElementStyle({ type: 'Container', tags: ['Database', 'q'] }, ClassicTheme,
                { rules: [{ tag: 'q', properties: [{ key: 'shape', value: 'Blob' }] }] });
            assert.deepStrictEqual([tagged.outline, tagged.unknownShape], ['rect', 'Blob']);
        });
    });

    describe('5. external deployment nodes take an accent slot', () => {
        it('in declaration order, and draw the accent', () => {
            const elements: StyleableElement[] = [
                { id: 'n', type: 'DeploymentNode', tags: ['External'] },
                { id: 's', type: 'SoftwareSystem', tags: ['External'] },
            ];
            const slots = computeAccentSlots(elements);
            assert.deepStrictEqual({ ...slots }, { n: 0, s: 1 });
            const style = resolveElementStyle(elements[0], C4ModelTheme, { accentSlots: slots });
            assert.strictEqual(style.stroke, C4ModelTheme.externalAccents[0].stroke);
        });
    });

    describe('6. Person is drawn since #323', () => {
        it('$shape="Person" on a container draws the person outline with no undrawn-shape information', () => {
            const style = resolveElementStyle({ type: 'Container', shape: 'Person' }, ClassicTheme);
            assert.deepStrictEqual([style.outline, style.iconLayout, style.undrawnShape], ['person', false, undefined]);
            const infos = (build('Container(a, "A", $shape="Person")\n').diagnostics ?? []).filter(d => d.code === CODES.undrawnShape);
            assert.deepStrictEqual(infos, []);
        });
    });
});
