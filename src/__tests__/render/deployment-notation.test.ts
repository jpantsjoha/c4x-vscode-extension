import * as assert from 'assert';
import { readFileSync } from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine, type LayoutResult, type PositionedElement } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { resolveElementStyle } from '../../render/elementStyle';
import {
    DEPLOYMENT_ICON_SIZE,
    DEPLOYMENT_ICON_SLOT,
    INFRASTRUCTURE_ICON_BLOCK,
    deploymentLabelInkBox,
    deploymentLabelLineCount,
    deploymentLabelMinWidth,
    deploymentLabelReserve,
    deploymentLabelText,
    deploymentLabelRowHeight,
    deploymentIconSlot,
    isDeploymentNotationOutline,
    relativeLuminance,
    contrastRatio,
    infrastructureTextBox,
    spriteBrandColor,
    viewBrandColors,
} from '../../render/deploymentNotation';
import { SPRITES } from '../../assets/icons';
import { layoutElementText, TEXT_METRICS } from '../../render/textLayout';
import { elementStyleClientInputs, isValidElementStyleInputs } from '../../webview/elementStyleClient';
import type { C4Theme } from '../../themes/Theme';
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import { C4StandardTheme } from '../../themes/C4StandardTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { ModernTheme } from '../../themes/ModernTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { HighContrastTheme } from '../../themes/HighContrastTheme';
import { DarkTheme, LightTheme } from '../../themes/AutoTheme';
import type { C4Element } from '../../model/C4Model';

/**
 * Deployment notation (#326): in the c4-model theme a deployment node's icon
 * sits at the bottom left beside its name and `[Deployment Node: technology]`,
 * an infrastructure node's icon is centred under its text, nested nodes
 * reserve their label row, and a `preserveColor` sprite tints the outline.
 * Every other theme draws deployment nodes exactly as before.
 */

const FIXTURE = readFileSync(path.join(__dirname, '..', 'snapshots', 'fixtures', 'deployment-aws.c4x'), 'utf-8');

