/**
 * `c4x.export.includeKey` in every export path (#327, notation decision #320, Decision 6).
 *
 * Export SVG, Export PNG and Copy SVG take the preview's export SVG
 * (`PreviewPanel.getCurrentExportSvg`); HTML, PDF and the Markdown preview
 * render through the c4x Markdown plugin. With the setting on each carries the
 * key below the diagram; off, each is byte-identical to the output without
 * the setting.
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
import * as vscodeMock from '../__mocks__/vscode';
import { setConfigurationValueForTests } from '../__mocks__/vscode';
import { PreviewPanel } from '../../webview/PreviewPanel';
import { exportSvgCommand } from '../../commands/exportSvg';
import { copySvgCommand } from '../../commands/copySvg';
import { exportPngCommand } from '../../commands/exportPng';
import { PngExporter } from '../../export/PngExporter';
import { HtmlExporter } from '../../export/HtmlExporter';
import { PdfExporter } from '../../export/PdfExporter';
import { c4xPlugin } from '../../markdown/c4xPlugin';
import { readExportIncludeKey } from '../../render/KeyRenderer';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { C4ModelTheme } from '../../themes/C4ModelTheme';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = vscodeMock as any;

const C4X = [
    '%%{ c4: container }%%',
    'graph TB',
    'Person(u, "Customer")',
    'Container(f, "Static Content", "Directory", $shape="Folder")',
    'Container(w, "UI", "Angular", $shape="WebBrowser")',
    'u -->|Uses| w',
    'f -->|Delivers| w',
].join('\n');
const MARKDOWN = ['# Shop', '', '```c4x', C4X, '```', ''].join('\n');
const KEY = '<g class="diagram-key"';

describe('c4x.export.includeKey in every export path (#327)', () => {
    const saved: Record<string, any> = {};
    let written: Array<{ uri: { fsPath: string }; bytes: Uint8Array }>;
    let clipboard: string[];

    beforeEach(() => {
        written = [];
        clipboard = [];
        for (const key of ['showSaveDialog', 'showErrorMessage', 'showInformationMessage']) {
            saved[key] = mock.window[key];
        }
        saved.fs = mock.workspace.fs;
        saved.env = mock.env;
        mock.workspace.fs = {
            ...saved.fs,
            readFile: async () => Buffer.from(MARKDOWN, 'utf8'),
            writeFile: async (uri: { fsPath: string }, bytes: Uint8Array) => { written.push({ uri, bytes }); },
        };
        mock.env = { clipboard: { writeText: async (text: string) => { clipboard.push(text); } }, openExternal: async () => true };
        mock.window.showErrorMessage = () => undefined;
        mock.window.showInformationMessage = async () => undefined;
    });

    afterEach(() => {
        for (const key of ['showSaveDialog', 'showErrorMessage', 'showInformationMessage']) {
            mock.window[key] = saved[key];
        }
        mock.workspace.fs = saved.fs;
        mock.env = saved.env;
        setConfigurationValueForTests('export.includeKey', undefined);
        (PreviewPanel as any).instance = undefined;
    });

    it('defaults to false and is contributed as a boolean defaulting to false', () => {
        assert.strictEqual(readExportIncludeKey(), false);
        const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'package.json'), 'utf8'));
        const setting = manifest.contributes.configuration.properties['c4x.export.includeKey'];
        assert.strictEqual(setting.type, 'boolean');
        assert.strictEqual(setting.default, false);
    });

    /** A preview panel holding a rendered export SVG, as a render leaves it. */
    function previewWithExport(): string {
        const view = new C4ModelBuilder().build(new C4XParser().parse(C4X), 'key').views[0];
        const layout = new DagreLayoutEngine().layoutSync(view, { theme: C4ModelTheme });
        const exportSvg = new SvgBuilder().build(layout, { theme: C4ModelTheme, view });
        (PreviewPanel as any).instance = {
            currentSvg: exportSvg,
            currentExportSvg: exportSvg,
            currentExportInputs: { layout, theme: C4ModelTheme, view },
        };
        return exportSvg;
    }

    it('preview export SVG: off returns the rendered SVG unchanged, on adds the key', () => {
        const plain = previewWithExport();
        assert.strictEqual(PreviewPanel.getCurrentExportSvg(), plain);
        setConfigurationValueForTests('export.includeKey', true);
        const keyed = PreviewPanel.getCurrentExportSvg()!;
        assert.ok(keyed.includes(KEY));
        assert.ok(keyed.includes('<title>Container, Folder</title>'));
        setConfigurationValueForTests('export.includeKey', false);
        assert.strictEqual(PreviewPanel.getCurrentExportSvg(), plain, 'turning it off applies to the next export');
    });

    it('Export SVG writes the key only when the setting is on', async () => {
        const plain = previewWithExport();
        mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shop.svg' });
        await exportSvgCommand();
        setConfigurationValueForTests('export.includeKey', true);
        await exportSvgCommand();
        assert.strictEqual(written.length, 2);
        const [off, on] = written.map(w => Buffer.from(w.bytes).toString('utf8'));
        assert.ok(!off.includes(KEY) && off.includes(plain.slice(plain.indexOf('<svg'), plain.indexOf('<svg') + 40)));
        assert.ok(on.includes(KEY));
    });

    it('Copy SVG copies the key only when the setting is on', async () => {
        const plain = previewWithExport();
        await copySvgCommand();
        setConfigurationValueForTests('export.includeKey', true);
        await copySvgCommand();
        assert.strictEqual(clipboard.length, 2);
        assert.strictEqual(clipboard[0], plain.trim());
        assert.ok(clipboard[1].includes(KEY));
    });

    it('Export PNG draws from the SVG with the key only when the setting is on', async () => {
        const plain = previewWithExport();
        const drawn: string[] = [];
        const savedExport = PngExporter.prototype.export;
        const savedEditor = mock.window.activeTextEditor;
        PngExporter.prototype.export = async function (svg: string) { drawn.push(svg); };
        mock.window.activeTextEditor = { document: { languageId: 'c4x', fileName: '/docs/shop.c4x' } };
        try {
            await exportPngCommand();
            setConfigurationValueForTests('export.includeKey', true);
            await exportPngCommand();
        } finally {
            PngExporter.prototype.export = savedExport;
            mock.window.activeTextEditor = savedEditor;
        }
        assert.strictEqual(drawn.length, 2);
        assert.strictEqual(drawn[0], plain);
        assert.ok(drawn[1].includes(KEY));
    });

    it('Markdown preview: off is byte-identical, on draws the key', () => {
        const render = () => c4xPlugin(new MarkdownIt()).render(MARKDOWN);
        const off = render();
        assert.ok(!off.includes(KEY));
        setConfigurationValueForTests('export.includeKey', false);
        assert.strictEqual(render(), off);
        setConfigurationValueForTests('export.includeKey', true);
        const on = render();
        assert.ok(on.includes(KEY));
        assert.ok(!on.includes('<script'), 'labels are escaped');
    });

    it('HTML export carries the key when on and not when off', async () => {
        mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shop.html' });
        await new HtmlExporter().export({ fsPath: '/docs/shop.md' } as any);
        setConfigurationValueForTests('export.includeKey', true);
        await new HtmlExporter().export({ fsPath: '/docs/shop.md' } as any);
        const [off, on] = written.map(w => Buffer.from(w.bytes).toString('utf8'));
        assert.ok(!off.includes(KEY));
        assert.ok(on.includes(KEY));
    });

    it('PDF print document carries the key when on and not when off', async () => {
        await new PdfExporter().export({ fsPath: '/docs/shop.md' } as any);
        setConfigurationValueForTests('export.includeKey', true);
        await new PdfExporter().export({ fsPath: '/docs/shop.md' } as any);
        const [off, on] = written.map(w => Buffer.from(w.bytes).toString('utf8'));
        assert.ok(!off.includes(KEY));
        assert.ok(on.includes(KEY));
    });
});
