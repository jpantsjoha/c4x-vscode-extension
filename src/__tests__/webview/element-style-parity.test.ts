/**
 * Host/client parity for element styles (#322, notation decision #320, Decision 8).
 *
 * The webview embeds the host's resolver verbatim. This suite proves:
 *   1. the assembled client script carries every resolver function, unchanged;
 *   2. the embedded copy, run in its own realm, resolves exactly what the host
 *      resolves;
 *   3. a staged tag edit repainted by the client (paintNodeWithStyle over the
 *      SVG rendered with the old tags) carries the same paint attributes as the
 *      host's render with the new tags, accent order included.
 */
import * as assert from 'assert';
import * as vm from 'vm';
import { PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';
import { ELEMENT_STYLE_CLIENT_FUNCTIONS, resolveElementStyle } from '../../render/elementStyle';
import {
    draftStyleElements,
    elementStyleClientInputs,
    isValidElementStyleInputs,
    paintNodeWithStyle,
    type PaintableElement,
    type PaintableNode,
} from '../../webview/elementStyleClient';
import { C4XParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import type { C4Element, C4View } from '../../model/C4Model';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import type { C4Theme } from '../../themes/Theme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { BUNDLED_SPRITE_IDS } from '../../assets/spriteIds';

const embedded = (fn: (...args: never[]) => unknown): string => fn.toString().replace(/\bexports\./g, '');

/** The client's copy of the resolver, in a separate realm, exactly as the webview assembles it. */
function clientRealm(): Record<string, (...args: unknown[]) => unknown> {
    const names = [...ELEMENT_STYLE_CLIENT_FUNCTIONS, paintNodeWithStyle, draftStyleElements].map(fn => fn.name);
    const source = [...ELEMENT_STYLE_CLIENT_FUNCTIONS, paintNodeWithStyle, draftStyleElements].map(embedded).join('\n')
        + `\n;({ ${names.join(', ')} })`;
    return vm.runInNewContext(source) as Record<string, (...args: unknown[]) => unknown>;
}

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

// ── A minimal DOM over a rendered node, enough for paintNodeWithStyle ─────────

class FakeElement implements PaintableElement {
    constructor(public readonly tag: string, public readonly attrs: Map<string, string>) {}
    getAttribute(name: string): string | null { return this.attrs.has(name) ? this.attrs.get(name)! : null; }
    setAttribute(name: string, value: string): void { this.attrs.set(name, value); }
    removeAttribute(name: string): void { this.attrs.delete(name); }
}

function parseTag(tag: string): FakeElement {
    const name = /^<(\w+)/.exec(tag)![1];
    const attrs = new Map<string, string>();
    for (const match of tag.matchAll(/([\w-]+)="([^"]*)"/g)) { attrs.set(match[1], match[2]); }
    return new FakeElement(name, attrs);
}

interface FakeNode extends PaintableNode {
    outlines: FakeElement[];
    texts: FakeElement[];
    icons: FakeElement[];
    details: FakeElement[];
}

/** Split one rendered node `<g>` into its outline, text and icon elements. */
function fakeNode(svg: string, id: string): FakeNode {
    const start = svg.indexOf(`data-id="${id}"`);
    assert.ok(start >= 0, `node ${id} rendered`);
    const nextNode = svg.indexOf('<g class="node', start);
    let markup = svg.slice(start, nextNode < 0 ? svg.indexOf('</g>\n    </g>', start) : nextNode);
    const icons: FakeElement[] = [];
    markup = markup.replace(/<g class="element-icon">\s*(<g [^>]*>)[\s\S]*?<\/g>\s*<\/g>/, (_m, opener: string) => {
        icons.push(parseTag(opener));
        return '';
    });
    // Shape detail (#323): a web browser's bar and dots, a terminal's glyph.
    const details: FakeElement[] = [];
    markup = markup.replace(/<g class="shape-detail">([\s\S]*?)<\/g>/, (_m, inner: string) => {
        details.push(...[...inner.matchAll(/<(?:rect|path|circle) [^>]*>/g)].map(m => parseTag(m[0])));
        return '';
    });
    const outlines = [...markup.matchAll(/<(?:rect|path|circle) [^>]*>/g)].map(m => parseTag(m[0]));
    const texts = [...markup.matchAll(/<text [^>]*>/g)].map(m => parseTag(m[0]));
    return {
        outlines, texts, icons, details,
        querySelectorAll(selector: string) {
            if (selector === ':scope > rect, :scope > path, :scope > circle') { return outlines; }
            if (selector === ':scope > .shape-detail > *') { return details; }
            if (selector === ':scope > text') { return texts; }
            if (selector === ':scope > .element-icon > g') { return icons; }
            throw new Error(`unexpected selector ${selector}`);
        },
    };
}

function paintOf(node: FakeNode): unknown {
    const pick = (el: FakeElement, keys: string[]) => Object.fromEntries(keys.map(k => [k, el.getAttribute(k)]));
    return {
        outlines: node.outlines.map(el => pick(el, ['fill', 'stroke', 'stroke-width', 'stroke-dasharray'])),
        texts: node.texts.map(el => pick(el, ['fill'])),
        icons: node.icons.map(el => pick(el, ['fill'])),
        details: node.details.map(el => pick(el, ['fill', 'stroke'])),
    };
}

// ── Rendering ────────────────────────────────────────────────────────────────

const parser = new C4XParser();
function render(source: string, theme: C4Theme): { svg: string; view: C4View } {
    const view = c4ModelBuilder.build(parser.parse(source), 'parity').views[0];
    return { svg: new SvgBuilder().build(new DagreLayoutEngine().layoutSync(view), { theme, view }), view };
}

function flat(elements: readonly C4Element[], into: C4Element[] = []): C4Element[] {
    for (const element of elements) {
        into.push(element);
        if (element.children) { flat(element.children, into); }
    }
    return into;
}

/**
 * What the client does for a staged tag edit (previewClientScript
 * restyleNodesForTags): resolve every node with the draft's tags, in the
 * client realm, and paint the nodes rendered from the saved source.
 */
function clientRepaint(before: { svg: string; view: C4View }, stagedTags: Record<string, string[]>, theme: C4Theme): Map<string, FakeNode> {
    const client = clientRealm();
    const inputs = json(elementStyleClientInputs(before.view, theme)) as ReturnType<typeof elementStyleClientInputs>;
    assert.ok(isValidElementStyleInputs(inputs));
    const byId = new Map(flat(before.view.elements).map(e => [e.id, e]));
    // The client's own draft computation (embedded copy), not a restatement of it.
    const effective = client.draftStyleElements(
        inputs,
        (id: string) => byId.get(id),
        (id: string) => stagedTags[id],
    ) as Array<{ id: string; type: string; tags: string[]; sprite?: string; shape?: string; impliedTags: string[] }>;
    const context = { rules: inputs.rules, accentSlots: client.computeAccentSlots(effective) };
    const nodes = new Map<string, FakeNode>();
    for (const element of effective) {
        const node = fakeNode(before.svg, element.id);
        const isKnownSprite = (id: string) => client.spriteIdMatches(id, BUNDLED_SPRITE_IDS) as boolean;
        client.paintNodeWithStyle(node, client.resolveElementStyle(element, inputs.theme, context, { isKnownSprite }), inputs.borderWidth);
        nodes.set(element.id, node);
    }
    return nodes;
}

const RULES = 'elementStyle Mainframe $stroke="#BF101D", $color="#BF101D"\n'
    + 'elementStyle t $border="dashed", $strokeWidth="3", $background="#FAFAFA"\n'
    + 'elementStyle quiet $border="solid"\n';

describe('element style host/client parity (#322)', () => {
    it('the assembled client script embeds every resolver function and the paint helper verbatim', () => {
        for (const fn of [...ELEMENT_STYLE_CLIENT_FUNCTIONS, paintNodeWithStyle, draftStyleElements, isValidElementStyleInputs]) {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes(embedded(fn)), `${fn.name} is embedded unchanged`);
        }
        assert.ok(/function restyleNodesForTags\(overrides\)/.test(PREVIEW_CLIENT_SCRIPT));
        assert.ok(/restyleNodesForTags\(\);/.test(PREVIEW_CLIENT_SCRIPT), 'a staged tag edit repaints');
    });

    it('the client copy resolves exactly what the host resolves', () => {
        const client = clientRealm();
        const elements = [
            { id: 'p', type: 'Person' },
            { id: 'pe', type: 'Person', tags: ['External', 'Mainframe'] },
            { id: 'db', type: 'Container', tags: ['Database', 't'] },
            { id: 's', type: 'SoftwareSystem', tags: ['External'], sprite: 'react' },
            { id: 'shape', type: 'Container', tags: ['quiet'], shape: 'Box' },
            { id: 'undrawn', type: 'Component', shape: 'Folder' },
            { id: 'node', type: 'DeploymentNode', tags: ['External'] },
        ];
        const rules = [
            { tag: 'Mainframe', properties: [{ key: 'stroke', value: '#BF101D' }, { key: 'color', value: '#BF101D' }] },
            { tag: 'T', properties: [{ key: 'border', value: 'dotted' }, { key: 'strokeWidth', value: '5' }, { key: 'shape', value: 'Cylinder' }] },
            { tag: 'quiet', properties: [{ key: 'nope', value: 'x' }, { key: 'legend', value: 'Quiet' }] },
        ];
        for (const theme of [ClassicTheme, C4ModelTheme]) {
            const hostSlots = (client.computeAccentSlots as (e: unknown) => Record<string, number>)(elements);
            const context = { rules, accentSlots: { ...hostSlots } };
            for (const element of elements) {
                assert.deepStrictEqual(json(client.resolveElementStyle(element, json(theme), context)),
                    json(resolveElementStyle(element, theme, context)), `${theme.name} ${element.id}`);
            }
        }
    });

    const scenarios: ReadonlyArray<{ name: string; theme: C4Theme; source: string; staged: Record<string, string[]>; saved?: string; samePaint?: boolean }> = [
        {
            name: 'tag styles on a system, a person (icon node) and a database (cylinder)',
            theme: ClassicTheme,
            source: 'graph TB\n' + RULES + 'System(m, "Core")\nPerson(u, "User")\nContainerDb(d, "DB", "SQL")\nContainer(c, "C", $tags="quiet")\n'
                + 'u -->|Uses| m\nm -->|Reads| d\nm -->|Calls| c\n',
            staged: { m: ['Mainframe'], u: ['t'], d: ['Database', 't'], c: [] },
        },
        {
            name: 'injected External keeps the implied position, authored External its source position (#345 review)',
            theme: ClassicTheme,
            source: 'graph TB\nelementStyle External $stroke="#111111"\nelementStyle Custom $stroke="#222222"\n'
                + 'System_Ext(x, "X")\nSystem_Ext(z, "Z")\nSystem(y, "Y", $tags="Custom")\nx -->|Uses| y\nz -->|Uses| y\n',
            staged: { x: ['Custom', 'External'], z: ['Custom'], y: ['Custom', 'External'] },
            // The source Save writes: x and y now author External after Custom;
            // z's macro re-injects External in the implied position.
            saved: 'graph TB\nelementStyle External $stroke="#111111"\nelementStyle Custom $stroke="#222222"\n'
                + 'System_Ext(x, "X", $tags="Custom, External")\nSystem_Ext(z, "Z", $tags="Custom")\nSystem(y, "Y", $tags="Custom, External")\n'
                + 'x -->|Uses| y\nz -->|Uses| y\n',
        },
        {
            name: 'removing an authored macro tag: Save re-injects what the _Ext and Db macros require (#345 delta review)',
            theme: ClassicTheme,
            source: 'graph TB\nelementStyle External $stroke="#111111"\nelementStyle Database $stroke="#333333"\n'
                + 'System_Ext(x, "X", $tags="External")\nSystemDb(d, "D", $tags="Database")\nx -->|Uses| d\n',
            staged: { x: ['Custom'], d: ['Custom'] },
            saved: 'graph TB\nelementStyle External $stroke="#111111"\nelementStyle Database $stroke="#333333"\n'
                + 'System_Ext(x, "X", $tags="Custom")\nSystemDb(d, "D", $tags="Custom")\nx -->|Uses| d\n',
            // Save re-injects the removed tags, so the paint must NOT change;
            // a client that forgot them would drop the External/Database styles.
            samePaint: true,
        },
        {
            name: 'making a system external shifts the accent order of the externals after it (c4-model)',
            theme: C4ModelTheme,
            source: 'graph TB\nSystem(a, "A")\nSystem_Ext(b, "B")\nSystem_Ext(c, "C")\na -->|Uses| b\na -->|Uses| c\n',
            staged: { a: ['External'] },
        },
        {
            name: 'tag styles on the named shapes: person head, web browser bar and dots, terminal glyph, bucket lid (#323)',
            theme: C4ModelTheme,
            source: 'graph TB\n' + RULES + 'Person(u, "User")\nContainer(w, "Web", $shape="WebBrowser")\n'
                + 'Container(t, "API", $shape="Terminal")\nContainer(b, "Files", $shape="Bucket")\nu -->|Uses| w\nw -->|Calls| t\nt -->|Writes| b\n',
            staged: { u: ['Mainframe'], w: ['Mainframe'], t: ['t'], b: ['Mainframe'] },
        },
    ];

    for (const scenario of scenarios) {
        it(`a staged tag edit repaints like the host render after Save: ${scenario.name}`, () => {
            const before = render(scenario.source, scenario.theme);
            // The saved source: the same diagram with the staged tags written in.
            const after = before.view.elements.map(e => e.id);
            let afterSvg: string;
            if (scenario.saved) {
                afterSvg = render(scenario.saved, scenario.theme).svg;
            } else {
                const tagged = flat(before.view.elements).map(e => ({ ...e, tags: scenario.staged[e.id] ?? e.tags }));
                const afterView: C4View = { ...before.view, elements: tagged };
                afterSvg = new SvgBuilder().build(new DagreLayoutEngine().layoutSync(afterView), { theme: scenario.theme, view: afterView });
            }

            const repainted = clientRepaint(before, scenario.staged, scenario.theme);
            for (const id of after) {
                assert.deepStrictEqual(paintOf(repainted.get(id)!), paintOf(fakeNode(afterSvg, id)), `${id}`);
            }
            // The scenario changes something (or, when samePaint, proves it must not).
            if (scenario.samePaint) {
                assert.ok(after.every(id => JSON.stringify(paintOf(fakeNode(before.svg, id))) === JSON.stringify(paintOf(fakeNode(afterSvg, id)))));
                return;
            }
            assert.ok(after.some(id => JSON.stringify(paintOf(fakeNode(before.svg, id))) !== JSON.stringify(paintOf(fakeNode(afterSvg, id)))));
        });
    }

    it('validates the payload field strictly and accepts its absence', () => {
        const { view } = render('graph TB\n' + RULES + 'System(m, "M", $shape="Box")\n', ClassicTheme);
        const inputs = json(elementStyleClientInputs(view, C4ModelTheme));
        assert.ok(isValidElementStyleInputs(undefined));
        assert.ok(isValidElementStyleInputs(inputs));
        assert.ok(!isValidElementStyleInputs({ ...(inputs as object), rules: 'x' }));
        assert.ok(!isValidElementStyleInputs({ ...(inputs as object), order: [1] }));
        assert.ok(!isValidElementStyleInputs({ ...(inputs as object), borderWidth: 'wide' }));
        assert.ok(!isValidElementStyleInputs(null));
    });
});
