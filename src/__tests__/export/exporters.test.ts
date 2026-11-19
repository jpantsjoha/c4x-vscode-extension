/**
 * PNG, HTML and PDF export (#286).
 *
 * The README advertises PNG export at 1x, 2x and 4x, a standalone HTML export
 * and a PDF path. Each exporter is driven here through its public `export()`
 * entry point against the unit-test vscode mock, so the command's real flow
 * runs: the pickers, the off-screen render, the file write.
 *
 * PNG: the exporter renders in an off-screen webview whose script draws the
 * SVG on a canvas. That script is executed here in a Node `vm` context with a
 * minimal DOM (DOMParser, Image, Blob, URL, canvas), so the canvas size it
 * computes is asserted exactly. A change that ignored the chosen scale factor
 * would produce the same canvas at 1x, 2x and 4x and fail.
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
import * as vm from 'vm';
import { readFileSync } from 'fs';
import * as path from 'path';
import * as vscodeMock from '../__mocks__/vscode';
import { PngExporter, RESOLUTION_OPTIONS } from '../../export/PngExporter';
import { HtmlExporter } from '../../export/HtmlExporter';
import { PdfExporter } from '../../export/PdfExporter';
import { SvgExporter } from '../../export/SvgExporter';
import { C4XParser } from '../../parser/C4XParser';
import { C4ModelBuilder } from '../../model/C4ModelBuilder';
import { DagreLayoutEngine } from '../../layout/DagreLayoutEngine';
import { SvgBuilder } from '../../render/SvgBuilder';
import { themeManager } from '../../themes/ThemeManager';
import { C4ModelTheme } from '../../themes/C4ModelTheme';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mock = vscodeMock as any;

const MARKDOWN = [
    '# Shop',
    '',
    'Context view:',
    '',
    '```c4x',
    '%%{ c4: system-context }%%',
    'graph TB',
    'user[Customer<br/>Person]',
    'shop[Shop<br/>Software System]',
    'user -->|Buys from| shop',
    '```',
    '',
].join('\n');

interface Written { uri: { fsPath: string }; bytes: Uint8Array }

/** One canvas the webview script created: its size and what was drawn on it. */
interface FakeCanvas { width: number; height: number; drawn: Array<[number, number, number, number]> }

/**
 * Run the off-screen export page's inline script with a minimal DOM and
 * return the canvas it drew on and the message it posted back.
 */
function runExportPage(html: string): { canvas: FakeCanvas | undefined; message: any; blobs: string[] } {
    const match = html.match(/<script nonce="[^"]+">([\s\S]*?)<\/script>/);
    assert.ok(match, 'the export page carries one inline script');
    let posted: any;
    let canvas: FakeCanvas | undefined;
    const blobs: string[] = [];
    const svgAttributes = (markup: string) => (name: string): string | null => {
        const root = markup.match(/<svg\b[^>]*>/);
        if (!root) { return null; }
        const attr = root[0].match(new RegExp(`\\s${name}="([^"]*)"`));
        return attr ? attr[1] : null;
    };
    const context = {
        acquireVsCodeApi: () => ({ postMessage: (message: unknown) => { posted = message; } }),
        DOMParser: class {
            parseFromString(markup: string) {
                return { documentElement: { getAttribute: svgAttributes(markup) } };
            }
        },
        Blob: class { constructor(public parts: unknown[], public options: unknown) { blobs.push(parts.join('')); } },
        URL: { createObjectURL: () => 'blob:export', revokeObjectURL: () => undefined },
        Image: class {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_value: string) { this.onload?.(); }
        },
        document: {
            createElement: (tag: string) => {
                assert.strictEqual(tag, 'canvas');
                const created: FakeCanvas & Record<string, unknown> = {
                    width: 0,
                    height: 0,
                    drawn: [],
                    getContext: () => ({
                        fillStyle: '',
                        fillRect: () => undefined,
                        drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => {
                            created.drawn.push([x, y, w, h]);
                        },
                    }),
                    toDataURL: () => `data:image/png;base64,${Buffer.from(`png ${created.width}x${created.height}`).toString('base64')}`,
                };
                canvas = created;
                return created;
            },
        },
    };
    vm.runInNewContext(match[1], context, { timeout: 2000 });
    return { canvas, message: posted, blobs };
}

