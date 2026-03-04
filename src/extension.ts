import * as vscode from 'vscode';
import { c4xPlugin } from './markdown/c4xPlugin';
import { DiagnosticsManager } from './diagnostics/DiagnosticsManager';
import { HtmlExporter } from './export/HtmlExporter';
import { PdfExporter } from './export/PdfExporter';
import { GenerateDiagramCommand } from './commands/GenerateDiagramCommand';
import { VisualDiagramCommand } from './commands/VisualDiagramCommand';
import { C4XCompletionItemProvider } from './completion/C4XCompletionItemProvider';

/**
 * Activate the C4X extension
 * @returns Object with extendMarkdownIt for VS Code's markdown preview integration
 */
export function activate(context: vscode.ExtensionContext) {

  // Initialize Diagnostics
  new DiagnosticsManager(context);

  // Initialize Exporters
  const htmlExporter = new HtmlExporter();
  const pdfExporter = new PdfExporter();
  const generateDiagramCommand = new GenerateDiagramCommand(context);
  const visualDiagramCommand = new VisualDiagramCommand(context);

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('c4x.exportHtml', async (uri?: vscode.Uri) => {
      await htmlExporter.export(uri);
    }),
    vscode.commands.registerCommand('c4x.exportPdf', async (uri?: vscode.Uri) => {
      await pdfExporter.export(uri);
    }),
    vscode.commands.registerCommand('c4x.exportPng', async () => {
      vscode.window.showInformationMessage('C4X: Export PNG (coming soon)');
    }),
    vscode.commands.registerCommand('c4x.exportSvg', async () => {
      vscode.window.showInformationMessage('C4X: Export SVG (coming soon)');
    }),
    vscode.commands.registerCommand('c4x.copySvg', async () => {
      vscode.window.showInformationMessage('C4X: Copy SVG (coming soon)');
    }),
    vscode.commands.registerCommand('c4x.changeTheme', async () => {
      vscode.window.showQuickPick(['classic', 'modern', 'muted', 'high-contrast', 'auto'], {
        placeHolder: 'Select C4X theme'
      });
    }),
    vscode.commands.registerCommand('c4x.ai.generateFromMarkdown', async () => {
      if (vscode.window.activeTextEditor) {
        await generateDiagramCommand.generateFromMarkdown(vscode.window.activeTextEditor);
      }
    }),
    vscode.commands.registerCommand('c4x.ai.generateFromSelection', async () => {
      if (vscode.window.activeTextEditor) {
        await generateDiagramCommand.generateFromSelection(vscode.window.activeTextEditor);
      }
    }),
    vscode.commands.registerCommand('c4x.ai.generateVisualDiagram', async () => {
      if (vscode.window.activeTextEditor) {
        await visualDiagramCommand.generateVisualDiagram(vscode.window.activeTextEditor);
      }
    })
  );

  // Register Completion Item Provider for icons
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      ['markdown', 'c4x'], // Supported languages
      new C4XCompletionItemProvider(),
      '"', // Trigger character
      "'", // Trigger character
      '.'  // Trigger character for namespaces
    )
  );

  // Return extendMarkdownIt for VS Code's markdown preview integration
  // This is REQUIRED for markdown.markdownItPlugins contribution point to work
  // See: https://code.visualstudio.com/api/extension-guides/markdown-extension
  return {
    extendMarkdownIt(md: import('markdown-it')) {
      try {
        return c4xPlugin(md);
      } catch (error) {
        console.error('[C4X] Failed to extend Markdown-It:', error);
        // Return unmodified instance to prevent breaking markdown preview
        return md;
      }
    }
  };
}

export function deactivate() {
  // Resources disposed via subscriptions
}
