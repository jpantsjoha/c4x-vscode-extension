import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Upgrade activation proof (#366). Runs in its own short host launch (see
 * test/runTest.ts) on a temporary workspace and a user profile seeded before
 * the extension first activates. Throws on failure; on success it writes the token-bound receipt.
 *
 * Asserts the EFFECTIVE configuration holds the seeded unknown theme before
 * activation, that activation leaves both settings files byte for byte
 * unchanged, and that the effective value is still the seeded one after.
 */
export async function run(): Promise<void> {
  const userPath = process.env.C4X_UPGRADE_USER_SETTINGS as string;
  const workspacePath = process.env.C4X_UPGRADE_WORKSPACE_SETTINGS as string;
  const fixtures = process.env.C4X_UPGRADE_FIXTURES as string;
  assert.ok(userPath && workspacePath && fixtures, 'launched by test/runTest.ts');
  const seeded = JSON.parse(fs.readFileSync(path.join(fixtures, 'user-settings.json'), 'utf8'))['c4x.theme'];

  const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
  assert.ok(extension, 'extension under development is present');
  assert.strictEqual(extension.isActive, false, 'not yet active: this is the cold path');

  const effective = (): { value: unknown; global: unknown; workspace: unknown } => {
    const info = vscode.workspace.getConfiguration('c4x').inspect('theme');
    return { value: vscode.workspace.getConfiguration('c4x').get('theme'), global: info?.globalValue, workspace: info?.workspaceValue };
  };
  const before = effective();
  assert.strictEqual(before.value, seeded, 'the effective theme before activation is the seeded unknown value');
  assert.strictEqual(before.global, seeded);
  assert.strictEqual(before.workspace, undefined, 'the temporary workspace does not override it');

  const userBefore = fs.readFileSync(userPath, 'utf8');
  const workspaceBefore = fs.readFileSync(workspacePath, 'utf8');
  assert.strictEqual(userBefore, fs.readFileSync(path.join(fixtures, 'user-settings.json'), 'utf8'));

  delete process.env.C4X_FORCE_THEME; // a real upgrade has none
  await extension.activate();
  // A write started during activation lands shortly after it returns.
  await new Promise(resolve => setTimeout(resolve, 1500));

  assert.strictEqual(fs.readFileSync(userPath, 'utf8'), userBefore, 'activation wrote to the user settings');
  assert.strictEqual(fs.readFileSync(workspacePath, 'utf8'), workspaceBefore, 'activation wrote to the workspace settings');
  assert.strictEqual(effective().value, seeded, 'the effective theme is still the seeded value');

  // Written only when every assertion above has passed; test/runTest.ts requires it.
  fs.writeFileSync(process.env.C4X_UPGRADE_RECEIPT as string,
    JSON.stringify({ token: process.env.C4X_UPGRADE_RECEIPT_TOKEN, passed: true }));
}
