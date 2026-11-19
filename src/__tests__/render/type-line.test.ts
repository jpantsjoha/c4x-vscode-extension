import * as assert from 'assert';

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
import { DagreLayoutEngine, type LayoutResult } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { elementTypeLabel, layoutElementText, measureTextPx, textMetricVariant, TEXT_METRICS, type ElementTextInput } from '../../render/textLayout';
import type { C4Theme } from '../../themes/Theme';
import { C4ModelTheme, C4ModelDarkTheme } from '../../themes/C4ModelTheme';
import { ClassicTheme } from '../../themes/ClassicTheme';

/**
 * The element type line (#348): `[Type]` or `[Type: technology]` under the name,
 * drawn by the same measuring and wrapping as the technology line it replaces.
 */

const SOURCE = `
Person(user, "Customer", "A bank customer")
System(bank, "Internet Banking", "Lets customers see accounts")
System_Ext(mail, "E-mail System", "Sends e-mail")
Container(web, "Web Application", "Java and Spring MVC", "Delivers the static content")
ContainerDb(db, "Database", "Oracle Database Schema", "Stores account data")
Container_Ext(legacy, "Legacy", "COBOL")
Component(ctl, "Sign In Controller", "Spring MVC Rest Controller", "Allows users to sign in")
Node(dn, "Big Bank plc", "Ubuntu 16.04 LTS", "Hosts the application")
`;

function laidOut(source: string, theme: C4Theme, growText = true): { layout: LayoutResult; svg: string } {
    const view = new C4ModelBuilder().build(new C4XParser().parse(source), 't').views[0];
    const layout = new DagreLayoutEngine(() => undefined).layoutSync(view, { theme, growText });
    return { layout, svg: new SvgBuilder().build(layout, { theme, view }) };
}

function techLine(svg: string, id: string): string {
    const group = svg.slice(svg.indexOf(`data-id="${id}"`));
    const line = /<text data-field="technology"[^>]*>(.*?)<\/text>/s.exec(group.slice(0, group.indexOf('</g>', group.indexOf('<text'))));
    return line ? line[1].replace(/<\/tspan><tspan[^>]*>/g, ' ').replace(/<[^>]+>/g, '') : '';
}

describe('Element type line (#348)', () => {
    it('names the five C4 types', () => {
        assert.deepStrictEqual(
            ['Person', 'SoftwareSystem', 'Container', 'Component', 'DeploymentNode', 'Other'].map(elementTypeLabel),
            ['Person', 'Software System', 'Container', 'Component', 'Deployment Node', undefined],
        );
    });

    it('prints [Type] or [Type: technology] for every kind under c4-model, externals as their type', () => {
        const { svg } = laidOut(SOURCE, C4ModelTheme);
        assert.strictEqual(techLine(svg, 'user'), '[Person]');
        assert.strictEqual(techLine(svg, 'bank'), '[Software System]');
        assert.strictEqual(techLine(svg, 'mail'), '[Software System]');
        assert.strictEqual(techLine(svg, 'web'), '[Container: Java and Spring MVC]');
        assert.strictEqual(techLine(svg, 'db'), '[Container: Oracle Database Schema]');
        assert.strictEqual(techLine(svg, 'legacy'), '[Container: COBOL]');
        assert.strictEqual(techLine(svg, 'ctl'), '[Component: Spring MVC Rest Controller]');
        assert.strictEqual(techLine(svg, 'dn'), '[Deployment Node: Ubuntu 16.04 LTS]');
    });

    it('prints it in the dark variant too', () => {
        assert.strictEqual(techLine(laidOut(SOURCE, C4ModelDarkTheme).svg, 'web'), '[Container: Java and Spring MVC]');
    });

    it('leaves a theme without the token byte-identical to the bare technology line', () => {
        const { svg } = laidOut(SOURCE, ClassicTheme);
        assert.strictEqual(techLine(svg, 'web'), '[Java and Spring MVC]');
        assert.strictEqual(techLine(svg, 'bank'), '');
        assert.ok(!svg.includes('data-type-label'));
        assert.ok(!svg.includes('[Container'));
    });

    it('marks each node with its type for the webview only when the theme shows it', () => {
        const { svg } = laidOut(SOURCE, C4ModelTheme);
        assert.ok(/data-id="web"[^>]*data-type-label="Container"/.test(svg));
        assert.ok(/data-id="user"[^>]*data-type-label="Person"/.test(svg));
    });

    it('wraps a long type line with the shared wrapping, inside the inner width, and grows the box', () => {
        const tech = 'Spring MVC Rest Controller with a very long technology description that runs on and on and on';
        const desc = 'A description that is long enough to need several wrapped lines inside the box so that growth is required here';
        const src = `Component(c, "Controller", "${tech}", "${desc}")`;
        const plain = laidOut(src, C4ModelTheme, false).layout.elements[0];
        const grown = laidOut(src, C4ModelTheme).layout.elements[0];
        assert.ok(grown.height > plain.height, `${grown.height} > ${plain.height}`);
        const input: ElementTextInput = {
            x: grown.x, y: grown.y, width: grown.width, height: grown.height, iconLayout: false, cylinder: false,
            fontFamily: C4ModelTheme.styles.fontFamily, label: 'Controller', technology: tech, typeLabel: 'Component', description: desc,
        };
        const block = layoutElementText(input, TEXT_METRICS).blocks.find(b => b.field === 'technology')!;
        assert.ok(block.wrapped && block.lines.length >= 2);
        assert.ok(block.lines[0].startsWith('[Component: '));
        const variant = textMetricVariant(input.fontFamily, false, true);
        for (const line of block.lines) {
            assert.ok(measureTextPx(line, 12, variant, TEXT_METRICS) <= grown.width - 16, line);
        }
        // Every line, including the type line, sits inside the grown box.
        const last = layoutElementText(input, TEXT_METRICS).blocks.slice(-1)[0];
        assert.ok(last.ys[last.ys.length - 1] <= grown.y + grown.height);
    });

    it('draws text it cannot measure exactly as before, with the type in front', () => {
        const input: ElementTextInput = {
            x: 0, y: 0, width: 240, height: 130, iconLayout: false, cylinder: false,
            fontFamily: 'Arial, sans-serif', label: 'X', technology: '日本語のテクノロジー'.repeat(6), typeLabel: 'Container',
        };
        const block = layoutElementText(input, TEXT_METRICS).blocks.find(b => b.field === 'technology')!;
        assert.strictEqual(block.wrapped, false);
        assert.strictEqual(block.lines[0], '[Container: ' + input.technology + ']');
    });

    it('does not move any node in a diagram with saved geometry', () => {
        const saved = SOURCE.replace('Container(web, "Web Application", "Java and Spring MVC", "Delivers the static content")',
            'Container(web, "Web Application", "Java and Spring MVC and a long description of the technology stack in use here", "Delivers the static content", $x="400", $y="300")');
        const withType = laidOut(saved, C4ModelTheme).layout;
        const withoutType = laidOut(saved, { ...C4ModelTheme, showElementType: false }).layout;
        const box = (l: LayoutResult) => l.elements.map(e => [e.id, e.x, e.y, e.width, e.height]);
        assert.deepStrictEqual(box(withType), box(withoutType));
    });

    it('leaves a short type line at the standard box size', () => {
        const withType = laidOut(SOURCE, C4ModelTheme).layout.elements.map(e => [e.id, e.width, e.height]);
        const withoutType = laidOut(SOURCE, { ...C4ModelTheme, showElementType: false }).layout.elements.map(e => [e.id, e.width, e.height]);
        assert.deepStrictEqual(withType, withoutType);
    });
});