interface Box { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
    return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function encloses(outer: Box, inner: Box): boolean {
    return outer.x <= inner.x && outer.y <= inner.y && outer.x + outer.width >= inner.x + inner.width && outer.y + outer.height >= inner.y + inner.height;
}

/**
 * Parse, build, lay out and render. `infrastructure` marks those elements as
 * infrastructure nodes on the built model: no source spelling sets the mark
 * yet (the C4X `Infrastructure_Node` spelling lands separately, see C4Model).
 */
function build(source: string, theme: C4Theme, infrastructure: readonly string[] = []): { layout: LayoutResult; svg: string; elements: C4Element[] } {
    const view = new C4ModelBuilder().build(new C4XParser().parse(source), 't').views[0];
    const mark = (list: C4Element[]): void => {
        for (const e of list) {
            if (infrastructure.includes(e.id)) { e.nodeKind = 'infrastructure'; }
            mark(e.children ?? []);
        }
    };
    mark(view.elements);
    const layout = new DagreLayoutEngine(() => undefined).layoutSync(view, { theme });
    return { layout, svg: new SvgBuilder().build(layout, { theme, view }), elements: view.elements };
}

/** The node group's opening tag and its body, by id. */
function nodeMarkup(svg: string, id: string): string {
    const start = svg.indexOf(`data-id="${id}"`);
    assert.ok(start >= 0, `node ${id} drawn`);
    const open = svg.lastIndexOf('<g class="node', start);
    return svg.slice(open, svg.indexOf('\n  </g>', start));
}

function positioned(layout: LayoutResult, id: string): PositionedElement {
    const node = layout.elements.find(e => e.id === id);
    assert.ok(node, `node ${id} laid out`);
    return node!;
}

function texts(markup: string): Array<{ field: string; x: number; y: number; anchor: string; text: string }> {
    return [...markup.matchAll(/<text data-field="([a-z]+)" x="([\d.]+)" y="([\d.]+)"[^>]*text-anchor="([a-z]+)"[^>]*>(.*?)<\/text>/g)]
        .map(m => ({ field: m[1], x: Number(m[2]), y: Number(m[3]), anchor: m[4], text: m[5] }));
}

function iconTransform(markup: string): { placement: string; x: number; y: number; scale: number } | undefined {
    const m = /<g class="element-icon"(?: data-icon-placement="([a-z-]+)")?>\s*<g transform="translate\(([\d.-]+), ([\d.-]+)\) scale\(([\d.]+)\)"/.exec(markup);
    return m ? { placement: m[1] ?? '', x: Number(m[2]), y: Number(m[3]), scale: Number(m[4]) } : undefined;
}

describe('Deployment notation (#326)', () => {
    describe('the model', () => {
        it('no C4X spelling marks an element infrastructure yet; Node builds an unmarked DeploymentNode', () => {
            const view = new C4ModelBuilder().build(new C4XParser().parse(FIXTURE), 't').views[0];
            const walk = (list: C4Element[]): void => {
                for (const e of list) {
                    assert.ok(!('nodeKind' in e), `${e.id} gains no field`);
                    walk(e.children ?? []);
                }
            };
            walk(view.elements);
            assert.throws(() => new C4ModelBuilder().build(new C4XParser().parse('graph TB\nInfrastructure_Node(dns, "DNS")'), 't'), /Unsupported element type "Infrastructure_Node"/);
        });
    });

    describe('icon and label placement per node kind (c4-model)', () => {
        const { layout, svg } = build(FIXTURE, C4ModelTheme);

        it('a nested node with an icon: icon bottom left, label row beside it, last baseline 10 above the bottom', () => {
            for (const id of ['asg', 'ec2', 'rds']) {
                const node = positioned(layout, id);
                const markup = nodeMarkup(svg, id);
                assert.ok(markup.includes(`data-label-row="bottom-left" data-icon-slot="${DEPLOYMENT_ICON_SLOT}"`), `${id}: row attributes`);
                const icon = iconTransform(markup)!;
                assert.strictEqual(icon.placement, 'label-row');
                // A 48-unit AWS sprite scaled to 32 px, 10 px in, its bottom 8 px above the node's bottom.
                assert.strictEqual(icon.scale, Number((DEPLOYMENT_ICON_SIZE / 48).toFixed(4)));
                assert.strictEqual(icon.x, Number((node.x + 10).toFixed(2)), `${id}: icon x`);
                assert.strictEqual(icon.y, Number((node.y + node.height - 8 - DEPLOYMENT_ICON_SIZE).toFixed(2)), `${id}: icon y`);
                const lines = texts(markup);
                assert.deepStrictEqual(lines.map(t => t.field), ['label', 'technology']);
                for (const t of lines) {
                    assert.strictEqual(t.anchor, 'start');
                    assert.strictEqual(t.x, Number((node.x + 10 + DEPLOYMENT_ICON_SLOT).toFixed(2)), `${id}: text beside the icon`);
                }
                assert.strictEqual(lines[1].y, Number((node.y + node.height - 10).toFixed(2)));
                assert.strictEqual(lines[0].y, Number((node.y + node.height - 26).toFixed(2)));
            }
            assert.ok(nodeMarkup(svg, 'ec2').includes('>[Deployment Node: Ubuntu 22.04 LTS]</text>'));
        });

        it('a nested node without an icon starts its label row at the left margin', () => {
            for (const id of ['aws', 'region', 'customerComputer', 'browser']) {
                const node = positioned(layout, id);
                const markup = nodeMarkup(svg, id);
                assert.ok(markup.includes('data-label-row="bottom-left" data-icon-slot="0"'), id);
                assert.strictEqual(iconTransform(markup), undefined, `${id}: no icon`);
                for (const t of texts(markup)) {
                    assert.strictEqual(t.x, Number((node.x + 10).toFixed(2)), `${id}: text at the margin`);
                }
            }
            assert.ok(nodeMarkup(svg, 'aws').includes('>[Deployment Node]</text>'), 'no technology: the bare type');
        });

        it('a leaf deployment node uses the same label row: Route 53 and the load balancer', () => {
            for (const id of ['dns', 'lb']) {
                const node = positioned(layout, id);
                const markup = nodeMarkup(svg, id);
                assert.ok(markup.includes(`data-label-row="bottom-left" data-icon-slot="${DEPLOYMENT_ICON_SLOT}"`), id);
                assert.strictEqual(iconTransform(markup)!.x, Number((node.x + 10).toFixed(2)));
                const lines = texts(markup);
                assert.deepStrictEqual(lines.map(t => t.field), ['label', 'technology', 'description']);
                // The last baseline (a wrapped description's last line) sits 10 above the bottom.
                const baselines = [...markup.matchAll(/<(?:text|tspan) [^>]*y="([\d.]+)"/g)].map(m => Number(m[1]));
                assert.strictEqual(Math.max(...baselines), Number((node.y + node.height - 10).toFixed(2)), id);
            }
        });

        it('a leaf deployment node with no block uses the same label row', () => {
            const leaf = build('%%{ c4: deployment }%%\ngraph TB\nNode(vm, "Build agent", "Ubuntu", $sprite="aws-ec2-instance")\n', C4ModelTheme);
            const node = positioned(leaf.layout, 'vm');
            const markup = nodeMarkup(leaf.svg, 'vm');
            assert.ok(markup.includes(`data-icon-slot="${DEPLOYMENT_ICON_SLOT}"`));
            assert.strictEqual(iconTransform(markup)!.x, Number((node.x + 10).toFixed(2)));
            assert.strictEqual(texts(markup).pop()!.y, Number((node.y + node.height - 10).toFixed(2)));
        });

        it('an infrastructure node centres its icon under its text', () => {
            const marked = build(FIXTURE, C4ModelTheme, ['dns', 'lb']);
            const { layout, svg } = marked;
            for (const id of ['dns', 'lb']) {
                const node = positioned(layout, id);
                const markup = nodeMarkup(svg, id);
                assert.ok(markup.includes('data-icon-below="true"'));
                assert.ok(markup.includes('class="node infrastructure-node"'));
                const icon = iconTransform(markup)!;
                assert.strictEqual(icon.placement, 'below');
                assert.strictEqual(icon.x, Number((node.x + node.width / 2 - DEPLOYMENT_ICON_SIZE / 2).toFixed(2)), `${id}: icon centred`);
                assert.strictEqual(icon.y, Number((node.y + node.height - 10 - DEPLOYMENT_ICON_SIZE).toFixed(2)), `${id}: icon 10 above the bottom`);
                const lines = texts(markup);
                assert.deepStrictEqual(lines.map(t => t.field), ['label', 'technology', 'description']);
                for (const t of lines) {
                    assert.strictEqual(t.anchor, 'middle');
                    assert.strictEqual(t.x, Number((node.x + node.width / 2).toFixed(2)));
                    // Each baseline sits above the icon's top, its descenders clear of it.
                    assert.ok(t.y + 4 <= icon.y, `${id}: ${t.field} above the icon`);
                }
            }
            assert.ok(nodeMarkup(svg, 'dns').includes('>[Infrastructure Node: Amazon Route 53]</text>'));
            // Container sized, as an infrastructure node is a single service box.
            assert.deepStrictEqual([positioned(layout, 'dns').width, positioned(layout, 'dns').height], [240, 140]);
            assert.deepStrictEqual(infrastructureTextBox(0, 0, 240, 140), { x: 0, y: 0, width: 240, height: 140 - INFRASTRUCTURE_ICON_BLOCK });
        });

        it('a container keeps its icon top centre; the notation is for deployment nodes only', () => {
            const plain = build('%%{ c4: container }%%\ngraph TB\nContainer(api, "API", "Go", $sprite="aws-ec2-instance")\n', C4ModelTheme);
            const markup = nodeMarkup(plain.svg, 'api');
            assert.ok(markup.includes('class="node person"'));
            assert.strictEqual(iconTransform(markup)!.placement, '');
            assert.ok(!markup.includes('data-label-row'));
        });
    });

    describe('nesting four deep (c4-model)', () => {
        for (const [themeName, theme] of [['c4-model', C4ModelTheme], ['c4-model dark', C4ModelDarkTheme]] as const) {
            const { layout, svg, elements } = build(FIXTURE, theme);
            const byId = new Map(layout.elements.map(e => [e.id, e]));
            const children = new Map<string, string[]>();
            const parentOf = new Map<string, string>();
            const walk = (list: C4Element[], parent?: string): void => {
                for (const e of list) {
                    if (parent) { parentOf.set(e.id, parent); }
                    children.set(e.id, (e.children ?? []).map(c => c.id));
                    walk(e.children ?? [], e.id);
                }
            };
            walk(elements);
            const descendants = (id: string): string[] => (children.get(id) ?? []).flatMap(c => [c, ...descendants(c)]);
            const depth = (id: string): number => parentOf.has(id) ? 1 + depth(parentOf.get(id)!) : 0;

            it(`${themeName}: API Application sits four nodes deep`, () => {
                assert.strictEqual(depth('api'), 4);
                for (let id = 'api'; parentOf.has(id); id = parentOf.get(id)!) {
                    assert.ok(encloses(byId.get(parentOf.get(id)!)!, byId.get(id)!), `${parentOf.get(id)} encloses ${id}`);
                }
            });

            it(`${themeName}: each nested node pads its children 40 on top and sides and reserves its label row below`, () => {
                for (const [id, kids] of children) {
                    if (kids.length === 0) { continue; }
                    const node = byId.get(id)!;
                    const element = node.element;
                    const slot = element.sprite ? DEPLOYMENT_ICON_SLOT : 0;
                    const text = deploymentLabelText(element, theme);
                    const reserve = deploymentLabelReserve(deploymentLabelLineCount(theme, text, slot, node.width), slot);
                    const boxes = kids.map(k => byId.get(k)!);
                    const top = Math.min(...boxes.map(b => b.y));
                    const bottom = Math.max(...boxes.map(b => b.y + b.height));
                    const left = Math.min(...boxes.map(b => b.x));
                    const right = Math.max(...boxes.map(b => b.x + b.width));
                    assert.ok(top - node.y >= 40 - 1e-6, `${id}: top padding ${top - node.y}`);
                    assert.ok(left - node.x >= 40 - 1e-6, `${id}: left padding ${left - node.x}`);
                    assert.ok(node.x + node.width - right >= 40 - 1e-6, `${id}: right padding`);
                    assert.ok(node.y + node.height - bottom >= reserve - 1e-6, `${id}: bottom ${node.y + node.height - bottom} < reserve ${reserve}`);
                    assert.ok(node.width >= deploymentLabelMinWidth(theme, text, slot) - 1e-6, `${id}: narrower than its label`);
                }
            });

            it(`${themeName}: no label row overlaps a child, a sibling or a relationship label (ink bounds)`, () => {
                const inks = new Map<string, Box>();
                for (const [id, kids] of children) {
                    if (kids.length === 0) { continue; }
                    const node = byId.get(id)!;
                    inks.set(id, deploymentLabelInkBox(theme, node, deploymentLabelText(node.element, theme), node.element.sprite ? DEPLOYMENT_ICON_SLOT : 0));
                }
                for (const [id, ink] of inks) {
                    assert.ok(encloses(byId.get(id)!, ink), `${id}: label inside its outline`);
                    for (const other of layout.elements) {
                        if (other.id === id || descendants(other.id).includes(id)) { continue; }
                        assert.ok(!overlaps(ink, other), `${id} label overlaps ${other.id}`);
                    }
                }
                // Siblings never overlap.
                for (const a of layout.elements) {
                    for (const b of layout.elements) {
                        if (a.id >= b.id || descendants(a.id).includes(b.id) || descendants(b.id).includes(a.id)) { continue; }
                        assert.ok(!overlaps(a, b), `${a.id} overlaps ${b.id}`);
                    }
                }
                // Relationship labels: each line's ink box (measured by its text length) clears every label row.
                const edgeText = [...svg.matchAll(/<text (?:data-field="relationship-technology" )?x="([\d.]+)" y="([\d.]+)" fill="[^"]+" stroke="[^"]+" stroke-width="2" paint-order="stroke" text-anchor="middle" font-size="(\d+)"[^>]*>([^<]*)<\/text>/g)];
                assert.ok(edgeText.length >= 8, `${edgeText.length} relationship lines`);
                for (const m of edgeText) {
                    const size = Number(m[3]);
                    const width = m[4].length * size * 0.6;
                    const box = { x: Number(m[1]) - width / 2, y: Number(m[2]) - size, width, height: size + 3 };
                    for (const [id, ink] of inks) {
                        assert.ok(!overlaps(box, ink), `relationship text "${m[4]}" overlaps ${id}'s label`);
                    }
                }
            });

            it(`${themeName}: no route crosses a label row it does not start or end at`, () => {
                for (const route of layout.relationships) {
                    for (const [id, kids] of children) {
                        if (kids.length === 0 || id === route.relationship.from || id === route.relationship.to) { continue; }
                        const node = byId.get(id)!;
                        const ink = deploymentLabelInkBox(theme, node, deploymentLabelText(node.element, theme), node.element.sprite ? DEPLOYMENT_ICON_SLOT : 0);
                        for (let i = 1; i < route.points.length; i++) {
                            const a = route.points[i - 1];
                            const b = route.points[i];
                            const seg = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x) || 0.01, height: Math.abs(a.y - b.y) || 0.01 };
                            assert.ok(!overlaps(seg, ink), `${route.id} crosses ${id}'s label`);
                        }
                    }
                }
            });
        }
    });

