import * as vscode from 'vscode';
import { C4XPreviewPanel } from './webview/panel';
import { c4xPlugin } from './markdown/c4xPlugin';
import { DiagnosticsManager } from './diagnostics/DiagnosticsManager';

let previewPanel: C4XPreviewPanel | undefined;

/**
 * Activate the C4X extension
 * @returns Object with extendMarkdownIt for VS Code's markdown preview integration
 */
export function activate(context: vscode.ExtensionContext) {
  const getPanel = () => {
    if (!previewPanel) {previewPanel = new C4XPreviewPanel();}
    return previewPanel;
  };

  // Initialize Diagnostics
  new DiagnosticsManager(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('c4x.openPreview', async () => {
      const activeDoc = vscode.window.activeTextEditor?.document;
      getPanel().open(activeDoc);
    })
  );

  // Stubs for future milestones
  context.subscriptions.push(
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
    })
  );

  // Optional: auto-open preview when supported language opens (activation events already configured)
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => {
      if (['c4x', 'structurizr-dsl', 'plantuml'].includes(doc.languageId)) {
        // Debounced/guarded in future milestones
      }
    })
  );

  // Return extendMarkdownIt for VS Code's markdown preview integration
  // This is REQUIRED for markdown.markdownItPlugins contribution point to work
  // See: https://code.visualstudio.com/api/extension-guides/markdown-extension
  return {
    extendMarkdownIt(md: import('markdown-it')) {
      return c4xPlugin(md);
    }
  };
}

export function deactivate() {
  // Resources disposed via subscriptions
}
