import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';

const EXTENSION_ID = 'jpantsjoha.c4x';

function normalizedPath(value: string): string {
  const resolved = path.resolve(value);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `Installed extension ${EXTENSION_ID} was not discovered`);

  const expectedVersion = process.env.C4X_EXPECTED_VERSION;
  assert.strictEqual(extension.packageJSON.version, expectedVersion, 'Installed VSIX version mismatch');

  const expectedRoot = process.env.C4X_EXPECTED_EXTENSION_ROOT;
  assert.ok(expectedRoot, 'C4X_EXPECTED_EXTENSION_ROOT was not supplied');
  const relativeExtensionPath = path.relative(
    normalizedPath(expectedRoot),
    normalizedPath(extension.extensionPath),
  );
  assert.ok(
    relativeExtensionPath !== '..' && !relativeExtensionPath.startsWith(`..${path.sep}`),
    `Extension loaded outside the clean VSIX profile: ${extension.extensionPath}`,
  );

  await extension.activate();
  assert.strictEqual(extension.isActive, true, 'Installed extension did not activate');

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes('c4x.openPreview'), 'c4x.openPreview is not registered');
  assert.ok(commands.includes('c4x.refreshPreview'), 'c4x.refreshPreview is not registered');

  const document = await vscode.workspace.openTextDocument({
    language: 'c4x',
    content: [
      '%%{ c4: system-context }%%',
      'graph TB',
      'Person(user, "User", "Clean VSIX smoke")',
      'System(app, "Application", "Packaged extension")',
      'user -->|Uses| app',
    ].join('\n'),
  });
  await vscode.window.showTextDocument(document, { preview: false });

  const opened = await vscode.commands.executeCommand<boolean>('c4x.openPreview');
  assert.strictEqual(opened, true, 'Packaged extension did not open the C4X preview');
  const refreshed = await vscode.commands.executeCommand<boolean>('c4x.refreshPreview');
  assert.strictEqual(refreshed, true, 'Packaged extension did not refresh the C4X preview');

  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
}