    describe('the IBS deployment fixtures in c4-model', () => {
        for (const name of ['06-deployment-development', '07-deployment-live-aws']) {
            it(`${name}: every node sits inside its parent and no two siblings overlap`, () => {
                const source = readFileSync(path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs', `${name}.c4x`), 'utf-8');
                const { layout, elements } = build(source, C4ModelTheme);
                const byId = new Map(layout.elements.map(e => [e.id, e]));
                const check = (list: C4Element[], parent?: C4Element): void => {
                    for (const e of list) {
                        if (parent) { assert.ok(encloses(byId.get(parent.id)!, byId.get(e.id)!), `${parent.id} encloses ${e.id}`); }
                        check(e.children ?? [], e);
                    }
                    for (const a of list) {
                        for (const b of list) {
                            if (a.id < b.id) { assert.ok(!overlaps(byId.get(a.id)!, byId.get(b.id)!), `${a.id} overlaps ${b.id}`); }
                        }
                    }
                };
                check(elements);
            });
        }
    });

    describe('brand tint', () => {
        it('reads the most used saturated colour of a preserveColor sprite, and nothing else', () => {
            assert.strictEqual(spriteBrandColor('aws-ec2-instance'), '#ED7100');
            assert.strictEqual(spriteBrandColor('aws-aurora-mysql-instance'), '#C925D1');
            assert.strictEqual(spriteBrandColor('aws-route-53-hosted-zone'), '#8C4FFF');
            // Drawn in the element's colour: no brand.
            assert.strictEqual(spriteBrandColor('server'), undefined);
            assert.strictEqual(spriteBrandColor('no-such-sprite'), undefined);
            assert.strictEqual(spriteBrandColor(undefined), undefined);
        });

        it('every bundled preserveColor sprite resolves to a colour or to none, never to grey', () => {
            let tinted = 0;
            let preserved = 0;
            for (const [id, sprite] of Object.entries(SPRITES)) {
                if (typeof sprite === 'string' || !sprite.preserveColor) { continue; }
                preserved++;
                const colour = spriteBrandColor(id);
                if (colour === undefined) { continue; }
                assert.match(colour, /^#[0-9A-F]{6}$/);
                const [r, g, b] = [1, 3, 5].map(i => parseInt(colour.slice(i, i + 2), 16));
                assert.ok((Math.max(r, g, b) - Math.min(r, g, b)) / Math.max(r, g, b) >= 0.25, `${id}: ${colour} is grey`);
                tinted++;
            }
            assert.strictEqual(preserved, 1098);
            assert.ok(tinted >= 1000, `${tinted} of ${preserved} tinted`);
        });

        it('on: c4-model outlines a node in its sprite brand colour, text unchanged', () => {
            const { svg } = build(FIXTURE, C4ModelTheme);
            const stroke = (id: string): string => /<rect [^>]*stroke="([^"]+)"/.exec(nodeMarkup(svg, id))![1];
            const fill = (id: string): string => /<text data-field="label" [^>]*fill="([^"]+)"/.exec(nodeMarkup(svg, id))![1];
            assert.strictEqual(stroke('ec2'), '#ED7100');
            assert.strictEqual(stroke('asg'), '#ED7100');
            assert.strictEqual(stroke('rds'), '#C925D1');
            assert.strictEqual(stroke('dns'), '#8C4FFF');
            const neutral = C4ModelTheme.colors.deploymentNode.stroke;
            assert.strictEqual(stroke('aws'), neutral, 'no sprite: neutral');
            assert.strictEqual(fill('ec2'), C4ModelTheme.colors.deploymentNode.text, 'text keeps the node colour');
        });

