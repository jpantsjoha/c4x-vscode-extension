/**
 * Host/client parity for element text wrapping (#340).
 *
 * The webview embeds the host's text layout verbatim. This suite proves:
 *   1. the assembled client script carries every text-layout function, unchanged,
 *      and the host's width tables;
 *   2. the embedded copy, run in its own realm with the tables as the client
 *      declares them, wraps a corpus of strings exactly as the host does, in
 *      every theme font, element shape and box size;
 *   3. the markup the client would insert for a node equals the text the host
 *      rendered into the SVG for it.
 */
import * as assert from 'assert';
import * as vm from 'vm';
import { readFileSync, readdirSync } from 'fs';
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

import { PREVIEW_CLIENT_SCRIPT } from '../../webview/previewClientScript';
import {
    elementTextMarkup,
    layoutElementText,
    TEXT_LAYOUT_CLIENT_FUNCTIONS,
    TEXT_METRICS,
    type ElementTextInput,
} from '../../render/textLayout';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { isBundledSpriteId, resolveElementStyle } from '../../render/elementStyle';
import { shapeTextBox } from '../../render/shapeGeometry';
import { DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS, infrastructureTextBox } from '../../render/deploymentNotation';
import { ClassicTheme } from '../../themes/ClassicTheme';
import { C4ModelTheme } from '../../themes/C4ModelTheme';
import { MutedTheme } from '../../themes/MutedTheme';
import { LightTheme } from '../../themes/AutoTheme';

const embedded = (fn: (...args: never[]) => unknown): string => fn.toString().replace(/\bexports\./g, '');

/** The client's copy, in a separate realm, with the metrics as the webview declares them. */
function clientRealm(): { layoutElementText: typeof layoutElementText; elementTextMarkup: typeof elementTextMarkup; infrastructureTextBox: typeof infrastructureTextBox; metrics: unknown } {
    const declaration = /const C4X_TEXT_METRICS = (.*);\n/.exec(PREVIEW_CLIENT_SCRIPT);
    assert.ok(declaration, 'client script declares C4X_TEXT_METRICS');
    const source = [...TEXT_LAYOUT_CLIENT_FUNCTIONS, ...DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS].map(embedded).join('\n')
        + `\nconst C4X_TEXT_METRICS = ${declaration![1]};`
        + '\n;({ layoutElementText, elementTextMarkup, infrastructureTextBox, metrics: C4X_TEXT_METRICS })';
    return vm.runInNewContext(source);
}

const json = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

function corpusStrings(): string[] {
    const strings = new Set<string>([
        '', ' ', 'API', 'Personal Banking Customer',
        'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW', 'iiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii',
        'https://api.example.com/v2/accounts/{accountId}/transactions?limit=50&offset=100',
        'MainframeBankingSystemFacadeImplementationFactoryBean',
        '网上银行系统允许客户查看账户信息并进行支付和转账以及更多的银行业务功能',
        'Deploy 🚀 to the cloud ☁️ and ship 📦 it ✅ 👩🏽‍💻 every day with the whole team',
        'Zürich Ålesund Kraków Øresund Ñandú façade naïve résumé crème brûlée',
        'Система интернет-банкинга для клиентов и сотрудников банка',
        'Reads\nand writes\twith   odd   whitespace that is long enough to wrap in a box',
        'a <b>"quoted"</b> & \'escaped\' description that has to wrap onto another line',
        'word '.repeat(120).trim(),
    ]);
    const baseline = JSON.parse(readFileSync(path.join(__dirname, '..', 'compat', 'baseline-1.8.0.json'), 'utf8')) as { items: Array<{ format: string; source: string }> };
    const parser = new C4XParser();
    const walk = (elements: Array<{ label?: string; technology?: string; description?: string; children?: unknown[] }> | undefined): void => {
        for (const e of elements || []) {
            for (const text of [e.label, e.technology, e.description]) { if (text) { strings.add(text); } }
            walk(e.children as typeof elements);
        }
    };
    for (const item of baseline.items.filter(i => i.format === 'c4x')) {
        try { walk(parser.parse(item.source).elements); } catch { /* no text */ }
    }
    return [...strings];
}

