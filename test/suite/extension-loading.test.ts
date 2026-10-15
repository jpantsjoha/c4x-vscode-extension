import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Automated VS Code Extension Loading Tests
 *
 * These tests validate that the C4X extension loads correctly and all
 * critical functionality is available. Run with `pnpm test` to execute.
 *
 * @see https://code.visualstudio.com/api/working-with-extensions/testing-extension
 */
describe('Automated Extension Loading Tests', () => {

  const EXTENSION_ID = 'jpantsjoha.c4x';

  // The activation budget below is judged on the measurement test/suite/index.ts
  // takes before any suite runs. Measuring inside a test always found the extension
  // already active — the first suite mocha loads activates it — which is how the
  // budget test passed for years without measuring anything (#201).
  const activation = (globalThis as Record<string, unknown>).__c4xActivation as
    | { missing: boolean; wasActive: boolean; ms: number }
    | undefined;

  describe('Extension Presence', () => {
    it('should find the extension in VS Code', () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, `Extension ${EXTENSION_ID} not found in VS Code`);
      console.log(`✅ Extension found: ${extension.id}`);
    });

    it('should have correct extension metadata', () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, 'Extension not found');

      const pkg = extension.packageJSON;
      assert.strictEqual(pkg.name, 'c4x', 'Extension name mismatch');
      assert.ok(pkg.version, 'Extension version missing');
      assert.ok(pkg.publisher, 'Extension publisher missing');

      console.log(`✅ Extension metadata valid: ${pkg.name}@${pkg.version}`);
    });
  });

  describe('Extension Activation', () => {
    it('is active after the runner\'s cold activation, which the runner recorded', async function() {
      this.timeout(5000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, 'Extension not found');

      // The runner activated the extension before any suite ran and recorded the
      // cost; timing activate() here again would measure an already-active
      // extension (~0 ms) and prove nothing. The 200 ms budget below judges the
      // runner's number; this test judges the state.
      await extension.activate();
      assert.strictEqual(extension.isActive, true, 'Extension failed to activate');
      assert.ok(activation && !activation.missing, 'the runner recorded no activation for this extension');
    });

    it('should return extendMarkdownIt API for markdown integration', async function() {
      this.timeout(5000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, 'Extension not found');

      const api = await extension.activate();

      assert.ok(api, 'activate() should return an API object');
      assert.ok(typeof api.extendMarkdownIt === 'function',
        'API must export extendMarkdownIt function for markdown preview integration');

      console.log('✅ extendMarkdownIt API available');
    });
  });

  describe('Command Registration', () => {
    const expectedCommands = [
      'c4x.openPreview',
      'c4x.refreshPreview',
      'c4x.exportPng',
      'c4x.exportSvg',
      'c4x.copySvg',
      'c4x.changeTheme',
      'c4x.exportConformance',
      'c4x.conformFromDependencyCruiser'
    ];

    it('should register all expected commands', async function() {
      this.timeout(5000);

      // Ensure extension is activated
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, 'Extension not found');
      await extension.activate();

      const allCommands = await vscode.commands.getCommands(true);

      for (const cmd of expectedCommands) {
        assert.ok(
          allCommands.includes(cmd),
          `Command ${cmd} not registered`
        );
      }

      console.log(`✅ All ${expectedCommands.length} commands registered`);
    });

    it('should open and refresh the standalone preview', async function() {
      this.timeout(10000);

      const document = await vscode.workspace.openTextDocument({
        language: 'c4x',
        content: [
          '%%{ c4: system-context }%%',
          'graph TB',
          'User[User<br/>Person]',
          'System[System<br/>Software System]',
          'User -->|Uses| System',
        ].join('\n'),
      });
      await vscode.window.showTextDocument(document, { preview: false });

      const opened = await vscode.commands.executeCommand<boolean>('c4x.openPreview');
      assert.strictEqual(opened, true, 'Open Preview handler did not run');

      const refreshed = await vscode.commands.executeCommand<boolean>('c4x.refreshPreview');
      assert.strictEqual(refreshed, true, 'Refresh Preview did not find the open panel');

      await new Promise((resolve) => setTimeout(resolve, 300));
      await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
    });
  });

  describe('Language Support', () => {
    it('should register c4x language', async () => {
      const languages = await vscode.languages.getLanguages();
      assert.ok(languages.includes('c4x'), 'c4x language not registered');
      console.log('✅ c4x language registered');
    });

    // Tests disabled for v1.0 (Features deferred to v1.2)
    /*
    it('should register plantuml language', async () => {
      const languages = await vscode.languages.getLanguages();
      assert.ok(languages.includes('plantuml'), 'plantuml language not registered');
      console.log('✅ plantuml language registered');
    });

    it('should register structurizr-dsl language', async () => {
      const languages = await vscode.languages.getLanguages();
      assert.ok(languages.includes('structurizr-dsl'), 'structurizr-dsl language not registered');
      console.log('✅ structurizr-dsl language registered');
    });
    */
  });

  describe('Configuration', () => {
    it('should have c4x.theme configuration', () => {
      const config = vscode.workspace.getConfiguration('c4x');
      const theme = config.get<string>('theme');

      assert.ok(theme !== undefined, 'c4x.theme configuration not found');

      const validThemes = ['classic', 'modern', 'muted', 'high-contrast', 'auto'];
      assert.ok(
        validThemes.includes(theme),
        `Invalid theme value: ${theme}. Expected one of: ${validThemes.join(', ')}`
      );

      console.log(`✅ c4x.theme configured: ${theme}`);
    });
  });

  describe('Performance', () => {
    it('should activate within performance target (< 200ms)', function() {
      // Until #201 this test returned green whenever the extension was already active —
      // which it always was, because the activation test above runs first. It now
      // judges the measurement test/suite/index.ts takes before any suite runs, and
      // fails when there was none.
      assert.ok(activation, 'test/suite/index.ts took no activation measurement in this run');
      assert.strictEqual(activation.missing, false, 'the runner did not find jpantsjoha.c4x, so nothing was measured');
      assert.strictEqual(
        activation.wasActive,
        false,
        'the host had activated the extension before the runner was entered, so no activation was measured and the 200ms budget is unproven'
      );
      assert.ok(
        activation.ms < 200,
        `Activation time ${activation.ms}ms exceeds 200ms target`
      );

      console.log(`✅ Activation time: ${activation.ms}ms (target: <200ms)`);
    });
  });
});