        it('off: a theme without brandTint, a sprite drawn in the element colour, or an elementStyle $stroke', () => {
            const source = [
                '%%{ c4: deployment }%%',
                'graph TB',
                'elementStyle Pinned $stroke="#123456"',
                'Node(a, "A", $sprite="aws-ec2-instance") {\n}',
                'Node(b, "B", $sprite="server") {\n}',
                'Node(c, "C", $sprite="aws-ec2-instance", $tags="Pinned") {\n}',
            ].join('\n');
            const strokeOf = (svg: string, id: string): string => /<rect [^>]*stroke="([^"]+)"/.exec(nodeMarkup(svg, id))![1];
            const on = build(source, C4ModelTheme).svg;
            assert.strictEqual(strokeOf(on, 'a'), '#ED7100');
            assert.strictEqual(strokeOf(on, 'b'), C4ModelTheme.colors.deploymentNode.stroke);
            assert.strictEqual(strokeOf(on, 'c'), '#123456', 'a $stroke style wins over the tint');
            const untinted: C4Theme = { ...C4ModelTheme, deploymentNotation: { brandTint: false } };
            assert.strictEqual(strokeOf(build(source, untinted).svg, 'a'), C4ModelTheme.colors.deploymentNode.stroke);
            assert.strictEqual(strokeOf(build(source, ModernTheme).svg, 'a'), ModernTheme.colors.deploymentNode.stroke);
        });

        it('a tint below 3:1 against the background or a node fill keeps the neutral outline, for every preserveColor sprite, light and dark', () => {
            for (const theme of [C4ModelTheme, C4ModelDarkTheme]) {
                const surfaces = [theme.colors.background, theme.colors.softwareSystem.fill, theme.colors.externalSystem.fill];
                const neutral = theme.colors.deploymentNode.stroke;
                let tinted = 0;
                let kept = 0;
                for (const [id, sprite] of Object.entries(SPRITES)) {
                    if (typeof sprite === 'string' || !sprite.preserveColor) { continue; }
                    const element: C4Element = { id: 'n', label: 'N', type: 'DeploymentNode', sprite: id };
                    const brandColors = viewBrandColors(theme, [element], []);
                    const stroke = resolveElementStyle(element, theme, { rules: [], accentSlots: {}, brandColors }).stroke;
                    if (stroke === neutral) { kept++; continue; }
                    tinted++;
                    assert.strictEqual(stroke, spriteBrandColor(id), id);
                    for (const surface of surfaces) {
                        assert.ok(contrastRatio(stroke, surface) >= 3, `${theme.description.slice(0, 10)} ${id}: ${stroke} on ${surface} is ${contrastRatio(stroke, surface).toFixed(2)}:1`);
                    }
                }
                assert.ok(tinted > 700 && kept > 0, `${tinted} tinted, ${kept} kept neutral`);
            }
            // The reported case: a navy brand on the dark canvas stays neutral.
            const b2c: C4Element = { id: 'n', label: 'N', type: 'DeploymentNode', sprite: 'azure-ad-b2c' };
            assert.strictEqual(spriteBrandColor('azure-ad-b2c'), '#041642');
            assert.strictEqual(resolveElementStyle(b2c, C4ModelDarkTheme, { rules: [], accentSlots: {}, brandColors: viewBrandColors(C4ModelDarkTheme, [b2c], []) }).stroke,
                C4ModelDarkTheme.colors.deploymentNode.stroke);
        });

        it('the editor resolves the same tint from the payload the host sends', () => {
            const view = new C4ModelBuilder().build(new C4XParser().parse(FIXTURE), 't').views[0];
            const inputs = elementStyleClientInputs(view, C4ModelTheme);
            assert.ok(isValidElementStyleInputs(inputs));
            assert.deepStrictEqual(inputs.theme.deploymentNotation, { brandTint: true });
            assert.deepStrictEqual({ ...inputs.brandColors }, { ...viewBrandColors(C4ModelTheme, view.elements, []) });
            const ec2 = view.elements[1].children![0].children![2].children![0];
            assert.strictEqual(ec2.id, 'ec2');
            const style = resolveElementStyle(ec2, inputs.theme, { rules: inputs.rules, accentSlots: {}, brandColors: inputs.brandColors });
            assert.strictEqual(style.stroke, '#ED7100');
            // Another theme sends neither field, so its payload is unchanged.
            const modern = elementStyleClientInputs(view, ModernTheme);
            assert.ok(!('brandColors' in modern) && !('deploymentNotation' in modern.theme));
            assert.ok(!isValidElementStyleInputs({ ...inputs, brandColors: { 'aws-ec2-instance': 7 } }));
            assert.ok(!isValidElementStyleInputs({ ...inputs, theme: { ...inputs.theme, deploymentNotation: { brandTint: 'yes' } } }));
        });
    });

    describe('a live edit longer than the reserve (editor)', () => {
        const SOURCE = '%%{ c4: deployment }%%\ngraph TB\nNode(parent, "Host", "Linux") {\n  Container(app, "App", "Go")\n}\n';
        const LONG = {
            label: 'Primary production application host in the eu-west-2 availability zone',
            technology: 'Amazon Linux 2023 on a Graviton m7g.4xlarge instance with encrypted volumes',
            description: 'Runs the order, payment and notification services behind the internal load balancer, with nightly snapshots and a warm standby in a second zone',
        };
        for (const [themeName, theme] of [['c4-model', C4ModelTheme], ['c4-model dark', C4ModelDarkTheme]] as const) {
            it(`${themeName}: the row the editor draws from the node's attributes stays under the child, within the reserve`, () => {
                const { layout, svg } = build(SOURCE, theme);
                const parent = positioned(layout, 'parent');
                const app = positioned(layout, 'app');
                const markup = nodeMarkup(svg, 'parent');
                const attrs = /data-icon-slot="(\d+)" data-label-lines="(\d+)"/.exec(markup)!;
                // What relayoutNodeText does: the snapshot geometry, the drawn attributes, the edited text.
                const edited = layoutElementText({
                    x: parent.x, y: parent.y, width: parent.width, height: parent.height,
                    iconLayout: false, cylinder: false, fontFamily: theme.styles.fontFamily,
                    label: LONG.label, technology: LONG.technology, typeLabel: 'Deployment Node', description: LONG.description,
                    labelRow: { iconSlot: Number(attrs[1]), maxLines: Number(attrs[2]) },
                }, TEXT_METRICS);
                const baselines = edited.blocks.flatMap(b => b.ys);
                assert.strictEqual(baselines.length, Number(attrs[2]), 'the row keeps its line count');
                // First line's cap top (13 px over the baseline) clears the child's bottom edge.
                assert.ok(Math.min(...baselines) - 13 >= app.y + app.height, `top line at ${Math.min(...baselines)} inside the child (bottom ${app.y + app.height})`);
                assert.strictEqual(Math.max(...baselines), parent.y + parent.height - 10);
                assert.strictEqual(edited.blocks[0].field, 'label', 'the name is kept first');
                assert.ok(edited.blocks.some(b => b.truncated), 'cut text ends with an ellipsis');
            });
        }

        it('a leaf caps its row at the lines its height holds', () => {
            const { layout, svg } = build('%%{ c4: deployment }%%\ngraph TB\nNode(vm, "VM", "Linux")\n', C4ModelTheme);
            const vm = positioned(layout, 'vm');
            const lines = Number(/data-label-lines="(\d+)"/.exec(nodeMarkup(svg, 'vm'))![1]);
            const edited = layoutElementText({
                x: vm.x, y: vm.y, width: vm.width, height: vm.height, iconLayout: false, cylinder: false,
                fontFamily: C4ModelTheme.styles.fontFamily, label: 'word '.repeat(40), technology: 'word '.repeat(40),
                typeLabel: 'Deployment Node', description: 'word '.repeat(80), labelRow: { iconSlot: 0, maxLines: lines },
            }, TEXT_METRICS);
            assert.ok(Math.min(...edited.blocks.flatMap(b => b.ys)) - 13 >= vm.y + 8);
        });
    });

    describe('helpers at their edges', () => {
        it('contrast: three-digit colours, and anything that is not a hex colour reads as no contrast', () => {
            assert.strictEqual(relativeLuminance('#fff'), relativeLuminance('#FFFFFF'));
            assert.strictEqual(relativeLuminance('red'), undefined);
            assert.strictEqual(contrastRatio('red', '#FFFFFF'), 1);
            assert.strictEqual(Number(contrastRatio('#000', '#fff').toFixed(0)), 21);
        });

        it('outlines, icon slots, row heights and widths', () => {
            assert.deepStrictEqual(['rect', 'box', 'roundedBox', 'cylinder', 'person'].map(o => isDeploymentNotationOutline(o as never)), [true, true, true, false, false]);
            assert.strictEqual(deploymentIconSlot(undefined), 0);
            assert.strictEqual(deploymentIconSlot('no-such-sprite'), 0);
            assert.strictEqual(deploymentLabelRowHeight(1, 0), 23);
            assert.strictEqual(deploymentLabelRowHeight(1, DEPLOYMENT_ICON_SLOT), 40);
            const bare = deploymentLabelMinWidth(C4ModelTheme, { label: 'A' }, 0);
            assert.ok(deploymentLabelMinWidth(C4ModelTheme, { label: 'A', technology: 'Linux' }, 0) > bare, 'a bare technology line counts');
            assert.strictEqual(deploymentLabelMinWidth(C4ModelTheme, { label: 'A', description: 'word '.repeat(200) }, 40), 480, 'capped');
            const plain: C4Theme = { ...C4ModelTheme, showElementType: false };
            assert.strictEqual(deploymentLabelText({ id: 'n', label: 'N', type: 'DeploymentNode' }, plain).typeLabel, undefined);
        });

        it('brand colours: off when the theme does not tint, read from style rules, one entry per sprite', () => {
            const element: C4Element = { id: 'n', label: 'N', type: 'DeploymentNode', sprite: 'aws-ec2-instance' };
            assert.deepStrictEqual({ ...viewBrandColors(ModernTheme, [element], []) }, {});
            assert.deepStrictEqual({ ...viewBrandColors({ ...C4ModelTheme, deploymentNotation: { brandTint: false } }, [element], []) }, {});
            const colours = viewBrandColors(C4ModelTheme, [element, { ...element, id: 'm' }],
                [{ properties: [{ key: 'sprite', value: 'aws-aurora-mysql-instance' }, { key: 'stroke', value: '#000000' }] }]);
            assert.deepStrictEqual({ ...colours }, { 'aws-ec2-instance': '#ED7100', 'aws-aurora-mysql-instance': '#C925D1' });
        });

        it('a row with less room than fields keeps the name and drops the rest', () => {
            const row = layoutElementText({
                x: 0, y: 0, width: 300, height: 200, iconLayout: false, cylinder: false, fontFamily: 'Arial, sans-serif',
                label: 'Host', technology: 'Linux', typeLabel: 'Deployment Node', description: 'Runs things', labelRow: { iconSlot: 0, maxLines: 1 },
            }, TEXT_METRICS);
            assert.deepStrictEqual(row.blocks.map(b => b.field), ['label']);
            assert.strictEqual(row.blocks[0].ys[0], 190);
        });

        it('spare room beyond one line each goes to the fields in order: name first', () => {
            const row = layoutElementText({
                x: 0, y: 0, width: 200, height: 200, iconLayout: false, cylinder: false, fontFamily: 'Arial, sans-serif',
                label: 'word '.repeat(30), technology: 'word '.repeat(30), typeLabel: 'Deployment Node', description: 'word '.repeat(30),
                labelRow: { iconSlot: 0, maxLines: 4 },
            }, TEXT_METRICS);
            assert.deepStrictEqual(row.blocks.map(b => [b.field, b.lines.length]), [['label', 2], ['technology', 1], ['description', 1]]);
            assert.ok(row.blocks.every(b => b.truncated));
        });

        it('a locked node in the notation, and a sprite drawn in the element colour', () => {
            const { svg } = build('%%{ c4: deployment }%%\ngraph TB\nNode(vm, "VM", "Linux", $sprite="server", $locked="true")\nNode(x, "X", $sprite="no-such-sprite")\n', C4ModelTheme);
            const vm = nodeMarkup(svg, 'vm');
            assert.ok(vm.includes('class="node deployment-node locked"') && vm.includes('data-locked="true"'));
            assert.match(vm, /<g class="element-icon" data-icon-placement="label-row">\s*<g transform="[^"]+" fill="#[0-9A-Fa-f]{6}"/);
            const x = nodeMarkup(svg, 'x');
            assert.ok(!x.includes('element-icon') && x.includes('data-icon-slot="0"'), 'an unknown sprite draws no icon and keeps no slot');
        });
    });

    describe('every other theme draws deployment nodes as before', () => {
        const OTHERS: ReadonlyArray<[string, C4Theme]> = [
            ['classic', ClassicTheme], ['c4-standard', C4StandardTheme], ['modern', ModernTheme], ['muted', MutedTheme],
            ['high-contrast', HighContrastTheme], ['auto-light', LightTheme], ['auto-dark', DarkTheme],
        ];
        for (const [name, theme] of OTHERS) {
            it(`${name}: no notation token, no label row, the sprite 40 px top centre`, () => {
                assert.strictEqual(theme.deploymentNotation, undefined);
                const { layout, svg } = build(FIXTURE, theme);
                assert.ok(!svg.includes('data-label-row') && !svg.includes('data-icon-below') && !svg.includes('data-icon-placement'));
                const ec2 = positioned(layout, 'ec2');
                const icon = iconTransform(nodeMarkup(svg, 'ec2'))!;
                assert.strictEqual(icon.scale, Number((40 / 48).toFixed(4)));
                assert.strictEqual(icon.x, Number((ec2.x + ec2.width / 2 - 20).toFixed(2)));
                assert.strictEqual(icon.y, Number((ec2.y + 10).toFixed(2)));
            });
        }
    });
});
