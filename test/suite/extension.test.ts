import * as assert from 'assert';
import * as vscode from 'vscode';

describe('Extension Activation Tests', () => {
  vscode.window.showInformationMessage('Running C4X extension tests...');

  it('Extension should be present', () => {
    const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
    assert.ok(extension, 'Extension not found');
  });

  it('Extension should activate', async function () {
    this.timeout(10000); // Allow 10 seconds for activation

    const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
    assert.ok(extension, 'Extension not found');

    await extension.activate();
    assert.strictEqual(extension.isActive, true, 'Extension failed to activate');

    console.log('Extension activated successfully');
  });

  it('c4x.openPreview command should be registered', async () => {
    const commands = await vscode.commands.getCommands(true);
    const hasCommand = commands.includes('c4x.openPreview');

    assert.ok(hasCommand, 'c4x.openPreview command not registered');
    console.log('c4x.openPreview command registered');
  });

  it('c4x.openPreview command should execute without errors', async () => {
    // Execute command
    await vscode.commands.executeCommand('c4x.openPreview');

    // If no error thrown, test passes
    assert.ok(true, 'Command executed successfully');
    console.log('c4x.openPreview executed successfully');
  });

  it('activate() should return extendMarkdownIt for VS Code markdown integration', async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
    assert.ok(extension, 'Extension not found');

    // Activate and get the exported API
    const api = await extension.activate();

    // Verify extendMarkdownIt is returned
    // This is REQUIRED for markdown.markdownItPlugins contribution point
    assert.ok(api, 'activate() should return an object');
    assert.ok(typeof api.extendMarkdownIt === 'function',
      'activate() must return { extendMarkdownIt: function } for markdown preview integration');

    console.log('extendMarkdownIt function exported correctly');
  });

  it('extendMarkdownIt should work with MarkdownIt instance', async function () {
    this.timeout(10000);

    const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
    assert.ok(extension, 'Extension not found');

    const api = await extension.activate();
    assert.ok(api?.extendMarkdownIt, 'extendMarkdownIt not found');

    // Create a mock MarkdownIt-like object to test the function
    const mockMd = {
      renderer: {
        rules: {
          fence: null as any
        }
      },
      use: function(plugin: any) {
        plugin(this);
        return this;
      }
    };

    // Call extendMarkdownIt - should not throw
    const result = api.extendMarkdownIt(mockMd);

    // Should return the md instance (or modified version)
    assert.ok(result, 'extendMarkdownIt should return the markdown-it instance');

    console.log('extendMarkdownIt integrates correctly');
  });
});
