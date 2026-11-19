import * as assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { SvgExporter } from '../../../src/export/SvgExporter';
import { defaultExportUri } from '../../../src/export/defaultExportUri';
import { ClassicTheme } from '../../../src/themes/ClassicTheme';
import { ModernTheme } from '../../../src/themes/ModernTheme';

describe('SVG Export', () => {
    let exporter: SvgExporter;

    beforeEach(() => {
        exporter = new SvgExporter();
    });

    describe('makeStandalone', () => {
        it('should add XML declaration', () => {
            const svg = '<svg width="100" height="100"></svg>';
            // Access private method via any cast for testing
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
        });

        it('should add xmlns attribute if missing', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('xmlns="http://www.w3.org/2000/svg"'));
        });

        it('should not duplicate XML declaration', () => {
            const svg = '<?xml version="1.0" encoding="UTF-8"?>\n<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const xmlCount = (standalone.match(/<\?xml/g) || []).length;
            assert.strictEqual(xmlCount, 1);
        });

        it('should embed font styling', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<defs>'));
            assert.ok(standalone.includes('<style type="text/css">'));
            assert.ok(standalone.includes('font-family:'));
        });

        it('should use theme font family', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes(ClassicTheme.styles.fontFamily));
        });

        it('should use theme font size', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes(`font-size: ${ClassicTheme.styles.fontSize}px`));
        });

        it('should include crisp rendering styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('shape-rendering: geometricPrecision'));
            assert.ok(standalone.includes('text-rendering: optimizeLegibility'));
        });

        it('should work with Modern theme', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ModernTheme);

            assert.ok(standalone.includes(ModernTheme.styles.fontFamily));
            assert.ok(standalone.includes(`font-size: ${ModernTheme.styles.fontSize}px`));
        });

        it('should preserve existing xmlns attribute', () => {
            const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const xmlnsCount = (standalone.match(/xmlns=/g) || []).length;
            assert.strictEqual(xmlnsCount, 1);
        });

        it('should handle SVG with existing content', () => {
            const svg = `<svg width="100" height="100">
                <rect x="10" y="10" width="80" height="80" fill="blue"/>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<rect'));
            assert.ok(standalone.includes('fill="blue"'));
        });

        it('should insert style block after opening svg tag', () => {
            const svg = '<svg width="100" height="100"><g></g></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            const svgTagEnd = standalone.indexOf('>');
            const defsStart = standalone.indexOf('<defs>');

            assert.ok(defsStart > svgTagEnd);
            assert.ok(defsStart < standalone.indexOf('<g>'));
        });
    });

    describe('default save location (shared helper, #435)', () => {
        const source = vscode.Uri.file(path.join(os.tmpdir(), 'c4x-suite', 'arch', 'shop.c4x'));

        it('suggests the folder and base name of the source file', () => {
            const uri = defaultExportUri('svg', { source });
            assert.strictEqual(uri?.fsPath, path.join(os.tmpdir(), 'c4x-suite', 'arch', 'shop.svg'));
        });

        it('uses only the basename of a suggested name, in the source folder', () => {
            const uri = defaultExportUri('svg', { source, suggestedName: path.join('/elsewhere', 'deep', 'other.svg') });
            assert.strictEqual(uri?.fsPath, path.join(os.tmpdir(), 'c4x-suite', 'arch', 'other.svg'));
        });

        it('falls back to the first workspace folder, or to no suggestion without one', async () => {
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            const uri = defaultExportUri('svg');
            const folder = vscode.workspace.workspaceFolders?.[0];
            if (folder) {
                assert.strictEqual(uri?.fsPath, vscode.Uri.joinPath(folder.uri, 'diagram.svg').fsPath);
            } else {
                assert.strictEqual(uri, undefined);
            }
        });

        /** Run export() with a stubbed save dialog and a spy on workspace.fs.writeFile. */
        async function exportWith(dialogResult: vscode.Uri | undefined) {
            const windowApi = vscode.window as any;
            const workspaceApi = vscode.workspace as any;
            const originalFs = vscode.workspace.fs;
            const originalDialog = windowApi.showSaveDialog;
                        const dialogs: Array<vscode.Uri | undefined> = [];
            const writes: Array<{ uri: vscode.Uri; bytes: Uint8Array }> = [];
            windowApi.showSaveDialog = async (options: vscode.SaveDialogOptions) => {
                dialogs.push(options.defaultUri);
                return dialogResult;
            };
            const spyFs = {
                ...originalFs,
                writeFile: async (uri: vscode.Uri, bytes: Uint8Array) => { writes.push({ uri, bytes }); },
            };
            Object.defineProperty(workspaceApi, 'fs', { value: spyFs, configurable: true });
            try {
                await exporter.export('<svg width="1" height="1"></svg>', ClassicTheme, 'shop.svg');
            } finally {
                windowApi.showSaveDialog = originalDialog;
                Object.defineProperty(workspaceApi, 'fs', { value: originalFs, configurable: true });
            }
            return { dialogs, writes };
        }

        it('opens the save dialog once with the helper suggestion, and writes nothing when cancelled', async () => {
            const { dialogs, writes } = await exportWith(undefined);
            assert.strictEqual(dialogs.length, 1, 'the save dialog was opened exactly once');
            assert.strictEqual(dialogs[0]?.fsPath, defaultExportUri('svg', { suggestedName: 'shop.svg' })?.fsPath);
            assert.strictEqual(writes.length, 0, 'a cancelled dialog writes nothing');
        });

        it('writes exactly one non-empty SVG to the chosen URI', async () => {
            const target = vscode.Uri.file(path.join(os.tmpdir(), 'c4x-suite', 'chosen.svg'));
            const { dialogs, writes } = await exportWith(target);
            assert.strictEqual(dialogs.length, 1);
            assert.strictEqual(writes.length, 1, 'exactly one write');
            assert.strictEqual(writes[0].uri.fsPath, target.fsPath);
            const text = Buffer.from(writes[0].bytes).toString('utf8');
            assert.ok(text.length > 0 && text.includes('<svg'), 'the written file holds the SVG');
        });
    });

    describe('SVG Structure Validation', () => {
        it('should create valid SVG XML structure', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should be valid XML
            assert.ok(standalone.startsWith('<?xml'));
            assert.ok(standalone.includes('<svg'));
            assert.ok(standalone.includes('</svg>'));
        });

        it('should have proper CDATA for CSS', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<![CDATA['));
            assert.ok(standalone.includes(']]>'));
        });

        it('should have complete defs block', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<defs>'));
            assert.ok(standalone.includes('</defs>'));
        });

        it('should have complete style block', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<style type="text/css">'));
            assert.ok(standalone.includes('</style>'));
        });
    });

    describe('Theme Integration', () => {
        it('should apply Classic theme styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('Segoe UI') || standalone.includes('sans-serif'));
            assert.ok(standalone.includes('14px') || standalone.includes('font-size'));
        });

        it('should apply Modern theme styles', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ModernTheme);

            assert.ok(standalone.includes(ModernTheme.styles.fontFamily));
        });

        it('should not include external HTTP dependencies', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Remove XML namespace from check as it's required and safe
            const contentToCheck = standalone.replace('http://www.w3.org/2000/svg', '');

            assert.ok(!contentToCheck.includes('http://'));
            assert.ok(!contentToCheck.includes('https://'));
            assert.ok(!contentToCheck.includes('fonts.googleapis.com'));
        });

        it('should use system fonts only', () => {
            const svg = '<svg width="100" height="100"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            // Should contain common system fonts
            const hasSystemFonts =
                standalone.includes('Segoe UI') ||
                standalone.includes('Helvetica') ||
                standalone.includes('Arial') ||
                standalone.includes('sans-serif');

            assert.ok(hasSystemFonts);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty SVG', () => {
            const svg = '<svg></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<?xml'));
            assert.ok(standalone.includes('<svg'));
        });

        it('should handle SVG with attributes', () => {
            const svg = '<svg width="200" height="300" viewBox="0 0 200 300"></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('width="200"'));
            assert.ok(standalone.includes('height="300"'));
            assert.ok(standalone.includes('viewBox="0 0 200 300"'));
        });

        it('should handle SVG with complex nested structure', () => {
            const svg = `<svg width="100" height="100">
                <g class="nodes">
                    <rect x="10" y="10" width="30" height="30"/>
                    <text x="25" y="25">Test</text>
                </g>
                <g class="edges">
                    <path d="M0,0 L100,100"/>
                </g>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('<g class="nodes">'));
            assert.ok(standalone.includes('<g class="edges">'));
            assert.ok(standalone.includes('<rect'));
            assert.ok(standalone.includes('<text'));
            assert.ok(standalone.includes('<path'));
        });

        it('should handle SVG with special characters in content', () => {
            const svg = '<svg><text>Test &amp; &lt;Special&gt; "Chars"</text></svg>';
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('&amp;'));
            assert.ok(standalone.includes('&lt;'));
            assert.ok(standalone.includes('&gt;'));
        });

        it('should preserve whitespace in SVG content', () => {
            const svg = `<svg>
                <text>Preserve  Spaces</text>
            </svg>`;
            const standalone = (exporter as any).makeStandalone(svg, ClassicTheme);

            assert.ok(standalone.includes('Preserve  Spaces'));
        });
    });
});
