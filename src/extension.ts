import * as vscode from 'vscode';
import { c4xPlugin } from './markdown/c4xPlugin';
import { DiagnosticsManager } from './diagnostics/DiagnosticsManager';
import { HtmlExporter } from './export/HtmlExporter';
import { PdfExporter } from './export/PdfExporter';
import { GenerateDiagramCommand } from './commands/GenerateDiagramCommand';
import { promptForApiKey } from './ai/AuthService';
import { VisualDiagramCommand } from './commands/VisualDiagramCommand';
import { C4XCompletionItemProvider } from './completion/C4XCompletionItemProvider';
import { exportPngCommand } from './commands/exportPng';
import { exportSvgCommand } from './commands/exportSvg';
import { copySvgCommand } from './commands/copySvg';
import { changeThemeCommand } from './commands/changeTheme';
import { PreviewPanel } from './webview/PreviewPanel';
import { executeResetLayoutTransaction } from './writeback/WritebackTransaction';
import { C4XCodeLensProvider } from './markdown/C4XCodeLensProvider';
import { registerEditMarkdownBlockCommand } from './commands/EditMarkdownBlockCommand';

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

  /**
   * Rebuild every cached Gemini client from the key stored right now.
   * Failures are swallowed deliberately: a missing key is the expected state
   * after a clear, and must not surface as an error.
   */
  const refreshAllCredentials = async (): Promise<void> => {
    await Promise.all([
      generateDiagramCommand.refreshCredentials().catch(() => undefined),
      visualDiagramCommand.refreshCredentials().catch(() => undefined),
    ]);
  };

  // Register commands
  context.subscriptions.push(
    // Setting a key had no entry point of its own: the only way in was to run
    // an AI command, let it fail, and click "Enter Key". A user whose key had
    // expired therefore had to provoke an error to replace it, and the
    // c4x.ai.apiKey setting is deprecated so VS Code greys it out of the
    // settings UI. These two commands give the key a front door.
    vscode.commands.registerCommand('c4x.setApiKey', async () => {
      const key = await promptForApiKey(context);
      if (!key) {
        return false;
      }
      // Both command objects hold their own Gemini client, each caching a
      // model built from the key that was current when it initialised. Storing
      // a new key is not enough: without this, generation keeps using the old
      // key until the window reloads.
      await refreshAllCredentials();
      vscode.window.showInformationMessage('C4X: Gemini API key saved to encrypted storage and now in use.');
      return true;
    }),
    vscode.commands.registerCommand('c4x.clearApiKey', async () => {
      await context.secrets.delete('c4x.ai.apiKey');
      await refreshAllCredentials();
      vscode.window.showInformationMessage('C4X: Gemini API key removed. You will be prompted next time you use an AI command.');
      return true;
    }),
    vscode.commands.registerCommand('c4x.openPreview', () => {
      PreviewPanel.createOrShow(context);
      return true;
    }),
    vscode.commands.registerCommand('c4x.refreshPreview', () => {
      return PreviewPanel.refresh();
    }),
    vscode.commands.registerCommand('c4x.exportHtml', async (uri?: vscode.Uri) => {
      await htmlExporter.export(uri);
    }),
    vscode.commands.registerCommand('c4x.exportPdf', async (uri?: vscode.Uri) => {
      await pdfExporter.export(uri);
    }),
    vscode.commands.registerCommand('c4x.exportPng', exportPngCommand),
    vscode.commands.registerCommand('c4x.exportSvg', exportSvgCommand),
    vscode.commands.registerCommand('c4x.copySvg', copySvgCommand),
    vscode.commands.registerCommand('c4x.changeTheme', changeThemeCommand),
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
    }),
    vscode.commands.registerCommand('c4x.resetLayout', async () => {
      const activeEditor = vscode.window.activeTextEditor;
      if (activeEditor) {
        try {
          const success = await executeResetLayoutTransaction(activeEditor.document);
          if (success) {
            vscode.window.showInformationMessage('C4X: Layout coordinates reset successfully.');
            await PreviewPanel.refresh();
          }
        } catch (error) {
          vscode.window.showErrorMessage(`C4X: Failed to reset layout coordinates: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    })
  );

  // Register the webview panel serializer so VS Code can restore the panel
  // after an extension-host reload. The draft survives via webview setState/getState.
  context.subscriptions.push(
    vscode.window.registerWebviewPanelSerializer('c4xPreview', PreviewPanel.createSerializer(context))
  );

  // Register command for editing a specific Markdown fenced c4x block.
  context.subscriptions.push(registerEditMarkdownBlockCommand(context));

  // Register CodeLens provider: shows "Edit C4 diagram" above each fence in .md files.
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { language: 'markdown' },
      new C4XCodeLensProvider()
    )
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
  PreviewPanel.dispose();
}
