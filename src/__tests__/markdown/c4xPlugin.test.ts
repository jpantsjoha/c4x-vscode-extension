/**
 * Markdown preview scaling tests (#124, #128): c4x fenced blocks must carry
 * an inline max-width derived from the layout's intrinsic width so the SVG
 * (width: 100% in the contributed stylesheets) scales down to fit narrow
 * preview columns without ever being upscaled beyond the cap. The cap is
 * multiplied by the c4x.markdown.previewScale setting (default 0.5) in the
 * VS Code Markdown preview; exporters opt out so exported diagrams keep
 * their intrinsic size.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module');
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request: string, ...args: unknown[]) {
    if (request === 'vscode') {
        return require.resolve('../__mocks__/vscode');
    }
    return originalResolveFilename.call(this, request, ...args);
};

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import MarkdownIt from 'markdown-it';
import {
    c4xPlugin,
    C4xPluginOptions,
    PREVIEW_SCALE_DEFAULT,
    PREVIEW_SCALE_MIN,
    PREVIEW_SCALE_MAX,
} from '../../markdown/c4xPlugin';
import { c4xParser } from '../../parser/C4XParser';
import { c4ModelBuilder } from '../../model/C4ModelBuilder';
import { dagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { setMarkdownPreviewScaleForTests } from '../__mocks__/vscode';

const DSL = `%%{ c4: system-context }%%
graph TB
user[User<br/>Person]
app[Application<br/>Software System]
user -->|Uses| app
`;

function renderBlock(markdown: string, options?: C4xPluginOptions): string {
    const md = new MarkdownIt();
    md.use(c4xPlugin, options);
    return md.render(markdown);
}

/** Extracts the style attribute of the first .c4x-diagram wrapper. */
function wrapperStyle(html: string): string {
    const match = html.match(/<div class="c4x-diagram[^"]*" style="([^"]*)"/);
    assert.ok(match, 'Expected a .c4x-diagram wrapper with a style attribute');
    return match[1];
}

/** Intrinsic layout width for the shared fixture. */
function intrinsicWidth(): number {
    const parseResult = c4xParser.parse(DSL);
    const model = c4ModelBuilder.build(parseResult, 'markdown-scaling-test');
    return dagreLayoutEngine.layoutSync(model.views[0]).width;
}

describe('C4X Markdown Plugin — diagram scaling (#124, #128)', () => {
    beforeEach(() => {
        setMarkdownPreviewScaleForTests(undefined);
    });

    it('caps the wrapper at half the intrinsic width by default', () => {
        const width = intrinsicWidth();
        const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);

        assert.ok(
            wrapperStyle(html).includes(`max-width: ${Math.round(width * 0.5)}px`),
            `Expected wrapper style to include max-width: ${Math.round(width * 0.5)}px, got: ${wrapperStyle(html)}`,
        );
    });

    it('scales the cap by an explicit c4x.markdown.previewScale value', () => {
        const width = intrinsicWidth();
        setMarkdownPreviewScaleForTests(0.25);
        const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);

        assert.ok(
            wrapperStyle(html).includes(`max-width: ${Math.round(width * 0.25)}px`),
            `Expected wrapper style to include max-width: ${Math.round(width * 0.25)}px, got: ${wrapperStyle(html)}`,
        );
    });

    it('uses the full intrinsic width when the setting is 1.0', () => {
        const width = intrinsicWidth();
        setMarkdownPreviewScaleForTests(1.0);
        const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);

        assert.ok(
            wrapperStyle(html).includes(`max-width: ${Math.round(width)}px`),
            `Expected wrapper style to include max-width: ${Math.round(width)}px, got: ${wrapperStyle(html)}`,
        );
        // With scale 1.0 the cap again matches the width emitted on the SVG element.
        const svgWidth = html.match(/<svg[^>]*\swidth="([^"]+)"/);
        assert.ok(svgWidth, 'Expected an SVG width attribute');
        assert.strictEqual(Number(svgWidth[1]), width);
    });

    it('falls back to the default for out-of-range setting values', () => {
        const width = intrinsicWidth();
        for (const bad of [2.0, 0.1, 0, -0.5]) {
            setMarkdownPreviewScaleForTests(bad);
            const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);
            assert.ok(
                wrapperStyle(html).includes(`max-width: ${Math.round(width * 0.5)}px`),
                `Setting ${bad} should fall back to the default cap, got: ${wrapperStyle(html)}`,
            );
        }
    });

    it('falls back to the default for non-numeric setting values', () => {
        const width = intrinsicWidth();
        for (const bad of ['wide', NaN, null]) {
            setMarkdownPreviewScaleForTests(bad);
            const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);
            assert.ok(
                wrapperStyle(html).includes(`max-width: ${Math.round(width * 0.5)}px`),
                `Setting ${String(bad)} should fall back to the default cap, got: ${wrapperStyle(html)}`,
            );
        }
    });

    it('applies an explicit width= attribute alongside the scaled max-width cap', () => {
        const width = intrinsicWidth();
        const html = renderBlock(`\`\`\`c4x width=70%\n${DSL}\n\`\`\``);
        const style = wrapperStyle(html);

        assert.ok(style.includes('width: 70%;'), `Expected width: 70% in wrapper style, got: ${style}`);
        assert.ok(
            style.includes(`max-width: ${Math.round(width * 0.5)}px`),
            `Expected scaled max-width cap in wrapper style, got: ${style}`,
        );
    });

    it('applies an explicit height= attribute alongside the scaled max-width cap', () => {
        const html = renderBlock(`\`\`\`c4x height=300px\n${DSL}\n\`\`\``);
        const style = wrapperStyle(html);

        assert.ok(style.includes('height: 300px;'), `Expected height: 300px in wrapper style, got: ${style}`);
        assert.ok(/max-width: [\d.]+px/.test(style), `Expected max-width cap in wrapper style, got: ${style}`);
    });

    it('keeps the intrinsic width cap on the export path (applyPreviewScale: false)', () => {
        const width = intrinsicWidth();
        setMarkdownPreviewScaleForTests(0.25);
        const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``, { applyPreviewScale: false });

        assert.ok(
            wrapperStyle(html).includes(`max-width: ${Math.round(width)}px`),
            `Export path must ignore previewScale, got: ${wrapperStyle(html)}`,
        );
    });

    it('strips the XML declaration from the plugin output', () => {
        const html = renderBlock(`\`\`\`c4x\n${DSL}\n\`\`\``);

        assert.ok(!html.includes('<?xml'), 'XML declaration must not appear inside the HTML document');
        assert.ok(html.includes('<svg'), 'Expected SVG output');
    });

    it('still renders errors without a wrapper style attribute', () => {
        const html = renderBlock('```c4x\ninvalid syntax here\n```');

        assert.ok(html.includes('class="c4x-error"'));
        assert.ok(!html.includes('max-width:'), 'Error output should not carry the scaling style');
    });
});

describe('C4X Markdown Plugin — previewScale manifest drift pin (#128)', () => {
    it('package.json bounds and default match the code constants', () => {
        const manifestPath = path.resolve(__dirname, '../../..', 'package.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const setting = manifest.contributes.configuration.properties['c4x.markdown.previewScale'];

        assert.ok(setting, 'c4x.markdown.previewScale must be registered in package.json');
        assert.strictEqual(setting.type, 'number');
        assert.strictEqual(setting.default, PREVIEW_SCALE_DEFAULT);
        assert.strictEqual(setting.minimum, PREVIEW_SCALE_MIN);
        assert.strictEqual(setting.maximum, PREVIEW_SCALE_MAX);
    });
});