describe('Text layout host/client parity (#340)', () => {
    it('the client script embeds every text-layout function verbatim and the host width tables', () => {
        for (const fn of [...TEXT_LAYOUT_CLIENT_FUNCTIONS, ...DEPLOYMENT_NOTATION_CLIENT_FUNCTIONS]) {
            assert.ok(PREVIEW_CLIENT_SCRIPT.includes(embedded(fn)), `client script lacks ${fn.name}`);
        }
        assert.ok(PREVIEW_CLIENT_SCRIPT.includes(`const C4X_TEXT_METRICS = ${JSON.stringify(TEXT_METRICS)};`));
    });

    it('wraps a corpus of strings identically in every font, shape and size', () => {
        const client = clientRealm();
        const strings = corpusStrings();
        assert.ok(strings.length > 300, `${strings.length} strings`);
        const fonts = [ClassicTheme, MutedTheme, LightTheme].map(t => t.styles.fontFamily).concat('Helvetica, Arial, sans-serif');
        const shapes = [
            { width: 200, height: 160, iconLayout: true, cylinder: false },
            { width: 240, height: 130, iconLayout: false, cylinder: false },
            { width: 220, height: 120, iconLayout: false, cylinder: true },
            { width: 260, height: 140, iconLayout: true, cylinder: true },
            { width: 90, height: 60, iconLayout: false, cylinder: false },
            // Deployment notation label rows (#326), with and without an icon slot.
            { width: 300, height: 200, iconLayout: false, cylinder: false, labelRow: { iconSlot: 40 } },
            { width: 160, height: 90, iconLayout: false, cylinder: false, labelRow: { iconSlot: 0 } },
            { width: 220, height: 120, iconLayout: false, cylinder: false, labelRow: { iconSlot: 40, maxLines: 2 } },
        ];
        let compared = 0;
        let wrapped = 0;
        strings.forEach((text, i) => {
            const fontFamily = fonts[i % fonts.length];
            for (const shape of shapes) {
                const input: ElementTextInput = {
                    x: 13.5, y: 21.25, ...shape, fontFamily,
                    label: strings[(i + 1) % strings.length] || 'Label', technology: i % 3 === 0 ? text : undefined, description: text,
                    typeLabel: i % 2 === 0 ? ['Person', 'Software System', 'Container', 'Component', 'Deployment Node'][i % 5] : undefined,
                };
                const host = layoutElementText(input, TEXT_METRICS);
                const fromClient = client.layoutElementText(input, client.metrics as typeof TEXT_METRICS);
                assert.deepStrictEqual(json(fromClient), json(host), `layout differs for ${JSON.stringify(text.slice(0, 40))}`);
                assert.strictEqual(client.elementTextMarkup(fromClient, '#123456', fontFamily), elementTextMarkup(host, '#123456', fontFamily));
                compared++;
                if (host.wrapped) { wrapped++; }
            }
        });
        assert.ok(wrapped > 100, `only ${wrapped} of ${compared} layouts wrapped`);
    });

    it('the markup the client inserts for each IBS node is the text the host rendered', () => {
        const client = clientRealm();
        const dir = path.join(__dirname, '..', 'snapshots', 'fixtures', 'ibs');
        let checked = 0;
        for (const theme of [ClassicTheme, C4ModelTheme]) {
            const files = readdirSync(dir).filter(f => f.endsWith('.c4x')).map(f => path.join(dir, f));
            // The deployment notation fixture (#326): label rows, icon slots, infrastructure nodes.
            files.push(path.join(__dirname, '..', 'snapshots', 'fixtures', 'deployment-aws.c4x'));
            for (const filePath of files) {
                const file = path.basename(filePath);
                const view = new C4ModelBuilder().build(new C4XParser().parse(readFileSync(filePath, 'utf8')), file).views[0];
                // Mark the fixture's Route 53 and load balancer as infrastructure nodes (#326; no
                // source spelling sets the mark yet), so the icon-below text box is compared too.
                const mark = (list: typeof view.elements): void => list.forEach(e => {
                    if (file === 'deployment-aws.c4x' && (e.id === 'dns' || e.id === 'lb')) { e.nodeKind = 'infrastructure'; }
                    mark(e.children ?? []);
                });
                mark(view.elements);
                const layout = new DagreLayoutEngine(() => undefined).layoutSync(view, { theme });
                const svg = new SvgBuilder().build(layout, { theme, view });
                for (const node of layout.elements) {
                    const style = resolveElementStyle(node.element, theme, { rules: view.elementStyles ?? [], accentSlots: {} }, { isKnownSprite: isBundledSpriteId });
                    // What the webview reads: node snapshot geometry, the drawn text's fill and font, the node's classes.
                    const fill = /<text data-field="label" [^>]*fill="([^"]+)"/.exec(svg.slice(svg.indexOf(`data-id="${node.id}"`)))![1];
                    // Deployment notation (#326): the node's data-label-row / data-icon-slot / data-icon-below.
                    const group = new RegExp(`<g class="node[^"]*" data-id="${node.id}"[^>]*>`).exec(svg)![0];
                    const slot = /data-label-row="bottom-left" data-icon-slot="(\d+)" data-label-lines="(\d+)"/.exec(group);
                    const iconBelow = group.includes('data-icon-below="true"');
                    const markup = client.elementTextMarkup(client.layoutElementText({
                        x: node.x, y: node.y, width: node.width, height: node.height,
                        textBox: ['person', 'bucket', 'folder', 'webBrowser', 'terminal'].includes(style.outline)
                            ? shapeTextBox(style.outline, node.x, node.y, node.width, node.height)
                            : iconBelow ? client.infrastructureTextBox(node.x, node.y, node.width, node.height) : undefined,
                        labelRow: slot ? { iconSlot: Number(slot[1]), maxLines: Number(slot[2]) } : undefined,
                        iconLayout: !slot && !iconBelow && !!(style.iconLayout && style.icon), cylinder: !slot && !iconBelow && style.outline === 'cylinder',
                        fontFamily: theme.styles.fontFamily,
                        label: node.element.label, technology: node.element.technology, description: node.element.description,
                        // The webview reads the node's data-type-label, which the host writes when the theme shows the type (#348).
                        typeLabel: new RegExp(`data-id="${node.id}"[^>]*data-type-label="([^"]+)"`).exec(svg)?.[1],
                    }, client.metrics as typeof TEXT_METRICS), fill, theme.styles.fontFamily);
                    assert.ok(svg.includes(markup), `${file} ${node.id}: client markup not in the host SVG`);
                    checked++;
                }
            }
        }
        assert.ok(checked > 50);
    });
});
