/**
 * With `c4x.export.includeKey` off (the default), every export path writes
 * exactly what it wrote before #327 (review round 1, P2e).
 *
 * The goldens in golden-off/ were written by this file run against
 * origin/main before the key existed (e3761a6, `UPDATE_EXPORT_GOLDENS=1`).
 * It uses only APIs that existed there, so the same file proves the branch's
 * off path is byte-identical: Export SVG (the file written), Copy SVG (the
 * clipboard text), Export PNG (the SVG handed to the rasteriser, before
 * rasterisation), Export Markdown to HTML (the document written), the PDF
 * print document, and the Markdown preview markup.
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
import { PreviewPanel } from '../../webview/PreviewPanel';
import { exportSvgCommand } from '../../commands/exportSvg';
import { copySvgCommand } from '../../commands/copySvg';
import { exportPngCommand } from '../../commands/exportPng';
import { PngExporter } from '../../export/PngExporter';
import { HtmlExporter } from '../../export/HtmlExporter';
import { PdfExporter } from '../../export/PdfExporter';
import { c4xPlugin } from '../../markdown/c4xPlugin';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { C4ModelTheme } from '../../themes/C4ModelTheme';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = vscodeMock as any;
const GOLDEN = path.join(__dirname, 'golden-off');

const C4X = [
    '%%{ c4: container }%%',
    'graph TB',
    'Person(u, "Customer")',
    'System_Boundary(shop, "Shop") {',
    '    Container(f, "Static Content", "Directory", $shape="Folder")',
    '    Container(w, "UI", "Angular", $shape="WebBrowser")',
    '}',
    'System_Ext(pay, "Payments", $tags="Payments")',
    'u -->|Uses| w',
    'f -->|Delivers| w',
    'w ==>|Pays with| pay',
].join('\n');
const MARKDOWN = ['# Shop', '', '```c4x', C4X, '```', ''].join('\n');

/** Compare with the golden byte for byte, or write it under UPDATE_EXPORT_GOLDENS=1. */
function matchGolden(name: string, actual: string | Uint8Array): void {
    const file = path.join(GOLDEN, name);
    const bytes = Buffer.from(actual as any);
    if (process.env.UPDATE_EXPORT_GOLDENS) {
        fs.mkdirSync(GOLDEN, { recursive: true });
        fs.writeFileSync(file, bytes);
        return;
    }
    assert.ok(fs.existsSync(file), `golden missing: ${file}`);
    assert.ok(bytes.equals(fs.readFileSync(file)), `${name} differs from the pre-#327 output`);
}

describe('exports with c4x.export.includeKey off are byte-identical to before #327 (golden)', () => {
    const saved: Record<string, any> = {};
    let written: Uint8Array[];
    let clipboard: string[];

    beforeEach(() => {
        written = [];
        clipboard = [];
        for (const key of ['showSaveDialog', 'showErrorMessage', 'showInformationMessage', 'activeTextEditor']) {
            saved[key] = mock.window[key];
        }
        saved.fs = mock.workspace.fs;
        saved.env = mock.env;
        mock.workspace.fs = {
            ...saved.fs,
            readFile: async () => Buffer.from(MARKDOWN, 'utf8'),
            writeFile: async (_uri: unknown, bytes: Uint8Array) => { written.push(bytes); },
        };
        mock.env = { clipboard: { writeText: async (text: string) => { clipboard.push(text); } }, openExternal: async () => true };
        mock.window.showErrorMessage = () => undefined;
        mock.window.showInformationMessage = async () => undefined;
        mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shop.out' });
        const view = new C4ModelBuilder().build(new C4XParser().parse(C4X), 'golden').views[0];
        const layout = new DagreLayoutEngine().layoutSync(view, { theme: C4ModelTheme });
        const svg = new SvgBuilder().build(layout, { theme: C4ModelTheme, view });
        // A panel as a render leaves it (fields the current code reads; older code ignores the extra one).
        (PreviewPanel as any).instance = { currentSvg: svg, currentExportSvg: svg, currentExportInputs: { layout, theme: C4ModelTheme, view } };
    });

    afterEach(() => {
        for (const key of Object.keys(saved)) {
            if (key === 'fs') { mock.workspace.fs = saved.fs; } else if (key === 'env') { mock.env = saved.env; } else { mock.window[key] = saved[key]; }
        }
        (PreviewPanel as any).instance = undefined;
    });

    it('Export SVG writes the same bytes', async () => {
        await exportSvgCommand();
        assert.strictEqual(written.length, 1);
        matchGolden('export.svg', written[0]);
    });

    it('Copy SVG copies the same text', async () => {
        await copySvgCommand();
        assert.strictEqual(clipboard.length, 1);
        matchGolden('copy.svg', clipboard[0]);
    });

    it('Export PNG hands the rasteriser the same SVG', async () => {
        const drawn: string[] = [];
        const savedExport = PngExporter.prototype.export;
        PngExporter.prototype.export = async function (svg: string) { drawn.push(svg); };
        mock.window.activeTextEditor = { document: { languageId: 'c4x', fileName: '/docs/shop.c4x' } };
        try {
            await exportPngCommand();
        } finally {
            PngExporter.prototype.export = savedExport;
        }
        assert.strictEqual(drawn.length, 1);
        matchGolden('png-input.svg', drawn[0]);
    });

    it('Export Markdown to HTML writes the same document', async () => {
        await new HtmlExporter().export({ fsPath: '/docs/shop.md' } as any);
        assert.strictEqual(written.length, 1);
        matchGolden('export.html', written[0]);
    });

    it('the PDF print document is the same', async () => {
        await new PdfExporter().export({ fsPath: '/docs/shop.md' } as any);
        assert.strictEqual(written.length, 1);
        matchGolden('print.html', written[0]);
    });

    it('the Markdown preview markup is the same', () => {
        matchGolden('preview.html', c4xPlugin(new MarkdownIt()).render(MARKDOWN));
    });
});
