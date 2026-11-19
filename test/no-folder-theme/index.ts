import * as assert from 'assert';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * Change Theme with no folder open, against the real settings API (#479, R181-02).
 * Runs in its own host launch (see test/runTest.ts) with no folder or workspace, so
 * VS Code rejects a Workspace-scope write. Runs "C4X: Change Theme", then reads the
 * user setting back from the user settings file and through inspect(). It fails when
 * persistTheme writes at workspace scope. On success it writes the token-bound receipt.
 */
export async function run(): Promise<void> {
  const userPath = process.env.C4X_NOFOLDER_USER_SETTINGS as string;
  assert.ok(userPath, 'launched by test/runTest.ts');
  assert.strictEqual(vscode.workspace.workspaceFolders, undefined, 'no folder is open');
  assert.strictEqual(vscode.workspace.workspaceFile, undefined, 'no workspace file is open');

  delete process.env.C4X_FORCE_THEME; // a real user has none
  const extension = vscode.extensions.getExtension('jpantsjoha.c4x');
  assert.ok(extension, 'extension under development is present');
  await extension.activate();

  const chosen = 'muted';
  const original = vscode.window.showQuickPick;
  const messages: string[] = [];
  const originalError = vscode.window.showErrorMessage;
  (vscode.window as unknown as Record<string, unknown>).showQuickPick = async (items: Array<{ themeName: string }>) =>
    items.find(item => item.themeName === chosen);
  (vscode.window as unknown as Record<string, unknown>).showErrorMessage = async (message: string) => { messages.push(message); return undefined; };
  try {
    await vscode.commands.executeCommand('c4x.changeTheme');
  } finally {
    (vscode.window as unknown as Record<string, unknown>).showQuickPick = original;
    (vscode.window as unknown as Record<string, unknown>).showErrorMessage = originalError;
  }
  await new Promise(resolve => setTimeout(resolve, 1000));

  assert.deepStrictEqual(messages, [], `Change Theme reported an error: ${messages.join('; ')}`);
  const info = vscode.workspace.getConfiguration('c4x').inspect<string>('theme');
  assert.strictEqual(info?.globalValue, chosen, 'the user-scope setting holds the chosen theme');
  assert.strictEqual(info?.workspaceValue, undefined, 'nothing was written at workspace scope');
  assert.ok(fs.existsSync(userPath), 'the user settings file exists');
  const saved = fs.readFileSync(userPath, 'utf8');
  assert.ok(new RegExp(`"c4x\\.theme"\\s*:\\s*"${chosen}"`).test(saved), `user settings.json holds c4x.theme=${chosen}: ${saved}`);

  fs.writeFileSync(process.env.C4X_NOFOLDER_RECEIPT as string,
    JSON.stringify({ token: process.env.C4X_NOFOLDER_RECEIPT_TOKEN, passed: true }));
}