describe('export: PNG, HTML and PDF (#286)', () => {
    const saved: Record<string, any> = {};
    let written: Written[];
    let opened: unknown[];
    let errors: string[];

    let markdown = MARKDOWN;

    beforeEach(() => {
        markdown = MARKDOWN;
        written = [];
        opened = [];
        errors = [];
        for (const key of ['showQuickPick', 'showSaveDialog', 'createWebviewPanel', 'showErrorMessage', 'showInformationMessage']) {
            saved[`window.${key}`] = mock.window[key];
        }
        saved['workspace.fs'] = mock.workspace.fs;
        saved.env = mock.env;
        saved.ViewColumn = mock.ViewColumn;
        mock.workspace.fs = {
            ...saved['workspace.fs'],
            readFile: async () => Buffer.from(markdown, 'utf8'),
            writeFile: async (uri: { fsPath: string }, bytes: Uint8Array) => { written.push({ uri, bytes }); },
        };
        mock.env = { openExternal: async (uri: unknown) => { opened.push(uri); return true; } };
        mock.ViewColumn = { Beside: -2 };
        mock.window.showErrorMessage = (message: string) => { errors.push(message); return undefined; };
        mock.window.showInformationMessage = async () => undefined;
    });

    afterEach(() => {
        for (const key of Object.keys(saved)) {
            if (key.startsWith('window.')) {
                mock.window[key.slice('window.'.length)] = saved[key];
            }
        }
        mock.workspace.fs = saved['workspace.fs'];
        mock.env = saved.env;
        mock.ViewColumn = saved.ViewColumn;
    });

    describe('PngExporter', () => {
        /** Drive export() at one resolution; return the canvas the page drew on and the file written. */
        async function exportAt(scale: number, svg: string) {
            const option = RESOLUTION_OPTIONS.find(o => o.scale === scale);
            assert.ok(option, `a ${scale}x option is offered`);
            let page: ReturnType<typeof runExportPage> | undefined;
            mock.window.showQuickPick = async () => option;
            mock.window.showSaveDialog = async () => ({ fsPath: `/tmp/diagram-${scale}x.png` });
            mock.window.createWebviewPanel = () => {
                let listener: ((message: unknown) => void) | undefined;
                const panel = {
                    webview: {
                        onDidReceiveMessage: (fn: (message: unknown) => void) => { listener = fn; },
                        set html(value: string) {
                            page = runExportPage(value);
                            listener?.(page.message);
                        },
                    },
                    dispose: () => undefined,
                };
                return panel;
            };
            await new PngExporter().export(svg, themeManager.getCurrentTheme(), 'diagram.png');
            return { page, written };
        }

        it('offers exactly 1x, 2x and 4x', () => {
            assert.deepStrictEqual(RESOLUTION_OPTIONS.map(o => o.scale), [1, 2, 4]);
        });

        for (const scale of [1, 2, 4]) {
            it(`multiplies the canvas by ${scale} for the ${scale}x option`, async () => {
                // 1600 wide is above the 1400 px minimum, so only the chosen scale applies.
                const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900" width="1600" height="900"><rect width="10" height="10"/></svg>';
                const { page, written: files } = await exportAt(scale, svg);
                assert.ok(page?.canvas, 'the export page drew on a canvas');
                assert.strictEqual(page.canvas.width, 1600 * scale);
                assert.strictEqual(page.canvas.height, 900 * scale);
                assert.deepStrictEqual(page.canvas.drawn, [[0, 0, 1600 * scale, 900 * scale]]);
                assert.strictEqual(files.length, 1);
                assert.strictEqual(files[0].uri.fsPath, `/tmp/diagram-${scale}x.png`);
                assert.strictEqual(Buffer.from(files[0].bytes).toString(), `png ${1600 * scale}x${900 * scale}`);
            });
        }

        it('scales a narrow diagram up to the 1400 px minimum before applying the chosen factor', async () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 700 300"></svg>';
            const { page } = await exportAt(2, svg);
            assert.strictEqual(page?.canvas?.width, 2800);
            assert.strictEqual(page?.canvas?.height, 1200);
        });

        it('writes nothing when the resolution picker is dismissed', async () => {
            mock.window.showQuickPick = async () => undefined;
            mock.window.createWebviewPanel = () => { throw new Error('no render expected'); };
            await new PngExporter().export('<svg viewBox="0 0 10 10"></svg>');
            assert.strictEqual(written.length, 0);
        });
    });

    describe('HtmlExporter', () => {
        it('writes one standalone HTML document with the rendered diagram inline', async () => {
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shop.html' });
            await new HtmlExporter().export({ fsPath: '/docs/shop.md' } as any);
            assert.deepStrictEqual(errors, []);
            assert.strictEqual(written.length, 1);
            const html = Buffer.from(written[0].bytes).toString('utf8');
            assert.match(html, /^<!DOCTYPE html>/);
            assert.match(html, /<title>shop\.md<\/title>/);
            assert.match(html, /<svg[\s>]/, 'the diagram is inlined as SVG');
            assert.match(html, /Customer/);
            assert.match(html, /Buys from/);
            assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+rel="stylesheet"/i, 'no external script or stylesheet is referenced');
            assert.doesNotMatch(html, /```c4x/, 'the fence is rendered, not left as source');
        });
    });

    describe('the C4 shape set in every export (#323)', () => {
        const SHAPES_C4X = [
            '%%{ c4: container }%%',
            'graph TB',
            'Person(u, "Customer", $shape="Person")',
            'Container(f, "Static Content", "Directory", $shape="Folder")',
            'Container(w, "UI", "Angular", $shape="WebBrowser")',
            'Container(t, "Backend", "Java", $shape="Terminal")',
            'Container(b, "Statements", "S3", $shape="Bucket")',
            'Container(d, "Database", "MySQL", $shape="Cylinder")',
            'Container(x, "Admin", "React", $shape="Box")',
            'Container(r, "Mailer", "Go", $shape="RoundedBox")',
            'u -->|Uses| w',
            'f -->|Delivers| w',
            'w -->|Calls| t',
            't -->|Writes| b',
            't -->|Reads| d',
            'x -->|Manages| t',
            't -->|Sends| r',
        ].join('\n');
        /** Every drawn shape is in the markup: the five named outlines and the cylinder. */
        function assertShapes(markup: string, where: string): void {
            for (const shape of ['person', 'folder', 'webBrowser', 'terminal', 'bucket']) {
                assert.ok(markup.includes(`data-shape="${shape}"`), `${where}: ${shape}`);
            }
            assert.ok(markup.includes('class="node database"'), `${where}: cylinder`);
            assert.ok(markup.includes('<g class="shape-detail">'), `${where}: browser and terminal detail`);
        }
        function renderShapes(): string {
            const view = new C4ModelBuilder().build(new C4XParser().parse(SHAPES_C4X), 'shapes').views[0];
            return new SvgBuilder().build(new DagreLayoutEngine().layoutSync(view), { theme: C4ModelTheme, view });
        }

        it('SVG: the standalone file keeps every shape', async () => {
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shapes.svg' });
            await new SvgExporter().export(renderShapes(), C4ModelTheme, 'shapes.svg');
            assert.strictEqual(written.length, 1);
            assertShapes(Buffer.from(written[0].bytes).toString('utf8'), 'SVG');
        });

        it('PNG: the canvas is drawn from markup that carries every shape', async () => {
            const option = RESOLUTION_OPTIONS.find(o => o.scale === 2);
            let page: ReturnType<typeof runExportPage> | undefined;
            mock.window.showQuickPick = async () => option;
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shapes.png' });
            mock.window.createWebviewPanel = () => {
                let listener: ((message: unknown) => void) | undefined;
                return {
                    webview: {
                        onDidReceiveMessage: (fn: (message: unknown) => void) => { listener = fn; },
                        set html(value: string) { page = runExportPage(value); listener?.(page.message); },
                    },
                    dispose: () => undefined,
                };
            };
            await new PngExporter().export(renderShapes(), C4ModelTheme, 'shapes.png');
            assert.ok(page?.canvas, 'the export page drew on a canvas');
            assert.strictEqual(page.blobs.length, 1);
            assertShapes(page.blobs[0], 'PNG');
            assert.strictEqual(written.length, 1);
        });

        const SHAPES_MARKDOWN = ['# Shapes', '', '```c4x', SHAPES_C4X, '```', ''].join('\n');

        it('HTML: the standalone document draws every shape', async () => {
            mock.workspace.fs.readFile = async () => Buffer.from(SHAPES_MARKDOWN, 'utf8');
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/shapes.html' });
            await new HtmlExporter().export({ fsPath: '/docs/shapes.md' } as any);
            assert.deepStrictEqual(errors, []);
            assertShapes(Buffer.from(written[0].bytes).toString('utf8'), 'HTML');
        });

        it('PDF: the print document draws every shape', async () => {
            mock.workspace.fs.readFile = async () => Buffer.from(SHAPES_MARKDOWN, 'utf8');
            await new PdfExporter().export({ fsPath: '/docs/shapes.md' } as any);
            assert.deepStrictEqual(errors, []);
            assertShapes(Buffer.from(written[0].bytes).toString('utf8'), 'PDF');
        });
    });

    describe('deployment notation icons in every export (#326)', () => {
        const AWS_C4X = readFileSync(path.join(__dirname, '..', 'snapshots', 'fixtures', 'deployment-aws.c4x'), 'utf8');
        const AWS_MARKDOWN = ['# AWS', '', '```c4x', AWS_C4X, '```', ''].join('\n');
        let previousTheme: unknown;
        beforeEach(() => {
            previousTheme = (themeManager as any).currentTheme;
            (themeManager as any).currentTheme = C4ModelTheme;
        });
        afterEach(() => { (themeManager as any).currentTheme = previousTheme; });

        /** Each drawn icon: its node, placement and transform, in drawing order. */
        function icons(markup: string): string[] {
            return [...markup.matchAll(/data-id="([^"]+)"[^>]*>\s*<rect [^>]*\/>\s*<g class="element-icon" data-icon-placement="([a-z-]+)">\s*<g transform="([^"]+)"/g)]
                .map(m => `${m[1]} ${m[2]} ${m[3]}`);
        }
        function preview(): string {
            const view = new C4ModelBuilder().build(new C4XParser().parse(AWS_C4X), 'aws').views[0];
            return new SvgBuilder().build(new DagreLayoutEngine(() => undefined).layoutSync(view, { theme: C4ModelTheme }), { theme: C4ModelTheme, view });
        }
        const expected = (): string[] => {
            const list = icons(preview());
            // Every icon beside its node's label row: Route 53, the load balancer and the three nested nodes.
            assert.deepStrictEqual(list.map(entry => entry.split(' ').slice(0, 2).join(' ')),
                ['dns label-row', 'lb label-row', 'asg label-row', 'ec2 label-row', 'rds label-row']);
            return list;
        };

        it('SVG: the standalone file draws every icon where the preview does', async () => {
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/aws.svg' });
            await new SvgExporter().export(preview(), C4ModelTheme, 'aws.svg');
            assert.deepStrictEqual(icons(Buffer.from(written[0].bytes).toString('utf8')), expected());
        });

        it('PNG: the canvas is drawn from markup with the same icon placements', async () => {
            const option = RESOLUTION_OPTIONS.find(o => o.scale === 1);
            let page: ReturnType<typeof runExportPage> | undefined;
            mock.window.showQuickPick = async () => option;
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/aws.png' });
            mock.window.createWebviewPanel = () => {
                let listener: ((message: unknown) => void) | undefined;
                return {
                    webview: {
                        onDidReceiveMessage: (fn: (message: unknown) => void) => { listener = fn; },
                        set html(value: string) { page = runExportPage(value); listener?.(page.message); },
                    },
                    dispose: () => undefined,
                };
            };
            await new PngExporter().export(preview(), C4ModelTheme, 'aws.png');
            assert.strictEqual(page?.blobs.length, 1);
            assert.deepStrictEqual(icons(page!.blobs[0]), expected());
        });

        it('HTML: the standalone document draws every icon where the preview does', async () => {
            markdown = AWS_MARKDOWN;
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/aws.html' });
            await new HtmlExporter().export({ fsPath: '/docs/aws.md' } as any);
            assert.deepStrictEqual(errors, []);
            assert.deepStrictEqual(icons(Buffer.from(written[0].bytes).toString('utf8')), expected());
        });

        it('PDF: the print document draws every icon where the preview does', async () => {
            markdown = AWS_MARKDOWN;
            await new PdfExporter().export({ fsPath: '/docs/aws.md' } as any);
            assert.deepStrictEqual(errors, []);
            assert.deepStrictEqual(icons(Buffer.from(written[0].bytes).toString('utf8')), expected());
        });
    });

    describe('long element text in exports (#340)', () => {
        const DESCRIPTION = 'Allows customers to view information about their bank accounts and make payments via the web, the mobile app and the branch';
        const WRAPPING = [
            '# Bank', '', '```c4x', '%%{ c4: system-context }%%', 'graph TB',
            '    Person(customer, "Personal Banking Customer", "A customer of the bank")',
            `    System(bank, "Internet Banking System", "${DESCRIPTION}")`,
            '    customer -->|Uses| bank', '```', '',
        ].join('\n');

        /** The description lines of the bank node in exported markup. */
        function descriptionLines(markup: string): string[] {
            const node = markup.slice(markup.indexOf('data-id="bank"'));
            const text = /<text data-field="description"[^>]*>([\s\S]*?)<\/text>/.exec(node);
            assert.ok(text, 'the description is drawn');
            return [...text![1].matchAll(/<tspan [^>]*>([^<]*)<\/tspan>/g)].map(m => m[1]);
        }

        it('the HTML export carries the wrapped description lines', async () => {
            markdown = WRAPPING;
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/bank.html' });
            await new HtmlExporter().export({ fsPath: '/docs/bank.md' } as any);
            assert.deepStrictEqual(errors, []);
            const lines = descriptionLines(Buffer.from(written[0].bytes).toString('utf8'));
            assert.ok(lines.length >= 3, `${lines.length} lines`);
            assert.strictEqual(lines.join(' '), DESCRIPTION);
        });

        it('the PDF print document carries the wrapped description lines', async () => {
            markdown = WRAPPING;
            await new PdfExporter().export({ fsPath: '/docs/bank.md' } as any);
            const lines = descriptionLines(Buffer.from(written[0].bytes).toString('utf8'));
            assert.strictEqual(lines.join(' '), DESCRIPTION);
        });

        it('the SVG export keeps the wrapped lines and does not override the drawn font size or weight', async () => {
            const theme = themeManager.getExportTheme();
            const view = new C4ModelBuilder().build(new C4XParser().parse(WRAPPING.split('```c4x\n')[1].split('```')[0]), 'bank').views[0];
            const svg = new SvgBuilder().build(new DagreLayoutEngine(() => undefined).layoutSync(view, { theme }), { theme, view });
            mock.window.showSaveDialog = async () => ({ fsPath: '/tmp/bank.svg' });
            await new SvgExporter().export(svg, theme, 'bank.svg');
            const exported = Buffer.from(written[0].bytes).toString('utf8');
            assert.strictEqual(descriptionLines(exported).join(' '), DESCRIPTION);
            // A bare `text { font-size }` rule would beat the renderer's attributes and widen every wrapped line.
            const css = /<style[^>]*>([\s\S]*?)<\/style>/.exec(exported)![1];
            assert.doesNotMatch(css, /(^|[\s}])text\s*\{[^}]*font-(size|weight)/);
            assert.match(css, /text:not\(\[font-size\]\)/);
        });
    });

    describe('PdfExporter', () => {
        it('writes a non-empty print document beside the source, with the diagram and print styles', async () => {
            await new PdfExporter().export({ fsPath: '/docs/shop.md' } as any);
            assert.deepStrictEqual(errors, []);
            assert.strictEqual(written.length, 1);
            assert.strictEqual(written[0].uri.fsPath, '/docs/preview-shop.html');
            const html = Buffer.from(written[0].bytes).toString('utf8');
            assert.ok(html.length > 0);
            assert.match(html, /<svg[\s>]/);
            assert.match(html, /Customer/);
            assert.match(html, /@media print/);
            assert.match(html, /class="print-instructions"/);
        });
    });
});
